"""
Motion Blur Transitions - Whip Pan Effect for AI Video Clips

Applies directional blur to mask AI-generated video stuttering between clips.
The blur is only applied to the last 0.2s of Clip A and first 0.2s of Clip B,
creating a professional "whip pan" effect that masks any AI jitter.

This is the "secret sauce" for high-volume automated channels - it bridges
the gap between AI clips, making transitions feel like intentional cinematic
choices rather than hard cuts.

Usage:
    python motion_blur_transitions.py input1.mp4 input2.mp4 output.mp4
    
    # Or import the functions:
    from motion_blur_transitions import apply_motion_blur_transition
"""

import cv2
import numpy as np
import subprocess
import os
import sys
import tempfile
import json
from pathlib import Path
from typing import Literal, Optional, Tuple, Union

# Type alias for blur directions
BlurDirection = Literal["horizontal", "vertical", "diagonal_right", "diagonal_left"]

# Transition parameters
BLUR_DURATION = 0.2  # Duration of blur in seconds
BLUR_INTENSITY_MIN = 5
BLUR_INTENSITY_MAX = 25
FADE_IN_FRAMES = 6  # Frames to ramp up blur
FADE_OUT_FRAMES = 6  # Frames to ramp down blur


def apply_motion_blur(
    image: np.ndarray, 
    intensity: int = 15, 
    direction: Literal["horizontal", "vertical", "diagonal_right", "diagonal_left"] = "horizontal"
) -> np.ndarray:
    """
    Applies a directional blur to a single frame using an OpenCV kernel.
    
    Args:
        image: Input frame (BGR numpy array)
        intensity: Blur kernel size (odd number, higher = more blur)
        direction: Direction of the motion blur
        
    Returns:
        Blurred frame
    """
    # Ensure odd kernel size
    intensity = max(3, intensity)
    if intensity % 2 == 0:
        intensity += 1
    
    kernel = np.zeros((intensity, intensity), dtype=np.float32)
    center = int((intensity - 1) / 2)
    
    if direction == "horizontal":
        # Fill middle row for horizontal whip
        kernel[center, :] = np.ones(intensity)
    elif direction == "vertical":
        # Fill middle column for vertical whip
        kernel[:, center] = np.ones(intensity)
    elif direction == "diagonal_right":
        # Fill diagonal for right-downward whip
        np.fill_diagonal(kernel, 1)
    elif direction == "diagonal_left":
        # Fill anti-diagonal for left-downward whip
        np.fill_diagonal(np.fliplr(kernel), 1)
    
    kernel /= np.sum(kernel)
    return cv2.filter2D(image, -1, kernel)


def create_blur_intensity_curve(num_frames: int, is_exit: bool = True) -> list:
    """
    Creates an intensity curve for smooth blur ramp.
    
    For exit blur (end of clip): ramps UP to max blur
    For entry blur (start of clip): ramps DOWN from max blur
    
    Uses easing function for natural feel.
    """
    intensities = []
    
    for i in range(num_frames):
        # Normalized position 0-1
        t = i / max(1, num_frames - 1)
        
        if is_exit:
            # Ease in - start slow, end fast (ramp up)
            eased = t * t  # Quadratic ease-in
        else:
            # Ease out - start fast, end slow (ramp down)
            eased = 1 - (1 - t) * (1 - t)  # Quadratic ease-out
        
        if is_exit:
            intensity = int(BLUR_INTENSITY_MIN + (BLUR_INTENSITY_MAX - BLUR_INTENSITY_MIN) * eased)
        else:
            intensity = int(BLUR_INTENSITY_MAX - (BLUR_INTENSITY_MAX - BLUR_INTENSITY_MIN) * eased)
        
        intensities.append(max(BLUR_INTENSITY_MIN, min(BLUR_INTENSITY_MAX, intensity)))
    
    return intensities


