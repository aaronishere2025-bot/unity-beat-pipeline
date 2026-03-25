/**
 * VOCAL TRACK GENERATOR v2.0
 * ==========================
 * Raw. Gritty. Emotional Range.
 *
 * NOT overproduced trap - this captures REAL emotion:
 * - Sadness, vulnerability, pain
 * - Quiet anger, cold fury
 * - Raw triumph, exhausted victory
 * - Desperate hope, bitter acceptance
 */

export interface ToneProfile {
  name: string;
  description: string;
  feeling: string;
  vocalDelivery: string[];
  sunoVocal: string;
  lyricApproach: string;
}

export interface ProductionProfile {
  name: string;
  description: string;
  genre: string;
  tempo: string;
  key: string;
  instruments: string[];
  mixNotes: string;
  sunoPrompt: string;
}

export interface VocalStyle {
  name: string;
  description: string;
  characteristics: string[];
  sunoTags: string;
}

// ============================================
// BATTLE TONES (Confrontational)
// ============================================

export const BATTLE_TONES: Record<string, ToneProfile> = {
  dismissive_cold: {
    name: 'Dismissive Cold',
    description: 'Cold, above-it-all, stating facts not opinions',
    feeling: "I'm above this, you're not worth real anger",
    vocalDelivery: [
      'controlled, measured delivery',
      'cold confidence',
      'dismissive tone, not angry',
      'talking down, not yelling',
      'slight drawl on key words',
      'lets bars breathe',
    ],
    sunoVocal:
      'confident male rap vocals, cold dismissive delivery, controlled aggression, talking not yelling, swagger, measured pace with slight drawl',
    lyricApproach:
      'State facts. Short declarative statements. Speak like explaining something obvious to someone slow.',
  },

  aggressive_explosive: {
    name: 'Aggressive Explosive',
    description: 'Raw aggression, coming for blood',
    feeling: 'Pure combat mode, destroying the opponent',
    vocalDelivery: [
      'aggressive, attacking delivery',
      'intense energy throughout',
      'punching every bar',
      'relentless assault',
    ],
    sunoVocal:
      'aggressive male rap vocals, intense attacking delivery, hard-hitting, relentless energy, battle rap intensity',
    lyricApproach: 'Every line is a weapon. No breathing room for opponent.',
  },

  cocky_playful: {
    name: 'Cocky Playful',
    description: 'Toying with opponent, almost amused',
    feeling: "This is entertainment, you're a joke to me",
    vocalDelivery: ['playful arrogance', 'amused condescension', 'almost laughing at them', 'light but cutting'],
    sunoVocal: 'confident male rap vocals, playful arrogance, amused delivery, cocky swagger, relaxed dominance',
    lyricApproach: 'Like a cat playing with a mouse. Jokes that hurt.',
  },

  menacing_villain: {
    name: 'Menacing Villain',
    description: 'Dark, threatening, villain energy',
    feeling: "I will end you, and I'll enjoy it",
    vocalDelivery: ['low, menacing tone', 'threatening calm', 'dark authority', 'ominous presence'],
    sunoVocal:
      'deep menacing male rap vocals, dark threatening delivery, villain energy, ominous calm, controlled menace',
    lyricApproach: 'Speak like a villain monologue. Dark promises.',
  },
};

// ============================================
// EMOTIONAL TONES (Full Spectrum)
// ============================================

