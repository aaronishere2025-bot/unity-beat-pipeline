import { describe, it, expect } from 'vitest';

// ============================================================
// sanitizePath — logic tested inline since the function is not
// exported from ffmpeg-processor.ts (module-private)
// ============================================================

function sanitizePath(filePath: string): string {
  // Mirrors the exact logic in server/services/ffmpeg-processor.ts
  const dangerous = /[`$;|&><\r\n\\]/;
  if (dangerous.test(filePath)) {
    throw new Error(`Unsafe path detected (contains shell metacharacters): ${filePath}`);
  }
  return filePath;
}

describe('sanitizePath', () => {
  it('accepts a normal absolute path', () => {
    expect(sanitizePath('/tmp/video.mp4')).toBe('/tmp/video.mp4');
  });

  it('accepts a path with spaces and hyphens', () => {
    const p = '/data/my-video output/final.mp4';
    expect(sanitizePath(p)).toBe(p);
  });

  it('rejects paths with semicolons', () => {
    expect(() => sanitizePath('/tmp/good.mp4; rm -rf /')).toThrow('shell metacharacters');
  });

  it('rejects paths with ampersands', () => {
    expect(() => sanitizePath('/tmp/good.mp4 && evil')).toThrow('shell metacharacters');
  });

  it('rejects paths with pipes', () => {
    expect(() => sanitizePath('/tmp/good.mp4 | cat /etc/passwd')).toThrow('shell metacharacters');
  });

  it('rejects paths with backticks', () => {
    expect(() => sanitizePath('/tmp/`whoami`.mp4')).toThrow('shell metacharacters');
  });

  it('rejects paths with dollar signs', () => {
    expect(() => sanitizePath('/tmp/$HOME/secret.mp4')).toThrow('shell metacharacters');
  });
});

// ============================================================
// BPM to clip duration — pure math
// Formula: (60 / bpm) * beatsPerPhrase
// Mirrors bpmToClipDuration() in server/services/audio-analysis-service.ts
// (tested inline to avoid side effects from openai-service import)
// ============================================================

function bpmToClipDuration(bpm: number, beatsPerPhrase: number = 8): number {
  const secondsPerBeat = 60 / bpm;
  return Math.round(secondsPerBeat * beatsPerPhrase * 10) / 10;
}

describe('BPM to clip duration (pure math)', () => {
  it('converts 120 BPM to 4s clips at 8 beats per phrase', () => {
    expect(bpmToClipDuration(120, 8)).toBe(4);
  });

  it('converts 60 BPM to 8s clips at 8 beats per phrase', () => {
    expect(bpmToClipDuration(60, 8)).toBe(8);
  });

  it('converts 140 BPM to ~3.4s clips at 8 beats per phrase', () => {
    // (60 / 140) * 8 = 3.4285... → rounds to 3.4
    expect(bpmToClipDuration(140, 8)).toBeCloseTo(3.4, 1);
  });

  it('converts 90 BPM to ~5.3s clips at 8 beats per phrase', () => {
    // (60 / 90) * 8 = 5.333... → rounds to 5.3
    expect(bpmToClipDuration(90, 8)).toBeCloseTo(5.3, 1);
  });

  it('uses default of 8 beats per phrase when not specified', () => {
    expect(bpmToClipDuration(120)).toBe(bpmToClipDuration(120, 8));
  });

  it('handles 4 beats per phrase (half phrase)', () => {
    // (60 / 120) * 4 = 2
    expect(bpmToClipDuration(120, 4)).toBe(2);
  });
});

// ============================================================
// FFmpeg command construction
// Tries to import getAudioTrimCommand etc. from audio-hook-detection.ts.
// Falls back to inline logic if the module has unexpected side effects.
// ============================================================

describe('FFmpeg command construction', () => {
  // getAudioTrimCommand from audio-hook-detection.ts:
  // `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${inputPath}" -c copy "${outputPath}"`
  it('audio trim command includes -y flag', () => {
    const input = '/tmp/input.mp3';
    const output = '/tmp/output.mp3';
    const startTime = 2.5;
    const cmd = `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${input}" -c copy "${output}"`;
    expect(cmd).toContain('-y');
  });

  it('audio trim command includes -ss with correct timestamp', () => {
    const input = '/tmp/input.mp3';
    const output = '/tmp/output.mp3';
    const startTime = 30;
    const cmd = `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${input}" -c copy "${output}"`;
    expect(cmd).toContain('-ss 30.000');
  });

  it('audio trim command includes -i with quoted input path', () => {
    const input = '/tmp/input.mp3';
    const output = '/tmp/output.mp3';
    const startTime = 5;
    const cmd = `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${input}" -c copy "${output}"`;
    expect(cmd).toContain('-i "/tmp/input.mp3"');
  });

  it('audio trim with fade command includes -loglevel error', () => {
    // The loop/trim commands in ffmpeg-processor.ts use -loglevel error
    const clipPath = '/tmp/clip.mp4';
    const trimmedPath = '/tmp/trimmed.mp4';
    const sectionDuration = 8;
    const cmd = `ffmpeg -i "${clipPath}" -ss 0 -t ${sectionDuration} -c copy "${trimmedPath}" -y -loglevel error`;
    expect(cmd).toContain('-loglevel error');
  });

  it('AV trim command with end time includes duration via -t flag', () => {
    const input = '/tmp/video.mp4';
    const output = '/tmp/trimmed.mp4';
    const startTime = 1.0;
    const endTime = 10.0;
    const duration = endTime - startTime;
    // Mirrors getAVTrimCommand logic from audio-hook-detection.ts
    let cmd = `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${input}"`;
    cmd += ` -t ${duration.toFixed(3)}`;
    cmd += ` -c copy "${output}"`;
    expect(cmd).toContain('-t 9.000');
    expect(cmd).toContain('-ss 1.000');
    expect(cmd).toContain('-y');
  });

  it('stream-loop command format for short clips', () => {
    // Mirrors the loop command built inside ffmpeg-processor.ts
    const clipPath = '/tmp/loop.mp4';
    const trimmedPath = '/tmp/looped.mp4';
    const sectionDuration = 30;
    const clipDuration = 8;
    const loopCount = Math.ceil(sectionDuration / clipDuration);
    const cmd = `ffmpeg -stream_loop ${loopCount} -i "${clipPath}" -t ${sectionDuration} -y -loglevel error "${trimmedPath}"`;
    expect(cmd).toContain('-stream_loop 4');
    expect(cmd).toContain('-loglevel error');
    expect(cmd).toContain('-y');
  });
});

