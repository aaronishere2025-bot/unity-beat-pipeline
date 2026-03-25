/**
 * TEST: Adaptive Retry Prompting
 *
 * Shows how prompts are simplified on retry attempts
 */

import { klingVideoGenerator } from './server/services/kling-video-generator';

// Test the prompt simplification methods
function testPromptAdaptation() {
  console.log('🧪 Testing Adaptive Retry Prompt Logic\n');

  const testPrompts = [
    'Caesar dramatically crossing the Rubicon river, soldiers cheering behind him, cinematic dawn lighting, 4K historical epic',
    'Pope Formosus dramatically standing in grand cathedral, ornate religious robes, volumetric rays of light, photorealistic detail',
    'Genghis Khan riding dramatically across vast Mongolian steppe, army following, dramatic golden hour lighting, epic cinematography',
    'Viking warrior flying through the air during battle, impossible leap, supernatural strength',
  ];

  for (const originalPrompt of testPrompts) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 ORIGINAL PROMPT:');
    console.log(`   ${originalPrompt}`);
    console.log('');

    // Simulate attempt 2: Simplified
    const simplified = (klingVideoGenerator as any).simplifyPrompt(originalPrompt);
    console.log('🔄 ATTEMPT 2 (SIMPLIFIED):');
    console.log(`   ${simplified}`);
    console.log('   ✂️  Removed: adjectives, quality descriptors, lighting terms');
    console.log('');

    // Simulate attempt 3: Generic/safe
    const generic = (klingVideoGenerator as any).makePromptGeneric(originalPrompt);
    console.log('🔄 ATTEMPT 3 (GENERIC/SAFE):');
    console.log(`   ${generic}`);
    console.log('   ✂️  Removed: risky actions, replaced with grounded alternatives');
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✅ Adaptive retry logic will:');
  console.log('   1. Try original prompt first');
  console.log('   2. If fails → Try simplified (remove fluff)');
  console.log('   3. If fails → Try generic/safe (remove risky actions)');
  console.log('   4. Log which attempt succeeded for learning');
  console.log('\n📊 Data logged in api_usage table:');
  console.log('   - retryAttempt (1, 2, or 3)');
  console.log('   - promptStrategy (original, simplified, generic)');
  console.log('   - originalPrompt (what we wanted)');
  console.log('   - adaptedPrompt (what actually worked)');
  console.log('   - adaptiveRetryUsed (true/false)');
}

testPromptAdaptation();
