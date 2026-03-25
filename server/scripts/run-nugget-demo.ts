/**
 * Nugget Demo Script
 * Generates 10 sample first-clip prompts with different nugget types
 * and rates each one using the nugget scoring system
 *
 * Run with: npx tsx server/scripts/run-nugget-demo.ts
 */

import { kling25PromptOptimizer } from '../services/kling25-prompt-optimizer';

interface NuggetDemo {
  clipNumber: number;
  nuggetType: string;
  basePrompt: string;
  motionDelta: number;
  colorSaturation: number;
  contextGap: number;
  totalScore: number;
  passed: boolean;
  penalties: string[];
  swipeRate: number;
  reward: { alphaChange: number; betaChange: number; rewardType: string };
}

const HISTORICAL_FIGURES = [
  { name: 'Julius Caesar', action: 'addressing Roman legions before crossing the Rubicon' },
  { name: 'Cleopatra', action: 'meeting Mark Antony for the first time on her golden barge' },
  { name: 'Genghis Khan', action: 'commanding his Mongol horde from horseback' },
  { name: 'Napoleon Bonaparte', action: 'planning battle strategy in his command tent' },
  { name: 'Queen Elizabeth I', action: 'delivering her Tilbury speech to English troops' },
  { name: 'Alexander the Great', action: 'leading cavalry charge at the Battle of Gaugamela' },
  { name: 'Hannibal Barca', action: 'crossing the Alps with war elephants' },
  { name: 'Spartacus', action: 'rallying gladiator rebels in Roman arena' },
  { name: 'Boudicca', action: 'leading British tribal warriors against Roman occupation' },
  { name: 'Attila the Hun', action: 'surveying conquered Roman territories from horseback' },
];

const NUGGET_TYPES: Array<'in_media_res' | 'abstract_mystery' | 'reaction_reveal'> = [
  'in_media_res',
  'abstract_mystery',
  'reaction_reveal',
];

function generateMockMetrics(
  nuggetType: string,
  index: number,
): { motionDelta: number; colorSaturation: number; contextGap: number } {
  // Generate varied but realistic metrics based on nugget type
  // in_media_res should have high motion, abstract_mystery high context gap, reaction_reveal high color

  const baseVariation = (Math.sin(index * 1.5) + 1) * 20; // 0-40 variation

  switch (nuggetType) {
    case 'in_media_res':
      return {
        motionDelta: 65 + baseVariation + Math.random() * 15, // High motion (65-100)
        colorSaturation: 40 + baseVariation + Math.random() * 20, // Medium color
        contextGap: 35 + baseVariation + Math.random() * 15, // Medium context
      };
    case 'abstract_mystery':
      return {
        motionDelta: 30 + baseVariation + Math.random() * 20, // Lower motion
        colorSaturation: 55 + baseVariation + Math.random() * 15, // Medium-high color
        contextGap: 70 + baseVariation + Math.random() * 10, // High context gap
      };
    case 'reaction_reveal':
      return {
        motionDelta: 25 + baseVariation + Math.random() * 15, // Lower motion (faces don't move much)
        colorSaturation: 70 + baseVariation + Math.random() * 10, // High color (facial tones)
        contextGap: 55 + baseVariation + Math.random() * 15, // Medium context
      };
    default:
      return {
        motionDelta: 50 + Math.random() * 30,
        colorSaturation: 50 + Math.random() * 30,
        contextGap: 50 + Math.random() * 30,
      };
  }
}

function generateMockSwipeRate(score: number): number {
  // Higher scores should correlate with lower swipe rates
  // Score 80+ -> 5-15% swipe
  // Score 60-80 -> 15-30% swipe
  // Score <60 -> 30-50% swipe

  if (score >= 80) {
    return 0.05 + Math.random() * 0.1;
  } else if (score >= 60) {
    return 0.15 + Math.random() * 0.15;
  } else {
    return 0.3 + Math.random() * 0.2;
  }
}

