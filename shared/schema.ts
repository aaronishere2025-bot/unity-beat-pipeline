import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  decimal,
  json,
  serial,
  boolean,
  real,
  customType,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Custom type for pgvector vector(512) columns
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(512)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value === 'string') {
      return value.replace('[', '').replace(']', '').split(',').map(Number);
    }
    return value as unknown as number[];
  },
});

// Jobs table - tracks video generation jobs
export const jobs = pgTable('jobs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  scriptName: text('script_name'), // Optional - not needed for unity_kling mode
  scriptContent: text('script_content'), // Optional - not needed for unity_kling mode
  mode: varchar('mode', { length: 50 }).notNull(), // 'kling', 'consistent', or 'unity_kling'
  aspectRatio: varchar('aspect_ratio', { length: 20 }).notNull().default('9:16'), // '9:16' or '16:9' (default vertical for Kling)
  // Unity Kling metadata - for processing pre-generated prompts from Unity packages
  unityMetadata: json('unity_metadata').$type<{
    packageId: string;
    promptCount: number;
    estimatedCost: number;
    automationSource?: string;
    topic?: string;
    hook?: string;
    viralScore?: number;
    videoEngine?: string;
    includeKaraoke?: boolean;
    karaokeStyle?: string;
    preparingMusic?: boolean;
    enableLipSync?: boolean;
    enableStyleMutation?: boolean;
    styleBandit?: any;
    customVisualPrompt?: string;
    targetBPM?: number;
    usedFreeCredit?: boolean;
    musicStyle?: string;
    enableI2V?: boolean;
    topicId?: string;
    appliedThemeIds?: string[];
    themePerformanceRecorded?: boolean;
  }>(),
  status: varchar('status', { length: 50 }).notNull().default('queued'), // 'preparing', 'queued', 'processing', 'completed', 'failed', 'cancelled'
  progress: integer('progress').notNull().default(0), // 0-100
  sceneId: varchar('scene_id'),
  characterProfileIds: varchar('character_profile_ids').array(), // Multiple character IDs for multi-character videos
  // Kling Reference Images for 100% character consistency (up to 3 images)
  referenceImages: json('reference_images').$type<
    Array<{
      url: string; // Local path or URL to the image
      filename: string; // Original filename
      mimeType: string; // image/jpeg, image/png
    }>
  >(),
  videoUrl: text('video_url'),
  videoPath: text('video_path'), // ✅ Full file system path to generated video
  thumbnailUrl: text('thumbnail_url'),
  thumbnailPath: text('thumbnail_path'), // ✅ Full file system path to generated thumbnail
  musicUrl: text('music_url'),
  musicDescription: text('music_description'),
  musicAnalysis: json('music_analysis').$type<{
    bpm?: number;
    energy?: number[];
    mood?: string;
    structure?: {
      sections: Array<{
        type: string; // e.g., "intro", "verse", "chorus", "bridge", "outro"
        start: number; // Start time in seconds
        end: number; // End time in seconds
      }>;
    };
    beatTimestamps?: number[];
    genre?: string;
    confidence?: number;
    postProcessing?: {
      enableCaptions?: boolean;
      captionStyle?: 'minimal' | 'neon' | 'fire' | 'clean' | 'bold';
      enableLoop?: boolean;
      loopCrossfade?: number;
      bpm?: number;
    };
  }>(),
  audioDuration: decimal('audio_duration', { precision: 10, scale: 2 }), // duration in seconds (e.g., 180.5)
  clipCount: integer('clip_count'), // calculated number of clips needed
  cost: decimal('cost', { precision: 10, scale: 2 }),
  // TEMPORARILY REMOVED - Drizzle ORM issue with these columns (they don't exist in DB)
  // // NEW: Stem-level audio analysis (Demucs separation + per-stem Librosa analysis)
  // stemAnalysis: json('stem_analysis').$type<{
  //   stems?: Record<string, string>; // Paths to stem files (vocals, drums, bass, other)
  //   analysis?: Record<
  //     string,
  //     {
  //       stem_name: string;
  //       duration: number;
  //       tempo: number;
  //       beat_count: number;
  //       beats: number[];
  //       onset_count: number;
  //       onsets: number[];
  //       per_second_features: Array<{
  //         time: number;
  //         energy: number;
  //         brightness: number;
  //         bandwidth: number;
  //         zcr: number;
  //       }>;
  //       overall: {
  //         avg_energy: number;
  //         peak_energy: number;
  //         energy_variance: number;
  //         avg_brightness: number;
  //         avg_bandwidth: number;
  //       };
  //     }
  //   >;
  // }>(),
  // TEMPORARILY REMOVED - Drizzle ORM issue with these columns (they don't exist in DB)
  // estimatedCost: decimal('estimated_cost', { precision: 10, scale: 2 }), // Pre-generation cost estimate
  // budgetLimit: decimal('budget_limit', { precision: 10, scale: 2 }), // Optional budget limit for this job
  // costEstimate: json('cost_estimate').$type<{
  //   breakdown: {
  //     music: number;
  //     videoGeneration: number;
  //     bestOfN: number;
  //     qualityValidation: number;
  //     promptGeneration: number;
  //     audioAnalysis: number;
  //     other: number;
  //     subtotal: number;
  //     buffer: number;
  //     total: number;
  //   };
  //   timestamp: string;
  //   clipCount: number;
  //   estimatedDuration: number;
  // }>(), // Detailed cost breakdown for transparency
  duration: integer('duration'), // in seconds (integer) - FIXED: was real() but DB is integer
  fileSize: integer('file_size'), // in bytes
  errorMessage: text('error_message'),
  generatedDescription: text('generated_description'), // Auto-generated description for uploads
  generatedPrompts: json('generated_prompts').$type<
    Array<{
      clipIndex: number;
      prompt: string;
      energy?: string;
      camera?: string;
    }>
  >(), // Saved prompts for review
  retryCount: integer('retry_count').default(0).notNull(),
  maxRetries: integer('max_retries').default(3).notNull(),
  completedClips: json('completed_clips').$type<
    Array<{
      clipIndex: number;
      videoPath: string;
      characterName: string;
      cost: number;
    }>
  >(),
  ffmpegState: json('ffmpeg_state').$type<{
    phase: 'preprocess' | 'segments' | 'finalize' | null;
    segmentSize: number;
    batchCount: number;
    completedBatches: number[];
    segmentArtifacts: Array<{
      batchId: number;
      path: string;
      startClip: number;
      endClip: number;
      duration: number;
    }>;
    normalizedClipPaths: string[];
    videoNoAudioPath?: string;
    finalVideoPath?: string;
  }>(),
  autoUpload: boolean('auto_upload').default(false).notNull(), // Auto-upload to YouTube when completed
  scheduledTime: timestamp('scheduled_time'), // Scheduled upload time (null = not scheduled)
  uploadedAt: timestamp('uploaded_at'), // When video was uploaded to YouTube
  youtubeVideoId: varchar('youtube_video_id', { length: 50 }), // YouTube video ID after upload
  youtubeChannelConnectionId: varchar('youtube_channel_connection_id', { length: 100 }), // Internal channel ID used for upload (for Thompson Sampling)
  /** @deprecated Gumroad integration removed 2026-01-26. Kept for historical data only. */
  gumroadUrl: text('gumroad_url'), // Gumroad product URL after upload
  /** @deprecated Gumroad integration removed 2026-01-26. Kept for historical data only. */
  gumroadProductId: varchar('gumroad_product_id', { length: 50 }), // Gumroad product ID

  // OnlySocials cross-posting
  onlySocialsEnabled: boolean('only_socials_enabled').default(false), // Auto cross-post when completed
  onlySocialsPostUuid: varchar('only_socials_post_uuid', { length: 100 }), // OnlySocials post UUID
  onlySocialsMediaUuid: varchar('only_socials_media_uuid', { length: 100 }), // OnlySocials media UUID
  onlySocialsPostedAt: timestamp('only_socials_posted_at'), // When cross-post was completed
  onlySocialsPlatforms: json('only_socials_platforms').$type<string[]>(), // Platforms posted to (instagram, tiktok, etc)

  // Multi-tenant support - User ownership
  userId: varchar('user_id', { length: 100 }), // Foreign key to users table (nullable for backward compat)

  // Cost tracking and billing
  actualCostUSD: decimal('actual_cost_usd', { precision: 10, scale: 2 }), // Total API cost for this job
  userChargeUSD: decimal('user_charge_usd', { precision: 10, scale: 2 }), // Amount charged to user
  chargedAt: timestamp('charged_at'), // When payment was processed
  stripeChargeId: varchar('stripe_charge_id', { length: 100 }), // Stripe charge ID or 'FREE_CREDIT'

  // General metadata - flexible JSON for job-specific data
  metadata: json('metadata').$type<{
    musicStyle?: string; // For music mode: 'lofi', 'trap', 'chillhop'
    targetDuration?: number; // For music mode: target duration in seconds
    clipDuration?: number; // For video generation
    longForm?: boolean; // For 30+ minute content
    singleClip?: boolean; // For single-clip looped mode (saves credits)
    dailyBatch?: boolean; // Part of daily automation
    partialGeneration?: boolean; // Partial success in multi-song generation
    requestedSongs?: number; // Number of songs requested
    completedSongs?: number; // Number of songs successfully generated
    failedSongs?: number; // Number of songs that failed
    autoFixAttempted?: boolean; // For error handling
    autoFixStrategy?: string; // Which fix strategy was applied
    autoFixTimestamp?: string; // When auto-fix was applied
    [key: string]: any; // Allow additional properties
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Character profiles table - stores character references for consistent mode
export const characterProfiles = pgTable('character_profiles', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  refImageUrl: text('ref_image_url').notNull(),
  basePrompt: text('base_prompt').notNull(),
  priority: decimal('priority', { precision: 3, scale: 1 }).notNull().default('1.0'), // 3=main, 2=active side, 1=side, 0.5=background
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Scenes table - predefined scene library
export const scenes = pgTable('scenes', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  category: varchar('category', { length: 50 }).notNull(), // 'planetary', 'urban', 'fantasy', 'custom'
  description: text('description').notNull(),
  previewUrl: text('preview_url'),
});

// Job progress logs - detailed progress tracking for troubleshooting
export const jobProgressLogs = pgTable('job_progress_logs', {
  id: serial('id').primaryKey(),
  jobId: varchar('job_id').notNull(), // References jobs.id
  progress: integer('progress').notNull(), // 0-100
  message: text('message').notNull(), // What's happening at this stage
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

// Series table - Story Bible for episodic content
export const series = pgTable('series', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text('title').notNull(),

  // Core Story Elements (Person, Place, Thing)
  protagonist: json('protagonist')
    .$type<{
      name: string;
      description: string;
      traits: string[];
      motivation: string;
      backstory: string;
      characterProfileId?: string; // Links to characterProfiles for visual reference
    }>()
    .notNull(),

  antagonist: json('antagonist').$type<{
    name: string;
    description: string;
    traits: string[];
    motivation: string;
    backstory: string;
    characterProfileId?: string;
  }>(),

  setting: json('setting')
    .$type<{
      name: string;
      description: string;
      locations: Array<{
        name: string;
        description: string;
        visualStyle: string;
      }>;
      era: string;
      atmosphere: string;
    }>()
    .notNull(),

  macguffin: json('macguffin').$type<{
    name: string;
    description: string;
    significance: string;
    visualDescription: string;
  }>(), // The "thing" - object of desire/conflict

  // Story Arc
  storyArc: json('story_arc')
    .$type<{
      premise: string;
      conflict: string;
      stakes: string;
      themes: string[];
      tone: string;
      genre: string;
    }>()
    .notNull(),

  // Supporting Characters
  supportingCharacters: json('supporting_characters').$type<
    Array<{
      name: string;
      role: string;
      description: string;
      relationship: string;
      characterProfileId?: string;
    }>
  >(),

  // Visual Style Guide
  visualStyle: json('visual_style').$type<{
    colorPalette: string[];
    cinematicStyle: string;
    lighting: string;
    moodBoard: string[];
  }>(),

  // Generated Songs - Lyrics and music prompts for episodes
  generatedSongs: json('generated_songs').$type<
    Array<{
      episodeNumber: number;
      episodeTitle: string;
      style: string;
      lyrics: string;
      tags: string[];
      synopsis?: string;
      createdAt: string;
    }>
  >(),

  // Metadata
  episodeCount: integer('episode_count').default(0),
  status: varchar('status', { length: 20 }).default('active'), // 'active', 'completed', 'archived'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Unity Content Packages - Saved work-in-progress rap battle content
export const unityContentPackages = pgTable('unity_content_packages', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  topic: text('topic').notNull(),

  // Full content package data
  packageData: json('package_data')
    .$type<{
      metadata: {
        topic: string;
        generatedAt: string;
        version: string;
        targetPlatform: string;
        visualStyleV2: string;
        setting: string;
        voice: string;
        energy: string;
        mood: string;
        battleMode?: boolean; // Optional battle mode flag
      };
      timing: {
        totalSyllables: number;
        totalBeats: number;
        estimatedDurationSeconds: number;
        formattedDuration: string;
        bpm: number;
        syllablesPerBeat: number;
        sectionsBreakdown: Array<{
          section: string;
          lines: number;
          syllables: number;
          durationSeconds: number;
          clipCount: number;
        }>;
        totalVeoClips: number;
        estimatedVeoCost: number;
        warnings: string[];
        recommendations: string[];
        sections?: Array<any>; // Optional sections array for recalculated timing
      };
      originalTiming?: any; // Optional backup of original timing before recalculation
      audioAnalysis?: any; // Optional audio analysis data
      librosaAnalysis?: any; // Optional Librosa analysis data
      audioTextSummary?: string; // Optional audio text summary
      whisperTranscription?: any; // Optional Whisper transcription data
      audioInfo?: any; // Optional audio metadata
      karaokeSubtitles?: any; // Optional karaoke subtitle data
      audioFilePath?: string; // Optional path to audio file
      audioDuration?: number; // Optional audio duration
      lyrics: {
        raw: string;
        formatted?: string; // Optional formatted lyrics
        sections:
          | Array<{
              type: string;
              content: string;
              narrativeStage?: string;
            }>
          | Record<string, string>; // Support both array and record formats
      };
      sunoStyleTags: {
        genre: string;
        subgenre: string;
        bpm: number;
        vocals: string;
        instruments: string[];
        production: string[];
        mood: string[];
        fullStyleString: string;
        banditStyleId?: string; // Thompson Sampling: which Suno style arm was selected
        isExperimental?: boolean; // Thompson Sampling: was this an experimental style choice?
      };
      characterCast: Array<{
        id: number;
        name?: string;
        age: number;
        gender: string;
        appearance: string;
        wardrobeBase: string;
        role: string;
        vibe: string;
        humanizingDetail?: string;
      }>;
      veoPrompts: Array<{
        clipNumber: number;
        section: string;
        sectionName?: string; // Alternative name for section
        narrativeStage?: string;
        lyricSnippet: string;
        prompt: string;
        duration: number;
        shotType: string;
        visualTechnique?: string;
        fullPrompt?: string;
        characterAction?: { movement?: string; [key: string]: any };
        sceneDetails?: Record<string, any>;
        timestamp?: string;
        timestampStart?: string;
        timestampEnd?: string;
        timestampFormatted?: string;
        visualReferences?: string[];
        actionSource?: string;
        clipCount?: number;
        durationSeconds?: number;
      }>;
      veoPromptsEnhanced?: boolean; // Flag indicating if VEO prompts were enhanced
      battleTheme?: string | null; // Optional battle theme
      isHistoricalContent?: boolean; // Flag for historical content
      deepResearch?: any; // Optional deep research data
    }>()
    .notNull(),

  // Audio file reference (if uploaded)
  audioFileName: text('audio_file_name'),
  audioFileSize: integer('audio_file_size'),
  audioFilePath: text('audio_file_path'), // Server path to uploaded audio

  // Generation status
  status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft', 'preparing', 'generating_audio', 'audio_ready', 'generating', 'completed', 'failed'
  jobId: varchar('job_id'), // References jobs.id when VEO generation starts

  // Suno music generation
  sunoTaskId: varchar('suno_task_id'), // Suno API task ID for tracking
  sunoStatus: varchar('suno_status', { length: 20 }), // 'generating', 'complete', 'failed'
  sunoTracks: json('suno_tracks').$type<
    Array<{
      id: string;
      audioUrl: string;
      imageUrl: string;
      title: string;
      tags: string;
      duration: number;
    }>
  >(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Episodes table - Individual episodes within a series
export const episodes = pgTable('episodes', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  seriesId: varchar('series_id').notNull(), // References series.id
  episodeNumber: integer('episode_number').notNull(),
  title: text('title').notNull(),

  // Episode Type
  episodeType: varchar('episode_type', { length: 20 }).default('music'), // 'music' | 'rap_battle'

  // Episode-specific story
  synopsis: text('synopsis').notNull(),
  plotPoints: json('plot_points').$type<
    Array<{
      order: number;
      description: string;
      scene: string;
      characters: string[];
      emotionalBeat: string;
    }>
  >(),

  // Rap Battle specific data (only for episodeType='rap_battle')
  battleData: json('battle_data').$type<{
    setting: string;
    stakes: string;
    visualTheme?: string;
    hookMoment?: string;
    rounds: Array<{
      roundNumber: number;
      character: string;
      role: 'protagonist' | 'antagonist';
      scene: string;
      voiceTag: string;
      lyrics: string;
      mood: string;
      cameraMovement: string;
    }>;
    sunoStyle: string;
    cleanLyrics: string;
    visualsJson: Array<{
      section: string;
      scene: string;
      mood: string;
      camera: string;
      lighting: string;
      character: string;
    }>;
  }>(),

  // Previous episode context (for continuity)
  previousEpisodeSummary: text('previous_episode_summary'),
  continuityNotes: json('continuity_notes').$type<{
    characterStates: Record<string, string>;
    plotThreads: string[];
    unresolvedConflicts: string[];
  }>(),

  // Music & Audio Analysis
  musicUrl: text('music_url'),
  audioAnalysis: json('audio_analysis').$type<{
    duration: number;
    tempo: number;
    mood: string;
    energy: number;
    sections: Array<{
      type: string;
      start: number;
      end: number;
      energy: number;
      description: string;
    }>;
    lyrics?: string;
    hasVocals: boolean;
  }>(),

  // Generated Scenes
  generatedScenes: json('generated_scenes').$type<
    Array<{
      sceneNumber: number;
      start: number;
      end: number;
      prompt: string;
      cameraWork: string;
      mood: string;
      character?: string;
    }>
  >(),

  // Link to job for video generation
  jobId: varchar('job_id'), // References jobs.id when video is generated

  // Video generation settings
  videoMode: varchar('video_mode', { length: 20 }).default('veo'), // 'veo' or 'consistent'
  aspectRatio: varchar('aspect_ratio', { length: 10 }).default('9:16'), // '16:9' or '9:16' - default vertical for social media

  // Status
  status: varchar('status', { length: 20 }).default('draft'), // 'draft', 'scripted', 'generating', 'completed'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Zod schemas for validation
export const insertJobSchema = createInsertSchema(jobs)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    status: true,
    progress: true,
    videoUrl: true,
    thumbnailUrl: true,
    cost: true,
    duration: true,
    fileSize: true,
    errorMessage: true,
    clipCount: true,
    retryCount: true,
    maxRetries: true,
  })
  .extend({
    mode: z.enum(['kling', 'veo', 'consistent', 'unity_kling', 'music']),
    aspectRatio: z.enum(['16:9', '9:16']).default('9:16'),
    scriptName: z.string().min(1, 'Script name is required'),
    scriptContent: z.string().min(10, 'Script must be at least 10 characters'),
    sceneId: z.string().optional(),
    characterProfileIds: z.array(z.string()).optional(),
    musicUrl: z.string().optional(),
    musicDescription: z.string().optional(),
    audioDuration: z
      .union([z.string(), z.number()])
      .transform((val) => String(val))
      .optional(), // Accept both string and number, convert to string
    musicAnalysis: z
      .object({
        bpm: z.number().optional(),
        energy: z.array(z.number()).optional(),
        mood: z.string().optional(),
        structure: z
          .object({
            sections: z.array(
              z.object({
                type: z.string(), // e.g., "intro", "verse", "chorus", "bridge", "outro"
                start: z.number(), // Start time in seconds
                end: z.number(), // End time in seconds
              }),
            ),
          })
          .optional(),
        beatTimestamps: z.array(z.number()).optional(),
        genre: z.string().optional(),
        confidence: z.number().optional(),
        postProcessing: z
          .object({
            enableCaptions: z.boolean().optional(),
            captionStyle: z.enum(['minimal', 'neon', 'fire', 'clean', 'bold']).optional(),
            enableLoop: z.boolean().optional(),
            loopCrossfade: z.number().optional(),
            bpm: z.number().optional(),
          })
          .nullable()
          .optional(),
      })
      .optional(),
    // VEO 3.1 Reference Images for character consistency
    referenceImages: z
      .array(
        z.object({
          url: z.string(),
          filename: z.string(),
          mimeType: z.string(),
        }),
      )
      .optional(),
  });

export const updateJobSchema = z.object({
  status: z.enum(['preparing', 'queued', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  progress: z.number().min(0).max(100).optional(),
  videoUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  musicDescription: z.string().optional(),
  completedClips: z
    .array(
      z.object({
        clipIndex: z.number(),
        videoPath: z.string(),
        characterName: z.string(),
        cost: z.number(),
      }),
    )
    .optional(),
  ffmpegState: z
    .object({
      phase: z.enum(['preprocess', 'segments', 'finalize']).nullable().optional(),
      segmentSize: z.number().optional(),
      batchCount: z.number().optional(),
      completedBatches: z.array(z.number()).optional(),
      segmentArtifacts: z
        .array(
          z.object({
            batchId: z.number(),
            path: z.string(),
            startClip: z.number(),
            endClip: z.number(),
            duration: z.number(),
          }),
        )
        .optional(),
      normalizedClipPaths: z.array(z.string()).optional(),
      videoNoAudioPath: z.string().optional(),
      finalVideoPath: z.string().optional(),
    })
    .optional(),
  musicAnalysis: z
    .object({
      bpm: z.number().optional(),
      energy: z.array(z.number()).optional(),
      mood: z.string().optional(),
      structure: z
        .object({
          sections: z.array(
            z.object({
              type: z.string(), // e.g., "intro", "verse", "chorus", "bridge", "outro"
              start: z.number(), // Start time in seconds
              end: z.number(), // End time in seconds
            }),
          ),
        })
        .optional(),
      beatTimestamps: z.array(z.number()).optional(),
      genre: z.string().optional(),
      confidence: z.number().optional(),
      postProcessing: z
        .object({
          enableCaptions: z.boolean().optional(),
          captionStyle: z.enum(['minimal', 'neon', 'fire', 'clean', 'bold']).optional(),
          enableLoop: z.boolean().optional(),
          loopCrossfade: z.number().optional(),
          bpm: z.number().optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
  audioDuration: z.string().optional(),
  clipCount: z.number().optional(),
  cost: z.string().optional(),
  duration: z.number().optional(),
  fileSize: z.number().optional(),
  errorMessage: z.string().optional(),
  generatedDescription: z.string().optional(),
  retryCount: z.number().optional(),
  maxRetries: z.number().optional(),
  musicUrl: z.string().optional(),
});

export const insertCharacterProfileSchema = createInsertSchema(characterProfiles)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    name: z.string().min(1, 'Character name is required'),
    refImageUrl: z.string().url('Must be a valid URL'),
    basePrompt: z.string().min(10, 'Base prompt must be at least 10 characters'),
    priority: z
      .union([z.string(), z.number()])
      .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
      .refine((val) => [3, 2, 1, 0.5].includes(val), {
        message: 'Priority must be 3 (main), 2 (active side), 1 (side), or 0.5 (background)',
      })
      .optional()
      .default(1.0),
  });

export const updateCharacterProfileSchema = z.object({
  name: z.string().min(1, 'Character name is required').optional(),
  refImageUrl: z.string().url('Must be a valid URL').optional(),
  basePrompt: z.string().min(10, 'Base prompt must be at least 10 characters').optional(),
  priority: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .refine((val) => [3, 2, 1, 0.5].includes(val), {
      message: 'Priority must be 3 (main), 2 (active side), 1 (side), or 0.5 (background)',
    })
    .optional(),
});

export const insertSceneSchema = createInsertSchema(scenes)
  .omit({
    id: true,
  })
  .extend({
    category: z.enum(['planetary', 'urban', 'fantasy', 'custom']),
  });

export const insertJobProgressLogSchema = createInsertSchema(jobProgressLogs)
  .omit({
    id: true,
    timestamp: true,
  })
  .extend({
    jobId: z.string().min(1, 'Job ID is required'),
    progress: z.number().min(0).max(100),
    message: z.string().min(1, 'Message is required'),
  });

// Series schema - Story Bible validation
const protagonistSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(10),
  traits: z.array(z.string()),
  motivation: z.string(),
  backstory: z.string(),
  characterProfileId: z.string().optional(),
});

const antagonistSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(10),
  traits: z.array(z.string()),
  motivation: z.string(),
  backstory: z.string(),
  characterProfileId: z.string().optional(),
});

const settingSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(10),
  locations: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      visualStyle: z.string(),
    }),
  ),
  era: z.string(),
  atmosphere: z.string(),
});

const macguffinSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  significance: z.string(),
  visualDescription: z.string(),
});

