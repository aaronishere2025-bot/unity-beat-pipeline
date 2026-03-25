#!/usr/bin/env tsx
/**
 * Export Beats to BeatStars CSV
 * Generates CSV file for bulk import into BeatStars
 *
 * Usage: npx tsx export-beats-to-beatstars-csv.ts
 */

import { beatStarsMetadataGenerator } from './server/services/beatstars-metadata-generator';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 BEATSTARS CSV EXPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Generate CSV
    console.log('Generating CSV from completed beats...');
    const csv = await beatStarsMetadataGenerator.exportToCSV();

    // Save to file
    const outputPath = join(process.cwd(), 'data', 'beatstars_export.csv');
    writeFileSync(outputPath, csv, 'utf-8');

    console.log(`\n✅ CSV exported successfully!`);
    console.log(`📁 File: ${outputPath}`);
    console.log(`\n📖 NEXT STEPS:`);
    console.log(`   1. Go to BeatStars Studio (studio.beatstars.com)`);
    console.log(`   2. Navigate to Tracks → Bulk Upload`);
    console.log(`   3. Upload the CSV file`);
    console.log(`   4. BeatStars will auto-populate metadata for each beat`);
    console.log(`   5. Review and publish your beats\n`);

    console.log(`💡 TIP: You can also manually upload beats one by one and`);
    console.log(`   copy-paste the metadata from the CSV for each track.\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
