import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

async function createStripeProducts() {
  console.log('\n🚀 Creating Stripe subscription products...\n');

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
  });

  try {
    // Distribution Tier - $19/mo
    console.log('Creating Distribution Tier...');
    const distributionProduct = await findOrCreateProduct(stripe, {
      name: 'Distribution Tier',
      description:
        'Multi-platform distribution with OnlySocials integration. Auto-post to YouTube, TikTok, Instagram, Pinterest, Reddit, and Mastodon.',
      features: [
        'Unlimited beat generation',
        'Multi-platform auto-posting',
        'TikTok, Instagram Reels, YouTube Shorts',
        'Pinterest, Reddit, Mastodon distribution',
        'Advanced scheduling',
        'Priority support',
      ],
    });

    const distributionPrice = await findOrCreatePrice(stripe, distributionProduct.id, {
      amount: 1900, // $19.00
      interval: 'month',
      nickname: 'Distribution Tier - Monthly',
    });

    console.log('✅ Distribution Tier:', distributionProduct.id);
    console.log('   Price ID:', distributionPrice.id, '($19/mo)');

    // Pro Tier - $49/mo
    console.log('\nCreating Pro Tier...');
    const proProduct = await findOrCreateProduct(stripe, {
      name: 'Pro Tier',
      description: 'Everything in Distribution + advanced AI features, analytics, and priority generation.',
      features: [
        'Everything in Distribution Tier',
        'Priority AI generation queue',
        'Advanced analytics & insights',
        'Custom branding',
        'API access',
        'White-glove support',
      ],
    });

    const proPrice = await findOrCreatePrice(stripe, proProduct.id, {
      amount: 4900, // $49.00
      interval: 'month',
      nickname: 'Pro Tier - Monthly',
    });

    console.log('✅ Pro Tier:', proProduct.id);
    console.log('   Price ID:', proPrice.id, '($49/mo)');

    // Create test customer
    console.log('\nCreating test customer...');
    const testCustomer = await stripe.customers.create({
      email: 'test@unityai.example.com',
      name: 'Unity Test User',
      metadata: {
        environment: 'test',
        created_by: 'automation-script',
      },
    });
    console.log('✅ Test customer:', testCustomer.id);

    console.log('\n✨ Products created successfully!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Add these to your .env file:');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`STRIPE_DISTRIBUTION_PRICE_ID="${distributionPrice.id}"`);
    console.log(`STRIPE_PRO_PRICE_ID="${proPrice.id}"`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Webhook Setup (Manual):');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('1. Get a public URL (ngrok, cloudflare tunnel, or deploy)');
    console.log('2. Go to: https://dashboard.stripe.com/test/webhooks');
    console.log('3. Add endpoint: https://your-domain.com/api/stripe/webhook');
    console.log('4. Select events:');
    console.log('   - checkout.session.completed');
    console.log('   - customer.subscription.created');
    console.log('   - customer.subscription.updated');
    console.log('   - customer.subscription.deleted');
    console.log('   - invoice.payment_succeeded');
    console.log('   - invoice.payment_failed');
    console.log('5. Copy webhook secret and add to .env:');
    console.log('   STRIPE_WEBHOOK_SECRET="whsec_..."');
    console.log('\n');

    return {
      distributionPriceId: distributionPrice.id,
      proPriceId: proPrice.id,
      testCustomerId: testCustomer.id,
    };
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    throw error;
  }
}

// Helper: Find or create product
async function findOrCreateProduct(stripe: Stripe, config: { name: string; description: string; features: string[] }) {
  const existingProducts = await stripe.products.search({
    query: `name:'${config.name}'`,
  });

  if (existingProducts.data.length > 0) {
    console.log(`  → Found existing: ${config.name}`);
    return existingProducts.data[0];
  }

  const product = await stripe.products.create({
    name: config.name,
    description: config.description,
    metadata: {
      features: JSON.stringify(config.features),
    },
  });

  console.log(`  → Created: ${config.name}`);
  return product;
}

// Helper: Find or create price
async function findOrCreatePrice(
  stripe: Stripe,
  productId: string,
  config: { amount: number; interval: 'month' | 'year'; nickname: string },
) {
  const existingPrices = await stripe.prices.list({
    product: productId,
    active: true,
  });

  const matchingPrice = existingPrices.data.find(
    (p) => p.unit_amount === config.amount && p.recurring?.interval === config.interval,
  );

  if (matchingPrice) {
    console.log(`  → Found existing price: $${(config.amount / 100).toFixed(2)}/${config.interval}`);
    return matchingPrice;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: config.amount,
    currency: 'usd',
    recurring: {
      interval: config.interval,
    },
    nickname: config.nickname,
  });

  console.log(`  → Created price: $${(config.amount / 100).toFixed(2)}/${config.interval}`);
  return price;
}

// Run
createStripeProducts()
  .then((result) => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
