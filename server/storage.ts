// Following javascript_database blueprint
import {
  jobs,
  characterProfiles,
  scenes,
  jobProgressLogs,
  series,
  episodes,
  unityContentPackages,
  apiUsage,
  clipAccuracyReports,
  errorReports,
  type Job,
  type InsertJob,
  type UpdateJob,
  type CharacterProfile,
  type InsertCharacterProfile,
  type Scene,
  type InsertScene,
  type JobProgressLog,
  type InsertJobProgressLog,
  type Series,
  type InsertSeries,
  type UpdateSeries,
  type Episode,
  type InsertEpisode,
  type UpdateEpisode,
  type UnityContentPackage,
  type InsertUnityContentPackage,
  type UpdateUnityContentPackage,
  type ApiUsage,
  type InsertApiUsage,
  type ClipAccuracyReport,
  type InsertClipAccuracyReport,
  type ErrorReport,
  type InsertErrorReport,
} from '@shared/schema';
import { db, pool } from './db';
import { eq, desc, asc, sql, gte, and } from 'drizzle-orm';

export interface IStorage {
  // Jobs
  createJob(job: InsertJob): Promise<Job>;
  getJob(id: string): Promise<Job | undefined>;
  listJobs(): Promise<Job[]>;
  updateJob(id: string, updates: UpdateJob): Promise<Job | undefined>;

  // Character Profiles
  createCharacterProfile(profile: InsertCharacterProfile): Promise<CharacterProfile>;
  getCharacterProfile(id: string): Promise<CharacterProfile | undefined>;
  listCharacterProfiles(): Promise<CharacterProfile[]>;
  updateCharacterProfile(id: string, updates: Partial<InsertCharacterProfile>): Promise<CharacterProfile | undefined>;
  deleteCharacterProfile(id: string): Promise<void>;

  // Scenes
  createScene(scene: InsertScene): Promise<Scene>;
  listScenes(category?: string): Promise<Scene[]>;
  seedScenes(): Promise<void>;
  seedCharacterPriorities(): Promise<void>;

  // Job Progress Logs
  createProgressLog(log: InsertJobProgressLog): Promise<JobProgressLog>;
  getProgressLogs(jobId: string): Promise<JobProgressLog[]>;

  // Series (Story Bible)
  createSeries(seriesData: InsertSeries): Promise<Series>;
  getSeries(id: string): Promise<Series | undefined>;
  listSeries(): Promise<Series[]>;
  updateSeries(id: string, updates: UpdateSeries): Promise<Series | undefined>;
  deleteSeries(id: string): Promise<void>;

  // Episodes
  createEpisode(episode: InsertEpisode): Promise<Episode>;
  getEpisode(id: string): Promise<Episode | undefined>;
  listEpisodes(seriesId: string): Promise<Episode[]>;
  getLatestEpisode(seriesId: string): Promise<Episode | undefined>;
  updateEpisode(id: string, updates: UpdateEpisode): Promise<Episode | undefined>;
  deleteEpisode(id: string): Promise<void>;

  // Unity Content Packages
  createUnityContentPackage(pkg: InsertUnityContentPackage): Promise<UnityContentPackage>;
  getUnityContentPackage(id: string): Promise<UnityContentPackage | undefined>;
  listUnityContentPackages(): Promise<UnityContentPackage[]>;
  updateUnityContentPackage(id: string, updates: UpdateUnityContentPackage): Promise<UnityContentPackage | undefined>;
  deleteUnityContentPackage(id: string): Promise<void>;

  // API Usage Tracking
  logApiUsage(usage: InsertApiUsage): Promise<ApiUsage>;
  getApiUsageStats(period: 'today' | 'month' | 'all'): Promise<{
    totalCost: number;
    byService: Record<string, { count: number; cost: number }>;
    recentUsage: ApiUsage[];
  }>;

  // Advanced Cost Analytics
  getCostsByJob(jobId: string): Promise<{
    totalCost: number;
    byService: Record<string, { count: number; cost: number; successRate: number }>;
    timeline: Array<{ timestamp: Date; operation: string; cost: number; success: boolean }>;
  }>;

  getCostsByService(params: { startDate?: Date; endDate?: Date; service?: string; successOnly?: boolean }): Promise<
    Array<{
      service: string;
      totalCost: number;
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      successRate: number;
      avgCostPerCall: number;
      byModel?: Record<string, { count: number; cost: number }>;
    }>
  >;

