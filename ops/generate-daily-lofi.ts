import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

console.log('🎵 Daily Lofi Beat Generator');
console.log('Time:', new Date().toLocaleString());
console.log('═'.repeat(60));

// Daily lofi themes/vibes with engaging titles and visual prompts
const lofiThemes = [
  {
    name: '30-Minute Morning Coffee Lofi Mix ☕',
    content:
      'target 30:00 length | Warm morning coffee shop lofi | 80-85 BPM | jazzy chords, soft percussion, vinyl crackle, cozy atmosphere, sunrise energy',
    visualPrompt:
      'Cinematic shot of a person drinking coffee by a window, warm morning sunlight streaming in, cozy coffee shop ambiance, steam rising from cup, peaceful morning vibes, soft focus, golden hour lighting',
    bpm: 82,
  },
  {
    name: '30-Minute Rainy Day Study Session 🌧️',
    content:
      'target 30:00 length | Rainy day study music | 75-80 BPM | rain sounds, mellow piano, lo-fi drums, peaceful, focus music, chill vibes',
    visualPrompt:
      'Cinematic view through rain-covered window, raindrops sliding down glass, blurred city lights in background, cozy indoor desk setup, warm lamp light, peaceful rainy day atmosphere',
    bpm: 78,
  },
  {
    name: '30-Minute Late Night Lofi Mix 🌙',
    content:
      'target 30:00 length | Late night lofi hip hop | 70-75 BPM | contemplative, dreamy synths, soft beats, nighttime vibes, relaxing',
    visualPrompt:
      'Cinematic nighttime cityscape, glowing moon over quiet streets, person sitting by window looking at stars, soft blue and purple tones, peaceful late night atmosphere, dreamy mood',
    bpm: 72,
  },
  {
    name: '30-Minute Sunset Chill Lofi 🌅',
    content:
      'target 30:00 length | Sunset lofi beats | 85-90 BPM | golden hour, warm rhodes, jazzy guitar, nostalgic, evening relaxation',
    visualPrompt:
      'Cinematic sunset over calm ocean or city skyline, golden and orange hues, silhouette of person relaxing on balcony or rooftop, warm evening glow, peaceful end-of-day vibes, nostalgic atmosphere',
    bpm: 87,
  },
  {
    name: '30-Minute Deep Focus Study Mix 📚',
    content:
      'target 30:00 length | Deep focus study beats | 80-85 BPM | minimal, clean production, steady rhythm, concentration music, productivity',
    visualPrompt:
      'Cinematic study desk setup with books and laptop, clean minimalist aesthetic, soft desk lamp lighting, person writing or studying peacefully, organized workspace, calm focus atmosphere',
    bpm: 83,
  },
  {
    name: '30-Minute Midnight Study Lounge 💜',
    content:
      'target 30:00 length | Midnight study lounge | 75-80 BPM | dark purple aesthetic, soft piano, ambient pads, late night studying',
    visualPrompt:
      'Cinematic midnight study room with purple ambient LED lights, cozy desk setup, city lights visible through window, person studying with warm drink, purple and blue color grading, peaceful late-night atmosphere',
    bpm: 77,
  },
  {
    name: '30-Minute Lazy Sunday Lofi ☁️',
    content:
      'target 30:00 length | Lazy Sunday lofi | 70-75 BPM | slow tempo, relaxed, cozy blankets, morning light, peaceful weekend vibes',
    visualPrompt:
      'Cinematic cozy bedroom scene, person relaxing in bed with blanket, soft morning light through curtains, lazy Sunday morning atmosphere, peaceful and comfortable, warm natural lighting, relaxed weekend mood',
    bpm: 73,
  },
];

// Pick a random theme or cycle through them based on day of year
const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
const theme = lofiThemes[dayOfYear % lofiThemes.length];

console.log(`\n📋 Today's Beat: ${theme.name}`);
console.log(`   BPM: ${theme.bpm}`);
console.log(`   Style: ${theme.content}`);
console.log('');

// Create the job with clean title (already includes emoji and format)
const jobName = theme.name;

try {
  const newJob = await db
    .insert(jobs)
    .values({
      scriptName: jobName,
      scriptContent: theme.content,
      mode: 'music',
      status: 'queued',
      aspectRatio: '16:9',
      progress: 0,
      autoUpload: false, // Will be uploaded by the 10am upload script
      maxRetries: 3,
      retryCount: 0,
      unityMetadata: {
        customVisualPrompt: theme.visualPrompt, // Custom themed visual
        packageId: 'daily-lofi',
        promptCount: 1,
        estimatedCost: 0.1,
      },
    })
    .returning();

  console.log('✅ Job created successfully!');
  console.log(`   Job ID: ${newJob[0].id}`);
  console.log(`   Name: ${jobName}`);
  console.log('');
  console.log('⏳ Job worker will process this automatically');
  console.log('   Expected duration: ~5 minutes per track');
  console.log('   Will be auto-uploaded at 10:00 AM tomorrow');
  console.log('');
  console.log('═'.repeat(60));
} catch (error: any) {
  console.error('❌ Failed to create job:', error.message);
  process.exit(1);
}
