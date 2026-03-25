#!/usr/bin/env python3
"""
Audio Analyzer for Unity Content System
Extracts musical features from audio files for video prompt synchronization.

Uses advanced librosa features:
- Harmonic-Percussive Source Separation (HPSS) for rhythm vs melody analysis
- Spectral features (centroid, bandwidth, rolloff, contrast) for mood detection  
- Chroma features for harmonic structure and key detection
- Onset detection for precise beat sync points
- Tempogram for detailed rhythm analysis
- Section segmentation using recurrence matrix
- Demucs vocal isolation for accurate subtitle sync
"""

import sys
import json
import os
import tempfile
import numpy as np
import librosa
import soundfile as sf
import warnings

warnings.filterwarnings('ignore')

# Demucs vocal isolation - ENABLED (GCP has sufficient RAM: 29GB)
# Uses PyTorch + Demucs htdemucs model for high-quality vocal separation
DEMUCS_AVAILABLE = False
try:
    import torch
    import torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    DEMUCS_AVAILABLE = True
    print("   Demucs vocal isolation: ENABLED (PyTorch + htdemucs model)", file=sys.stderr)
except ImportError as e:
    print(f"   Demucs vocal isolation: DISABLED ({e})", file=sys.stderr)

# Forced alignment for precise word timing (industry standard)
FORCEALIGN_AVAILABLE = False
try:
    from forcealign import ForceAlign
    # Ensure NLTK data is downloaded (required for g2p_en phonemizer)
    import nltk
    nltk.download('averaged_perceptron_tagger_eng', quiet=True)
    nltk.download('punkt', quiet=True)
    nltk.download('punkt_tab', quiet=True)
    FORCEALIGN_AVAILABLE = True
    print("   Forced alignment: ENABLED", file=sys.stderr)
except ImportError as e:
    print(f"   Forced alignment: DISABLED ({e})", file=sys.stderr)


