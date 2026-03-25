import dotenv from 'dotenv';
dotenv.config();
import { SunoAPI } from './server/services/suno-api';

async function main() {
  const suno = SunoAPI.getInstance();

  // Try to check credits/balance first
  console.log('Testing Suno API availability...');

  try {
    // Try a minimal generation to see if credits work
    const result = await suno.generateSong({
      lyrics: '(instrumental)',
      style: 'lofi, 80 BPM, test',
      instrumental: false,
      model: 'V5',
    });
    console.log('✅ Suno generation started successfully:', result);
  } catch (e: any) {
    console.log('❌ Suno error:', e.message);
    if (e.message?.includes('credits') || e.message?.includes('Credits') || e.message?.includes('insufficient')) {
      console.log('   → Credits are depleted');
    } else {
      console.log('   → Different error - not credits related');
    }
  }

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
