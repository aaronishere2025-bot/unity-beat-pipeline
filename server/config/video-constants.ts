/**
 * Centralized Video Production Constants
 * All magic numbers and configuration values in one place for easy maintenance
 */

import { join } from 'path';

/**
 * Song/Video Duration Limits
 * Hard caps to control costs and optimize for social platforms
 */
export const DURATION_LIMITS = {
  // Hard maximum - NEVER exceed this
  MAX_SONG_DURATION_SECONDS: 180, // 3 minutes absolute max

  // Platform-optimized defaults
  SHORTS_DURATION_SECONDS: 60, // YouTube Shorts / TikTok / Reels
  STANDARD_DURATION_SECONDS: 120, // 2 minutes for longer content
  EXTENDED_DURATION_SECONDS: 180, // 3 minutes max

  // Default if not specified
  DEFAULT_DURATION_SECONDS: 60, // Default to Shorts format

  // VEO clip duration (fixed by API)
  VEO_CLIP_DURATION_SECONDS: 8,
} as const;

/**
 * Video Format Definitions
 * Standard resolutions and aspect ratios for video production
 */
export const VIDEO_FORMATS = {
  LANDSCAPE_16_9: {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9' as const,
  },
  PORTRAIT_9_16: {
    width: 1080,
    height: 1920,
    aspectRatio: '9:16' as const,
  },
  TABLET_4_3_LANDSCAPE: {
    width: 1440,
    height: 1080,
    aspectRatio: '4:3' as const,
  },
  TABLET_4_3_PORTRAIT: {
    width: 1080,
    height: 1440,
    aspectRatio: '4:3' as const,
  },
} as const;

/**
 * FFmpeg Processing Configuration
 * Settings for video concatenation, crossfades, and encoding
 */
export const FFMPEG_CONFIG = {
  BATCH_SIZE: 5,
  CROSSFADE_DURATION_SECONDS: 0.3,
  DURATION_TOLERANCE_SECONDS: 15.0, // Increased from 2.0 to handle longer Suno music tracks
  POST_PROCESSING_ENABLED: false, // Kling AI clips are already clean; denoise+sharpen is wasted effort
  ENCODING: {
    PRESET_FAST: 'fast',
    PRESET_ULTRAFAST: 'ultrafast',
    CRF_DEFAULT: 18,
    AUDIO_CODEC: 'aac',
    AUDIO_BITRATE: '192k',
    VIDEO_CODEC: 'libx264',
  },
  NORMALIZATION: {
    AUDIO_SAMPLE_RATE: 48000,
    AUDIO_CHANNELS: 'stereo',
  },
} as const;

/**
 * VEO 2 (Google Vertex AI) Configuration
 * DISABLED: VEO is obsolete - using Kling exclusively now (Dec 2025)
 */
export const VEO_CONFIG = {
  ENABLED: false, // DISABLED - VEO is obsolete, use Kling instead
  COST_PER_CLIP: 1.5,
  DAILY_COST_LIMIT: Number(process.env.VEO_DAILY_COST_LIMIT) || 100,
  MAX_RETRY_ATTEMPTS: 2,
  TIMEOUTS: {
    INITIATION_MS: 120000, // 2 minutes for API call
    DOWNLOAD_MS: 60000, // 1 minute for video download
    POLL_INTERVAL_MS: 5000, // 5 seconds between polls
    MAX_POLL_ATTEMPTS: 60, // 60 polls = 5 minutes max wait
    RETRY_DELAY_MS: 10000, // 10 seconds before retry
    INTER_CLIP_DELAY_MS: 60000, // 60 seconds between clips (quota reset)
  },
  API: {
    MODEL: 'veo-2.0-generate-001',
    REGION: 'us-central1',
    SAMPLE_COUNT: 1,
  },
} as const;

/**
 * Consistent Character Generator Configuration
 * IP-Adapter + Luma Ray/Direct Luma settings
 */
export const CONSISTENT_CHARACTER_CONFIG = {
  MAX_RETRY_ATTEMPTS: 2,
  COSTS: {
    IP_ADAPTER_PER_IMAGE: 0.06,
    LUMA_RAY_REPLICATE_PER_VIDEO: 0.6,
    LUMA_DIRECT_PER_VIDEO: 0.3,
  },
  TIMEOUTS: {
    IP_ADAPTER_MS: 5 * 60 * 1000, // 5 minutes
    LUMA_REPLICATE_MS: 3 * 60 * 1000, // 3 minutes
    LUMA_DIRECT_MS: 90 * 1000, // 90 seconds
    POLL_INTERVAL_MS: 3000, // 3 seconds
    DEFAULT_RETRY_DELAY_SECONDS: 15,
  },
  IP_ADAPTER: {
    MODEL_VERSION: '50ac06bb9bcf30e7b5dc66d3fe6e67262059a11ade572a35afa0ef686f55db82',
    CHECKPOINT: 'ip-adapter-plus-face_sd15.bin',
    WEIGHT: 1.0,
    SCHEDULER: 'K_EULER_ANCESTRAL',
    INFERENCE_STEPS: 50,
    GUIDANCE_SCALE: 7.5,
    MAX_WIDTH: 1920,
    MAX_HEIGHT: 1080,
    NUM_OUTPUTS: 1,
  },
  LUMA: {
    DURATION: '9s',
    ASPECT_RATIO: '16:9',
    MAX_PROMPT_LENGTH: 4800,
  },
} as const;

/**
 * VEO 3.1 Fast (Google Vertex AI) Configuration
 * Pricing (December 2025):
 *   - WITHOUT audio: $0.15/second (use this - we replace audio with Suno)
 *   - WITH audio: $0.25/second
 * 8-second clip = $1.20 (no audio) or $2.00 (with audio)
 *
 * PARALLEL GENERATION:
 * Google Vertex AI allows 10 concurrent LROs (long-running operations) per project.
 * We use 4 concurrent by default for safety margin and cost control.
 * This can reduce 22-clip generation from ~40min to ~12min (3-4x faster).
 */
export const VEO3_CONFIG = {
  ENABLED: false, // DISABLED - VEO is obsolete, use Kling instead (Dec 2025)
  COST_PER_SECOND: 0.15, // No audio mode - we use Suno for music
  COST_PER_SECOND_WITH_AUDIO: 0.25, // For reference only
  DEFAULT_DURATION_SECONDS: 8,
  DAILY_COST_LIMIT: Number(process.env.VEO_DAILY_COST_LIMIT) || 100,
  MAX_RETRY_ATTEMPTS: 2,
  CONCURRENCY: {
    MAX_PARALLEL_CLIPS: 2, // Generate 2 clips at once (conservative - had issues with higher)
    BATCH_DELAY_MS: 3000, // 3 second delay between batches
  },
  TIMEOUTS: {
    INITIATION_MS: 120000,
    DOWNLOAD_MS: 60000,
    POLL_INTERVAL_MS: 5000,
    MAX_POLL_ATTEMPTS: 60,
    RETRY_DELAY_MS: 10000,
    INTER_CLIP_DELAY_MS: 5000, // Reduced from 60s - only needed on quota errors
  },
  API: {
    MODEL: 'veo-3.1-fast-generate-preview',
    REGION: 'us-central1',
    SAMPLE_COUNT: 1,
  },
} as const;

/**
 * VEO 3.1 Standard I2V (Image-to-Video) Configuration
 * Uses veo-3.1-generate-001 which supports:
 * - First frame image input (I2V)
 * - Last frame image input (for interpolation)
 * - Up to 3 reference images for character consistency
 *
 * Pricing is higher than Fast but enables character lock:
 * - Standard: ~$0.20/second (with I2V)
 * - Comparison: Fast is $0.15/second but no I2V
 */
export const VEO3_I2V_CONFIG = {
  ENABLED: false, // DISABLED - VEO is obsolete, use Kling instead (Dec 2025)
  COST_PER_SECOND: 0.2, // I2V mode is slightly more expensive
  DEFAULT_DURATION_SECONDS: 8,
  DAILY_COST_LIMIT: Number(process.env.VEO_DAILY_COST_LIMIT) || 100,
  MAX_RETRY_ATTEMPTS: 2,
  CONCURRENCY: {
    MAX_PARALLEL_CLIPS: 2, // Conservative for I2V which is more compute-intensive
    BATCH_DELAY_MS: 5000, // Slightly longer delay for I2V
  },
  TIMEOUTS: {
    INITIATION_MS: 180000, // 3 minutes - I2V can take longer to initiate
    DOWNLOAD_MS: 60000,
    POLL_INTERVAL_MS: 5000,
    MAX_POLL_ATTEMPTS: 90, // 7.5 minutes max (I2V takes longer)
    RETRY_DELAY_MS: 15000,
    INTER_CLIP_DELAY_MS: 5000,
  },
  API: {
    MODEL: 'veo-3.1-generate-001', // Standard model with I2V support
    REGION: 'us-central1',
    SAMPLE_COUNT: 1,
  },
  // Frame extraction settings for chaining
  FRAME_EXTRACTION: {
    OUTPUT_FORMAT: 'png',
    QUALITY: 100, // Lossless for frame chaining
  },
} as const;

/**
 * Unity Content / Music Configuration
 *
 * VEO 8-SECOND ALIGNMENT:
 * BPMs must align with 8-second VEO clip boundaries for perfect audio-visual sync.
 * Formula: beats_in_8s = BPM ÷ 7.5
 * Aligned BPMs: 60, 90, 120, 150, 180, 210, 240
 * AVOID: 128, 140, 143.6 (common but misaligned)
 */
export const VEO_ALIGNED_BPMS = [60, 90, 120, 150, 180, 210, 240] as const;

export const UNITY_MUSIC_CONFIG = {
  DEFAULT_BPM: 120, // VEO-aligned (was 125)
  SYLLABLES_PER_LINE: 8,
  MIN_BPM: 60,
  MAX_BPM: 180,
  VEO_ALIGNED_BPMS,
} as const;

/**
 * STYLE PRESETS - Selectable aesthetic modes for Unity Content
 * Each preset modifies VEO prompts, character styling, and visual approach
 *
 * Discovered through testing: The system has RANGE and can produce
 * vastly different aesthetics based on prompt engineering.
 */
export type StylePresetKey =
  | 'historical'
  | 'wholesome'
  | 'corporate'
  | 'indie_raw'
  | 'horror'
  | 'comedy_meme'
  | 'documentary'
  | 'custom';

export const STYLE_PRESETS: Record<
  StylePresetKey,
  {
    name: string;
    description: string;
    targetVibe: string;
    references: string[];

    // Prompt modifiers
    cameraModifiers: string[];
    lightingModifiers: string[];
    colorGradeModifiers: string[];
    paceModifiers: string[];

    // Character styling
    characterVibeOverride: string;
    wardrobeStyle: string;

    // Food prominence (0-1, 0=no food, 1=food-centric)
    foodProminence: number;
    foodStyle: string;

    // Trigger words to INCLUDE in prompts
    includeWords: string[];

    // Trigger words to AVOID (Google safety filter, wrong vibe)
    avoidWords: string[];

    // Comedy-specific settings
    comedyLevel: 'none' | 'subtle' | 'medium' | 'absurd';

    // Section-specific overrides
    sectionOverrides: Record<string, string>;
  }
