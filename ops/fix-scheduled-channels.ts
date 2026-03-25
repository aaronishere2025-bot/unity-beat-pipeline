import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { isNotNull, isNull, eq } from 'drizzle-orm';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

async function fixScheduledChannels() {
  // Load available channels
  const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');

  if (!existsSync(channelsFile)) {
    console.error('❌ No channels file found');
    process.exit(1);
  }

  const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
  const activeChannels = channels.filter((c: any) => c.status === 'active');

  if (activeChannels.length === 0) {
    console.error('❌ No active channels found');
    process.exit(1);
  }

  const defaultChannel = activeChannels[0];
  console.log(`\n🔧 Using default channel: ${defaultChannel.title}`);

  // Find all scheduled jobs without channel assignment
  const scheduledWithoutChannel = await db.select().from(jobs).where(isNotNull(jobs.scheduledTime));

  console.log(`\n📋 Found ${scheduledWithoutChannel.length} scheduled jobs`);

  let fixed = 0;

  for (const job of scheduledWithoutChannel) {
    // Get existing metadata
    const existingMetadata = job.unityMetadata
      ? typeof job.unityMetadata === 'string'
        ? JSON.parse(job.unityMetadata)
        : job.unityMetadata
      : {};

    // Check if already has channel
    if (existingMetadata.channelConnectionId) {
      console.log(`  ✓ ${job.scriptName} - already has channel`);
      continue;
    }

    // Assign default channel
    const updatedMetadata = {
      ...existingMetadata,
      channelConnectionId: defaultChannel.id,
      scheduledChannel: defaultChannel.title,
    };

    await db
      .update(jobs)
      .set({
        youtubeChannelConnectionId: defaultChannel.id,
        unityMetadata: updatedMetadata,
      })
      .where(eq(jobs.id, job.id));

    console.log(`  ✅ ${job.scriptName} → ${defaultChannel.title}`);
    fixed++;
  }

  console.log(`\n✨ Fixed ${fixed} jobs`);
  process.exit(0);
}

fixScheduledChannels().catch(console.error);
