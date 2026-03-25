#!/usr/bin/env tsx
/**
 * Generate proper YouTube metadata for the 30-minute lofi video
 * Uses beat-metadata-generator for appropriate lofi descriptions
 */
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq } from 'drizzle-orm';

const jobId = '4f9b6119-b75e-408e-b287-70fb16d5fe03';

// Proper lofi YouTube metadata
const lofiMetadata = {
  youtubeTitle: 'Lofi Study Mix - 30 Minutes 🎧 Chill Beats to Study/Work/Relax',
  youtubeDescription: `🎵 30-Minute Lofi Hip Hop Mix

Perfect for studying, working, coding, or just relaxing. This seamless 30-minute lofi beat provides the ideal background atmosphere for focus and productivity.

🎹 Mix Info:
• Duration: 30:00
• Genre: Lofi Hip Hop / Chillhop
• BPM: 80-85
• Mood: Chill, Relaxed, Peaceful
• Style: Jazzy chords, vinyl crackle, mellow bass, ambient pads

📊 Production:
• Smooth jazz samples
• Vinyl crackle texture
• Soft piano melodies
• Mellow bass lines
• Ambient atmospheric pads
• Rain sounds & tape hiss

Perfect for:
✅ Study sessions (30 minutes uninterrupted)
✅ Focus work & deep concentration
✅ Reading & writing
✅ Coding & programming
✅ Creative projects
✅ Relaxation & meditation
✅ Background music for content creation

🎵 Music: AI Generated (Suno V5)
🎬 Video: Kling AI
🤖 100% AI Created

🔔 Subscribe for more chill beats
💬 Let me know what you're studying/working on!

#lofi #lofihiphop #chillbeats #studymusic #focusmusic #lofibeats #studybeats #workmusic #relaxingmusic #chillhop #lofistudy #studymix #30minutes #extended #chillvibes #lofimusic #studyplaylist #concentrationmusic #ambientmusic #calmmusic`,
  youtubeTags: [
    'lofi',
    'lofi hip hop',
    'chill beats',
    'study music',
    'focus music',
    'lofi beats',
    'study beats',
    'work music',
    'relaxing music',
    'chillhop',
    'lofi study',
    'study mix',
    '30 minutes',
    'extended mix',
    'chill vibes',
    'lofi music',
    'study playlist',
    'concentration music',
    'ambient music',
    'calm music',
    '80-85 bpm',
    'jazz samples',
    'vinyl crackle',
    'AI generated',
    'suno music',
    'lofi beats to study to',
    'study session',
    'focus beats',
    'productivity music',
    'background music',
  ],
};

await db
  .update(jobs)
  .set({
    unityMetadata: lofiMetadata as any,
    updated_at: new Date(),
  })
  .where(eq(jobs.id, jobId));

console.log('✅ Updated job with proper lofi YouTube metadata');
console.log('\n📋 YouTube Metadata:');
console.log(`\n📌 Title: ${lofiMetadata.youtubeTitle}`);
console.log(`\n📝 Description (first 200 chars):\n${lofiMetadata.youtubeDescription.substring(0, 200)}...`);
console.log(`\n🏷️  Tags (${lofiMetadata.youtubeTags.length} total):`);
lofiMetadata.youtubeTags.slice(0, 10).forEach((tag) => console.log(`   - ${tag}`));
console.log('   ...\n');

console.log('✨ Now you can upload this video to YouTube with proper lofi metadata!');
console.log('   The metadata will be pre-filled in the upload dialog.\n');

process.exit(0);
