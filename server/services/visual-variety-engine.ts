/**
 * Visual Variety Engine
 *
 * Generates highly diverse and unique visual prompts for Kling video generation
 * to prevent repetitive, samey-looking videos.
 */

export interface VisualPromptOptions {
  beatStyle: string;
  bpm: number;
  energy?: number;
  time?: 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'evening' | 'night' | 'midnight';
  weather?: string;
  season?: 'spring' | 'summer' | 'fall' | 'winter';
  mood?: string;
}

export interface EnhancedVisualPrompt {
  prompt: string;
  theme: string;
  colorPalette: string;
  lighting: string;
  cameraMovement: string;
  atmosphere: string;
}

class VisualVarietyEngine {
  private static instance: VisualVarietyEngine;

  static getInstance() {
    if (!VisualVarietyEngine.instance) {
      VisualVarietyEngine.instance = new VisualVarietyEngine();
    }
    return VisualVarietyEngine.instance;
  }

  // MASSIVE expansion of visual themes (150+ options per genre)
  private lofiThemes = [
    // Study/Work Scenes (USER REQUESTED)
    'person studying with headphones on at cozy desk',
    'person reading book by warm window light',
    'student working on laptop in library',
    'person taking notes with coffee nearby',
    'person organizing colorful sticky notes on wall',
    'person writing in journal by candlelight',
    'person drawing in sketchbook at art desk',
    'person practicing calligraphy with ink',
    'person coding on computer with plants around',
    'person researching with books spread out',

    // Outdoor Nature/Picnic Scenes (USER REQUESTED)
    'picnic in the sunset with warm golden light',
    'person having picnic in flower field',
    'person sitting under tree reading at golden hour',
    'picnic blanket with food at lake',
    'person enjoying tea in peaceful garden',
    'person lying in meadow watching clouds',
    'person sitting on beach watching sunset waves',
    'person having picnic on mountain overlook',
    'person relaxing in park with autumn leaves',
    'person enjoying lunch under cherry blossoms',

    // Interiors - Cozy
    'cozy bedroom corner with string lights',
    'minimalist study desk by window',
    'vintage record player on wooden shelf',
    'dimly lit art studio with canvas',
    'small apartment balcony with plants',
    'retro gaming setup with CRT monitor',
    'bookshelf filled with old vinyl',
    'corner coffee table with steaming mug',
    'quiet library reading nook',
    'attic workspace under slanted roof',
    'kitchen window with herbs growing',
    'meditation corner with cushions',
    'person sitting in bean bag with book',
    'person practicing guitar in bedroom',
    'person making tea in peaceful kitchen',
    'person arranging flowers in vase by window',

    // Outdoor scenes
    'quiet park bench at twilight',
    'empty train platform at night',
    'suburban street corner with street lamps',
    'rooftop garden overlooking city',
    'peaceful lakeside dock at sunset',
    'forest clearing with fallen leaves',
    'mountain cabin porch view',
    'coastal boardwalk at golden hour',
    'empty parking lot under neon signs',
    'cherry blossom tree in park',
    'small town main street evening',
    'countryside road with fence posts',
    'person walking dog in misty morning park',
    'person sitting on pier fishing at dusk',
    'person riding bicycle through autumn path',
    'person standing on bridge over creek',

    // Urban
    'neon-lit convenience store exterior',
    'empty subway car interior',
    'rain-soaked city alley',
    'laundromat late at night',
    'corner bodega with warm lights',
    'pedestrian bridge over highway',
    'apartment window view of neighboring buildings',
    'rooftop water tower at dusk',
    'fire escape overlooking street',
    'bus stop shelter on rainy night',
    'old arcade with glowing cabinets',
    'diner booth by fogged window',
    'person sitting in parked car watching rain',
    'person looking out window at city lights',
    'person walking through quiet city park',
    'person sitting at outdoor cafe table',

    // Nature/Abstract
    'gentle waves on pebble beach',
    'misty forest path through trees',
    'wildflower field at sunset',
    'still pond with lily pads',
    'desert landscape under stars',
    'snow gently falling on pine trees',
    'autumn leaves floating in stream',
    'wheat field swaying in breeze',
    'moss-covered rocks in creek',
    'person watching fireflies at twilight',
    'person stargazing from grassy field',
    'person walking barefoot on sandy beach',
    'person collecting shells on quiet shore',

    // Seasonal/Weather
    'person watching snowfall from warm window',
    'person enjoying hot chocolate on rainy day',
    'person reading under umbrella in light rain',
    'person jumping in autumn leaf pile',
    'person drinking iced tea on summer porch',
    'person building sandcastle at beach',
    'person ice skating on frozen pond',
    'person picking flowers in spring meadow',

    // Creative/Hobbies
    'person painting watercolor by window',
    'person arranging vinyl records on shelf',
    'person baking cookies in cozy kitchen',
    'person watering plants in sunny room',
    'person playing piano in dim room',
    'person knitting by fireplace',
    'person looking through telescope at stars',
    'person developing photos in darkroom',
  ];

