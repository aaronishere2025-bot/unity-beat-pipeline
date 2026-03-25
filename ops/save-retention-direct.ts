/**
 * Save retention curve using raw SQL
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

const VIDEO_ID = 'iFLr_LIpevs';

// Sample retention data (100 points, 0-90 seconds)
const retentionData = Array.from({ length: 100 }, (_, i) => {
  const second = Math.round((i / 99) * 90);
  // Simulate drop-off: starts at 104%, drops to 8% by 60s
  const retention = 104 - (i / 99) * 96;
  return { second, retention };
});

async function saveRetentionDirect() {
  console.log(`Saving retention curve for ${VIDEO_ID}...`);
  console.log(`Data points: ${retentionData.length}`);
  console.log(`First point: ${JSON.stringify(retentionData[0])}`);
  console.log(`Last point: ${JSON.stringify(retentionData[retentionData.length - 1])}\n`);

  try {
    // Use raw SQL to update
    await db.execute(sql`
      UPDATE detailed_video_metrics
      SET retention_curve = ${JSON.stringify(retentionData)}::jsonb
      WHERE video_id = ${VIDEO_ID}
    `);

    console.log('✅ Saved with raw SQL\n');

    // Verify
    const result = await db.execute(sql`
      SELECT
        video_id,
        retention_curve IS NOT NULL as has_curve,
        jsonb_array_length(retention_curve) as points
      FROM detailed_video_metrics
      WHERE video_id = ${VIDEO_ID}
    `);

    console.log('Verification:');
    console.log(JSON.stringify(result.rows[0], null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

saveRetentionDirect();
