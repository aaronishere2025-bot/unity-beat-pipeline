#!/usr/bin/env tsx
/**
 * Generate 1 Lofi + 5 Trap Videos with YouTube Scheduled Uploads
 * - 1 lofi video (16:9, 20-30 minutes)
 * - 5 trap videos (16:9, ~2 minutes each)
 * - Scheduled uploads alternating trap/lofi every hour starting at 12pm tomorrow
 */

import { storage } from './server/storage';
import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { youtubeUploadService } from './server/services/youtube-upload-service';
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

/**
 * Generate scheduled upload times alternating between genres
 * Pattern: trap, lofi, trap, lofi, trap, trap (since we have 5 trap + 1 lofi)
 * Times: 12pm, 1pm, 2pm, 3pm, 4pm, 5pm tomorrow
 */
function generateSchedule(): Array<{ genre: string; publishAt: string; time: string }> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0); // Start at 12pm tomorrow

  const schedule: Array<{ genre: string; publishAt: string; time: string }> = [];

  // Pattern: trap, lofi, trap, trap, trap, trap (trying to alternate but we have more trap)
  const pattern = ['trap', 'lofi', 'trap', 'trap', 'trap', 'trap'];

  for (let i = 0; i < pattern.length; i++) {
    const publishTime = new Date(tomorrow);
    publishTime.setHours(12 + i); // 12pm, 1pm, 2pm, 3pm, 4pm, 5pm

    schedule.push({
      genre: pattern[i],
      publishAt: publishTime.toISOString(),
      time: publishTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    });
  }

  return schedule;
}

