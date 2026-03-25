/**
 * Random Beat Generator - Generates varied instrumental beats
 *
 * Creates random combinations of:
 * - BPM (60-180)
 * - Genre (trap, lofi, phonk, drill, ambient, house, dnb, etc.)
 * - Style tags (atmospheric, aggressive, chill, dark, dreamy, etc.)
 */

interface BeatConfig {
  title: string;
  bpm: number;
  genre: string;
  styleDescription: string;
  targetDuration: number;
}

const GENRES = {
  trap: {
    bpmRange: [130, 160],
    instruments: ['heavy 808 bass', 'crispy hi-hats', 'snare rolls', 'atmospheric synths'],
    moods: ['dark', 'aggressive', 'hypnotic', 'menacing'],
  },
  lofi: {
    bpmRange: [70, 95],
    instruments: ['dusty drums', 'warm bass', 'jazzy chords', 'vinyl crackle'],
    moods: ['chill', 'relaxing', 'nostalgic', 'cozy'],
  },
  phonk: {
    bpmRange: [140, 170],
    instruments: ['distorted 808', 'cowbell', 'Memphis samples', 'heavy bass'],
    moods: ['aggressive', 'dark', 'gritty', 'raw'],
  },
  drill: {
    bpmRange: [135, 155],
    instruments: ['sliding 808s', 'hard-hitting drums', 'ominous synths', 'dark piano'],
    moods: ['dark', 'menacing', 'cold', 'aggressive'],
  },
  ambient: {
    bpmRange: [60, 90],
    instruments: ['ethereal pads', 'soft synths', 'reverb textures', 'subtle bass'],
    moods: ['dreamy', 'atmospheric', 'floating', 'meditative'],
  },
  house: {
    bpmRange: [120, 130],
    instruments: ['four-on-the-floor kick', 'funky bass', 'bright synths', 'vocal chops'],
    moods: ['groovy', 'uplifting', 'energetic', 'danceable'],
  },
  dnb: {
    bpmRange: [160, 180],
    instruments: ['amen break', 'reese bass', 'atmospheric pads', 'fast hi-hats'],
    moods: ['energetic', 'dark', 'intense', 'rolling'],
  },
  synthwave: {
    bpmRange: [100, 120],
    instruments: ['retro synths', '80s drums', 'arpeggiated bass', 'gated reverb'],
    moods: ['nostalgic', 'cinematic', 'neon', 'retro-futuristic'],
  },
};

export class RandomBeatGenerator {
  /**
   * Generate a random beat configuration
   */
  generateRandomBeat(): BeatConfig {
    // Pick random genre
    const genreNames = Object.keys(GENRES);
    const genreName = genreNames[Math.floor(Math.random() * genreNames.length)];
    const genreConfig = GENRES[genreName as keyof typeof GENRES];

    // Random BPM within genre range
    const bpm = Math.floor(
      genreConfig.bpmRange[0] + Math.random() * (genreConfig.bpmRange[1] - genreConfig.bpmRange[0]),
    );

    // Random instruments (pick 3-4)
    const instrumentCount = 3 + Math.floor(Math.random() * 2); // 3 or 4
    const instruments = this.shuffleArray([...genreConfig.instruments]).slice(0, instrumentCount);

    // Random mood (pick 2)
    const moods = this.shuffleArray([...genreConfig.moods]).slice(0, 2);

    // Random additional descriptors
    const additionalDescriptors = [
      'lo-fi aesthetic',
      'high-energy',
      'minimalist',
      'layered textures',
      'punchy drums',
      'smooth vibes',
      'experimental',
      'cinematic',
      'club-ready',
      'bedroom production',
      'professional mix',
      'radio-ready',
    ];
    const descriptor = additionalDescriptors[Math.floor(Math.random() * additionalDescriptors.length)];

    // Build style description
    const styleDescription = `${genreName}, ${bpm} BPM, ${instruments.join(', ')}, ${moods.join(' ')}, ${descriptor}`;

    // Random duration (60-180 seconds)
    const targetDuration = 60 + Math.floor(Math.random() * 121); // 60-180s

    return {
      title: `${genreName.toUpperCase()} Beat ${bpm} BPM`,
      bpm,
      genre: genreName,
      styleDescription,
      targetDuration,
    };
  }

  /**
   * Generate multiple random beats
   */
  generateMultipleBeats(count: number): BeatConfig[] {
    const beats: BeatConfig[] = [];
    const usedGenres = new Set<string>();

    for (let i = 0; i < count; i++) {
      let beat = this.generateRandomBeat();

      // Ensure genre variety (no duplicates if possible)
      let attempts = 0;
      while (usedGenres.has(beat.genre) && attempts < 10) {
        beat = this.generateRandomBeat();
        attempts++;
      }

      usedGenres.add(beat.genre);
      beats.push(beat);
    }

    return beats;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get all available genres
   */
  getGenres(): string[] {
    return Object.keys(GENRES);
  }

  /**
   * Get genre details
   */
  getGenreDetails(genre: string) {
    return GENRES[genre as keyof typeof GENRES] || null;
  }
}

// Singleton export
export const randomBeatGenerator = new RandomBeatGenerator();
