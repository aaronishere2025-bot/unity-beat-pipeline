/**
 * Fact-Check Validation Service
 *
 * Validates AI-generated historical content for accuracy before video production.
 * Now with LEARNING from negative data points - tracks past mistakes to prevent repeats.
 *
 * Catches errors like:
 * - Wrong facts attributed to a person
 * - Irrelevant content mixed in
 * - Anachronistic claims
 * - Name/event confusion
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

let _gemini: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface FactCheckResult {
  isAccurate: boolean;
  confidenceScore: number; // 0-100
  issues: FactIssue[];
  corrections: string[];
  summary: string;
  learnedFromPast?: boolean; // Did we use past mistake data?
}

interface FactIssue {
  type: 'wrong_fact' | 'wrong_person' | 'anachronism' | 'irrelevant' | 'exaggeration' | 'confusion';
  severity: 'critical' | 'major' | 'minor';
  claim: string;
  problem: string;
  correction?: string;
}

// ============================================================================
// LEARNING MEMORY - Tracks past mistakes to prevent repeats
// ============================================================================

interface MistakeRecord {
  figureName: string;
  errorType: string;
  wrongClaim: string;
  correctInfo: string;
  confusedWith?: string; // Who they were confused with
  timestamp: Date;
  frequency: number; // How many times this mistake occurred
}

interface ConfusionPair {
  figure1: string;
  figure2: string;
  frequency: number;
  commonMistakes: string[];
}

// In-memory learning store (persists across requests within session)
const mistakeMemory: Map<string, MistakeRecord[]> = new Map();
const confusionPairs: ConfusionPair[] = [];
const figureAliases: Map<string, string[]> = new Map(); // "FZ" -> ["Frank Zappa", "Franz Kafka"]

/**
 * Record a mistake for future learning
 */
export function recordMistake(figureName: string, issue: FactIssue, confusedWith?: string): void {
  const key = figureName.toLowerCase();
  const existing = mistakeMemory.get(key) || [];

  // Check if we've seen this exact mistake before
  const duplicate = existing.find((m) => m.wrongClaim === issue.claim && m.errorType === issue.type);

  if (duplicate) {
    duplicate.frequency++;
    console.log(`📚 Learned: Repeated mistake for ${figureName} (${duplicate.frequency}x)`);
  } else {
    existing.push({
      figureName,
      errorType: issue.type,
      wrongClaim: issue.claim,
      correctInfo: issue.correction || issue.problem,
      confusedWith,
      timestamp: new Date(),
      frequency: 1,
    });
    console.log(`📚 Learned: New mistake recorded for ${figureName}`);
  }

  mistakeMemory.set(key, existing);

  // Track confusion pairs
  if (confusedWith) {
    trackConfusionPair(figureName, confusedWith, issue.claim);
  }
}

/**
 * Track which figures get confused with each other
 */
function trackConfusionPair(figure1: string, figure2: string, mistake: string): void {
  const existing = confusionPairs.find(
    (p) =>
      (p.figure1.toLowerCase() === figure1.toLowerCase() && p.figure2.toLowerCase() === figure2.toLowerCase()) ||
      (p.figure1.toLowerCase() === figure2.toLowerCase() && p.figure2.toLowerCase() === figure1.toLowerCase()),
  );

  if (existing) {
    existing.frequency++;
    if (!existing.commonMistakes.includes(mistake)) {
      existing.commonMistakes.push(mistake);
    }
  } else {
    confusionPairs.push({
      figure1,
      figure2,
      frequency: 1,
      commonMistakes: [mistake],
    });
  }

  console.log(`📚 Learned: ${figure1} ↔ ${figure2} confusion (${existing?.frequency || 1}x)`);
}

/**
 * Register an alias (like "FZ" could mean multiple people)
 */
export function registerAlias(alias: string, possibleFigures: string[]): void {
  figureAliases.set(alias.toLowerCase(), possibleFigures);
  console.log(`📚 Registered alias: "${alias}" → [${possibleFigures.join(', ')}]`);
}

/**
 * Get past mistakes for a figure (to inform fact-checking)
 */
function getPastMistakes(figureName: string): MistakeRecord[] {
  return mistakeMemory.get(figureName.toLowerCase()) || [];
}

/**
 * Get figures commonly confused with this one
 */
function getConfusedFigures(figureName: string): string[] {
  const confused: string[] = [];
  for (const pair of confusionPairs) {
    if (pair.figure1.toLowerCase() === figureName.toLowerCase()) {
      confused.push(pair.figure2);
    } else if (pair.figure2.toLowerCase() === figureName.toLowerCase()) {
      confused.push(pair.figure1);
    }
  }
  return confused;
}

