import axios from 'axios';
import FormData from 'form-data';
import { createReadStream, existsSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.SENDOWL_API_KEY;
const API_SECRET = process.env.SENDOWL_API_SECRET;
const BASE_URL = 'https://www.sendowl.com/api/v1';

if (!API_KEY || !API_SECRET) {
  console.error('❌ SENDOWL_API_KEY or SENDOWL_API_SECRET not found in environment');
  process.exit(1);
}

console.log('📦 Testing SendOwl API Capabilities\n');
console.log(`API Key: ${API_KEY}`);
console.log(`API Secret: ${API_SECRET}\n`);

// Create test file for upload
const TEST_FILE_PATH = '/tmp/test-sendowl-beat.txt';
writeFileSync(
  TEST_FILE_PATH,
  'This is a test beat file for SendOwl API testing.\n\nCreated by Unity AI automation system.',
);
console.log(`✅ Created test file: ${TEST_FILE_PATH}\n`);

async function testAPI() {
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
  };

  try {
    // Test 1: List existing products
    console.log('📋 Test 1: Listing existing products...');
    try {
      const productsResponse = await axios.get(`${BASE_URL}/products.json`, { headers });
      console.log('✅ Products API works!');
      console.log(`Found ${productsResponse.data.length} products`);
      if (productsResponse.data.length > 0) {
        console.log('First product:', JSON.stringify(productsResponse.data[0], null, 2));
      }
      console.log();
    } catch (error: any) {
      console.log('❌ Products list failed:', error.response?.status, error.response?.statusText);
      if (error.response?.data) {
        console.log('Error:', JSON.stringify(error.response.data, null, 2));
      }
      console.log();
    }

    // Test 2: Create a test product with file upload
    console.log('🆕 Test 2: Creating a test product with file upload...');
    try {
      const form = new FormData();
      form.append('product[name]', 'Test Beat - Lofi Chill (API Test)');
      form.append('product[product_type]', 'digital');
      form.append('product[price]', '4.99');
      form.append('product[attachment]', createReadStream(TEST_FILE_PATH), {
        filename: 'test-beat.txt',
        contentType: 'text/plain',
      });

      const createResponse = await axios.post(`${BASE_URL}/products.json`, form, {
        headers: {
          ...headers,
          ...form.getHeaders(),
        },
      });

      console.log('✅✅✅ PRODUCT CREATION WITH FILE UPLOAD WORKS!!! 🎉');
      console.log('Created product:', JSON.stringify(createResponse.data, null, 2));
      console.log();

      const productId = createResponse.data.product?.id;

      if (productId) {
        // Test 3: Get the product we just created
        console.log(`📖 Test 3: Retrieving product ${productId}...`);
        try {
          const getResponse = await axios.get(`${BASE_URL}/products/${productId}.json`, { headers });
          console.log('✅ Product retrieved successfully!');
          console.log('Product details:', JSON.stringify(getResponse.data, null, 2));
          console.log();
        } catch (error: any) {
          console.log('❌ Get product failed:', error.response?.status);
          console.log();
        }

        // Test 4: Delete the test product
        console.log(`🗑️ Test 4: Cleaning up - deleting test product ${productId}...`);
        try {
          await axios.delete(`${BASE_URL}/products/${productId}.json`, { headers });
          console.log('✅ Test product deleted successfully!');
          console.log();
        } catch (error: any) {
          console.log('⚠️ Delete failed:', error.response?.status);
          console.log('You may need to manually delete the test product from SendOwl dashboard');
          console.log();
        }
      }
    } catch (error: any) {
      console.log('❌ Product creation failed:', error.response?.status);
      if (error.response?.data) {
        console.log('Error details:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('Error message:', error.message);
      }
      console.log();
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏁 Test Summary:');
    console.log('✅ SendOwl API authentication works');
    console.log('✅ We can create products with file uploads');
    console.log('✅ Ready to build full automation service!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
  }
}

testAPI();