export const EMOTIONAL_TONES: Record<string, ToneProfile> = {
  // === SADNESS SPECTRUM ===

  hollow_sadness: {
    name: 'Hollow Sadness',
    description: "Empty, numb, the grief that's past tears",
    feeling: "The kind of sad where you've cried yourself dry",
    vocalDelivery: [
      'quiet, almost whispered',
      'emotionally exhausted',
      'numb delivery',
      "pauses between lines like it's hard to speak",
      'no energy to pretend anymore',
    ],
    sunoVocal:
      'soft male vocals, emotionally drained, whispered delivery, raw vulnerability, tired and hollow, no pretense',
    lyricApproach: 'Simple words. Short sentences. Long pauses. The weight of saying nothing.',
  },

  aching_loss: {
    name: 'Aching Loss',
    description: 'Fresh wound, still bleeding, the pain is present',
    feeling: 'Missing someone/something so much it physically hurts',
    vocalDelivery: [
      'voice cracks on emotional words',
      'fighting to hold it together',
      'rawness breaking through',
      'genuine pain in the tone',
      'moments of strength collapsing',
    ],
    sunoVocal:
      'emotional male vocals, voice cracking, raw pain, fighting tears, genuine grief, vulnerable breaks in voice',
    lyricApproach: "Specific memories. Sensory details of what's gone. The small things that hurt most.",
  },

  melancholic_reflection: {
    name: 'Melancholic Reflection',
    description: 'Bittersweet looking back, sad but accepting',
    feeling: 'Sitting with old photos, feeling the weight of time',
    vocalDelivery: [
      'warm but sad',
      'nostalgic tone',
      'gentle, not dramatic',
      'wisdom mixed with regret',
      'peaceful sadness',
    ],
    sunoVocal:
      'warm male vocals, gentle melancholy, nostalgic delivery, soft and reflective, bittersweet tone, not dramatic',
    lyricApproach: "Past tense memories. 'I remember when...' Details that show love through loss.",
  },

  // === ANGER SPECTRUM ===

  cold_fury: {
    name: 'Cold Fury',
    description: "Controlled rage, the anger that's MORE scary because it's quiet",
    feeling: "Past yelling, into 'I will destroy you calmly'",
    vocalDelivery: [
      'quiet, measured, deliberate',
      'every word chosen like a weapon',
      'terrifying calm',
      'controlled but coiled',
      'the pause before violence',
    ],
    sunoVocal:
      'controlled male vocals, cold and measured, quiet intensity, deliberate pacing, terrifying calm, restrained rage',
    lyricApproach: 'Short declarative statements. Facts not emotions. The calm before the storm.',
  },

  desperate_anger: {
    name: 'Desperate Anger',
    description: "Anger born from pain, lashing out because you're hurt",
    feeling: "Screaming because crying isn't enough",
    vocalDelivery: [
      'raw, unpolished intensity',
      'emotion bleeding through',
      'anger masking hurt',
      'ragged edges',
      'breaking points',
    ],
    sunoVocal:
      'raw male vocals, desperate intensity, anger covering pain, ragged emotional delivery, unpolished and real',
    lyricApproach: "Accusations that reveal wounds. Anger that's really grief. The hurt underneath.",
  },

  righteous_fire: {
    name: 'Righteous Fire',
    description: 'Anger at injustice, fighting for something real',
    feeling: 'Standing up when no one else will',
    vocalDelivery: [
      'passionate conviction',
      'powerful but not shouting',
      'moral clarity',
      'strength from purpose',
      'burning truth',
    ],
    sunoVocal:
      'passionate male vocals, righteous conviction, powerful clarity, purposeful intensity, burning with truth',
    lyricApproach: 'Speaking for the voiceless. Naming injustice. Hope inside the anger.',
  },

  // === VULNERABILITY SPECTRUM ===

  exposed_truth: {
    name: 'Exposed Truth',
    description: "Admitting something you've never said out loud",
    feeling: 'The terror and relief of finally being honest',
    vocalDelivery: [
      'naked honesty',
      'no performance, just truth',
      'scared but committed',
      'intimate, like a confession',
      'stripping away armor',
    ],
    sunoVocal:
      'intimate male vocals, confessional delivery, naked honesty, vulnerable and exposed, no performance just truth',
    lyricApproach: "First person. Present tense. The things you've never admitted. Raw confession.",
  },

  quiet_strength: {
    name: 'Quiet Strength',
    description: 'Vulnerable but not weak, soft but unbreakable',
    feeling: 'Gentleness that comes from surviving hard things',
    vocalDelivery: [
      'soft but grounded',
      'calm from experience',
      'strength without aggression',
      'gentle certainty',
      'peace earned through pain',
    ],
    sunoVocal: 'gentle male vocals, quiet confidence, soft strength, grounded and calm, warmth from wisdom',
    lyricApproach: 'Simple truths. Hard-won wisdom. Strength shown through gentleness.',
  },

  // === HOPE SPECTRUM ===

  desperate_hope: {
    name: 'Desperate Hope',
    description: 'Clinging to possibility when everything says give up',
    feeling: 'The last match in the dark',
    vocalDelivery: [
      'pleading but not pathetic',
      'reaching for light',
      'fragile determination',
      'hope as an act of will',
      'refusing to surrender',
    ],
    sunoVocal: 'yearning male vocals, desperate hope, reaching for light, fragile but determined, refusing to give up',
    lyricApproach: "Future tense wishes. 'Maybe someday...' The cost of continuing to hope.",
  },

  rising_from_ashes: {
    name: 'Rising From Ashes',
    description: 'Coming back from rock bottom, phoenix energy',
    feeling: 'The first breath after almost drowning',
    vocalDelivery: [
      'building from quiet to powerful',
      'earned triumph',
      'scars in the voice',
      'strength forged in fire',
      'survival as victory',
    ],
    sunoVocal:
      'building male vocals, quiet to powerful, earned triumph, survival energy, scars in the voice, rising intensity',
    lyricApproach: 'Past pain, present strength, future possibility. The journey in the voice.',
  },

  // === COMPLEX EMOTIONS ===

  bitter_acceptance: {
    name: 'Bitter Acceptance',
    description: 'Making peace with something that still hurts',
    feeling: "It is what it is, but it shouldn't have been",
    vocalDelivery: [
      'resigned but not defeated',
      'dry, matter-of-fact',
      'wisdom without joy',
      'accepting the unfair',
      'moving on while still wounded',
    ],
    sunoVocal: 'world-weary male vocals, resigned acceptance, dry delivery, bitter wisdom, matter-of-fact pain',
    lyricApproach: 'Contradictions. Accepting and resenting. Moving on while looking back.',
  },

  exhausted_victory: {
    name: 'Exhausted Victory',
    description: 'Won the fight but lost too much getting there',
    feeling: 'Standing in the ruins of what you saved',
    vocalDelivery: [
      'tired triumph',
      'hollow celebration',
      'cost audible in voice',
      'relief without joy',
      'surviving, not thriving',
    ],
    sunoVocal: 'tired male vocals, hollow triumph, exhausted delivery, relief without joy, the cost of winning',
    lyricApproach: 'What was lost to win. Pyrrhic victory. The price of survival.',
  },

  numb_dissociation: {
    name: 'Numb Dissociation',
    description: 'Watching yourself from outside, detached from feeling',
    feeling: 'This is happening to someone else',
    vocalDelivery: [
      'flat, detached',
      'observing not feeling',
      'eerie calm',
      'disconnected from self',
      'reporting not experiencing',
    ],
    sunoVocal: 'detached male vocals, flat delivery, observational tone, dissociated calm, watching from outside',
    lyricApproach: 'Third person about yourself. Clinical observations. The distance from your own pain.',
  },
};

