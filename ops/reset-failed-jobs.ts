import { db } from './server/db';
import { jobs } from '@shared/schema';
import { like, or } from 'drizzle-orm';

async function main() {
  const results = await db
    .select()
    .from(jobs)
    .where(or(like(jobs.id, '94e50d3e%'), like(jobs.id, '4a0b6ba5%')));

  for (const j of results) {
    console.log('===', j.id.substring(0, 8), '===');
    console.log('Name:', j.scriptName);
    console.log('Status:', j.status, '| Progress:', j.progress + '%', '| Retries:', j.retryCount);
    console.log('Video:', j.videoUrl || 'none');
    console.log('Music:', j.musicUrl || 'none');
    console.log('');
  }
  process.exit(0);
}

main().catch(console.error);
