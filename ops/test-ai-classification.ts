/**
 * Test AI-Powered Character Type Classification
 * Verifies that topics like "Pope Stephen VI" are correctly classified as historical humans
 */

import { UnityContentGenerator } from './server/services/unity-content-generator';
import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function testAIClassification() {
  console.log('🧪 Testing AI-Powered Character Classification\n');
  console.log('='.repeat(80));

  // Load secrets first
  try {
    await initializeSecretsFromGCP();
    console.log('✅ Secrets loaded from GCP\n');
  } catch (error: any) {
    console.error(`❌ Failed to load secrets: ${error.message}`);
    process.exit(1);
  }

  const generator = new UnityContentGenerator();

  // Test cases to validate AI classification
  const testCases = [
    {
      topic: 'Pope Stephen VI',
      expectedType: 'historical_human',
      expectedHistorical: true,
      description: 'Medieval Catholic Pope',
    },
    {
      topic: 'The Story of Julius Caesar',
      expectedType: 'historical_human',
      expectedHistorical: true,
      description: 'Roman historical figure',
    },
    {
      topic: 'Talking dragon adventure',
      expectedType: 'mythical_creature',
      expectedHistorical: false,
      description: 'Fantasy creature',
    },
    {
      topic: 'How photosynthesis works',
      expectedType: 'anthropomorphic_animal',
      expectedHistorical: false,
      description: 'Educational content',
    },
    {
      topic: 'Napoleon Bonaparte',
      expectedType: 'historical_human',
      expectedHistorical: true,
      description: 'French Emperor',
    },
    {
      topic: 'The Rise of Genghis Khan',
      expectedType: 'historical_human',
      expectedHistorical: true,
      description: 'Mongol Emperor',
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    console.log(`\n📝 Testing: "${testCase.topic}"`);
    console.log(`   Expected: ${testCase.expectedType} (Historical: ${testCase.expectedHistorical})`);
    console.log(`   Description: ${testCase.description}`);
    console.log('-'.repeat(80));

    try {
      const result = await generator.analyzeContentCharacters(testCase.topic);

      console.log(`\n   ✅ Classification complete:`);
      console.log(`      - Character Type: ${result.characterType}`);
      console.log(`      - Reasoning: ${result.reasoning}`);

      // Determine if historical based on character type
      const isHistorical = result.characterType === 'historical_human';

      // Check if result matches expectations
      const typeMatch = result.characterType === testCase.expectedType;
      const historicalMatch = isHistorical === testCase.expectedHistorical;

      if (typeMatch && historicalMatch) {
        console.log(`\n   ✅ PASS - Classification correct!`);
        passCount++;
      } else {
        console.log(`\n   ❌ FAIL - Classification mismatch!`);
        if (!typeMatch) {
          console.log(`      Expected type: ${testCase.expectedType}, Got: ${result.characterType}`);
        }
        if (!historicalMatch) {
          console.log(`      Expected historical: ${testCase.expectedHistorical}, Got: ${isHistorical}`);
        }
        failCount++;
      }
    } catch (error: any) {
      console.error(`\n   ❌ ERROR: ${error.message}`);
      console.error(`   Stack: ${error.stack?.slice(0, 500)}`);
      failCount++;
    }

    console.log('='.repeat(80));
  }

  // Summary
  console.log(`\n\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passCount}/${testCases.length}`);
  console.log(`   ❌ Failed: ${failCount}/${testCases.length}`);
  console.log(`   Success Rate: ${((passCount / testCases.length) * 100).toFixed(1)}%`);

  if (failCount === 0) {
    console.log(`\n🎉 All tests passed! AI classification is working correctly.`);
  } else {
    console.log(`\n⚠️ Some tests failed. Review the results above.`);
    process.exit(1);
  }
}

// Run the test
testAIClassification().catch((error) => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
