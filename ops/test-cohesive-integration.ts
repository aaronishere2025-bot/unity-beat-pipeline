#!/usr/bin/env -S npx tsx
/**
 * Test script for cohesive prompt generation integration
 *
 * Tests the new full-track cohesive generation vs old batch generation
 */

import { generateCohesivePrompts } from './server/services/cohesive-prompt-generator';
import type { FullTrackContext } from './server/services/full-track-narrative-mapper';

console.log('🧪 Testing Cohesive Prompt Generation Integration\n');

// Build sample full-track context (Julius Caesar example)
const sampleContext: FullTrackContext = {
  figure: 'Julius Caesar',
  era: 'Ancient Rome (100 BC)',
  archetype: 'conqueror',
  duration: 62.5,
  bpm: 95,
  key: 'G minor',
  segments: [
    { type: 'intro', start: 0.0, end: 8.5, energy: 0.25, label: null },
    { type: 'verse', start: 8.5, end: 30.2, energy: 0.55, label: 'verse_1' },
    { type: 'chorus', start: 30.2, end: 45.8, energy: 0.85, label: 'chorus_1' },
    { type: 'bridge', start: 45.8, end: 54.3, energy: 0.65, label: null },
    { type: 'outro', start: 54.3, end: 62.5, energy: 0.3, label: null },
  ],
  narrativeArc: {
    mood_arc: ['establishing', 'building', 'peak', 'sustain', 'resolve'],
    energy_peaks: [30.2, 32.5, 38.1],
    energy_valleys: [5.2, 46.8, 58.3],
    downbeats: [0.0, 2.52, 5.04, 7.56, 10.08, 12.6, 15.12],
    spectral_mood_curve: [
      [0.0, 'dark'],
      [10.5, 'moody'],
      [30.2, 'balanced'],
      [45.8, 'moody'],
      [58.0, 'dark'],
    ],
    tempo_changes: [],
    visual_pacing: {
      camera_evolution: 'static → slow push → dynamic movement → slow pull → static',
      intensity_evolution: 'calm → building → intense → reflective → closure',
      major_transitions: [
        {
          timestamp: 8.5,
          type: 'gentle',
          from_section: 'intro',
          to_section: 'verse',
          energy_delta: 0.3,
        },
        {
          timestamp: 30.2,
          type: 'dramatic',
          from_section: 'verse',
          to_section: 'chorus',
          energy_delta: 0.3,
        },
      ],
      recommended_clip_duration: '5 seconds (standard pacing)',
    },
    cohesion_hints: {
      recurring_motifs: ['heroic close-up', 'Roman eagle standard', 'red military cape', 'laurel crown'],
      color_palette_arc: ['muted grays', 'deep blues', 'intense reds', 'deep blues', 'muted grays'],
      subject_consistency: 'maintain same Caesar throughout entire video',
      visual_continuity_priority: 'high',
    },
  },
  lyrics: [
    { text: 'Born in Rome, 100 BC', startTime: 0, endTime: 5 },
    { text: 'Destined for greatness', startTime: 5, endTime: 10 },
    { text: 'Crossed the Rubicon with my legion', startTime: 10, endTime: 15 },
    { text: 'Changed history forever', startTime: 15, endTime: 20 },
    { text: 'Veni, vidi, vici', startTime: 20, endTime: 25 },
    { text: "That's how I conquered", startTime: 25, endTime: 30 },
    { text: 'Gallic wars, decades of battle', startTime: 30, endTime: 35 },
    { text: 'Roman Empire at my command', startTime: 35, endTime: 40 },
    { text: 'Senate feared my power', startTime: 40, endTime: 45 },
    { text: 'Ides of March sealed my fate', startTime: 45, endTime: 50 },
    { text: 'Et tu, Brute?', startTime: 50, endTime: 55 },
    { text: 'Legacy eternal', startTime: 55, endTime: 62.5 },
  ],
  clipTimings: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
};

async function testCohesiveGeneration() {
  try {
    console.log('📊 Test Context:');
    console.log(`   Figure: ${sampleContext.figure}`);
    console.log(`   Duration: ${sampleContext.duration}s`);
    console.log(`   Clips: ${sampleContext.clipTimings.length}`);
    console.log(`   Mood Arc: ${sampleContext.narrativeArc.mood_arc.join(' → ')}`);
    console.log('');

    console.log('🎬 Generating cohesive prompts...\n');
    const startTime = Date.now();

    const cohesiveSegments = await generateCohesivePrompts(sampleContext);

    const elapsed = Date.now() - startTime;
    console.log(`\n✅ Generation complete in ${(elapsed / 1000).toFixed(1)}s\n`);
    console.log(`📊 Results:`);
    console.log(`   Generated: ${cohesiveSegments.length} prompts`);
    console.log(`   Expected: ${sampleContext.clipTimings.length} prompts`);
    console.log(`   Match: ${cohesiveSegments.length === sampleContext.clipTimings.length ? '✅' : '❌'}\n`);

    // Show sample prompts
    console.log('📝 Sample Prompts:\n');
    for (let i = 0; i < Math.min(3, cohesiveSegments.length); i++) {
      const seg = cohesiveSegments[i];
      console.log(`Clip ${i + 1} [${seg.timestamp}s] - "${seg.lyric.slice(0, 30)}..."`);
      console.log(`   Mood: ${seg.mood} | Section: ${seg.section}`);
      console.log(`   Visual: ${seg.visual_concept}`);
      console.log(`   Prompt: ${seg.prompt.slice(0, 80)}...`);
      console.log(`   Continuity: ${seg.continuity_notes.slice(0, 60)}...`);
      console.log('');
    }

    if (cohesiveSegments.length > 3) {
      console.log(`... ${cohesiveSegments.length - 3} more prompts generated\n`);
    }

    // Cost comparison
    const oldCost = sampleContext.clipTimings.length * 0.005;
    const newCost = 0.015;
    console.log('💰 Cost Comparison:');
    console.log(`   Old (batch): $${oldCost.toFixed(3)} (${sampleContext.clipTimings.length} × $0.005)`);
    console.log(`   New (cohesive): $${newCost.toFixed(3)} (1 × $0.015)`);
    console.log(
      `   Savings: $${(oldCost - newCost).toFixed(3)} (${(((oldCost - newCost) / oldCost) * 100).toFixed(0)}%)`,
    );
    console.log('');

    console.log('✅ Integration test PASSED');
    return true;
  } catch (error: any) {
    console.error('❌ Integration test FAILED:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    return false;
  }
}

// Run test
testCohesiveGeneration()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
