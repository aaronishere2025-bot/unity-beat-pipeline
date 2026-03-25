import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import fs from 'fs/promises';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

const exec = promisify(execCallback);

interface CriticScore {
  persona: string;
  score: number; // 0-20
  weight: number;
  feedback: string;
  killReasons: string[];
}

interface BrutalCritiqueResult {
  totalScore: number; // 0-100
  weightedScore: number; // Weighted total
  verdict: 'ship' | 'minor_fixes' | 'needs_work' | 'kill';
  personas: CriticScore[];
  autoRejectReasons: string[];
  specificIssues: Array<{ timestamp: string; issue: string }>;
  recommendations: string[];
  shouldRegenerate: boolean;
}

export class BrutalShortsCritic {
  /**
   * Main evaluation pipeline
   */
  async evaluateShort(videoPath: string, audioPath?: string): Promise<BrutalCritiqueResult> {
    console.log(`\n🎬 BRUTAL SHORTS CRITIC - Evaluating: ${path.basename(videoPath)}\n`);

    // Pre-flight checks (auto-reject conditions)
    const autoReject = await this.checkAutoRejectConditions(videoPath);
    if (autoReject.length > 0) {
      console.log(`❌ AUTO-REJECT: ${autoReject.join(', ')}\n`);
      return this.buildRejectResult(autoReject);
    }

    // Run 6 personas in parallel
    const [swiper, impatient, loop, sync, clarity, length] = await Promise.all([
      this.evaluateSwiper(videoPath),
      this.evaluateImpatientViewer(videoPath),
      this.evaluateLoopDetector(videoPath),
      this.evaluateSyncCritic(videoPath, audioPath),
      this.evaluateClarityJudge(videoPath),
      this.evaluateLengthOptimizer(videoPath),
    ]);

    const personas = [swiper, impatient, loop, sync, clarity, length];

    // Calculate weighted score
    const weightedScore = personas.reduce((sum, p) => sum + p.score * p.weight, 0);

    const totalScore = personas.reduce((sum, p) => sum + p.score, 0);

    // Determine verdict
    let verdict: 'ship' | 'minor_fixes' | 'needs_work' | 'kill';
    if (weightedScore >= 85) verdict = 'ship';
    else if (weightedScore >= 70) verdict = 'minor_fixes';
    else if (weightedScore >= 55) verdict = 'needs_work';
    else verdict = 'kill';

    // Check if any persona scored below 8
    const belowThreshold = personas.filter((p) => p.score < 8);
    if (belowThreshold.length > 0) {
      verdict = 'kill';
      console.log(`❌ KILL: ${belowThreshold.length} personas scored below 8/20`);
    }

    // Compile recommendations
    const recommendations = this.generateRecommendations(personas, verdict);

    // Log results
    this.logResults(personas, weightedScore, verdict);

    return {
      totalScore,
      weightedScore,
      verdict,
      personas,
      autoRejectReasons: [],
      specificIssues: this.extractSpecificIssues(personas),
      recommendations,
      shouldRegenerate: verdict === 'kill' || verdict === 'needs_work',
    };
  }

