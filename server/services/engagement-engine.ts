/**
 * ENGAGEMENT ENGINE v1.0
 * Build virality INTO the content, not after.
 *
 * Psychology-driven prompting for maximum engagement:
 * - Comments (controversy, questions, debates)
 * - Rewatches (loops, Easter eggs, "wait what?")
 * - Shares ("you gotta see this")
 * - Saves (reference value, "I need this")
 * - Likes (emotional resonance, "this hit different")
 */

export type EngagementType = 'comment' | 'rewatch' | 'share' | 'save';

export interface EngagementTrigger {
  type: EngagementType;
  description: string;
  psychology: string;
  examples: string[];
  lyricPrompt: string;
  videoPrompt: string;
}

export interface ViralStructure {
  name: string;
  description: string;
  structure: string[];
  lyricApplication: string;
  videoApplication: string;
}

export interface EngagementPreset {
  lyricTriggers: string[];
  videoTriggers: string[];
  structure: string;
}

// ============================================
// ENGAGEMENT TRIGGERS
// ============================================

export const ENGAGEMENT_TRIGGERS: Record<string, EngagementTrigger> = {
  // === COMMENT TRIGGERS ===

  hot_take: {
    type: 'comment',
    description: 'Say something slightly controversial that people will argue about',
    psychology: 'People NEED to share their opinion when they disagree',
    examples: [
      'The villain was right all along',
      'Loyalty is just fear dressed up pretty',
      'Sometimes the ones who save you are the ones who broke you',
      "Heroes don't exist - just people with better PR",
    ],
    lyricPrompt:
      "Include ONE line that's a hot take - something people will debate in comments. Not offensive, but challengeable.",
    videoPrompt: 'Show a moment that could be interpreted two ways - let viewers argue about what really happened.',
  },

  fill_in_blank: {
    type: 'comment',
    description: 'Leave something incomplete that viewers MUST finish',
    psychology: 'Zeigarnik effect - incomplete tasks stick in our minds',
    examples: [
      "The one thing I'll never forgive is ___",
      'If you know, you know...',
      "Some of y'all aren't ready for this conversation",
      "Tell me you've been through it without telling me...",
    ],
    lyricPrompt: 'Include a line that feels universal but personal - viewers will comment their own version.',
    videoPrompt: 'End on an unresolved moment - what happens next? Let them speculate.',
  },

  us_vs_them: {
    type: 'comment',
    description: 'Create sides that people identify with',
    psychology: "Tribal identity - people defend their 'team'",
    examples: [
      'Shadow users vs Light users - which side are you?',
      "There's two types of people...",
      "You either get it or you don't",
      'Real ones know',
    ],
    lyricPrompt:
      'Create an identity division - two types of people, two paths, two choices. Viewers will declare their side.',
    videoPrompt: "Show two contrasting characters/paths - ask 'which one are you?' in caption.",
  },

  relatable_specificity: {
    type: 'comment',
    description: 'Hyper-specific detail that feels personal',
    psychology: "Specificity creates recognition - 'OMG that's so me'",
    examples: [
      "That 3am feeling when you're scrolling but not really looking",
      'When you rehearse the argument in your head but they apologize first',
      "The way you check your phone knowing nothing's there",
      'Pretending to read the menu when you already know your order',
    ],
    lyricPrompt: "Include one hyper-specific mundane detail that feels like you're reading their mind.",
    videoPrompt: 'Show a tiny specific moment everyone does but nobody talks about.',
  },

  question_hook: {
    type: 'comment',
    description: "Ask something viewers can't NOT answer",
    psychology: 'Direct questions demand responses',
    examples: [
      'What would you sacrifice for power?',
      'Who hurt you like this?',
      'Be honest - would you go back?',
      "What's the line you'd never cross?",
    ],
    lyricPrompt: "End with a direct question to the listener. Not rhetorical - one they'll want to answer.",
    videoPrompt: 'Include text overlay with a question. Pin it as first comment to seed discussion.',
  },

  // === REWATCH TRIGGERS ===

  wait_what: {
    type: 'rewatch',
    description: 'Something happens so fast they need to see it again',
    psychology: 'Pattern interruption + curiosity gap',
    examples: [
      'Flash frame of something unexpected',
      "Lyric that doesn't register until second listen",
      'Visual detail that changes meaning',
      'Word that sounds like one thing, means another',
    ],
    lyricPrompt: 'Include a bar with a double meaning that only clicks on second listen.',
    videoPrompt: 'Add a 2-3 frame flash of something important. Viewers will pause and rewatch.',
  },

  perfect_loop: {
    type: 'rewatch',
    description: 'End flows seamlessly into beginning',
    psychology: 'Seamless loops are hypnotic - people watch multiple times without realizing',
    examples: [
      'Last visual motion continues into first frame',
      'Beat ends on pickup to beginning',
      'Last word rhymes/connects with first word',
      'Emotional ending matches emotional opening',
    ],
    lyricPrompt: 'Write the outro to sonically/thematically connect back to the intro.',
    videoPrompt: 'End frame should motion-match or cut seamlessly into opening frame. Test the loop.',
  },

  easter_egg: {
    type: 'rewatch',
    description: 'Hidden details reward careful viewers',
    psychology: 'Discovery feels like winning - creates investment',
    examples: [
      'Background detail that foreshadows',
      'Callback to previous video',
      'Hidden symbol in the visuals',
      'Reversed audio message',
      'Frame numbers that mean something',
    ],
    lyricPrompt: 'Reference something from a previous song/video. Fans will catch it and feel special.',
    videoPrompt: 'Hide a meaningful detail in the background. Let fans discover and share it.',
  },

  escalating_density: {
    type: 'rewatch',
    description: 'Too much happening to catch in one viewing',
    psychology: 'Information overload creates re-engagement',
    examples: [
      'Rapid-fire visuals',
      'Multiple things happening simultaneously',
      'Layered meanings in lyrics',
      'Background and foreground telling different stories',
    ],
    lyricPrompt: 'Stack meanings - surface level story, deeper emotional layer, and meta commentary all at once.',
    videoPrompt: 'Multiple visual elements competing for attention. Different focus points each viewing.',
  },

  // === SHARE TRIGGERS ===

  tag_someone: {
    type: 'share',
    description: 'Content that makes you think of a specific person',
    psychology: 'Social bonding through shared reference',
    examples: [
      'That friend who...',
      "POV: you're the villain in someone's story",
      'When they finally see the real you',
      'This is for everyone who stayed',
    ],
    lyricPrompt: 'Write a line that makes listeners think of ONE specific person in their life.',
    videoPrompt: 'Create a character/moment that represents a universal relationship dynamic.',
  },

  identity_signal: {
    type: 'share',
    description: 'Sharing this says something about who I am',
    psychology: 'Social media is identity performance',
    examples: [
      "I'm the type who... (dark/deep/different)",
      'This energy >>',
      'Found my new personality',
      "Didn't know I needed to hear this",
    ],
    lyricPrompt: "Create a vibe/identity that people want to be associated with. Sharing = 'this is me'.",
    videoPrompt: 'Aesthetic that people want as part of their personal brand.',
  },

  emotional_catharsis: {
    type: 'share',
    description: "Releases feelings they couldn't express themselves",
    psychology: 'Art as emotional proxy',
    examples: [
      "This says what I couldn't",
      'Finally someone put it into words',
      "I'm not crying you're crying",
      'Send this to them without context',
    ],
    lyricPrompt: "Articulate a feeling that's hard to express. Be the words they've been looking for.",
    videoPrompt: 'Visual metaphor for complex emotion. Let them use it to communicate.',
  },

  flex_share: {
    type: 'share',
    description: 'Share to show you found something cool first',
    psychology: 'Social currency - being in-the-know',
    examples: [
      "Y'all sleeping on this",
      'How does this only have X views?',
      'New artist alert',
      'This is about to blow up',
    ],
    lyricPrompt: 'Create something that feels underground/undiscovered. Early fans become evangelists.',
    videoPrompt: 'Quality that exceeds expectations for view count. Creates discovery feeling.',
  },

  // === SAVE TRIGGERS ===

  reference_value: {
    type: 'save',
    description: "Content they'll want to come back to",
    psychology: 'Utility value - practical or emotional reference',
    examples: [
      "Lyrics they'll want to memorize/quote",
      "Visuals they'll want as wallpaper",
      "Vibes they'll want for certain moods",
      'Song for specific situations',
    ],
    lyricPrompt: 'Write at least one quotable bar that works as a standalone statement.',
    videoPrompt: 'Include a frame that works as a still image. Wallpaper-worthy.',
  },

  mood_bookmark: {
    type: 'save',
    description: "Save for when they're in a specific mood",
    psychology: 'Emotional playlist curation',
    examples: ['3am thoughts playlist', 'When I need to feel powerful', 'Villain arc music', 'When they did you wrong'],
    lyricPrompt: 'Be specific about the mood. Own an emotional niche.',
    videoPrompt: 'Create a distinct vibe that serves a specific emotional need.',
  },
};

