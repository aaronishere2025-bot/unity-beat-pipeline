import axios from 'axios';

async function cancelAllQueued() {
  console.log('🧹 Fetching all queued jobs...\n');

  try {
    const response = await axios.get('http://localhost:8080/api/jobs');
    const queuedJobs = response.data.data.filter((job: any) => job.status === 'queued');

    console.log(`Found ${queuedJobs.length} queued jobs to cancel\n`);

    let canceledCount = 0;
    for (const job of queuedJobs) {
      try {
        await axios.delete(`http://localhost:8080/api/jobs/${job.id}`);
        console.log(`✅ Canceled: ${job.scriptName || job.script_name} (${job.id.substring(0, 8)})`);
        canceledCount++;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        console.log(`⚠️  Failed to cancel ${job.id.substring(0, 8)}: ${error.response?.data?.error || error.message}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   🗑️  Canceled: ${canceledCount} queued jobs`);

    // Check processing jobs
    const processingResponse = await axios.get('http://localhost:8080/api/jobs');
    const processingJobs = processingResponse.data.data.filter((job: any) => job.status === 'processing');
    console.log(`   ⚙️  Still processing: ${processingJobs.length} jobs`);
    console.log(`\n✅ The ${processingJobs.length} processing beats will complete and auto-upload!`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

cancelAllQueued()
  .then(() => {
    console.log('\n✨ Cleanup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
