#!/usr/bin/env tsx
/**
 * Test Music Mode Pipeline
 *
 * Tests the complete Music Mode flow:
 * 1. Generate Suno music
 * 2. Run beat analyzer
 * 3. Select theme
 * 4. Generate looped background
 * 5. Apply beat effects
 * 6. Add karaoke
 * 7. Generate thumbnail
 */

import { storage } from './server/storage';
import { jobWorker } from './server/services/job-worker';
import { existsSync } from 'fs';

async function testMusicMode() {
  console.log('🎵 MUSIC MODE TEST - Starting...\n');

  try {
    // ============================================
    // TEST 1: Create Music Mode job
    // ============================================
    console.log('TEST 1: Creating Music Mode job...');

    const testJob = await storage.createJob({
      mode: 'music',
      aspectRatio: '9:16',
      scriptName: 'Test Music Mode - Hip Hop Battle',
      scriptContent: `[Verse 1]
Testing the beat sync system
Every word drops on the rhythm
Watching the effects come alive
Music Mode is ready to thrive

[Chorus]
Drop the beat now feel the energy
Flashing lights and visual synergy
Looped backgrounds with vibrant themes
This is what the future means

[Verse 2]
From the trap to the orchestral
Every genre gets its visual
Mushrooms for the chill lofi vibe
Neon streets where the city's alive`,
      musicDescription: 'Hip-hop, rap battle, 95 BPM, energetic',
      unityPackageId: null, // Will be set after Unity generation
    });

    console.log(`   ✅ Created job: ${testJob.id}`);
    console.log(`   Mode: ${testJob.mode}`);
    console.log(`   Aspect Ratio: ${testJob.aspectRatio}\n`);

    // ============================================
    // TEST 2: Generate Unity package (for music)
    // ============================================
    console.log('TEST 2: Generating Unity package for music...');

    const { unityContentGenerator } = await import('./server/services/unity-content-generator');

    const unityPackage = await unityContentGenerator.generateCompletePackage({
      topic: 'Test Music Mode Video',
      targetDurationSeconds: 90,
      voice: 'male',
      energy: 'high',
      mood: 'confident',
      bpm: 95,
      stylePreset: 'hip_hop_battle',
      generateMusic: true, // CRITICAL: Generate Suno music
    });

    console.log(`   ✅ Unity package created: ${unityPackage.metadata.topic}`);
    console.log(`   Audio: ${unityPackage.sunoAudioUrl}`);
    console.log(`   Duration: ${unityPackage.actualSongDuration}s`);
    console.log(`   BPM: ${unityPackage.timing.bpm}\n`);

    // Save Unity package to database
    const savedPackage = await storage.createUnityContentPackage({
      topic: unityPackage.metadata.topic,
      packageData: unityPackage,
      audioFilePath: '', // Will be set after Suno download
      audioDuration: unityPackage.actualSongDuration || 90,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`   ✅ Saved package ID: ${savedPackage.id}\n`);

    // Update job with Unity package ID
    await storage.updateJob(testJob.id, {
      unityPackageId: savedPackage.id,
      unityMetadata: {
        packageId: savedPackage.id,
        automationSource: 'manual_test',
      } as any,
    });

    // ============================================
    // TEST 3: Wait for Suno music generation
    // ============================================
    console.log('TEST 3: Waiting for Suno music generation...');
    console.log('   ⏳ This may take 60-120 seconds...\n');

    // Poll for Suno completion
    let sunoComplete = false;
    let attempts = 0;
    const maxAttempts = 40; // 40 * 5s = 3.3 minutes max

    while (!sunoComplete && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s

      const updatedPackage = await storage.getUnityContentPackage(savedPackage.id);
      if (updatedPackage?.audioFilePath && existsSync(updatedPackage.audioFilePath)) {
        sunoComplete = true;
        console.log(`   ✅ Suno music ready: ${updatedPackage.audioFilePath}`);
        break;
      }

      attempts++;
      console.log(`   ⏳ Attempt ${attempts}/${maxAttempts}...`);
    }

    if (!sunoComplete) {
      throw new Error('Suno music generation timed out');
    }

    console.log();

    // ============================================
    // TEST 4: Process Music Mode job
    // ============================================
    console.log('TEST 4: Processing Music Mode job...');
    console.log('   This will:');
    console.log('   - Run beat analyzer');
    console.log('   - Select theme based on genre');
    console.log('   - Generate/loop background video');
    console.log('   - Apply beat-reactive effects');
    console.log('   - Add karaoke subtitles');
    console.log('   - Generate thumbnail\n');

    await jobWorker.processJob(testJob.id);

    // ============================================
    // TEST 5: Verify completion
    // ============================================
    console.log('TEST 5: Verifying job completion...');

    const completedJob = await storage.getJob(testJob.id);

    if (!completedJob) {
      throw new Error('Job not found after processing');
    }

    if (completedJob.status !== 'completed') {
      throw new Error(`Job failed with status: ${completedJob.status}`);
    }

    console.log(`   ✅ Job completed!`);
    console.log(`   Status: ${completedJob.status}`);
    console.log(`   Video: ${completedJob.videoUrl}`);
    console.log(`   Thumbnail: ${completedJob.thumbnailUrl}`);
    console.log(`   Cost: $${completedJob.cost}`);
    console.log(`   Duration: ${completedJob.duration}s`);
    console.log(`   Theme: ${completedJob.unityMetadata?.musicModeTheme || 'unknown'}`);
    console.log(`   Loop count: ${completedJob.unityMetadata?.loopCount || 'unknown'}`);

    if (completedJob.musicAnalysis) {
      console.log(`\n   🎵 Beat Analysis:`);
      console.log(`      BPM: ${completedJob.musicAnalysis.bpm}`);
      console.log(`      Key: ${completedJob.musicAnalysis.key || 'unknown'}`);
      console.log(`      Beats: ${completedJob.musicAnalysis.beatTimestamps?.length || 0}`);
      console.log(`      Segments: ${completedJob.musicAnalysis.structure?.sections?.length || 0}`);
    }

    console.log('\n🎉 Music Mode test PASSED!\n');
    console.log('Next steps:');
    console.log('- View video in dashboard');
    console.log('- Test with different genres');
    console.log('- Verify beat sync accuracy');
    console.log('- Check visual theme matches genre');
  } catch (error: any) {
    console.error('\n❌ Music Mode test FAILED:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testMusicMode().catch(console.error);
