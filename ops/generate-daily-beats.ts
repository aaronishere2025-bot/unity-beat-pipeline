#!/usr/bin/env tsx
/**
 * DAILY BEATS GENERATOR
 * Generates 5 trap + 1 lofi (30min) videos every day
 * Schedules uploads throughout the day with YouTube Scheduler
 *
 * Run daily at midnight: 0 0 * * * cd /home/aaronishere2025 && npx tsx generate-daily-beats.ts
 */

import { storage } from './server/storage';
import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { youtubeUploadService } from './server/services/youtube-upload-service';
import { join } from 'path';
import { execSync } from 'child_process';

// Randomize styles to keep content fresh
const TRAP_STYLES = [
  'Dark trap, 140 BPM, heavy 808 bass, crispy hi-hats, menacing synths, atmospheric pads, hard-hitting drums',
  'Chill trap, 145 BPM, atmospheric synths, smooth 808s, crispy hi-hats, dreamy pads, lo-fi aesthetic',
  'Aggressive trap, 150 BPM, distorted 808s, rapid hi-hats, dark synths, intense energy, club banger',
  'Melodic trap, 138 BPM, emotional piano, smooth 808s, atmospheric pads, dreamy vibes, modern trap',
  'Vibrant trap, 142 BPM, colorful synths, bouncy 808s, energetic hi-hats, uplifting pads, party vibes',
  'Ambient trap, 135 BPM, ethereal pads, deep 808s, spacey synths, reverb-heavy, atmospheric chill',
  'Hard trap, 155 BPM, aggressive 808s, double-time hi-hats, distorted synths, mosh pit energy',
  'Trap soul, 140 BPM, soulful samples, smooth 808s, emotional chords, introspective vibes',
];

const LOFI_STYLES = [
  'lofi hip-hop, chill study beats, 80 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative',
  'lofi jazz, 75 BPM, smooth jazz piano, upright bass, brush drums, vinyl warmth, coffee shop ambiance, sunset vibes',
  'lofi ambient, 70 BPM, ethereal pads, gentle piano, field recordings, nature sounds, meditation music, zen atmosphere',
  'lofi chillhop, 85 BPM, rhodes piano, jazzy bass, dusty drums, record crackle, late night study vibes',
];

/**
 * Get all scheduled videos from YouTube to find occupied time slots
 */
async function getScheduledVideos(): Promise<Set<string>> {
  const scheduledTimes = new Set<string>();

  try {
    const { google } = await import('googleapis');
    const { readFileSync } = await import('fs');

    const channelIds = [
      'yt_1768620532767_kv4drxdea', // ChillBeats4Me
      'yt_1768620554675_usovd1wx3', // Trap Beats INC
    ];

    for (const channelId of channelIds) {
      try {
        const credFile = join(process.cwd(), 'data', 'youtube_credentials', `${channelId}.json`);
        const credentials = JSON.parse(readFileSync(credFile, 'utf-8'));

        const oauth2Client = new google.auth.OAuth2(
          process.env.YOUTUBE_CLIENT_ID,
          process.env.YOUTUBE_CLIENT_SECRET,
          process.env.YOUTUBE_REDIRECT_URI,
        );

        oauth2Client.setCredentials({
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          expiry_date: credentials.expiryDate,
        });

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        // Get all videos from this channel
        const response = await youtube.search.list({
          part: ['id'],
          forMine: true,
          type: ['video'],
          maxResults: 50,
        });

        const videoIds = response.data.items?.map((item: any) => item.id.videoId).filter(Boolean) || [];

        if (videoIds.length > 0) {
          // Get details for these videos
          const detailsResponse = await youtube.videos.list({
            part: ['status'],
            id: videoIds,
          });

          for (const video of detailsResponse.data.items || []) {
            if (video.status?.publishAt) {
              // Round to nearest hour for comparison
              const publishDate = new Date(video.status.publishAt);
              publishDate.setMinutes(0, 0, 0);
              scheduledTimes.add(publishDate.toISOString());
            }
          }
        }
      } catch (err) {
        console.warn(`   ⚠️ Could not check scheduled videos for channel ${channelId}`);
      }
    }

    console.log(`   📅 Found ${scheduledTimes.size} already scheduled time slots`);
    return scheduledTimes;
  } catch (error) {
    console.warn('   ⚠️ Could not check scheduled videos, using default schedule');
    return scheduledTimes;
  }
}

