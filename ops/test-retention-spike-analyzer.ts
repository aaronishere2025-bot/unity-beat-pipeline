#!/usr/bin/env tsx
/**
 * Test retention spike analyzer with simulated data
 */

import { retentionSpikeAnalyzer } from './server/services/retention-spike-analyzer';

async function testRetentionAnalysis() {
  console.log('🧪 TESTING RETENTION SPIKE & DROP ANALYZER\n');
  console.log('='.repeat(70));

  // Simulated retention curve for a 60-second video
  const retentionCurve = [
    { second: 0, retention: 100 },
    { second: 1, retention: 95 }, // Small drop (normal)
    { second: 2, retention: 92 },
    { second: 3, retention: 88 }, // Hook checkpoint
    { second: 4, retention: 85 },
    { second: 5, retention: 83 },
    { second: 10, retention: 75 },
    { second: 15, retention: 68 },
    { second: 20, retention: 72 }, // 🚀 SPIKE! (+4%)
    { second: 25, retention: 74 }, // 🚀 SPIKE continues
    { second: 30, retention: 70 },
    { second: 35, retention: 55 }, // 📉 BIG DROP (-15%)
    { second: 40, retention: 50 },
    { second: 45, retention: 62 }, // 🚀 MAJOR SPIKE! (+12%)
    { second: 50, retention: 65 },
    { second: 55, retention: 58 },
    { second: 60, retention: 55 },
  ];

  // Simulated video features (what happened at each timestamp)
  const videoFeatures = [
    {
      timestamp: 18,
      type: 'beat_drop' as const,
      intensity: 0.9,
      description: 'massive 808 drop at 140 BPM',
    },
    {
      timestamp: 19,
      type: 'visual_transition' as const,
      intensity: 0.8,
      description: 'zoom burst transition',
    },
    {
      timestamp: 33,
      type: 'visual_transition' as const,
      intensity: 0.3,
      description: 'slow fade transition',
    },
    {
      timestamp: 34,
      type: 'audio_peak' as const,
      intensity: 0.2,
      description: 'low energy ambient section',
    },
    {
      timestamp: 43,
      type: 'beat_drop' as const,
      intensity: 1.0,
      description: 'epic bass drop with visual sync',
    },
    {
      timestamp: 44,
      type: 'text_overlay' as const,
      intensity: 0.7,
      description: 'animated text reveal',
    },
  ];

  // Run analysis
  console.log('\n🔍 ANALYZING VIDEO RETENTION...\n');

  const insights = await retentionSpikeAnalyzer.analyzeVideo('test-video-001', retentionCurve, videoFeatures);

  // Print results
  console.log('\n' + '='.repeat(70));
  console.log('📊 RETENTION ANALYSIS RESULTS');
  console.log('='.repeat(70));

  console.log(`\n📈 OVERALL SCORE: ${insights.score.overall.toFixed(1)}/100`);
  console.log(`   Hook (3s): ${insights.score.hook.toFixed(1)}%`);
  console.log(`   End Retention: ${insights.score.retention.toFixed(1)}%`);
  console.log(`   Rewatch Score: ${insights.score.rewatch.toFixed(1)}/100`);

  // What's working (spikes)
  console.log(`\n✅ WHAT'S WORKING (${insights.spikes.length} retention spikes)`);
  console.log('─'.repeat(70));
  insights.spikes.forEach((spike, i) => {
    const icon = spike.severity === 'exceptional' ? '🌟' : spike.severity === 'major' ? '💪' : '✨';
    console.log(
      `   ${icon} Spike ${i + 1} at ${spike.second}s: +${spike.spikePercentage.toFixed(1)}% (${spike.severity})`,
    );
    if (spike.reason) {
      console.log(`      Reason: ${spike.reason}`);
    }
  });

  // What's not working (drops)
  console.log(`\n❌ WHAT'S NOT WORKING (${insights.drops.length} retention drops)`);
  console.log('─'.repeat(70));
  insights.drops.forEach((drop, i) => {
    const icon = drop.severity === 'critical' ? '🚨' : drop.severity === 'major' ? '⚠️' : '📉';
    console.log(`   ${icon} Drop ${i + 1} at ${drop.second}s: -${drop.dropPercentage.toFixed(1)}% (${drop.severity})`);
    if (drop.reason) {
      console.log(`      Cause: ${drop.reason}`);
    }
  });

  // Success patterns
  if (insights.successPatterns.length > 0) {
    console.log(`\n🎯 SUCCESS PATTERNS (Do MORE of these)`);
    console.log('─'.repeat(70));
    insights.successPatterns.forEach((pattern, i) => {
      console.log(`   ${i + 1}. ${pattern.feature}`);
      console.log(
        `      → +${pattern.avgSpikePercentage.toFixed(1)}% avg spike | ${pattern.occurrences} occurrences | ${(pattern.confidence * 100).toFixed(0)}% confidence`,
      );
    });
  }

  // Failure patterns
  if (insights.failurePatterns.length > 0) {
    console.log(`\n🚫 FAILURE PATTERNS (Do LESS of these)`);
    console.log('─'.repeat(70));
    insights.failurePatterns.forEach((pattern, i) => {
      console.log(`   ${i + 1}. ${pattern.feature}`);
      console.log(
        `      → -${pattern.avgDropPercentage.toFixed(1)}% avg drop | ${pattern.occurrences} occurrences | ${(pattern.confidence * 100).toFixed(0)}% confidence`,
      );
    });
  }

  // Positive insights
  console.log(`\n💡 DO MORE OF:`);
  console.log('─'.repeat(70));
  insights.doMoreOf.forEach((insight) => {
    console.log(`   ${insight}`);
  });

  // Negative insights
  console.log(`\n⛔ DO LESS OF:`);
  console.log('─'.repeat(70));
  insights.doLessOf.forEach((insight) => {
    console.log(`   ${insight}`);
  });

  // Recommendations
  console.log(`\n📋 RECOMMENDATIONS`);
  console.log('─'.repeat(70));

  if (insights.recommendations.immediate.length > 0) {
    console.log(`\n🔴 IMMEDIATE (Fix these now):`);
    insights.recommendations.immediate.forEach((rec) => {
      console.log(`   • ${rec}`);
    });
  }

  if (insights.recommendations.strategic.length > 0) {
    console.log(`\n🟡 STRATEGIC (Consider for future):`);
    insights.recommendations.strategic.forEach((rec) => {
      console.log(`   • ${rec}`);
    });
  }

  if (insights.recommendations.experiment.length > 0) {
    console.log(`\n🟢 EXPERIMENT (Worth testing):`);
    insights.recommendations.experiment.forEach((rec) => {
      console.log(`   • ${rec}`);
    });
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ ANALYSIS COMPLETE`);
  console.log(`${'='.repeat(70)}\n`);

  // Test pattern checking
  console.log('\n🧪 TESTING PATTERN CHECKING...\n');

  const beatDropCheck = retentionSpikeAnalyzer.isSuccessful('beat_drop', 'massive 808 drop at 140 BPM');
  console.log(`   Beat drop success: ${beatDropCheck.isSuccessful}`);
  console.log(`   Confidence: ${(beatDropCheck.confidence * 100).toFixed(0)}%`);
  if (beatDropCheck.avgSpike) {
    console.log(`   Avg spike: +${beatDropCheck.avgSpike.toFixed(1)}%`);
  }

  const slowFadeCheck = retentionSpikeAnalyzer.isProblematic('visual_transition', 'slow fade transition');
  console.log(`\n   Slow fade problematic: ${slowFadeCheck.isProblematic}`);
  console.log(`   Confidence: ${(slowFadeCheck.confidence * 100).toFixed(0)}%`);
  if (slowFadeCheck.avgDrop) {
    console.log(`   Avg drop: -${slowFadeCheck.avgDrop.toFixed(1)}%`);
  }

  console.log(`\n✨ Retention spike analyzer is working!\n`);
}

testRetentionAnalysis().catch(console.error);
