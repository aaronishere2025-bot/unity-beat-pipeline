/**
 * BEAT SCHEDULER SERVICE
 *
 * Generates beat/instrumental content for prime-time YouTube uploads.
 * Each genre is generated separately just before its target upload time,
 * and uploads immediately on completion (no delayed upload slots).
 *
 * Schedule (called by pipeline-orchestrator):
 * - 7:50 PM PT → generateLofi()  → uploads ~8 PM PT (students winding down)
 * - 8:50 PM PT → generateTrap()  → uploads ~9 PM PT (hip-hop prime time)
 *
 * Jobs include channelId metadata for proper YouTube channel routing:
 * - lofi  -> ChillBeats4Me  (yt_1774233981331_liq4nibjn)
 * - trap  -> Trap Beats INC (yt_1774234003058_rxyb8zl4g)
 */

import { db } from '../db';
import { jobs } from '@shared/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { systemHealthMonitor } from './system-health-monitor';
import { sendDiscordEmbed } from './alert-service';

const CHILLBEATS_CHANNEL = 'yt_1774233981331_liq4nibjn';
const TRAPBEATS_CHANNEL = 'yt_1774234003058_rxyb8zl4g';

const TRAP_STYLES = [
  'Dark trap, 140 BPM, heavy 808 bass, crispy hi-hats, menacing synths, atmospheric pads, hard-hitting drums',
  'Chill trap, 145 BPM, atmospheric synths, smooth 808s, crispy hi-hats, dreamy pads, lo-fi aesthetic',
  'Aggressive trap, 150 BPM, distorted 808s, rapid hi-hats, dark synths, intense energy, club banger',
  'Melodic trap, 138 BPM, emotional piano, smooth 808s, atmospheric pads, dreamy vibes, modern trap',
  'Vibrant trap, 142 BPM, colorful synths, bouncy 808s, energetic hi-hats, uplifting pads, party vibes',
  'Ambient trap, 135 BPM, ethereal pads, deep 808s, spacey synths, reverb-heavy, atmospheric chill',
  'Hard trap, 155 BPM, aggressive 808s, double-time hi-hats, distorted synths, mosh pit energy',
  'Trap soul, 140 BPM, soulful samples, smooth 808s, emotional chords, introspective vibes',
];

const TRAP_VISUALS = [
  'Bioluminescent banana peel fragments exploding in slow motion, electric purple and neon green energy waves, cyberpunk aesthetic, particles flying, dramatic lighting, futuristic, 4K ultra detailed',
  'Giant neon banana spinning in a dark void surrounded by pulsing trap bass waveforms, glowing magenta and cyan, holographic shards, aggressive energy, 4K cinematic',
  'Nano banana robot mech suit stomping through a neon-lit cyberpunk city at night, glowing yellow exhaust trails, rain reflections, aggressive atmosphere, 8k resolution',
  'Massive golden banana throne in a dark underground bunker, neon purple lasers cutting through fog, trap king aesthetic, cinematic dramatic lighting, 4K detailed',
  'Crystallized nano banana shattering into a thousand glowing pieces against a black backdrop, electric blue and gold sparks, slow motion explosion, futuristic, ultra detailed',
];

const LOFI_VISUALS = [
  'Giant glowing neon banana floating in cosmic space, vibrant yellow and pink neon lights, retro 80s aesthetic, stars twinkling, dreamy atmosphere, slow rotation, 4K detailed, cinematic',
  'Tiny iridescent nano banana resting on a windowsill during a rainy evening, soft warm glow, cozy lo-fi room with plants and vinyl records, gentle rain drops, peaceful atmosphere, 4K',
  'Floating nano banana in a zen garden pond, cherry blossom petals drifting, soft golden hour lighting, koi fish swimming below, meditative tranquil vibes, 4K cinematic',
  'Glowing banana-shaped moon rising over a quiet Japanese city at dusk, pastel purple and orange sky, rooftop view with hanging lanterns, lo-fi chill aesthetic, dreamy 4K',
  'Holographic nano banana rotating slowly inside a snow globe, soft bokeh lights, warm amber tones, cozy study desk background with books and coffee, peaceful looping visual, 4K',
];

