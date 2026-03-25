/**
 * Beat Title Generator with A/B Testing
 * Generates type beat titles with artist names for discovery
 */

interface TitleVariation {
  title: string;
  artistTags: string[];
  style: 'single_artist' | 'collab' | 'generic' | 'descriptive';
  confidence: number; // Thompson Sampling score
}

// Popular artists by genre for type beat tags
const LOFI_ARTISTS = [
  'Mac Miller',
  'J Dilla',
  'Nujabes',
  'Kendrick Lamar',
  'Tyler The Creator',
  'Frank Ocean',
  'MF DOOM',
  'Earl Sweatshirt',
  'Joey Badass',
  'Xxxtentacion',
];

const TRAP_ARTISTS = [
  'Travis Scott',
  'Future',
  'Metro Boomin',
  'Drake',
  'Playboi Carti',
  '21 Savage',
  'Lil Uzi Vert',
  'Gunna',
  'Young Thug',
  'Juice WRLD',
  'NBA Youngboy',
  'Polo G',
  'Lil Baby',
  'Roddy Ricch',
  'Pop Smoke',
];

const DRILL_ARTISTS = [
  'Pop Smoke',
  'Fivio Foreign',
  'Sheff G',
  'Chief Keef',
  'King Von',
  'Lil Durk',
  'Central Cee',
  'Headie One',
];

class BeatTitleGenerator {
  /**
   * Generate multiple title variations for A/B testing
   */
  generateTitleVariations(
    beatName: string,
    bpm: number,
    genre: 'lofi' | 'trap' | 'drill',
    year: number = new Date().getFullYear(),
  ): TitleVariation[] {
    const artistPool = this.getArtistPool(genre);
    const variations: TitleVariation[] = [];

    // Variation 1: Single Artist Type Beat
    const artist1 = this.selectRandomArtist(artistPool);
    variations.push({
      title: `${artist1} Type Beat - "${beatName}" | ${bpm} BPM ${genre.charAt(0).toUpperCase() + genre.slice(1)} Instrumental ${year}`,
      artistTags: [artist1],
      style: 'single_artist',
      confidence: 0.5, // Default confidence
    });

    // Variation 2: Collab Type Beat (2 artists)
    const artist2 = this.selectRandomArtist(artistPool, [artist1]);
    variations.push({
      title: `${artist1} x ${artist2} Type Beat - "${beatName}" | ${bpm} BPM ${year}`,
      artistTags: [artist1, artist2],
      style: 'collab',
      confidence: 0.5,
    });

    // Variation 3: Generic with descriptive tags
    variations.push({
      title: `"${beatName}" | ${bpm} BPM ${genre === 'lofi' ? 'Chill' : 'Hard'} ${genre.charAt(0).toUpperCase() + genre.slice(1)} Beat ${year}`,
      artistTags: [],
      style: 'generic',
      confidence: 0.5,
    });

    // Variation 4: Triple artist mega-collab (high search volume)
    const artist3 = this.selectRandomArtist(artistPool, [artist1, artist2]);
    variations.push({
      title: `${artist1} x ${artist2} x ${artist3} Type Beat - "${beatName}"`,
      artistTags: [artist1, artist2, artist3],
      style: 'collab',
      confidence: 0.5,
    });

    return variations;
  }

  /**
   * Select best title variation using Thompson Sampling
   */
  selectBestTitle(variations: TitleVariation[]): TitleVariation {
    // Thompson Sampling: Sample from Beta distribution based on past performance
    let bestVariation = variations[0];
    let highestSample = 0;

    for (const variation of variations) {
      // Beta distribution sampling (simplified)
      const alpha = variation.confidence * 10 + 1; // successes
      const beta = (1 - variation.confidence) * 10 + 1; // failures
      const sample = this.sampleBeta(alpha, beta);

      if (sample > highestSample) {
        highestSample = sample;
        bestVariation = variation;
      }
    }

    return bestVariation;
  }

