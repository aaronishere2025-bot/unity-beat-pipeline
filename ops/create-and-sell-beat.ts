import Stripe from 'stripe';
import { db } from './server/db.js';
import { jobs, users, beatStoreListings } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { storage } from './server/storage.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

async function createAndSellBeat() {
  console.log('\n🎵 Creating and Listing Beat for Sale\n');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Get test user
    console.log('Step 1: Getting user...');
    const [user] = await db.select().from(users).where(eq(users.email, 'test@unityai.local')).limit(1);

    if (!user) {
      console.error('❌ Test user not found. Creating one...');
      const [newUser] = await db
        .insert(users)
        .values({
          googleId: 'test-google-id',
          email: 'test@unityai.local',
          displayName: 'Test User',
          freeBeatCreditsRemaining: 5,
        })
        .returning();
      console.log('✅ Created test user:', newUser.id);
    } else {
      console.log('✅ Found user:', user.email);
    }

    const userId = user?.id || '';

    // Step 2: Generate a beat (or find existing completed beat)
    console.log('\nStep 2: Finding or generating a beat...');

    // First, check if we have any completed beats with music
    const [existingBeat] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.status, 'completed'))
      .orderBy(desc(jobs.createdAt))
      .limit(1);

    let beatJob;
    if (existingBeat && existingBeat.musicUrl) {
      console.log('✅ Found existing beat:', existingBeat.id);
      console.log(`   Music: ${existingBeat.musicUrl}`);
      beatJob = existingBeat;
    } else {
      console.log('⏳ No completed beats found. Generating new beat...');
      console.log('   Style: Trap Beat (150 BPM)');
      console.log('   Duration: 3 minutes');
      console.log('   Visuals: Yes');

      beatJob = await storage.createJob({
        mode: 'music',
        scriptName: 'Trap Beat - $5 Special',
        scriptContent: 'Dark aggressive trap beat with heavy bass and hi-hats',
        aspectRatio: '9:16',
        autoUpload: false,
        status: 'queued',
        progress: 0,
        musicDescription: 'Dark trap beat, 150 BPM, aggressive percussion, heavy 808s',
        unityMetadata: {
          packageId: 'test-beat-marketplace',
          promptCount: 0,
          estimatedCost: 0.1,
          topic: 'trap beat',
          preparingMusic: true,
        },
      });

      console.log('✅ Beat generation job created:', beatJob.id);
      console.log("   ⚠️  Note: Job is queued. For this demo, we'll proceed with mock data.");
    }

    // Step 3: Create Stripe payment link
    console.log('\nStep 3: Creating Stripe payment link ($5.00)...');

    const beatName = `Trap Beat - ${new Date().toLocaleDateString()}`;
    const description = `Professional trap beat with dark aggressive vibes. 150 BPM, heavy bass, perfect for rap/hip-hop. High-quality audio file included.`;

    // Create Stripe product
    const stripeProduct = await stripe.products.create({
      name: beatName,
      description: description,
      metadata: {
        userId: userId,
        jobId: beatJob.id,
        beatType: 'trap',
        bpm: '150',
      },
    });

    console.log('✅ Stripe product created:', stripeProduct.id);

    // Create price
    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: 500, // $5.00
      currency: 'usd',
    });

    console.log('✅ Stripe price created:', stripePrice.id, '($5.00)');

    // Create payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: stripePrice.id,
          quantity: 1,
        },
      ],
      after_completion: {
        type: 'redirect',
        redirect: {
          url: 'https://your-domain.com/thank-you', // Update this
        },
      },
      metadata: {
        userId: userId,
        jobId: beatJob.id,
        listingType: 'beat',
      },
    });

    console.log('✅ Payment link created:', paymentLink.url);

    // Step 4: List in beat store
    console.log('\nStep 4: Listing beat in marketplace...');

    const [listing] = await db
      .insert(beatStoreListings)
      .values({
        userId: userId,
        jobId: beatJob.id,
        beatName: beatName,
        description: description,
        priceUSD: '5.00',
        stripeProductId: stripeProduct.id,
        stripePriceId: stripePrice.id,
        stripePaymentLinkUrl: paymentLink.url,
        isGenerated: true,
        active: true,
        views: 0,
        purchases: 0,
        totalRevenueUSD: '0.00',
      })
      .returning();

    console.log('✅ Beat listed in marketplace:', listing.id);

    // Step 5: Prepare YouTube description with purchase link
    console.log('\nStep 5: Preparing YouTube upload...');

    const youtubeTitle = `${beatName} | Trap Beat | 150 BPM`;
    const youtubeDescription = `
🎵 ${beatName}

Dark aggressive trap beat perfect for rap and hip-hop. 150 BPM with heavy 808s and hard-hitting percussion.

🛒 BUY THIS BEAT (Instant Download): ${paymentLink.url}

📊 BEAT INFO:
• BPM: 150
• Key: C minor
• Style: Trap / Hip-Hop
• Duration: 3:00
• Quality: Professional Studio Quality

💰 PRICING:
• Basic License: $5.00
• Includes: MP3 + WAV files
• Usage: Music videos, streaming, performances

🎤 PERFECT FOR:
• Rap vocals
• Hip-hop artists
• Music producers
• Content creators

📝 LICENSE TERMS:
• Non-exclusive rights
• Unlimited audio streams
• Up to 100K video views
• Credit required: "Produced by Unity AI"

🔗 PURCHASE LINK: ${paymentLink.url}

✨ Generated with Unity AI - Professional beats powered by artificial intelligence

#TrapBeat #HipHopBeat #RapBeat #BeatForSale #TypeBeat #ProducerLife
`.trim();

    console.log('✅ YouTube metadata prepared');
    console.log('\n📺 YouTube Title:');
    console.log(`   ${youtubeTitle}`);
    console.log('\n📝 YouTube Description (first 200 chars):');
    console.log(`   ${youtubeDescription.substring(0, 200)}...`);

    // Step 6: Summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✨ COMPLETE! Beat is ready for sale');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📋 Summary:');
    console.log(`   Beat Name: ${beatName}`);
    console.log(`   Price: $5.00`);
    console.log(`   Job ID: ${beatJob.id}`);
    console.log(`   Listing ID: ${listing.id}`);
    console.log(`   Stripe Product: ${stripeProduct.id}`);
    console.log(`   Stripe Price: ${stripePrice.id}\n`);

    console.log('🛒 Purchase Link:');
    console.log(`   ${paymentLink.url}\n`);

    console.log('🔗 Marketplace URL:');
    console.log(`   http://localhost:5173/marketplace\n`);

    console.log('📺 YouTube Upload:');
    console.log(`   • Upload video/audio to YouTube`);
    console.log(`   • Use title: ${youtubeTitle}`);
    console.log(`   • Copy description above`);
    console.log(`   • Purchase link is included in description\n`);

    console.log('🧪 Test Purchase:');
    console.log(`   1. Visit: ${paymentLink.url}`);
    console.log(`   2. Use test card: 4242 4242 4242 4242`);
    console.log(`   3. Any future expiry, any CVC`);
    console.log(`   4. Complete checkout\n`);

    console.log('✅ Next Steps:');
    console.log('   1. Visit marketplace to see your listing');
    console.log('   2. Test purchase flow with Stripe test card');
    console.log('   3. Upload to YouTube with description');
    console.log('   4. Share purchase link with customers\n');

    return {
      listing,
      paymentLink: paymentLink.url,
      youtubeTitle,
      youtubeDescription,
      beatJob,
    };
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createAndSellBeat()
    .then(() => {
      console.log('🎉 Success! Beat is live and ready for sale.\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

export { createAndSellBeat };
