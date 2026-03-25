#!/usr/bin/env tsx
import { db } from './server/db.js';
import { apiUsage } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

async function main() {
  console.log('📅 Suno Generation Timeline Analysis\n');

  // Get date range for actual song generations
  const dateRange = await db
    .select({
      firstSong: sql<Date>`MIN(created_at)`,
      lastSong: sql<Date>`MAX(created_at)`,
      totalSongs: sql<number>`count(*)`,
    })
    .from(apiUsage)
    .where(eq(apiUsage.operation, 'generate_song'));

  console.log('Overall Timeline:');
  console.table(dateRange);

  // Songs per month
  const byMonth = await db
    .select({
      month: sql<string>`TO_CHAR(created_at, 'YYYY-MM')`,
      songCount: sql<number>`count(*)`,
      totalCost: sql<number>`sum(cast(cost as numeric))`,
    })
    .from(apiUsage)
    .where(eq(apiUsage.operation, 'generate_song'))
    .groupBy(sql`TO_CHAR(created_at, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(created_at, 'YYYY-MM')`);

  console.log('\nSongs Generated Per Month:');
  console.table(byMonth);

  // Songs per day (last 30 days)
  const byDay = await db
    .select({
      date: sql<string>`DATE(created_at)`,
      songCount: sql<number>`count(*)`,
      totalCost: sql<number>`sum(cast(cost as numeric))`,
    })
    .from(apiUsage)
    .where(eq(apiUsage.operation, 'generate_song'))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at) DESC`)
    .limit(30);

  console.log('\nSongs Generated Per Day (Last 30 Days):');
  console.table(byDay);

  // Check when VEO vs Kling was used
  const videoSystems = await db
    .select({
      service: apiUsage.service,
      firstUse: sql<Date>`MIN(created_at)`,
      lastUse: sql<Date>`MAX(created_at)`,
      totalVideos: sql<number>`count(*)`,
    })
    .from(apiUsage)
    .where(sql`service IN ('veo31', 'veo31_i2v', 'kling')`)
    .groupBy(apiUsage.service)
    .orderBy(sql`MIN(created_at)`);

  console.log('\nVideo System Timeline (VEO vs Kling):');
  console.table(videoSystems);

  // Recent activity
  const recent = await db
    .select({
      date: sql<string>`DATE(created_at)`,
      sunoSongs: sql<number>`SUM(CASE WHEN service = 'suno' AND operation = 'generate_song' THEN 1 ELSE 0 END)`,
      klingClips: sql<number>`SUM(CASE WHEN service = 'kling' THEN 1 ELSE 0 END)`,
      veoClips: sql<number>`SUM(CASE WHEN service IN ('veo31', 'veo31_i2v') THEN 1 ELSE 0 END)`,
    })
    .from(apiUsage)
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at) DESC`)
    .limit(15);

  console.log('\nRecent Activity (Suno vs Kling vs VEO):');
  console.table(recent);
}

main().catch(console.error);
