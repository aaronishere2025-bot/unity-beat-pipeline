import { db } from './server/db.js';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function createTestUser() {
  console.log('\n👤 Creating test user for subscription testing...\n');

  const testEmail = 'test@unityai.local';
  const testGoogleId = 'test-google-id-12345';

  try {
    // Check if user already exists
    const [existing] = await db.select().from(users).where(eq(users.email, testEmail)).limit(1);

    if (existing) {
      console.log('✅ Test user already exists:');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Email: ${existing.email}`);
      console.log(`   Tier: ${existing.subscriptionTier}`);
      console.log(`   Free Credits: ${existing.freeBeatCreditsRemaining}`);
      console.log('');
      return existing;
    }

    // Create test user
    const [newUser] = await db
      .insert(users)
      .values({
        googleId: testGoogleId,
        email: testEmail,
        displayName: 'Test User',
        avatarUrl: null,
        freeBeatCreditsRemaining: 5,
        subscriptionTier: 'free',
        subscriptionStatus: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionCurrentPeriodEnd: null,
        isActive: true,
        isBanned: false,
        lastLoginAt: new Date(),
      })
      .returning();

    console.log('✅ Test user created successfully!');
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Tier: ${newUser.subscriptionTier}`);
    console.log(`   Free Credits: ${newUser.freeBeatCreditsRemaining}`);
    console.log('');

    return newUser;
  } catch (error: any) {
    console.error('❌ Failed to create test user:', error.message);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestUser()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { createTestUser };
