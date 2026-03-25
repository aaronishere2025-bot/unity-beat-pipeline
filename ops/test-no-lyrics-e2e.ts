/**
 * End-to-end test: Generate actual beat with NO LYRICS approach
 */

import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

console.log('🧪 E2E Test: NO LYRICS approach with real Suno generation\n');

async function createTestBeat() {
  try {
    // Create job directly in database
    const jobId = crypto.randomUUID();

    console.log('📋 Creating test beat job...');
    const [job] = await db
      .insert(jobs)
      .values({
        id: jobId,
        scriptName: 'NO LYRICS E2E TEST - 3min Lofi',
        scriptContent: 'target 3:00 length | lofi hip hop chill beats | 85 BPM | relaxed tempo, jazz chords, smooth',
        lyrics: '', // EMPTY - this is key!
        mode: 'music',
        status: 'queued',
        progress: 0,
        targetAspectRatio: '16:9',
        metadata: {
          isInstrumental: true,
          targetDuration: 180, // 3 minutes
          withVideo: false, // Audio only for faster test
        },
        createdAt: new Date(),
      })
      .returning();

    console.log(`✅ Job created: ${job.id}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Lyrics: "${job.lyrics}" (length: ${job.lyrics?.length || 0})`);
    console.log(`   Target: 180s (3 minutes)\n`);

    console.log('⏳ Job queued - worker will pick it up automatically');
    console.log('📊 Monitor progress:');
    console.log(`   curl http://localhost:8080/api/jobs/${jobId}`);
    console.log('\n🔍 Watch server logs for:');
    console.log('   - "[Suno] NO LYRICS MODE: Returning empty prompt"');
    console.log('   - "[Suno] Duration control via style hints only"');
    console.log('   - "[Suno] Prompt/Structure: (empty)"');
    console.log('   - "[Suno] Instrumental: true"');
    console.log('\n⚠️  Expected behavior:');
    console.log('   1. generateInstrumentalStructure() returns empty string');
    console.log('   2. Suno receives empty lyrics + instrumental=true');
    console.log('   3. Style includes: "3:00 long, 180 seconds total, standard three min format"');
    console.log('   4. Suno generates ~3min instrumental track\n');

    console.log('✅ Test job created successfully!');
    console.log('   Check server logs to validate NO LYRICS approach is working.');
  } catch (error: any) {
    console.error('❌ Error creating test job:', error.message);
    throw error;
  }
}

createTestBeat();
