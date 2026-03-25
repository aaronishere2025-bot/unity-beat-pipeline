/**
 * BEAT METADATA GENERATOR
 *
 * Generates channel-aware metadata for beat uploads
 * - Extracts actual BPM from audio
 * - Adapts tags/description to channel type
 * - Uses genre-specific keywords
 */

export type ChannelType =
  | 'lofi_channel' // Focus: Lofi, chill beats, study music
  | 'trap_channel' // Focus: Trap, hard 808s, rap beats
  | 'boom_bap_channel' // Focus: Boom bap, golden era, SP-404
  | 'phonk_channel' // Focus: Phonk, drift, memphis
  | 'variety_channel' // Focus: All styles, beat compilation
  | 'type_beat_channel' // Focus: Type beats for artists
  | 'ambient_channel' // Focus: Ambient, atmospheric, meditation
  | 'edm_channel'; // Focus: EDM, future bass, electronic

export interface BeatMetadata {
  // Core properties
  bpm: number;
  key?: string;
  duration: number;
  genre: string;
  subgenre?: string;
  mood: string[];
  energy: 'low' | 'medium' | 'high';

  // Style tags
  instrumentTags: string[]; // e.g., "808s", "vinyl crackle", "orchestral"
  productionTags: string[]; // e.g., "hard-hitting", "melodic", "minimal"

  // Use cases
  useCases: string[]; // e.g., "rap freestyle", "study", "workout"
}

export interface ChannelConfig {
  type: ChannelType;
  name: string;
  description: string;
  primaryGenres: string[];
  secondaryGenres?: string[];
  targetAudience: string[];
  uploadSchedule?: string;
}

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  category: string;
  thumbnail?: string;
}

export class BeatMetadataGenerator {
  /**
   * Generate YouTube metadata based on beat properties and channel type
   */
  generateMetadata(beatMeta: BeatMetadata, channelConfig: ChannelConfig, videoPath: string): YouTubeMetadata {
    const title = this.generateTitle(beatMeta, channelConfig);
    const description = this.generateDescription(beatMeta, channelConfig);
    const tags = this.generateTags(beatMeta, channelConfig);

    return {
      title,
      description,
      tags,
      category: '10', // Music
    };
  }

  // AESTHETIC TITLE COMPONENTS (for chill vibe names)
  private aestheticActivities = [
    'studying with headphones on',
    'reading by the window',
    'sipping coffee',
    'working late at night',
    'journaling thoughts',
    'drawing sketches',
    'coding in silence',
    'practicing mindfulness',
    'organizing notes',
    'writing poetry',
    'making art',
    'practicing calligraphy',
    'playing guitar softly',
    'brewing tea',
    'watering plants',
  ];

  private aestheticSettings = [
    'cozy bedroom',
    'quiet library',
    'coffee shop corner',
    'rainy afternoon',
    'sunset picnic',
    'park bench',
    'rooftop view',
    'train ride',
    'empty street',
    'lakeside dock',
    'forest path',
    'balcony garden',
    'city lights',
    'mountain cabin',
    'beach at dusk',
    'autumn park',
  ];

  private aestheticMoods = [
    'peaceful',
    'dreamy',
    'nostalgic',
    'calm',
    'cozy',
    'serene',
    'mellow',
    'tranquil',
    'gentle',
    'soft',
    'warm',
    'quiet',
    'lazy',
    'hazy',
    'ethereal',
    'wistful',
    'tender',
    'drowsy',
  ];

  private aestheticTimes = [
    'evening',
    'morning',
    'midnight',
    'dawn',
    'dusk',
    'afternoon',
    'late night',
    'early morning',
    'golden hour',
    'twilight',
    'sunrise',
    'blue hour',
  ];

  private aestheticWeather = [
    'rainy day',
    'snowy evening',
    'foggy morning',
    'cloudy afternoon',
    'sunny day',
    'misty dawn',
    'clear night',
    'breezy day',
  ];

