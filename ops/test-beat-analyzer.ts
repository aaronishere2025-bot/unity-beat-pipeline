#!/usr/bin/env tsx
/**
 * Test script for beat_analyzer module integration
 *
 * Demonstrates how to call the Python beat analyzer from TypeScript
 * and use the results for video prompt generation.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

interface Segment {
  type: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'drop' | 'break';
  start: number;
  end: number;
  energy: number;
  label: string | null;
}

interface DropPoint {
  timestamp: number;
  intensity: number;
}

interface BeatAnalysis {
  filename: string;
  duration: number;
  bpm: number;
  key: string | null;
  segments: Segment[];
  beats: number[];
  energy_curve: [number, number][];
  drop_points: DropPoint[];
  transition_candidates: number[];
  metadata: {
    spectral_centroid_mean: number;
    spectral_centroid_std: number;
    onset_count: number;
    energy_trend: string;
    sample_rate: number;
  };
}

function analyzeBeat(audioPath: string): BeatAnalysis {
  console.log(`🎵 Analyzing: ${audioPath}`);

  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  try {
    // Run beat analyzer using venv Python directly
    const result = execSync(`cd scripts && ../venv/bin/python -m beat_analyzer.cli "${audioPath}" --quiet`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const analysis: BeatAnalysis = JSON.parse(result);
    return analysis;
  } catch (error: any) {
    throw new Error(`Beat analysis failed: ${error.message}`);
  }
}

function generatePromptForSegment(segment: Segment, topic: string): { prompt: string; timestamp: string } {
  const duration = segment.end - segment.start;

  // Energy-based visual intensity
  const intensity = segment.energy > 0.7 ? 'intense' : segment.energy > 0.5 ? 'moderate' : 'calm';

  // Type-based scene description
  let sceneType: string;
  switch (segment.type) {
    case 'intro':
      sceneType = 'opening establishing shot';
      break;
    case 'verse':
      sceneType = 'storytelling scene';
      break;
    case 'chorus':
      sceneType = 'dramatic action scene';
      break;
    case 'bridge':
      sceneType = 'contemplative transition';
      break;
    case 'drop':
      sceneType = 'explosive climactic moment';
      break;
    case 'outro':
      sceneType = 'closing resolution';
      break;
    default:
      sceneType = 'dynamic scene';
  }

  const prompt = `${topic}, ${sceneType}, ${intensity} energy, cinematic lighting, dynamic camera movement`;

  return {
    prompt,
    timestamp: `${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s`,
  };
}

// Example usage
async function main() {
  // Find a test audio file
  const testAudioPath =
    '/home/aaronishere2025/data/temp/processing/stems_cache/d0aff69e9b756046edc5a5670973f478/vocals.wav';

  if (!existsSync(testAudioPath)) {
    console.log('❌ Test audio file not found. Please provide a path to an audio file.');
    process.exit(1);
  }

  try {
    console.log('=== Beat Analyzer Integration Test ===\n');

    // Analyze the track
    const analysis = analyzeBeat(testAudioPath);

    // Display results
    console.log('✅ Analysis complete!');
    console.log(`   Filename: ${analysis.filename}`);
    console.log(`   Duration: ${analysis.duration.toFixed(2)}s`);
    console.log(`   BPM: ${analysis.bpm.toFixed(1)}`);
    console.log(`   Key: ${analysis.key || 'Unknown'}`);
    console.log(`   Segments: ${analysis.segments.length}`);
    console.log(`   Beats: ${analysis.beats.length}`);
    console.log(`   Energy curve points: ${analysis.energy_curve.length}`);
    console.log(`   Drop points: ${analysis.drop_points.length}`);
    console.log(`   Transition candidates: ${analysis.transition_candidates.length}`);
    console.log(`   Energy trend: ${analysis.metadata.energy_trend}`);

    // Generate prompts for each segment
    console.log('\n=== Generated Video Prompts ===\n');

    const topic = 'Historical battle scene';

    analysis.segments.forEach((segment, index) => {
      const { prompt, timestamp } = generatePromptForSegment(segment, topic);
      console.log(`Segment ${index + 1} [${segment.type}] (${timestamp}):`);
      console.log(`  Energy: ${segment.energy.toFixed(2)}`);
      console.log(`  Prompt: ${prompt}`);
      console.log();
    });

    // Show drop points (good for visual transitions)
    if (analysis.drop_points.length > 0) {
      console.log('=== Drop Points (Visual Transitions) ===\n');
      analysis.drop_points.forEach((drop, index) => {
        console.log(`Drop ${index + 1}: ${drop.timestamp.toFixed(2)}s (intensity: ${drop.intensity.toFixed(2)})`);
      });
      console.log();
    }

    // Show transition candidates
    console.log('=== Transition Candidates (Scene Changes) ===\n');
    console.log(analysis.transition_candidates.map((t) => `${t.toFixed(1)}s`).join(', '));
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