// ============================================
// PRODUCTION STYLES (Raw, Not Overproduced)
// ============================================

export const PRODUCTION_STYLES: Record<string, ProductionProfile> = {
  // === BATTLE RAP ===

  hard_trap: {
    name: 'Hard Trap',
    description: 'Aggressive trap with space for vocals',
    genre: 'hard trap, aggressive hip-hop',
    tempo: '140 BPM',
    key: 'G minor',
    instruments: ['hard-hitting 808 bass', 'crisp trap hi-hats', 'dark synth stabs', 'minimal but punchy drums'],
    mixNotes: 'vocals upfront, bass heavy, space between hits',
    sunoPrompt:
      'hard trap beat, aggressive 808s, crisp hi-hats, dark minimal production, punchy drums, 140 BPM, G minor, hard-hitting, space for vocals',
  },

  boom_bap_battle: {
    name: 'Boom Bap Battle',
    description: 'Classic 90s underground battle rap',
    genre: 'boom bap, classic battle rap',
    tempo: '90 BPM',
    key: 'D minor',
    instruments: ['chopped soul sample', 'punchy boom bap drums', 'vinyl crackle', 'hard snare'],
    mixNotes: 'raw, unpolished energy, drums hit hard',
    sunoPrompt:
      'boom bap beat, chopped soul sample, hard drums, vinyl texture, 90 BPM, D minor, classic hip-hop, raw battle rap production',
  },

  dark_orchestral_trap: {
    name: 'Dark Orchestral Trap',
    description: 'Epic cinematic with trap aggression',
    genre: 'orchestral trap, cinematic hip-hop',
    tempo: '130 BPM',
    key: 'C minor',
    instruments: ['orchestral strings', 'trap 808s', 'epic brass hits', 'cinematic percussion'],
    mixNotes: 'epic but still hard',
    sunoPrompt:
      'orchestral trap, epic strings, 808 bass, cinematic brass, dark orchestral hip-hop, 130 BPM, C minor, aggressive but epic',
  },

  minimalist_hard: {
    name: 'Minimalist Hard',
    description: 'Stripped back, every sound matters',
    genre: 'minimal trap, stripped back',
    tempo: '145 BPM',
    key: 'E minor',
    instruments: ['sub bass 808', 'sparse hi-hats', 'single dark synth note', 'hard kick and snare'],
    mixNotes: 'maximum space, sounds hit harder',
    sunoPrompt:
      'minimal trap, sparse production, heavy sub bass, stripped back beat, lots of space, 145 BPM, E minor, dark and minimal',
  },

  // === RAW / LO-FI ===

  dusty_lofi: {
    name: 'Dusty Lo-Fi',
    description: 'Warm, crackly, like an old record at 3am',
    genre: 'lo-fi hip hop, dusty',
    tempo: '80 BPM',
    key: 'A minor',
    instruments: ['dusty vinyl crackle', 'warm muffled drums', 'tape saturation', 'jazzy piano chops'],
    mixNotes: 'raw and warm, late night vibes',
    sunoPrompt:
      'lo-fi hip hop, dusty vinyl crackle, warm muffled drums, tape saturation, jazzy piano chops, relaxed groove, late night vibes, 80 BPM, A minor, raw and warm',
  },

  bedroom_raw: {
    name: 'Bedroom Raw',
    description: 'Voice memo at 2am that captured something real',
    genre: 'bedroom pop, lo-fi',
    tempo: '85 BPM',
    key: 'C major',
    instruments: ['cheap mic texture', 'simple drum machine', 'room reverb', 'imperfect recording'],
    mixNotes: 'authenticity over polish',
    sunoPrompt:
      'bedroom recording, lo-fi production, raw and imperfect, simple drums, genuine emotion, 85 BPM, C major, unpolished authenticity',
  },

  naked_acoustic: {
    name: 'Naked Acoustic',
    description: 'Just voice and one instrument, nowhere to hide',
    genre: 'acoustic, stripped',
    tempo: '75 BPM',
    key: 'G major',
    instruments: ['single acoustic guitar', 'room ambience', 'natural reverb', 'breath sounds'],
    mixNotes: 'intimate and close',
    sunoPrompt:
      'raw acoustic, bedroom recording quality, intimate and close, single guitar or piano, no polish, real and imperfect, room ambience, vulnerable',
  },

  piano_and_voice: {
    name: 'Piano and Voice',
    description: 'Classical simplicity, emotional weight',
    genre: 'piano ballad',
    tempo: '70 BPM',
    key: 'E flat major',
    instruments: ['grand piano', 'natural reverb', 'emotional dynamics', 'classical influence'],
    mixNotes: 'raw vocal performance',
    sunoPrompt:
      'piano ballad, solo piano and vocals, grand piano, natural reverb, emotional dynamics, classical influence, intimate, raw vocal performance',
  },

  dark_ambient_vocal: {
    name: 'Dark Ambient Vocal',
    description: 'Floating in darkness, voice emerging from shadow',
    genre: 'dark ambient, atmospheric',
    tempo: '60 BPM',
    key: 'B minor',
    instruments: ['dark pads', 'atmospheric textures', 'sub drones', 'sparse percussion'],
    mixNotes: 'voice floating in space',
    sunoPrompt:
      'dark ambient, atmospheric production, minimal beats, ethereal pads, dark and haunting, 60 BPM, B minor, voice emerging from darkness',
  },

  minimal_dark: {
    name: 'Minimal Dark',
    description: 'Space, silence, impact - less is more',
    genre: 'minimal, dark',
    tempo: '75 BPM',
    key: 'F minor',
    instruments: ['sub bass', 'sparse percussion', 'lots of space', 'few elements'],
    mixNotes: 'each sound matters, breathing room',
    sunoPrompt:
      'minimal, dark, sparse production, sub bass, lots of space, few elements, each sound matters, breathing room, atmospheric',
  },

  // === COUNTRY / AMERICANA ===

  classic_country: {
    name: 'Classic Country',
    description: 'Nashville sound, pedal steel and heartache',
    genre: 'classic country',
    tempo: '95 BPM',
    key: 'G major',
    instruments: ['pedal steel guitar', 'acoustic guitar', 'upright bass', 'brushed drums'],
    mixNotes: 'warm and organic',
    sunoPrompt:
      'classic country, pedal steel guitar, acoustic guitar, upright bass, traditional country production, 95 BPM, G major, Nashville sound, warm and organic',
  },

  outlaw_country_production: {
    name: 'Outlaw Country',
    description: 'Austin not Nashville, rough edges, rebel spirit',
    genre: 'outlaw country',
    tempo: '100 BPM',
    key: 'A major',
    instruments: ['electric guitar with grit', 'honky tonk piano', 'driving drums', 'raw bass'],
    mixNotes: 'Willie and Waylon energy',
    sunoPrompt:
      'outlaw country, gritty electric guitar, honky tonk piano, rough edges, rebel spirit, 100 BPM, A major, raw and rebellious, not Nashville polished',
  },

  country_folk_acoustic: {
    name: 'Country Folk Acoustic',
    description: 'Front porch picking, no frills',
    genre: 'country folk, acoustic',
    tempo: '90 BPM',
    key: 'D major',
    instruments: ['acoustic guitar picking', 'simple percussion', 'harmonica', 'natural room sound'],
    mixNotes: 'intimate like sitting next to them',
    sunoPrompt:
      'acoustic country folk, fingerpicking guitar, harmonica, simple production, front porch vibes, 90 BPM, D major, intimate and raw',
  },

  bluegrass_traditional: {
    name: 'Bluegrass Traditional',
    description: 'Fast picking, high lonesome harmonies',
    genre: 'bluegrass',
    tempo: '120 BPM',
    key: 'G major',
    instruments: ['banjo', 'mandolin', 'fiddle', 'upright bass', 'acoustic guitar'],
    mixNotes: 'live and raw, mountain soul',
    sunoPrompt:
      'traditional bluegrass, banjo, mandolin, fiddle, upright bass, high lonesome sound, 120 BPM, G major, mountain music, raw and live',
  },

  // === WORLD MUSIC ===

  mongolian_steppe: {
    name: 'Mongolian Steppe',
    description: 'Vast open spaces, throat singing, ancient power',
    genre: 'Mongolian folk, throat singing',
    tempo: '70 BPM',
    key: 'D minor',
    instruments: [
      'morin khuur (horse-head fiddle)',
      'throat singing drones',
      'overtone harmonics',
      'sparse percussion',
    ],
    mixNotes: 'vast and ancient',
    sunoPrompt:
      'Mongolian folk music, khoomei throat singing, morin khuur horse-head fiddle, overtone singing, vast steppes, ancient and powerful, 70 BPM, D minor, epic and primal',
  },

  west_african: {
    name: 'West African',
    description: 'Kora, djembe, griot traditions',
    genre: 'West African folk',
    tempo: '100 BPM',
    key: 'C major',
    instruments: ['kora', 'djembe', 'talking drum', 'balafon'],
    mixNotes: 'griot storytelling energy',
    sunoPrompt:
      'West African music, kora, djembe drums, griot tradition, polyrhythmic, 100 BPM, C major, storytelling energy, traditional instruments',
  },

  celtic_traditional: {
    name: 'Celtic Traditional',
    description: 'Irish/Scottish, fiddles and whistles',
    genre: 'Celtic folk',
    tempo: '110 BPM',
    key: 'D major',
    instruments: ['fiddle', 'tin whistle', 'bodhran', 'acoustic guitar', 'uilleann pipes'],
    mixNotes: 'live and breathing',
    sunoPrompt:
      'Celtic folk music, Irish fiddle, tin whistle, bodhran drum, traditional Celtic, 110 BPM, D major, raw and live, Gaelic tradition',
  },

  middle_eastern: {
    name: 'Middle Eastern',
    description: 'Oud, darbuka, maqam scales, desert nights',
    genre: 'Middle Eastern',
    tempo: '90 BPM',
    key: 'D maqam',
    instruments: ['oud', 'darbuka', 'ney flute', 'qanun'],
    mixNotes: 'ancient and mystical',
    sunoPrompt:
      'Middle Eastern music, oud, darbuka, maqam scales, quarter tones, desert atmosphere, 90 BPM, Arabic scales, mystical and ancient',
  },

  flamenco_raw: {
    name: 'Flamenco Raw',
    description: 'Spanish guitar, palmas, duende',
    genre: 'flamenco',
    tempo: '120 BPM',
    key: 'A minor (Phrygian)',
    instruments: ['flamenco guitar', 'palmas (clapping)', 'cajon', 'passionate vocals'],
    mixNotes: 'raw emotion, duende',
    sunoPrompt:
      'flamenco, Spanish guitar, palmas clapping, cajon, passionate and raw, duende spirit, 120 BPM, Phrygian mode, gypsy soul',
  },

  japanese_traditional: {
    name: 'Japanese Traditional',
    description: 'Shakuhachi, koto, ma (space), wabi-sabi',
    genre: 'Japanese folk',
    tempo: '55 BPM',
    key: 'D pentatonic',
    instruments: ['shakuhachi flute', 'koto', 'taiko accents', 'silence as instrument'],
    mixNotes: 'space and restraint',
    sunoPrompt:
      'Japanese traditional music, shakuhachi bamboo flute, koto, pentatonic scale, lots of space, wabi-sabi aesthetic, 55 BPM, meditative and ancient',
  },

  nordic_folk: {
    name: 'Nordic Folk',
    description: 'Hardanger fiddle, frost and forest',
    genre: 'Scandinavian folk',
    tempo: '85 BPM',
    key: 'E minor',
    instruments: ['hardanger fiddle', 'nyckelharpa', 'langspil', 'natural reverb'],
    mixNotes: 'cold and beautiful',
    sunoPrompt:
      'Nordic folk music, Scandinavian, hardanger fiddle, haunting melodies, frost and forest atmosphere, 85 BPM, E minor, ancient and beautiful',
  },

  // === SOUL / BLUES / GOSPEL ===

  delta_blues_raw: {
    name: 'Delta Blues Raw',
    description: 'Robert Johnson, raw Mississippi soul',
    genre: 'delta blues',
    tempo: '75 BPM',
    key: 'E major',
    instruments: ['acoustic slide guitar', 'foot stomping', 'raw voice', 'simple production'],
    mixNotes: 'like a field recording',
    sunoPrompt:
      'delta blues, raw acoustic guitar, slide guitar, foot stomping, lo-fi recording, 75 BPM, E major, Mississippi soul, Robert Johnson energy',
  },

  gospel_church: {
    name: 'Gospel Church',
    description: 'Sunday morning testimony, spirit-filled',
    genre: 'gospel',
    tempo: '85 BPM',
    key: 'G major',
    instruments: ['organ', 'choir swells', 'tambourine', 'emotional piano'],
    mixNotes: 'church acoustics, spirit',
    sunoPrompt:
      'gospel music, church organ, choir harmonies, tambourine, Sunday morning worship, 85 BPM, G major, spirit-filled, testimony energy',
  },

  soul_stripped: {
    name: 'Soul Stripped',
    description: 'Otis Redding, Sam Cooke, earned emotion',
    genre: 'soul',
    tempo: '70 BPM',
    key: 'B flat major',
    instruments: ['rhodes piano', 'subtle strings', 'minimal drums', 'warm bass'],
    mixNotes: 'voice forward, emotional space',
    sunoPrompt:
      'classic soul, rhodes piano, subtle strings, warm and emotional, 70 BPM, B flat major, Otis Redding energy, Sam Cooke influence, raw soul',
  },

  // === ROCK / ALTERNATIVE ===

  grunge_acoustic: {
    name: 'Grunge Acoustic',
    description: 'MTV Unplugged energy, pain with a guitar',
    genre: 'acoustic grunge',
    tempo: '80 BPM',
    key: 'E minor',
    instruments: ['acoustic guitar', 'cello', 'minimal percussion', 'string accents'],
    mixNotes: 'raw 90s unplugged vibe',
    sunoPrompt:
      'acoustic grunge, MTV Unplugged style, acoustic guitar, cello, raw and emotional, 80 BPM, E minor, 90s alternative unplugged, pain with a guitar',
  },

  folk_raw: {
    name: 'Folk Raw',
    description: 'Campfire storytelling, worn-in like old boots',
    genre: 'folk',
    tempo: '90 BPM',
    key: 'C major',
    instruments: ['acoustic guitar', 'harmonica', 'subtle percussion', 'room sound'],
    mixNotes: 'intimate storytelling',
    sunoPrompt:
      'raw folk music, acoustic guitar, harmonica, campfire storytelling, worn and authentic, 90 BPM, C major, intimate and real',
  },
};