async function generate1Lofi5TrapScheduled() {
  console.log('🎵 GENERATING 1 LOFI + 5 TRAP VIDEOS WITH SCHEDULED UPLOADS\n');
  console.log('📊 Plan:');
  console.log(`   - 1 lofi video (16:9, 30 minutes)`);
  console.log(`   - 5 trap videos (16:9, ~2 minutes each)`);
  console.log(`   - Total: 6 videos\n`);

  // Generate schedule
  const uploadSchedule = generateSchedule();

  console.log('📅 Upload Schedule (YouTube Scheduler):');
  uploadSchedule.forEach((slot, i) => {
    console.log(`   ${i + 1}. ${slot.time} - ${slot.genre}`);
  });
  console.log();
  console.log('='.repeat(70));

  const generatedVideos: any[] = [];

  try {
    // Check services
    if (!sunoApi.isConfigured()) {
      throw new Error('Suno API not configured - set SUNO_API_KEY');
    }

    if (!youtubeUploadService.isEnabled()) {
      console.warn('⚠️ YouTube upload not configured - videos will be generated but not uploaded');
    }

    // ============================================
    // PHASE 1: Generate all music tracks
    // ============================================
    console.log(`\n🎵 PHASE 1: GENERATING ${BEATS.length} MUSIC TRACKS\n`);

    const musicTracks: Array<{
      beatConfig: (typeof BEATS)[0];
      audioPath: string;
      duration: number;
    }> = [];

    for (let i = 0; i < BEATS.length; i++) {
      const beat = BEATS[i];
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎵 Track ${i + 1}/${BEATS.length}: ${beat.title} (${beat.genre})`);
      console.log(`${'─'.repeat(70)}`);
      console.log(`   Style: ${beat.style.substring(0, 80)}...`);
      console.log(`   Duration: ${beat.targetDuration}s (${(beat.targetDuration / 60).toFixed(1)} min)`);
      console.log(`   Aspect ratio: ${beat.aspectRatio}\n`);

      try {
        // Generate with Suno
        console.log(`   [${i + 1}.1] Generating music with Suno...`);
        const sunoResult = await sunoApi.generateSong({
          lyrics: '',
          style: beat.style,
          title: beat.title,
          instrumental: true,
          model: 'V5',
          targetDuration: beat.targetDuration,
        });

        console.log(`   Task ID: ${sunoResult.taskId}`);
        console.log(`   ⏳ Waiting for Suno (${beat.genre === 'lofi' ? '2-4 minutes' : '60-120 seconds'})...`);

        const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000); // 10 min timeout

        if (!tracks || tracks.length === 0) {
          console.error(`   ❌ Suno generation failed, skipping track ${i + 1}\n`);
          continue;
        }

        const track = tracks[0];
        console.log(`   ✅ Music ready: ${(track.duration / 60).toFixed(1)} min (${track.duration.toFixed(1)}s)`);

        // Download audio
        console.log(`   [${i + 1}.2] Downloading audio...`);
        const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `${beat.id}_${Date.now()}.mp3`);
        const axios = (await import('axios')).default;
        const fs = await import('fs');

        const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(audioPath, response.data);
        const fileSizeMB = (response.data.length / 1024 / 1024).toFixed(1);
        console.log(`   ✅ Downloaded: ${fileSizeMB}MB → ${audioPath}`);

        musicTracks.push({
          beatConfig: beat,
          audioPath,
          duration: track.duration,
        });
      } catch (error: any) {
        console.error(`   ❌ Error on track ${i + 1}: ${error.message}`);
      }
    }

    if (musicTracks.length === 0) {
      console.error('\n❌ No music tracks generated successfully');
      return;
    }

    console.log(`\n✅ Successfully generated ${musicTracks.length}/${BEATS.length} music tracks`);
    console.log(
      `   Total audio duration: ${(musicTracks.reduce((sum, t) => sum + t.duration, 0) / 60).toFixed(1)} minutes\n`,
    );

    // ============================================
    // PHASE 2: Generate videos
    // ============================================
    console.log(`\n🎬 PHASE 2: GENERATING ${musicTracks.length} VIDEOS\n`);

    for (let i = 0; i < musicTracks.length; i++) {
      const { beatConfig, audioPath, duration } = musicTracks[i];

      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎬 Video ${i + 1}/${musicTracks.length}: ${beatConfig.title}`);
      console.log(`${'─'.repeat(70)}`);

      try {
        // Create job
        console.log(`   [${i + 1}.1] Creating job...`);
        const job = await storage.createJob({
          mode: 'music',
          aspectRatio: beatConfig.aspectRatio,
          scriptName: beatConfig.title,
          scriptContent: `${beatConfig.genre} beat - ${beatConfig.style.substring(0, 100)}`,
          musicUrl: audioPath,
          audioDuration: Math.floor(duration).toString(),
        });
        console.log(`   ✅ Job created: ${job.id}`);

        // Generate video
        console.log(`   [${i + 1}.2] Generating video with Music Mode...`);
        console.log(`   This will:`);
        console.log(`   - Analyze beats and energy with librosa`);
        console.log(`   - Select ${beatConfig.genre}-themed visual`);
        console.log(`   - Generate 5s Kling AI background (16:9)`);
        console.log(`   - Loop seamlessly to match ${(duration / 60).toFixed(1)} min of audio`);
        console.log(`   - Apply beat-reactive effects`);
        console.log(`   - Render final video`);
        console.log(`   ⏳ Estimated time: ${beatConfig.genre === 'lofi' ? '5-8 minutes' : '3-5 minutes'}...\n`);

        const startTime = Date.now();
        const result = await musicModeGenerator.generateVideo(
          {
            packageId: job.id,
            audioFilePath: audioPath,
            audioDuration: duration,
            instrumental: true,
          },
          beatConfig.aspectRatio,
          (percent, message) => {
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
        console.log(`   💰 Cost: $0.20 (Suno $0.10 + Kling $0.10)`);

        // Update job
        await storage.updateJob(job.id, {
          status: 'completed',
          videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
          thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
          cost: '0.20',
          duration: Math.floor(duration),
          progress: 100,
          completedAt: new Date(),
          musicAnalysis: {
            bpm: result.beatAnalysis?.bpm,
            key: result.beatAnalysis?.key,
            beatTimestamps: result.beatAnalysis?.beats || [],
          } as any,
        });

        generatedVideos.push({
          title: beatConfig.title,
          genre: beatConfig.genre,
          duration: duration,
          videoPath: result.videoPath,
          thumbnailPath: result.thumbnailPath,
          theme: result.theme,
          processingTime: elapsedMinutes,
          jobId: job.id,
        });
      } catch (error: any) {
        console.error(`   ❌ Error generating video ${i + 1}: ${error.message}`);
      }
    }

    // ============================================
    // PHASE 3: Upload to YouTube with scheduled times
    // ============================================
    if (youtubeUploadService.isEnabled() && generatedVideos.length > 0) {
      console.log(`\n📤 PHASE 3: UPLOADING ${generatedVideos.length} VIDEOS TO YOUTUBE\n`);

      const { youtubeMetadataGenerator } = await import('./server/services/youtube-metadata-generator');

      for (let i = 0; i < generatedVideos.length; i++) {
        const video = generatedVideos[i];

        // Find matching schedule slot
        const scheduleSlot = uploadSchedule.find((slot) => slot.genre === video.genre);
        if (!scheduleSlot) {
          console.warn(`   ⚠️ No schedule slot found for ${video.genre}, skipping upload`);
          continue;
        }

        // Remove from schedule so we don't reuse it
        const slotIndex = uploadSchedule.indexOf(scheduleSlot);
        uploadSchedule.splice(slotIndex, 1);

        console.log(`\n${'─'.repeat(70)}`);
        console.log(`📤 Upload ${i + 1}/${generatedVideos.length}: ${video.title}`);
        console.log(`${'─'.repeat(70)}`);
        console.log(`   📅 Scheduled for: ${scheduleSlot.time}`);

        try {
          // Generate metadata
          const metadata = await youtubeMetadataGenerator.generateMetadata(video.title, video.genre, video.jobId);

          // Upload with scheduled time
          const uploadResult = await youtubeUploadService.uploadVideoWithThumbnail(
            video.videoPath,
            {
              ...metadata,
              publishAt: scheduleSlot.publishAt,
              privacyStatus: 'private', // Must be private for scheduled uploads
            },
            video.thumbnailPath,
          );

          if (uploadResult.success) {
            console.log(`   ✅ Uploaded and scheduled!`);
            console.log(`   🎬 Video ID: ${uploadResult.videoId}`);
            console.log(`   🔗 URL: ${uploadResult.videoUrl}`);
            console.log(`   📅 Will publish: ${scheduleSlot.time}`);
          } else {
            console.error(`   ❌ Upload failed: ${uploadResult.error}`);
          }
        } catch (error: any) {
          console.error(`   ❌ Upload error: ${error.message}`);
        }
      }
    }

    // ============================================
    // FINAL SUMMARY
    // ============================================
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ BATCH COMPLETE: ${generatedVideos.length}/${BEATS.length} VIDEOS GENERATED`);
    console.log(`${'='.repeat(70)}`);

    console.log(`\n📊 Generated Videos:\n`);

    const lofiVideos = generatedVideos.filter((v) => v.genre === 'lofi');
    const trapVideos = generatedVideos.filter((v) => v.genre === 'trap');

    if (lofiVideos.length > 0) {
      console.log(`🎵 Lofi (${lofiVideos.length}):`);
      lofiVideos.forEach((v, i) => {
        console.log(`   ${i + 1}. ${v.title} - ${(v.duration / 60).toFixed(1)} min`);
        console.log(`      Theme: ${v.theme}`);
        console.log(`      Video: ${v.videoPath}`);
      });
      console.log();
    }

    if (trapVideos.length > 0) {
      console.log(`🔥 Trap (${trapVideos.length}):`);
      trapVideos.forEach((v, i) => {
        console.log(`   ${i + 1}. ${v.title} - ${(v.duration / 60).toFixed(1)} min`);
        console.log(`      Theme: ${v.theme}`);
        console.log(`      Video: ${v.videoPath}`);
      });
      console.log();
    }

    const totalDuration = generatedVideos.reduce((sum, v) => sum + v.duration, 0);
    const totalCost = generatedVideos.length * 0.2;
    const totalProcessingTime = generatedVideos.reduce((sum, v) => sum + parseFloat(v.processingTime), 0);

    console.log(`📈 Stats:`);
    console.log(`   Total videos: ${generatedVideos.length}`);
    console.log(`   Total duration: ${(totalDuration / 60).toFixed(1)} minutes`);
    console.log(`   Total cost: $${totalCost.toFixed(2)}`);
    console.log(`   Total processing time: ${totalProcessingTime.toFixed(1)} minutes`);
    console.log(`${'='.repeat(70)}\n`);

    if (youtubeUploadService.isEnabled()) {
      console.log(`📺 Videos scheduled on YouTube!`);
      console.log(`   Check your YouTube Studio to see the scheduled uploads.\n`);
    } else {
      console.log(`📺 View your videos at: http://localhost:5000\n`);
    }

    console.log(`\n🎉 All videos ready!\n`);
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
  }
}

generate1Lofi5TrapScheduled().catch(console.error);
