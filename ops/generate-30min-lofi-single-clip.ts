/**
 * Generate 30-minute Lofi mix with SINGLE CLIP looped
 * Saves credits: 55 credits (1 clip) vs 385+ credits (7+ clips)
 */

import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function generate30MinuteLofiSingleClip() {
  console.log('🎵 Generating 30-Minute Lofi Mix (SINGLE CLIP MODE)\n');

  const job = await db
    .insert(jobs)
    .values({
      mode: 'music' as const,
      scriptName: '30-Minute Lofi Study Mix 🎧',
      scriptContent:
        'Chill lofi hip hop beats for studying, relaxing, and working. 30:00 continuous mix with seamless loop visual.',
      aspectRatio: '16:9' as const,
      status: 'queued' as const,
      progress: 0,
      retryCount: 0,
      maxRetries: 3,
      autoUpload: true,
      metadata: {
        musicStyle: 'lofi',
        targetDuration: 1800, // 30 minutes
        clipDuration: 6,
        longForm: true,
        singleClip: true, // KEY FLAG: Only generate 1 clip, loop it 360x
        dailyBatch: true,
      },
    })
    .returning();

  console.log(`✅ Created 30-minute lofi job (SINGLE CLIP): ${job[0].id}`);
  console.log(`   Name: ${job[0].scriptName}`);
  console.log(`   Target: 30 minutes (1800 seconds)`);
  console.log(`   Visual: 1 clip looped 360 times`);
  console.log(`   Auto-upload: YES`);
  console.log('\n💰 Expected cost (SINGLE CLIP MODE):');
  console.log('   10 songs × 10 credits = 100 credits (Suno)');
  console.log('   1 video clip × 55 credits = 55 credits (Kling) ← SAVES 330 CREDITS!');
  console.log('   Total: 155 credits ($0.78)');
  console.log('\n📊 Savings vs Multi-Clip:');
  console.log('   Multi-clip cost: 650 credits ($3.25)');
  console.log('   Single-clip cost: 155 credits ($0.78)');
  console.log('   YOU SAVE: 495 credits ($2.48) = 76% cheaper!');
  console.log('\n🔄 Monitor: tail -f /tmp/server-daily-test.log');
  console.log(`   Job ID: ${job[0].id}\n`);
}

generate30MinuteLofiSingleClip().catch(console.error);
