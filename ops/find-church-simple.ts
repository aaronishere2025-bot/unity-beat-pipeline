import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function findChurchJob() {
  console.log('Searching for church-related jobs from today...\n');

  // Use raw SQL to avoid schema issues
  const result = await db.execute(sql`
    SELECT id, status, script_name, created_at, video_url, youtube_video_id
    FROM jobs
    WHERE created_at >= CURRENT_DATE
    AND (
      LOWER(script_name) LIKE '%church%' OR
      LOWER(script_content) LIKE '%church%' OR
      LOWER(script_name) LIKE '%cathedral%' OR
      LOWER(script_name) LIKE '%reformation%' OR
      LOWER(script_name) LIKE '%protestant%' OR
      LOWER(script_name) LIKE '%catholic%'
    )
    ORDER BY created_at DESC
    LIMIT 10
  `);

  if (result.rows.length > 0) {
    console.log(`🔍 Found ${result.rows.length} church-related job(s) from today:\n`);
    for (const row of result.rows as any[]) {
      console.log(`Job ID: ${row.id}`);
      console.log(`Status: ${row.status}`);
      console.log(`Name: ${row.script_name}`);
      console.log(`Created: ${row.created_at}`);
      if (row.video_url) {
        console.log(`✅ Video: ${row.video_url}`);
      }
      if (row.youtube_video_id) {
        console.log(`📺 YouTube: https://youtube.com/watch?v=${row.youtube_video_id}`);
      }
      console.log('---\n');
    }
  } else {
    console.log('❌ No church-related jobs found from today\n');

    // Show all jobs from today
    const allToday = await db.execute(sql`
      SELECT id, status, script_name, video_url
      FROM jobs
      WHERE created_at >= CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`Recent jobs from today (${allToday.rows.length}):\n`);
    for (const row of allToday.rows as any[]) {
      const hasVideo = row.video_url ? '✅' : '⏳';
      console.log(
        `${hasVideo} ${row.id.substring(0, 8)} | ${(row.status || '').padEnd(12)} | ${row.script_name?.substring(0, 50) || 'Untitled'}`,
      );
    }
  }
}

findChurchJob().catch(console.error);
