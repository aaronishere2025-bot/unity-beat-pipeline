#!/usr/bin/env python3
"""
SMART AUDIO TRIMMER
Cuts filler from beginning AND end of tracks for optimal platform fit.

Features:
- Detects slow intro, trims to beat drop
- Detects quiet outro, trims fade-out filler
- Fits to platform max length (YouTube Shorts: 179s, TikTok: 180s, Reels: 179s)
- Adds professional fade-in/fade-out
"""

import librosa
import numpy as np
import json
import sys
import argparse
import subprocess
import os


# Platform max lengths (in seconds)
PLATFORM_LIMITS = {
    'youtube_shorts': 179,  # 2:59
    'tiktok': 180,          # 3:00 (but can go longer)
    'reels': 179,           # 2:59
    'youtube_long': 600,    # 10:00 for regular YouTube
    'none': 99999           # No limit
}


def analyze_audio(audio_path: str, verbose: bool = False) -> dict:
    """Full audio analysis for smart trimming."""
    
    if verbose:
        print(f"Loading: {audio_path}", file=sys.stderr)
    
    y, sr = librosa.load(audio_path, sr=22050)
    duration = len(y) / sr
    
    # Get tempo and beats
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    
    # Calculate RMS energy over time
    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    rms_normalized = (rms - rms.min()) / (rms.max() - rms.min() + 1e-6)
    
    # Onset strength
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_normalized = (onset_env - onset_env.min()) / (onset_env.max() - onset_env.min() + 1e-6)
    
    # Combined energy score
    min_len = min(len(rms_normalized), len(onset_normalized))
    combined = rms_normalized[:min_len] * 0.6 + onset_normalized[:min_len] * 0.4
    
    return {
        'y': y,
        'sr': sr,
        'duration': duration,
        'tempo': tempo,
        'beat_times': beat_times,
        'rms': rms_normalized,
        'rms_times': rms_times,
        'combined': combined,
        'hop_length': hop_length
    }


def find_intro_trim_point(analysis: dict, verbose: bool = False) -> dict:
    """Find optimal intro trim point (beat drop detection)."""
    
    combined = analysis['combined']
    beat_times = analysis['beat_times']
    sr = analysis['sr']
    hop_length = analysis['hop_length']
    duration = analysis['duration']
    
    # Analyze intro (first 10% or 5 seconds)
    intro_duration = min(5.0, duration * 0.1)
    intro_frames = int(intro_duration * sr / hop_length)
    
    if intro_frames > 0 and intro_frames < len(combined):
        intro_avg = np.mean(combined[:intro_frames])
        intro_std = np.std(combined[:intro_frames])
    else:
        intro_avg = np.mean(combined[:10])
        intro_std = np.std(combined[:10])
    
    threshold = intro_avg + (intro_std * 1.5)
    
    # Find first sustained energy spike
    drop_frame = 0
    for i in range(len(combined) - 5):
        if combined[i] > threshold and np.mean(combined[i:i+5]) > threshold:
            drop_frame = i
            break
    
    drop_timestamp = librosa.frames_to_time(drop_frame, sr=sr, hop_length=hop_length)
    
    # Snap to nearest beat
    if len(beat_times) > 0:
        nearest_idx = np.argmin(np.abs(beat_times - drop_timestamp))
        nearest_beat = beat_times[nearest_idx]
        if abs(nearest_beat - drop_timestamp) < 0.5:
            drop_timestamp = nearest_beat
    
    # Recommended trim: one beat before drop for buildup
    trim_point = max(0, drop_timestamp - 0.3)
    if len(beat_times) > 0:
        beats_before = beat_times[beat_times <= drop_timestamp]
        if len(beats_before) >= 2:
            trim_point = float(beats_before[-1])
    
    # Calculate confidence
    if drop_frame > 0:
        pre = np.mean(combined[:drop_frame])
        post = np.mean(combined[drop_frame:min(drop_frame+20, len(combined))])
        confidence = min(1.0, max(0.0, (post - pre) / (pre + 0.1)))
    else:
        confidence = 0.5
    
    should_trim = bool(drop_timestamp > 1.5 and confidence > 0.25 and intro_avg < 0.35)
    
    return {
        'drop_timestamp': float(drop_timestamp),
        'trim_point': float(trim_point) if should_trim else 0.0,
        'should_trim': should_trim,
        'confidence': float(confidence),
        'intro_energy': float(intro_avg),
        'reason': f"Drop at {drop_timestamp:.2f}s, intro energy {intro_avg*100:.0f}%" if should_trim else "Intro has good energy"
    }


