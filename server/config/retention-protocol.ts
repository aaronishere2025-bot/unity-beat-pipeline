/**
 * RETENTION PROTOCOL V1
 *
 * Target: 60-70% retention (up from current 22%)
 * Based on analysis of viral short-form content
 */

export const RETENTION_PROTOCOL_V1 = {
  contract_id: 'RETENTION_OPTIMIZATION_PRIME',
  priority: 'CRITICAL',
  target_metric: 'retention_above_65',

  // FOUNDATIONAL RULE: Accuracy comes BEFORE entertainment
  core_principle: 'HIGH RETENTION + HIGH ACCURACY. Engaging delivery of REAL history, never fabricated drama.',

  directives: {
    NARRATIVE_AGENT: {
      accuracy_mandate:
        'CRITICAL: All conflicts, hooks, and dramatic moments must be REAL and VERIFIED. Use canonical facts ONLY. Reject any fabricated drama, exaggerated numbers, or invented details.',
      hook_rule:
        'First 2 lines MUST contain a REAL contradiction, threat, or high-stakes question from verified history. Use actual shocking facts, not invented drama.',
      structure:
        'Inverted Pyramid: Start with the REAL climax (verified dramatic moment), then explain how we got there using FACTS.',
      conflict_enforcement:
        'Every verse must pit two REAL forces against each other using VERIFIED events (e.g., documented wars, recorded betrayals, historical struggles). Conflicts must be factual, not dramatized.',
      banned_phrases: ["Let's talk about", 'Here is a story', 'In the year', 'Once upon a time', 'This is about'],
      required_elements: {
        hook: 'REAL contradiction or threat from verified sources in first 10 words',
        open_loop: 'REAL question from history posed in first verse, answered in bridge with FACTS',
        conflict: 'Two REAL opposing forces with documented evidence',
        payoff: 'REAL twist/reveal that actually happened (verified)',
      },
      fact_priority:
        'If choosing between a boring truth and exciting fiction, ALWAYS choose truth. Find the excitement IN the real facts.',
    },

    VISUAL_AGENT: {
      pacing_enforcer: 'Strict variety. Never use two static wide shots in a row.',
      camera_sequencing: {
        '0-5s': 'Extreme Close-up or Fast Motion (The Hook)',
        '5-10s': 'Wide Establishing (The Context)',
        '10-15s': 'First Person POV (The Immersion)',
        '15-20s': 'Rapid Cuts/Montage (The Energy)',
        pattern: 'tight → wide → tight → wide (creates visual rhythm)',
      },
      movement_mandate: 'Every prompt must include dynamic action verb in CAPS (BURSTS, STORMS, CHARGES, EXPLODES)',
      brightness_contrast: 'Ensure distinct color palette shifts between verses to signal progression.',
      banned_shots: ['standing still', 'posing', 'looking at camera', 'static portrait'],
    },

    AUDIO_AGENT: {
      librosa_sync_rule: "Force a 'drop' or silence gap exactly before the main reveal.",
      energy_mapping: 'If visual_energy < 50%, audio_energy must be > 80% to compensate.',
      beat_precision: 'Transitions must hit on downbeat (strongest beat of bar), not just near it.',
      build_and_release: 'Every 15 seconds must have energy build followed by release (keeps attention)',
    },
  },

  quality_gate_override: {
    condition: 'If predicted_boredom_score > 0.4',
    action: 'REJECT lyrics. Do not proceed to Suno. Force rewrite with higher "controversy" temperature.',
  },

  // Camera sequencing pattern for 36 clips (180s video)
  camera_pattern_36_clips: [
    // Intro (clips 0-3): HOOK with extreme close-ups
    'extreme_close',
    'fast_motion',
    'dutch_angle',
    'whip_pan',
    // Verse 1 (clips 4-11): Context with variety
    'wide_establishing',
    'tracking_shot',
    'pov_perspective',
    'over_shoulder',
    'medium_close',
    'crane_up',
    'dolly_in',
    'handheld_shake',
    // Chorus (clips 12-19): Energy with rapid movement
    'whip_pan',
    'extreme_close',
    'dutch_angle',
    'fast_motion',
    'wide_action',
    'crash_zoom',
    'tracking_fast',
    'aerial_swoop',
    // Verse 2 (clips 20-27): Build tension
    'slow_push',
    'pov_perspective',
    'wide_establishing',
    'tilt_reveal',
    'over_shoulder',
    'tracking_shot',
    'medium_close',
    'crane_down',
    // Bridge (clips 28-31): Climax with chaos
    'crash_zoom',
    'whip_pan',
    'dutch_angle',
    'extreme_close',
    // Outro (clips 32-35): Resolution with power
    'wide_epic',
    'crane_up',
    'slow_pull_back',
    'aerial_reveal',
  ],

  // Conflict templates (Man vs. X)
  conflict_archetypes: {
    man_vs_nature: 'Survival against elements, weather, terrain',
    man_vs_man: 'War, betrayal, rivalry, political struggle',
    man_vs_society: 'Rebellion, revolution, fighting the system',
    man_vs_self: 'Internal struggle, doubt, redemption arc',
    man_vs_fate: 'Fighting destiny, prophecy, inevitable death',
    man_vs_god: 'Defying religious authority, challenging divine will',
  },

  // Boredom prediction (if lyrics lack these, reject)
  engagement_requirements: {
    min_conflict_keywords: 3, // 'vs', 'against', 'battle', 'fight', 'war', 'struggle'
    min_emotional_words: 5, // 'rage', 'fear', 'betrayed', 'shocked', 'destroyed'
    min_action_verbs: 8, // 'charged', 'burst', 'crashed', 'exploded', 'stormed'
    max_exposition_lines: 2, // No more than 2 lines of pure facts/dates
  },

  // Infinite loop structure
  loop_structure: {
    enabled: true,
    method: 'semantic_bridge', // Last line connects to first line meaning
    example_good: {
      last_line: "...and that's the reason why",
      first_line: 'Nobody trusted Henry VIII',
      result: 'Seamless loop, viewers watch twice before realizing',
    },
    example_bad: {
      last_line: 'And so the legend ends',
      first_line: 'In the year 1066',
      result: 'Obvious ending, no loop, viewer leaves',
    },
  },
};

