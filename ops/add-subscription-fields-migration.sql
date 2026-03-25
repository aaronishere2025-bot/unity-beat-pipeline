-- Add subscription tracking fields to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP;

-- Add index on subscription_tier for faster queries
CREATE INDEX IF NOT EXISTS users_subscription_tier_idx ON users(subscription_tier);

-- Add index on stripe_subscription_id
CREATE INDEX IF NOT EXISTS users_stripe_subscription_id_idx ON users(stripe_subscription_id);

COMMENT ON COLUMN users.subscription_tier IS 'User subscription tier: free, distribution, pro';
COMMENT ON COLUMN users.subscription_status IS 'Stripe subscription status: active, canceled, past_due, unpaid, etc.';
COMMENT ON COLUMN users.stripe_subscription_id IS 'Stripe subscription ID for tracking';
COMMENT ON COLUMN users.subscription_current_period_end IS 'When the current subscription period ends';
