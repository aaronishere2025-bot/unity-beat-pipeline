/**
 * AUDIO HOOK DETECTION SERVICE
 *
 * Librosa-powered beat drop detection that automatically finds the first
 * significant energy spike (the "drop") in Suno-generated audio tracks.
 *
 * This helps trim audio to start at the hook rather than a slow intro,
 * maximizing viewer retention in the critical first 3 seconds.
 *
 * Detection Logic:
 * 1. Load audio with librosa
 * 2. Calculate RMS energy over time
 * 3. Calculate onset strength (sudden changes)
 * 4. Calculate spectral contrast
 * 5. Combine into "hook score"
 * 6. Find first sustained spike above intro average
 * 7. Snap to nearest beat for clean cut
 * 8. Return timestamp + confidence
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DETECTION_TIMEOUT_MS = 60000;

const ALLOWED_AUDIO_DIRS = [
  'attached_assets/music',
  'attached_assets/generated_audio',
  'attached_assets/unity_audio',
  '/tmp',
];

function validateAudioPath(audioPath: string): boolean {
  const normalizedPath = path.normalize(audioPath);
  const absolutePath = path.isAbsolute(normalizedPath) ? normalizedPath : path.join(process.cwd(), normalizedPath);

  const cwd = process.cwd();

  for (const allowedDir of ALLOWED_AUDIO_DIRS) {
    const allowedPath = allowedDir.startsWith('/') ? allowedDir : path.join(cwd, allowedDir);

    if (absolutePath.startsWith(allowedPath)) {
      return true;
    }
  }

  return false;
}

export interface DropDetectionResult {
  dropTimestamp: number; // Seconds where the "drop" happens
  confidence: number; // 0-1 confidence score
  beatTimestamps: number[]; // All beat timestamps
  energyCurve: number[]; // Energy values over time
  bpm: number;
  recommendedTrim: number; // Suggested trim point for FFmpeg
  analysisDetails: {
    introAvgEnergy: number;
    dropEnergy: number;
    energyIncrease: number;
  };
}

export interface TrimDecision {
  shouldTrim: boolean;
  trimTo: number;
  reason: string;
  detection?: DropDetectionResult;
}

const DROP_DETECTION_PYTHON_SCRIPT = `
import librosa
import numpy as np
import json
import sys

def detect_drop(audio_path):
    # Load audio
    y, sr = librosa.load(audio_path, sr=22050)
    
    # Get tempo and beats
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    
    # Calculate RMS energy over time
    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    
    # Normalize energy
    rms_normalized = (rms - rms.min()) / (rms.max() - rms.min() + 1e-6)
    
    # Calculate energy derivative (rate of change)
    energy_derivative = np.diff(rms_normalized)
    
    # Find spectral contrast (helps identify drops)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop_length)
    contrast_mean = np.mean(contrast, axis=0)
    
    # Onset detection (sudden changes in energy)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_normalized = (onset_env - onset_env.min()) / (onset_env.max() - onset_env.min() + 1e-6)
    
    # Combined score: high energy + high onset strength + high contrast
    combined_score = (rms_normalized[:len(onset_normalized)] * 0.4 + 
                      onset_normalized * 0.4 + 
                      contrast_mean[:len(onset_normalized)] / contrast_mean.max() * 0.2)
    
    # Find the first significant spike
    # Look for where energy jumps significantly above the intro average
    intro_duration = min(5.0, len(y) / sr * 0.1)  # First 10% or 5 seconds
    intro_samples = int(intro_duration * sr / hop_length)
    
    if intro_samples > 0:
        intro_avg = np.mean(combined_score[:intro_samples])
        intro_std = np.std(combined_score[:intro_samples])
    else:
        intro_avg = np.mean(combined_score[:10])
        intro_std = np.std(combined_score[:10])
    
    # Threshold: 1.5 standard deviations above intro average
    threshold = intro_avg + (intro_std * 1.5)
    
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
        nearest_beat = beat_times[np.argmin(np.abs(beat_times - drop_timestamp))]
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
    
    # Recommended trim: slightly before the drop for buildup
    recommended_trim = max(0, drop_timestamp - 0.5)
    
    # Snap recommended trim to beat
    if len(beat_times) > 0:
        beats_before_drop = beat_times[beat_times <= drop_timestamp]
        if len(beats_before_drop) >= 2:
            recommended_trim = float(beats_before_drop[-2])  # Two beats before drop
        elif len(beats_before_drop) >= 1:
            recommended_trim = float(beats_before_drop[-1])
    
    # Get analysis details
    drop_energy = float(combined_score[drop_frame]) if drop_frame < len(combined_score) else 0
    energy_increase = (drop_energy - intro_avg) / (intro_avg + 0.01) if intro_avg > 0 else 0
    
    result = {
        'dropTimestamp': float(drop_timestamp),
        'confidence': float(confidence),
        'beatTimestamps': beat_times.tolist()[:50],  # First 50 beats
        'energyCurve': rms_normalized[::10].tolist()[:100],  # Downsampled
        'bpm': float(tempo) if not hasattr(tempo, '__len__') else float(tempo[0]) if len(tempo) > 0 else 0.0,
        'recommendedTrim': float(recommended_trim),
        'analysisDetails': {
            'introAvgEnergy': float(intro_avg),
            'dropEnergy': float(drop_energy),
            'energyIncrease': float(energy_increase)
        }
    }
    
    return result

if __name__ == '__main__':
    audio_path = sys.argv[1]
    result = detect_drop(audio_path)
    print(json.dumps(result))
`;

/**
 * Detect the first significant energy spike (beat drop) in audio
 * Returns optimal timestamp to start audio for maximum hook impact
 */
