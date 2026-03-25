/**
 * AUDIO PATTERN INTERRUPT SERVICE
 *
 * Analyzes retention curves to predict drop-off points, then inserts
 * audio pattern interrupts (drum fills, bass drops, tempo changes) to
 * "reset" viewer attention BEFORE they drop off.
 *
 * Strategy: If retention drops at second 15, insert a drum fill or
 * bass drop at second 14 to keep the viewer engaged.
 *
 * @example
 * ```typescript
 * const interruptService = new AudioPatternInterruptService();
 *
 * // Analyze where to insert interrupts
 * const interrupts = interruptService.planInterrupts({
 *   retentionCurve: [...], // Historical retention data
 *   duration: 90,
 *   bpm: 85,
 *   genre: 'lofi'
 * });
 *
 * // Generate Suno prompt with interrupts
 * const prompt = interruptService.generateSunoPromptWithInterrupts(interrupts);
 * ```
 */

// ============================================================================
// INTERFACES
// ============================================================================

export interface RetentionPrediction {
  second: number;
  predictedRetention: number;
  dropProbability: number; // 0-1
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AudioInterrupt {
  timestamp: number; // When to insert (seconds)
  type: 'drum_fill' | 'bass_drop' | 'tempo_shift' | 'silence_break' | 'melody_variation';
  reason: string;
  targetSecond: number; // The drop we're preventing
  urgency: number; // 0-1 (how critical this interrupt is)
}

export interface InterruptPlanConfig {
  retentionCurve: Array<{ second: number; retention: number }>; // Historical data
  duration: number; // Video duration in seconds
  bpm: number;
  genre: 'lofi' | 'trap' | 'chill' | 'ambient';
  preventionWindow: number; // Seconds before drop to insert interrupt
}

export interface SunoPromptInterrupts {
  basePrompt: string;
  structureHints: string; // Added to Suno prompt
  timingGuidance: string; // Human-readable for debugging
}

// ============================================================================
// DROP PREDICTION THRESHOLDS
// ============================================================================
const DROP_THRESHOLDS = {
  critical: 15, // > 15% drop is critical
  high: 10, // 10-15% drop is high
  medium: 5, // 5-10% drop is medium
  low: 3, // 3-5% drop is low
};

const INTERRUPT_TYPES = {
  lofi: ['drum_fill', 'bass_drop', 'melody_variation'],
  trap: ['bass_drop', 'drum_fill', 'silence_break'],
  chill: ['melody_variation', 'tempo_shift', 'drum_fill'],
  ambient: ['silence_break', 'melody_variation', 'tempo_shift'],
};

const INTERRUPT_DESCRIPTIONS = {
  drum_fill: 'crisp drum fill with snare rolls',
  bass_drop: 'heavy bass drop with sub frequencies',
  tempo_shift: 'subtle tempo acceleration for 2 bars',
  silence_break: '0.5s silence break then resume with energy',
  melody_variation: 'melodic variation or chord change',
};

/**
 * Audio Pattern Interrupt Service
 */
class AudioPatternInterruptService {
  // ==========================================================================
  // RETENTION PREDICTION
  // ==========================================================================

  /**
   * Predict retention drops using moving average analysis
   */
  private predictDrops(retentionCurve: Array<{ second: number; retention: number }>): RetentionPrediction[] {
    const predictions: RetentionPrediction[] = [];
    const windowSize = 3; // Look at 3-second windows

    for (let i = windowSize; i < retentionCurve.length; i++) {
      const current = retentionCurve[i];
      const previous = retentionCurve[i - windowSize];

      const dropAmount = previous.retention - current.retention;
      const dropRate = dropAmount / windowSize; // % per second

      // Calculate drop probability based on historical patterns
      let dropProbability = 0;
      if (dropRate > 0) {
        // Exponential scaling: faster drops = higher probability
        dropProbability = Math.min(1, (dropRate / 10) * 1.5);
      }

      // Determine severity
      let severity: 'low' | 'medium' | 'high' | 'critical';
      if (dropAmount >= DROP_THRESHOLDS.critical) {
        severity = 'critical';
      } else if (dropAmount >= DROP_THRESHOLDS.high) {
        severity = 'high';
      } else if (dropAmount >= DROP_THRESHOLDS.medium) {
        severity = 'medium';
      } else {
        severity = 'low';
      }

      predictions.push({
        second: current.second,
        predictedRetention: current.retention,
        dropProbability,
        severity,
      });
    }

    return predictions;
  }