def process_clip_exit_blur(
    input_path: str,
    output_path: str,
    blur_duration: float = BLUR_DURATION,
    direction: str = "horizontal",
    fps: Optional[float] = None
) -> bool:
    """
    Applies motion blur to the END of a video clip.
    
    Only the last blur_duration seconds are affected.
    """
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"Error: Cannot open {input_path}")
        return False
    
    # Get video properties
    if fps is None:
        fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Calculate blur frames
    blur_frames = int(blur_duration * fps)
    blur_start_frame = max(0, total_frames - blur_frames)
    
    # Create intensity curve
    intensities = create_blur_intensity_curve(blur_frames, is_exit=True)
    
    # Setup writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx >= blur_start_frame:
            # Apply blur with ramping intensity
            blur_idx = frame_idx - blur_start_frame
            intensity = intensities[min(blur_idx, len(intensities) - 1)]
            frame = apply_motion_blur(frame, intensity, direction)
        
        out.write(frame)
        frame_idx += 1
    
    cap.release()
    out.release()
    
    print(f"Applied exit blur to {input_path} -> {output_path} ({blur_frames} frames)")
    return True


def process_clip_entry_blur(
    input_path: str,
    output_path: str,
    blur_duration: float = BLUR_DURATION,
    direction: str = "horizontal",
    fps: Optional[float] = None
) -> bool:
    """
    Applies motion blur to the START of a video clip.
    
    Only the first blur_duration seconds are affected.
    """
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"Error: Cannot open {input_path}")
        return False
    
    # Get video properties
    if fps is None:
        fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # Calculate blur frames
    blur_frames = int(blur_duration * fps)
    
    # Create intensity curve (ramping DOWN)
    intensities = create_blur_intensity_curve(blur_frames, is_exit=False)
    
    # Setup writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx < blur_frames:
            # Apply blur with ramping down intensity
            intensity = intensities[frame_idx]
            frame = apply_motion_blur(frame, intensity, direction)
        
        out.write(frame)
        frame_idx += 1
    
    cap.release()
    out.release()
    
    print(f"Applied entry blur to {input_path} -> {output_path} ({blur_frames} frames)")
    return True