> = {
  historical: {
    name: 'Historical/Documentary',
    description: 'Epic documentary style for historical figures and events - BBC History meets Netflix prestige',
    targetVibe: 'Epic, educational, cinematic, period-accurate',
    references: ['Game of Thrones', 'Marco Polo (Netflix)', 'Gladiator', 'The Last Kingdom', 'Planet Earth'],

    cameraModifiers: [
      'sweeping crane shot',
      'epic wide establishing',
      'tracking through period setting',
      'documentary handheld',
    ],
    lightingModifiers: [
      'torchlight and firelight',
      'golden hour epic',
      'candlelit chambers',
      'practical period lighting',
    ],
    colorGradeModifiers: ['desaturated epic', 'crushed blacks', 'golden highlights', 'film grain'],
    paceModifiers: ['epic and deliberate', 'dramatic pauses', 'building tension', 'majestic pacing'],

    characterVibeOverride: 'commanding presence, period-accurate posture, legendary gravitas',
    wardrobeStyle: 'PERIOD-ACCURATE HISTORICAL ATTIRE ONLY - armor, robes, crowns, weapons from the era',

    foodProminence: 0,
    foodStyle: 'NO FOOD - use trade goods: silk fabrics, gold coins, ancient scrolls, exotic spices',

    includeWords: ['epic', 'legendary', 'ancient', 'period-accurate', 'majestic', 'historical', 'documentary'],
    avoidWords: ['modern', 'office', 'casual', 'food', 'breakroom', 'A24', 'indie', 'meme'],

    comedyLevel: 'none',

    sectionOverrides: {
      intro: 'Sweeping crane across ancient landscape, establishing historical grandeur',
      verse: 'Tracking shot following historical figure through period setting',
      chorus: 'Epic hero shots, dramatic low angles, maximum visual impact',
      bridge: 'Intimate close-up, contemplative moment of leadership',
      outro: 'Rising crane shot, triumphant wide angle, legacy moment',
    },
  },

  wholesome: {
    name: 'Wholesome Vibes',
    description: 'Warm, polished, feel-good content for uplifting music',
    targetVibe: 'Heartwarming, sincere, community-focused',
    references: ['Hallmark movies', 'Coca-Cola ads', 'Apple lifestyle videos'],

    cameraModifiers: ['smooth dolly', 'gentle crane descent', 'soft focus transitions', 'floating steadicam'],
    lightingModifiers: ['golden hour warmth', 'soft diffused sunlight', 'warm interior glow', 'magic hour'],
    colorGradeModifiers: ['warm orange tones', 'lifted shadows', 'soft contrast', 'skin-flattering'],
    paceModifiers: ['slow', 'lingering', 'contemplative', 'breathing room'],

    characterVibeOverride: 'genuine smile, relaxed posture, approachable energy',
    wardrobeStyle: 'casual comfortable, earth tones, soft fabrics',

    foodProminence: 0.3,
    foodStyle: 'home-cooked, family dinner table, steam rising from dishes',

    includeWords: ['warm', 'gentle', 'soft focus', 'golden light', 'sincere moment', 'genuine connection'],
    avoidWords: ['harsh', 'dramatic shadows', 'stark', 'cold', 'aggressive', 'confrontational'],

    comedyLevel: 'none',

    sectionOverrides: {
      intro: 'Warm establishing shot, characters in comfortable setting, inviting atmosphere',
      chorus: 'Characters coming together, shared joy, communal warmth',
      outro: 'Satisfied smiles, warm embrace, hope for tomorrow',
    },
  },

  corporate: {
    name: 'Corporate/Brand',
    description: 'Stock footage aesthetic, diverse, professional - for brand deals and ads',
    targetVibe: 'Professional, aspirational, inclusive representation',
    references: ['LinkedIn videos', 'Fortune 500 ads', 'Stock footage websites', 'TED talks'],

    cameraModifiers: ['smooth slider shot', 'stable tripod', 'professional crane', 'clean tracking'],
    lightingModifiers: ['studio lighting', 'bright and even', 'no harsh shadows', 'professional key light'],
    colorGradeModifiers: ['clean whites', 'slight desaturation', 'corporate blue accents', 'high clarity'],
    paceModifiers: ['medium', 'professional', 'measured', 'deliberate'],

    characterVibeOverride: 'professional confidence, diverse casting, business casual energy',
    wardrobeStyle: 'business casual, smart casual, pressed and clean, modern office appropriate',

    foodProminence: 0.2,
    foodStyle: 'artisanal lunch, coffee shop moments, team lunch meeting',

    includeWords: ['professional', 'clean', 'modern', 'diverse', 'collaborative', 'innovative'],
    avoidWords: ['gritty', 'raw', 'handheld shake', 'harsh', 'underground', 'edgy'],

    comedyLevel: 'subtle',

    sectionOverrides: {
      intro: 'Modern office or urban setting, professional establishing shot',
      chorus: 'Collaborative moment, team success, shared achievement',
      outro: 'Forward-looking, optimistic future, professional satisfaction',
    },
  },

  indie_raw: {
    name: 'Indie/Raw',
    description: 'Authentic, handheld, documentary-style - for underground/authentic content',
    targetVibe: 'Real, unpolished, street-level authenticity',
    references: ['A24 films', 'Moonlight', 'Kids (1995)', 'Sean Baker films', 'Documentary photography'],

    cameraModifiers: ['handheld shake', 'available light only', 'documentary style', 'voyeuristic angle'],
    lightingModifiers: ['practical lights only', 'harsh fluorescent', 'single source', 'unmotivated shadows'],
    colorGradeModifiers: ['desaturated', 'lifted blacks', 'film grain', 'muted colors'],
    paceModifiers: ['languid', 'observational', 'patient', 'naturalistic timing'],

    characterVibeOverride: 'unposed, caught mid-action, natural expressions, real body language',
    wardrobeStyle: 'street clothes, worn-in, authentic to character, not styled',

    foodProminence: 0.4,
    foodStyle: 'bodega sandwiches, street food, late night diner, real food stains on napkins',

    includeWords: ['handheld', 'available light', 'documentary', 'unstaged', 'authentic', 'raw moment'],
    avoidWords: ['polished', 'glossy', 'studio', 'perfect', 'styled', 'commercial'],

    comedyLevel: 'subtle',

    sectionOverrides: {
      intro: 'Observational wide shot, characters unaware of camera, slice of life',
      chorus: 'Intimate moment caught on camera, raw emotion, unguarded',
      outro: 'Life continues, ambiguous resolution, lingering on mundane detail',
    },
  },

  horror: {
    name: 'Horror/Dark',
    description: 'A24 unsettling, thriller tension - for dark/edgy music content',
    targetVibe: 'Unsettling, atmospheric dread, psychological tension',
    references: ['A24 horror', 'Hereditary', 'Midsommar', 'The Witch', 'It Follows'],

    cameraModifiers: ['slow creeping dolly', 'dutch angle', 'ominous crane descent', 'lingering static shot'],
    lightingModifiers: ['harsh single source', 'deep shadows', 'unsettling practical', 'flickering'],
    colorGradeModifiers: [
      'desaturated with color accent',
      'teal shadows',
      'sickly yellow highlights',
      'crushed blacks',
    ],
    paceModifiers: ['uncomfortably slow', 'dread-building', 'tension holds', 'pregnant pause'],

    characterVibeOverride: 'distant gaze, something not quite right, controlled exterior hiding turmoil',
    wardrobeStyle: 'muted palette, slightly off, period-inappropriate details, unsettling ordinary',

    foodProminence: 0.3,
    foodStyle: 'unsettling family dinner, too-perfect food arrangement, something wrong with the meal',

    includeWords: ['ominous', 'unsettling', 'creeping', 'tension', 'dread', 'atmospheric'],
    avoidWords: ['bright', 'cheerful', 'warm', 'comfortable', 'safe', 'reassuring'],

    comedyLevel: 'none',

    sectionOverrides: {
      intro: 'Something is wrong in this peaceful setting, camera lingers too long',
      chorus: 'Revelation of the underlying horror, characters frozen in realization',
      outro: 'Ambiguous ending, the horror continues, no resolution',
    },
  },

  comedy_meme: {
    name: 'Comedy/Meme',
    description: 'Absurdist funny, viral-ready - Nathan For You, Key & Peele, Adult Swim vibes',
    targetVibe: 'Funny weird NOT uncomfortable weird, absurdist joy, shareable moments',
    references: [
      'Nathan For You',
      'Key & Peele food sketches',
      'Adult Swim bumpers',
      'Funny or Die',
      'Eric Andre',
      'Tim Robinson',
    ],

    cameraModifiers: [
      'deadpan static shot',
      'awkward zoom-in on food',
      'melodramatic slow motion',
      'over-the-top crane reveal',
      'mock-documentary handheld',
      'absurd low angle hero shot',
    ],
    lightingModifiers: [
      'overly dramatic for mundane action',
      'infomercial bright',
      'epic rim light on ordinary object',
      'sitcom flat lighting for deadpan',
    ],
    colorGradeModifiers: [
      'slightly oversaturated',
      'food commercial pop',
      'mock-epic color grade',
      'sitcom bright and clean',
    ],
    paceModifiers: ['comedic timing', 'awkward pause', 'quick cut reaction', 'hold for laugh'],

    characterVibeOverride: 'deadpan delivery, taking absurd situation completely seriously, committed to the bit',
    wardrobeStyle: 'slightly too formal for the situation, or hilariously casual, costume-level commitment',

    foodProminence: 0.9, // FOOD IS THE STAR in Comedy/Meme mode
    foodStyle:
      'HERO SHOTS of pizza and tacos, slow-motion cheese pull, steam rising dramatically, food as characters, absurd food worship',

    includeWords: [
      'deadpan',
      'absurd',
      'comedic timing',
      'overly dramatic',
      'food hero shot',
      'cheese pull slow motion',
      'mock serious',
      'taking it too seriously',
      'delicious close-up',
      'epic food reveal',
      'characters worship the food',
      'gentle floating steadicam', // Safe for Google filter
      'warm kitchen lighting',
      'soft focus on delicious food',
    ],
    avoidWords: [
      'horror',
      'dread',
      'unsettling',
      'tension',
      'threatening',
      'aggressive',
      'energy burst', // Triggers Google safety filter
      'dynamic push', // Triggers Google safety filter
      'explosive', // Triggers Google safety filter
      'intense confrontation',
    ],

    comedyLevel: 'absurd',

    sectionOverrides: {
      intro:
        'Epic establishing shot of PIZZA and TACOS as if they are monuments, characters gaze upon them with reverence, warm golden food lighting',
      verse:
        'Characters deadpan debate while gorgeous FOOD B-ROLL steals the scene, mock-documentary style interviews about their food allegiance',
      chorus:
        'HERO SHOTS - slow motion cheese pull, steam rising from taco, characters pause mid-argument to appreciate how good the food looks',
      bridge:
        'Absurd food metaphors come to life - pizza slice and taco shell literally sharing a moment, characters watch in wonder',
      outro:
        'Characters share BOTH foods, slow-motion joy, food brings unity, gentle floating camera captures the delicious peace',
    },
  },

  documentary: {
    name: 'Documentary',
    description: 'BBC/Netflix historical documentary style - epic yet authentic, educational yet entertaining',
    targetVibe: 'Vibey informational, prestige documentary, narrative depth with visual poetry',
    references: [
      'Planet Earth',
      'The Last Dance',
      'Making a Murderer',
      'Ken Burns documentaries',
      'Rise of Empires: Ottoman',
      'Age of Samurai',
    ],

    cameraModifiers: [
      'sweeping crane shot with motivated movement',
      'handheld feel mixed with epic cinematography',
      'tracking shot following subject through environment',
      'slow push-in on contemplative moment',
      'aerial rising crane revealing vast landscape',
      'intimate close-up capturing micro-expressions',
    ],
    lightingModifiers: [
      'practical period-accurate sources',
      'torchlight with orange flicker',
      'campfire glow with dancing shadows',
      'golden hour with visible dust motes',
      'candlelit chambers with amber warmth',
      'storm light through tent canvas',
    ],
    colorGradeModifiers: [
      'desaturated earth tones with punchy highlights',
      'muted greens and browns of landscape',
      'warm amber interiors contrasting cool exteriors',
      'film grain for tactile texture',
      'crushed blacks with rich midtones',
    ],
    paceModifiers: [
      'epic and deliberate pacing',
      'let moments breathe',
      'tension builds through stillness',
      'dramatic pause before revelation',
      'majestic sweep matching music crescendo',
    ],

    characterVibeOverride:
      'commanding presence, weight of history in every gesture, authentic period physicality, eyes that have seen empires rise and fall',
    wardrobeStyle:
      'PERIOD-ACCURATE with tactile detail - dirt on armor, visible stitching on robes, weathered leather, practical not theatrical',

    foodProminence: 0,
    foodStyle: 'NO FOOD - use trade goods: silk fabrics, ancient scrolls, gold coins, war banners, period artifacts',

    includeWords: [
      'epic crane shot',
      'period-accurate',
      'documentary handheld feel',
      'practical lighting',
      'torchlight flickering',
      'dust motes in golden hour',
      'weathered and authentic',
      'BBC documentary style',
      'prestige television',
      'narrative arc moment',
      'contemplative stillness',
      'historical gravitas',
    ],
    avoidWords: [
      'modern',
      'casual',
      'food',
      'comedy',
      'absurd',
      'meme',
      'bright cheerful',
      'stock footage',
      'corporate',
      'theatrical costume',
      'clean and polished',
    ],

    comedyLevel: 'none',

    sectionOverrides: {
      intro:
        'ORIGIN SCENE: Dramatic childhood moment or early adversity, establishing the human before the legend, intimate and vulnerable',
      verse:
        'RISE SCENE: Subject gaining power/influence, tracking shots through period setting, building momentum and purpose',
      chorus:
        'PEAK SCENE: Height of achievement, epic wide shots, maximum visual grandeur, silhouetted against vast empire/landscape',
      bridge:
        'REFLECTION SCENE: Intimate vulnerability, alone with the weight of choices, close-up on weathered face, human behind the legend',
      outro:
        'LEGACY SCENE: Rising crane shot, figure grows smaller as land swallows them, time passes, what remains is the story',
    },
  },

  custom: {
    name: 'Custom',
    description: 'User-defined style settings',
    targetVibe: 'User-defined',
    references: [],

    cameraModifiers: [],
    lightingModifiers: [],
    colorGradeModifiers: [],
    paceModifiers: [],

    characterVibeOverride: '',
    wardrobeStyle: '',

    foodProminence: 0.5,
    foodStyle: '',

    includeWords: [],
    avoidWords: [],

    comedyLevel: 'medium',

    sectionOverrides: {},
  },
};

/**
 * Helper to get style preset by key with fallback
 */
export function getStylePreset(key: StylePresetKey | string): (typeof STYLE_PRESETS)[StylePresetKey] {
  return STYLE_PRESETS[key as StylePresetKey] || STYLE_PRESETS.wholesome;
}

// Known creature/animal types for auto-detection
export const CREATURE_TYPES = [
  'cat',
  'cats',
  'dog',
  'dogs',
  'lion',
  'lions',
  'tiger',
  'tigers',
  'bear',
  'bears',
  'wolf',
  'wolves',
  'fox',
  'foxes',
  'rabbit',
  'rabbits',
  'eagle',
  'eagles',
  'hawk',
  'hawks',
  'dragon',
  'dragons',
  'unicorn',
  'unicorns',
  'horse',
  'horses',
  'elephant',
  'elephants',
  'monkey',
  'monkeys',
  'ape',
  'apes',
  'shark',
  'sharks',
  'whale',
  'whales',
  'dolphin',
  'dolphins',
  'snake',
  'snakes',
  'lizard',
  'lizards',
  'crocodile',
  'crocodiles',
  'bird',
  'birds',
  'owl',
  'owls',
  'parrot',
  'parrots',
  'gorilla',
  'gorillas',
  'cheetah',
  'cheetahs',
  'panther',
  'panthers',
  'deer',
  'buffalo',
  'moose',
  'elk',
  'boar',
  'chicken',
  'chickens',
  'rooster',
  'roosters',
  'duck',
  'ducks',
  'penguin',
  'penguins',
  'koala',
  'koalas',
  'kangaroo',
  'kangaroos',
];

