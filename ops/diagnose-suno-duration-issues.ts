/**
 * DIAGNOSE SUNO DURATION ISSUES
 *
 * Analyzes recent Suno generations to identify duration problems:
 * - Songs that missed target duration by >20%
 * - Patterns in failures (genre, BPM, duration range)
 * - Credit waste from retries
 * - Recommendations for fixes
 *
 * Usage:
 *   npx tsx diagnose-suno-duration-issues.ts [days]
 *   npx tsx diagnose-suno-duration-issues.ts 7  # Last 7 days
 */

import { db } from './server/db.js';
import { jobs, apiUsage } from './shared/schema.js';
import { sql, desc, and, gte } from 'drizzle-orm';

async function diagnoseDurationIssues(daysBack: number = 7) {
  console.log('🔍 DIAGNOSING SUNO DURATION ISSUES\n');
  console.log(`Analyzing jobs from last ${daysBack} days...\n`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  // Get all Suno-related jobs
  const sunoJobs = await db
    .select()
    .from(jobs)
    .where(and(gte(jobs.createdAt, cutoffDate), sql`${jobs.mode} IN ('music', 'beats', 'unity_kling')`))
    .orderBy(desc(jobs.createdAt))
    .limit(100);

  console.log(`Found ${sunoJobs.length} music/beat jobs\n`);

  if (sunoJobs.length === 0) {
    console.log('No jobs found. Generate some beats first!\n');
    process.exit(0);
  }

  // Analyze each job
  const issues: Array<{
    jobId: string;
    name: string;
    mode: string;
    target: number;
    actual: number;
    error: number;
    errorPct: number;
    cost: number;
    retries: number;
    issue: string;
  }> = [];

  for (const job of sunoJobs) {
    const metadata = job.metadata as any;
    const targetDuration = metadata?.targetDuration || metadata?.duration || 120;
    const actualDuration = metadata?.actualDuration || job.duration;

    if (!actualDuration || actualDuration === 0) continue;

    const error = Math.abs(actualDuration - targetDuration);
    const errorPct = (error / targetDuration) * 100;

    // Check for issues
    let issue = '';
    if (errorPct > 50) {
      issue = 'CRITICAL: >50% error';
    } else if (errorPct > 20) {
      issue = 'HIGH: >20% error';
    } else if (errorPct > 10) {
      issue = 'MODERATE: >10% error';
    }

    if (issue) {
      // Count retries by checking API usage
      const usageRecords = await db
        .select()
        .from(apiUsage)
        .where(
          and(
            sql`${apiUsage.metadata}->>'jobId' = ${job.id}`,
            sql`${apiUsage.service} = 'suno'`,
            sql`${apiUsage.operation} = 'generate_song'`,
          ),
        );

      issues.push({
        jobId: job.id,
        name: job.scriptName || 'Untitled',
        mode: job.mode || 'unknown',
        target: targetDuration,
        actual: actualDuration,
        error: error,
        errorPct: errorPct,
        cost: parseFloat(job.cost || '0'),
        retries: usageRecords.length - 1, // First attempt doesn't count as retry
        issue: issue,
      });
    }
  }

  console.log('='.repeat(80));
  console.log('🚨 DURATION ISSUES FOUND');
  console.log('='.repeat(80));

  if (issues.length === 0) {
    console.log('✅ No significant duration issues found!\n');
    console.log('All jobs within ±10% of target duration.\n');
    process.exit(0);
  }

  console.table(
    issues.map((i) => ({
      Job: i.name.substring(0, 30),
      Mode: i.mode,
      Target: `${i.target}s`,
      Actual: `${i.actual}s`,
      Error: `${i.error}s (${i.errorPct.toFixed(0)}%)`,
      Retries: i.retries,
      Cost: `$${i.cost.toFixed(2)}`,
      Issue: i.issue,
    })),
  );

  // Statistics
  console.log('\n📊 STATISTICS:');
  console.log(`   Total issues: ${issues.length}`);
  console.log(`   Critical (>50%): ${issues.filter((i) => i.errorPct > 50).length}`);
  console.log(`   High (>20%): ${issues.filter((i) => i.errorPct > 20 && i.errorPct <= 50).length}`);
  console.log(`   Moderate (>10%): ${issues.filter((i) => i.errorPct > 10 && i.errorPct <= 20).length}`);

  const avgError = issues.reduce((sum, i) => sum + i.errorPct, 0) / issues.length;
  const totalRetries = issues.reduce((sum, i) => sum + i.retries, 0);
  const wastedCost = totalRetries * 0.1; // Each retry costs $0.10

  console.log(`\n💰 COST ANALYSIS:`);
  console.log(`   Total retries: ${totalRetries}`);
  console.log(`   Wasted on retries: $${wastedCost.toFixed(2)}`);
  console.log(`   Average error: ${avgError.toFixed(1)}%`);

  // Pattern analysis
  console.log('\n🔍 PATTERN ANALYSIS:');

  // By mode
  const byMode = issues.reduce(
    (acc, i) => {
      acc[i.mode] = (acc[i.mode] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('\n   By Mode:');
  Object.entries(byMode).forEach(([mode, count]) => {
    console.log(`      ${mode}: ${count} issues`);
  });

  // By duration range
  const byRange = issues.reduce(
    (acc, i) => {
      const range = i.target < 90 ? '<90s' : i.target < 150 ? '90-150s' : '150s+';
      acc[range] = (acc[range] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('\n   By Target Duration:');
  Object.entries(byRange).forEach(([range, count]) => {
    console.log(`      ${range}: ${count} issues`);
  });

  // Too short vs too long
  const tooShort = issues.filter((i) => i.actual < i.target).length;
  const tooLong = issues.filter((i) => i.actual > i.target).length;

  console.log('\n   Direction:');
  console.log(`      Too short: ${tooShort} (${((tooShort / issues.length) * 100).toFixed(0)}%)`);
  console.log(`      Too long: ${tooLong} (${((tooLong / issues.length) * 100).toFixed(0)}%)`);

  // Recommendations
  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATIONS');
  console.log('='.repeat(80));

  if (avgError > 30) {
    console.log('\n❌ HIGH ERROR RATE (>30% average):');
    console.log('   → You are likely NOT using generateInstrumentalStructure()');
    console.log('   → Action: Switch to structure-based generation immediately');
    console.log('   → See: SUNO-DURATION-FIX-GUIDE.md, Method C');
  } else if (avgError > 15) {
    console.log('\n⚠️  MODERATE ERROR RATE (15-30% average):');
    console.log('   → You may be using style hints only');
    console.log('   → Action: Implement structure-based generation for better accuracy');
    console.log('   → See: SUNO-DURATION-FIX-GUIDE.md, Method C');
  } else {
    console.log('\n✅ GOOD ERROR RATE (<15% average):');
    console.log('   → Your duration control is working reasonably well');
    console.log('   → Action: Optimize retry logic and credit recycling');
  }

  if (tooShort > tooLong * 1.5) {
    console.log('\n📉 SONGS CONSISTENTLY TOO SHORT:');
    console.log('   → Problem: Not enough structural content');
    console.log('   → Solution: Increase section count in generateInstrumentalStructure()');
    console.log('   → Tip: Add more (instrumental) lines per section');
  } else if (tooLong > tooShort * 1.5) {
    console.log('\n📈 SONGS CONSISTENTLY TOO LONG:');
    console.log('   → Problem: Too many sections for target duration');
    console.log('   → Solution: Reduce section count or use shorter sections');
    console.log('   → Tip: Remove middle sections or use single (instrumental) per section');
  } else {
    console.log('\n⚖️  BALANCED DISTRIBUTION:');
    console.log('   → Songs overshoot and undershoot roughly equally');
    console.log('   → This is expected - Suno has natural variance');
    console.log('   → Focus on reducing overall error magnitude');
  }

  if (totalRetries > issues.length * 0.5) {
    console.log('\n💸 HIGH RETRY RATE:');
    console.log(
      `   → ${totalRetries} retries for ${issues.length} issues = ${(totalRetries / issues.length).toFixed(1)} retries per issue`,
    );
    console.log('   → Implement taskId recycling to reduce credit waste');
    console.log('   → See: SUNO-DURATION-FIX-GUIDE.md, Issue 3 (Recycling Strategy)');
  }

  // Specific issues
  const critical = issues.filter((i) => i.errorPct > 50);
  if (critical.length > 0) {
    console.log('\n🔴 CRITICAL ISSUES (>50% error):');
    critical.forEach((i) => {
      console.log(`   → ${i.name}: ${i.actual}s vs ${i.target}s target`);
      if (i.actual < i.target * 0.5) {
        console.log(`      Likely cause: Using instrumental=true or empty lyrics`);
      } else if (i.actual > i.target * 1.5) {
        console.log(`      Likely cause: Too many sections or Suno ignoring hints`);
      }
    });
  }

  // Action items
  console.log('\n' + '='.repeat(80));
  console.log('📝 ACTION ITEMS (Priority Order)');
  console.log('='.repeat(80));

  const actions = [];

  if (avgError > 30) {
    actions.push({
      priority: '🔴 HIGH',
      action: 'Implement structure-based generation',
      file: 'server/services/job-worker.ts',
      change: 'Use generateInstrumentalStructure() instead of style hints',
    });
  }

  if (totalRetries > 5) {
    actions.push({
      priority: '🟡 MEDIUM',
      action: 'Add taskId recycling to retry logic',
      file: 'server/services/suno-retry-handler.ts',
      change: 'Reuse existing taskIds before creating new generations',
    });
  }

  if (issues.length > 10) {
    actions.push({
      priority: '🟢 LOW',
      action: 'Implement duration validation and logging',
      file: 'shared/schema.ts + routes.ts',
      change: 'Add suno_duration_tracking table and log all generations',
    });
  }

  if (actions.length > 0) {
    console.table(actions);
  } else {
    console.log('✅ No immediate action items - system is performing well!\n');
  }

  console.log('\n📚 RESOURCES:');
  console.log('   - Complete Guide: SUNO-DURATION-FIX-GUIDE.md');
  console.log('   - Test Script: test-suno-duration-fixes.ts');
  console.log('   - Implementation: server/services/suno-api.ts\n');

  process.exit(0);
}

const daysArg = process.argv[2] ? parseInt(process.argv[2]) : 7;
diagnoseDurationIssues(daysArg).catch(console.error);