const storyArcSchema = z.object({
  premise: z.string().min(10),
  conflict: z.string(),
  stakes: z.string(),
  themes: z.array(z.string()),
  tone: z.string(),
  genre: z.string(),
});

const supportingCharacterSchema = z.object({
  name: z.string(),
  role: z.string(),
  description: z.string(),
  relationship: z.string(),
  characterProfileId: z.string().optional(),
});

const visualStyleSchema = z.object({
  colorPalette: z.array(z.string()),
  cinematicStyle: z.string(),
  lighting: z.string(),
  moodBoard: z.array(z.string()),
});

export const insertSeriesSchema = createInsertSchema(series)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    episodeCount: true,
  })
  .extend({
    title: z.string().min(1, 'Series title is required'),
    protagonist: protagonistSchema,
    antagonist: antagonistSchema.optional(),
    setting: settingSchema,
    macguffin: macguffinSchema.optional(),
    storyArc: storyArcSchema,
    supportingCharacters: z.array(supportingCharacterSchema).optional(),
    visualStyle: visualStyleSchema.optional(),
    status: z.enum(['active', 'completed', 'archived']).optional(),
  });

const generatedSongSchema = z.object({
  episodeNumber: z.number(),
  episodeTitle: z.string(),
  style: z.string(),
  lyrics: z.string(),
  tags: z.array(z.string()),
  synopsis: z.string().optional(),
  createdAt: z.string(),
});

export const updateSeriesSchema = z.object({
  title: z.string().min(1).optional(),
  protagonist: protagonistSchema.optional(),
  antagonist: antagonistSchema.optional(),
  setting: settingSchema.optional(),
  macguffin: macguffinSchema.optional(),
  storyArc: storyArcSchema.optional(),
  supportingCharacters: z.array(supportingCharacterSchema).optional(),
  visualStyle: visualStyleSchema.optional(),
  generatedSongs: z.array(generatedSongSchema).optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  episodeCount: z.number().optional(),
});

// Episode schema validation
const plotPointSchema = z.object({
  order: z.number(),
  description: z.string(),
  scene: z.string(),
  characters: z.array(z.string()),
  emotionalBeat: z.string(),
});

const continuityNotesSchema = z.object({
  characterStates: z.record(z.string()),
  plotThreads: z.array(z.string()),
  unresolvedConflicts: z.array(z.string()),
});

const audioAnalysisSchema = z.object({
  duration: z.number(),
  tempo: z.number(),
  mood: z.string(),
  energy: z.number(),
  sections: z.array(
    z.object({
      type: z.string(),
      start: z.number(),
      end: z.number(),
      energy: z.number(),
      description: z.string(),
    }),
  ),
  lyrics: z.string().optional(),
  hasVocals: z.boolean(),
});

const generatedSceneSchema = z.object({
  sceneNumber: z.number(),
  start: z.number(),
  end: z.number(),
  prompt: z.string(),
  cameraWork: z.string(),
  mood: z.string(),
  character: z.string().optional(),
});

export const insertEpisodeSchema = createInsertSchema(episodes)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    seriesId: z.string().min(1, 'Series ID is required'),
    episodeNumber: z.number().min(1),
    title: z.string().min(1, 'Episode title is required'),
    synopsis: z.string().min(10, 'Synopsis is required'),
    plotPoints: z.array(plotPointSchema).optional(),
    previousEpisodeSummary: z.string().optional(),
    continuityNotes: continuityNotesSchema.optional(),
    musicUrl: z.string().optional(),
    audioAnalysis: audioAnalysisSchema.optional(),
    generatedScenes: z.array(generatedSceneSchema).optional(),
    jobId: z.string().optional(),
    status: z.enum(['draft', 'scripted', 'generating', 'completed']).optional(),
  });

export const updateEpisodeSchema = z.object({
  title: z.string().min(1).optional(),
  synopsis: z.string().min(10).optional(),
  plotPoints: z.array(plotPointSchema).optional(),
  previousEpisodeSummary: z.string().optional(),
  continuityNotes: continuityNotesSchema.optional(),
  musicUrl: z.string().optional(),
  audioAnalysis: audioAnalysisSchema.optional(),
  generatedScenes: z.array(generatedSceneSchema).optional(),
  jobId: z.string().optional(),
  status: z.enum(['draft', 'scripted', 'generating', 'completed']).optional(),
});

// Unity Content Package schema validation
const unityPackageDataSchema = z.object({
  metadata: z.object({
    topic: z.string(),
    generatedAt: z.string(),
    version: z.string(),
    targetPlatform: z.string(),
    visualStyleV2: z.string(),
    setting: z.string(),
    voice: z.string(),
    energy: z.string(),
    mood: z.string(),
  }),
  timing: z.object({
    totalSyllables: z.number(),
    totalBeats: z.number(),
    estimatedDurationSeconds: z.number(),
    formattedDuration: z.string(),
    bpm: z.number(),
    syllablesPerBeat: z.number(),
    sectionsBreakdown: z.array(
      z.object({
        section: z.string(),
        lines: z.number(),
        syllables: z.number(),
        durationSeconds: z.number(),
        clipCount: z.number(),
      }),
    ),
    totalVeoClips: z.number(),
    estimatedVeoCost: z.number(),
    warnings: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
  lyrics: z.object({
    raw: z.string(),
    sections: z.union([
      z.array(
        z.object({
          type: z.string(),
          content: z.string(),
          narrativeStage: z.string().optional(),
        }),
      ),
      z.record(z.string(), z.string()),
    ]),
  }),
  sunoStyleTags: z.object({
    genre: z.string(),
    subgenre: z.string(),
    bpm: z.number(),
    vocals: z.string(),
    instruments: z.array(z.string()),
    production: z.array(z.string()),
    mood: z.array(z.string()),
    fullStyleString: z.string(),
  }),
  characterCast: z.array(
    z.object({
      id: z.number(),
      name: z.string().optional(),
      age: z.number(),
      gender: z.string(),
      appearance: z.string(),
      wardrobeBase: z.string(),
      role: z.string(),
      vibe: z.string(),
      humanizingDetail: z.string().optional(),
    }),
  ),
  veoPrompts: z.array(
    z.object({
      clipNumber: z.number(),
      section: z.string(),
      narrativeStage: z.string().optional(),
      lyricSnippet: z.string(),
      prompt: z.string(),
      duration: z.number(),
      shotType: z.string(),
      visualTechnique: z.string().optional(),
    }),
  ),
});

export const insertUnityContentPackageSchema = createInsertSchema(unityContentPackages)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().min(1, 'Title is required'),
    topic: z.string().min(1, 'Topic is required'),
    packageData: unityPackageDataSchema,
    audioFileName: z.string().optional(),
    audioFileSize: z.number().optional(),
    audioFilePath: z.string().optional(),
    status: z
      .enum(['draft', 'preparing', 'generating_audio', 'audio_ready', 'generating', 'completed', 'failed'])
      .optional(),
    jobId: z.string().optional(),
    sunoTaskId: z.string().optional(),
    sunoStatus: z.enum(['generating', 'complete', 'failed']).optional(),
    sunoTracks: z
      .array(
        z.object({
          id: z.string(),
          audioUrl: z.string(),
          imageUrl: z.string(),
          title: z.string(),
          tags: z.string(),
          duration: z.number(),
        }),
      )
      .optional(),
  });

export const updateUnityContentPackageSchema = z.object({
  title: z.string().min(1).optional(),
  topic: z.string().optional(),
  packageData: unityPackageDataSchema.optional(),
  audioFileName: z.string().nullable().optional(),
  audioFileSize: z.number().nullable().optional(),
  audioFilePath: z.string().nullable().optional(),
  status: z.enum(['draft', 'preparing', 'audio_ready', 'generating', 'completed', 'failed']).optional(),
  jobId: z.string().nullable().optional(),
  sunoTaskId: z.string().nullable().optional(),
  sunoStatus: z.enum(['generating', 'complete', 'failed']).nullable().optional(),
  sunoTracks: z
    .array(
      z.object({
        id: z.string(),
        audioUrl: z.string(),
        imageUrl: z.string(),
        title: z.string(),
        tags: z.string(),
        duration: z.number(),
      }),
    )
    .nullable()
    .optional(),
});

// API Usage Tracking - tracks all API calls and costs
export const apiUsage = pgTable(
  'api_usage',
  {
    id: serial('id').primaryKey(),
    service: varchar('service', { length: 50 }).notNull(), // 'openai', 'gemini', 'claude', 'kling', 'suno', 'youtube'
    operation: varchar('operation', { length: 100 }).notNull(), // 'generate_video', 'analyze_script', etc.
    model: varchar('model', { length: 100 }), // e.g., 'gpt-4o', 'claude-sonnet-4', 'gemini-2.0-flash'
    cost: decimal('cost', { precision: 10, scale: 4 }).notNull(), // Actual cost in USD
    estimatedCost: decimal('estimated_cost', { precision: 10, scale: 4 }), // Pre-execution estimate
    durationSeconds: decimal('duration_seconds', { precision: 10, scale: 2 }), // For video clips
    tokens: integer('tokens'), // For OpenAI/Claude/Gemini calls
    inputTokens: integer('input_tokens'), // For LLM calls
    outputTokens: integer('output_tokens'), // For LLM calls
    success: boolean('success').notNull().default(true), // Whether the API call succeeded
    errorMessage: text('error_message'), // Error message if failed
    jobId: varchar('job_id'), // Optional link to job
    userId: varchar('user_id', { length: 100 }), // Optional link to user (for cost tracking)
    metadata: json('metadata').$type<{
      clipIndex?: number;
      promptLength?: number;
      aspectRatio?: string;
      retryCount?: number;
      responseTimeMs?: number;
      [key: string]: any;
    }>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    jobIdIdx: index('api_usage_job_id_idx').on(table.jobId),
    createdAtIdx: index('api_usage_created_at_idx').on(table.createdAt),
    serviceIdx: index('api_usage_service_idx').on(table.service),
    successIdx: index('api_usage_success_idx').on(table.success),
  }),
);

export const insertApiUsageSchema = createInsertSchema(apiUsage).omit({
  id: true,
  createdAt: true,
});

// TypeScript types
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;
export type UpdateJob = z.infer<typeof updateJobSchema>;

export type InsertCharacterProfile = z.infer<typeof insertCharacterProfileSchema>;
export type UpdateCharacterProfile = z.infer<typeof updateCharacterProfileSchema>;
export type CharacterProfile = typeof characterProfiles.$inferSelect;

export type InsertScene = z.infer<typeof insertSceneSchema>;
export type Scene = typeof scenes.$inferSelect;

export type InsertJobProgressLog = z.infer<typeof insertJobProgressLogSchema>;
export type JobProgressLog = typeof jobProgressLogs.$inferSelect;

export type InsertSeries = z.infer<typeof insertSeriesSchema>;
export type UpdateSeries = z.infer<typeof updateSeriesSchema>;
export type Series = typeof series.$inferSelect;

export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type UpdateEpisode = z.infer<typeof updateEpisodeSchema>;
export type Episode = typeof episodes.$inferSelect;

export type InsertUnityContentPackage = z.infer<typeof insertUnityContentPackageSchema>;
export type UpdateUnityContentPackage = z.infer<typeof updateUnityContentPackageSchema>;
export type UnityContentPackage = typeof unityContentPackages.$inferSelect;

export type InsertApiUsage = z.infer<typeof insertApiUsageSchema>;
export type ApiUsage = typeof apiUsage.$inferSelect;

// Video Performance History - tracks YouTube analytics over time for trend analysis
export const videoPerformanceHistory = pgTable('video_performance_history', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id', { length: 20 }).notNull(), // YouTube video ID
  title: text('title').notNull(),
  viewCount: integer('view_count').notNull().default(0),
  likeCount: integer('like_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  estimatedMinutesWatched: decimal('estimated_minutes_watched', { precision: 10, scale: 2 }),
  averageViewDuration: decimal('average_view_duration', { precision: 10, scale: 2 }),
  subscribersGained: integer('subscribers_gained').default(0),
  shares: integer('shares').default(0),
  engagementRate: decimal('engagement_rate', { precision: 5, scale: 2 }),
  performanceTier: varchar('performance_tier', { length: 20 }), // 'viral', 'high', 'medium', 'low', 'new'
  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
});