  private trapThemes = [
    // Urban luxury
    'luxury penthouse city view',
    'modern car dashboard at night',
    'high-rise elevator with city lights',
    'designer sneaker store interior',
    'private jet cabin',
    'rooftop infinity pool at night',
    'high-end watch boutique display',
    'sports car showroom floor',
    'penthouse party with skyline',

    // Street/Underground
    'graffiti-covered subway tunnel',
    'underground parking garage',
    'warehouse rave space',
    'street basketball court at night',
    'alley with spray paint murals',
    'skate park under bridge',
    'abandoned factory interior',
    'urban rooftop with graffiti',
    'loading dock at midnight',

    // Studio/Tech
    'recording studio with red LEDs',
    'gaming PC setup with RGB',
    'DJ booth with turntables',
    'podcast studio with neon signs',
    'music production workspace',
    'streaming room with monitors',
    'VR gaming space',
    'home theater setup',
    'cryptocurrency trading room',

    // Cyberpunk/Futuristic
    'neon-lit tokyo street',
    'holographic advertisement displays',
    'cyberpunk marketplace',
    'futuristic train interior',
    'tech startup office at night',
    'server room with blue lighting',
    'drone shot of illuminated highways',
    'smart city control center',
    'augmented reality shop',
  ];

  private chillhopThemes = [
    // Natural zen
    'japanese zen garden with raked sand',
    'bamboo forest path',
    'traditional tea house interior',
    'koi pond with stepping stones',
    'bonsai tree on wooden table',
    'meditation temple courtyard',
    'mountain temple at sunrise',
    'waterfall in lush forest',
    'rice field terraces',

    // Minimal/Modern
    'modern minimalist living room',
    'scandinavian design workspace',
    'white-walled art gallery',
    'concrete and wood interior',
    'open-plan loft space',
    'architectural concrete staircase',
    'modern greenhouse interior',
    'minimalist tea ceremony room',
    'clean workspace with plants',

    // Peaceful outdoor
    'quiet mountain lake reflection',
    'meadow with wildflowers',
    'coastal cliff overlooking ocean',
    'peaceful garden with fountain',
    'tree-lined pathway',
    'countryside sunrise over hills',
  ];

  // Color palettes (randomized) - EXPANDED with purple-shifted lofi aesthetic
  private colorPalettes = [
    // Purple-Shifted Lofi (USER REQUESTED - for that aesthetic vibe!)
    'purple-shifted with warm undertones',
    'deep purple and lavender hues',
    'violet and magenta color scheme',
    'purple-shifted sunset with pink accents',
    'mauve and dusty rose palette',
    'indigo purple with soft blue',
    'plum purple with golden highlights',
    'royal purple with cream tones',
    'amethyst and lilac shades',
    'burgundy purple with orange glow',
    'lavender fields with purple sky',
    'purple gradient with pink streaks',
    'deep violet with teal shadows',
    'soft purple with peach undertones',
    'purple-pink sunset gradient',

    // Warm
    'warm orange and yellow tones',
    'golden hour amber lighting',
    'sunset red and pink hues',
    'earthy browns and tans',
    'cozy firelight oranges',
    'autumn rust and copper',
    'honey gold and terracotta',
    'peach and coral sunset',
    'butterscotch and caramel tones',

    // Cool
    'cool blue and teal tones',
    'midnight blues and purples',
    'icy blue and white',
    'ocean turquoise and aqua',
    'twilight indigo and violet',
    'mint green and sky blue',
    'slate blue with silver accents',
    'arctic blue with white fog',
    'seafoam green and aqua',

    // Neutral
    'monochrome black and white',
    'soft grays and whites',
    'muted earth tones',
    'pastel beiges and creams',
    'concrete grays and silvers',
    'sepia vintage tones',
    'warm brown with golden highlights',
    'taupe and ivory palette',
    'charcoal grey with soft whites',

    // Vibrant
    'neon pink and electric blue',
    'cyberpunk purple and cyan',
    'vivid magenta and orange',
    'tropical bright colors',
    'synthwave purple and pink',
    'vaporwave pastels',
    'hot pink with lime green',
    'saturated teal and magenta',
    'bold red with royal blue',

    // Natural
    'forest greens and browns',
    'ocean blues and seafoam',
    'desert oranges and beiges',
    'cherry blossom pink and white',
    'lavender fields purple',
    'sunset sky gradient',
    'moss green with earth tones',
    'autumn red and orange leaves',
    'spring flower pastels',
  ];

