import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function generateTestBeat() {
  try {
    console.log('🎵 Creating test beat job...\n');

    const testJob = {
      scriptName: 'Test Trap Beat for Scheduling',
      scriptContent: 'trap beat, 808 bass, hard hitting drums, 140 bpm, heavy bass',
      mode: 'music' as const,
      status: 'queued' as const,
      progress: 0,
      sceneId: null,
      characterProfileIds: null,
      videoUrl: null,
      youtubeVideoId: null,
      scheduledTime: null,
      unityMetadata: null,
      duration: 120,
      youtubeUploadStatus: null,
    };

    const [newJob] = await db.insert(jobs).values(testJob).returning();

    console.log('✅ Test beat job created!');
    console.log(`   Job ID: ${newJob.id}`);
    console.log(`   Name: ${newJob.scriptName}`);
    console.log(`   Status: ${newJob.status}`);
    console.log('\n📌 The job worker will pick this up and generate the beat automatically.');
    console.log('   Check progress at: http://localhost:8080');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

generateTestBeat()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
