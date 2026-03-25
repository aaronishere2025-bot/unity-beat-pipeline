/**
 * Test script for Lyrics Quality Validator
 *
 * Tests the lyrics quality validation service with various scenarios:
 * 1. Good quality lyrics (should pass)
 * 2. Poor quality lyrics (should fail and regenerate)
 * 3. Offensive content (should fail appropriateness check)
 * 4. Historical content validation
 */

import { lyricsQualityValidator } from '../server/services/lyrics-quality-validator';
import { initializeSecretsFromGCP } from '../server/secret-manager-loader';

// Sample lyrics for testing
const GOOD_LYRICS = `[INTRO]
They killed my father, enslaved me at *nine*
Came back and erased their whole *bloodline*
From prisoner boy to the *world's* greatest khan
This is the story of how empires are *born*

[VERSE 1]
Temüjin, that's the name they gave me at *birth*
Father poisoned by rivals, left my family in the *dirt*
Tamir clan threw us out, left us starving in the *cold*
Mother kept us alive when I was nine years *old*
Captured, enslaved, wore a wooden *cangue*
Escaped in the river, learned never to *pause*
Built my crew from the outcasts, the broken, the *scarred*
Made loyalty sacred, we became *hard*

[CHORUS]
When you got nothing left, you got nothing to *lose*
When they take everything, you rewrite the *rules*
Unity is power when you're building from *dust*
Genghis Khan, from slave boy to *trust*

[VERSE 2]
Married Börte, she got kidnapped by the Merkits *soon*
I gathered every ally, hunted them by the *moon*
Got her back, learned that lesson about *strength*
You don't just survive, you go to any *length*
United the tribes, they said it couldn't be *done*
Steppe was fractured, I made them *one*
Merit over birthright, that was the *key*
Promote by skill, that's how you're *free*

[CHORUS]
When you got nothing left, you got nothing to *lose*
When they take everything, you rewrite the *rules*
Unity is power when you're building from *dust*
Genghis Khan, from slave boy to *trust*

[BRIDGE]
Built the largest empire the world ever *saw*
Postal system, religious freedom, trade without *flaw*
Twenty million died, yeah, the cost was *high*
But I changed the world before I said good*bye*

[OUTRO]
Question for you, living in your *time*
When the world's divided, will you make them *climb*?
Can't build an empire without breaking some *walls*
Genghis Khan, this is how a legend *calls*`;

const POOR_LYRICS = `[INTRO]
this is a song about stuff
thing happen and its rough

[VERSE 1]
i walk down the street
people i meet
some are neat
they got feet

[CHORUS]
la la la la
things are good
la la la la
in the neighborhood

[VERSE 2]
stuff happens every day
i dont know what to say
maybe things will be okay
lets just go and play`;

const OFFENSIVE_LYRICS = `[INTRO]
Listen up you stupid [EXPLICIT SLUR]
I'm gonna tell you how it is

[VERSE 1]
Violence and hate for everyone
Gratuitous content just for fun
[EXPLICIT CONTENT REMOVED]

[CHORUS]
Burn it all down
Watch them drown
This is inappropriate content
With zero artistic merit or context`;

const HISTORICAL_LYRICS = `[INTRO]
Born Octavian, they said I'd never *rule*
Used strategy and patience, played them like a *fool*
Became Augustus Caesar, first emperor of *Rome*
This is how I turned a republic into my *throne*

[VERSE 1]
Adopted son of Caesar, watched him get *stabbed*
Thirteen years old when they took what I *had*
Mark Antony and Brutus thought they'd push me a*side*
But I played the long game, let them divide their *pride*
Formed the Second Triumvirate, split up the *power*
Cleopatra seduced Antony, I waited for my *hour*
Battle of Actium, navy versus *navy*
Victory made me emperor, no longer maybe *maybe*

[CHORUS]
Pax Romana, peace through *strength*
Forty years of rule, I went the *length*
Built an empire that would last centur*ies*
Augustus Caesar, from chaos to *peace*`;

