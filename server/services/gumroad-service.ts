import axios from 'axios';
import FormData from 'form-data';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';

interface GumroadProduct {
  id: string;
  name: string;
  url: string;
  price: number;
  short_url: string;
}

interface CreateProductParams {
  name: string;
  description: string;
  price: number; // in cents
  videoPath: string;
  thumbnailPath?: string;
  tags?: string[];
}

class GumroadService {
  private static instance: GumroadService;
  private accessToken: string;
  private baseUrl = 'https://api.gumroad.com/v2';

  private constructor() {
    this.accessToken = process.env.GUMROAD_ACCESS_TOKEN || '';
    if (!this.accessToken) {
      throw new Error('GUMROAD_ACCESS_TOKEN not found in environment');
    }
  }

  static getInstance(): GumroadService {
    if (!GumroadService.instance) {
      GumroadService.instance = new GumroadService();
    }
    return GumroadService.instance;
  }

  /**
   * Create a product on Gumroad with video file
   */
  async createBeatProduct(params: CreateProductParams): Promise<GumroadProduct> {
    // Add genre prefix to product name for organization
    const genrePrefix = params.tags?.[0]?.toUpperCase() || 'BEAT';
    const productName = params.name.startsWith('[') ? params.name : `[${genrePrefix}] ${params.name}`;

    console.log(`\n💰 Creating Gumroad product: ${productName}`);
    console.log(`   Price: $${(params.price / 100).toFixed(2)}`);
    console.log(`   Video: ${basename(params.videoPath)}`);

    try {
      // Step 1: Create the product
      console.log('\n📦 Step 1: Creating product...');

      // Gumroad API uses form data with access_token parameter
      const formData = new URLSearchParams();
      formData.append('access_token', this.accessToken);
      formData.append('name', productName);
      formData.append('description', params.description);
      formData.append('price', (params.price / 100).toString()); // Convert cents to dollars
      formData.append('published', 'true');

      const productResponse = await axios.post(`${this.baseUrl}/products`, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const product = productResponse.data.product;
      console.log(`✅ Product created: ${product.short_url}`);
      console.log(`   Product ID: ${product.id}`);

      // Step 2: Upload the video file
      console.log('\n📤 Step 2: Uploading video file...');
      await this.uploadProductFile(product.id, params.videoPath);
      console.log('✅ Video uploaded');

      // Step 3: Upload thumbnail if provided
      if (params.thumbnailPath) {
        console.log('\n🖼️ Step 3: Uploading thumbnail...');
        await this.uploadProductCover(product.id, params.thumbnailPath);
        console.log('✅ Thumbnail uploaded');
      }

      // Step 4: Add tags if provided
      if (params.tags && params.tags.length > 0) {
        console.log('\n🏷️ Step 4: Adding tags...');
        await this.updateProductTags(product.id, params.tags);
        console.log(`✅ Tags added: ${params.tags.join(', ')}`);
      }

      console.log(`\n✅ Gumroad product ready: ${product.short_url}`);
      return {
        id: product.id,
        name: product.name,
        url: product.url,
        price: product.price,
        short_url: product.short_url,
      };
    } catch (error: any) {
      console.error('❌ Gumroad upload failed:');
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.error('Error:', error.message);
      }
      throw new Error(`Gumroad upload failed: ${error.message}`);
    }
  }

  /**
   * Upload file to existing product
   */
  private async uploadProductFile(productId: string, filePath: string): Promise<void> {
    const form = new FormData();
    form.append('access_token', this.accessToken);
    form.append('file', createReadStream(filePath), {
      filename: basename(filePath),
      contentType: 'video/mp4',
    });

    const fileSize = statSync(filePath).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    console.log(`   File size: ${fileSizeMB}MB`);

    await axios.put(`${this.baseUrl}/products/${productId}`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  /**
   * Upload cover image to product
   */
  private async uploadProductCover(productId: string, imagePath: string): Promise<void> {
    const form = new FormData();
    form.append('access_token', this.accessToken);
    form.append('cover', createReadStream(imagePath), {
      filename: basename(imagePath),
      contentType: 'image/jpeg',
    });

    await axios.put(`${this.baseUrl}/products/${productId}`, form, {
      headers: form.getHeaders(),
    });
  }

  /**
   * Update product tags
   */
  private async updateProductTags(productId: string, tags: string[]): Promise<void> {
    const formData = new URLSearchParams();
    formData.append('access_token', this.accessToken);
    formData.append('tags', tags.join(','));

    await axios.put(`${this.baseUrl}/products/${productId}`, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Get product by ID
   */
  async getProduct(productId: string): Promise<any> {
    const response = await axios.get(`${this.baseUrl}/products/${productId}`, {
      params: { access_token: this.accessToken },
    });
    return response.data.product;
  }

  /**
   * Generate beat description with purchase link
   */
  generateBeatDescription(beatName: string, bpm: number, style: string, gumroadUrl: string): string {
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

🛒 Get this beat: ${gumroadUrl}

#lofi #chillbeats #studymusic #lofibeats #chillhop #lofihiphop`;
  }
}

export const gumroadService = GumroadService.getInstance();