// ============================================
// VIRAL STRUCTURES
// ============================================

export const VIRAL_STRUCTURES: Record<string, ViralStructure> = {
  hook_hold_payoff: {
    name: 'Hook → Hold → Payoff',
    description: 'Classic viral structure',
    structure: [
      '0-2 sec: Pattern interrupt (STOP scrolling)',
      '2-15 sec: Escalating tension (WHY should I stay)',
      '15-45 sec: Building investment (I need to see how this ends)',
      '45-60 sec: Payoff (satisfying conclusion OR cliffhanger)',
    ],
    lyricApplication: `[Intro] (0-2 sec)
- Start with the most provocative/emotional line
- NOT "let me set the scene" - DROP them in

[Verse 1] (2-15 sec)  
- Establish stakes quickly
- Every line adds tension

[Chorus] (15-30 sec)
- Emotional peak / memorable hook
- The part they'll come back for

[Verse 2] (30-45 sec)
- Escalate or flip perspective
- Add new dimension

[Outro] (45-60 sec)
- Payoff OR cliffhanger
- Loop-friendly ending`,
    videoApplication: `- First frame: Most visually striking moment (not chronological)
- Avoid: Logos, slow fades, "wait for it"
- Every 3-5 seconds: Something new happens
- End: Motion that connects to start OR unresolved tension`,
  },

  open_loop: {
    name: 'Open Loop',
    description: "Start with unanswered question, close at end (or don't)",
    structure: [
      'Open with mystery/question/conflict',
      'Build without resolving',
      'Either close the loop (satisfaction) or leave open (comments demanding part 2)',
    ],
    lyricApplication: `Start with: "They told me not to tell you this..." or equivalent
Build the story but withhold KEY information
End with:
- Resolution (satisfying) OR
- "But that's not how it ended..." (engagement bait)`,
    videoApplication: `- Open on consequence, not beginning
- "How did we get here?"
- Flashback structure
- End with return to opening scene + new context`,
  },

  perspective_flip: {
    name: 'Perspective Flip',
    description: 'Start from one POV, reveal it was different all along',
    structure: [
      'Establish clear perspective',
      'Build story from that angle',
      'FLIP - reveal we were seeing it wrong',
      'Recontextualize everything before',
    ],
    lyricApplication: `Verse 1: Tell it from protagonist view
Chorus: Emotional statement
Verse 2: SAME STORY from antagonist view
- Now the chorus means something different
- Forces rewatch to catch the flip`,
    videoApplication: `- Visual clues that only make sense on rewatch
- Same scene, different character focus
- End reveals beginning was misleading`,
  },
};