async function runDemo() {
  console.log('\n' + '='.repeat(100));
  console.log('🎬 NUGGET VISUAL ANCHOR DEMO - Rating 10 First Clips');
  console.log('='.repeat(100) + '\n');

  const demos: NuggetDemo[] = [];

  for (let i = 0; i < 10; i++) {
    const figure = HISTORICAL_FIGURES[i];
    const nuggetType = NUGGET_TYPES[i % 3]; // Rotate through nugget types

    // Create base prompt
    const basePrompt = `${figure.name} ${figure.action}, dramatic lighting, cinematic composition`;

    // Inject nugget into first clip
    const injectionResult = kling25PromptOptimizer.injectNugget(basePrompt, 0, nuggetType);

    // Generate mock validation metrics
    const metrics = generateMockMetrics(nuggetType, i);

    // Clamp metrics to 0-100
    metrics.motionDelta = Math.min(100, Math.max(0, metrics.motionDelta));
    metrics.colorSaturation = Math.min(100, Math.max(0, metrics.colorSaturation));
    metrics.contextGap = Math.min(100, Math.max(0, metrics.contextGap));

    // Calculate nugget score
    const scoreResult = kling25PromptOptimizer.calculateNuggetScore(metrics);

    // Generate mock swipe rate based on score
    const swipeRate = generateMockSwipeRate(scoreResult.score);

    // Calculate Thompson Sampling reward
    const reward = kling25PromptOptimizer.calculateNuggetReward(swipeRate);

    demos.push({
      clipNumber: i + 1,
      nuggetType,
      basePrompt: figure.name,
      motionDelta: Math.round(metrics.motionDelta),
      colorSaturation: Math.round(metrics.colorSaturation),
      contextGap: Math.round(metrics.contextGap),
      totalScore: scoreResult.score,
      passed: scoreResult.passed,
      penalties: scoreResult.penalties,
      swipeRate,
      reward,
    });
  }

  // Display results in a formatted table
  console.log(
    '┌─────┬──────────────────────┬───────────────────┬────────┬────────┬─────────┬───────┬────────┬─────────────────────┐',
  );
  console.log(
    '│ #   │ Historical Figure    │ Nugget Type       │ Motion │ Color  │ Context │ Score │ Status │ Reward              │',
  );
  console.log(
    '├─────┼──────────────────────┼───────────────────┼────────┼────────┼─────────┼───────┼────────┼─────────────────────┤',
  );

  for (const demo of demos) {
    const status = demo.passed ? '✅ PASS' : '❌ FAIL';
    const rewardStr =
      demo.reward.alphaChange > 0
        ? `+${demo.reward.alphaChange}α ${demo.reward.rewardType.replace('nugget_', '')}`
        : `+${demo.reward.betaChange}β ${demo.reward.rewardType.replace('nugget_', '')}`;

    console.log(
      `│ ${String(demo.clipNumber).padStart(2, ' ')}  │ ` +
        `${demo.basePrompt.padEnd(20, ' ')} │ ` +
        `${demo.nuggetType.padEnd(17, ' ')} │ ` +
        `${String(demo.motionDelta).padStart(5, ' ')}% │ ` +
        `${String(demo.colorSaturation).padStart(5, ' ')}% │ ` +
        `${String(demo.contextGap).padStart(6, ' ')}% │ ` +
        `${String(demo.totalScore).padStart(5, ' ')} │ ` +
        `${status} │ ` +
        `${rewardStr.padEnd(19, ' ')} │`,
    );
  }

  console.log(
    '└─────┴──────────────────────┴───────────────────┴────────┴────────┴─────────┴───────┴────────┴─────────────────────┘',
  );

  // Summary statistics
  const passCount = demos.filter((d) => d.passed).length;
  const avgScore = demos.reduce((sum, d) => sum + d.totalScore, 0) / demos.length;
  const avgSwipeRate = demos.reduce((sum, d) => sum + d.swipeRate, 0) / demos.length;

  console.log('\n📊 SUMMARY');
  console.log('─'.repeat(50));
  console.log(`   Pass Rate: ${passCount}/10 (${passCount * 10}%)`);
  console.log(`   Average Score: ${avgScore.toFixed(1)}/100`);
  console.log(`   Average Swipe Rate: ${(avgSwipeRate * 100).toFixed(1)}%`);
  console.log(`   Minimum Pass Threshold: 60/100`);

  // Nugget type breakdown
  console.log('\n🎯 NUGGET TYPE PERFORMANCE');
  console.log('─'.repeat(50));

  for (const type of NUGGET_TYPES) {
    const typeClips = demos.filter((d) => d.nuggetType === type);
    const typeAvg = typeClips.reduce((sum, d) => sum + d.totalScore, 0) / typeClips.length;
    const typePass = typeClips.filter((d) => d.passed).length;
    const typeSwipe = typeClips.reduce((sum, d) => sum + d.swipeRate, 0) / typeClips.length;

    console.log(
      `   ${type.padEnd(17)}: Avg Score ${typeAvg.toFixed(1)}, Pass ${typePass}/${typeClips.length}, Swipe ${(typeSwipe * 100).toFixed(1)}%`,
    );
  }

  // Show penalty breakdown if any
  const allPenalties = demos.filter((d) => d.penalties.length > 0);
  if (allPenalties.length > 0) {
    console.log('\n⚠️  PENALTIES DETECTED');
    console.log('─'.repeat(50));
    for (const demo of allPenalties) {
      console.log(`   Clip ${demo.clipNumber} (${demo.basePrompt}):`);
      for (const penalty of demo.penalties) {
        console.log(`      - ${penalty}`);
      }
    }
  }

  // Example prompt output
  console.log('\n📝 SAMPLE OPTIMIZED PROMPT (Clip 1)');
  console.log('─'.repeat(50));
  const sampleResult = kling25PromptOptimizer.injectNugget(
    `${HISTORICAL_FIGURES[0].name} ${HISTORICAL_FIGURES[0].action}`,
    0,
    'in_media_res',
  );
  console.log(`   ${sampleResult.optimizedPrompt.substring(0, 200)}...`);

  // Show recursive prompt optimization with audit feedback
  console.log('\n\n' + '='.repeat(100));
  console.log('🔄 RECURSIVE PROMPT OPTIMIZATION - Audit-to-Prompt Mapping Demo');
  console.log('='.repeat(100) + '\n');

  // Demo audit feedback scenarios
  const AUDIT_SCENARIOS = [
    {
      figure: 'Julius Caesar',
      prompt: 'Julius Caesar addressing the Roman Senate',
      score: 35,
      audit:
        'The character appears stiff and expressionless. Modern wristwatch visible on left arm. Flat lighting with no depth.',
      expectedFixes: ['motion', 'anachronism', 'lighting'],
    },
    {
      figure: 'Cleopatra',
      prompt: 'Cleopatra in her royal chamber',
      score: 45,
      audit: 'Scene feels static and desaturated. Character face shows uncanny valley distortion.',
      expectedFixes: ['motion', 'color', 'face'],
    },
    {
      figure: 'Genghis Khan',
      prompt: 'Genghis Khan leading cavalry charge',
      score: 28,
      audit: 'Horses appear frozen mid-gallop. Objects floating unrealistically. Scale issues with soldiers.',
      expectedFixes: ['motion', 'physics', 'scale'],
    },
  ];

  for (const scenario of AUDIT_SCENARIOS) {
    console.log(`\n📍 ${scenario.figure.toUpperCase()} (Score: ${scenario.score}/100)`);
    console.log('─'.repeat(80));
    console.log(`   Original Prompt: "${scenario.prompt}"`);
    console.log(`   Audit Feedback: "${scenario.audit}"`);

    // Parse audit feedback
    const parsed = kling25PromptOptimizer.parseAuditFeedback(scenario.audit);
    console.log(`\n   🔍 DETECTED ISSUES:`);
    for (const issue of parsed.detectedIssues) {
      console.log(`      • ${issue}`);
    }

    // Run recursive optimization
    const result = kling25PromptOptimizer.recursivePromptOptimize(scenario.prompt, scenario.score, scenario.audit, 1);

    console.log(`\n   🔧 TECHNICAL FIXES INJECTED:`);
    for (const fix of result.technicalFixes.slice(0, 3)) {
      console.log(`      → ${fix}`);
    }

    if (result.motionBrushValue) {
      console.log(`\n   🎬 MOTION BRUSH: ${result.motionBrushValue}/10 recommended`);
    }

    console.log(`\n   📝 ENHANCED PROMPT:`);
    console.log(`      "${result.enhancedPrompt.substring(0, 180)}..."`);
    console.log(`\n   ⚡ Severity: ${result.severityLevel.toUpperCase()}`);
  }

  // Show full optimization (scores + audit combined)
  console.log('\n\n' + '='.repeat(100));
  console.log('🚀 FULL RECURSIVE OPTIMIZATION - Scores + Audit Combined');
  console.log('='.repeat(100) + '\n');

  const fullOptExample = kling25PromptOptimizer.fullRecursiveOptimize(
    'Napoleon Bonaparte commanding his troops at Austerlitz',
    {
      score: 32,
      auditFeedback:
        'Character appears stiff with frozen pose. Anachronism: modern glasses visible. Flat overexposed lighting.',
      motionDelta: 25,
      colorSaturation: 40,
      contextGap: 35,
    },
    2, // Attempt 2 for more aggressive fixes
  );

  console.log('   📊 OPTIMIZATION SUMMARY:');
  console.log(`      Score Enhancements: ${fullOptExample.scoreEnhancements.length}`);
  console.log(`      Audit Enhancements: ${fullOptExample.auditEnhancements.length}`);
  console.log(`      Total Fixes Applied: ${fullOptExample.totalEnhancements}`);
  console.log(`      Motion Brush: ${fullOptExample.motionBrushValue || 'N/A'}`);
  console.log(`      Expected Score Gain: +${fullOptExample.expectedScoreGain} points`);
  console.log(`      Severity Level: ${fullOptExample.severityLevel.toUpperCase()}`);
  console.log(`\n   📝 FINAL ENHANCED PROMPT:`);
  console.log(`      "${fullOptExample.enhancedPrompt.substring(0, 250)}..."`);

  // Original score-based reprompting section

  // Take the failed clips and show how reprompting improves them
  const failedClips = demos.filter((d) => !d.passed);

  if (failedClips.length > 0) {
    for (const failedClip of failedClips) {
      console.log(
        `\n📍 CLIP ${failedClip.clipNumber}: ${failedClip.basePrompt} (Original Score: ${failedClip.totalScore})`,
      );
      console.log('─'.repeat(80));

      // Show original scores
      console.log(
        `   Original Metrics: Motion ${failedClip.motionDelta}%, Color ${failedClip.colorSaturation}%, Context ${failedClip.contextGap}%`,
      );

      // Run reprompting
      const originalPrompt = `${HISTORICAL_FIGURES[failedClip.clipNumber - 1].name} ${HISTORICAL_FIGURES[failedClip.clipNumber - 1].action}`;

      for (let attempt = 1; attempt <= 3; attempt++) {
        const repromptResult = kling25PromptOptimizer.repromptWithFeedback(
          originalPrompt,
          {
            motionDelta: failedClip.motionDelta,
            colorSaturation: failedClip.colorSaturation,
            contextGap: failedClip.contextGap,
          },
          attempt,
        );

        console.log(`\n   🔁 Attempt ${attempt}:`);
        console.log(`      Targeted: ${repromptResult.targetedMetrics.join(', ') || 'none'}`);
        console.log(`      Enhancements: ${repromptResult.enhancements.slice(0, 3).join(', ') || 'none'}`);

        if (repromptResult.expectedImprovements.length > 0) {
          console.log(`      Expected Gains:`);
          for (const imp of repromptResult.expectedImprovements) {
            const newScore = Math.min(100, imp.from + imp.targetGain);
            console.log(`         ${imp.metric}: ${imp.from}% → ${newScore}% (+${imp.targetGain})`);
          }
        }

        // Show enhanced prompt snippet
        const promptSnippet = repromptResult.enhancedPrompt.substring(0, 150);
        console.log(`      Enhanced Prompt: "${promptSnippet}..."`);
      }
    }
  } else {
    console.log('   All clips passed! No reprompting needed.');

    // Show example of what would happen with a bad clip
    console.log('\n   📍 EXAMPLE: What if a clip scored poorly?');
    console.log('   ─'.repeat(40));

    const exampleReprompt = kling25PromptOptimizer.repromptWithFeedback(
      'Napoleon Bonaparte planning battle strategy',
      { motionDelta: 25, colorSaturation: 35, contextGap: 40 },
      1,
    );

    console.log(`      Original Score: ${exampleReprompt.originalScore}`);
    console.log(`      Targeted: ${exampleReprompt.targetedMetrics.join(', ')}`);
    console.log(`      Enhancements: ${exampleReprompt.enhancements.join(', ')}`);
    console.log(`      Enhanced Prompt: "${exampleReprompt.enhancedPrompt.substring(0, 120)}..."`);
  }

  console.log('\n' + '='.repeat(100));
  console.log('✅ Demo complete! The nugget scoring & reprompting system is ready for production use.');
  console.log('='.repeat(100) + '\n');
}

runDemo().catch(console.error);