  /**
   * Generate aesthetic, chill vibe title (USER REQUESTED)
   * Examples: "sunset picnic vibes", "rainy day study session", "midnight coffee thoughts"
   */
  private generateAestheticTitle(beat: BeatMetadata): string {
    const titleType = Math.random();
    const bpm = Math.round(beat.bpm);

    // Type 1: [time/weather] + [activity] (40% chance)
    // e.g., "evening study session", "rainy day reading"
    if (titleType < 0.4) {
      const time =
        Math.random() > 0.5 ? this.randomChoice(this.aestheticTimes) : this.randomChoice(this.aestheticWeather);
      const activity = this.randomChoice(this.aestheticActivities);
      return `${time} ${activity}`;
    }

    // Type 2: [mood] + [setting] (30% chance)
    // e.g., "peaceful coffee shop vibes", "cozy bedroom moments"
    else if (titleType < 0.7) {
      const mood = this.randomChoice(this.aestheticMoods);
      const setting = this.randomChoice(this.aestheticSettings);
      const suffix = Math.random() > 0.5 ? 'vibes' : 'moments';
      return `${mood} ${setting} ${suffix}`;
    }

    // Type 3: [activity] + "in" + [setting] (20% chance)
    // e.g., "studying in cozy bedroom", "reading at sunset picnic"
    else if (titleType < 0.9) {
      const activity = this.randomChoice(this.aestheticActivities);
      const setting = this.randomChoice(this.aestheticSettings);
      return `${activity} in ${setting}`;
    }

    // Type 4: Pure scene description (10% chance)
    // e.g., "sunset picnic", "rainy window view", "midnight city lights"
    else {
      const time = this.randomChoice([...this.aestheticTimes, ...this.aestheticWeather]);
      const setting = this.randomChoice(this.aestheticSettings);
      return `${time} ${setting}`;
    }
  }

  /**
   * Generate title based on channel type
   */
  private generateTitle(beat: BeatMetadata, channel: ChannelConfig): string {
    const bpm = Math.round(beat.bpm);

    switch (channel.type) {
      case 'lofi_channel':
        // LOFI: Use aesthetic scene-based titles (USER REQUESTED)
        const aestheticTitle = this.generateAestheticTitle(beat);
        // Capitalize first letter
        return aestheticTitle.charAt(0).toUpperCase() + aestheticTitle.slice(1);

      case 'chillhop_channel' as any:
        // CHILLHOP: Also use aesthetic titles for chill vibes
        const chillTitle = this.generateAestheticTitle(beat);
        return chillTitle.charAt(0).toUpperCase() + chillTitle.slice(1);

      case 'ambient_channel':
        // AMBIENT: Scene + mood combination
        const ambientTitle = this.generateAestheticTitle(beat);
        return `${ambientTitle.charAt(0).toUpperCase() + ambientTitle.slice(1)} | Ambient`;

      case 'trap_channel':
        // Trap channels emphasize energy and instruments
        return `${beat.genre} Beat - ${beat.instrumentTags[0]} | ${bpm} BPM Hard`;

      case 'boom_bap_channel':
        // Boom bap emphasizes classic/vintage feel
        return `${beat.genre} Beat - Golden Era Style | ${bpm} BPM`;

      case 'phonk_channel':
        // Phonk emphasizes drift/memphis vibes
        return `${beat.genre} Beat - Drift Vibes | ${bpm} BPM Phonk`;

      case 'type_beat_channel':
        // Type beats reference popular artists
        return `[FREE] ${beat.genre} Type Beat "${beat.mood[0]}" | ${bpm} BPM`;

      case 'variety_channel':
        // Variety: Mix of aesthetic and traditional
        if (beat.genre.toLowerCase().includes('lofi') || beat.energy === 'low') {
          const varietyTitle = this.generateAestheticTitle(beat);
          return varietyTitle.charAt(0).toUpperCase() + varietyTitle.slice(1);
        } else {
          return `${beat.genre} Beat - ${beat.mood[0]} Energy | ${bpm} BPM`;
        }

      case 'edm_channel':
        // EDM emphasizes drops and energy
        return `${beat.genre} - ${beat.mood[0]} Drop | ${bpm} BPM ${beat.subgenre || 'EDM'}`;

      default:
        return `${beat.genre} Beat | ${bpm} BPM`;
    }
  }

