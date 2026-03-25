import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function testUpdate() {
  const testJobId = '8133eae9-ab9f-4961-b0a2-02a82abe7a5b';

  console.log('\n🧪 Testing completion update with same values that failed...\n');

  try {
    // Simulate the exact update that was done
    const result = await db
      .update(jobs)
      .set({
        status: 'completed',
        videoUrl: '/api/videos/unity_final_8133eae9-ab9f-4961-b0a2-02a82abe7a5b_1767247558443.mp4',
        thumbnailUrl: null,
        cost: '4.10',
        duration: 90,
        fileSize: 49000000,
        generatedDescription: 'Test description',
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, testJobId))
      .returning();

    console.log('✅ Update successful!');
    console.log('   No varchar(20) error occurred.');
    console.log('   Result:', result[0]?.status);
  } catch (error: any) {
    console.log('❌ Update failed with error:');
    console.log('  ', error.message);
    console.log('   Code:', error.code);
    if (error.detail) {
      console.log('   Detail:', error.detail);
    }
  }

  console.log('\n');
  process.exit(0);
}

testUpdate();
