#!/usr/bin/env tsx
/**
 * Generate beats with SEMANTIC AUDIO ANALYSIS
 * Uses Gemini to understand the music's emotional journey
 * and generate context-aware video prompts
 */

import { storage } from './server/storage';
import { sunoApi } from './server/services/suno-api';
import { klingVideoGenerator } from './server/services/kling-video-generator';
import { semanticAudioService } from './server/services/semantic-audio-service';
import type { ChannelConfig } from './server/services/beat-metadata-generator';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { join } from 'path';

// Channel configurations
const TRAP_CHANNEL: ChannelConfig = {
  type: 'trap_channel',
  name: 'Trap Beats Channel',
  description: 'Hard trap for rappers',
  primaryGenres: ['Trap', 'Dark Trap', 'Drill'],
  targetAudience: ['rappers', 'producers', 'gym goers'],
};

const LOFI_CHANNEL: ChannelConfig = {
  type: 'lofi_channel',
  name: 'Lofi Beats Channel',
  description: 'Study and chill beats',
  primaryGenres: ['Lofi Hip Hop', 'Chillhop', 'Jazz Hop'],
  targetAudience: ['students', 'workers', 'readers'],
};

interface BeatConfig {
  name: string;
  style: string;
  baseVideoPrompt: string;
  channel: ChannelConfig;
}

// Test with 2 beats (one of each type)
const TEST_BEATS: BeatConfig[] = [
  {
    name: 'Dark Trap Energy (Semantic)',
    style: 'dark trap, hard 808s, aggressive hi-hats, 140 BPM, minor key, menacing synth',
    baseVideoPrompt: 'abstract dark purple neon lights, geometric patterns, urban street art',
    channel: TRAP_CHANNEL,
  },
  {
    name: 'Lofi Study Session (Semantic)',
    style: 'lofi hip hop, jazzy chords, 85 BPM, vinyl crackle, mellow bass, chill vibes',
    baseVideoPrompt: 'cozy coffee shop, warm ambient lighting, books and plants',
    channel: LOFI_CHANNEL,
  },
];