  /**
   * Random choice helper for aesthetic titles
   */
  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Generate description based on channel type
   */
  private generateDescription(beat: BeatMetadata, channel: ChannelConfig): string {
    const bpm = Math.round(beat.bpm);

    let desc = `🎵 ${beat.genre} Beat\n\n`;

    // Channel-specific intro
    switch (channel.type) {
      case 'lofi_channel':
        desc += `Perfect for studying, relaxing, or creative work. This chill ${beat.genre.toLowerCase()} beat creates the ideal atmosphere for focus and productivity.\n\n`;
        break;
      case 'trap_channel':
        desc += `Hard-hitting ${beat.genre.toLowerCase()} beat with aggressive production. Perfect for rap freestyles, workout sessions, and high-energy content.\n\n`;
        break;
      case 'boom_bap_channel':
        desc += `Classic ${beat.genre.toLowerCase()} beat with that golden era hip hop sound. Dusty drums and smooth samples perfect for real rap.\n\n`;
        break;
      case 'phonk_channel':
        desc += `Dark ${beat.genre.toLowerCase()} beat with memphis rap influences. Perfect for drift videos, car content, and high-octane moments.\n\n`;
        break;
      case 'type_beat_channel':
        desc += `[FREE FOR PROFIT] ${beat.genre} type beat available for purchase. High-quality production perfect for your next hit.\n\n`;
        break;
      default:
        desc += `A ${beat.energy}-energy ${beat.genre.toLowerCase()} beat perfect for various creative uses.\n\n`;
    }

    // Beat specifications
    desc += `🎹 Beat Info:\n`;
    desc += `• BPM: ${bpm}\n`;
    desc += `• Key: ${beat.key || 'Various'}\n`;
    desc += `• Genre: ${beat.genre}${beat.subgenre ? ` / ${beat.subgenre}` : ''}\n`;
    desc += `• Mood: ${beat.mood.join(', ')}\n`;
    desc += `• Energy: ${beat.energy.toUpperCase()}\n`;
    desc += `• Duration: ${Math.floor(beat.duration / 60)}:${Math.floor(beat.duration % 60)
      .toString()
      .padStart(2, '0')}\n\n`;

    // Production features
    if (beat.instrumentTags.length > 0) {
      desc += `📊 Production:\n`;
      beat.instrumentTags.forEach((tag) => {
        desc += `• ${tag}\n`;
      });
      desc += `\n`;
    }

    // Use cases
    if (beat.useCases.length > 0) {
      desc += `Perfect for:\n`;
      beat.useCases.forEach((useCase) => {
        desc += `✅ ${useCase}\n`;
      });
      desc += `\n`;
    }

    // Channel-specific call to action
    switch (channel.type) {
      case 'type_beat_channel':
        desc += `💰 Purchase (Unlimited Lease): [Your Beat Store Link]\n`;
        desc += `💎 Exclusive Rights: [Contact Email]\n\n`;
        desc += `📧 Business: [Your Email]\n\n`;
        break;
      case 'lofi_channel':
        desc += `🔔 Subscribe for daily lofi beats\n`;
        desc += `💬 Comment your study/work goals below!\n\n`;
        break;
      default:
        desc += `🔔 Subscribe for more beats\n`;
        desc += `💬 Let me know what you create with this!\n\n`;
    }

    // Hashtags
    const hashtags = this.generateHashtags(beat, channel);
    desc += hashtags.join(' ');

    return desc;
  }

  /**
   * Generate tags based on beat and channel
   */
  private generateTags(beat: BeatMetadata, channel: ChannelConfig): string[] {
    const tags: string[] = [];
    const bpm = Math.round(beat.bpm);

    // Core genre tags
    tags.push(beat.genre.toLowerCase());
    tags.push(`${beat.genre.toLowerCase()} beat`);
    if (beat.subgenre) {
      tags.push(beat.subgenre.toLowerCase());
    }

    // BPM tag
    tags.push(`${bpm} bpm`);

    // Channel-specific tags
    switch (channel.type) {
      case 'lofi_channel':
        tags.push('lofi hip hop', 'chill beats', 'study music', 'focus music', 'lofi beats');
        tags.push('study beats', 'work music', 'relaxing music', 'chillhop');
        break;

      case 'trap_channel':
        tags.push('trap beat', 'trap music', '808s', 'hard trap', 'rap beat');
        tags.push('trap instrumental', 'hip hop beat', 'trap type beat');
        break;

      case 'boom_bap_channel':
        tags.push('boom bap', 'boom bap beat', 'golden era', 'sp404', '90s hip hop');
        tags.push('underground hip hop', 'real hip hop', 'boom bap instrumental');
        break;

      case 'phonk_channel':
        tags.push('phonk', 'phonk music', 'drift phonk', 'memphis rap', 'cowbell');
        tags.push('drift music', 'phonk beat', 'car music');
        break;

      case 'type_beat_channel':
        tags.push('type beat', 'free beat', 'rap beat', 'free for profit');
        tags.push('beat for sale', 'instrumental', 'producer');
        break;

      case 'ambient_channel':
        tags.push('ambient', 'ambient music', 'meditation', 'soundscape');
        tags.push('atmospheric', 'relaxing', 'peaceful music');
        break;

      case 'edm_channel':
        tags.push('edm', 'electronic', 'dance music', 'future bass');
        tags.push('melodic', 'festival music', 'bass music');
        break;
    }

    // Instrument tags
    beat.instrumentTags.forEach((tag) => {
      tags.push(tag.toLowerCase());
    });

    // Mood tags
    beat.mood.forEach((mood) => {
      tags.push(mood.toLowerCase());
    });

    // Energy-based tags
    if (beat.energy === 'high') {
      tags.push('energetic', 'aggressive', 'hard');
    } else if (beat.energy === 'low') {
      tags.push('chill', 'mellow', 'relaxed');
    }

    // Generic music production tags
    tags.push('beat', 'instrumental', 'producer', 'music production');

    // Remove duplicates and limit to 500 characters (YouTube limit)
    const uniqueTags = [...new Set(tags)];
    return uniqueTags.slice(0, 30); // YouTube allows max 500 chars total
  }

