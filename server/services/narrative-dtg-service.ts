/**
 * NARRATIVE DYNAMIC TEMPORAL GRAPH (DTG) SERVICE
 *
 * Tracks long-range dependencies and object state across video clips:
 * - Entity tracking (characters, props, locations)
 * - State change detection across clips
 * - Consistency validation
 * - Continuity error detection
 * - Narrative coherence scoring
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type EntityType = 'character' | 'prop' | 'location';

export interface EntityAttributes {
  appearance?: {
    clothing?: string;
    physicalTraits?: string[];
    accessories?: string[];
    pose?: string;
  };
  state?: {
    condition?: string;
    position?: string;
    visibility?: 'visible' | 'hidden' | 'partial';
    damaged?: boolean;
  };
}

export interface EntityNode {
  id: string;
  type: EntityType;
  name: string;
  attributes: EntityAttributes;
  firstAppearance: number;
  lastAppearance: number;
}

export type RelationshipType =
  | 'continues'
  | 'appears'
  | 'disappears'
  | 'transforms'
  | 'moves'
  | 'interacts_with'
  | 'replaces';

export interface StateChange {
  attribute: string;
  from: string | undefined;
  to: string | undefined;
  isValid: boolean;
  reason?: string;
}

export interface TemporalEdge {
  sourceClipIndex: number;
  targetClipIndex: number;
  entityId: string;
  stateChange?: StateChange;
  relationship: RelationshipType;
}

export interface NarrativeGraph {
  entities: Map<string, EntityNode>;
  edges: TemporalEdge[];
  clipCount: number;
}

export interface TNA {
  clipIndex: number;
  timestamp: string;
  lyricLine: string;
  prompt: string;
  entities?: TNAEntity[];
  sceneDescription?: string;
}

export interface TNAEntity {
  name: string;
  type: EntityType;
  attributes?: EntityAttributes;
  action?: string;
}

export interface ClipResult {
  clipIndex: number;
  videoPath?: string;
  success: boolean;
  generatedEntities?: string[];
  visualDescription?: string;
}

export interface ClipAccuracyReport {
  clipIndex: number;
  passed: boolean;
  issues: Array<{
    type: string;
    severity: 'critical' | 'major' | 'minor';
    description: string;
  }>;
  detectedEntities?: string[];
}

export interface ConsistencyViolation {
  entityId: string;
  entityName: string;
  violationType:
    | 'appearance_change'
    | 'impossible_transition'
    | 'missing_entity'
    | 'duplicate_entity'
    | 'prop_persistence'
    | 'location_mismatch';
  severity: 'critical' | 'major' | 'minor';
  clipIndices: number[];
  description: string;
  suggestion?: string;
}

export interface ContinuityError {
  clipIndex: number;
  entityId: string;
  entityName: string;
  errorType: 'visual_mismatch' | 'missing_expected' | 'unexpected_appearance' | 'state_inconsistency';
  description: string;
  expectedState?: EntityAttributes;
  actualState?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const APPEARANCE_ATTRIBUTES = ['clothing', 'physicalTraits', 'accessories'];
const STATE_ATTRIBUTES = ['condition', 'position', 'visibility', 'damaged'];

const VALID_STATE_TRANSITIONS: Record<string, string[]> = {
  visible: ['hidden', 'partial', 'visible'],
  hidden: ['visible', 'partial', 'hidden'],
  partial: ['visible', 'hidden', 'partial'],
  pristine: ['damaged', 'pristine'],
  damaged: ['damaged', 'destroyed'],
  destroyed: ['destroyed'],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateEntityId(name: string, type: EntityType): string {
  return `${type}_${name.toLowerCase().replace(/\s+/g, '_')}`;
}

function extractEntitiesFromPrompt(prompt: string, clipIndex: number): TNAEntity[] {
  const entities: TNAEntity[] = [];

  const characterPatterns = [
    /(?:a|the)\s+(\w+(?:\s+\w+)?)\s+(?:warrior|king|queen|leader|soldier|general|emperor|empress|ruler|warlord|khan|conqueror)/gi,
    /(\w+(?:\s+\w+)?)\s+(?:stands|walks|rides|surveys|commands|fights|speaks)/gi,
    /(?:figure|character|person)\s+(?:of|named)\s+(\w+(?:\s+\w+)?)/gi,
  ];

  const locationPatterns = [
    /(?:in|at|on)\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:palace|throne|battlefield|steppe|desert|mountains|city|temple|fortress)/gi,
    /(\w+(?:\s+\w+)?)\s+(?:landscape|setting|environment|backdrop)/gi,
  ];

  const propPatterns = [
    /(?:holds|wields|carries|wears)\s+(?:a|the)\s+(\w+(?:\s+\w+)?)/gi,
    /(?:sword|crown|armor|scroll|staff|banner|shield|helmet)\s+(?:of|with)/gi,
  ];

  for (const pattern of characterPatterns) {
    const matches = prompt.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 2) {
        entities.push({
          name: match[1].trim(),
          type: 'character',
          action: match[0],
        });
      }
    }
  }

  for (const pattern of locationPatterns) {
    const matches = prompt.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 2) {
        entities.push({
          name: match[1].trim(),
          type: 'location',
        });
      }
    }
  }

  for (const pattern of propPatterns) {
    const matches = prompt.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 2) {
        entities.push({
          name: match[1].trim(),
          type: 'prop',
        });
      }
    }
  }

  return entities;
}

function isValidStateTransition(fromState: string | undefined, toState: string | undefined): boolean {
  if (!fromState || !toState) return true;

  const validTransitions = VALID_STATE_TRANSITIONS[fromState.toLowerCase()];
  if (!validTransitions) return true;

  return validTransitions.includes(toState.toLowerCase());
}

function attributesMatch(a: EntityAttributes | undefined, b: EntityAttributes | undefined): boolean {
  if (!a || !b) return true;

  if (a.appearance && b.appearance) {
    if (a.appearance.clothing && b.appearance.clothing && a.appearance.clothing !== b.appearance.clothing) {
      return false;
    }
  }

  return true;
}

function mergeAttributes(existing: EntityAttributes, incoming: EntityAttributes | undefined): EntityAttributes {
  if (!incoming) return existing;

  return {
    appearance: {
      ...existing.appearance,
      ...incoming.appearance,
    },
    state: {
      ...existing.state,
      ...incoming.state,
    },
  };
}

// ============================================================================
// CORE SERVICE
// ============================================================================

class NarrativeDtgService {
  /**
   * Build a temporal graph from TNA data and clip results
   */
  buildGraph(tnas: TNA[], clipResults: ClipResult[]): NarrativeGraph {
    const entities = new Map<string, EntityNode>();
    const edges: TemporalEdge[] = [];
    const clipCount = Math.max(tnas.length, clipResults.length);

    const entityClipHistory = new Map<string, Array<{ clipIndex: number; attributes: EntityAttributes }>>();

    for (const tna of tnas) {
      let tnaEntities = tna.entities || [];

      if (tnaEntities.length === 0 && tna.prompt) {
        tnaEntities = extractEntitiesFromPrompt(tna.prompt, tna.clipIndex);
      }

      for (const tnaEntity of tnaEntities) {
        const entityId = generateEntityId(tnaEntity.name, tnaEntity.type);

        if (!entities.has(entityId)) {
          entities.set(entityId, {
            id: entityId,
            type: tnaEntity.type,
            name: tnaEntity.name,
            attributes: tnaEntity.attributes || {},
            firstAppearance: tna.clipIndex,
            lastAppearance: tna.clipIndex,
          });
          entityClipHistory.set(entityId, []);
        }

        const entity = entities.get(entityId)!;
        entity.lastAppearance = Math.max(entity.lastAppearance, tna.clipIndex);
        entity.attributes = mergeAttributes(entity.attributes, tnaEntity.attributes);

        const history = entityClipHistory.get(entityId)!;
        history.push({
          clipIndex: tna.clipIndex,
          attributes: tnaEntity.attributes || {},
        });
      }
    }

    for (const [entityId, history] of entityClipHistory) {
      history.sort((a, b) => a.clipIndex - b.clipIndex);

      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];

        let relationship: RelationshipType = 'continues';
        let stateChange: StateChange | undefined;

        const clipGap = curr.clipIndex - prev.clipIndex;

        if (clipGap > 1) {
          relationship = 'appears';
        }

        if (prev.attributes.state?.visibility !== curr.attributes.state?.visibility) {
          if (curr.attributes.state?.visibility === 'hidden') {
            relationship = 'disappears';
          } else if (prev.attributes.state?.visibility === 'hidden') {
            relationship = 'appears';
          }
        }

        if (prev.attributes.appearance?.clothing !== curr.attributes.appearance?.clothing) {
          relationship = 'transforms';
          stateChange = {
            attribute: 'clothing',
            from: prev.attributes.appearance?.clothing,
            to: curr.attributes.appearance?.clothing,
            isValid: false,
            reason: 'Unexpected clothing change between clips',
          };
        }

        if (prev.attributes.state?.condition !== curr.attributes.state?.condition) {
          const isValid = isValidStateTransition(prev.attributes.state?.condition, curr.attributes.state?.condition);

          stateChange = {
            attribute: 'condition',
            from: prev.attributes.state?.condition,
            to: curr.attributes.state?.condition,
            isValid,
            reason: isValid ? undefined : 'Invalid state transition',
          };
        }

        edges.push({
          sourceClipIndex: prev.clipIndex,
          targetClipIndex: curr.clipIndex,
          entityId,
          stateChange,
          relationship,
        });
      }
    }

    return { entities, edges, clipCount };
  }

  /**
   * Check consistency of the narrative graph
   */
  checkConsistency(graph: NarrativeGraph): ConsistencyViolation[] {
    const violations: ConsistencyViolation[] = [];

    for (const edge of graph.edges) {
      if (edge.stateChange && !edge.stateChange.isValid) {
        const entity = graph.entities.get(edge.entityId);
        if (entity) {
          violations.push({
            entityId: edge.entityId,
            entityName: entity.name,
            violationType: 'impossible_transition',
            severity: 'major',
            clipIndices: [edge.sourceClipIndex, edge.targetClipIndex],
            description: `${entity.name}: ${edge.stateChange.reason || 'Invalid state transition'} (${edge.stateChange.from} → ${edge.stateChange.to})`,
            suggestion: `Ensure ${entity.name} maintains consistent ${edge.stateChange.attribute} between clips ${edge.sourceClipIndex} and ${edge.targetClipIndex}`,
          });
        }
      }
    }

    for (const [entityId, entity] of graph.entities) {
      if (entity.type === 'character') {
        const characterEdges = graph.edges.filter((e) => e.entityId === entityId);

        for (const edge of characterEdges) {
          if (edge.relationship === 'transforms') {
            violations.push({
              entityId,
              entityName: entity.name,
              violationType: 'appearance_change',
              severity: 'critical',
              clipIndices: [edge.sourceClipIndex, edge.targetClipIndex],
              description: `Character "${entity.name}" appearance changed unexpectedly`,
              suggestion: `Use consistent character reference for ${entity.name} across all clips`,
            });
          }
        }
      }
    }

    for (const [entityId, entity] of graph.entities) {
      if (entity.type === 'prop') {
        const propEdges = graph.edges.filter((e) => e.entityId === entityId);
        const clipGaps: number[] = [];

        for (const edge of propEdges) {
          const gap = edge.targetClipIndex - edge.sourceClipIndex;
          if (gap > 1) {
            clipGaps.push(edge.sourceClipIndex + 1);
          }
        }

        if (clipGaps.length > 0 && entity.lastAppearance - entity.firstAppearance > 3) {
          violations.push({
            entityId,
            entityName: entity.name,
            violationType: 'prop_persistence',
            severity: 'minor',
            clipIndices: clipGaps,
            description: `Prop "${entity.name}" disappears in clips [${clipGaps.join(', ')}] but reappears later`,
            suggestion: `Consider showing ${entity.name} in intermediate clips for continuity`,
          });
        }
      }
    }

    const locationsByClip = new Map<number, string[]>();
    for (const [entityId, entity] of graph.entities) {
      if (entity.type === 'location') {
        for (let i = entity.firstAppearance; i <= entity.lastAppearance; i++) {
          if (!locationsByClip.has(i)) {
            locationsByClip.set(i, []);
          }
          locationsByClip.get(i)!.push(entity.name);
        }
      }
    }

    for (const [clipIndex, locations] of locationsByClip) {
      if (locations.length > 1) {
        violations.push({
          entityId: 'multi_location',
          entityName: locations.join(', '),
          violationType: 'location_mismatch',
          severity: 'minor',
          clipIndices: [clipIndex],
          description: `Clip ${clipIndex} references multiple locations: ${locations.join(', ')}`,
          suggestion: 'Consider using a single primary location per clip',
        });
      }
    }

    return violations;
  }

  /**
   * Score long-range dependency coherence (0-100)
   */
  scoreLongRangeDependency(graph: NarrativeGraph): number {
    if (graph.entities.size === 0 || graph.clipCount === 0) {
      return 100;
    }

    let totalScore = 0;
    let entityCount = 0;

    for (const [entityId, entity] of graph.entities) {
      const entityEdges = graph.edges.filter((e) => e.entityId === entityId);
      const clipSpan = entity.lastAppearance - entity.firstAppearance;

      if (clipSpan < 2) {
        continue;
      }

      entityCount++;

      let entityScore = 100;

      const invalidTransitions = entityEdges.filter((e) => e.stateChange && !e.stateChange.isValid);
      entityScore -= invalidTransitions.length * 15;

      const unexpectedChanges = entityEdges.filter((e) => e.relationship === 'transforms');
      entityScore -= unexpectedChanges.length * 20;

      const longGapEdges = entityEdges.filter((e) => e.targetClipIndex - e.sourceClipIndex > 3);
      for (const edge of longGapEdges) {
        if (!edge.stateChange || edge.stateChange.isValid) {
          entityScore += 5;
        }
      }

      if (entity.type === 'character') {
        const consistentAppearances = entityEdges.filter((e) => e.relationship === 'continues');
        const consistencyRatio = consistentAppearances.length / Math.max(entityEdges.length, 1);
        entityScore = entityScore * (0.5 + 0.5 * consistencyRatio);
      }

      totalScore += Math.max(0, Math.min(100, entityScore));
    }

    if (entityCount === 0) {
      return 100;
    }

    const baseScore = totalScore / entityCount;

    let graphBonus = 0;

    const longRangeEntities = Array.from(graph.entities.values()).filter(
      (e) => e.lastAppearance - e.firstAppearance >= graph.clipCount * 0.5,
    );

    if (longRangeEntities.length > 0) {
      graphBonus += 5;
    }

    const characterCount = Array.from(graph.entities.values()).filter((e) => e.type === 'character').length;

    if (characterCount > 0 && characterCount <= 3) {
      graphBonus += 3;
    }

    return Math.round(Math.max(0, Math.min(100, baseScore + graphBonus)));
  }

  /**
   * Detect continuity errors by cross-referencing with visual validation
   */
  detectContinuityErrors(graph: NarrativeGraph, clipAccuracyReports: ClipAccuracyReport[]): ContinuityError[] {
    const errors: ContinuityError[] = [];

    const reportsByClip = new Map<number, ClipAccuracyReport>();
    for (const report of clipAccuracyReports) {
      reportsByClip.set(report.clipIndex, report);
    }

    for (const [entityId, entity] of graph.entities) {
      for (let clipIndex = entity.firstAppearance; clipIndex <= entity.lastAppearance; clipIndex++) {
        const report = reportsByClip.get(clipIndex);

        if (!report) continue;

        if (!report.passed) {
          const relevantIssues = report.issues.filter(
            (issue) =>
              issue.description.toLowerCase().includes(entity.name.toLowerCase()) ||
              (entity.type === 'character' && issue.type === 'face_distortion'),
          );

          for (const issue of relevantIssues) {
            errors.push({
              clipIndex,
              entityId,
              entityName: entity.name,
              errorType: 'visual_mismatch',
              description: `Visual validation failed for ${entity.name}: ${issue.description}`,
              expectedState: entity.attributes,
            });
          }
        }

        if (report.detectedEntities) {
          const entityMentioned = report.detectedEntities.some((detected) =>
            detected.toLowerCase().includes(entity.name.toLowerCase()),
          );

          if (!entityMentioned && entity.type === 'character') {
            const edgesToClip = graph.edges.filter(
              (e) => e.entityId === entityId && (e.sourceClipIndex === clipIndex || e.targetClipIndex === clipIndex),
            );

            const shouldBePresent = edgesToClip.some(
              (e) => e.relationship === 'continues' || e.relationship === 'appears',
            );

            if (shouldBePresent) {
              errors.push({
                clipIndex,
                entityId,
                entityName: entity.name,
                errorType: 'missing_expected',
                description: `Expected ${entity.name} to appear in clip ${clipIndex} but was not detected`,
                expectedState: entity.attributes,
              });
            }
          }
        }
      }
    }

    for (const report of clipAccuracyReports) {
      if (report.detectedEntities) {
        for (const detected of report.detectedEntities) {
          const matchingEntity = Array.from(graph.entities.values()).find(
            (e) => e.name.toLowerCase() === detected.toLowerCase(),
          );

          if (!matchingEntity) {
            continue;
          }

          if (report.clipIndex < matchingEntity.firstAppearance || report.clipIndex > matchingEntity.lastAppearance) {
            errors.push({
              clipIndex: report.clipIndex,
              entityId: matchingEntity.id,
              entityName: matchingEntity.name,
              errorType: 'unexpected_appearance',
              description: `${matchingEntity.name} detected in clip ${report.clipIndex} but wasn't expected (first: ${matchingEntity.firstAppearance}, last: ${matchingEntity.lastAppearance})`,
              actualState: detected,
            });
          }
        }
      }
    }

    for (const edge of graph.edges) {
      if (edge.stateChange && !edge.stateChange.isValid) {
        const entity = graph.entities.get(edge.entityId);
        if (entity) {
          errors.push({
            clipIndex: edge.targetClipIndex,
            entityId: edge.entityId,
            entityName: entity.name,
            errorType: 'state_inconsistency',
            description: `${entity.name} has invalid state transition from clip ${edge.sourceClipIndex} to ${edge.targetClipIndex}: ${edge.stateChange.from} → ${edge.stateChange.to}`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Get a summary of the graph for debugging/logging
   */
  getGraphSummary(graph: NarrativeGraph): {
    entityCount: number;
    edgeCount: number;
    clipCount: number;
    characters: string[];
    props: string[];
    locations: string[];
    longestEntitySpan: { name: string; span: number } | null;
  } {
    const characters: string[] = [];
    const props: string[] = [];
    const locations: string[] = [];
    let longestSpan: { name: string; span: number } | null = null;

    for (const [_, entity] of graph.entities) {
      const span = entity.lastAppearance - entity.firstAppearance;

      switch (entity.type) {
        case 'character':
          characters.push(entity.name);
          break;
        case 'prop':
          props.push(entity.name);
          break;
        case 'location':
          locations.push(entity.name);
          break;
      }

      if (!longestSpan || span > longestSpan.span) {
        longestSpan = { name: entity.name, span };
      }
    }

    return {
      entityCount: graph.entities.size,
      edgeCount: graph.edges.length,
      clipCount: graph.clipCount,
      characters,
      props,
      locations,
      longestEntitySpan: longestSpan,
    };
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const narrativeDtgService = new NarrativeDtgService();
