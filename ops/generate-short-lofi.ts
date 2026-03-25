import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

console.log('🎵 Short Lofi Test Generator\n');

const newJob = await db
  .insert(jobs)
  .values({
    scriptName: '5-Minute Coffee Shop Lofi Test ☕',
    scriptContent:
      'target 5:00 length | Warm morning coffee shop lofi | 80-85 BPM | jazzy chords, soft percussion, vinyl crackle',
    mode: 'music',
    status: 'queued',
    aspectRatio: '16:9',
    autoUpload: false,
    maxRetries: 3,
    retryCount: 0,
    unityMetadata: {
      customVisualPrompt:
        'Cinematic shot of a person drinking coffee by a window, warm morning sunlight streaming in, cozy coffee shop ambiance, steam rising from cup, peaceful morning vibes',
      packageId: 'test-short-lofi',
      promptCount: 1,
      estimatedCost: 0.1,
    },
  })
  .returning();

console.log('✅ Short test job created!');
console.log(`   Job ID: ${newJob[0].id}`);
console.log(`   Name: ${newJob[0].scriptName}`);
console.log(`   Target: 5 minutes (should generate 2 songs)\n`);
