/**
 * TEMPORAL NARRATIVE ATOMS (TNA) SERVICE
 *
 * Formalizes script breakdown into minimal narrative units for:
 * - Precise lyric-to-visual mapping
 * - Coverage scoring (did generated clips cover all story beats?)
 * - Coherence scoring (do transitions follow narrative flow?)
 * - Database persistence for package-level TNA breakdowns
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { narrativeTnaBreakdowns } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { LibrosaAnalysis, SectionMarker } from './gpt-cinematic-director';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

// ============================================================================
// TYPES
// ============================================================================

export type TNAType = 'beat' | 'action' | 'emotion' | 'transition' | 'hook';
export type EmotionalArc = 'rising' | 'falling' | 'peak' | 'stable';

export interface TemporalNarrativeAtom {
  id: string;
  index: number;
  type: TNAType;
  text: string;
  narrativeObjective: string;
  requiredElements: RequiredElements;
  emotionalArc: EmotionalArc;
  dependencies: string[];
  timeWindow: TimeWindow;
}

export interface RequiredElements {
  characters: string[];
  props: string[];
  settings: string[];
}

export interface TimeWindow {
  start: number;
  end: number;
}

export interface GeneratedClip {
  clipIndex: number;
  prompt: string;
  startTime: number;
  endTime: number;
  detectedElements?: {
    characters?: string[];
    props?: string[];
    settings?: string[];
  };
}

export interface TNABreakdownResult {
  packageId: string;
  lyrics: string;
  tnas: TemporalNarrativeAtom[];
  totalDuration: number;
  generatedAt: Date;
}

export interface CoverageScore {
  score: number;
  coveredTNAs: string[];
  uncoveredTNAs: string[];
  elementCoverage: {
    characters: { covered: number; total: number };
    props: { covered: number; total: number };
    settings: { covered: number; total: number };
  };
  details: Array<{
    tnaId: string;
    covered: boolean;
    missingElements: string[];
  }>;
}

export interface CoherenceScore {
  score: number;
  dependencyScore: number;
  emotionalArcScore: number;
  transitionScore: number;
  issues: Array<{
    type: 'dependency_violation' | 'arc_disruption' | 'transition_gap';
    tnaId: string;
    description: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
}

// ============================================================================
// GPT SYSTEM PROMPT FOR TNA EXTRACTION
// ============================================================================

const TNA_EXTRACTION_PROMPT = `You are a narrative analyst specializing in breaking down song lyrics into Temporal Narrative Atoms (TNAs).

A TNA is a minimal unit of narrative meaning that:
1. Represents a single story beat, action, emotion, transition, or hook
2. Has a clear narrative objective (what the moment should achieve)
3. Requires specific visual elements (characters, props, settings)
4. Fits within the emotional arc of the story

## TNA TYPES

| Type | Description | Example |
|------|-------------|---------|
| beat | Core story moment that advances plot | "Hero realizes the truth" |
| action | Physical action or movement | "Charges into battle" |
| emotion | Emotional expression or shift | "Grief overcomes the king" |
| transition | Scene or time change | "Years pass, empire grows" |
| hook | Attention-grabbing moment, viral potential | "Opening line that demands attention" |

## EMOTIONAL ARC TYPES

| Arc | Description |
|-----|-------------|
| rising | Building tension, intensity increasing |
| falling | Resolution, tension decreasing |
| peak | Maximum intensity, climax |
| stable | Maintaining current emotional state |

## OUTPUT FORMAT

Return a JSON array of TNAs. Each TNA should have:
- id: Unique identifier (e.g., "tna_001")
- index: Sequential index starting from 0
- type: One of 'beat', 'action', 'emotion', 'transition', 'hook'
- text: The exact lyric line(s) this TNA represents
- narrativeObjective: What this moment should achieve narratively
- requiredElements: { characters: [], props: [], settings: [] }
- emotionalArc: One of 'rising', 'falling', 'peak', 'stable'
- dependencies: Array of TNA IDs this depends on (for continuity)

## RULES

1. Every lyric line should map to at least one TNA
2. A single line can generate multiple TNAs if it has multiple beats
3. Dependencies should only reference earlier TNAs
4. Hook TNAs should be marked at the beginning and at key viral moments
5. Identify ALL visual elements that MUST appear for the story to make sense
6. Consider the musical structure (verse, chorus, bridge) when assigning types

## EXAMPLE

Input lyrics:
"They poisoned his father, left his kingdom in flames
Now a boy must rise, carve his name in the game"

Output:
[
  {
    "id": "tna_001",
    "index": 0,
    "type": "hook",
    "text": "They poisoned his father",
    "narrativeObjective": "Establish the inciting tragedy that drives the story",
    "requiredElements": {
      "characters": ["dying king", "young prince"],
      "props": ["poison chalice", "crown"],
      "settings": ["palace throne room"]
    },
    "emotionalArc": "peak",
    "dependencies": []
  },
  {
    "id": "tna_002",
    "index": 1,
    "type": "action",
    "text": "left his kingdom in flames",
    "narrativeObjective": "Show the devastation and stakes",
    "requiredElements": {
      "characters": [],
      "props": ["burning structures"],
      "settings": ["kingdom exterior", "fire"]
    },
    "emotionalArc": "falling",
    "dependencies": ["tna_001"]
  },
  {
    "id": "tna_003",
    "index": 2,
    "type": "transition",
    "text": "Now a boy must rise",
    "narrativeObjective": "Time jump - child becomes determined youth",
    "requiredElements": {
      "characters": ["young prince (older)"],
      "props": [],
      "settings": ["training grounds or wilderness"]
    },
    "emotionalArc": "rising",
    "dependencies": ["tna_001", "tna_002"]
  },
  {
    "id": "tna_004",
    "index": 3,
    "type": "beat",
    "text": "carve his name in the game",
    "narrativeObjective": "Hero commits to vengeance/glory path",
    "requiredElements": {
      "characters": ["young prince"],
      "props": ["sword or weapon"],
      "settings": ["epic landscape"]
    },
    "emotionalArc": "rising",
    "dependencies": ["tna_003"]
  }
]`;

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

class NarrativeTnaService {
  /**
   * Break down lyrics into Temporal Narrative Atoms using GPT-4o
   * Maps atoms to timestamp windows using librosa sections
   */
  async breakdownToTNAs(
    lyrics: string,
    librosaData: LibrosaAnalysis,
    packageId?: string,
  ): Promise<TemporalNarrativeAtom[]> {
    console.log('🎭 Starting TNA breakdown for lyrics...');

    // Step 1: Use GPT-4o to extract semantic TNAs from lyrics
    const rawTNAs = await this.extractTNAsWithGPT(lyrics);

    // Step 2: Map TNAs to timestamp windows using librosa sections
    const mappedTNAs = this.mapTNAsToTimestamps(rawTNAs, librosaData);

    // Step 3: Persist to database if packageId provided
    if (packageId) {
      await this.persistTNABreakdown(packageId, lyrics, mappedTNAs, librosaData.duration);
    }

    console.log(`✅ TNA breakdown complete: ${mappedTNAs.length} atoms extracted`);
    return mappedTNAs;
  }

  /**
   * Use GPT-4o to extract TNAs from lyrics
   */
  private async extractTNAsWithGPT(lyrics: string): Promise<TemporalNarrativeAtom[]> {
    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
        systemInstruction: TNA_EXTRACTION_PROMPT,
      });

      const result = await model.generateContent(
        `Break down these lyrics into Temporal Narrative Atoms (TNAs):\n\n${lyrics}`,
      );
      const content = result.response.text();
      if (!content) {
        throw new Error('No response from Gemini');
      }

      const parsed = JSON.parse(content);
      const tnas = parsed.tnas || parsed;

      if (!Array.isArray(tnas)) {
        throw new Error('Invalid TNA response format');
      }

      // Validate and normalize TNAs
      return tnas.map((tna: any, idx: number) => this.normalizeTNA(tna, idx));
    } catch (error: any) {
      console.error('❌ GPT TNA extraction failed:', error.message);
      throw new Error(`TNA extraction failed: ${error.message}`);
    }
  }

  /**
   * Normalize and validate a TNA object
   */
  private normalizeTNA(raw: any, fallbackIndex: number): TemporalNarrativeAtom {
    return {
      id: raw.id || `tna_${String(fallbackIndex).padStart(3, '0')}`,
      index: typeof raw.index === 'number' ? raw.index : fallbackIndex,
      type: this.validateTNAType(raw.type),
      text: raw.text || '',
      narrativeObjective: raw.narrativeObjective || raw.narrative_objective || '',
      requiredElements: {
        characters: Array.isArray(raw.requiredElements?.characters) ? raw.requiredElements.characters : [],
        props: Array.isArray(raw.requiredElements?.props) ? raw.requiredElements.props : [],
        settings: Array.isArray(raw.requiredElements?.settings) ? raw.requiredElements.settings : [],
      },
      emotionalArc: this.validateEmotionalArc(raw.emotionalArc || raw.emotional_arc),
      dependencies: Array.isArray(raw.dependencies) ? raw.dependencies : [],
      timeWindow: { start: 0, end: 0 }, // Will be filled by timestamp mapping
    };
  }

  /**
   * Validate TNA type, default to 'beat' if invalid
   */
  private validateTNAType(type: string): TNAType {
    const validTypes: TNAType[] = ['beat', 'action', 'emotion', 'transition', 'hook'];
    return validTypes.includes(type as TNAType) ? (type as TNAType) : 'beat';
  }

  /**
   * Validate emotional arc, default to 'stable' if invalid
   */
  private validateEmotionalArc(arc: string): EmotionalArc {
    const validArcs: EmotionalArc[] = ['rising', 'falling', 'peak', 'stable'];
    return validArcs.includes(arc as EmotionalArc) ? (arc as EmotionalArc) : 'stable';
  }

  /**
   * Map TNAs to timestamp windows based on librosa analysis
   * Uses sections to determine time boundaries
   */
  private mapTNAsToTimestamps(tnas: TemporalNarrativeAtom[], librosa: LibrosaAnalysis): TemporalNarrativeAtom[] {
    const totalDuration = librosa.duration;
    const tnaCount = tnas.length;

    if (tnaCount === 0) return [];

    // Strategy: Distribute TNAs across sections, then evenly within sections
    const sections =
      librosa.sections.length > 0
        ? librosa.sections
        : [{ startTime: 0, endTime: totalDuration, type: 'verse' as const, energy: 'medium' as const }];

    // Calculate TNAs per section based on duration weight
    const sectionDurations = sections.map((s) => s.endTime - s.startTime);
    const totalSectionDuration = sectionDurations.reduce((a, b) => a + b, 0);

    // Assign TNAs proportionally to sections
    const tnasPerSection = sections.map((_s, i) => {
      const weight = sectionDurations[i] / totalSectionDuration;
      return Math.max(1, Math.round(tnaCount * weight));
    });

    // Adjust to match exact TNA count
    let assigned = tnasPerSection.reduce((a, b) => a + b, 0);
    while (assigned !== tnaCount) {
      if (assigned < tnaCount) {
        // Add to longest section
        const maxIdx = sectionDurations.indexOf(Math.max(...sectionDurations));
        tnasPerSection[maxIdx]++;
        assigned++;
      } else {
        // Remove from section with most TNAs
        const maxTnaIdx = tnasPerSection.indexOf(Math.max(...tnasPerSection));
        if (tnasPerSection[maxTnaIdx] > 1) {
          tnasPerSection[maxTnaIdx]--;
          assigned--;
        } else {
          break; // Can't reduce further
        }
      }
    }

    // Map TNAs to time windows
    let tnaIndex = 0;
    const mappedTNAs: TemporalNarrativeAtom[] = [];

    for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
      const section = sections[sectionIdx];
      const tnasInSection = tnasPerSection[sectionIdx];
      const sectionDuration = section.endTime - section.startTime;
      const tnaWindowSize = sectionDuration / tnasInSection;

      for (let i = 0; i < tnasInSection && tnaIndex < tnas.length; i++) {
        const tna = tnas[tnaIndex];
        const start = section.startTime + i * tnaWindowSize;
        const end = start + tnaWindowSize;

        mappedTNAs.push({
          ...tna,
          timeWindow: {
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
          },
        });
        tnaIndex++;
      }
    }

    return mappedTNAs;
  }

  /**
   * Score how well generated clips cover the required elements in TNAs
   * Returns 0-100 score
   */
  scoreUnitCoverage(generatedClips: GeneratedClip[], tnas: TemporalNarrativeAtom[]): CoverageScore {
    if (tnas.length === 0) {
      return {
        score: 100,
        coveredTNAs: [],
        uncoveredTNAs: [],
        elementCoverage: {
          characters: { covered: 0, total: 0 },
          props: { covered: 0, total: 0 },
          settings: { covered: 0, total: 0 },
        },
        details: [],
      };
    }

    const coveredTNAs: string[] = [];
    const uncoveredTNAs: string[] = [];
    const details: CoverageScore['details'] = [];

    let totalCharacters = 0;
    let coveredCharacters = 0;
    let totalProps = 0;
    let coveredProps = 0;
    let totalSettings = 0;
    let coveredSettings = 0;

    for (const tna of tnas) {
      // Find clips that overlap with this TNA's time window
      const overlappingClips = generatedClips.filter((clip) =>
        this.timeWindowsOverlap({ start: clip.startTime, end: clip.endTime }, tna.timeWindow),
      );

      // Collect all elements from overlapping clips
      const clipElements = {
        characters: new Set<string>(),
        props: new Set<string>(),
        settings: new Set<string>(),
      };

      for (const clip of overlappingClips) {
        // Extract elements from clip prompt (simple keyword matching)
        const promptElements = this.extractElementsFromPrompt(clip.prompt);
        promptElements.characters.forEach((c) => clipElements.characters.add(c.toLowerCase()));
        promptElements.props.forEach((p) => clipElements.props.add(p.toLowerCase()));
        promptElements.settings.forEach((s) => clipElements.settings.add(s.toLowerCase()));

        // Also use detected elements if available
        if (clip.detectedElements) {
          clip.detectedElements.characters?.forEach((c) => clipElements.characters.add(c.toLowerCase()));
          clip.detectedElements.props?.forEach((p) => clipElements.props.add(p.toLowerCase()));
          clip.detectedElements.settings?.forEach((s) => clipElements.settings.add(s.toLowerCase()));
        }
      }

      // Check coverage for this TNA
      const missingElements: string[] = [];
      let tnaCovered = true;

      // Check characters
      for (const reqChar of tna.requiredElements.characters) {
        totalCharacters++;
        const found = this.fuzzyMatch(reqChar, clipElements.characters);
        if (found) {
          coveredCharacters++;
        } else {
          missingElements.push(`character: ${reqChar}`);
          tnaCovered = false;
        }
      }

      // Check props
      for (const reqProp of tna.requiredElements.props) {
        totalProps++;
        const found = this.fuzzyMatch(reqProp, clipElements.props);
        if (found) {
          coveredProps++;
        } else {
          missingElements.push(`prop: ${reqProp}`);
          tnaCovered = false;
        }
      }

      // Check settings
      for (const reqSetting of tna.requiredElements.settings) {
        totalSettings++;
        const found = this.fuzzyMatch(reqSetting, clipElements.settings);
        if (found) {
          coveredSettings++;
        } else {
          missingElements.push(`setting: ${reqSetting}`);
          tnaCovered = false;
        }
      }

      if (tnaCovered) {
        coveredTNAs.push(tna.id);
      } else {
        uncoveredTNAs.push(tna.id);
      }

      details.push({
        tnaId: tna.id,
        covered: tnaCovered,
        missingElements,
      });
    }

    // Calculate overall score
    const tnaScore = (coveredTNAs.length / tnas.length) * 100;

    return {
      score: Math.round(tnaScore),
      coveredTNAs,
      uncoveredTNAs,
      elementCoverage: {
        characters: { covered: coveredCharacters, total: totalCharacters },
        props: { covered: coveredProps, total: totalProps },
        settings: { covered: coveredSettings, total: totalSettings },
      },
      details,
    };
  }

  /**
   * Score coherence of generated clips based on TNA dependencies and emotional arc
   * Returns 0-100 score
   */
  scoreUnitCoherence(generatedClips: GeneratedClip[], tnas: TemporalNarrativeAtom[]): CoherenceScore {
    if (tnas.length === 0) {
      return {
        score: 100,
        dependencyScore: 100,
        emotionalArcScore: 100,
        transitionScore: 100,
        issues: [],
      };
    }

    const issues: CoherenceScore['issues'] = [];

    // 1. Check dependency violations
    let dependencyViolations = 0;
    let totalDependencies = 0;

    for (const tna of tnas) {
      for (const depId of tna.dependencies) {
        totalDependencies++;
        const depTna = tnas.find((t) => t.id === depId);
        if (depTna && depTna.timeWindow.end > tna.timeWindow.start) {
          dependencyViolations++;
          issues.push({
            type: 'dependency_violation',
            tnaId: tna.id,
            description: `Depends on ${depId} which hasn't completed before this TNA starts`,
            severity: 'major',
          });
        }
      }
    }

    const dependencyScore =
      totalDependencies > 0 ? ((totalDependencies - dependencyViolations) / totalDependencies) * 100 : 100;

    // 2. Check emotional arc progression
    let arcDisruptions = 0;
    const expectedArcs: Record<string, EmotionalArc[]> = {
      rising: ['rising', 'peak', 'stable'],
      peak: ['falling', 'stable', 'rising'],
      falling: ['stable', 'rising', 'falling'],
      stable: ['rising', 'falling', 'stable', 'peak'],
    };

    for (let i = 1; i < tnas.length; i++) {
      const prevArc = tnas[i - 1].emotionalArc;
      const currArc = tnas[i].emotionalArc;

      const validTransitions = expectedArcs[prevArc] || [];
      if (!validTransitions.includes(currArc)) {
        arcDisruptions++;
        issues.push({
          type: 'arc_disruption',
          tnaId: tnas[i].id,
          description: `Abrupt arc change from '${prevArc}' to '${currArc}'`,
          severity: 'minor',
        });
      }
    }

    const emotionalArcScore = tnas.length > 1 ? ((tnas.length - 1 - arcDisruptions) / (tnas.length - 1)) * 100 : 100;

    // 3. Check transition gaps (TNAs without corresponding clips)
    let transitionGaps = 0;

    for (const tna of tnas) {
      const hasClip = generatedClips.some((clip) =>
        this.timeWindowsOverlap({ start: clip.startTime, end: clip.endTime }, tna.timeWindow),
      );

      if (!hasClip) {
        transitionGaps++;
        issues.push({
          type: 'transition_gap',
          tnaId: tna.id,
          description: `No clip covers time window ${tna.timeWindow.start}s - ${tna.timeWindow.end}s`,
          severity: 'critical',
        });
      }
    }

    const transitionScore = ((tnas.length - transitionGaps) / tnas.length) * 100;

    // Calculate weighted overall score
    const overallScore = dependencyScore * 0.3 + emotionalArcScore * 0.3 + transitionScore * 0.4;

    return {
      score: Math.round(overallScore),
      dependencyScore: Math.round(dependencyScore),
      emotionalArcScore: Math.round(emotionalArcScore),
      transitionScore: Math.round(transitionScore),
      issues,
    };
  }

  /**
   * Check if two time windows overlap
   */
  private timeWindowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
    return a.start < b.end && b.start < a.end;
  }

  /**
   * Fuzzy match a required element against a set of detected elements
   */
  private fuzzyMatch(required: string, detected: Set<string>): boolean {
    const reqLower = required.toLowerCase();

    // Direct match
    if (detected.has(reqLower)) return true;

    // Partial match (required is substring of detected or vice versa)
    for (const det of detected) {
      if (det.includes(reqLower) || reqLower.includes(det)) {
        return true;
      }
    }

    // Word overlap match (at least one significant word matches)
    const reqWords = reqLower.split(/\s+/).filter((w) => w.length > 3);
    for (const word of reqWords) {
      for (const det of detected) {
        if (det.includes(word)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extract potential elements from a video prompt using keyword patterns
   */
  private extractElementsFromPrompt(prompt: string): RequiredElements {
    const promptLower = prompt.toLowerCase();

    // Common character indicators
    const characterPatterns = [
      /\b(king|queen|warrior|prince|princess|emperor|conqueror|ruler|general)\b/gi,
      /\b(man|woman|person|figure|hero|protagonist)\b/gi,
      /\b([A-Z][a-z]+ (?:the |of )?[A-Z][a-z]+)\b/g, // Proper names
    ];

    // Common prop indicators
    const propPatterns = [
      /\b(sword|crown|throne|armor|weapon|shield|scepter|chalice)\b/gi,
      /\b(scroll|book|map|banner|flag|torch)\b/gi,
    ];

    // Common setting indicators
    const settingPatterns = [
      /\b(palace|throne room|battlefield|desert|steppe|mountain|castle)\b/gi,
      /\b(temple|city|village|forest|ocean|river)\b/gi,
    ];

    const characters: string[] = [];
    const props: string[] = [];
    const settings: string[] = [];

    for (const pattern of characterPatterns) {
      const matches = promptLower.match(pattern);
      if (matches) characters.push(...matches);
    }

    for (const pattern of propPatterns) {
      const matches = promptLower.match(pattern);
      if (matches) props.push(...matches);
    }

    for (const pattern of settingPatterns) {
      const matches = promptLower.match(pattern);
      if (matches) settings.push(...matches);
    }

    return {
      characters: [...new Set(characters)],
      props: [...new Set(props)],
      settings: [...new Set(settings)],
    };
  }

  /**
   * Persist TNA breakdown to database
   */
  async persistTNABreakdown(
    packageId: string,
    lyrics: string,
    tnas: TemporalNarrativeAtom[],
    totalDuration: number,
  ): Promise<void> {
    try {
      await db
        .insert(narrativeTnaBreakdowns)
        .values({
          packageId,
          lyrics,
          tnas: tnas,
          totalDuration: String(totalDuration),
        })
        .onConflictDoUpdate({
          target: narrativeTnaBreakdowns.packageId,
          set: {
            lyrics,
            tnas: tnas,
            totalDuration: String(totalDuration),
            updatedAt: new Date(),
          },
        });
      console.log(`💾 Persisted TNA breakdown for package ${packageId}`);
    } catch (error: any) {
      console.error('⚠️ Failed to persist TNA breakdown:', error.message);
    }
  }

  /**
   * Load TNA breakdown from database
   */
  async loadTNABreakdown(packageId: string): Promise<TNABreakdownResult | null> {
    try {
      const rows = await db
        .select()
        .from(narrativeTnaBreakdowns)
        .where(eq(narrativeTnaBreakdowns.packageId, packageId));

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        packageId: row.packageId,
        lyrics: row.lyrics,
        tnas: row.tnas as TemporalNarrativeAtom[],
        totalDuration: parseFloat(row.totalDuration),
        generatedAt: row.createdAt,
      };
    } catch (error: any) {
      console.error('⚠️ Failed to load TNA breakdown:', error.message);
      return null;
    }
  }
}

// Export singleton instance
export const narrativeTnaService = new NarrativeTnaService();
