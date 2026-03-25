/**
 * BeatStars Metadata Generator
 * Generates optimized metadata for BeatStars uploads
 * Prepares beats for bulk CSV import or manual upload
 */

import { storage } from '../storage';
import { existsSync } from 'fs';
import { join } from 'path';

interface BeatStarsMetadata {
  title: string;
  description: string;
  tags: string[];
  bpm: number;
  key?: string;
  genre: string;
  mood: string[];
  instruments: string[];
  pricing: {
    free: boolean;
    mp3Lease: number;
    wavLease: number;
    trackout: number;
    unlimited: number;
    exclusive: number;
  };
  licenses: {
    mp3: { streams: number; audioStreams: number; musicVideos: number; profitShows: number };
    wav: { streams: number; audioStreams: number; musicVideos: number; profitShows: number };
    trackout: { streams: number; audioStreams: number; musicVideos: number; profitShows: number };
    unlimited: { streams: number; audioStreams: number; musicVideos: number; profitShows: number };
  };
  credits: string;
  copyrightYear: number;
  contentID: boolean;
  explicit: boolean;
}

class BeatStarsMetadataGenerator {
  /**
   * Generate complete BeatStars metadata for a beat
   */
  generateMetadata(
    beatName: string,
    bpm: number,
    genre: 'lofi' | 'trap' | 'drill' | 'chillhop',
    artistTags: string[] = [],
    key?: string,
  ): BeatStarsMetadata {
    const year = new Date().getFullYear();
    const isLofi = genre === 'lofi' || genre === 'chillhop';

    // Generate optimized title
    const title = this.generateTitle(beatName, bpm, genre, artistTags);

    // Generate SEO-optimized description
    const description = this.generateDescription(beatName, bpm, genre, artistTags, key);

    // Generate comprehensive tags
    const tags = this.generateTags(beatName, genre, artistTags);

    // Detect mood
    const mood = this.detectMood(genre, bpm);

    // Detect instruments
    const instruments = this.detectInstruments(genre);

    return {
      title,
      description,
      tags,
      bpm,
      key,
      genre: isLofi ? 'Hip Hop & Rap' : 'Hip Hop & Rap',
      mood,
      instruments,
      pricing: this.getDefaultPricing(genre),
      licenses: this.getDefaultLicenses(),
      credits: 'Produced by [Your Producer Name]',
      copyrightYear: year,
      contentID: true, // Enable Content ID protection
      explicit: false,
    };
  }

  /**
   * Generate optimized BeatStars title
   */
  private generateTitle(beatName: string, bpm: number, genre: string, artistTags: string[]): string {
    if (artistTags.length > 0) {
      const artistText = artistTags.slice(0, 2).join(' x ');
      return `${artistText} Type Beat - "${beatName}" | ${bpm} BPM ${this.capitalizeGenre(genre)}`;
    }

    return `"${beatName}" | ${bpm} BPM ${this.capitalizeGenre(genre)} Beat`;
  }

  /**
   * Generate SEO-optimized description for BeatStars
   */
  private generateDescription(
    beatName: string,
    bpm: number,
    genre: string,
    artistTags: string[],
    key?: string,
  ): string {
    const isLofi = genre === 'lofi' || genre === 'chillhop';
    const year = new Date().getFullYear();

    let description = `"${beatName}" - A ${bpm} BPM ${this.capitalizeGenre(genre)} beat perfect for your next track.\n\n`;

    // Artist tags
    if (artistTags.length > 0) {
      description += `🎯 SIMILAR TO: ${artistTags.join(', ')}\n\n`;
    }

    // Beat info
    description += `📊 BEAT INFO:\n`;
    description += `• BPM: ${bpm}\n`;
    if (key) description += `• Key: ${key}\n`;
    description += `• Genre: ${this.capitalizeGenre(genre)}\n`;
    description += `• Year: ${year}\n\n`;

    // Perfect for
    description += `🔥 PERFECT FOR:\n`;
    if (isLofi) {
      description += `• Chill rap verses & storytelling\n`;
      description += `• Study/work background music\n`;
      description += `• Lo-fi hip hop playlists\n`;
      description += `• Introspective & emotional tracks\n\n`;
    } else {
      description += `• Hard rap verses & freestyles\n`;
      description += `• Music videos & TikTok content\n`;
      description += `• Aggressive trap/drill tracks\n`;
      description += `• YouTube shorts & Instagram reels\n\n`;
    }

    // Licensing
    description += `📝 LICENSING:\n`;
    description += `• Free download with credit\n`;
    description += `• MP3 Lease: $29.99 (unlimited streams)\n`;
    description += `• WAV Lease: $59.99 (high quality)\n`;
    description += `• Trackout Stems: $99.99 (full mixing control)\n`;
    description += `• Unlimited License: $149.99 (no restrictions)\n`;
    description += `• Exclusive Rights: $499.99 (you own it 100%)\n\n`;

    // Credits
    description += `✅ USAGE TERMS:\n`;
    description += `• Tag required on free downloads: "Prod. by [Your Name]"\n`;
    description += `• Commercial use allowed with lease\n`;
    description += `• Up to 500K streams on free lease\n`;
    description += `• Exclusive rights transfer full ownership\n\n`;

    // Tags
    description += `🏷️ TAGS:\n`;
    description += `#${genre} #beats #instrumental #typebeat #${year}`;
    if (artistTags.length > 0) {
      description += ` #${artistTags[0].toLowerCase().replace(/\s+/g, '')}`;
    }
    description += `\n\n`;

    // AI disclosure
    description += `⚠️ This beat was created using AI technology.`;

    return description;
  }

