/**
 * Artist Visual Mapper
 * Maps artist names to their signature visual aesthetics for Kling generation
 */

interface ArtistVisualStyle {
  artist: string;
  aesthetics: string[];
  colors: string[];
  environments: string[];
  mood: string;
  cameraStyle: string;
}

// Comprehensive artist visual mapping
const ARTIST_VISUAL_STYLES: ArtistVisualStyle[] = [
  // TRAP ARTISTS
  {
    artist: 'Travis Scott',
    aesthetics: ['psychedelic', 'dark carnival', 'astroworld theme park', 'rollercoaster', 'neon cacti'],
    colors: ['brown', 'orange', 'purple', 'neon green'],
    environments: ['Houston streets', 'amusement park at night', 'desert rave', 'cyberpunk rodeo'],
    mood: 'dark energetic trippy',
    cameraStyle: 'distorted fisheye lens, dutch angles, rapid cuts',
  },
  {
    artist: 'Future',
    aesthetics: ['luxury trap', 'purple codeine aesthetic', 'futuristic club', 'VIP section'],
    colors: ['purple', 'black', 'gold', 'neon pink'],
    environments: ['atlanta penthouse', 'strip club neon', 'private jet interior', 'purple rain'],
    mood: 'dark luxurious hypnotic',
    cameraStyle: 'slow motion, wide angle, cinematic',
  },
  {
    artist: 'Drake',
    aesthetics: ['toronto skyline', 'champagne lifestyle', 'ovo owl', 'minimalist luxury'],
    colors: ['gold', 'white', 'black', 'champagne'],
    environments: ['toronto CN tower', 'modern mansion', 'studio with city view', 'private club'],
    mood: 'smooth confident elegant',
    cameraStyle: 'cinematic panning, steady cam, upward angles',
  },
  {
    artist: 'Playboi Carti',
    aesthetics: ['punk vampire', 'red aesthetic', 'gothic fashion', 'rage energy'],
    colors: ['red', 'black', 'white', 'blood red'],
    environments: ['dark alley', 'punk concert', 'gothic castle', 'red-lit warehouse'],
    mood: 'aggressive chaotic punk',
    cameraStyle: 'shaky cam, rapid zoom, distorted',
  },
  {
    artist: '21 Savage',
    aesthetics: ['dark trap', 'street life', 'issa knife meme', 'british flag'],
    colors: ['black', 'red', 'grey', 'dark blue'],
    environments: ['atlanta streets', 'dark studio', 'hood at night', 'luxury car interior'],
    mood: 'menacing cold calculated',
    cameraStyle: 'low angle, steady, intimidating',
  },
  {
    artist: 'Lil Uzi Vert',
    aesthetics: ['anime references', 'pink diamond', 'alien aesthetic', 'rockstar vibe'],
    colors: ['pink', 'purple', 'neon green', 'black'],
    environments: ['anime cityscape', 'space station', 'concert mosh pit', 'luxury car'],
    mood: 'energetic chaotic playful',
    cameraStyle: 'erratic movement, quick cuts, upward angles',
  },
  {
    artist: 'Pop Smoke',
    aesthetics: ['brooklyn drill', 'smoke clouds', 'dior fashion', 'NYC skyline'],
    colors: ['blue', 'black', 'white', 'grey smoke'],
    environments: ['brooklyn streets', 'high-rise view', 'luxury fashion show', 'smoke-filled room'],
    mood: 'aggressive powerful dominant',
    cameraStyle: 'wide angle, low angle, cinematic',
  },
  {
    artist: 'Metro Boomin',
    aesthetics: ['producer vibes', 'dark studio', 'synthesizers', 'cinematic'],
    colors: ['black', 'red', 'purple', 'neon'],
    environments: ['dark music studio', 'mixing board close-up', 'atlanta night', 'cyberpunk city'],
    mood: 'dark atmospheric methodical',
    cameraStyle: 'steady cam, close-ups, slow pan',
  },

  // LOFI ARTISTS
  {
    artist: 'Mac Miller',
    aesthetics: ['colorful nostalgia', 'swimming pools', 'pittsburgh', 'vintage cameras'],
    colors: ['pastel blue', 'yellow', 'pink', 'warm tones'],
    environments: ['cozy studio', 'swimming pool', 'pittsburgh skyline', 'vintage room'],
    mood: 'melancholic nostalgic warm',
    cameraStyle: 'steady smooth pans, warm lighting',
  },
  {
    artist: 'J Dilla',
    aesthetics: ['detroit soul', 'vinyl records', 'MPC drum machine', 'warm analog'],
    colors: ['brown', 'orange', 'gold', 'warm sepia'],
    environments: ['basement studio', 'record store', 'detroit streets', 'analog equipment'],
    mood: 'soulful nostalgic timeless',
    cameraStyle: 'steady close-ups, warm grain',
  },
  {
    artist: 'Nujabes',
    aesthetics: ['tokyo streets', 'samurai champloo', 'cherry blossoms', 'vinyl aesthetic'],
    colors: ['purple', 'blue', 'pink cherry', 'sepia'],
    environments: ['tokyo night', 'cherry blossom park', 'traditional japanese room', 'record shop'],
    mood: 'peaceful contemplative japanese',
    cameraStyle: 'smooth panning, cinematic, serene',
  },
  {
    artist: 'Tyler The Creator',
    aesthetics: ['pastel golf wang', 'vintage cars', 'flowers', 'igor mask'],
    colors: ['pastel pink', 'mint green', 'yellow', 'baby blue'],
    environments: ['flower field', 'vintage car show', 'pastel room', 'golf course'],
    mood: 'creative colorful playful',
    cameraStyle: 'centered framing, vivid colors',
  },
  {
    artist: 'Earl Sweatshirt',
    aesthetics: ['dark introspective', 'NYC streets', 'vinyl records', 'smoke'],
    colors: ['black', 'grey', 'dark brown', 'muted tones'],
    environments: ['dark apartment', 'NYC subway', 'record shop', 'dimly lit studio'],
    mood: 'introspective dark contemplative',
    cameraStyle: 'handheld shaky, dim lighting',
  },
  {
    artist: 'Kendrick Lamar',
    aesthetics: ['compton streets', 'butterfly symbolism', 'crown', 'social commentary'],
    colors: ['red', 'black', 'gold', 'sepia'],
    environments: ['compton neighborhood', 'studio with symbolism', 'city rooftop', 'cultural imagery'],
    mood: 'powerful conscious storytelling',
    cameraStyle: 'cinematic wide shots, meaningful framing',
  },
  {
    artist: 'Frank Ocean',
    aesthetics: ['blonde aesthetic', 'ocean waves', 'minimalist luxury', 'nostalgia'],
    colors: ['blonde yellow', 'ocean blue', 'white', 'warm sepia'],
    environments: ['beach sunset', 'minimalist room', 'vintage car interior', 'ocean view'],
    mood: 'introspective dreamy emotional',
    cameraStyle: 'steady cinematic, soft focus',
  },
  {
    artist: 'MF DOOM',
    aesthetics: ['metal mask', 'comic book aesthetic', 'villain theme', 'underground'],
    colors: ['grey metal', 'green', 'black', 'comic book colors'],
    environments: ['underground lair', 'comic book panels', 'dark laboratory', 'metal workshop'],
    mood: 'mysterious villain underground',
    cameraStyle: 'comic book angles, dramatic lighting',
  },
  {
    artist: 'Xxxtentacion',
    aesthetics: ['half black half blonde', 'sad aesthetic', 'lightning', 'duality'],
    colors: ['black', 'white', 'blue lightning', 'red'],
    environments: ['dark room', 'rain and lightning', 'split screen duality', 'melancholic space'],
    mood: 'emotional dark aggressive',
    cameraStyle: 'dramatic lighting, split compositions',
  },
];