export async function detectBeatDrop(audioPath: string): Promise<DropDetectionResult> {
  return new Promise((resolve, reject) => {
    if (!validateAudioPath(audioPath)) {
      reject(new Error(`Audio path not allowed: ${audioPath}`));
      return;
    }

    if (!fs.existsSync(audioPath)) {
      reject(new Error(`Audio file not found: ${audioPath}`));
      return;
    }

    const tempScript = path.join('/tmp', `drop_detect_${Date.now()}.py`);
    fs.writeFileSync(tempScript, DROP_DETECTION_PYTHON_SCRIPT);

    const python = spawn('python3', [tempScript, audioPath]);
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      python.kill('SIGKILL');
      try {
        fs.unlinkSync(tempScript);
      } catch (e) {}
      reject(new Error(`Hook detection timed out after ${DETECTION_TIMEOUT_MS / 1000}s`));
    }, DETECTION_TIMEOUT_MS);

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      clearTimeout(timeout);

      if (killed) return;

      try {
        fs.unlinkSync(tempScript);
      } catch (e) {}

      if (code !== 0) {
        console.error('[AudioHook] Drop detection stderr:', stderr);
        reject(new Error(`Drop detection failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        console.log(
          `[AudioHook] Drop detected at ${result.dropTimestamp.toFixed(2)}s (${(result.confidence * 100).toFixed(0)}% confidence), BPM: ${result.bpm.toFixed(0)}`,
        );
        resolve(result as DropDetectionResult);
      } catch (e) {
        reject(new Error(`Failed to parse drop detection result: ${stdout}`));
      }
    });

    python.on('error', (err) => {
      clearTimeout(timeout);
      if (killed) return;

      try {
        fs.unlinkSync(tempScript);
      } catch (e) {}
      reject(new Error(`Failed to spawn python process: ${err.message}`));
    });
  });
}

/**
 * Determine if audio needs trimming based on intro energy
 *
 * Criteria for trimming:
 * - Drop happens after 2 seconds AND confidence > 30%
 * - OR high BPM track with low energy first 2 seconds
 */
export async function shouldTrimIntro(audioPath: string): Promise<TrimDecision> {
  try {
    const detection = await detectBeatDrop(audioPath);

    // If drop happens after 2 seconds and confidence is high, trim
    if (detection.dropTimestamp > 2.0 && detection.confidence > 0.3) {
      return {
        shouldTrim: true,
        trimTo: detection.recommendedTrim,
        reason: `Slow intro detected. Drop at ${detection.dropTimestamp.toFixed(2)}s with ${(detection.confidence * 100).toFixed(0)}% confidence`,
        detection,
      };
    }

    // If BPM is high but first 2 seconds have low energy
    if (detection.bpm > 100 && detection.energyCurve.length > 0) {
      const firstTwoSecEnergy = detection.energyCurve.slice(0, 5);
      const avgFirstTwo = firstTwoSecEnergy.reduce((a, b) => a + b, 0) / firstTwoSecEnergy.length;

      if (avgFirstTwo < 0.3) {
        return {
          shouldTrim: true,
          trimTo: detection.recommendedTrim,
          reason: `Low energy intro (${(avgFirstTwo * 100).toFixed(0)}% energy) for ${detection.bpm.toFixed(0)} BPM track`,
          detection,
        };
      }
    }

    return {
      shouldTrim: false,
      trimTo: 0,
      reason: 'Intro has sufficient energy, no trim needed',
      detection,
    };
  } catch (error) {
    console.error('[AudioHook] Error analyzing audio:', error);
    return {
      shouldTrim: false,
      trimTo: 0,
      reason: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get FFmpeg command to trim audio to start at hook
 */
export function getAudioTrimCommand(inputPath: string, outputPath: string, startTime: number): string {
  // Use -ss before -i for fast seeking, -c copy for stream copy (no re-encoding)
  return `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${inputPath}" -c copy "${outputPath}"`;
}

/**
 * Get FFmpeg command to trim audio and add fade-in
 * Useful when trimming to an abrupt moment
 */
export function getAudioTrimWithFadeCommand(
  inputPath: string,
  outputPath: string,
  startTime: number,
  fadeInDuration: number = 0.1,
): string {
  // Needs re-encoding for audio filter
  return `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${inputPath}" -af "afade=t=in:st=0:d=${fadeInDuration}" -c:a aac -b:a 192k "${outputPath}"`;
}

/**
 * Get FFmpeg command to trim both audio and video
 * Keeps A/V sync when trimming
 */
export function getAVTrimCommand(inputPath: string, outputPath: string, startTime: number, endTime?: number): string {
  let cmd = `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${inputPath}"`;

  if (endTime !== undefined) {
    const duration = endTime - startTime;
    cmd += ` -t ${duration.toFixed(3)}`;
  }

  cmd += ` -c copy "${outputPath}"`;
  return cmd;
}

/**
 * Analyze audio and get full hook optimization report
 */
export async function getHookAnalysisReport(audioPath: string): Promise<{
  detection: DropDetectionResult;
  trimDecision: TrimDecision;
  recommendations: string[];
  ffmpegCommands: {
    trimOnly: string;
    trimWithFade: string;
  };
}> {
  const detection = await detectBeatDrop(audioPath);
  const trimDecision = await shouldTrimIntro(audioPath);

  const recommendations: string[] = [];

  // Generate recommendations based on analysis
  if (detection.dropTimestamp > 3.0) {
    recommendations.push(
      `⚠️ Late drop at ${detection.dropTimestamp.toFixed(1)}s - consider trimming for short-form platforms`,
    );
  }

  if (detection.bpm < 80) {
    recommendations.push(`🎵 Low BPM (${detection.bpm.toFixed(0)}) - may need faster cuts to maintain energy`);
  } else if (detection.bpm > 120) {
    recommendations.push(`🔥 High BPM (${detection.bpm.toFixed(0)}) - sync VEO clips to beat for maximum impact`);
  }

  if (detection.confidence < 0.3) {
    recommendations.push(`🤔 Low confidence drop detection - audio may have gradual build rather than clear drop`);
  }

  if (detection.analysisDetails.energyIncrease > 2.0) {
    recommendations.push(
      `💥 Strong energy spike (${(detection.analysisDetails.energyIncrease * 100).toFixed(0)}% increase) - perfect for visual impact sync`,
    );
  }

  if (trimDecision.shouldTrim) {
    recommendations.push(`✂️ Recommended: Trim to ${trimDecision.trimTo.toFixed(2)}s for hook-first start`);
  } else {
    recommendations.push(`✅ Intro energy is good - no trim needed`);
  }

  const outputPath = audioPath.replace(/\.(mp3|wav|m4a)$/i, '_trimmed.$1');

  return {
    detection,
    trimDecision,
    recommendations,
    ffmpegCommands: {
      trimOnly: getAudioTrimCommand(audioPath, outputPath, trimDecision.trimTo),
      trimWithFade: getAudioTrimWithFadeCommand(audioPath, outputPath, trimDecision.trimTo, 0.1),
    },
  };
}

// Export singleton for convenience
export const audioHookDetection = {
  detectBeatDrop,
  shouldTrimIntro,
  getAudioTrimCommand,
  getAudioTrimWithFadeCommand,
  getAVTrimCommand,
  getHookAnalysisReport,
};
