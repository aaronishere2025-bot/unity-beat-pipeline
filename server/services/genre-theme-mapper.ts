/**
 * Genre Theme Mapper - Maps beat analysis to visual themes for Music Mode
 *
 * Analyzes BPM, energy levels, and musical characteristics to select
 * vibrant, genre-appropriate background themes for AI video generation.
 */

interface BeatAnalysisInput {
  bpm: number;
  key?: string | null;
  segments: Array<{
    type: string;
    energy: number;
  }>;
  energyCurve?: Array<[number, number]>;
  dropPoints?: Array<{ timestamp: number; intensity: number }>;
  metadata?: {
    energyTrend?: string;
  };
}

interface VisualTheme {
  prompt: string;
  category: string;
  keywords: string[];
  description: string;
}

/**
 * Theme library - vibrant, trippy visuals for each genre
 */
const GENRE_THEMES = {
  chill: [
    'calm lake at twilight, soft purple sky reflection, gentle water ripples, peaceful',
    'quiet forest path, purple dusk light filtering through trees, serene atmosphere',
    'simple zen garden, purple twilight glow, minimal composition, tranquil',
    'dark cozy cafe at night, rain on window, soft purple ambient light, calm aesthetic',
    'peaceful mountaintop view, purple sunset gradient, minimal clouds, serene',
    'gentle ocean waves, purple-blue twilight horizon, calm and meditative',
    'quiet meadow at dusk, soft purple sky, simple nature scene, peaceful',
    'minimalist room with plants, purple evening light through window, calm vibe',
    'still pond reflection, purple twilight sky, simple natural beauty, tranquil',
    'quiet city street at dusk, purple sky gradient, minimal activity, peaceful mood',
  ],

  hiphop: [
    'neon city streets at night, urban graffiti, car light trails, cinematic',
    'graffiti covered wall, vibrant spray paint, street art, detailed',
    'lowrider hydraulics bouncing, chrome details, sunset boulevard',
    'gold chains abstract close-up, diamond sparkle, luxury aesthetic',
    'vintage boombox exploding with colorful sound waves, retro 90s',
  ],

  epic: [
    'dramatic mountain peaks, storm clouds, lightning strikes, cinematic 4K',
    'cosmic space nebula, swirling galaxies, stars forming, deep space',
    'viking longship in stormy ocean, dramatic waves, thunder',
    'dragon breathing fire over medieval castle, epic fantasy',
    'ancient battlefield with lightning storm, dramatic atmosphere',
  ],

  trap: [
    'purple lean waves liquid motion, syrupy fluid, hypnotic abstract',
    'diamond rain falling, crystal refractions, luxury sparkle',
    'thick smoke with laser beams cutting through, club atmosphere',
    'flaming skull with fire particles, dark aggressive vibe',
    'chrome liquid dripping, metallic reflections, futuristic abstract',
    'neon butterfly wings slowly flapping, bioluminescent glow, dark background',
    'cosmic jellyfish floating in space, trailing glowing tentacles, vibrant colors',
    'liquid gold flowing and morphing, luxury abstract art, hypnotic motion',
    'electric plasma ball with lightning tendrils, pulsing energy, dark atmosphere',
    'crystalline structures growing and glowing, fractal geometry, vibrant prisms',
  ],

  lofi: [
    'rainy window at night, soft purple ambient lighting, gentle rain droplets, minimalist calm',
    'dark bedroom with purple LED strip lights, simple clean aesthetic, peaceful night',
    'city window view in rain, purple-blue twilight sky, bokeh lights, serene atmosphere',
    'cozy room interior, purple lamp glow, rain on window, simple and quiet',
    'nighttime window with rain, purple sunset gradient, minimal silhouette, peaceful vibe',
    'simple desk setup, purple backlighting, rain outside, calm study atmosphere',
    'dark room with purple mood lighting, rain sounds, minimalist peaceful scene',
    'window overlooking quiet street, purple dusk light, gentle rain, tranquil mood',
    'vinyl player in dim room, soft purple glow, rain ambience, simple aesthetic',
    'rainy night window, purple-tinted clouds, minimal decor, calm and meditative',
  ],

  aggressive: [
    'mosh pit energy, crowd hands up, concert lights, intense',
    'breaking glass explosion in slow motion, dramatic shatter',
    'fire tornado swirling, intense flames, epic destruction',
    'tribal war drums with fire particles, primal energy',
    'beast roaring, aggressive energy, dramatic lighting',
  ],

  electronic: [
    'neon geometric shapes pulsing, synthwave aesthetic, grid lines',
    'laser light show, beam patterns, club atmosphere, vibrant',
    'digital glitch art, data stream, cyberpunk matrix effect',
    'sound waves visualizer, frequency bars, colorful spectrum',
    'holographic particles forming patterns, futuristic abstract',
  ],

  orchestral: [
    'grand symphony hall, golden architecture, dramatic lighting',
    'majestic waterfall, rainbow mist, epic natural beauty',
    'cathedral with light beams through stained glass, divine atmosphere',
    'ancient library with floating books, magical particles',
    'time-lapse storm clouds over plains, dramatic nature',
  ],
};

