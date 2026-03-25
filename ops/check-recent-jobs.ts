import { storage } from './server/storage.js';

async function checkRecentJobs() {
  console.log('Fetching most recent jobs...\n');

  const allJobs = await storage.listJobs();

  if (allJobs.length === 0) {
    console.log('No jobs found in database.');
    return;
  }

  // Sort by created date descending
  const sortedJobs = allJobs.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  // Get last 5 jobs
  const recentJobs = sortedJobs.slice(0, 5);

  console.log(`Found ${recentJobs.length} recent jobs (showing most recent 5):\n`);

  for (const job of recentJobs) {
    console.log(`Job ID: ${job.id}`);
    console.log(`  Script: ${job.scriptName || 'N/A'}`);
    console.log(`  Mode: ${job.mode}`);
    console.log(`  Status: ${job.status}`);
    console.log(`  Progress: ${job.progress || 0}%`);
    console.log(`  Created: ${job.createdAt}`);
    if (job.completedAt) {
      console.log(`  Completed: ${job.completedAt}`);
    }
    if (job.error) {
      console.log(`  Error: ${job.error.substring(0, 200)}${job.error.length > 200 ? '...' : ''}`);
    }
    console.log('');
  }

  // Status summary
  const statusCounts = {
    queued: allJobs.filter((j) => j.status === 'queued').length,
    processing: allJobs.filter((j) => j.status === 'processing').length,
    completed: allJobs.filter((j) => j.status === 'completed').length,
    failed: allJobs.filter((j) => j.status === 'failed').length,
  };

  console.log('Status Summary (all jobs):');
  console.log(`  Queued: ${statusCounts.queued}`);
  console.log(`  Processing: ${statusCounts.processing}`);
  console.log(`  Completed: ${statusCounts.completed}`);
  console.log(`  Failed: ${statusCounts.failed}`);
}

checkRecentJobs()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