export const insertVideoPerformanceHistorySchema = createInsertSchema(videoPerformanceHistory).omit({
  id: true,
  recordedAt: true,
});

// Analytics Insights - stores AI-generated insights from video performance
export const analyticsInsights = pgTable('analytics_insights', {
  id: serial('id').primaryKey(),
  insightType: varchar('insight_type', { length: 50 }).notNull(), // 'pattern', 'recommendation', 'prompt_enhancement'
  content: text('content').notNull(),
  confidence: decimal('confidence', { precision: 3, scale: 2 }), // 0.00 to 1.00
  sourceVideoIds: text('source_video_ids').array(), // Videos that contributed to this insight
  metadata: json('metadata').$type<{
    category?: string;
    priority?: number;
    appliedCount?: number;
    [key: string]: any;
  }>(),
  isActive: integer('is_active').notNull().default(1), // 1 = active, 0 = deprecated
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'), // When insight should be refreshed
});

export const insertAnalyticsInsightsSchema = createInsertSchema(analyticsInsights).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoPerformanceHistory = z.infer<typeof insertVideoPerformanceHistorySchema>;
export type VideoPerformanceHistory = typeof videoPerformanceHistory.$inferSelect;

export type InsertAnalyticsInsights = z.infer<typeof insertAnalyticsInsightsSchema>;
export type AnalyticsInsights = typeof analyticsInsights.$inferSelect;

// Aggregated Performance - weekly/monthly rollups for long-term AI training
export const aggregatedPerformance = pgTable('aggregated_performance', {
  id: serial('id').primaryKey(),
  periodType: varchar('period_type', { length: 10 }).notNull(), // 'weekly', 'monthly'
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),

  // Aggregated metrics
  totalVideos: integer('total_videos').notNull().default(0),
  totalViews: integer('total_views').notNull().default(0),
  totalLikes: integer('total_likes').notNull().default(0),
  totalComments: integer('total_comments').notNull().default(0),
  avgEngagementRate: decimal('avg_engagement_rate', { precision: 5, scale: 2 }),

  // Performance distribution
  viralCount: integer('viral_count').default(0),
  highCount: integer('high_count').default(0),
  mediumCount: integer('medium_count').default(0),
  lowCount: integer('low_count').default(0),

  // Top performing patterns (stored as JSON for flexibility)
  topPatterns: json('top_patterns').$type<{
    bestTitles: string[];
    bestTopics: string[];
    avgViewsPerVideo: number;
    peakDays: string[];
  }>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertAggregatedPerformanceSchema = createInsertSchema(aggregatedPerformance).omit({
  id: true,
  createdAt: true,
});

export type InsertAggregatedPerformance = z.infer<typeof insertAggregatedPerformanceSchema>;
export type AggregatedPerformance = typeof aggregatedPerformance.$inferSelect;

// Video Theme Applications - Full audit trail for theme tracking
export const videoThemeApplications = pgTable('video_theme_applications', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id').notNull(), // YouTube video ID
  packageId: varchar('package_id'), // Unity content package ID
  appliedAt: timestamp('applied_at').notNull().defaultNow(),

  // Themes that were ACTIVE when this video was generated
  appliedThemes: json('applied_themes').$type<
    Array<{
      themeId: string;
      themeName: string;
      category: 'proven' | 'neutral' | 'emerging' | 'failing';
      successRate: number;
      whyItWorks: string;
      wasInHoldout: boolean; // A/B test - was this in the control group?
    }>
  >(),

  // After performance data comes in - did this video help themes?
  themeContributions: json('theme_contributions').$type<
    Array<{
      themeId: string;
      themeName: string;
      contributionType: 'positive' | 'negative'; // Did this video help or hurt the theme?
      viewsContributed: number;
      engagementContributed: number;
    }>
  >(),

  // Performance snapshot at time of recording
  performanceSnapshot: json('performance_snapshot').$type<{
    views: number;
    likes: number;
    comments: number;
    engagementRate: number;
    performanceTier: 'viral' | 'high' | 'medium' | 'low' | 'new';
    recordedAt: string;
  }>(),
});

export const insertVideoThemeApplicationsSchema = createInsertSchema(videoThemeApplications).omit({
  id: true,
  appliedAt: true,
});

export type InsertVideoThemeApplications = z.infer<typeof insertVideoThemeApplicationsSchema>;
export type VideoThemeApplications = typeof videoThemeApplications.$inferSelect;

