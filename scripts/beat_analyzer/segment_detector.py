"""
Segment Detector Module

Detects musical sections (intro, verse, chorus, bridge, outro, drops) using
self-similarity analysis and energy patterns.
"""

import numpy as np
import librosa
from typing import List, Tuple
from .schema import Segment, SegmentType


def detect_segments(
    y: np.ndarray,
    sr: int,
    energy_curve: List[Tuple[float, float]],
    beat_times: np.ndarray,
    bpm: float
) -> List[Segment]:
    """
    Detect musical segments using self-similarity matrix and energy analysis.

    Args:
        y: Audio time series
        sr: Sample rate
        energy_curve: List of (timestamp, energy) tuples
        beat_times: Array of beat timestamps
        bpm: Detected tempo in BPM

    Returns:
        List of Segment objects
    """
    duration = len(y) / sr

    # Compute chromagram for harmonic analysis
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

    # Compute self-similarity matrix using recurrence
    # This identifies repeated sections (verses, choruses)
    rec_matrix = librosa.segment.recurrence_matrix(
        chroma,
        mode='affinity',
        metric='cosine',
        width=3
    )

    # Apply diagonal smoothing to emphasize structure
    rec_smoothed = librosa.segment.path_enhance(rec_matrix, 21)

    # Detect segment boundaries using Laplacian segmentation
    boundaries_frames = librosa.segment.agglomerative(chroma, k=8)  # Target ~8 segments

    # Convert frame indices to time
    boundaries_times = librosa.frames_to_time(boundaries_frames, sr=sr)

    # Ensure boundaries include start and end
    if boundaries_times[0] > 0:
        boundaries_times = np.insert(boundaries_times, 0, 0.0)
    if boundaries_times[-1] < duration:
        boundaries_times = np.append(boundaries_times, duration)

    # Create segments from boundaries
    segments = []
    for i in range(len(boundaries_times) - 1):
        start = float(boundaries_times[i])
        end = float(boundaries_times[i + 1])

        # Compute average energy for this segment
        segment_energy = _compute_segment_energy(energy_curve, start, end)

        # Classify segment type based on position and energy
        segment_type, label = _classify_segment(
            i,
            len(boundaries_times) - 1,
            segment_energy,
            start,
            end,
            duration
        )

        segments.append(Segment(
            type=segment_type,
            start=start,
            end=end,
            energy=segment_energy,
            label=label
        ))

    return segments


def _compute_segment_energy(
    energy_curve: List[Tuple[float, float]],
    start: float,
    end: float
) -> float:
    """
    Compute average energy for a time segment.

    Args:
        energy_curve: List of (timestamp, energy) tuples
        start: Start time in seconds
        end: End time in seconds

    Returns:
        Average energy (0-1)
    """
    segment_energies = [
        e for t, e in energy_curve
        if start <= t <= end
    ]

    if segment_energies:
        return float(np.mean(segment_energies))
    return 0.5  # Default mid-level energy


def _classify_segment(
    index: int,
    total_segments: int,
    energy: float,
    start: float,
    end: float,
    duration: float
) -> Tuple[SegmentType, str]:
    """
    Classify a segment based on its position, energy, and characteristics.

    Heuristics:
    - First segment is usually intro (low energy, < 15s)
    - Last segment is usually outro (low energy)
    - High energy segments in middle are choruses
    - Medium energy segments are verses
    - Very high energy segments might be drops
    - Low energy segments in middle might be bridges

    Args:
        index: Segment index (0-based)
        total_segments: Total number of segments
        energy: Segment energy (0-1)
        start: Start time
        end: End time
        duration: Total track duration

    Returns:
        Tuple of (segment_type, label)
    """
    segment_duration = end - start
    position_ratio = start / duration  # 0 to 1

    # Intro detection: first segment, low-medium energy, short duration
    if index == 0 and segment_duration < 15 and energy < 0.6:
        return "intro", None

    # Outro detection: last segment, low energy
    if index == total_segments - 1 and energy < 0.5:
        return "outro", None

    # Drop detection: very high energy, sudden spike
    if energy > 0.85:
        return "drop", None

    # Chorus detection: high energy (0.7-0.85)
    if energy > 0.7:
        # Count how many choruses we've seen
        chorus_number = (index // 2) + 1  # Rough estimation
        return "chorus", f"chorus_{chorus_number}"

    # Bridge detection: low energy in middle of song
    if 0.4 < position_ratio < 0.7 and energy < 0.45:
        return "bridge", None

    # Verse detection: medium energy
    if energy >= 0.45:
        # Count verses
        verse_number = ((index + 1) // 2)
        return "verse", f"verse_{verse_number}"

    # Break detection: very low energy, short duration
    if energy < 0.35 and segment_duration < 8:
        return "break", None

    # Default to verse if unsure
    verse_number = (index // 2) + 1
    return "verse", f"verse_{verse_number}"


def refine_segments_with_repetition(
    segments: List[Segment],
    chroma: np.ndarray,
    sr: int
) -> List[Segment]:
    """
    Refine segment classifications by identifying repeated sections.

    Repeated sections with similar harmonic content are likely choruses.

    Args:
        segments: Initial segment list
        chroma: Chromagram of the audio
        sr: Sample rate

    Returns:
        Refined segment list
    """
    # For each segment, compute its average chroma vector
    segment_chromas = []

    for seg in segments:
        start_frame = librosa.time_to_frames(seg.start, sr=sr)
        end_frame = librosa.time_to_frames(seg.end, sr=sr)

        # Average chroma over segment
        seg_chroma = np.mean(chroma[:, start_frame:end_frame], axis=1)
        segment_chromas.append(seg_chroma)

    # Find similar segments (potential chorus repetitions)
    chorus_candidates = []
    for i, seg in enumerate(segments):
        if seg.type in ["chorus", "verse"] and seg.energy > 0.65:
            # Compare with all other segments
            for j, other_seg in enumerate(segments):
                if i != j and other_seg.energy > 0.65:
                    # Compute cosine similarity
                    similarity = np.dot(segment_chromas[i], segment_chromas[j]) / (
                        np.linalg.norm(segment_chromas[i]) * np.linalg.norm(segment_chromas[j]) + 1e-8
                    )

                    # If very similar (> 0.85), likely both are choruses
                    if similarity > 0.85:
                        chorus_candidates.extend([i, j])

    # Update segments that are identified as choruses
    chorus_candidates = list(set(chorus_candidates))
    chorus_count = 0

    for idx in sorted(chorus_candidates):
        if segments[idx].energy > 0.65:
            chorus_count += 1
            segments[idx] = Segment(
                type="chorus",
                start=segments[idx].start,
                end=segments[idx].end,
                energy=segments[idx].energy,
                label=f"chorus_{chorus_count}"
            )

    return segments


def get_transition_candidates(segments: List[Segment]) -> List[float]:
    """
    Extract transition candidates from segment boundaries.

    These are good timestamps for scene changes in video generation.

    Args:
        segments: List of segments

    Returns:
        List of transition timestamps
    """
    transitions = []

    for i, segment in enumerate(segments):
        # Add segment start as transition point
        transitions.append(segment.start)

        # Add segment end if it's a significant energy change
        if i < len(segments) - 1:
            next_segment = segments[i + 1]
            energy_diff = abs(next_segment.energy - segment.energy)

            # If energy changes significantly, this is a good transition point
            if energy_diff > 0.2:
                transitions.append(segment.end)

    # Always include the last segment boundary
    if segments:
        transitions.append(segments[-1].end)

    # Remove duplicates and sort
    return sorted(list(set(transitions)))
