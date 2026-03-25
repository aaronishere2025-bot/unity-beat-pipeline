import dotenv from 'dotenv';
dotenv.config();

import { klingVideoGenerator } from './server/services/kling-video-generator.js';

async function main() {
  console.log('=== KLING CREDIT PROBE ===');
  console.log(`Kling enabled: ${klingVideoGenerator.isEnabled()}`);
  console.log(
    `Circuit breaker state: ${klingVideoGenerator.isCreditsExhausted() ? 'TRIPPED (no credits)' : 'OK (not tripped)'}`,
  );
  console.log('');
  console.log('Running live probe against kie.ai API...');
  console.log('(This submits a real 5s clip request — costs 100 credits / $0.50 if credits are available)');
  console.log('');

  const result = await klingVideoGenerator.probeCreditsLive();

  console.log('');
  console.log('=== RESULT ===');
  if (result.sufficient) {
    console.log('✅ Credits are AVAILABLE — you can run jobs');
  } else {
    console.log(`❌ Credits EXHAUSTED: ${result.error}`);
    console.log('Top up at kie.ai before running any jobs');
  }

  process.exit(0);
}
main().catch((e) => {
  console.error('Probe failed:', e.message);
  process.exit(1);
});
