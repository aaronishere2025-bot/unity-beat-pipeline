import axios from 'axios';

/**
 * Cancel duplicate queued beat jobs, keeping only the processing ones
 */

const duplicateIdsToCancel = [
  '720ca462-0d92-4fc5-8f2b-6100bdead548', // Deep Sleep Ambient (queued)
  '5bf03663-230e-408f-8b5e-30f2c67d8601', // Midnight Lofi Study (queued)
  '9e323afc-94cb-4363-aa37-b3990dc48add', // Late Night Trap (queued)
  'adcc2d43-f6d1-4145-aa9f-35f1690ff8c2', // Night Chill Beat (queued)
  'cdfdd11a-de07-424b-8146-0fa1d886373a', // Evening Study Lofi (queued)
  'df333f7d-e4bf-4a95-b93d-8ebb26f3eb13', // Sunset Chill Trap (queued)
  '824160aa-63dc-45c7-b2b4-7d8d23cb5e1d', // Afternoon Energy Beat (queued)
  'd47596e9-4366-43fa-ac62-43a4512edab6', // Midday Jazzy Lofi (queued)
  '6bc4c12b-b465-45f0-93cf-57d5bf8ad9d0', // Focus Study Beat (queued)
  '1976a671-2ff8-4faf-b7a9-a45161441b6e', // Morning Chill Lofi Beat (queued)
  '209299d3-d752-442a-80c1-600e498e5338', // Morning Chill Lofi Beat (test duplicate)
];

async function cancelDuplicates() {
  console.log('🧹 Canceling duplicate queued beat jobs...\n');

  let canceledCount = 0;

  for (const jobId of duplicateIdsToCancel) {
    try {
      await axios.delete(`http://localhost:8080/api/jobs/${jobId}`);
      console.log(`✅ Canceled: ${jobId.substring(0, 8)}...`);
      canceledCount++;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error: any) {
      console.log(`⚠️  Could not cancel ${jobId.substring(0, 8)}: ${error.response?.data?.error || error.message}`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   🗑️  Canceled: ${canceledCount} duplicate jobs`);
  console.log(`   ✅ Remaining: 10 unique beats (processing)`);
  console.log(`\n   Monitor: http://localhost:8080/dashboard`);
}

cancelDuplicates()
  .then(() => {
    console.log('\n✨ Cleanup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
