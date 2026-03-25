import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const MODEL_NAME = 'gemini-2.0-flash-exp';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

async function testGeminiApi() {
  if (!GEMINI_API_KEY) {
    console.error('❌ Error: AI_INTEGRATIONS_GEMINI_API_KEY is not set in the .env file.');
    process.exit(1);
  }

  console.log('🧪 Testing Gemini API...');
  console.log(`   Model: ${MODEL_NAME}`);

  try {
    const requestData = {
      contents: [
        {
          parts: [
            {
              text: 'Write a short, inspiring quote about the future of AI.',
            },
          ],
        },
      ],
    };

    const response = await axios.post(API_URL, requestData, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 200 && response.data.candidates) {
      const quote = response.data.candidates[0].content.parts[0].text;
      console.log('✅ Success! Gemini API responded:');
      console.log(`
"${quote.trim()}"
`);
    } else {
      console.error('❌ Error: Received an unexpected response from the Gemini API.');
      console.error('   Status:', response.status);
      console.error('   Data:', JSON.stringify(response.data, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Error: Failed to make a request to the Gemini API.');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

testGeminiApi();
