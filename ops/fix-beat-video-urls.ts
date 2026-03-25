#!/usr/bin/env tsx
/**
 * Fix video URLs for completed beat jobs
 * Changes from filesystem paths to web-accessible URLs
 */

import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq, and, like } from 'drizzle-orm';
import path from 'path';

async function fixVideoUrls() {
  console.log('🔧 Fixing video URLs for beat jobs...\n');

  // Get all completed beat jobs with filesystem paths
  const beatJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, 'completed'), like(jobs.videoUrl, '/home/aaronishere2025/%')))
    .execute();

  console.log(`Found ${beatJobs.length} beat jobs with filesystem paths\n`);

  for (const job of beatJobs) {
    const oldUrl = job.videoUrl!;
    const filename = path.basename(oldUrl);
    const newUrl = `/api/videos/${filename}`;

    await db.update(jobs).set({ videoUrl: newUrl }).where(eq(jobs.id, job.id)).execute();

    console.log(`✅ ${job.scriptName}`);
    console.log(`   Old: ${oldUrl}`);
    console.log(`   New: ${newUrl}\n`);
  }

  console.log(`\n🎉 Fixed ${beatJobs.length} video URLs!`);
  process.exit(0);
}

fixVideoUrls();
