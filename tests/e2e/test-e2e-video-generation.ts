#!/usr/bin/env tsx

/**
 * Complete End-to-End Video Generation Test
 *
 * This script tests the full video generation pipeline:
 * 1. Dynamic content discovery (find fresh historical figure)
 * 2. Unity package creation (lyrics + prompts + characters)
 * 3. Job creation with Unity metadata
 * 4. Full video generation (Suno → Kling → FFmpeg → Assembly)
 * 5. Monitor to completion
 */

import { initializeSecretsFromGCP } from '../../server/secret-manager-loader.js';
import { autonomousGoalAgent } from '../../server/services/autonomous-goal-agent.js';
import { dynamicFigureDiscovery } from '../../server/services/dynamic-figure-discovery.js';
import { Pool } from 'pg';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   END-TO-END VIDEO GENERATION TEST                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Load secrets
    console.log('🔐 Step 1: Loading secrets from GCP...');
    await initializeSecretsFromGCP();
    console.log('   ✅ Secrets loaded\n');

    // Step 2: Dynamic content discovery
    console.log('🔍 Step 2: Dynamic Content Discovery...');
    const discoveries = await dynamicFigureDiscovery.discoverFreshFigure(1);

    if (discoveries.length === 0) {
      throw new Error('No fresh figures discovered');
    }

    const figure = discoveries[0];
    console.log(`   ✅ Discovered: ${figure.fullName}`);
    console.log(`      Era: ${figure.era}`);
    console.log(`      Angle: ${figure.angle}`);
    console.log(`      Viral Potential: ${figure.estimatedViralPotential}/10\n`);

    // Step 3: Create Unity package
    console.log('📦 Step 3: Creating Unity Package...');
    console.log('   (This may take 2-3 minutes for lyrics + prompts generation)\n');

    const packageResult = await autonomousGoalAgent.createPackageFromGoal({
      useDynamicDiscovery: true,
      intent: 'viral',
      constraints: {
        maxDuration: 60,
        aspectRatio: '9:16',
      },
    });

    console.log(`   ✅ Package created: ${packageResult.packageId}`);
    console.log(`      Figure: ${packageResult.plan.figure}`);
    console.log(`      Hook: ${packageResult.plan.recommendedApproach.hook}\n`);

    // Step 4: Get package data for job creation
    console.log('📊 Step 4: Fetching Package Data...');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const packageQuery = await pool.query(
      'SELECT package_data, topic, title FROM unity_content_packages WHERE id = $1',
      [packageResult.packageId],
    );

    if (packageQuery.rows.length === 0) {
      throw new Error('Package not found in database');
    }

    const packageData = packageQuery.rows[0].package_data;
    const promptCount = packageData.prompts?.length || packageData.veoPrompts?.length || 0;

    console.log(`   ✅ Package loaded`);
    console.log(`      Prompts: ${promptCount}`);
    console.log(`      Has lyrics: ${!!packageData.lyrics}\n`);

    // Step 5: Create video generation job
    console.log('🎬 Step 5: Creating Video Generation Job...');
    const jobResult = await pool.query(
      `
      INSERT INTO jobs (
        id,
        mode,
        status,
        script_name,
        script_content,
        aspect_ratio,
        auto_upload,
        max_retries,
        retry_count,
        progress,
        unity_metadata,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid()::text,
        'unity_kling',
        'queued',
        $1,
        $2,
        '9:16',
        false,
        3,
        0,
        0,
        $3::json,
        NOW(),
        NOW()
      )
      RETURNING id, mode, status;
    `,
      [
        packageQuery.rows[0].title || 'E2E Test Video',
        packageQuery.rows[0].topic || 'Historical Figure Video',
        JSON.stringify({
          packageId: packageResult.packageId,
          promptCount: promptCount,
          estimatedCost: promptCount * 0.1,
          automationSource: 'e2e_test',
          topic: packageQuery.rows[0].topic,
        }),
      ],
    );

    const job = jobResult.rows[0];
    console.log(`   ✅ Job created: ${job.id}`);
    console.log(`      Mode: ${job.mode}`);
    console.log(`      Status: ${job.status}\n`);

    // Step 6: Monitor job progress
    console.log('👀 Step 6: Monitoring Job Progress...');
    console.log('   Expected stages:');
    console.log('   1. Music generation (Suno API)');
    console.log('   2. Audio analysis (BPM/energy detection)');
    console.log('   3. Video clip generation (Kling API)');
    console.log('   4. FFmpeg assembly + karaoke subtitles');
    console.log('   5. Final render\n');
    console.log('   Checking every 30 seconds...\n');

    let lastStatus = job.status;
    let lastProgress = 0;
    let checkCount = 0;
    const maxChecks = 60; // 30 minutes max
    let stages: string[] = [];

    while (checkCount < maxChecks) {
      await new Promise((resolve) => setTimeout(resolve, 30000)); // Check every 30s
      checkCount++;

      const statusQuery = await pool.query(
        `SELECT
          status,
          progress,
          retry_count,
          error_message,
          unity_metadata,
          music_analysis,
          completed_clips
        FROM jobs WHERE id = $1`,
        [job.id],
      );

      if (statusQuery.rows.length === 0) {
        console.log('   ❌ Job was deleted or not found\n');
        break;
      }

      const currentJob = statusQuery.rows[0];

      // Detect stage changes
      const newStages: string[] = [];
      if (currentJob.music_analysis && !stages.includes('music')) {
        newStages.push('music');
        console.log('   🎵 Music generation completed');
      }
      if (currentJob.completed_clips?.length > 0 && !stages.includes('clips')) {
        newStages.push('clips');
        console.log(`   🎥 Video clips generated: ${currentJob.completed_clips.length} clips`);
      }
      stages = [...stages, ...newStages];

      // Status changes
      if (currentJob.status !== lastStatus) {
        console.log(`   📊 Status: ${lastStatus} → ${currentJob.status}`);
        lastStatus = currentJob.status;
      }

      // Progress changes
      if (currentJob.progress !== lastProgress) {
        console.log(`   ⏳ Progress: ${currentJob.progress}%`);
        lastProgress = currentJob.progress;
      }

      // Retry detection
      if (currentJob.status === 'failed' && currentJob.retry_count > 0) {
        console.log(`   🔄 Auto-retry triggered (attempt ${currentJob.retry_count}/3)`);
        console.log(`      Error: ${currentJob.error_message || 'Unknown'}`);
      }

      // Completion
      if (currentJob.status === 'completed') {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   ✅ VIDEO GENERATION COMPLETE!                            ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        console.log(`   Total time: ${Math.round((checkCount * 30) / 60)} minutes`);
        console.log(`   Total retries: ${currentJob.retry_count || 0}`);
        console.log(`   Final progress: ${currentJob.progress}%`);

        // Get final video path
        const finalQuery = await pool.query('SELECT final_video_path FROM jobs WHERE id = $1', [job.id]);
        if (finalQuery.rows[0]?.final_video_path) {
          console.log(`   Video location: ${finalQuery.rows[0].final_video_path}\n`);
        }
        break;
      }

      // Permanent failure
      if (currentJob.status === 'failed' && currentJob.retry_count >= 3) {
        console.log('\n❌ Job permanently failed after max retries');
        console.log(`   Retry attempts: ${currentJob.retry_count}`);
        console.log(`   Error: ${currentJob.error_message || 'Unknown'}\n`);
        break;
      }
    }

    if (checkCount >= maxChecks) {
      console.log('\n⏱️  Timeout: Job took longer than 30 minutes');
      console.log('   Job is still processing - check dashboard for updates\n');
    }

    await pool.end();
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('🎉 End-to-end test completed!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
