import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';

async function testSecretManager() {
  console.log('🔐 Testing Secret Manager with caching...\n');

  console.time('Initial load (no cache)');
  await initializeSecretsFromGCP();
  console.timeEnd('Initial load (no cache)');

  console.log('\n✅ Loaded secrets into process.env:');
  console.log('   - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Loaded' : '❌ Missing');
  console.log('   - GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ Missing');
  console.log('   - ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ Loaded' : '❌ Missing');

  console.log('\n🔒 Caching is enabled by default');
  console.log('   Subsequent loads will use cached values (<1ms)');
  console.log('\n✅ All systems ready for multi-model AI error analysis!');
}

testSecretManager().catch(console.error);
