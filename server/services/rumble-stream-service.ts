import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { db } from '../db';
import { rumbleChannels } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface RumbleStreamConfig {
  videoPath: string;
  channelId: number;
  loopDurationMinutes?: number;
  streamTitle?: string;
}

export interface RumbleStreamResult {
  success: boolean;
  channelName?: string;
  streamPid?: number;
  estimatedEndTime?: Date;
  error?: string;
}

export interface RumbleChannel {
  id: number;
  channelName: string;
  streamKey: string;
  niche: string;
  isActive: number;
}

class RumbleStreamService {
  private activeStreams: Map<number, ChildProcess> = new Map();
  private readonly RUMBLE_RTMP_URL = 'rtmp://live.rumble.com/live/';

  async addChannel(channelName: string, streamKey: string, niche: string): Promise<RumbleChannel> {
    const [channel] = await db
      .insert(rumbleChannels)
      .values({
        channelName,
        streamKey,
        niche,
        isActive: 1,
      })
      .returning();

    console.log(`📺 Rumble channel added: ${channelName} (${niche})`);
    return channel;
  }

  async getChannels(): Promise<RumbleChannel[]> {
    return await db.select().from(rumbleChannels).where(eq(rumbleChannels.isActive, 1));
  }

  async getChannelByNiche(niche: string): Promise<RumbleChannel | null> {
    const channels = await db.select().from(rumbleChannels).where(eq(rumbleChannels.niche, niche)).limit(1);
    return channels[0] || null;
  }

  async streamToRumble(config: RumbleStreamConfig): Promise<RumbleStreamResult> {
    const { videoPath, channelId, loopDurationMinutes = 120, streamTitle } = config;

    if (!existsSync(videoPath)) {
      return { success: false, error: `Video file not found: ${videoPath}` };
    }

    const channels = await db.select().from(rumbleChannels).where(eq(rumbleChannels.id, channelId));
    const channel = channels[0];

    if (!channel) {
      return { success: false, error: `Channel not found: ${channelId}` };
    }

    if (this.activeStreams.has(channelId)) {
      return { success: false, error: `Channel ${channel.channelName} already has an active stream` };
    }

    const rtmpUrl = `${this.RUMBLE_RTMP_URL}${channel.streamKey}`;

    const ffmpegArgs = [
      '-re',
      '-stream_loop',
      '-1',
      '-i',
      videoPath,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      '3000k',
      '-maxrate',
      '3000k',
      '-bufsize',
      '6000k',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '50',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-f',
      'flv',
      rtmpUrl,
    ];

    console.log(`🔴 Starting Rumble stream to ${channel.channelName}...`);
    console.log(`   Video: ${videoPath}`);
    console.log(`   Duration: ${loopDurationMinutes} minutes`);
    if (streamTitle) {
      console.log(`   Title: ${streamTitle}`);
    }

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.activeStreams.set(channelId, ffmpegProcess);

    ffmpegProcess.stdout?.on('data', (data) => {
      console.log(`[Rumble ${channel.channelName}] ${data.toString().trim()}`);
    });

    ffmpegProcess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg.includes('frame=') || msg.includes('fps=')) {
        if (Math.random() < 0.01) {
          console.log(`[Rumble ${channel.channelName}] Streaming... ${msg.substring(0, 80)}`);
        }
      }
    });

    ffmpegProcess.on('error', (error) => {
      console.error(`[Rumble ${channel.channelName}] Stream error:`, error.message);
      this.activeStreams.delete(channelId);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`[Rumble ${channel.channelName}] Stream ended with code ${code}`);
      this.activeStreams.delete(channelId);
    });

    const estimatedEndTime = new Date(Date.now() + loopDurationMinutes * 60 * 1000);

    setTimeout(
      () => {
        this.stopStream(channelId);
      },
      loopDurationMinutes * 60 * 1000,
    );

    return {
      success: true,
      channelName: channel.channelName,
      streamPid: ffmpegProcess.pid,
      estimatedEndTime,
    };
  }

  async stopStream(channelId: number): Promise<{ success: boolean; error?: string }> {
    const process = this.activeStreams.get(channelId);

    if (!process) {
      return { success: false, error: 'No active stream for this channel' };
    }

    console.log(`🛑 Stopping Rumble stream for channel ${channelId}...`);
    process.kill('SIGTERM');
    this.activeStreams.delete(channelId);

    return { success: true };
  }

  getActiveStreams(): { channelId: number; pid: number }[] {
    const streams: { channelId: number; pid: number }[] = [];
    this.activeStreams.forEach((process, channelId) => {
      if (process.pid) {
        streams.push({ channelId, pid: process.pid });
      }
    });
    return streams;
  }

  async crossPlatformUpload(
    videoPath: string,
    metadata: { title: string; description: string; niche: string },
    youtubeUploader: (path: string, meta: any) => Promise<any>,
  ): Promise<{ youtube: any; rumble: RumbleStreamResult }> {
    console.log('🌐 Cross-Platform Upload initiated...');

    const ytResult = await youtubeUploader(videoPath, metadata);
    console.log(`   YouTube: ${ytResult.success ? '✅' : '❌'}`);

    const rumbleChannel = await this.getChannelByNiche(metadata.niche);
    let rumbleResult: RumbleStreamResult;

    if (rumbleChannel) {
      rumbleResult = await this.streamToRumble({
        videoPath,
        channelId: rumbleChannel.id,
        loopDurationMinutes: 120,
        streamTitle: metadata.title,
      });
      console.log(`   Rumble: ${rumbleResult.success ? '✅ Streaming' : '❌'}`);
    } else {
      rumbleResult = {
        success: false,
        error: `No Rumble channel configured for niche: ${metadata.niche}`,
      };
      console.log(`   Rumble: ⚠️ No channel for niche "${metadata.niche}"`);
    }

    return { youtube: ytResult, rumble: rumbleResult };
  }
}

export const rumbleStreamService = new RumbleStreamService();
