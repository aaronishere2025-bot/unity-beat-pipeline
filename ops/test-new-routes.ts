/**
 * Test script for the two new routes:
 * 1. GET /api/youtube/video-suggestions/:videoId - AI video suggestions
 * 2. POST /api/beats/generate-batch - Batch beat generation
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:8080';
const AUTH_TOKEN = 'your-jwt-token-here'; // Replace with actual token

async function testVideoSuggestions() {
  console.log('\n🎬 Testing AI Video Suggestions Route...');
  try {
    const videoId = 'YOUR_VIDEO_ID'; // Replace with actual YouTube video ID
    const response = await axios.get(`${BASE_URL}/api/youtube/video-suggestions/${videoId}`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    });

    console.log('✅ Video Suggestions Response:');
    console.log(response.data);
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

async function testBatchBeatGeneration() {
  console.log('\n🎵 Testing Batch Beat Generation Route...');
  try {
    const response = await axios.post(
      `${BASE_URL}/api/beats/generate-batch`,
      {
        count: 3,
        style: 'trap, dark vibes, 140 BPM, heavy 808s',
        bpm: 140,
        title: 'Dark Trap Beat',
      },
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('✅ Batch Beat Generation Response:');
    console.log(response.data);
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

async function main() {
  console.log('🚀 Testing New Routes...\n');

  // Test both routes
  await testVideoSuggestions();
  await testBatchBeatGeneration();

  console.log('\n✨ Tests completed!\n');
}

main();
