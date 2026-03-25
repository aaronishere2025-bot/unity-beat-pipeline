#!/usr/bin/env tsx
/**
 * Test assigning a beat to a Gumroad slot
 */

import { gumroadSlotManager } from './server/services/gumroad-slot-manager';

async function testAssignment() {
  console.log('🧪 TESTING GUMROAD SLOT ASSIGNMENT\n');

  try {
    // Test assigning a beat
    const result = await gumroadSlotManager.assignBeatToSlot({
      jobId: 'test-job-123',
      beatName: '🔥 Dark Trap Beat - "Midnight" | 140 BPM',
      description: `Dark trap, 140 BPM, heavy 808 bass, crispy hi-hats, menacing synths

🎵 Professional quality trap beat
⚡ 140 BPM
🎹 Perfect for freestyle, content creation, or just vibing

✨ Features:
• High-quality MP4 video format
• Instant download after purchase
• 100% original composition
• Ready for commercial use

Get this beat now and elevate your content!`,
      price: 4.99,
      tags: ['trap', 'type beat', 'dark trap', 'beats', 'instrumental'],
    });

    console.log('\n✅ SLOT ASSIGNMENT SUCCESSFUL!\n');
    console.log(`Slot ID: ${result.slotId}`);
    console.log(`Gumroad Product ID: ${result.gumroadProductId}`);
    console.log(`Gumroad URL: ${result.gumroadUrl}`);

    console.log('\n📝 Next steps:');
    console.log(`1. Go to: https://app.gumroad.com/products`);
    console.log(`2. Find product: ${result.gumroadUrl}`);
    console.log(`3. Verify title changed to: "🔥 Dark Trap Beat - "Midnight" | 140 BPM"`);
    console.log(`4. Upload your beat video file`);
    console.log(`5. Publish the product\n`);
  } catch (error: any) {
    console.error('\n❌ SLOT ASSIGNMENT FAILED\n');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testAssignment();
