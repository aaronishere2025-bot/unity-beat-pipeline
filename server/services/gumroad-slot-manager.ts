import { db } from '../db';
import { gumroadProductSlots } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import axios from 'axios';

interface AssignSlotParams {
  jobId: string;
  beatName: string;
  description: string;
  price: number; // in dollars (e.g. 4.99)
  tags?: string[];
}

class GumroadSlotManager {
  private static instance: GumroadSlotManager;
  private accessToken: string;
  private baseUrl = 'https://api.gumroad.com/v2';

  private constructor() {
    this.accessToken = process.env.GUMROAD_ACCESS_TOKEN || '';
    if (!this.accessToken) {
      console.warn('⚠️  GUMROAD_ACCESS_TOKEN not set - Gumroad features disabled');
    }
  }

  static getInstance(): GumroadSlotManager {
    if (!GumroadSlotManager.instance) {
      GumroadSlotManager.instance = new GumroadSlotManager();
    }
    return GumroadSlotManager.instance;
  }

  isConfigured(): boolean {
    return !!this.accessToken;
  }

  /**
   * Find an available product slot
   */
  async findAvailableSlot() {
    const slots = await db
      .select()
      .from(gumroadProductSlots)
      .where(eq(gumroadProductSlots.status, 'available'))
      .limit(1);

    if (slots.length === 0) {
      throw new Error('No available Gumroad product slots. Please create more slots or free up existing ones.');
    }

    return slots[0];
  }

  /**
   * Assign a beat to an available slot and update Gumroad
   */
  async assignBeatToSlot(params: AssignSlotParams): Promise<{
    slotId: string;
    gumroadProductId: string;
    gumroadUrl: string;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Gumroad not configured - set GUMROAD_ACCESS_TOKEN');
    }

    console.log(`\n💰 Assigning beat to Gumroad slot...`);
    console.log(`   Beat: ${params.beatName}`);
    console.log(`   Price: $${params.price}`);

    // Find available slot
    const slot = await this.findAvailableSlot();
    console.log(`   Found slot #${slot.slotNumber} (Product ID: ${slot.gumroadProductId})`);

    try {
      // Update Gumroad product with beat details
      console.log(`\n📝 Updating Gumroad product...`);

      const formData = new URLSearchParams();
      formData.append('access_token', this.accessToken);
      formData.append('name', params.beatName);
      formData.append('description', params.description);
      formData.append('price', params.price.toString());
      formData.append('published', 'false'); // Keep as draft until file is uploaded

      if (params.tags && params.tags.length > 0) {
        formData.append('tags', params.tags.join(','));
      }

      const response = await axios.put(`${this.baseUrl}/products/${slot.gumroadProductId}`, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.data.success) {
        throw new Error(`Gumroad API error: ${response.data.message || 'Unknown error'}`);
      }

      const product = response.data.product;
      const gumroadUrl = product.short_url || product.url;

      console.log(`   ✅ Product updated: ${gumroadUrl}`);

      // Update slot in database
      await db
        .update(gumroadProductSlots)
        .set({
          status: 'pending_upload',
          assignedJobId: params.jobId,
          assignedAt: new Date(),
          currentBeatName: params.beatName,
          currentPrice: params.price.toString(),
          gumroadUrl: gumroadUrl,
          updatedAt: new Date(),
        })
        .where(eq(gumroadProductSlots.id, slot.id));

      console.log(`   ✅ Slot marked as pending_upload\n`);
      console.log(`   📝 Next step: Upload beat file to Gumroad dashboard`);
      console.log(`   🔗 Product URL: ${gumroadUrl}\n`);

      return {
        slotId: slot.id,
        gumroadProductId: slot.gumroadProductId,
        gumroadUrl: gumroadUrl,
      };
    } catch (error: any) {
      console.error(`   ❌ Failed to assign slot:`, error.message);
      throw error;
    }
  }

  /**
   * Mark a slot as published (after file is uploaded manually)
   */
  async publishSlot(slotId: string): Promise<void> {
    const slot = await db.select().from(gumroadProductSlots).where(eq(gumroadProductSlots.id, slotId)).limit(1);

    if (slot.length === 0) {
      throw new Error(`Slot ${slotId} not found`);
    }

    console.log(`\n🚀 Publishing Gumroad product...`);

    const formData = new URLSearchParams();
    formData.append('access_token', this.accessToken);
    formData.append('published', 'true');

    await axios.put(`${this.baseUrl}/products/${slot[0].gumroadProductId}`, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    await db
      .update(gumroadProductSlots)
      .set({
        status: 'assigned',
        updatedAt: new Date(),
      })
      .where(eq(gumroadProductSlots.id, slotId));

    console.log(`   ✅ Product published!`);
  }

  /**
   * Release a slot back to available (e.g. if beat is deleted)
   */
  async releaseSlot(slotId: string): Promise<void> {
    await db
      .update(gumroadProductSlots)
      .set({
        status: 'available',
        assignedJobId: null,
        assignedAt: null,
        currentBeatName: null,
        currentPrice: null,
        updatedAt: new Date(),
      })
      .where(eq(gumroadProductSlots.id, slotId));

    console.log(`   ✅ Slot released and available for reassignment`);
  }

  /**
   * Get all slots with their status
   */
  async getAllSlots() {
    return await db.select().from(gumroadProductSlots).orderBy(gumroadProductSlots.slotNumber);
  }

  /**
   * Get slot by job ID
   */
  async getSlotByJobId(jobId: string) {
    const slots = await db
      .select()
      .from(gumroadProductSlots)
      .where(eq(gumroadProductSlots.assignedJobId, jobId))
      .limit(1);

    return slots.length > 0 ? slots[0] : null;
  }
}

export const gumroadSlotManager = GumroadSlotManager.getInstance();
