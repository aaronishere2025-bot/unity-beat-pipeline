#!/usr/bin/env tsx
/**
 * Generate beat with LOOPING SECTION approach
 * One Kling clip per musical section, looped to fill duration
 * Much more efficient than generating many clips!
 */

import { storage } from './server/storage';
import { sunoApi } from './server/services/suno-api';
import { klingVideoGenerator } from './server/services/kling-video-generator';
import { semanticAudioService } from './server/services/semantic-audio-service';
import { loopingSectionService } from './server/services/looping-section-service';
import type { ChannelConfig } from './server/services/beat-metadata-generator';
import fs from 'fs';
import path from 'path';
import { join } from 'path';

const TRAP_CHANNEL: ChannelConfig = {
  type: 'trap_channel',
  name: 'Trap Beats Channel',
  description: 'Hard trap for rappers',
  primaryGenres: ['Trap', 'Dark Trap', 'Drill'],
  targetAudience: ['rappers', 'producers', 'gym goers'],
};

interface BeatConfig {
  name: string;
  style: string;
  baseVideoPrompt: string;
  channel: ChannelConfig;
}

const TEST_BEAT: BeatConfig = {
  name: 'Dark Trap Energy (Looping)',
  style: 'dark trap, hard 808s, aggressive hi-hats, 140 BPM, minor key, menacing synth',
  baseVideoPrompt: 'abstract dark purple neon lights, geometric patterns, urban street art',
  channel: TRAP_CHANNEL,
};