  /**
   * Generate hashtags for description
   */
  private generateHashtags(beat: BeatMetadata, channel: ChannelConfig): string[] {
    const hashtags: string[] = [];

    hashtags.push(`#${beat.genre.toLowerCase().replace(/\s+/g, '')}`);
    hashtags.push('#beats');
    hashtags.push('#instrumental');

    switch (channel.type) {
      case 'lofi_channel':
        hashtags.push('#lofi', '#chillbeats', '#studymusic');
        break;
      case 'trap_channel':
        hashtags.push('#trap', '#808s', '#rapbeat');
        break;
      case 'boom_bap_channel':
        hashtags.push('#boombap', '#hiphop', '#goldenera');
        break;
      case 'phonk_channel':
        hashtags.push('#phonk', '#drift', '#memphis');
        break;
      case 'type_beat_channel':
        hashtags.push('#typebeat', '#freebeat', '#producer');
        break;
    }

    return hashtags;
  }

  /**
   * Extract beat metadata from audio file
   */
  async extractBeatMetadata(audioPath: string, style: string): Promise<BeatMetadata> {
    // This would integrate with beat analyzer
    // For now, parse from style string

    const bpmMatch = style.match(/(\d+)\s*BPM/i);
    const bpm = bpmMatch ? parseInt(bpmMatch[1]) : 120;

    // Determine genre from style
    let genre = 'Hip Hop';
    let subgenre = undefined;
    const styleLower = style.toLowerCase();

    if (styleLower.includes('lofi') || styleLower.includes('lo-fi')) {
      genre = 'Lofi Hip Hop';
      subgenre = 'Chillhop';
    } else if (styleLower.includes('trap')) {
      genre = 'Trap';
      if (styleLower.includes('dark')) subgenre = 'Dark Trap';
      if (styleLower.includes('orchestral')) subgenre = 'Orchestral Trap';
    } else if (styleLower.includes('boom bap')) {
      genre = 'Boom Bap';
      subgenre = 'Golden Era';
    } else if (styleLower.includes('phonk')) {
      genre = 'Phonk';
      subgenre = 'Drift Phonk';
    } else if (styleLower.includes('future bass')) {
      genre = 'Future Bass';
      subgenre = 'Melodic Bass';
    }

    // Determine mood
    const mood: string[] = [];
    if (styleLower.includes('dark') || styleLower.includes('aggressive')) mood.push('Dark');
    if (styleLower.includes('chill') || styleLower.includes('mellow')) mood.push('Chill');
    if (styleLower.includes('epic')) mood.push('Epic');
    if (styleLower.includes('dreamy')) mood.push('Dreamy');
    if (mood.length === 0) mood.push('Energetic');

    // Determine energy based on BPM
    let energy: 'low' | 'medium' | 'high' = 'medium';
    if (bpm < 90) energy = 'low';
    else if (bpm > 130) energy = 'high';

    // Extract instrument tags
    const instrumentTags: string[] = [];
    if (styleLower.includes('808')) instrumentTags.push('Hard 808s');
    if (styleLower.includes('vinyl')) instrumentTags.push('Vinyl Crackle');
    if (styleLower.includes('jazz')) instrumentTags.push('Jazz Samples');
    if (styleLower.includes('orchestral')) instrumentTags.push('Orchestral');
    if (styleLower.includes('synth')) instrumentTags.push('Synth Pads');
    if (styleLower.includes('cowbell')) instrumentTags.push('Cowbell');

    // Production tags
    const productionTags: string[] = [];
    if (styleLower.includes('hard')) productionTags.push('Hard-hitting');
    if (styleLower.includes('melodic')) productionTags.push('Melodic');
    if (styleLower.includes('minimal')) productionTags.push('Minimal');
    if (styleLower.includes('cinematic')) productionTags.push('Cinematic');

    // Use cases based on genre/energy
    const useCases: string[] = [];
    if (genre === 'Lofi Hip Hop') {
      useCases.push('Study sessions', 'Focus work', 'Reading', 'Coding', 'Relaxation');
    } else if (genre === 'Trap' || energy === 'high') {
      useCases.push('Rap freestyles', 'Workout', 'Gaming', 'Hype videos', 'Content creation');
    } else if (genre === 'Phonk') {
      useCases.push('Drift videos', 'Car content', 'Gaming montages', 'Gym workouts');
    } else if (genre === 'Boom Bap') {
      useCases.push('Rap verses', 'Lyrical content', 'Old school vibes', 'Cyphers');
    }

    return {
      bpm,
      duration: 120, // Would be extracted from file
      genre,
      subgenre,
      mood,
      energy,
      instrumentTags,
      productionTags,
      useCases,
    };
  }
}

export const beatMetadataGenerator = new BeatMetadataGenerator();
