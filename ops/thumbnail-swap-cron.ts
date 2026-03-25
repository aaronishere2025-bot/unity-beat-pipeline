#!/usr/bin/env tsx
/**
 * Thumbnail Swap Cron Job
 * Run this every hour to automatically swap thumbnails for A/B testing
 *
 * Usage: Add to crontab:
 * 0 * * * * cd /path/to/project && npx tsx thumbnail-swap-cron.ts
 */

import { thumbnailABTester } from './server/services/thumbnail-ab-tester';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🕐 THUMBNAIL A/B TEST CRON JOB');
  console.log(`   Started: ${new Date().toLocaleString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    await thumbnailABTester.executeScheduledSwaps();
    console.log('\n✅ Thumbnail swap check complete');
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Completed: ${new Date().toLocaleString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