async function generateLoopingBeat() {
  console.log('🔁 LOOPING SECTION VIDEO GENERATION\n');
  console.log('='.repeat(70));
  console.log('Approach: One Kling clip per musical section, looped to fill\n');
  console.log('Benefits:');
  console.log('  ✅ Lower cost (fewer Kling generations)');
  console.log('  ✅ Visual coherence (no jarring cuts mid-section)');
  console.log('  ✅ Loops at musical phrase boundaries');
  console.log('  ✅ Each section maintains consistent mood\n');
  console.log('='.repeat(70));

  const job = await storage.createJob({
    scriptName: `${TEST_BEAT.name} [${TEST_BEAT.channel.type}]`,
    scriptContent: TEST_BEAT.style,
    mode: 'music',
    aspectRatio: '9:16',
    clipDuration: 6,
    status: 'processing',
    progress: 0,
    metadata: {
      beatStyle: TEST_BEAT.style,
      phase: 'Initializing',
      channelType: TEST_BEAT.channel.type,
      usesSectionLooping: true,
    },
  });

  let totalCost = 0;

  try {
    // STEP 1: Generate music with Suno
    console.log('\n🎵 Step 1: Generating music with Suno...');
    await storage.updateJob(job.id, {
      progress: 10,
      metadata: { ...job.metadata, phase: 'Suno music generation' },
    });

    const result = await sunoApi.generateSong({
      lyrics: '',
      style: TEST_BEAT.style,
      title: TEST_BEAT.name,
      instrumental: true,
      model: 'V5',
    });

    const tracks = await sunoApi.waitForCompletion(result.taskId);
    const audioResult = tracks[0];

    if (!audioResult || !audioResult.audioUrl) {
      throw new Error('No audio URL from Suno');
    }

    const duration = audioResult.duration || 120;
    totalCost += 0.1;
    console.log(`✅ Audio generated: ${duration.toFixed(1)}s ($0.10)`);

    // Download audio
    const audioFilename = `looping_${TEST_BEAT.name.replace(/\s+/g, '_')}_${Date.now()}.mp3`;
    const audioPath = path.join(process.cwd(), 'data/audio', audioFilename);
    const audioResponse = await fetch(audioResult.audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    fs.writeFileSync(audioPath, Buffer.from(audioBuffer));

    // STEP 2: Semantic Analysis
    console.log('\n🧠 Step 2: Semantic analysis with Gemini...');
    await storage.updateJob(job.id, {
      progress: 25,
      metadata: { ...job.metadata, phase: 'Semantic analysis' },
    });

    const semanticAnalysis = await semanticAudioService.analyzeTrack(audioPath, duration);

    if (!semanticAnalysis) {
      throw new Error('Semantic analysis failed');
    }

    console.log(`✅ Semantic analysis complete:`);
    console.log(`   📍 Sections: ${semanticAnalysis.sections.length}`);
    console.log(`   🎭 Mood: ${semanticAnalysis.overall_mood}`);
    console.log(`   📖 Narrative: ${semanticAnalysis.narrative_arc}`);

    // STEP 3: Mock librosa data
    const mockLibrosaData = {
      bpm: 140,
      beats: Array.from({ length: Math.floor(duration / 2.5) }, (_, i) => i * 2.5),
      downbeats: Array.from({ length: Math.floor(duration / 10) }, (_, i) => i * 10),
      energy_curve: Array.from({ length: Math.floor(duration / 0.5) }, () => 0.3 + Math.random() * 0.4),
      duration: duration,
    };

    const mergedTimeline = semanticAudioService.mergeAnalysis(mockLibrosaData, semanticAnalysis);

    // STEP 4: Plan section clips
    console.log('\n📐 Step 4: Planning section-based clips...');
    await storage.updateJob(job.id, {
      progress: 35,
      metadata: { ...job.metadata, phase: 'Planning section clips' },
    });

    const { plan, summary } = await loopingSectionService.planSectionClips(semanticAnalysis, mockLibrosaData);

    console.log(`✅ Generation plan:`);
    console.log(`   🎬 Clips: ${summary.total_clips} (one per section)`);
    console.log(`   💰 Kling cost: ${summary.kling_cost_estimate}`);
    console.log(`   📊 Avg section: ${summary.average_section_duration.toFixed(1)}s`);

    // Show cost comparison
    const costComparison = loopingSectionService.compareCosts(duration, plan.length);
    console.log(`\n💡 Cost comparison:`);
    console.log(
      `   Section-based: ${costComparison.section_based.clips} clips = $${costComparison.section_based.cost.toFixed(2)}`,
    );
    console.log(
      `   Time-based:    ${costComparison.time_based.clips} clips = $${costComparison.time_based.cost.toFixed(2)}`,
    );
    console.log(`   💰 Savings:    $${costComparison.savings.toFixed(2)}`);

    // STEP 5: Generate section clips
    console.log('\n🎬 Step 5: Generating section clips...');

    const generatedClips = [];

    for (let i = 0; i < plan.length; i++) {
      const section = plan[i];
      const clipProgress = 40 + (i / plan.length) * 35;

      await storage.updateJob(job.id, {
        progress: Math.round(clipProgress),
        metadata: { ...job.metadata, phase: `Clip ${i + 1}/${plan.length}: ${section.section_type}` },
      });

      console.log(`\n   Clip ${i + 1}/${plan.length}: ${section.section_type.toUpperCase()}`);
      console.log(
        `   📍 Section: ${section.section_start.toFixed(1)}s - ${section.section_end.toFixed(1)}s (${section.section_duration.toFixed(1)}s)`,
      );
      console.log(`   🎬 Generate: ${section.gen_duration.toFixed(1)}s clip`);
      console.log(
        `   🔁 Loop: ${section.loop_strategy.type} (${section.loop_strategy.output_duration.toFixed(1)}s total)`,
      );

      // Get context for enhanced prompt
      const context = semanticAudioService.getPromptContext(section.gen_start, mergedTimeline, semanticAnalysis);

      if (!context) {
        console.log(`   ⚠️  No context, using base prompt`);
        continue;
      }

      const enhancedPrompt = semanticAudioService.generateEnhancedPrompt(
        TEST_BEAT.baseVideoPrompt,
        context,
        TEST_BEAT.channel.type,
      );

      console.log(`   🎨 Mood: ${section.mood} | Energy: ${section.energy}/10`);
      console.log(`   📝 Prompt: "${enhancedPrompt.substring(0, 80)}..."`);

      // Generate clip
      const clipResult = await klingVideoGenerator.generateSingleClip(enhancedPrompt, {
        duration: Math.round(section.gen_duration),
        aspectRatio: '9:16',
        mode: 'std',
      });

      if (clipResult.videoUrl) {
        totalCost += 0.1;

        const filename = path.basename(clipResult.videoUrl);
        const sourceClipPath = path.join(process.cwd(), 'data/videos/clips', filename);
        const clipPath = path.join(
          process.cwd(),
          'data',
          'temp',
          'processing',
          `looping_section_${i}_${Date.now()}.mp4`,
        );

        if (fs.existsSync(sourceClipPath)) {
          fs.copyFileSync(sourceClipPath, clipPath);
          generatedClips.push({
            section_index: i,
            original_path: clipPath,
            loop_strategy: section.loop_strategy,
          });
          console.log(`   ✅ Generated ($0.10)`);
        }
      }

      // Small delay between clips
      if (i < plan.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // STEP 6: Loop clips to fill sections
    console.log(`\n🔁 Step 6: Looping clips to fill sections...`);
    await storage.updateJob(job.id, {
      progress: 80,
      metadata: { ...job.metadata, phase: 'Looping clips' },
    });

    const loopedClips = [];
    for (let i = 0; i < generatedClips.length; i++) {
      const clip = generatedClips[i];
      const loopedPath = path.join(
        process.cwd(),
        'data',
        'temp',
        'processing',
        `looped_section_${i}_${Date.now()}.mp4`,
      );

      await loopingSectionService.loopClip(clip.original_path, clip.loop_strategy, loopedPath);

      loopedClips.push(loopedPath);
    }

    console.log(`   ✅ ${loopedClips.length} sections looped`);

    // STEP 7: Assemble final video
    console.log(`\n🔧 Step 7: Assembling final video...`);
    await storage.updateJob(job.id, {
      progress: 90,
      metadata: { ...job.metadata, phase: 'Final assembly' },
    });

    const finalVideoPath = path.join(
      process.cwd(),
      'data/videos/renders',
      `looping_${TEST_BEAT.name.replace(/\s+/g, '_')}_${Date.now()}.mp4`,
    );

    await loopingSectionService.assembleFinalVideo(loopedClips, audioPath, finalVideoPath);

    // Generate thumbnail
    const thumbnailPath = path.join(process.cwd(), 'data/thumbnails', `looping_${job.id}_thumbnail.jpg`);
    const { execSync } = await import('child_process');
    execSync(
      `ffmpeg -y -i "${finalVideoPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" "${thumbnailPath}"`,
    );

    // Complete
    const videoFilename = path.basename(finalVideoPath);
    const finalVideoStats = fs.statSync(finalVideoPath);

    await storage.updateJob(job.id, {
      status: 'completed',
      progress: 100,
      videoUrl: `/api/videos/${videoFilename}`,
      cost: totalCost.toString(),
      duration: Math.round(duration),
      fileSize: finalVideoStats.size,
      metadata: {
        ...job.metadata,
        phase: 'Complete',
        sections: plan.length,
        loopingApproach: true,
        totalCost,
      },
    });

    console.log('\n' + '='.repeat(70));
    console.log('✅ LOOPING SECTION VIDEO COMPLETE!');
    console.log('='.repeat(70));
    console.log(`\n📊 Results:`);
    console.log(`   🎬 Sections: ${plan.length}`);
    console.log(`   💰 Cost: $${totalCost.toFixed(2)}`);
    console.log(`   ⏱️  Duration: ${duration.toFixed(1)}s`);
    console.log(`   📂 Size: ${(finalVideoStats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`   🔗 Job: ${job.id}\n`);

    // Cleanup
    generatedClips.forEach((clip) => fs.unlinkSync(clip.original_path));
    loopedClips.forEach((clip) => fs.unlinkSync(clip));

    console.log('💡 This approach:');
    console.log('   ✅ Used only ONE clip per section (looped)');
    console.log('   ✅ No jarring cuts within sections');
    console.log('   ✅ Loops at musical phrase boundaries');
    console.log(`   ✅ Saved ~$${costComparison.savings.toFixed(2)} vs time-based approach\n`);
  } catch (error: any) {
    console.error(`\n❌ Failed: ${error.message}`);
    await storage.updateJob(job.id, {
      status: 'failed',
      error: error.message,
    });
  }
}

generateLoopingBeat();
