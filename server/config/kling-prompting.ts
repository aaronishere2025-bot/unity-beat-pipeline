/**
 * Kling 2.5 Prompting Configuration
 *
 * Optimized for Kling's Diffusion Transformer (DiT) architecture
 * - First 50 tokens weighted heavily
 * - 6-Element prompt structure
 * - Professional cinematography vocabulary
 * - Negative prompts for anti-hallucination
 */

export const KLING_25_CONFIG = {
  MAX_PROMPT_TOKENS: 200,
  PRIORITY_TOKENS: 50,

  CAMERA_MOVEMENTS: {
    dolly_zoom: 'smooth dolly zoom with subtle background compression',
    tracking_shot: 'slow tracking shot following subject',
    arc_shot: 'smooth arc shot circling the subject',
    boom_down: 'dramatic boom down revealing the scene',
    crane_up: 'majestic crane shot rising upward',
    push_in: 'slow push in on subject face',
    pull_back: 'gradual pull back revealing context',
    handheld: 'subtle handheld movement with natural jitter',
    steadicam: 'fluid steadicam following movement',
    dutch_angle: 'slight dutch angle for tension',
    static: 'locked static shot with subtle atmosphere motion',
    pan_left: 'slow deliberate pan left across scene',
    pan_right: 'slow deliberate pan right across scene',
    tilt_up: 'reverent tilt up revealing full figure',
    tilt_down: 'dramatic tilt down to ground level',
  },

  SHOT_TYPES: {
    extreme_close_up: 'extreme close-up on eyes',
    close_up: 'tight close-up on face',
    medium_close_up: 'medium close-up chest up',
    medium_shot: 'medium shot waist up',
    medium_wide: 'medium wide shot showing environment',
    wide_shot: 'wide establishing shot',
    extreme_wide: 'extreme wide epic vista',
    over_shoulder: 'over-the-shoulder perspective',
    pov: 'first-person POV shot',
    low_angle: 'low angle looking up heroically',
    high_angle: 'high angle looking down',
    eye_level: 'eye-level intimate framing',
  },

  LIGHTING_STYLES: {
    golden_hour: 'warm golden hour sunlight with long shadows',
    blue_hour: 'cool blue hour twilight atmosphere',
    harsh_daylight: 'harsh midday sun with deep shadows',
    overcast: 'soft diffused overcast lighting',
    candlelight: 'warm flickering candlelight',
    firelight: 'dramatic orange firelight with dancing shadows',
    moonlight: 'cool silvery moonlight',
    torchlight: 'warm torch flames illuminating',
    rim_light: 'dramatic rim lighting from behind',
    chiaroscuro: 'dramatic chiaroscuro high contrast',
    natural: 'natural ambient period lighting',
  },

  PHYSICS_KEYWORDS: {
    fabric: 'realistic fabric physics with natural draping',
    hair: 'hair flowing with wind physics',
    cape: 'cape billowing with cloth simulation',
    dust: 'dust particles catching light',
    smoke: 'volumetric smoke rising naturally',
    fire: 'realistic fire with heat distortion',
    water: 'water droplets with surface tension',
    wind: 'environmental wind affecting all elements',
    breath: 'visible breath in cold air',
    shadow: 'dynamic shadows following movement',
  },

  MICRO_EXPRESSION_KEYWORDS: [
    'subtle eye movement',
    'slight blink',
    'micro-expression shift',
    'contemplative gaze',
    'moment of realization',
    'subtle lip movement',
    'knowing glance',
    'determined squint',
    'slight nostril flare',
    'brow furrow',
  ],
};

export const KLING_25_NEGATIVE_PROMPTS = {
  GLOBAL: [
    'no morphing',
    'no extra limbs',
    'no flickering',
    'no low-resolution textures',
    'no modern objects',
    'no cartoonish lighting',
    'no stagnant movement',
    'no distorted faces',
    'no melting features',
    'no temporal artifacts',
  ],

  HISTORICAL: [
    'no wristwatches',
    'no eyeglasses',
    'no zippers',
    'no plastic materials',
    'no modern architecture',
    'no electrical lights',
    'no contemporary clothing',
    'no digital screens',
    'no modern vehicles',
    'no anachronistic items',
  ],

  QUALITY: [
    'no blurry frames',
    'no jpeg artifacts',
    'no watermarks',
    'no text overlays',
    'no split screens',
    'no collage layouts',
  ],
};

export const KLING_25_SCORING_WEIGHTS = {
  microExpressions: 0.25,
  physicsRealism: 0.2,
  cameraIntent: 0.25,
  temporalStability: 0.3,
};

export const KLING_25_FEEDBACK_CORRECTIONS: Record<string, (prompt: string) => string> = {
  anachronism: (prompt) => `Strict historical accuracy, absolutely NO modern items. ${prompt}`,

  stiff: (prompt) => `${prompt}, fluid character movement, natural body language, swaying fabric, realistic physics`,

  camera: (prompt) => `Slow cinematic tracking shot, ${prompt}, subtle handheld jitter, shallow depth of field`,

  morphing: (prompt) =>
    `${prompt}. CRITICAL: Maintain consistent character features throughout, no morphing, stable anatomy`,

  lighting: (prompt) =>
    `${prompt}, consistent volumetric lighting, natural shadow movement, period-appropriate light sources`,

  expression: (prompt) => `${prompt}, subtle micro-expressions, natural eye movement, lifelike facial acting`,

  physics: (prompt) => `${prompt}, realistic cloth physics, natural hair movement, environmental particle effects`,

  continuity: (prompt) =>
    `Maintain visual continuity with previous scene. ${prompt}, consistent character appearance and setting`,
};

export function buildKling25NegativePrompt(feedbackIssues: string[] = []): string {
  const negatives = [...KLING_25_NEGATIVE_PROMPTS.GLOBAL];

  if (feedbackIssues.some((f) => f.toLowerCase().includes('anachronism') || f.toLowerCase().includes('modern'))) {
    negatives.push(...KLING_25_NEGATIVE_PROMPTS.HISTORICAL);
  }

  negatives.push(...KLING_25_NEGATIVE_PROMPTS.QUALITY);

  return negatives.join(', ');
}

export function assembleKling25Prompt(elements: {
  cameraMovement: string;
  shotType: string;
  subjectAction: string;
  environmentLighting: string;
  styleMood: string;
  physicsDetails: string;
}): string {
  return [
    elements.cameraMovement,
    elements.shotType,
    elements.subjectAction,
    elements.environmentLighting,
    elements.styleMood,
    elements.physicsDetails,
  ]
    .filter(Boolean)
    .join(', ');
}
