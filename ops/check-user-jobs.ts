import { db } from './server/db.js';
import { jobs } from '@shared/schema';

console.log('Checking user jobs from UI...\n');

const jobIds = [
  '66713f52-2763-4c67-9804-6d8f53c3a207', // Lofi Mix 1769572498560
  'feced899',
  '82d7c5da',
  '00925aa4',
  '3d436007',
  'abf1ce3c',
];

const allJobs = await db.select().from(jobs).limit(300);

console.log('Looking for these job IDs:');
for (const id of jobIds) {
  const fullId = id.length < 20 ? id : id;
  const match = allJobs.find((j) => j.id === fullId || j.id.startsWith(id.substring(0, 8)));

  if (match) {
    console.log(
      `  ✅ ${id.substring(0, 8)}... - ${match.status.toUpperCase()} (${match.progress}%) - ${match.scriptName}`,
    );
  } else {
    console.log(`  ❌ ${id.substring(0, 8)}... - NOT FOUND IN DATABASE`);
  }
}

console.log(`\n📊 Total jobs in DB: ${allJobs.length}`);
console.log('Queued:', allJobs.filter((j) => j.status === 'queued').length);
console.log('Processing:', allJobs.filter((j) => j.status === 'processing').length);

process.exit(0);