// Detailed Video Metrics - CTR, impressions, watch time, retention data from YouTube Analytics API
export const detailedVideoMetrics = pgTable('detailed_video_metrics', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id', { length: 20 }).notNull().unique(), // YouTube video ID
  title: text('title').notNull(),
  publishedAt: timestamp('published_at').notNull(),

  // Basic metrics
  viewCount: integer('view_count').notNull().default(0),
  likeCount: integer('like_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),

  // Advanced YouTube Analytics API metrics
  impressions: integer('impressions').default(0),
  clickThroughRate: decimal('click_through_rate', { precision: 5, scale: 2 }), // CTR as percentage
  estimatedMinutesWatched: decimal('estimated_minutes_watched', { precision: 12, scale: 2 }),
  averageViewDurationSeconds: decimal('average_view_duration_seconds', { precision: 10, scale: 2 }),
  averageViewPercentage: decimal('average_view_percentage', { precision: 5, scale: 2 }), // AVP %

  // Retention data
  first60SecondsRetention: decimal('first_60_seconds_retention', { precision: 5, scale: 2 }),
  retentionDropPoints: json('retention_drop_points').$type<
    Array<{
      second: number;
      dropPercentage: number;
    }>
  >(),

  // Subscriber and share impact
  subscribersGained: integer('subscribers_gained').default(0),
  subscribersLost: integer('subscribers_lost').default(0),
  shares: integer('shares').default(0),

  // Traffic sources
  trafficSources: json('traffic_sources').$type<{
    browse: number;
    search: number;
    suggested: number;
    external: number;
    direct: number;
    notifications: number;
    playlists: number;
  }>(),

  // Search terms that led to this video
  searchTerms: json('search_terms').$type<
    Array<{
      term: string;
      views: number;
      percentage: number;
    }>
  >(),

  // Performance classification
  performanceTier: varchar('performance_tier', { length: 20 }), // 'viral', 'high', 'medium', 'low', 'new'
  engagementRate: decimal('engagement_rate', { precision: 5, scale: 2 }),

  // Harvesting metadata
  lastHarvestedAt: timestamp('last_harvested_at').notNull().defaultNow(),
  harvestCount: integer('harvest_count').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertDetailedVideoMetricsSchema = createInsertSchema(detailedVideoMetrics).omit({
  id: true,
  lastHarvestedAt: true,
  createdAt: true,
});

export type InsertDetailedVideoMetrics = z.infer<typeof insertDetailedVideoMetricsSchema>;
export type DetailedVideoMetrics = typeof detailedVideoMetrics.$inferSelect;

// Hook Templates - Winning title/hook patterns extracted from top performers
export const hookTemplates = pgTable('hook_templates', {
  id: serial('id').primaryKey(),
  template: text('template').notNull(), // e.g., "[FIGURE] vs [OPPONENT] - The [DRAMATIC_MOMENT]"
  category: varchar('category', { length: 50 }).notNull(), // 'conflict', 'mystery', 'challenge', 'reveal', 'warning'

  // Performance tracking
  timesUsed: integer('times_used').notNull().default(0),
  avgViewsWhenUsed: decimal('avg_views_when_used', { precision: 10, scale: 2 }),
  avgCtrWhenUsed: decimal('avg_ctr_when_used', { precision: 5, scale: 2 }),
  successRate: decimal('success_rate', { precision: 5, scale: 2 }), // % of videos using this that hit 'high' or 'viral'

  // Source videos that used this pattern
  sourceVideoIds: text('source_video_ids').array(),

  // Keywords that appear in successful videos with this template
  winningKeywords: text('winning_keywords').array(), // e.g., ['vs', 'battle', 'secret', 'truth', 'epic']

  // Status
  isActive: integer('is_active').notNull().default(1),
  confidence: decimal('confidence', { precision: 3, scale: 2 }), // 0.00 to 1.00
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertHookTemplatesSchema = createInsertSchema(hookTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHookTemplates = z.infer<typeof insertHookTemplatesSchema>;
export type HookTemplates = typeof hookTemplates.$inferSelect;

// Pattern Usage Log - Audit trail for which patterns were applied to each video
export const patternUsageLog = pgTable('pattern_usage_log', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id', { length: 20 }), // YouTube video ID (null until uploaded)
  jobId: varchar('job_id'), // Link to generation job
  packageId: varchar('package_id'), // Unity content package ID

  // Patterns that were active and applied
  appliedPatterns: json('applied_patterns').$type<
    Array<{
      patternId: string;
      patternName: string;
      patternType: 'principle' | 'hook' | 'keyword' | 'style';
      category: 'proven' | 'neutral' | 'emerging' | 'failing';
      confidenceAtApplication: number;
    }>
  >(),

  // Hook template used (if any)
  hookTemplateId: integer('hook_template_id'),
  hookTemplateText: text('hook_template_text'),

  // Generated content metadata
  generatedTitle: text('generated_title'),
  generatedDescription: text('generated_description'),
  historicalFigure: text('historical_figure'),
  videoStyle: varchar('video_style', { length: 50 }), // A/B test style variant

  // Performance outcome (updated after video is published and matures)
  outcomeRecorded: integer('outcome_recorded').default(0), // 0 = pending, 1 = recorded
  outcomeViews: integer('outcome_views'),
  outcomeTier: varchar('outcome_tier', { length: 20 }),
  outcomeRecordedAt: timestamp('outcome_recorded_at'),

  appliedAt: timestamp('applied_at').notNull().defaultNow(),
});

export const insertPatternUsageLogSchema = createInsertSchema(patternUsageLog).omit({
  id: true,
  appliedAt: true,
});

export type InsertPatternUsageLog = z.infer<typeof insertPatternUsageLogSchema>;
export type PatternUsageLog = typeof patternUsageLog.$inferSelect;

// Pipeline Health Monitoring - tracks success/failure at each step
export const pipelineHealth = pgTable('pipeline_health', {
  id: serial('id').primaryKey(),
  jobId: varchar('job_id'), // Link to generation job
  videoId: varchar('video_id', { length: 20 }), // YouTube video ID after upload
  figure: text('figure').notNull(), // Historical figure being generated

  // Step tracking (each step: 'pending' | 'success' | 'failed' | 'skipped')
  stepDiscovery: varchar('step_discovery', { length: 50 }).default('pending'),
  stepPromptGeneration: varchar('step_prompt_generation', { length: 50 }).default('pending'),
  stepMusicGeneration: varchar('step_music_generation', { length: 50 }).default('pending'),
  stepVideoGeneration: varchar('step_video_generation', { length: 50 }).default('pending'),
  stepKaraokeSubtitles: varchar('step_karaoke_subtitles', { length: 50 }).default('pending'),
  stepFfmpegAssembly: varchar('step_ffmpeg_assembly', { length: 50 }).default('pending'),
  stepMetadataGeneration: varchar('step_metadata_generation', { length: 50 }).default('pending'),
  stepThumbnailGeneration: varchar('step_thumbnail_generation', { length: 50 }).default('pending'),
  stepYoutubeUpload: varchar('step_youtube_upload', { length: 50 }).default('pending'),

  // Error tracking
  failedStep: varchar('failed_step', { length: 50 }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),

  // Timing
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  totalDurationSeconds: integer('total_duration_seconds'),

  // Cost tracking for this specific job
  costKling: decimal('cost_kling', { precision: 10, scale: 4 }).default('0'),
  costSuno: decimal('cost_suno', { precision: 10, scale: 4 }).default('0'),
  costOpenai: decimal('cost_openai', { precision: 10, scale: 4 }).default('0'),
  costTotal: decimal('cost_total', { precision: 10, scale: 4 }).default('0'),

  // Final status
  finalStatus: varchar('final_status', { length: 50 }).default('in_progress'), // 'in_progress' | 'completed' | 'failed'
});

export const insertPipelineHealthSchema = createInsertSchema(pipelineHealth).omit({
  id: true,
  startedAt: true,
});

export type InsertPipelineHealth = z.infer<typeof insertPipelineHealthSchema>;
export type PipelineHealth = typeof pipelineHealth.$inferSelect;

// Daily Health Digest - rolled up daily stats
export const dailyHealthDigest = pgTable('daily_health_digest', {
  id: serial('id').primaryKey(),
  date: timestamp('date').notNull(),

  // Pipeline counts
  videosAttempted: integer('videos_attempted').default(0),
  videosCompleted: integer('videos_completed').default(0),
  videosFailed: integer('videos_failed').default(0),
  videosUploaded: integer('videos_uploaded').default(0),

  // Step failure breakdown
  failuresDiscovery: integer('failures_discovery').default(0),
  failuresPromptGeneration: integer('failures_prompt_generation').default(0),
  failuresMusicGeneration: integer('failures_music_generation').default(0),
  failuresVideoGeneration: integer('failures_video_generation').default(0),
  failuresKaraokeSubtitles: integer('failures_karaoke_subtitles').default(0),
  failuresFfmpegAssembly: integer('failures_ffmpeg_assembly').default(0),
  failuresMetadataGeneration: integer('failures_metadata_generation').default(0),
  failuresThumbnailGeneration: integer('failures_thumbnail_generation').default(0),
  failuresYoutubeUpload: integer('failures_youtube_upload').default(0),

  // Cost summary
  totalCostKling: decimal('total_cost_kling', { precision: 10, scale: 4 }).default('0'),
  totalCostSuno: decimal('total_cost_suno', { precision: 10, scale: 4 }).default('0'),
  totalCostOpenai: decimal('total_cost_openai', { precision: 10, scale: 4 }).default('0'),
  totalCost: decimal('total_cost', { precision: 10, scale: 4 }).default('0'),
  costPerVideo: decimal('cost_per_video', { precision: 10, scale: 4 }).default('0'),

  // Timing stats
  avgGenerationTimeSeconds: integer('avg_generation_time_seconds'),

  // Alerts generated
  alertsGenerated: json('alerts_generated').$type<
    Array<{
      type: 'degradation' | 'cost_spike' | 'failure_rate';
      message: string;
      severity: 'warning' | 'critical';
    }>
  >(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertDailyHealthDigestSchema = createInsertSchema(dailyHealthDigest).omit({
  id: true,
  createdAt: true,
});

export type InsertDailyHealthDigest = z.infer<typeof insertDailyHealthDigestSchema>;
export type DailyHealthDigest = typeof dailyHealthDigest.$inferSelect;

// ============================================================================
// FACT-CHECK LEARNING TABLES - Learn from past mistakes
// ============================================================================

// Tracks individual fact-check mistakes for learning
export const factCheckMistakes = pgTable('fact_check_mistakes', {
  id: serial('id').primaryKey(),
  figureName: text('figure_name').notNull(),
  figureNameNormalized: text('figure_name_normalized').notNull(), // lowercase for matching
  errorType: varchar('error_type', { length: 30 }).notNull(), // 'wrong_fact', 'wrong_person', 'anachronism', etc.
  severity: varchar('severity', { length: 20 }).notNull(), // 'critical', 'major', 'minor'
  wrongClaim: text('wrong_claim').notNull(),
  correctInfo: text('correct_info'),
  confusedWithFigure: text('confused_with_figure'), // Who they were confused with
  frequency: integer('frequency').default(1).notNull(), // How many times this mistake occurred
  lastOccurred: timestamp('last_occurred').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertFactCheckMistakeSchema = createInsertSchema(factCheckMistakes).omit({
  id: true,
  frequency: true,
  lastOccurred: true,
  createdAt: true,
});

export type InsertFactCheckMistake = z.infer<typeof insertFactCheckMistakeSchema>;
export type FactCheckMistake = typeof factCheckMistakes.$inferSelect;

// Tracks which figures are commonly confused with each other
export const factCheckConfusionPairs = pgTable('fact_check_confusion_pairs', {
  id: serial('id').primaryKey(),
  figure1: text('figure_1').notNull(),
  figure2: text('figure_2').notNull(),
  frequency: integer('frequency').default(1).notNull(),
  commonMistakes: json('common_mistakes').$type<string[]>().default([]),
  lastOccurred: timestamp('last_occurred').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertFactCheckConfusionPairSchema = createInsertSchema(factCheckConfusionPairs).omit({
  id: true,
  frequency: true,
  lastOccurred: true,
  createdAt: true,
});

export type InsertFactCheckConfusionPair = z.infer<typeof insertFactCheckConfusionPairSchema>;
export type FactCheckConfusionPair = typeof factCheckConfusionPairs.$inferSelect;

// Tracks name aliases (e.g., "FZ" could mean multiple people)
export const factCheckAliases = pgTable('fact_check_aliases', {
  id: serial('id').primaryKey(),
  alias: text('alias').notNull().unique(), // e.g., "FZ"
  possibleFigures: json('possible_figures').$type<string[]>().notNull(), // ["Frank Zappa", "Franz Kafka"]
  defaultFigure: text('default_figure'), // Most likely interpretation
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertFactCheckAliasSchema = createInsertSchema(factCheckAliases).omit({
  id: true,
  createdAt: true,
});

export type InsertFactCheckAlias = z.infer<typeof insertFactCheckAliasSchema>;
export type FactCheckAlias = typeof factCheckAliases.$inferSelect;

// ============================================================================
// RUMBLE CHANNELS - Cross-Platform Distribution (Platform Agnostic)
// ============================================================================

export const rumbleChannels = pgTable('rumble_channels', {
  id: serial('id').primaryKey(),
  channelName: text('channel_name').notNull(),
  streamKey: text('stream_key').notNull(),
  niche: text('niche').notNull(),
  isActive: integer('is_active').default(1).notNull(),
  totalStreams: integer('total_streams').default(0).notNull(),
  totalWatchMinutes: integer('total_watch_minutes').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastStreamAt: timestamp('last_stream_at'),
});

export const insertRumbleChannelSchema = createInsertSchema(rumbleChannels).omit({
  id: true,
  totalStreams: true,
  totalWatchMinutes: true,
  createdAt: true,
  lastStreamAt: true,
});

export type InsertRumbleChannel = z.infer<typeof insertRumbleChannelSchema>;
export type RumbleChannel = typeof rumbleChannels.$inferSelect;

// Cross-platform upload logs
export const crossPlatformUploads = pgTable('cross_platform_uploads', {
  id: serial('id').primaryKey(),
  packageId: text('package_id').notNull(),
  youtubeVideoId: text('youtube_video_id'),
  youtubeStatus: text('youtube_status').default('pending'),
  rumbleChannelId: integer('rumble_channel_id'),
  rumbleStatus: text('rumble_status').default('pending'),
  rumbleStreamDuration: integer('rumble_stream_duration'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertCrossPlatformUploadSchema = createInsertSchema(crossPlatformUploads).omit({
  id: true,
  createdAt: true,
});

export type InsertCrossPlatformUpload = z.infer<typeof insertCrossPlatformUploadSchema>;
export type CrossPlatformUpload = typeof crossPlatformUploads.$inferSelect;

// ============================================================================
// PATTERN INTELLIGENCE PERSISTENCE - Themes survive server restarts
// ============================================================================

export const thematicPrinciples = pgTable('thematic_principles', {
  id: varchar('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  whyItWorks: text('why_it_works').notNull(),
  examples: json('examples').$type<string[]>().default([]),
  antiPatterns: json('anti_patterns').$type<string[]>().default([]),
  confidence: integer('confidence').default(0).notNull(),
  sampleCount: integer('sample_count').default(0).notNull(),
  videosApplied: integer('videos_applied').default(0).notNull(),
  successfulVideos: integer('successful_videos').default(0).notNull(),
  totalViews: integer('total_views').default(0).notNull(),
  avgEngagement: decimal('avg_engagement', { precision: 5, scale: 2 }).default('0').notNull(),
  successRate: decimal('success_rate', { precision: 5, scale: 2 }).default('0').notNull(),
  recentSuccessRate: decimal('recent_success_rate', { precision: 5, scale: 2 }).default('0'),
  trend: varchar('trend', { length: 20 }).default('stable'),
  category: varchar('category', { length: 20 }).default('neutral').notNull(),
  contributingVideos: json('contributing_videos')
    .$type<
      Array<{
        videoId: string;
        title: string;
        views: number;
        engagement: number;
        wasSuccess: boolean;
        date: string;
      }>
    >()
    .default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertThematicPrincipleSchema = createInsertSchema(thematicPrinciples).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertThematicPrinciple = z.infer<typeof insertThematicPrincipleSchema>;
export type ThematicPrinciple = typeof thematicPrinciples.$inferSelect;

// ============================================================================
// THUMBNAIL A/B TESTING PERSISTENCE - Variant stats survive restarts
// ============================================================================

export const thumbnailVariantStats = pgTable('thumbnail_variant_stats', {
  id: varchar('id').primaryKey(), // vs_battle, portrait_dramatic, etc.
  name: text('name').notNull(),
  videoCount: integer('video_count').default(0).notNull(),
  totalImpressions: integer('total_impressions').default(0).notNull(),
  totalClicks: integer('total_clicks').default(0).notNull(),
  avgCtr: decimal('avg_ctr', { precision: 5, scale: 2 }).default('0').notNull(),
  bestCtr: decimal('best_ctr', { precision: 5, scale: 2 }).default('0').notNull(),
  worstCtr: decimal('worst_ctr', { precision: 5, scale: 2 }).default('100').notNull(),
  weight: integer('weight').default(20).notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertThumbnailVariantStatSchema = createInsertSchema(thumbnailVariantStats).omit({
  updatedAt: true,
});

export type InsertThumbnailVariantStat = z.infer<typeof insertThumbnailVariantStatSchema>;
export type ThumbnailVariantStat = typeof thumbnailVariantStats.$inferSelect;

// Video-to-thumbnail variant assignments for tracking
export const videoThumbnailAssignments = pgTable('video_thumbnail_assignments', {
  id: serial('id').primaryKey(),
  videoId: text('video_id').notNull(),
  youtubeVideoId: text('youtube_video_id'),
  variantId: varchar('variant_id', { length: 50 }).notNull(),
  impressions: integer('impressions').default(0),
  clicks: integer('clicks').default(0),
  ctr: decimal('ctr', { precision: 5, scale: 2 }).default('0'),
  ctrCheckedAt: timestamp('ctr_checked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertVideoThumbnailAssignmentSchema = createInsertSchema(videoThumbnailAssignments).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoThumbnailAssignment = z.infer<typeof insertVideoThumbnailAssignmentSchema>;
export type VideoThumbnailAssignment = typeof videoThumbnailAssignments.$inferSelect;

// ============================================================================
// CONSENSUS ENGINE - Cross-Model AI Verification (GPT-4o + Gemini)
// ============================================================================

export const consensusReports = pgTable('consensus_reports', {
  id: serial('id').primaryKey(),
  topic: text('topic').notNull(),
  status: varchar('status', { length: 50 }).notNull(), // CONSENSUS_REACHED, CONFLICT_DETECTED, MANUAL_REVIEW_REQUIRED
  consensusScore: integer('consensus_score').notNull(), // 0-100
  gptOutput: json('gpt_output').$type<object>(),
  geminiOutput: json('gemini_output').$type<object>(),
  conflicts: json('conflicts')
    .$type<
      Array<{
        type: string;
        gptClaim: string;
        geminiClaim: string;
        severity: string;
        resolution?: string; // How the conflict was resolved (if applicable)
      }>
    >()
    .default([]),
  finalData: json('final_data').$type<object>(),
  // Master Judge decision - critical for audit trail
  action: varchar('action', { length: 50 }).default('PENDING'), // PROCEED, BLOCKED, MANUAL_REVIEW
  actionReasoning: text('action_reasoning'), // Why the Master Judge made this decision
  blockedReason: text('blocked_reason'), // If blocked, why (for audit)
  // Timestamps for audit trail
  gptTimestamp: timestamp('gpt_timestamp'),
  geminiTimestamp: timestamp('gemini_timestamp'),
  evaluationTimestamp: timestamp('evaluation_timestamp'),
  modelVersions: json('model_versions').$type<{ gpt: string; gemini: string }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertConsensusReportSchema = createInsertSchema(consensusReports).omit({
  id: true,
  createdAt: true,
});

export type InsertConsensusReport = z.infer<typeof insertConsensusReportSchema>;
export type ConsensusReport = typeof consensusReports.$inferSelect;

// ============================================================================
// CANONICAL FACTS - Verified facts for content generation (Fact Reconciliation)
// ============================================================================

export const canonicalFacts = pgTable('canonical_facts', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  topic: text('topic').notNull(), // Historical figure or event
  factType: varchar('fact_type', { length: 50 }).notNull(), // 'date', 'event', 'relationship', 'achievement', 'death', 'birth'
  factKey: text('fact_key').notNull(), // e.g., "birth_date", "death_date", "major_battle"
  factValue: text('fact_value').notNull(), // The verified fact

  // Source tracking for audit
  sourceType: varchar('source_type', { length: 50 }).notNull(), // 'wikipedia', 'britannica', 'web_search', 'model_consensus'
  sourceUrl: text('source_url'),
  sourceCitation: text('source_citation'),

  // Confidence scoring
  confidence: integer('confidence').notNull().default(0), // 0-100
  corroborationCount: integer('corroboration_count').default(1), // How many sources agree

  // Conflict resolution
  originalGptClaim: text('original_gpt_claim'),
  originalGeminiClaim: text('original_gemini_claim'),
  resolutionMethod: varchar('resolution_method', { length: 50 }), // 'web_search', 'source_lookup', 'model_consensus'

  // Usage tracking
  usageCount: integer('usage_count').default(0), // How many times this fact was used in content
  lastUsedAt: timestamp('last_used_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertCanonicalFactSchema = createInsertSchema(canonicalFacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCanonicalFact = z.infer<typeof insertCanonicalFactSchema>;
export type CanonicalFact = typeof canonicalFacts.$inferSelect;

// ============================================================================
// GEMINI CHAT - Conversations and Messages for Gemini Integration
// ============================================================================

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// ============================================================================
// LONG-FORM CONTENT GENERATOR - 10-Minute Historical Epic Videos
// ============================================================================

// Long-form packages - Main container for 10-minute videos
export const longFormPackages = pgTable('long_form_packages', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  topic: text('topic').notNull(), // e.g., "The Fall of Rome", "Battle of Gettysburg"
  title: text('title').notNull(),
  description: text('description'),

  // Narrative structure
  narrativeArc: varchar('narrative_arc', { length: 50 }).default('three_act'), // three_act, hero_journey, chronicle
  totalChapters: integer('total_chapters').default(6),
  targetDuration: integer('target_duration').default(600), // 10 minutes in seconds

  // Content format
  contentType: varchar('content_type', { length: 50 }).default('historical_epic'), // historical_epic, biography, battle, rivalry
  stylePreset: varchar('style_preset', { length: 50 }), // documentary, cinematic, rap_battle

  // Cost tracking
  estimatedCost: decimal('estimated_cost', { precision: 10, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 10, scale: 2 }),
  costBudget: decimal('cost_budget', { precision: 10, scale: 2 }).default('15.00'), // Max budget for long-form

  // Consensus verification
  consensusReportId: integer('consensus_report_id'),
  consensusStatus: varchar('consensus_status', { length: 50 }),

  // Quality Gate (Anti-Brain-Rot)
  qualityScore: integer('quality_score'), // 0-100 overall quality score
  qualityGrade: varchar('quality_grade', { length: 1 }), // A, B, C, D, F
  educationalValue: text('educational_value'), // Summary of what viewers will learn

  // Audio
  musicStyle: text('music_style'),
  audioSegmentIds: text('audio_segment_ids').array(), // References to audio stems
  totalAudioDuration: decimal('total_audio_duration', { precision: 10, scale: 2 }),

  // Video clips
  totalClips: integer('total_clips').default(0),
  generatedClips: integer('generated_clips').default(0),

  // Related shorts (auto-redirect feature)
  relatedShortIds: text('related_short_ids').array(), // Package IDs of 4 related shorts
  autoRedirectEnabled: boolean('auto_redirect_enabled').default(true),

  // Status
  status: varchar('status', { length: 50 }).default('draft'), // draft, planning, generating, assembling, completed, failed
  progress: integer('progress').default(0),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at'),
  completedAt: timestamp('completed_at'),

  // Output
  videoUrl: text('video_url'),
  thumbnailUrl: text('thumbnail_url'),
  youtubeVideoId: text('youtube_video_id'),
});

// Long-form chapters - 6 chapters per package
export const longFormChapters = pgTable('long_form_chapters', {
  id: serial('id').primaryKey(),
  packageId: varchar('package_id')
    .notNull()
    .references(() => longFormPackages.id, { onDelete: 'cascade' }),

  // Chapter info
  chapterNumber: integer('chapter_number').notNull(), // 1-6
  chapterType: varchar('chapter_type', { length: 50 }).notNull(), // prologue, rising_conflict, midpoint, escalation, climax, legacy
  title: text('title').notNull(),

  // Narrative content
  narrative: text('narrative'), // Full narrative text for this chapter
  keyFacts: text('key_facts').array(), // Historical facts to include
  emotionalBeats: text('emotional_beats').array(), // Tension, triumph, tragedy, etc.

  // Lyrics for this chapter
  lyrics: text('lyrics'),
  lyricThemes: text('lyric_themes').array(),

  // Video prompts for this chapter
  visualPrompts: json('visual_prompts').$type<
    Array<{
      promptIndex: number;
      prompt: string;
      timestamp: string;
      duration: number;
    }>
  >(),
  clipCount: integer('clip_count').default(0),
  generatedClipCount: integer('generated_clip_count').default(0),

  // Timing
  startTime: decimal('start_time', { precision: 10, scale: 2 }), // In seconds
  endTime: decimal('end_time', { precision: 10, scale: 2 }),
  duration: decimal('duration', { precision: 10, scale: 2 }),

  // Retention hooks
  openingHook: text('opening_hook'), // Cold open for this chapter
  cliffhanger: text('cliffhanger'), // Ending hook to next chapter

  // Per-chapter consensus
  consensusScore: integer('consensus_score'),
  factCheckStatus: varchar('fact_check_status', { length: 50 }), // verified, review_needed, flagged

  // Status
  status: varchar('status', { length: 50 }).default('pending'), // pending, generating, completed

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Long-form audio segments - 3 stems stitched together
export const longFormAudioSegments = pgTable('long_form_audio_segments', {
  id: serial('id').primaryKey(),
  packageId: varchar('package_id')
    .notNull()
    .references(() => longFormPackages.id, { onDelete: 'cascade' }),

  // Segment info
  segmentNumber: integer('segment_number').notNull(), // 1, 2, 3 (for 3 stems)
  segmentType: varchar('segment_type', { length: 50 }).notNull(), // act_1, act_2, act_3, interlude

  // Music parameters (shared across stems for consistency)
  tempo: integer('tempo'), // BPM
  key: varchar('key', { length: 10 }), // e.g., "C minor", "G major"
  mood: text('mood'),
  sunoPrompt: text('suno_prompt'),

  // Suno generation
  sunoTaskId: text('suno_task_id'),
  sunoAudioUrl: text('suno_audio_url'),
  localAudioPath: text('local_audio_path'),

  // Timing
  duration: decimal('duration', { precision: 10, scale: 2 }), // ~180-240 seconds per stem
  startTime: decimal('start_time', { precision: 10, scale: 2 }), // Position in final video

  // Lyrics for this segment
  lyrics: text('lyrics'),
  transcription: json('transcription').$type<
    Array<{
      word: string;
      start: number;
      end: number;
    }>
  >(),

  // Stitching info
  crossfadeDuration: decimal('crossfade_duration', { precision: 5, scale: 2 }).default('10.0'), // 10s crossfade
  interludeDuration: decimal('interlude_duration', { precision: 5, scale: 2 }).default('15.0'), // 15s instrumental break

  // Status
  status: varchar('status', { length: 50 }).default('pending'), // pending, generating, downloaded, failed

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertLongFormPackageSchema = createInsertSchema(longFormPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertLongFormChapterSchema = createInsertSchema(longFormChapters).omit({
  id: true,
  createdAt: true,
});

export const insertLongFormAudioSegmentSchema = createInsertSchema(longFormAudioSegments).omit({
  id: true,
  createdAt: true,
});

export type LongFormPackage = typeof longFormPackages.$inferSelect;
export type InsertLongFormPackage = z.infer<typeof insertLongFormPackageSchema>;
export type LongFormChapter = typeof longFormChapters.$inferSelect;
export type InsertLongFormChapter = z.infer<typeof insertLongFormChapterSchema>;
export type LongFormAudioSegment = typeof longFormAudioSegments.$inferSelect;
export type InsertLongFormAudioSegment = z.infer<typeof insertLongFormAudioSegmentSchema>;

// ============================================================================
// LYRIC PERFORMANCE ANALYTICS
// Tracks which lyric characteristics correlate with video performance
// ============================================================================

export const lyricFeatures = pgTable('lyric_features', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  packageId: varchar('package_id').notNull(),
  videoId: varchar('video_id'), // YouTube video ID once uploaded

  // Raw lyrics
  fullLyrics: text('full_lyrics').notNull(),
  wordCount: integer('word_count').notNull(),
  lineCount: integer('line_count').notNull(),

  // Perspective & Voice
  perspective: varchar('perspective', { length: 30 }).notNull(), // first_person, third_person, mixed
  narratorStyle: varchar('narrator_style', { length: 50 }), // boastful, storytelling, educational, aggressive

  // Hook Analysis
  hookText: text('hook_text'), // First 4-8 lines (the hook section)
  hookStyle: varchar('hook_style', { length: 50 }), // identity_declaration, challenge, question, claim
  hookWordCount: integer('hook_word_count'),

  // Rhyme Pattern Analysis
  rhymeScheme: varchar('rhyme_scheme', { length: 20 }), // AABB, ABAB, AABCCB, XAXA, mixed
  rhymeDensity: decimal('rhyme_density', { precision: 5, scale: 3 }), // Rhymes per line (0.0-1.0)
  internalRhymes: integer('internal_rhymes'), // Count of internal rhymes
  slantRhymes: integer('slant_rhymes'), // Count of slant/near rhymes
  multisyllabicRhymes: integer('multisyllabic_rhymes'), // Complex rhymes

  // Pacing & Flow
  avgSyllablesPerLine: decimal('avg_syllables_per_line', { precision: 5, scale: 2 }),
  syllablesPerSecond: decimal('syllables_per_second', { precision: 5, scale: 2 }), // From forced alignment
  lineVariation: decimal('line_variation', { precision: 5, scale: 3 }), // Std dev of line lengths

  // Emotional Intensity
  emotionalIntensity: varchar('emotional_intensity', { length: 20 }), // low, medium, high, extreme
  emotionalArc: varchar('emotional_arc', { length: 30 }), // rising, falling, peak_middle, steady

  // Content Signals
  factDensity: decimal('fact_density', { precision: 5, scale: 3 }), // Historical facts per line
  adversarialCallouts: integer('adversarial_callouts'), // "You", "They", direct challenges
  repetitionAnchors: integer('repetition_anchors'), // Repeated phrases/words for memorability
  vocabularyNovelty: decimal('vocabulary_novelty', { precision: 5, scale: 3 }), // Unique words ratio

  // Thompson Sampling State (per feature combination)
  featureHash: varchar('feature_hash', { length: 64 }), // Hash of key features for grouping

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const lyricPatternStats = pgTable('lyric_pattern_stats', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Pattern identification
  patternType: varchar('pattern_type', { length: 50 }).notNull(), // perspective, rhyme_scheme, hook_style, etc.
  patternValue: varchar('pattern_value', { length: 100 }).notNull(), // first_person, AABB, identity_declaration, etc.

  // Thompson Sampling state
  alpha: decimal('alpha', { precision: 10, scale: 2 }).notNull().default('1'), // Successes + 1
  beta: decimal('beta', { precision: 10, scale: 2 }).notNull().default('1'), // Failures + 1
  pulls: integer('pulls').notNull().default(0), // Times this pattern was used

  // Performance metrics
  avgViews: decimal('avg_views', { precision: 12, scale: 2 }).default('0'),
  avgRetention: decimal('avg_retention', { precision: 5, scale: 2 }).default('0'), // 0-100%
  avgCtr: decimal('avg_ctr', { precision: 5, scale: 2 }).default('0'), // 0-100%
  successRate: decimal('success_rate', { precision: 5, scale: 2 }).default('0'), // % of videos that "succeeded"

  // Lyric lift score (residual performance after controlling for other factors)
  lyricLiftScore: decimal('lyric_lift_score', { precision: 8, scale: 4 }).default('0'),

  // Verdict based on performance
  verdict: varchar('verdict', { length: 20 }).default('neutral'), // proven, neutral, avoid

  // Sample video IDs for reference
  sampleVideoIds: text('sample_video_ids').array(),

  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertLyricFeaturesSchema = createInsertSchema(lyricFeatures).omit({
  id: true,
  createdAt: true,
});

export const insertLyricPatternStatsSchema = createInsertSchema(lyricPatternStats).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});

export type LyricFeatures = typeof lyricFeatures.$inferSelect;
export type InsertLyricFeatures = z.infer<typeof insertLyricFeaturesSchema>;
export type LyricPatternStats = typeof lyricPatternStats.$inferSelect;
export type InsertLyricPatternStats = z.infer<typeof insertLyricPatternStatsSchema>;

// ============================================================================
// VIDEO ROTATION CONFIGS - Metadata A/B testing with timed rotations
// ============================================================================

export const videoRotationConfigs = pgTable('video_rotation_configs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Video identification
  youtubeVideoId: text('youtube_video_id').notNull(),
  packageId: text('package_id'), // Optional link to unity_content_packages

  // Timing
  publishTime: timestamp('publish_time').notNull(), // When video was published/scheduled

  // Title variants
  titleA: text('title_a').notNull(), // Original title (0h)
  titleB: text('title_b'), // Alternate title for 12h rotation
  currentTitle: varchar('current_title', { length: 1 }).notNull().default('A'), // 'A' or 'B'
  titleRotatedAt: timestamp('title_rotated_at'),

  // Thumbnail variants
  thumbnailA: text('thumbnail_a'), // Path/URL to original thumbnail
  thumbnailB: text('thumbnail_b'), // Path/URL to alternate thumbnail for 24h rotation
  currentThumbnail: varchar('current_thumbnail', { length: 1 }).notNull().default('A'), // 'A' or 'B'
  thumbnailRotatedAt: timestamp('thumbnail_rotated_at'),

  // Title B generation metadata
  titleBGeneratedBy: varchar('title_b_generated_by', { length: 20 }), // 'gpt', 'manual', null
  titleBPrompt: text('title_b_prompt'), // The prompt used to generate Title B
  titleBGeneratedAt: timestamp('title_b_generated_at'),

  // A/B Performance comparison (views during each title period)
  viewsDuringTitleA: integer('views_during_title_a'), // Views 0-12h (Title A period)
  viewsDuringTitleB: integer('views_during_title_b'), // Views 12-24h (Title B period)
  viewsPerHourA: real('views_per_hour_a'), // Rate: viewsDuringTitleA / 12
  viewsPerHourB: real('views_per_hour_b'), // Rate: viewsDuringTitleB / 12
  performanceDeltaPct: real('performance_delta_pct'), // ((B-A)/A)*100
  lastAnalyticsSync: timestamp('last_analytics_sync'),

  // Legacy performance snapshots (kept for compatibility)
  performanceBeforeRotation: json('performance_before_rotation').$type<{
    views?: number;
    ctr?: number;
    avgViewDuration?: number;
    capturedAt?: string;
  }>(),
  performanceAfterRotation: json('performance_after_rotation').$type<{
    views?: number;
    ctr?: number;
    avgViewDuration?: number;
    capturedAt?: string;
  }>(),

  // Status
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'completed', 'paused', 'failed'

  // Rotation log (array of events)
  rotationLog: json('rotation_log').$type<
    Array<{
      action: string; // 'title_rotated', 'thumbnail_rotated', 'completed'
      from: string;
      to: string;
      timestamp: string;
      hoursSincePublish: number;
      performanceSnapshot?: {
        views?: number;
        ctr?: number;
        avgViewDuration?: number;
      };
    }>
  >(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertVideoRotationConfigSchema = createInsertSchema(videoRotationConfigs).omit({
  id: true,
  createdAt: true,
});

export type VideoRotationConfig = typeof videoRotationConfigs.$inferSelect;
export type InsertVideoRotationConfig = z.infer<typeof insertVideoRotationConfigSchema>;

// ============================================================================
// AUDIO RETENTION CORRELATIONS
// Tracks audio pacing features and correlates with YouTube retention data
// Uses Thompson Sampling to learn winning audio patterns
// ============================================================================

export const audioRetentionCorrelations = pgTable('audio_retention_correlations', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  videoId: text('video_id'), // YouTube video ID once uploaded
  packageId: text('package_id'), // references unity_content_packages

  // Audio pacing features (from librosa analysis)
  bpm: real('bpm'), // Beats per minute
  beatDropTimestamps: text('beat_drop_timestamps'), // JSON array of timestamps in seconds where beat drops occur
  energyPeakTimestamps: text('energy_peak_timestamps'), // JSON array of timestamps where energy peaks occur
  firstBeatDropSecond: real('first_beat_drop_second'), // When first beat drops - critical for hook retention
  averageEnergy: real('average_energy'), // 0-1 scale
  energyVariance: real('energy_variance'), // How dynamic the track is

  // Additional audio features for pattern learning
  firstEnergyPeakSecond: real('first_energy_peak_second'), // When first energy peak happens
  introEnergy: real('intro_energy'), // Energy in first 3 seconds (hook energy)
  energyRampTime: real('energy_ramp_time'), // Seconds until energy reaches 80% of max
  beatDensityFirst5s: real('beat_density_first_5s'), // Beats per second in first 5 seconds
  dynamicRange: real('dynamic_range'), // Max energy - min energy

  // YouTube retention data (filled after metrics harvesting)
  retentionAt3s: real('retention_at_3s'), // % retained at 3 seconds
  retentionAt8s: real('retention_at_8s'), // % retained at 8 seconds
  retentionAt15s: real('retention_at_15s'), // % retained at 15 seconds
  retentionAt30s: real('retention_at_30s'), // % retained at 30 seconds
  avgRetention: real('avg_retention'), // Average retention across video
  retentionCurve: json('retention_curve'), // JSON array of retention points

  // Performance metrics
  performanceScore: real('performance_score'), // CTR * avgViewDuration weighted
  views: integer('views'),
  ctr: real('ctr'),
  avgViewDuration: real('avg_view_duration'),

  // Thompson Sampling state
  alpha: real('alpha').default(1), // Successes + 1
  beta: real('beta').default(1), // Failures + 1

  // AI-generated insights
  correlationInsights: text('correlation_insights'), // JSON - AI-generated insights
  patternCategory: varchar('pattern_category', { length: 50 }), // fast_drop, slow_build, steady, etc.

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Audio pattern stats for Thompson Sampling aggregation
export const audioPatternStats = pgTable('audio_pattern_stats', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Pattern identification
  patternType: varchar('pattern_type', { length: 50 }).notNull(), // bpm_range, first_drop_timing, intro_energy, etc.
  patternValue: varchar('pattern_value', { length: 100 }).notNull(), // fast(>130), slow(<90), early_drop(<3s), etc.

  // Thompson Sampling state
  alpha: real('alpha').notNull().default(1), // Successes + 1
  beta: real('beta').notNull().default(1), // Failures + 1
  pulls: integer('pulls').notNull().default(0), // Times this pattern was used

  // Performance metrics
  avgViews: real('avg_views').default(0),
  avgRetention: real('avg_retention').default(0), // 0-100%
  avgCtr: real('avg_ctr').default(0), // 0-100%
  successRate: real('success_rate').default(0), // % of videos that "succeeded"

  // Verdict based on performance
  verdict: varchar('verdict', { length: 20 }).default('neutral'), // proven, neutral, avoid

  // Sample video IDs for reference
  sampleVideoIds: text('sample_video_ids').array(),

  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertAudioRetentionCorrelationSchema = createInsertSchema(audioRetentionCorrelations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAudioPatternStatsSchema = createInsertSchema(audioPatternStats).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});

export type AudioRetentionCorrelation = typeof audioRetentionCorrelations.$inferSelect;
export type InsertAudioRetentionCorrelation = z.infer<typeof insertAudioRetentionCorrelationSchema>;
export type AudioPatternStats = typeof audioPatternStats.$inferSelect;
export type InsertAudioPatternStats = z.infer<typeof insertAudioPatternStatsSchema>;

// ============================================================================
// POSTING TIME ARMS - Thompson Sampling for optimal upload times
// ============================================================================

export const postingTimeArms = pgTable('posting_time_arms', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  timeSlot: varchar('time_slot', { length: 10 }).notNull(), // "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"
  dayType: varchar('day_type', { length: 10 }).notNull(), // "weekday" or "weekend"
  format: varchar('format', { length: 20 }).notNull(), // "shorts" or "long_form"

  alpha: real('alpha').notNull().default(1), // Beta distribution success param
  beta: real('beta').notNull().default(1), // Beta distribution failure param
  trials: integer('trials').notNull().default(0), // Times this arm was pulled
  successes: integer('successes').notNull().default(0), // Successful outcomes

  avgCtr: real('avg_ctr'), // Average CTR for videos posted at this time
  avgAvd: real('avg_avd'), // Average view duration
  avgViews: real('avg_views'), // Average views

  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertPostingTimeArmSchema = createInsertSchema(postingTimeArms).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});

export type PostingTimeArm = typeof postingTimeArms.$inferSelect;
export type InsertPostingTimeArm = z.infer<typeof insertPostingTimeArmSchema>;

// ============================================================================
// STRATEGIC SUMMARIES - Nightly AI-generated system analysis
// ============================================================================

export const strategicSummaries = pgTable('strategic_summaries', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  executiveSummary: text('executive_summary').notNull(),

  winnersLosers: json('winners_losers').$type<{
    winners: { item: string; metric: string; insight: string }[];
    losers: { item: string; metric: string; insight: string }[];
  }>(),

  patternInsights: json('pattern_insights').$type<{
    themes: string;
    lyrics: string;
    audio: string;
    thumbnails: string;
    postingTimes: string;
  }>(),

  recommendations: text('recommendations').array(),
  warnings: text('warnings').array(),

  costsBreakdown: json('costs_breakdown').$type<{
    total: number;
    byService: { service: string; cost: number }[];
  }>(),

  rawData: json('raw_data'),
  confidenceLevel: varchar('confidence_level', { length: 20 }).default('medium'),

  generatedAt: timestamp('generated_at').notNull().defaultNow(),
});

export const insertStrategicSummarySchema = createInsertSchema(strategicSummaries).omit({
  id: true,
  generatedAt: true,
});

export type StrategicSummary = typeof strategicSummaries.$inferSelect;
export type InsertStrategicSummary = z.infer<typeof insertStrategicSummarySchema>;

// ============================================================================
// STYLE BANDIT - Thompson Sampling for visual styles (anti-bot variation)
// ============================================================================

export const styleBanditArms = pgTable('style_bandit_arms', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  styleName: varchar('style_name', { length: 50 }).notNull().unique(),

  // Visual parameters
  colorMultiplier: real('color_multiplier').default(1.0),
  contrast: integer('contrast').default(20),
  fontFamily: varchar('font_family', { length: 100 }).default('Cinzel-Bold'),
  overlayTexture: varchar('overlay_texture', { length: 100 }),

  // Thompson Sampling state
  alpha: real('alpha').notNull().default(1),
  beta: real('beta').notNull().default(1),
  trials: integer('trials').notNull().default(0),
  successes: integer('successes').notNull().default(0),

  // Performance metrics
  avgCtr: real('avg_ctr'),
  avgRetention: real('avg_retention'),
  avgViews: real('avg_views'),

  // Anti-bot tracking
  consecutiveUses: integer('consecutive_uses').notNull().default(0),
  lastUsedAt: timestamp('last_used_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertStyleBanditArmSchema = createInsertSchema(styleBanditArms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type StyleBanditArm = typeof styleBanditArms.$inferSelect;
export type InsertStyleBanditArm = z.infer<typeof insertStyleBanditArmSchema>;

// ============================================================================
// YOUTUBE CHANNEL BANDIT - Thompson Sampling for channel selection
// Learns which channels perform better for different content types
// ============================================================================

export const youtubeChannelBanditArms = pgTable('youtube_channel_bandit_arms', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  channelId: varchar('channel_id', { length: 100 }).notNull().unique(), // Internal ID from youtube-oauth-simple
  channelName: varchar('channel_name', { length: 200 }).notNull(),
  youtubeChannelId: varchar('youtube_channel_id', { length: 100 }).notNull(), // YouTube's channel ID

  // Thompson Sampling parameters
  alpha: real('alpha').notNull().default(1.0),
  beta: real('beta').notNull().default(1.0),
  trials: integer('trials').notNull().default(0),
  successes: integer('successes').notNull().default(0),

  // Performance metrics
  avgViews: real('avg_views'),
  avgCtr: real('avg_ctr'), // Click-through rate
  avgRetention: real('avg_retention'), // Average retention %
  avgLikes: real('avg_likes'),
  totalUploads: integer('total_uploads').notNull().default(0),

  // Content type performance (track per type)
  lofiSuccessRate: real('lofi_success_rate'),
  trapSuccessRate: real('trap_success_rate'),
  historySuccessRate: real('history_success_rate'),

  // Anti-bot tracking
  consecutiveUses: integer('consecutive_uses').notNull().default(0),
  lastUsedAt: timestamp('last_used_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertYoutubeChannelBanditArmSchema = createInsertSchema(youtubeChannelBanditArms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type YoutubeChannelBanditArm = typeof youtubeChannelBanditArms.$inferSelect;
export type InsertYoutubeChannelBanditArm = z.infer<typeof insertYoutubeChannelBanditArmSchema>;

// ============================================================================
// TOXIC COMBOS - Pre-Crime Validator for Style+Audio Combinations
// Stores combinations that historically caused viewer drop-offs
// Used to block future videos from using these "toxic" combinations
// ============================================================================

export const toxicCombos = pgTable(
  'toxic_combos',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    styleCategory: varchar('style_category', { length: 100 }).notNull(),
    audioStyle: varchar('audio_style', { length: 100 }).notNull(),

    dropCount: integer('drop_count').notNull().default(1),
    totalDropPercentage: real('total_drop_percentage').notNull().default(0),
    avgDropPercentage: real('avg_drop_percentage').notNull().default(0),

    sourceVideoIds: text('source_video_ids').array(),
    dropSecondsSamples: integer('drop_seconds_samples').array(),

    severity: varchar('severity', { length: 20 }).notNull().default('minor'),

    isBanned: boolean('is_banned').notNull().default(false),
    banReason: text('ban_reason'),

    firstDetectedAt: timestamp('first_detected_at').notNull().defaultNow(),
    lastDetectedAt: timestamp('last_detected_at').notNull().defaultNow(),

    decayFactor: real('decay_factor').notNull().default(1.0),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('toxic_combos_style_audio_idx').on(table.styleCategory, table.audioStyle)],
);

export const insertToxicComboSchema = createInsertSchema(toxicCombos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ToxicCombo = typeof toxicCombos.$inferSelect;
export type InsertToxicCombo = z.infer<typeof insertToxicComboSchema>;

// ============================================================================
// NUGGET A/B EXPERIMENTS - Visual Anchor Testing for First Clips
// Tests different nugget types (in_media_res, abstract_mystery, reaction_reveal)
// and selects winner based on swipe rate, retention, and CTR metrics
// ============================================================================

export const nuggetExperiments = pgTable('nugget_experiments', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  sprintId: varchar('sprint_id', { length: 100 }), // Links to content sprint

  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'completed', 'cancelled'

  variantA: varchar('variant_a', { length: 50 }).notNull(), // e.g., 'in_media_res'
  variantB: varchar('variant_b', { length: 50 }).notNull(), // e.g., 'abstract_mystery'

  variantAStats: json('variant_a_stats')
    .$type<{
      videoCount: number;
      impressions: number;
      swipeRate: number; // 0-1, lower is better (fewer people swiped away)
      retention3s: number; // 0-1, 3-second retention rate
      ctr: number; // 0-1, click-through rate
      avgWatchTime: number; // seconds
      totalReward: number; // Composite score
    }>()
    .default({ videoCount: 0, impressions: 0, swipeRate: 0, retention3s: 0, ctr: 0, avgWatchTime: 0, totalReward: 0 }),

  variantBStats: json('variant_b_stats')
    .$type<{
      videoCount: number;
      impressions: number;
      swipeRate: number;
      retention3s: number;
      ctr: number;
      avgWatchTime: number;
      totalReward: number;
    }>()
    .default({ videoCount: 0, impressions: 0, swipeRate: 0, retention3s: 0, ctr: 0, avgWatchTime: 0, totalReward: 0 }),

  winner: varchar('winner', { length: 50 }), // Winning nugget type when experiment concludes
  winnerConfidence: real('winner_confidence'), // 0-1, statistical confidence
  winnerMargin: real('winner_margin'), // Difference in composite scores

  minVideosPerVariant: integer('min_videos_per_variant').notNull().default(3),
  minTotalImpressions: integer('min_total_impressions').notNull().default(1000),
  maxTestWindow: integer('max_test_window').notNull().default(24), // hours

  videoAssignments: json('video_assignments')
    .$type<
      Array<{
        videoId: string; // YouTube video ID
        packageId?: string; // Unity package ID
        variant: string; // Which nugget type was used
        publishedAt: string;
        metrics?: {
          swipeRate: number;
          retention3s: number;
          ctr: number;
          impressions: number;
        };
      }>
    >()
    .default([]),

  decisionLog: json('decision_log')
    .$type<
      Array<{
        action: string;
        timestamp: string;
        details: string;
      }>
    >()
    .default([]),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const insertNuggetExperimentSchema = createInsertSchema(nuggetExperiments).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type NuggetExperiment = typeof nuggetExperiments.$inferSelect;
export type InsertNuggetExperiment = z.infer<typeof insertNuggetExperimentSchema>;

// ============================================================================
// AUDIO DNA - Deep Acoustic Fingerprinting
// Stores comprehensive audio signatures for retention correlation analysis
// "The system hears what humans miss" - correlates audio patterns with viewer behavior
// ============================================================================

export const audioDna = pgTable('audio_dna', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // References
  packageId: text('package_id'), // references unity_content_packages
  videoId: text('video_id'), // YouTube video ID once uploaded
  filePath: text('file_path'), // Path to audio file analyzed

  // Tempo & Rhythm
  bpm: real('bpm'),
  bpmConfidence: real('bpm_confidence'), // 0-1
  beatCount: integer('beat_count'),
  beatRegularity: real('beat_regularity'), // 0-1, how consistent beat spacing is

  // Energy (RMS) - The "Loudness" signal
  energyMean: real('energy_mean'),
  energyVariance: real('energy_variance'), // High variance = dynamic audio (KEY RETENTION SIGNAL)
  energyDynamicRange: real('energy_dynamic_range'), // Max - Min
  energyCurve: varchar('energy_curve', { length: 20 }), // "front_loaded", "building", "flat", "peaks"

  // Hook Timing - Critical for retention
  firstEnergySpikeSeconds: real('first_energy_spike_seconds'), // When first major energy hit occurs
  hookEnergyRatio: real('hook_energy_ratio'), // Energy in first 4s vs rest (>1 = front-loaded hook)

  // Percussiveness (Zero-Crossing Rate) - The "punch"
  zcrMean: real('zcr_mean'),
  percussivenessScore: real('percussiveness_score'), // 0-1, higher = more punchy

  // Spectral Features - Brightness/Clarity
  spectralCentroidMean: real('spectral_centroid_mean'), // Higher = brighter/crisper
  brightnessScore: real('brightness_score'), // 0-1, normalized brightness
  spectralContrastMean: real('spectral_contrast_mean'),

  // Onset Detection (Hits/Attacks)
  onsetCount: integer('onset_count'),
  onsetDensity: real('onset_density'), // Events per second - pacing signal

  // MFCCs (Timbral fingerprint) - stored as JSON
  mfccMeans: text('mfcc_means'), // JSON array of first 5 coefficients

  // Section Structure
  numSections: integer('num_sections'),
  sectionBoundaries: text('section_boundaries'), // JSON array of timestamps

  // Key Detection
  keyEstimate: varchar('key_estimate', { length: 10 }),
  keyConfidence: real('key_confidence'),

  // Retention Prediction
  predictedHookSurvival: real('predicted_hook_survival'), // 0-1, based on first 4 seconds
  energySpikes: text('energy_spikes'), // JSON array of {time, magnitude}

  // DNA Scores (normalized 0-100)
  dnaScores: text('dna_scores'), // JSON with energy_score, rhythm_score, clarity_score, hook_score

  // Track Character
  trackCharacter: varchar('track_character', { length: 20 }), // "melodic", "rhythmic", "balanced"
  harmonicRatio: real('harmonic_ratio'), // % harmonic vs percussive

  // Duration
  durationSeconds: real('duration_seconds'),

  // Metadata
  analyzedAt: timestamp('analyzed_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertAudioDnaSchema = createInsertSchema(audioDna).omit({
  id: true,
  analyzedAt: true,
  createdAt: true,
});

export type AudioDna = typeof audioDna.$inferSelect;
export type InsertAudioDna = z.infer<typeof insertAudioDnaSchema>;

// Visual Intelligence Analysis - AI vision analysis of thumbnails and video frames
export const visualAnalysis = pgTable('visual_analysis', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id', { length: 20 }).notNull().unique(),
  title: text('title'),
  thumbnailUrl: text('thumbnail_url'),

  // Thumbnail Analysis Scores (0-100)
  thumbnailScore: real('thumbnail_score'),
  thumbnailComposition: real('thumbnail_composition'),
  thumbnailColorImpact: real('thumbnail_color_impact'),
  thumbnailTextReadability: real('thumbnail_text_readability'),
  thumbnailEmotionalImpact: real('thumbnail_emotional_impact'),
  thumbnailCuriosityGap: real('thumbnail_curiosity_gap'),

  // Thumbnail AI Analysis
  thumbnailAnalysis: json('thumbnail_analysis').$type<{
    dominantColors: string[];
    hasText: boolean;
    textContent?: string;
    facesDetected: number;
    emotionsDetected: string[];
    visualElements: string[];
    composition: string;
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
  }>(),

  // Video Frame Analysis (sampled frames)
  frameAnalysisComplete: boolean('frame_analysis_complete').default(false),
  framesAnalyzed: integer('frames_analyzed').default(0),

  // Visual Quality Scores (0-100)
  visualQualityScore: real('visual_quality_score'),
  cinematographyScore: real('cinematography_score'),
  colorGradingScore: real('color_grading_score'),
  motionQualityScore: real('motion_quality_score'),
  sceneVarietyScore: real('scene_variety_score'),

  // Video Frame AI Analysis
  frameAnalysis: json('frame_analysis').$type<{
    keyFrames: Array<{
      timestamp: number;
      description: string;
      quality: number;
      composition: string;
    }>;
    sceneTransitions: number;
    visualConsistency: number;
    dominantVisualStyle: string;
    colorPalette: string[];
    pacing: 'slow' | 'medium' | 'fast' | 'dynamic';
    cinematicTechniques: string[];
    strengths: string[];
    weaknesses: string[];
  }>(),

  // Content Match Analysis (thumbnail promise vs video content)
  contentMatchScore: real('content_match_score'),
  thumbnailVideoAlignment: json('thumbnail_video_alignment').$type<{
    alignmentScore: number;
    matchedElements: string[];
    mismatchedElements: string[];
    clickbaitRisk: 'low' | 'medium' | 'high';
    recommendation: string;
  }>(),

  // Audio/Narration Quality (from existing audio analysis)
  narrationQualityScore: real('narration_quality_score'),
  narrationAnalysis: json('narration_analysis').$type<{
    clarity: number;
    pacing: number;
    energy: number;
    emotionalRange: number;
    overallQuality: string;
  }>(),

  // Overall Visual Intelligence Score
  overallVisualScore: real('overall_visual_score'),
  visualTier: varchar('visual_tier', { length: 20 }),

  // Analysis Metadata
  analyzedAt: timestamp('analyzed_at').notNull().defaultNow(),
  analysisVersion: varchar('analysis_version', { length: 10 }).default('1.0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertVisualAnalysisSchema = createInsertSchema(visualAnalysis).omit({
  id: true,
  analyzedAt: true,
  createdAt: true,
});

export type VisualAnalysis = typeof visualAnalysis.$inferSelect;
export type InsertVisualAnalysis = z.infer<typeof insertVisualAnalysisSchema>;

// ============================================================================
// MULTIMODAL VECTOR MEMORY - pgvector embeddings for visual/acoustic data
// Stores 512-dim embeddings of visual quality and acoustic fingerprints
// Enables similarity search to find content with similar winning patterns
// ============================================================================

export const multimodalVectors = pgTable('multimodal_vectors', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  packageId: varchar('package_id').notNull(), // References unity_content_packages
  youtubeVideoId: varchar('youtube_video_id'), // Linked after upload

  vectorType: varchar('vector_type', { length: 20 }).notNull(), // 'visual' | 'acoustic' | 'combined'

  embedding: vector('embedding').notNull(), // 512-dimensional vector

  metadata: json('metadata').$type<{
    // Acoustic metadata
    bpm?: number;
    energyCurve?: string;
    hookEnergyRatio?: number;
    dnaScores?: {
      energy_score: number;
      rhythm_score: number;
      clarity_score: number;
      hook_score: number;
    };
    percussivenessScore?: number;
    brightnessScore?: number;
    firstEnergySpikeSeconds?: number;
    trackCharacter?: string;

    // Visual metadata
    compositionScore?: number;
    colorImpact?: number;
    emotionalImpact?: number;
    curiosityGap?: number;
    thumbnailScore?: number;
    visualQualityScore?: number;
    cinematographyScore?: number;
    dominantColors?: string[];
    visualElements?: string[];

    // Source info
    sourceType?: 'acoustic_fingerprint' | 'visual_analysis' | 'combined';
    analyzedAt?: string;
  }>(),

  // YouTube Performance Metrics (linked after upload)
  retentionRate: real('retention_rate'), // 0-100, from YouTube analytics
  ctr: real('ctr'), // Click-through rate
  viewCount: integer('view_count'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertMultimodalVectorSchema = createInsertSchema(multimodalVectors).omit({
  id: true,
  createdAt: true,
});

export type MultimodalVector = typeof multimodalVectors.$inferSelect;
export type InsertMultimodalVector = z.infer<typeof insertMultimodalVectorSchema>;

// ============================================================================
// CLIP ACCURACY REPORTS - Historical accuracy validation per clip
// Links to jobs and packages, stores per-clip validation results
// Data Flow: Job → Clip Generated → Frame Extraction → GPT-4o Vision → Report
// ============================================================================

export const clipAccuracyReports = pgTable('clip_accuracy_reports', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: varchar('job_id').notNull(), // References jobs table
  packageId: varchar('package_id').notNull(), // References unity_content_packages
  clipIndex: integer('clip_index').notNull(), // Which clip in the sequence (0-indexed)
  clipPath: text('clip_path'), // Path to the video clip file

  // Accuracy Scores (0-100)
  eraAccuracyScore: integer('era_accuracy_score').notNull(), // Clothing, architecture, technology match era
  characterConsistencyScore: integer('character_consistency_score').notNull(), // Same person throughout
  anachronismScore: integer('anachronism_score').notNull(), // 100 = no anachronisms, 0 = many wrong-era items
  continuityScore: integer('continuity_score').notNull(), // Story flow from previous clip
  overallScore: integer('overall_score').notNull(), // Weighted average

  // Pass/Fail
  passed: boolean('passed').notNull().default(false),

  // Detailed Analysis
  analysis: json('analysis').$type<{
    // Era Accuracy Details
    eraDetails: {
      expectedEra: string; // e.g., "Roman Empire, 100 BC - 44 BC"
      detectedElements: string[]; // What the AI saw
      correctElements: string[]; // Elements that match the era
      incorrectElements: string[]; // Elements that don't match
      suggestions: string[];
    };

    // Character Consistency
    characterDetails: {
      expectedCharacter: string; // e.g., "Julius Caesar"
      expectedAge: string; // e.g., "55 years old"
      expectedAppearance: string[]; // Key visual features
      detectedFeatures: string[]; // What was detected
      matchScore: number;
      issues: string[];
    };

    // Anachronisms Found
    anachronisms: Array<{
      item: string; // e.g., "wristwatch", "modern glasses"
      severity: 'critical' | 'major' | 'minor';
      frameTimestamp?: number;
      suggestion: string;
    }>;

    // Continuity with Previous Clip
    continuity: {
      previousClipSummary?: string;
      currentClipSummary: string;
      transitionSmooth: boolean;
      narrativeFlow: 'excellent' | 'good' | 'fair' | 'poor';
      issues: string[];
    };

    // Frame Analysis
    framesAnalyzed: number;
    keyFrameDescriptions: Array<{
      frameIndex: number;
      timestamp: number;
      description: string;
      issues: string[];
    }>;
  }>(),

  // Retry Tracking
  validationAttempt: integer('validation_attempt').default(1),
  regenerationRequested: boolean('regeneration_requested').default(false),

  // Pre/Post Regeneration Tracking
  preRegenerationScore: integer('pre_regeneration_score'), // Initial score before any regeneration
  wasRegenerated: boolean('was_regenerated').default(false), // Whether this clip was regenerated
  regenerationCount: integer('regeneration_count').default(0), // How many times regenerated

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertClipAccuracyReportSchema = createInsertSchema(clipAccuracyReports).omit({
  id: true,
  createdAt: true,
});

export type ClipAccuracyReport = typeof clipAccuracyReports.$inferSelect;
export type InsertClipAccuracyReport = z.infer<typeof insertClipAccuracyReportSchema>;

// ============================================================================
// TEMPORAL NARRATIVE ATOMS (TNA) BREAKDOWNS
// Stores parsed narrative units per package for coverage/coherence scoring
// ============================================================================

export const narrativeTnaBreakdowns = pgTable('narrative_tna_breakdowns', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  packageId: varchar('package_id').notNull().unique(), // References unity_content_packages
  lyrics: text('lyrics').notNull(), // Original lyrics used for breakdown

  // Array of Temporal Narrative Atoms
  tnas: json('tnas')
    .$type<
      Array<{
        id: string;
        index: number;
        type: 'beat' | 'action' | 'emotion' | 'transition' | 'hook';
        text: string;
        narrativeObjective: string;
        requiredElements: {
          characters: string[];
          props: string[];
          settings: string[];
        };
        emotionalArc: 'rising' | 'falling' | 'peak' | 'stable';
        dependencies: string[];
        timeWindow: {
          start: number;
          end: number;
        };
      }>
    >()
    .notNull(),

  totalDuration: decimal('total_duration', { precision: 10, scale: 2 }).notNull(),

  // Scoring results (updated after video generation)
  coverageScore: integer('coverage_score'), // 0-100
  coherenceScore: integer('coherence_score'), // 0-100

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertNarrativeTnaBreakdownSchema = createInsertSchema(narrativeTnaBreakdowns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NarrativeTnaBreakdown = typeof narrativeTnaBreakdowns.$inferSelect;
export type InsertNarrativeTnaBreakdown = z.infer<typeof insertNarrativeTnaBreakdownSchema>;

// ============================================================================
// NARRATIVE QUALITY RESULTS
// Stores NC (Narrative Coherence) and SF (Script Faithfulness) evaluation results
// ============================================================================

export const narrativeQualityResults = pgTable('narrative_quality_results', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  packageId: varchar('package_id').notNull().unique(),

  ncScore: integer('nc_score').notNull(),
  sfScore: integer('sf_score').notNull(),
  combinedScore: integer('combined_score').notNull(),
  tier: varchar('tier', { length: 20 }).notNull(),
  passesQualityGate: boolean('passes_quality_gate').notNull(),

  ncResult: json('nc_result')
    .$type<{
      score: number;
      components: {
        entityConsistency: number;
        temporalFlow: number;
        emotionalArc: number;
        transitionQuality: number;
      };
      violations: Array<{
        entityId: string;
        entityName: string;
        violationType: string;
        severity: 'critical' | 'major' | 'minor';
        clipIndices: number[];
        description: string;
        suggestion?: string;
      }>;
      issues: Array<{
        component: string;
        description: string;
        severity: 'critical' | 'major' | 'minor';
      }>;
    }>()
    .notNull(),

  sfResult: json('sf_result')
    .$type<{
      score: number;
      components: {
        coverageRate: number;
        accuracyRate: number;
        integrityScore: number;
      };
      uncoveredElements: string[];
      anachronisms: string[];
      issues: Array<{
        component: string;
        description: string;
        severity: 'critical' | 'major' | 'minor';
      }>;
    }>()
    .notNull(),

  summary: text('summary').notNull(),

  evaluatedAt: timestamp('evaluated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertNarrativeQualityResultSchema = createInsertSchema(narrativeQualityResults).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NarrativeQualityResult = typeof narrativeQualityResults.$inferSelect;
export type InsertNarrativeQualityResult = z.infer<typeof insertNarrativeQualityResultSchema>;

// ============================================================================
// STRATEGY ADJUSTMENTS - Self-reflection loop learning storage
// Stores learned adjustments from failure analysis for autonomous improvement
// ============================================================================

export const strategyAdjustments = pgTable('strategy_adjustments', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  failureType: varchar('failure_type', { length: 30 }).notNull(),
  rootCause: text('root_cause').notNull(),

  adjustmentType: varchar('adjustment_type', { length: 30 }).notNull(),
  adjustmentParams: json('adjustment_params').$type<Record<string, any>>().notNull(),
  adjustmentDescription: text('adjustment_description'),

  appliedCount: integer('applied_count').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  successRate: real('success_rate').notNull().default(0),

  confidence: integer('confidence').notNull().default(50),
  isActive: boolean('is_active').notNull().default(true),

  sourceJobId: varchar('source_job_id'),
  sourcePackageId: varchar('source_package_id'),
  affectedClips: json('affected_clips').$type<number[]>(),
  contributingFactors: json('contributing_factors').$type<string[]>(),
  severity: varchar('severity', { length: 10 }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertStrategyAdjustmentSchema = createInsertSchema(strategyAdjustments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type StrategyAdjustment = typeof strategyAdjustments.$inferSelect;
export type InsertStrategyAdjustment = z.infer<typeof insertStrategyAdjustmentSchema>;

// ============================================================================
// CONTEXT CONTRACTS - Full auditability trail linking clips to prompts, models, and decisions
// ============================================================================

export const contextContracts = pgTable(
  'context_contracts',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contractId: varchar('contract_id').notNull().unique(),
    packageId: varchar('package_id').notNull(),
    jobId: varchar('job_id').notNull(),
    clipIndex: integer('clip_index').notNull(),

    inputContext: json('input_context')
      .$type<{
        originalPrompt: string;
        tnaId?: string;
        lyricText?: string;
        timestamp: { start: number; end: number };
      }>()
      .notNull(),

    decisions: json('decisions')
      .$type<
        Array<{
          stage: 'prompt_generation' | 'caci_injection' | 'model_selection' | 'validation' | 'retry' | 'final';
          timestamp: string;
          model: string;
          modelVersion: string;
          input: string;
          output: string;
          rationale: string;
          confidence: number;
          alternatives?: Array<{ option: string; score: number; reason: string }>;
        }>
      >()
      .notNull(),

    appliedAdjustments: json('applied_adjustments')
      .$type<
        Array<{
          adjustmentId: string;
          type: string;
          description: string;
        }>
      >()
      .notNull(),

    output: json('output').$type<{
      finalPrompt: string;
      videoPath?: string;
      qualityScore?: number;
      narrativeScore?: number;
      passed: boolean;
    }>(),

    finalPrompt: text('final_prompt'),
    videoPath: text('video_path'),
    qualityScore: integer('quality_score'),
    narrativeScore: integer('narrative_score'),
    passed: boolean('passed').notNull().default(false),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
    totalDuration: integer('total_duration').notNull().default(0),
    apiCost: decimal('api_cost', { precision: 10, scale: 6 }).notNull().default('0'),
    retryCount: integer('retry_count').notNull().default(0),

    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    packageIdIdx: index('context_contracts_package_id_idx').on(table.packageId),
    jobIdIdx: index('context_contracts_job_id_idx').on(table.jobId),
    clipIndexIdx: index('context_contracts_clip_index_idx').on(table.clipIndex),
  }),
);

export const insertContextContractSchema = createInsertSchema(contextContracts).omit({
  id: true,
  updatedAt: true,
});

export type ContextContract = typeof contextContracts.$inferSelect;
export type InsertContextContract = z.infer<typeof insertContextContractSchema>;

// ============================================================================
// MODEL PERFORMANCE - Dynamic Model Router tracking for multi-model selection
// Tracks historical performance of GPT-4o, Gemini, and Claude for intelligent routing
// ============================================================================

export const modelPerformance = pgTable(
  'model_performance',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    model: varchar('model', { length: 50 }).notNull(),
    taskType: varchar('task_type', { length: 50 }).notNull(),
    totalCalls: integer('total_calls').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    totalLatency: real('total_latency').notNull().default(0),
    totalCost: decimal('total_cost', { precision: 10, scale: 6 }).notNull().default('0'),
    totalQualityScore: real('total_quality_score').notNull().default(0),
    alphaSuccess: real('alpha_success').notNull().default(1),
    betaFailure: real('beta_failure').notNull().default(1),
    lastUpdated: timestamp('last_updated').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    modelTaskIdx: index('model_performance_model_task_idx').on(table.model, table.taskType),
  }),
);

export const insertModelPerformanceSchema = createInsertSchema(modelPerformance).omit({
  id: true,
  createdAt: true,
});

export type ModelPerformance = typeof modelPerformance.$inferSelect;
export type InsertModelPerformance = z.infer<typeof insertModelPerformanceSchema>;

// ============================================================================
// SUNO TASKS - Persistent tracking of Suno music generation tasks
// Allows polling to resume after server restarts
// ============================================================================

export const sunoTasks = pgTable(
  'suno_tasks',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    packageId: varchar('package_id').notNull(),
    jobId: varchar('job_id'),
    taskId: varchar('task_id').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    figure: text('figure'),
    lyrics: text('lyrics'),
    styleTags: text('style_tags'),
    audioFilePath: text('audio_file_path'),
    duration: real('duration'),
    audioAnalysis: json('audio_analysis').$type<{
      bpm?: number;
      beats?: number[];
      duration?: number;
      energySamples?: Array<{ time: number; energy: number }>;
      forcedAlignment?: Array<{ word: string; start: number; end: number }>;
    }>(),
    acousticFingerprint: json('acoustic_fingerprint').$type<{
      bpm?: number;
      predicted_hook_survival?: number;
      dna_scores?: {
        energy_score?: number;
        rhythm_score?: number;
        hook_score?: number;
      };
    }>(),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').notNull().default(0),
    lastHeartbeat: timestamp('last_heartbeat').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    packageIdIdx: index('suno_tasks_package_id_idx').on(table.packageId),
    jobIdIdx: index('suno_tasks_job_id_idx').on(table.jobId),
    statusIdx: index('suno_tasks_status_idx').on(table.status),
  }),
);

export const insertSunoTaskSchema = createInsertSchema(sunoTasks).omit({
  id: true,
  createdAt: true,
  lastHeartbeat: true,
});

export type SunoTask = typeof sunoTasks.$inferSelect;
export type InsertSunoTask = z.infer<typeof insertSunoTaskSchema>;

// ============================================================================
// ORCHESTRATION REPORTS - Feedback Loop Orchestrator audit trail
// Tracks applied changes from learning systems to content generation
// ============================================================================

export const orchestrationReports = pgTable(
  'orchestration_reports',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
    appliedChanges: json('applied_changes').$type<{
      commentSentiment?: {
        characterPriorityUpdates?: Array<{ character: string; oldPriority: number; newPriority: number }>;
        requestsActedOn?: string[];
      };
      creativeAnalytics?: {
        thumbnailWeightUpdates?: Array<{ variant: string; oldWeight: number; newWeight: number }>;
        titlePatternUpdates?: string[];
        hookOptimizations?: string[];
      };
      featureCorrelation?: {
        bpmDirective?: { target: number; correlation: number };
        energyDirective?: { target: number; correlation: number };
        appliedToSuno?: boolean;
      };
      styleBandit?: {
        styleWeightUpdates?: Array<{ style: string; oldWeight: number; newWeight: number }>;
      };
    }>(),
    signals: json('signals').$type<{
      commentSentiment?: any;
      creativeAnalytics?: any;
      featureCorrelation?: any;
      styleBandit?: any;
    }>(),
    conflicts: json('conflicts').$type<
      Array<{
        type: string;
        description: string;
        resolution: string;
      }>
    >(),
    reasoning: text('reasoning'),
    executionTimeMs: integer('execution_time_ms'),
    status: varchar('status', { length: 20 }).notNull().default('success'), // 'success', 'partial', 'failed'
  },
  (table) => ({
    timestampIdx: index('orchestration_reports_timestamp_idx').on(table.timestamp),
    statusIdx: index('orchestration_reports_status_idx').on(table.status),
  }),
);

export const insertOrchestrationReportSchema = createInsertSchema(orchestrationReports).omit({
  id: true,
  timestamp: true,
});

export type OrchestrationReport = typeof orchestrationReports.$inferSelect;
export type InsertOrchestrationReport = z.infer<typeof insertOrchestrationReportSchema>;

// ============================================================================
// CONTENT PLANS - Content Strategy Agent daily plans
// Tracks what videos to create, when to post, and why
// ============================================================================

export const contentPlans = pgTable(
  'content_plans',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD
    videos: json('videos').$type<
      Array<{
        figure: string;
        theme: string;
        format: 'shorts' | 'long_form';
        scheduledTime: string;
        estimatedCost: number;
        reasoning: string;
        packageId?: string;
        jobId?: string;
        executed?: boolean;
      }>
    >(),
    totalCost: real('total_cost'),
    status: varchar('status', { length: 20 }).notNull().default('planned'), // 'planned', 'executing', 'completed', 'failed'
    executionStarted: timestamp('execution_started'),
    executionCompleted: timestamp('execution_completed'),
    videosCompleted: integer('videos_completed').default(0),
    videosFailed: integer('videos_failed').default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    createdBy: varchar('created_by', { length: 50 }).default('content-strategy-agent'),
  },
  (table) => ({
    dateIdx: index('content_plans_date_idx').on(table.date),
    statusIdx: index('content_plans_status_idx').on(table.status),
  }),
);

export const insertContentPlanSchema = createInsertSchema(contentPlans).omit({
  id: true,
  createdAt: true,
});

export type ContentPlan = typeof contentPlans.$inferSelect;
export type InsertContentPlan = z.infer<typeof insertContentPlanSchema>;

// ============================================================================
// SYSTEM CONFIGURATION - Dynamic agent configuration
// Key-value store for orchestrator and agent settings
// ============================================================================

export const systemConfiguration = pgTable(
  'system_configuration',
  {
    key: varchar('key', { length: 100 }).primaryKey(),
    value: json('value').$type<any>(),
    description: text('description'),
    updatedBy: varchar('updated_by', { length: 50 }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    updatedAtIdx: index('system_configuration_updated_at_idx').on(table.updatedAt),
  }),
);

export const insertSystemConfigurationSchema = createInsertSchema(systemConfiguration).omit({
  createdAt: true,
  updatedAt: true,
});

export type SystemConfiguration = typeof systemConfiguration.$inferSelect;
export type InsertSystemConfiguration = z.infer<typeof insertSystemConfigurationSchema>;

// ============================================================================
// ERROR MONITORING & AUTO-FIX SYSTEM
// Tables for error capture, diagnosis, and automatic fixing
// ============================================================================

export const errorReports = pgTable(
  'error_reports',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    errorType: varchar('error_type', { length: 50 }).notNull(),
    errorMessage: text('error_message').notNull(),
    severity: varchar('severity', { length: 20 }).notNull(), // 'low', 'medium', 'high', 'critical'
    context: json('context').$type<{
      service: string;
      operation: string;
      jobId?: string;
      packageId?: string;
      timestamp: Date;
      stackTrace?: string;
      metadata?: any;
    }>(),
    fixAttempted: boolean('fix_attempted').notNull().default(false),
    fixSucceeded: boolean('fix_succeeded'),
    fixStrategy: text('fix_strategy'),
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    firstSeen: timestamp('first_seen').notNull().defaultNow(),
    lastSeen: timestamp('last_seen').notNull().defaultNow(),
    status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'fixed', 'ignored', 'escalated'
  },
  (table) => ({
    severityIdx: index('error_reports_severity_idx').on(table.severity),
    statusIdx: index('error_reports_status_idx').on(table.status),
    lastSeenIdx: index('error_reports_last_seen_idx').on(table.lastSeen),
  }),
);

export const autoFixConfigs = pgTable(
  'auto_fix_configs',
  {
    id: serial('id').primaryKey(),
    errorType: varchar('error_type', { length: 50 }).notNull(),
    service: varchar('service', { length: 100 }).notNull(),
    configKey: varchar('config_key', { length: 100 }).notNull(),
    configValue: text('config_value'),
    appliedAt: timestamp('applied_at').notNull().defaultNow(),
  },
  (table) => ({
    errorTypeIdx: index('auto_fix_configs_error_type_idx').on(table.errorType),
    serviceIdx: index('auto_fix_configs_service_idx').on(table.service),
  }),
);

export const learnedFixes = pgTable(
  'learned_fixes',
  {
    errorPattern: varchar('error_pattern', { length: 200 }).primaryKey(),
    fixStrategy: json('fix_strategy').$type<{
      strategy: string;
      description: string;
      actions: any[];
      confidence: number;
      estimatedTime: string;
    }>(),
    confidence: real('confidence').notNull(),
    successCount: integer('success_count').notNull().default(1),
    lastUsed: timestamp('last_used').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    confidenceIdx: index('learned_fixes_confidence_idx').on(table.confidence),
    lastUsedIdx: index('learned_fixes_last_used_idx').on(table.lastUsed),
  }),
);

export const agentJobs = pgTable(
  'agent_jobs',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    agentType: varchar('agent_type', { length: 50 }).notNull(), // 'goal', 'content-strategy', 'self-reflection', 'trend-watcher', 'auto-fix'
    task: text('task').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'running', 'completed', 'failed'
    input: json('input').$type<any>(),
    output: json('output').$type<any>(),
    metrics: json('metrics').$type<{
      duration?: number;
      cost?: number;
      tokensUsed?: number;
      modelsUsed?: string[];
    }>(),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    agentTypeIdx: index('agent_jobs_agent_type_idx').on(table.agentType),
    statusIdx: index('agent_jobs_status_idx').on(table.status),
    createdAtIdx: index('agent_jobs_created_at_idx').on(table.createdAt),
  }),
);

export const agentLearnings = pgTable(
  'agent_learnings',
  {
    id: serial('id').primaryKey(),
    agentType: varchar('agent_type', { length: 50 }).notNull(),
    patternName: varchar('pattern_name', { length: 100 }).notNull(),
    patternDescription: text('pattern_description'),
    strategy: json('strategy').$type<any>(),
    confidence: real('confidence').notNull(),
    successRate: real('success_rate'),
    applicationCount: integer('application_count').notNull().default(1),
    lastApplied: timestamp('last_applied').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    agentTypeIdx: index('agent_learnings_agent_type_idx').on(table.agentType),
    confidenceIdx: index('agent_learnings_confidence_idx').on(table.confidence),
  }),
);

export const errorPatterns = pgTable(
  'error_patterns',
  {
    id: serial('id').primaryKey(),
    pattern: text('pattern').notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    commonCauses: json('common_causes').$type<string[]>(),
    suggestedFix: text('suggested_fix'),
    confidence: real('confidence').notNull(),
    occurrences: integer('occurrences').notNull().default(1),
    lastSeen: timestamp('last_seen').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index('error_patterns_category_idx').on(table.category),
    confidenceIdx: index('error_patterns_confidence_idx').on(table.confidence),
  }),
);

// Thumbnail CTR Predictions - Track thumbnail analysis and actual performance
export const thumbnailCtrPredictions = pgTable(
  'thumbnail_ctr_predictions',
  {
    id: serial('id').primaryKey(),
    jobId: varchar('job_id').notNull(),
    youtubeVideoId: varchar('youtube_video_id', { length: 20 }),
    thumbnailPath: text('thumbnail_path').notNull(),
    predictedCtr: real('predicted_ctr').notNull(),
    predictionScore: integer('prediction_score').notNull(),
    confidence: real('confidence').notNull(),
    modelVersion: varchar('model_version', { length: 50 }).notNull(),
    breakdown: json('breakdown')
      .$type<{
        textReadability: number;
        visualAppeal: number;
        emotionTriggers: number;
        clickabilityFactors: number;
        brandConsistency: number;
      }>()
      .notNull(),
    features: json('features')
      .$type<{
        facePresence: number;
        textOverlay: number;
        contrastLevel: number;
        colorVibrancy: number;
        curiosityGap: number;
        overallScore: number;
      }>()
      .notNull(),
    suggestions: json('suggestions').$type<string[]>().notNull(),
    shouldRegenerate: boolean('should_regenerate').notNull().default(false),
    actualCtr: real('actual_ctr'),
    actualImpressions: integer('actual_impressions'),
    actualClicks: integer('actual_clicks'),
    predictionError: real('prediction_error'),
    accuracyBucket: varchar('accuracy_bucket', { length: 20 }),
    wasRegenerated: boolean('was_regenerated').notNull().default(false),
    regenerationReason: text('regeneration_reason'),
    predictedAt: timestamp('predicted_at').notNull().defaultNow(),
    actualDataReceivedAt: timestamp('actual_data_received_at'),
  },
  (table) => ({
    jobIdIdx: index('thumbnail_ctr_job_idx').on(table.jobId),
    videoIdIdx: index('thumbnail_ctr_video_idx').on(table.youtubeVideoId),
    scoreIdx: index('thumbnail_ctr_score_idx').on(table.predictionScore),
    accuracyIdx: index('thumbnail_ctr_accuracy_idx').on(table.accuracyBucket),
  }),
);

export const alerts = pgTable(
  'alerts',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    type: varchar('type', { length: 50 }).notNull(), // 'repeated_error', 'critical_error', 'high_failure_rate', 'rate_limit', 'database_connection', 'cost_overrun', 'system_unhealthy', 'background_loop_dead', 'disk_space_critical', 'cost_tracking_gap'
    severity: varchar('severity', { length: 20 }).notNull(), // 'low', 'medium', 'high', 'critical'
    title: varchar('title', { length: 200 }).notNull(),
    message: text('message').notNull(),
    metadata: json('metadata').$type<{
      errorId?: string;
      errorType?: string;
      service?: string;
      occurrenceCount?: number;
      failureRate?: number;
      costAmount?: number;
      budgetAmount?: number;
      timeWindow?: string;
      affectedJobs?: string[];
      threshold?: number;
      currentValue?: number;
    }>(),
    resolved: boolean('resolved').notNull().default(false),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: varchar('resolved_by', { length: 100 }),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    // Deduplication fields
    deduplicationKey: varchar('deduplication_key', { length: 200 }).notNull(),
    lastTriggered: timestamp('last_triggered').notNull().defaultNow(),
    triggerCount: integer('trigger_count').notNull().default(1),
  },
  (table) => ({
    typeIdx: index('alerts_type_idx').on(table.type),
    severityIdx: index('alerts_severity_idx').on(table.severity),
    resolvedIdx: index('alerts_resolved_idx').on(table.resolved),
    createdAtIdx: index('alerts_created_at_idx').on(table.createdAt),
    deduplicationIdx: index('alerts_deduplication_idx').on(table.deduplicationKey),
    lastTriggeredIdx: index('alerts_last_triggered_idx').on(table.lastTriggered),
  }),
);

// System Health Monitoring Tables
export const systemHealthSnapshots = pgTable(
  'system_health_snapshots',
  {
    id: serial('id').primaryKey(),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
    overallStatus: varchar('overall_status', { length: 20 }).notNull(), // 'healthy', 'degraded', 'unhealthy'
    coreApisStatus: json('core_apis_status').$type<any[]>(),
    backgroundLoopsStatus: json('background_loops_status').$type<any[]>(),
    systemResourcesStatus: json('system_resources_status').$type<any[]>(),
    databaseStatus: json('database_status').$type<any>(),
    jobQueueStatus: json('job_queue_status').$type<any>(),
    errorStatus: json('error_status').$type<any>(),
    criticalIssues: json('critical_issues').$type<string[]>(),
  },
  (table) => ({
    timestampIdx: index('system_health_timestamp_idx').on(table.timestamp),
    overallStatusIdx: index('system_health_overall_status_idx').on(table.overallStatus),
  }),
);

// Pipeline Orchestrator Tables
export const pipelineState = pgTable(
  'pipeline_state',
  {
    id: serial('id').primaryKey(),
    stage: varchar('stage', { length: 50 }).notNull(), // 'trendDiscovery', 'topicPoolRefill', 'dailyVideoGeneration', etc.
    status: varchar('status', { length: 20 }).notNull(), // 'running', 'completed', 'failed', 'blocked'
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    error: text('error'),
    metadata: json('metadata').$type<{
      jobIds?: string[];
      topicsGenerated?: number;
      videosCreated?: number;
      duration?: number;
      stack?: string;
    }>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    stageIdx: index('pipeline_state_stage_idx').on(table.stage),
    statusIdx: index('pipeline_state_status_idx').on(table.status),
    createdAtIdx: index('pipeline_state_created_at_idx').on(table.createdAt),
  }),
);

export const pipelineLocks = pgTable(
  'pipeline_locks',
  {
    resource: varchar('resource', { length: 100 }).primaryKey(),
    holder: varchar('holder', { length: 100 }).notNull(),
    acquiredAt: timestamp('acquired_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => ({
    expiresAtIdx: index('pipeline_locks_expires_at_idx').on(table.expiresAt),
  }),
);

export const insertErrorReportSchema = createInsertSchema(errorReports).omit({
  firstSeen: true,
  lastSeen: true,
});

export const insertAgentJobSchema = createInsertSchema(agentJobs).omit({
  createdAt: true,
});

export const insertAgentLearningSchema = createInsertSchema(agentLearnings).omit({
  id: true,
  createdAt: true,
  lastApplied: true,
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  createdAt: true,
  lastTriggered: true,
});

export const insertThumbnailCtrPredictionSchema = createInsertSchema(thumbnailCtrPredictions).omit({
  id: true,
  predictedAt: true,
  actualDataReceivedAt: true,
});

export type ErrorReport = typeof errorReports.$inferSelect;
export type InsertErrorReport = z.infer<typeof insertErrorReportSchema>;
export type AgentJob = typeof agentJobs.$inferSelect;
export type InsertAgentJob = z.infer<typeof insertAgentJobSchema>;
export type AgentLearning = typeof agentLearnings.$inferSelect;
export type InsertAgentLearning = z.infer<typeof insertAgentLearningSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type ThumbnailCtrPrediction = typeof thumbnailCtrPredictions.$inferSelect;
export type PipelineState = typeof pipelineState.$inferSelect;
export type PipelineLock = typeof pipelineLocks.$inferSelect;
export type InsertThumbnailCtrPrediction = z.infer<typeof insertThumbnailCtrPredictionSchema>;

// ============================================================================
// TRENDING TOPICS DISCOVERY - Real-time trend tracking from multiple sources
// Discovers viral historical topics with search opportunity analysis
// ============================================================================

export const trendingTopics = pgTable(
  'trending_topics',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    keyword: text('keyword').notNull(),
    normalizedKeyword: text('normalized_keyword').notNull(),
    source: varchar('source', { length: 50 }).notNull(), // 'youtube_data', 'google_trends', 'reddit', 'twitter'

    // Search Opportunity Metrics
    searchVolume: integer('search_volume'),
    competitionLevel: varchar('competition_level', { length: 20 }), // 'low', 'medium', 'high'
    searchContentRatio: decimal('search_content_ratio', { precision: 10, scale: 2 }), // Higher = better opportunity
    trendVelocity: integer('trend_velocity'), // 0-100 (100 = rapidly rising)

    // Content Analysis
    suggestedAngle: text('suggested_angle'), // AI-generated viral angle
    historicalCategory: varchar('historical_category', { length: 20 }), // 'person', 'place', 'thing', 'event'
    relatedKeywords: text('related_keywords').array(),
    estimatedViralPotential: integer('estimated_viral_potential'), // 0-100

    // Source-Specific Metadata
    sourceMetadata: json('source_metadata').$type<{
      // YouTube Data API
      youtubeVideoCount?: number;
      averageViews?: number;
      topChannels?: string[];
      recentUploadCount?: number;

      // Google Trends
      interestScore?: number;
      isRising?: boolean;
      relatedTopics?: string[];
      formattedTraffic?: string;

      // Reddit
      subreddit?: string;
      upvotes?: number;
      comments?: number;
      redditUrl?: string;

      // Twitter/X
      tweetCount?: number;
      engagement?: number;
      hashtags?: string[];
    }>(),

    // Historical Context
    whyTrending: text('why_trending'), // Why this topic is trending now
    contentGap: text('content_gap'), // What's missing in existing coverage

    // Lifecycle Management
    status: varchar('status', { length: 20 }).default('discovered'), // 'discovered', 'queued', 'used', 'stale'
    usedInPackageId: varchar('used_in_package_id'), // References unity_content_packages
    discoveredAt: timestamp('discovered_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'), // Trends have shelf life (default 14 days)
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    sourceIdx: index('trending_topics_source_idx').on(table.source),
    statusIdx: index('trending_topics_status_idx').on(table.status),
    viralPotentialIdx: index('trending_topics_viral_potential_idx').on(table.estimatedViralPotential),
    discoveredAtIdx: index('trending_topics_discovered_at_idx').on(table.discoveredAt),
    expiresAtIdx: index('trending_topics_expires_at_idx').on(table.expiresAt),
    normalizedKeywordIdx: index('trending_topics_normalized_keyword_idx').on(table.normalizedKeyword),
  }),
);

export const insertTrendingTopicSchema = createInsertSchema(trendingTopics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TrendingTopic = typeof trendingTopics.$inferSelect;
export type InsertTrendingTopic = z.infer<typeof insertTrendingTopicSchema>;

// Explored Topics - Unlimited Topic Explorer Phase 1
// Tracks discovered historical topics with full 5W1H context
export const exploredTopics = pgTable(
  'explored_topics',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Core Identity
    topicType: varchar('topic_type', { length: 20 }).notNull(), // 'person', 'place', 'thing'
    primaryName: text('primary_name').notNull(),
    normalizedName: text('normalized_name').notNull(),

    // Complete 5W1H Context (JSON structure for rich context)
    fiveW1H: json('five_w1h')
      .$type<{
        who: {
          mainSubject: string;
          keyPeople: string[];
        };
        what: {
          primaryEvent: string;
          significance: string;
        };
        why: {
          motivation: string;
          modernRelevance: string;
        };
        where: {
          primaryLocation: string;
          region: string;
        };
        when: {
          era: string; // 'ancient', 'medieval', 'renaissance', 'modern'
          timePeriod: string;
        };
        how: {
          mechanism: string;
        };
      }>()
      .notNull(),

    // Viral Scoring
    viralPotential: integer('viral_potential').notNull(), // 0-100
    discoveryAngle: text('discovery_angle').notNull(), // The hook/angle for the story
    visualAppeal: integer('visual_appeal'), // 0-100 (how cinematic/visual)

    // Source Tracking (for trend integration)
    sourceMetadata: json('source_metadata').$type<{
      searchVolume?: number;
      competitionLevel?: string;
      trendVelocity?: number;
      source?: string; // 'youtube_data', 'google_trends', 'reddit', 'twitter'
      whyTrending?: string;
    }>(), // null = AI-discovered, non-null = trend-based

    // Status Tracking
    status: varchar('status', { length: 20 }).notNull().default('discovered'), // 'discovered', 'queued', 'used', 'rejected'
    usedInPackageId: varchar('used_in_package_id'), // References unity_content_packages
    rejectionReason: text('rejection_reason'), // If rejected, why?

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    usedAt: timestamp('used_at'), // When it was used for content generation
  },
  (table) => ({
    typeIdx: index('explored_topics_type_idx').on(table.topicType),
    statusIdx: index('explored_topics_status_idx').on(table.status),
    viralPotentialIdx: index('explored_topics_viral_potential_idx').on(table.viralPotential),
    createdAtIdx: index('explored_topics_created_at_idx').on(table.createdAt),
    normalizedNameIdx: index('explored_topics_normalized_name_idx').on(table.normalizedName),
  }),
);

export const insertExploredTopicSchema = createInsertSchema(exploredTopics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ExploredTopic = typeof exploredTopics.$inferSelect;
export type InsertExploredTopic = z.infer<typeof insertExploredTopicSchema>;

// ============================================================================
// CONTENT CLUSTERING SYSTEM - Schema
// Discovers performance archetypes through DBSCAN unsupervised learning
// DORMANT until 200 chill + 200 trap videos collected
// ============================================================================

export const contentClusters = pgTable('content_clusters', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Cluster identity
  name: varchar('name', { length: 200 }),
  contentType: varchar('content_type', { length: 50 }).notNull(),
  clusterIndex: integer('cluster_index').notNull(),

  // Centroid features (the "average" of this cluster)
  centroid: json('centroid').notNull(),

  // Performance profile
  avgRetention: real('avg_retention'),
  avgViews: real('avg_views'),
  avgCtr: real('avg_ctr'),
  avgLikes: real('avg_likes'),

  // Cluster health
  memberCount: integer('member_count').notNull().default(0),
  density: real('density'),
  silhouetteScore: real('silhouette_score'),

  // Auto-generated description
  description: varchar('description', { length: 500 }),

  // Metadata
  isActive: boolean('is_active').notNull().default(true),
  discoveredAt: timestamp('discovered_at').notNull().defaultNow(),
  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
});

export const videoFeatureVectors = pgTable('video_feature_vectors', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Link to video
  videoId: varchar('video_id', { length: 100 }).notNull().unique(),
  youtubeVideoId: varchar('youtube_video_id', { length: 50 }),
  contentType: varchar('content_type', { length: 50 }).notNull(),

  // Audio features (from librosa)
  bpm: real('bpm'),
  energy: real('energy'),
  spectralCentroid: real('spectral_centroid'),
  spectralRolloff: real('spectral_rolloff'),
  zeroCrossingRate: real('zero_crossing_rate'),
  mfccMean: json('mfcc_mean'),
  chromaMean: json('chroma_mean'),

  // Temporal features
  postingHour: integer('posting_hour'),
  postingDayOfWeek: integer('posting_day_of_week'),
  videoDuration: real('video_duration'),

  // Style features
  styleTags: json('style_tags'),
  sunoStyle: varchar('suno_style', { length: 200 }),

  // Thumbnail features
  thumbnailDominantHue: real('thumbnail_dominant_hue'),
  thumbnailBrightness: real('thumbnail_brightness'),
  thumbnailSaturation: real('thumbnail_saturation'),

  // Title features
  titleLength: integer('title_length'),
  titleWordCount: integer('title_word_count'),

  // Retention curve shape
  retention10pct: real('retention_10pct'),
  retention25pct: real('retention_25pct'),
  retention50pct: real('retention_50pct'),
  retention75pct: real('retention_75pct'),
  retention90pct: real('retention_90pct'),

  // Performance outcomes
  views: integer('views'),
  likes: integer('likes'),
  ctr: real('ctr'),
  avgRetention: real('avg_retention'),

  // Cluster assignment
  clusterId: varchar('cluster_id', { length: 100 }),
  isNoise: boolean('is_noise').default(false),
  clusterConfidence: real('cluster_confidence'),

  // Metadata
  featuresExtractedAt: timestamp('features_extracted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const clusteringSystemState = pgTable('clustering_system_state', {
  id: varchar('id').primaryKey().default('singleton'),

  // Activation thresholds
  chillCount: integer('chill_count').notNull().default(0),
  trapCount: integer('trap_count').notNull().default(0),
  chillThreshold: integer('chill_threshold').notNull().default(200),
  trapThreshold: integer('trap_threshold').notNull().default(200),

  // System state
  isActive: boolean('is_active').notNull().default(false),
  activatedAt: timestamp('activated_at'),

  // Last run info
  lastRunAt: timestamp('last_run_at'),
  lastRunClustersFound: integer('last_run_clusters_found'),
  lastRunNoisePoints: integer('last_run_noise_points'),
  lastRunSilhouetteScore: real('last_run_silhouette_score'),

  // Auto-tuned hyperparameters
  currentEpsilon: real('current_epsilon').default(0.5),
  currentMinSamples: integer('current_min_samples').default(5),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const clusteringRuns = pgTable('clustering_runs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Run parameters
  contentType: varchar('content_type', { length: 50 }).notNull(),
  epsilon: real('epsilon').notNull(),
  minSamples: integer('min_samples').notNull(),

  // Results
  clustersFound: integer('clusters_found').notNull(),
  noisePoints: integer('noise_points').notNull(),
  totalPoints: integer('total_points').notNull(),
  silhouetteScore: real('silhouette_score'),

  // Cluster breakdown
  clusterSizes: json('cluster_sizes'),

  runAt: timestamp('run_at').notNull().defaultNow(),
});

/**
 * @deprecated Gumroad integration removed 2026-01-26. Table kept for historical data only.
 * Gumroad Product Slots - Pre-created products in Gumroad that can be assigned to beats
 */
export const gumroadProductSlots = pgTable('gumroad_product_slots', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Gumroad product info
  gumroadProductId: varchar('gumroad_product_id', { length: 100 }).notNull().unique(),
  slotNumber: integer('slot_number').notNull(), // e.g. 1-30 for "Beat Slot #1"

  // Assignment status
  status: varchar('status', { length: 20 }).notNull().default('available'), // 'available', 'assigned', 'pending_upload'
  assignedJobId: varchar('assigned_job_id', { length: 100 }), // Which beat/job is assigned to this slot
  assignedAt: timestamp('assigned_at'),

  // Product metadata (updated when assigned)
  currentBeatName: text('current_beat_name'),
  currentPrice: decimal('current_price', { precision: 10, scale: 2 }),
  gumroadUrl: text('gumroad_url'), // Short URL for the product

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** @deprecated Gumroad integration removed 2026-01-26 */
export type GumroadProductSlot = typeof gumroadProductSlots.$inferSelect;
/** @deprecated Gumroad integration removed 2026-01-26 */
export type InsertGumroadProductSlot = typeof gumroadProductSlots.$inferInsert;

export type ContentCluster = typeof contentClusters.$inferSelect;
export type InsertContentCluster = typeof contentClusters.$inferInsert;
export type VideoFeatureVector = typeof videoFeatureVectors.$inferSelect;
export type InsertVideoFeatureVector = typeof videoFeatureVectors.$inferInsert;
export type ClusteringSystemState = typeof clusteringSystemState.$inferSelect;
export type ClusteringRun = typeof clusteringRuns.$inferSelect;

// ============================================================================
// MULTI-TENANT SAAS PLATFORM TABLES
// ============================================================================

// Users table - stores authenticated users (Google OAuth)
export const users = pgTable(
  'users',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Google OAuth fields
    googleId: varchar('google_id', { length: 100 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 255 }),
    avatarUrl: text('avatar_url'),

    // Free credits system (deprecated - use balance instead)
    freeBeatCreditsRemaining: integer('free_beat_credits_remaining').notNull().default(5),

    // Dollar balance system
    balance: decimal('balance', { precision: 10, scale: 2 }).notNull().default('12.50'), // Current $ balance (new users get $12.50 = 5 beats)
    totalSpent: decimal('total_spent', { precision: 10, scale: 2 }).notNull().default('0.00'), // Lifetime spend

    // Stripe customer ID (for payments)
    stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),

    // Subscription tracking
    subscriptionTier: varchar('subscription_tier', { length: 50 }).notNull().default('free'), // 'free', 'distribution', 'pro', 'admin' (no billing)
    subscriptionStatus: varchar('subscription_status', { length: 50 }), // 'active', 'canceled', 'past_due', 'unpaid', null
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
    subscriptionCurrentPeriodEnd: timestamp('subscription_current_period_end'),

    // Account status
    isActive: boolean('is_active').notNull().default(true),
    isBanned: boolean('is_banned').notNull().default(false),
    isAdmin: boolean('is_admin').notNull().default(false),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    googleIdIdx: index('users_google_id_idx').on(table.googleId),
    emailIdx: index('users_email_idx').on(table.email),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// User credits table - tracks credit purchases and usage
export const userCredits = pgTable(
  'user_credits',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    userId: varchar('user_id', { length: 100 }).notNull(),

    // Credit amount (can be fractional for partial usage)
    creditsAmount: decimal('credits_amount', { precision: 10, scale: 2 }).notNull(),

    // Source of credits
    source: varchar('source', { length: 50 }).notNull(), // 'signup_bonus', 'purchase', 'refund', 'promo', 'admin'

    // Reference to source transaction
    stripeChargeId: varchar('stripe_charge_id', { length: 100 }),
    refJobId: varchar('ref_job_id', { length: 100 }), // If refund from a job

    // Expiration (optional)
    expiresAt: timestamp('expires_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('user_credits_user_id_idx').on(table.userId),
  }),
);

export type UserCredit = typeof userCredits.$inferSelect;
export type InsertUserCredit = typeof userCredits.$inferInsert;

// User payment methods table - stores Stripe payment method IDs
export const userPaymentMethods = pgTable(
  'user_payment_methods',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    userId: varchar('user_id', { length: 100 }).notNull(),

    // Stripe payment method ID
    stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 100 }).notNull(),

    // Payment method details (for display)
    type: varchar('type', { length: 20 }).notNull(), // 'card', 'bank_account'
    last4: varchar('last4', { length: 4 }),
    brand: varchar('brand', { length: 50 }), // 'visa', 'mastercard', etc.
    expiryMonth: integer('expiry_month'),
    expiryYear: integer('expiry_year'),

    // Status
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('user_payment_methods_user_id_idx').on(table.userId),
  }),
);

export type UserPaymentMethod = typeof userPaymentMethods.$inferSelect;
export type InsertUserPaymentMethod = typeof userPaymentMethods.$inferInsert;

// Beat Store Listings - tracks beats listed for sale
export const beatStoreListings = pgTable(
  'beat_store_listings',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Ownership
    userId: varchar('user_id', { length: 100 }).notNull(),
    jobId: varchar('job_id', { length: 100 }), // Which job generated this beat (nullable for external uploads)

    // Beat source - determines commission
    isGenerated: boolean('is_generated').notNull().default(false), // true = 0% commission, false = 10% commission
    source: varchar('source', { length: 50 }).notNull().default('external'), // 'generated', 'external'

    // Beat details
    beatName: text('beat_name').notNull(),
    description: text('description'),
    priceUSD: decimal('price_usd', { precision: 10, scale: 2 }).notNull(),

    // Stripe integration
    stripeProductId: varchar('stripe_product_id', { length: 100 }).notNull(),
    stripePriceId: varchar('stripe_price_id', { length: 100 }).notNull(),
    stripePaymentLinkUrl: text('stripe_payment_link_url').notNull(),

    // Cloudflare R2 storage (optional - can use direct URLs instead)
    r2Key: varchar('r2_key', { length: 500 }), // Path in R2 bucket (nullable for direct URLs)
    fileSizeBytes: decimal('file_size_bytes', { precision: 20, scale: 0 }),

    // Analytics
    views: integer('views').notNull().default(0),
    purchases: integer('purchases').notNull().default(0),
    totalRevenueUSD: decimal('total_revenue_usd', { precision: 10, scale: 2 }).notNull().default('0'),

    // Status
    active: boolean('active').notNull().default(true),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('beat_store_listings_user_id_idx').on(table.userId),
    jobIdIdx: index('beat_store_listings_job_id_idx').on(table.jobId),
  }),
);

export type BeatStoreListing = typeof beatStoreListings.$inferSelect;
export type InsertBeatStoreListing = typeof beatStoreListings.$inferInsert;

// Beat Store Purchases - tracks beat sales
export const beatStorePurchases = pgTable(
  'beat_store_purchases',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    listingId: varchar('listing_id', { length: 100 }).notNull(),

    // Stripe session details
    stripeSessionId: varchar('stripe_session_id', { length: 100 }).notNull().unique(),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),

    // Purchase amounts
    amountUSD: decimal('amount_usd', { precision: 10, scale: 2 }).notNull(),
    platformFeeUSD: decimal('platform_fee_usd', { precision: 10, scale: 2 }).notNull().default('0'), // 0% for generated, 10% for external
    platformFeePercent: decimal('platform_fee_percent', { precision: 5, scale: 2 }).notNull().default('0'), // 0 or 10

    // Delivery
    deliveredAt: timestamp('delivered_at'),
    downloadUrl: text('download_url'), // Presigned R2 URL (expires)

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    listingIdIdx: index('beat_store_purchases_listing_id_idx').on(table.listingId),
    stripeSessionIdIdx: index('beat_store_purchases_stripe_session_id_idx').on(table.stripeSessionId),
  }),
);

export type BeatStorePurchase = typeof beatStorePurchases.$inferSelect;
export type InsertBeatStorePurchase = typeof beatStorePurchases.$inferInsert;

// ============================================================================
// OnlySocials Configuration - Cross-posting to multiple social platforms
// ============================================================================
export const onlySocialsConfig = pgTable(
  'only_socials_config',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 100 }), // User this config belongs to (nullable for system-wide)

    // OnlySocials API credentials
    workspaceUuid: varchar('workspace_uuid', { length: 100 }).notNull(),
    accessToken: text('access_token').notNull(),

    // Connected accounts (cached from OnlySocials API)
    connectedAccounts: json('connected_accounts').$type<
      Array<{
        accountId: string;
        username: string;
        platformType: string; // 'instagram', 'tiktok', 'facebook', 'twitter', 'linkedin', 'youtube', etc.
        isActive: boolean;
      }>
    >(),

    // Default cross-posting settings
    autoCrossPostEnabled: boolean('auto_cross_post_enabled').default(false).notNull(),
    defaultPlatforms: json('default_platforms').$type<string[]>(), // Default platforms to post to
    defaultInstagramType: varchar('default_instagram_type', { length: 20 }).default('reel'), // 'post', 'reel', 'story'
    defaultTags: json('default_tags').$type<string[]>(), // Default tags to apply

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('only_socials_config_user_id_idx').on(table.userId),
  }),
);

export type OnlySocialsConfig = typeof onlySocialsConfig.$inferSelect;
export type InsertOnlySocialsConfig = typeof onlySocialsConfig.$inferInsert;

// ============================================================================
// OnlySocials Account Mapping - Maps internal account IDs to platform accounts
// ============================================================================
export const onlySocialsAccountMapping = pgTable(
  'only_socials_account_mapping',
  {
    id: serial('id').primaryKey(),
    configId: integer('config_id').notNull(), // References only_socials_config

    accountId: varchar('account_id', { length: 100 }).notNull(), // OnlySocials account ID
    platformType: varchar('platform_type', { length: 50 }).notNull(), // 'instagram', 'tiktok', etc.
    username: varchar('username', { length: 255 }),

    // Settings per account
    isEnabled: boolean('is_enabled').default(true).notNull(),
    postAsReel: boolean('post_as_reel').default(true), // For Instagram

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    configIdIdx: index('only_socials_account_mapping_config_id_idx').on(table.configId),
    accountIdIdx: index('only_socials_account_mapping_account_id_idx').on(table.accountId),
  }),
);

export type OnlySocialsAccountMapping = typeof onlySocialsAccountMapping.$inferSelect;
export type InsertOnlySocialsAccountMapping = typeof onlySocialsAccountMapping.$inferInsert;
