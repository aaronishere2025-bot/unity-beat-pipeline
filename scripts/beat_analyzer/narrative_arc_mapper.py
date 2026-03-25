"""
Narrative Arc Mapper for Full-Track Video Generation

Maps musical structure to visual narrative arc for cohesive prompt generation.
"""

import numpy as np
import librosa
from typing import List, Dict, Any, Tuple, Optional


def detect_energy_peaks(energy_curve: List[Tuple[float, float]], threshold: float = 0.7) -> List[float]:
    """
    Identify significant energy peaks (action moments).

    Args:
        energy_curve: List of (time, energy) tuples
        threshold: Minimum energy level to be considered a peak (0-1)

    Returns:
        List of timestamps where energy peaks occur
    """
    if not energy_curve:
        return []

    peaks = []
    times = [t for t, _ in energy_curve]
    energies = [e for _, e in energy_curve]

    # Find local maxima above threshold
    for i in range(1, len(energies) - 1):
        if energies[i] > threshold:
            # Check if it's a local maximum
            if energies[i] > energies[i-1] and energies[i] > energies[i+1]:
                peaks.append(times[i])

    return peaks


def detect_energy_valleys(energy_curve: List[Tuple[float, float]], threshold: float = 0.3) -> List[float]:
    """
    Identify energy valleys (breathing room, quiet moments).

    Args:
        energy_curve: List of (time, energy) tuples
        threshold: Maximum energy level to be considered a valley (0-1)

    Returns:
        List of timestamps where energy valleys occur
    """
    if not energy_curve:
        return []

    valleys = []
    times = [t for t, _ in energy_curve]
    energies = [e for _, e in energy_curve]

    # Find local minima below threshold
    for i in range(1, len(energies) - 1):
        if energies[i] < threshold:
            # Check if it's a local minimum
            if energies[i] < energies[i-1] and energies[i] < energies[i+1]:
                valleys.append(times[i])

    return valleys


def compute_mood_arc(
    segments: List[Dict[str, Any]],
    energy_curve: List[Tuple[float, float]],
    spectral_centroid_mean: float,
    duration: float
) -> List[str]:
    """
    Compute overall mood progression throughout the track.

    Maps musical characteristics to narrative moods:
    - "establishing" - intro, low energy, setting scene
    - "building" - verse, rising energy
    - "peak" - chorus/drop, high energy
    - "sustain" - maintaining energy
    - "tension" - pre-drop, anticipation
    - "release" - post-drop, resolution
    - "resolve" - outro, closure

    Args:
        segments: List of segment dicts with 'type', 'start', 'end', 'energy'
        energy_curve: List of (time, energy) tuples
        spectral_centroid_mean: Average spectral brightness
        duration: Total track duration

    Returns:
        List of mood descriptors in chronological order
    """
    mood_arc = []

    for seg in segments:
        seg_type = seg.get('type', 'verse')
        seg_energy = seg.get('energy', 0.5)

        # Intro = establishing
        if seg_type == 'intro':
            mood_arc.append('establishing')

        # Verse = building (unless very low energy)
        elif seg_type == 'verse':
            if seg_energy < 0.3:
                mood_arc.append('tension')
            else:
                mood_arc.append('building')

        # Chorus = peak
        elif seg_type == 'chorus':
            mood_arc.append('peak')

        # Drop = peak
        elif seg_type == 'drop':
            mood_arc.append('peak')

        # Bridge = tension or sustain
        elif seg_type == 'bridge':
            if seg_energy > 0.6:
                mood_arc.append('sustain')
            else:
                mood_arc.append('tension')

        # Outro = resolve
        elif seg_type == 'outro':
            mood_arc.append('resolve')

        # Break = release
        elif seg_type == 'break':
            mood_arc.append('release')

        else:
            # Default fallback based on energy
            if seg_energy < 0.3:
                mood_arc.append('tension')
            elif seg_energy < 0.6:
                mood_arc.append('building')
            else:
                mood_arc.append('peak')

    return mood_arc


def detect_tempo_changes(y: np.ndarray, sr: int, hop_length: int = 512) -> List[Dict[str, Any]]:
    """
    Detect tempo changes throughout the track.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length for tempo estimation

    Returns:
        List of dicts with 'timestamp' and 'bpm' for tempo changes
    """
    # Compute tempogram
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr, hop_length=hop_length)

    # Get tempo at each frame
    tempo_times = librosa.frames_to_time(np.arange(tempogram.shape[1]), sr=sr, hop_length=hop_length)

    # Find tempo changes (when tempo shifts by more than 5 BPM)
    tempo_changes = []
    window_size = 20  # Number of frames to average over

    for i in range(window_size, len(tempo_times) - window_size, window_size):
        # Get dominant tempo in this window
        window_tempogram = tempogram[:, i-window_size:i+window_size]
        dominant_tempo_bin = np.argmax(np.sum(window_tempogram, axis=1))

        # Convert bin to BPM (librosa tempogram default range)
        bpm = librosa.tempo_frequencies(tempogram.shape[0], hop_length=hop_length, sr=sr)[dominant_tempo_bin]

        # Check if significantly different from previous
        if tempo_changes:
            last_bpm = tempo_changes[-1]['bpm']
            if abs(bpm - last_bpm) > 5:
                tempo_changes.append({
                    'timestamp': float(tempo_times[i]),
                    'bpm': float(bpm)
                })
        else:
            tempo_changes.append({
                'timestamp': float(tempo_times[i]),
                'bpm': float(bpm)
            })

    return tempo_changes if len(tempo_changes) > 1 else []


