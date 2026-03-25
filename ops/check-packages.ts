import { db } from './server/db';
import { unityContentPackages } from './shared/schema';
import { desc } from 'drizzle-orm';

async function checkPackages() {
  const packages = await db
    .select({
      id: unityContentPackages.id,
      title: unityContentPackages.title,
      topic: unityContentPackages.topic,
      status: unityContentPackages.status,
      createdAt: unityContentPackages.createdAt,
    })
    .from(unityContentPackages)
    .orderBy(desc(unityContentPackages.createdAt))
    .limit(10);

  console.log('\n📦 Recent Unity Packages (last 10):\n');

  if (packages.length === 0) {
    console.log('  No packages found');
    return;
  }

  for (const pkg of packages) {
    const time = new Date(pkg.createdAt).toLocaleTimeString();
    console.log(`  ${pkg.id.substring(0, 8)} | ${pkg.status?.padEnd(12)} | ${time} | ${pkg.title || pkg.topic}`);
  }
}

checkPackages().catch(console.error);
