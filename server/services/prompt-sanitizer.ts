/**
 * Proactive VEO Prompt Sanitizer
 *
 * Sanitizes prompts BEFORE sending to VEO to avoid content policy violations.
 * Preserves historical accuracy while using VEO-compliant language.
 */

export interface SanitizationResult {
  sanitized: string;
  wasModified: boolean;
  replacements: Array<{ original: string; replacement: string }>;
}

// Words that almost always trigger content policy
const HARD_BLOCK_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Violence verbs
  { pattern: /\b(kill|killed|killing|kills)\b/gi, replacement: 'defeat' },
  { pattern: /\b(murder|murdered|murdering|murders)\b/gi, replacement: 'eliminate' },
  { pattern: /\b(slaughter|slaughtered|slaughtering)\b/gi, replacement: 'overcome' },
  { pattern: /\b(massacre|massacred|massacring)\b/gi, replacement: 'conquer' },
  { pattern: /\b(execute|executed|executing|execution)\b/gi, replacement: 'judge' },
  { pattern: /\b(assassinate|assassinated|assassinating)\b/gi, replacement: 'target' },

  // Gore/graphic
  { pattern: /\b(blood|bloody|bloodied|bloodshed)\b/gi, replacement: 'dust' },
  { pattern: /\b(gore|gory)\b/gi, replacement: 'intense' },
  { pattern: /\b(corpse|corpses|dead body|dead bodies)\b/gi, replacement: 'fallen figure' },
  { pattern: /\b(decapitate|decapitated|beheaded|behead)\b/gi, replacement: 'defeat' },
  { pattern: /\b(dismember|dismembered)\b/gi, replacement: 'overcome' },

  // Suffering
  { pattern: /\b(torture|tortured|torturing)\b/gi, replacement: 'imprisoned' },
  { pattern: /\b(agony|agonizing)\b/gi, replacement: 'struggle' },
  { pattern: /\b(suffer|suffered|suffering)\b/gi, replacement: 'endure' },

  // Captivity (especially with children)
  { pattern: /\b(enslaved|enslave|enslaving|slavery)\b/gi, replacement: 'captured' },
  { pattern: /\b(slave|slaves)\b/gi, replacement: 'prisoner' },
  { pattern: /\btied up\b/gi, replacement: 'held captive' },
  { pattern: /\bbound and\b/gi, replacement: 'restrained and' },
  { pattern: /\bdragged across\b/gi, replacement: 'led across' },
  { pattern: /\bdragged\b/gi, replacement: 'taken' },

  // Poison
  { pattern: /\b(poison|poisoned|poisoning)\b/gi, replacement: 'betrayed' },

  // Fire/destruction
  { pattern: /\b(burning|burned|burnt|burns)\b/gi, replacement: 'glowing' },
  { pattern: /\b(ablaze|on fire)\b/gi, replacement: 'illuminated' },
  { pattern: /\b(destroy|destroyed|destroying|destruction)\b/gi, replacement: 'overcome' },
  { pattern: /\b(raze|razed|razing)\b/gi, replacement: 'claim' },

  // Combat (softer replacements)
  { pattern: /\b(attack|attacked|attacking|attacks)\b/gi, replacement: 'advance' },
  { pattern: /\b(invade|invaded|invading|invasion)\b/gi, replacement: 'enter' },
  { pattern: /\b(raid|raided|raiding)\b/gi, replacement: 'approach' },

  // Death
  { pattern: /\b(death|deaths)\b/gi, replacement: 'fall' },
  { pattern: /\b(dead|deadly)\b/gi, replacement: 'fallen' },
  { pattern: /\b(dying|dies|died)\b/gi, replacement: 'fading' },
  { pattern: /\b(perish|perished|perishing)\b/gi, replacement: 'fall' },
];

// Child-specific sanitization (extra careful with minors) - PRE-SANITIZATION
const CHILD_SAFETY_PATTERNS_PRE: Array<{ pattern: RegExp; replacement: string }> = [
  // Age references with distress - catch these before HARD_BLOCK replaces individual words
  {
    pattern:
      /\b(\d+)-year-old\s+(boy|girl|child)\s*(,\s*)?(is|was|being)?\s*(tied|bound|dragged|beaten|tortured|held|captive|captured|imprisoned)/gi,
    replacement: 'young warrior faces adversity',
  },
  {
    pattern:
      /\byoung\s+(boy|girl|child)\s*(,\s*)?(is|was|being)?\s*(tied|bound|dragged|beaten|tortured|held|captive|captured)/gi,
    replacement: 'young survivor faces hardship',
  },
  {
    pattern: /\bchild\s+(is|was|being)?\s*(tied|bound|dragged|beaten|captured|enslaved|held|imprisoned)/gi,
    replacement: 'youth enters difficult times',
  },

  // More general child protection
  { pattern: /\b(boy|girl)\s+in\s+chains\b/gi, replacement: 'young survivor' },
  { pattern: /\borphaned\s+(boy|girl|child)\b/gi, replacement: 'young survivor' },

  // Complete scene transformations for child captivity
  {
    pattern: /\bTemüjin,?\s+a\s+(\d+)-year-old\s+boy,?\s*(is|was)?\s*(tied|bound|dragged|held|captive)/gi,
    replacement: 'young Temüjin faces hardship in exile',
  },
  {
    pattern: /\bnine-year-old\s+boy,?\s*(is|was)?\s*(tied|bound|held|captive|dragged|captured)/gi,
    replacement: 'young survivor faces adversity',
  },
];

