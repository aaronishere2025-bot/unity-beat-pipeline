/**
 * PEOPLE EXPLORER - Phase 1
 *
 * AI-powered discovery of unique historical people for video content
 * Uses Claude Sonnet 4.5 for deep historical knowledge and narrative understanding
 *
 * Features:
 * - Discovers fascinating historical figures across all eras and cultures
 * - Generates complete 5W1H context for each person
 * - Ensures diversity (time periods, cultures, story types)
 * - Filters through uniqueness engine to avoid duplicates
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { uniquenessEngine } from './uniqueness-engine.js';
import { db } from '../db.js';
import { exploredTopics } from '@shared/schema';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface PersonDiscovery {
  name: string;
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
      era: string;
      timePeriod: string;
    };
    how: {
      mechanism: string;
    };
  };
  viralPotential: number;
  discoveryAngle: string;
  visualAppeal?: number;
}

export class PeopleExplorer {
  /**
   * Discover unique historical people using AI
   *
   * @param count - Number of people to discover
   * @param filterDuplicates - Whether to filter through uniqueness engine (default: true)
   * @returns Array of unique PersonDiscovery objects
   */
  async discoverPeople(count: number = 5, filterDuplicates: boolean = true): Promise<PersonDiscovery[]> {
    console.log(`\n🔍 Discovering ${count} unique historical people...\n`);

    const prompt = `You are a master historian with encyclopedic knowledge of world history. Discover ${count} fascinating historical PEOPLE for 60-second YouTube Shorts.

**REQUIREMENTS:**
- Mix of time periods: ancient (pre-500 CE), medieval (500-1500), modern (1500+)
- Mix of cultures: European, Asian, African, Middle Eastern, Indigenous, etc.
- 70% lesser-known figures, 30% famous figures with untold angles
- High cinematic/visual potential (battles, dramatic moments, visual spectacles)
- Each person must have a clear "wow factor" or shocking element

**DIVERSITY MANDATES:**
- Include at least one woman
- Include at least one non-Western figure
- Include at least one ancient/medieval figure
- Avoid only military/war figures (include scientists, artists, rebels, etc.)

**OUTPUT FORMAT:**
Return EXACTLY ${count} people in this JSON structure:

\`\`\`json
[
  {
    "name": "Full name of the person",
    "fiveW1H": {
      "who": {
        "mainSubject": "Brief description of who they were (role, title, identity)",
        "keyPeople": ["Allied person 1", "Enemy/rival person 2", "Influenced person 3"]
      },
      "what": {
        "primaryEvent": "The main event or achievement they're known for",
        "significance": "Why this event/achievement matters historically"
      },
      "why": {
        "motivation": "What drove them to do what they did",
        "modernRelevance": "Why Gen Z/young adults would care about this story today"
      },
      "where": {
        "primaryLocation": "Main city/place where events occurred",
        "region": "Broader geographic region (e.g., 'Ancient Greece', 'Medieval Japan')"
      },
      "when": {
        "era": "ancient|medieval|modern",
        "timePeriod": "Specific time period (e.g., '323 BCE', '15th century', '1940s')"
      },
      "how": {
        "mechanism": "How they accomplished their feat or how their story unfolded"
      }
    },
    "viralPotential": 85,
    "discoveryAngle": "The shocking hook (e.g., 'The slave who became emperor and outlawed slavery')",
    "visualAppeal": 90
  }
]
\`\`\`

**SCORING GUIDANCE:**
- viralPotential (0-100): Likelihood to get views/shares
  - 90-100: Absolutely mind-blowing (e.g., "The man who sold the Eiffel Tower twice")
  - 75-89: Very compelling (e.g., "The female pirate who commanded 80,000 sailors")
  - 60-74: Interesting but less viral
- visualAppeal (0-100): How cinematic/visual the story is
  - 90-100: Epic battles, dramatic moments, visual spectacles
  - 75-89: Good visual potential
  - 60-74: Moderate visual elements

**EXAMPLES OF GOOD DISCOVERIES:**
- Yasuke: The African samurai who fought for Oda Nobunaga
- Khutulun: Mongol princess who would only marry a man who could beat her in wrestling (undefeated)
- Simo Häyhä: Finnish sniper with 500+ kills in -40°C weather
- Elagabalus: Roman emperor who married a Vestal Virgin (death penalty offense)

Now discover ${count} unique historical people. Return ONLY the JSON array, no other text.`;

    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      let parsed: PersonDiscovery[];
      try {
        parsed = JSON.parse(text);
        // Handle case where Gemini wraps in an object
        if (!Array.isArray(parsed) && (parsed as any).people) {
          parsed = (parsed as any).people;
        }
      } catch (parseError) {
        console.error('❌ JSON parsing failed. Attempting to fix common issues...');
        const fixedJson = text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        parsed = JSON.parse(fixedJson);
        if (!Array.isArray(parsed) && (parsed as any).people) {
          parsed = (parsed as any).people;
        }
      }

      console.log(`✅ Gemini discovered ${parsed.length} people\n`);

      // Filter for uniqueness if requested
      if (filterDuplicates) {
        // Batch check all names at once (single DB query + single embedding API call)
        const names = parsed.map((p) => p.name);
        const checks = await uniquenessEngine.batchCheckUnique(names, 'person', 365);

        const unique: PersonDiscovery[] = [];
        for (const person of parsed) {
          const check = checks.get(person.name);
          if (check?.isUnique) {
            unique.push(person);
            console.log(`  ✅ ${person.name} - UNIQUE (viral: ${person.viralPotential})`);
          } else {
            console.log(`  ⏭️  ${person.name} - SKIPPED (${check?.reason || 'unknown'})`);
          }
        }

        console.log(`\n📊 Filtered: ${unique.length}/${parsed.length} unique people\n`);
        return unique;
      }

      return parsed;
    } catch (error) {
      console.error('❌ People discovery failed:', error);
      throw new Error(`Failed to discover people: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save a discovered person to the database
   *
   * @param person - PersonDiscovery object
   * @returns ID of the created record
   */
  async saveTopic(person: PersonDiscovery): Promise<string> {
    try {
      const result = await db
        .insert(exploredTopics)
        .values({
          topicType: 'person',
          primaryName: person.name,
          normalizedName: uniquenessEngine.normalizeBasic(person.name),
          fiveW1H: person.fiveW1H,
          viralPotential: person.viralPotential,
          discoveryAngle: person.discoveryAngle,
          visualAppeal: person.visualAppeal || null,
          status: 'discovered',
        })
        .returning({ id: exploredTopics.id });

      console.log(`💾 Saved: ${person.name} (ID: ${result[0].id})`);
      return result[0].id;
    } catch (error) {
      console.error(`❌ Failed to save topic: ${person.name}`, error);
      throw new Error(`Failed to save topic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Discover AND save people in one operation
   * Convenience method for common workflow
   *
   * @param count - Number of people to discover
   * @returns Array of saved topic IDs
   */
  async discoverAndSave(count: number = 5): Promise<string[]> {
    console.log(`\n🚀 Discover & Save workflow: ${count} people\n`);

    const people = await this.discoverPeople(count, true);

    // Save all people in parallel
    const results = await Promise.allSettled(people.map((person) => this.saveTopic(person)));

    const savedIds: string[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        savedIds.push(result.value);
      }
    }

    // Invalidate uniqueness cache after saving new topics
    uniquenessEngine.invalidateCache();

    console.log(`\n✅ Saved ${savedIds.length}/${people.length} people to database\n`);

    return savedIds;
  }

  /**
   * Discover people with specific requirements
   * Useful for targeted discovery (e.g., "only ancient warriors")
   */
  async discoverWithFilter(
    count: number,
    requirements: {
      era?: 'ancient' | 'medieval' | 'modern';
      region?: string;
      category?: string;
    },
  ): Promise<PersonDiscovery[]> {
    console.log(`\n🎯 Targeted discovery: ${count} people with filters`, requirements, '\n');

    const filterText = [
      requirements.era ? `- MUST be from ${requirements.era} era` : '',
      requirements.region ? `- MUST be from ${requirements.region}` : '',
      requirements.category ? `- MUST be a ${requirements.category}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `You are a master historian. Discover ${count} historical people matching these STRICT requirements:

${filterText}

Otherwise follow the same format and quality standards as before. Return ONLY a JSON array of ${count} people.`;

    // Reuse the main discovery logic but with custom prompt
    // (For simplicity in Phase 1, just call the main method and filter client-side)
    const allPeople = await this.discoverPeople(count * 2, true);

    const filtered = allPeople.filter((person) => {
      if (requirements.era && person.fiveW1H.when.era !== requirements.era) {
        return false;
      }
      if (requirements.region && !person.fiveW1H.where.region.includes(requirements.region)) {
        return false;
      }
      // Add more filtering logic as needed
      return true;
    });

    return filtered.slice(0, count);
  }
}

// Export singleton instance
export const peopleExplorer = new PeopleExplorer();
