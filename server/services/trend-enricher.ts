/**
 * TREND ENRICHER
 *
 * Takes raw trending keywords from trend-discovery-bot and enriches them with
 * full 5W1H context for the unlimited-topic-explorer.
 *
 * Converts:
 *   "Genghis Khan DNA" (raw keyword)
 * Into:
 *   Complete topic with who/what/why/where/when/how + viral potential + discovery angle
 *
 * Uses Claude Sonnet 4.5 for deep historical understanding and narrative structure.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { TrendingTopic } from '@shared/schema';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface EnrichedTrend {
  name: string;
  topicType: 'person' | 'place' | 'thing';
  fiveW1H: {
    who: {
      mainSubject: string;
      keyPeople: string[];
    };
    what: {
      primaryEvent: string;
      significance: string;
    };
    why: {
      motivation: string;
      modernRelevance: string;
    };
    where: {
      primaryLocation: string;
      region: string;
    };
    when: {
      era: 'ancient' | 'medieval' | 'modern' | 'contemporary';
      timePeriod: string;
    };
    how: {
      mechanism: string;
    };
  };
  viralPotential: number;
  discoveryAngle: string;
  visualAppeal?: number;
  trendData: {
    searchVolume: number;
    competitionLevel: string;
    trendVelocity: number;
    source: string;
    whyTrending: string;
  };
}

export class TrendEnricher {
  /**
   * Take a trending keyword and generate complete 5W1H context
   */
  async enrichTrendWith5W1H(trend: TrendingTopic): Promise<EnrichedTrend> {
    console.log(`🔍 Enriching trending topic: ${trend.keyword}`);

    const prompt = `You are a master historian. The topic "${trend.keyword}" is currently trending on YouTube with ${trend.searchVolume || 'high'} searches and ${trend.trendVelocity}/100 trend velocity.

**CONTEXT:**
- Source: ${trend.source}
- Why trending: ${trend.whyTrending}
- Suggested angle: ${trend.suggestedAngle || 'not provided'}
- Competition: ${trend.competitionLevel}

**YOUR TASK:**
Generate complete historical context for this trending topic. The topic could be:
- A person (historical figure, warrior, leader, scientist, etc.)
- A place (lost city, battlefield, monument, etc.)
- A thing (artifact, invention, concept, event, etc.)

Return EXACTLY this JSON structure:

\`\`\`json
{
  "name": "${trend.keyword}",
  "topicType": "person|place|thing",
  "fiveW1H": {
    "who": {
      "mainSubject": "Who this is about (or 'N/A' for non-person topics)",
      "keyPeople": ["person 1", "person 2", "person 3"]
    },
    "what": {
      "primaryEvent": "What happened or what this is",
      "significance": "Why it matters in history"
    },
    "why": {
      "motivation": "Why this happened or why it's significant",
      "modernRelevance": "Why Gen Z is searching for this NOW (use the trending data)"
    },
    "where": {
      "primaryLocation": "Main location (city/place)",
      "region": "Broader region (e.g., 'Ancient Mesopotamia', 'Medieval China')"
    },
    "when": {
      "era": "ancient|medieval|modern|contemporary",
      "timePeriod": "Specific historical period (e.g., '1200 BCE', '14th century')"
    },
    "how": {
      "mechanism": "How it happened or how it works"
    }
  },
  "viralPotential": 85,
  "discoveryAngle": "The shocking hook (build on: ${trend.suggestedAngle || 'trending angle'})",
  "visualAppeal": 90
}
\`\`\`

**REQUIREMENTS:**
1. **topicType**: Accurately classify as person/place/thing
   - person: Historical figures (Genghis Khan, Cleopatra, etc.)
   - place: Locations (Atlantis, Pompeii, Great Wall, etc.)
   - thing: Events, objects, concepts (Battle of X, Rosetta Stone, etc.)

2. **modernRelevance**: MUST explain why this is trending NOW
   - Use the search volume and trend velocity data
   - Connect to current events, pop culture, or viral topics
   - Example: "TikTok historians discovered X" or "New DNA evidence just revealed"

3. **discoveryAngle**: Make it VIRAL
   - Build on the suggested angle: "${trend.suggestedAngle || 'N/A'}"
   - Add shock value or counterintuitive twist
   - Keep it under 100 characters (YouTube short title length)

4. **viralPotential**: Score 0-100 based on:
   - Shocking/counterintuitive factor
   - Visual/cinematic appeal
   - Trending search volume (higher = more viral potential)
   - Modern relevance

5. **era classification**:
   - ancient: Pre-500 CE
   - medieval: 500-1500 CE
   - modern: 1500-1900 CE
   - contemporary: 1900+ CE

Return ONLY the JSON object, no other text.`;

    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (!text) {
        throw new Error(`Empty response from Gemini for: ${trend.keyword}`);
      }

      const enriched = JSON.parse(text);

      // Add trend metadata
      enriched.trendData = {
        searchVolume: trend.searchVolume,
        competitionLevel: trend.competitionLevel || 'unknown',
        trendVelocity: trend.trendVelocity,
        source: trend.source,
        whyTrending: trend.whyTrending,
      };

      console.log(`  ✅ Enriched: ${enriched.name} (${enriched.topicType}, viral: ${enriched.viralPotential})`);

      return enriched;
    } catch (error) {
      console.error(
        `❌ Failed to enrich ${trend.keyword}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Batch enrich multiple trends
   */
  async enrichBatch(trends: TrendingTopic[]): Promise<EnrichedTrend[]> {
    console.log(`\n📦 Enriching ${trends.length} trending topics in parallel...\n`);

    // Enrich all trends in parallel (each is an independent Claude call)
    const MAX_PARALLEL = 5;
    const enriched: EnrichedTrend[] = [];

    for (let i = 0; i < trends.length; i += MAX_PARALLEL) {
      const chunk = trends.slice(i, i + MAX_PARALLEL);
      const results = await Promise.allSettled(chunk.map((trend) => this.enrichTrendWith5W1H(trend)));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          enriched.push(result.value);
        } else {
          console.error(`❌ Failed to enrich trend: ${result.reason}`);
        }
      }
    }

    console.log(`\n✅ Successfully enriched ${enriched.length}/${trends.length} trends\n`);
    return enriched;
  }
}

export const trendEnricher = new TrendEnricher();