async function testLyricsValidator() {
  console.log('🧪 Testing Lyrics Quality Validator\n');

  try {
    // Initialize secrets
    console.log('🔐 Loading secrets from Google Secret Manager...');
    await initializeSecretsFromGCP();
    console.log('✅ Secrets loaded\n');

    // Test 1: Good quality lyrics
    console.log('='.repeat(80));
    console.log('TEST 1: GOOD QUALITY LYRICS (Genghis Khan)');
    console.log('='.repeat(80));

    const result1 = await lyricsQualityValidator.validateLyrics(GOOD_LYRICS, {
      topic: 'The Rise of Genghis Khan',
      message: 'How the greatest conqueror built unity from chaos',
      targetDuration: 120,
      bpm: 85,
      structure: 'intro-verse-chorus-verse-chorus-bridge-outro',
      isHistorical: true,
    });

    console.log('\n📊 RESULTS:');
    console.log(`   Overall Score: ${result1.overallScore}/100 ${result1.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Grammar: ${result1.criteria.grammarScore}/20`);
    console.log(`   Rhyme: ${result1.criteria.rhymeScore}/20`);
    console.log(`   Flow: ${result1.criteria.flowScore}/20`);
    console.log(`   Coherence: ${result1.criteria.coherenceScore}/20`);
    console.log(`   Appropriateness: ${result1.criteria.appropriatenessScore}/20`);

    if (result1.feedback.suggestions.length > 0) {
      console.log('\n💡 Suggestions:');
      result1.feedback.suggestions.forEach((s) => console.log(`   - ${s}`));
    }

    // Test 2: Poor quality lyrics
    console.log('\n' + '='.repeat(80));
    console.log('TEST 2: POOR QUALITY LYRICS');
    console.log('='.repeat(80));

    const result2 = await lyricsQualityValidator.validateLyrics(POOR_LYRICS, {
      topic: 'Walking down the street',
      message: 'Random stuff happening',
      targetDuration: 60,
      bpm: 90,
      structure: 'intro-verse-chorus-verse',
    });

    console.log('\n📊 RESULTS:');
    console.log(`   Overall Score: ${result2.overallScore}/100 ${result2.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Grammar: ${result2.criteria.grammarScore}/20`);
    console.log(`   Rhyme: ${result2.criteria.rhymeScore}/20`);
    console.log(`   Flow: ${result2.criteria.flowScore}/20`);
    console.log(`   Coherence: ${result2.criteria.coherenceScore}/20`);
    console.log(`   Appropriateness: ${result2.criteria.appropriatenessScore}/20`);

    if (result2.criticalIssues.length > 0) {
      console.log('\n⚠️  Critical Issues:');
      result2.criticalIssues.forEach((issue) => console.log(`   - ${issue}`));
    }

    if (result2.shouldRegenerate) {
      console.log('\n🔄 REGENERATION RECOMMENDED');
      const improvements = lyricsQualityValidator.generateImprovementInstructions(result2);
      console.log('\nImprovement Instructions:');
      console.log(improvements);
    }

    // Test 3: Offensive content
    console.log('\n' + '='.repeat(80));
    console.log('TEST 3: OFFENSIVE CONTENT');
    console.log('='.repeat(80));

    const result3 = await lyricsQualityValidator.validateLyrics(OFFENSIVE_LYRICS, {
      topic: 'Inappropriate content',
      message: 'Testing content filters',
      targetDuration: 45,
      bpm: 100,
    });

    console.log('\n📊 RESULTS:');
    console.log(`   Overall Score: ${result3.overallScore}/100 ${result3.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Appropriateness: ${result3.criteria.appropriatenessScore}/20`);

    if (result3.feedback.appropriatenessIssues.length > 0) {
      console.log('\n🚫 Appropriateness Issues:');
      result3.feedback.appropriatenessIssues.forEach((issue) => console.log(`   - ${issue}`));
    }

    // Test 4: Historical content
    console.log('\n' + '='.repeat(80));
    console.log('TEST 4: HISTORICAL CONTENT (Augustus Caesar)');
    console.log('='.repeat(80));

    const result4 = await lyricsQualityValidator.validateLyrics(HISTORICAL_LYRICS, {
      topic: 'Augustus Caesar: First Emperor of Rome',
      message: 'How Augustus brought peace after decades of civil war',
      targetDuration: 90,
      bpm: 88,
      structure: 'intro-verse-chorus',
      isHistorical: true,
      deepResearch: {
        basicInfo: {
          fullName: 'Augustus Caesar',
          lived: '63 BC - 14 AD',
        },
      },
    });

    console.log('\n📊 RESULTS:');
    console.log(`   Overall Score: ${result4.overallScore}/100 ${result4.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Grammar: ${result4.criteria.grammarScore}/20`);
    console.log(`   Rhyme: ${result4.criteria.rhymeScore}/20`);
    console.log(`   Flow: ${result4.criteria.flowScore}/20`);
    console.log(`   Coherence: ${result4.criteria.coherenceScore}/20`);
    console.log(`   Appropriateness: ${result4.criteria.appropriatenessScore}/20`);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Test 1 (Good Lyrics): ${result1.passed ? 'PASSED' : 'FAILED'} (${result1.overallScore}/100)`);
    console.log(
      `❌ Test 2 (Poor Lyrics): ${result2.passed ? 'PASSED (unexpected)' : 'FAILED (expected)'} (${result2.overallScore}/100)`,
    );
    console.log(
      `🚫 Test 3 (Offensive): ${result3.passed ? 'PASSED (BAD!)' : 'FAILED (expected)'} (${result3.overallScore}/100)`,
    );
    console.log(`✅ Test 4 (Historical): ${result4.passed ? 'PASSED' : 'FAILED'} (${result4.overallScore}/100)`);

    console.log('\n✅ All tests completed!');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testLyricsValidator().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
