/**
 * gen-daily.ts — Queue 1 lofi + 1 trap beat via beat-scheduler
 * Usage: npx tsx gen-daily.ts
 */
import 'dotenv/config';
import { beatScheduler } from './server/services/beat-scheduler';

async function main() {
  console.log('Loaded .env secrets');

  console.log('\n--- Queuing 1 lofi beat ---');
  await beatScheduler.generateLofi();

  console.log('\n--- Queuing 1 trap beat ---');
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  await beatScheduler.generateTrap(`Nano Banana Trap - ${today}`);

  console.log('\nDone — both jobs queued. Exiting.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