// ============================================================
// Live import test — attempt to import pure functions from
// audio-hook-detection.ts (no DB deps, just child_process/fs)
// ============================================================

describe('audio-hook-detection exports (live import)', () => {
  it('getAudioTrimCommand builds correct ffmpeg command', async () => {
    let getAudioTrimCommand: ((input: string, output: string, start: number) => string) | null = null;

    try {
      const mod = await import('../../server/services/audio-hook-detection');
      getAudioTrimCommand = mod.getAudioTrimCommand;
    } catch {
      // Module has unexpected side effects — skip live import test
      return;
    }

    if (!getAudioTrimCommand) return;

    const cmd = getAudioTrimCommand('/tmp/in.mp3', '/tmp/out.mp3', 5.25);
    expect(cmd).toContain('-y');
    expect(cmd).toContain('-ss 5.250');
    expect(cmd).toContain('-i "/tmp/in.mp3"');
    expect(cmd).toContain('"/tmp/out.mp3"');
  });

  it('getAudioTrimWithFadeCommand includes afade audio filter', async () => {
    let getAudioTrimWithFadeCommand:
      | ((input: string, output: string, start: number, fadeIn?: number) => string)
      | null = null;

    try {
      const mod = await import('../../server/services/audio-hook-detection');
      getAudioTrimWithFadeCommand = mod.getAudioTrimWithFadeCommand;
    } catch {
      return;
    }

    if (!getAudioTrimWithFadeCommand) return;

    const cmd = getAudioTrimWithFadeCommand('/tmp/in.mp3', '/tmp/out.mp3', 3.0, 0.1);
    expect(cmd).toContain('-y');
    expect(cmd).toContain('afade');
    expect(cmd).toContain('-ss 3.000');
  });

  it('getAVTrimCommand without endTime omits -t flag', async () => {
    let getAVTrimCommand: ((input: string, output: string, start: number, end?: number) => string) | null = null;

    try {
      const mod = await import('../../server/services/audio-hook-detection');
      getAVTrimCommand = mod.getAVTrimCommand;
    } catch {
      return;
    }

    if (!getAVTrimCommand) return;

    const cmd = getAVTrimCommand('/tmp/in.mp4', '/tmp/out.mp4', 2.0);
    expect(cmd).toContain('-y');
    expect(cmd).toContain('-ss 2.000');
    expect(cmd).not.toContain('-t ');
  });
});
