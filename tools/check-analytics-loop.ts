// Check if analytics feedback loop is active
import { db } from './server/db';
import { orchestrationReports } from '@shared/schema';
import { desc } from 'drizzle-orm';

async function checkFeedbackLoop() {
  console.log('🔍 Checking Analytics Feedback Loop Status...\n');

  // Check recent orchestration runs
  const recentRuns = await db
    .select()
    .from(orchestrationReports)
    .orderBy(desc(orchestrationReports.timestamp))
    .limit(5);

  if (recentRuns.length === 0) {
    console.log('⚠️  No orchestration runs found yet');
    console.log('   The feedback loop will run when:');
    console.log('   1. Server is running (npm run dev)');
    console.log('   2. YouTube analytics data is available');
    console.log('   3. Hourly schedule triggers\n');
  } else {
    console.log(`✅ Found ${recentRuns.length} recent orchestration runs:\n`);
    for (const run of recentRuns) {
      const data = run.reportData as any;
      console.log(`📊 ${new Date(run.timestamp).toLocaleString()}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Execution: ${data.executionTimeMs}ms`);
      console.log(`   Changes applied: ${Object.keys(data.appliedChanges || {}).length} systems`);
      if (data.conflicts?.length > 0) {
        console.log(`   Conflicts resolved: ${data.conflicts.length}`);
      }
      console.log('');
    }
  }

  // Check system configuration
  const config = await db.query.systemConfiguration.findFirst();
  if (config) {
    const configValue = config.value as any;
    console.log('⚙️  Configuration:');
    console.log(`   Orchestrator enabled: ${configValue.orchestrator?.enabled !== false ? 'YES ✅' : 'NO ⚠️'}`);
    console.log(`   Run interval: ${(configValue.orchestrator?.runInterval || 60) / 60} minutes`);
    console.log(`   Min confidence: ${configValue.orchestrator?.minConfidence || 0.7}\n`);
  }

  console.log('💡 To see real-time learning, run the server and upload videos to YouTube!');
  process.exit(0);
}

checkFeedbackLoop().catch(console.error);