/**
 * Build learning context for fact-check prompts
 */
function buildLearningContext(figureName: string): string {
  const pastMistakes = getPastMistakes(figureName);
  const confusedWith = getConfusedFigures(figureName);
  const aliases = figureAliases.get(figureName.toLowerCase());

  if (pastMistakes.length === 0 && confusedWith.length === 0 && !aliases) {
    return '';
  }

  let context = '\n\nLEARNED FROM PAST MISTAKES:\n';

  if (pastMistakes.length > 0) {
    context += `\nKnown errors for ${figureName}:\n`;
    pastMistakes.slice(0, 5).forEach((m) => {
      context += `- WRONG: "${m.wrongClaim}" → CORRECT: "${m.correctInfo}" (seen ${m.frequency}x)\n`;
    });
  }

  if (confusedWith.length > 0) {
    context += `\n⚠️ COMMONLY CONFUSED WITH: ${confusedWith.join(', ')}\n`;
    context += `Be EXTRA careful to distinguish ${figureName} from these figures!\n`;
  }

  if (aliases) {
    context += `\n⚠️ NAME AMBIGUITY: "${figureName}" could refer to: ${aliases.join(' OR ')}\n`;
    context += `Verify content matches the CORRECT person!\n`;
  }

  return context;
}

/**
 * Get learning statistics
 */
export function getLearningStats(): {
  totalMistakesRecorded: number;
  figuresWithMistakes: number;
  confusionPairsTracked: number;
  aliasesRegistered: number;
  topConfusionPairs: ConfusionPair[];
  recentMistakes: MistakeRecord[];
} {
  let totalMistakes = 0;
  const recentMistakes: MistakeRecord[] = [];

  mistakeMemory.forEach((records) => {
    totalMistakes += records.length;
    recentMistakes.push(...records);
  });

  // Sort by timestamp, get most recent
  recentMistakes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return {
    totalMistakesRecorded: totalMistakes,
    figuresWithMistakes: mistakeMemory.size,
    confusionPairsTracked: confusionPairs.length,
    aliasesRegistered: figureAliases.size,
    topConfusionPairs: [...confusionPairs].sort((a, b) => b.frequency - a.frequency).slice(0, 5),
    recentMistakes: recentMistakes.slice(0, 10),
  };
}

const FACT_CHECK_PROMPT = `You are a rigorous historical fact-checker. Your job is to validate content about historical figures for ACCURACY.

CRITICAL RULES:
1. Verify that ALL claims are actually true about THIS SPECIFIC PERSON
2. Flag if content belongs to a DIFFERENT person (name confusion is common)
3. Check dates, events, achievements are correctly attributed
4. Identify anachronisms (things that couldn't exist in their era)
5. Flag irrelevant content that has nothing to do with this person
6. Be especially careful with similar names (e.g., FZ could be Franz Kafka or Frank Zappa - make sure content matches)

SCORING:
- 90-100: All facts verified correct
- 70-89: Minor issues, mostly accurate
- 50-69: Some significant errors
- 0-49: Major factual problems, content unreliable

OUTPUT JSON:
{
  "isAccurate": boolean,
  "confidenceScore": number (0-100),
  "issues": [
    {
      "type": "wrong_fact|wrong_person|anachronism|irrelevant|exaggeration|confusion",
      "severity": "critical|major|minor",
      "claim": "the specific claim being checked",
      "problem": "what's wrong with it",
      "correction": "the correct information (if known)"
    }
  ],
  "corrections": ["list of suggested fixes"],
  "summary": "brief overall assessment"
}`;

/**
 * Validate lyrics for factual accuracy about a historical figure
 * Now with learning from past mistakes!
 */
