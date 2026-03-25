#!/usr/bin/env tsx
/**
 * Prepare Beats for BeatStars Upload
 * Creates organized folders with metadata for each beat
 *
 * Usage: npx tsx prepare-beats-for-beatstars.ts
 */

import { storage } from './server/storage';
import { beatStarsMetadataGenerator } from './server/services/beatstars-metadata-generator';
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 PREPARE BEATS FOR BEATSTARS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const outputDir = join(process.cwd(), 'data', 'beatstars_ready');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const jobs = await storage.listJobs();
  const beats = jobs.filter((j) => j.status === 'completed' && j.mode === 'music' && j.audioUrl);

  console.log(`📊 Found ${beats.length} completed beats\n`);

  if (beats.length === 0) {
    console.log('✅ No beats ready for export');
    return;
  }

  let successCount = 0;

  for (const job of beats) {
    try {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📝 ${job.scriptName}`);

      // Extract beat info
      const bpmMatch = job.scriptName?.match(/(\d+)\s*BPM/i);
      const bpm = bpmMatch ? parseInt(bpmMatch[1]) : 85;

      const isLofi = /lofi|chillhop/i.test(job.scriptContent || '');
      const genre = isLofi ? 'lofi' : 'trap';

      const beatName =
        job.scriptName
          ?.replace(/\[.*?\]/g, '')
          .replace(/\d+\s*BPM/gi, '')
          .trim() || 'Untitled';

      // Find artist tags from scriptContent
      const artistTags: string[] = [];
      const lofiArtists = ['Mac Miller', 'J Dilla', 'Nujabes', 'Kendrick Lamar', 'Tyler The Creator'];
      const trapArtists = ['Travis Scott', 'Future', 'Metro Boomin', 'Drake', 'Playboi Carti'];
      const allArtists = [...lofiArtists, ...trapArtists];

      for (const artist of allArtists) {
        if (job.scriptContent?.toLowerCase().includes(artist.toLowerCase())) {
          artistTags.push(artist);
        }
      }

      // Generate metadata
      const metadata = beatStarsMetadataGenerator.generateMetadata(beatName, bpm, genre as any, artistTags);

      // Create beat folder
      const beatSlug = beatName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const beatDir = join(outputDir, `${beatSlug}_${bpm}bpm`);
      if (!existsSync(beatDir)) {
        mkdirSync(beatDir, { recursive: true });
      }

      // Copy audio file (MP3 or WAV)
      const audioPath = join(process.cwd(), 'data', 'audio', job.audioUrl!.replace('/api/audio/', ''));
      if (existsSync(audioPath)) {
        const audioExtension = audioPath.endsWith('.wav') ? '.wav' : '.mp3';
        const destAudioPath = join(beatDir, `${beatSlug}${audioExtension}`);
        copyFileSync(audioPath, destAudioPath);
        console.log(`  ✅ Audio: ${beatSlug}${audioExtension}`);
      } else {
        console.log(`  ⚠️  Audio file not found: ${audioPath}`);
      }

      // Generate metadata.txt with all BeatStars info
      const metadataText = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEATSTARS UPLOAD METADATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TITLE:
${metadata.title}

DESCRIPTION:
${metadata.description}

TAGS (comma separated):
${metadata.tags.join(', ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEAT INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BPM: ${metadata.bpm}
Key: ${metadata.key || 'N/A'}
Genre: ${metadata.genre}
Mood: ${metadata.mood.join(', ')}
Instruments: ${metadata.instruments.join(', ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRICING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Free Download: ${metadata.pricing.free ? 'YES (with credit)' : 'NO'}
MP3 Lease: $${metadata.pricing.mp3Lease}
WAV Lease: $${metadata.pricing.wavLease}
Trackout Stems: $${metadata.pricing.trackout}
Unlimited License: $${metadata.pricing.unlimited}
Exclusive Rights: $${metadata.pricing.exclusive}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LICENSE TERMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MP3 LEASE:
  - Streams: ${metadata.licenses.mp3.streams.toLocaleString()}
  - Audio Streams: ${metadata.licenses.mp3.audioStreams.toLocaleString()}
  - Music Videos: ${metadata.licenses.mp3.musicVideos}
  - Profit Shows: ${metadata.licenses.mp3.profitShows}

WAV LEASE:
  - Streams: ${metadata.licenses.wav.streams.toLocaleString()}
  - Audio Streams: ${metadata.licenses.wav.audioStreams.toLocaleString()}
  - Music Videos: ${metadata.licenses.wav.musicVideos}
  - Profit Shows: ${metadata.licenses.wav.profitShows}

TRACKOUT STEMS:
  - Streams: ${metadata.licenses.trackout.streams.toLocaleString()}
  - Audio Streams: ${metadata.licenses.trackout.audioStreams.toLocaleString()}
  - Music Videos: ${metadata.licenses.trackout.musicVideos}
  - Profit Shows: ${metadata.licenses.trackout.profitShows}

UNLIMITED LICENSE:
  - No restrictions on usage

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Credits: ${metadata.credits}
Copyright Year: ${metadata.copyrightYear}
Content ID: ${metadata.contentID ? 'ENABLED' : 'DISABLED'}
Explicit Content: ${metadata.explicit ? 'YES' : 'NO'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPLOAD INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to BeatStars Studio: https://studio.beatstars.com/
2. Click "Create Track" or drag & drop the audio file
3. Copy-paste the TITLE above
4. Copy-paste the DESCRIPTION above
5. Copy-paste the TAGS above (comma separated)
6. Set BPM, Key, Genre, Mood, Instruments from info above
7. Configure pricing and license terms
8. Enable Content ID if desired
9. Save and publish!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      writeFileSync(join(beatDir, 'METADATA.txt'), metadataText.trim());
      console.log(`  ✅ Metadata: METADATA.txt`);

      // Generate JSON metadata for programmatic access
      const jsonMetadata = {
        jobId: job.id,
        beatName,
        bpm,
        genre,
        artistTags,
        metadata,
        files: {
          audio: existsSync(audioPath) ? `${beatSlug}${audioPath.endsWith('.wav') ? '.wav' : '.mp3'}` : null,
        },
        generatedAt: new Date().toISOString(),
      };

      writeFileSync(join(beatDir, 'metadata.json'), JSON.stringify(jsonMetadata, null, 2));
      console.log(`  ✅ JSON: metadata.json`);
      console.log(`  📁 Folder: ${beatDir}`);

      successCount++;
    } catch (error: any) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ EXPORT COMPLETE!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📊 STATS:`);
  console.log(`   Prepared: ${successCount}/${beats.length}`);
  console.log(`   Location: ${outputDir}`);

  console.log(`\n📖 UPLOAD WORKFLOW:`);
  console.log(`   1. Open each beat folder in ${outputDir}`);
  console.log(`   2. Read METADATA.txt for upload instructions`);
  console.log(`   3. Upload audio file to BeatStars Studio`);
  console.log(`   4. Copy-paste metadata (title, description, tags)`);
  console.log(`   5. Set pricing and license terms`);
  console.log(`   6. Publish!\n`);

  console.log(`💡 TIP: For bulk upload, use:`);
  console.log(`   npx tsx export-beats-to-beatstars-csv.ts\n`);

  console.log(`🔗 BEATSTARS STUDIO:`);
  console.log(`   https://studio.beatstars.com/content/tracks/uploaded\n`);
}

main().catch(console.error);
