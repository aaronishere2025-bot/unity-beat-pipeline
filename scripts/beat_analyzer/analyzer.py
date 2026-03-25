"""
Core Audio Analyzer

Main analysis engine that coordinates all analysis components.
"""

import os
import sys
import numpy as np
import librosa
import warnings
from pathlib import Path
from typing import Optional

from .schema import AnalysisResult
from .energy_mapper import (
    compute_energy_curve,
    identify_drop_points,
    identify_energy_peaks,
    compute_energy_trend
)
from .segment_detector import (
    detect_segments,
    refine_segments_with_repetition,
    get_transition_candidates
)
from .narrative_arc_mapper import build_narrative_arc

warnings.filterwarnings('ignore')


def analyze_track(
    audio_path: str,
    sample_interval: float = 0.5,
    verbose: bool = False
) -> AnalysisResult:
    """
    Analyze a Suno-generated audio track and extract structured musical data.

    Args:
        audio_path: Path to audio file (.mp3, .wav, .flac)
        sample_interval: Energy curve sampling interval in seconds (default: 0.5)
        verbose: Print progress messages to stderr

    Returns:
        AnalysisResult object with complete analysis

    Raises:
        FileNotFoundError: If audio file doesn't exist
        ValueError: If audio file format is not supported
    """
    # Validate file exists
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    filename = os.path.basename(audio_path)

    if verbose:
        print(f"🎵 Analyzing: {filename}", file=sys.stderr)

    # Load audio file
    if verbose:
        print("   Loading audio...", file=sys.stderr)

    try:
        y, sr = librosa.load(audio_path, sr=22050, mono=True)
    except Exception as e:
        raise ValueError(f"Failed to load audio file: {e}")

    duration = float(len(y) / sr)

    if verbose:
        print(f"   Duration: {duration:.2f}s", file=sys.stderr)

    # 1. Extract BPM (tempo)
    if verbose:
        print("   Detecting tempo (BPM)...", file=sys.stderr)

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo)

    # Get beat timestamps
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    beats = [float(t) for t in beat_times]

    if verbose:
        print(f"   BPM: {bpm:.1f} ({len(beats)} beats)", file=sys.stderr)

    # 2. Detect musical key
    if verbose:
        print("   Detecting key...", file=sys.stderr)

    key = _detect_key(y, sr)

    if verbose and key:
        print(f"   Key: {key}", file=sys.stderr)

    # 3. Compute energy curve
    if verbose:
        print("   Computing energy curve...", file=sys.stderr)

    energy_curve = compute_energy_curve(y, sr, sample_interval=sample_interval)

    # 4. Detect onsets for drop point identification
    if verbose:
        print("   Detecting onsets...", file=sys.stderr)

    onset_frames = librosa.onset.onset_detect(
        y=y,
        sr=sr,
        units='frames',
        backtrack=True
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)

    # Get onset strengths
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_strengths = onset_env[onset_frames]

    # 5. Identify drop points
    if verbose:
        print("   Identifying drop points...", file=sys.stderr)

    drop_points = identify_drop_points(
        energy_curve,
        onset_times,
        onset_strengths,
        threshold=0.7
    )

    if verbose:
        print(f"   Found {len(drop_points)} drop points", file=sys.stderr)

    # 6. Detect segments (verse, chorus, etc.)
    if verbose:
        print("   Detecting segments...", file=sys.stderr)

    # Compute chromagram for segment detection
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

    segments = detect_segments(y, sr, energy_curve, beat_times, bpm)

    # Refine segments by identifying repetitions
    segments = refine_segments_with_repetition(segments, chroma, sr)

    if verbose:
        print(f"   Found {len(segments)} segments:", file=sys.stderr)
        for seg in segments:
            label_str = f" ({seg.label})" if seg.label else ""
            print(
                f"      {seg.type:8s} {seg.start:6.1f}s - {seg.end:6.1f}s "
                f"(energy: {seg.energy:.2f}){label_str}",
                file=sys.stderr
            )

    # 7. Get transition candidates
    transition_candidates = get_transition_candidates(segments)

    # 8. Compute additional metadata
    if verbose:
        print("   Computing spectral features...", file=sys.stderr)

    spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    onset_count = len(onset_frames)

    metadata = {
        "spectral_centroid_mean": float(np.mean(spectral_centroid)),
        "spectral_centroid_std": float(np.std(spectral_centroid)),
        "onset_count": onset_count,
        "energy_trend": compute_energy_trend(energy_curve),
        "sample_rate": sr
    }

    if verbose:
        print(f"   Spectral centroid: {metadata['spectral_centroid_mean']:.1f} Hz", file=sys.stderr)
        print(f"   Energy trend: {metadata['energy_trend']}", file=sys.stderr)

    # 9. Build narrative arc for cohesive video generation
    if verbose:
        print("   Building narrative arc...", file=sys.stderr)

    narrative_arc = build_narrative_arc(
        y=y,
        sr=sr,
        segments=[seg.model_dump() for seg in segments],
        energy_curve=energy_curve,
        beats=beats,
        spectral_centroid_mean=metadata['spectral_centroid_mean'],
        key=key,
        duration=duration,
        bpm=bpm
    )

    # Add narrative arc to metadata
    metadata['narrative_arc'] = narrative_arc

    if verbose:
        print(f"   Mood arc: {' → '.join(narrative_arc['mood_arc'])}", file=sys.stderr)
        print(f"   Energy peaks: {len(narrative_arc['energy_peaks'])} detected", file=sys.stderr)
        print(f"   Downbeats: {len(narrative_arc['downbeats'])} detected", file=sys.stderr)
        print("✅ Analysis complete!", file=sys.stderr)

    # Build result
    result = AnalysisResult(
        filename=filename,
        duration=duration,
        bpm=bpm,
        key=key,
        segments=segments,
        beats=beats,
        energy_curve=energy_curve,
        drop_points=drop_points,
        transition_candidates=transition_candidates,
        metadata=metadata
    )

    return result


def _detect_key(y: np.ndarray, sr: int) -> Optional[str]:
    """
    Detect musical key using chroma analysis.

    Args:
        y: Audio time series
        sr: Sample rate

    Returns:
        Key string (e.g., "C major", "G minor") or None if detection fails
    """
    try:
        # Compute chromagram
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

        # Average over time to get overall pitch class distribution
        chroma_avg = np.mean(chroma, axis=1)

        # Find dominant pitch class
        dominant_pitch_idx = np.argmax(chroma_avg)

        # Map to note names
        pitch_classes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        root = pitch_classes[dominant_pitch_idx]

        # Simple major/minor detection based on third interval
        # Major has strong major third (4 semitones), minor has strong minor third (3 semitones)
        major_third_idx = (dominant_pitch_idx + 4) % 12
        minor_third_idx = (dominant_pitch_idx + 3) % 12

        major_strength = chroma_avg[major_third_idx]
        minor_strength = chroma_avg[minor_third_idx]

        mode = "major" if major_strength > minor_strength else "minor"

        return f"{root} {mode}"

    except Exception:
        # Key detection failed, return None
        return None


def analyze_track_simple(
    audio_path: str,
    verbose: bool = False
) -> dict:
    """
    Simplified analysis that returns raw dict (for JSON serialization).

    Args:
        audio_path: Path to audio file
        verbose: Print progress messages

    Returns:
        Dict representation of AnalysisResult
    """
    result = analyze_track(audio_path, verbose=verbose)
    return result.model_dump()
