#!/usr/bin/env python3
"""
Demucs Audio Source Separation
Separates audio into 4 stems: vocals, drums, bass, other

Uses Demucs hybrid transformer model (htdemucs) for highest quality
Processing time: ~30-60 seconds per song on CPU, ~10-20s on GPU
"""

import sys
import json
import os
import tempfile
import numpy as np
import warnings

warnings.filterwarnings('ignore')

# Demucs dependencies
try:
    import torch
    import torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    DEMUCS_AVAILABLE = True
    print("   ✓ Demucs available", file=sys.stderr)
except ImportError as e:
    DEMUCS_AVAILABLE = False
    print(f"   ✗ Demucs not available: {e}", file=sys.stderr)

# Librosa for per-stem analysis
try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError as e:
    LIBROSA_AVAILABLE = False
    print(f"   ✗ Librosa not available: {e}", file=sys.stderr)


def separate_stems(audio_path: str, output_dir: str) -> dict:
    """
    Separate audio into 4 stems using Demucs htdemucs model.

    Args:
        audio_path: Path to input audio file
        output_dir: Directory to save stem files

    Returns:
        dict with 'success' (bool), 'stems' (dict of paths), and 'error' (str)
    """
    if not DEMUCS_AVAILABLE:
        return {
            'success': False,
            'error': 'Demucs not installed. Install with: pip install demucs'
        }

    try:
        print(f"🎵 Separating stems: {audio_path}", file=sys.stderr)

        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)

        # Load audio using soundfile (more compatible than torchaudio)
        print("   Loading audio...", file=sys.stderr)
        audio_data, sr = sf.read(audio_path, always_2d=True)

        # Convert to torch tensor: (samples, channels) -> (channels, samples)
        waveform = torch.from_numpy(audio_data.T).float()

        # Ensure stereo (Demucs expects 2 channels)
        if waveform.shape[0] == 1:
            waveform = waveform.repeat(2, 1)
        elif waveform.shape[0] > 2:
            waveform = waveform[:2, :]

        # Add batch dimension: (batch, channels, samples)
        waveform = waveform.unsqueeze(0)

        # Load htdemucs model (best quality)
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
        print("   Separating sources (this may take 30-60s)...", file=sys.stderr)
        with torch.no_grad():
            waveform = waveform.to(device)
            sources = apply_model(model, waveform, device=device, progress=True)

        # htdemucs outputs 4 sources: drums, bass, other, vocals (indices 0-3)
        # Model sources shape: (batch, sources, channels, samples)
        stem_names = ['drums', 'bass', 'other', 'vocals']
        stem_paths = {}

        for idx, name in enumerate(stem_names):
            # Extract stem (batch=0, source=idx, both channels)
            stem_audio = sources[0, idx, :, :].cpu().numpy()  # (channels, samples)

            # Save as WAV file
            stem_path = os.path.join(output_dir, f'{name}.wav')
            sf.write(stem_path, stem_audio.T, sr)  # Transpose to (samples, channels)

            stem_paths[name] = stem_path

            # Log stats
            duration = stem_audio.shape[1] / sr
            print(f"   ✓ {name}: {stem_path} ({duration:.1f}s)", file=sys.stderr)

        print(f"   ✅ Separation complete: {len(stem_paths)} stems saved", file=sys.stderr)

        return {
            'success': True,
            'stems': stem_paths,
            'sample_rate': sr,
            'duration': float(sources.shape[-1] / sr)
        }

    except Exception as e:
        print(f"   ❌ Separation failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {
            'success': False,
            'error': str(e)
        }


