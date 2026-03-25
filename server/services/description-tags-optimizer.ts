/**
 * DESCRIPTION & TAGS OPTIMIZER SERVICE
 *
 * Tracks which keywords, tags, and description patterns correlate
 * with better search discovery and suggested video placement.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface TagPerformance {
  tag: string;
  timesUsed: number;
  totalViews: number;
  totalSearchTraffic: number;
  avgSearchPct: number;
  avgViews: number;
}

interface VideoSEORecord {
  videoId: string;
  title: string;
  tags: string[];
  description: string;
  searchTrafficPct: number;
  browseTrafficPct: number;
  externalTrafficPct: number;
  views24h: number;
  views7d: number;
  ctr: number;
  descriptionPatterns: string[];
}

const TAG_CATEGORIES: Record<string, string[]> = {
  format: ['shorts', 'short', 'rap', 'ai', 'ai generated', 'history rap', 'educational', 'documentary'],
  era: ['ancient', 'medieval', 'modern', 'contemporary', 'historical'],
  theme: ['battle', 'war', 'tragedy', 'triumph', 'mystery', 'scandal', 'rivalry', 'legend', 'epic'],
  domain: ['military', 'science', 'art', 'politics', 'sports', 'royalty', 'exploration', 'religion'],
  emotion: ['epic', 'emotional', 'inspiring', 'dark', 'intense'],
  meta: ['history', 'education', 'facts', 'true story', 'real history'],
};

const CORE_TAGS = ['history', 'shorts', 'historical', 'ai generated', 'educational'];

const CHARACTER_TAGS: Record<string, string[]> = {
  caesar: ['julius caesar', 'rome', 'roman empire', 'ancient rome', 'assassination'],
  cleopatra: ['cleopatra', 'egypt', 'ancient egypt', 'pharaoh', 'queen'],
  napoleon: ['napoleon', 'france', 'french history', 'napoleon bonaparte', 'warfare'],
  spartacus: ['spartacus', 'gladiator', 'slave rebellion', 'rome', 'freedom'],
  alexander: ['alexander the great', 'macedonia', 'conquest', 'ancient greece'],
  tesla: ['nikola tesla', 'inventor', 'electricity', 'genius', 'science'],
  'genghis khan': ['genghis khan', 'mongol', 'mongol empire', 'conquest', 'warrior'],
  krampus: ['krampus', 'christmas', 'christmas demon', 'alpine folklore', 'dark christmas'],
  befana: ['befana', 'italian christmas', 'christmas witch', 'epiphany', 'italian folklore'],
  saturnalia: ['saturnalia', 'rome', 'roman festival', 'christmas origins', 'ancient rome'],
};

class DescriptionTagsOptimizer {
  private dataPath: string;
  private tagStats: Record<string, TagPerformance> = {};
  private videoRecords: Record<string, VideoSEORecord> = {};

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'description_tags_optimizer.json');
    this.loadState();
  }

  recordVideo(
    videoId: string,
    title: string,
    tags: string[],
    description: string,
    searchTrafficPct: number,
    browseTrafficPct: number = 0,
    externalTrafficPct: number = 0,
    views24h: number = 0,
    views7d: number = 0,
    ctr: number = 0,
  ): void {
    const tagsLower = tags.map((t) => t.toLowerCase().trim());
    const patterns = this.analyzeDescription(description);

    const record: VideoSEORecord = {
      videoId,
      title,
      tags: tagsLower,
      description,
      searchTrafficPct,
      browseTrafficPct,
      externalTrafficPct,
      views24h,
      views7d,
      ctr,
      descriptionPatterns: patterns,
    };

    this.videoRecords[videoId] = record;

    for (const tag of tagsLower) {
      if (!this.tagStats[tag]) {
        this.tagStats[tag] = {
          tag,
          timesUsed: 0,
          totalViews: 0,
          totalSearchTraffic: 0,
          avgSearchPct: 0,
          avgViews: 0,
        };
      }

      const stats = this.tagStats[tag];
      stats.timesUsed += 1;
      stats.totalViews += views24h;
      stats.totalSearchTraffic += searchTrafficPct;
      stats.avgSearchPct = stats.totalSearchTraffic / stats.timesUsed;
      stats.avgViews = stats.totalViews / stats.timesUsed;
    }

    console.log(`🏷️ Tags Optimizer: Recorded ${videoId} with ${tagsLower.length} tags`);
    this.saveState();
  }

  private analyzeDescription(description: string): string[] {
    const patterns: string[] = [];
    const descLower = description.toLowerCase();

    const checks: Record<string, boolean> = {
      // @ts-ignore - Unicode regex flag
      has_emoji: /[\u{1F300}-\u{1F9FF}]/u.test(description),
      has_timestamps: /\d+:\d+/.test(description),
      has_cta_subscribe: /subscribe|sub|bell/i.test(descLower),
      has_cta_like: /like|thumbs up/i.test(descLower),
      has_cta_comment: /comment|let me know|tell me/i.test(descLower),
      has_question: description.includes('?'),
      has_hashtags: description.includes('#'),
      has_links: /https?:\/\//i.test(descLower),
      has_chapters: /^\d+:\d+\s+\w/m.test(description),
      length_short: description.length < 200,
      length_medium: description.length >= 200 && description.length < 500,
      length_long: description.length >= 500,
      has_hook: /did you know|what if|imagine|ever wonder/i.test(descLower.slice(0, 100)),
      has_historical_context: /century|year|era|period|bc|ad/i.test(descLower),
    };

    for (const [pattern, present] of Object.entries(checks)) {
      if (present) patterns.push(pattern);
    }

    return patterns;
  }

  getTagRankings(minUses: number = 3): Array<{
    tag: string;
    timesUsed: number;
    avgSearchPct: number;
    avgViews: number;
    searchScore: number;
  }> {
    return Object.values(this.tagStats)
      .filter((t) => t.timesUsed >= minUses)
      .map((t) => ({
        tag: t.tag,
        timesUsed: t.timesUsed,
        avgSearchPct: Math.round(t.avgSearchPct * 1000) / 1000,
        avgViews: Math.round(t.avgViews),
        searchScore: Math.round(((t.avgSearchPct * t.avgViews) / 100) * 100) / 100,
      }))
      .sort((a, b) => b.searchScore - a.searchScore);
  }

  suggestTags(topic: string, character?: string, theme?: string, era?: string, maxTags: number = 15): string[] {
    const suggested = new Set<string>();

    CORE_TAGS.slice(0, 3).forEach((t) => suggested.add(t));

    if (character) {
      const charLower = character.toLowerCase();
      for (const [charKey, charTags] of Object.entries(CHARACTER_TAGS)) {
        if (charLower.includes(charKey) || charKey.includes(charLower)) {
          charTags.slice(0, 4).forEach((t) => suggested.add(t));
          break;
        }
      }
    }

    if (theme && TAG_CATEGORIES.theme.includes(theme.toLowerCase())) {
      suggested.add(theme.toLowerCase());
    }

    if (era && TAG_CATEGORIES.era.includes(era.toLowerCase())) {
      suggested.add(era.toLowerCase());
    }

    const topTags = this.getTagRankings(2);
    for (const tagInfo of topTags.slice(0, 10)) {
      if (suggested.size >= maxTags) break;
      suggested.add(tagInfo.tag);
    }

    const topicWords = topic.toLowerCase().split(/\s+/);
    for (const word of topicWords) {
      if (suggested.size >= maxTags) break;
      if (word.length > 3) suggested.add(word);
    }

    return [...suggested].slice(0, maxTags);
  }

  getTagCorrelations(): {
    topPairs: Array<{ tags: string[]; count: number; avgSearch: number; avgViews: number }>;
    totalPairsAnalyzed: number;
  } {
    const tagPairs: Record<string, { count: number; totalSearch: number; totalViews: number }> = {};

    for (const record of Object.values(this.videoRecords)) {
      const tags = record.tags;
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const pairKey = [tags[i], tags[j]].sort().join('|');
          if (!tagPairs[pairKey]) {
            tagPairs[pairKey] = { count: 0, totalSearch: 0, totalViews: 0 };
          }
          tagPairs[pairKey].count += 1;
          tagPairs[pairKey].totalSearch += record.searchTrafficPct;
          tagPairs[pairKey].totalViews += record.views24h;
        }
      }
    }

    const rankings = Object.entries(tagPairs)
      .filter(([, data]) => data.count >= 2)
      .map(([pair, data]) => ({
        tags: pair.split('|'),
        count: data.count,
        avgSearch: Math.round((data.totalSearch / data.count) * 1000) / 1000,
        avgViews: Math.round(data.totalViews / data.count),
      }))
      .sort((a, b) => b.avgSearch - a.avgSearch);

    return {
      topPairs: rankings.slice(0, 20),
      totalPairsAnalyzed: rankings.length,
    };
  }

  getDescriptionPatternPerformance(): Array<{
    pattern: string;
    count: number;
    avgSearchPct: number;
    avgViews: number;
  }> {
    const patternStats: Record<string, { count: number; totalSearch: number; totalViews: number }> = {};

    for (const record of Object.values(this.videoRecords)) {
      for (const pattern of record.descriptionPatterns) {
        if (!patternStats[pattern]) {
          patternStats[pattern] = { count: 0, totalSearch: 0, totalViews: 0 };
        }
        patternStats[pattern].count += 1;
        patternStats[pattern].totalSearch += record.searchTrafficPct;
        patternStats[pattern].totalViews += record.views24h;
      }
    }

    return Object.entries(patternStats)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        avgSearchPct: Math.round((data.totalSearch / data.count) * 1000) / 1000,
        avgViews: Math.round(data.totalViews / data.count),
      }))
      .sort((a, b) => b.avgSearchPct - a.avgSearchPct);
  }

  generateOptimalDescription(topic: string, character?: string, hookLine?: string): string {
    const lines: string[] = [];

    if (hookLine) {
      lines.push(hookLine);
    } else {
      lines.push(`Discover the untold story of ${topic}.`);
    }

    lines.push('');
    lines.push(`This video explores the fascinating history behind ${topic}.`);
    lines.push('');

    lines.push("📚 WHAT YOU'LL LEARN:");
    lines.push(`• The true story of ${character || topic}`);
    lines.push('• Historical facts that will surprise you');
    lines.push('• Why this story still matters today');
    lines.push('');

    lines.push('🔔 Subscribe for more historical content!');
    lines.push('👍 Like if you learned something new!');
    lines.push('💬 Comment who you want to see next!');
    lines.push('');

    lines.push('#history #shorts #educational #historical');

    return lines.join('\n');
  }

  getStats(): {
    totalVideos: number;
    totalTags: number;
    topTag: { tag: string; searchScore: number } | null;
    avgSearchTraffic: number;
  } {
    const rankings = this.getTagRankings(1);
    const videos = Object.values(this.videoRecords);

    if (videos.length === 0) {
      return {
        totalVideos: 0,
        totalTags: 0,
        topTag: null,
        avgSearchTraffic: 0,
      };
    }

    const avgSearch = videos.reduce((sum, v) => sum + v.searchTrafficPct, 0) / videos.length;

    return {
      totalVideos: videos.length,
      totalTags: Object.keys(this.tagStats).length,
      topTag: rankings.length > 0 ? { tag: rankings[0].tag, searchScore: rankings[0].searchScore } : null,
      avgSearchTraffic: Math.round(avgSearch * 1000) / 1000,
    };
  }

  private saveState(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      const state = {
        tagStats: this.tagStats,
        videoRecords: this.videoRecords,
        savedAt: new Date().toISOString(),
      };
      writeFileSync(this.dataPath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.warn('Could not save Tags Optimizer state');
    }
  }

  private loadState(): void {
    try {
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        if (data.tagStats) this.tagStats = data.tagStats;
        if (data.videoRecords) this.videoRecords = data.videoRecords;
        console.log(
          `🏷️ Tags Optimizer: Loaded ${Object.keys(this.tagStats).length} tags, ${Object.keys(this.videoRecords).length} videos`,
        );
      }
    } catch (error) {
      console.warn('Could not load Tags Optimizer state');
    }
  }
}

export const descriptionTagsOptimizer = new DescriptionTagsOptimizer();