  /**
   * Generate comprehensive tags for BeatStars
   */
  private generateTags(beatName: string, genre: string, artistTags: string[]): string[] {
    const tags: string[] = [];

    // Core tags
    tags.push('type beat', genre, 'instrumental', 'beats', 'hip hop', 'rap beat');

    // Genre-specific tags
    if (genre === 'lofi' || genre === 'chillhop') {
      tags.push('lofi', 'chill beats', 'study beats', 'relaxing', 'jazzy', 'smooth', 'nostalgic');
    } else if (genre === 'trap') {
      tags.push('trap', 'hard', '808', 'aggressive', 'dark', 'heavy bass', 'trap beat');
    } else if (genre === 'drill') {
      tags.push('drill', 'uk drill', 'ny drill', 'dark', 'menacing', 'hard hitting');
    }

    // Artist tags
    for (const artist of artistTags) {
      tags.push(`${artist.toLowerCase()} type beat`);
      tags.push(artist.toLowerCase().replace(/\s+/g, ''));
    }

    // Beat name tags
    const nameWords = beatName.toLowerCase().split(/\s+/);
    tags.push(...nameWords.filter((w) => w.length > 3 && !tags.includes(w)));

    // Producer tags
    tags.push('producer', 'beat maker', 'free beat', 'lease');

    // Remove duplicates and return first 20
    return [...new Set(tags)].slice(0, 20);
  }

  /**
   * Detect mood based on genre and BPM
   */
  private detectMood(genre: string, bpm: number): string[] {
    const isLofi = genre === 'lofi' || genre === 'chillhop';

    if (isLofi) {
      if (bpm < 80) return ['Chill', 'Relaxed', 'Mellow', 'Peaceful'];
      if (bpm < 100) return ['Chill', 'Smooth', 'Laid-back', 'Groovy'];
      return ['Upbeat', 'Energetic', 'Feel-good', 'Vibey'];
    } else {
      if (bpm < 140) return ['Dark', 'Moody', 'Atmospheric', 'Brooding'];
      if (bpm < 160) return ['Hard', 'Aggressive', 'Intense', 'Powerful'];
      return ['Fast', 'Energetic', 'Hype', 'Aggressive'];
    }
  }

  /**
   * Detect instruments based on genre
   */
  private detectInstruments(genre: string): string[] {
    const common = ['808', 'Hi-Hats', 'Kick', 'Snare', 'Percussion'];

    if (genre === 'lofi' || genre === 'chillhop') {
      return [...common, 'Piano', 'Rhodes', 'Vinyl Crackle', 'Bass Guitar', 'Jazz Chords'];
    } else if (genre === 'trap') {
      return [...common, 'Synths', 'Brass', 'Bells', 'Strings', 'Pads'];
    } else if (genre === 'drill') {
      return [...common, 'Sliding 808', 'Dark Synths', 'Vocal Chops', 'Reverse Effects'];
    }

    return common;
  }

  /**
   * Get default pricing structure
   */
  private getDefaultPricing(genre: string) {
    return {
      free: true, // Allow free downloads with credit
      mp3Lease: 29.99,
      wavLease: 59.99,
      trackout: 99.99,
      unlimited: 149.99,
      exclusive: 499.99,
    };
  }

  /**
   * Get default license terms
   */
  private getDefaultLicenses() {
    return {
      mp3: {
        streams: 500000, // 500K streams
        audioStreams: 50000,
        musicVideos: 2,
        profitShows: 10,
      },
      wav: {
        streams: 1000000, // 1M streams
        audioStreams: 100000,
        musicVideos: 5,
        profitShows: 25,
      },
      trackout: {
        streams: 2000000, // 2M streams
        audioStreams: 200000,
        musicVideos: 10,
        profitShows: 50,
      },
      unlimited: {
        streams: -1, // Unlimited
        audioStreams: -1,
        musicVideos: -1,
        profitShows: -1,
      },
    };
  }

  /**
   * Export beats to BeatStars CSV format for bulk import
   */
  async exportToCSV(jobIds?: string[]): Promise<string> {
    const jobs = await storage.listJobs();
    const beats = jobs.filter((j) => {
      if (jobIds && !jobIds.includes(j.id)) return false;
      return j.status === 'completed' && j.mode === 'music' && j.videoUrl;
    });

    let csv =
      'Title,BPM,Key,Genre,Mood,Tags,Description,Price MP3,Price WAV,Price Trackout,Price Unlimited,Price Exclusive\n';

    for (const job of beats) {
      const bpmMatch = job.scriptName?.match(/(\d+)\s*BPM/i);
      const bpm = bpmMatch ? parseInt(bpmMatch[1]) : 85;

      const isLofi = /lofi|chillhop/i.test(job.scriptContent || '');
      const genre = isLofi ? 'lofi' : 'trap';

      const beatName =
        job.scriptName
          ?.replace(/\[.*?\]/g, '')
          .replace(/\d+\s*BPM/gi, '')
          .trim() || 'Untitled';

      const metadata = this.generateMetadata(beatName, bpm, genre as any);

      csv += `"${metadata.title}",${metadata.bpm},"${metadata.key || 'N/A'}","${metadata.genre}","${metadata.mood.join(', ')}","${metadata.tags.join(', ')}","${metadata.description.replace(/"/g, '""')}",${metadata.pricing.mp3Lease},${metadata.pricing.wavLease},${metadata.pricing.trackout},${metadata.pricing.unlimited},${metadata.pricing.exclusive}\n`;
    }

    return csv;
  }

  private capitalizeGenre(genre: string): string {
    const map: Record<string, string> = {
      lofi: 'Lofi',
      trap: 'Trap',
      drill: 'Drill',
      chillhop: 'Chillhop',
    };
    return map[genre] || genre;
  }
}

export const beatStarsMetadataGenerator = new BeatStarsMetadataGenerator();
export type { BeatStarsMetadata };