// ============================================
// ENGAGEMENT PRESETS
// ============================================

export const ENGAGEMENT_PRESETS: Record<string, EngagementPreset> = {
  viral_battle: {
    lyricTriggers: ['hot_take', 'us_vs_them', 'relatable_specificity', 'reference_value'],
    videoTriggers: ['wait_what', 'perfect_loop', 'identity_signal'],
    structure: 'hook_hold_payoff',
  },

  emotional_ballad: {
    lyricTriggers: ['relatable_specificity', 'emotional_catharsis', 'fill_in_blank', 'mood_bookmark'],
    videoTriggers: ['tag_someone', 'perfect_loop', 'easter_egg'],
    structure: 'open_loop',
  },

  hype_anthem: {
    lyricTriggers: ['us_vs_them', 'identity_signal', 'reference_value', 'question_hook'],
    videoTriggers: ['escalating_density', 'perfect_loop', 'flex_share'],
    structure: 'hook_hold_payoff',
  },

  story_song: {
    lyricTriggers: ['fill_in_blank', 'hot_take', 'emotional_catharsis', 'wait_what'],
    videoTriggers: ['easter_egg', 'perfect_loop', 'tag_someone'],
    structure: 'perspective_flip',
  },

  custom: {
    lyricTriggers: [],
    videoTriggers: [],
    structure: 'hook_hold_payoff',
  },
};