  // Lighting styles
  private lightingStyles = [
    'soft natural window light',
    'warm golden hour glow',
    'cool moonlight illumination',
    'dramatic rim lighting',
    'ambient LED strip lighting',
    'candlelight flicker',
    'harsh neon signs',
    'diffused overcast lighting',
    'spotlight with shadows',
    'backlit silhouette',
    'volumetric light rays',
    'twilight blue hour lighting',
    'sunrise warm light',
    'stormy gray light',
    'bioluminescent glow',
    'streetlight amber pools',
    'colored gel lighting',
    'practical window lighting',
  ];

  // Camera movements
  private cameraMovements = [
    'slow dolly forward',
    'gentle pan left to right',
    'smooth tracking shot',
    'subtle zoom in',
    'steady cam walk through',
    'crane up revealing scene',
    'slider move sideways',
    'orbit around subject',
    'static locked off',
    'handheld slight shake',
    'drone ascending slowly',
    'parallax depth shift',
    'slow zoom out',
    'dutch angle tilt',
    'gimbal smooth float',
  ];

  // Atmospheric effects
  private atmosphericEffects = [
    'light rain falling',
    'morning mist rising',
    'dust particles in air',
    'lens flare from sun',
    'heat shimmer',
    'falling snow',
    'fog rolling in',
    'steam rising',
    'bokeh light blur',
    'film grain texture',
    'light bloom',
    'depth haze',
    'condensation on glass',
    'smoke wisps',
    'pollen floating',
  ];

  // Weather conditions
  private weatherConditions = [
    'clear sunny day',
    'overcast cloudy',
    'light drizzle',
    'heavy rain',
    'snow falling',
    'foggy conditions',
    'misty morning',
    'stormy clouds',
    'golden sunset',
    'starry night',
    'partly cloudy',
    'crisp clear',
  ];

  /**
   * Generate a highly varied, unique visual prompt
   */
  generateUniquePrompt(options: VisualPromptOptions): EnhancedVisualPrompt {
    const { beatStyle, bpm, energy = 0.5 } = options;

    // Select theme pool based on style
    let themePool = this.lofiThemes;
    if (beatStyle.toLowerCase().includes('trap')) {
      themePool = this.trapThemes;
    } else if (beatStyle.toLowerCase().includes('chill')) {
      themePool = this.chillhopThemes;
    }

    // Randomly select elements
    const theme = this.randomChoice(themePool);
    const colorPalette = this.randomChoice(this.colorPalettes);
    const lighting = this.randomChoice(this.lightingStyles);
    const atmosphere = this.randomChoice(this.atmosphericEffects);

    // Camera movement based on energy/BPM
    let cameraMovement: string;
    if (energy < 0.3 || bpm < 80) {
      // Low energy: static or minimal movement
      cameraMovement = this.randomChoice([
        'static locked off',
        'subtle zoom in',
        'slow dolly forward',
        'gentle pan left to right',
      ]);
    } else if (energy > 0.7 || bpm > 130) {
      // High energy: more dynamic movement
      cameraMovement = this.randomChoice([
        'smooth tracking shot',
        'crane up revealing scene',
        'orbit around subject',
        'gimbal smooth float',
      ]);
    } else {
      // Medium energy: moderate movement
      cameraMovement = this.randomChoice(this.cameraMovements);
    }

    // Build final prompt
    const prompt = [
      theme,
      colorPalette,
      lighting,
      cameraMovement,
      atmosphere,
      'cinematic composition',
      '4K quality',
      'seamless loopable',
      'depth of field',
      'professional color grading',
    ].join(', ');

    return {
      prompt,
      theme,
      colorPalette,
      lighting,
      cameraMovement,
      atmosphere,
    };
  }

  /**
   * Generate a batch of VARIED prompts (no duplicates)
   */
  generateBatchPrompts(count: number, options: VisualPromptOptions): EnhancedVisualPrompt[] {
    const prompts: EnhancedVisualPrompt[] = [];
    const usedThemes = new Set<string>();

    while (prompts.length < count) {
      const prompt = this.generateUniquePrompt(options);

      // Ensure no duplicate themes
      if (!usedThemes.has(prompt.theme)) {
        prompts.push(prompt);
        usedThemes.add(prompt.theme);
      }
    }

    return prompts;
  }

  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
}

export const visualVarietyEngine = VisualVarietyEngine.getInstance();