// Food types and their spirit animals for food battles
export const FOOD_SPIRIT_ANIMALS: Record<string, { animal: string; title: string }> = {
  pizza: { animal: 'pig', title: 'The Pizza Pig Paladin' },
  tacos: { animal: 'donkey', title: 'The Taco Donkey Knight' },
  taco: { animal: 'donkey', title: 'The Taco Donkey Knight' },
  burgers: { animal: 'bull', title: 'The Burger Bull Berserker' },
  burger: { animal: 'bull', title: 'The Burger Bull Berserker' },
  sushi: { animal: 'otter', title: 'The Sushi Otter Samurai' },
  ramen: { animal: 'fox', title: 'The Ramen Fox Ronin' },
  pasta: { animal: 'goose', title: 'The Pasta Goose Guardian' },
  hotdog: { animal: 'dachshund', title: 'The Hotdog Dachshund Duke' },
  'hot dog': { animal: 'dachshund', title: 'The Hotdog Dachshund Duke' },
  'fried chicken': { animal: 'rooster', title: 'The Fried Chicken Rooster' },
  chicken: { animal: 'rooster', title: 'The Chicken Rooster Ranger' },
  bbq: { animal: 'boar', title: 'The BBQ Boar Baron' },
  steak: { animal: 'bull', title: 'The Steak Bull Champion' },
  'ice cream': { animal: 'polar bear', title: 'The Ice Cream Polar Bear' },
  chocolate: { animal: 'rabbit', title: 'The Chocolate Bunny Baron' },
  coffee: { animal: 'owl', title: 'The Coffee Owl Crusader' },
  tea: { animal: 'crane', title: 'The Tea Crane Sage' },
  beer: { animal: 'bear', title: 'The Beer Bear Brawler' },
  wine: { animal: 'fox', title: 'The Wine Fox Aristocrat' },
  fries: { animal: 'beaver', title: 'The Fries Beaver Builder' },
  nachos: { animal: 'armadillo', title: 'The Nacho Armadillo Avenger' },
  curry: { animal: 'tiger', title: 'The Curry Tiger Templar' },
  pho: { animal: 'dragon', title: 'The Pho Dragon Master' },
};

// Known food types for food battle detection
export const FOOD_TYPES = [
  'pizza',
  'tacos',
  'taco',
  'burgers',
  'burger',
  'sushi',
  'ramen',
  'pasta',
  'hotdog',
  'hot dog',
  'fried chicken',
  'chicken',
  'bbq',
  'steak',
  'ice cream',
  'chocolate',
  'coffee',
  'tea',
  'beer',
  'wine',
  'fries',
  'nachos',
  'curry',
  'pho',
  'sandwich',
  'salad',
  'soup',
  'cake',
  'pie',
  'cookies',
  'donuts',
  'bagels',
  'bread',
];

// Historical figures for educational battle detection
// Enhanced with canonical descriptors for strict historical accuracy
export interface HistoricalFigureData {
  era: string;
  region: string;
  spiritAnimal: string;
  title: string;
  visualTheme: string;
  tradeGoods: string[];
  settings: string[];
  aliases?: string[];
  canonicalDescription: string;
  armor: string;
  weapons: string;
  mount?: string;
  props: string[];
}