def compute_spectral_mood_curve(y: np.ndarray, sr: int, hop_length: int = 512) -> List[Tuple[float, str]]:
    """
    Compute spectral brightness over time and map to mood descriptors.

    Low centroid = dark/moody/tense
    High centroid = bright/energetic

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length for spectral analysis

    Returns:
        List of (timestamp, mood) tuples
    """
    # Compute spectral centroid
    cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    times = librosa.frames_to_time(np.arange(len(cent)), sr=sr, hop_length=hop_length)

    # Normalize centroid to 0-1 range for easier thresholding
    cent_normalized = (cent - cent.min()) / (cent.max() - cent.min() + 1e-8)

    mood_curve = []
    for t, brightness in zip(times, cent_normalized):
        if brightness < 0.3:
            mood = 'dark'
        elif brightness < 0.5:
            mood = 'moody'
        elif brightness < 0.7:
            mood = 'balanced'
        else:
            mood = 'bright'

        mood_curve.append((float(t), mood))

    return mood_curve


def detect_downbeats(y: np.ndarray, sr: int, beats: np.ndarray) -> List[float]:
    """
    Detect downbeats (strong beats) from all beats.

    Args:
        y: Audio time series
        sr: Sample rate
        beats: Array of beat timestamps

    Returns:
        List of downbeat timestamps
    """
    if len(beats) == 0:
        return []

    # Simple heuristic: every 4th beat is likely a downbeat (4/4 time)
    # For more accuracy, could analyze beat strength
    downbeats = beats[::4].tolist()

    return downbeats


def build_visual_pacing_guide(
    segments: List[Dict[str, Any]],
    energy_curve: List[Tuple[float, float]],
    mood_arc: List[str],
    duration: float
) -> Dict[str, Any]:
    """
    Generate recommendations for visual pacing based on musical structure.

    Args:
        segments: List of musical segments
        energy_curve: Energy over time
        mood_arc: Mood progression
        duration: Total duration

    Returns:
        Dict with camera evolution, intensity progression, transition timing
    """
    # Determine camera evolution based on energy arc
    avg_energy = np.mean([e for _, e in energy_curve])

    if avg_energy < 0.4:
        camera_evolution = "static → slow push → static"
        intensity_evolution = "calm → subtle tension → calm"
    elif avg_energy < 0.6:
        camera_evolution = "slow push → gentle movement → slow pull"
        intensity_evolution = "building → sustain → release"
    else:
        camera_evolution = "static → slow push → dynamic movement → slow pull → static"
        intensity_evolution = "calm → building → intense → reflective → closure"

    # Identify major transition points (section boundaries)
    major_transitions = []
    for i in range(len(segments) - 1):
        curr_seg = segments[i]
        next_seg = segments[i + 1]

        # Transition is "major" if mood or energy changes significantly
        energy_diff = abs(curr_seg.get('energy', 0.5) - next_seg.get('energy', 0.5))

        transition_type = 'gentle' if energy_diff < 0.3 else 'dramatic'

        major_transitions.append({
            'timestamp': float(curr_seg.get('end', 0)),
            'type': transition_type,
            'from_section': curr_seg.get('type', 'unknown'),
            'to_section': next_seg.get('type', 'unknown'),
            'energy_delta': float(energy_diff)
        })

    return {
        'camera_evolution': camera_evolution,
        'intensity_evolution': intensity_evolution,
        'major_transitions': major_transitions,
        'recommended_clip_duration': _recommend_clip_duration(segments, energy_curve)
    }


def _recommend_clip_duration(segments: List[Dict[str, Any]], energy_curve: List[Tuple[float, float]]) -> str:
    """
    Recommend clip duration based on energy and pacing.

    High energy = shorter clips (3-4s)
    Medium energy = standard clips (5s)
    Low energy = longer clips (6-7s)
    """
    avg_energy = np.mean([e for _, e in energy_curve])

    if avg_energy > 0.7:
        return "3-4 seconds (high energy, fast cuts)"
    elif avg_energy > 0.4:
        return "5 seconds (standard pacing)"
    else:
        return "6-7 seconds (slow, contemplative)"


