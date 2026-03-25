import { loadSecret } from './server/secret-manager-loader';

async function checkSunoConfig() {
  console.log('🔍 Checking Suno API Configuration...\n');

  // Check which keys are available
  const keys = {
    KIE_API_KEY: process.env.KIE_API_KEY,
    KLING_ACCESS_KEY: process.env.KLING_ACCESS_KEY,
    SUNO_API_KEY: process.env.SUNO_API_KEY,
  };

  console.log('📋 API Keys in process.env:');
  for (const [name, value] of Object.entries(keys)) {
    if (value) {
      console.log(`   ✅ ${name}: ${value.slice(0, 10)}...${value.slice(-4)} (${value.length} chars)`);
    } else {
      console.log(`   ❌ ${name}: NOT SET`);
    }
  }

  // Check what the Suno service will use
  const sunoKey = process.env.KIE_API_KEY || process.env.KLING_ACCESS_KEY || process.env.SUNO_API_KEY;
  console.log('\n🎵 Suno Service will use:');
  if (sunoKey === process.env.KIE_API_KEY) {
    console.log('   📌 KIE_API_KEY (preferred - kie.ai unified API)');
  } else if (sunoKey === process.env.KLING_ACCESS_KEY) {
    console.log('   📌 KLING_ACCESS_KEY (fallback - kie.ai proxy)');
  } else if (sunoKey === process.env.SUNO_API_KEY) {
    console.log('   📌 SUNO_API_KEY (legacy - direct Suno API)');
  } else {
    console.log('   ❌ NO KEY AVAILABLE');
  }

  if (sunoKey) {
    console.log(`   🔑 Key value: ${sunoKey.slice(0, 10)}...${sunoKey.slice(-4)}`);
  }

  console.log('\n📝 System uses kie.ai proxy (api.kie.ai) for Suno');
  console.log('   ℹ️  kie.ai requires kie.ai account credits, not direct Suno credits');
  console.log('   ℹ️  If you have Suno credits, you need to add them to your kie.ai account');

  // Try to load fresh from Secret Manager
  console.log('\n🔐 Checking Secret Manager:');
  try {
    const klingKey = await loadSecret('KLING_ACCESS_KEY', false);
    console.log(`   ✅ KLING_ACCESS_KEY loaded: ${klingKey.slice(0, 10)}...${klingKey.slice(-4)}`);
  } catch (e: any) {
    console.log(`   ❌ Failed to load KLING_ACCESS_KEY: ${e.message}`);
  }

  try {
    const sunoKey = await loadSecret('SUNO_API_KEY', false);
    console.log(`   ✅ SUNO_API_KEY loaded: ${sunoKey.slice(0, 10)}...${sunoKey.slice(-4)}`);
  } catch (e: any) {
    console.log(`   ❌ Failed to load SUNO_API_KEY: ${e.message}`);
  }
}

checkSunoConfig().catch(console.error);
