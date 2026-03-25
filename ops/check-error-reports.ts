import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { errorReports } from './shared/schema.js';
import { desc } from 'drizzle-orm';

async function main() {
  const errors = await db
    .select({
      id: errorReports.id,
      errorType: errorReports.errorType,
      errorMessage: errorReports.errorMessage,
      severity: errorReports.severity,
      occurrenceCount: errorReports.occurrenceCount,
      firstSeen: errorReports.firstSeen,
      lastSeen: errorReports.lastSeen,
      status: errorReports.status,
    })
    .from(errorReports)
    .orderBy(desc(errorReports.lastSeen))
    .limit(15);

  console.log(`\n=== ERROR REPORTS (${errors.length} recent) ===\n`);
  for (const e of errors) {
    console.log(`[${e.severity}] ${e.errorType} | x${e.occurrenceCount} | ${e.status}`);
    console.log(`  msg: ${(e.errorMessage || '').substring(0, 120)}`);
    console.log(`  last: ${e.lastSeen}`);
    console.log('');
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
