#!/usr/bin/env tsx
/**
 * Generate 10 diverse beat videos with 1 looping clip each
 * 5 lofi beats + 5 trap beats, all with unique styles
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';

// 5 UNIQUE LOFI BEATS
const LOFI_BEATS = [
  {
    title: 'Rainy Café Study',
    bpm: 85,
    genre: 'lofi',
    styleDescription:
      'lofi hip-hop, rainy day vibes, 85 BPM, jazzy piano chords, vinyl crackle, soft percussion, warm rhodes, cozy café atmosphere',
  },
  {
    title: 'Midnight Drive',
    bpm: 78,
    genre: 'lofi',
    styleDescription:
      'lofi ambient, 78 BPM, dreamy synth pads, deep bass, minimal drums, late night cruise, nostalgic melancholic peaceful',
  },
  {
    title: 'Morning Pages',
    bpm: 90,
    genre: 'lofi',
    styleDescription:
      'lofi boom bap, 90 BPM, dusty drums, jazz guitar sample, uplifting, sunrise energy, coffee shop, productive morning vibes',
  },
  {
    title: 'Neon Tokyo Nights',
    bpm: 82,
    genre: 'lofi',
    styleDescription:
      'lofi synthwave, 82 BPM, retro synths, japanese city pop influence, neon lights, urban japan aesthetic, chill cyberpunk',
  },
  {
    title: 'Library Quiet',
    bpm: 70,
    genre: 'lofi',
    styleDescription:
      'ambient lofi, 70 BPM, soft piano, minimal beats, whisper quiet, library atmosphere, deep focus, meditation study',
  },
];

// 5 UNIQUE TRAP BEATS
const TRAP_BEATS = [
  {
    title: 'Dark Phonk Drift',
    bpm: 160,
    genre: 'trap',
    styleDescription:
      'phonk trap, 160 BPM, cowbell, memphis rap sample, distorted 808, hard bass, drift car vibes, aggressive dark energy',
  },
  {
    title: 'Melodic Space',
    bpm: 140,
    genre: 'trap',
    styleDescription:
      'melodic trap, 140 BPM, emotional piano melody, soft 808s, atmospheric pads, guitar arpeggios, dreamy cosmic sad vibes',
  },
  {
    title: 'UK Drill Storm',
    bpm: 138,
    genre: 'trap',
    styleDescription:
      'UK drill, 138 BPM, sliding 808 bass, dark piano stabs, aggressive hi-hat rolls, drill snares, menacing london streets',
  },
  {
    title: 'Hard Trap Banger',
    bpm: 145,
    genre: 'trap',
    styleDescription:
      'hard trap, 145 BPM, thunderous 808, distorted bass, rapid hi-hats, trap snare rolls, gym workout energy, aggressive',
  },
  {
    title: 'Chill Trap Waves',
    bpm: 130,
    genre: 'trap',
    styleDescription:
      'chill trap, 130 BPM, smooth 808, relaxed hi-hats, ambient pads, melodic bells, beach sunset vibes, laid back summer',
  },
];

const ALL_BEATS = [...LOFI_BEATS, ...TRAP_BEATS];

async function generateSingleBeat(beat: (typeof ALL_BEATS)[0], index: number, total: number): Promise<void> {
  console.log(`\n[${index + 1}/${total}] 🎵 ${beat.title} (${beat.genre.toUpperCase()}, ${beat.bpm} BPM)`);
  console.log(`   Style: ${beat.styleDescription.substring(0, 80)}...`);

  try {
    // Step 1: Generate Suno beat
    console.log(`   [1/4] Generating Suno beat...`);
    const sunoResult = await sunoApi.generateSong({
      lyrics: '',
      style: beat.styleDescription,
      title: beat.title,
      instrumental: true,
      model: 'V5',
      targetDuration: 60, // 60 seconds per beat
    });

    console.log(`   ⏳ Waiting for Suno (60-120s)...`);
    const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 300000);

    if (!tracks || tracks.length === 0) {
      throw new Error('Suno generation failed');
    }

    const track = tracks[0];
    console.log(`   ✅ Audio ready: ${track.duration.toFixed(1)}s`);

    // Step 2: Download audio
    console.log(`   [2/4] Downloading audio...`);
    const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `${beat.genre}_${index + 1}_${Date.now()}.mp3`);
    const axios = (await import('axios')).default;
    const fs = await import('fs');
    const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, response.data);

    // Step 3: Create job
    console.log(`   [3/4] Creating job...`);
    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '9:16',
      scriptName: `${beat.title} [${beat.bpm} BPM ${beat.genre}]`,
      scriptContent: beat.styleDescription,
      musicUrl: `/audio/${track.id}.mp3`,
      audioDuration: Math.floor(track.duration).toString(),
      status: 'processing',
      progress: 0,
      metadata: {
        genre: beat.genre,
        bpm: beat.bpm,
        phase: 'Starting video generation',
      },
    });

    console.log(`   Job ID: ${job.id}`);

    // Step 4: Generate video with 1 LOOPING CLIP
    console.log(`   [4/4] Generating video with 1 looping clip...`);
    const startTime = Date.now();

    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: audioPath,
        audioDuration: track.duration,
        instrumental: true,
      },
      '9:16',
      (percent, message) => {
        if (percent % 20 === 0 || percent === 100) {
          console.log(`   [${percent}%] ${message}`);
        }
      },
    );

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    // Update job to completed
    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
      cost: '0.10', // Only 1 Kling clip
      duration: Math.floor(track.duration),
      progress: 100,
      completedAt: new Date(),
      metadata: {
        ...job.metadata,
        theme: result.theme,
        loopCount: result.metadata.loopCount,
        processingTimeSeconds: elapsedSeconds,
      },
    });

    console.log(`   ✅ COMPLETE! (${elapsedSeconds}s)`);
    console.log(`   Video: ${result.videoPath.split('/').pop()}`);
    console.log(`   Theme: ${result.theme}`);
    console.log(`   Loops: ${result.metadata.loopCount}x (1 clip)`);
  } catch (error: any) {
    console.error(`   ❌ FAILED: ${error.message}`);
    console.error(`   ${error.stack}`);
  }
}

async function main() {
  console.log('🎵 GENERATING 10 DIVERSE BEAT VIDEOS');
  console.log('   5 Lofi beats + 5 Trap beats');
  console.log('   Each video uses 1 looping clip ($0.10 per video)\n');

  const startTime = Date.now();

  // Generate all 10 beats sequentially (to avoid overloading APIs)
  for (let i = 0; i < ALL_BEATS.length; i++) {
    await generateSingleBeat(ALL_BEATS[i], i, ALL_BEATS.length);

    // Small delay between generations
    if (i < ALL_BEATS.length - 1) {
      console.log('\n   ⏳ Waiting 5s before next beat...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  const totalMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n\n✅ ALL 10 BEATS COMPLETE!');
  console.log(`   Total time: ${totalMinutes} minutes`);
  console.log(`   Total cost: $1.00 (10 clips × $0.10)`);
  console.log(`   Lofi beats: 5`);
  console.log(`   Trap beats: 5`);
  console.log('\n📺 View all beats at: http://localhost:5000\n');
}

main().catch(console.error);
