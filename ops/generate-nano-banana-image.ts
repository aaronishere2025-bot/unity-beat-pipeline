#!/usr/bin/env tsx
/**
 * Generate Nano Banana album cover using Gemini image generation
 */
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function generateNanoBananaImage() {
  try {
    console.log('🎨 Generating Nano Banana album cover with Gemini...');

    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Generate a vivid description of this album cover art concept, then I'll use it for generation:

Vibrant neon album cover art: A glowing nano-sized banana with cyberpunk aesthetics, floating in a cosmic space filled with colorful sound waves and musical notes, holographic effects, electric pink and cyan colors, synthwave vibes, futuristic digital art, ultra detailed, perfect for music visualization, 1024x1024`;

    // Use Gemini to generate an enhanced prompt description
    const result = await model.generateContent(prompt);
    const description = result.response.text();

    console.log('✅ Enhanced description generated!');
    console.log('');
    console.log('🎨 Description:', description.substring(0, 500));
    console.log('');

    // Save the description for manual image generation
    const outputFile = join(process.cwd(), 'nano-banana-image-prompt.txt');
    writeFileSync(
      outputFile,
      `Nano Banana Album Cover - Gemini Enhanced Prompt\n\n${description}\n\nOriginal Prompt: Vibrant neon album cover art: A glowing nano-sized banana with cyberpunk aesthetics, floating in a cosmic space filled with colorful sound waves and musical notes, holographic effects, electric pink and cyan colors, synthwave vibes, futuristic digital art, ultra detailed, perfect for music visualization\n`,
    );
    console.log('✅ Prompt saved to: nano-banana-image-prompt.txt');
    console.log('');
    console.log('💡 To generate the actual image, use Google AI Studio or Gemini image generation API');

    return description;
  } catch (error: any) {
    console.error('❌ Error generating image:', error.message);
    throw error;
  }
}

generateNanoBananaImage()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
