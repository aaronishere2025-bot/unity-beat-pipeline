import axios from 'axios';

async function testKieAPI() {
  const apiKey = '41f3b3636f604d389c12fadafb8175d5';

  console.log('🔍 Testing kie.ai API directly...\n');
  console.log('API Key:', apiKey.slice(0, 10) + '...' + apiKey.slice(-4));
  console.log('Base URL: https://api.kie.ai\n');

  // Test 1: Check credits
  console.log('📊 Test 1: Checking credit balance...');
  try {
    const creditResponse = await axios.get('https://api.kie.ai/api/v1/generate/credit', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    console.log('✅ Credit check response:', JSON.stringify(creditResponse.data, null, 2));
  } catch (error: any) {
    console.log('❌ Credit check failed:', error.response?.status, error.response?.data || error.message);
  }

  // Test 2: Try different credit endpoint
  console.log('\n📊 Test 2: Trying alternate credit endpoint...');
  try {
    const altCreditResponse = await axios.get('https://api.kie.ai/v1/suno/credits', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('✅ Alt credit response:', JSON.stringify(altCreditResponse.data, null, 2));
  } catch (error: any) {
    console.log('❌ Alt credit check failed:', error.response?.status, error.response?.data || error.message);
  }

  // Test 3: Minimal Suno generation request (exactly as server does it)
  console.log('\n🎵 Test 3: Testing minimal Suno generation...');
  try {
    const genResponse = await axios.post(
      'https://api.kie.ai/api/v1/generate',
      {
        prompt: 'instrumental beat',
        style: 'lofi, 90 BPM, chill',
        title: 'Test Beat',
        customMode: true,
        instrumental: true,
        model: 'V5',
        callBackUrl: 'https://httpbin.org/post',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );
    console.log('✅ Generation response:', JSON.stringify(genResponse.data, null, 2));
  } catch (error: any) {
    console.log('❌ Generation failed:');
    console.log('   Status:', error.response?.status);
    console.log('   Response:', JSON.stringify(error.response?.data, null, 2));
    console.log(
      '   Headers sent:',
      JSON.stringify(
        {
          Authorization: `Bearer ${apiKey.slice(0, 10)}...`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        null,
        2,
      ),
    );
  }

  // Test 4: Check if account/profile endpoint exists
  console.log('\n👤 Test 4: Checking account info...');
  const accountEndpoints = ['/api/v1/account', '/api/v1/user', '/api/v1/profile', '/v1/account/balance'];

  for (const endpoint of accountEndpoints) {
    try {
      const response = await axios.get(`https://api.kie.ai${endpoint}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      console.log(`✅ ${endpoint}:`, JSON.stringify(response.data, null, 2));
      break;
    } catch (error: any) {
      console.log(`❌ ${endpoint}: ${error.response?.status || 'failed'}`);
    }
  }
}

testKieAPI().catch(console.error);
