/**
 * Generate a proper 30-minute Lofi mix
 */

import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function generate30MinuteLofi() {
  console.log('🎵 Generating 30-Minute Lofi Mix\n');

  const job = await db
    .insert(jobs)
    .values({
      mode: 'music' as const,
      scriptName: '30-Minute Lofi Study Mix 🎧',
      scriptContent: 'Chill lofi hip hop beats for studying, relaxing, and working. 30:00 continuous mix.',
      aspectRatio: '16:9' as const,
      status: 'queued' as const,
      progress: 0,
      retryCount: 0,
      maxRetries: 3,
      autoUpload: true, // Auto-upload this one
      metadata: {
        musicStyle: 'lofi',
        targetDuration: 1800, // 30 minutes = 1800 seconds
        clipDuration: 6,
        longForm: true,
        dailyBatch: true,
      },
    })
    .returning();

  console.log(`✅ Created 30-minute lofi job: ${job[0].id}`);
  console.log(`   Name: ${job[0].scriptName}`);
  console.log(`   Target: 30 minutes (1800 seconds)`);
  console.log(`   Auto-upload: YES`);
  console.log('\n💰 Expected cost:');
  console.log('   10 songs × 10 credits = 100 credits (Suno)');
  console.log('   10 video clips × 55 credits = 550 credits (Kling)');
  console.log('   Total: 650 credits ($3.25)');
  console.log('\n🔄 Monitor: tail -f /tmp/server-daily-test.log');
  console.log(`   Job ID: ${job[0].id}\n`);
}

generate30MinuteLofi().catch(console.error);
