/**
 * A/B TESTING SERVICE FOR VIDEO STYLES
 *
 * Varies video generation parameters to find what performs best:
 * - Visual style (cinematic, documentary, artistic, raw)
 * - Color grading (warm, cool, desaturated, vivid)
 * - Camera style (static, dynamic, intimate, epic)
 * - Pacing (fast cuts, slow burns, rhythmic)
 *
 * Tracks which variants are used and analyzes performance
 */

export interface StyleVariant {
  id: string;
  name: string;
  description: string;
  visualStyle: 'cinematic' | 'documentary' | 'artistic' | 'raw' | 'epic';
  colorGrade: 'warm_golden' | 'cool_blue' | 'desaturated' | 'vivid' | 'vintage';
  cameraStyle: 'static_composed' | 'dynamic_motion' | 'intimate_close' | 'epic_wide';
  lighting: 'dramatic_shadows' | 'soft_diffused' | 'high_contrast' | 'natural';
  promptModifiers: string[];
  weight: number; // Higher = more likely to be selected
}

export const STYLE_VARIANTS: StyleVariant[] = [
  {
    id: 'classic_documentary',
    name: 'Classic Documentary',
    description: 'BBC/Netflix documentary style with dramatic lighting',
    visualStyle: 'documentary',
    colorGrade: 'desaturated',
    cameraStyle: 'static_composed',
    lighting: 'dramatic_shadows',
    promptModifiers: [
      'BBC documentary cinematography',
      'dramatic chiaroscuro lighting',
      'period-accurate costume details',
      'museum-quality composition',
    ],
    weight: 1,
  },
  {
    id: 'epic_cinematic',
    name: 'Epic Cinematic',
    description: 'Hollywood blockbuster feel with sweeping visuals',
    visualStyle: 'epic',
    colorGrade: 'vivid',
    cameraStyle: 'epic_wide',
    lighting: 'high_contrast',
    promptModifiers: [
      'cinematic widescreen composition',
      'IMAX quality visuals',
      'epic scale and grandeur',
      'blockbuster movie aesthetic',
    ],
    weight: 1,
  },
  {
    id: 'intimate_portrait',
    name: 'Intimate Portrait',
    description: 'Close-up character study with emotional depth',
    visualStyle: 'artistic',
    colorGrade: 'warm_golden',
    cameraStyle: 'intimate_close',
    lighting: 'soft_diffused',
    promptModifiers: [
      'intimate portrait photography',
      'soft Rembrandt lighting',
      'emotional close-up framing',
      'oil painting quality textures',
    ],
    weight: 1,
  },
  {
    id: 'raw_authentic',
    name: 'Raw Authentic',
    description: 'Gritty, realistic look like archival footage',
    visualStyle: 'raw',
    colorGrade: 'vintage',
    cameraStyle: 'dynamic_motion',
    lighting: 'natural',
    promptModifiers: [
      'gritty documentary realism',
      'handheld camera movement',
      'archival footage aesthetic',
      'raw unpolished authenticity',
    ],
    weight: 1,
  },
  {
    id: 'modern_stylized',
    name: 'Modern Stylized',
    description: 'Contemporary artistic interpretation',
    visualStyle: 'cinematic',
    colorGrade: 'cool_blue',
    cameraStyle: 'dynamic_motion',
    lighting: 'high_contrast',
    promptModifiers: [
      'modern cinematic color grade',
      'stylized visual storytelling',
      'contemporary artistic interpretation',
      'social media optimized framing',
    ],
    weight: 1,
  },
];

export interface ABTestAssignment {
  variantId: string;
  variant: StyleVariant;
  assignedAt: Date;
  figure: string;
  jobId?: string;
}

class ABTestingService {
  private assignments: Map<string, ABTestAssignment> = new Map();
  private performanceData: Map<string, { views: number; engagement: number; count: number }> = new Map();

  /**
   * Get a variant by its name (for auto-pilot forced style)
   */
  getVariantByName(name: string): StyleVariant | null {
    const variant = STYLE_VARIANTS.find(
      (v) => v.name.toLowerCase() === name.toLowerCase() || v.id.toLowerCase() === name.toLowerCase(),
    );
    return variant || null;
  }

  /**
   * Select a variant using weighted random selection
   * Adjusts weights based on performance data
   */
  selectVariant(figure: string): StyleVariant {
    const adjustedVariants = this.getAdjustedWeights();
    const totalWeight = adjustedVariants.reduce((sum, v) => sum + v.weight, 0);

    let random = Math.random() * totalWeight;

    for (const variant of adjustedVariants) {
      random -= variant.weight;
      if (random <= 0) {
        this.recordAssignment(figure, variant);
        return variant;
      }
    }

    // Fallback to first variant
    const fallback = adjustedVariants[0];
    this.recordAssignment(figure, fallback);
    return fallback;
  }