// ============================================
// ENGAGEMENT CHECKLIST
// ============================================

export const ENGAGEMENT_CHECKLIST = {
  hook: {
    title: 'Hook (First 2 Seconds)',
    items: [
      { id: 'first_frame', label: 'First frame is visually striking (not logo/black/text)' },
      { id: 'first_line', label: 'First line/sound demands attention' },
      { id: 'scroll_stop', label: 'Someone scrolling would STOP' },
    ],
  },
  retention: {
    title: 'Retention',
    items: [
      { id: 'changes', label: 'Something changes every 2-3 seconds' },
      { id: 'escalation', label: 'Clear escalation/story/tension' },
      { id: 'no_wait', label: 'No "wait for it" - value throughout' },
    ],
  },
  rewatch: {
    title: 'Rewatch Triggers',
    items: [
      { id: 'double_meaning', label: 'Double meaning or hidden detail' },
      { id: 'loop', label: 'Loop connects end to beginning' },
      { id: 'repeat_value', label: 'Something only makes sense on repeat' },
    ],
  },
  comment: {
    title: 'Comment Bait',
    items: [
      { id: 'debatable', label: 'Debatable statement or question' },
      { id: 'tag', label: '"Tag someone who..." moment' },
      { id: 'open_end', label: 'Open-ended ending' },
    ],
  },
  share: {
    title: 'Share Triggers',
    items: [
      { id: 'identity', label: 'Identity signal ("this is so me")' },
      { id: 'catharsis', label: 'Emotional catharsis' },
      { id: 'flex', label: '"Y\'all sleeping on this" quality gap' },
    ],
  },
  save: {
    title: 'Save Triggers',
    items: [
      { id: 'quotable', label: 'Quotable line or frame' },
      { id: 'mood', label: 'Mood-specific utility' },
      { id: 'reference', label: 'Reference value' },
    ],
  },
  technical: {
    title: 'Technical',
    items: [
      { id: 'vertical', label: 'Vertical 9:16 optimized' },
      { id: 'no_sound', label: 'Works without sound' },
      { id: 'captions', label: 'Caption/text is readable' },
      { id: 'thumbnail', label: 'First frame is thumbnail-worthy' },
    ],
  },
};

// ============================================
// ENGAGEMENT ENGINE CLASS
// ============================================

export class EngagementEngine {
  private triggers = ENGAGEMENT_TRIGGERS;
  private structures = VIRAL_STRUCTURES;
  private presets = ENGAGEMENT_PRESETS;