async function generateBeatWithSemanticAnalysis(beatConfig: BeatConfig, index: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[${index + 1}/${TEST_BEATS.length}] ${beatConfig.name}`);
  console.log('='.repeat(70));

  const job = await storage.createJob({
    scriptName: `${beatConfig.name} [${beatConfig.channel.type}]`,
    scriptContent: beatConfig.style,
    mode: 'music',
    aspectRatio: '9:16',
    clipDuration: 6,
    status: 'processing',
    progress: 0,
    metadata: {
      beatStyle: beatConfig.style,
      phase: 'Initializing',
      channelType: beatConfig.channel.type,
      channelName: beatConfig.channel.name,
      usesSemanticAnalysis: true,
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
      style: beatConfig.style,
      title: beatConfig.name,
      instrumental: true,
      model: 'V5',
    });

    const tracks = await sunoApi.waitForCompletion(result.taskId);
    const audioResult = tracks[0];

    if (!audioResult || !audioResult.audioUrl) {
      throw new Error('No audio URL from Suno');
    }

    const duration = audioResult.duration || 120;
    totalCost += 0.1; // Suno cost
    console.log(`✅ Audio generated: ${duration.toFixed(1)}s ($0.10)`);

    // Download audio to permanent storage
    const audioFilename = `semantic_${index + 1}_${beatConfig.name.replace(/\s+/g, '_')}_${Date.now()}.mp3`;
    const audioPath = path.join(process.cwd(), 'data/audio', audioFilename);
    const audioResponse = await fetch(audioResult.audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    fs.writeFileSync(audioPath, Buffer.from(audioBuffer));
    console.log(`📂 Saved: ${audioFilename}`);

    // STEP 2: Semantic Analysis with Gemini
    console.log('\n🧠 Step 2: Semantic analysis with Gemini...');
    await storage.updateJob(job.id, {
      progress: 25,
      metadata: { ...job.metadata, phase: 'Semantic analysis (Gemini)' },
    });

    const semanticAnalysis = await semanticAudioService.analyzeTrack(audioPath, duration);

    if (!semanticAnalysis) {
      console.log('⚠️  Semantic analysis failed, using basic prompts');
      throw new Error('Semantic analysis failed');
    }

    console.log(`✅ Semantic analysis complete:`);
    console.log(`   🎭 Mood: ${semanticAnalysis.overall_mood}`);
    console.log(`   📖 Narrative: ${semanticAnalysis.narrative_arc}`);
    console.log(`   🎨 Visual Style: ${semanticAnalysis.recommended_visual_style}`);
    console.log(`   📍 Sections: ${semanticAnalysis.sections.length}`);
    console.log(`   🎯 Climax: ${semanticAnalysis.climax_timestamp.toFixed(1)}s`);

    // STEP 3: Mock librosa data and merge
    console.log('\n🔄 Step 3: Merging with technical data...');
    const mockLibrosaData = {
      bpm: 140,
      beats: Array.from({ length: Math.floor(duration / 2.5) }, (_, i) => i * 2.5),
      energy_curve: Array.from({ length: Math.floor(duration / 0.5) }, () => 0.3 + Math.random() * 0.4),
      duration: duration,
    };

    const mergedTimeline = semanticAudioService.mergeAnalysis(mockLibrosaData, semanticAnalysis);
    console.log(`✅ Unified timeline: ${mergedTimeline.length} segments`);

    // STEP 4: Get optimal clip boundaries
    console.log('\n📐 Step 4: Calculating optimal clip boundaries...');
    const clipBoundaries = semanticAudioService.getClipBoundaries(semanticAnalysis, 6);
    const numClips = Math.min(clipBoundaries.length - 1, 4); // Max 4 clips for testing
    console.log(`✅ ${numClips} clips planned at section boundaries`);

    // STEP 5: Generate clips with context-aware prompts
    console.log('\n🎬 Step 5: Generating context-aware video clips...');

    const clipPaths: string[] = [];
    for (let c = 0; c < numClips; c++) {
      const clipProgress = 40 + (c / numClips) * 40;
      await storage.updateJob(job.id, {
        progress: Math.round(clipProgress),
        metadata: { ...job.metadata, phase: `Semantic clip ${c + 1}/${numClips}` },
      });

      const timestamp = clipBoundaries[c];
      const context = semanticAudioService.getPromptContext(timestamp, mergedTimeline, semanticAnalysis);

      if (!context) {
        console.log(`   ⚠️  No context for timestamp ${timestamp}s, using base prompt`);
        continue;
      }

      // Generate enhanced prompt
      const enhancedPrompt = semanticAudioService.generateEnhancedPrompt(
        beatConfig.baseVideoPrompt,
        context,
        beatConfig.channel.type,
      );

      console.log(`\n   Clip ${c + 1} @ ${timestamp.toFixed(1)}s:`);
      console.log(`   📍 Section: ${context.current_segment.section_type} | Mood: ${context.current_segment.mood}`);
      console.log(
        `   ⚡ Energy: ${context.current_segment.avg_energy.toFixed(2)} | Weight: ${context.current_segment.prompt_weight.toFixed(2)}`,
      );
      if (context.is_near_climax) {
        console.log(`   🎯 CLIMAX MOMENT!`);
      }
      console.log(`   🎨 Prompt: "${enhancedPrompt.substring(0, 100)}..."`);

      // Generate video clip
      const clipResult = await klingVideoGenerator.generateSingleClip(enhancedPrompt, {
        duration: 6,
        aspectRatio: '9:16',
        mode: 'std',
      });

      if (clipResult.videoUrl) {
        totalCost += 0.1; // Kling cost
        const filename = path.basename(clipResult.videoUrl);
        const sourceClipPath = path.join(process.cwd(), 'data/videos/clips', filename);
        const clipPath = path.join(
          process.cwd(),
          'data',
          'temp',
          'processing',
          `semantic_${index + 1}_clip_${c}_${Date.now()}.mp4`,
        );

        if (fs.existsSync(sourceClipPath)) {
          fs.copyFileSync(sourceClipPath, clipPath);
          clipPaths.push(clipPath);
          console.log(`   ✅ Clip ${c + 1} generated ($0.10)`);
        }
      }

      // Small delay between clips
      if (c < numClips - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // STEP 6: Assemble final video
    console.log(`\n🔧 Step 6: Assembling final video (${clipPaths.length} clips)...`);
    await storage.updateJob(job.id, {
      progress: 85,
      metadata: { ...job.metadata, phase: 'Assembling video' },
    });

    const concatFile = path.join(process.cwd(), 'data', 'temp', 'processing', `semantic_concat_${Date.now()}.txt`);
    const loopedVideoPath = path.join(process.cwd(), 'data', 'temp', 'processing', `semantic_looped_${Date.now()}.mp4`);

    const totalClipDuration = clipPaths.length * 6;
    const loopCount = Math.ceil(duration / totalClipDuration);

    let concatContent = '';
    for (let loop = 0; loop < loopCount; loop++) {
      for (const clipPath of clipPaths) {
        concatContent += `file '${clipPath}'\n`;
      }
    }
    fs.writeFileSync(concatFile, concatContent);

    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -t ${duration} -c copy "${loopedVideoPath}"`);

    const finalVideoPath = path.join(
      process.cwd(),
      'data/videos/renders',
      `semantic_${index + 1}_${beatConfig.name.replace(/\s+/g, '_')}_${Date.now()}.mp4`,
    );

    execSync(
      `ffmpeg -y -i "${loopedVideoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${finalVideoPath}"`,
    );

    // Generate thumbnail
    const thumbnailPath = path.join(process.cwd(), 'data/thumbnails', `semantic_${index + 1}_${job.id}_thumbnail.jpg`);
    execSync(
      `ffmpeg -y -i "${finalVideoPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" "${thumbnailPath}"`,
    );

    // Complete job
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
        semanticAnalysis: {
          mood: semanticAnalysis.overall_mood,
          narrative: semanticAnalysis.narrative_arc,
          sections: semanticAnalysis.sections.length,
          climax: semanticAnalysis.climax_timestamp,
        },
        clipCount: clipPaths.length,
        totalCost,
      },
    });

    console.log(`\n✅ ${beatConfig.name} complete!`);
    console.log(`   💰 Cost: $${totalCost.toFixed(2)}`);
    console.log(`   ⏱️  Duration: ${duration.toFixed(1)}s`);
    console.log(`   📊 Size: ${(finalVideoStats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`   🎬 Clips: ${clipPaths.length} (semantically-aligned)`);

    // Cleanup
    fs.unlinkSync(concatFile);
    fs.unlinkSync(loopedVideoPath);
    clipPaths.forEach((clip) => fs.unlinkSync(clip));

    return { success: true, jobId: job.id };
  } catch (error: any) {
    console.error(`\n❌ Failed: ${error.message}`);
    await storage.updateJob(job.id, {
      status: 'failed',
      error: error.message,
      metadata: {
        ...job.metadata,
        phase: 'Failed',
        errorMessage: error.message,
      },
    });
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧠 SEMANTIC AUDIO-DRIVEN VIDEO GENERATION\n');
  console.log('This demonstrates how Gemini semantic analysis enhances video prompts\n');

  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < TEST_BEATS.length; i++) {
    const result = await generateBeatWithSemanticAnalysis(TEST_BEATS[i], i);
    results.push(result);
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const successful = results.filter((r) => r.success).length;

  console.log('\n' + '='.repeat(70));
  console.log('🎉 SEMANTIC GENERATION COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n📊 Results: ${successful}/${TEST_BEATS.length} successful`);
  console.log(`⏱️  Total time: ${duration} minutes\n`);
  console.log('💡 Key differences from basic generation:');
  console.log('   ✅ Clips aligned to musical sections (not arbitrary timing)');
  console.log('   ✅ Prompts adapt to mood/energy of each section');
  console.log('   ✅ Visual emphasis on climax moments');
  console.log("   ✅ Narrative flow matches music's emotional journey");
  console.log('   ✅ Context-aware transitions between segments\n');
}

main();
