#!/usr/bin/env tsx
/**
 * Test script to verify music metadata generation for type beats and lofi
 */

import { youtubeMetadataGenerator } from './server/services/youtube-metadata-generator';

async function testMusicMetadata() {
  console.log('🧪 Testing Music Metadata Generation\n');

  // Test 1: Trap Type Beat
  console.log('Test 1: Trap Type Beat (Melodic)');
  console.log('─'.repeat(50));
  const trapMetadata = await youtubeMetadataGenerator.generateMetadata({
    jobName: 'Trap Beat #1 - Jan 25',
    mode: 'music',
    aspectRatio: '16:9',
    unityMetadata: {
      musicStyle: 'Melodic trap, 138 BPM, emotional piano, smooth 808s, atmospheric pads, dreamy vibes, modern trap',
    },
    duration: 240,
  });

  console.log(`Title: ${trapMetadata.title}`);
  console.log(`\nDescription preview:`);
  console.log(trapMetadata.description.substring(0, 300) + '...');
  console.log(`\nTags: ${trapMetadata.tags.slice(0, 5).join(', ')}...`);
  console.log('\n');

  // Test 2: Lofi Study Beats
  console.log('Test 2: Lofi Study Beats');
  console.log('─'.repeat(50));
  const lofiMetadata = await youtubeMetadataGenerator.generateMetadata({
    jobName: 'Lofi Study Vibes - Jan 25',
    mode: 'music',
    aspectRatio: '16:9',
    unityMetadata: {
      musicStyle: 'lofi hip-hop, chill study beats, 80 BPM relaxed groove, jazzy chords, vinyl crackle',
    },
    duration: 1800, // 30 minutes
  });

  console.log(`Title: ${lofiMetadata.title}`);
  console.log(`\nDescription preview:`);
  console.log(lofiMetadata.description.substring(0, 300) + '...');
  console.log(`\nTags: ${lofiMetadata.tags.slice(0, 5).join(', ')}...`);
  console.log('\n');

  // Test 3: Another trap style (Chill trap for Travis Scott)
  console.log('Test 3: Chill Trap (Travis Scott Type)');
  console.log('─'.repeat(50));
  const chillTrapMetadata = await youtubeMetadataGenerator.generateMetadata({
    jobName: 'Trap Beat #2 - Jan 25',
    mode: 'music',
    aspectRatio: '16:9',
    unityMetadata: {
      musicStyle: 'Chill trap, 145 BPM, atmospheric synths, smooth 808s, crispy hi-hats, dreamy pads',
    },
    duration: 240,
  });

  console.log(`Title: ${chillTrapMetadata.title}`);
  console.log(`\nDescription preview:`);
  console.log(chillTrapMetadata.description.substring(0, 300) + '...');
  console.log(`\nTags: ${chillTrapMetadata.tags.slice(0, 5).join(', ')}...`);
  console.log('\n');

  // Verify no Suno attribution
  console.log('✅ Verification Checks:');
  console.log(`   - Trap title includes artist type: ${trapMetadata.title.includes('Type Beat') ? '✓' : '✗'}`);
  console.log(
    `   - Lofi title mentions study/relax: ${lofiMetadata.title.includes('Study') || lofiMetadata.title.includes('Relax') ? '✓' : '✗'}`,
  );
  console.log(`   - No "Suno" in trap description: ${!trapMetadata.description.includes('Suno') ? '✓' : '✗'}`);
  console.log(`   - No "Suno" in lofi description: ${!lofiMetadata.description.includes('Suno') ? '✓' : '✗'}`);
  console.log(
    `   - Travis Scott detected from chill trap: ${chillTrapMetadata.title.includes('Travis Scott') ? '✓' : '✗'}`,
  );
  console.log(`   - Lil Durk detected from melodic trap: ${trapMetadata.title.includes('Lil Durk') ? '✓' : '✗'}`);

  console.log('\n🎉 All tests complete!');
}

testMusicMetadata().catch(console.error);
