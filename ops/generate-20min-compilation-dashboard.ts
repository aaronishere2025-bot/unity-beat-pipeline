#!/usr/bin/env tsx
/**
 * Generate 20-minute beat compilation - Shows in dashboard as single job
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { retentionSpikeAnalyzer } from './server/services/retention-spike-analyzer';
import axios from 'axios';
import fs from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const BEAT_STYLES = [
  {
    name: 'Trap Energy',
    style: 'trap, hard 808s, aggressive hi-hats, 140 BPM, dark synth, minor key',
  },
  {
    name: 'Lofi Chill',
    style: 'lofi hip-hop, jazzy chords, 85 BPM, vinyl crackle, mellow bass, chill',
  },
  {
    name: 'Phonk Drift',
    style: 'phonk, cowbell, drift vibes, 160 BPM, memphis rap, hard bass',
  },
  {
    name: 'Boom Bap Classic',
    style: 'boom bap, 95 BPM, dusty drums, jazz sample, SP-404, golden era hip hop',
  },
  {
    name: 'Future Bass',
    style: 'future bass, melodic, 150 BPM, bright synths, uplifting, emotional',
  },
];

interface BeatSegment {
  name: string;
  audioPath: string;
  videoPath: string;
  duration: number;
  bpm: number;
}

async function generateCompilationDashboard() {
  console.log('🎵 GENERATING 20-MINUTE BEAT COMPILATION\n');
  console.log(`📝 Configuration: ${BEAT_STYLES.length} beat styles\n`);
  console.log('='.repeat(70));

  const segments: BeatSegment[] = [];

  try {
    // CREATE MASTER JOB FIRST (shows in dashboard immediately)
    console.log('\n📝 CREATING MASTER JOB IN DASHBOARD\n');

    const masterJob = await storage.createJob({
      scriptName: '20-Minute Beat Compilation',
      scriptContent: BEAT_STYLES.map((s) => s.name).join(' → '),
      mode: 'music',
      aspectRatio: '9:16',
      clipDuration: 6,
      autoUpload: false,
      metadata: {
        isCompilation: true,
        segments: BEAT_STYLES.length,
        styles: BEAT_STYLES.map((s) => s.name),
      },
    });

    console.log(`   ✅ Master Job ID: ${masterJob.id}`);
    console.log(`   📺 View at: http://localhost:8080\n`);

    await storage.updateJob(masterJob.id, {
      status: 'processing',
      progress: 5,
    });

    // PHASE 1: Generate beat tracks
    console.log('\n🎵 PHASE 1: GENERATING BEAT TRACKS\n');

    for (let i = 0; i < BEAT_STYLES.length; i++) {
      const beatStyle = BEAT_STYLES[i];
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎵 Beat ${i + 1}/${BEAT_STYLES.length}: ${beatStyle.name}`);
      console.log(`${'─'.repeat(70)}`);

      await storage.updateJob(masterJob.id, {
        progress: 5 + Math.floor((i / BEAT_STYLES.length) * 20),
      });

      const sunoResult = await sunoApi.generateSong({
        lyrics: '',
        style: beatStyle.style,
        title: `${beatStyle.name} - Part ${i + 1}`,
        instrumental: true,
        model: 'V5',
      });

      console.log(`   Task ID: ${sunoResult.taskId}`);
      console.log(`   ⏳ Waiting for Suno...`);

      const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000);

      if (!tracks || tracks.length === 0) {
        console.error(`   ❌ Failed, skipping...`);
        continue;
      }

      const track = tracks.reduce((longest, t) => (t.duration > longest.duration ? t : longest));

      console.log(`   ✅ Generated: ${track.duration.toFixed(1)}s`);

      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `comp_beat_${i + 1}_${Date.now()}.mp3`);
      const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(audioPath, response.data);

      segments.push({
        name: beatStyle.name,
        audioPath,
        videoPath: '',
        duration: track.duration,
        bpm: parseInt(beatStyle.style.match(/(\d+)\s*BPM/)?.[1] || '120'),
      });

      console.log(`   ✅ Downloaded`);
    }

    await storage.updateJob(masterJob.id, {
      progress: 25,
    });

    console.log(`\n✅ Generated ${segments.length} tracks`);
    const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
    console.log(`   Total: ${(totalDuration / 60).toFixed(1)} minutes\n`);

    // PHASE 2: Generate videos
    console.log('\n🎬 PHASE 2: GENERATING VIDEOS\n');

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎬 Video ${i + 1}/${segments.length}: ${segment.name}`);
      console.log(`${'─'.repeat(70)}`);

      await storage.updateJob(masterJob.id, {
        progress: 25 + Math.floor((i / segments.length) * 50),
      });

      // Create temporary job for video generation
      const tempJob = await storage.createJob({
        scriptName: `[Temp] ${segment.name}`,
        scriptContent: segment.name,
        mode: 'music',
        aspectRatio: '9:16',
        clipDuration: 6,
        autoUpload: false,
        metadata: { isTemporary: true, parentJob: masterJob.id },
      });

      try {
        const result = await musicModeGenerator.generateVideo(
          {
            packageId: tempJob.id,
            audioFilePath: segment.audioPath,
            audioDuration: segment.duration,
            instrumental: true,
          },
          '9:16',
          (progress, status) => {
            if (progress % 25 === 0) {
              console.log(`   [${progress}%] ${status}`);
            }
          },
        );

        segment.videoPath = result.videoPath;
        console.log(`   ✅ Video: ${result.videoPath}`);

        // Mark temporary job as completed (auto-cleanup later)
        await storage.updateJob(tempJob.id, {
          status: 'completed',
          progress: 100,
        });
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        await storage.updateJob(tempJob.id, {
          status: 'failed',
          error_message: error.message,
        });
      }
    }

    await storage.updateJob(masterJob.id, {
      progress: 75,
    });

    const successfulSegments = segments.filter((s) => s.videoPath && fs.existsSync(s.videoPath));
    console.log(`\n✅ Generated ${successfulSegments.length}/${segments.length} videos`);

    if (successfulSegments.length === 0) {
      throw new Error('No videos generated');
    }

    // PHASE 3: Assemble compilation
    console.log('\n🎞️  PHASE 3: ASSEMBLING 20-MINUTE COMPILATION\n');

    await storage.updateJob(masterJob.id, {
      progress: 80,
    });

    const concatFile = join(process.cwd(), 'data', 'temp', 'processing', `comp_concat_${Date.now()}.txt`);
    const concatContent = successfulSegments.map((s) => `file '${s.videoPath}'`).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    const compilationPath = join(
      process.cwd(),
      'data/videos/renders',
      `beat_compilation_${masterJob.id}_${Date.now()}.mp4`,
    );

    execSync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

    console.log(`   Concatenating ${successfulSegments.length} videos...`);
    execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${compilationPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ Compilation: ${compilationPath}`);

    await storage.updateJob(masterJob.id, {
      progress: 90,
    });

    // Generate thumbnail
    const thumbnailPath = join(process.cwd(), 'data/thumbnails', `${masterJob.id}_thumbnail.jpg`);
    execSync(`mkdir -p ${join(process.cwd(), 'data/thumbnails')}`);
    execSync(`ffmpeg -i "${compilationPath}" -ss 00:00:03 -vframes 1 -q:v 2 "${thumbnailPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ Thumbnail: ${thumbnailPath}`);

    // Update master job with final video
    await storage.updateJob(masterJob.id, {
      status: 'completed',
      videoUrl: `/api/videos/${compilationPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${thumbnailPath.split('/').pop()}`,
      cost: (0.2 * successfulSegments.length).toFixed(2),
      duration: Math.floor(totalDuration),
      progress: 95,
      completedAt: new Date(),
    });

    console.log(`\n✅ Master job updated!`);

    // PHASE 4: Test retention analyzer
    console.log('\n📊 PHASE 4: RETENTION ANALYZER TEST\n');

    await storage.updateJob(masterJob.id, {
      progress: 98,
    });

    // Simulate retention curve
    const retentionCurve = [];
    const videoFeatures = [];
    let currentRetention = 100;
    let currentTime = 0;

    for (let i = 0; i < successfulSegments.length; i++) {
      const segment = successfulSegments[i];
      const segmentDuration = segment.duration;

      let retentionChange = 0;
      let spikeIntensity = 0;

      if (segment.name === 'Trap Energy') {
        retentionChange = -2;
        spikeIntensity = 0.9;
      } else if (segment.name === 'Lofi Chill') {
        retentionChange = -3;
        spikeIntensity = 0.7;
      } else if (segment.name === 'Phonk Drift') {
        retentionChange = -5;
        spikeIntensity = 1.0;
      } else if (segment.name === 'Boom Bap Classic') {
        retentionChange = -4;
        spikeIntensity = 0.6;
      } else if (segment.name === 'Future Bass') {
        retentionChange = -1;
        spikeIntensity = 0.8;
      }

      for (let t = 0; t < segmentDuration; t += 10) {
        currentRetention = Math.max(20, currentRetention + retentionChange);

        if (t === 0 && i > 0) {
          currentRetention = Math.min(100, currentRetention + 8);
        }

        if (t === Math.floor(segmentDuration / 2)) {
          currentRetention = Math.min(100, currentRetention + 5 * spikeIntensity);
          videoFeatures.push({
            timestamp: currentTime + t,
            type: 'beat_drop' as const,
            intensity: spikeIntensity,
            description: `${segment.name} drop at ${segment.bpm} BPM`,
          });
        }

        retentionCurve.push({
          second: Math.floor(currentTime + t),
          retention: Math.max(20, Math.min(100, currentRetention)),
        });
      }

      currentTime += segmentDuration;
    }

    const insights = await retentionSpikeAnalyzer.analyzeVideo(masterJob.id, retentionCurve, videoFeatures);

    await storage.updateJob(masterJob.id, {
      progress: 100,
    });

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
    console.log(`   Job ID: ${masterJob.id}`);
    console.log(`   Total duration: ${(totalDuration / 60).toFixed(1)} minutes`);
    console.log(`   File size: ${fileSizeMB} MB`);

    console.log(`\n📁 Output:`);
    console.log(`   Video: ${compilationPath}`);
    console.log(`   Thumbnail: ${thumbnailPath}`);

    console.log(`\n💰 Cost: $${(0.2 * successfulSegments.length).toFixed(2)}`);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 RETENTION ANALYSIS`);
    console.log(`${'='.repeat(70)}`);

    console.log(`\n📈 Score: ${insights.score.overall.toFixed(1)}/100`);
    console.log(`   Spikes: ${insights.spikes.length}`);
    console.log(`   Drops: ${insights.drops.length}`);

    if (insights.spikes.length > 0) {
      console.log(`\n✅ Top Spikes:`);
      insights.spikes.slice(0, 5).forEach((s, i) => {
        console.log(
          `   ${i + 1}. ${Math.floor(s.second / 60)}:${(s.second % 60).toString().padStart(2, '0')} +${s.spikePercentage.toFixed(1)}%`,
        );
      });
    }

    if (insights.drops.length > 0) {
      console.log(`\n❌ Top Drops:`);
      insights.drops.slice(0, 5).forEach((d, i) => {
        console.log(
          `   ${i + 1}. ${Math.floor(d.second / 60)}:${(d.second % 60).toString().padStart(2, '0')} -${d.dropPercentage.toFixed(1)}%`,
        );
      });
    }

    console.log(`\n✨ View in dashboard: http://localhost:8080`);
    console.log(`${'='.repeat(70)}\n`);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

generateCompilationDashboard();
