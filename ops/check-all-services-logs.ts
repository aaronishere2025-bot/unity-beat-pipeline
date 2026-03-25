#!/usr/bin/env tsx
import { db } from './server/db.js';
import { apiUsage } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('📊 Comprehensive API Logging Audit\n');

  // Get all operations across all services
  const allOps = await db
    .select({
      service: apiUsage.service,
      operation: apiUsage.operation,
      count: sql<number>`count(*)`,
      totalCost: sql<number>`sum(cast(cost as numeric))`,
      successCount: sql<number>`sum(case when success = true then 1 else 0 end)`,
      failCount: sql<number>`sum(case when success = false then 1 else 0 end)`,
    })
    .from(apiUsage)
    .groupBy(apiUsage.service, apiUsage.operation);

  console.log('All Operations Across All Services:');
  console.table(allOps.sort((a, b) => Number(b.count) - Number(a.count)));

  // Find suspicious patterns: operations in wrong service
  console.log('\n🚨 Suspicious Cross-Service Contamination:');
  const suspicious = allOps.filter((op) => {
    const serviceName = op.service.toLowerCase();
    const opName = op.operation.toLowerCase();

    // Check for mismatches
    if (opName.includes('song') || opName.includes('suno')) {
      return serviceName !== 'suno';
    }
    if (opName.includes('kling') || opName.includes('video_clip')) {
      return serviceName !== 'kling' && serviceName !== 'veo31' && serviceName !== 'veo31_i2v';
    }
    if (opName.includes('openai') || opName.includes('gpt')) {
      return serviceName !== 'openai';
    }
    return false;
  });

  if (suspicious.length > 0) {
    console.table(suspicious);
  } else {
    console.log('✅ No cross-service contamination detected');
  }

  // Check for poll/retry operations being charged
  console.log('\n🔍 Poll/Retry Operations with Costs:');
  const pollOps = allOps.filter((op) => {
    const opName = op.operation.toLowerCase();
    return (
      (opName.includes('poll') || opName.includes('retry') || opName.includes('status_check')) &&
      Number(op.totalCost) > 0
    );
  });

  if (pollOps.length > 0) {
    console.table(pollOps);
  } else {
    console.log('✅ No poll operations being charged');
  }

  // High failure rates
  console.log('\n⚠️  Operations with >10% Failure Rate:');
  const highFailure = allOps.filter((op) => {
    const total = Number(op.count);
    const failed = Number(op.failCount);
    return total > 10 && failed / total > 0.1;
  });

  if (highFailure.length > 0) {
    console.table(
      highFailure.map((op) => ({
        service: op.service,
        operation: op.operation,
        total: op.count,
        failed: op.failCount,
        failureRate: `${((Number(op.failCount) / Number(op.count)) * 100).toFixed(1)}%`,
      })),
    );
  } else {
    console.log('✅ All operations have healthy failure rates');
  }
}

main().catch(console.error);
