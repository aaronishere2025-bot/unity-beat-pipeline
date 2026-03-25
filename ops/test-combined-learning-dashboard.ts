/**
 * COMBINED LEARNING DASHBOARD
 *
 * Real-time dashboard showing both Thompson Sampling and
 * Retention Analytics working together to improve video performance.
 */

import { db } from './server/db';
import { modelPerformance, apiUsage, youtubeAnalytics, toxicCombos, styleBandit } from '@shared/schema';
import { desc, gte, sql } from 'drizzle-orm';

interface DashboardMetrics {
  thompsonSampling: {
    bestModel: string;
    worstModel: string;
    exploration: number;
    totalSavings: number;
  };
  retentionAnalytics: {
    avgRetention: number;
    retentionTrend: 'improving' | 'declining' | 'stable';
    toxicCombosAvoided: number;
    topToxicCombo: string;
  };
  learningVelocity: {
    thompsonConvergence: number; // 0-1, how quickly Thompson is converging
    retentionLearningRate: number; // New insights per video
    overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
  };
  recentWins: Array<{
    timestamp: Date;
    type: 'thompson' | 'retention';
    description: string;
    impact: string;
  }>;
}

async function generateDashboard(): Promise<DashboardMetrics> {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          🧠 LEARNING SYSTEMS DASHBOARD - LIVE VIEW            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // THOMPSON SAMPLING METRICS
  console.log('┌─ 🎯 THOMPSON SAMPLING (Multi-Armed Bandit) ────────────────────┐');

  const allPerformance = await db.select().from(modelPerformance);

  // Find best and worst models
  const modelScores = allPerformance.map((p) => {
    const successRate = p.totalCalls > 0 ? p.successCount / p.totalCalls : 0;
    const avgCost = p.totalCalls > 0 ? parseFloat(p.totalCost) / p.totalCalls : 0;
    const score = successRate * 0.6 - avgCost * 0.4;
    return { model: p.model, score, successRate, avgCost };
  });

  const sortedModels = modelScores.sort((a, b) => b.score - a.score);
  const bestModel = sortedModels[0] || { model: 'N/A', successRate: 0, avgCost: 0 };
  const worstModel = sortedModels[sortedModels.length - 1] || { model: 'N/A', successRate: 0, avgCost: 0 };

  console.log('│');
  console.log(`│  🥇 Best Performer:   ${bestModel.model}`);
  console.log(`│     Success rate:     ${(bestModel.successRate * 100).toFixed(1)}%`);
  console.log(`│     Avg cost:         $${bestModel.avgCost.toFixed(4)}`);
  console.log('│');
  console.log(`│  🥉 Worst Performer:  ${worstModel.model}`);
  console.log(`│     Success rate:     ${(worstModel.successRate * 100).toFixed(1)}%`);
  console.log(`│     Avg cost:         $${worstModel.avgCost.toFixed(4)}`);
  console.log('│');

  // Calculate exploration rate
  const totalCalls = allPerformance.reduce((sum, p) => sum + p.totalCalls, 0);
  const bestModelCalls = allPerformance
    .filter((p) => p.model === bestModel.model)
    .reduce((sum, p) => sum + p.totalCalls, 0);
  const explorationRate = totalCalls > 0 ? 1 - bestModelCalls / totalCalls : 0.1;

  console.log(`│  🔍 Exploration Rate: ${(explorationRate * 100).toFixed(1)}%`);
  console.log(
    `│     (${explorationRate < 0.15 ? '✅' : '⚠️'} ${explorationRate < 0.15 ? 'Converged' : 'Still exploring'})`,
  );
  console.log('│');

  // Cost savings
  const recentUsage = await db
    .select()
    .from(apiUsage)
    .where(gte(apiUsage.timestamp, weekAgo))
    .orderBy(desc(apiUsage.timestamp));

  const actualCost = recentUsage.reduce((sum, call) => sum + parseFloat(call.cost || '0'), 0);
  const naiveCost = recentUsage.length * 0.005; // If always GPT-5.2
  const savings = naiveCost - actualCost;

  console.log(`│  💰 Cost Savings:     $${savings.toFixed(4)} (7 days)`);
  console.log(`│     Actual:           $${actualCost.toFixed(4)}`);
  console.log(`│     Naive (GPT-5.2):  $${naiveCost.toFixed(4)}`);
  console.log('└────────────────────────────────────────────────────────────────┘\n');

  // RETENTION ANALYTICS METRICS
  console.log('┌─ 📊 RETENTION ANALYTICS (Second-by-Second) ────────────────────┐');

  const recentAnalytics = await db
    .select()
    .from(youtubeAnalytics)
    .where(gte(youtubeAnalytics.fetchedAt, weekAgo))
    .orderBy(desc(youtubeAnalytics.fetchedAt));

  const avgRetention =
    recentAnalytics.length > 0
      ? recentAnalytics.reduce((sum, a) => sum + (a.averageViewPercentage || 0), 0) / recentAnalytics.length
      : 0;

  // Calculate trend
  const halfwayPoint = Math.floor(recentAnalytics.length / 2);
  const recentHalf = recentAnalytics.slice(0, halfwayPoint);
  const olderHalf = recentAnalytics.slice(halfwayPoint);

  const recentAvg =
    recentHalf.length > 0
      ? recentHalf.reduce((sum, a) => sum + (a.averageViewPercentage || 0), 0) / recentHalf.length
      : 0;
  const olderAvg =
    olderHalf.length > 0 ? olderHalf.reduce((sum, a) => sum + (a.averageViewPercentage || 0), 0) / olderHalf.length : 0;

  const diff = recentAvg - olderAvg;
  let retentionTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (Math.abs(diff) > 2) {
    retentionTrend = diff > 0 ? 'improving' : 'declining';
  }

  console.log('│');
  console.log(`│  📈 Avg Retention:    ${avgRetention.toFixed(1)}%`);
  console.log(
    `│     Trend:            ${retentionTrend === 'improving' ? '📈 Improving' : retentionTrend === 'declining' ? '📉 Declining' : '➡️  Stable'} (${diff > 0 ? '+' : ''}${diff.toFixed(1)}%)`,
  );
  console.log(`│     Videos analyzed:  ${recentAnalytics.length}`);
  console.log('│');

  // Toxic combos
  const allToxicCombos = await db.select().from(toxicCombos);
  const toxicCombosAvoided = allToxicCombos.reduce((sum, c) => sum + (c.avoided || 0), 0);

  const topToxic = allToxicCombos.reduce((top, combo) => {
    return combo.dropPercentage > (top?.dropPercentage || 0) ? combo : top;
  }, allToxicCombos[0]);

  const topToxicCombo = topToxic
    ? `${topToxic.styleCategory} + ${topToxic.audioStyle} (-${topToxic.dropPercentage.toFixed(1)}%)`
    : 'None detected';

  console.log(`│  ☠️  Toxic Combos:     ${allToxicCombos.length} identified`);
  console.log(`│     Avoided:          ${toxicCombosAvoided}x`);
  console.log(`│     Worst:            ${topToxicCombo}`);
  console.log('└────────────────────────────────────────────────────────────────┘\n');

  // LEARNING VELOCITY
  console.log('┌─ 🚀 LEARNING VELOCITY ──────────────────────────────────────────┐');

  // Thompson convergence: How concentrated is distribution?
  const totalSamples = allPerformance.reduce((sum, p) => sum + (p.alphaSuccess + p.betaFailure), 0);
  const bestModelSamples = allPerformance
    .filter((p) => p.model === bestModel.model)
    .reduce((sum, p) => sum + (p.alphaSuccess + p.betaFailure), 0);

  const thompsonConvergence = totalSamples > 0 ? bestModelSamples / totalSamples : 0;

  // Retention learning rate: New insights per video
  const retentionLearningRate = recentAnalytics.length > 0 ? allToxicCombos.length / recentAnalytics.length : 0;

  let overallHealth: 'excellent' | 'good' | 'fair' | 'poor' = 'fair';
  if (thompsonConvergence > 0.6 && retentionTrend === 'improving') {
    overallHealth = 'excellent';
  } else if (thompsonConvergence > 0.4 || retentionTrend === 'improving') {
    overallHealth = 'good';
  } else if (thompsonConvergence < 0.2 && retentionTrend === 'declining') {
    overallHealth = 'poor';
  }

  console.log('│');
  console.log(`│  🎯 Thompson Convergence:  ${(thompsonConvergence * 100).toFixed(1)}%`);
  console.log(
    `│     Status: ${thompsonConvergence > 0.6 ? '✅ Converged' : thompsonConvergence > 0.4 ? '🔄 Learning' : '🌱 Exploring'}`,
  );
  console.log('│');
  console.log(`│  📚 Retention Learning:    ${retentionLearningRate.toFixed(2)} insights/video`);
  console.log(
    `│     Status: ${retentionLearningRate > 0.5 ? '✅ High' : retentionLearningRate > 0.2 ? '🔄 Moderate' : '🌱 Low'}`,
  );
  console.log('│');
  console.log(`│  💚 Overall Health:        ${overallHealth.toUpperCase()}`);

  const healthEmoji = {
    excellent: '🟢',
    good: '🟡',
    fair: '🟠',
    poor: '🔴',
  }[overallHealth];

  console.log(
    `│     ${healthEmoji} ${
      overallHealth === 'excellent'
        ? 'Both systems learning fast!'
        : overallHealth === 'good'
          ? 'Systems are learning steadily'
          : overallHealth === 'fair'
            ? 'Learning in progress'
            : 'Need more data to learn effectively'
    }`,
  );
  console.log('└────────────────────────────────────────────────────────────────┘\n');

  // RECENT WINS
  console.log('┌─ 🏆 RECENT WINS (Last 7 Days) ─────────────────────────────────┐');

  const recentWins: DashboardMetrics['recentWins'] = [];

  // Thompson wins: Model shifts that improved performance
  if (sortedModels.length > 1 && sortedModels[0].successRate > sortedModels[1].successRate) {
    recentWins.push({
      timestamp: new Date(),
      type: 'thompson',
      description: `Shifted to ${bestModel.model} for better success rate`,
      impact: `+${((bestModel.successRate - sortedModels[1].successRate) * 100).toFixed(1)}% success`,
    });
  }

  // Cost savings win
  if (savings > 0.01) {
    recentWins.push({
      timestamp: new Date(),
      type: 'thompson',
      description: 'Optimized model selection reduced costs',
      impact: `$${savings.toFixed(4)} saved`,
    });
  }

  // Retention wins: Videos that beat average
  const topPerformers = recentAnalytics.filter((a) => (a.averageViewPercentage || 0) > avgRetention + 5).slice(0, 2);

  topPerformers.forEach((video) => {
    recentWins.push({
      timestamp: video.fetchedAt,
      type: 'retention',
      description: `${video.videoId} exceeded avg retention`,
      impact: `${((video.averageViewPercentage || 0) - avgRetention).toFixed(1)}% above avg`,
    });
  });

  // Toxic combo avoidance win
  if (toxicCombosAvoided > 0) {
    recentWins.push({
      timestamp: new Date(),
      type: 'retention',
      description: `Avoided toxic combos ${toxicCombosAvoided} times`,
      impact: 'Prevented potential drop-offs',
    });
  }

  console.log('│');
  if (recentWins.length === 0) {
    console.log('│  No significant wins yet - systems still learning');
  } else {
    recentWins.forEach((win, idx) => {
      const icon = win.type === 'thompson' ? '🎯' : '📊';
      console.log(`│  ${icon} ${win.description}`);
      console.log(`│     ${win.impact}`);
      if (idx < recentWins.length - 1) console.log('│');
    });
  }
  console.log('└────────────────────────────────────────────────────────────────┘\n');

  // RECOMMENDATIONS
  console.log('💡 RECOMMENDATIONS:');

  if (overallHealth === 'poor' || overallHealth === 'fair') {
    console.log('   • Generate 10-20 more videos to improve learning');
    console.log('   • Ensure retention data is being collected from YouTube');
    console.log('   • Run validation tests to check system health');
  }

  if (explorationRate > 0.2) {
    console.log('   • Thompson Sampling still exploring - normal in early stages');
    console.log('   • Will converge after ~50 API calls per model/task');
  }

  if (retentionTrend === 'declining') {
    console.log('   ⚠️  Retention declining - review recent toxic combos');
    console.log('   • Check if toxic avoidance is working correctly');
  }

  if (retentionTrend === 'improving') {
    console.log('   ✅ Retention improving - systems learning successfully!');
  }

  console.log();

  return {
    thompsonSampling: {
      bestModel: bestModel.model,
      worstModel: worstModel.model,
      exploration: explorationRate,
      totalSavings: savings,
    },
    retentionAnalytics: {
      avgRetention,
      retentionTrend,
      toxicCombosAvoided,
      topToxicCombo,
    },
    learningVelocity: {
      thompsonConvergence,
      retentionLearningRate,
      overallHealth,
    },
    recentWins,
  };
}

async function main() {
  try {
    await generateDashboard();

    console.log('───────────────────────────────────────────────────────────────');
    console.log('Run this script periodically to track learning progress!');
    console.log('───────────────────────────────────────────────────────────────\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Dashboard failed:', error);
    process.exit(1);
  }
}

main();