  /**
   * Generate optimized description with BeatStars link
   */
  generateDescription(
    beatName: string,
    bpm: number,
    genre: string,
    artistTags: string[],
    beatstarsLink: string = 'https://www.beatstars.com/your-store',
  ): string {
    const artistList = artistTags.length > 0 ? artistTags.join(' x ') + ' Type Beat' : `${genre} Beat`;

    return `${beatName} | ${bpm} BPM ${genre} Instrumental

🎵 FREE DOWNLOAD (with credit): ${beatstarsLink}
💰 BUY EXCLUSIVE RIGHTS: ${beatstarsLink}/exclusive
📧 Custom Beats: [Your Email]

━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 PERFECT FOR:
${this.getUseCases(genre)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BEAT INFO:
• BPM: ${bpm}
• Key: [Auto-detected]
• Genre: ${genre.charAt(0).toUpperCase() + genre.slice(1)}
• Duration: [Auto]
${artistTags.length > 0 ? `• Similar to: ${artistTags.join(', ')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ LICENSE TERMS:
• Free download includes credit requirement
• Lease: $10 (unlimited streams)
• Exclusive: Available on BeatStars
• Commercial use allowed with lease

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 FOLLOW FOR DAILY BEATS:
🎵 BeatStars: ${beatstarsLink}
📧 Collabs: [Your Email]

#Shorts #TypeBeat ${artistTags.map((a) => '#' + a.replace(/\s/g, '')).join(' ')} #${genre} #beats #instrumental #freebeat #producer

⚠️ This beat was created using AI technology.`;
  }

  /**
   * Generate SEO-optimized tags
   */
  generateTags(beatName: string, genre: 'lofi' | 'trap' | 'drill', artistTags: string[]): string[] {
    const baseTags = ['type beat', genre, 'instrumental', 'beats', 'hip hop', 'rap beat', 'free beat', 'producer'];

    const artistBasedTags = artistTags.flatMap((artist) => [
      `${artist} type beat`,
      artist.toLowerCase().replace(/\s/g, ''),
    ]);

    const genreTags = {
      lofi: ['lofi', 'chill beats', 'study music', 'chillhop', 'jazz hop'],
      trap: ['trap beat', 'hard beat', '808', 'metro boomin type beat'],
      drill: ['drill beat', 'uk drill', 'nyc drill', 'pop smoke type beat'],
    };

    return [...baseTags, ...artistBasedTags, ...genreTags[genre]].slice(0, 15);
  }

  private getArtistPool(genre: 'lofi' | 'trap' | 'drill'): string[] {
    switch (genre) {
      case 'lofi':
        return LOFI_ARTISTS;
      case 'trap':
        return TRAP_ARTISTS;
      case 'drill':
        return DRILL_ARTISTS;
      default:
        return TRAP_ARTISTS;
    }
  }

  private selectRandomArtist(pool: string[], exclude: string[] = []): string {
    const available = pool.filter((a) => !exclude.includes(a));
    return available[Math.floor(Math.random() * available.length)];
  }

  private getUseCases(genre: string): string {
    const useCases = {
      lofi: `• Study sessions & focus work
• Late night vibes & chill
• Background music for videos
• Podcast intros & outros`,
      trap: `• Rap verses & freestyles
• Music videos & visuals
• TikTok & Instagram content
• Aggressive energy tracks`,
      drill: `• Hard rap vocals
• Street music videos
• High-energy content
• UK/NYC drill vibes`,
    };
    return useCases[genre as keyof typeof useCases] || useCases.trap;
  }

  private sampleBeta(alpha: number, beta: number): number {
    // Simplified Beta distribution sampling
    // In production, use proper implementation
    const gamma1 = this.gammaRandom(alpha);
    const gamma2 = this.gammaRandom(beta);
    return gamma1 / (gamma1 + gamma2);
  }

  private gammaRandom(shape: number): number {
    // Simplified gamma random (Marsaglia and Tsang method)
    if (shape < 1) {
      return this.gammaRandom(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      const x = this.normalRandom();
      const v = Math.pow(1 + c * x, 3);
      if (v > 0) {
        const u = Math.random();
        if (u < 1 - 0.0331 * Math.pow(x, 4)) {
          return d * v;
        }
        if (Math.log(u) < 0.5 * Math.pow(x, 2) + d * (1 - v + Math.log(v))) {
          return d * v;
        }
      }
    }
  }

  private normalRandom(): number {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

export const beatTitleGenerator = new BeatTitleGenerator();
export type { TitleVariation };
