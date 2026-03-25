#!/usr/bin/env tsx
/**
 * Collect Beat Analytics - Run daily via cron
 *
 * Collects YouTube analytics for all beat videos and feeds them
 * to the learning system to improve future visual generation.
 *
 * Usage:
 *   npx tsx collect-beat-analytics.ts
 *
 * Cron setup (run daily at 3 AM):
 *   0 3 * * * cd /home/aaronishere2025 && npx tsx collect-beat-analytics.ts >> /tmp/beat-analytics.log 2>&1
 */

import { beatPerformanceTracker } from './server/services/beat-performance-tracker.js';

async function main() {
  console.log('==========================================');
  console.log('BEAT ANALYTICS COLLECTION');
  console.log('==========================================');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    await beatPerformanceTracker.collectAndLearn();

    console.log('\n✅ Analytics collection complete!');
    console.log(`Finished at: ${new Date().toISOString()}`);
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Analytics collection failed!');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