export async function factCheckLyrics(
  figureName: string,
  lyrics: string,
  era?: string,
  keyFacts?: string[],
  autoLearn: boolean = true, // Automatically record mistakes for future learning
): Promise<FactCheckResult> {
  console.log(`🔍 Fact-checking lyrics for: ${figureName}`);

  // Get learning context from past mistakes
  const learningContext = buildLearningContext(figureName);
  const hasLearning = learningContext.length > 0;

  if (hasLearning) {
    console.log(`📚 Using learned context for ${figureName}`);
  }

  try {
    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      systemInstruction: FACT_CHECK_PROMPT + learningContext,
    });

    const geminiResponse = await model.generateContent(`
HISTORICAL FIGURE: ${figureName}
ERA: ${era || 'Unknown'}
PROVIDED KEY FACTS: ${keyFacts?.join(', ') || 'None provided'}

CONTENT TO FACT-CHECK (rap lyrics):
---
${lyrics}
---

Please verify:
1. Are ALL claims in these lyrics actually true about ${figureName}?
2. Is there any content that belongs to a DIFFERENT person?
3. Are dates, events, achievements correctly attributed?
4. Are there any anachronisms?
5. Is all content RELEVANT to this specific person?

Be thorough. If the name could be confused with someone else (abbreviations, similar names), verify the content matches the correct person.
    `);

    const result = JSON.parse(geminiResponse.response.text());

    console.log(`✅ Fact-check complete: ${result.confidenceScore}% confidence`);
    if (result.issues?.length > 0) {
      console.log(`   ⚠️ Found ${result.issues.length} issues:`);
      result.issues.forEach((issue: FactIssue) => {
        console.log(`      - [${issue.severity}] ${issue.type}: ${issue.problem}`);

        // AUTO-LEARN: Record mistakes for future reference
        if (autoLearn && issue.severity === 'critical') {
          const confusedWith = issue.type === 'wrong_person' ? extractPersonName(issue.problem) : undefined;
          recordMistake(figureName, issue, confusedWith);
        }
      });
    }

    return {
      isAccurate: result.isAccurate ?? result.confidenceScore >= 70,
      confidenceScore: result.confidenceScore ?? 50,
      issues: result.issues || [],
      corrections: result.corrections || [],
      summary: result.summary || 'No summary provided',
      learnedFromPast: hasLearning,
    };
  } catch (error) {
    console.error('Fact-check failed:', error);
    return {
      isAccurate: false,
      confidenceScore: 0,
      issues: [
        {
          type: 'confusion',
          severity: 'critical',
          claim: 'Unable to verify',
          problem: 'Fact-check service failed',
        },
      ],
      corrections: [],
      summary: 'Fact-check could not be completed',
    };
  }
}

/**
 * Extract person name from error message (e.g., "This is about Julius Caesar" -> "Julius Caesar")
 */
function extractPersonName(text: string): string | undefined {
  // Common patterns: "about X", "refers to X", "is X"
  const patterns = [
    /about\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/,
    /refers?\s+to\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/,
    /is\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/,
    /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)'s/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return undefined;
}

/**
 * Validate story bible content for a historical figure
 */
export async function factCheckStoryBible(
  figureName: string,
  protagonist: { name: string; backstory: string; traits?: string[] },
  antagonist?: { name: string; backstory?: string },
  keyEvents?: string[],
): Promise<FactCheckResult> {
  console.log(`🔍 Fact-checking story bible for: ${figureName}`);

  try {
    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      systemInstruction: FACT_CHECK_PROMPT,
    });

    const geminiResponse = await model.generateContent(`
HISTORICAL FIGURE: ${figureName}

STORY CONTENT TO VERIFY:
---
PROTAGONIST: ${protagonist.name}
BACKSTORY: ${protagonist.backstory}
TRAITS: ${protagonist.traits?.join(', ') || 'None listed'}

${
  antagonist
    ? `ANTAGONIST: ${antagonist.name}
ANTAGONIST BACKSTORY: ${antagonist.backstory || 'None'}`
    : ''
}

KEY EVENTS CLAIMED: ${keyEvents?.join(', ') || 'None listed'}
---

Verify:
1. Is the protagonist correctly identified as ${figureName}?
2. Is the backstory factually accurate for this person?
3. If an antagonist is mentioned, did they actually exist and conflict with this person?
4. Are all events correctly attributed to this person's life?
    `);

    const result = JSON.parse(geminiResponse.response.text());

    console.log(`✅ Story bible fact-check: ${result.confidenceScore}% confidence`);

    return {
      isAccurate: result.isAccurate ?? result.confidenceScore >= 70,
      confidenceScore: result.confidenceScore ?? 50,
      issues: result.issues || [],
      corrections: result.corrections || [],
      summary: result.summary || 'No summary provided',
    };
  } catch (error) {
    console.error('Story bible fact-check failed:', error);
    return {
      isAccurate: false,
      confidenceScore: 0,
      issues: [],
      corrections: [],
      summary: 'Fact-check could not be completed',
    };
  }
}

/**
 * Quick validation to ensure content is about the RIGHT person
 * (catches name confusion issues like "FZ" being wrong person)
 * Now with learning!
 */
