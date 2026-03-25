import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function fixAudio() {
  const jobData = [
    {
      id: '8133eae9-ab9f-4961-b0a2-02a82abe7a5b',
      videoPath:
        '/home/aaronishere2025/data/videos/renders/unity_final_8133eae9-ab9f-4961-b0a2-02a82abe7a5b_1767247558443.mp4',
      audioPath: '/home/aaronishere2025/attached_assets/suno_audio/suno_1767244536340_1u27iu.mp3',
      name: 'Pope Stephen VI',
    },
    {
      id: 'f0536869-cc2c-4d5b-9a70-2bd2c755406a',
      videoPath:
        '/home/aaronishere2025/data/videos/renders/unity_final_f0536869-cc2c-4d5b-9a70-2bd2c755406a_1767247528237.mp4',
      audioPath: '/home/aaronishere2025/attached_assets/suno_audio/suno_1767243627985_n2yehq.mp3',
      name: 'Mad Jack Churchill',
    },
  ];

  for (const job of jobData) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔧 Fixing audio for: ${job.name}`);

    if (!existsSync(job.videoPath)) {
      console.log(`❌ Video not found: ${job.videoPath}`);
      continue;
    }

    if (!existsSync(job.audioPath)) {
      console.log(`❌ Audio not found: ${job.audioPath}`);
      continue;
    }

    // Create backup
    const backupPath = job.videoPath.replace('.mp4', '_no_audio.mp4');
    console.log(`📦 Creating backup: ${backupPath}`);
    execSync(`cp "${job.videoPath}" "${backupPath}"`, { encoding: 'utf-8' });

    // Combine video and audio (trim audio to match video duration)
    const outputPath = job.videoPath.replace('.mp4', '_with_audio.mp4');
    console.log(`🎵 Adding audio to video...`);

    try {
      const cmd = `ffmpeg -y -i "${job.videoPath}" -i "${job.audioPath}" \\
        -map 0:v:0 -map 1:a:0 \\
        -c:v copy \\
        -c:a aac -b:a 192k \\
        -shortest \\
        "${outputPath}"`;

      console.log(`   Running: ${cmd.substring(0, 100)}...`);
      execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

      // Verify the output has audio
      const streams = execSync(
        `ffprobe -v error -show_entries stream=codec_type -of default=noprint_wrappers=1 "${outputPath}"`,
        { encoding: 'utf-8' },
      );

      if (streams.includes('codec_type=audio')) {
        console.log(`✅ Audio added successfully!`);

        // Replace original with fixed version
        execSync(`mv "${outputPath}" "${job.videoPath}"`, { encoding: 'utf-8' });
        console.log(`✅ Replaced original video`);

        // Update database to clear error
        await db
          .update(jobs)
          .set({
            errorMessage: null,
          })
          .where(eq(jobs.id, job.id));

        console.log(`✅ Database updated`);
      } else {
        console.log(`❌ Audio still missing after FFmpeg`);
      }
    } catch (error: any) {
      console.log(`❌ FFmpeg error: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Audio fix complete!\n');
  process.exit(0);
}

fixAudio().catch(console.error);