def find_outro_trim_point(analysis: dict, verbose: bool = False) -> dict:
    """Find optimal outro trim point (detect quiet fadeout filler)."""
    
    rms = analysis['rms']
    rms_times = analysis['rms_times']
    duration = analysis['duration']
    sr = analysis['sr']
    hop_length = analysis['hop_length']
    beat_times = analysis['beat_times']
    
    # Analyze last 20% of track
    outro_start_pct = 0.8
    outro_start_frame = int(len(rms) * outro_start_pct)
    outro_rms = rms[outro_start_frame:]
    
    if len(outro_rms) < 10:
        return {
            'trim_point': duration,
            'should_trim': False,
            'silence_start': duration,
            'reason': "Track too short to analyze outro"
        }
    
    # Find where energy drops below 15% of track average
    track_avg = np.mean(rms)
    silence_threshold = track_avg * 0.15
    
    # Scan backwards from end to find last "loud" moment
    silence_start_frame = len(rms) - 1
    consecutive_quiet = 0
    required_quiet_frames = int(1.5 * sr / hop_length)  # 1.5 seconds of quiet
    
    for i in range(len(rms) - 1, outro_start_frame, -1):
        if rms[i] < silence_threshold:
            consecutive_quiet += 1
        else:
            if consecutive_quiet >= required_quiet_frames:
                silence_start_frame = i + 1
                break
            consecutive_quiet = 0
    
    silence_start = librosa.frames_to_time(silence_start_frame, sr=sr, hop_length=hop_length)
    
    # Snap to nearest beat after the last loud moment
    if len(beat_times) > 0:
        beats_after = beat_times[beat_times >= silence_start - 0.5]
        if len(beats_after) > 0:
            # Give 1 beat of buffer after last content
            silence_start = float(beats_after[0]) + (60.0 / analysis['tempo'])
    
    # Add small buffer for fade-out
    trim_point = min(silence_start + 0.5, duration)
    
    time_saved = duration - trim_point
    should_trim = bool(time_saved > 2.0)  # Only trim if saving 2+ seconds
    
    return {
        'trim_point': float(trim_point) if should_trim else float(duration),
        'should_trim': should_trim,
        'silence_start': float(silence_start),
        'time_saved': float(time_saved),
        'reason': f"Quiet outro detected, saving {time_saved:.1f}s" if should_trim else "Outro has content throughout"
    }


def calculate_smart_trim(audio_path: str, target_platform: str = 'youtube_shorts', verbose: bool = False) -> dict:
    """Calculate optimal trim points for both intro and outro."""
    
    analysis = analyze_audio(audio_path, verbose)
    intro = find_intro_trim_point(analysis, verbose)
    outro = find_outro_trim_point(analysis, verbose)
    
    platform_limit = PLATFORM_LIMITS.get(target_platform, 179)
    
    original_duration = analysis['duration']
    
    # Calculate new duration after trimming filler
    intro_trim = intro['trim_point']
    outro_trim = outro['trim_point']
    content_duration = outro_trim - intro_trim
    
    # If still over platform limit, trim more from end
    if content_duration > platform_limit:
        outro_trim = intro_trim + platform_limit
        forced_trim = True
    else:
        forced_trim = False
    
    final_duration = outro_trim - intro_trim
    
    return {
        'original_duration': float(original_duration),
        'final_duration': float(final_duration),
        'time_saved': float(original_duration - final_duration),
        'intro': {
            'trim_at': float(intro_trim),
            'should_trim': intro['should_trim'],
            'reason': intro['reason']
        },
        'outro': {
            'trim_at': float(outro_trim),
            'should_trim': outro['should_trim'] or forced_trim,
            'reason': outro['reason'] if not forced_trim else f"Trimmed to fit {target_platform} limit ({platform_limit}s)"
        },
        'platform': target_platform,
        'platform_limit': platform_limit,
        'fits_platform': bool(final_duration <= platform_limit),
        'bpm': float(analysis['tempo']),
        'ffmpeg_command': generate_ffmpeg_command(
            audio_path, 
            intro_trim, 
            outro_trim,
            target_platform
        )
    }


def generate_ffmpeg_command(input_path: str, start: float, end: float, platform: str) -> str:
    """Generate FFmpeg command for trimming with fades."""
    
    duration = end - start
    fade_in = 0.1
    fade_out = 1.5
    fade_out_start = duration - fade_out
    
    # Output filename
    base = os.path.splitext(input_path)[0]
    output_path = f"{base}_{platform}_trimmed.mp3"
    
    cmd = (
        f'ffmpeg -y -ss {start:.3f} -t {duration:.3f} -i "{input_path}" '
        f'-af "afade=t=in:st=0:d={fade_in},afade=t=out:st={fade_out_start:.3f}:d={fade_out}" '
        f'-c:a libmp3lame -q:a 2 "{output_path}"'
    )
    
    return cmd


def execute_trim(audio_path: str, target_platform: str = 'youtube_shorts', verbose: bool = False) -> dict:
    """Calculate AND execute the trim."""
    
    result = calculate_smart_trim(audio_path, target_platform, verbose)
    
    if result['time_saved'] > 0.5:  # Only run if actually trimming
        if verbose:
            print(f"Executing: {result['ffmpeg_command']}", file=sys.stderr)
        
        subprocess.run(result['ffmpeg_command'], shell=True, check=True, 
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Get output path from command
        base = os.path.splitext(audio_path)[0]
        output_path = f"{base}_{target_platform}_trimmed.mp3"
        result['output_path'] = output_path
        result['executed'] = True
    else:
        result['output_path'] = audio_path
        result['executed'] = False
        result['note'] = "No significant filler to trim"
    
    return result


def main():
    parser = argparse.ArgumentParser(description='Smart audio trimmer - cuts filler from intro and outro')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--platform', '-p', default='youtube_shorts',
                       choices=list(PLATFORM_LIMITS.keys()),
                       help='Target platform for length limit')
    parser.add_argument('--execute', '-x', action='store_true',
                       help='Execute the trim (otherwise just analyze)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    if args.execute:
        result = execute_trim(args.audio_path, args.platform, args.verbose)
    else:
        result = calculate_smart_trim(args.audio_path, args.platform, args.verbose)
    
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