def generate_cohesion_hints(
    segments: List[Dict[str, Any]],
    mood_arc: List[str],
    spectral_centroid_mean: float,
    key: Optional[str],
    duration: float
) -> Dict[str, Any]:
    """
    Generate hints for maintaining visual cohesion across clips.

    Args:
        segments: Musical segments
        mood_arc: Mood progression
        spectral_centroid_mean: Average spectral brightness
        key: Musical key (e.g., "G minor")
        duration: Total duration

    Returns:
        Dict with recurring motifs suggestions, color palette, subject consistency
    """
    # Color palette based on key and brightness
    if key and 'minor' in key.lower():
        base_palette = ['muted grays', 'deep blues', 'shadowy blacks']
    elif key and 'major' in key.lower():
        base_palette = ['warm golds', 'bright whites', 'vibrant colors']
    else:
        base_palette = ['balanced tones', 'natural colors']

    # Adjust for spectral brightness
    if spectral_centroid_mean > 3000:
        base_palette.append('high contrast lighting')
    elif spectral_centroid_mean < 1500:
        base_palette.append('low-key lighting')

    # Evolve palette based on mood arc
    color_palette_arc = []
    for mood in mood_arc:
        if mood in ['establishing', 'resolve']:
            color_palette_arc.append(base_palette[0])
        elif mood in ['building', 'tension']:
            color_palette_arc.append(base_palette[1] if len(base_palette) > 1 else base_palette[0])
        elif mood in ['peak', 'sustain']:
            color_palette_arc.append('intense reds' if 'minor' in (key or '') else 'vibrant golds')
        else:
            color_palette_arc.append(base_palette[0])

    # Subject consistency recommendations
    if duration < 60:
        subject_consistency = "maintain same character/setting throughout entire video"
    elif duration < 120:
        subject_consistency = "same character for first 60s, location shift allowed at 60s"
    else:
        subject_consistency = "same character within each act, location can change between acts"

    return {
        'recurring_motifs': _suggest_recurring_motifs(segments, mood_arc),
        'color_palette_arc': color_palette_arc,
        'subject_consistency': subject_consistency,
        'visual_continuity_priority': 'high' if duration < 60 else 'medium'
    }


def _suggest_recurring_motifs(segments: List[Dict[str, Any]], mood_arc: List[str]) -> List[str]:
    """
    Suggest visual motifs that should recur throughout the video.
    """
    motifs = []

    # Based on mood progression
    if 'peak' in mood_arc:
        motifs.append('heroic close-up')
    if 'tension' in mood_arc:
        motifs.append('symbolic object or setting')
    if mood_arc.count('building') >= 2:
        motifs.append('environment establishing shot')

    # Generic suggestions
    motifs.append('character signature item or costume detail')

    return motifs


def build_narrative_arc(
    y: np.ndarray,
    sr: int,
    segments: List[Dict[str, Any]],
    energy_curve: List[Tuple[float, float]],
    beats: List[float],
    spectral_centroid_mean: float,
    key: Optional[str],
    duration: float,
    bpm: float
) -> Dict[str, Any]:
    """
    Main function: Build complete narrative arc data for cohesive video generation.

    Args:
        y: Audio time series
        sr: Sample rate
        segments: Detected musical segments
        energy_curve: Energy over time
        beats: Beat timestamps
        spectral_centroid_mean: Average spectral brightness
        key: Musical key
        duration: Total duration
        bpm: Tempo

    Returns:
        Complete narrative arc structure with all cohesion data
    """
    # Compute mood arc
    mood_arc = compute_mood_arc(segments, energy_curve, spectral_centroid_mean, duration)

    # Detect energy peaks and valleys
    energy_peaks = detect_energy_peaks(energy_curve, threshold=0.7)
    energy_valleys = detect_energy_valleys(energy_curve, threshold=0.3)

    # Detect downbeats for precise cut points
    beats_array = np.array(beats)
    downbeats = detect_downbeats(y, sr, beats_array)

    # Compute spectral mood curve
    spectral_mood_curve = compute_spectral_mood_curve(y, sr)

    # Detect tempo changes
    tempo_changes = detect_tempo_changes(y, sr)

    # Build visual pacing guide
    visual_pacing = build_visual_pacing_guide(segments, energy_curve, mood_arc, duration)

    # Generate cohesion hints
    cohesion_hints = generate_cohesion_hints(
        segments, mood_arc, spectral_centroid_mean, key, duration
    )

    return {
        'mood_arc': mood_arc,
        'energy_peaks': energy_peaks,
        'energy_valleys': energy_valleys,
        'downbeats': downbeats,
        'spectral_mood_curve': spectral_mood_curve,
        'tempo_changes': tempo_changes,
        'visual_pacing': visual_pacing,
        'cohesion_hints': cohesion_hints
    }