const LOFI_STYLES = [
  'lofi hip-hop, chill study beats, 80 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative',
  'lofi jazz, 75 BPM, smooth jazz piano, upright bass, brush drums, vinyl warmth, coffee shop ambiance, sunset vibes',
  'lofi ambient, 70 BPM, ethereal pads, gentle piano, field recordings, nature sounds, meditation music, zen atmosphere',
  'lofi chillhop, 85 BPM, rhodes piano, jazzy bass, dusty drums, record crackle, late night study vibes',
];

class BeatScheduler {
  private isGenerating = false;
  private lastGenerationTime: Date | null = null;

  /**
   * Check if a beat job already exists for today to prevent duplicates.
   * Looks for jobs with matching genre created in the last 20 hours.
   */
  private async hasExistingJobToday(genre: string): Promise<{ exists: boolean; jobId?: number }> {
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
    const existing = await db
      .select({ id: jobs.id, scriptName: jobs.scriptName })
      .from(jobs)
      .where(
        and(
          eq(jobs.mode, 'music'),
          gte(jobs.createdAt, twentyHoursAgo),
          sql`(${jobs.unityMetadata}->>'automationSource') = 'beat-scheduler'`,
          sql`(${jobs.unityMetadata}->>'genre') = ${genre}`,
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return { exists: true, jobId: existing[0].id };
    }
    return { exists: false };
  }

  /**
   * Start the beat scheduler (upload scheduling is handled by scheduled-upload-service).
   * Generation is triggered by pipeline-orchestrator, not an internal cron.
   */
  start(): void {
    console.log('\n🎵 ===== BEAT SCHEDULER READY =====');
    console.log('📅 Lofi (30 min): 7:50 PM PT → uploads ~8 PM PT');
    console.log('📅 Trap (5 min): 8:50 PM PT → uploads ~9 PM PT');
    console.log('📤 All uploads happen immediately on completion');
    console.log('====================================\n');
  }

  /**
   * Stop the beat scheduler
   */
  stop(): void {
    console.log('🛑 Beat scheduler stopped');
  }

  /**
   * Trigger beat generation (called by pipeline-orchestrator or manually)
   */
  async triggerGenerationNow(): Promise<void> {
    if (this.isGenerating) {
      console.log('⚠️  Beat generation already in progress, skipping...');
      return;
    }

    this.isGenerating = true;
    systemHealthMonitor.recordHeartbeat('beat-scheduler');

    const startTime = Date.now();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║      🎵 AUTOMATED DAILY BEAT GENERATION                   ║');
    console.log(`║      ${new Date().toLocaleString().padEnd(53)} ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      const beats = this.selectDailyBeats();

      console.log(`📊 Plan: 1 lofi (~30 min) + 1 trap (5 min) = 2 jobs`);
      console.log(`📺 Channels: lofi → ChillBeats4Me, trap → Trap Beats INC\n`);

      let created = 0;

      for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];

        try {
          // Dedup: skip if this genre already has a job today
          const check = await this.hasExistingJobToday(beat.genre);
          if (check.exists) {
            console.log(`   ⏭️  [${i + 1}/${beats.length}] ${beat.genre.toUpperCase()} already exists today (job ${check.jobId}), skipping`);
            continue;
          }

          const metadata: Record<string, any> = {
            genre: beat.genre,
            channelId: beat.channelId,
            automationSource: 'beat-scheduler',
            musicStyle: beat.style,
          };

          // Lofi needs multi-track config (12 tracks × ~2.5min actual Suno output ≈ 30 min)
          if (beat.genre === 'lofi') {
            metadata.numTracks = 15;
            metadata.trackDuration = 120;
            metadata.customVisualPrompt = LOFI_VISUALS[Math.floor(Math.random() * LOFI_VISUALS.length)];
          }

          const [job] = await db
            .insert(jobs)
            .values({
              scriptName: beat.title,
              scriptContent: `${beat.genre} beat - ${beat.style}`,
              mode: 'music',
              status: 'queued',
              aspectRatio: beat.aspectRatio,
              autoUpload: true,
              audioDuration: beat.targetDuration.toString(),
              metadata: { targetDuration: beat.targetDuration },
              unityMetadata: metadata as any,
            } as any)
            .returning();

          console.log(`   ✅ [${i + 1}/${beats.length}] ${beat.genre.toUpperCase()} job created: ${job.id}`);
          created++;
        } catch (error: any) {
          console.error(`   ❌ [${i + 1}/${beats.length}] Failed to create ${beat.genre} job: ${error.message}`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ Beat generation: ${created}/${beats.length} jobs created in ${duration}s`);
      console.log(`📊 Jobs will be processed by job-worker music pipeline`);

      sendDiscordEmbed({
        title: '🎵 Beat Generation Complete',
        description: `${created}/${beats.length} beat jobs created in ${duration}s — uploading immediately`,
        color: created === beats.length ? 0x00ff00 : 0xffd700,
        fields: [
          { name: 'Lofi (30 min)', value: 'ChillBeats4Me — immediate upload', inline: true },
          { name: 'Trap (5 min)', value: 'Trap Beats INC — immediate upload', inline: true },
        ],
        footer: { text: 'Beat Scheduler (fallback mode)' },
      }).catch(() => {});

      this.lastGenerationTime = new Date();
    } catch (error: any) {
      console.error('❌ Beat generation failed:', error.message);

      sendDiscordEmbed({
        title: '❌ Beat Generation Failed',
        description: error.message?.slice(0, 256) || 'Unknown error',
        color: 0xff0000,
        footer: { text: 'Beat Scheduler' },
      }).catch(() => {});
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Select randomized daily beats (1 lofi + 1 trap)
   */
  private selectDailyBeats() {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const lofiStyle = LOFI_STYLES[Math.floor(Math.random() * LOFI_STYLES.length)];
    const trapStyle = TRAP_STYLES[Math.floor(Math.random() * TRAP_STYLES.length)];
    const lofiVisual = LOFI_VISUALS[Math.floor(Math.random() * LOFI_VISUALS.length)];
    const trapVisual = TRAP_VISUALS[Math.floor(Math.random() * TRAP_VISUALS.length)];

    return [
      {
        genre: 'lofi' as const,
        title: `Lofi Study Vibes - ${today}`,
        style: lofiStyle,
        visual: lofiVisual,
        targetDuration: 1800, // 30 min (12 tracks × ~2.5 min each)
        aspectRatio: '16:9' as const,
        channelId: CHILLBEATS_CHANNEL,
      },
      {
        genre: 'trap' as const,
        title: `Trap Beat - ${today}`,
        style: trapStyle,
        visual: trapVisual,
        targetDuration: 300, // 5 minutes
        aspectRatio: '16:9' as const,
        channelId: TRAPBEATS_CHANNEL,
      },
    ];
  }

  /**
   * Generate a single lofi job (called by pipeline-orchestrator at 7:50 PM PT)
   */
  async generateLofi(): Promise<void> {
    if (this.isGenerating) {
      console.log('⚠️  Beat generation already in progress, skipping lofi...');
      return;
    }

    this.isGenerating = true;
    systemHealthMonitor.recordHeartbeat('beat-scheduler');

    try {
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Dedup: skip if lofi already has a job today
      const check = await this.hasExistingJobToday('lofi');
      if (check.exists) {
        console.log(`⏭️  Lofi job already exists today (job ${check.jobId}), skipping`);
        return;
      }

      const lofiStyle = LOFI_STYLES[Math.floor(Math.random() * LOFI_STYLES.length)];

      console.log(`\n🎵 Generating lofi beat for ${today}...`);

      const [job] = await db
        .insert(jobs)
        .values({
          scriptName: `Lofi Study Vibes - ${today}`,
          scriptContent: `lofi beat - ${lofiStyle}`,
          mode: 'music',
          status: 'queued',
          aspectRatio: '16:9',
          autoUpload: true,
          audioDuration: '1800',
          metadata: { targetDuration: 1800 },
          unityMetadata: {
            genre: 'lofi',
            channelId: CHILLBEATS_CHANNEL,
            automationSource: 'beat-scheduler',
            musicStyle: lofiStyle,
            numTracks: 15,
            trackDuration: 120,
            customVisualPrompt: LOFI_VISUALS[Math.floor(Math.random() * LOFI_VISUALS.length)],
          } as any,
        } as any)
        .returning();

      console.log(`   ✅ Lofi job created: ${job.id} → ChillBeats4Me (uploads immediately)`);

      sendDiscordEmbed({
        title: '🎵 Lofi Generation Started',
        description: `Job ${job.id} — uploads immediately on completion`,
        color: 0x00ff00,
        fields: [{ name: 'Channel', value: 'ChillBeats4Me', inline: true }],
        footer: { text: 'Beat Scheduler' },
      }).catch(() => {});

      this.lastGenerationTime = new Date();
    } catch (error: any) {
      console.error(`❌ Lofi generation failed: ${error.message}`);
      sendDiscordEmbed({
        title: '❌ Lofi Generation Failed',
        description: error.message?.slice(0, 256) || 'Unknown error',
        color: 0xff0000,
        footer: { text: 'Beat Scheduler' },
      }).catch(() => {});
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Generate a single trap beat job (called by pipeline-orchestrator at 8:50/9:50 PM PT)
   */
  async generateTrap(title: string): Promise<void> {
    if (this.isGenerating) {
      console.log('⚠️  Beat generation already in progress, skipping trap...');
      return;
    }

    this.isGenerating = true;
    systemHealthMonitor.recordHeartbeat('beat-scheduler');

    try {
      // Dedup: skip if trap already has a job today
      const check = await this.hasExistingJobToday('trap');
      if (check.exists) {
        console.log(`⏭️  Trap job already exists today (job ${check.jobId}), skipping`);
        return;
      }

      const trapStyle = TRAP_STYLES[Math.floor(Math.random() * TRAP_STYLES.length)];
      const trapVisual = TRAP_VISUALS[Math.floor(Math.random() * TRAP_VISUALS.length)];

      console.log(`\n🎵 Generating trap beat: ${title}...`);

      const [job] = await db
        .insert(jobs)
        .values({
          scriptName: title,
          scriptContent: `trap beat - ${trapStyle}`,
          mode: 'music',
          status: 'queued',
          aspectRatio: '16:9',
          autoUpload: true,
          audioDuration: '300',
          metadata: { targetDuration: 300 },
          unityMetadata: {
            genre: 'trap',
            channelId: TRAPBEATS_CHANNEL,
            automationSource: 'beat-scheduler',
            musicStyle: trapStyle,
            customVisualPrompt: trapVisual,
          } as any,
        } as any)
        .returning();

      console.log(`   ✅ Trap job created: ${job.id} → Trap Beats INC (uploads immediately)`);

      sendDiscordEmbed({
        title: '🎵 Trap Generation Started',
        description: `${title} — Job ${job.id} — uploads immediately`,
        color: 0x00ff00,
        fields: [{ name: 'Channel', value: 'Trap Beats INC', inline: true }],
        footer: { text: 'Beat Scheduler' },
      }).catch(() => {});

      this.lastGenerationTime = new Date();
    } catch (error: any) {
      console.error(`❌ Trap generation failed: ${error.message}`);
      sendDiscordEmbed({
        title: '❌ Trap Generation Failed',
        description: error.message?.slice(0, 256) || 'Unknown error',
        color: 0xff0000,
        footer: { text: 'Beat Scheduler' },
      }).catch(() => {});
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isGenerating: this.isGenerating,
      lastGeneration: this.lastGenerationTime,
    };
  }
}

export const beatScheduler = new BeatScheduler();