export const HISTORICAL_FIGURES: Record<string, HistoricalFigureData> = {
  'genghis khan': {
    era: 'mongol_empire',
    region: 'mongolia',
    spiritAnimal: 'wolf',
    title: 'The Wolf Khan of the Steppes',
    visualTheme: 'Mongol conquest and empire',
    tradeGoods: ['war banners', 'horse saddles', 'Mongol bows', 'silk tributes', 'gold coins'],
    settings: [
      'golden Mongolian steppe at sunset',
      'Karakorum palace with silk banners',
      'war tent camp with yurts',
      'mountain pass overlooking empire',
    ],
    aliases: ['genghis', 'khan', 'temujin', 'chinggis', 'great khan'],
    canonicalDescription:
      'Genghis Khan, Mongol great khan with weather-beaten face, fierce piercing eyes, long braided hair with warrior topknot, battle-scarred visage showing decades of conquest',
    armor:
      'lamellar leather and iron armor with wolf-fur shoulder pauldrons, war-scarred bronze helmet with horsehair plume, leather riding boots with metal shin guards',
    weapons: 'curved Mongol saber with ornate hilt, composite recurve bow of horn and sinew, leather quiver of arrows',
    mount: 'black Mongolian war horse with braided mane and battle tack',
    props: [
      'war banners with blue wolf symbol',
      'yak-bone arrow quiver',
      'horse tack with gold fittings',
      'map of conquered territories on leather scroll',
    ],
  },
  'marco polo': {
    era: 'medieval',
    region: 'europe_asia',
    spiritAnimal: 'crane',
    title: 'The Silk Road Voyager',
    visualTheme: 'Trade routes and exploration',
    tradeGoods: ['silk fabrics', 'exotic spices', 'trade maps', 'porcelain', 'compass', 'jewels'],
    settings: [
      'Silk Road market bazaar with colorful stalls',
      'Xanadu palace throne room',
      'merchant caravan crossing desert',
      'Venetian canal at sunrise',
    ],
    aliases: ['polo', 'marco', 'venetian merchant'],
    canonicalDescription:
      'Marco Polo, Venetian merchant explorer with weathered but handsome face, curly dark hair, intelligent curious eyes, travel-worn but refined bearing',
    armor:
      'rich Venetian merchant robes of burgundy velvet with gold trim, leather traveling cloak with fur collar, soft leather boots for long journeys',
    weapons: 'Venetian stiletto dagger with jeweled hilt, walking staff of carved wood',
    props: [
      'leather satchel bulging with maps and journals',
      'brass compass in leather case',
      'silk samples in various colors',
      'travel journal with quill pen',
      'porcelain vase from China',
    ],
  },
  'george washington': {
    era: 'american_revolution',
    region: 'america',
    spiritAnimal: 'eagle',
    title: 'The Father of Liberty',
    visualTheme: 'American Revolution and founding',
    tradeGoods: ['muskets', 'liberty bells', 'colonial flags', 'parchment declarations', 'tricorn hats'],
    settings: [
      'Valley Forge encampment in winter snow',
      'Delaware River crossing at dawn',
      'Mount Vernon estate gardens',
      'Continental Congress hall with wooden benches',
    ],
    aliases: ['washington', 'general washington', 'president washington'],
    canonicalDescription:
      'George Washington, tall dignified general with powdered white hair tied back, strong jaw, resolute determined expression, commanding presence',
    armor:
      'Continental Army blue coat with buff facings, white waistcoat, leather riding boots, buff breeches, gold epaulettes',
    weapons: 'officer cavalry sword with eagle pommel, flintlock pistol',
    mount: 'white horse named Blueskin with military saddle',
    props: [
      'tricorn hat with cockade',
      'spyglass telescope',
      'leather map case',
      'Continental Army flag with thirteen stars',
    ],
  },
  'napoleon bonaparte': {
    era: 'napoleonic',
    region: 'france',
    spiritAnimal: 'lion',
    title: 'The Corsican Emperor',
    visualTheme: 'Napoleonic conquest and empire',
    tradeGoods: ['tricolor eagles', 'imperial crowns', 'cavalry sabers', 'military drums', 'artillery cannons'],
    settings: [
      'Austerlitz battlefield at sunrise',
      'Notre-Dame coronation with golden candlelight',
      'Egyptian pyramids at dusk',
      'snow-covered Russian winter retreat',
    ],
    aliases: ['napoleon', 'bonaparte', 'emperor napoleon', 'the little corporal'],
    canonicalDescription:
      'Napoleon Bonaparte, compact powerful frame, sharp intelligent eyes, distinctive profile, commanding military bearing, famous forelock',
    armor:
      'French Imperial Guard uniform of dark blue with white lapels, gold embroidered eagles, white breeches, black riding boots with spurs',
    weapons: 'curved cavalry saber with gold hilt, officer pistol in belt',
    mount: 'white Arabian horse Marengo with ornate French military saddle',
    props: [
      'iconic bicorne hat worn sideways',
      'map of Europe spread on table',
      'imperial eagle standard',
      'hand tucked in waistcoat',
    ],
  },
  'joan of arc': {
    era: 'medieval',
    region: 'france',
    spiritAnimal: 'dove',
    title: 'The Maid of Orleans',
    visualTheme: 'Divine crusade and martyrdom',
    tradeGoods: ['sacred banners', 'blessed swords', 'fleur-de-lis standards', 'holy relics', 'chain mail'],
    settings: [
      'Orleans siege walls with flaming arrows',
      'Reims cathedral coronation',
      'medieval French battlefield',
      'village church with divine light',
    ],
    aliases: ['joan', "jeanne d'arc", 'maid of orleans', 'la pucelle'],
    canonicalDescription:
      'Joan of Arc, young peasant woman with cropped dark hair, fierce determined eyes, radiant with divine purpose, humble yet commanding',
    armor: 'French plate armor over chain mail, white surcoat with fleur-de-lis, simple helmet with open face',
    weapons: 'blessed longsword with cross guard, white banner with golden fleur-de-lis and image of Christ',
    mount: 'white destrier war horse in French caparison',
    props: ['sacred white banner', 'simple wooden cross', 'fleur-de-lis pennant', 'rosary beads'],
  },
  saladin: {
    era: 'crusades',
    region: 'middle_east',
    spiritAnimal: 'falcon',
    title: 'The Sultan of Egypt',
    visualTheme: 'Crusader wars and chivalry',
    tradeGoods: ['Damascus steel swords', 'crescent banners', 'golden hookah', 'Arabian horses', 'silk robes'],
    settings: [
      'Jerusalem golden gates at sunset',
      'desert oasis camps with silk tents',
      'Ayyubid palace courtyard',
      'Crusader fortress siege',
    ],
    aliases: ['salah ad-din', 'sultan saladin', 'salah al-din'],
    canonicalDescription:
      'Saladin, noble Kurdish sultan with dark beard neatly trimmed, wise penetrating eyes, dignified bearing of a scholar-warrior',
    armor:
      'golden Damascus steel lamellar armor with Arabic calligraphy, flowing white silk robes underneath, ornate turban with jeweled pin',
    weapons: 'curved Damascus scimitar with gold inlay, composite bow, ornate round shield with crescent',
    mount: 'white Arabian stallion with gold-trimmed saddle and green silk caparison',
    props: ['crescent moon banner', 'Quran in leather case', 'hookah for diplomacy', 'map of Jerusalem'],
  },
  'tokugawa ieyasu': {
    era: 'edo_period',
    region: 'japan',
    spiritAnimal: 'crane',
    title: 'The Shogun Unifier',
    visualTheme: 'Samurai unification and Edo peace',
    tradeGoods: ['katana swords', 'shogun seals', 'samurai armor', 'tea ceremony sets', 'castle blueprints'],
    settings: [
      'Edo Castle throne room',
      'Sekigahara battlefield at dawn',
      'Japanese zen garden',
      'shogunate court with tatami',
    ],
    aliases: ['tokugawa', 'ieyasu', 'shogun tokugawa', 'the eastern barbarian subduing general'],
    canonicalDescription:
      'Tokugawa Ieyasu, patient calculating shogun with calm steady gaze, aged wise face, dignified samurai bearing',
    armor:
      'ornate black and gold samurai yoroi armor with Tokugawa hollyhock crest, kabuto helmet with golden crescent moon maedate',
    weapons: 'ancestral katana with crane tsuba guard, wakizashi short sword, folded war fan',
    props: [
      'shogun seal stamp',
      'tea ceremony implements',
      'hollyhock mon crest banner',
      'castle blueprints on rice paper',
    ],
  },
  ramses: {
    era: 'ancient_egypt',
    region: 'egypt',
    spiritAnimal: 'sphinx',
    title: 'The Great Pharaoh',
    visualTheme: 'Egyptian empire and monuments',
    tradeGoods: ['golden crook and flail', 'hieroglyph tablets', 'chariot wheels', 'obelisks', 'mummy wrappings'],
    settings: [
      'Abu Simbel temple entrance',
      'Nile delta with papyrus boats',
      'chariot battlefield',
      'Karnak temple complex with obelisks',
    ],
    aliases: ['ramses ii', 'ramesses', 'pharaoh ramses', 'ramses the great', 'ozymandias'],
    canonicalDescription:
      'Ramses II, god-king pharaoh with regal bearing, strong aquiline profile, kohl-lined eyes, divine authority',
    armor:
      'golden pharaonic war armor with lapis lazuli and turquoise, white linen kilt, broad golden collar necklace, khepresh blue war crown',
    weapons: 'bronze khopesh curved sword, golden bow with ivory arrows, war scepter',
    mount: 'gilded war chariot pulled by white horses with golden plumes',
    props: ['golden crook and flail crossed', 'hieroglyph cartouche tablets', 'ankh symbol', 'sacred scarab amulet'],
  },
  leonidas: {
    era: 'ancient_greece',
    region: 'greece',
    spiritAnimal: 'lion',
    title: 'The Lion of Sparta',
    visualTheme: 'Spartan valor and sacrifice',
    tradeGoods: ['Spartan shields', 'crimson cloaks', 'bronze spears', 'Laconian swords', 'warrior helms'],
    settings: [
      'Thermopylae narrow pass',
      'Hot Gates mountain cliffs',
      'Spartan training grounds',
      'phalanx formation on rocky terrain',
    ],
    aliases: ['king leonidas', 'leonidas i', 'the spartan king'],
    canonicalDescription:
      'King Leonidas, muscular Spartan warrior-king with thick dark beard, fierce determined eyes, battle-scarred body, commanding presence',
    armor:
      'bronze Corinthian helmet with crimson horsehair crest, bronze cuirass, leather pteruges skirt, crimson wool cloak, bronze greaves',
    weapons: 'dory spear eight feet long, xiphos short sword, large round aspis shield with lambda symbol',
    props: ['crimson Spartan cloak', 'aspis shield with lambda', 'Spartan warrior headband', 'broken Persian arrows'],
  },
  hannibal: {
    era: 'punic_wars',
    region: 'carthage',
    spiritAnimal: 'elephant',
    title: 'The Terror of Rome',
    visualTheme: 'Carthaginian military genius',
    tradeGoods: ['war elephants', 'Punic shields', 'Iberian swords', 'trade amphorae', 'siege engines'],
    settings: [
      'Alpine mountain crossing with snow',
      'Cannae battlefield',
      'Carthage harbor with purple sails',
      'Italian countryside ablaze',
    ],
    aliases: ['hannibal barca', 'barca', 'the carthaginian'],
    canonicalDescription:
      'Hannibal Barca, brilliant Carthaginian general with one eye (lost to disease), weathered Mediterranean features, cunning tactical gaze',
    armor:
      'Carthaginian bronze cuirass with Tanit symbol, purple general cloak, Numidian-style leather boots, plumed helmet',
    weapons: 'Iberian falcata curved sword, Carthaginian round shield, cavalry lance',
    mount: 'African war elephant with tower, or Numidian war horse',
    props: ['map of Italy on leather', 'Punic coins', 'war elephant tusk', 'broken Roman eagle standard'],
  },
  spartacus: {
    era: 'roman_republic',
    region: 'rome',
    spiritAnimal: 'wolf',
    title: 'The Rebel Gladiator',
    visualTheme: 'Slave uprising and freedom',
    tradeGoods: ['gladius swords', 'gladiator armor', 'broken chains', 'arena shields', 'freedom torches'],
    settings: [
      'Colosseum arena sand',
      'slave rebellion camps in hills',
      'Appian Way lined with crosses',
      'gladiator ludus training grounds',
    ],
    aliases: ['the gladiator', 'slave rebellion', 'thracian gladiator'],
    canonicalDescription:
      'Spartacus, powerful Thracian gladiator with muscular scarred body, fierce defiant eyes, broken chain still on wrist, symbol of freedom',
    armor:
      'gladiator battle-worn armor pieced from victories, Thracian curved greaves, leather arm guards with scars showing',
    weapons: 'gladius short sword, sica curved Thracian blade, captured Roman scutum shield',
    props: ['broken slave chains', 'gladiator net and trident', 'freedom torch', 'crude rebellion banner'],
  },
  'shaka zulu': {
    era: 'zulu_kingdom',
    region: 'africa',
    spiritAnimal: 'lion',
    title: 'The Zulu Warrior King',
    visualTheme: 'Zulu kingdom and warfare',
    tradeGoods: ['iklwa spears', 'cowhide shields', 'leopard pelts', 'war drums', 'feather headdresses'],
    settings: [
      'African savanna at golden hour',
      'Zulu kraal village',
      'impi battle formation',
      'royal enclosure with cattle',
    ],
    aliases: ['shaka', 'zulu king', 'shaka kasenzangakhona', 'king of the zulus'],
    canonicalDescription:
      'Shaka Zulu, towering muscular warrior-king with fierce commanding presence, ritual scars, intense strategic eyes',
    armor:
      'cowhide shield (isihlangu) with distinctive marking, leopard skin cape and headband, cow-tail leg decorations, bare muscular chest',
    weapons: 'iklwa short stabbing spear, iwisa knobkerrie club, large cowhide oval shield',
    props: ['ceremonial headdress with crane feathers', 'war drums', 'cattle horns', 'leopard pelt'],
  },
  'william the conqueror': {
    era: 'norman_conquest',
    region: 'normandy',
    spiritAnimal: 'hawk',
    title: 'The Norman King',
    visualTheme: 'Norman conquest and feudalism',
    tradeGoods: ['Norman swords', 'Bayeux tapestry', 'castle siege towers', 'feudal charters', 'cavalry lances'],
    settings: [
      'Hastings battlefield with arrow rain',
      'White Tower of London',
      'Norman motte-and-bailey castle',
      'feudal court with tapestries',
    ],
    aliases: ['william i', 'william normandy', 'the conqueror', 'william the bastard'],
    canonicalDescription:
      'William the Conqueror, powerful Norman duke-turned-king with stern commanding face, military bearing, red hair cropped short',
    armor:
      'Norman hauberk chain mail to knees, conical nasal helmet, kite-shaped Norman shield with golden lions, leather boots with spurs',
    weapons: 'Norman longsword with crossguard, cavalry lance, mace for mounted combat',
    mount: 'large black destrier war horse with Norman caparison',
    props: ['Bayeux tapestry scene', 'Domesday Book', 'coronation crown', 'Norman banner with golden lions'],
  },
  cleopatra: {
    era: 'ptolemaic_egypt',
    region: 'egypt',
    spiritAnimal: 'cobra',
    title: 'The Serpent Queen of the Nile',
    visualTheme: 'Egyptian royalty and power',
    tradeGoods: ['gold hieroglyphs', 'papyrus scrolls', 'sacred oils', 'lapis lazuli', 'lotus flowers'],
    settings: [
      'Nile river palace with lotus pools',
      'Alexandria library with scrolls',
      'throne room with hieroglyph columns',
      'barge on the Nile at sunset',
    ],
    aliases: ['cleopatra vii', 'queen cleopatra', 'queen of the nile', 'last pharaoh'],
    canonicalDescription:
      'Cleopatra VII, legendary Egyptian queen with striking Greek-Egyptian beauty, intelligent calculating eyes, regal commanding presence, olive skin',
    armor:
      'royal Egyptian robes of finest white linen with gold thread, elaborate gold collar necklace with lapis and turquoise, golden cobra uraeus crown (nemes headdress)',
    weapons: 'ceremonial asp-headed scepter, golden dagger with jeweled hilt',
    props: [
      'cobra uraeus crown',
      'golden asp bracelet',
      'kohl eyeliner and mirror',
      'royal cartouche',
      'pearl and gem jewelry',
    ],
  },
  'julius caesar': {
    era: 'roman_republic',
    region: 'rome',
    spiritAnimal: 'eagle',
    title: 'The Eagle of Rome',
    visualTheme: 'Roman conquest and politics',
    tradeGoods: ['legion standards', 'laurel wreaths', 'Roman coins', 'marble busts', 'iron gladii'],
    settings: [
      'Roman Senate marble floor',
      'Colosseum crowd cheering',
      'legions marching on road',
      'triumphal arch with eagle standards',
    ],
    aliases: ['caesar', 'gaius julius caesar', 'dictator perpetuo', 'divine julius'],
    canonicalDescription:
      'Julius Caesar, balding patrician general with sharp aquiline features, commanding presence, cunning political eyes, laurel wreath covering baldness',
    armor:
      'Roman general lorica musculata (muscle cuirass) of polished bronze, crimson paludamentum cloak, leather caligae sandals, golden laurel wreath crown',
    weapons: 'gladius short sword with eagle pommel, pugio dagger, scutum shield for ceremony',
    mount: 'white Roman war horse with crimson saddle cloth',
    props: ['golden laurel wreath', 'SPQR eagle standard', 'Roman fasces', 'wax tablet for writing', 'bust of himself'],
  },
  'kublai khan': {
    era: 'yuan_dynasty',
    region: 'china_mongolia',
    spiritAnimal: 'dragon',
    title: 'The Great Khan of China',
    visualTheme: 'Yuan dynasty splendor and Mongol-Chinese fusion',
    tradeGoods: ['silk brocade', 'jade carvings', 'porcelain vases', 'golden seals', 'paper money'],
    settings: [
      'Xanadu summer palace with gardens',
      'Dadu (Beijing) imperial court',
      'marble throne room with silk curtains',
      'grand pleasure dome',
    ],
    aliases: ['kublai', 'khubilai', 'emperor kublai', 'great khan', 'yuan emperor'],
    canonicalDescription:
      'Kublai Khan, powerful Yuan emperor with mixed Mongol-Chinese features, wise eyes of a scholar-ruler, dignified and cultured bearing',
    armor:
      'imperial Yuan dynasty silk robes of gold and crimson with dragon embroidery, jade belt with gold fittings, Mongol-style felt boots, jade and gold crown',
    weapons: 'ceremonial Mongol saber with jade hilt, golden scepter of office',
    props: [
      'jade imperial seal',
      'silk scroll decrees',
      'porcelain cup',
      'gold paper money',
      'palace throne with dragon motifs',
    ],
  },
  alexander: {
    era: 'hellenistic',
    region: 'greece_persia',
    spiritAnimal: 'eagle',
    title: 'The Macedonian Eagle',
    visualTheme: 'Greek conquest and hellenism',
    tradeGoods: ['Macedonian shields', 'Persian treasures', 'Greek scrolls', 'golden drachmas', 'phalanx spears'],
    settings: [
      'Mount Olympus temple',
      'Babylonian Ishtar gates',
      'Greek marble temples',
      'battlefield with Companion cavalry',
    ],
    aliases: ['alexander the great', 'alexandros', 'the great conqueror', 'macedonian king'],
    canonicalDescription:
      'Alexander the Great, youthful Macedonian king with leonine mane of golden-brown hair, mismatched eyes (one blue, one brown), athletic warrior build, divine confidence',
    armor:
      'Macedonian bronze cuirass with Medusa gorgon, lion-head shoulder pauldrons, crimson royal cloak, Phrygian helmet with white plumes',
    weapons: 'kopis curved sword, sarissa long pike, xiphos short blade',
    mount: 'Bucephalus, legendary black stallion with white star marking',
    props: ['Macedonian sunburst shield', 'Persian crown of Darius', 'map of conquered lands', 'Aristotle scroll'],
  },
  'alexander the great': {
    era: 'hellenistic',
    region: 'greece_persia',
    spiritAnimal: 'eagle',
    title: 'The Macedonian Eagle',
    visualTheme: 'Greek conquest and hellenism',
    tradeGoods: ['Macedonian shields', 'Persian treasures', 'Greek scrolls', 'golden drachmas', 'phalanx spears'],
    settings: [
      'Mount Olympus temple',
      'Babylonian Ishtar gates',
      'Greek marble temples',
      'battlefield with Companion cavalry',
    ],
    aliases: ['alexander', 'alexandros', 'the great conqueror', 'macedonian king'],
    canonicalDescription:
      'Alexander the Great, youthful Macedonian king with leonine mane of golden-brown hair, mismatched eyes (one blue, one brown), athletic warrior build, divine confidence',
    armor:
      'Macedonian bronze cuirass with Medusa gorgon, lion-head shoulder pauldrons, crimson royal cloak, Phrygian helmet with white plumes',
    weapons: 'kopis curved sword, sarissa long pike, xiphos short blade',
    mount: 'Bucephalus, legendary black stallion with white star marking',
    props: ['Macedonian sunburst shield', 'Persian crown of Darius', 'map of conquered lands', 'Aristotle scroll'],
  },
  'sun tzu': {
    era: 'warring_states',
    region: 'china',
    spiritAnimal: 'dragon',
    title: 'The Dragon Strategist',
    visualTheme: 'Military wisdom and Chinese philosophy',
    tradeGoods: [
      'bamboo scrolls',
      'jade seals',
      'bronze swords',
      'war banners with calligraphy',
      'terra cotta figures',
    ],
    settings: [
      'misty mountain fortress',
      'ancient Chinese temple with incense',
      'bamboo forest at dawn',
      'river crossing with boats',
    ],
    aliases: ['sun wu', 'master sun', 'the art of war', 'chinese strategist'],
    canonicalDescription:
      'Sun Tzu, ancient Chinese military sage with long gray beard, penetrating wise eyes, scholarly yet martial bearing, contemplative patience',
    armor:
      'flowing Chinese scholar robes of dark blue silk, bronze lamellar armor underneath, felt hat of an official, leather boots',
    weapons: 'bronze jian straight sword, war fan with strategic diagrams, bamboo staff',
    props: [
      'Art of War bamboo scroll',
      'ink brush and writing set',
      'war planning board with stones',
      'jade seal of command',
    ],
  },
  'queen victoria': {
    era: 'victorian',
    region: 'britain',
    spiritAnimal: 'lion',
    title: 'The Empress of Industry',
    visualTheme: 'British Empire and industrial revolution',
    tradeGoods: ['crown jewels', 'tea chests', 'steam engines', 'colonial maps', 'industrial gears'],
    settings: [
      'Buckingham Palace throne room',
      'factory with smokestacks',
      'Indian colonial railway',
      'Victorian London fog',
    ],
    aliases: ['victoria', 'empress victoria', 'queen of england', 'empress of india'],
    canonicalDescription:
      'Queen Victoria, stout dignified monarch in widow black, stern maternal face, authoritative bearing of an empire',
    armor:
      'royal mourning gown of black silk with white lace, crown of state with Koh-i-Noor diamond, imperial state orb and scepter',
    weapons: 'ceremonial orb and scepter (symbols of power)',
    props: ['imperial crown', 'tea service', 'colonial map of pink empire', 'steam engine model', 'throne of state'],
  },
  'leonardo da vinci': {
    era: 'renaissance',
    region: 'italy',
    spiritAnimal: 'owl',
    title: 'The Renaissance Mastermind',
    visualTheme: 'Art, science, and invention',
    tradeGoods: [
      'paint brushes',
      'anatomical sketches',
      'flying machine blueprints',
      'Mona Lisa',
      'golden ratio compasses',
    ],
    settings: [
      'Florence workshop with inventions',
      'cathedral dome construction',
      'inventor studio with candles',
      'Italian countryside with vinci',
    ],
    aliases: ['da vinci', 'leonardo', 'the master', 'renaissance man'],
    canonicalDescription:
      'Leonardo da Vinci, elderly genius with long gray beard, intense curious eyes, left-handed artist bearing, eternal student of nature',
    armor: 'Renaissance artist tunic of earth tones, leather apron stained with paint, velvet beret, simple wool cloak',
    weapons: 'drawing compass (as tool), mirror writing quill, inventor mind',
    props: [
      'Vitruvian Man sketch',
      'flying machine model',
      'anatomical drawings',
      'paint palette and brushes',
      'mirror for writing',
    ],
  },
  michelangelo: {
    era: 'renaissance',
    region: 'italy',
    spiritAnimal: 'eagle',
    title: 'The Divine Sculptor',
    visualTheme: 'Renaissance art and creation',
    tradeGoods: ['marble blocks', 'sculptor chisels', 'Sistine ceiling panels', 'David statue', 'fresco pigments'],
    settings: [
      'Sistine Chapel scaffolding',
      'Carrara marble quarries',
      'Vatican halls with frescoes',
      'Florentine Piazza della Signoria',
    ],
    aliases: ['buonarroti', 'the divine one', 'sculptor of david'],
    canonicalDescription:
      'Michelangelo, weathered sculptor with broken nose (from a fight), paint-stained fingers, intense artistic passion, brooding temperament',
    armor:
      'simple artist work clothes stained with marble dust and fresco pigments, leather apron, cloth headwrap for painting',
    weapons: 'sculptor chisel and mallet, drawing charcoal, artistic vision',
    props: [
      'David statue miniature',
      'Sistine Chapel panel',
      'Carrara marble block',
      'pigment pots',
      'anatomical studies',
    ],
  },
  beethoven: {
    era: 'classical_romantic',
    region: 'germany_austria',
    spiritAnimal: 'phoenix',
    title: 'The Thunderous Composer',
    visualTheme: 'Classical music and passion',
    tradeGoods: ['piano keys', 'symphony scores', 'conductor batons', 'Vienna concert halls', 'ear trumpets'],
    settings: [
      'grand Vienna concert hall',
      'moonlit Vienna gardens',
      'stormy sky over countryside',
      'candlelit composing room with piano',
    ],
    aliases: ['ludwig', 'ludwig van', 'the deaf composer', 'master beethoven'],
    canonicalDescription:
      'Beethoven, wild-haired genius with intense scowl, deaf yet hearing inner music, passionate stormy expression, romantic suffering artist',
    armor:
      'formal 19th century concert dress coat of dark wool, white cravat, disheveled appearance, ear trumpet in hand',
    weapons: 'conductor baton, quill pen for composing, thunderous music',
    props: ['symphony manuscript papers', 'ear trumpet', 'piano keyboard', 'candelabra', 'metronome'],
  },
  mozart: {
    era: 'classical',
    region: 'austria',
    spiritAnimal: 'nightingale',
    title: 'The Melodic Prodigy',
    visualTheme: 'Classical elegance and genius',
    tradeGoods: ['harpsichord keys', 'powdered wigs', 'opera librettos', 'Salzburg chocolates', 'quill pens'],
    settings: [
      'Austrian Schönbrunn palace ballroom',
      'Vienna opera house stage',
      'royal court with chandeliers',
      'Baroque garden with fountains',
    ],
    aliases: ['wolfgang amadeus', 'amadeus', 'the prodigy', 'austrian composer'],
    canonicalDescription:
      'Mozart, youthful musical genius with powdered wig, mischievous playful eyes, refined aristocratic bearing yet irreverent spirit',
    armor:
      'elegant 18th century court dress coat of blue silk with gold embroidery, lace cravat and cuffs, satin knee breeches, buckled shoes, powdered wig',
    weapons: 'conductor baton, quill pen for composing, harpsichord keys',
    props: [
      'sheet music with notes flowing',
      'powdered wig',
      'harpsichord or fortepiano',
      'opera mask',
      'champagne flute',
    ],
  },
  tesla: {
    era: 'modern',
    region: 'europe_america',
    spiritAnimal: 'raven',
    title: 'The Lightning Genius',
    visualTheme: 'Electricity and invention',
    tradeGoods: ['Tesla coils', 'lightning bolts', 'blueprint diagrams', 'copper wires', 'radio waves'],
    settings: ['Electrical laboratories', 'stormy night skies', 'Wardenclyffe tower', 'New York workshops'],
    aliases: ['nikola', 'nikola tesla', 'the wizard'],
    canonicalDescription:
      'Nikola Tesla, tall gaunt inventor with piercing eyes, slicked-back dark hair, intense visionary gaze, surrounded by electrical arcs',
    armor: '19th century formal suit with long dark coat, white collar, inventor goggles pushed up on forehead',
    weapons: 'Tesla coil staff crackling with electricity, lightning control, electromagnetic devices',
    props: [
      'Tesla coil emitting arcs',
      'blueprint diagrams',
      'copper wire coils',
      'radio transmitter',
      'pigeon companion',
    ],
  },
  edison: {
    era: 'modern',
    region: 'america',
    spiritAnimal: 'fox',
    title: 'The Wizard of Menlo Park',
    visualTheme: 'Invention and industry',
    tradeGoods: ['light bulbs', 'phonographs', 'film reels', 'patent papers', 'factory gears'],
    settings: ['Menlo Park laboratory', 'early movie studios', 'gaslight streets', 'industrial factories'],
    aliases: ['thomas edison', 'thomas', 'the inventor'],
    canonicalDescription:
      'Thomas Edison, pragmatic inventor with shrewd businessman eyes, receding hair, determined expression, holding light bulb prototype',
    armor: '19th century businessman suit with vest and pocket watch, rolled-up sleeves, inventor apron',
    weapons: 'light bulb staff glowing bright, phonograph sound waves, patent papers as shields',
    props: ['incandescent light bulb', 'phonograph cylinder', 'film reel', 'patent documents', 'pocket watch'],
  },
  samurai: {
    era: 'feudal',
    region: 'japan',
    spiritAnimal: 'crane',
    title: 'The Bushido Blade',
    visualTheme: 'Japanese warrior honor',
    tradeGoods: ['katana swords', 'samurai armor', 'cherry blossoms', 'rice paper scrolls', 'Zen incense'],
    settings: ['Japanese castles', 'bamboo gardens', 'misty mountains', 'dojo training halls'],
    aliases: ['japanese warrior', 'bushido warrior', 'ronin'],
    canonicalDescription:
      'Noble samurai warrior with stoic honor-bound expression, topknot hairstyle, weathered face of a veteran, disciplined warrior bearing',
    armor:
      'traditional samurai yoroi armor with lacquered iron plates, kabuto helmet with crescent moon crest, menpo face guard',
    weapons: 'katana longsword with razor edge, wakizashi short blade, yumi longbow',
    props: ['cherry blossom petals', 'rice paper scroll', 'sake cup', 'Zen garden rake', 'ancestral banner'],
  },
  viking: {
    era: 'medieval',
    region: 'scandinavia',
    spiritAnimal: 'raven',
    title: 'The Norse Raider',
    visualTheme: 'Norse exploration and conquest',
    tradeGoods: ['longship prows', 'rune stones', 'viking axes', 'mead horns', 'amber jewelry'],
    settings: ['Fjord shores', 'longship raids', 'Nordic forests', 'Valhalla halls'],
    aliases: ['norse warrior', 'norseman', 'viking raider', 'berserker'],
    canonicalDescription:
      'Fierce Viking warrior with braided beard, wild wind-swept hair, battle scars, piercing ice-blue eyes, seasoned raider bearing',
    armor:
      'chainmail byrnie with leather over-armor, round wooden shield with iron boss, fur-lined cloak, horned-rim spectacle helm',
    weapons: 'bearded Danish axe, seax knife, round shield with painted raven design',
    props: ['longship dragon prow', 'rune stones', 'mead drinking horn', 'Thor hammer pendant', 'treasure chest'],
  },
  spartans: {
    era: 'ancient',
    region: 'greece',
    spiritAnimal: 'wolf',
    title: 'The Spartan Shields',
    visualTheme: 'Greek military discipline',
    tradeGoods: ['Spartan shields', 'red cloaks', 'bronze spears', 'olive branches', 'warrior helms'],
    settings: ['Thermopylae pass', 'Greek agora', 'training grounds', 'phalanx formations'],
    aliases: ['spartan warrior', 'lacedaemonian', '300', 'spartan soldier'],
    canonicalDescription:
      'Elite Spartan hoplite with chiseled athletic physique, fierce disciplined gaze, battle-hardened veteran, legendary warrior bearing',
    armor:
      'bronze cuirass with abs definition, crimson cloak (phoinikis), Corinthian helmet with transverse crest, bronze greaves',
    weapons: 'dory spear (7 foot), xiphos short sword, hoplon shield with lambda symbol',
    props: ['lambda-marked shield', 'crimson cloak', 'olive wreath crown', 'bronze spear point', 'training weights'],
  },
};