  getDailyCostsSummary(params: {
    startDate: Date;
    endDate: Date;
    groupBy?: 'service' | 'model' | 'operation';
  }): Promise<
    Array<{
      date: string;
      totalCost: number;
      totalCalls: number;
      successRate: number;
      breakdown: Record<string, { cost: number; calls: number }>;
    }>
  >;

  // Clip Accuracy Reports
  createClipAccuracyReport(report: InsertClipAccuracyReport): Promise<ClipAccuracyReport>;
  getClipAccuracyReports(jobId: string): Promise<ClipAccuracyReport[]>;
  getClipAccuracyReport(jobId: string, clipIndex: number): Promise<ClipAccuracyReport | undefined>;
  getPreviousClipReport(jobId: string, clipIndex: number): Promise<ClipAccuracyReport | undefined>;

  // Error Reports
  listErrors(filter?: { jobId?: string; severity?: string }): Promise<ErrorReport[]>;
}

export class DatabaseStorage implements IStorage {
  // Jobs
  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db
      .insert(jobs)
      .values([insertJob as any])
      .returning();
    return job;
  }

  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async listJobs(): Promise<Job[]> {
    // TEMPORARY FIX: Use raw SQL to bypass Drizzle ORM issue with estimated_cost column
    // TODO: Investigate why Drizzle can't find estimated_cost column that exists in DB
    const result = await pool.query(`
      SELECT * FROM jobs ORDER BY created_at DESC
    `);
    // Map snake_case column names to camelCase for TypeScript
    return result.rows.map((row: any) => ({
      ...row,
      userId: row.user_id,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      errorMessage: row.error_message,
      scriptName: row.script_name,
      scriptContent: row.script_content,
      aspectRatio: row.aspect_ratio,
      clipDuration: row.clip_duration,
      autoUpload: row.auto_upload,
      videoUrl: row.video_url,
      youtubeVideoId: row.youtube_video_id,
      audioDuration: row.audio_duration,
      audioPath: row.audio_path,
      characterPrompt: row.character_prompt,
      completedClips: row.completed_clips,
      targetClipCount: row.target_clip_count,
      unityPackageId: row.unity_package_id,
      unityMetadata: row.unity_metadata,
    })) as Job[];
  }

  async updateJob(id: string, updates: UpdateJob): Promise<Job | undefined> {
    // Handle progress updates specially to avoid race conditions
    // Allow resets only for retry/requeue scenarios
    const isRetryOrFail = updates.status === 'queued' || updates.status === 'failed';

    // If updating progress during normal operation, use GREATEST to handle out-of-order updates
    let progressUpdate = updates.progress;
    if (updates.progress !== undefined && !isRetryOrFail) {
      // Use GREATEST to always take the maximum value (handles concurrent updates)
      progressUpdate = sql`GREATEST(COALESCE(${jobs.progress}, 0), ${updates.progress})` as any;
    }

    const [job] = await db
      .update(jobs)
      .set({
        ...updates,
        progress: progressUpdate !== undefined ? progressUpdate : updates.progress,
        updatedAt: new Date(),
      } as any)
      .where(eq(jobs.id, id))
      .returning();
    return job || undefined;
  }

  // Character Profiles
  async createCharacterProfile(insertProfile: InsertCharacterProfile): Promise<CharacterProfile> {
    const dbProfile = {
      ...insertProfile,
      priority: insertProfile.priority !== undefined ? String(insertProfile.priority) : undefined,
    };
    const [profile] = await db
      .insert(characterProfiles)
      .values(dbProfile as any)
      .returning();
    return profile;
  }

  async getCharacterProfile(id: string): Promise<CharacterProfile | undefined> {
    const [profile] = await db.select().from(characterProfiles).where(eq(characterProfiles.id, id));
    return profile || undefined;
  }

  async listCharacterProfiles(): Promise<CharacterProfile[]> {
    return await db.select().from(characterProfiles).orderBy(desc(characterProfiles.createdAt));
  }

  async updateCharacterProfile(
    id: string,
    updates: Partial<InsertCharacterProfile>,
  ): Promise<CharacterProfile | undefined> {
    const dbUpdates = {
      ...updates,
      priority: updates.priority !== undefined ? String(updates.priority) : undefined,
    };
    const [profile] = await db
      .update(characterProfiles)
      .set(dbUpdates as any)
      .where(eq(characterProfiles.id, id))
      .returning();
    return profile || undefined;
  }

  async deleteCharacterProfile(id: string): Promise<void> {
    await db.delete(characterProfiles).where(eq(characterProfiles.id, id));
  }

  // Scenes
  async createScene(insertScene: InsertScene): Promise<Scene> {
    const [scene] = await db.insert(scenes).values(insertScene).returning();
    return scene;
  }

  async listScenes(category?: string): Promise<Scene[]> {
    if (category) {
      return await db.select().from(scenes).where(eq(scenes.category, category));
    }
    return await db.select().from(scenes);
  }

  async seedScenes(): Promise<void> {
    // Check if scenes already exist
    const existing = await db.select().from(scenes);
    if (existing.length > 0) {
      return; // Already seeded
    }

    const seedData: InsertScene[] = [
      // Planetary scenes
      {
        name: 'Mercury Surface',
        category: 'planetary',
        description: 'Rusty orange iron oxide surface, extreme heat shimmer, cratered terrain',
        previewUrl: null,
      },
      {
        name: 'Venus Atmosphere',
        category: 'planetary',
        description: 'Thick yellow acid clouds, crushing pressure, lightning storms',
        previewUrl: null,
      },
      {
        name: 'Mars Landscape',
        category: 'planetary',
        description: 'Red dust storm, Olympus Mons in distance, barren rocky terrain',
        previewUrl: null,
      },
      {
        name: "Jupiter's Moons",
        category: 'planetary',
        description: 'Ice-covered Europa surface, Jupiter looming in sky, cryovolcanoes',
        previewUrl: null,
      },
      // Urban scenes
      {
        name: 'Cyberpunk City Night',
        category: 'urban',
        description: 'Rainy cyberpunk alley, neon signs reflecting in puddles, holographic ads',
        previewUrl: null,
      },
      {
        name: 'Modern Metropolis',
        category: 'urban',
        description: 'Gleaming skyscrapers, busy streets, golden hour lighting',
        previewUrl: null,
      },
      {
        name: 'Industrial District',
        category: 'urban',
        description: 'Abandoned factory, rust and decay, dramatic shadows',
        previewUrl: null,
      },
      // Fantasy scenes
      {
        name: 'Medieval Castle',
        category: 'fantasy',
        description: 'Torch-lit stone hallway, fog, dramatic shadows, ancient architecture',
        previewUrl: null,
      },
      {
        name: 'Enchanted Forest',
        category: 'fantasy',
        description: 'Mystical woodland, glowing mushrooms, ethereal mist, magical atmosphere',
        previewUrl: null,
      },
      {
        name: "Dragon's Lair",
        category: 'fantasy',
        description: 'Volcanic cavern, treasure hoard, glowing lava, epic scale',
        previewUrl: null,
      },
      // Custom scenes
      {
        name: 'Neutral Studio',
        category: 'custom',
        description: 'Clean white background, professional lighting, minimal environment',
        previewUrl: null,
      },
      {
        name: 'Deep Space',
        category: 'custom',
        description: 'Star field, nebulae, cosmic wonder, infinite darkness',
        previewUrl: null,
      },
    ];

    await db.insert(scenes).values(seedData);
  }

  async seedCharacterPriorities(): Promise<void> {
    const allCharacters = await db.select().from(characterProfiles);

    const canonicalCharacters = [
      {
        name: 'Ryder the space cowboy',
        refImageUrl:
          'https://684c1cb4-e3e4-44db-bdb8-2a8adf167858-00-3g0p5hocgpk7q.picard.replit.dev/api/character-images/character_1763871819901_uuz3df.jpg',
        basePrompt:
          "Ryder is a rugged space cowboy in his mid-20s, with a lean build, tousled dark hair peeking from under his scorched gray hoodie, and a determined scowl etched on his stubbled face. He's Earth's last line of defense against cosmic threats, armed not with guns but with razor-sharp raps that disrupt alien frequencies. Picture him bounding across alien landscapes like Mercury's rusty craters or Mars' red regolith in low gravity, kicking up dust clouds, his hoodie zipped tight against the vacuum, pants tucked into boots, always ready to drop bars that glitch out invaders like melted radios. He's got that gritty, no-nonsense vibe—part rebel, part poet—fighting invasions one verse at a time, with a mic twisted from enemy antennas as his trophy.",
        priority: '3.0',
        matcher: (name: string) => name.toLowerCase().includes('ryder'),
      },
      {
        name: 'Mercury Alien',
        refImageUrl:
          'https://684c1cb4-e3e4-44db-bdb8-2a8adf167858-00-3g0p5hocgpk7q.picard.replit.dev/api/character-images/character_1763872040162_cdq6i9.jpg',
        basePrompt:
          "The Mercury alien is a towering, molten-forged terror adapted to the planet's blistering extremes, its body a jagged exoskeleton of cooled lava rock infused with glowing crimson fissures that crackle with trapped heat energy. Bulky and imposing, it lurches forward on clawed limbs that melt footprints into the scorched regolith, venting superheated steam with every movement like a living volcano. Its head is a dome of blackened crystal with twin slits for eyes that emit piercing infrared beams, detecting prey through thermal signatures amid the relentless solar glare. Built to endure temperatures that would vaporize metal, its hide is layered in heat-reflective scales etched with circuit-like patterns, allowing it to absorb and weaponize ambient radiation, humming with disruptive frequencies that scramble signals and minds alike—a relentless guardian of Mercury's infernal secrets.",
        priority: '2.0',
        matcher: (name: string) => name.toLowerCase().includes('mercury alien'),
      },
      {
        name: 'Mesmar The King of Mercury',
        refImageUrl:
          'https://684c1cb4-e3e4-44db-bdb8-2a8adf167858-00-3g0p5hocgpk7q.picard.replit.dev/api/character-images/character_1763872141437_5uxh20.jpg',
        basePrompt:
          "the imposing king of its heat-resistant horde, looms as a colossal sovereign sculpted from the planet's searing heart, its massive frame clad in regal, obsidian-black armor veined with crackling golden lava flows that pulse like royal blood. Even taller and more commanding than its subjects, it strides on throne-like legs that quake the baked terrain, sending geysers of molten sparks and ash skyward with every authoritative step. Its crown-like head is adorned with a corona of twisted, glowing spikes that radiate intense heat waves, framing a multi-faceted visor-crown of crimson eyes that pierce through the haze, commanding legions with silent, frequency-based decrees. Forged in Mercury's unforgiving furnace, its hide is a masterpiece of adaptive obsidian scales—impervious to the sun's blaze, etched with ancient runes of conquest—and it wields a scepter of fused antennas, humming with the power to hijack entire planetary signals, ruling as the unchallenged overlord of the cosmic invasion.",
        priority: '1.0',
        matcher: (name: string) => name.toLowerCase().includes('mesmar') || name.toLowerCase().includes('king'),
      },
    ];

    let createdCount = 0;
    let updatedCount = 0;

    for (const canonical of canonicalCharacters) {
      const existing = allCharacters.find((c) => canonical.matcher(c.name));

      if (!existing) {
        await db.insert(characterProfiles).values({
          name: canonical.name,
          refImageUrl: canonical.refImageUrl,
          basePrompt: canonical.basePrompt,
          priority: canonical.priority,
        });
        createdCount++;
        console.log(`   ✅ Created ${canonical.name} (priority ${canonical.priority})`);
      } else if (existing.priority === '1.0') {
        await db
          .update(characterProfiles)
          .set({ priority: canonical.priority })
          .where(eq(characterProfiles.id, existing.id));
        updatedCount++;
        console.log(`   ✅ Updated ${existing.name} priority to ${canonical.priority}`);
      } else {
        console.log(`   ⏭️  Preserved ${existing.name} (priority ${existing.priority}, user-edited)`);
      }
    }

    console.log(
      `✅ Character priorities seeded (created: ${createdCount}, updated: ${updatedCount}, preserved: ${3 - createdCount - updatedCount})`,
    );
  }

  // Job Progress Logs
  async createProgressLog(insertLog: InsertJobProgressLog): Promise<JobProgressLog> {
    const [log] = await db.insert(jobProgressLogs).values(insertLog).returning();
    return log;
  }

  async getProgressLogs(jobId: string): Promise<JobProgressLog[]> {
    return await db
      .select()
      .from(jobProgressLogs)
      .where(eq(jobProgressLogs.jobId, jobId))
      .orderBy(jobProgressLogs.timestamp);
  }

  // Series (Story Bible)
  async createSeries(seriesData: InsertSeries): Promise<Series> {
    const [created] = await db
      .insert(series)
      .values(seriesData as any)
      .returning();
    return created;
  }

  async getSeries(id: string): Promise<Series | undefined> {
    const [found] = await db.select().from(series).where(eq(series.id, id));
    return found || undefined;
  }

  async listSeries(): Promise<Series[]> {
    return await db.select().from(series).orderBy(desc(series.createdAt));
  }

  async updateSeries(id: string, updates: UpdateSeries): Promise<Series | undefined> {
    const [updated] = await db
      .update(series)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(series.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSeries(id: string): Promise<void> {
    await db.delete(episodes).where(eq(episodes.seriesId, id));
    await db.delete(series).where(eq(series.id, id));
  }

  // Episodes
  async createEpisode(episode: InsertEpisode): Promise<Episode> {
    const [created] = await db
      .insert(episodes)
      .values(episode as any)
      .returning();

    await db
      .update(series)
      .set({
        episodeCount: sql`COALESCE(${series.episodeCount}, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(eq(series.id, episode.seriesId));

    return created;
  }

  async getEpisode(id: string): Promise<Episode | undefined> {
    const [found] = await db.select().from(episodes).where(eq(episodes.id, id));
    return found || undefined;
  }

  async listEpisodes(seriesId: string): Promise<Episode[]> {
    return await db.select().from(episodes).where(eq(episodes.seriesId, seriesId)).orderBy(asc(episodes.episodeNumber));
  }

  async getLatestEpisode(seriesId: string): Promise<Episode | undefined> {
    const [latest] = await db
      .select()
      .from(episodes)
      .where(eq(episodes.seriesId, seriesId))
      .orderBy(desc(episodes.episodeNumber))
      .limit(1);
    return latest || undefined;
  }

  async updateEpisode(id: string, updates: UpdateEpisode): Promise<Episode | undefined> {
    const [updated] = await db
      .update(episodes)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(episodes.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteEpisode(id: string): Promise<void> {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, id));
    if (episode) {
      await db.delete(episodes).where(eq(episodes.id, id));
      await db
        .update(series)
        .set({
          episodeCount: sql`GREATEST(COALESCE(${series.episodeCount}, 0) - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(series.id, episode.seriesId));
    }
  }

  // Unity Content Packages
  async createUnityContentPackage(pkg: InsertUnityContentPackage): Promise<UnityContentPackage> {
    const [created] = await db
      .insert(unityContentPackages)
      .values(pkg as any)
      .returning();
    return created;
  }

  async getUnityContentPackage(id: string): Promise<UnityContentPackage | undefined> {
    const [found] = await db.select().from(unityContentPackages).where(eq(unityContentPackages.id, id));
    return found || undefined;
  }

  async listUnityContentPackages(): Promise<UnityContentPackage[]> {
    return await db.select().from(unityContentPackages).orderBy(desc(unityContentPackages.updatedAt));
  }

  async updateUnityContentPackage(
    id: string,
    updates: UpdateUnityContentPackage,
  ): Promise<UnityContentPackage | undefined> {
    const [updated] = await db
      .update(unityContentPackages)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(unityContentPackages.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteUnityContentPackage(id: string): Promise<void> {
    await db.delete(unityContentPackages).where(eq(unityContentPackages.id, id));
  }

  // API Usage Tracking
  async logApiUsage(usage: InsertApiUsage): Promise<ApiUsage> {
    const [created] = await db
      .insert(apiUsage)
      .values(usage as any)
      .returning();
    return created;
  }

  async getApiUsageStats(period: 'today' | 'month' | 'all'): Promise<{
    totalCost: number;
    byService: Record<string, { count: number; cost: number }>;
    recentUsage: ApiUsage[];
  }> {
    let startDate: Date | null = null;

    if (period === 'today') {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      startDate = new Date();
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    }

    // Get all usage records for the period
    let records: ApiUsage[];
    if (startDate) {
      records = await db
        .select()
        .from(apiUsage)
        .where(gte(apiUsage.createdAt, startDate))
        .orderBy(desc(apiUsage.createdAt));
    } else {
      records = await db.select().from(apiUsage).orderBy(desc(apiUsage.createdAt));
    }

    // Calculate totals
    let totalCost = 0;
    const byService: Record<string, { count: number; cost: number }> = {};

    for (const record of records) {
      const cost = parseFloat(record.cost) || 0;
      totalCost += cost;

      if (!byService[record.service]) {
        byService[record.service] = { count: 0, cost: 0 };
      }
      byService[record.service].count++;
      byService[record.service].cost += cost;
    }

    // Get recent usage (last 50)
    const recentUsage = records.slice(0, 50);

    return {
      totalCost,
      byService,
      recentUsage,
    };
  }

  // Clip Accuracy Reports
  async createClipAccuracyReport(report: InsertClipAccuracyReport): Promise<ClipAccuracyReport> {
    const [created] = await db
      .insert(clipAccuracyReports)
      .values([report as any])
      .returning();
    return created;
  }

  async getClipAccuracyReports(jobId: string): Promise<ClipAccuracyReport[]> {
    return await db
      .select()
      .from(clipAccuracyReports)
      .where(eq(clipAccuracyReports.jobId, jobId))
      .orderBy(asc(clipAccuracyReports.clipIndex));
  }

  async getClipAccuracyReport(jobId: string, clipIndex: number): Promise<ClipAccuracyReport | undefined> {
    const [report] = await db
      .select()
      .from(clipAccuracyReports)
      .where(and(eq(clipAccuracyReports.jobId, jobId), eq(clipAccuracyReports.clipIndex, clipIndex)));
    return report || undefined;
  }

  async getPreviousClipReport(jobId: string, clipIndex: number): Promise<ClipAccuracyReport | undefined> {
    if (clipIndex <= 0) return undefined;
    return this.getClipAccuracyReport(jobId, clipIndex - 1);
  }

  // Advanced Cost Analytics
  async getCostsByJob(jobId: string): Promise<{
    totalCost: number;
    byService: Record<string, { count: number; cost: number; successRate: number }>;
    timeline: Array<{ timestamp: Date; operation: string; cost: number; success: boolean }>;
  }> {
    const records = await db.select().from(apiUsage).where(eq(apiUsage.jobId, jobId)).orderBy(asc(apiUsage.createdAt));

    let totalCost = 0;
    const byService: Record<string, { count: number; cost: number; successCount: number; total: number }> = {};
    const timeline: Array<{ timestamp: Date; operation: string; cost: number; success: boolean }> = [];

    for (const record of records) {
      const cost = parseFloat(record.cost) || 0;
      totalCost += cost;

      if (!byService[record.service]) {
        byService[record.service] = { count: 0, cost: 0, successCount: 0, total: 0 };
      }
      byService[record.service].count++;
      byService[record.service].cost += cost;
      byService[record.service].total++;
      if (record.success) {
        byService[record.service].successCount++;
      }

      timeline.push({
        timestamp: record.createdAt,
        operation: record.operation,
        cost,
        success: record.success,
      });
    }

    // Calculate success rates
    const byServiceWithRates: Record<string, { count: number; cost: number; successRate: number }> = {};
    for (const [service, data] of Object.entries(byService)) {
      byServiceWithRates[service] = {
        count: data.count,
        cost: data.cost,
        successRate: data.total > 0 ? data.successCount / data.total : 0,
      };
    }

    return {
      totalCost,
      byService: byServiceWithRates,
      timeline,
    };
  }

  async getCostsByService(params: {
    startDate?: Date;
    endDate?: Date;
    service?: string;
    successOnly?: boolean;
  }): Promise<
    Array<{
      service: string;
      totalCost: number;
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      successRate: number;
      avgCostPerCall: number;
      byModel?: Record<string, { count: number; cost: number }>;
    }>
  > {
    const { startDate, endDate, service: filterService, successOnly = false } = params;

    let query = db.select().from(apiUsage);

    const conditions: any[] = [];
    if (startDate) conditions.push(gte(apiUsage.createdAt, startDate));
    if (endDate) conditions.push(sql`${apiUsage.createdAt} <= ${endDate}`);
    if (filterService) conditions.push(eq(apiUsage.service, filterService));
    if (successOnly) conditions.push(eq(apiUsage.success, true));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const records = await query;

    // Group by service
    const serviceMap: Record<
      string,
      {
        totalCost: number;
        totalCalls: number;
        successfulCalls: number;
        failedCalls: number;
        byModel: Record<string, { count: number; cost: number }>;
      }
    > = {};

    for (const record of records) {
      const cost = parseFloat(record.cost) || 0;

      if (!serviceMap[record.service]) {
        serviceMap[record.service] = {
          totalCost: 0,
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          byModel: {},
        };
      }

      const serviceData = serviceMap[record.service];
      serviceData.totalCost += cost;
      serviceData.totalCalls++;

      if (record.success) {
        serviceData.successfulCalls++;
      } else {
        serviceData.failedCalls++;
      }

      // Track by model
      const model = record.model || 'unknown';
      if (!serviceData.byModel[model]) {
        serviceData.byModel[model] = { count: 0, cost: 0 };
      }
      serviceData.byModel[model].count++;
      serviceData.byModel[model].cost += cost;
    }

    // Convert to array format
    return Object.entries(serviceMap)
      .map(([service, data]) => ({
        service,
        totalCost: data.totalCost,
        totalCalls: data.totalCalls,
        successfulCalls: data.successfulCalls,
        failedCalls: data.failedCalls,
        successRate: data.totalCalls > 0 ? data.successfulCalls / data.totalCalls : 0,
        avgCostPerCall: data.totalCalls > 0 ? data.totalCost / data.totalCalls : 0,
        byModel: data.byModel,
      }))
      .sort((a, b) => b.totalCost - a.totalCost); // Sort by cost descending
  }

  async getDailyCostsSummary(params: {
    startDate: Date;
    endDate: Date;
    groupBy?: 'service' | 'model' | 'operation';
  }): Promise<
    Array<{
      date: string;
      totalCost: number;
      totalCalls: number;
      successRate: number;
      breakdown: Record<string, { cost: number; calls: number }>;
    }>
  > {
    const { startDate, endDate, groupBy = 'service' } = params;

    const records = await db
      .select()
      .from(apiUsage)
      .where(and(gte(apiUsage.createdAt, startDate), sql`${apiUsage.createdAt} <= ${endDate}`))
      .orderBy(asc(apiUsage.createdAt));

    // Group by date
    const dailyMap: Record<
      string,
      {
        totalCost: number;
        totalCalls: number;
        successfulCalls: number;
        breakdown: Record<string, { cost: number; calls: number }>;
      }
    > = {};

    for (const record of records) {
      const date = record.createdAt.toISOString().split('T')[0];
      const cost = parseFloat(record.cost) || 0;

      if (!dailyMap[date]) {
        dailyMap[date] = {
          totalCost: 0,
          totalCalls: 0,
          successfulCalls: 0,
          breakdown: {},
        };
      }

      const dayData = dailyMap[date];
      dayData.totalCost += cost;
      dayData.totalCalls++;

      if (record.success) {
        dayData.successfulCalls++;
      }

      // Group breakdown by specified dimension
      let breakdownKey: string;
      switch (groupBy) {
        case 'model':
          breakdownKey = record.model || 'unknown';
          break;
        case 'operation':
          breakdownKey = record.operation;
          break;
        case 'service':
        default:
          breakdownKey = record.service;
          break;
      }

      if (!dayData.breakdown[breakdownKey]) {
        dayData.breakdown[breakdownKey] = { cost: 0, calls: 0 };
      }
      dayData.breakdown[breakdownKey].cost += cost;
      dayData.breakdown[breakdownKey].calls++;
    }

    // Convert to array format
    return Object.entries(dailyMap)
      .map(([date, data]) => ({
        date,
        totalCost: data.totalCost,
        totalCalls: data.totalCalls,
        successRate: data.totalCalls > 0 ? data.successfulCalls / data.totalCalls : 0,
        breakdown: data.breakdown,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Error Reports
  async listErrors(filter?: { jobId?: string; severity?: string }): Promise<ErrorReport[]> {
    let query = db.select().from(errorReports);

    const conditions = [];
    if (filter?.jobId) {
      conditions.push(sql`context->>'jobId' = ${filter.jobId}`);
    }
    if (filter?.severity) {
      conditions.push(eq(errorReports.severity, filter.severity));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(errorReports.lastSeen));
  }
}

export const storage = new DatabaseStorage();
