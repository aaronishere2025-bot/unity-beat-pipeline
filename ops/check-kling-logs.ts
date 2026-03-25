#!/usr/bin/env tsx
import { db } from './server/db.js';
import { apiUsage } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

async function main() {
  console.log('📊 Analyzing Kling API Logs\n');

  // Check Kling operations breakdown
  const klingOps = await db
    .select({
      operation: apiUsage.operation,
      count: sql<number>`count(*)`,
      totalCost: sql<number>`sum(cast(cost as numeric))`,
      avgCost: sql<number>`avg(cast(cost as numeric))`,
      success: apiUsage.success,
    })
    .from(apiUsage)
    .where(eq(apiUsage.service, 'kling'))
    .groupBy(apiUsage.operation, apiUsage.success);

  console.log('Kling Operations Breakdown:');
  console.table(klingOps);

  // Check for failed logs
  const failedKling = await db
    .select({
      operation: apiUsage.operation,
      count: sql<number>`count(*)`,
    })
    .from(apiUsage)
    .where(eq(apiUsage.service, 'kling'))
    .where(eq(apiUsage.success, false))
    .groupBy(apiUsage.operation);

  console.log('\nFailed Kling Operations:');
  console.table(failedKling);

  // Recent logs
  const klingPolls = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.service, 'kling'))
    .orderBy(sql`created_at DESC`)
    .limit(20);
  console.log('\nRecent Kling logs:');
  console.table(
    klingPolls.map((r) => ({
      operation: r.operation,
      cost: r.cost,
      success: r.success,
      error: r.errorMessage?.substring(0, 50),
      createdAt: r.createdAt,
    })),
  );
}

main().catch(console.error);
