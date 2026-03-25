/**
 * User Beat Store Service
 * Handles listing beats for sale with Stripe + R2 storage
 *
 * Features:
 * - Upload beats to Cloudflare R2
 * - Create Stripe products and payment links
 * - Track sales and analytics
 * - Two-tier commission: 0% generated, 10% external
 */

import Stripe from 'stripe';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFileSync, statSync } from 'fs';
import { basename } from 'path';
import { db } from '../db';
import { beatStoreListings, jobs, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface BeatListingInput {
  userId: string;
  jobId: string;
  beatName: string;
  description?: string;
  priceUSD: number;
  tags?: string[];
  isGenerated: boolean; // true for platform-generated beats (0% commission)
}

interface BeatListing {
  id: string;
  beatName: string;
  description: string | null;
  priceUSD: string;
  stripeProductId: string;
  stripePriceId: string;
  stripePaymentLinkUrl: string;
  r2Key: string;
  fileSizeBytes: string;
  views: number;
  purchases: number;
  totalRevenueUSD: string;
  isGenerated: boolean;
  active: boolean;
  createdAt: Date;
}

class UserBeatStoreService {
  private static instance: UserBeatStoreService;
  private stripe: Stripe;
  private r2Client?: S3Client;
  private r2Configured: boolean = false;

  private constructor() {
    // Initialize Stripe
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-12-15.clover' as any,
    });

    // Initialize R2 client (S3-compatible)
    try {
      const r2AccountId = process.env.R2_ACCOUNT_ID;
      const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
      const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

      if (r2AccountId && r2AccessKeyId && r2SecretAccessKey) {
        this.r2Client = new S3Client({
          region: 'auto',
          endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
          },
        });
        this.r2Configured = true;
        console.log('✅ Cloudflare R2 configured for beat storage');
      } else {
        console.warn('⚠️  R2 credentials not configured - beat uploads will be disabled');
      }
    } catch (error: any) {
      console.warn(`⚠️  R2 initialization failed: ${error.message}`);
    }
  }

  static getInstance(): UserBeatStoreService {
    if (!UserBeatStoreService.instance) {
      UserBeatStoreService.instance = new UserBeatStoreService();
    }
    return UserBeatStoreService.instance;
  }

  /**
   * List a beat for sale
   */
  async listBeatForSale(input: BeatListingInput): Promise<BeatListing> {
    // Validate user ownership of job
    const job = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.userId, input.userId)))
      .limit(1);

    if (job.length === 0) {
      throw new Error('Job not found or does not belong to user');
    }

    const jobData = job[0];

    // Get beat file path
    const beatFilePath = (jobData as any).musicFilePath || jobData.videoPath;
    if (!beatFilePath) {
      throw new Error('Job has no music file to list for sale');
    }

    // Get file size
    const fileStats = statSync(beatFilePath);
    const fileSizeBytes = fileStats.size;

    // Upload to R2 (if configured)
    let r2Key = '';
    if (this.r2Configured && this.r2Client) {
      r2Key = await this.uploadToR2(beatFilePath, input.beatName, input.userId);
      console.log(`✅ Beat uploaded to R2: ${r2Key}`);
    } else {
      console.warn('⚠️  R2 not configured - using local file path as fallback');
      r2Key = beatFilePath;
    }

    // Create Stripe product
    const stripeProduct = await this.stripe.products.create({
      name: input.beatName,
      description: input.description || `AI-generated beat: ${input.beatName}`,
      images: [], // Could add thumbnail URLs here
      metadata: {
        userId: input.userId,
        jobId: input.jobId,
        isGenerated: input.isGenerated.toString(),
        r2Key,
      },
    });

    console.log(`✅ Stripe product created: ${stripeProduct.id}`);

    // Create Stripe price
    const stripePrice = await this.stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: Math.round(input.priceUSD * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        beatName: input.beatName,
      },
    });

    console.log(`✅ Stripe price created: ${stripePrice.id} ($${input.priceUSD})`);

    // Create Stripe payment link
    const paymentLink = await this.stripe.paymentLinks.create({
      line_items: [
        {
          price: stripePrice.id,
          quantity: 1,
        },
      ],
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: `Thank you for purchasing "${input.beatName}"! Check your email for the download link.`,
        },
      },
      metadata: {
        userId: input.userId,
        jobId: input.jobId,
        listingId: 'pending', // Will be updated after DB insert
      },
    });

    console.log(`✅ Payment link created: ${paymentLink.url}`);

    // Save to database
    const listing = await db
      .insert(beatStoreListings)
      .values({
        userId: input.userId,
        jobId: input.jobId,
        beatName: input.beatName,
        description: input.description || null,
        priceUSD: input.priceUSD.toFixed(2),
        stripeProductId: stripeProduct.id,
        stripePriceId: stripePrice.id,
        stripePaymentLinkUrl: paymentLink.url,
        r2Key,
        fileSizeBytes: fileSizeBytes.toString(),
        views: 0,
        purchases: 0,
        totalRevenueUSD: '0.00',
        isGenerated: input.isGenerated,
        source: input.isGenerated ? 'generated' : 'external',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    console.log(`✅ Beat listing created in database: ${listing[0].id}`);

    // Update payment link metadata with listing ID
    await this.stripe.paymentLinks.update(paymentLink.id, {
      metadata: {
        ...paymentLink.metadata,
        listingId: listing[0].id,
      },
    });

    return listing[0] as any;
  }

  /**
   * Upload beat file to Cloudflare R2
   */
  private async uploadToR2(filePath: string, beatName: string, userId: string): Promise<string> {
    if (!this.r2Client) {
      throw new Error('R2 client not configured');
    }

    const bucketName = process.env.R2_BUCKET_NAME || 'beats';
    const fileExtension = filePath.split('.').pop();
    const sanitizedBeatName = beatName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const r2Key = `users/${userId}/beats/${sanitizedBeatName}_${Date.now()}.${fileExtension}`;

    // Read file
    const fileBuffer = readFileSync(filePath);

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: fileExtension === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
      Metadata: {
        userId,
        beatName,
        uploadedAt: new Date().toISOString(),
      },
    });

    await this.r2Client.send(command);

    return r2Key;
  }

  /**
   * Get all listings for a user
   */
  async getUserListings(userId: string): Promise<BeatListing[]> {
    const listings = await db
      .select()
      .from(beatStoreListings)
      .where(eq(beatStoreListings.userId, userId))
      .orderBy(beatStoreListings.createdAt);

    return listings as BeatListing[];
  }

  /**
   * Get a specific listing
   */
  async getListing(listingId: string, userId: string): Promise<BeatListing | null> {
    const listings = await db
      .select()
      .from(beatStoreListings)
      .where(and(eq(beatStoreListings.id, listingId), eq(beatStoreListings.userId, userId)))
      .limit(1);

    return listings.length > 0 ? (listings[0] as BeatListing) : null;
  }

  /**
   * Update listing (price, description, active status)
   */
  async updateListing(
    listingId: string,
    userId: string,
    updates: {
      beatName?: string;
      description?: string;
      priceUSD?: number;
      active?: boolean;
    },
  ): Promise<BeatListing> {
    // Verify ownership
    const existing = await this.getListing(listingId, userId);
    if (!existing) {
      throw new Error('Listing not found or does not belong to user');
    }

    // If price changed, create new Stripe price
    let newPriceId = existing.stripePriceId;
    if (updates.priceUSD && updates.priceUSD !== parseFloat(existing.priceUSD)) {
      const newPrice = await this.stripe.prices.create({
        product: existing.stripeProductId,
        unit_amount: Math.round(updates.priceUSD * 100),
        currency: 'usd',
      });
      newPriceId = newPrice.id;
      console.log(`✅ New price created: ${newPrice.id} ($${updates.priceUSD})`);
    }

    // Update Stripe product if name/description changed
    if (updates.beatName || updates.description) {
      await this.stripe.products.update(existing.stripeProductId, {
        name: updates.beatName || existing.beatName,
        description: updates.description || existing.description || undefined,
      });
    }

    // Update database
    const updated = await db
      .update(beatStoreListings)
      .set({
        beatName: updates.beatName || existing.beatName,
        description: updates.description !== undefined ? updates.description : existing.description,
        priceUSD: updates.priceUSD !== undefined ? updates.priceUSD.toFixed(2) : existing.priceUSD,
        stripePriceId: newPriceId,
        active: updates.active !== undefined ? updates.active : existing.active,
        updatedAt: new Date(),
      })
      .where(eq(beatStoreListings.id, listingId))
      .returning();

    return updated[0] as BeatListing;
  }

  /**
   * Delete/deactivate listing
   */
  async deleteListing(listingId: string, userId: string): Promise<void> {
    // Verify ownership
    const listing = await this.getListing(listingId, userId);
    if (!listing) {
      throw new Error('Listing not found or does not belong to user');
    }

    // Soft delete by marking as inactive
    await db
      .update(beatStoreListings)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(beatStoreListings.id, listingId));

    // Archive Stripe product
    await this.stripe.products.update(listing.stripeProductId, {
      active: false,
    });

    console.log(`✅ Listing ${listingId} deactivated`);
  }

  /**
   * Record a view for a listing
   */
  async recordView(listingId: string): Promise<void> {
    await db
      .update(beatStoreListings)
      .set({
        views: (db as any).raw('views + 1'),
      })
      .where(eq(beatStoreListings.id, listingId));
  }

  /**
   * Get sales analytics for a user
   */
  async getUserAnalytics(userId: string) {
    const listings = await this.getUserListings(userId);

    const totalListings = listings.length;
    const activeListings = listings.filter((l) => l.active).length;
    const totalSales = listings.reduce((sum, l) => sum + l.purchases, 0);
    const totalRevenue = listings.reduce((sum, l) => sum + parseFloat(l.totalRevenueUSD), 0);
    const totalViews = listings.reduce((sum, l) => sum + l.views, 0);

    return {
      totalListings,
      activeListings,
      totalSales,
      totalRevenue: totalRevenue.toFixed(2),
      totalViews,
      conversionRate: totalViews > 0 ? ((totalSales / totalViews) * 100).toFixed(2) + '%' : '0%',
      avgRevenuePerListing: totalListings > 0 ? (totalRevenue / totalListings).toFixed(2) : '0.00',
    };
  }
}

export const userBeatStoreService = UserBeatStoreService.getInstance();
