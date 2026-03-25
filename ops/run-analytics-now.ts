/**
 * Manual trigger for analytics pipeline
 * Run this to fetch analytics immediately without waiting for scheduled time
 */

import { analyticsPollingScheduler } from './server/services/analytics-polling-scheduler';

async function main() {
  console.log('🚀 Manually running analytics pipeline...\n');

  await analyticsPollingScheduler.runNow();

  console.log('\n✅ Analytics pipeline complete!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