def to_native(obj):
    """Convert numpy types to native Python types for JSON serialization."""
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, dict):
        return {k: to_native(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [to_native(item) for item in obj]
    return obj


class AudioCache:
    """
    Lazy-computed audio feature cache. Computes each expensive librosa feature
    exactly once, then reuses the result. Used by both analyze_audio() and
    extract_fingerprint() to eliminate redundant computation.
    """
    def __init__(self, audio_path: str, sr: int = 22050):
        print(f"   Loading audio at {sr}Hz...", file=sys.stderr)
        self.y, self.sr = librosa.load(audio_path, sr=sr)
        self.duration = librosa.get_duration(y=self.y, sr=self.sr)
        self.hop_length = 512
        self.audio_path = audio_path

        # Lazily computed features
        self._hpss = None
        self._rms = None
        self._rms_percussive = None
        self._chroma_cqt = None
        self._chroma_cqt_raw = None  # on raw y (not harmonic)
        self._tempo = None
        self._beat_frames = None
        self._beat_times = None
        self._onset_env = None
        self._onset_frames = None
        self._centroid = None
        self._bandwidth = None
        self._rolloff = None
        self._contrast = None
        self._mfcc = None
        self._zcr = None

    # -- HPSS (Harmonic-Percussive Source Separation) --
    @property
    def hpss(self):
        if self._hpss is None:
            print("   Computing HPSS...", file=sys.stderr)
            self._hpss = librosa.effects.hpss(self.y)
        return self._hpss

    @property
    def y_harmonic(self):
        return self.hpss[0]

    @property
    def y_percussive(self):
        return self.hpss[1]

    @property
    def harmonic_ratio(self):
        h_energy = np.sum(self.y_harmonic ** 2)
        p_energy = np.sum(self.y_percussive ** 2)
        total = h_energy + p_energy + 1e-10
        return h_energy / total

    @property
    def percussive_ratio(self):
        return 1.0 - self.harmonic_ratio

    @property
    def track_character(self):
        hr = self.harmonic_ratio * 100
        pr = self.percussive_ratio * 100
        return "melodic" if hr > 55 else "rhythmic" if pr > 55 else "balanced"

    # -- RMS Energy --
    @property
    def rms(self):
        if self._rms is None:
            self._rms = librosa.feature.rms(y=self.y, hop_length=self.hop_length)[0]
        return self._rms

    @property
    def rms_percussive(self):
        if self._rms_percussive is None:
            self._rms_percussive = librosa.feature.rms(y=self.y_percussive, hop_length=self.hop_length)[0]
        return self._rms_percussive

    @property
    def rms_times(self):
        return librosa.frames_to_time(range(len(self.rms)), sr=self.sr, hop_length=self.hop_length)

    @property
    def rms_normalized(self):
        return (self.rms / (self.rms.max() + 1e-10) * 100)

    # -- Chroma --
    @property
    def chroma(self):
        """Chroma CQT on harmonic component (best for key detection & section segmentation)."""
        if self._chroma_cqt is None:
            self._chroma_cqt = librosa.feature.chroma_cqt(y=self.y_harmonic, sr=self.sr, hop_length=self.hop_length)
        return self._chroma_cqt

    @property
    def chroma_raw(self):
        """Chroma CQT on raw signal (for fingerprint section detection)."""
        if self._chroma_cqt_raw is None:
            self._chroma_cqt_raw = librosa.feature.chroma_cqt(y=self.y, sr=self.sr, hop_length=self.hop_length)
        return self._chroma_cqt_raw

    # -- Tempo & Beats --
    def _compute_tempo_beats(self):
        if self._tempo is None:
            self._tempo, self._beat_frames = librosa.beat.beat_track(y=self.y_percussive, sr=self.sr)
            if isinstance(self._tempo, np.ndarray):
                self._tempo = float(self._tempo[0]) if len(self._tempo) > 0 else 120.0
            else:
                self._tempo = float(self._tempo)
            self._beat_times = librosa.frames_to_time(self._beat_frames, sr=self.sr)

    @property
    def tempo(self):
        self._compute_tempo_beats()
        return self._tempo

    @property
    def beat_times(self):
        self._compute_tempo_beats()
        return self._beat_times

    # -- Onsets --
    @property
    def onset_env(self):
        if self._onset_env is None:
            self._onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr, hop_length=self.hop_length)
        return self._onset_env

    @property
    def onset_times(self):
        return librosa.times_like(self.onset_env, sr=self.sr, hop_length=self.hop_length)

    @property
    def onset_frames(self):
        if self._onset_frames is None:
            self._onset_frames = librosa.onset.onset_detect(
                y=self.y, sr=self.sr, hop_length=self.hop_length,
                units='frames', backtrack=False
            )
        return self._onset_frames

    @property
    def strong_onsets(self):
        return librosa.frames_to_time(self.onset_frames, sr=self.sr, hop_length=self.hop_length).tolist()

    # -- Spectral Features --
    @property
    def spectral_centroid(self):
        if self._centroid is None:
            self._centroid = librosa.feature.spectral_centroid(y=self.y, sr=self.sr, hop_length=self.hop_length)[0]
        return self._centroid

    @property
    def spectral_bandwidth(self):
        if self._bandwidth is None:
            self._bandwidth = librosa.feature.spectral_bandwidth(y=self.y, sr=self.sr, hop_length=self.hop_length)[0]
        return self._bandwidth

    @property
    def spectral_rolloff(self):
        if self._rolloff is None:
            self._rolloff = librosa.feature.spectral_rolloff(y=self.y, sr=self.sr, hop_length=self.hop_length)[0]
        return self._rolloff

    @property
    def spectral_contrast(self):
        if self._contrast is None:
            self._contrast = librosa.feature.spectral_contrast(y=self.y, sr=self.sr, hop_length=self.hop_length)
        return self._contrast

    # -- MFCC & ZCR --
    @property
    def mfcc(self):
        if self._mfcc is None:
            self._mfcc = librosa.feature.mfcc(y=self.y, sr=self.sr, n_mfcc=13, hop_length=self.hop_length)
        return self._mfcc

    @property
    def zcr(self):
        if self._zcr is None:
            self._zcr = librosa.feature.zero_crossing_rate(self.y, hop_length=self.hop_length)[0]
        return self._zcr


def forced_align_lyrics(audio_path: str, lyrics: str) -> dict:
    """
    Use forced alignment (Wav2Vec2 + CTC) to get EXACT word timing.
    This is the industry-standard method used by Spotify, karaoke apps.
    
    Args:
        audio_path: Path to audio file (ideally isolated vocals)
        lyrics: The lyrics text to align
        
    Returns:
        Dict with 'words' (list of {word, start, end}) and 'error' (string or None)
        NOW RETURNS A DICT WITH ERROR FIELD so TypeScript can detect failures!
    """
    if not FORCEALIGN_AVAILABLE:
        print("   ❌ FORCED ALIGNMENT UNAVAILABLE: library not installed", file=sys.stderr)
        return {'words': [], 'error': 'ForceAlign library not available'}
    
    if not lyrics or not lyrics.strip():
        print("   ❌ FORCED ALIGNMENT SKIPPED: no lyrics provided", file=sys.stderr)
        return {'words': [], 'error': 'No lyrics provided'}
    
    try:
        print("   Running forced alignment on lyrics...", file=sys.stderr)
        
        # Clean lyrics for alignment - remove section markers, replace punctuation with spaces
        clean_lyrics = lyrics
        
        # Remove section markers like [HOOK: THE THREAT]
        import re
        clean_lyrics = re.sub(r'\[(?:HOOK|VERSE|BRIDGE|CHORUS|OUTRO|INTRO)[^\]]*\]', ' ', clean_lyrics, flags=re.IGNORECASE)
        clean_lyrics = clean_lyrics.replace('[', ' ').replace(']', ' ')
        
        # Replace punctuation that joins words with spaces (em-dash, en-dash, etc.)
        # "ransom—I" should become "ransom I", not "ransomI"
        clean_lyrics = clean_lyrics.replace('—', ' ')  # em-dash
        clean_lyrics = clean_lyrics.replace('–', ' ')  # en-dash
        clean_lyrics = clean_lyrics.replace('-', ' ')  # regular hyphen (for compound words)
        clean_lyrics = clean_lyrics.replace('/', ' ')  # slash
        clean_lyrics = clean_lyrics.replace('...', ' ')  # ellipsis
        clean_lyrics = clean_lyrics.replace('…', ' ')  # unicode ellipsis
        
        # Remove other punctuation that shouldn't create word boundaries
        clean_lyrics = re.sub(r"[',\".!?;:()\"']", '', clean_lyrics)
        
        # Normalize whitespace
        clean_lyrics = ' '.join(clean_lyrics.split())
        
        word_count = len(clean_lyrics.split())
        print(f"   Aligning {word_count} words...", file=sys.stderr)
        
        if word_count == 0:
            return {'words': [], 'error': 'No words after lyrics cleanup'}
        
        # Create aligner instance (ForceAlign API: audio_file, transcript)
        aligner = ForceAlign(audio_file=audio_path, transcript=clean_lyrics)
        
        # Get word-level alignments (inference() method returns word objects)
        word_alignments = aligner.inference()
        
        if not word_alignments:
            print(f"   ❌ FORCED ALIGNMENT RETURNED EMPTY: inference returned no words", file=sys.stderr)
            return {'words': [], 'error': 'ForceAlign inference returned no words'}
        
        result = []
        for word_data in word_alignments:
            result.append({
                'word': word_data.word,
                'start': round(word_data.time_start, 3),
                'end': round(word_data.time_end, 3)
            })
        
        print(f"   ✅ Forced alignment complete: {len(result)} words aligned", file=sys.stderr)
        if result:
            print(f"   First word '{result[0]['word']}' at {result[0]['start']:.2f}s", file=sys.stderr)
            print(f"   Last word '{result[-1]['word']}' at {result[-1]['start']:.2f}s", file=sys.stderr)
        
        return {'words': result, 'error': None}
        
    except Exception as e:
        error_msg = str(e)
        print(f"   ❌ FORCED ALIGNMENT FAILED: {error_msg}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {'words': [], 'error': f'ForceAlign exception: {error_msg}'}


def forced_align_with_vocals(audio_path: str, lyrics: str) -> dict:
    """
    Best-effort forced alignment: isolate vocals first, then align.
    Falls back to full mix if vocal isolation fails.
    
    Returns dict with 'words' (list of {word, start, end}) and 'error' (string or None)
    """
    if not FORCEALIGN_AVAILABLE:
        return {'words': [], 'error': 'ForceAlign library not available'}
    
    if not lyrics or not lyrics.strip():
        return {'words': [], 'error': 'No lyrics provided'}
    
    # Try vocal isolation first for better alignment
    vocals_path = None
    vocal_isolation_error = None
    try:
        if DEMUCS_AVAILABLE:
            vocals, sr = isolate_vocals(audio_path)
            if vocals is not None:
                # Save vocals to temp file for alignment
                vocals_path = tempfile.mktemp(suffix='_vocals.wav')
                sf.write(vocals_path, vocals, sr)
                print(f"   Using isolated vocals for alignment: {vocals_path}", file=sys.stderr)
    except Exception as e:
        vocal_isolation_error = str(e)
        print(f"   Vocal isolation for alignment failed: {e}", file=sys.stderr)
    
    # Run alignment
    align_path = vocals_path if vocals_path else audio_path
    result = forced_align_lyrics(align_path, lyrics)
    
    # Cleanup temp file
    if vocals_path and os.path.exists(vocals_path):
        try:
            os.unlink(vocals_path)
        except:
            pass
    
    # If we used full mix because vocal isolation failed, note it
    if result['error'] is None and vocal_isolation_error and not vocals_path:
        print(f"   ⚠️ Used full mix (vocal isolation failed): {vocal_isolation_error}", file=sys.stderr)
    
    return result


def isolate_vocals(audio_path: str) -> tuple:
    """
    Use Demucs to separate vocals from the mix.
    Returns (vocals_audio, sample_rate) or (None, None) if failed.
    """
    if not DEMUCS_AVAILABLE:
        print("   Skipping vocal isolation (Demucs not available)", file=sys.stderr)
        return None, None
    
    try:
        print("   Isolating vocals with Demucs (this may take 30-60s)...", file=sys.stderr)
        
        # Load audio at original sample rate
        waveform, sr = torchaudio.load(audio_path)
        
        # Ensure stereo (Demucs expects 2 channels)
        if waveform.shape[0] == 1:
            waveform = waveform.repeat(2, 1)
        elif waveform.shape[0] > 2:
            waveform = waveform[:2, :]
        
        # Add batch dimension: (batch, channels, samples)
        waveform = waveform.unsqueeze(0)
        
        # Load htdemucs model (best quality for vocals)
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"   Using device: {device}", file=sys.stderr)
        
        model = get_model('htdemucs')
        model.to(device)
        model.eval()
        
        # Resample to model's expected sample rate if needed
        if sr != model.samplerate:
            print(f"   Resampling from {sr}Hz to {model.samplerate}Hz...", file=sys.stderr)
            waveform = torchaudio.transforms.Resample(sr, model.samplerate)(waveform)
            sr = model.samplerate
        
        # Apply the model to separate sources
        with torch.no_grad():
            waveform = waveform.to(device)
            sources = apply_model(model, waveform, device=device, progress=True)
        
        # htdemucs outputs: drums, bass, other, vocals (index 3)
        # Model sources shape: (batch, sources, channels, samples)
        vocals = sources[0, 3, :, :].cpu().numpy()  # (channels, samples)
        
        # Convert to mono for onset detection
        vocals_mono = np.mean(vocals, axis=0)
        
        print(f"   Vocal isolation complete: {len(vocals_mono)/sr:.2f}s of vocals", file=sys.stderr)
        
        return vocals_mono, sr
        
    except Exception as e:
        print(f"   Vocal isolation failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None, None


def detect_vocal_onsets(vocals: np.ndarray, sr: int) -> list:
    """
    Detect onsets specifically from isolated vocals.
    These are the moments when words/syllables are sung.
    """
    if vocals is None:
        return []
    
    try:
        print("   Detecting vocal onsets...", file=sys.stderr)
        
        # Resample to 22050 for librosa analysis
        if sr != 22050:
            vocals = librosa.resample(vocals, orig_sr=sr, target_sr=22050)
            sr = 22050
        
        hop_length = 512
        
        # Onset detection on vocals
        onset_frames = librosa.onset.onset_detect(
            y=vocals, 
            sr=sr, 
            hop_length=hop_length,
            units='frames',
            backtrack=False,
            pre_avg=3,
            post_avg=3,
            pre_max=3,
            post_max=3
        )
        
        vocal_onsets = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length).tolist()
        
        print(f"   Found {len(vocal_onsets)} vocal onsets", file=sys.stderr)
        
        return [round(t, 3) for t in vocal_onsets]
        
    except Exception as e:
        print(f"   Vocal onset detection failed: {e}", file=sys.stderr)
        return []

def analyze_audio(audio_path: str, lyrics: str = None, whisper_words: list = None, cache: AudioCache = None) -> dict:
    """
    Comprehensive audio analysis using librosa's full capabilities.

    Args:
        audio_path: Path to audio file
        lyrics: Optional lyrics text for forced alignment (exact word timing)
        whisper_words: Optional Whisper word timestamps for ground-truth offset calculation
                       List of dicts with 'word', 'start', 'end' keys (times relative to full song)
        cache: Optional pre-built AudioCache (shared with extract_fingerprint to avoid re-loading)

    Returns:
        dict with tempo, beats, energy, sections, peaks, spectral features,
        harmonic/percussive analysis, forced alignment, and visual pacing recommendations
    """
    print(f"🎵 Loading audio: {audio_path}", file=sys.stderr)
    if lyrics:
        print(f"   Lyrics provided for forced alignment ({len(lyrics)} chars)", file=sys.stderr)
    if whisper_words:
        print(f"   Whisper words provided for offset calculation ({len(whisper_words)} words)", file=sys.stderr)

    # Use shared AudioCache - loads audio once, computes features lazily
    if cache is None:
        cache = AudioCache(audio_path)

    y = cache.y
    sr = cache.sr
    duration = cache.duration
    hop_length = cache.hop_length

    print(f"   Duration: {duration:.2f}s, Sample rate: {sr}", file=sys.stderr)

    # ============================================
    # 1. HARMONIC-PERCUSSIVE SOURCE SEPARATION
    # Separates melodic content from drums/rhythm
    # ============================================
    print("   Analyzing harmonic/percussive content...", file=sys.stderr)
    harmonic_ratio = cache.harmonic_ratio * 100
    percussive_ratio = cache.percussive_ratio * 100
    track_character = cache.track_character
    
    # ============================================
    # 1.5 VOCAL ISOLATION (Demucs) for accurate karaoke sync
    # ============================================
    vocal_onsets = []
    vocals = None
    vocals_sr = None
    if DEMUCS_AVAILABLE:
        vocals, vocals_sr = isolate_vocals(audio_path)
        if vocals is not None:
            vocal_onsets = detect_vocal_onsets(vocals, vocals_sr)
            print(f"   Vocal onsets detected: {len(vocal_onsets)}", file=sys.stderr)
    
    # ============================================
    # 1.6 FORCED ALIGNMENT (Wav2Vec2 + CTC) for EXACT word timing
    # ============================================
    forced_alignment = []
    forced_alignment_error = None
    if lyrics and FORCEALIGN_AVAILABLE:
        # Save isolated vocals to temp file if available
        if vocals is not None and vocals_sr:
            vocals_path = tempfile.mktemp(suffix='_vocals.wav')
            sf.write(vocals_path, vocals, vocals_sr)
            print(f"   Using isolated vocals for alignment", file=sys.stderr)
            fa_result = forced_align_lyrics(vocals_path, lyrics)
            forced_alignment = fa_result.get('words', [])
            forced_alignment_error = fa_result.get('error')
            try:
                os.unlink(vocals_path)
            except:
                pass
        else:
            # Fall back to full audio
            fa_result = forced_align_lyrics(audio_path, lyrics)
            forced_alignment = fa_result.get('words', [])
            forced_alignment_error = fa_result.get('error')
        
        # Log if there was an error
        if forced_alignment_error:
            print(f"   ⚠️ Forced alignment error: {forced_alignment_error}", file=sys.stderr)
        
        # ============================================
        # 1.7 OFFSET CORRECTION: Shift forced alignment to match actual vocal start
        # ForceAlign returns timing starting at 0.00s, but vocals may start later
        # Use WHISPER as ground truth (absolute timeline) to calculate offset
        # ============================================
        if forced_alignment:
            offset = 0.0
            offset_method = "none"
            match_count = 0
            
            # PREFERRED METHOD: Use Whisper word timestamps as ground truth
            # Whisper timestamps are relative to full song, Forcealign starts at 0.00
            # Match words SEQUENTIALLY to find where lyrics start in the song
            if whisper_words and len(whisper_words) >= 3:
                print(f"   🎯 Using Whisper as ground truth for offset calculation", file=sys.stderr)
                
                import re
                def clean_word(w):
                    return re.sub(r'[^\w]', '', w.lower())
                
                # Clean all Whisper words (preserve order!)
                whisper_cleaned = [(clean_word(w.get('word', '')), w.get('start', 0), w.get('end', 0)) 
                                   for w in whisper_words if w.get('word')]
                
                # Clean first few ForceAlign words (these are the actual lyrics)
                fa_first_words = [clean_word(fa['word']) for fa in forced_alignment[:5] if fa.get('word')]
                
                print(f"   📝 Looking for lyrics starting with: {' '.join(fa_first_words[:3])}", file=sys.stderr)
                
                # Find where the lyrics BEGIN in Whisper by looking for a sequence match
                # Skip common filler words that Whisper might transcribe from music
                filler_words = {'oh', 'ah', 'ooh', 'yeah', 'uh', 'na', 'la', 'da', 'hmm', 'mm'}
                
                best_match_idx = -1
                best_match_count = 0
                
                # Slide through Whisper transcript looking for where lyrics start
                for start_idx in range(len(whisper_cleaned) - 2):
                    # Skip if this position starts with a filler word
                    if whisper_cleaned[start_idx][0] in filler_words:
                        continue
                    
                    # Count how many of our first lyrics words match starting here
                    match_count = 0
                    whisper_idx = start_idx
                    
                    for fa_word in fa_first_words:
                        if fa_word in filler_words:
                            continue
                        # Look ahead in Whisper for this word
                        for lookahead in range(min(5, len(whisper_cleaned) - whisper_idx)):
                            if whisper_idx + lookahead < len(whisper_cleaned):
                                if whisper_cleaned[whisper_idx + lookahead][0] == fa_word:
                                    match_count += 1
                                    whisper_idx = whisper_idx + lookahead + 1
                                    break
                    
                    if match_count > best_match_count:
                        best_match_count = match_count
                        best_match_idx = start_idx
                
                if best_match_idx >= 0 and best_match_count >= 2:
                    # Found where lyrics start in Whisper
                    whisper_start_time = whisper_cleaned[best_match_idx][1]
                    fa_start_time = forced_alignment[0]['start']
                    
                    offset = whisper_start_time - fa_start_time
                    offset_method = "whisper_sequential"
                    match_count = best_match_count
                    
                    print(f"   ✅ Found lyrics start at Whisper word #{best_match_idx}: '{whisper_cleaned[best_match_idx][0]}' @ {whisper_start_time:.2f}s", file=sys.stderr)
                    print(f"   🎯 Calculated offset: {offset:.2f}s (matched {match_count} words sequentially)", file=sys.stderr)
                else:
                    print(f"   ⚠️ Could not find lyrics sequence in Whisper (best match: {best_match_count} words) - falling back", file=sys.stderr)
            
            # FALLBACK METHOD: Use dense cluster detection on vocal onsets
            if offset_method == "none" and vocal_onsets and len(vocal_onsets) > 0:
                print(f"   🔄 Using vocal onset cluster detection for offset", file=sys.stderr)
                
                # Find first dense cluster of vocal onsets
                first_vocal_time = vocal_onsets[0]
                MIN_ONSETS_FOR_CLUSTER = 4
                CLUSTER_WINDOW = 3.0
                
                for i in range(len(vocal_onsets)):
                    onset_time = vocal_onsets[i]
                    window_end = onset_time + CLUSTER_WINDOW
                    onsets_in_window = sum(1 for t in vocal_onsets[i:] if t <= window_end)
                    
                    if onsets_in_window >= MIN_ONSETS_FOR_CLUSTER:
                        first_vocal_time = onset_time
                        print(f"   🎤 Found vocal cluster at {first_vocal_time:.2f}s ({onsets_in_window} onsets in {CLUSTER_WINDOW}s)", file=sys.stderr)
                        break
                
                first_aligned_time = forced_alignment[0]['start']
                offset = first_vocal_time - first_aligned_time
                offset_method = "onset_cluster"
            
            # Apply offset if significant (> 0.5s)
            if offset > 0.5:
                print(f"   🎯 Final offset: {offset:.2f}s (method: {offset_method})", file=sys.stderr)
                print(f"   🔧 Shifting all {len(forced_alignment)} word timestamps by +{offset:.2f}s", file=sys.stderr)
                
                for word_data in forced_alignment:
                    word_data['start'] = round(word_data['start'] + offset, 3)
                    word_data['end'] = round(word_data['end'] + offset, 3)
                
                print(f"   ✅ Adjusted first word '{forced_alignment[0]['word']}' now at {forced_alignment[0]['start']:.2f}s", file=sys.stderr)
                print(f"   ✅ Adjusted last word '{forced_alignment[-1]['word']}' now at {forced_alignment[-1]['start']:.2f}s", file=sys.stderr)
            else:
                print(f"   ℹ️  No offset needed (offset: {offset:.2f}s, method: {offset_method})", file=sys.stderr)
    
    # ============================================
    # 2. TEMPO & BEAT DETECTION (Enhanced)
    # ============================================
    print("   Detecting tempo and beats...", file=sys.stderr)

    tempo = cache.tempo
    beat_times = cache.beat_times.tolist()
    onset_env = cache.onset_env
    onset_times = cache.onset_times
    strong_onsets = cache.strong_onsets

    # ============================================
    # 2.1 DOWNBEAT DETECTION (RETENTION PROTOCOL)
    # Downbeats are the STRONGEST beats (beat 1 of each bar)
    # Critical for precise video transition timing
    # ============================================
    print("   Detecting downbeats (strongest beat of each bar)...", file=sys.stderr)

    downbeats = []
    if len(beat_times) > 4:
        # Estimate beats per bar (typically 4 for 4/4 time)
        # Use tempo to estimate: if BPM > 140, likely 4/4 with subdivisions
        # If BPM 80-140, typical 4/4
        # If BPM < 80, could be slower time signature

        if tempo > 140:
            beats_per_bar = 4  # Fast 4/4
        elif tempo > 80:
            beats_per_bar = 4  # Standard 4/4
        elif tempo > 60:
            beats_per_bar = 3  # Could be 3/4 waltz or slow 4/4
        else:
            beats_per_bar = 4  # Slow ballad 4/4

        # Use onset strength to identify strongest beats
        # Downbeats typically have highest energy
        beat_strengths = []
        for beat_time in beat_times:
            # Find onset strength at this beat
            idx = np.argmin(np.abs(onset_times - beat_time))
            strength = onset_env[idx] if idx < len(onset_env) else 0
            beat_strengths.append(strength)

        # Group beats into bars and find strongest beat in each bar
        for i in range(0, len(beat_times), beats_per_bar):
            bar_beats = beat_times[i:i+beats_per_bar]
            bar_strengths = beat_strengths[i:i+beats_per_bar]

            if bar_beats and bar_strengths:
                # Downbeat is typically the first beat, but verify with strength
                # If first beat isn't strongest, use strongest beat in bar
                max_strength_idx = np.argmax(bar_strengths)
                if max_strength_idx == 0 or bar_strengths[0] > 0.8 * bar_strengths[max_strength_idx]:
                    # First beat is downbeat (or close enough)
                    downbeats.append(bar_beats[0])
                else:
                    # Use strongest beat as downbeat
                    downbeats.append(bar_beats[max_strength_idx])

    print(f"   Tempo: {tempo:.1f} BPM, Beats: {len(beat_times)}, Downbeats: {len(downbeats)}, Onsets: {len(strong_onsets)}", file=sys.stderr)
    
    # ============================================
    # 2.5 STRONG BEATS FILTER (Top 40% Energy Only)
    # Reduces overlay count by ~60%, looks better - constant flashing creates fatigue
    # ============================================
    rms_full = cache.rms
    rms_times_full = cache.rms_times
    
    # Filter beats by energy - only top 40% make the cut
    energy_threshold = np.percentile(rms_full, 60)  # Top 40% = above 60th percentile
    strong_beats = []
    weak_beats = []
    
    for t in beat_times:
        idx = np.argmin(np.abs(rms_times_full - t))
        if idx < len(rms_full) and rms_full[idx] >= energy_threshold:
            strong_beats.append(t)
        else:
            weak_beats.append(t)
    
    print(f"   Strong beats (top 40% energy): {len(strong_beats)} / {len(beat_times)} ({100*len(strong_beats)//max(1,len(beat_times))}%)", file=sys.stderr)
    
    # ============================================
    # 2.6 HARDING TEST SAFETY CHECK (Photosensitive Epilepsy)
    # Industry standard: max 3 flashes per 1-second window
    # ============================================
    MIN_FLASH_INTERVAL = 0.35  # ~3Hz limit for safety
    
    safety_violations = []
    flashes_suppressed = 0
    safe_flash_times = []
    last_flash_time = -1.0
    
    for t in strong_beats:
        if (t - last_flash_time) > MIN_FLASH_INTERVAL:
            safe_flash_times.append(t)
            last_flash_time = t
        else:
            flashes_suppressed += 1
            safety_violations.append(round(t, 3))
    
    # Determine safety score
    suppression_pct = 100 * flashes_suppressed / max(1, len(strong_beats))
    if suppression_pct <= 5:
        safety_score = "green"  # No/minimal flashes suppressed
    elif suppression_pct <= 20:
        safety_score = "yellow"  # Some suppression due to high BPM
    else:
        safety_score = "red"  # Major strobe detected
    
    print(f"   Safety check: {safety_score.upper()} ({flashes_suppressed} flashes suppressed, {len(safe_flash_times)} safe)", file=sys.stderr)
    
    # ============================================
    # 2.7 VFX PARAMETERS (Optimized from user feedback)
    # Black dips reduced from 0.8 to 0.4-0.5 for better visibility
    # ============================================
    vfx_params = {
        "blackDipOpacity": 0.45,  # Reduced from 0.8 - viewers can still see content
        "flashOpacity": 0.6,
        "flashDecay": -12,  # Sharp, aggressive pop
        "dipDecay": -5,  # Slower, lingering dip
        "safeFlashOpacity": 0.2,  # When too close, use subtle pulse
        "safeFlashDecay": -20  # Vanishes almost instantly
    }
    
    # ============================================
    # 3. SPECTRAL FEATURES (Mood/Brightness Detection)
    # ============================================
    print("   Extracting spectral features...", file=sys.stderr)

    spectral_centroid = cache.spectral_centroid
    avg_centroid = np.mean(spectral_centroid)
    brightness = "bright" if avg_centroid > 3000 else "warm" if avg_centroid > 2000 else "dark"

    avg_bandwidth = np.mean(cache.spectral_bandwidth)

    avg_contrast = np.mean(cache.spectral_contrast)
    dynamics = "high contrast" if avg_contrast > 25 else "moderate dynamics" if avg_contrast > 15 else "smooth"

    avg_zcr = np.mean(cache.zcr)
    texture = "textured" if avg_zcr > 0.1 else "smooth"
    
    # ============================================
    # 4. ENERGY ANALYSIS (RMS + Dynamics)
    # ============================================
    print("   Calculating energy dynamics...", file=sys.stderr)

    rms = cache.rms
    rms_times = cache.rms_times
    rms_normalized = cache.rms_normalized.tolist()
    rms_percussive = cache.rms_percussive
    
    # ============================================
    # 5. HARMONIC ANALYSIS (Key/Mood Detection)
    # ============================================
    print("   Analyzing harmonic content...", file=sys.stderr)

    chroma = cache.chroma
    
    # Estimate key from chroma
    chroma_mean = np.mean(chroma, axis=1)
    key_index = np.argmax(chroma_mean)
    key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    estimated_key = key_names[key_index]
    
    # Major/minor estimation (simplified)
    major_template = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1])  # Major scale pattern
    minor_template = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0])  # Minor scale pattern
    
    # Rotate templates to match estimated key
    major_score = np.corrcoef(np.roll(major_template, key_index), chroma_mean)[0, 1]
    minor_score = np.corrcoef(np.roll(minor_template, key_index), chroma_mean)[0, 1]
    mode = "major" if major_score > minor_score else "minor"
    mood_from_key = "uplifting" if mode == "major" else "emotional"
    
    # ============================================
    # 6. MFCC FEATURES (Timbre/Texture)
    # ============================================
    mfcc = cache.mfcc
    
    # ============================================
    # 7. SECTION DETECTION (Structure Analysis)
    # ============================================
    print("   Detecting song structure...", file=sys.stderr)
    
    try:
        # Use recurrence-based segmentation
        num_sections = max(4, min(12, int(duration / 20)))
        bounds = librosa.segment.agglomerative(chroma, k=num_sections)
        bound_times = librosa.frames_to_time(bounds, sr=sr, hop_length=hop_length).tolist()
    except Exception as e:
        print(f"   Section detection fallback: {e}", file=sys.stderr)
        bound_times = detect_sections_by_energy(rms, rms_times, duration)
    
    if len(bound_times) < 3:
        bound_times = detect_sections_by_energy(rms, rms_times, duration)
    
    # Classify sections with enhanced energy info
    sections = classify_sections_enhanced(bound_times, rms, rms_percussive, spectral_centroid, 
                                          rms_times, duration, chroma)
    
    # ============================================
    # 8. PEAKS, DIPS, AND ACCENT POINTS
    # ============================================
    peaks, dips = find_peaks_and_dips(rms, rms_times)
    
    # Find best visual accent points (combine onsets with energy peaks)
    visual_accents = find_visual_accents(onset_env, onset_times, rms, rms_times, beat_times)
    
    # ============================================
    # 9. ENERGY SAMPLES (for timeline visualization)
    # ============================================
    energy_samples = []
    sample_interval = 0.5
    for t in np.arange(0, duration, sample_interval):
        idx = int(t / duration * len(rms_normalized))
        idx = min(idx, len(rms_normalized) - 1)
        
        # Also get spectral centroid at this point
        centroid_idx = min(idx, len(spectral_centroid) - 1)
        energy_samples.append({
            "time": round(t, 2),
            "energy": round(rms_normalized[idx], 1),
            "brightness": round(float(spectral_centroid[centroid_idx]) / 1000, 2)  # kHz
        })
    
    print(f"   ✅ Analysis complete: {len(sections)} sections detected", file=sys.stderr)
    
    # ============================================
    # BUILD RESULT (ensure all numpy types are converted to Python natives)
    # ============================================
    result = {
        "success": True,
        "analysis": {
            # Core timing
            "bpm": round(tempo, 1),
            "duration": round(duration, 2),
            "durationFormatted": format_duration(duration),
            
            # Beat sync data
            "beatCount": len(beat_times),
            "beats": [round(t, 3) for t in beat_times[:200]],  # Up to 200 beats
            "downbeats": [round(t, 3) for t in downbeats],  # STRONGEST beats (beat 1 of each bar) for precise transitions
            "strongBeats": [round(t, 3) for t in strong_beats[:100]],  # TOP 40% energy beats for VFX flashes
            "safeFlashTimes": [round(t, 3) for t in safe_flash_times[:100]],  # Harding-safe flash times
            "strongOnsets": [round(t, 3) for t in strong_onsets],  # ALL onsets for karaoke word sync
            "vocalOnsets": vocal_onsets,  # Onsets from isolated vocals for accurate karaoke sync
            
            # SAFETY & VFX PARAMETERS (Harding Test compliance for photosensitive epilepsy)
            "safety": {
                "score": safety_score,  # "green", "yellow", "red"
                "flashesSuppressed": flashes_suppressed,
                "safeFlashCount": len(safe_flash_times),
                "suppressionPct": round(suppression_pct, 1),
                "violations": safety_violations[:20]  # First 20 violation timestamps
            },
            "vfxParams": vfx_params,  # Optimized opacity/decay values for overlays
            
            # FORCED ALIGNMENT (exact word timing from Wav2Vec2 + CTC)
            "forcedAlignment": forced_alignment,  # List of {word, start, end} with EXACT timing
            "forcedAlignmentError": forced_alignment_error,  # Error message if alignment failed (None if success)
            
            # Song character
            "trackCharacter": track_character,
            "harmonicPercussiveRatio": {
                "harmonic": round(harmonic_ratio, 1),
                "percussive": round(percussive_ratio, 1)
            },
            
            # Spectral characteristics (mood indicators)
            "spectral": {
                "brightness": brightness,
                "avgCentroid": round(avg_centroid, 0),
                "dynamics": dynamics,
                "texture": texture,
                "avgBandwidth": round(avg_bandwidth, 0)
            },
            
            # Key/harmonic info
            "harmony": {
                "estimatedKey": estimated_key,
                "mode": mode,
                "mood": mood_from_key
            },
            
            # Sections
            "sections": sections,
            
            # Energy dynamics
            "peaks": peaks[:10],
            "dips": dips[:10],
            "visualAccents": visual_accents[:20],  # Best points for visual cuts
            "energySamples": energy_samples,
            "averageEnergy": round(float(np.mean(rms_normalized)), 1),
            "energyRange": {
                "min": round(float(np.min(rms_normalized)), 1),
                "max": round(float(np.max(rms_normalized)), 1)
            }
        },
        "textSummary": generate_text_summary_enhanced(
            tempo, duration, sections, peaks, dips,
            track_character, brightness, estimated_key, mode, dynamics
        )
    }
    
    # Recursively convert all numpy types to native Python types
    return to_native(result)


