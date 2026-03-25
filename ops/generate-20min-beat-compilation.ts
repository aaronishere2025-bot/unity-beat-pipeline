#!/usr/bin/env tsx
/**
 * Generate 20-minute beat compilation with variety
 * Test retention analyzer on multi-segment video
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { retentionSpikeAnalyzer } from './server/services/retention-spike-analyzer';
import axios from 'axios';
import fs from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// 5 different beat styles for variety
const BEAT_STYLES = [
  {
    name: 'Trap Energy',
    style: 'trap, hard 808s, aggressive hi-hats, 140 BPM, dark synth, minor key',
    duration: 240, // 4 minutes
  },
  {
    name: 'Lofi Chill',
    style: 'lofi hip-hop, jazzy chords, 85 BPM, vinyl crackle, mellow bass, chill',
    duration: 240, // 4 minutes
  },
  {
    name: 'Phonk Drift',
    style: 'phonk, cowbell, drift vibes, 160 BPM, memphis rap, hard bass',
    duration: 240, // 4 minutes
  },
  {
    name: 'Boom Bap Classic',
    style: 'boom bap, 95 BPM, dusty drums, jazz sample, SP-404, golden era hip hop',
    duration: 240, // 4 minutes
  },
  {
    name: 'Future Bass',
    style: 'future bass, melodic, 150 BPM, bright synths, uplifting, emotional',
    duration: 240, // 4 minutes
  },
];

interface BeatSegment {
  name: string;
  audioPath: string;
  videoPath: string;
  startTime: number;
  endTime: number;
  duration: number;
  bpm: number;
  style: string;
}

async function generate20MinBeatCompilation() {
  console.log('🎵 GENERATING 20-MINUTE BEAT COMPILATION\n');
  console.log(`📝 Configuration:`);
  console.log(`   Segments: ${BEAT_STYLES.length} different beat styles`);
  console.log(`   Total duration: ~20 minutes`);
  console.log(`   Variety: Trap → Lofi → Phonk → Boom Bap → Future Bass\n`);
  console.log('='.repeat(70));

  const segments: BeatSegment[] = [];
  let currentTime = 0;

  try {
    // PHASE 1: Generate all beat tracks
    console.log('\n🎵 PHASE 1: GENERATING BEAT TRACKS\n');

    for (let i = 0; i < BEAT_STYLES.length; i++) {
      const beatStyle = BEAT_STYLES[i];
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎵 Beat ${i + 1}/${BEAT_STYLES.length}: ${beatStyle.name}`);
      console.log(`${'─'.repeat(70)}`);
      console.log(`   Style: ${beatStyle.style}`);
      console.log(`   Target: ${beatStyle.duration}s\n`);

      // Generate with Suno
      const sunoResult = await sunoApi.generateSong({
        lyrics: '',
        style: beatStyle.style,
        title: `${beatStyle.name} - Beat Compilation Part ${i + 1}`,
        instrumental: true,
        model: 'V5',
      });

      console.log(`   Task ID: ${sunoResult.taskId}`);
      console.log(`   ⏳ Waiting for Suno (2-3 minutes)...`);

      const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000);

      if (!tracks || tracks.length === 0) {
        console.error(`   ❌ Failed to generate ${beatStyle.name}, skipping...`);
        continue;
      }

      const track = tracks.reduce((longest, t) => (t.duration > longest.duration ? t : longest));

      console.log(`   ✅ Generated: ${track.duration.toFixed(1)}s`);

      // Download audio
      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `beat_${i + 1}_${Date.now()}.mp3`);
      const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(audioPath, response.data);

      console.log(`   ✅ Downloaded: ${audioPath}`);

      segments.push({
        name: beatStyle.name,
        audioPath,
        videoPath: '', // Will be generated next
        startTime: currentTime,
        endTime: currentTime + track.duration,
        duration: track.duration,
        bpm: parseInt(beatStyle.style.match(/(\d+)\s*BPM/)?.[1] || '120'),
        style: beatStyle.style,
      });

      currentTime += track.duration;
    }

    console.log(`\n✅ Generated ${segments.length} beat tracks`);
    const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
    console.log(`   Total duration: ${(totalDuration / 60).toFixed(1)} minutes\n`);

    // PHASE 2: Generate videos for each segment
    console.log('\n🎬 PHASE 2: GENERATING VIDEOS FOR EACH SEGMENT\n');

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎬 Video ${i + 1}/${segments.length}: ${segment.name}`);
      console.log(`${'─'.repeat(70)}`);

      // Create job for this segment
      const job = await storage.createJob({
        scriptName: `Beat Compilation - ${segment.name}`,
        scriptContent: segment.style,
        mode: 'music',
        aspectRatio: '9:16',
        clipDuration: 6,
        autoUpload: false,
        metadata: {
          compilationSegment: i + 1,
          totalSegments: segments.length,
          bpm: segment.bpm,
        },
      });

      console.log(`   Job ID: ${job.id}`);
      console.log(`   Generating with music-mode-generator...\n`);

      try {
        const result = await musicModeGenerator.generateVideo(
          {
            packageId: job.id,
            audioFilePath: segment.audioPath,
            audioDuration: segment.duration,
            instrumental: true,
          },
          '9:16',
          (progress, status) => {
            if (progress % 20 === 0) {
              console.log(`   [${progress}%] ${status}`);
            }
          },
        );

        segment.videoPath = result.videoPath;
        console.log(`   ✅ Video: ${result.videoPath}`);

        await storage.updateJob(job.id, {
          status: 'completed',
          videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
          thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
          cost: '0.10',
          duration: Math.floor(segment.duration),
          progress: 100,
          completedAt: new Date(),
        });
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        // Continue with other segments
      }
    }

    const successfulSegments = segments.filter((s) => s.videoPath && fs.existsSync(s.videoPath));
    console.log(`\n✅ Generated ${successfulSegments.length}/${segments.length} videos`);

    if (successfulSegments.length === 0) {
      throw new Error('No videos generated successfully');
    }

    // PHASE 3: Concatenate all segments into compilation
    console.log('\n🎞️  PHASE 3: ASSEMBLING COMPILATION\n');

    // Create concat file
    const concatFile = join(process.cwd(), 'data', 'temp', 'processing', `compilation_concat_${Date.now()}.txt`);
    const concatContent = successfulSegments.map((s) => `file '${s.videoPath}'`).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    const compilationPath = join(process.cwd(), 'data/videos/renders', `beat_compilation_20min_${Date.now()}.mp4`);

    execSync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

    console.log(`   Concatenating ${successfulSegments.length} videos...`);
    execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${compilationPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ Compilation: ${compilationPath}`);

    // Generate thumbnail
    console.log('\n🖼️  GENERATING THUMBNAIL\n');
    const thumbnailPath = join(process.cwd(), 'data/thumbnails', `beat_compilation_${Date.now()}.jpg`);
    execSync(`mkdir -p ${join(process.cwd(), 'data/thumbnails')}`);
    execSync(`ffmpeg -i "${compilationPath}" -ss 00:00:03 -vframes 1 -q:v 2 "${thumbnailPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ Thumbnail: ${thumbnailPath}`);

    // PHASE 4: Test retention analyzer with simulated data
    console.log('\n📊 PHASE 4: TESTING RETENTION ANALYZER\n');
    console.log('   Simulating retention data for each segment...\n');

    // Simulate retention curve with different performance per segment
    const retentionCurve = [];
    const videoFeatures = [];
    let currentRetention = 100;

    for (let i = 0; i < successfulSegments.length; i++) {
      const segment = successfulSegments[i];
      const segmentStartTime = segment.startTime;
      const segmentDuration = segment.duration;

      // Simulate retention behavior based on segment type
      let retentionChange = 0;
      let spikeIntensity = 0;

      // Different segments perform differently
      if (segment.name === 'Trap Energy') {
        // High energy = better retention
        retentionChange = -2; // Slow decline
        spikeIntensity = 0.9;
      } else if (segment.name === 'Lofi Chill') {
        // Chill = moderate retention
        retentionChange = -3;
        spikeIntensity = 0.7;
      } else if (segment.name === 'Phonk Drift') {
        // Phonk = polarizing (big drops or spikes)
        retentionChange = -5; // Some people leave
        spikeIntensity = 1.0; // But fans LOVE it
      } else if (segment.name === 'Boom Bap Classic') {
        // Classic = steady but declining
        retentionChange = -4;
        spikeIntensity = 0.6;
      } else if (segment.name === 'Future Bass') {
        // Uplifting = retention boost
        retentionChange = -1; // Minimal decline
        spikeIntensity = 0.8;
      }

      // Sample every 10 seconds
      for (let t = 0; t < segmentDuration; t += 10) {
        const absTime = segmentStartTime + t;
        currentRetention = Math.max(20, currentRetention + retentionChange);

        // Add retention spike at segment start (new energy)
        if (t === 0 && i > 0) {
          currentRetention = Math.min(100, currentRetention + 8); // Spike from new segment
        }

        // Add beat drop spike in middle of segment
        if (t === Math.floor(segmentDuration / 2)) {
          currentRetention = Math.min(100, currentRetention + 5 * spikeIntensity);

          videoFeatures.push({
            timestamp: absTime,
            type: 'beat_drop' as const,
            intensity: spikeIntensity,
            description: `${segment.name} drop at ${segment.bpm} BPM`,
          });
        }

        retentionCurve.push({
          second: Math.floor(absTime),
          retention: Math.max(20, Math.min(100, currentRetention)),
        });
      }

      // Add visual transition feature at segment boundaries
      if (i < successfulSegments.length - 1) {
        videoFeatures.push({
          timestamp: segment.endTime,
          type: 'visual_transition' as const,
          intensity: 0.8,
          description: `Transition from ${segment.name} to ${successfulSegments[i + 1]?.name}`,
        });
      }
    }

    console.log(`   Generated ${retentionCurve.length} retention data points`);
    console.log(`   Added ${videoFeatures.length} video features\n`);

    // Run retention analysis
    const insights = await retentionSpikeAnalyzer.analyzeVideo('beat-compilation-20min', retentionCurve, videoFeatures);

    // Print results
    const fileSizeMB = (fs.statSync(compilationPath).size / 1024 / 1024).toFixed(1);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ 20-MINUTE BEAT COMPILATION COMPLETE!`);
    console.log(`${'='.repeat(70)}`);

    console.log(`\n🎵 Segments:`);
    successfulSegments.forEach((seg, i) => {
      console.log(`   ${i + 1}. ${seg.name} (${seg.bpm} BPM) - ${seg.duration.toFixed(0)}s`);
    });

    console.log(`\n📊 Stats:`);
    console.log(`   Total segments: ${successfulSegments.length}`);
    console.log(`   Total duration: ${(totalDuration / 60).toFixed(1)} minutes`);
    console.log(`   File size: ${fileSizeMB} MB`);
    console.log(`   Resolution: 720x1280 (9:16)`);

    console.log(`\n📁 Output:`);
    console.log(`   Video: ${compilationPath}`);
    console.log(`   Thumbnail: ${thumbnailPath}`);

    console.log(`\n💰 Cost:`);
    console.log(`   Suno: ${(0.1 * successfulSegments.length).toFixed(2)} (${successfulSegments.length} tracks)`);
    console.log(`   Kling: ${(0.1 * successfulSegments.length).toFixed(2)} (${successfulSegments.length} videos)`);
    console.log(`   Total: ${(0.2 * successfulSegments.length).toFixed(2)}`);

    // Print retention analysis
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 RETENTION ANALYSIS RESULTS`);
    console.log(`${'='.repeat(70)}`);

    console.log(`\n📈 OVERALL SCORE: ${insights.score.overall.toFixed(1)}/100`);
    console.log(`   Hook (3s): ${insights.score.hook.toFixed(1)}%`);
    console.log(`   End Retention: ${insights.score.retention.toFixed(1)}%`);
    console.log(`   Rewatch Score: ${insights.score.rewatch.toFixed(1)}/100`);

    console.log(`\n✅ WHAT'S WORKING (${insights.spikes.length} retention spikes)`);
    console.log('─'.repeat(70));
    insights.spikes.slice(0, 10).forEach((spike, i) => {
      const icon = spike.severity === 'exceptional' ? '🌟' : spike.severity === 'major' ? '💪' : '✨';
      console.log(
        `   ${icon} Spike ${i + 1} at ${Math.floor(spike.second / 60)}:${(spike.second % 60).toString().padStart(2, '0')}: +${spike.spikePercentage.toFixed(1)}% ${spike.reason ? `(${spike.reason})` : ''}`,
      );
    });

    console.log(`\n❌ WHAT'S NOT WORKING (${insights.drops.length} retention drops)`);
    console.log('─'.repeat(70));
    insights.drops.slice(0, 10).forEach((drop, i) => {
      const icon = drop.severity === 'critical' ? '🚨' : drop.severity === 'major' ? '⚠️' : '📉';
      console.log(
        `   ${icon} Drop ${i + 1} at ${Math.floor(drop.second / 60)}:${(drop.second % 60).toString().padStart(2, '0')}: -${drop.dropPercentage.toFixed(1)}% ${drop.reason ? `(${drop.reason})` : ''}`,
      );
    });

    if (insights.successPatterns.length > 0) {
      console.log(`\n🎯 SUCCESS PATTERNS (Top 5)`);
      console.log('─'.repeat(70));
      insights.successPatterns.slice(0, 5).forEach((pattern, i) => {
        console.log(`   ${i + 1}. ${pattern.feature}`);
        console.log(`      +${pattern.avgSpikePercentage.toFixed(1)}% avg | ${pattern.occurrences}x occurrences`);
      });
    }

    if (insights.failurePatterns.length > 0) {
      console.log(`\n🚫 FAILURE PATTERNS (Top 5)`);
      console.log('─'.repeat(70));
      insights.failurePatterns.slice(0, 5).forEach((pattern, i) => {
        console.log(`   ${i + 1}. ${pattern.feature}`);
        console.log(`      -${pattern.avgDropPercentage.toFixed(1)}% avg | ${pattern.occurrences}x occurrences`);
      });
    }

    console.log(`\n💡 RECOMMENDATIONS`);
    console.log('─'.repeat(70));

    if (insights.recommendations.immediate.length > 0) {
      console.log(`\n🔴 Immediate:`);
      insights.recommendations.immediate.forEach((rec) => console.log(`   • ${rec}`));
    }

    if (insights.recommendations.strategic.length > 0) {
      console.log(`\n🟡 Strategic:`);
      insights.recommendations.strategic.forEach((rec) => console.log(`   • ${rec}`));
    }

    if (insights.recommendations.experiment.length > 0) {
      console.log(`\n🟢 Experiment:`);
      insights.recommendations.experiment.forEach((rec) => console.log(`   • ${rec}`));
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ RETENTION ANALYZER TEST COMPLETE!`);
    console.log(`${'='.repeat(70)}\n`);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

generate20MinBeatCompilation();