def analyze_stem(stem_path: str, stem_name: str) -> dict:
    """
    Analyze a single stem using Librosa.
    Extracts energy curves, spectral features, and beat alignment.

    Args:
        stem_path: Path to stem audio file
        stem_name: Name of the stem (vocals, drums, bass, other)

    Returns:
        dict with per-second energy, spectral features, and beat markers
    """
    if not LIBROSA_AVAILABLE:
        return {
            'success': False,
            'error': 'Librosa not installed. Install with: pip install librosa'
        }

    try:
        print(f"   Analyzing {stem_name} stem...", file=sys.stderr)

        # Load audio at 22050 Hz (standard for analysis)
        y, sr = librosa.load(stem_path, sr=22050)
        duration = librosa.get_duration(y=y, sr=sr)

        hop_length = 512

        # 1. Energy (RMS) over time
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        rms_times = librosa.frames_to_time(range(len(rms)), sr=sr, hop_length=hop_length)
        rms_normalized = (rms / (rms.max() + 1e-10) * 100).tolist()

        # 2. Spectral centroid (brightness)
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]

        # 3. Spectral bandwidth (fullness)
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr, hop_length=hop_length)[0]

        # 4. Zero crossing rate (percussiveness)
        zcr = librosa.feature.zero_crossing_rate(y, hop_length=hop_length)[0]

        # 5. Onset detection (transients/attacks)
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, hop_length=hop_length, units='frames')
        onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length).tolist()

        # 6. Beat tracking (for rhythm stems like drums/bass)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        if isinstance(tempo, np.ndarray):
            tempo = float(tempo[0]) if len(tempo) > 0 else 0.0
        else:
            tempo = float(tempo)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

        # 7. Per-second aggregated features (for correlation with retention)
        per_second_features = []
        for t in range(int(duration) + 1):
            # Find indices in this second
            start_idx = int(t * sr / hop_length)
            end_idx = int((t + 1) * sr / hop_length)
            end_idx = min(end_idx, len(rms))

            if start_idx < len(rms):
                per_second_features.append({
                    'time': t,
                    'energy': float(np.mean(rms[start_idx:end_idx])),
                    'brightness': float(np.mean(spectral_centroid[start_idx:end_idx])),
                    'bandwidth': float(np.mean(spectral_bandwidth[start_idx:end_idx])),
                    'zcr': float(np.mean(zcr[start_idx:end_idx]))
                })

        # 8. Overall statistics
        avg_energy = float(np.mean(rms))
        peak_energy = float(np.max(rms))
        energy_variance = float(np.var(rms))
        avg_brightness = float(np.mean(spectral_centroid))
        avg_bandwidth = float(np.mean(spectral_bandwidth))

        print(f"   ✓ {stem_name}: {len(onset_times)} onsets, {len(beat_times)} beats, {tempo:.1f} BPM", file=sys.stderr)

        return {
            'success': True,
            'stem_name': stem_name,
            'duration': round(duration, 2),
            'tempo': round(tempo, 1),
            'beat_count': len(beat_times),
            'beats': [round(t, 3) for t in beat_times[:100]],  # Limit to first 100
            'onset_count': len(onset_times),
            'onsets': [round(t, 3) for t in onset_times[:100]],
            'per_second_features': per_second_features,
            'overall': {
                'avg_energy': round(avg_energy, 6),
                'peak_energy': round(peak_energy, 6),
                'energy_variance': round(energy_variance, 6),
                'avg_brightness': round(avg_brightness, 1),
                'avg_bandwidth': round(avg_bandwidth, 1)
            }
        }

    except Exception as e:
        print(f"   ❌ Analysis failed for {stem_name}: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {
            'success': False,
            'error': str(e)
        }


def separate_and_analyze(audio_path: str, output_dir: str = None) -> dict:
    """
    Full pipeline: separate stems and analyze full track + all stems together.

    UNIFIED ANALYSIS APPROACH:
    1. Separate audio into stems with Demucs
    2. Analyze ORIGINAL audio + all stems TOGETHER in one pass
    3. Use identical hop_length and frame boundaries for perfect temporal alignment
    4. All per-second features have matching timestamps for retention correlation

    Args:
        audio_path: Path to input audio file
        output_dir: Directory to save stems (default: /tmp/unity-scratch/stems/)

    Returns:
        dict with 'success', 'stems' (paths), 'full_track' (analysis), and 'stem_analysis' (per-stem features)
    """
    if output_dir is None:
        output_dir = '/tmp/unity-scratch/stems'

    # Step 1: Separate stems
    print("🔧 UNIFIED ANALYSIS: Separating stems first...", file=sys.stderr)
    separation_result = separate_stems(audio_path, output_dir)

    if not separation_result['success']:
        return separation_result

    # Step 2: Analyze FULL TRACK + ALL STEMS together with identical parameters
    print("🔧 UNIFIED ANALYSIS: Analyzing full track + stems with identical parameters...", file=sys.stderr)

    # Analyze full track first (this becomes the reference for temporal alignment)
    full_track_analysis = analyze_stem(audio_path, 'full_track')

    if not full_track_analysis['success']:
        return {
            'success': False,
            'error': f"Full track analysis failed: {full_track_analysis.get('error', 'unknown')}"
        }

    # Analyze each stem with same parameters (ensured by analyze_stem using consistent hop_length)
    stem_analysis = {}
    for stem_name, stem_path in separation_result['stems'].items():
        analysis = analyze_stem(stem_path, stem_name)
        if analysis['success']:
            stem_analysis[stem_name] = analysis
        else:
            print(f"   ⚠️ Skipping {stem_name} analysis: {analysis.get('error', 'unknown error')}", file=sys.stderr)

    print("✅ UNIFIED ANALYSIS: Complete! All tracks analyzed with matching timestamps.", file=sys.stderr)

    return {
        'success': True,
        'stems': separation_result['stems'],
        'sample_rate': separation_result['sample_rate'],
        'duration': separation_result['duration'],
        'full_track': full_track_analysis,  # NEW: Full track analysis for comparison
        'analysis': stem_analysis
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: demucs_separator.py <audio_file_path> [output_dir]'
        }))
        sys.exit(1)

    audio_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) >= 3 else None

    if not os.path.exists(audio_path):
        print(json.dumps({
            'success': False,
            'error': f'Audio file not found: {audio_path}'
        }))
        sys.exit(1)

    try:
        result = separate_and_analyze(audio_path, output_dir)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))
        sys.exit(1)