export async function validatePersonMatch(
  requestedFigure: string,
  generatedContent: string,
  autoLearn: boolean = true,
): Promise<{ isMatch: boolean; actualPerson?: string; confidence: number; learnedFromPast?: boolean }> {
  console.log(`🔍 Validating content matches: ${requestedFigure}`);

  // Check learning context
  const confusedWith = getConfusedFigures(requestedFigure);
  const hasLearning = confusedWith.length > 0;

  let extraWarning = '';
  if (hasLearning) {
    extraWarning = `\n\n⚠️ KNOWN CONFUSION: ${requestedFigure} is often confused with: ${confusedWith.join(', ')}. Be extra careful!`;
    console.log(`📚 Using learned confusion pairs for ${requestedFigure}`);
  }

  try {
    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.2, maxOutputTokens: 500, responseMimeType: 'application/json' },
      systemInstruction: `You are a fact-checker. Determine if content is actually about the requested person.${extraWarning}

OUTPUT JSON:
{
  "isMatch": boolean,
  "actualPerson": "who the content appears to be about (if different)",
  "confidence": number (0-100),
  "explanation": "brief explanation"
}`,
    });

    const geminiResponse = await model.generateContent(`
REQUESTED PERSON: ${requestedFigure}

CONTENT:
${generatedContent.slice(0, 2000)}

Is this content actually about ${requestedFigure}? Or is it about someone else (due to name confusion, abbreviation confusion, etc.)?
    `);

    const result = JSON.parse(geminiResponse.response.text());

    if (!result.isMatch) {
      console.log(`⚠️ CONTENT MISMATCH: Requested "${requestedFigure}" but content is about "${result.actualPerson}"`);

      // AUTO-LEARN: Track this confusion pair
      if (autoLearn && result.actualPerson) {
        trackConfusionPair(requestedFigure, result.actualPerson, 'Content mismatch detected');
      }
    }

    return {
      isMatch: result.isMatch ?? true,
      actualPerson: result.actualPerson,
      confidence: result.confidence ?? 50,
      learnedFromPast: hasLearning,
    };
  } catch (error) {
    console.error('Person validation failed:', error);
    return { isMatch: true, confidence: 0 };
  }
}

/**
 * Get key verified facts about a historical figure (for input to content generation)
 */
export async function getVerifiedFacts(figureName: string): Promise<{
  fullName: string;
  birthYear?: number;
  deathYear?: number;
  era: string;
  nationality: string;
  knownFor: string[];
  keyEvents: string[];
  rivals?: string[];
}> {
  console.log(`📚 Retrieving verified facts for: ${figureName}`);

  try {
    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000, responseMimeType: 'application/json' },
      systemInstruction: `You are a historical encyclopedia. Provide ONLY verified, factual information about historical figures. If uncertain about any fact, omit it rather than guess.

OUTPUT JSON:
{
  "fullName": "their complete official name",
  "birthYear": number or null,
  "deathYear": number or null,
  "era": "time period description",
  "nationality": "country/region",
  "knownFor": ["list of their main achievements/roles"],
  "keyEvents": ["major verifiable events in their life with dates"],
  "rivals": ["known historical opponents/rivals if any"]
}`,
    });

    const geminiResponse = await model.generateContent(`Provide verified historical facts about: ${figureName}

Only include information you are confident is accurate. Better to have fewer facts than wrong facts.`);

    const result = JSON.parse(geminiResponse.response.text());

    console.log(`✅ Retrieved verified facts for ${result.fullName}`);
    console.log(`   Era: ${result.era}`);
    console.log(`   Known for: ${result.knownFor?.slice(0, 3).join(', ')}`);

    return {
      fullName: result.fullName || figureName,
      birthYear: result.birthYear,
      deathYear: result.deathYear,
      era: result.era || 'Unknown era',
      nationality: result.nationality || 'Unknown',
      knownFor: result.knownFor || [],
      keyEvents: result.keyEvents || [],
      rivals: result.rivals,
    };
  } catch (error) {
    console.error('Failed to get verified facts:', error);
    return {
      fullName: figureName,
      era: 'Unknown',
      nationality: 'Unknown',
      knownFor: [],
      keyEvents: [],
    };
  }
}

export const factCheckService = {
  factCheckLyrics,
  factCheckStoryBible,
  validatePersonMatch,
  getVerifiedFacts,
  recordMistake,
  registerAlias,
  getLearningStats,
};
