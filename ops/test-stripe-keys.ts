import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';

async function testStripeKeys() {
  console.log('\n🔍 Testing Stripe API Keys...\n');

  // Check if keys are set
  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes('YOUR_STRIPE')) {
    console.error('❌ STRIPE_SECRET_KEY not configured');
    return;
  }
  if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY.includes('YOUR_STRIPE')) {
    console.error('❌ STRIPE_PUBLISHABLE_KEY not configured');
    return;
  }

  console.log('✅ Secret Key:', STRIPE_SECRET_KEY.slice(0, 20) + '...');
  console.log('✅ Publishable Key:', STRIPE_PUBLISHABLE_KEY.slice(0, 20) + '...\n');

  // Initialize Stripe
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
  });

  try {
    // Test 1: List customers (should work even if empty)
    console.log('Test 1: Fetching customers...');
    const customers = await stripe.customers.list({ limit: 3 });
    console.log(`✅ Connected successfully! Found ${customers.data.length} customer(s)\n`);

    // Test 2: Get account details
    console.log('Test 2: Fetching account details...');
    const account = await stripe.accounts.retrieve();
    console.log('✅ Account ID:', account.id);
    console.log('✅ Account Type:', account.type);
    console.log('✅ Email:', account.email || 'Not set');
    console.log('✅ Charges Enabled:', account.charges_enabled);
    console.log('✅ Payouts Enabled:', account.payouts_enabled);

    if (!account.charges_enabled) {
      console.warn('\n⚠️  WARNING: Charges are not yet enabled on this account.');
      console.warn('   You may need to complete account setup at https://dashboard.stripe.com/settings/account\n');
    }

    // Test 3: List products (for beat store)
    console.log('\nTest 3: Checking products...');
    const products = await stripe.products.list({ limit: 3 });
    console.log(`✅ Found ${products.data.length} product(s)\n`);

    console.log('\n✨ All Stripe tests passed! Your keys are valid and working.\n');
    console.log('Next steps:');
    console.log('  1. Complete Stripe account setup if charges are not enabled');
    console.log('  2. Set up webhook endpoint at https://dashboard.stripe.com/webhooks');
    console.log('  3. Add STRIPE_WEBHOOK_SECRET to .env\n');
  } catch (error: any) {
    console.error('\n❌ Stripe API Error:', error.message);
    if (error.type === 'StripeAuthenticationError') {
      console.error('   Invalid API key. Please check your STRIPE_SECRET_KEY.');
    } else if (error.type === 'StripePermissionError') {
      console.error('   Permission denied. Your key may not have the required permissions.');
    }
    console.error('\n');
  }
}

testStripeKeys();