// Helper function to check if lyrics meet retention requirements
export function validateRetentionLyrics(
  lyrics: string,
  verifiedFacts?: string[],
): {
  valid: boolean;
  score: number;
  issues: string[];
  accuracyWarnings: string[];
} {
  const issues: string[] = [];
  const accuracyWarnings: string[] = [];
  let score = 100;

  const lowerLyrics = lyrics.toLowerCase();

  // ACCURACY CHECK: Flag potential fabrications
  if (verifiedFacts && verifiedFacts.length > 0) {
    // Check for common fabrication indicators
    const fabricationIndicators = [
      'allegedly',
      'supposedly',
      'legend says',
      'myth tells',
      'some say',
      'rumored to',
      'believed to have',
      'possibly',
      'may have',
      'might have',
    ];

    for (const indicator of fabricationIndicators) {
      if (lowerLyrics.includes(indicator)) {
        accuracyWarnings.push(`Uncertainty indicator found: "${indicator}" - verify this is from sources`);
      }
    }

    // Check for exaggeration words that might signal made-up drama
    const exaggerationWords = ['infinite', 'unlimited', 'impossible', 'unbelievable', 'unimaginable', 'legendary'];
    for (const word of exaggerationWords) {
      if (lowerLyrics.includes(word)) {
        accuracyWarnings.push(`Potential exaggeration: "${word}" - ensure this is factually supported`);
      }
    }
  }

  // Check for banned phrases
  for (const phrase of RETENTION_PROTOCOL_V1.directives.NARRATIVE_AGENT.banned_phrases) {
    if (lowerLyrics.includes(phrase.toLowerCase())) {
      issues.push(`Contains banned phrase: "${phrase}"`);
      score -= 15;
    }
  }

  // Check for conflict keywords
  const conflictKeywords = ['vs', 'versus', 'against', 'battle', 'fight', 'war', 'struggle', 'challenge'];
  const conflictCount = conflictKeywords.filter((kw) => lowerLyrics.includes(kw)).length;
  if (conflictCount < RETENTION_PROTOCOL_V1.engagement_requirements.min_conflict_keywords) {
    issues.push(`Not enough conflict (${conflictCount}/3 keywords)`);
    score -= 20;
  }

  // Check for emotional words
  const emotionalWords = [
    'rage',
    'fear',
    'betrayed',
    'shocked',
    'destroyed',
    'terror',
    'fury',
    'devastated',
    'betrayal',
    'revenge',
  ];
  const emotionCount = emotionalWords.filter((word) => lowerLyrics.includes(word)).length;
  if (emotionCount < RETENTION_PROTOCOL_V1.engagement_requirements.min_emotional_words) {
    issues.push(`Not enough emotion (${emotionCount}/5 emotional words)`);
    score -= 15;
  }

  // Check for action verbs
  const actionVerbs = [
    'charged',
    'burst',
    'crashed',
    'exploded',
    'stormed',
    'shattered',
    'erupted',
    'slammed',
    'ripped',
    'crushed',
  ];
  const actionCount = actionVerbs.filter((verb) => lowerLyrics.includes(verb)).length;
  if (actionCount < RETENTION_PROTOCOL_V1.engagement_requirements.min_action_verbs) {
    issues.push(`Not enough action (${actionCount}/8 action verbs)`);
    score -= 15;
  }

  // Check first 10 words for hook
  const firstTenWords = lyrics.split(/\s+/).slice(0, 10).join(' ');
  const hasHook = /\?|!|never|nobody|everyone thinks|but|twist|shocking/.test(firstTenWords.toLowerCase());
  if (!hasHook) {
    issues.push('Weak hook - first 10 words lack punch');
    score -= 25;
  }

  return {
    valid: score >= 60,
    score: Math.max(0, score),
    issues,
    accuracyWarnings,
  };
}