  /**
   * Identify critical drop points that need interrupts
   */
  private identifyCriticalDrops(predictions: RetentionPrediction[]): number[] {
    return predictions
      .filter((p) => p.severity === 'high' || p.severity === 'critical')
      .filter((p) => p.dropProbability > 0.3) // Only high-probability drops
      .map((p) => p.second);
  }

  // ==========================================================================
  // INTERRUPT PLANNING
  // ==========================================================================

  /**
   * Plan audio interrupts based on retention predictions
   */
  planInterrupts(config: InterruptPlanConfig): AudioInterrupt[] {
    const { retentionCurve, duration, bpm, genre, preventionWindow = 2 } = config;

    // If no historical data, use default strategy
    if (!retentionCurve || retentionCurve.length === 0) {
      return this.generateDefaultInterrupts(duration, bpm, genre);
    }

    // Predict drops
    const predictions = this.predictDrops(retentionCurve);
    const criticalDrops = this.identifyCriticalDrops(predictions);

    const interrupts: AudioInterrupt[] = [];
    const interruptTypes = INTERRUPT_TYPES[genre] || INTERRUPT_TYPES.lofi;

    console.log(`\n🎵 Planning audio interrupts for ${genre} (${duration}s, ${bpm} BPM)`);
    console.log(`   Identified ${criticalDrops.length} critical drop points`);

    for (const dropSecond of criticalDrops) {
      // Insert interrupt BEFORE the drop
      const interruptSecond = Math.max(0, dropSecond - preventionWindow);

      // Avoid overlapping interrupts (min 8 seconds apart)
      const tooClose = interrupts.some((i) => Math.abs(i.timestamp - interruptSecond) < 8);
      if (tooClose) continue;

      // Select interrupt type (rotate through available types)
      const typeIndex = interrupts.length % interruptTypes.length;
      const type = interruptTypes[typeIndex] as AudioInterrupt['type'];

      const prediction = predictions.find((p) => p.second === dropSecond);
      const urgency = prediction ? prediction.dropProbability : 0.5;

      interrupts.push({
        timestamp: interruptSecond,
        type,
        reason: `Prevent ${prediction?.severity || 'high'} retention drop at ${dropSecond}s`,
        targetSecond: dropSecond,
        urgency,
      });

      console.log(
        `   📍 ${interruptSecond}s: ${type} (prevent drop at ${dropSecond}s, urgency: ${(urgency * 100).toFixed(0)}%)`,
      );
    }

    // Always add interrupts at strategic points if none found
    if (interrupts.length === 0) {
      console.log(`   ℹ️  No critical drops found, using default strategy`);
      return this.generateDefaultInterrupts(duration, bpm, genre);
    }

    return interrupts.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Generate default interrupts when no retention data available
   */
  private generateDefaultInterrupts(duration: number, bpm: number, genre: string): AudioInterrupt[] {
    const interrupts: AudioInterrupt[] = [];
    const interruptTypes = (INTERRUPT_TYPES as Record<string, string[]>)[genre] || INTERRUPT_TYPES.lofi;

    // Formula: Insert interrupt every 15-20 seconds for lofi/chill, 10-15s for trap
    const interval = genre === 'trap' ? 12 : 18;

    for (let t = interval; t < duration - 5; t += interval) {
      const typeIndex = interrupts.length % interruptTypes.length;
      const type = interruptTypes[typeIndex] as AudioInterrupt['type'];

      interrupts.push({
        timestamp: t,
        type,
        reason: 'Maintain engagement (default strategy)',
        targetSecond: t + 2,
        urgency: 0.5,
      });
    }

    console.log(`\n🎵 Generated ${interrupts.length} default interrupts for ${genre}`);
    return interrupts;
  }

  // ==========================================================================
  // SUNO PROMPT GENERATION
  // ==========================================================================

  /**
   * Generate Suno prompt with interrupt structure hints
   */
  generateSunoPromptWithInterrupts(
    basePrompt: string,
    interrupts: AudioInterrupt[],
    duration: number,
  ): SunoPromptInterrupts {
    // Build structure hints for Suno
    const structureElements: string[] = [];

    // Group interrupts by type
    const fillCount = interrupts.filter((i) => i.type === 'drum_fill').length;
    const dropCount = interrupts.filter((i) => i.type === 'bass_drop').length;
    const melodyCount = interrupts.filter((i) => i.type === 'melody_variation').length;

    if (fillCount > 0) {
      structureElements.push(`${fillCount}x drum fills with snare rolls`);
    }
    if (dropCount > 0) {
      structureElements.push(`${dropCount}x bass drops with energy`);
    }
    if (melodyCount > 0) {
      structureElements.push(`melodic variations throughout`);
    }

    // Add dynamic structure hints
    structureElements.push('dynamic arrangement with build-ups');
    structureElements.push('clear section transitions');
    structureElements.push('varied instrumentation');

    const structureHints = structureElements.join(', ');

    // Generate timing guidance (for debugging/logs)
    const timingGuidance = interrupts.map((i) => `${i.timestamp}s: ${i.type} (${i.reason})`).join('\n   ');

    return {
      basePrompt,
      structureHints,
      timingGuidance,
    };
  }

  /**
   * Build complete Suno prompt with interrupts
   */
  buildCompleteSunoPrompt(baseStyle: string, interrupts: AudioInterrupt[], duration: number, bpm: number): string {
    const promptWithInterrupts = this.generateSunoPromptWithInterrupts(baseStyle, interrupts, duration);

    // Combine base style + structure hints
    const completePrompt = `${baseStyle}, ${promptWithInterrupts.structureHints}`;

    console.log(`\n🎤 Suno Prompt with Interrupts:`);
    console.log(`   Base: ${baseStyle}`);
    console.log(`   Structure: ${promptWithInterrupts.structureHints}`);
    console.log(`   Timing guidance:\n   ${promptWithInterrupts.timingGuidance}`);

    return completePrompt;
  }

  // ==========================================================================
  // LEARNING FROM RESULTS
  // ==========================================================================

  /**
   * Analyze if interrupts successfully prevented drops
   */
  analyzeInterruptEffectiveness(
    interrupts: AudioInterrupt[],
    actualRetention: Array<{ second: number; retention: number }>,
  ): {
    totalInterrupts: number;
    successfulInterrupts: number;
    failedInterrupts: number;
    effectiveness: number; // 0-1
  } {
    let successCount = 0;
    let failCount = 0;

    for (const interrupt of interrupts) {
      const targetSecond = interrupt.targetSecond;

      // Check if retention stayed stable after interrupt
      const beforeInterrupt = actualRetention.find((r) => r.second === interrupt.timestamp - 1);
      const afterTarget = actualRetention.find((r) => r.second === targetSecond + 2);

      if (beforeInterrupt && afterTarget) {
        const drop = beforeInterrupt.retention - afterTarget.retention;

        // Success: drop < 5% after interrupt
        if (drop < 5) {
          successCount++;
        } else {
          failCount++;
        }
      }
    }

    const total = successCount + failCount;
    const effectiveness = total > 0 ? successCount / total : 0;

    return {
      totalInterrupts: interrupts.length,
      successfulInterrupts: successCount,
      failedInterrupts: failCount,
      effectiveness,
    };
  }

  /**
   * Recommend interrupt adjustments based on effectiveness
   */
  recommendAdjustments(effectiveness: number, genre: string): string {
    if (effectiveness > 0.7) {
      return `✅ Interrupts working well for ${genre}. Maintain current strategy.`;
    } else if (effectiveness > 0.4) {
      return `⚠️  Moderate effectiveness for ${genre}. Consider increasing interrupt intensity or changing types.`;
    } else {
      return `❌ Low effectiveness for ${genre}. Interrupts not preventing drops. Try different types or increase frequency.`;
    }
  }
}

export const audioPatternInterruptService = new AudioPatternInterruptService();
