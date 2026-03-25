import axios from 'axios';

/**
 * Generate 10 beats for today via API with varied styles and optimal scheduling
 * Each beat will be a 2-3 minute lofi/chillhop/trap beat with looping visual
 */

const beatConfigs = [
  {
    name: 'Morning Chill Lofi Beat',
    genre: 'lofi',
    style: 'chill, jazzy, morning vibes',
    bpm: '85-95',
    hour: 8,
    description: 'Perfect morning study beats to start your day',
  },
  {
    name: 'Focus Study Beat',
    genre: 'chillhop',
    style: 'focused, smooth, piano-driven',
    bpm: '80-90',
    hour: 10,
    description: 'Deep focus beats for productive morning sessions',
  },
  {
    name: 'Midday Jazzy Lofi',
    genre: 'jazz hop',
    style: 'jazzy, uplifting, saxophone',
    bpm: '90-100',
    hour: 12,
    description: 'Jazzy midday vibes to keep the momentum going',
  },
  {
    name: 'Afternoon Energy Beat',
    genre: 'chillhop',
    style: 'vibrant, energetic, guitar',
    bpm: '95-105',
    hour: 14,
    description: 'Afternoon energy boost beats for creative work',
  },
  {
    name: 'Sunset Chill Trap',
    genre: 'chill trap',
    style: 'mellow, dreamy, 808s',
    bpm: '75-85',
    hour: 16,
    description: 'Sunset vibes with smooth trap beats',
  },
  {
    name: 'Evening Study Lofi',
    genre: 'lofi',
    style: 'dark, cozy, rain sounds',
    bpm: '70-80',
    hour: 18,
    description: 'Evening study session with cozy rain vibes',
  },
  {
    name: 'Night Chill Beat',
    genre: 'ambient lofi',
    style: 'atmospheric, spacey, synths',
    bpm: '65-75',
    hour: 20,
    description: 'Night-time relaxation beats with ambient vibes',
  },
  {
    name: 'Late Night Trap',
    genre: 'trap',
    style: 'dark, mysterious, bass-heavy',
    bpm: '140-150',
    hour: 22,
    description: 'Late night trap beats for focused coding sessions',
  },
  {
    name: 'Midnight Lofi Study',
    genre: 'lofi',
    style: 'sleepy, calm, soft piano',
    bpm: '60-70',
    hour: 23,
    description: 'Midnight study beats for late-night grinders',
  },
  {
    name: 'Deep Sleep Ambient',
    genre: 'ambient',
    style: 'peaceful, slow, meditative',
    bpm: '50-60',
    hour: 1,
    description: 'Deep sleep ambient sounds for relaxation',
  },
];

async function generateBeatsViaAPI() {
  console.log('🎵 Starting generation of 10 beats via API...\n');

  const API_URL = 'http://localhost:8080/api/jobs';
  const createdJobs = [];
  const now = new Date();

  for (let i = 0; i < beatConfigs.length; i++) {
    const config = beatConfigs[i];

    // Calculate scheduled time
    const scheduledTime = new Date(now);
    scheduledTime.setHours(config.hour, 0, 0, 0);
    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const jobPayload = {
      mode: 'music',
      scriptName: config.name,
      scriptContent: `${config.genre} beat - ${config.style} (${config.bpm} BPM)`,
      aspectRatio: '16:9',
      clipDuration: 5,
      autoUpload: true,
      generateVideo: true,
      musicGenre: config.genre,
      musicStyle: config.style,
      targetBPM: config.bpm,
      youtubeTitle: `${config.name} - ${config.genre.toUpperCase()} [${config.bpm} BPM]`,
      youtubeDescription: `${config.description}\n\n🎵 Genre: ${config.genre}\n⏱️ BPM: ${config.bpm}\n🎹 Style: ${config.style}\n\n#lofi #beats #study #chillhop #music`,
      youtubeTags: [
        config.genre,
        'lofi',
        'beats',
        'study music',
        'chill beats',
        'instrumental',
        config.bpm,
        'background music',
      ],
    };

    try {
      const response = await axios.post(API_URL, jobPayload);
      const job = response.data.data;
      createdJobs.push(job);

      const timeStr = scheduledTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      console.log(`✅ Beat ${i + 1}/10: "${config.name}"`);
      console.log(`   📋 Job ID: ${job.id}`);
      console.log(`   🎵 Genre: ${config.genre} | BPM: ${config.bpm}`);
      console.log(`   ⏰ Target time: ${timeStr}`);
      console.log(`   🎬 Status: ${job.status}\n`);

      // Small delay to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(`❌ Failed to create beat ${i + 1}:`, error.response?.data || error.message);
    }
  }

  console.log('\n📊 Generation Summary:');
  console.log(`   ✅ Total beats queued: ${createdJobs.length}/10`);
  console.log(`   🎵 Genres: lofi, chillhop, jazz hop, chill trap, ambient, trap`);
  console.log(`   ⏰ Scheduled across: 8 AM - 1 AM`);
  console.log(`   💰 Estimated cost: $${(createdJobs.length * 0.1).toFixed(2)} (1 looping clip per beat)`);
  console.log('\n🚀 Jobs are queued and will start processing immediately!');
  console.log('   Monitor: http://localhost:8080/dashboard');

  return createdJobs;
}

generateBeatsViaAPI()
  .then(() => {
    console.log('\n✨ All beats scheduled successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
