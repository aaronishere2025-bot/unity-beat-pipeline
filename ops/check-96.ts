import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { inArray } from 'drizzle-orm';

async function check() {
  const stuckJobIds = [
    'n2ALvh-ctsimXLEDL19Yr',
    '2390b8cc-0761-4ba8-8082-eb94cde63ea7',
    'FDBUI9EWTWBYC-0Vif0df',
    'd7873e32-eeb6-45e6-9433-ca6475846f38',
  ];
  const results = await db.select().from(jobs).where(inArray(jobs.id, stuckJobIds));

  console.log('=== Previously Stuck Jobs (96%) ===\n');
  results.forEach((j) => {
    console.log(`${j.id}: ${j.status} (${j.progress}%)`);
  });
}
check();