/**
 * Generate upload schedule - finds next available time slots
 * Checks existing scheduled videos and picks the next 6 available slots
 */
async function generateUploadSchedule(): Promise<Array<{ time: string; publishAt: string; genre: string }>> {
  const scheduledTimes = await getScheduledVideos();
  const uploadTimes = [4, 7, 10, 13, 16, 19, 22]; // Hours: 4am, 7am, 10am, 1pm, 4pm, 7pm, 10pm

  const schedule: Array<{ time: string; publishAt: string; genre: string }> = [];

  // Pattern: lofi first, then alternating trap for variety
  const pattern = ['lofi', 'trap', 'trap', 'trap', 'trap', 'trap'];

  const currentDate = new Date();
  currentDate.setMinutes(0, 0, 0);

  // If we're past 10pm, start from tomorrow 4am
  if (currentDate.getHours() >= 22) {
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(4, 0, 0, 0);
  }

  let slotsFound = 0;
  let daysChecked = 0;
  const maxDaysToCheck = 14; // Look up to 2 weeks ahead

  while (slotsFound < 6 && daysChecked < maxDaysToCheck) {
    for (const hour of uploadTimes) {
      const publishTime = new Date(currentDate);
      publishTime.setHours(hour, 0, 0, 0);

      // Skip if in the past
      if (publishTime <= new Date()) {
        continue;
      }

      // Check if this slot is already taken
      const slotKey = publishTime.toISOString();
      if (!scheduledTimes.has(slotKey)) {
        schedule.push({
          genre: pattern[slotsFound],
          publishAt: slotKey,
          time: publishTime.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/New_York',
          }),
        });

        slotsFound++;

        if (slotsFound >= 6) break;
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(4, 0, 0, 0);
    daysChecked++;
  }

  return schedule;
}

/**
 * Randomly select styles to keep content fresh
 */
function selectDailyBeats() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Select random trap styles (5 different ones)
  const shuffledTrap = [...TRAP_STYLES].sort(() => Math.random() - 0.5);
  const selectedTrap = shuffledTrap.slice(0, 5);

  // Select random lofi style
  const lofiStyle = LOFI_STYLES[Math.floor(Math.random() * LOFI_STYLES.length)];

  return [
    {
      id: `lofi-${today}`,
      genre: 'lofi',
      title: `Lofi Study Vibes - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      style: lofiStyle,
      targetDuration: 1800, // 30 minutes (will generate multiple 3-4 min tracks and concat)
      trackDuration: 240, // Each individual Suno track: 4 minutes
      numTracks: 8, // Generate 8 tracks = ~32 minutes total
      aspectRatio: '16:9' as const,
    },
    ...selectedTrap.map((style, i) => ({
      id: `trap-${today}-${i + 1}`,
      genre: 'trap',
      title: `Trap Beat #${i + 1} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      style,
      targetDuration: 240, // 4 minutes
      aspectRatio: '16:9' as const,
    })),
  ];
}

