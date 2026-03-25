/**
 * A/B Metadata Scheduler
 *
 * Automatically rotates titles (12h) and thumbnails (24h) to maximize views.
 * Uses Unknown Facts discovery to generate variant titles.
 */

import { youtubeUploadService } from './youtube-upload-service';
import { youtubeMetadataGenerator } from './youtube-metadata-generator';
import { factReconciliationService } from './fact-reconciliation-service';

interface ABVariant {
  videoId: string;
  topic: string;
  titleA: string;
  titleB: string;
  thumbnailPromptA: string;
  thumbnailPromptB: string;
  currentTitle: 'A' | 'B';
  currentThumbnail: 'A' | 'B';
  uploadedAt: Date;
  titleSwitchedAt?: Date;
  thumbnailSwitchedAt?: Date;
  titleAViews?: number;
  titleBViews?: number;
}

class ABMetadataScheduler {
  private variants: Map<string, ABVariant> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  async registerVideo(videoId: string, topic: string, initialTitle: string): Promise<ABVariant> {
    console.log(`\n📊 A/B SCHEDULER: Registering ${videoId} - ${topic}`);

    // Discover unknown facts for variant generation
    const unknownFacts = await factReconciliationService.discoverUnknownFacts(topic);

    // Generate variant B title using a different hook angle
    const variantBInfo = {
      jobName: topic,
      mode: 'kling' as const,
      aspectRatio: '9:16',
      unityMetadata: {
        topic: topic,
        style: 'Documentary',
        vibe: 'Intense',
        battleType: 'Solo Historical Rap',
        hook: unknownFacts.hookAngle,
        story: unknownFacts.allFacts?.[1] || unknownFacts.unknownFact,
      },
    };

    const variantBMetadata = await youtubeMetadataGenerator.generateMetadata(variantBInfo);

    // Generate two different thumbnail prompts
    const thumbnailA = this.generateThumbnailPrompt(topic, 'dramatic', unknownFacts);
    const thumbnailB = this.generateThumbnailPrompt(topic, 'action', unknownFacts);

    const variant: ABVariant = {
      videoId,
      topic,
      titleA: initialTitle,
      titleB: variantBMetadata.title,
      thumbnailPromptA: thumbnailA,
      thumbnailPromptB: thumbnailB,
      currentTitle: 'A',
      currentThumbnail: 'A',
      uploadedAt: new Date(),
    };

    this.variants.set(videoId, variant);

    console.log(`   📝 Title A: ${variant.titleA}`);
    console.log(`   📝 Title B: ${variant.titleB}`);
    console.log(`   ⏰ Title switch in 12 hours, Thumbnail switch in 24 hours`);

    return variant;
  }

  private generateThumbnailPrompt(topic: string, style: 'dramatic' | 'action', facts: any): string {
    const figure = topic.split(' ')[0];

    if (style === 'dramatic') {
      return `Dramatic close-up portrait of ${topic}, intense eyes staring at camera, moody lighting with rim light, historical costume accurate to their era, bold red and gold color scheme, cinematic composition, text space on left side, 1280x720 YouTube thumbnail style, hyper-detailed face, powerful expression`;
    } else {
      return `Epic action scene of ${topic} in their most famous moment, dynamic pose, historical battle or triumph scene, dramatic sky background, period-accurate clothing and weapons, vibrant contrasting colors, bold composition with ${figure} as focal point, 1280x720 thumbnail, cinematic lighting`;
    }
  }

  async checkAndRotate(): Promise<{ rotated: string[] }> {
    const now = new Date();
    const rotated: string[] = [];

    for (const [videoId, variant] of this.variants) {
      const hoursSinceUpload = (now.getTime() - variant.uploadedAt.getTime()) / (1000 * 60 * 60);

      // Title rotation at 12 hours
      if (hoursSinceUpload >= 12 && variant.currentTitle === 'A' && !variant.titleSwitchedAt) {
        console.log(`\n🔄 A/B ROTATION: Switching title for ${videoId}`);
        console.log(`   Old: ${variant.titleA}`);
        console.log(`   New: ${variant.titleB}`);

        try {
          const result = await youtubeUploadService.updateVideoMetadata(videoId, {
            title: variant.titleB,
          });

          if (result.success) {
            variant.currentTitle = 'B';
            variant.titleSwitchedAt = now;
            rotated.push(`${videoId}:title`);
            console.log(`   ✅ Title switched successfully`);
          }
        } catch (err: any) {
          console.error(`   ❌ Title switch failed: ${err.message}`);
        }
      }

      // Thumbnail rotation at 24 hours (requires thumbnail generation first)
      if (hoursSinceUpload >= 24 && variant.currentThumbnail === 'A' && !variant.thumbnailSwitchedAt) {
        console.log(`\n🖼️  A/B ROTATION: Thumbnail switch scheduled for ${videoId}`);
        console.log(`   Prompt B: ${variant.thumbnailPromptB.substring(0, 80)}...`);
        variant.thumbnailSwitchedAt = now;
        variant.currentThumbnail = 'B';
        rotated.push(`${videoId}:thumbnail_prompt_ready`);
      }
    }

    return { rotated };
  }

  startAutoRotation(intervalMinutes: number = 360): void {
    // 6 hours (changed from 30 min for cost protection)
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    console.log(
      `\n⏰ A/B SCHEDULER: Starting auto-rotation check every ${intervalMinutes} minutes (${(intervalMinutes / 60).toFixed(1)} hours)`,
    );

    this.checkInterval = setInterval(
      async () => {
        const result = await this.checkAndRotate();
        if (result.rotated.length > 0) {
          console.log(`   🔄 Rotated: ${result.rotated.join(', ')}`);
        }
      },
      intervalMinutes * 60 * 1000,
    );
  }

  stopAutoRotation(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log(`\n⏹️  A/B SCHEDULER: Auto-rotation stopped`);
    }
  }

  getStatus(): {
    activeVariants: number;
    variants: Array<ABVariant & { hoursSinceUpload: number }>;
    autoRotationActive: boolean;
  } {
    const now = new Date();
    const variantList = Array.from(this.variants.values()).map((v) => ({
      ...v,
      hoursSinceUpload: Math.round(((now.getTime() - v.uploadedAt.getTime()) / (1000 * 60 * 60)) * 10) / 10,
    }));

    return {
      activeVariants: this.variants.size,
      variants: variantList,
      autoRotationActive: this.checkInterval !== null,
    };
  }

  getVariant(videoId: string): ABVariant | undefined {
    return this.variants.get(videoId);
  }

  async forceRotateTitle(videoId: string): Promise<{ success: boolean; newTitle?: string; error?: string }> {
    const variant = this.variants.get(videoId);
    if (!variant) {
      return { success: false, error: 'Video not registered for A/B testing' };
    }

    const newTitle = variant.currentTitle === 'A' ? variant.titleB : variant.titleA;

    try {
      const result = await youtubeUploadService.updateVideoMetadata(videoId, { title: newTitle });

      if (result.success) {
        variant.currentTitle = variant.currentTitle === 'A' ? 'B' : 'A';
        variant.titleSwitchedAt = new Date();
        return { success: true, newTitle };
      }

      return { success: false, error: result.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export const abMetadataScheduler = new ABMetadataScheduler();
