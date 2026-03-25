import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@shared/schema';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is missing from your .env file.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  maxUses: 7500,
});

let firstConnect = true;
pool.on('connect', () => {
  if (firstConnect) {
    firstConnect = false;
    try {
      console.log('✅ Success: Connected to local PostgreSQL (unity_db)');
    } catch {}
  }
});

pool.on('error', (err) => {
  try {
    console.error('❌ Database Pool Error:', err);
  } catch {}
});

export const db = drizzle(pool, { schema });
