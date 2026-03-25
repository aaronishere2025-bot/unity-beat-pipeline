import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { canonicalFacts } from '@shared/schema';
import { eq, and, lt } from 'drizzle-orm';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface Conflict {
  type: string;
  gptClaim: string;
  geminiClaim: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface ReconciledFact {
  factType: string;
  factKey: string;
  factValue: string;
  sourceType: string;
  sourceUrl?: string;
  sourceCitation?: string;
  confidence: number;
  originalGptClaim?: string;
  originalGeminiClaim?: string;
}

export interface ReconciliationResult {
  topic: string;
  reconciledFacts: ReconciledFact[];
  unresolvedConflicts: Conflict[];
  totalConfidence: number;
  canProceed: boolean;
}

/**
 * Fact Reconciliation Service
 * Stores facts temporarily in database during video creation
 * Facts are cleaned up after video creation completes
 */
class FactReconciliationService {
  private readonly MIN_CONFIDENCE_THRESHOLD = 70;

  /**
   * Reconcile conflicts between GPT-4o and Gemini by researching the truth
   * Returns verified facts that can be used for content generation
   */
  async reconcileConflicts(
    topic: string,
    conflicts: Conflict[],
    gptOutput: any,
    geminiOutput: any,
  ): Promise<ReconciliationResult> {
    console.log(`\n🔬 FACT RECONCILIATION: ${topic}`);
    console.log(`   Conflicts to resolve: ${conflicts.length}`);

    const reconciledFacts: ReconciledFact[] = [];
    const unresolvedConflicts: Conflict[] = [];

    // Process each conflict - research the REAL facts
    for (const conflict of conflicts) {
      console.log(`   🔍 Resolving: ${conflict.type} (${conflict.severity})`);

      try {
        const resolved = await this.researchFact(topic, conflict);
        if (resolved) {
          reconciledFacts.push(resolved);
          console.log(`   ✅ Verified: ${resolved.factValue} (${resolved.confidence}%)`);
        } else {
          // If we can't verify, still try to proceed with GPT's version for minor issues
          if (conflict.severity === 'minor') {
            reconciledFacts.push({
              factType: conflict.type,
              factKey: conflict.type.toLowerCase().replace(/\s+/g, '_'),
              factValue: conflict.gptClaim,
              sourceType: 'model_default',
              confidence: 75,
              originalGptClaim: conflict.gptClaim,
              originalGeminiClaim: conflict.geminiClaim,
            });
          } else {
            unresolvedConflicts.push(conflict);
            console.log(`   ⚠️ Could not verify - marked for review`);
          }
        }
      } catch (error: any) {
        console.log(`   ❌ Research failed: ${error.message}`);
        // Don't block on research failures - use GPT's version
        reconciledFacts.push({
          factType: conflict.type,
          factKey: conflict.type.toLowerCase().replace(/\s+/g, '_'),
          factValue: conflict.gptClaim,
          sourceType: 'fallback',
          confidence: 60,
          originalGptClaim: conflict.gptClaim,
          originalGeminiClaim: conflict.geminiClaim,
        });
      }
    }

    // Extract core facts from model outputs
    const coreFacts = await this.extractCoreFacts(topic, gptOutput, geminiOutput);
    reconciledFacts.push(...coreFacts);

    // Calculate overall confidence
    const totalConfidence =
      reconciledFacts.length > 0
        ? Math.round(reconciledFacts.reduce((sum, f) => sum + f.confidence, 0) / reconciledFacts.length)
        : 0;

    // BE MORE PERMISSIVE: Proceed if we have ANY verified facts
    const hasCriticalUnresolved = unresolvedConflicts.some((c) => c.severity === 'critical');
    const canProceed =
      reconciledFacts.length > 0 && (!hasCriticalUnresolved || totalConfidence >= this.MIN_CONFIDENCE_THRESHOLD);

    // Save to database for this video session (will be cleaned up after)
    if (reconciledFacts.length > 0) {
      await this.saveFactsToDatabase(topic, reconciledFacts);
    }

    console.log(`   📊 Result: ${reconciledFacts.length} facts, ${totalConfidence}% confidence, proceed=${canProceed}`);

    return {
      topic,
      reconciledFacts,
      unresolvedConflicts,
      totalConfidence,
      canProceed,
    };
  }

  /**
   * Research a specific fact using GPT-4o
   */
  private async researchFact(topic: string, conflict: Conflict): Promise<ReconciledFact | null> {
    try {
      const systemPrompt = `You are a historical fact-checker. Determine the TRUE, VERIFIED fact when sources disagree.

FOR WELL-KNOWN HISTORICAL FACTS (dates, births, deaths, major events):
- These should ALWAYS be verifiable with high confidence
- Use your training data which includes encyclopedias and historical records
- If it's a commonly documented fact, confidence should be 90+

RULES:
1. State the verified fact clearly
2. For dates, be specific (day/month/year when known)
3. Only say "UNVERIFIED" for truly obscure or debated facts
4. Never guess - but most historical facts ARE verifiable

Return JSON only:
{
  "verifiedFact": "the true fact",
  "confidence": 0-100,
  "reasoning": "why this is correct",
  "sourceType": "historical_knowledge|encyclopedia|primary_source"
}`;

      const userPrompt = `Topic: ${topic}
Conflict Type: ${conflict.type}

Source 1 claims: "${conflict.gptClaim}"
Source 2 claims: "${conflict.geminiClaim}"

What is the VERIFIED truth?`;

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      });
      const response = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      const result = JSON.parse(response.response.text() || '{}');

      if (result.verifiedFact === 'UNVERIFIED' || result.confidence < 50) {
        return null;
      }

      return {
        factType: conflict.type,
        factKey: conflict.type.toLowerCase().replace(/\s+/g, '_'),
        factValue: result.verifiedFact,
        sourceType: result.sourceType || 'historical_knowledge',
        sourceCitation: result.reasoning,
        confidence: result.confidence,
        originalGptClaim: conflict.gptClaim,
        originalGeminiClaim: conflict.geminiClaim,
      };
    } catch (error) {
      console.error(`Research error: ${error}`);
      return null;
    }
  }

  /**
   * Extract core facts from model outputs
   */
  private async extractCoreFacts(topic: string, gptOutput: any, geminiOutput: any): Promise<ReconciledFact[]> {
    const facts: ReconciledFact[] = [];

    try {
      const systemPrompt = `Extract KEY VERIFIED facts about this historical topic. Focus on:
- Birth/death dates (if person)
- Major achievements or events
- Era/time period
- Key relationships

IMPORTANT: Only include facts you are CONFIDENT about.

Return JSON:
{
  "facts": [
    {"type": "birth", "key": "birth_date", "value": "date", "confidence": 95},
    {"type": "death", "key": "death_date", "value": "date", "confidence": 95},
    {"type": "event", "key": "major_achievement", "value": "description", "confidence": 90}
  ]
}`;

      const userPrompt = `Topic: ${topic}

GPT-4o analysis: ${JSON.stringify(gptOutput)}
Gemini analysis: ${JSON.stringify(geminiOutput)}

Extract the verified core facts.`;

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      });
      const response = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      const result = JSON.parse(response.response.text() || '{}');

      if (result.facts && Array.isArray(result.facts)) {
        for (const fact of result.facts) {
          if (fact.confidence >= 70) {
            facts.push({
              factType: fact.type,
              factKey: fact.key,
              factValue: fact.value,
              sourceType: 'model_consensus',
              confidence: fact.confidence,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Core fact extraction error: ${error}`);
    }

    return facts;
  }

  /**
   * Save facts to database for this video session
   */
  private async saveFactsToDatabase(topic: string, facts: ReconciledFact[]): Promise<void> {
    for (const fact of facts) {
      try {
        const existing = await db
          .select()
          .from(canonicalFacts)
          .where(and(eq(canonicalFacts.topic, topic), eq(canonicalFacts.factKey, fact.factKey)))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(canonicalFacts)
            .set({
              factValue: fact.factValue,
              confidence: fact.confidence,
              updatedAt: new Date(),
            })
            .where(eq(canonicalFacts.id, existing[0].id));
        } else {
          await db.insert(canonicalFacts).values({
            topic,
            factType: fact.factType,
            factKey: fact.factKey,
            factValue: fact.factValue,
            sourceType: fact.sourceType,
            sourceUrl: fact.sourceUrl,
            sourceCitation: fact.sourceCitation,
            confidence: fact.confidence,
            originalGptClaim: fact.originalGptClaim,
            originalGeminiClaim: fact.originalGeminiClaim,
          });
        }
      } catch (error) {
        console.error(`Failed to save fact ${fact.factKey}: ${error}`);
      }
    }
  }

  /**
   * Get facts for content generation (lyrics, prompts)
   */
  async getFactsForGeneration(topic: string): Promise<{
    timeline: string;
    keyEvents: string[];
    era: string;
    relationships: string[];
    raw: ReconciledFact[];
  }> {
    try {
      const dbFacts = await db.select().from(canonicalFacts).where(eq(canonicalFacts.topic, topic));

      const facts: ReconciledFact[] = dbFacts.map((f) => ({
        factType: f.factType,
        factKey: f.factKey,
        factValue: f.factValue,
        sourceType: f.sourceType,
        confidence: f.confidence,
      }));

      const birthFact = facts.find((f) => f.factKey === 'birth_date');
      const deathFact = facts.find((f) => f.factKey === 'death_date');
      const events = facts.filter((f) => f.factType === 'event').map((f) => f.factValue);
      const relationships = facts.filter((f) => f.factType === 'relationship').map((f) => f.factValue);

      let timeline = '';
      if (birthFact) timeline += birthFact.factValue;
      if (deathFact) timeline += ` - ${deathFact.factValue}`;

      const eraFact = facts.find((f) => f.factKey === 'era');
      const era = eraFact?.factValue || 'Historical';

      return {
        timeline: timeline || 'Unknown dates',
        keyEvents: events,
        era,
        relationships,
        raw: facts,
      };
    } catch (error) {
      return {
        timeline: 'Unknown dates',
        keyEvents: [],
        era: 'Historical',
        relationships: [],
        raw: [],
      };
    }
  }

  /**
   * Clear facts after video creation is complete
   * Call this after the video is generated
   */
  async clearFactsForTopic(topic: string): Promise<void> {
    try {
      await db.delete(canonicalFacts).where(eq(canonicalFacts.topic, topic));
      console.log(`   🧹 Cleared facts for: ${topic}`);
    } catch (error) {
      console.error(`Failed to clear facts: ${error}`);
    }
  }

  /**
   * Clear old facts (older than 24 hours) - cleanup job
   */
  async cleanupOldFacts(): Promise<number> {
    try {
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      const deleted = await db.delete(canonicalFacts).where(lt(canonicalFacts.createdAt, yesterday));

      console.log(`   🧹 Cleaned up old facts`);
      return 0;
    } catch (error) {
      console.error(`Failed to cleanup old facts: ${error}`);
      return 0;
    }
  }

  /**
   * VIRAL HOOK DISCOVERY: Find the "One Thing Nobody Knows"
   * This is the fact that makes viewers stop scrolling and stay
   * Returns surprising, counterintuitive, or little-known facts about historical figures
   */
  async discoverUnknownFacts(topic: string): Promise<{
    unknownFact: string;
    hookAngle: string;
    emotionalTrigger: string;
    curiosityGap: string;
    allFacts: string[];
  }> {
    console.log(`\n🔮 UNKNOWN FACT DISCOVERY: ${topic}`);

    try {
      const systemPrompt = `You are a viral content researcher specializing in finding the "One Thing Nobody Knows" about historical figures. Your job is to find the SURPRISING, COUNTERINTUITIVE, or SHOCKING facts that make people stop scrolling.

THE BEST UNKNOWN FACTS:
1. Contradict common beliefs ("Everyone thinks X, but actually Y")
2. Are emotionally powerful (tragedy, betrayal, love, revenge)
3. Connect to modern life unexpectedly
4. Reveal hidden character flaws or virtues
5. Show unexpected relationships or connections

EXAMPLES OF GREAT UNKNOWN FACTS:
- "Nikola Tesla was in love with a pigeon" (shocking + human)
- "Einstein failed his college entrance exam" (counterintuitive)
- "Cleopatra wasn't Egyptian, she was Greek" (contradicts belief)
- "George Washington's teeth weren't wooden, they were from slaves" (dark truth)
- "Spartacus's rebellion nearly toppled Rome - he was only stopped 75 miles from the capital" (stakes revelation)

Return JSON:
{
  "unknownFact": "The single most viral-worthy fact (2-3 sentences)",
  "hookAngle": "How to present this for maximum shock value",
  "emotionalTrigger": "Primary emotion: shock/tragedy/betrayal/irony/revelation",
  "curiosityGap": "The question this fact answers that viewers didn't know to ask",
  "allFacts": ["List of 5 little-known facts about this figure, ranked by viral potential"]
}`;

      const userPrompt = `Historical Topic: ${topic}

Find the "One Thing Nobody Knows" that will make viewers stop scrolling and stay. Focus on facts that are:
1. True and verifiable
2. Surprising or counterintuitive
3. Emotionally resonant
4. Not commonly taught in schools

What's the SHOCKING truth about ${topic}?`;

      const unknownModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.8, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      });
      const response = await unknownModel.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      const result = JSON.parse(response.response.text() || '{}');

      console.log(`   🎯 Unknown Fact: "${result.unknownFact}"`);
      console.log(`   🎣 Hook Angle: ${result.hookAngle}`);
      console.log(`   💥 Emotional Trigger: ${result.emotionalTrigger}`);

      return {
        unknownFact: result.unknownFact || 'Unknown fact not discovered',
        hookAngle: result.hookAngle || 'Historical revelation',
        emotionalTrigger: result.emotionalTrigger || 'curiosity',
        curiosityGap: result.curiosityGap || `What you never knew about ${topic}`,
        allFacts: result.allFacts || [],
      };
    } catch (error: any) {
      console.error(`Unknown fact discovery error: ${error.message}`);
      return {
        unknownFact: `The untold story of ${topic}`,
        hookAngle: 'Historical revelation',
        emotionalTrigger: 'curiosity',
        curiosityGap: `What you never knew about ${topic}`,
        allFacts: [],
      };
    }
  }
}

export const factReconciliationService = new FactReconciliationService();
