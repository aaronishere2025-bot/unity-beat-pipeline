/**
 * QUICK STATUS CHECK
 * Simple validation showing both systems are working
 */

import { db } from './server/db';
import { modelPerformance, toxicCombos, apiUsage, jobs } from '@shared/schema';
import { desc, sql } from 'drizzle-orm';

async function quickStatus() {
  console.log('\n🔍 LEARNING SYSTEMS - QUICK STATUS CHECK');
  console.log('==========================================\n');

  try {
    // THOMPSON SAMPLING STATUS
    console.log('┌─ 🎯 THOMPSON SAMPLING ─────────────────────────────┐\n');

    const allModels = await db.select().from(modelPerformance);

    if (allModels.length === 0) {
      console.log('   ⚠️  No model performance data yet');
      console.log('   Status: WAITING FOR DATA\n');
    } else {
      console.log(`   📊 Tracking ${allModels.length} model/task combinations\n`);

      // Show top 3 performers
      const sorted = allModels
        .map((m) => ({
          ...m,
          successRate: m.totalCalls > 0 ? m.successCount / m.totalCalls : 0,
          avgCost: m.totalCalls > 0 ? parseFloat(m.totalCost) / m.totalCalls : 0,
        }))
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 3);

      sorted.forEach((m, idx) => {
        console.log(`   ${idx + 1}. ${m.model} / ${m.taskType}`);
        console.log(`      Success: ${(m.successRate * 100).toFixed(1)}% | Calls: ${m.totalCalls}`);
        console.log(`      α: ${m.alphaSuccess.toFixed(1)} | β: ${m.betaFailure.toFixed(1)}`);
        console.log(`      Cost: $${m.avgCost.toFixed(4)}\n`);
      });

      // Check if learning
      const hasLearning = allModels.some((m) => m.alphaSuccess > 5 || m.betaFailure > 3);
      console.log(`   ${hasLearning ? '✅' : '⚠️'} Learning Status: ${hasLearning ? 'ACTIVE' : 'EARLY STAGE'}`);
    }

    console.log('└────────────────────────────────────────────────────┘\n');

    // RETENTION ANALYTICS STATUS
    console.log('┌─ 📊 RETENTION ANALYTICS ───────────────────────────┐\n');

    const allToxic = await db.select().from(toxicCombos);

    if (allToxic.length === 0) {
      console.log('   ⚠️  No toxic combos detected yet');
      console.log('   Status: WAITING FOR RETENTION DATA\n');
    } else {
      console.log(`   ☠️  ${allToxic.length} toxic combos identified\n`);

      // Show top 3 worst combos
      const worstCombos = allToxic.sort((a, b) => b.dropPercentage - a.dropPercentage).slice(0, 3);

      worstCombos.forEach((c, idx) => {
        console.log(`   ${idx + 1}. ${c.styleCategory || 'unknown'} + ${c.audioStyle || 'unknown'}`);
        console.log(`      Drop: ${(c.dropPercentage || 0).toFixed(1)}% at ${c.dropSecond || 0}s`);
        console.log(`      Avoided: ${c.avoided || 0}x\n`);
      });

      const totalAvoided = allToxic.reduce((sum, c) => sum + (c.avoided || 0), 0);
      console.log(`   ${totalAvoided > 0 ? '✅' : '⚠️'} Avoidance: ${totalAvoided} times`);
    }

    console.log('└────────────────────────────────────────────────────┘\n');

    // RECENT ACTIVITY
    console.log('┌─ 📈 RECENT ACTIVITY ───────────────────────────────┐\n');

    const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(10);

    console.log(`   Last 10 jobs:\n`);

    const statusCounts = recentJobs.reduce(
      (acc, j) => {
        acc[j.status] = (acc[j.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    Object.entries(statusCounts).forEach(([status, count]) => {
      const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '🔄';
      console.log(`   ${emoji} ${status}: ${count}`);
    });

    const successRate = recentJobs.length > 0 ? (statusCounts.completed || 0) / recentJobs.length : 0;

    console.log(`\n   Overall: ${(successRate * 100).toFixed(1)}% success rate`);

    console.log('\n└────────────────────────────────────────────────────┘\n');

    // OVERALL VERDICT
    console.log('🏆 OVERALL STATUS');
    console.log('=================\n');

    const hasModelData = allModels.length > 0;
    const hasRetentionData = allToxic.length > 0;
    const hasRecentActivity = recentJobs.length > 0;

    if (hasModelData && hasRetentionData && hasRecentActivity) {
      console.log('✅ BOTH SYSTEMS OPERATIONAL');
      console.log('   • Thompson Sampling: Learning from outcomes');
      console.log('   • Retention Analytics: Tracking drop-offs');
      console.log('   • Recent Activity: Jobs running\n');
    } else if (hasRecentActivity) {
      console.log('🟡 SYSTEMS INITIALIZING');
      console.log(`   • Thompson Sampling: ${hasModelData ? '✅' : '⏳ Waiting for data'}`);
      console.log(`   • Retention Analytics: ${hasRetentionData ? '✅' : '⏳ Waiting for data'}`);
      console.log('   • Recommendation: Run more jobs and upload to YouTube\n');
    } else {
      console.log('⚠️  NO RECENT ACTIVITY');
      console.log('   Recommendation: Generate videos to collect data\n');
    }

    // Quick stats
    console.log('📊 QUICK STATS');
    console.log('──────────────');
    console.log(`   Model combinations tracked: ${allModels.length}`);
    console.log(`   Toxic combos identified: ${allToxic.length}`);
    console.log(`   Recent jobs (10d): ${recentJobs.length}`);
    console.log();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

quickStatus()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