// Generic historical visual elements for battles between ANY historical figures
export const HISTORICAL_VISUAL_ELEMENTS = {
  tradeGoods: [
    'silk fabrics unfurling in slow motion',
    'exotic spices exploding in vibrant dust clouds',
    'gold coins scattering across ancient maps',
    'precious gems catching candlelight',
    'ancient scrolls with mysterious symbols',
    'compass spinning as trade routes glow',
    'porcelain vases reflecting firelight',
    'leather-bound maps unfurling dramatically',
  ],
  epicMoments: [
    'steel meets silk in a shower of sparks',
    'ancient wisdom clashes with raw power',
    'two legends lock eyes across the battlefield',
    'the weight of history hangs in the air',
    'empires collide in a single decisive moment',
    'the clash of civilizations echoes through time',
  ],
  combatActions: [
    'warriors circle each other with predatory grace',
    'blade catches the light of a thousand candles',
    'shield blocks blow as dust erupts',
    'dramatic weapon cross in silhouette',
    'armor gleams under ancient torchlight',
    'cape billows in dramatic slow motion',
  ],
};

/**
 * HISTORICAL MODE BANS - Words and concepts that MUST NOT appear in historical battle prompts
 * These trigger anachronistic or inappropriate visuals
 */
export const HISTORICAL_MODE_BANS = {
  clothing: [
    'hoodie',
    'hoodies',
    'sneakers',
    'streetwear',
    'modern clothes',
    'jeans',
    't-shirt',
    'jacket',
    'baseball cap',
    'sweatpants',
    'yoga pants',
    'athletic wear',
    'tank top',
    'cargo pants',
    'denim',
    'windbreaker',
    'puffer jacket',
  ],
  materials: [
    'duct tape',
    'scrap metal',
    'DIY',
    'cardboard',
    'plastic',
    'neon',
    'styrofoam',
    'bubble wrap',
    'zip ties',
    'hot glue',
    'spray paint',
    'plywood',
    'pvc pipe',
    'wire mesh',
    'aluminum foil',
  ],
  settings: [
    'industrial',
    'warehouse',
    'urban',
    'city streets',
    'modern',
    'skyscraper',
    'parking lot',
    'subway',
    'highway',
    'office building',
    'shopping mall',
    'apartment complex',
    'gas station',
    'neon signs',
    'streetlights',
    'concrete jungle',
    'graffiti walls',
  ],
  aesthetics: [
    'A24',
    'indie',
    'gritty street',
    'raw handheld',
    'found footage',
    'mumblecore',
    'lo-fi',
    'amateur',
    'shaky cam',
    'documentary style',
    'reality TV',
    'gopro',
    'selfie',
    'instagram filter',
    'TikTok',
  ],
  weapons: [
    'gun',
    'pistol',
    'rifle',
    'machine gun',
    'grenade',
    'bomb',
    'laser',
    'lightsaber',
    'energy weapon',
    'plasma',
    'rocket launcher',
  ],
  food: [
    'pizza',
    'taco',
    'burger',
    'fries',
    'nachos',
    'hot dog',
    'soda',
    'coffee cup',
    'fast food',
    'vending machine',
    'food truck',
  ],
} as const;

/**
 * HISTORICAL STYLE OVERRIDES - Safe camera/lighting for historical battles
 * Overrides any comedy_meme or indie style presets when isHistoricalBattle=true
 */
export const HISTORICAL_STYLE_OVERRIDES = {
  name: 'Historical Epic',
  targetVibe: 'Epic historical documentary meets prestige drama',
  references: ['Game of Thrones', 'Gladiator', 'Marco Polo (Netflix)', 'Kingdom of Heaven', 'The Last Duel'],

  cameraModifiers: [
    'sweeping crane shot over battlefield',
    'smooth dolly push-in to face',
    'epic aerial establishing shot',
    'dramatic low-angle hero shot',
    'steady tracking shot following action',
    'slow-motion impact shot',
    'majestic pull-back revealing scope',
    'intimate close-up on weathered face',
  ],

  lightingModifiers: [
    'golden hour sunset backlighting',
    'dramatic torchlight with warm shadows',
    'rim lighting on armor and weapons',
    'volumetric light rays through dust',
    'candlelit palace ambiance',
    'dawn mist with soft diffusion',
    'firelight dancing on faces',
    'moonlit night with blue undertones',
  ],

  colorGradeModifiers: [
    'rich warm amber tones',
    'desaturated bronze palette',
    'golden and crimson empire colors',
    'earthy muted historical palette',
    'deep shadows with warm highlights',
  ],

  bannedCameraStyles: [
    'shaky handheld',
    'raw documentary',
    'gopro POV',
    'selfie stick',
    'found footage',
    'security camera',
    'phone footage',
    'amateur video',
  ],

  bannedLightingStyles: [
    'neon',
    'fluorescent',
    'harsh flash',
    'LED strip',
    'screen glow',
    'streetlight sodium',
    'industrial lighting',
  ],
} as const;