// ============================================
// VOCAL STYLES (How the voice sounds - NOT autotuned)
// ============================================

export const VOCAL_STYLES: Record<string, VocalStyle> = {
  // === RAW / NATURAL ===

  raw_natural: {
    name: 'Raw Natural',
    description: 'Unprocessed, how you actually sound',
    characteristics: [
      'no pitch correction',
      'natural imperfections',
      'breath sounds included',
      'room tone present',
      'human, not perfect',
    ],
    sunoTags: 'raw vocals, no autotune, natural imperfections, unprocessed, real voice, breath audible',
  },

  raspy_worn: {
    name: 'Raspy Worn',
    description: "Voice that's been through some shit",
    characteristics: [
      'gravel in the voice',
      'cigarettes and whiskey texture',
      'worn but powerful',
      'Tom Waits energy',
      'lived-in sound',
    ],
    sunoTags: 'raspy vocals, gravelly voice, worn and weathered, whiskey voice, lived-in texture, raw and rough',
  },

  breathy_intimate: {
    name: 'Breathy Intimate',
    description: 'Close mic, air in the voice, pillow talk',
    characteristics: [
      'lots of breath',
      'intimate proximity',
      'soft but present',
      'ASMR adjacent',
      'vulnerable closeness',
    ],
    sunoTags: 'breathy vocals, intimate delivery, soft and close, airy voice, whispered tones, vulnerable',
  },

  powerful_chest: {
    name: 'Powerful Chest Voice',
    description: 'Full chest, belting from the gut',
    characteristics: ['chest resonance', 'powerful projection', 'emotional belting', 'no falsetto needed', 'raw power'],
    sunoTags: 'powerful chest voice, belting vocals, full resonance, emotional power, strong projection, raw belting',
  },

  // === COUNTRY / AMERICANA ===

  country_twang: {
    name: 'Country Twang',
    description: 'Southern drawl, authentic country voice',
    characteristics: [
      'natural twang',
      'sliding between notes',
      'storyteller delivery',
      'Johnny Cash to Chris Stapleton range',
      'heartland authenticity',
    ],
    sunoTags:
      'country vocals, natural twang, southern drawl, authentic country voice, storytelling delivery, americana',
  },

  outlaw_country: {
    name: 'Outlaw Country',
    description: 'Willie, Waylon, rough around the edges',
    characteristics: [
      'rough edges',
      'rebellious tone',
      'weathered voice',
      "don't-give-a-damn attitude",
      'authentic grit',
    ],
    sunoTags:
      'outlaw country vocals, rough and weathered, Willie Nelson style, rebellious, authentic grit, rough around edges',
  },

  bluegrass_high: {
    name: 'Bluegrass High Lonesome',
    description: 'High lonesome sound, mountain soul',
    characteristics: ['high tenor', 'modal singing', 'Appalachian influence', 'mountain hollows', 'ancient and raw'],
    sunoTags: 'bluegrass vocals, high lonesome sound, Appalachian, mountain soul, high tenor, modal singing',
  },

  americana_storyteller: {
    name: 'Americana Storyteller',
    description: 'More singing than talking, but the words matter most',
    characteristics: ['conversational singing', 'story comes first', 'lived experience', 'authentic American voice'],
    sunoTags:
      'americana vocals, storytelling delivery, conversational singing, authentic, words matter, lived experience',
  },

  // === WORLD VOCALS ===

  mongolian_throat: {
    name: 'Mongolian Throat Singing',
    description: 'Khoomei, overtone singing, ancient technique',
    characteristics: [
      'overtone harmonics',
      'multiple pitches simultaneously',
      'deep resonance',
      'ancient steppe tradition',
      'primal power',
    ],
    sunoTags:
      'Mongolian throat singing, khoomei, overtone vocals, deep resonance, ancient technique, multiple harmonics',
  },

  african_vocal: {
    name: 'African Vocal',
    description: 'West African griot to South African harmonies',
    characteristics: [
      'call and response',
      'polyrhythmic phrasing',
      'storytelling griot tradition',
      'rich harmonies',
      'community voice',
    ],
    sunoTags: 'African vocals, griot tradition, call and response, polyrhythmic, rich harmonies, storytelling voice',
  },

  celtic_sean_nos: {
    name: 'Celtic Sean-Nós',
    description: 'Old style Irish, unaccompanied and ornamented',
    characteristics: ['unaccompanied', 'ornamental', 'ancient Gaelic', 'story songs', 'modal melodies'],
    sunoTags: 'sean-nós singing, traditional Irish vocals, unaccompanied, ornamented, ancient Celtic, modal',
  },

  arabic_maqam: {
    name: 'Arabic Maqam',
    description: 'Quarter tones, melismatic, Middle Eastern',
    characteristics: ['quarter tones', 'melismatic runs', 'emotional intensity', 'maqam scales', 'desert poetry'],
    sunoTags: 'Arabic vocals, maqam singing, quarter tones, melismatic, Middle Eastern, emotional intensity',
  },

  indian_classical: {
    name: 'Indian Classical',
    description: 'Raga-based, ornamental, devotional',
    characteristics: ['raga melody', 'gamaka ornaments', 'devotional intensity', 'breath control', 'microtonal'],
    sunoTags: 'Indian classical vocals, raga-based, ornamental, devotional singing, gamaka, microtonal',
  },

  flamenco_cante: {
    name: 'Flamenco Cante',
    description: 'Spanish gypsy, raw emotion, duende',
    characteristics: [
      'duende (deep emotion)',
      'melismatic',
      'gypsy soul',
      'raw and passionate',
      'cante jondo (deep song)',
    ],
    sunoTags: 'flamenco vocals, cante jondo, duende, raw passion, Spanish gypsy, melismatic, soul-deep',
  },

  nordic_kulning: {
    name: 'Nordic Kulning',
    description: 'Scandinavian herding calls, ethereal and haunting',
    characteristics: [
      'high-pitched calls',
      'echoing in valleys',
      'ethereal',
      'ancient herding tradition',
      'otherworldly',
    ],
    sunoTags: 'kulning, Scandinavian vocals, ethereal calls, high-pitched, haunting, ancient Nordic, otherworldly',
  },

  japanese_enka: {
    name: 'Japanese Enka',
    description: 'Emotional Japanese ballad style, kobushi technique',
    characteristics: [
      'kobushi vocal technique',
      'emotional vibrato',
      'melancholic beauty',
      'dramatic pauses',
      'Japanese soul',
    ],
    sunoTags: 'enka vocals, Japanese ballad, kobushi technique, emotional vibrato, melancholic, dramatic',
  },

  gregorian_chant: {
    name: 'Gregorian Chant',
    description: 'Medieval church, modal, meditative',
    characteristics: ['modal melody', 'unison voices', 'meditative', 'sacred space', 'ancient church'],
    sunoTags: 'Gregorian chant, medieval vocals, modal, meditative, sacred, monastic, ancient',
  },

  // === BLUES / SOUL / GOSPEL ===

  delta_blues: {
    name: 'Delta Blues',
    description: 'Robert Johnson, raw Mississippi soul',
    characteristics: [
      'raw and unpolished',
      'field holler influence',
      'pain in every note',
      'call to the crossroads',
      'authentic suffering',
    ],
    sunoTags:
      'delta blues vocals, raw and unpolished, Mississippi soul, field holler, authentic pain, Robert Johnson style',
  },

  gospel_church: {
    name: 'Gospel Church',
    description: 'Sunday morning testimony, spirit-filled',
    characteristics: [
      'testifying',
      'spirit-filled runs',
      'call and response',
      'building intensity',
      'church tradition',
    ],
    sunoTags: 'gospel vocals, church singing, testimony, spirit-filled, call and response, building power',
  },

  soul_grit: {
    name: 'Soul Grit',
    description: 'Otis Redding, Sam Cooke, earned emotion',
    characteristics: ['emotional grit', 'earned pain', 'powerful dynamics', 'soul screams', 'authentic feeling'],
    sunoTags: 'soul vocals, Otis Redding style, Sam Cooke influence, emotional grit, powerful dynamics, authentic soul',
  },

  // === ROCK / ALTERNATIVE ===

  grunge_scream: {
    name: 'Grunge Scream',
    description: 'Kurt, Layne, Eddie - raw 90s pain',
    characteristics: ['raw screaming', 'emotional breakdown', 'grunge dynamics', 'quiet to loud', 'tortured soul'],
    sunoTags: 'grunge vocals, raw screaming, 90s alternative, emotional dynamics, quiet to loud, tortured delivery',
  },

  punk_snarl: {
    name: 'Punk Snarl',
    description: 'Spit it out, attitude over ability',
    characteristics: ['snarling delivery', 'attitude first', 'raw energy', 'fuck you energy', 'unpolished power'],
    sunoTags: 'punk vocals, snarling delivery, raw attitude, aggressive, unpolished, rebellious energy',
  },

  indie_vulnerable: {
    name: 'Indie Vulnerable',
    description: 'Elliott Smith, Bon Iver, fragile beauty',
    characteristics: [
      'quiet vulnerability',
      'fragile beauty',
      'intimate whisper',
      'emotional honesty',
      'delicate power',
    ],
    sunoTags: 'indie vocals, vulnerable delivery, fragile and beautiful, intimate, Elliott Smith style, honest and raw',
  },

  // === RAP / SPOKEN WORD ===

  raw_rap: {
    name: 'Raw Rap',
    description: 'No effects, just voice and flow',
    characteristics: ['no autotune', 'raw delivery', 'natural voice', 'flow over production', 'authentic hip-hop'],
    sunoTags: 'raw rap vocals, no autotune, natural voice, authentic hip-hop, unprocessed flow',
  },

  spoken_word: {
    name: 'Spoken Word',
    description: 'Poetry over beats, words matter most',
    characteristics: [
      'poetic delivery',
      'rhythm in speech',
      'emotional weight on words',
      'storytelling',
      'slam poetry',
    ],
    sunoTags: 'spoken word, poetic delivery, words matter, rhythmic speech, slam poetry style, storytelling',
  },

  melodic_rap_raw: {
    name: 'Melodic Rap Raw',
    description: 'Singing and rapping without the autotune crutch',
    characteristics: [
      'natural melody',
      'singing without autotune',
      'raw melodic flow',
      'imperfect but real',
      'genuine tone',
    ],
    sunoTags: 'melodic rap, raw and unprocessed, natural singing, no autotune, real voice, authentic melodic flow',
  },
};

