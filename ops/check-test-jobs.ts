import 'dotenv/config';
import { db } from './server/db';
import { jobs } from './shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const recent = await db
    .select({
      id: jobs.id,
      name: jobs.scriptName,
      status: jobs.status,
      progress: jobs.progress,
      mode: jobs.mode,
    })
    .from(jobs)
    .where(sql`${jobs.id} IN ('16537870-3e21-476e-9af9-9105efbde022', '9d5c80cc-1217-4ba8-8786-25ff2aff9aeb')`);
  console.table(recent);
  process.exit(0);
}
main();
