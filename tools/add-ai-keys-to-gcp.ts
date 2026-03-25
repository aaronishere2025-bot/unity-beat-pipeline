import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const projectId = 'unity-ai-1766877776';

async function addSecret(name: string, value: string) {
  const secretId = name.toLowerCase().replace(/_/g, '-');
  const parent = `projects/${projectId}`;

  try {
    // Try to create the secret first
    console.log(`Creating secret: ${secretId}...`);
    await client.createSecret({
      parent: parent,
      secretId: secretId,
      secret: {
        replication: {
          automatic: {},
        },
      },
    });
    console.log(`✓ Created secret: ${secretId}`);
  } catch (error: any) {
    if (error.code === 6) {
      console.log(`  Secret ${secretId} already exists, adding new version`);
    } else {
      throw error;
    }
  }

  // Add the secret value
  const secretPath = `projects/${projectId}/secrets/${secretId}`;
  await client.addSecretVersion({
    parent: secretPath,
    payload: {
      data: Buffer.from(value, 'utf8'),
    },
  });
  console.log(`✓ Added secret version for: ${secretId}`);
}

async function main() {
  console.log('🔐 Adding OpenAI and Gemini API keys to Secret Manager...\n');

  // Get API keys from command line or environment
  const openaiKey = process.env.OPENAI_API_KEY || process.argv[2];
  const geminiKey = process.env.GEMINI_API_KEY || process.argv[3];

  if (!openaiKey || !geminiKey) {
    console.error('❌ ERROR: Please provide API keys\n');
    console.error('Usage:');
    console.error('  npx tsx add-ai-keys-to-gcp.ts <OPENAI_KEY> <GEMINI_KEY>');
    console.error('\nOr set environment variables:');
    console.error('  OPENAI_API_KEY=sk-... GEMINI_API_KEY=AI... npx tsx add-ai-keys-to-gcp.ts');
    console.error('\n📍 Get your API keys from:');
    console.error('  OpenAI: https://platform.openai.com/api-keys');
    console.error('  Gemini: https://aistudio.google.com/app/apikey');
    process.exit(1);
  }

  console.log('Adding OPENAI_API_KEY...');
  await addSecret('OPENAI_API_KEY', openaiKey);

  console.log('\nAdding GEMINI_API_KEY...');
  await addSecret('GEMINI_API_KEY', geminiKey);

  console.log('\n✅ Success! Both API keys have been added to Secret Manager');
  console.log('\n📋 Next steps:');
  console.log('  1. Restart your application to load the new keys');
  console.log('  2. Test multi-model error analysis: npx tsx test-multi-model-error-analysis.ts');
  console.log('  3. Verify all 3 models are working (GPT-4o, Gemini 2.0 Flash, Claude)');
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