// ============================================
// GENERATOR CLASS
// ============================================

export class VocalTrackGenerator {
  private emotionalTone: ToneProfile;
  private productionStyle: ProductionProfile;
  private vocalStyle: VocalStyle;

  constructor(
    emotionalToneKey: string = 'cold_fury',
    productionStyleKey: string = 'hard_trap',
    vocalStyleKey: string = 'raw_natural',
  ) {
    this.emotionalTone =
      EMOTIONAL_TONES[emotionalToneKey] || BATTLE_TONES[emotionalToneKey] || EMOTIONAL_TONES.cold_fury;
    this.productionStyle = PRODUCTION_STYLES[productionStyleKey] || PRODUCTION_STYLES.hard_trap;
    this.vocalStyle = VOCAL_STYLES[vocalStyleKey] || VOCAL_STYLES.raw_natural;
  }

  setEmotionalTone(key: string): void {
    this.emotionalTone = EMOTIONAL_TONES[key] || BATTLE_TONES[key] || this.emotionalTone;
  }

  setProductionStyle(key: string): void {
    this.productionStyle = PRODUCTION_STYLES[key] || this.productionStyle;
  }

  setVocalStyle(key: string): void {
    this.vocalStyle = VOCAL_STYLES[key] || this.vocalStyle;
  }