/**
 * HISTORICAL ENCOUNTERS DATABASE
 * Maps famous historical matchups to what ACTUALLY happened in history
 * Used to ensure VEO prompts and Suno lyrics tell the TRUE story
 */
export interface HistoricalEncounter {
  figures: [string, string]; // The two historical figures (order doesn't matter)
  actualEvent: string; // What really happened
  year: string; // When it happened
  location: string; // Where it happened
  relationship: 'alliance' | 'war' | 'trade' | 'diplomacy' | 'rivalry' | 'never_met';
  settings: string[]; // Historically accurate VEO settings
  atmosphere: string; // The mood/tone of the encounter
  keyFacts: string[]; // TRUE facts that MUST appear in lyrics
  mustInclude: string[]; // Visual elements that MUST appear
  mustAvoid: string[]; // Incorrect things to avoid
  narrativeArc: string; // The story structure for lyrics
}

export const HISTORICAL_ENCOUNTERS: HistoricalEncounter[] = [
  // MARCO POLO & KUBLAI KHAN - The famous merchant meets the Great Khan
  {
    figures: ['marco polo', 'kublai khan'],
    actualEvent:
      "Venetian merchant Marco Polo traveled the Silk Road and served in Kublai Khan's court for 17 years (1275-1292), acting as emissary and bringing back tales of China to Europe",
    year: '1275-1292',
    location: 'Xanadu (Shangdu) and Dadu (Beijing), Yuan Dynasty China',
    relationship: 'diplomacy',
    settings: [
      'Xanadu summer palace with marble columns and golden domes',
      "Kublai Khan's throne room with silk curtains and jade throne",
      'Silk Road caravan crossing the Gobi Desert',
      'Grand banquet hall with exotic foods and entertainment',
      'Marco presenting gifts from Venice to the Great Khan',
    ],
    atmosphere:
      "Wonder and cultural exchange - a young Venetian amazed by the splendor of the East, earning the Khan's trust through intelligence and curiosity",
    keyFacts: [
      'Marco was only 17 when he began the journey',
      'He traveled with his father Niccolò and uncle Maffeo',
      'The journey took 4 years along the Silk Road',
      'Marco served Kublai Khan for 17 years',
      'He brought back paper money, coal, and pasta concepts to Europe',
      'His book "The Travels of Marco Polo" inspired Columbus',
      'Kublai Khan gave Marco a golden tablet (paiza) for safe passage',
    ],
    mustInclude: [
      'Silk Road caravans',
      'Xanadu palace',
      'golden paiza tablet',
      'silk and spices',
      'Venetian and Mongol cultures meeting',
    ],
    mustAvoid: ['Combat between them', 'warfare', 'hostility', 'Genghis Khan (he died 50 years before)'],
    narrativeArc:
      "Young Venetian's journey from the canals of Venice to the grandeur of Xanadu, earning the Khan's respect and returning home with tales no one believed",
  },

  // GENGHIS KHAN & MARCO POLO - THEY NEVER MET (important to note!)
  {
    figures: ['genghis khan', 'marco polo'],
    actualEvent:
      'THEY NEVER MET - Genghis Khan died in 1227, Marco Polo was born in 1254. This is a fictional "what if" battle.',
    year: 'FICTIONAL - 27 years apart',
    location: 'Fictional meeting on the Mongolian steppe',
    relationship: 'never_met',
    settings: [
      'Vast Mongolian steppe with yurts and war banners',
      'Imagined meeting at Karakorum, the Mongol capital',
      'Silk Road crossroads where East meets West',
    ],
    atmosphere: 'Legendary "what if" clash - the unstoppable conqueror vs the curious explorer',
    keyFacts: [
      'Genghis Khan died in 1227',
      'Marco Polo was born in 1254',
      'They lived 27 years apart and NEVER met',
      "Marco actually met Genghis's GRANDSON, Kublai Khan",
      'This is an imagined "battle of legacies"',
    ],
    mustInclude: ['Acknowledge this is fictional', 'contrast conquest vs exploration', 'Mongol Empire legacy'],
    mustAvoid: ['Claiming they actually met', 'historical inaccuracy presented as fact'],
    narrativeArc:
      'Imagined clash of Mongol might vs Venetian curiosity - two legends from different eras debating conquest vs discovery',
  },

  // JULIUS CAESAR & CLEOPATRA - The legendary romance and alliance
  {
    figures: ['julius caesar', 'cleopatra'],
    actualEvent:
      'Roman general Caesar arrived in Egypt during civil war, allied with Cleopatra against her brother, began a legendary romance, and had a son named Caesarion',
    year: '48-44 BC',
    location: 'Alexandria, Egypt and Rome',
    relationship: 'alliance',
    settings: [
      'Alexandria palace with golden columns and hieroglyphics',
      "Cleopatra's royal barge on the Nile at sunset",
      'Roman Senate with marble columns',
      'Egyptian throne room with incense and servants',
      'Cleopatra arriving rolled in a carpet before Caesar',
    ],
    atmosphere:
      'Political intrigue and passionate alliance - two brilliant rulers joining forces for power and perhaps love',
    keyFacts: [
      'Cleopatra was smuggled to Caesar rolled in a carpet (or linen sack)',
      'Caesar helped Cleopatra defeat her brother Ptolemy XIII',
      'They had a son named Caesarion',
      "Cleopatra visited Rome as Caesar's guest",
      'Caesar was assassinated in 44 BC',
      'Their alliance changed the ancient world',
    ],
    mustInclude: ['Alexandria palace', 'Nile river', 'Roman eagles', 'Egyptian royalty', 'political alliance'],
    mustAvoid: ['Modern elements', 'anachronistic items'],
    narrativeArc:
      'Power meets power - the Roman conqueror and the last Pharaoh forge an alliance that shakes the ancient world',
  },

  // ALEXANDER THE GREAT & DARIUS III - The conquest of Persia
  {
    figures: ['alexander', 'darius'],
    actualEvent:
      'Alexander the Great defeated Persian King Darius III in three major battles (Granicus, Issus, Gaugamela), ending the Achaemenid Empire',
    year: '334-330 BC',
    location: 'Asia Minor, Syria, and Persia',
    relationship: 'war',
    settings: [
      'Battle of Issus with phalanx formations',
      'Gaugamela battlefield at dawn',
      'Persian palace at Persepolis',
      'Darius fleeing in his chariot',
      'Alexander on Bucephalus charging',
    ],
    atmosphere: 'Clash of empires - the young Macedonian prodigy versus the vast Persian Empire',
    keyFacts: [
      'Alexander was only 22 when he began the conquest',
      'Darius fled the battlefield at Issus and Gaugamela',
      "Alexander captured Darius's family and treated them with honor",
      'Darius was killed by his own men, not Alexander',
      "Alexander wept at Darius's death and gave him royal burial",
      'Alexander conquered the largest empire the world had seen',
    ],
    mustInclude: ['Macedonian phalanx', 'Persian cavalry', 'Bucephalus', 'royal chariot', 'empire clashing'],
    mustAvoid: ['Direct combat between the two (they never fought hand-to-hand)'],
    narrativeArc: "Young lion vs ancient empire - Alexander's relentless advance and Darius's desperate flight",
  },

  // LEONIDAS & XERXES - The 300 Spartans at Thermopylae
  {
    figures: ['leonidas', 'xerxes'],
    actualEvent:
      "Spartan King Leonidas led 300 Spartans (plus allies) against Persian King Xerxes's massive army at Thermopylae, sacrificing themselves to delay the invasion",
    year: '480 BC',
    location: 'Thermopylae (The Hot Gates), Greece',
    relationship: 'war',
    settings: [
      'Thermopylae narrow mountain pass',
      'Persian army stretching to the horizon',
      'Spartan phalanx with red cloaks and bronze shields',
      'Hot Gates with cliffs and sea',
      'Final stand on the hillock',
    ],
    atmosphere: 'Defiance and sacrifice - 300 against a million, choosing death over surrender',
    keyFacts: [
      'Leonidas had only 300 Spartans but also ~7000 Greek allies',
      'Xerxes demanded Spartans surrender their weapons',
      'Leonidas replied "Molon labe" (Come and take them)',
      'A traitor showed Persians a mountain path to surround Greeks',
      'Leonidas dismissed allies and stayed with 300 to die',
      'All 300 Spartans were killed but bought time for Greece',
      "Xerxes was so angry he had Leonidas's body beheaded",
    ],
    mustInclude: ['Hot Gates pass', 'red Spartan cloaks', 'bronze aspis shields', 'Persian immortals', 'last stand'],
    mustAvoid: ['Fantasy elements', 'exaggerated monster Persians'],
    narrativeArc: 'Ultimate sacrifice - the few against the many, choosing glory in death over life in chains',
  },

  // SALADIN & RICHARD THE LIONHEART - The Third Crusade
  {
    figures: ['saladin', 'richard'],
    actualEvent:
      'Muslim Sultan Saladin and English King Richard I fought during the Third Crusade, developing mutual respect despite being enemies',
    year: '1189-1192',
    location: 'The Holy Land - Jerusalem, Acre, Jaffa',
    relationship: 'rivalry',
    settings: [
      'Walls of Jerusalem at sunset',
      'Siege of Acre with crusader camps',
      'Desert battlefield with cavalry charges',
      'Diplomatic tent with silk curtains',
      'Jaffa harbor with crusader ships',
    ],
    atmosphere: 'Chivalric rivalry - two noble warriors respecting each other across the battlefield',
    keyFacts: [
      'They never actually met face to face',
      'Saladin sent Richard his personal physician when he was ill',
      'Saladin sent Richard fresh fruits and ice during fever',
      "Richard offered his sister in marriage to Saladin's brother",
      'They negotiated the Treaty of Ramla',
      'Richard never captured Jerusalem',
      'Both were considered the greatest warriors of their age',
    ],
    mustInclude: ['Crusader crosses', 'Islamic crescents', 'desert warfare', 'chivalric honor', 'diplomatic respect'],
    mustAvoid: ['Religious hatred', 'barbarism', 'modern crusade imagery'],
    narrativeArc: "Noble enemies - two kings who fought with honor and earned each other's respect",
  },

  // NAPOLEON & WELLINGTON - Waterloo
  {
    figures: ['napoleon', 'wellington'],
    actualEvent:
      'Napoleon met his final defeat at the Battle of Waterloo against the Duke of Wellington and Prussian forces',
    year: '1815',
    location: 'Waterloo, Belgium',
    relationship: 'war',
    settings: [
      'Waterloo battlefield with rolling hills',
      'La Haye Sainte farmhouse under siege',
      'French cavalry charges against British squares',
      'Sunken road of Ohain',
      'Final French Imperial Guard attack',
    ],
    atmosphere: "The end of an era - Europe's fate decided on a rainy Belgian field",
    keyFacts: [
      'Napoleon had won most of his battles for 20 years',
      'Wellington called it "the nearest-run thing you ever saw"',
      "Rain delayed Napoleon's attack, allowing Prussians to arrive",
      'The Imperial Guard retreated for the first time ever',
      'Napoleon was exiled to St. Helena after defeat',
      'Wellington became a hero and later Prime Minister',
    ],
    mustInclude: ['French eagles', 'British redcoats', 'cavalry charges', 'artillery smoke', 'final stand'],
    mustAvoid: ['Modern warfare elements'],
    narrativeArc: "The eagle falls - Napoleon's last gamble against Wellington's iron defense",
  },

  // HANNIBAL & SCIPIO - The Punic Wars
  {
    figures: ['hannibal', 'scipio'],
    actualEvent:
      'Carthaginian general Hannibal invaded Italy with elephants, but was eventually defeated by Roman general Scipio Africanus at the Battle of Zama',
    year: '218-202 BC',
    location: 'Alps, Italy, and Zama (North Africa)',
    relationship: 'war',
    settings: [
      'Alpine mountain crossing with war elephants',
      "Battle of Cannae - Rome's greatest defeat",
      'Zama battlefield in North Africa',
      'Carthage harbor with purple sails',
      'Italian countryside ablaze',
    ],
    atmosphere: "Genius vs genius - two of history's greatest tacticians in a war for Mediterranean supremacy",
    keyFacts: [
      'Hannibal crossed the Alps with 37 war elephants',
      'He defeated Rome at Cannae, killing 50,000+ Romans in one day',
      'Hannibal stayed in Italy for 15 years without reinforcements',
      'Scipio attacked Carthage directly, forcing Hannibal home',
      'Scipio defeated Hannibal at Zama using his own tactics',
      'Hannibal later poisoned himself rather than be captured',
    ],
    mustInclude: ['War elephants', 'Alpine crossing', 'Carthaginian and Roman armies', 'tactical genius'],
    mustAvoid: ['Anachronistic elements'],
    narrativeArc: "The hunter becomes the hunted - Hannibal's invasion reversed by Scipio's bold counter-invasion",
  },

  // JOAN OF ARC & HENRY VI / ENGLISH FORCES
  {
    figures: ['joan of arc', 'england'],
    actualEvent:
      'French peasant girl Joan of Arc claimed divine visions, led French armies to victories against English occupation, but was captured, tried for heresy, and burned at the stake',
    year: '1429-1431',
    location: 'Orleans, Reims, and Rouen, France',
    relationship: 'war',
    settings: [
      'Siege of Orleans with French banners',
      'Reims Cathedral coronation of Charles VII',
      'Battlefield with Joan in white armor',
      'Trial at Rouen before English judges',
      'Burning at the stake in marketplace',
    ],
    atmosphere: 'Faith against empire - a teenage peasant girl defying the might of England',
    keyFacts: [
      'Joan was only 17 when she began her mission',
      'She claimed visions from Saints Michael, Catherine, and Margaret',
      'She lifted the Siege of Orleans in just 9 days',
      'She led Charles VII to be crowned at Reims',
      'She was captured by Burgundians and sold to England',
      'She was burned as a heretic at age 19',
      'She was made a saint 500 years later',
    ],
    mustInclude: ['White banner with fleur-de-lis', 'Orleans siege', 'divine light', 'French vs English'],
    mustAvoid: ['Excessive violence', 'mocking her faith'],
    narrativeArc: 'Divine mission - from peasant girl to warrior saint, burning bright and brief',
  },

  // SHAKA ZULU & BRITISH EMPIRE
  {
    figures: ['shaka zulu', 'british'],
    actualEvent:
      'Shaka Zulu transformed the Zulu tribe into a military empire, though he died before major British conflicts. His successors fought the Anglo-Zulu War',
    year: '1816-1828 (Shaka), 1879 (Anglo-Zulu War)',
    location: 'KwaZulu-Natal, South Africa',
    relationship: 'war',
    settings: [
      'African savanna at golden hour',
      'Zulu impi formation with cowhide shields',
      'British redcoats in pith helmets',
      'Battle of Isandlwana mountain',
      "Rorke's Drift mission station",
    ],
    atmosphere: 'Traditional warfare meets industrial empire - spears against rifles',
    keyFacts: [
      'Shaka invented the iklwa stabbing spear (replacing throwing spears)',
      'He created the "buffalo horns" battle formation',
      'Shaka built the Zulu nation from a small tribe to an empire',
      'He was assassinated by his half-brothers in 1828',
      'The Zulus defeated British at Isandlwana in 1879',
      'British eventually conquered with superior technology',
    ],
    mustInclude: ['Zulu shields', 'iklwa spears', 'impi formation', 'African landscape'],
    mustAvoid: ['Demeaning stereotypes', 'anachronistic Shaka meeting British (he died before war)'],
    narrativeArc: "Empire builder - Shaka's military genius creating a nation that would challenge colonial powers",
  },

  // GENGHIS KHAN & KUBLAI KHAN (Grandfather & Grandson)
  {
    figures: ['genghis khan', 'kublai khan'],
    actualEvent:
      'Genghis Khan founded the Mongol Empire, and his grandson Kublai Khan expanded it to include China, ruling the largest contiguous land empire in history',
    year: '1162-1227 (Genghis), 1215-1294 (Kublai)',
    location: 'Mongolia and Yuan Dynasty China',
    relationship: 'alliance',
    settings: [
      'Mongolian steppe with yurt camps',
      'Karakorum, the original Mongol capital',
      'Xanadu and Dadu (Beijing) palaces',
      'Silk Road connecting the empires',
    ],
    atmosphere: "Legacy of conquest - grandfather's warrior legacy meets grandson's imperial civilization",
    keyFacts: [
      'Genghis conquered from Korea to Eastern Europe',
      'Kublai completed conquest of China and founded Yuan Dynasty',
      'Kublai tried to invade Japan twice (failed due to typhoons - kamikaze)',
      'Genghis valued loyalty and military prowess',
      'Kublai valued culture, trade, and governance',
      'The empire eventually split into four khanates',
    ],
    mustInclude: ['Mongol horsemen', 'yurts', 'Silk Road', 'conquest legacy'],
    mustAvoid: ["Direct combat between them (they're family)"],
    narrativeArc: 'Dynasty of conquest - the conqueror who built and the emperor who ruled',
  },
];

