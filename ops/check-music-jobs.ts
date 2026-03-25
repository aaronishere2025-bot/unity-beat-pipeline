#!/usr/bin/env tsx
/**
 * Check Music Mode jobs in database
 */

import { storage } from './server/storage';

async function checkJobs() {
  try {
    const jobs = await storage.listJobs();
    const musicJobs = jobs.filter((j) => j.mode === 'music');

    console.log(`\n📊 Total jobs: ${jobs.length}`);
    console.log(`🎵 Music Mode jobs: ${musicJobs.length}\n`);

    if (musicJobs.length > 0) {
      console.log('Music Mode Jobs:');
      console.log('='.repeat(80));
      for (const job of musicJobs.slice(0, 5)) {
        console.log(`ID: ${job.id}`);
        console.log(`Status: ${job.status}`);
        console.log(`Video URL: ${job.videoUrl || 'N/A'}`);
        console.log(`Script Name: ${job.scriptName}`);
        console.log(`Created: ${job.createdAt}`);
        console.log('-'.repeat(80));
      }
    } else {
      console.log('❌ No Music Mode jobs found in database!');
      console.log('\nThis explains why videos return 403 Forbidden.');
      console.log('The video endpoint requires jobs to exist with matching video_url.');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

checkJobs();
