#!/usr/bin/env tsx
/**
 * Test Thompson Sampling + Natural Variation
 *
 * This script demonstrates:
 * 1. Thompson Sampling selecting music styles based on performance
 * 2. Random visual variations for each beat
 * 3. Integration of both systems
 */

import { sunoStyleBandit } from './server/services/suno-style-bandit';
import { genreThemeMapper } from './server/services/genre-theme-mapper';

async function testThompsonAndVariation() {
  console.log('🎰 TESTING THOMPSON SAMPLING + NATURAL VARIATION\n');
  console.log('='.repeat(70));

  // ============================================
  // PART 1: Thompson Sampling Status
  // ============================================
  console.log('\n📊 CURRENT THOMPSON SAMPLING STATE:\n');

  const status = sunoStyleBandit.getStatus();
  console.log(`Current Default: ${status.currentDefault}`);
  console.log(`Gamma Decay: ${status.gamma}`);
  console.log(`Total Pulls: ${status.totalPulls}\n`);

  console.log('Top 5 Performing Styles:');
  for (let i = 0; i < Math.min(5, status.arms.length); i++) {
    const arm = status.arms[i];
    console.log(`  ${i + 1}. ${arm.name}`);
    console.log(`     Success Rate: ${(arm.successRate * 100).toFixed(1)}%`);
    console.log(`     Pulls: ${arm.pulls}, Subs: ${arm.totalSubscribers}`);
    console.log(`     ${arm.isWinning ? '👑 CURRENT WINNER' : ''}`);
  }

  // ============================================
  // PART 2: Thompson Sampling Selection
  // ============================================
  console.log('\n\n🎵 THOMPSON SAMPLING STYLE SELECTION:\n');

  const selected = sunoStyleBandit.selectStyle();
  console.log(`Selected: ${selected.styleName}`);
  console.log(`Confidence: ${(selected.confidence * 100).toFixed(1)}%`);
  console.log(`Mode: ${selected.isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'}`);
  console.log(`\nFull Style Prompt:\n${selected.fullStylePrompt}\n`);

  // ============================================
  // PART 3: Natural Visual Variation
  // ============================================
  console.log('\n🎨 VISUAL THEME VARIATION TEST:\n');
  console.log('Generating 5 different themes for TRAP beats (145 BPM)...\n');

  const trapAnalysis = {
    bpm: 145,
    key: 'G minor',
    segments: [
      { type: 'intro', energy: 0.6 },
      { type: 'verse', energy: 0.8 },
      { type: 'chorus', energy: 0.9 },
      { type: 'drop', energy: 1.0 },
    ],
    energyCurve: [
      [0, 0.6],
      [30, 0.8],
      [60, 1.0],
    ] as [number, number][],
    dropPoints: [{ timestamp: 60, intensity: 1.0 }],
  };

  for (let i = 1; i <= 5; i++) {
    const theme = genreThemeMapper.selectTheme(trapAnalysis);
    console.log(`${i}. ${theme.description}`);
    console.log(`   Category: ${theme.category}`);
    console.log(`   Prompt: ${theme.prompt.substring(0, 120)}...`);
    console.log('');
  }

  // ============================================
  // PART 4: Combined System
  // ============================================
  console.log('\n💡 HOW THEY WORK TOGETHER:\n');
  console.log('1. 🎰 Thompson Sampling selects MUSIC STYLE (orchestral, trap, lofi, etc.)');
  console.log('   - Learns which music styles get more engagement');
  console.log('   - Balances exploration (trying new styles) vs exploitation (using winners)');
  console.log('   - Uses multi-objective reward: CTR + Retention + Subscribers\n');

  console.log('2. 🎨 Genre Theme Mapper adds VISUAL VARIETY');
  console.log('   - Random theme selection from genre pool (10+ per genre)');
  console.log('   - Random camera motions (zoom, pan, dolly, orbit)');
  console.log('   - Random color grading based on energy');
  console.log('   - Random quality enhancers and moods');
  console.log('   - RESULT: No two videos look the same!\n');

  console.log('3. 🔄 Feedback Loop');
  console.log('   - YouTube analytics feed back to Thompson Sampling');
  console.log('   - Winning styles get more alpha (success)');
  console.log('   - Gamma decay (0.95) ensures old trends fade out');
  console.log('   - Content sprints lock winning styles for 5 videos\n');

  // ============================================
  // PART 5: Recommendations
  // ============================================
  console.log('\n✅ RECOMMENDATIONS:\n');
  console.log('1. Generate 10-20 videos to give Thompson Sampling enough data');
  console.log('2. Upload to YouTube and let analytics flow back');
  console.log('3. System will automatically identify winning music styles');
  console.log('4. Visual variety is ALREADY working (every video is unique)');
  console.log('5. Check bandit status with: sunoStyleBandit.getStatus()\n');

  console.log('='.repeat(70));
}

testThompsonAndVariation().catch(console.error);
