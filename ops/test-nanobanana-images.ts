#!/usr/bin/env tsx
/**
 * Test NanoBanana (Gemini Image Generation)
 *
 * Generates vibrant test images using DALL-E 3 (Vertex AI Imagen fallback when available)
 */

import { initializeSecretsWithFallback } from './server/secret-manager-loader.js';
import { geminiImageService } from './server/services/gemini-image-service.js';
import * as path from 'path';
import { join } from 'path';

console.log('🍌 Testing NanoBanana Image Generation\n');

async function main() {
  // Load secrets
  console.log('🔑 Loading API keys...');
  await initializeSecretsWithFallback();

  const outputPath = join(process.cwd(), 'data', 'temp', 'processing', 'nanobanana-test');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎨 Test 1: Vibrant Abstract Art');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const test1 = await geminiImageService.generateImage({
    prompt: 'Colorful abstract explosion of paint, dynamic movement, liquid colors flowing',
    style: 'vibrant',
    aspectRatio: '16:9',
    numberOfImages: 1,
    outputFormat: 'file',
    outputPath,
  });

  console.log(`✅ Generated: ${test1[0].filePath}`);
  console.log(`💰 Cost: $${test1[0].cost.toFixed(3)}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎬 Test 2: Cinematic Scene');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const test2 = await geminiImageService.generateImage({
    prompt: 'Epic mountain landscape at golden hour, dramatic clouds, sun rays breaking through',
    style: 'cinematic',
    aspectRatio: '16:9',
    numberOfImages: 1,
    outputFormat: 'file',
    outputPath,
  });

  console.log(`✅ Generated: ${test2[0].filePath}`);
  console.log(`💰 Cost: $${test2[0].cost.toFixed(3)}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📸 Test 3: Character Portrait');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const test3 = await geminiImageService.generateCharacterImage({
    name: 'Alexander the Great',
    description: 'Young Macedonian king, determined expression, ancient Greek armor',
    era: '356-323 BC',
    style: 'photorealistic',
    outputPath,
  });

  console.log(`✅ Generated: ${test3.filePath}`);
  console.log(`💰 Cost: $${test3.cost.toFixed(3)}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎭 Test 4: YouTube Thumbnail');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const test4 = await geminiImageService.generateThumbnail({
    topic: 'Ancient Rome Collapse',
    style: 'dramatic historical scene with soldiers',
    emotion: 'epic and intense',
    outputPath,
  });

  console.log(`✅ Generated: ${test4.filePath}`);
  console.log(`💰 Cost: $${test4.cost.toFixed(3)}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ ALL TESTS COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const totalCost = [test1, test2, test3, test4].reduce((sum, results) => {
    const result = Array.isArray(results) ? results[0] : results;
    return sum + result.cost;
  }, 0);

  console.log(`📁 Output directory: ${outputPath}`);
  console.log(`💰 Total cost: $${totalCost.toFixed(3)}`);
  console.log('\n🎉 NanoBanana is ready to generate vibrant images!\n');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
