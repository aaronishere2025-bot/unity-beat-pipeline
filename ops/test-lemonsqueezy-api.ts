import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.LEMONSQUEEZY_API_KEY;
const BASE_URL = 'https://api.lemonsqueezy.com/v1';

if (!API_KEY) {
  console.error('❌ LEMONSQUEEZY_API_KEY not found in environment');
  process.exit(1);
}

console.log('🍋 Testing Lemon Squeezy API Capabilities\n');
console.log(`API Key: ${API_KEY.slice(0, 20)}...${API_KEY.slice(-10)}\n`);

async function testAPI() {
  const headers = {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Bearer ${API_KEY}`,
  };

  try {
    // Test 1: Get store info
    console.log('📊 Test 1: Getting store information...');
    try {
      const storesResponse = await axios.get(`${BASE_URL}/stores`, { headers });
      console.log('✅ Stores API works!');
      console.log('Stores:', JSON.stringify(storesResponse.data, null, 2));
      console.log();
    } catch (error: any) {
      console.log('❌ Stores API failed:', error.response?.status, error.response?.data?.errors?.[0]?.detail);
      console.log();
    }

    // Test 2: List products
    console.log('📦 Test 2: Listing existing products...');
    try {
      const productsResponse = await axios.get(`${BASE_URL}/products`, { headers });
      console.log('✅ Products API works!');
      console.log(`Found ${productsResponse.data.data?.length || 0} products`);
      if (productsResponse.data.data && productsResponse.data.data.length > 0) {
        console.log('First product:', JSON.stringify(productsResponse.data.data[0], null, 2));
      }
      console.log();
    } catch (error: any) {
      console.log('❌ Products API failed:', error.response?.status, error.response?.data?.errors?.[0]?.detail);
      console.log();
    }

    // Test 3: Try to create a product (THIS IS THE KEY TEST)
    console.log('🆕 Test 3: Attempting to CREATE a product...');
    try {
      const createProductPayload = {
        data: {
          type: 'products',
          attributes: {
            name: 'Test Beat - Lofi Chill',
            description: 'Test product created via API',
            status: 'draft',
          },
          relationships: {
            store: {
              data: {
                type: 'stores',
                id: '1', // Replace with actual store ID if we get it from Test 1
              },
            },
          },
        },
      };

      const createResponse = await axios.post(`${BASE_URL}/products`, createProductPayload, { headers });
      console.log('✅✅✅ PRODUCT CREATION WORKS!!! 🎉');
      console.log('Created product:', JSON.stringify(createResponse.data, null, 2));
      console.log();
    } catch (error: any) {
      console.log('❌ Product creation failed:', error.response?.status);
      if (error.response?.data) {
        console.log('Error details:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('Error message:', error.message);
      }
      console.log();
    }

    // Test 4: List files
    console.log('📁 Test 4: Listing files...');
    try {
      const filesResponse = await axios.get(`${BASE_URL}/files`, { headers });
      console.log('✅ Files API works!');
      console.log(`Found ${filesResponse.data.data?.length || 0} files`);
      if (filesResponse.data.data && filesResponse.data.data.length > 0) {
        console.log('First file:', JSON.stringify(filesResponse.data.data[0], null, 2));
      }
      console.log();
    } catch (error: any) {
      console.log('❌ Files API failed:', error.response?.status, error.response?.data?.errors?.[0]?.detail);
      console.log();
    }

    // Test 5: Try to upload a file (if possible)
    console.log('📤 Test 5: Attempting to UPLOAD a file...');
    try {
      const uploadPayload = {
        data: {
          type: 'files',
          attributes: {
            name: 'test-beat.mp4',
          },
        },
      };

      const uploadResponse = await axios.post(`${BASE_URL}/files`, uploadPayload, { headers });
      console.log('✅✅✅ FILE UPLOAD WORKS!!! 🎉');
      console.log('Upload response:', JSON.stringify(uploadResponse.data, null, 2));
      console.log();
    } catch (error: any) {
      console.log('❌ File upload failed:', error.response?.status);
      if (error.response?.data) {
        console.log('Error details:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('Error message:', error.message);
      }
      console.log();
    }

    // Test 6: List variants
    console.log('🎨 Test 6: Listing variants...');
    try {
      const variantsResponse = await axios.get(`${BASE_URL}/variants`, { headers });
      console.log('✅ Variants API works!');
      console.log(`Found ${variantsResponse.data.data?.length || 0} variants`);
      console.log();
    } catch (error: any) {
      console.log('❌ Variants API failed:', error.response?.status, error.response?.data?.errors?.[0]?.detail);
      console.log();
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏁 Test Summary:');
    console.log('If product creation worked, we can fully automate!');
    console.log('If it failed with 404/405, we need hybrid approach.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
  }
}

testAPI();
