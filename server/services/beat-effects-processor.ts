/**
 * Beat Effects Processor - Generates FFmpeg filters for beat-reactive visual effects
 *
 * Creates dynamic video effects synchronized to beat analysis:
 * - Flash: White flashes on drop points
 * - Zoom: Scale pulses on high-energy segments
 * - Shake: Camera shake on beats
 * - Glow: Brightness follows energy curve
 * - Color Shift: Hue rotation on segment transitions
 */

interface BeatAnalysisData {
  bpm: number;
  beats: number[]; // All beat timestamps
  segments: Array<{
    type: string;
    start: number;
    end: number;
    energy: number;
  }>;
  energyCurve?: Array<[number, number]>; // [(time, energy)]
  dropPoints?: Array<{
    timestamp: number;
    intensity: number;
  }>;
}

export class BeatEffectsProcessor {
  /**
   * Generate complete FFmpeg filtergraph for beat-reactive effects
   */
  generateEffectsFilter(analysis: BeatAnalysisData, videoDuration: number): string {
    const filters: string[] = [];

    // EFFECT 1: Flash on drop points
    if (analysis.dropPoints && analysis.dropPoints.length > 0) {
      const flashFilter = this.createFlashEffect(analysis.dropPoints);
      if (flashFilter) filters.push(flashFilter);
    }

    // EFFECT 2: Zoom pulse on high-energy segments
    const zoomFilter = this.createZoomEffect(analysis.segments);
    if (zoomFilter) filters.push(zoomFilter);

    // EFFECT 3: Camera shake on strong beats
    const shakeFilter = this.createShakeEffect(analysis.beats, analysis.bpm);
    if (shakeFilter) filters.push(shakeFilter);

    // EFFECT 4: Brightness glow following energy curve
    if (analysis.energyCurve && analysis.energyCurve.length > 0) {
      const glowFilter = this.createGlowEffect(analysis.energyCurve, videoDuration);
      if (glowFilter) filters.push(glowFilter);
    }

    // EFFECT 5: Color shift on segment transitions
    const colorShiftFilter = this.createColorShiftEffect(analysis.segments);
    if (colorShiftFilter) filters.push(colorShiftFilter);

    // Combine all filters (apply sequentially)
    return filters.length > 0 ? filters.join(',') : '';
  }

  /**
   * EFFECT 1: White flash on drop points
   * Creates bright flash using eq filter at drop timestamps
   */
  private createFlashEffect(dropPoints: Array<{ timestamp: number; intensity: number }>): string {
    if (dropPoints.length === 0) return '';

    // For each drop, create a flash that fades out over 0.15s
    const flashExpressions = dropPoints.map((drop) => {
      const startTime = drop.timestamp;
      const endTime = drop.timestamp + 0.15; // 150ms flash duration
      const brightness = 0.3 * drop.intensity; // Scale by drop intensity

      // Enable flash between start and end time
      return `between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})`;
    });

    // Combine all drop conditions with OR
    const enableExpression = flashExpressions.join('+');

    return `eq=brightness='if(${enableExpression},0.3,0)':eval=frame`;
  }

  /**
   * EFFECT 2: Zoom pulse on high-energy segments (chorus, drop)
   * Uses zoompan filter for smooth scale transitions
   */
  private createZoomEffect(segments: Array<{ type: string; start: number; end: number; energy: number }>): string {
    // Only zoom on high-energy segments (chorus, drop, outro)
    const highEnergySegments = segments.filter(
      (seg) => (seg.type === 'chorus' || seg.type === 'drop' || seg.type === 'outro') && seg.energy > 0.6,
    );

    if (highEnergySegments.length === 0) return '';

    // Create zoom pulse expression
    // Zoom in slightly (1.05x) during high-energy segments, return to 1.0 elsewhere
    const zoomConditions = highEnergySegments
      .map((seg) => {
        return `between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)})`;
      })
      .join('+');

    // Use zoompan filter with dynamic zoom based on time
    return `zoompan=z='if(${zoomConditions},1.05,1)':d=1:s=1920x1080`;
  }

