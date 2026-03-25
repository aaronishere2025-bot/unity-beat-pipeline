#!/usr/bin/env tsx
/**
 * Finish stuck jobs that are at 100% but still "processing"
 */

import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function main() {
  console.log('🔧 Loading secrets...');
  await initializeSecretsFromGCP();

  const { db } = await import('./server/db');
  const { jobs } = await import('./shared/schema');
  const { eq } = await import('drizzle-orm');

  const jobIds = ['13f8da7f', '772612e0', '1efa0a2b'];

  console.log('\n📋 Checking stuck jobs...\n');

  for (const jobIdPrefix of jobIds) {
    // Find job by prefix
    const allJobs = await db.select().from(jobs).execute();
    const job = allJobs.find((j) => j.id.startsWith(jobIdPrefix));

    if (!job) {
      console.log(`❌ Job ${jobIdPrefix}... not found`);
      continue;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 Job: ${job.scriptName}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Progress: ${job.progress}%`);
    console.log(`   Cost: $${job.totalCost || 0}`);
    console.log(`   Mode: ${job.mode}`);

    // Check what we have
    const hasClips = job.completedClips && Array.isArray(job.completedClips) && job.completedClips.length > 0;
    const hasMusic = job.musicUrl ? true : false;
    const hasVideo = job.outputVideoUrl ? true : false;

    // Check unity metadata for clip URLs
    const unityMeta = job.unityMetadata as any;
    const hasPromptsGenerated = unityMeta?.prompts && unityMeta.prompts.length > 0;
    const totalPrompts = hasPromptsGenerated ? unityMeta.prompts.length : 0;

    console.log(`   Clips in completedClips: ${hasClips ? job.completedClips.length : 0}`);
    console.log(`   Prompts generated: ${totalPrompts}`);
    console.log(`   Music: ${hasMusic ? '✓' : '✗'}`);
    console.log(`   Video: ${hasVideo ? '✓' : '✗'}`);

    // Check if clips might be in a different location
    if (unityMeta) {
      console.log(`   Unity package: ${unityMeta.packageId || 'none'}`);
    }

    if (job.error) {
      console.log(`   Error: ${job.error.substring(0, 200)}`);
    }

    // Determine what needs to be done
    console.log('\n   🔍 Analysis:');

    if (!hasClips && !hasMusic && !hasPromptsGenerated) {
      console.log('   - No clips, music, or prompts - job never started properly');
      console.log('   - Action: Restart from beginning OR mark as failed');
    } else if (hasPromptsGenerated && hasMusic && !hasClips) {
      console.log('   - Prompts and music generated, but clips array empty');
      console.log('   - This suggests clips were generated but not saved to DB');
      console.log('   - Action: Check Kling storage or regenerate clips');
    } else if (hasClips && hasMusic && !hasVideo) {
      console.log('   - Clips and music exist, video assembly failed');
      console.log('   - Action: Run video assembly step with FFmpeg timeouts');
    } else if (hasVideo) {
      console.log('   - Video exists! Just needs status update to "completed"');
      console.log('   - Action: Update status');
    } else if (hasMusic && !hasClips && !hasPromptsGenerated) {
      console.log('   - Only music exists, prompts/clips missing');
      console.log('   - Action: Regenerate from Unity package');
    } else {
      console.log('   - Partial/corrupted state');
      console.log('   - Status: ' + job.status);
      console.log('   - Action: May need to restart from scratch');
    }

    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Ready to fix? Run with --fix flag to apply fixes');
}

main().catch(console.error);