export class GenreThemeMapper {
  /**
   * Select visual theme based on beat analysis
   * Adds random variations to ensure no two videos look the same
   */
  selectTheme(analysis: BeatAnalysisInput): VisualTheme {
    const genre = this.inferGenre(analysis);
    const themes = GENRE_THEMES[genre] || GENRE_THEMES.lofi;

    // Pick random theme from category
    let basePrompt = themes[Math.floor(Math.random() * themes.length)];

    // ADD RANDOM VARIATIONS to ensure uniqueness
    basePrompt = this.addRandomVariations(basePrompt, analysis);

    return {
      prompt: basePrompt,
      category: genre,
      keywords: this.extractKeywords(basePrompt),
      description: `${genre.toUpperCase()} - ${basePrompt.split(',')[0]}`,
    };
  }

  /**
   * Add random variations to base prompt for uniqueness
   */
  private addRandomVariations(basePrompt: string, analysis: BeatAnalysisInput): string {
    const variations = [];

    // Random camera motion
    const cameraMotions = [
      'slow zoom in',
      'gentle pan right',
      'smooth dolly forward',
      'orbital rotation',
      'floating steadicam',
      'slow zoom out',
    ];
    variations.push(cameraMotions[Math.floor(Math.random() * cameraMotions.length)]);

    // Random time of day (for outdoor scenes)
    if (basePrompt.includes('sun') || basePrompt.includes('sky') || basePrompt.includes('outdoor')) {
      const timeOfDay = ['golden hour', 'blue hour', 'sunset', 'sunrise', 'twilight'][Math.floor(Math.random() * 5)];
      variations.push(timeOfDay);
    }

    // Random color grading based on energy
    const avgEnergy =
      analysis.segments.length > 0
        ? analysis.segments.reduce((sum, seg) => sum + seg.energy, 0) / analysis.segments.length
        : 0.5;

    if (avgEnergy > 0.7) {
      const highEnergyColors = ['vibrant saturated colors', 'neon color palette', 'high contrast', 'vivid hues'];
      variations.push(highEnergyColors[Math.floor(Math.random() * highEnergyColors.length)]);
    } else if (avgEnergy < 0.4) {
      // For lofi/chill content, ALWAYS add purple color grading
      const lowEnergyColors = [
        'purple-blue color grading',
        'deep purple tones',
        'atmospheric purple shadows',
        'purple-tinted highlights',
        'nocturnal purple palette',
      ];
      variations.push(lowEnergyColors[Math.floor(Math.random() * lowEnergyColors.length)]);
    }

    // Random quality enhancers
    const qualityTags = ['cinematic 4K', 'ultra detailed', 'professional grade', 'hyper realistic', '8K resolution'];
    variations.push(qualityTags[Math.floor(Math.random() * qualityTags.length)]);

    // Random mood enhancers
    const moods = ['ethereal atmosphere', 'dreamy vibe', 'mesmerizing', 'captivating', 'hypnotic'];
    variations.push(moods[Math.floor(Math.random() * moods.length)]);

    // Combine base prompt with variations
    return `${basePrompt}, ${variations.join(', ')}`;
  }

  /**
   * Infer genre from beat analysis characteristics
   */
  private inferGenre(analysis: BeatAnalysisInput): keyof typeof GENRE_THEMES {
    const { bpm, segments, dropPoints = [], metadata = {} } = analysis;

    // Calculate average energy
    const avgEnergy = segments.length > 0 ? segments.reduce((sum, seg) => sum + seg.energy, 0) / segments.length : 0.5;

    const hasDrop = dropPoints.length > 0;
    const isBuilding = metadata.energyTrend === 'building';

    // GENRE INFERENCE RULES

    // CHILL / LOFI (60-90 BPM, low energy)
    if (bpm >= 60 && bpm <= 90 && avgEnergy < 0.45) {
      return Math.random() < 0.7 ? 'lofi' : 'chill';
    }

    // TRAP (130-160 BPM, high energy, drops)
    if (bpm >= 130 && bpm <= 160 && avgEnergy > 0.7 && hasDrop) {
      return 'trap';
    }

    // AGGRESSIVE RAP / METAL (140+ BPM, very high energy)
    if (bpm >= 140 && avgEnergy > 0.8) {
      return 'aggressive';
    }

    // EPIC ORCHESTRAL (building energy, wide range)
    if (isBuilding && avgEnergy > 0.6 && avgEnergy < 0.75) {
      return bpm < 100 ? 'orchestral' : 'epic';
    }

    // HIP-HOP (85-110 BPM, medium-high energy)
    if (bpm >= 85 && bpm <= 115 && avgEnergy >= 0.5 && avgEnergy <= 0.7) {
      return 'hiphop';
    }

    // ELECTRONIC / EDM (120-140 BPM, consistent high energy)
    if (bpm >= 115 && bpm <= 145 && avgEnergy > 0.65) {
      return 'electronic';
    }

    // ORCHESTRAL (slower, building, dramatic)
    if (bpm < 85 && (isBuilding || avgEnergy > 0.6)) {
      return 'orchestral';
    }

    // FALLBACK: Chill/lofi for unknown patterns
    return avgEnergy < 0.5 ? 'chill' : 'lofi';
  }

  /**
   * Extract main keywords from prompt
   */
  private extractKeywords(prompt: string): string[] {
    // Split on commas and take first 3 meaningful terms
    const parts = prompt.split(',').map((p) => p.trim());
    return parts.slice(0, 3);
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return Object.keys(GENRE_THEMES);
  }

  /**
   * Get sample themes for a category
   */
  getSampleThemes(category: string): string[] {
    return GENRE_THEMES[category as keyof typeof GENRE_THEMES] || [];
  }
}

// Singleton export
export const genreThemeMapper = new GenreThemeMapper();