  /**
   * List available triggers, optionally filtered by type
   */
  listTriggers(type?: EngagementType): string[] {
    if (type) {
      return Object.entries(this.triggers)
        .filter(([_, v]) => v.type === type)
        .map(([k]) => k);
    }
    return Object.keys(this.triggers);
  }

  /**
   * Get trigger details
   */
  getTrigger(triggerId: string): EngagementTrigger | undefined {
    return this.triggers[triggerId];
  }

  /**
   * Get all triggers grouped by type
   */
  getTriggersByType(): Record<EngagementType, { id: string; trigger: EngagementTrigger }[]> {
    const result: Record<EngagementType, { id: string; trigger: EngagementTrigger }[]> = {
      comment: [],
      rewatch: [],
      share: [],
      save: [],
    };

    for (const [id, trigger] of Object.entries(this.triggers)) {
      result[trigger.type].push({ id, trigger });
    }

    return result;
  }

  /**
   * Get preset configuration
   */
  getPreset(presetId: string): EngagementPreset | undefined {
    return this.presets[presetId];
  }

  /**
   * Get all available presets
   */
  getPresets(): Record<string, EngagementPreset> {
    return this.presets;
  }

  /**
   * Get viral structure
   */
  getStructure(structureId: string): ViralStructure | undefined {
    return this.structures[structureId];
  }

  /**
   * Enhance a lyric prompt with engagement engineering
   */
  enhanceLyricPrompt(
    basePrompt: string,
    triggers: string[] = ['hot_take', 'relatable_specificity', 'perfect_loop', 'reference_value'],
    structureId: string = 'hook_hold_payoff',
  ): string {
    // Build trigger instructions
    const triggerInstructions = triggers
      .filter((t) => this.triggers[t])
      .map((t) => {
        const trigger = this.triggers[t];
        return `
### ${t.toUpperCase().replace(/_/g, ' ')} (${trigger.type} trigger)
${trigger.lyricPrompt}
Example approaches: ${trigger.examples.slice(0, 2).join(', ')}`;
      })
      .join('\n');

    // Get structure
    const struct = this.structures[structureId] || this.structures['hook_hold_payoff'];

    return `${basePrompt}

# ENGAGEMENT ENGINEERING

## STRUCTURE: ${struct.name}
${struct.lyricApplication}

## ENGAGEMENT TRIGGERS TO INCLUDE:
${triggerInstructions}

## CRITICAL RULES:
1. FIRST LINE must stop the scroll - provocative, emotional, or mysterious
2. Include at least ONE line people will quote/screenshot
3. Include at least ONE line that rewards relistening
4. End in a way that either loops OR demands "part 2??" comments
5. Specificity > generality - the more specific, the more relatable

## TEST QUESTIONS (ask yourself):
- Would someone comment "this hit different"?
- Would someone tag a friend?
- Would someone add this to a playlist?
- Would someone want to hear it again?
- Would someone argue about the meaning?`;
  }

  /**
   * Enhance a video prompt with engagement engineering
   */
  enhanceVideoPrompt(
    basePrompt: string,
    triggers: string[] = ['wait_what', 'perfect_loop', 'tag_someone', 'identity_signal'],
    structureId: string = 'hook_hold_payoff',
  ): string {
    // Build trigger instructions
    const triggerInstructions = triggers
      .filter((t) => this.triggers[t])
      .map((t) => {
        const trigger = this.triggers[t];
        return `
### ${t.toUpperCase().replace(/_/g, ' ')} (${trigger.type} trigger)
${trigger.videoPrompt}`;
      })
      .join('\n');

    // Get structure
    const struct = this.structures[structureId] || this.structures['hook_hold_payoff'];

    return `${basePrompt}

# VISUAL ENGAGEMENT ENGINEERING

## STRUCTURE: ${struct.name}
${struct.videoApplication}

## ENGAGEMENT TRIGGERS TO INCLUDE:
${triggerInstructions}

## CRITICAL RULES:
1. FIRST FRAME must be scroll-stopping - NOT a logo, NOT black, NOT "wait for it"
2. Something must CHANGE every 2-3 seconds
3. Include ONE "wait what?" moment that rewards pause/rewatch
4. Final frame should connect to first frame for seamless loop
5. Leave something ambiguous for comment speculation

## TECHNICAL:
- Vertical 9:16 for Shorts/TikTok/Reels
- Most important visual in center (safe zones)
- High contrast for small screens
- Works without sound (captions/visual story)`;
  }

