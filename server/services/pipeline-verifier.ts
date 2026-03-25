/**
 * Pipeline Verifier - Machine-Executable Verification Specs
 *
 * Concrete assertions that verify the pipeline is correctly configured:
 * - Single-clip mode active for lofi
 * - Cost guard enforced with correct limits
 * - Audio reuse on retry is wired up
 * - Stuck job detection has correct timeouts
 * - Gemini is used instead of Anthropic (except error analyzer)
 *
 * Run: npm run verify (add to package.json)
 * Discord: /verify command
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface VerificationResult {
  name: string;
  passed: boolean;
  detail: string;
  category: 'cost' | 'reliability' | 'pipeline' | 'config';
}

class PipelineVerifier {
  private static instance: PipelineVerifier;

  static getInstance(): PipelineVerifier {
    if (!PipelineVerifier.instance) {
      PipelineVerifier.instance = new PipelineVerifier();
    }
    return PipelineVerifier.instance;
  }

  /**
   * Run all verification specs
   */
  async runAll(): Promise<{
    results: VerificationResult[];
    passed: number;
    failed: number;
    summary: string;
  }> {
    const results: VerificationResult[] = [];

    // Cost protection specs
    results.push(await this.verifySingleClipMode());
    results.push(await this.verifyCostGuardLimits());
    results.push(await this.verifyCostGuardIntegration());

    // Reliability specs
    results.push(await this.verifyAudioReuseOnRetry());
    results.push(await this.verifyStuckJobTimeouts());
    results.push(await this.verifyCircuitBreaker());

    // Pipeline specs
    results.push(await this.verifyGeminiSwap());
    results.push(await this.verifyDiscordBot());
    results.push(await this.verifyMockApiAvailable());

    // Config specs
    results.push(await this.verifyEnvSecrets());
    results.push(await this.verifyFFmpeg());
    results.push(await this.verifyScenarioChecker());

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    const summary = failed === 0 ? `All ${passed} specs passed` : `${failed} FAILED, ${passed} passed`;

    return { results, passed, failed, summary };
  }

  /**
   * SPEC: isLongVideo must be forced to false in music-mode-generator.ts
   */
  private async verifySingleClipMode(): Promise<VerificationResult> {
    const filePath = join(process.cwd(), 'server/services/music-mode-generator.ts');
    if (!existsSync(filePath)) {
      return { name: 'single-clip-mode', passed: false, detail: 'File not found', category: 'cost' };
    }

    const content = readFileSync(filePath, 'utf-8');
    const hasForce = content.includes('const isLongVideo = false');

    return {
      name: 'single-clip-mode',
      passed: hasForce,
      detail: hasForce
        ? 'isLongVideo forced to false — single-clip mode active'
        : 'MISSING: isLongVideo is not forced to false — multi-clip Kling will burn credits',
      category: 'cost',
    };
  }

  /**
   * SPEC: Cost guard must have $25/day total, $5/day per service
   */
  private async verifyCostGuardLimits(): Promise<VerificationResult> {
    try {
      const { costGuard } = await import('./cost-guard');
      const limits = costGuard.getLimits();

      const checks = [
        limits.daily <= 25,
        limits.dailyPerService.suno <= 5,
        limits.dailyPerService.kling <= 5,
        limits.dailyPerService.claude <= 5,
      ];

      const allCorrect = checks.every(Boolean);
      return {
        name: 'cost-guard-limits',
        passed: allCorrect,
        detail: allCorrect
          ? `Limits: $${limits.daily}/day total, $${limits.dailyPerService.suno}/suno, $${limits.dailyPerService.kling}/kling`
          : `Limits too high: $${limits.daily}/day (should be ≤$25)`,
        category: 'cost',
      };
    } catch (e: any) {
      return { name: 'cost-guard-limits', passed: false, detail: `Import error: ${e.message}`, category: 'cost' };
    }
  }

  /**
   * SPEC: Cost guard checks must exist before Suno and Kling calls
   */
  private async verifyCostGuardIntegration(): Promise<VerificationResult> {
    const jobWorker = join(process.cwd(), 'server/services/job-worker.ts');
    const musicGen = join(process.cwd(), 'server/services/music-mode-generator.ts');

    const jwContent = existsSync(jobWorker) ? readFileSync(jobWorker, 'utf-8') : '';
    const mgContent = existsSync(musicGen) ? readFileSync(musicGen, 'utf-8') : '';

    const hasSunoGuard = jwContent.includes('cg.canProceed') && jwContent.includes("'suno'");
    const hasKlingGuard = mgContent.includes('cg.canProceed') && mgContent.includes("'kling'");

    const passed = hasSunoGuard && hasKlingGuard;
    return {
      name: 'cost-guard-integration',
      passed,
      detail: passed
        ? 'Cost guards before Suno and Kling calls'
        : `Missing: ${!hasSunoGuard ? 'Suno guard ' : ''}${!hasKlingGuard ? 'Kling guard' : ''}`,
      category: 'cost',
    };
  }

  /**
   * SPEC: Audio reuse on retry must be implemented
   */
  private async verifyAudioReuseOnRetry(): Promise<VerificationResult> {
    const filePath = join(process.cwd(), 'server/services/job-worker.ts');
    const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

    const hasSave = content.includes('file://${stableAudioPath}') || content.includes('file://' + '${stableAudioPath}');
    const hasCheck = content.includes('Reusing existing audio from previous attempt');

    const passed = hasSave && hasCheck;
    return {
      name: 'audio-reuse-on-retry',
      passed,
      detail: passed
        ? 'Audio saved after Suno generation and checked before retry'
        : `Missing: ${!hasSave ? 'audio save ' : ''}${!hasCheck ? 'retry check' : ''}`,
      category: 'reliability',
    };
  }

  /**
   * SPEC: Stuck job detection must have 45min/90min hard timeouts
   */
  private async verifyStuckJobTimeouts(): Promise<VerificationResult> {
    const filePath = join(process.cwd(), 'server/services/job-worker.ts');
    const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

    const has45 = content.includes('45 * 60 * 1000');
    const has90 = content.includes('90 * 60 * 1000');

    const passed = has45 && has90;
    return {
      name: 'stuck-job-timeouts',
      passed,
      detail: passed
        ? '45 min (music) and 90 min (kling) hard timeouts active'
        : `Missing: ${!has45 ? '45min music timeout ' : ''}${!has90 ? '90min kling timeout' : ''}`,
      category: 'reliability',
    };
  }

  /**
   * SPEC: Circuit breaker must be implemented in cost guard
   */
  private async verifyCircuitBreaker(): Promise<VerificationResult> {
    try {
      const { costGuard } = await import('./cost-guard');
      const status = costGuard.getCircuitBreakerStatus();

      return {
        name: 'circuit-breaker',
        passed: true,
        detail: `Circuit breaker active (${Object.keys(status).length} services tracked)`,
        category: 'reliability',
      };
    } catch (e: any) {
      return { name: 'circuit-breaker', passed: false, detail: e.message, category: 'reliability' };
    }
  }

  /**
   * SPEC: strategic-summary-service must NOT import Anthropic
   */
  private async verifyGeminiSwap(): Promise<VerificationResult> {
    const filePath = join(process.cwd(), 'server/services/strategic-summary-service.ts');
    const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

    const hasAnthropic = content.includes("from '@anthropic-ai/sdk'");
    const hasGemini = content.includes("from '@google/generative-ai'");

    return {
      name: 'gemini-swap',
      passed: !hasAnthropic && hasGemini,
      detail: !hasAnthropic
        ? 'Anthropic removed from strategic-summary-service (using Gemini)'
        : 'STILL USING ANTHROPIC in strategic-summary-service — costs $$$',
      category: 'cost',
    };
  }

  /**
   * SPEC: Discord bot file must exist and have slash commands
   */
  private async verifyDiscordBot(): Promise<VerificationResult> {
    const filePath = join(process.cwd(), 'server/services/discord-bot.ts');
    if (!existsSync(filePath)) {
      return { name: 'discord-bot', passed: false, detail: 'discord-bot.ts not found', category: 'config' };
    }

    const content = readFileSync(filePath, 'utf-8');
    const commands = ['status', 'jobs', 'start', 'stop', 'cancel', 'retry', 'generate', 'health', 'costs'];
    const found = commands.filter((cmd) => content.includes(`'${cmd}'`));

    const passed = found.length >= 9;
    return {
      name: 'discord-bot',
      passed,
      detail: passed ? `${found.length} slash commands registered` : `Only ${found.length}/9 commands found`,
      category: 'config',
    };
  }

  /**
   * SPEC: Mock API service must be available
   */
  private async verifyMockApiAvailable(): Promise<VerificationResult> {
    const filePath = join(process.cwd(), 'server/services/mock-api-services.ts');
    const exists = existsSync(filePath);

    return {
      name: 'mock-apis',
      passed: exists,
      detail: exists ? 'Mock Suno/Kling available (MOCK_APIS=true to enable)' : 'mock-api-services.ts not found',
      category: 'pipeline',
    };
  }

  /**
   * SPEC: Required env vars must be set
   */
  private async verifyEnvSecrets(): Promise<VerificationResult> {
    const required = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL'];
    const missing = required.filter((key) => !process.env[key]);

    return {
      name: 'env-secrets',
      passed: missing.length === 0,
      detail:
        missing.length === 0 ? `All ${required.length} required secrets loaded` : `Missing: ${missing.join(', ')}`,
      category: 'config',
    };
  }

  /**
   * SPEC: FFmpeg must be installed
   */
  private async verifyFFmpeg(): Promise<VerificationResult> {
    try {
      const { promisify } = await import('util');
      const { exec } = await import('child_process');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync('ffmpeg -version 2>&1 | head -1');
      return {
        name: 'ffmpeg',
        passed: true,
        detail: stdout.trim().slice(0, 60),
        category: 'config',
      };
    } catch {
      return { name: 'ffmpeg', passed: false, detail: 'FFmpeg not installed', category: 'config' };
    }
  }

  /**
   * SPEC: Post-job scenario checker must exist
   */
  private async verifyScenarioChecker(): Promise<VerificationResult> {
    const filePath = join(process.cwd(), 'server/services/post-job-scenario-checker.ts');
    const exists = existsSync(filePath);

    return {
      name: 'scenario-checker',
      passed: exists,
      detail: exists ? 'Post-job scenario checker active' : 'post-job-scenario-checker.ts not found',
      category: 'pipeline',
    };
  }
}

export const pipelineVerifier = PipelineVerifier.getInstance();
