#!/usr/bin/env python3
"""
BEAT DROP DETECTION SERVICE
Finds the optimal start point for maximum hook impact.
Integrates with the video generation pipeline to trim slow intros.
"""

import librosa
import numpy as np
import json
import sys
import argparse


def detect_beat_drop(audio_path: str, verbose: bool = False) -> dict:
    """
    Analyze audio to find the first significant energy spike (beat drop).
    Returns optimal timestamp to start audio for maximum hook impact.
    """
    
    # Load audio
    if verbose:
        print(f"Loading audio: {audio_path}", file=sys.stderr)
    
    y, sr = librosa.load(audio_path, sr=22050)
    duration = len(y) / sr
    
    if verbose:
        print(f"Duration: {duration:.2f}s, Sample rate: {sr}", file=sys.stderr)
    
    # Get tempo and beats
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    # Handle tempo as array (newer librosa versions)
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
    else:
        tempo = float(tempo)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    
    if verbose:
        print(f"Detected BPM: {tempo:.1f}, Beats: {len(beat_times)}", file=sys.stderr)
    
    # Calculate RMS energy over time
    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    
    # Normalize energy
    rms_normalized = (rms - rms.min()) / (rms.max() - rms.min() + 1e-6)
    
    # Onset detection (sudden changes in energy)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_normalized = (onset_env - onset_env.min()) / (onset_env.max() - onset_env.min() + 1e-6)
    
    # Spectral contrast (helps identify drops)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop_length)
    contrast_mean = np.mean(contrast, axis=0)
    contrast_normalized = contrast_mean / (contrast_mean.max() + 1e-6)
    
    # Combined score: energy + onset strength + contrast
    min_len = min(len(rms_normalized), len(onset_normalized), len(contrast_normalized))
    combined_score = (
        rms_normalized[:min_len] * 0.4 + 
        onset_normalized[:min_len] * 0.4 + 
        contrast_normalized[:min_len] * 0.2
    )
    
    # Analyze intro (first 10% or 5 seconds, whichever is smaller)
    intro_duration = min(5.0, duration * 0.1)
    intro_frames = int(intro_duration * sr / hop_length)
    
    if intro_frames > 0 and intro_frames < len(combined_score):
        intro_avg = np.mean(combined_score[:intro_frames])
        intro_std = np.std(combined_score[:intro_frames])
    else:
        intro_avg = np.mean(combined_score[:10])
        intro_std = np.std(combined_score[:10])
    
    # Threshold: 1.5 standard deviations above intro average
    threshold = intro_avg + (intro_std * 1.5)
    
    if verbose:
        print(f"Intro avg energy: {intro_avg:.3f}, threshold: {threshold:.3f}", file=sys.stderr)
    
    # Find first sustained spike (not just a blip)
    drop_frame = None
    min_sustain_frames = 5  # Must stay high for at least 5 frames
    
    for i in range(len(combined_score) - min_sustain_frames):
        if combined_score[i] > threshold:
            # Check if it stays high
            if np.mean(combined_score[i:i+min_sustain_frames]) > threshold:
                drop_frame = i
                break
    
    # If no clear drop found, use first beat with above-average energy
    if drop_frame is None:
        for bt in beat_times:
            frame_idx = int(bt * sr / hop_length)
            if frame_idx < len(combined_score) and combined_score[frame_idx] > np.mean(combined_score):
                drop_frame = frame_idx
                break
    
    # Default to 0 if nothing found
    if drop_frame is None:
        drop_frame = 0
    
    drop_timestamp = librosa.frames_to_time(drop_frame, sr=sr, hop_length=hop_length)
    
    # Snap to nearest beat for cleaner cut
    if len(beat_times) > 0:
        nearest_beat_idx = np.argmin(np.abs(beat_times - drop_timestamp))
        nearest_beat = beat_times[nearest_beat_idx]
        # Only snap if within 0.5 seconds
        if abs(nearest_beat - drop_timestamp) < 0.5:
            drop_timestamp = nearest_beat
    
    # Calculate confidence based on how clear the drop is
    if drop_frame > 0 and drop_frame < len(combined_score):
        pre_drop_avg = np.mean(combined_score[:drop_frame]) if drop_frame > 0 else 0
        post_drop_avg = np.mean(combined_score[drop_frame:min(drop_frame+20, len(combined_score))])
        confidence = min(1.0, (post_drop_avg - pre_drop_avg) / (pre_drop_avg + 0.1))
        confidence = max(0.0, confidence)
    else:
        confidence = 0.5
    
    # Recommended trim: one or two beats before the drop for buildup
    recommended_trim = max(0, drop_timestamp - 0.5)
    
    # Snap recommended trim to beat
    if len(beat_times) > 0:
        beats_before_drop = beat_times[beat_times <= drop_timestamp]
        if len(beats_before_drop) >= 2:
            recommended_trim = float(beats_before_drop[-2])  # Two beats before drop
        elif len(beats_before_drop) >= 1:
            recommended_trim = float(beats_before_drop[-1])
    
    # Determine if trimming is recommended
    should_trim = bool(drop_timestamp > 2.0 and confidence > 0.3)
    
    # Check for low energy intro
    first_two_sec_frames = int(2.0 * sr / hop_length)
    if first_two_sec_frames < len(rms_normalized):
        first_two_energy = np.mean(rms_normalized[:first_two_sec_frames])
        if first_two_energy < 0.3 and tempo > 100:
            should_trim = True
    
    should_trim = bool(should_trim)  # Ensure native Python bool
    
    result = {
        'dropTimestamp': float(drop_timestamp),
        'confidence': float(confidence),
        'recommendedTrim': float(recommended_trim),
        'shouldTrim': should_trim,
        'bpm': float(tempo),
        'duration': float(duration),
        'introEnergy': float(intro_avg),
        'beatCount': len(beat_times),
        'firstBeats': [float(b) for b in beat_times[:10]],  # First 10 beats
        'energyCurve': [float(e) for e in rms_normalized[::20][:50]],  # Downsampled for preview
        'reason': get_trim_reason(drop_timestamp, confidence, intro_avg, should_trim)
    }
    
    return result


