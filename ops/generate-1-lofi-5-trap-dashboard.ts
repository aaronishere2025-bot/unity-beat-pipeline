#!/usr/bin/env tsx
/**
 * Generate 1 Lofi + 5 Trap Videos with Real-Time Dashboard Updates
 * - Creates all jobs IMMEDIATELY so they appear in dashboard
 * - Updates progress in real-time
 * - 1 lofi video (16:9, 20-30 minutes)
 * - 5 trap videos (16:9, ~2 minutes each)
 */

import { storage } from './server/storage';
import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { join } from 'path';

const BEATS = [
  {
    id: 'lofi-1',
    genre: 'lofi',
    title: 'Lofi Study Vibes - 30 Minutes',
    style:
      'lofi hip-hop, chill study beats, 80 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative',
    targetDuration: 1800, // 30 minutes
    aspectRatio: '16:9' as const,
  },
  {
    id: 'trap-1',
    genre: 'trap',
    title: 'Dark Trap Beat #1',
    style: 'Dark trap, 140 BPM, heavy 808 bass, crispy hi-hats, menacing synths, atmospheric pads, hard-hitting drums',
    targetDuration: 120, // 2 minutes
    aspectRatio: '16:9' as const,
  },
  {
    id: 'trap-2',
    genre: 'trap',
    title: 'Chill Trap Beat #2',
    style: 'Chill trap, 145 BPM, atmospheric synths, smooth 808s, crispy hi-hats, dreamy pads, lo-fi aesthetic',
    targetDuration: 120,
    aspectRatio: '16:9' as const,
  },
  {
    id: 'trap-3',
    genre: 'trap',
    title: 'Aggressive Trap Beat #3',
    style: 'Aggressive trap, 150 BPM, distorted 808s, rapid hi-hats, dark synths, intense energy, club banger',
    targetDuration: 120,
    aspectRatio: '16:9' as const,
  },
  {
    id: 'trap-4',
    genre: 'trap',
    title: 'Melodic Trap Beat #4',
    style: 'Melodic trap, 138 BPM, emotional piano, smooth 808s, atmospheric pads, dreamy vibes, modern trap',
    targetDuration: 120,
    aspectRatio: '16:9' as const,
  },
  {
    id: 'trap-5',
    genre: 'trap',
    title: 'Vibrant Trap Beat #5',
    style: 'Vibrant trap, 142 BPM, colorful synths, bouncy 808s, energetic hi-hats, uplifting pads, party vibes',
    targetDuration: 120,
    aspectRatio: '16:9' as const,
  },
];