  /**
   * Enhance a music/Suno prompt with engagement engineering
   */
  enhanceMusicPrompt(
    basePrompt: string,
    triggers: string[] = ['perfect_loop', 'mood_bookmark', 'emotional_catharsis'],
  ): string {
    return `${basePrompt}

# AUDIO ENGAGEMENT ENGINEERING

## LOOP OPTIMIZATION:
- Outro should musically connect back to intro
- Avoid hard endings - fade or loop-ready
- Beat should feel continuous if repeated

## HOOK REQUIREMENTS:
- Melodic hook must appear within first 15 seconds
- Hook should be simple enough to hum/remember
- Consider the "stuck in your head" test

## MOOD SPECIFICITY:
- Own a specific emotional moment
- Be THE song for a particular feeling
- Create playlist-worthy vibe

## SOUND-OFF TEST:
- For Shorts/TikTok, many watch without sound
- Lyrics should work as on-screen text
- Visual rhythm should match even on mute`;
  }

  /**
   * Generate hook options for a topic
   */
  generateHookOptions(topic: string, count: number = 5): string[] {
    const hookTemplates = [
      `What nobody tells you about ${topic}...`,
      `POV: You finally understand ${topic}`,
      `The truth about ${topic} that'll change everything`,
      `I was wrong about ${topic}. Here's why.`,
      `If you've ever felt this about ${topic}, this is for you`,
      `They don't want you to know this about ${topic}`,
      `The ${topic} moment that broke me`,
      `When ${topic} hits different at 3am`,
      `Hot take: ${topic} isn't what you think`,
      `Real ones know ${topic} is really about...`,
    ];

    return hookTemplates.slice(0, count);
  }

  /**
   * Get the engagement checklist
   */
  getChecklist() {
    return ENGAGEMENT_CHECKLIST;
  }

  /**
   * Score content against engagement criteria
   */
  scoreEngagement(content: {
    hasHotTake?: boolean;
    hasRelatableDetail?: boolean;
    hasQuotableLine?: boolean;
    hasDoubleMemory?: boolean;
    loopFriendly?: boolean;
    hasQuestion?: boolean;
  }): { score: number; maxScore: number; percentage: number; feedback: string[] } {
    let score = 0;
    const maxScore = 6;
    const feedback: string[] = [];

    if (content.hasHotTake) {
      score++;
    } else {
      feedback.push('Add a controversial/debatable statement');
    }

    if (content.hasRelatableDetail) {
      score++;
    } else {
      feedback.push('Include a hyper-specific relatable detail');
    }

    if (content.hasQuotableLine) {
      score++;
    } else {
      feedback.push('Write at least one screenshot-worthy line');
    }

    if (content.hasDoubleMemory) {
      score++;
    } else {
      feedback.push('Add a line with double meaning for rewatches');
    }

    if (content.loopFriendly) {
      score++;
    } else {
      feedback.push('Make the ending connect to the beginning');
    }

    if (content.hasQuestion) {
      score++;
    } else {
      feedback.push('End with a question viewers will want to answer');
    }

    return {
      score,
      maxScore,
      percentage: Math.round((score / maxScore) * 100),
      feedback,
    };
  }
}

// Export singleton instance
export const engagementEngine = new EngagementEngine();