def get_trim_reason(drop_ts: float, confidence: float, intro_energy: float, should_trim: bool) -> str:
    """Generate human-readable reason for trim decision."""
    if not should_trim:
        if drop_ts <= 2.0:
            return "Hook starts within first 2 seconds - no trim needed"
        elif intro_energy > 0.5:
            return "Intro has strong energy - no trim needed"
        else:
            return "Low confidence in drop detection - keeping original"
    else:
        if intro_energy < 0.3:
            return f"Low energy intro ({intro_energy*100:.0f}%) - trimming to {drop_ts:.2f}s"
        else:
            return f"Drop detected at {drop_ts:.2f}s with {confidence*100:.0f}% confidence"


def get_ffmpeg_trim_command(input_path: str, output_path: str, start_time: float, fade_in: float = 0.1) -> str:
    """Generate FFmpeg command to trim audio with optional fade-in."""
    if fade_in > 0:
        return f'ffmpeg -y -ss {start_time:.3f} -i "{input_path}" -af "afade=t=in:st=0:d={fade_in}" -c:a aac "{output_path}"'
    else:
        return f'ffmpeg -y -ss {start_time:.3f} -i "{input_path}" -c copy "{output_path}"'


def main():
    parser = argparse.ArgumentParser(description='Detect beat drop for optimal audio hook')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--ffmpeg', action='store_true', help='Output FFmpeg trim command')
    parser.add_argument('--output', '-o', help='Output path for trimmed audio (with --ffmpeg)')
    
    args = parser.parse_args()
    
    result = detect_beat_drop(args.audio_path, verbose=args.verbose)
    
    if args.ffmpeg and result['shouldTrim']:
        output_path = args.output or args.audio_path.replace('.mp3', '_trimmed.mp3')
        cmd = get_ffmpeg_trim_command(args.audio_path, output_path, result['recommendedTrim'])
        result['ffmpegCommand'] = cmd
    
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
