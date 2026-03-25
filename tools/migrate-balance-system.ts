#!/usr/bin/env tsx
/**
 * Migration: Add balance and total_spent fields to users table
 * Run: npx tsx tools/migrate-balance-system.ts
 */

import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function migrateBalanceSystem() {
  console.log('🔧 Migrating to dollar balance system...\n');

  try {
    // Check if columns already exist
    const tableInfo = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('balance', 'total_spent')
    `);

    const existingColumns = (tableInfo.rows as any[]).map((row) => row.column_name);

    // Add balance column if not exists
    if (!existingColumns.includes('balance')) {
      console.log('📊 Adding balance column...');
      await db.execute(sql`
        ALTER TABLE users
        ADD COLUMN balance DECIMAL(10, 2) NOT NULL DEFAULT 12.50
      `);
      console.log('✅ Balance column added (default: $12.50 for new signups)\n');
    } else {
      console.log('⏭️  Balance column already exists\n');
    }

    // Add total_spent column if not exists
    if (!existingColumns.includes('total_spent')) {
      console.log('📊 Adding total_spent column...');
      await db.execute(sql`
        ALTER TABLE users
        ADD COLUMN total_spent DECIMAL(10, 2) NOT NULL DEFAULT 0.00
      `);
      console.log('✅ Total spent column added\n');
    } else {
      console.log('⏭️  Total spent column already exists\n');
    }

    // Migrate existing users with free credits to balance
    console.log('💰 Converting free credits to dollar balance for existing users...');
    await db.execute(sql`
      UPDATE users
      SET balance = (free_beat_credits_remaining * 2.50)
      WHERE balance = 12.50
      AND free_beat_credits_remaining != 5
    `);
    console.log('✅ Existing users migrated (1 credit = $2.50)\n');

    // Show sample users
    const sampleUsers = await db.execute(sql`
      SELECT
        email,
        free_beat_credits_remaining as credits,
        balance,
        total_spent
      FROM users
      LIMIT 5
    `);

    console.log('📋 Sample users after migration:');
    console.table(sampleUsers.rows);

    console.log('\n✅ Migration complete!');
    console.log('\nNext steps:');
    console.log('1. Update user-cost-tracker.ts to check balance instead of credits');
    console.log('2. Build balance widget UI');
    console.log('3. Add "Add Funds" Stripe checkout flow');
    console.log('4. Update webhook to add funds to balance');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

migrateBalanceSystem()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
