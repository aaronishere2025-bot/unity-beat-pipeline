// Trigger video generation immediately (bypasses scheduler)
import { initializeSecretsFromGCP } from './server/secret-manager-loader';
import { videoScheduler } from './server/services/video-scheduler';

async function main() {
  console.log('🚀 Triggering video generation NOW...\n');

  // Load secrets first
  await initializeSecretsFromGCP();

  // Trigger generation
  await videoScheduler.triggerGenerationNow();

  console.log('\n✅ Generation complete! Check the jobs table for queued videos.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Generation failed:', err.message);
  process.exit(1);
});