/**
 * Find a historical encounter between two figures
 * Returns the encounter data if found, or null if no recorded encounter
 */
export function findHistoricalEncounter(figure1: string, figure2: string): HistoricalEncounter | null {
  const f1 = figure1.toLowerCase().trim();
  const f2 = figure2.toLowerCase().trim();

  for (const encounter of HISTORICAL_ENCOUNTERS) {
    const [a, b] = encounter.figures;
    // Check both orderings
    if ((f1.includes(a) || a.includes(f1)) && (f2.includes(b) || b.includes(f2))) {
      return encounter;
    }
    if ((f1.includes(b) || b.includes(f1)) && (f2.includes(a) || a.includes(f2))) {
      return encounter;
    }
  }

  return null;
}

/**
 * Generate historically accurate lyrics guidance for Suno
 * Returns facts and narrative arc that MUST be included
 */
export function getHistoricalLyricsGuidance(
  figure1: string,
  figure2: string,
): {
  mustIncludeFacts: string[];
  narrativeArc: string;
  mustAvoid: string[];
  setting: string;
  relationship: string;
} | null {
  const encounter = findHistoricalEncounter(figure1, figure2);
  if (!encounter) return null;

  return {
    mustIncludeFacts: encounter.keyFacts,
    narrativeArc: encounter.narrativeArc,
    mustAvoid: encounter.mustAvoid,
    setting: encounter.location,
    relationship: encounter.relationship,
  };
}

/**
 * Generate historically accurate VEO setting guidance
 * Returns settings and visual elements that MUST appear
 */
export function getHistoricalVeoGuidance(
  figure1: string,
  figure2: string,
): {
  settings: string[];
  mustInclude: string[];
  mustAvoid: string[];
  atmosphere: string;
  year: string;
} | null {
  const encounter = findHistoricalEncounter(figure1, figure2);
  if (!encounter) return null;

  return {
    settings: encounter.settings,
    mustInclude: encounter.mustInclude,
    mustAvoid: encounter.mustAvoid,
    atmosphere: encounter.atmosphere,
    year: encounter.year,
  };
}

/**
 * Helper function to get historical figure data for a character name
 * Returns canonical description, armor, weapons, and props
 */
export function getHistoricalFigureData(name: string): HistoricalFigureData | null {
  const nameLower = name.toLowerCase().trim();

  // Direct match
  if (HISTORICAL_FIGURES[nameLower]) {
    return HISTORICAL_FIGURES[nameLower];
  }

  // Check aliases
  for (const [key, data] of Object.entries(HISTORICAL_FIGURES)) {
    if (data.aliases?.some((alias) => nameLower.includes(alias) || alias.includes(nameLower))) {
      return data;
    }
    // Also check if the input contains the key
    if (nameLower.includes(key) || key.includes(nameLower)) {
      return data;
    }
  }

  return null;
}

/**
 * Build the strict historical enforcement block for VEO prompts
 * This is added at the END of prompts when isHistoricalBattle=true
 */
export function buildHistoricalEnforcementBlock(
  sideA: { name: string; data: HistoricalFigureData | null },
  sideB: { name: string; data: HistoricalFigureData | null },
): string {
  const sideADesc = sideA.data
    ? `${sideA.name}: ${sideA.data.canonicalDescription}. Wearing: ${sideA.data.armor}. Armed with: ${sideA.data.weapons}.`
    : `${sideA.name}: Historical figure in period-accurate attire`;

  const sideBDesc = sideB.data
    ? `${sideB.name}: ${sideB.data.canonicalDescription}. Wearing: ${sideB.data.armor}. Armed with: ${sideB.data.weapons}.`
    : `${sideB.name}: Historical figure in period-accurate attire`;

  const sideASettings = sideA.data?.settings?.slice(0, 3).join(', ') || 'historical palace, ancient battlefield';
  const sideBSettings = sideB.data?.settings?.slice(0, 3).join(', ') || 'period-accurate location';
  const sideAProps = sideA.data?.props?.slice(0, 4).join(', ') || 'historical artifacts';
  const sideBProps = sideB.data?.props?.slice(0, 4).join(', ') || 'period weapons and items';

  return `

═══════════════════════════════════════════════════════════════
🏛️🏛️🏛️ STRICT HISTORICAL MODE - MANDATORY COMPLIANCE 🏛️🏛️🏛️
═══════════════════════════════════════════════════════════════

📜 CANONICAL CHARACTER DESCRIPTIONS (USE EXACTLY AS WRITTEN):

${sideADesc}
${sideBDesc}

📍 REQUIRED HISTORICAL SETTINGS (choose from these):
- ${sideASettings}
- ${sideBSettings}

🎭 REQUIRED HISTORICAL PROPS:
- ${sideAProps}
- ${sideBProps}

🚫 ABSOLUTELY FORBIDDEN - DO NOT INCLUDE:
❌ Modern clothing: ${HISTORICAL_MODE_BANS.clothing.slice(0, 6).join(', ')}
❌ DIY materials: ${HISTORICAL_MODE_BANS.materials.slice(0, 6).join(', ')}
❌ Modern settings: ${HISTORICAL_MODE_BANS.settings.slice(0, 6).join(', ')}
❌ Modern aesthetics: ${HISTORICAL_MODE_BANS.aesthetics.slice(0, 4).join(', ')}
❌ Food imagery: ${HISTORICAL_MODE_BANS.food.slice(0, 5).join(', ')}
❌ Modern weapons: ${HISTORICAL_MODE_BANS.weapons.slice(0, 4).join(', ')}
❌ Generic "warriors" or "fighters" - USE THE ACTUAL NAMED FIGURES ABOVE

✅ REQUIRED FOR HISTORICAL ACCURACY:
✅ Period-accurate armor and weapons as described above
✅ Era-appropriate settings (palaces, steppes, temples, battlefields)
✅ Historical props (silk banners, trade goods, period weapons)
✅ Cinematic camera work (crane shots, dolly moves, NOT handheld)
✅ Epic lighting (golden hour, torchlight, rim lighting)

📹 CAMERA STYLE: ${HISTORICAL_STYLE_OVERRIDES.cameraModifiers.slice(0, 3).join(', ')}
💡 LIGHTING STYLE: ${HISTORICAL_STYLE_OVERRIDES.lightingModifiers.slice(0, 3).join(', ')}

This is an EDUCATIONAL HISTORICAL video. Accuracy is MANDATORY.
═══════════════════════════════════════════════════════════════
`;
}

/**
 * Extract the two sides from a "vs" battle topic
 * Handles formats: "X vs Y", "X vs. Y", "X versus Y", etc.
 */
export function extractVsSides(topic: string): { sideA: string; sideB: string } | null {
  // Match various "vs" formats (case-insensitive)
  const vsRegex = /\s+(vs\.?|versus)\s+/i;
  const match = topic.match(vsRegex);

  if (!match) return null;

  const parts = topic.split(vsRegex);

  if (parts.length < 3) return null;

  // parts[0] = sideA, parts[1] = "vs" or "versus", parts[2] = sideB
  const sideA = parts[0].trim();
  const sideB = parts[2].trim();

  if (!sideA || !sideB) return null;

  return { sideA, sideB };
}

/**
 * Check if a topic is a creature vs creature battle
 */
export function isCreatureVsCreature(topic: string): boolean {
  const sides = extractVsSides(topic);
  if (!sides) return false;

  const sideALower = sides.sideA.toLowerCase();
  const sideBLower = sides.sideB.toLowerCase();

  const sideAIsCreature = CREATURE_TYPES.some((c) => sideALower.includes(c));
  const sideBIsCreature = CREATURE_TYPES.some((c) => sideBLower.includes(c));

  return sideAIsCreature && sideBIsCreature;
}

/**
 * Check if a topic is a food vs food battle
 */
export function isFoodVsFood(topic: string): boolean {
  const sides = extractVsSides(topic);
  if (!sides) return false;

  const sideALower = sides.sideA.toLowerCase();
  const sideBLower = sides.sideB.toLowerCase();

  const sideAIsFood = FOOD_TYPES.some((f) => sideALower.includes(f));
  const sideBIsFood = FOOD_TYPES.some((f) => sideBLower.includes(f));

  return sideAIsFood && sideBIsFood;
}

/**
 * Check if a side matches a historical figure
 * Uses multiple matching strategies for robust detection:
 * 1. Direct exact match
 * 2. Alias matching (e.g., "Washington" → "george washington")
 * 3. Title matching (e.g., "Maid of Orleans" → "joan of arc")
 * 4. Partial name matching (e.g., "Genghis" → "genghis khan")
 * 5. Fuzzy matching for common variants (handles typos, partial names)
 */
