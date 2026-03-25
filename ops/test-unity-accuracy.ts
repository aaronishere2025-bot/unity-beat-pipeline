import { db } from './server/db.js';
import { unityContentPackages, jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Test Unity Kling mode with STRICT historical accuracy validation
 * This will properly test the 90%+ thresholds
 */

async function testUnityAccuracy() {
  console.log('\n🎬 Testing Unity Kling Mode with STRICT Accuracy Validation\n');
  console.log('📋 Validation Configuration:');
  console.log('   ✅ Era Accuracy: 90% minimum');
  console.log('   ✅ Character Consistency: 90% minimum');
  console.log('   ✅ Anachronism Score: 95% minimum');
  console.log('   ✅ Max Regeneration: 3 attempts per clip');
  console.log('   ✅ Reaction Lag: 0.2 seconds\n');

  try {
    // First, create a Unity content package
    const packageData = {
      name: 'Genghis Khan - Mongol Conquest',
      topic: 'Genghis Khan building the Mongol Empire in 1206 AD',
      lyrics: `In twelve hundred six the Khan unites the tribes
Mongol warriors ride across the Asian steppes so wide
With composite bows and leather armor they advance
Building the greatest empire through conquest and fierce stance
From China to the West their horses never rest
The Great Khan leads his horde putting empires to the test`,
      prompts: [
        'Wide cinematic shot of Mongol cavalry charging across grassland steppes, 1206 AD, composite bows, leather armor, fur-trimmed helmets',
        'Close-up of Genghis Khan, aged 44, weathered Mongolian warrior face, leather lamellar armor, commanding expression',
        'Medium shot of Mongol archers on horseback, drawing composite bows, traditional deel robes, 13th century Asia',
        'Epic battlefield shot, Mongol cavalry surrounding enemy fortress, banners with horse tail emblems, 1206 AD',
        'Wide shot of Khan addressing his generals in felt yurt tent, traditional Mongol clothing, no modern elements',
        "Dramatic close-up of Khan's eyes, determination, wind-swept hair, authentic 13th century Mongolian warrior",
      ],
      characters: [
        {
          name: 'Genghis Khan',
          description:
            'Mongol warrior leader, aged 44 in 1206 AD, weathered face, traditional Mongol armor and clothing',
        },
      ],
      deepResearch:
        'Genghis Khan united the Mongol tribes in 1206 AD. Mongol warriors used composite bows, leather lamellar armor, and rode small sturdy horses. Traditional clothing included deel robes and fur-trimmed helmets.',
      era: 'Medieval (1206 AD)',
      battleTheme: 'Mongol Empire expansion, cavalry warfare, steppes conquest',
      musicStyle: 'Epic throat singing with traditional Mongolian instruments',
      videoEngine: 'kling',
      aspectRatio: '9:16',
    };

    // Create the Unity package
    const [unityPackage] = await db
      .insert(unityContentPackages)
      .values({
        name: packageData.name,
        title: 'Genghis Khan: Rise of the Mongol Empire',
        topic: packageData.topic,
        lyrics: packageData.lyrics,
        prompts: packageData.prompts,
        characters: packageData.characters,
        deepResearch: packageData.deepResearch,
        era: packageData.era,
        battleTheme: packageData.battleTheme,
        musicStyle: packageData.musicStyle,
        videoEngine: packageData.videoEngine,
        aspectRatio: packageData.aspectRatio,
      })
      .returning();

    console.log(`✅ Created Unity package: ${unityPackage.id}`);
    console.log(`   Name: ${unityPackage.name}`);
    console.log(`   Era: ${unityPackage.era}`);
    console.log(`   Clips: ${packageData.prompts.length}\n`);

    // Now create a Unity Kling job that will trigger validation
    const [job] = await db
      .insert(jobs)
      .values({
        mode: 'unity_kling',
        scriptName: packageData.name,
        scriptContent: packageData.lyrics,
        aspectRatio: '9:16',
        clipDuration: 5,
        autoUpload: false,
        status: 'queued',
        unityMetadata: {
          packageId: unityPackage.id,
          autoGenerateMusic: false, // Skip music for faster testing
        },
      })
      .returning();

    console.log(`✅ Created Unity Kling job: ${job.id}`);
    console.log(`\n🎯 What will happen:`);
    console.log(`   1. Each clip will be generated with Kling`);
    console.log(`   2. GPT-4o Vision will validate each frame for:`);
    console.log(`      • Era Accuracy (must be ≥90/100)`);
    console.log(`      • Character Consistency (must be ≥90/100)`);
    console.log(`      • Anachronism Detection (must be ≥95/100)`);
    console.log(`   3. Failed clips auto-regenerate (max 3 attempts)`);
    console.log(`   4. System will detect modern elements and reject them\n`);

    console.log(`📺 Monitor at: http://localhost:8080/`);
    console.log(`🔍 Job ID: ${job.id}\n`);

    // Monitor progress
    let lastStatus = '';
    let lastProgress = -1;

    const monitor = setInterval(async () => {
      const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);

      if (!currentJob) return;

      if (currentJob.status !== lastStatus || (currentJob.progress || 0) !== lastProgress) {
        const bar =
          '█'.repeat(Math.floor((currentJob.progress || 0) / 5)) +
          '░'.repeat(20 - Math.floor((currentJob.progress || 0) / 5));
        console.log(`[${bar}] ${currentJob.progress || 0}% - ${currentJob.status}`);

        if (currentJob.statusMessage) {
          console.log(`    ${currentJob.statusMessage}`);
        }

        lastStatus = currentJob.status;
        lastProgress = currentJob.progress || 0;
      }

      if (currentJob.status === 'completed') {
        console.log(`\n✅ Job completed!`);
        console.log(`   Cost: $${currentJob.cost || 0}`);
        console.log(`   Duration: ${currentJob.duration || 0}s`);
        console.log(`\n📊 Check clipAccuracyData in database for validation scores\n`);
        clearInterval(monitor);
        process.exit(0);
      }

      if (currentJob.status === 'failed') {
        console.log(`\n❌ Job failed: ${currentJob.errorMessage}`);
        clearInterval(monitor);
        process.exit(1);
      }
    }, 5000);

    // Timeout after 15 minutes
    setTimeout(() => {
      console.log('\n⏱️ Timeout - check dashboard for status');
      clearInterval(monitor);
      process.exit(0);
    }, 900000);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testUnityAccuracy();
