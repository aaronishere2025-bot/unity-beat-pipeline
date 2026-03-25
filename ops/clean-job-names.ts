import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { sql, like } from 'drizzle-orm';

console.log('Cleaning up job names...\n');

// Find jobs with [FIXED] or test in names
const jobsToClean = await db
  .select()
  .from(jobs)
  .where(sql`${jobs.scriptName} ILIKE '%[FIXED]%' OR ${jobs.scriptName} ILIKE '%test%'`);

console.log(`Found ${jobsToClean.length} jobs to clean\n`);

for (const job of jobsToClean) {
  const oldName = job.scriptName;
  if (!oldName) continue;

  // Remove [FIXED], [fixed], test, Test, etc.
  const newName = oldName
    .replace(/\[FIXED\]/gi, '')
    .replace(/\[fixed\]/gi, '')
    .replace(/\btest\s+/gi, '')
    .replace(/\s+test\b/gi, '')
    .replace(/\s+\-\s+test/gi, '')
    .replace(/test\s+\-\s+/gi, '')
    .trim()
    .replace(/\s+/g, ' '); // Clean up extra spaces

  if (newName !== oldName) {
    console.log(`Updating: "${oldName}"`);
    console.log(`       → "${newName}"`);

    await db
      .update(jobs)
      .set({ scriptName: newName })
      .where(sql`${jobs.id} = ${job.id}`);

    console.log('');
  }
}

console.log('✅ Job names cleaned!');