def find_visual_accents(onset_env, onset_times, rms, rms_times, beat_times):
    """Find the best moments for visual cuts/accents based on combined features."""
    accents = []
    
    # Normalize onset envelope
    onset_normalized = onset_env / (np.max(onset_env) + 1e-10) * 100
    
    # Find significant onset peaks
    threshold = np.percentile(onset_normalized, 75)
    
    for i in range(1, len(onset_normalized) - 1):
        if (onset_normalized[i] > threshold and 
            onset_normalized[i] > onset_normalized[i-1] and 
            onset_normalized[i] > onset_normalized[i+1]):
            
            t = float(onset_times[i])
            
            # Check if this is near a beat (within 50ms)
            is_on_beat = any(abs(t - bt) < 0.05 for bt in beat_times)
            
            accents.append({
                "time": round(t, 3),
                "timeFormatted": format_duration(t),
                "strength": round(float(onset_normalized[i]), 1),
                "onBeat": is_on_beat,
                "type": "strong_onset"
            })
    
    # Sort by strength
    accents.sort(key=lambda x: -x["strength"])
    return accents


def classify_energy_curve(rms: np.ndarray) -> str:
    """Classify the overall energy shape - critical for retention prediction"""
    quarter = len(rms) // 4
    if quarter < 1:
        return "flat"
    
    q1 = np.mean(rms[:quarter])
    q2 = np.mean(rms[quarter:quarter*2])
    q3 = np.mean(rms[quarter*2:quarter*3])
    q4 = np.mean(rms[quarter*3:])
    
    if q1 > q2 and q1 > q3 and q1 > q4:
        return "front_loaded"  # Best for retention - immediate impact
    elif q4 > q3 > q2 > q1:
        return "building"  # Gradual build - can work for storytelling
    elif max(q1, q2, q3, q4) / (min(q1, q2, q3, q4) + 0.001) < 1.3:
        return "flat"  # Monotonous - retention killer
    else:
        return "peaks"  # Dynamic with peaks - good variety


