import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8080';

async function setupStripeAutomation() {
  console.log('\n🚀 Setting up Stripe automation...\n');

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
  });

  try {
    // Step 1: Create webhook endpoint
    console.log('Step 1: Setting up webhook endpoint...');

    // First, list existing webhooks to avoid duplicates
    const existingWebhooks = await stripe.webhookEndpoints.list();
    const webhookUrl = `${SERVER_URL}/api/stripe/webhook`;

    let webhookEndpoint = existingWebhooks.data.find((w) => w.url === webhookUrl);

    if (webhookEndpoint) {
      console.log('✅ Webhook endpoint already exists:', webhookEndpoint.id);
    } else {
      webhookEndpoint = await stripe.webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: [
          'checkout.session.completed',
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'invoice.payment_succeeded',
          'invoice.payment_failed',
          'payment_intent.succeeded',
          'payment_intent.payment_failed',
        ],
        description: 'Unity AI Platform - Production webhook',
      });
      console.log('✅ Created webhook endpoint:', webhookEndpoint.id);
    }

    console.log('📝 Webhook Secret:', webhookEndpoint.secret);
    console.log('\n⚠️  IMPORTANT: Add this to your .env file:');
    console.log(`STRIPE_WEBHOOK_SECRET="${webhookEndpoint.secret}"\n`);

    // Step 2: Create subscription products
    console.log('\nStep 2: Creating subscription products...\n');

    // Distribution Tier - $19/mo
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

    console.log('✅ Distribution Tier Product:', distributionProduct.id);
    console.log('✅ Distribution Price:', distributionPrice.id, '($19/mo)');

    // Pro Tier - $49/mo (optional, for future expansion)
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

    console.log('✅ Pro Tier Product:', proProduct.id);
    console.log('✅ Pro Price:', proPrice.id, '($49/mo)');

    // Step 3: Create test customer and subscription (for verification)
    console.log('\nStep 3: Creating test setup...\n');

    const testCustomer = await stripe.customers.create({
      email: 'test@example.com',
      name: 'Test Customer',
      metadata: {
        environment: 'test',
        created_by: 'setup-script',
      },
    });
    console.log('✅ Test customer created:', testCustomer.id);

    console.log('\n✨ Stripe automation setup complete!\n');
    console.log('Summary:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Webhook Endpoint: ${webhookEndpoint.url}`);
    console.log(`Webhook Secret:   ${webhookEndpoint.secret.slice(0, 20)}...`);
    console.log('');
    console.log('Products Created:');
    console.log(`  • Distribution Tier: ${distributionProduct.id} ($19/mo)`);
    console.log(`    Price ID: ${distributionPrice.id}`);
    console.log(`  • Pro Tier: ${proProduct.id} ($49/mo)`);
    console.log(`    Price ID: ${proPrice.id}`);
    console.log('');
    console.log('Test Customer: ', testCustomer.id);
    console.log('─────────────────────────────────────────────────────\n');

    console.log('Next steps:');
    console.log('  1. Add STRIPE_WEBHOOK_SECRET to .env');
    console.log('  2. Update database schema for subscriptions');
    console.log('  3. Create subscription checkout routes');
    console.log('  4. Test subscription flow\n');

    return {
      webhookSecret: webhookEndpoint.secret,
      distributionPriceId: distributionPrice.id,
      proPriceId: proPrice.id,
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
    console.log(`Found existing product: ${config.name}`);
    return existingProducts.data[0];
  }

  const product = await stripe.products.create({
    name: config.name,
    description: config.description,
    metadata: {
      features: JSON.stringify(config.features),
    },
  });

  console.log(`Created product: ${config.name}`);
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
    console.log(`Found existing price: ${config.nickname}`);
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

  console.log(`Created price: ${config.nickname}`);
  return price;
}

// Run setup
setupStripeAutomation()
  .then((result) => {
    console.log('\n✅ Setup complete! Save these values:\n');
    console.log(`STRIPE_WEBHOOK_SECRET="${result.webhookSecret}"`);
    console.log(`STRIPE_DISTRIBUTION_PRICE_ID="${result.distributionPriceId}"`);
    console.log(`STRIPE_PRO_PRICE_ID="${result.proPriceId}"`);
    console.log('');
  })
  .catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
  });
