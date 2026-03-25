import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface RumbleUploadResult {
  success: boolean;
  message: string;
  videoId?: string;
  videoUrl?: string;
}

interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
}

export async function generateRumbleMetadata(figure: string, era: string, hook: string): Promise<VideoMetadata> {
  try {
    const sysPrompt = `You are a viral content strategist for Rumble. Generate engaging metadata for historical rap videos.

Rumble audience loves:
- Patriotic/freedom themes
- Anti-establishment narratives
- Underdog stories
- Strong leaders and warriors
- Historical truths "they don't teach in school"

Keep titles punchy and clickable. Descriptions should be engaging and include relevant hashtags.`;

    const userPrompt = `Generate Rumble metadata for a historical rap video about:

Figure/Event: ${figure}
Era: ${era}
Hook: ${hook}

Respond with JSON:
{
  "title": "Catchy title under 100 chars",
  "description": "Engaging description with hashtags (under 5000 chars)",
  "tags": ["tag1", "tag2", "tag3"]
}`;

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
      systemInstruction: sysPrompt,
    });
    const response = await model.generateContent(userPrompt);
    const result = JSON.parse(response.response.text());
    return {
      title: result.title || `${figure} - Historical Rap`,
      description: result.description || `The untold story of ${figure}. #History #Rap`,
      tags: result.tags || ['history', 'rap', 'education'],
    };
  } catch (error: any) {
    console.error('Failed to generate Rumble metadata:', error.message);
    return {
      title: `${figure} - Historical Rap`,
      description: `The untold story of ${figure}. #History #Rap #Education`,
      tags: ['history', 'rap', 'education'],
    };
  }
}

async function uploadToRumbleAPI(
  videoPath: string,
  metadata: VideoMetadata,
  accessToken: string,
  channelId?: string,
): Promise<RumbleUploadResult> {
  if (!fs.existsSync(videoPath)) {
    return {
      success: false,
      message: `Video file not found: ${videoPath}`,
    };
  }

  console.log(`📺 Uploading to Rumble via API...`);
  console.log(`   Video: ${videoPath}`);
  console.log(`   Title: ${metadata.title}`);

  try {
    const fileBuffer = fs.readFileSync(videoPath);
    const fileName = path.basename(videoPath);

    const formData = new FormData();
    formData.append('access_token', accessToken);
    formData.append('title', metadata.title);
    formData.append('description', metadata.description);
    formData.append('license_type', '0');

    if (channelId) {
      formData.append('channel_id', channelId);
    }

    const videoBlob = new Blob([fileBuffer], { type: 'video/mp4' });
    formData.append('video', videoBlob, fileName);

    console.log(`   📤 Sending ${Math.round(fileBuffer.length / 1024 / 1024)}MB to Rumble...`);

    const response = await fetch('https://rumble.com/api/simple-upload.php', {
      method: 'POST',
      body: formData,
    });

    const responseText = await response.text();
    console.log(`   📥 Rumble response status: ${response.status}`);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`   Failed to parse response: ${responseText.substring(0, 200)}`);
      return {
        success: false,
        message: `Invalid response from Rumble: ${responseText.substring(0, 100)}`,
      };
    }

    if (result.success) {
      console.log(`✅ Rumble upload successful!`);
      console.log(`   Video ID: ${result.video_id}`);
      console.log(`   URL: ${result.url_monetized}`);
      return {
        success: true,
        message: 'Video uploaded successfully to Rumble',
        videoId: result.video_id,
        videoUrl: result.url_monetized,
      };
    } else {
      const errorMsg = result.errors
        ? Object.entries(result.errors)
            .map(([k, v]: [string, any]) => `${k}: ${v.message}`)
            .join(', ')
        : 'Unknown error';
      console.error(`❌ Rumble upload failed: ${errorMsg}`);
      return {
        success: false,
        message: `Rumble error: ${errorMsg}`,
      };
    }
  } catch (error: any) {
    console.error('Rumble API error:', error.message);
    return {
      success: false,
      message: `Upload failed: ${error.message}`,
    };
  }
}

class RumbleUploadService {
  private getApiKey(): string | null {
    return process.env.RUMBLE_API_KEY || null;
  }

  private getChannelId(): string | null {
    return process.env.RUMBLE_CHANNEL_ID || null;
  }

  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  getConfig(): { hasApiKey: boolean; channelId?: string } {
    return {
      hasApiKey: !!this.getApiKey(),
      channelId: this.getChannelId() || undefined,
    };
  }

  async getStats(): Promise<any> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { error: 'API key not configured' };
    }

    try {
      const response = await fetch(`https://rumble.com/-livestream-api/get-data?key=${apiKey}`);
      const data = await response.json();
      return data;
    } catch (error: any) {
      return { error: error.message };
    }
  }

  async uploadVideo(
    videoPath: string,
    figure: string,
    era: string,
    hook: string,
  ): Promise<RumbleUploadResult & { metadata?: VideoMetadata }> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      return {
        success: false,
        message:
          'Rumble not configured. Please set RUMBLE_API_KEY secret (contact bd@rumble.com for upload API access).',
      };
    }

    const metadata = await generateRumbleMetadata(figure, era, hook);
    console.log(`📺 Uploading to Rumble: "${metadata.title}"`);

    const result = await uploadToRumbleAPI(videoPath, metadata, apiKey, this.getChannelId() || undefined);

    return {
      ...result,
      metadata,
    };
  }
}

export const rumbleUploadService = new RumbleUploadService();
