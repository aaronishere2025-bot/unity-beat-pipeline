import { klingVideoGenerator } from '../server/services/kling-video-generator';
import { initializeSecretsWithFallback } from '../server/secret-manager-loader';
import axios from 'axios';

async function testKlingAuthentication() {
  console.log('🧪 Testing Kling/kie.ai Authentication...');

  try {
    // 1. Load secrets from GCP or .env
    await initializeSecretsWithFallback();
    console.log('✅ Secrets loaded.');

    // 2. Check if the generator is enabled (i.e., if the key was loaded)
    if (!klingVideoGenerator.isEnabled()) {
      throw new Error('Kling generator is not enabled. KLING_ACCESS_KEY is likely missing.');
    }
    console.log('✅ Kling generator is enabled.');

    // 3. Manually construct a lightweight API call to test the key
    const accessKey = process.env.KLING_ACCESS_KEY;
    const testUrl = 'https://api.kie.ai/api/v1/runway/record-detail?taskId=dummy-task-id';

    console.log('   Sending a test request to kie.ai...');

    const response = await axios.get(testUrl, {
      headers: {
        Authorization: `Bearer ${accessKey}`,
      },
      // Expect a non-200 response, but not a 401
      validateStatus: (status) => status < 500,
    });

    if (response.status === 401) {
      throw new Error('Authentication failed: The KLING_ACCESS_KEY is invalid or expired (401 Unauthorized).');
    }

    console.log(`✅ Authentication successful! Received status ${response.status}.`);
    console.log('   (A non-401 status indicates the key was accepted).');

    // Check if the response indicates an issue with the taskId, which is expected
    if (response.data && response.data.msg && response.data.msg.includes('不存在')) {
      // "不存在" means "does not exist"
      console.log('✅ Received expected error for dummy task ID, confirming API is responsive.');
    } else {
      console.warn('⚠️ Received an unexpected response, but authentication seems to have passed.');
      console.warn('   Response:', JSON.stringify(response.data));
    }

    console.log('\n🎉 Kling/kie.ai authentication is working correctly.');
  } catch (error: any) {
    console.error('\n❌ Kling/kie.ai Authentication Test FAILED:');
    console.error(`   Error: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data)}`);
    }
    process.exit(1);
  }
}

testKlingAuthentication();