class ArtistVisualMapper {
  /**
   * Generate Kling-optimized prompt based on artist aesthetic
   */
  generateVisualPrompt(artistTags: string[], genre: string, energy: 'low' | 'medium' | 'high'): string {
    if (artistTags.length === 0) {
      return this.getGenericPrompt(genre, energy);
    }

    // Find visual style for first artist
    const primaryArtist = artistTags[0];
    const visualStyle = ARTIST_VISUAL_STYLES.find((s) => s.artist.toLowerCase() === primaryArtist.toLowerCase());

    if (!visualStyle) {
      return this.getGenericPrompt(genre, energy);
    }

    // Select random aesthetic elements
    const aesthetic = this.selectRandom(visualStyle.aesthetics);
    const color = this.selectRandom(visualStyle.colors);
    const environment = this.selectRandom(visualStyle.environments);

    // Build Kling-optimized prompt
    const prompt = `${environment}, ${aesthetic}, ${color} color grading, ${visualStyle.mood} mood, ${visualStyle.cameraStyle}, cinematic 4K, music video aesthetic, ${primaryArtist} style visuals`;

    return prompt;
  }

  /**
   * Generate multiple varied prompts for a single beat
   */
  generateMultiplePrompts(artistTags: string[], genre: string, clipCount: number = 4): string[] {
    const prompts: string[] = [];

    if (artistTags.length === 0) {
      // No artist tags - generate generic varied prompts
      for (let i = 0; i < clipCount; i++) {
        const energy = i % 3 === 0 ? 'low' : i % 3 === 1 ? 'medium' : 'high';
        prompts.push(this.getGenericPrompt(genre, energy));
      }
      return prompts;
    }

    const primaryArtist = artistTags[0];
    const visualStyle = ARTIST_VISUAL_STYLES.find((s) => s.artist.toLowerCase() === primaryArtist.toLowerCase());

    if (!visualStyle) {
      return this.generateMultiplePrompts([], genre, clipCount);
    }

    // Generate varied prompts using different aesthetic elements
    for (let i = 0; i < clipCount; i++) {
      const aesthetic = visualStyle.aesthetics[i % visualStyle.aesthetics.length];
      const color = visualStyle.colors[i % visualStyle.colors.length];
      const environment = visualStyle.environments[i % visualStyle.environments.length];

      const prompt = `${environment}, ${aesthetic}, ${color} color grading, ${visualStyle.mood} atmosphere, ${visualStyle.cameraStyle}, cinematic 4K, professional music video, ${primaryArtist} aesthetic`;

      prompts.push(prompt);
    }

    return prompts;
  }