async function generate1Lofi5TrapDashboard() {
  console.log('🎵 GENERATING 1 LOFI + 5 TRAP VIDEOS (REAL-TIME DASHBOARD)\n');
  console.log('📊 Plan:');
  console.log(`   - 1 lofi video (16:9, 30 minutes)`);
  console.log(`   - 5 trap videos (16:9, ~2 minutes each)`);
  console.log(`   - Total: 6 videos`);
  console.log(`   - Jobs will appear in dashboard immediately!\n`);
  console.log('='.repeat(70));

  try {
    // Check Suno API
    if (!sunoApi.isConfigured()) {
      throw new Error('Suno API not configured - set SUNO_API_KEY');
    }

    // ============================================
    // PHASE 0: CREATE ALL JOBS UPFRONT (so they appear in dashboard immediately)
    // ============================================
    console.log(`\n📋 PHASE 0: CREATING JOBS IN DASHBOARD\n`);

    const jobs: Array<{ jobId: string; beatConfig: (typeof BEATS)[0] }> = [];

    for (let i = 0; i < BEATS.length; i++) {
      const beat = BEATS[i];
      console.log(`   Creating job ${i + 1}/${BEATS.length}: ${beat.title}...`);

      const job = await storage.createJob({
        mode: 'music',
        aspectRatio: beat.aspectRatio,
        scriptName: beat.title,
        scriptContent: `${beat.genre} beat - ${beat.style}`,
        audioDuration: beat.targetDuration.toString(),
        status: 'queued',
        progress: 0,
      });

      jobs.push({ jobId: job.id, beatConfig: beat });
      console.log(`   ✅ Job created: ${job.id}`);
    }

    console.log(`\n✅ All ${jobs.length} jobs created and visible in dashboard!`);
    console.log(`   Check http://localhost:5000 to see them\n`);

    // ============================================
    // PHASE 1: Generate music and update jobs
    // ============================================
    console.log(`\n🎵 PHASE 1: GENERATING ${BEATS.length} MUSIC TRACKS\n`);

    const musicTracks: Array<{
      jobId: string;
      beatConfig: (typeof BEATS)[0];
      audioPath: string;
      duration: number;
    }> = [];

    for (let i = 0; i < jobs.length; i++) {
      const { jobId, beatConfig } = jobs[i];

      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎵 Track ${i + 1}/${jobs.length}: ${beatConfig.title} (${beatConfig.genre})`);
      console.log(`${'─'.repeat(70)}`);
      console.log(`   Job ID: ${jobId}`);
      console.log(`   Style: ${beatConfig.style.substring(0, 80)}...`);
      console.log(`   Duration: ${beatConfig.targetDuration}s (${(beatConfig.targetDuration / 60).toFixed(1)} min)\n`);

      try {
        // Update job to "processing"
        await storage.updateJob(jobId, {
          status: 'processing',
          progress: 5,
          statusMessage: 'Generating music with Suno...',
        });

        // Generate with Suno
        console.log(`   [${i + 1}.1] Generating music with Suno...`);
        const sunoResult = await sunoApi.generateSong({
          lyrics: '',
          style: beatConfig.style,
          title: beatConfig.title,
          instrumental: true,
          model: 'V5',
          targetDuration: beatConfig.targetDuration,
        });

        console.log(`   Task ID: ${sunoResult.taskId}`);
        console.log(`   ⏳ Waiting for Suno...`);

        await storage.updateJob(jobId, {
          progress: 10,
          statusMessage: 'Waiting for Suno to complete...',
        });

        const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000);

        if (!tracks || tracks.length === 0) {
          console.error(`   ❌ Suno generation failed, skipping track ${i + 1}\n`);
          await storage.updateJob(jobId, {
            status: 'failed',
            error: 'Suno music generation failed',
            progress: 0,
          });
          continue;
        }

        const track = tracks[0];
        console.log(`   ✅ Music ready: ${(track.duration / 60).toFixed(1)} min (${track.duration.toFixed(1)}s)`);

        await storage.updateJob(jobId, {
          progress: 20,
          statusMessage: 'Downloading audio...',
          musicUrl: track.audioUrl,
          audioDuration: Math.floor(track.duration).toString(),
        });

        // Download audio
        console.log(`   [${i + 1}.2] Downloading audio...`);
        const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `${beatConfig.id}_${Date.now()}.mp3`);
        const axios = (await import('axios')).default;
        const fs = await import('fs');

        const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(audioPath, response.data);
        const fileSizeMB = (response.data.length / 1024 / 1024).toFixed(1);
        console.log(`   ✅ Downloaded: ${fileSizeMB}MB → ${audioPath}`);

        await storage.updateJob(jobId, {
          progress: 25,
          statusMessage: 'Music ready, preparing video generation...',
        });

        musicTracks.push({
          jobId,
          beatConfig,
          audioPath,
          duration: track.duration,
        });
      } catch (error: any) {
        console.error(`   ❌ Error on track ${i + 1}: ${error.message}`);
        await storage.updateJob(jobId, {
          status: 'failed',
          error: error.message,
          progress: 0,
        });
      }
    }

    if (musicTracks.length === 0) {
      console.error('\n❌ No music tracks generated successfully');
      return;
    }

    console.log(`\n✅ Successfully generated ${musicTracks.length}/${BEATS.length} music tracks\n`);

    // ============================================
    // PHASE 2: Generate videos with progress updates
    // ============================================
    console.log(`\n🎬 PHASE 2: GENERATING ${musicTracks.length} VIDEOS\n`);

    for (let i = 0; i < musicTracks.length; i++) {
      const { jobId, beatConfig, audioPath, duration } = musicTracks[i];

      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎬 Video ${i + 1}/${musicTracks.length}: ${beatConfig.title}`);
      console.log(`${'─'.repeat(70)}`);
      console.log(`   Job ID: ${jobId}`);

      try {
        await storage.updateJob(jobId, {
          status: 'processing',
          progress: 30,
          statusMessage: `Analyzing beats with librosa...`,
        });

        // Generate video
        console.log(`   Generating video with Music Mode...`);

        const startTime = Date.now();
        const result = await musicModeGenerator.generateVideo(
          {
            packageId: jobId,
            audioFilePath: audioPath,
            audioDuration: duration,
            instrumental: true,
          },
          beatConfig.aspectRatio,
          async (percent, message) => {
            // Map music mode progress (0-100) to job progress (30-95)
            const jobProgress = Math.floor(30 + percent * 0.65);
            await storage.updateJob(jobId, {
              progress: jobProgress,
              statusMessage: message,
            });

            if (percent % 20 === 0) {
              console.log(`   [${percent}%] ${message}`);
            }
          },
        );

        const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

        console.log(`\n   ✅ Video ${i + 1}/${musicTracks.length} complete!`);
        console.log(`   📁 Video: ${result.videoPath}`);
        console.log(`   🖼️  Thumbnail: ${result.thumbnailPath}`);
        console.log(`   🎨 Theme: ${result.theme}`);
        console.log(`   ⏱️  Processing time: ${elapsedMinutes} minutes`);

        // Update job to completed
        await storage.updateJob(jobId, {
          status: 'completed',
          videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
          thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
          cost: '0.20',
          duration: Math.floor(duration),
          progress: 100,
          statusMessage: 'Complete!',
          completedAt: new Date(),
          musicAnalysis: {
            bpm: result.beatAnalysis?.bpm,
            key: result.beatAnalysis?.key,
            beatTimestamps: result.beatAnalysis?.beats || [],
          } as any,
        });
      } catch (error: any) {
        console.error(`   ❌ Error generating video ${i + 1}: ${error.message}`);
        await storage.updateJob(jobId, {
          status: 'failed',
          error: error.message,
          progress: 0,
        });
      }
    }

    // ============================================
    // FINAL SUMMARY
    // ============================================
    const completedJobs = musicTracks.length;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ BATCH COMPLETE: ${completedJobs}/${BEATS.length} VIDEOS GENERATED`);
    console.log(`${'='.repeat(70)}`);
    console.log(`\n📺 View all videos at: http://localhost:5000`);
    console.log(`\n🎉 All jobs updated in dashboard!\n`);
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
  }
}

generate1Lofi5TrapDashboard().catch(console.error);
