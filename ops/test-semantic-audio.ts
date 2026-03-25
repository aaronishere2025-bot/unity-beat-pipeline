#!/usr/bin/env tsx
/**
 * Test semantic audio analysis
 * Demonstrates how Gemini semantic understanding enhances video generation
 */

import { semanticAudioService } from './server/services/semantic-audio-service';
import fs from 'fs';
import path from 'path';

async function testSemanticAnalysis() {
  console.log('🎵 TESTING SEMANTIC AUDIO ANALYSIS\n');
  console.log('='.repeat(70));

  // Find a beat audio file to analyze
  const audioDir = path.join(process.cwd(), 'data/audio');
  if (!fs.existsSync(audioDir)) {
    console.log('\n❌ No audio files found in data/audio/');
    console.log('Run generate-10-beats-parallel.ts first to create audio files\n');
    return;
  }

  const audioFiles = fs.readdirSync(audioDir).filter((f) => f.endsWith('.mp3'));
  if (audioFiles.length === 0) {
    console.log('\n❌ No MP3 files found in data/audio/');
    return;
  }

  const audioPath = path.join(audioDir, audioFiles[0]);
  console.log(`\n📂 Analyzing: ${audioFiles[0]}`);

  // Estimate duration (in real usage, get this from Suno result)
  const duration = 120; // 2 minutes

  // Step 1: Get semantic analysis from Gemini
  console.log('\n━━━ STEP 1: SEMANTIC ANALYSIS (GEMINI) ━━━\n');
  const semanticAnalysis = await semanticAudioService.analyzeTrack(audioPath, duration);

  if (!semanticAnalysis) {
    console.log('❌ Semantic analysis failed\n');
    return;
  }

  console.log('\n📊 Semantic Analysis Results:\n');
  console.log(`   🎭 Overall Mood: ${semanticAnalysis.overall_mood}`);
  console.log(`   📖 Narrative Arc: ${semanticAnalysis.narrative_arc}`);
  console.log(`   🎨 Visual Style: ${semanticAnalysis.recommended_visual_style}`);
  console.log(`   🎯 Climax at: ${semanticAnalysis.climax_timestamp.toFixed(1)}s`);
  console.log(`   🏷️  Themes: ${semanticAnalysis.lyrical_themes.join(', ')}`);
  console.log(`   🎵 Genre Elements: ${semanticAnalysis.genre_elements.join(', ')}`);

  console.log(`\n   📍 Sections (${semanticAnalysis.sections.length}):\n`);
  for (const section of semanticAnalysis.sections) {
    const keyMarker = section.key_moment ? '⭐' : '  ';
    console.log(
      `   ${keyMarker} ${section.start_time.toFixed(1)}s - ${section.end_time.toFixed(1)}s | ` +
        `${section.section_type.toUpperCase().padEnd(8)} | ` +
        `Energy: ${section.energy_level}/10 | ` +
        `Mood: ${section.mood}`,
    );
    if (section.key_moment && section.moment_description) {
      console.log(`      💡 ${section.moment_description}`);
    }
    console.log(`      🎬 Visual: ${section.visual_suggestion}`);
  }

  // Step 2: Simulate librosa technical analysis
  console.log('\n\n━━━ STEP 2: MERGE WITH TECHNICAL DATA ━━━\n');

  // In real usage, this comes from audio-analysis-service
  const mockLibrosaData = {
    bpm: 140,
    beats: Array.from({ length: 50 }, (_, i) => i * 2.5), // Beat every 2.5s
    energy_curve: Array.from({ length: 240 }, (_, i) => 0.3 + Math.random() * 0.4), // 0.5s intervals
    duration: duration,
  };

  const mergedTimeline = semanticAudioService.mergeAnalysis(mockLibrosaData, semanticAnalysis);

  console.log('   ✅ Merged semantic + technical data\n');
  console.log(`   Unified Timeline (${mergedTimeline.length} segments):\n`);

  for (const segment of mergedTimeline) {
    const climaxMarker = segment.is_climax ? '🎯' : '  ';
    console.log(
      `   ${climaxMarker} ${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s | ` +
        `${segment.section_type.padEnd(8)} | ` +
        `${segment.beat_count} beats | ` +
        `Energy: ${segment.avg_energy.toFixed(2)} | ` +
        `Weight: ${segment.prompt_weight.toFixed(2)}`,
    );
  }

  // Step 3: Generate enhanced prompts
  console.log('\n\n━━━ STEP 3: GENERATE CONTEXT-AWARE PROMPTS ━━━\n');

  const basePrompt = 'abstract neon geometric shapes, urban street art';
  const timestamps = [10, 30, semanticAnalysis.climax_timestamp, 100];

  for (const timestamp of timestamps) {
    const context = semanticAudioService.getPromptContext(timestamp, mergedTimeline, semanticAnalysis);

    if (!context) continue;

    console.log(`\n   🕐 Timestamp: ${timestamp}s`);
    console.log(`   📍 Section: ${context.current_segment.section_type} | Mood: ${context.current_segment.mood}`);
    console.log(
      `   ⚡ Energy: ${context.current_segment.avg_energy.toFixed(2)} | Weight: ${context.current_segment.prompt_weight.toFixed(2)}`,
    );
    console.log(`   ${context.is_near_climax ? '🎯 NEAR CLIMAX!' : ''}`);

    const enhancedPrompt = semanticAudioService.generateEnhancedPrompt(basePrompt, context, 'trap_channel');

    console.log(`\n   Base prompt:`);
    console.log(`   "${basePrompt}"`);
    console.log(`\n   Enhanced prompt:`);
    console.log(`   "${enhancedPrompt}"`);
  }

  // Step 4: Optimal clip boundaries
  console.log('\n\n━━━ STEP 4: OPTIMAL CLIP BOUNDARIES ━━━\n');

  const clipBoundaries = semanticAudioService.getClipBoundaries(semanticAnalysis, 8);

  console.log(`   Recommended clip boundaries (${clipBoundaries.length} cuts):\n`);
  for (let i = 0; i < clipBoundaries.length - 1; i++) {
    const start = clipBoundaries[i];
    const end = clipBoundaries[i + 1];
    const duration = end - start;

    const context = semanticAudioService.getPromptContext(start, mergedTimeline, semanticAnalysis);
    const sectionType = context?.current_segment.section_type || 'unknown';

    console.log(
      `   Clip ${i + 1}: ${start.toFixed(1)}s - ${end.toFixed(1)}s (${duration.toFixed(1)}s) | ${sectionType}`,
    );
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Semantic analysis complete!\n');
  console.log('💡 This analysis can now drive video generation with:');
  console.log("   - Context-aware prompts that match the music's emotional journey");
  console.log('   - Clip boundaries aligned with musical sections');
  console.log('   - Visual emphasis on climax moments');
  console.log('   - Smooth narrative flow instead of random clips\n');
}

testSemanticAnalysis().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