  /**
   * PERSONA 1: The Swiper (First 2 Seconds Judge)
   */
  private async evaluateSwiper(videoPath: string): Promise<CriticScore> {
    console.log('👆 The Swiper - Evaluating first 2 seconds...');

    // Extract first frame
    const firstFramePath = `/tmp/first-frame-${Date.now()}.jpg`;
    await exec(`ffmpeg -i "${videoPath}" -vframes 1 -f image2 "${firstFramePath}" -y 2>/dev/null`);

    const imageBuffer = await fs.readFile(firstFramePath);
    const base64Image = imageBuffer.toString('base64');

    const swiperModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json' },
    });
    const swiperResult = await swiperModel.generateContent([
      {
        text: `You are THE SWIPER - a brutal YouTube Shorts critic who decides in 2 seconds if someone keeps scrolling.

Evaluate this FIRST FRAME of a Short. Score 0-20:

SCORING GUIDE:
18-20: Instant attention grab, would STOP mid-scroll
14-17: Strong hook, compelling visuals
10-13: Decent but not irresistible
6-9: Weak, might scroll past
0-5: Instant scroll, boring/confusing

KILL CONDITIONS (auto 0):
- Black frame
- Text-only intro
- Fade in from black
- No action/movement visible

Evaluate:
1. Visual punch (movement, color, composition)
2. Immediate intrigue (what IS this?)
3. Energy level (dynamic vs static)

Return JSON: { "score": 0-20, "feedback": "brief reason", "killReasons": ["if any"] }`,
      },
      { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
    ]);

    const result = JSON.parse(swiperResult.response.text() || '{}');

    // Clean up
    await fs.unlink(firstFramePath).catch(() => {});

    return {
      persona: 'The Swiper',
      score: result.score || 0,
      weight: 0.3,
      feedback: result.feedback || 'No feedback',
      killReasons: result.killReasons || [],
    };
  }

  /**
   * PERSONA 2: The Impatient Viewer (Completion Predictor)
   */
  private async evaluateImpatientViewer(videoPath: string): Promise<CriticScore> {
    console.log('⏱️  The Impatient Viewer - Checking pacing...');

    // Extract 6 evenly-spaced frames
    const duration = await this.getVideoDuration(videoPath);
    const frameInterval = duration / 7;
    const frames: string[] = [];

    for (let i = 1; i <= 6; i++) {
      const timestamp = frameInterval * i;
      const framePath = `/tmp/frame-${i}-${Date.now()}.jpg`;
      await exec(`ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -f image2 "${framePath}" -y 2>/dev/null`);
      frames.push(framePath);
    }

    const frameInlineData = await Promise.all(
      frames.map(async (f) => {
        const buffer = await fs.readFile(f);
        return { inlineData: { data: buffer.toString('base64'), mimeType: 'image/jpeg' } };
      }),
    );

    const impatientModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json' },
    });
    const impatientResult = await impatientModel.generateContent([
      {
        text: `You are THE IMPATIENT VIEWER - you judge if a Short keeps attention throughout.

These are 6 frames evenly spaced across the video. Score 0-20:

SCORING GUIDE:
18-20: Never boring, constant variety, momentum builds
14-17: Good pacing, minor slow moments
10-13: Decent but some drag
6-9: Gets boring, loses steam
0-5: Boring, repetitive, would exit early

Evaluate:
1. Scene variety (do visuals change enough?)
2. Pacing (any dead moments?)
3. Tension maintenance (does energy stay high?)

Return JSON: { "score": 0-20, "feedback": "brief reason", "killReasons": ["if any"] }`,
      },
      ...frameInlineData,
    ]);

    const result = JSON.parse(impatientResult.response.text() || '{}');

    // Clean up
    await Promise.all(frames.map((f) => fs.unlink(f).catch(() => {})));

    return {
      persona: 'The Impatient Viewer',
      score: result.score || 0,
      weight: 0.25,
      feedback: result.feedback || 'No feedback',
      killReasons: result.killReasons || [],
    };
  }

  /**
   * PERSONA 3: The Loop Detector (Replay Potential)
   */
  private async evaluateLoopDetector(videoPath: string): Promise<CriticScore> {
    console.log('🔁 The Loop Detector - Checking replay potential...');

    // Extract last frame
    const lastFramePath = `/tmp/last-frame-${Date.now()}.jpg`;
    await exec(`ffmpeg -sseof -1 -i "${videoPath}" -vframes 1 -f image2 "${lastFramePath}" -y 2>/dev/null`);

    const imageBuffer = await fs.readFile(lastFramePath);
    const base64Image = imageBuffer.toString('base64');

    const loopModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json' },
    });
    const loopResult = await loopModel.generateContent([
      {
        text: `You are THE LOOP DETECTOR - you judge if someone would rewatch this Short.

This is the LAST FRAME. Score 0-20:

SCORING GUIDE:
18-20: Perfect ending, want to rewatch immediately
14-17: Satisfying, might replay
10-13: Okay ending, probably won't replay
6-9: Weak ending, no reason to rewatch
0-5: Flat/confusing, definitely won't replay

Evaluate:
1. Satisfying conclusion (does it stick the landing?)
2. "Wait what?" moments (anything you'd rewatch to catch?)
3. Curiosity gap (did it tease without revealing everything?)

Return JSON: { "score": 0-20, "feedback": "brief reason", "killReasons": ["if any"] }`,
      },
      { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
    ]);

    const result = JSON.parse(loopResult.response.text() || '{}');

    await fs.unlink(lastFramePath).catch(() => {});

    return {
      persona: 'The Loop Detector',
      score: result.score || 0,
      weight: 0.15,
      feedback: result.feedback || 'No feedback',
      killReasons: result.killReasons || [],
    };
  }

  /**
   * PERSONA 4: The Sync Critic (Audio-Visual Marriage)
   */
  private async evaluateSyncCritic(videoPath: string, audioPath?: string): Promise<CriticScore> {
    console.log('🎵 The Sync Critic - Analyzing audio-visual sync...');

    try {
      // If no audio path, extract from video
      let tempAudioPath: string | null = null;
      if (!audioPath) {
        tempAudioPath = `/tmp/audio-${Date.now()}.mp3`;
        await exec(`ffmpeg -i "${videoPath}" -vn -acodec mp3 "${tempAudioPath}" -y 2>/dev/null`);
        audioPath = tempAudioPath;
      }

      // Run Librosa analysis
      const analysisResult = await exec(`python3 scripts/audio_analyzer.py "${audioPath}" 2>/dev/null`);
      const audioAnalysis = JSON.parse(analysisResult.stdout);

      // Check beat alignment
      const bpm = audioAnalysis.bpm;
      const beatInterval = 60 / bpm; // seconds per beat

      // Extract scene changes from video
      const sceneChanges = await this.detectSceneChanges(videoPath);

      // Calculate sync score based on alignment
      const syncScore = this.calculateSyncScore(sceneChanges, beatInterval, audioAnalysis);

      let feedback = '';
      if (syncScore >= 18) feedback = 'Perfectly synced, cuts match beats';
      else if (syncScore >= 14) feedback = 'Good sync, mostly aligned';
      else if (syncScore >= 10) feedback = 'Decent sync, some misalignment';
      else if (syncScore >= 6) feedback = 'Weak sync, feels random';
      else feedback = 'No sync, completely misaligned';

      const killReasons = syncScore < 10 ? ['Sync score below threshold'] : [];

      // Clean up temp audio
      if (tempAudioPath) {
        await fs.unlink(tempAudioPath).catch(() => {});
      }

      return {
        persona: 'The Sync Critic',
        score: syncScore,
        weight: 0.15,
        feedback,
        killReasons,
      };
    } catch (error) {
      console.warn('Sync analysis failed, using fallback score:', error);
      return {
        persona: 'The Sync Critic',
        score: 12, // Neutral fallback
        weight: 0.15,
        feedback: 'Could not analyze sync (audio analysis failed)',
        killReasons: [],
      };
    }
  }

  /**
   * PERSONA 5: The Clarity Judge (Instant Understanding)
   */
  private async evaluateClarityJudge(videoPath: string): Promise<CriticScore> {
    console.log('🔍 The Clarity Judge - Checking instant understanding...');

    // Extract first frame
    const firstFramePath = `/tmp/clarity-frame-${Date.now()}.jpg`;
    await exec(`ffmpeg -i "${videoPath}" -vframes 1 -f image2 "${firstFramePath}" -y 2>/dev/null`);

    const imageBuffer = await fs.readFile(firstFramePath);
    const base64Image = imageBuffer.toString('base64');

    const clarityModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json' },
    });
    const clarityResult = await clarityModel.generateContent([
      {
        text: `You are THE CLARITY JUDGE - can someone understand what this is about in 1 second?

This is the first frame. Score 0-20:

SCORING GUIDE:
18-20: Crystal clear, instant understanding
14-17: Pretty clear, minor ambiguity
10-13: Somewhat clear but needs thought
6-9: Confusing, not obvious
0-5: No idea what this is

Evaluate:
1. Visual storytelling (can you tell what's happening?)
2. Context clues (enough visual info to understand?)
3. Hook clarity (is the "point" obvious?)

Return JSON: { "score": 0-20, "feedback": "brief reason", "killReasons": ["if any"] }`,
      },
      { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
    ]);

    const result = JSON.parse(clarityResult.response.text() || '{}');

    await fs.unlink(firstFramePath).catch(() => {});

    return {
      persona: 'The Clarity Judge',
      score: result.score || 0,
      weight: 0.1,
      feedback: result.feedback || 'No feedback',
      killReasons: result.killReasons || [],
    };
  }

  /**
   * PERSONA 6: The Length Optimizer (Sweet Spot Judge)
   */
  private async evaluateLengthOptimizer(videoPath: string): Promise<CriticScore> {
    console.log('⏱️  The Length Optimizer - Checking duration sweet spot...');

    const duration = await this.getVideoDuration(videoPath);

    // Sweet spot: 30-45 seconds for maximum completion rate
    // Scoring:
    // 30-45s: 18-20 (perfect)
    // 25-30s or 45-50s: 14-17 (good)
    // 20-25s or 50-55s: 10-13 (okay)
    // <20s or 55-60s: 6-9 (suboptimal)
    // >60s: auto-reject

    let score = 0;
    let feedback = '';

    if (duration >= 30 && duration <= 45) {
      score = 20;
      feedback = `Perfect length ${duration.toFixed(1)}s (30-45s sweet spot)`;
    } else if ((duration >= 25 && duration < 30) || (duration > 45 && duration <= 50)) {
      score = 16;
      feedback = `Good length ${duration.toFixed(1)}s (close to sweet spot)`;
    } else if ((duration >= 20 && duration < 25) || (duration > 50 && duration <= 55)) {
      score = 12;
      feedback = `Okay length ${duration.toFixed(1)}s (outside ideal range)`;
    } else if (duration < 20) {
      score = 8;
      feedback = `Too short ${duration.toFixed(1)}s (feels rushed, aim for 30-45s)`;
    } else if (duration <= 60) {
      score = 8;
      feedback = `Too long ${duration.toFixed(1)}s (retention risk, aim for 30-45s)`;
    } else {
      score = 0;
      feedback = `Way too long ${duration.toFixed(1)}s (auto-reject >60s)`;
    }

    const killReasons = duration < 15 ? ['Too short for meaningful content'] : [];

    return {
      persona: 'The Length Optimizer',
      score,
      weight: 0.05,
      feedback,
      killReasons,
    };
  }

  /**
   * Check auto-reject conditions
   */
  private async checkAutoRejectConditions(videoPath: string): Promise<string[]> {
    const reasons: string[] = [];

    try {
      // Check duration (>60 seconds)
      const duration = await this.getVideoDuration(videoPath);
      if (duration > 60) {
        reasons.push(`Video too long: ${duration.toFixed(1)}s (max 60s)`);
      }

      // Check for scene changes in first 5 seconds
      const earlySceneChanges = await this.detectSceneChanges(videoPath, 5);
      if (earlySceneChanges.length === 0) {
        reasons.push('No scene change in first 5 seconds');
      }

      // Check first frame (black/fade)
      const firstFrame = await this.analyzeFirstFrame(videoPath);
      if (firstFrame.isBlack) {
        reasons.push('First frame is black');
      }
      if (firstFrame.isFade) {
        reasons.push('First frame is fade/transition');
      }
    } catch (error) {
      console.warn('Auto-reject check failed:', error);
    }

    return reasons;
  }

  /**
   * Helper: Get video duration
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    const result = await exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    );
    return parseFloat(result.stdout.trim());
  }

  /**
   * Helper: Detect scene changes
   */
  private async detectSceneChanges(videoPath: string, maxDuration?: number): Promise<number[]> {
    try {
      const durationArg = maxDuration ? `-t ${maxDuration}` : '';
      const result = await exec(
        `ffmpeg -i "${videoPath}" ${durationArg} -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep pts_time | sed 's/.*pts_time:\\([0-9.]*\\).*/\\1/'`,
      ).catch(() => ({ stdout: '' }));

      return result.stdout
        .split('\n')
        .filter(Boolean)
        .map(parseFloat)
        .filter((n) => !isNaN(n));
    } catch (error) {
      console.warn('Scene detection failed:', error);
      return [];
    }
  }

  /**
   * Helper: Analyze first frame
   */
  private async analyzeFirstFrame(videoPath: string): Promise<{ isBlack: boolean; isFade: boolean }> {
    try {
      const framePath = `/tmp/first-analyze-${Date.now()}.jpg`;
      await exec(`ffmpeg -i "${videoPath}" -vframes 1 -f image2 "${framePath}" -y 2>/dev/null`);

      // Check average brightness
      const stats = await exec(
        `ffmpeg -i "${framePath}" -vf "scale=1:1,format=gray,cropdetect=24:16:0" -f null - 2>&1 | tail -20`,
      );

      // Simple brightness check - if we can read the file, analyze it
      const buffer = await fs.readFile(framePath);
      const brightness = this.estimateBrightness(buffer);

      await fs.unlink(framePath).catch(() => {});

      return {
        isBlack: brightness < 30, // Very dark
        isFade: brightness < 50, // Probably fading in
      };
    } catch (error) {
      console.warn('First frame analysis failed:', error);
      return { isBlack: false, isFade: false };
    }
  }

  /**
   * Helper: Estimate brightness from JPEG buffer
   */
  private estimateBrightness(buffer: Buffer): number {
    // Simple heuristic: average byte value in first 1000 bytes after JPEG header
    const sampleSize = Math.min(1000, buffer.length);
    let sum = 0;
    for (let i = 100; i < sampleSize; i++) {
      // Skip JPEG header
      sum += buffer[i];
    }
    return sum / (sampleSize - 100);
  }

  /**
   * Helper: Calculate sync score
   */
  private calculateSyncScore(sceneChanges: number[], beatInterval: number, audioAnalysis: any): number {
    if (sceneChanges.length === 0) return 0;

    // Count how many scene changes align with beats (within 0.2s tolerance)
    const tolerance = 0.2;
    let alignedCount = 0;

    for (const change of sceneChanges) {
      const nearestBeat = Math.round(change / beatInterval) * beatInterval;
      if (Math.abs(change - nearestBeat) < tolerance) {
        alignedCount++;
      }
    }

    const alignmentRatio = alignedCount / sceneChanges.length;

    // Convert to 0-20 scale
    return Math.round(alignmentRatio * 20);
  }

  /**
   * Build reject result
   */
  private buildRejectResult(reasons: string[]): BrutalCritiqueResult {
    return {
      totalScore: 0,
      weightedScore: 0,
      verdict: 'kill',
      personas: [],
      autoRejectReasons: reasons,
      specificIssues: reasons.map((r) => ({ timestamp: '0:00', issue: r })),
      recommendations: ['Regenerate from scratch'],
      shouldRegenerate: true,
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(personas: CriticScore[], verdict: string): string[] {
    const recs: string[] = [];

    for (const p of personas) {
      if (p.score < 12) {
        recs.push(`${p.persona}: ${p.feedback}`);
      }
    }

    if (verdict === 'kill') {
      recs.push('RECOMMENDATION: Regenerate entire video');
    } else if (verdict === 'needs_work') {
      recs.push('RECOMMENDATION: Regenerate weak sections');
    } else if (verdict === 'minor_fixes') {
      recs.push('RECOMMENDATION: Consider minor edits, but acceptable');
    }

    return recs;
  }

  /**
   * Extract specific issues with timestamps
   */
  private extractSpecificIssues(personas: CriticScore[]): Array<{ timestamp: string; issue: string }> {
    const issues: Array<{ timestamp: string; issue: string }> = [];

    for (const p of personas) {
      if (p.killReasons.length > 0) {
        for (const reason of p.killReasons) {
          issues.push({
            timestamp: p.persona === 'The Swiper' ? '0:00-0:02' : 'various',
            issue: `[${p.persona}] ${reason}`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Log results
   */
  private logResults(personas: CriticScore[], weightedScore: number, verdict: string) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 BRUTAL SHORTS CRITIC - RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const p of personas) {
      const bar = '█'.repeat(p.score) + '░'.repeat(20 - p.score);
      const emoji = p.score >= 16 ? '✅' : p.score >= 12 ? '⚠️' : '❌';
      console.log(`${emoji} ${p.persona.padEnd(25)} ${p.score}/20 ${bar}`);
      console.log(`   Weight: ${(p.weight * 100).toFixed(0)}% | ${p.feedback}`);
      if (p.killReasons.length > 0) {
        console.log(`   🚫 Kill reasons: ${p.killReasons.join(', ')}`);
      }
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📈 WEIGHTED SCORE: ${weightedScore.toFixed(1)}/100`);

    let verdictEmoji = '';
    let verdictText = '';
    if (verdict === 'ship') {
      verdictEmoji = '✅';
      verdictText = 'SHIP IT - Ready for posting';
    } else if (verdict === 'minor_fixes') {
      verdictEmoji = '⚠️';
      verdictText = 'MINOR FIXES - Probably ship anyway';
    } else if (verdict === 'needs_work') {
      verdictEmoji = '🔧';
      verdictText = 'NEEDS WORK - Regenerate weak sections';
    } else {
      verdictEmoji = '❌';
      verdictText = 'KILL IT - Start over';
    }

    console.log(`${verdictEmoji} VERDICT: ${verdictText}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

export const brutalShortsCritic = new BrutalShortsCritic();
