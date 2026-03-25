import axios from 'axios';
import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function testKieAuth() {
  console.log('🔐 Loading secrets...\n');
  await initializeSecretsFromGCP();

  const accessKey = process.env.KLING_ACCESS_KEY;

  console.log(`KLING_ACCESS_KEY loaded: ${accessKey ? 'YES ✅' : 'NO ❌'}`);
  if (accessKey) {
    console.log(`Key length: ${accessKey.length} chars`);
    console.log(`Key preview: ${accessKey.substring(0, 8)}...${accessKey.substring(accessKey.length - 4)}\n`);
  }

  console.log('📤 Testing kie.ai API authentication...\n');

  try {
    const response = await axios.post(
      'https://api.kie.ai/api/v1/runway/generate',
      {
        prompt: 'A beautiful sunset over mountains',
        duration: 5,
        quality: '720p',
        aspectRatio: '9:16',
        waterMark: '',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessKey}`,
        },
        timeout: 10000,
      },
    );

    console.log('✅ Authentication successful!');
    console.log(`Response:`, JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    if (error.response) {
      console.log(`❌ API Error: ${error.response.status}`);
      console.log(`Response:`, JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 401) {
        console.log('\n⚠️ 401 Unauthorized - The API key is invalid, expired, or kie.ai has changed authentication.');
        console.log('💡 Check: https://kie.ai or contact their support for updated API keys/docs');
      }
    } else {
      console.log(`❌ Request Error: ${error.message}`);
    }
  }

  process.exit(0);
}

testKieAuth();