  /**
   * Get generic prompt for when no artist match found
   */
  private getGenericPrompt(genre: string, energy: 'low' | 'medium' | 'high'): string {
    const genericPrompts = {
      lofi: {
        low: 'cozy bedroom with rain on window, purple LED lights, vinyl records, peaceful night vibes, warm color grading',
        medium:
          'tokyo street at night, neon signs reflection in puddles, lofi hip hop aesthetic, purple and blue tones',
        high: 'energetic study session, colorful notes and books, dynamic lighting, motivated atmosphere',
      },
      trap: {
        low: 'dark luxury car interior, purple LED underglow, night city bokeh, expensive vibes',
        medium: 'neon city streets, cyberpunk aesthetic, 808 bass energy, purple and pink lighting',
        high: 'high energy club scene, strobe lights, bass drop visuals, aggressive trap aesthetic',
      },
      drill: {
        low: 'dark alley at night, smoke and shadows, street lights, menacing atmosphere',
        medium: 'urban rooftop, city skyline, drill aesthetic, blue and grey color grading',
        high: 'aggressive street scene, rapid camera movement, UK/NYC drill vibes, intense energy',
      },
    };

    return genericPrompts[genre as keyof typeof genericPrompts]?.[energy] || genericPrompts.trap.medium;
  }

  private selectRandom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Get all artists with visual mappings
   */
  getAllMappedArtists(): string[] {
    return ARTIST_VISUAL_STYLES.map((s) => s.artist);
  }
}

export const artistVisualMapper = new ArtistVisualMapper();
export type { ArtistVisualStyle };
