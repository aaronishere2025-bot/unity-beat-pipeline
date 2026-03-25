/**
 * Schedule completed beat jobs for YouTube upload
 * - Lofi → ChillBeats4Me (1/day)
 * - Trap → Trap Beats INC (1/day)
 * Starting tomorrow, one per day per channel
 */

import { google } from 'googleapis';
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  // Load connected channels
  const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  if (!existsSync(channelsFile)) {
    console.error('❌ No connected channels file found');
    process.exit(1);
  }
  const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
  const chillbeats = channels.find((c: any) => c.title === 'ChillBeats4Me');
  const trapbeats = channels.find((c: any) => c.title === 'Trap Beats INC');

  if (!chillbeats || !trapbeats) {
    console.error('❌ Missing channel connections');
    process.exit(1);
  }

  console.log(`✅ ChillBeats4Me: ${chillbeats.channelId}`);
  console.log(`✅ Trap Beats INC: ${trapbeats.channelId}`);

  // Get all completed jobs from DB
  const allJobs = await db.select().from(jobs).where(eq(jobs.status, 'completed'));

  const lofiJobs = allJobs.filter((j: any) => {
    const meta = j.unityMetadata as any;
    return meta?.genre === 'lofi' && j.videoPath && !j.youtubeVideoId;
  });

  const trapJobs = allJobs.filter((j: any) => {
    const meta = j.unityMetadata as any;
    return meta?.genre === 'trap' && j.videoPath && !j.youtubeVideoId;
  });

  console.log(`\n📊 Uploadable: ${lofiJobs.length} lofi, ${trapJobs.length} trap`);

  if (lofiJobs.length === 0 && trapJobs.length === 0) {
    console.log('Nothing to upload!');
    process.exit(0);
  }

  // Schedule: 1/day starting tomorrow at 2PM EST
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);

  let lofiDate = new Date(tomorrow);
  let trapDate = new Date(tomorrow);

  async function uploadToChannel(
    job: any,
    channelCreds: any,
    publishAt: string,
    genre: string,
  ) {
    const videoPath = job.videoPath!;
    if (!existsSync(videoPath)) {
      console.log(`  ⚠️ Skip: file not found at ${videoPath}`);
      return false;
    }

    const meta = job.unityMetadata as any;
    const title = meta?.youtubeTitle || job.scriptName || `${genre} Beat`;

    const tags = genre === 'lofi'
      ? ['lofi', 'study music', 'chill beats', 'relaxing', 'lofi hip hop', 'beats to study to']
      : ['trap beat', 'type beat', 'instrumental', 'rap beat', 'hip hop', 'producer', 'free beat'];

    const desc = genre === 'lofi'
      ? `${title}\n\n🎵 Lofi beats for studying, relaxing, and chilling\n\n#lofi #studymusic #chillbeats #relaxing`
      : `${title}\n\n🔥 Hard-hitting trap beats for rappers and producers\n\n#trapbeat #typebeat #instrumental #rap`;

    // Create OAuth client for this channel
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: channelCreds.accessToken,
      refresh_token: channelCreds.refreshToken,
      expiry_date: channelCreds.expiryDate,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const fileSize = statSync(videoPath).size;
    const fileMB = (fileSize / (1024 * 1024)).toFixed(1);

    console.log(`  📤 "${title}" (${fileMB}MB) → ${channelCreds.title}`);
    console.log(`     Scheduled: ${new Date(publishAt).toLocaleDateString()} 2:00 PM`);

    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description: desc,
            tags,
            categoryId: '10', // Music
          },
          status: {
            privacyStatus: 'private',
            publishAt,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: createReadStream(videoPath),
        },
      },
      {
        onUploadProgress: (evt) => {
          const pct = ((evt.bytesRead / fileSize) * 100).toFixed(0);
          if (Number(pct) % 25 === 0) {
            process.stdout.write(`     ${pct}%...`);
          }
        },
      },
    );

    const videoId = response.data.id;
    console.log(`\n     ✅ https://youtube.com/watch?v=${videoId}`);

    // Update job in DB
    await db.update(jobs).set({ youtubeVideoId: videoId } as any).where(eq(jobs.id, job.id));
    return true;
  }

  // Upload lofi → ChillBeats4Me
  console.log('\n🎵 Uploading Lofi to ChillBeats4Me (1/day schedule)...');
  for (const job of lofiJobs) {
    try {
      const ok = await uploadToChannel(job, chillbeats, lofiDate.toISOString(), 'lofi');
      if (ok) lofiDate.setDate(lofiDate.getDate() + 1);
    } catch (err: any) {
      console.log(`  ❌ ${err.message}`);
    }
  }

  // Upload trap → Trap Beats INC
  console.log('\n🔥 Uploading Trap to Trap Beats INC (1/day schedule)...');
  for (const job of trapJobs) {
    try {
      const ok = await uploadToChannel(job, trapbeats, trapDate.toISOString(), 'trap');
      if (ok) trapDate.setDate(trapDate.getDate() + 1);
    } catch (err: any) {
      console.log(`  ❌ ${err.message}`);
    }
  }

  console.log('\n✅ All uploads scheduled!');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