export function matchHistoricalFigure(side: string): { key: string; data: (typeof HISTORICAL_FIGURES)[string] } | null {
  const sideLower = side.toLowerCase().trim();

  // Remove common prefixes/suffixes for better matching
  const cleanedSide = sideLower
    .replace(/^(the |king |queen |emperor |general |lord |sir |pharaoh |sultan |shogun )/i, '')
    .replace(/( the great| i| ii| iii)$/i, '')
    .trim();

  // 1. Direct exact match on canonical key
  if (HISTORICAL_FIGURES[sideLower]) {
    return { key: sideLower, data: HISTORICAL_FIGURES[sideLower] };
  }
  if (HISTORICAL_FIGURES[cleanedSide]) {
    return { key: cleanedSide, data: HISTORICAL_FIGURES[cleanedSide] };
  }

  // 2. Alias matching - check all aliases for each figure
  for (const [key, data] of Object.entries(HISTORICAL_FIGURES)) {
    if (data.aliases) {
      for (const alias of data.aliases) {
        const aliasLower = alias.toLowerCase();
        // Check exact alias match
        if (sideLower === aliasLower || cleanedSide === aliasLower) {
          return { key, data };
        }
        // Check if alias appears in the side or vice versa
        if (sideLower.includes(aliasLower) || aliasLower.includes(cleanedSide)) {
          return { key, data };
        }
      }
    }
  }

  // 3. Title matching - check against the title field
  for (const [key, data] of Object.entries(HISTORICAL_FIGURES)) {
    const titleLower = data.title.toLowerCase();
    // Check if title words appear in the side
    const titleWords = titleLower.split(' ').filter((w) => w.length > 3);
    if (titleWords.some((word) => sideLower.includes(word) && word !== 'the')) {
      return { key, data };
    }
  }

  // 4. Partial name matching (e.g., "Genghis" matches "genghis khan")
  for (const [key, data] of Object.entries(HISTORICAL_FIGURES)) {
    const keyParts = key.split(' ');
    // Check if any significant part (length > 3) of the canonical name matches
    if (
      keyParts.some((part) => {
        if (part.length <= 3) return false; // Skip short words like "the", "of"
        return sideLower.includes(part) || cleanedSide.includes(part) || part.includes(cleanedSide);
      })
    ) {
      return { key, data };
    }
  }

  // 5. Fuzzy matching for common misspellings and variants
  const fuzzyMatches: Record<string, string> = {
    gengis: 'genghis khan',
    ghengis: 'genghis khan',
    'ghengis khan': 'genghis khan',
    cesare: 'julius caesar',
    cesar: 'julius caesar',
    ceaser: 'julius caesar',
    napolean: 'napoleon bonaparte',
    napoleone: 'napoleon bonaparte',
    cleaopatra: 'cleopatra',
    kleopatra: 'cleopatra',
    alexandre: 'alexander the great',
    aleksander: 'alexander the great',
    'alexander great': 'alexander the great',
    'da vinci': 'leonardo da vinci',
    davinci: 'leonardo da vinci',
    vinci: 'leonardo da vinci',
    ramesses: 'ramses',
    rameses: 'ramses',
    'viking warriors': 'viking',
    vikings: 'viking',
    samurais: 'samurai',
    'samurai warrior': 'samurai',
    spartan: 'spartans',
    'spartan warriors': 'spartans',
    '300 spartans': 'spartans',
    'joan arc': 'joan of arc',
    joandarc: 'joan of arc',
    'salah din': 'saladin',
    salahadin: 'saladin',
    tokugawa: 'tokugawa ieyasu',
    ieyasu: 'tokugawa ieyasu',
    'william conqueror': 'william the conqueror',
    'william 1': 'william the conqueror',
    shaka: 'shaka zulu',
    zulu: 'shaka zulu',
    'zulu king': 'shaka zulu',
  };

  // Check fuzzy matches
  for (const [variant, canonical] of Object.entries(fuzzyMatches)) {
    if (sideLower.includes(variant) || variant.includes(cleanedSide)) {
      if (HISTORICAL_FIGURES[canonical]) {
        return { key: canonical, data: HISTORICAL_FIGURES[canonical] };
      }
    }
  }

  return null;
}

/**
 * Check if a topic is a historical figure vs historical figure battle
 * At least one side must be a known historical figure
 */
export function isHistoricalVsHistorical(topic: string): boolean {
  const sides = extractVsSides(topic);
  if (!sides) return false;

  const sideAMatch = matchHistoricalFigure(sides.sideA);
  const sideBMatch = matchHistoricalFigure(sides.sideB);

  // At least one side must be a historical figure
  // This allows "Genghis Khan vs Marco Polo" as well as "Edison vs Modern Tech"
  return sideAMatch !== null || sideBMatch !== null;
}

/**
 * Get historical figure data for both sides of a battle
 */
export function getHistoricalBattleData(topic: string): {
  sideA: { key: string; data: (typeof HISTORICAL_FIGURES)[string] } | null;
  sideB: { key: string; data: (typeof HISTORICAL_FIGURES)[string] } | null;
  isHistorical: boolean;
} {
  const sides = extractVsSides(topic);
  if (!sides) return { sideA: null, sideB: null, isHistorical: false };

  const sideA = matchHistoricalFigure(sides.sideA);
  const sideB = matchHistoricalFigure(sides.sideB);

  return {
    sideA,
    sideB,
    isHistorical: sideA !== null || sideB !== null,
  };
}

/**
 * Get visual elements for a historical battle
 * Merges specific figure theming with generic historical elements
 */
export function getHistoricalVisualElements(topic: string): {
  tradeGoods: string[];
  settings: string[];
  epicMoments: string[];
  combatActions: string[];
} {
  const { sideA, sideB } = getHistoricalBattleData(topic);

  const tradeGoods = new Set<string>(HISTORICAL_VISUAL_ELEMENTS.tradeGoods);
  const settings = new Set<string>();

  // Add side-specific trade goods and settings
  if (sideA?.data) {
    sideA.data.tradeGoods.forEach((g) => tradeGoods.add(g));
    sideA.data.settings.forEach((s) => settings.add(s));
  }
  if (sideB?.data) {
    sideB.data.tradeGoods.forEach((g) => tradeGoods.add(g));
    sideB.data.settings.forEach((s) => settings.add(s));
  }

  // Add generic historical settings if we have fewer than 4
  if (settings.size < 4) {
    ['ancient battleground', 'torch-lit arena', 'grand palace courtyard', 'windswept plains'].forEach((s) =>
      settings.add(s),
    );
  }

  return {
    tradeGoods: Array.from(tradeGoods),
    settings: Array.from(settings),
    epicMoments: HISTORICAL_VISUAL_ELEMENTS.epicMoments,
    combatActions: HISTORICAL_VISUAL_ELEMENTS.combatActions,
  };
}

/**
 * Get the spirit animal for a food type
 * Returns a default panda if food not in mapping
 */
export function getFoodSpiritAnimal(food: string): { animal: string; title: string } {
  const foodLower = food.toLowerCase();

  for (const [key, value] of Object.entries(FOOD_SPIRIT_ANIMALS)) {
    if (foodLower.includes(key)) {
      return value;
    }
  }

  // Default to panda for unknown foods
  return {
    animal: 'panda',
    title: `The ${food.charAt(0).toUpperCase() + food.slice(1)} Panda Paladin`,
  };
}

/**
 * Apply style preset modifiers to a VEO prompt
 */
export function applyStylePresetToPrompt(basePrompt: string, presetKey: StylePresetKey, sectionType?: string): string {
  const preset = getStylePreset(presetKey);

  // Filter out avoided words
  let modifiedPrompt = basePrompt;
  for (const word of preset.avoidWords) {
    const regex = new RegExp(word, 'gi');
    modifiedPrompt = modifiedPrompt.replace(regex, '');
  }

  // Add style modifiers
  const styleInjection = [
    preset.cameraModifiers[Math.floor(Math.random() * preset.cameraModifiers.length)],
    preset.lightingModifiers[Math.floor(Math.random() * preset.lightingModifiers.length)],
    preset.colorGradeModifiers[Math.floor(Math.random() * preset.colorGradeModifiers.length)],
  ]
    .filter(Boolean)
    .join(', ');

  // Add section-specific override if available
  const sectionKey = sectionType?.toLowerCase().replace(/[^a-z]/g, '') || '';
  const sectionOverride = preset.sectionOverrides[sectionKey] || '';

  // Add food emphasis for Comedy/Meme mode
  const foodEmphasis = preset.foodProminence >= 0.7 ? `${preset.foodStyle}. ` : '';

  // Construct final prompt
  const finalPrompt = [modifiedPrompt, styleInjection, foodEmphasis, sectionOverride]
    .filter(Boolean)
    .join('. ')
    .replace(/\.\./g, '.');

  return finalPrompt;
}

/**
 * File Path Configuration
 * Scratch files go to data/temp/processing/ (within project, gitignored)
 * Final outputs go to data/videos/
 */
export const PATH_CONFIG = {
  TEMP_DIR: join(process.cwd(), 'data', 'temp', 'processing'),
  OUTPUT_DIR: 'outputs',
  UPLOAD_DIR: 'uploads',
} as const;

/**
 * Get the correct temp directory path
 * Since TEMP_DIR is now absolute, we don't join with process.cwd()
 */
export function getTempPath(...segments: string[]): string {
  const path = require('path');
  const fs = require('fs');
  const fullPath = path.join(PATH_CONFIG.TEMP_DIR, ...segments);

  // Ensure directory exists
  const dir = segments.length > 0 && !segments[segments.length - 1].includes('.') ? fullPath : path.dirname(fullPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // Ignore if already exists
  }
  return fullPath;
}

/**
 * Helper function to get dimensions for aspect ratio
 */
export function getDimensionsForAspectRatio(aspectRatio: '16:9' | '9:16' | '4:3'): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return VIDEO_FORMATS.PORTRAIT_9_16;
    case '4:3':
      return VIDEO_FORMATS.TABLET_4_3_LANDSCAPE;
    case '16:9':
    default:
      return VIDEO_FORMATS.LANDSCAPE_16_9;
  }
}

/**
 * Helper to calculate estimated cost for a generation mode
 */
export function estimateGenerationCost(mode: 'veo' | 'consistent', clipCount: number): number {
  if (mode === 'veo') {
    return clipCount * VEO_CONFIG.COST_PER_CLIP;
  } else {
    const perClip =
      CONSISTENT_CHARACTER_CONFIG.COSTS.IP_ADAPTER_PER_IMAGE +
      CONSISTENT_CHARACTER_CONFIG.COSTS.LUMA_RAY_REPLICATE_PER_VIDEO;
    return clipCount * perClip;
  }
}

// ============================================
// LIBROSA → VEO PROMPT MAPPINGS
// These make audio analysis DIRECTLY control video output
// ============================================

// Energy level (0-1) → Camera, Action, Lighting keywords
export const ENERGY_TO_KEYWORDS = {
  low: {
    // 0.0 - 0.3
    camera: 'slow push-in, gentle steadicam, static wide shot',
    action: 'subtle movement, calm, contemplative',
    lighting: 'soft, diffused, intimate',
    pacing: '6-8 second shots, slow dissolves',
  },
  medium: {
    // 0.3 - 0.6
    camera: 'tracking shot, smooth dolly, medium pace',
    action: 'walking, gesturing, conversational',
    lighting: 'balanced, natural, warm',
    pacing: '4-6 second shots, smooth cuts',
  },
  high: {
    // 0.6 - 0.85
    camera: 'dynamic tracking, crane shot, energetic handheld',
    action: 'running, jumping, dramatic gesture, intense expression',
    lighting: 'dramatic, high contrast, bold shadows',
    pacing: '2-4 second shots, quick cuts',
  },
  peak: {
    // 0.85 - 1.0
    camera: 'whip pan, crash zoom, chaotic handheld',
    action: 'explosive, maximum intensity, epic pose, battle climax',
    lighting: 'intense strobing, dramatic rim lighting',
    pacing: '1-2 second shots, rapid fire cuts',
  },
} as const;

// Section type → Shot style and purpose
export const SECTION_TEMPLATES = {
  intro: {
    shotType: 'wide establishing shot, slow reveal',
    pace: 'contemplative, building anticipation',
    purpose: 'set the scene, introduce world and characters',
    cameraMove: 'slow push-in or crane down',
  },
  verse: {
    shotType: 'medium shot, close-up conversation',
    pace: 'steady, storytelling rhythm',
    purpose: 'character development, narrative exposition',
    cameraMove: 'subtle tracking, rack focus',
  },
  'pre-chorus': {
    shotType: 'tightening shots, building tension',
    pace: 'accelerating, anticipation building',
    purpose: 'tension build before payoff',
    cameraMove: 'push-in, rising crane',
  },
  chorus: {
    shotType: 'wide epic shot, hero pose, maximum visual impact',
    pace: 'fast cuts, dynamic movement, peak energy',
    purpose: 'payoff moment, memorable visuals, hook',
    cameraMove: 'crane, whip pan, crash zoom',
  },
  bridge: {
    shotType: 'extreme close-up, unusual angle, intimate',
    pace: 'slow, reflective, vulnerable',
    purpose: 'emotional pivot, twist, change of perspective',
    cameraMove: 'static or very slow drift',
  },
  outro: {
    shotType: 'wide pull-back, group shot, resolution',
    pace: 'slowing down, resolving, final statement',
    purpose: 'conclusion, unity, lasting image',
    cameraMove: 'slow pull-back, crane up',
  },
} as const;

// Musical key/mode → Color palette
export const KEY_TO_COLORS = {
  major: 'warm golden tones, vibrant saturated colors, bright hopeful lighting',
  minor: 'cool blue tones, muted desaturated colors, moody atmospheric lighting',
  diminished: 'dark shadows, desaturated greens and grays, tense unsettling atmosphere',
} as const;

// Spectral brightness → Lighting style
export const BRIGHTNESS_TO_LIGHTING = {
  bright: 'high-key lighting, vibrant colors, sun-drenched', // centroid > 3000
  balanced: 'natural balanced lighting, true-to-life colors', // centroid 2000-3000
  moody: 'moody atmospheric lighting, shadows and highlights', // centroid 1000-2000
  dark: 'low-key lighting, deep shadows, noir aesthetic', // centroid < 1000
} as const;

/**
 * Brutal Shorts Critic Configuration
 * Controls the pre-posting evaluation system for YouTube Shorts
 */
export const SHORTS_CRITIC_CONFIG = {
  // Weights (must sum to 1.0)
  weights: {
    swiper: 0.3, // First 2 seconds grab
    impatientViewer: 0.25, // Completion probability
    loopDetector: 0.15, // Replay potential
    syncCritic: 0.15, // Audio-visual sync
    clarityJudge: 0.1, // Hook clarity
    lengthOptimizer: 0.05, // Length (<45 sec sweet spot)
  },

  // Thresholds
  thresholds: {
    ship: 85,
    minorFixes: 70,
    needsWork: 55,
    kill: 0,
  },

  // Kill conditions
  autoReject: {
    maxDuration: 60, // seconds
    minSceneChanges: 1, // in first 5 seconds
    minSyncScore: 10, // out of 20
    minPersonaScore: 8, // out of 20
    blackFrameThreshold: 30, // brightness
    fadeThreshold: 50, // brightness
  },

  // Sync analysis
  sync: {
    tolerance: 0.2, // seconds
    minAlignmentRatio: 0.5, // 50% of cuts should align with beats
  },
} as const;