async function generateDailyBeats() {
  const startTime = Date.now();

  console.log('🎵 DAILY BEATS GENERATOR\n');
  console.log(`📅 Date: ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}`);
  console.log(`⏰ Started: ${new Date().toLocaleTimeString('en-US')}\n`);
  console.log('📊 Plan:');
  console.log(`   - 1 lofi video (16:9, 30 minutes)`);
  console.log(`   - 5 trap videos (16:9, 4 minutes each)`);
  console.log(`   - Total: 6 videos (~50 min total)\n`);

  // Auto-sync YouTube credentials before uploading
  try {
    console.log('🔄 Syncing YouTube credentials...');
    execSync('npx tsx sync-youtube-credentials.ts', { stdio: 'pipe' });
    console.log('✅ Credentials synced\n');
  } catch (error) {
    console.warn('⚠️ Failed to sync credentials, uploads may fail\n');
  }

  const BEATS = selectDailyBeats();
  const uploadSchedule = generateUploadSchedule();

  console.log('📅 Upload Schedule:');
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

    const youtubeEnabled = youtubeUploadService.isEnabled();
    if (!youtubeEnabled) {
      console.warn('⚠️ YouTube upload not configured - videos will be generated but not uploaded');
    }

    // ============================================
    // PHASE 0: CREATE ALL JOBS
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

    console.log(`\n✅ All ${jobs.length} jobs created!\n`);

    // ============================================
    // PHASE 1: Generate music (PARALLEL with 5s stagger)
    // ============================================
    console.log(`\n🎵 PHASE 1: GENERATING ${BEATS.length} MUSIC TRACKS (PARALLEL)\n`);
    console.log('⚡ Submitting all tracks with 5-second stagger to avoid rate limits...\n');

    const musicTracks: Array<{
      jobId: string;
      beatConfig: (typeof BEATS)[0];
      audioPath: string;
      duration: number;
    }> = [];

    // Submit all tracks with 5-second delays between submissions
    // For lofi tracks with multiple segments, submit each segment separately
    const submissionPromises = jobs.map(async ({ jobId, beatConfig }, i) => {
      // Stagger submissions by 5 seconds each
      await new Promise((resolve) => setTimeout(resolve, i * 5000));

      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎵 Submitting Track ${i + 1}/${jobs.length}: ${beatConfig.title}`);
      console.log(`${'─'.repeat(70)}`);

      try {
        await storage.updateJob(jobId, {
          status: 'processing',
          progress: 5,
          statusMessage: 'Submitting to Suno...',
        });

        // For long lofi mixes, generate multiple tracks
        const isLongLofi = (beatConfig as any).numTracks && (beatConfig as any).numTracks > 1;
        const numTracks = isLongLofi ? (beatConfig as any).numTracks : 1;
        const trackDuration = isLongLofi ? (beatConfig as any).trackDuration : beatConfig.targetDuration;

        if (isLongLofi) {
          console.log(`   📼 Long-form lofi: Generating ${numTracks} tracks × ${trackDuration}s each`);
        }

        // Submit all tracks in parallel (no waiting!)
        const submissionPromises = [];
        for (let trackIndex = 0; trackIndex < numTracks; trackIndex++) {
          submissionPromises.push(
            sunoApi
              .generateSong({
                lyrics: '',
                style: beatConfig.style,
                title: `${beatConfig.title} (Part ${trackIndex + 1}/${numTracks})`,
                instrumental: true,
                model: 'V5',
                targetDuration: trackDuration,
              })
              .then((result) => {
                console.log(`   ✅ Submitted part ${trackIndex + 1}/${numTracks}: ${result.taskId}`);
                return result;
              }),
          );
        }

        // Wait for all submissions to complete in parallel
        const sunoResults = await Promise.all(submissionPromises);
        const taskIds = sunoResults.map((r) => r.taskId);
        console.log(`   🚀 All ${numTracks} tracks submitted simultaneously!`);

        await storage.updateJob(jobId, {
          progress: 10,
          statusMessage: `Generating ${numTracks} track(s) in parallel...`,
        });

        return { jobId, beatConfig, taskIds, isMultiTrack: isLongLofi };
      } catch (error: any) {
        console.error(`   ❌ Submission failed: ${error.message}`);
        await storage.updateJob(jobId, {
          status: 'failed',
          error: error.message,
        });
        return null;
      }
    });

    // Wait for all submissions to complete
    const submissions = (await Promise.all(submissionPromises)).filter(Boolean);
    console.log(`\n✅ All ${submissions.length}/${jobs.length} tracks submitted!`);
    console.log('⏳ Waiting for Suno to generate all tracks in parallel...\n');

    // Now wait for all tracks to complete in parallel
    const completionPromises = submissions.map(async (submission, i) => {
      if (!submission) return null;

      const { jobId, beatConfig, taskIds, isMultiTrack } = submission;

      try {
        console.log(`   ⏳ Waiting for Track ${i + 1}: ${beatConfig.title}...`);

        const audioPaths: string[] = [];
        let totalDuration = 0;

        // Wait for all parts (if multi-track lofi)
        for (let partIndex = 0; partIndex < taskIds.length; partIndex++) {
          const taskId = taskIds[partIndex];
          const tracks = await sunoApi.waitForCompletion(taskId, 600000);

          if (!tracks || tracks.length === 0) {
            console.error(`   ❌ Track ${i + 1} Part ${partIndex + 1} failed\n`);
            await storage.updateJob(jobId, {
              status: 'failed',
              error: `Suno music generation failed for part ${partIndex + 1}`,
            });
            return null;
          }

          const track = tracks[0];
          console.log(`   ✅ Part ${partIndex + 1}/${taskIds.length} ready: ${(track.duration / 60).toFixed(1)} min`);

          // Download audio part
          const audioPath = join(
            process.cwd(),
            'data',
            'temp',
            'processing',
            `${beatConfig.id}_part${partIndex + 1}_${Date.now()}.mp3`,
          );
          const axios = (await import('axios')).default;
          const fs = await import('fs');

          const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
          fs.writeFileSync(audioPath, response.data);

          audioPaths.push(audioPath);
          totalDuration += track.duration;
        }

        console.log(`   ✅ Track ${i + 1} complete: ${(totalDuration / 60).toFixed(1)} min total`);

        // If multi-track, concatenate with crossfades
        let finalAudioPath: string;
        if (isMultiTrack && audioPaths.length > 1) {
          console.log(`   🔗 Concatenating ${audioPaths.length} tracks with crossfades...`);
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          finalAudioPath = join(process.cwd(), 'data', 'temp', 'processing', `${beatConfig.id}_full_${Date.now()}.mp3`);

          // Simple concat without crossfades (more reliable for 8+ tracks)
          const fileList = audioPaths.map((p) => `file '${p}'`).join('\n');
          const fileListPath = join(process.cwd(), 'data', 'temp', 'processing', `${beatConfig.id}_filelist.txt`);
          const fs = await import('fs');
          fs.writeFileSync(fileListPath, fileList);

          // Concatenate all tracks seamlessly
          const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${fileListPath}" -c copy "${finalAudioPath}"`;
          await execAsync(ffmpegCmd);
          console.log(`   ✅ Concatenation complete: ${finalAudioPath}`);
        } else {
          finalAudioPath = audioPaths[0];
        }

        await storage.updateJob(jobId, {
          progress: 20,
          statusMessage: 'Music ready',
          musicUrl: audioPaths[0], // Store first track URL
          audioDuration: Math.floor(totalDuration).toString(),
        });

        return {
          jobId,
          beatConfig,
          audioPath: finalAudioPath,
          duration: totalDuration,
        };
      } catch (error: any) {
        console.error(`   ❌ Track ${i + 1} error: ${error.message}`);
        await storage.updateJob(jobId, {
          status: 'failed',
          error: error.message,
        });
        return null;
      }
    });

    // Wait for all completions
    const completedTracks = (await Promise.all(completionPromises)).filter(Boolean);
    musicTracks.push(...completedTracks);

    console.log(`\n✅ Generated ${musicTracks.length}/${BEATS.length} tracks in parallel!\n`);

    // ============================================
    // PHASE 2: Generate videos
    // ============================================
    console.log(`\n🎬 PHASE 2: GENERATING ${musicTracks.length} VIDEOS\n`);

    for (let i = 0; i < musicTracks.length; i++) {
      const { jobId, beatConfig, audioPath, duration } = musicTracks[i];

      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎬 Video ${i + 1}/${musicTracks.length}: ${beatConfig.title}`);
      console.log(`${'─'.repeat(70)}`);

      try {
        await storage.updateJob(jobId, {
          progress: 30,
          statusMessage: 'Analyzing beats...',
        });

        const result = await musicModeGenerator.generateVideo(
          {
            packageId: jobId,
            audioFilePath: audioPath,
            audioDuration: duration,
            instrumental: true,
          },
          beatConfig.aspectRatio,
          async (percent, message) => {
            const jobProgress = Math.floor(30 + percent * 0.65);
            await storage.updateJob(jobId, {
              progress: jobProgress,
              statusMessage: message,
            });
          },
        );

        console.log(`   ✅ Video complete!`);

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
          } as any,
        });

        generatedVideos.push({
          jobId,
          title: beatConfig.title,
          genre: beatConfig.genre,
          style: beatConfig.style,
          duration: duration,
          videoPath: result.videoPath,
          thumbnailPath: result.thumbnailPath,
        });
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        await storage.updateJob(jobId, {
          status: 'failed',
          error: error.message,
        });
      }
    }

    // ============================================
    // PHASE 2.5: Gumroad Manual Workflow
    // ============================================
    console.log(`\n💰 GUMROAD: ${generatedVideos.length} beats ready for manual upload\n`);
    console.log('   📋 Gumroad API is read-only - products must be created manually');
    console.log('   🔗 Go to: https://app.gumroad.com/products\n');

    generatedVideos.forEach((v, i) => {
      console.log(`   ${i + 1}. ${v.title}`);
      console.log(`      Genre: ${v.genre}`);
      console.log(`      File: ${v.videoPath}`);
      console.log(`      Suggested price: $4.99`);
      console.log(`      Tags: ${v.genre}, beats, instrumental, type beat\n`);
    });

    console.log('   ℹ️  After creating products in Gumroad:');
    console.log('   • Add Gumroad links to YouTube descriptions manually');
    console.log('   • Or update database with gumroadUrl for each job\n');

    // ============================================
    // PHASE 3: Upload to YouTube with schedule
    // ============================================
    if (youtubeEnabled && generatedVideos.length > 0) {
      console.log(`\n📤 PHASE 3: SCHEDULING ${generatedVideos.length} UPLOADS\n`);

      const { youtubeMetadataGenerator } = await import('./server/services/youtube-metadata-generator');
      const { youtubeChannelManager } = await import('./server/services/youtube-channel-manager');

      // Channel IDs
      const CHILLBEATS_CHANNEL = 'yt_1768620532767_kv4drxdea'; // ChillBeats4Me
      const TRAPBEATS_CHANNEL = 'yt_1768620554675_usovd1wx3'; // Trap Beats INC

      for (let i = 0; i < generatedVideos.length; i++) {
        const video = generatedVideos[i];
        const scheduleSlot = uploadSchedule.find((slot) => slot.genre === video.genre);

        if (!scheduleSlot) continue;

        // Remove from schedule
        const slotIndex = uploadSchedule.indexOf(scheduleSlot);
        uploadSchedule.splice(slotIndex, 1);

        console.log(`   ${i + 1}. ${video.title} → ${scheduleSlot.time}`);

        try {
          // Build VideoContentInfo object for metadata generation
          const videoInfo = {
            jobName: video.title,
            mode: 'music',
            aspectRatio: '16:9',
            unityMetadata: {
              musicStyle: video.style || '',
            },
            duration: video.duration || 240,
          };

          const metadata = await youtubeMetadataGenerator.generateMetadata(videoInfo);

          // Route to correct channel based on genre
          const channelId = video.genre === 'lofi' ? CHILLBEATS_CHANNEL : TRAPBEATS_CHANNEL;

          const uploadResult = await youtubeChannelManager.uploadVideo(
            channelId,
            video.videoPath,
            video.thumbnailPath,
            {
              ...metadata,
              publishAt: scheduleSlot.publishAt,
              privacyStatus: 'private',
            },
          );

          if (uploadResult.success) {
            console.log(`      ✅ Scheduled for ${scheduleSlot.time} (${uploadResult.channelName})`);
            console.log(`      🔗 https://www.youtube.com/watch?v=${uploadResult.videoId}`);
          }
        } catch (error: any) {
          console.error(`      ❌ Upload failed: ${error.message}`);
        }
      }
    }

    // ============================================
    // SUMMARY
    // ============================================
    const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ DAILY BATCH COMPLETE`);
    console.log(`${'='.repeat(70)}`);
    console.log(`   Generated: ${generatedVideos.length}/${BEATS.length} videos`);
    console.log(`   Total time: ${elapsedMinutes} minutes`);
    console.log(`   Total cost: $${(generatedVideos.length * 0.2).toFixed(2)}`);
    console.log(`${'='.repeat(70)}\n`);

    if (youtubeEnabled) {
      console.log(`📺 All videos scheduled on YouTube!`);
      console.log(`   They will publish automatically throughout the day.\n`);
    } else {
      console.log(`📺 Videos ready at: http://localhost:5000\n`);
    }
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

generateDailyBeats().catch(console.error);
