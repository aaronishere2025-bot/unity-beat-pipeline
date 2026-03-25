import 'dotenv/config';
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq } from 'drizzle-orm';
import { uploadJobToYouTube } from './server/services/video-scheduler';

async function main() {
  const jobIds = [
    '9d5c80cc-1217-4ba8-8786-25ff2aff9aeb', // Trap
    '16537870-3e21-476e-9af9-9105efbde022', // Lofi
  ];

  for (const id of jobIds) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) {
      console.log(`Job ${id} not found`);
      continue;
    }
    if (job.status !== 'completed') {
      console.log(`Job ${id} not completed (${job.status})`);
      continue;
    }

    console.log(`\n📤 Uploading: ${job.scriptName}...`);
    const result = await uploadJobToYouTube(job);

    if (result.success) {
      console.log(`✅ Uploaded! https://youtube.com/watch?v=${result.videoId}`);
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
  }

  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