  /**
   * Get variants with weights adjusted by performance
   */
  private getAdjustedWeights(): StyleVariant[] {
    return STYLE_VARIANTS.map((variant) => {
      const perf = this.performanceData.get(variant.id);
      let adjustedWeight = variant.weight;

      if (perf && perf.count >= 3) {
        // Boost weight for high-performing variants
        const avgEngagement = perf.engagement / perf.count;
        if (avgEngagement > 5) adjustedWeight *= 1.5;
        else if (avgEngagement > 3) adjustedWeight *= 1.2;
        else if (avgEngagement < 1) adjustedWeight *= 0.8;
      }

      return { ...variant, weight: adjustedWeight };
    });
  }

  private recordAssignment(figure: string, variant: StyleVariant): void {
    const key = `${figure}_${Date.now()}`;
    this.assignments.set(key, {
      variantId: variant.id,
      variant,
      assignedAt: new Date(),
      figure,
    });

    // Cap assignments to prevent unbounded memory growth
    if (this.assignments.size > 500) {
      const firstKey = this.assignments.keys().next().value;
      if (firstKey !== undefined) this.assignments.delete(firstKey);
    }

    console.log(`🎲 A/B Test: Assigned "${variant.name}" style to ${figure}`);
  }

  /**
   * Record performance data for a variant
   */
  recordPerformance(variantId: string, views: number, engagement: number): void {
    const existing = this.performanceData.get(variantId) || { views: 0, engagement: 0, count: 0 };
    this.performanceData.set(variantId, {
      views: existing.views + views,
      engagement: existing.engagement + engagement,
      count: existing.count + 1,
    });

    // Cap performanceData to prevent unbounded growth
    if (this.performanceData.size > 100) {
      const firstKey = this.performanceData.keys().next().value;
      if (firstKey !== undefined) this.performanceData.delete(firstKey);
    }
  }

  /**
   * Apply variant modifiers to a base prompt
   */
  applyVariantToPrompt(basePrompt: string, variant: StyleVariant): string {
    const modifiers = variant.promptModifiers.slice(0, 2).join(', ');

    // Insert style modifiers after the first sentence/phrase
    const firstComma = basePrompt.indexOf(',');
    if (firstComma > 20) {
      return `${basePrompt.slice(0, firstComma)}, ${modifiers}${basePrompt.slice(firstComma)}`;
    }

    return `${basePrompt}, ${modifiers}`;
  }

  /**
   * Get color grading instruction for FFmpeg
   */
  getColorGradeParams(variant: StyleVariant): { saturation: number; contrast: number; brightness: number } {
    switch (variant.colorGrade) {
      case 'warm_golden':
        return { saturation: 1.1, contrast: 1.05, brightness: 0.02 };
      case 'cool_blue':
        return { saturation: 0.95, contrast: 1.1, brightness: -0.02 };
      case 'desaturated':
        return { saturation: 0.7, contrast: 1.15, brightness: 0 };
      case 'vivid':
        return { saturation: 1.3, contrast: 1.1, brightness: 0.03 };
      case 'vintage':
        return { saturation: 0.85, contrast: 1.2, brightness: -0.03 };
      default:
        return { saturation: 1.0, contrast: 1.0, brightness: 0 };
    }
  }

  /**
   * Get all recent assignments for analysis
   */
  getRecentAssignments(limit: number = 20): ABTestAssignment[] {
    const all = Array.from(this.assignments.values());
    return all.slice(-limit);
  }

  /**
   * Get performance summary by variant
   */
  getPerformanceSummary(): {
    variantId: string;
    name: string;
    count: number;
    avgViews: number;
    avgEngagement: number;
  }[] {
    return STYLE_VARIANTS.map((variant) => {
      const perf = this.performanceData.get(variant.id);
      return {
        variantId: variant.id,
        name: variant.name,
        count: perf?.count || 0,
        avgViews: perf && perf.count > 0 ? Math.round(perf.views / perf.count) : 0,
        avgEngagement: perf && perf.count > 0 ? parseFloat((perf.engagement / perf.count).toFixed(2)) : 0,
      };
    });
  }

  /**
   * Get the current variant distribution for display
   */
  getVariantDistribution(): { id: string; name: string; weight: number; description: string }[] {
    const adjusted = this.getAdjustedWeights();
    const totalWeight = adjusted.reduce((sum, v) => sum + v.weight, 0);

    return adjusted.map((v) => ({
      id: v.id,
      name: v.name,
      weight: Math.round((v.weight / totalWeight) * 100),
      description: v.description,
    }));
  }
}

export const abTestingService = new ABTestingService();