def extract_fingerprint(audio_path: str, cache: AudioCache = None) -> dict:
    """
    Extract complete acoustic fingerprint for retention correlation analysis.
    This is the "ears" of the system - it hears what humans miss.

    Args:
        audio_path: Path to audio file
        cache: Optional pre-built AudioCache (shared with analyze_audio to avoid re-loading)

    Returns a comprehensive fingerprint that can be stored in audio_dna table
    and used by Claude to correlate with retention patterns.
    """
    print(f"🎵 Extracting acoustic fingerprint: {audio_path}", file=sys.stderr)

    try:
        # Use shared AudioCache - loads audio once, computes features lazily
        if cache is None:
            cache = AudioCache(audio_path)

        y = cache.y
        sr = cache.sr
        duration = cache.duration
        hop_length = cache.hop_length

        # ====== TEMPO & RHYTHM (from cache) ======
        tempo = cache.tempo
        beat_times = cache.beat_times
        beat_count = len(beat_times)

        # Beat regularity (consistency of intervals)
        if len(beat_times) > 2:
            intervals = np.diff(beat_times)
            beat_regularity = 1.0 - min(1.0, np.std(intervals) / (np.mean(intervals) + 0.001))
        else:
            beat_regularity = 0.0

        # ====== HARMONIC-PERCUSSIVE (from cache) ======
        harmonic_ratio = cache.harmonic_ratio
        track_character = cache.track_character

        # ====== ENERGY (from cache) ======
        rms = cache.rms
        energy_mean = float(np.mean(rms))
        energy_variance = float(np.var(rms))  # KEY RETENTION SIGNAL
        energy_dynamic_range = float(np.max(rms) - np.min(rms))
        energy_curve = classify_energy_curve(rms)

        # ====== HOOK TIMING (first 4 seconds) ======
        hook_samples = int(4 * sr)
        if len(y) > hook_samples:
            hook_rms = np.mean(librosa.feature.rms(y=y[:hook_samples])[0])
            rest_rms = np.mean(librosa.feature.rms(y=y[hook_samples:])[0])
            hook_energy_ratio = float(hook_rms / (rest_rms + 0.001))
        else:
            hook_energy_ratio = 1.0

        # First energy spike detection
        rms_times = cache.rms_times
        rms_normalized = (rms - np.min(rms)) / (np.max(rms) - np.min(rms) + 0.001)
        spike_threshold = 0.6
        first_energy_spike = 0.0
        for i, val in enumerate(rms_normalized):
            if val > spike_threshold:
                first_energy_spike = float(rms_times[i])
                break

        # Energy spikes list
        energy_spikes = []
        from scipy.signal import find_peaks
        peaks, _ = find_peaks(rms_normalized, height=0.5, distance=10)
        for p in peaks[:10]:
            energy_spikes.append({"time": float(rms_times[p]), "magnitude": float(rms_normalized[p])})

        # ====== PERCUSSIVENESS (from cache) ======
        zcr_mean = float(np.mean(cache.zcr))
        percussiveness_score = min(1.0, max(0.0, (zcr_mean - 0.02) / 0.18))

        # ====== SPECTRAL FEATURES (from cache) ======
        spectral_centroid_mean = float(np.mean(cache.spectral_centroid))
        brightness_score = min(1.0, max(0.0, (spectral_centroid_mean - 1000) / 4000))
        spectral_contrast_mean = float(np.mean(cache.spectral_contrast))

        # ====== ONSET DETECTION (from cache) ======
        onset_count = len(cache.onset_frames)
        onset_density = onset_count / duration if duration > 0 else 0

        # ====== MFCCs (from cache) ======
        mfccs = cache.mfcc
        mfcc_means = [float(np.mean(mfccs[i])) for i in range(min(5, len(mfccs)))]

        # ====== SECTION DETECTION (from cache) ======
        try:
            bounds = librosa.segment.agglomerative(cache.chroma_raw, 8)
            section_times = librosa.frames_to_time(bounds, sr=sr)
            num_sections = len(section_times)
            section_boundaries = section_times.tolist()
        except:
            num_sections = 1
            section_boundaries = []

        # ====== KEY DETECTION (from cache chroma) ======
        try:
            chroma_avg = np.mean(cache.chroma_raw, axis=1)
            key_idx = int(np.argmax(chroma_avg))
            key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            key_estimate = key_names[key_idx]
            key_confidence = float(chroma_avg[key_idx] / (np.sum(chroma_avg) + 0.001))
        except:
            key_estimate = "C"
            key_confidence = 0.5

        # ====== DNA SCORES (normalized 0-100) ======
        energy_score = min(100, energy_dynamic_range * 1000)
        rhythm_score = min(100, (tempo / 150) * 50 + beat_regularity * 50)
        clarity_score = brightness_score * 100
        hook_score = min(100, hook_energy_ratio * 50 + (50 if first_energy_spike < 3 else 25 if first_energy_spike < 5 else 0))

        dna_scores = {
            "energy_score": round(energy_score, 1),
            "rhythm_score": round(rhythm_score, 1),
            "clarity_score": round(clarity_score, 1),
            "hook_score": round(hook_score, 1)
        }

        # ====== PREDICTED HOOK SURVIVAL ======
        predicted_hook_survival = (
            (0.3 if hook_energy_ratio > 1.0 else 0.1) +
            (0.25 if first_energy_spike < 3.0 else 0.1 if first_energy_spike < 5.0 else 0.0) +
            (0.2 if energy_curve == "front_loaded" else 0.1 if energy_curve == "peaks" else 0.0) +
            (percussiveness_score * 0.15) +
            (energy_variance * 100 * 0.1)
        )
        predicted_hook_survival = min(1.0, max(0.0, predicted_hook_survival))

        fingerprint = {
            "file_path": audio_path,
            "duration_seconds": round(duration, 2),
            "bpm": round(tempo, 1),
            "bpm_confidence": 0.8,
            "beat_count": beat_count,
            "beat_regularity": round(beat_regularity, 3),
            "energy_mean": round(energy_mean, 6),
            "energy_variance": round(energy_variance, 6),
            "energy_dynamic_range": round(energy_dynamic_range, 6),
            "energy_curve": energy_curve,
            "first_energy_spike_seconds": round(first_energy_spike, 2),
            "hook_energy_ratio": round(hook_energy_ratio, 3),
            "zcr_mean": round(zcr_mean, 6),
            "percussiveness_score": round(percussiveness_score, 3),
            "spectral_centroid_mean": round(spectral_centroid_mean, 1),
            "brightness_score": round(brightness_score, 3),
            "spectral_contrast_mean": round(spectral_contrast_mean, 2),
            "onset_count": onset_count,
            "onset_density": round(onset_density, 2),
            "mfcc_means": mfcc_means,
            "num_sections": num_sections,
            "section_boundaries": section_boundaries,
            "key_estimate": key_estimate,
            "key_confidence": round(key_confidence, 3),
            "predicted_hook_survival": round(predicted_hook_survival, 3),
            "energy_spikes": energy_spikes,
            "dna_scores": dna_scores,
            "track_character": track_character,
            "harmonic_ratio": round(harmonic_ratio, 3)
        }

        print(f"   ✅ Fingerprint extracted: BPM={tempo:.0f}, Energy Curve={energy_curve}, Hook Survival={predicted_hook_survival:.0%}", file=sys.stderr)
        return to_native(fingerprint)

    except Exception as e:
        print(f"   ❌ Fingerprint extraction failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None


def detect_sections_by_energy(rms, rms_times, duration):
    """Fallback section detection based on energy changes."""
    # Smooth RMS
    window = min(50, len(rms) // 10)
    if window > 0:
        smoothed = np.convolve(rms, np.ones(window)/window, mode='same')
    else:
        smoothed = rms
    
    # Find significant changes in energy
    diff = np.abs(np.diff(smoothed))
    threshold = np.percentile(diff, 85)
    
    change_points = np.where(diff > threshold)[0]
    
    # Convert to times and filter close points
    bounds = [0.0]
    min_section_length = 10.0  # Minimum 10 seconds per section
    
    for idx in change_points:
        t = float(rms_times[idx])
        if t - bounds[-1] >= min_section_length:
            bounds.append(t)
    
    # Add end if not close to last bound
    if duration - bounds[-1] >= min_section_length:
        bounds.append(duration)
    
    # Ensure we have at least 4-6 sections for a typical song
    if len(bounds) < 5 and duration > 60:
        # Divide evenly
        num_sections = max(4, int(duration / 30))
        bounds = [duration * i / num_sections for i in range(num_sections + 1)]
    
    return bounds


def classify_sections_enhanced(bound_times, rms, rms_percussive, spectral_centroid, rms_times, duration, chroma):
    """
    Enhanced section classification using multiple audio features.
    Uses energy, percussive content, brightness, and harmonic changes.
    """
    sections = []
    
    # Add duration end if not present
    if bound_times[-1] < duration - 5:
        bound_times = bound_times + [duration]
    
    global_max = float(np.max(rms)) if np.max(rms) > 0 else 1
    global_centroid_max = float(np.max(spectral_centroid)) if np.max(spectral_centroid) > 0 else 1
    
    for i in range(len(bound_times) - 1):
        start_time = bound_times[i]
        end_time = bound_times[i + 1]
        
        # Get indices for this section
        start_idx = int(start_time / duration * len(rms))
        end_idx = int(end_time / duration * len(rms))
        
        # Get feature arrays for this section
        section_rms = rms[start_idx:end_idx] if end_idx > start_idx else rms[start_idx:start_idx+1]
        section_perc = rms_percussive[start_idx:end_idx] if end_idx > start_idx else rms_percussive[start_idx:start_idx+1]
        section_centroid = spectral_centroid[start_idx:end_idx] if end_idx > start_idx else spectral_centroid[start_idx:start_idx+1]
        
        # Calculate characteristics
        avg_energy = float(np.mean(section_rms)) if len(section_rms) > 0 else 0
        max_energy = float(np.max(section_rms)) if len(section_rms) > 0 else 0
        avg_percussive = float(np.mean(section_perc)) if len(section_perc) > 0 else 0
        avg_brightness = float(np.mean(section_centroid)) if len(section_centroid) > 0 else 0
        
        # Normalize
        avg_normalized = avg_energy / global_max * 100
        max_normalized = max_energy / global_max * 100
        brightness_normalized = avg_brightness / global_centroid_max * 100
        percussive_normalized = avg_percussive / (np.max(rms_percussive) + 1e-10) * 100
        
        # Determine energy level
        if avg_normalized < 30:
            energy_level = "low"
        elif avg_normalized < 60:
            energy_level = "medium"
        else:
            energy_level = "high"
        
        # Determine trend
        if len(section_rms) > 10:
            first_half = np.mean(section_rms[:len(section_rms)//2])
            second_half = np.mean(section_rms[len(section_rms)//2:])
            diff = second_half - first_half
            if diff > 0.1 * global_max:
                trend = "building"
            elif diff < -0.1 * global_max:
                trend = "dropping"
            else:
                trend = "steady"
        else:
            trend = "steady"
        
        # Enhanced section type guessing using multiple features
        section_type = guess_section_type_enhanced(
            i, len(bound_times) - 1, 
            avg_normalized, percussive_normalized, brightness_normalized,
            end_time - start_time, trend
        )
        
        # Find peak moment
        if len(section_rms) > 0:
            peak_idx = np.argmax(section_rms)
            peak_time = start_time + (peak_idx / len(section_rms)) * (end_time - start_time)
        else:
            peak_time = start_time
        
        # Determine visual pacing recommendation
        if energy_level == "high" and percussive_normalized > 60:
            visual_pacing = "fast cuts, dynamic camera, intense lighting"
        elif energy_level == "high":
            visual_pacing = "dramatic wide shots, building intensity"
        elif energy_level == "low":
            visual_pacing = "slow pacing, intimate close-ups, soft lighting"
        elif trend == "building":
            visual_pacing = "accelerating cuts, rising tension"
        else:
            visual_pacing = "moderate pacing, varied shot types"
        
        sections.append({
            "index": i + 1,
            "type": section_type,
            "startTime": round(start_time, 2),
            "endTime": round(end_time, 2),
            "startFormatted": format_duration(start_time),
            "endFormatted": format_duration(end_time),
            "durationSeconds": round(end_time - start_time, 2),
            "energy": round(avg_normalized / 100, 2),  # 0-1 scale for VEO
            "energyLevel": energy_level,
            "averageEnergy": round(avg_normalized, 1),
            "maxEnergy": round(max_normalized, 1),
            "percussiveEnergy": round(percussive_normalized, 1),
            "brightness": round(brightness_normalized, 1),
            "trend": trend,
            "peakMoment": round(peak_time, 2),
            "peakMomentFormatted": format_duration(peak_time),
            "visualPacing": visual_pacing
        })
    
    return sections


def guess_section_type_enhanced(index: int, total_sections: int, energy: float, 
                                 percussive: float, brightness: float, 
                                 duration: float, trend: str) -> str:
    """
    Enhanced section type guessing using multiple audio features.
    More accurate than position-only guessing.
    """
    position_ratio = index / total_sections if total_sections > 0 else 0
    
    # Intro: first section, usually building, lower energy
    if index == 0:
        return "intro"
    
    # Outro: last section, often dropping energy
    if index == total_sections - 1:
        return "outro"
    
    # High energy + high percussive = likely chorus (the drop/peak)
    if energy > 70 and percussive > 50:
        return "chorus"
    
    # High energy + high brightness = also likely chorus
    if energy > 65 and brightness > 70:
        return "chorus"
    
    # Bridge: later in song, medium energy, often different brightness
    if 0.55 < position_ratio < 0.8 and 35 < energy < 65:
        return "bridge"
    
    # Pre-chorus: building trend before high energy section
    if trend == "building" and 40 < energy < 70:
        return "pre-chorus"
    
    # Hook: short high-energy section
    if energy > 60 and duration < 15:
        return "hook"
    
    # Default to verse
    return "verse"


def classify_sections(bound_times, rms, rms_times, duration):
    """Legacy section classification (fallback)."""
    sections = []
    
    if bound_times[-1] < duration - 5:
        bound_times = bound_times + [duration]
    
    global_max = float(np.max(rms)) if np.max(rms) > 0 else 1
    
    for i in range(len(bound_times) - 1):
        start_time = bound_times[i]
        end_time = bound_times[i + 1]
        
        start_idx = int(start_time / duration * len(rms))
        end_idx = int(end_time / duration * len(rms))
        section_rms = rms[start_idx:end_idx] if end_idx > start_idx else rms[start_idx:start_idx+1]
        
        avg_energy = float(np.mean(section_rms)) if len(section_rms) > 0 else 0
        max_energy = float(np.max(section_rms)) if len(section_rms) > 0 else 0
        avg_normalized = avg_energy / global_max * 100
        max_normalized = max_energy / global_max * 100
        
        if avg_normalized < 30:
            energy_level = "low"
        elif avg_normalized < 60:
            energy_level = "medium"
        else:
            energy_level = "high"
        
        if len(section_rms) > 10:
            first_half = np.mean(section_rms[:len(section_rms)//2])
            second_half = np.mean(section_rms[len(section_rms)//2:])
            diff = second_half - first_half
            if diff > 0.1 * global_max:
                trend = "building"
            elif diff < -0.1 * global_max:
                trend = "dropping"
            else:
                trend = "steady"
        else:
            trend = "steady"
        
        section_type = guess_section_type(i, len(bound_times) - 1, avg_normalized, end_time - start_time)
        
        if len(section_rms) > 0:
            peak_idx = np.argmax(section_rms)
            peak_time = start_time + (peak_idx / len(section_rms)) * (end_time - start_time)
        else:
            peak_time = start_time
        
        sections.append({
            "index": i + 1,
            "type": section_type,
            "startTime": round(start_time, 2),
            "endTime": round(end_time, 2),
            "startFormatted": format_duration(start_time),
            "endFormatted": format_duration(end_time),
            "durationSeconds": round(end_time - start_time, 2),
            "energy": round(avg_normalized / 100, 2),
            "energyLevel": energy_level,
            "averageEnergy": round(avg_normalized, 1),
            "maxEnergy": round(max_normalized, 1),
            "trend": trend,
            "peakMoment": round(peak_time, 2),
            "peakMomentFormatted": format_duration(peak_time)
        })
    
    return sections


def guess_section_type(index: int, total_sections: int, energy: float, duration: float) -> str:
    """Guess section type based on position and characteristics."""
    position_ratio = index / total_sections if total_sections > 0 else 0
    
    # Intro: first section, usually lower energy, shorter
    if index == 0:
        return "intro"
    
    # Outro: last section, often dropping energy
    if index == total_sections - 1:
        return "outro"
    
    # High energy sections are likely chorus
    if energy > 70:
        return "chorus"
    
    # Bridge: usually in the 2/3 to 3/4 position, medium-high energy
    if 0.6 < position_ratio < 0.8 and 40 < energy < 70:
        return "bridge"
    
    # Pre-chorus: section right before high energy
    if 0.2 < position_ratio < 0.5 and 50 < energy < 70:
        return "pre-chorus"
    
    # Default to verse
    return "verse"


def find_peaks_and_dips(rms, rms_times):
    """Find significant energy peaks and dips."""
    # Smooth the RMS curve
    window = min(20, len(rms) // 20)
    if window > 0:
        smoothed = np.convolve(rms, np.ones(window)/window, mode='same')
    else:
        smoothed = rms
    
    peaks = []
    dips = []
    
    # Find local maxima and minima
    for i in range(1, len(smoothed) - 1):
        if smoothed[i] > smoothed[i-1] and smoothed[i] > smoothed[i+1]:
            # Local maximum
            normalized = smoothed[i] / (np.max(smoothed) + 1e-10) * 100
            if normalized > 60:  # Only significant peaks
                peaks.append({
                    "time": round(float(rms_times[i]), 2),
                    "timeFormatted": format_duration(float(rms_times[i])),
                    "energy": round(normalized, 1)
                })
        elif smoothed[i] < smoothed[i-1] and smoothed[i] < smoothed[i+1]:
            # Local minimum
            normalized = smoothed[i] / (np.max(smoothed) + 1e-10) * 100
            if normalized < 40:  # Only significant dips
                dips.append({
                    "time": round(float(rms_times[i]), 2),
                    "timeFormatted": format_duration(float(rms_times[i])),
                    "energy": round(normalized, 1)
                })
    
    # Sort by significance
    peaks.sort(key=lambda x: -x["energy"])
    dips.sort(key=lambda x: x["energy"])
    
    return peaks, dips


def format_duration(seconds: float) -> str:
    """Format seconds as M:SS."""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes}:{secs:02d}"


def generate_text_summary_enhanced(tempo, duration, sections, peaks, dips,
                                    track_character, brightness, key, mode, dynamics) -> str:
    """Generate comprehensive text summary with all audio features for OpenAI."""
    lines = [
        "=" * 50,
        "COMPREHENSIVE AUDIO ANALYSIS",
        "=" * 50,
        "",
        "CORE METRICS:",
        f"- BPM: {tempo:.0f}",
        f"- Total Duration: {format_duration(duration)} ({duration:.1f} seconds)",
        f"- Key: {key} {mode}",
        f"- Track Character: {track_character}",
        f"- Tonal Brightness: {brightness}",
        f"- Dynamic Range: {dynamics}",
        "",
        f"SONG STRUCTURE ({len(sections)} sections):",
    ]
    
    for section in sections:
        peak_info = f", peak at {section['peakMomentFormatted']}" if section.get('energyLevel') == 'high' else ""
        perc_info = f", {section.get('percussiveEnergy', 0):.0f}% percussive" if 'percussiveEnergy' in section else ""
        visual = section.get('visualPacing', 'moderate pacing')
        
        lines.append(
            f"- {section['type'].upper()} ({section['startFormatted']}-{section['endFormatted']}): "
            f"{section.get('energyLevel', 'medium')} energy{perc_info}, {section.get('trend', 'steady')}{peak_info}"
        )
        lines.append(f"    → Visual: {visual}")
    
    if peaks:
        lines.append("")
        lines.append("ENERGY PEAKS (best for visual accents/cuts):")
        for peak in peaks[:5]:
            lines.append(f"- {peak['timeFormatted']}: {peak['energy']:.0f}% energy - VISUAL ACCENT POINT")
    
    if dips:
        lines.append("")
        lines.append("ENERGY DIPS (intimate/reflective moments):")
        for dip in dips[:5]:
            lines.append(f"- {dip['timeFormatted']}: {dip['energy']:.0f}% energy - SLOW PACING")
    
    lines.append("")
    lines.append("=" * 50)
    lines.append("VISUAL DIRECTION RECOMMENDATIONS")
    lines.append("=" * 50)
    
    # Overall mood recommendation
    if mode == "major":
        mood_rec = "Overall mood: Uplifting, bright visuals, warm color grading"
    else:
        mood_rec = "Overall mood: Emotional, dramatic lighting, cooler color palette"
    lines.append(f"\n{mood_rec}")
    
    if track_character == "rhythmic":
        lines.append("Style: Emphasize beat-synced cuts, dynamic camera movement, rhythmic editing")
    elif track_character == "melodic":
        lines.append("Style: Flowing camera moves, longer takes, emotional close-ups")
    else:
        lines.append("Style: Balance of rhythmic cuts and melodic flows")
    
    if brightness == "bright":
        lines.append("Lighting: High-key, vibrant, energetic atmosphere")
    elif brightness == "dark":
        lines.append("Lighting: Low-key, dramatic shadows, moody atmosphere")
    else:
        lines.append("Lighting: Balanced, natural warmth, versatile")
    
    lines.append("")
    lines.append("SECTION-SPECIFIC VISUAL PACING:")
    
    for section in sections:
        section_type = section['type'].upper()
        energy = section.get('energyLevel', 'medium')
        perc = section.get('percussiveEnergy', 50)
        bright = section.get('brightness', 50)
        
        if section_type == 'CHORUS' or (energy == 'high' and perc > 60):
            lines.append(f"- {section_type}: MAXIMUM IMPACT - Fast cuts, crane shots, hero poses, lens flares")
        elif section_type == 'BRIDGE':
            lines.append(f"- {section_type}: REFLECTIVE - Slow dolly, close-ups, soft focus, visual metaphors")
        elif section_type == 'VERSE':
            lines.append(f"- {section_type}: NARRATIVE - Medium pacing, character focus, scene building")
        elif section_type == 'INTRO':
            lines.append(f"- {section_type}: ESTABLISHING - Wide shots, slow reveals, atmosphere building")
        elif section_type == 'OUTRO':
            lines.append(f"- {section_type}: RESOLUTION - Pull back, group shots, satisfying conclusion")
        elif section_type == 'PRE-CHORUS':
            lines.append(f"- {section_type}: BUILD TENSION - Accelerating cuts, rising intensity")
        else:
            lines.append(f"- {section_type}: Standard pacing matching energy level")
    
    return "\n".join(lines)


def generate_text_summary(tempo, duration, sections, peaks, dips) -> str:
    """Generate human-readable text summary for OpenAI (legacy)."""
    lines = [
        "SONG ANALYSIS:",
        f"- BPM: {tempo:.0f}",
        f"- Total Duration: {format_duration(duration)} ({duration:.1f} seconds)",
        f"- Number of Sections: {len(sections)}",
        "",
        "SECTION BREAKDOWN:"
    ]
    
    for section in sections:
        peak_info = f", peak at {section['peakMomentFormatted']}" if section.get('energyLevel') == 'high' else ""
        lines.append(
            f"- Section {section['index']} ({section['startFormatted']}-{section['endFormatted']}): "
            f"{section['type'].upper()}, {section.get('energyLevel', 'medium')} energy, {section.get('trend', 'steady')}{peak_info}"
        )
    
    if peaks:
        lines.append("")
        lines.append("ENERGY PEAKS (most intense moments):")
        for peak in peaks[:5]:
            lines.append(f"- {peak['timeFormatted']}: {peak['energy']:.0f}% energy")
    
    if dips:
        lines.append("")
        lines.append("ENERGY DIPS (quiet/intimate moments):")
        for dip in dips[:5]:
            lines.append(f"- {dip['timeFormatted']}: {dip['energy']:.0f}% energy")
    
    lines.append("")
    lines.append("VISUAL PACING RECOMMENDATIONS:")
    
    for section in sections:
        if section.get('energyLevel') == 'high':
            lines.append(f"- {section['type'].upper()} ({section['startFormatted']}-{section['endFormatted']}): "
                        "Fast cuts, dynamic camera movement, close-ups, intense lighting")
        elif section.get('energyLevel') == 'low':
            lines.append(f"- {section['type'].upper()} ({section['startFormatted']}-{section['endFormatted']}): "
                        "Slower pacing, wide establishing shots, subtle movement, softer lighting")
        else:
            lines.append(f"- {section['type'].upper()} ({section['startFormatted']}-{section['endFormatted']}): "
                        "Moderate pacing, mix of shot types, building tension")
    
    return "\n".join(lines)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: audio_analyzer.py <audio_file_path> [lyrics_file_path] [whisper_json_path]\n       audio_analyzer.py --fingerprint <audio_file_path>"
        }))
        sys.exit(1)
    
    # Check for fingerprint mode
    if sys.argv[1] == "--fingerprint":
        if len(sys.argv) < 3:
            print(json.dumps({
                "success": False,
                "error": "Usage: audio_analyzer.py --fingerprint <audio_file_path>"
            }))
            sys.exit(1)
        
        audio_path = sys.argv[2]
        try:
            fingerprint = extract_fingerprint(audio_path)
            if fingerprint:
                print(json.dumps({"success": True, "fingerprint": fingerprint}, indent=2))
            else:
                print(json.dumps({"success": False, "error": "Fingerprint extraction returned None"}))
                sys.exit(1)
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
            sys.exit(1)
    else:
        # Standard analysis mode
        audio_path = sys.argv[1]
        lyrics = None
        whisper_words = None
        
        # Optional: load lyrics from file for forced alignment
        if len(sys.argv) >= 3:
            lyrics_path = sys.argv[2]
            try:
                with open(lyrics_path, 'r', encoding='utf-8') as f:
                    lyrics = f.read()
                print(f"   Loaded lyrics from {lyrics_path} ({len(lyrics)} chars)", file=sys.stderr)
            except Exception as e:
                print(f"   Could not load lyrics file: {e}", file=sys.stderr)
        
        # Optional: load Whisper word timestamps for ground-truth offset calculation
        if len(sys.argv) >= 4:
            whisper_path = sys.argv[3]
            try:
                with open(whisper_path, 'r', encoding='utf-8') as f:
                    whisper_data = json.load(f)
                    whisper_words = whisper_data.get('words', [])
                print(f"   Loaded Whisper timestamps from {whisper_path} ({len(whisper_words)} words)", file=sys.stderr)
            except Exception as e:
                print(f"   Could not load Whisper file: {e}", file=sys.stderr)
        
        try:
            result = analyze_audio(audio_path, lyrics, whisper_words)
            print(json.dumps(result, indent=2))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
            sys.exit(1)
