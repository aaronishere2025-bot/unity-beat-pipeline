import Stripe from 'stripe';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';

interface CreateBeatProductParams {
  name: string;
  description: string;
  price: number; // in cents
  videoPath: string;
  thumbnailPath?: string;
  tags?: string[];
}

interface BeatProduct {
  id: string;
  name: string;
  price_id: string;
  url: string;
  payment_link: string;
}

class StripeBeatsService {
  private static instance: StripeBeatsService;
  private stripe: Stripe;

  private constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY not found in environment');
    }
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2025-12-15.clover' as any,
    });
  }

  static getInstance(): StripeBeatsService {
    if (!StripeBeatsService.instance) {
      StripeBeatsService.instance = new StripeBeatsService();
    }
    return StripeBeatsService.instance;
  }

  /**
   * Create a beat product on Stripe with video file
   */
  async createBeatProduct(params: CreateBeatProductParams): Promise<BeatProduct> {
    // Add genre prefix to product name for organization
    const genrePrefix = params.tags?.[0]?.toUpperCase() || 'BEAT';
    const productName = params.name.startsWith('[') ? params.name : `[${genrePrefix}] ${params.name}`;

    console.log(`\n💰 Creating Stripe product: ${productName}`);
    console.log(`   Price: $${(params.price / 100).toFixed(2)}`);
    console.log(`   Video: ${basename(params.videoPath)}`);

    try {
      // Step 1: Upload video file to Stripe
      console.log('\n📦 Step 1: Uploading video file...');
      const fileSize = statSync(params.videoPath).size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      console.log(`   File size: ${fileSizeMB}MB`);

      const file = await this.stripe.files.create({
        purpose: 'product_image' as any,
        file: {
          data: createReadStream(params.videoPath) as any,
          name: basename(params.videoPath),
          type: 'application/octet-stream',
        },
      });

      console.log(`✅ File uploaded: ${file.id}`);

      // Step 2: Create the product
      console.log('\n📦 Step 2: Creating product...');
      const product = await this.stripe.products.create({
        name: productName,
        description: params.description,
        images: params.thumbnailPath ? [params.thumbnailPath] : [],
        metadata: {
          video_file_id: file.id,
          type: 'beat',
          genre: params.tags?.[0] || 'beat',
        },
        shippable: false,
        url: params.thumbnailPath, // Stripe doesn't host files directly, need external hosting
      });

      console.log(`✅ Product created: ${product.id}`);

      // Step 3: Create a price for the product
      console.log('\n💵 Step 3: Creating price...');
      const price = await this.stripe.prices.create({
        product: product.id,
        unit_amount: params.price,
        currency: 'usd',
        metadata: {
          type: 'one_time_purchase',
        },
      });

      console.log(`✅ Price created: ${price.id}`);

      // Step 4: Create a payment link
      console.log('\n🔗 Step 4: Creating payment link...');
      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        after_completion: {
          type: 'redirect',
          redirect: {
            url: 'https://dontcomeherecrazydomain.com/download-success',
          },
        },
      });

      console.log(`✅ Payment link: ${paymentLink.url}`);

      console.log(`\n✅ Stripe product ready: ${paymentLink.url}`);
      return {
        id: product.id,
        name: product.name,
        price_id: price.id,
        url: paymentLink.url,
        payment_link: paymentLink.url,
      };
    } catch (error: any) {
      console.error('❌ Stripe upload failed:');
      console.error('Error:', error.message);
      if (error.raw) {
        console.error('Details:', error.raw.message);
      }
      throw new Error(`Stripe upload failed: ${error.message}`);
    }
  }

  /**
   * Get product by ID
   */
  async getProduct(productId: string): Promise<any> {
    return await this.stripe.products.retrieve(productId);
  }

  /**
   * Update product metadata
   */
  async updateProduct(
    productId: string,
    updates: { name?: string; description?: string; metadata?: any },
  ): Promise<any> {
    return await this.stripe.products.update(productId, updates);
  }

  /**
   * Generate beat description with purchase link
   */
  generateBeatDescription(beatName: string, bpm: number, style: string, stripeUrl: string): string {
    return `${beatName}

🎵 ${style}
⚡ ${bpm} BPM

✨ Professional quality lofi beat perfect for:
• Study sessions
• Relaxation & meditation
• Background music for content
• Chill vibes playlist

🎹 100% original composition
📀 High-quality MP4 video format
💯 Instant download after purchase
📄 Non-exclusive license included

🛒 Get this beat: ${stripeUrl}

#lofi #chillbeats #studymusic #lofibeats #chillhop #lofihiphop`;
  }
}

export const stripeBeatsService = StripeBeatsService.getInstance();
