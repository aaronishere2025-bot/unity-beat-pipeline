import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

console.log('🎵 Daily Lofi Auto-Upload Script');
console.log('Time:', new Date().toLocaleString());
console.log('═'.repeat(60));

// Find completed LOFI videos that haven't been uploaded yet
const allCompleted = await db
  .select()
  .from(jobs)
  .where(and(eq(jobs.mode, 'music'), eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId)))
  .limit(50);

// Filter for lofi only
const readyToUpload = allCompleted.filter((job) => {
  const scriptContent = job.scriptContent || '';
  return /lofi|chillhop|jazz hop|lo-fi|study/i.test(scriptContent);
});

console.log(`\nFound ${readyToUpload.length} lofi videos ready to upload\n`);

if (readyToUpload.length === 0) {
  console.log('✅ No videos to upload today');
  process.exit(0);
}

// Upload each video
const { youtubeChannelManager } = await import('./server/services/youtube-channel-manager.js');
const { gumroadService } = await import('./server/services/gumroad-service.js');
const { existsSync } = await import('fs');
const { basename } = await import('path');

let uploadCount = 0;
let gumroadCount = 0;
let errorCount = 0;

for (const job of readyToUpload) {
  console.log('─'.repeat(60));
  console.log(`📹 ${job.scriptName}`);
  console.log(`   Duration: ${Math.floor((job.duration || 0) / 60)} minutes`);

  // Extract video path from videoUrl
  const videoFilename = job.videoUrl?.replace('/api/videos/', '');
  const videoPath = `data/videos/renders/${videoFilename}`;

  const thumbnailFilename = job.thumbnailUrl?.replace('/api/thumbnails/', '');
  const thumbnailPath = thumbnailFilename ? `data/thumbnails/${thumbnailFilename}` : null;

  if (!existsSync(videoPath)) {
    console.log(`   ❌ Video file not found: ${videoPath}`);
    errorCount++;
    continue;
  }

  // Determine genre for channel routing
  const scriptContent = job.scriptContent || '';
  const isLofi = /lofi|chillhop|jazz hop|lo-fi|study/i.test(scriptContent);
  const isTrap = /trap|drill|808|type beat/i.test(scriptContent);

  // Calculate duration and create title
  const durationSeconds = job.duration || job.audioDuration || 0;
  const minutes = Math.floor(durationSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  let durationText = '';
  if (hours > 0) {
    durationText = remainingMinutes > 0 ? `${hours}-Hour ${remainingMinutes}-Minute` : `${hours}-Hour`;
  } else if (minutes > 0) {
    durationText = `${minutes}-Minute`;
  }

  let title = job.scriptName || 'Untitled Beat';
  if (durationText) {
    title = title.replace(/\d+-(?:Hour|Minute)(?:\s+\d+-Minute)?/gi, durationText);
    if (!title.includes(durationText)) {
      title = `${durationText} ${title}`;
    }
  }

  // Step 1: Upload to Gumroad first
  let gumroadUrl = '';
  let gumroadProductId = '';

  try {
    console.log(`   💰 Uploading to Gumroad...`);

    const cleanContent = scriptContent.replace(/target\s+\d+:\d+\s+length\s*\|\s*/gi, '').trim();
    const gumroadDescription = `${title}

${cleanContent}

✨ Professional quality ${isLofi ? 'lofi' : isTrap ? 'trap' : ''} beat perfect for:
• Music production & recording
• Content creation & streaming
• Background music
• Personal & commercial use

🎹 100% original composition
📀 High-quality MP4 video format (with audio)
💯 Instant download after purchase
📄 Non-exclusive license included

#beats #instrumental ${isLofi ? '#lofi #chillhop #studymusic' : '#trap #typebeat #hiphop'}`;

    const gumroadProduct = await gumroadService.createBeatProduct({
      name: title,
      description: gumroadDescription,
      price: 500, // $5.00 in cents
      videoPath,
      thumbnailPath: thumbnailPath || undefined,
      tags: ['beats', 'instrumental', 'music', isLofi ? 'lofi' : isTrap ? 'trap' : 'beat'],
    });

    gumroadUrl = gumroadProduct.short_url;
    gumroadProductId = gumroadProduct.id;

    console.log(`   ✅ Gumroad product created: ${gumroadUrl}`);
    gumroadCount++;
  } catch (error: any) {
    console.log(`   ⚠️ Gumroad upload failed: ${error.message}`);
    console.log(`   ℹ️ Continuing with YouTube upload...`);
  }

  // Step 2: Generate YouTube description with Gumroad link
  const cleanContent = scriptContent.replace(/target\s+\d+:\d+\s+length\s*\|\s*/gi, '').trim();
  const description = `${title}

${cleanContent}

${gumroadUrl ? `💰 Purchase & Download: ${gumroadUrl}\n` : ''}
🎵 Non-exclusive license included with purchase
✨ Instant download - high quality MP4

#beats #instrumental ${isLofi ? '#lofi #chillhop #studymusic' : '#trap #typebeat #hiphop'}`;

  const tags = [
    'beats',
    'instrumental',
    isLofi ? 'lofi' : isTrap ? 'trap' : 'beats',
    'type beat',
    'music',
    ...(isLofi ? ['lofi', 'chillhop', 'study music', 'chill beats'] : []),
    ...(isTrap ? ['trap', 'hard', '808'] : []),
  ];

  const contentAnalysis = {
    genre: isLofi ? 'lofi' : isTrap ? 'trap' : 'beats',
    style: job.scriptName || '',
    tags: scriptContent.split(/[,\s]+/).filter((t) => t.length > 2),
    keywords: [
      ...(isLofi ? ['lofi', 'chill', 'study', 'relax'] : []),
      ...(isTrap ? ['trap', 'type beat', 'hard', '808'] : []),
      'beats',
      'instrumental',
      'music',
    ],
  };

  try {
    console.log(`   📤 Uploading to YouTube...`);
    const result = await youtubeChannelManager.uploadVideo(
      'auto', // Auto-select best channel
      videoPath,
      thumbnailPath,
      {
        title,
        description,
        tags,
        categoryId: '10', // Music
        privacyStatus: 'public',
      },
      contentAnalysis,
    );

    if (result.success) {
      console.log(`   ✅ Uploaded to ${result.channelName}`);
      console.log(`   🔗 ${result.videoUrl}`);

      // Update job with YouTube + Gumroad info
      await db
        .update(jobs)
        .set({
          youtubeVideoId: result.videoId,
          youtubeUrl: result.videoUrl,
          uploadedAt: new Date(),
          gumroadUrl: gumroadUrl || null,
          gumroadProductId: gumroadProductId || null,
        })
        .where(eq(jobs.id, job.id));

      uploadCount++;
    } else {
      console.log(`   ❌ Upload failed: ${result.error}`);
      errorCount++;
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    errorCount++;
  }

  // Wait 5 seconds between uploads to avoid rate limits
  if (uploadCount < readyToUpload.length) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`✅ YouTube uploads: ${uploadCount}`);
console.log(`💰 Gumroad products: ${gumroadCount}`);
console.log(`❌ Errors: ${errorCount}`);
console.log(`📊 Total: ${readyToUpload.length}`);
