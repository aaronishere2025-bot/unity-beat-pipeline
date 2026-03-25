-- Make r2_key nullable in beat_store_listings table
-- This allows listings without R2 storage (can use direct URLs instead)

ALTER TABLE beat_store_listings
  ALTER COLUMN r2_key DROP NOT NULL;

COMMENT ON COLUMN beat_store_listings.r2_key IS 'Cloudflare R2 key (nullable - can use direct URLs instead)';
