// Migrate existing channels to include status fields
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');

if (existsSync(channelsFile)) {
  const data = JSON.parse(readFileSync(channelsFile, 'utf-8'));

  console.log(`📊 Migrating ${data.length} channels...`);

  const migrated = data.map((ch: any) => ({
    ...ch,
    status: ch.status || 'active',
    failureCount: ch.failureCount || 0,
    lastError: ch.lastError || undefined,
  }));

  writeFileSync(channelsFile, JSON.stringify(migrated, null, 2));

  console.log('✅ Migration complete!');
  console.log('\nChannels:');
  migrated.forEach((ch: any) => {
    console.log(`  - ${ch.title}: ${ch.status}`);
  });
} else {
  console.log('⚠️ No channels file found');
}
