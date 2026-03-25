/**
 * Migration: Add SaaS multi-tenant tables
 *
 * Adds:
 * - users table (Google OAuth)
 * - userCredits table
 * - userPaymentMethods table
 * - beatStoreListings table
 * - beatStorePurchases table
 *
 * Also adds userId column to:
 * - jobs table
 * - apiUsage table
 */

import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('🔄 Starting SaaS platform migration...\n');

  try {
    // Add userId columns to existing tables
    console.log('Adding userId to jobs table...');
    await db.execute(sql`
      ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS actual_cost_usd DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS user_charge_usd DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS charged_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(100);
    `);
    console.log('✅ jobs table updated\n');

    console.log('Adding userId to apiUsage table...');
    await db.execute(sql`
      ALTER TABLE api_usage
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);
    `);
    console.log('✅ api_usage table updated\n');

    // Create users table
    console.log('Creating users table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        google_id VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        avatar_url TEXT,
        free_beat_credits_remaining INTEGER NOT NULL DEFAULT 5,
        stripe_customer_id VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_banned BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
    `);
    console.log('✅ users table created\n');

    // Create userCredits table
    console.log('Creating userCredits table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_credits (
        id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id VARCHAR(100) NOT NULL,
        credits_amount DECIMAL(10, 2) NOT NULL,
        source VARCHAR(50) NOT NULL,
        stripe_charge_id VARCHAR(100),
        ref_job_id VARCHAR(100),
        expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_credits_user_id_idx ON user_credits(user_id);
    `);
    console.log('✅ user_credits table created\n');

    // Create userPaymentMethods table
    console.log('Creating userPaymentMethods table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_payment_methods (
        id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id VARCHAR(100) NOT NULL,
        stripe_payment_method_id VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        last4 VARCHAR(4),
        brand VARCHAR(50),
        expiry_month INTEGER,
        expiry_year INTEGER,
        is_default BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_payment_methods_user_id_idx ON user_payment_methods(user_id);
    `);
    console.log('✅ user_payment_methods table created\n');

    // Create beatStoreListings table
    console.log('Creating beatStoreListings table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS beat_store_listings (
        id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id VARCHAR(100) NOT NULL,
        job_id VARCHAR(100),
        is_generated BOOLEAN NOT NULL DEFAULT false,
        source VARCHAR(50) NOT NULL DEFAULT 'external',
        beat_name TEXT NOT NULL,
        description TEXT,
        price_usd DECIMAL(10, 2) NOT NULL,
        stripe_product_id VARCHAR(100) NOT NULL,
        stripe_price_id VARCHAR(100) NOT NULL,
        stripe_payment_link_url TEXT NOT NULL,
        r2_key VARCHAR(500) NOT NULL,
        file_size_bytes DECIMAL(20, 0),
        views INTEGER NOT NULL DEFAULT 0,
        purchases INTEGER NOT NULL DEFAULT 0,
        total_revenue_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS beat_store_listings_user_id_idx ON beat_store_listings(user_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS beat_store_listings_job_id_idx ON beat_store_listings(job_id);
    `);
    console.log('✅ beat_store_listings table created\n');

    // Create beatStorePurchases table
    console.log('Creating beatStorePurchases table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS beat_store_purchases (
        id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        listing_id VARCHAR(100) NOT NULL,
        stripe_session_id VARCHAR(100) NOT NULL UNIQUE,
        customer_email VARCHAR(255) NOT NULL,
        amount_usd DECIMAL(10, 2) NOT NULL,
        platform_fee_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
        platform_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
        delivered_at TIMESTAMP,
        download_url TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS beat_store_purchases_listing_id_idx ON beat_store_purchases(listing_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS beat_store_purchases_stripe_session_id_idx ON beat_store_purchases(stripe_session_id);
    `);
    console.log('✅ beat_store_purchases table created\n');

    // Add commission tracking columns to existing tables
    console.log('Adding commission tracking columns...');
    await db.execute(sql`
      ALTER TABLE beat_store_listings
      ADD COLUMN IF NOT EXISTS is_generated BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'external';
    `);
    await db.execute(sql`
      ALTER TABLE beat_store_listings
      ALTER COLUMN job_id DROP NOT NULL;
    `);
    await db.execute(sql`
      ALTER TABLE beat_store_purchases
      ADD COLUMN IF NOT EXISTS platform_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 0;
    `);
    console.log('✅ Commission tracking columns added\n');

    console.log('🎉 Migration completed successfully!');
    console.log('\nNew tables created:');
    console.log('  - users');
    console.log('  - user_credits');
    console.log('  - user_payment_methods');
    console.log('  - beat_store_listings');
    console.log('  - beat_store_purchases');
    console.log('\nExisting tables updated:');
    console.log('  - jobs (added userId, cost tracking columns)');
    console.log('  - api_usage (added userId)');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
