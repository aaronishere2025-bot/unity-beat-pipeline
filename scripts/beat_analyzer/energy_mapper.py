"""
Energy Mapper Module

Generates energy curves and identifies peak/low energy moments for visual synchronization.
"""

import numpy as np
import librosa
from typing import List, Tuple
from .schema import DropPoint


def compute_energy_curve(
    y: np.ndarray,
    sr: int,
    hop_length: int = 512,
    sample_interval: float = 0.5
) -> List[Tuple[float, float]]:
    """
    Generate energy curve sampled at regular intervals.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length for STFT
        sample_interval: Sampling interval in seconds (default: 0.5s)

    Returns:
        List of (timestamp, energy) tuples, energy normalized to 0-1
    """
    # Compute RMS energy
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]

    # Convert frame indices to time
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)

    # Normalize energy to 0-1 range
    if rms.max() > 0:
        rms_normalized = rms / rms.max()
    else:
        rms_normalized = rms

    # Sample at specified interval
    duration = len(y) / sr
    sample_times = np.arange(0, duration, sample_interval)

    # Interpolate energy values at sample times
    energy_values = np.interp(sample_times, times, rms_normalized)

    # Return as list of tuples
    return [(float(t), float(e)) for t, e in zip(sample_times, energy_values)]


def identify_drop_points(
    energy_curve: List[Tuple[float, float]],
    onset_times: np.ndarray,
    onset_strengths: np.ndarray,
    threshold: float = 0.7
) -> List[DropPoint]:
    """
    Identify dramatic energy spikes (drops) in the audio.

    A "drop" is detected when:
    1. There's a strong onset (sudden energy increase)
    2. The energy level is high relative to the overall track
    3. There's a significant increase from the previous moment

    Args:
        energy_curve: List of (timestamp, energy) tuples
        onset_times: Array of onset timestamps from librosa
        onset_strengths: Array of onset strength values
        threshold: Minimum onset strength to consider (0-1)

    Returns:
        List of DropPoint objects
    """
    if len(onset_strengths) == 0:
        return []

    # Normalize onset strengths to 0-1
    max_strength = onset_strengths.max()
    if max_strength > 0:
        normalized_strengths = onset_strengths / max_strength
    else:
        normalized_strengths = onset_strengths

    # Find strong onsets
    strong_onset_indices = np.where(normalized_strengths >= threshold)[0]

    drop_points = []

    for idx in strong_onset_indices:
        timestamp = float(onset_times[idx])
        intensity = float(normalized_strengths[idx])

        # Find corresponding energy level from energy curve
        # Get energy at this timestamp
        for i, (t, e) in enumerate(energy_curve):
            if t >= timestamp:
                # Check if this is a significant increase
                if i > 0:
                    prev_energy = energy_curve[i - 1][1]
                    energy_jump = e - prev_energy

                    # Only consider it a drop if energy increases significantly
                    if energy_jump > 0.15 and e > 0.5:
                        drop_points.append(
                            DropPoint(timestamp=timestamp, intensity=intensity)
                        )
                break

    # Remove drops that are too close together (within 4 seconds)
    filtered_drops = []
    for drop in drop_points:
        if not filtered_drops or (drop.timestamp - filtered_drops[-1].timestamp) >= 4.0:
            filtered_drops.append(drop)

    return filtered_drops


def identify_energy_peaks(
    energy_curve: List[Tuple[float, float]],
    prominence: float = 0.15
) -> List[float]:
    """
    Identify peak energy moments in the track.

    Args:
        energy_curve: List of (timestamp, energy) tuples
        prominence: Minimum prominence of peaks (0-1)

    Returns:
        List of timestamps where energy peaks occur
    """
    if len(energy_curve) < 3:
        return []

    # Extract energy values
    times = np.array([t for t, _ in energy_curve])
    energies = np.array([e for _, e in energy_curve])

    # Find peaks in energy
    from scipy.signal import find_peaks

    peaks, properties = find_peaks(energies, prominence=prominence)

    return [float(times[i]) for i in peaks]


def identify_low_energy_moments(
    energy_curve: List[Tuple[float, float]],
    threshold: float = 0.3
) -> List[Tuple[float, float]]:
    """
    Identify sustained low energy moments (good for slower visuals).

    Args:
        energy_curve: List of (timestamp, energy) tuples
        threshold: Maximum energy level to consider "low" (0-1)

    Returns:
        List of (start, end) tuples for low energy sections
    """
    low_energy_sections = []
    in_low_section = False
    section_start = 0.0

    for i, (timestamp, energy) in enumerate(energy_curve):
        if energy <= threshold and not in_low_section:
            # Start of low energy section
            in_low_section = True
            section_start = timestamp
        elif energy > threshold and in_low_section:
            # End of low energy section
            in_low_section = False
            # Only include sections longer than 2 seconds
            if timestamp - section_start >= 2.0:
                low_energy_sections.append((section_start, timestamp))

    # Handle case where track ends in low energy
    if in_low_section and len(energy_curve) > 0:
        last_timestamp = energy_curve[-1][0]
        if last_timestamp - section_start >= 2.0:
            low_energy_sections.append((section_start, last_timestamp))

    return low_energy_sections


def compute_energy_trend(
    energy_curve: List[Tuple[float, float]],
    window_size: int = 10
) -> str:
    """
    Determine if energy is building, sustaining, or dropping.

    Args:
        energy_curve: List of (timestamp, energy) tuples
        window_size: Number of samples to consider for trend

    Returns:
        One of: "building", "sustaining", "dropping"
    """
    if len(energy_curve) < window_size:
        return "sustaining"

    # Take last window_size samples
    recent_energies = [e for _, e in energy_curve[-window_size:]]

    # Compute linear trend
    x = np.arange(len(recent_energies))
    coefficients = np.polyfit(x, recent_energies, 1)
    slope = coefficients[0]

    # Threshold for determining trend
    if slope > 0.01:
        return "building"
    elif slope < -0.01:
        return "dropping"
    else:
        return "sustaining"
