import { initializeSecretsFromGCP } from './server/secret-manager-loader';
import { db } from './server/db';
import { unityContentPackages } from './shared/schema';
import { desc, sql } from 'drizzle-orm';

async function checkRecentTopics() {
  await initializeSecretsFromGCP();

  console.log('\n📦 Recent Unity Packages (Last 30 days):\n');

  const packages = await db
    .select({
      id: unityContentPackages.id,
      title: unityContentPackages.title,
      status: unityContentPackages.status,
      createdAt: unityContentPackages.createdAt,
    })
    .from(unityContentPackages)
    .where(sql`created_at >= NOW() - INTERVAL '30 days'`)
    .orderBy(desc(unityContentPackages.createdAt))
    .limit(20);

  if (packages.length === 0) {
    console.log('   No packages found in last 30 days');
  } else {
    // Group by figure name (extract from title)
    const figureCount = new Map<string, number>();

    packages.forEach((pkg) => {
      // Extract figure name (usually first part before colon)
      const figureName = pkg.title.split(':')[0].trim();
      figureCount.set(figureName, (figureCount.get(figureName) || 0) + 1);
    });

    console.log('📊 Figure Frequency:\n');
    const sorted = Array.from(figureCount.entries()).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([figure, count]) => {
      console.log(`   ${figure}: ${count} package${count > 1 ? 's' : ''}`);
    });

    console.log('\n📋 All Packages:\n');
    packages.forEach((pkg, i) => {
      const date = new Date(pkg.createdAt).toLocaleDateString();
      console.log(`   ${i + 1}. ${pkg.title.substring(0, 80)}...`);
      console.log(`      Created: ${date}, Status: ${pkg.status}\n`);
    });
  }

  process.exit(0);
}

checkRecentTopics().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
