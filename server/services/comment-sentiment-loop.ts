/**
 * COMMENT SENTIMENT LOOP SERVICE
 *
 * Analyzes YouTube comment sentiment and content to understand
 * what resonates emotionally with viewers.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface CommentAnalysis {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  emotionalMarkers: string[];
  emotionIntensity: number;
  isRequest: boolean;
  requestTopic: string | null;
  mentionedCharacters: string[];
  engagementQuality: 'thoughtful' | 'simple' | 'spam';
  wordCount: number;
}

interface VideoCommentSummary {
  videoId: string;
  totalComments: number;
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  avgSentiment: number;
  emotionalCommentPct: number;
  topEmotions: Array<[string, number]>;
  characterMentions: Record<string, number>;
  contentRequests: string[];
  thoughtfulPct: number;
  avgWordCount: number;
}

const POSITIVE_WORDS = new Set([
  'amazing',
  'awesome',
  'love',
  'loved',
  'great',
  'best',
  'incredible',
  'beautiful',
  'perfect',
  'fantastic',
  'epic',
  'fire',
  'goat',
  'masterpiece',
  'brilliant',
  'genius',
  'wow',
  'insane',
  'sick',
  'legendary',
  'goosebumps',
  'chills',
  'crying',
  'tears',
  'subscribed',
  'underrated',
  'blessed',
  'peak',
  'dope',
  'lit',
  'slaps',
  'banger',
  'heat',
]);

const NEGATIVE_WORDS = new Set([
  'bad',
  'terrible',
  'awful',
  'hate',
  'boring',
  'worst',
  'trash',
  'cringe',
  'mid',
  'disappointing',
  'waste',
  'fake',
  'wrong',
  'inaccurate',
  'clickbait',
  'dislike',
  'unsubscribed',
  'garbage',
  'stupid',
  'dumb',
  'lame',
  'weak',
  'sucks',
  'wack',
]);

const EMOTIONAL_MARKERS: Record<string, string[]> = {
  chills: ['chills', 'shivers', 'goosebumps', 'hair standing'],
  moved: ['crying', 'tears', 'tear up', 'emotional', 'moved', 'touched'],
  excited: ['hyped', 'pumped', "can't wait", 'so excited', "let's go"],
  impressed: ['mind blown', 'blown away', 'speechless', 'jaw dropped'],
  nostalgic: ['memories', 'takes me back', 'nostalgic', 'remember when'],
  inspired: ['inspired', 'motivation', 'inspiring', 'motivated'],
};

const KNOWN_FIGURES = new Set([
  'caesar',
  'julius caesar',
  'cleopatra',
  'napoleon',
  'spartacus',
  'alexander',
  'alexander the great',
  'genghis khan',
  'tesla',
  'nikola tesla',
  'einstein',
  'marie curie',
  'joan of arc',
  'hannibal',
  'washington',
  'lincoln',
  'queen victoria',
  'henry viii',
  'elizabeth',
  'nero',
  'augustus',
  'marcus aurelius',
  'attila',
  'saladin',
  'richard',
  'william wallace',
  'boudicca',
  'ramses',
  'tutankhamun',
  'nefertiti',
  'socrates',
  'plato',
  'aristotle',
  'da vinci',
  'michelangelo',
  'beethoven',
  'mozart',
  'bach',
  'van gogh',
  'picasso',
  'flo-jo',
  'florence griffith',
  'muhammad ali',
  'bruce lee',
]);

const REQUEST_PATTERNS = [
  /do\s+(?:one\s+)?(?:on|about|for)\s+(.+?)(?:\?|!|$)/i,
  /(?:can|could|please|pls)\s+(?:you\s+)?(?:do|make|cover)\s+(.+?)(?:\?|!|$)/i,
  /(?:we\s+)?need\s+(?:a\s+)?(?:video\s+)?(?:on|about)\s+(.+?)(?:\?|!|$)/i,
  /(?:do|make)\s+(.+?)\s+next(?:\?|!|$)/i,
  /waiting\s+for\s+(.+)/i,
  /where(?:'s| is)\s+(.+?)(?:\?|!|$)/i,
];

class CommentSentimentLoop {
  private dataPath: string;
  private videoComments: Record<string, CommentAnalysis[]> = {};
  private characterSentiment: Record<string, number[]> = {};
  private allRequests: Array<{ topic: string; videoId: string; count: number }> = [];

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'comment_sentiment.json');
    this.loadState();
  }

  analyzeComment(text: string): CommentAnalysis {
    const textLower = text.toLowerCase();
    const words = textLower.split(/\s+/);

    const [sentiment, sentimentScore] = this.analyzeSentiment(textLower, words);
    const [emotionalMarkers, emotionIntensity] = this.findEmotionalMarkers(textLower, text);
    const [isRequest, requestTopic] = this.findRequest(textLower);
    const mentionedCharacters = this.findCharacters(textLower);
    const engagementQuality = this.assessQuality(text, words);

    return {
      text,
      sentiment,
      sentimentScore: Math.round(sentimentScore * 1000) / 1000,
      emotionalMarkers,
      emotionIntensity: Math.round(emotionIntensity * 1000) / 1000,
      isRequest,
      requestTopic,
      mentionedCharacters,
      engagementQuality,
      wordCount: words.length,
    };
  }

  private analyzeSentiment(text: string, words: string[]): ['positive' | 'negative' | 'neutral', number] {
    let positiveCount = words.filter((w) => POSITIVE_WORDS.has(w)).length;
    let negativeCount = words.filter((w) => NEGATIVE_WORDS.has(w)).length;

    const positivePatterns = ['goes hard', 'hits different', 'so good', 'too good'];
    const negativePatterns = ['makes no sense', "doesn't make sense", 'so bad'];

    for (const phrase of positivePatterns) {
      if (text.includes(phrase)) positiveCount += 2;
    }
    for (const phrase of negativePatterns) {
      if (text.includes(phrase)) negativeCount += 2;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) return ['neutral', 0];

    let score = (positiveCount - negativeCount) / Math.max(total, 1);
    score = Math.max(-1, Math.min(1, score));

    if (score > 0.2) return ['positive', score];
    if (score < -0.2) return ['negative', score];
    return ['neutral', score];
  }

  private findEmotionalMarkers(textLower: string, original: string): [string[], number] {
    const found: string[] = [];

    for (const [emotion, keywords] of Object.entries(EMOTIONAL_MARKERS)) {
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          found.push(emotion);
          break;
        }
      }
    }

    const exclamationCount = (original.match(/!/g) || []).length;
    const capsRatio = (original.match(/[A-Z]/g) || []).length / Math.max(original.length, 1);
    const intensity = Math.min(1.0, found.length * 0.3 + exclamationCount * 0.1 + capsRatio);

    return [[...new Set(found)], intensity];
  }

  private findRequest(text: string): [boolean, string | null] {
    for (const pattern of REQUEST_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const topic = match[1].trim().replace(/[^\w\s]/g, '');
        if (topic.length > 2) {
          return [true, topic];
        }
      }
    }
    return [false, null];
  }

  private findCharacters(text: string): string[] {
    const found: string[] = [];
    for (const figure of KNOWN_FIGURES) {
      if (text.includes(figure)) {
        found.push(
          figure
            .split(' ')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
        );
      }
    }
    return [...new Set(found)];
  }

  private assessQuality(text: string, words: string[]): 'thoughtful' | 'simple' | 'spam' {
    const wordCount = words.length;

    const spamPatterns = [
      /check\s+(?:out\s+)?my\s+channel/i,
      /sub\s+(?:4|for)\s+sub/i,
      /first(!|$)/i,
      /^(nice|cool|good|great|wow)(!)?$/i,
      /https?:\/\//i,
    ];

    for (const pattern of spamPatterns) {
      if (pattern.test(text)) return 'spam';
    }

    if (wordCount < 5) return 'simple';

    const thoughtfulIndicators = [
      wordCount > 20,
      text.includes('?'),
      /\b(because|think|feel|believe|actually)\b/i.test(text),
      /\b(history|learned|fact|true|real)\b/i.test(text),
    ];

    if (thoughtfulIndicators.filter(Boolean).length >= 2) return 'thoughtful';
    return 'simple';
  }

  recordComment(videoId: string, comment: string): CommentAnalysis {
    const analysis = this.analyzeComment(comment);

    if (!this.videoComments[videoId]) {
      this.videoComments[videoId] = [];
    }
    this.videoComments[videoId].push(analysis);

    for (const character of analysis.mentionedCharacters) {
      if (!this.characterSentiment[character]) {
        this.characterSentiment[character] = [];
      }
      this.characterSentiment[character].push(analysis.sentimentScore);
    }

    if (analysis.isRequest && analysis.requestTopic) {
      const existing = this.allRequests.find((r) => r.topic.toLowerCase() === analysis.requestTopic!.toLowerCase());
      if (existing) {
        existing.count++;
      } else {
        this.allRequests.push({ topic: analysis.requestTopic, videoId, count: 1 });
      }
    }

    this.saveState();
    return analysis;
  }

  recordBatch(videoId: string, comments: string[]): CommentAnalysis[] {
    return comments.map((c) => this.recordComment(videoId, c));
  }

  getVideoSummary(videoId: string): VideoCommentSummary | null {
    const comments = this.videoComments[videoId];
    if (!comments || comments.length === 0) return null;

    const total = comments.length;
    const positive = comments.filter((c) => c.sentiment === 'positive').length;
    const negative = comments.filter((c) => c.sentiment === 'negative').length;
    const neutral = comments.filter((c) => c.sentiment === 'neutral').length;
    const avgSentiment = comments.reduce((sum, c) => sum + c.sentimentScore, 0) / total;

    const emotionalCount = comments.filter((c) => c.emotionalMarkers.length > 0).length;
    const emotionCounts: Record<string, number> = {};
    for (const c of comments) {
      for (const e of c.emotionalMarkers) {
        emotionCounts[e] = (emotionCounts[e] || 0) + 1;
      }
    }
    const topEmotions = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) as Array<[string, number]>;

    const charMentions: Record<string, number> = {};
    for (const c of comments) {
      for (const char of c.mentionedCharacters) {
        charMentions[char] = (charMentions[char] || 0) + 1;
      }
    }

    const requests = comments.filter((c) => c.isRequest && c.requestTopic).map((c) => c.requestTopic!);

    const thoughtful = comments.filter((c) => c.engagementQuality === 'thoughtful').length;
    const avgWordCount = comments.reduce((sum, c) => sum + c.wordCount, 0) / total;

    return {
      videoId,
      totalComments: total,
      positivePct: Math.round((positive / total) * 1000) / 1000,
      negativePct: Math.round((negative / total) * 1000) / 1000,
      neutralPct: Math.round((neutral / total) * 1000) / 1000,
      avgSentiment: Math.round(avgSentiment * 1000) / 1000,
      emotionalCommentPct: Math.round((emotionalCount / total) * 1000) / 1000,
      topEmotions,
      characterMentions: charMentions,
      contentRequests: [...new Set(requests)],
      thoughtfulPct: Math.round((thoughtful / total) * 1000) / 1000,
      avgWordCount: Math.round(avgWordCount * 10) / 10,
    };
  }

  getCharacterSentiment(): Array<{
    character: string;
    mentions: number;
    avgSentiment: number;
    status: string;
  }> {
    return Object.entries(this.characterSentiment)
      .map(([character, scores]) => ({
        character,
        mentions: scores.length,
        avgSentiment: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 1000,
        status: this.getSentimentStatus(scores.reduce((a, b) => a + b, 0) / scores.length),
      }))
      .sort((a, b) => b.mentions - a.mentions);
  }

  private getSentimentStatus(avg: number): string {
    if (avg > 0.5) return 'LOVED';
    if (avg > 0.2) return 'POSITIVE';
    if (avg > -0.2) return 'NEUTRAL';
    if (avg > -0.5) return 'NEGATIVE';
    return 'DISLIKED';
  }

  getTopRequests(n: number = 10): Array<{ topic: string; count: number }> {
    return this.allRequests
      .sort((a, b) => b.count - a.count)
      .slice(0, n)
      .map((r) => ({ topic: r.topic, count: r.count }));
  }

  getStats(): {
    totalVideos: number;
    totalComments: number;
    avgSentiment: number;
    topEmotion: string | null;
    topRequest: string | null;
  } {
    const totalComments = Object.values(this.videoComments).reduce((sum, arr) => sum + arr.length, 0);

    if (totalComments === 0) {
      return {
        totalVideos: 0,
        totalComments: 0,
        avgSentiment: 0,
        topEmotion: null,
        topRequest: null,
      };
    }

    const allComments = Object.values(this.videoComments).flat();
    const avgSentiment = allComments.reduce((sum, c) => sum + c.sentimentScore, 0) / totalComments;

    const emotionCounts: Record<string, number> = {};
    for (const c of allComments) {
      for (const e of c.emotionalMarkers) {
        emotionCounts[e] = (emotionCounts[e] || 0) + 1;
      }
    }
    const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topRequest = this.allRequests.sort((a, b) => b.count - a.count)[0]?.topic || null;

    return {
      totalVideos: Object.keys(this.videoComments).length,
      totalComments,
      avgSentiment: Math.round(avgSentiment * 1000) / 1000,
      topEmotion,
      topRequest,
    };
  }

  /**
   * Get aggregated sentiment data for the Feedback Loop Orchestrator
   * Returns top characters by sentiment, content requests, and emotional highlights
   */
  getAggregatedSentiment() {
    const topCharacters: Array<{ character: string; sentiment: number; mentions: number }> = [];

    // Get top characters sorted by (sentiment * mentions)
    for (const [character, scores] of Object.entries(this.characterSentiment)) {
      const avgSentiment = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
      topCharacters.push({
        character,
        sentiment: avgSentiment,
        mentions: scores.length,
      });
    }

    // Sort by sentiment * mentions (both matter)
    topCharacters.sort((a, b) => b.sentiment * b.mentions - a.sentiment * a.mentions);

    // Get content requests sorted by count
    const contentRequests = this.allRequests
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((r) => r.topic);

    // Get emotional highlights
    const allComments = Object.values(this.videoComments).flat();
    const emotionCounts: Record<string, number> = {};

    for (const comment of allComments) {
      for (const emotion of comment.emotionalMarkers) {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      }
    }

    const emotionalHighlights = Object.entries(emotionCounts)
      .map(([emotion, count]) => ({ emotion, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      topCharacters: topCharacters.slice(0, 10),
      contentRequests,
      emotionalHighlights,
    };
  }

  private saveState(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      const state = {
        videoComments: this.videoComments,
        characterSentiment: this.characterSentiment,
        allRequests: this.allRequests,
        savedAt: new Date().toISOString(),
      };
      writeFileSync(this.dataPath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.warn('Could not save Comment Sentiment state');
    }
  }

  private loadState(): void {
    try {
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        if (data.videoComments) this.videoComments = data.videoComments;
        if (data.characterSentiment) this.characterSentiment = data.characterSentiment;
        if (data.allRequests) this.allRequests = data.allRequests;
        const totalComments = Object.values(this.videoComments).reduce((sum: number, arr: any) => sum + arr.length, 0);
        console.log(`💬 Comment Sentiment Loop: Loaded ${totalComments} comments`);
      }
    } catch (error) {
      console.warn('Could not load Comment Sentiment state');
    }
  }
}

export const commentSentimentLoop = new CommentSentimentLoop();
