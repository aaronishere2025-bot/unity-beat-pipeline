import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

const job = await db.select().from(jobs).where(eq(jobs.id, '66713f52-2763-4c67-9804-6d8f53c3a207')).limit(1);

if (job.length > 0) {
  const j = job[0];
  console.log('Lofi Mix Job Details:');
  console.log('  ID:', j.id);
  console.log('  Name:', j.scriptName);
  console.log('  Duration:', j.duration, 'seconds =', Math.floor(j.duration / 60), 'minutes');
  console.log('  Metadata:', JSON.stringify(j.metadata, null, 2));
  console.log('  Status:', j.status, `(${j.progress}%)`);

  const expectedSongs = Math.ceil(j.duration / 120); // 120s per song
  console.log('\n✅ Expected song count:', expectedSongs, 'songs');
  console.log('   (', j.duration, '÷ 120 seconds per song )');
} else {
  console.log('Job not found!');
}

process.exit(0);