// POST-SANITIZATION: Catch any remaining child + distress combinations after HARD_BLOCK runs
const CHILD_SAFETY_PATTERNS_POST: Array<{ pattern: RegExp; replacement: string }> = [
  // Catch "held captive" when near child/boy/girl references
  {
    pattern: /\b(\d+)-year-old\s+(boy|girl|child)[^.]*\b(held captive|imprisoned|captured)\b/gi,
    replacement: 'young survivor faces difficult times',
  },
  {
    pattern: /\byoung\s+(boy|girl|child|Temüjin)[^.]*\b(held captive|imprisoned|captured)\b/gi,
    replacement: 'young survivor endures hardship',
  },
  {
    pattern: /\b(boy|girl|child)[^.]{0,30}\b(held captive|imprisoned|led across)\b/gi,
    replacement: 'youth journeys through adversity',
  },

  // Generic child distress cleanup
  {
    pattern: /\byoung\s+(Temüjin|boy|girl)\s+[^.]*(?:captive|prisoner|chains|bound|restrained)/gi,
    replacement: 'young $1 faces the trials of exile',
  },
];

// Documentary-specific rephrasing for historical violence
const DOCUMENTARY_SOFT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Battle terminology to documentary language
  { pattern: /\b(war|wars|warfare)\b/gi, replacement: 'campaign' },
  { pattern: /\b(battle|battles|battled)\b/gi, replacement: 'confrontation' },
  { pattern: /\b(combat|combatant|combatants)\b/gi, replacement: 'engagement' },
  { pattern: /\b(fight|fights|fighting|fought)\b/gi, replacement: 'struggle' },

  // Conquest language
  { pattern: /\bconquered\s+and\s+killed\b/gi, replacement: 'united through conquest' },
  { pattern: /\bwipe\s+out\b/gi, replacement: 'overcome' },
  { pattern: /\bbloodline\b/gi, replacement: 'lineage' },
  { pattern: /\berased\s+(their|his|her)\s+bloodline\b/gi, replacement: 'ended their dynasty' },

  // Weapons (context-dependent)
  { pattern: /\bsword\s+through\b/gi, replacement: 'blade raised toward' },
  { pattern: /\barrow\s+through\b/gi, replacement: 'arrow aimed at' },
];

/**
 * Sanitize a VEO prompt to avoid content policy violations
 */
export function sanitizeVeoPrompt(
  prompt: string,
  options: {
    isDocumentary?: boolean;
    hasChildSubject?: boolean;
    logReplacements?: boolean;
  } = {},
): SanitizationResult {
  const { isDocumentary = false, hasChildSubject = false, logReplacements = false } = options;

  let sanitized = prompt;
  const replacements: Array<{ original: string; replacement: string }> = [];

  // Helper to apply patterns and track replacements
  const applyPatterns = (patterns: Array<{ pattern: RegExp; replacement: string }>) => {
    for (const { pattern, replacement } of patterns) {
      const matches = sanitized.match(pattern);
      if (matches) {
        for (const match of matches) {
          if (!replacements.find((r) => r.original === match)) {
            replacements.push({ original: match, replacement });
          }
        }
        sanitized = sanitized.replace(pattern, replacement);
      }
    }
  };

  // 1. Child safety PRE-patterns first (before HARD_BLOCK transforms individual words)
  if (hasChildSubject || /\b(child|boy|girl|young|year-old)\b/i.test(prompt)) {
    applyPatterns(CHILD_SAFETY_PATTERNS_PRE);
  }

  // 2. Hard block patterns (always apply)
  applyPatterns(HARD_BLOCK_PATTERNS);

  // 3. Child safety POST-patterns (catch combinations like "boy...held captive" after HARD_BLOCK)
  if (hasChildSubject || /\b(child|boy|girl|young|year-old)\b/i.test(sanitized)) {
    applyPatterns(CHILD_SAFETY_PATTERNS_POST);
  }

  // 4. Documentary soft patterns (only for documentary mode)
  if (isDocumentary) {
    applyPatterns(DOCUMENTARY_SOFT_PATTERNS);
  }

  // 5. Clean up double spaces and awkward phrasing
  sanitized = sanitized.replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/\s+\./g, '.').trim();

  const wasModified = replacements.length > 0;

  if (logReplacements && wasModified) {
    console.log(`   🔒 Sanitized prompt (${replacements.length} replacements):`);
    for (const r of replacements.slice(0, 3)) {
      console.log(`      "${r.original}" → "${r.replacement}"`);
    }
    if (replacements.length > 3) {
      console.log(`      ... and ${replacements.length - 3} more`);
    }
  }

  return { sanitized, wasModified, replacements };
}

/**
 * Check if a prompt is likely to trigger content policy
 * Returns true if the prompt contains high-risk content
 */
export function isPromptRisky(prompt: string): boolean {
  const riskPatterns = [
    /\b(kill|murder|slaughter|massacre|execute|assassinate)\b/i,
    /\b(blood|gore|corpse|dismember|decapitate)\b/i,
    /\b(torture|enslaved|slavery)\b/i,
    /\b(child|boy|girl).{0,30}(tied|bound|dragged|beaten)/i,
    /\b(poison|burned alive|burning)\b/i,
  ];

  return riskPatterns.some((pattern) => pattern.test(prompt));
}

/**
 * Generate a documentary-safe action description
 * Converts potentially violent historical events to observational language
 */
export function toDocumentarySafeAction(action: string): string {
  // Replace first-person violence with third-person observation
  const result = sanitizeVeoPrompt(action, {
    isDocumentary: true,
    hasChildSubject: /\b(child|boy|girl|young)\b/i.test(action),
  });

  return result.sanitized;
}