  /**
   * EFFECT 3: Camera shake on strong beats
   * Uses transform filter to add random shake on every Nth beat
   */
  private createShakeEffect(beats: number[], bpm: number): string {
    if (beats.length === 0) return '';

    // Shake on every 4th beat (once per bar for most music)
    const shakeBeats = beats.filter((_, idx) => idx % 4 === 0);

    if (shakeBeats.length === 0) return '';

    // Create shake expressions (random offset for each beat)
    const shakeExpressions = shakeBeats.map((beatTime) => {
      const shakeDuration = 0.08; // 80ms shake
      const shakeIntensity = 8; // pixels

      // Random offset (alternates between positive and negative)
      const xOffset = (Math.random() > 0.5 ? 1 : -1) * shakeIntensity;
      const yOffset = (Math.random() > 0.5 ? 1 : -1) * shakeIntensity;

      return `if(between(t,${beatTime.toFixed(3)},${(beatTime + shakeDuration).toFixed(3)}),${xOffset},0)`;
    });

    // DISABLED: Shake effect causes FFmpeg filter syntax errors
    // TODO: Implement proper shake using transform or pad filters
    return ''; // Skip shake for now
  }

  /**
   * EFFECT 4: Brightness glow following energy curve
   * Smoothly adjusts brightness based on song energy over time
   */
  private createGlowEffect(energyCurve: Array<[number, number]>, videoDuration: number): string {
    if (energyCurve.length < 2) return '';

    // Sample energy curve at 1-second intervals for FFmpeg expression
    const sampledEnergy: Array<[number, number]> = [];
    for (let t = 0; t < videoDuration; t += 1) {
      // Find nearest energy value
      let closestEnergy = 0.5;
      let minDiff = Infinity;

      for (const [time, energy] of energyCurve) {
        const diff = Math.abs(time - t);
        if (diff < minDiff) {
          minDiff = diff;
          closestEnergy = energy;
        }
      }

      sampledEnergy.push([t, closestEnergy]);
    }

    // Build piecewise brightness expression
    // Map energy (0-1) to brightness adjustment (-0.1 to +0.2)
    const brightnessExpressions = sampledEnergy.map(([time, energy]) => {
      const brightness = -0.1 + energy * 0.3; // Low energy = darker, high energy = brighter
      const nextTime = time + 1;
      return `if(between(t,${time},${nextTime}),${brightness.toFixed(3)},0)`;
    });

    const brightnessFormula = brightnessExpressions.join('+');

    return `eq=brightness='${brightnessFormula}':eval=frame`;
  }

  /**
   * EFFECT 5: Color shift on segment transitions
   * Rotates hue slightly on intro → verse → chorus transitions
   * For lofi/chill content: shifts towards purple/magenta tones
   */
  private createColorShiftEffect(segments: Array<{ type: string; start: number; end: number }>): string {
    if (segments.length < 2) return '';

    // Define hue shifts for each segment type (in degrees, 0-360)
    // Purple/magenta base shifts (40-60 degree range) for lofi aesthetic
    const hueMap: Record<string, number> = {
      intro: 45, // Purple shift
      verse: 50, // Purple-magenta shift
      chorus: 40, // Purple shift (slightly cooler)
      bridge: 55, // Warmer purple shift
      outro: 45, // Purple shift
      drop: 60, // Vibrant purple-magenta shift
    };

    // Build hue rotation expression
    const hueExpressions = segments.map((seg) => {
      const hueShift = hueMap[seg.type] || 0;
      return `if(between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)}),${hueShift},0)`;
    });

    const hueFormula = hueExpressions.join('+');

    return `hue=h='${hueFormula}':s=1.0`; // h = hue rotation, s = saturation (keep original)
  }

  /**
   * Create a simple vignette effect for Music Mode aesthetic
   */
  createVignetteEffect(): string {
    // Darkens edges of video for cinematic look
    return 'vignette=angle=PI/3:mode=forward';
  }

  /**
   * Create a subtle chromatic aberration effect
   * (Separates RGB channels slightly for retro/glitch aesthetic)
   */
  createChromaticAberrationEffect(): string {
    // Split RGB channels and offset them slightly
    return (
      '[0:v]split=3[r][g][b];' +
      '[r]lutrgb=r=val:g=0:b=0[red];' +
      '[g]lutrgb=r=0:g=val:b=0[green];' +
      '[b]lutrgb=r=0:g=0:b=val[blue];' +
      '[red][green]blend=all_mode=addition[rg];' +
      '[rg][blue]blend=all_mode=addition'
    );
  }
}

// Singleton export
export const beatEffectsProcessor = new BeatEffectsProcessor();
