import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function checkJobDetails() {
  const jobIds = [
    '8133eae9-ab9f-4961-b0a2-02a82abe7a5b', // Pope Stephen VI
    'f0536869-cc2c-4d5b-9a70-2bd2c755406a', // Mad Jack Churchill
  ];

  for (const jobId of jobIds) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));

    if (!job) {
      console.log(`Job ${jobId} not found\n`);
      continue;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📹 ${job.scriptName}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Status: ${job.status}`);
    console.log(`Mode: ${job.mode}`);
    console.log(`Created: ${new Date(job.createdAt).toLocaleString()}`);

    if (job.unityMetadata) {
      const meta = job.unityMetadata as any;
      console.log(`\n🎵 Music:`);
      if (meta.musicUrl) {
        console.log(`   ✅ Generated: ${meta.musicUrl.substring(0, 50)}...`);
      }
      if (meta.musicDuration) {
        console.log(`   Duration: ${meta.musicDuration}s`);
      }
      if (meta.bpm) {
        console.log(`   BPM: ${meta.bpm}`);
      }
    }

    console.log(`\n🎬 Video Generation:`);
    if (job.prompts && Array.isArray(job.prompts)) {
      console.log(`   Total prompts: ${job.prompts.length}`);
    }

    if (job.completedClips && Array.isArray(job.completedClips)) {
      console.log(`   ✅ Completed clips: ${job.completedClips.length}`);

      // Show last 3 completed clips
      const recent = job.completedClips.slice(-3);
      console.log(`   Recent completions:`);
      for (const clip of recent) {
        const c = clip as any;
        if (c.prompt) {
          console.log(`      - "${c.prompt.substring(0, 60)}..."`);
        }
      }
    }

    if (job.currentPromptIndex !== null && job.currentPromptIndex !== undefined) {
      console.log(`   ⏳ Current prompt index: ${job.currentPromptIndex}`);
    }

    if (job.error) {
      console.log(`\n❌ Error: ${job.error}`);
    }

    if (job.estimatedCost) {
      console.log(`\n💰 Estimated cost: $${job.estimatedCost.toFixed(2)}`);
    }

    console.log('');
  }

  process.exit(0);
}

checkJobDetails().catch(console.error);
