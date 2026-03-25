#!/usr/bin/env tsx
import { db } from './server/db.js';
import { apiUsage } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('📊 Checking API Usage Data\n');

  // Total records
  const totalRecords = await db.select({ count: sql<number>`count(*)` }).from(apiUsage);
  console.log(`Total API usage records: ${totalRecords[0].count}\n`);

  if (totalRecords[0].count === 0) {
    console.log('⚠️ No API usage data found in database');
    console.log('This means costs are not being tracked yet.\n');
    return;
  }

  // By service
  const byService = await db
    .select({
      service: apiUsage.service,
      count: sql<number>`count(*)`,
      totalCost: sql<number>`sum(cast(cost as numeric))`,
    })
    .from(apiUsage)
    .groupBy(apiUsage.service);

  console.log('By Service:');
  console.table(byService);

  // Recent records
  const recent = await db
    .select()
    .from(apiUsage)
    .orderBy(sql`created_at DESC`)
    .limit(10);
  console.log('\nRecent API calls:');
  console.table(
    recent.map((r) => ({
      service: r.service,
      operation: r.operation,
      cost: r.cost,
      model: r.model,
      createdAt: r.createdAt,
    })),
  );
}

main().catch(console.error);