def apply_motion_blur_transition(
    clip_a_path: str,
    clip_b_path: str,
    output_path: str,
    blur_duration: float = BLUR_DURATION,
    direction: str = "horizontal"
) -> bool:
    """
    Concatenates two clips with motion blur transition.
    
    - Last 0.2s of clip_a gets exit blur (ramping up)
    - First 0.2s of clip_b gets entry blur (ramping down)
    - Creates seamless whip-pan effect
    
    Args:
        clip_a_path: First video clip
        clip_b_path: Second video clip
        output_path: Output concatenated video
        blur_duration: Duration of blur effect in seconds
        direction: Blur direction (horizontal, vertical, diagonal_right, diagonal_left)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        # Process clip A with exit blur
        clip_a_processed = os.path.join(tmpdir, "clip_a_blurred.mp4")
        if not process_clip_exit_blur(clip_a_path, clip_a_processed, blur_duration, direction):
            return False
        
        # Process clip B with entry blur
        clip_b_processed = os.path.join(tmpdir, "clip_b_blurred.mp4")
        if not process_clip_entry_blur(clip_b_path, clip_b_processed, blur_duration, direction):
            return False
        
        # Concatenate using FFmpeg
        concat_list = os.path.join(tmpdir, "concat.txt")
        with open(concat_list, 'w') as f:
            f.write(f"file '{clip_a_processed}'\n")
            f.write(f"file '{clip_b_processed}'\n")
        
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', concat_list,
            '-c:v', 'libx264', '-preset', 'fast',
            '-crf', '23',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"FFmpeg error: {result.stderr}")
            return False
        
        print(f"Created transition video: {output_path}")
        return True


def batch_apply_transitions(
    clip_paths: list,
    output_path: str,
    blur_duration: float = BLUR_DURATION,
    direction: str = "horizontal",
    alternating_directions: bool = True
) -> bool:
    """
    Applies motion blur transitions to a batch of clips.
    
    Args:
        clip_paths: List of video clip paths in order
        output_path: Final concatenated output
        blur_duration: Duration of blur at each transition
        direction: Base direction (will alternate if alternating_directions=True)
        alternating_directions: Alternate between horizontal/vertical for variety
    """
    if len(clip_paths) < 2:
        print("Need at least 2 clips for transitions")
        return False
    
    directions = ["horizontal", "vertical", "diagonal_right", "diagonal_left"]
    
    with tempfile.TemporaryDirectory() as tmpdir:
        processed_clips = []
        
        for i, clip_path in enumerate(clip_paths):
            # Determine blur direction for this clip
            if alternating_directions:
                dir_idx = i % len(directions)
                current_direction = directions[dir_idx]
            else:
                current_direction = direction
            
            processed_path = os.path.join(tmpdir, f"clip_{i:03d}.mp4")
            
            cap = cv2.VideoCapture(clip_path)
            if not cap.isOpened():
                print(f"Error: Cannot open {clip_path}")
                return False
            
            fps = cap.get(cv2.CAP_PROP_FPS)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            blur_frames = int(blur_duration * fps)
            blur_start_frame = max(0, total_frames - blur_frames) if i < len(clip_paths) - 1 else total_frames
            
            exit_intensities = create_blur_intensity_curve(blur_frames, is_exit=True)
            entry_intensities = create_blur_intensity_curve(blur_frames, is_exit=False)
            
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(processed_path, fourcc, fps, (width, height))
            
            frame_idx = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Entry blur (first clip doesn't get entry blur)
                if i > 0 and frame_idx < blur_frames:
                    intensity = entry_intensities[frame_idx]
                    frame = apply_motion_blur(frame, intensity, current_direction)
                
                # Exit blur (last clip doesn't get exit blur)
                if i < len(clip_paths) - 1 and frame_idx >= blur_start_frame:
                    blur_idx = frame_idx - blur_start_frame
                    intensity = exit_intensities[min(blur_idx, len(exit_intensities) - 1)]
                    frame = apply_motion_blur(frame, intensity, current_direction)
                
                out.write(frame)
                frame_idx += 1
            
            cap.release()
            out.release()
            processed_clips.append(processed_path)
            print(f"Processed clip {i + 1}/{len(clip_paths)}: {clip_path}")
        
        # Concatenate all clips
        concat_list = os.path.join(tmpdir, "concat.txt")
        with open(concat_list, 'w') as f:
            for clip in processed_clips:
                f.write(f"file '{clip}'\n")
        
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', concat_list,
            '-c:v', 'libx264', '-preset', 'fast',
            '-crf', '23',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"FFmpeg error: {result.stderr}")
            return False
        
        print(f"Created batch transition video with {len(clip_paths)} clips: {output_path}")
        return True


def get_transition_info() -> dict:
    """Returns information about available transitions for API use."""
    return {
        "type": "motion_blur_whip_pan",
        "description": "Directional blur to mask AI clip transitions",
        "parameters": {
            "blur_duration": {
                "default": BLUR_DURATION,
                "min": 0.1,
                "max": 0.5,
                "unit": "seconds"
            },
            "intensity": {
                "min": BLUR_INTENSITY_MIN,
                "max": BLUR_INTENSITY_MAX
            },
            "directions": ["horizontal", "vertical", "diagonal_right", "diagonal_left"]
        },
        "benefits": [
            "Masks AI video stuttering/morphing",
            "Low computational cost (2D convolution)",
            "Mimics real camera motion",
            "Professional 'whip pan' cinematic feel"
        ]
    }


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Apply motion blur transitions to video clips")
    parser.add_argument("--clips", nargs="+", help="Input video clips")
    parser.add_argument("--output", "-o", required=True, help="Output video path")
    parser.add_argument("--duration", "-d", type=float, default=BLUR_DURATION, help="Blur duration in seconds")
    parser.add_argument("--direction", choices=["horizontal", "vertical", "diagonal_right", "diagonal_left"],
                        default="horizontal", help="Blur direction")
    parser.add_argument("--alternate", action="store_true", help="Alternate blur directions")
    parser.add_argument("--info", action="store_true", help="Print transition info")
    
    args = parser.parse_args()
    
    if args.info:
        print(json.dumps(get_transition_info(), indent=2))
        sys.exit(0)
    
    if not args.clips or len(args.clips) < 2:
        print("Error: Need at least 2 clips. Use --clips clip1.mp4 clip2.mp4 ...")
        sys.exit(1)
    
    success = batch_apply_transitions(
        args.clips,
        args.output,
        blur_duration=args.duration,
        direction=args.direction,
        alternating_directions=args.alternate
    )
    
    sys.exit(0 if success else 1)