  generateSunoStylePrompt(): string {
    return `${this.productionStyle.sunoPrompt}, ${this.vocalStyle.sunoTags}, ${this.emotionalTone.sunoVocal}`;
  }

  generateVocalDirection(): string[] {
    return [...this.emotionalTone.vocalDelivery, ...this.vocalStyle.characteristics];
  }

  generateLyricGuidance(): string {
    return this.emotionalTone.lyricApproach;
  }

  getFullProfile(): {
    emotion: ToneProfile;
    production: ProductionProfile;
    vocal: VocalStyle;
    sunoPrompt: string;
  } {
    return {
      emotion: this.emotionalTone,
      production: this.productionStyle,
      vocal: this.vocalStyle,
      sunoPrompt: this.generateSunoStylePrompt(),
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getAvailableEmotions(): string[] {
  return [...Object.keys(EMOTIONAL_TONES), ...Object.keys(BATTLE_TONES)];
}

export function getAvailableProductions(): string[] {
  return Object.keys(PRODUCTION_STYLES);
}

export function getAvailableVocalStyles(): string[] {
  return Object.keys(VOCAL_STYLES);
}

export function getToneForBattleRound(roundNumber: number, role: 'protagonist' | 'antagonist'): ToneProfile {
  if (role === 'antagonist') {
    switch (roundNumber) {
      case 1:
        return BATTLE_TONES.dismissive_cold;
      case 3:
        return EMOTIONAL_TONES.desperate_anger;
      default:
        return BATTLE_TONES.menacing_villain;
    }
  } else {
    switch (roundNumber) {
      case 2:
        return EMOTIONAL_TONES.rising_from_ashes;
      case 4:
        return EMOTIONAL_TONES.righteous_fire;
      default:
        return EMOTIONAL_TONES.quiet_strength;
    }
  }
}

export function generateBattleStylePrompt(
  productionKey: string = 'hard_trap',
  antagonistVocalKey: string = 'raw_rap',
  protagonistVocalKey: string = 'raw_rap',
): {
  sunoStyle: string;
  antagonistVocal: string;
  protagonistVocal: string;
} {
  const production = PRODUCTION_STYLES[productionKey] || PRODUCTION_STYLES.hard_trap;
  const antagVocal = VOCAL_STYLES[antagonistVocalKey] || VOCAL_STYLES.raw_rap;
  const protagVocal = VOCAL_STYLES[protagonistVocalKey] || VOCAL_STYLES.raw_rap;

  return {
    sunoStyle: production.sunoPrompt,
    antagonistVocal: antagVocal.sunoTags,
    protagonistVocal: protagVocal.sunoTags,
  };
}
