/**
 * Create Clustering System Tables
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('\n🗄️  Creating Clustering System Tables\n');
  console.log('━'.repeat(80));

  try {
    // Create content_clusters table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS content_clusters (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200),
        content_type VARCHAR(50) NOT NULL,
        cluster_index INTEGER NOT NULL,
        centroid JSONB NOT NULL,
        avg_retention REAL,
        avg_views REAL,
        avg_ctr REAL,
        avg_likes REAL,
        member_count INTEGER NOT NULL DEFAULT 0,
        density REAL,
        silhouette_score REAL,
        description VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT true,
        discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_updated TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Created content_clusters table');

    // Create video_feature_vectors table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS video_feature_vectors (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id VARCHAR(100) NOT NULL UNIQUE,
        youtube_video_id VARCHAR(50),
        content_type VARCHAR(50) NOT NULL,
        bpm REAL,
        energy REAL,
        spectral_centroid REAL,
        spectral_rolloff REAL,
        zero_crossing_rate REAL,
        mfcc_mean JSONB,
        chroma_mean JSONB,
        posting_hour INTEGER,
        posting_day_of_week INTEGER,
        video_duration REAL,
        style_tags JSONB,
        suno_style VARCHAR(200),
        thumbnail_dominant_hue REAL,
        thumbnail_brightness REAL,
        thumbnail_saturation REAL,
        title_length INTEGER,
        title_word_count INTEGER,
        retention_10pct REAL,
        retention_25pct REAL,
        retention_50pct REAL,
        retention_75pct REAL,
        retention_90pct REAL,
        views INTEGER,
        likes INTEGER,
        ctr REAL,
        avg_retention REAL,
        cluster_id VARCHAR(100),
        is_noise BOOLEAN DEFAULT false,
        cluster_confidence REAL,
        features_extracted_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Created video_feature_vectors table');

    // Create clustering_system_state table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clustering_system_state (
        id VARCHAR PRIMARY KEY DEFAULT 'singleton',
        chill_count INTEGER NOT NULL DEFAULT 0,
        trap_count INTEGER NOT NULL DEFAULT 0,
        chill_threshold INTEGER NOT NULL DEFAULT 200,
        trap_threshold INTEGER NOT NULL DEFAULT 200,
        is_active BOOLEAN NOT NULL DEFAULT false,
        activated_at TIMESTAMP,
        last_run_at TIMESTAMP,
        last_run_clusters_found INTEGER,
        last_run_noise_points INTEGER,
        last_run_silhouette_score REAL,
        current_epsilon REAL DEFAULT 0.5,
        current_min_samples INTEGER DEFAULT 5,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Created clustering_system_state table');

    // Create clustering_runs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clustering_runs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        content_type VARCHAR(50) NOT NULL,
        epsilon REAL NOT NULL,
        min_samples INTEGER NOT NULL,
        clusters_found INTEGER NOT NULL,
        noise_points INTEGER NOT NULL,
        total_points INTEGER NOT NULL,
        silhouette_score REAL,
        cluster_sizes JSONB,
        run_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Created clustering_runs table');

    // Insert initial system state
    await db.execute(sql`
      INSERT INTO clustering_system_state (id)
      VALUES ('singleton')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('✅ Initialized clustering system state');

    console.log('\n━'.repeat(80));
    console.log('✅ Clustering system tables created successfully!\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error creating tables:', error);
    console.error(error.message);
    process.exit(1);
  }
}

main();
