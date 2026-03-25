import { storage } from './server/storage';

async function debugJobs() {
  const jobs = await storage.listJobs();
  const targetJob = jobs.find((j) => j.id === '0a53d1aa-daea-4646-a7ae-76a745527920');

  if (!targetJob) {
    console.log('Job not found in listJobs()');
    return;
  }

  console.log('Job found in listJobs():');
  console.log('  ID:', targetJob.id);
  console.log('  Status:', targetJob.status);
  console.log('  Retry Count:', targetJob.retryCount);
  console.log('  Max Retries:', targetJob.maxRetries);
  console.log('  Error:', targetJob.error);

  const retryCount = targetJob.retryCount || 0;
  const maxRetries = targetJob.maxRetries || 3;
  const shouldRetry = retryCount < maxRetries;

  console.log('\nRetry Logic:');
  console.log('  retryCount < maxRetries:', `${retryCount} < ${maxRetries} = ${shouldRetry}`);
  console.log('  Should be picked up for retry:', shouldRetry);
}

debugJobs().then(() => process.exit(0));
