#!/usr/bin/env python3
"""Detect when vocals/singing actually begin in an audio file"""
import sys
import json
import librosa
import numpy as np

def detect_vocal_onset(audio_path):
    """
    Detect when vocals start in a song.
    Returns offset in seconds from the start of the audio file.
    """
    try:
        # Load audio
        y, sr = librosa.load(audio_path, sr=22050)
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Method 1: RMS energy onset - detect when audio energy increases significantly
        rms = librosa.feature.rms(y=y)[0]
        
        # Find frames where RMS exceeds a threshold (10% of max)
        threshold = np.max(rms) * 0.15
        high_energy_frames = np.where(rms > threshold)[0]
        
        if len(high_energy_frames) > 0:
            # Get the time of first significant energy
            first_energy_frame = high_energy_frames[0]
            energy_onset = librosa.frames_to_time(first_energy_frame, sr=sr)
        else:
            energy_onset = 0.0
        
        # Method 2: Onset detection for vocal attacks
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units='frames')
        if len(onset_frames) > 0:
            onset_times = librosa.frames_to_time(onset_frames, sr=sr)
            first_onset = onset_times[0]
        else:
            first_onset = 0.0
        
        # Use the earlier of the two methods, but at least 0
        vocal_start = max(0, min(energy_onset, first_onset))
        
        result = {
            "success": True,
            "vocal_onset": round(vocal_start, 2),
            "duration": round(duration, 2),
            "energy_onset": round(energy_onset, 2),
            "first_onset": round(first_onset, 2)
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: detect_vocal_onset.py <audio_path>"}))
        sys.exit(1)
    
    detect_vocal_onset(sys.argv[1])
