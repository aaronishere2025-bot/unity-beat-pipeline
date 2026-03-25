import 'dotenv/config';
import { initializeSecretsWithFallback } from './server/secret-manager-loader';

async function main() {
  await initializeSecretsWithFallback();

  const { beatScheduler } = await import('./server/services/beat-scheduler');

  console.log('\n🧪 Testing lofi + trap generation...\n');

  // Run lofi
  console.log('━━━ LOFI ━━━');
  await beatScheduler.generateLofi();

  // Small delay so isGenerating resets
  await new Promise((r) => setTimeout(r, 500));

  // Run trap
  console.log('\n━━━ TRAP ━━━');
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  await beatScheduler.generateTrap(`Trap Beat - ${today}`);

  console.log('\n✅ Both jobs queued. Start server to process them.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
