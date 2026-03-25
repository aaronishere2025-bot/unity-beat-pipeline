/**
 * Audio Analysis Service
 *
 * Analyzes audio files using Python/librosa to extract:
 * - Tempo (BPM)
 * - Beat timestamps
 * - Energy levels over time
 * - Song sections (intro, verse, chorus, bridge, outro)
 * - Energy peaks and dips
 *
 * Then uses OpenAI to generate music-aware VEO prompts.
 *
 * OPTIMIZED: Caches analysis results by audio file hash for faster regenerations.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { openaiService, transcribeAudioWithTimestamps } from './openai-service';
import {
  ENERGY_TO_KEYWORDS,
  SECTION_TEMPLATES,
  KEY_TO_COLORS,
  BRIGHTNESS_TO_LIGHTING,
} from '../config/video-constants';
import { TempPaths } from '../utils/temp-file-manager';

const execAsync = promisify(exec);

// ============================================
// LIBROSA → VEO HELPER FUNCTIONS
// Calculate deterministic prompt additions from audio analysis
// ============================================

// Calculate clip duration based on BPM and beats per phrase
export function bpmToClipDuration(bpm: number, beatsPerPhrase: number = 8): number {
  const secondsPerBeat = 60 / bpm;
  return Math.round(secondsPerBeat * beatsPerPhrase * 10) / 10; // Round to 1 decimal
}

// Map energy level (0-1) to keyword set
export function getEnergyKeywords(energyLevel: number): any {
  if (energyLevel < 0.3) return ENERGY_TO_KEYWORDS.low;
  if (energyLevel < 0.6) return ENERGY_TO_KEYWORDS.medium;
  if (energyLevel < 0.85) return ENERGY_TO_KEYWORDS.high;
  return ENERGY_TO_KEYWORDS.peak;
}

// Map section type to template
export function getSectionTemplate(sectionType: string): any {
  const normalized = sectionType.toLowerCase().replace(/[^a-z-]/g, '');
  return SECTION_TEMPLATES[normalized as keyof typeof SECTION_TEMPLATES] || SECTION_TEMPLATES.verse;
}

// Map key/mode to color palette
export function getKeyColors(mode: string = 'minor'): string {
  const normalized = mode.toLowerCase();
  if (normalized.includes('major')) return KEY_TO_COLORS.major;
  if (normalized.includes('dim')) return KEY_TO_COLORS.diminished;
  return KEY_TO_COLORS.minor;
}

// Map spectral centroid to lighting
export function getSpectralLighting(spectralCentroid: number = 2000): string {
  if (spectralCentroid > 3000) return BRIGHTNESS_TO_LIGHTING.bright;
  if (spectralCentroid > 2000) return BRIGHTNESS_TO_LIGHTING.balanced;
  if (spectralCentroid > 1000) return BRIGHTNESS_TO_LIGHTING.moody;
  return BRIGHTNESS_TO_LIGHTING.dark;
}

// Generate beat-aligned cut points for FFmpeg
export function buildBeatCutPoints(beats: number[], clipDuration: number, totalDuration: number): number[] {
  const cutPoints: number[] = [0];
  let currentTime = 0;

  while (currentTime < totalDuration - clipDuration * 0.5) {
    const targetCut = currentTime + clipDuration;
    // Find nearest beat to target cut point
    const nearestBeat = beats.reduce(
      (prev, curr) => (Math.abs(curr - targetCut) < Math.abs(prev - targetCut) ? curr : prev),
      targetCut,
    );

    if (nearestBeat > currentTime && nearestBeat < totalDuration) {
      cutPoints.push(nearestBeat);
      currentTime = nearestBeat;
    } else {
      currentTime += clipDuration;
    }
  }

  return cutPoints;
}

// Format Librosa data into deterministic prompt additions
export function buildLibrosaPromptAdditions(
  section: { type: string; averageEnergy: number; trend: string },
  audioAnalysis: { bpm: number; beats: number[] },
  spectralCentroid: number = 2000,
  mode: string = 'minor',
): {
  camera: string;
  action: string;
  lighting: string;
  pacing: string;
  shotType: string;
  purpose: string;
  colorPalette: string;
} {
  const energy = getEnergyKeywords(section.averageEnergy);
  const template = getSectionTemplate(section.type);
  const colors = getKeyColors(mode);
  const brightness = getSpectralLighting(spectralCentroid);

  return {
    camera: `${energy.camera}, ${template.cameraMove}`,
    action: energy.action,
    lighting: `${energy.lighting}, ${brightness}`,
    pacing: energy.pacing,
    shotType: template.shotType,
    purpose: template.purpose,
    colorPalette: colors,
  };
}

/**
 * Compute pre-computed clip data for an audio analysis
 * This calculates clip maps, beat-to-clip mappings, and section boundaries
 * so downstream processes don't need to recalculate them.
 */
export function computePrecomputedClipData(analysis: AudioAnalysis): PrecomputedClipData {
  const KLING_CLIP_DURATION = 5; // seconds
  const VEO_CLIP_DURATION = 8; // seconds

  // Defensive guards for missing data (handles old cache entries)
  const energySamples = analysis.energySamples || [];
  const sections = analysis.sections || [];
  const beats = analysis.beats || [];
  const duration = analysis.duration || 0;

  // Early return with empty data if no duration
  if (duration <= 0) {
    console.log('   ⚠️ Cannot compute precomputed data: no duration');
    return {
      clipMaps: {
        kling: { clipCount: 0, clipDuration: KLING_CLIP_DURATION, totalDuration: 0 },
        veo: { clipCount: 0, clipDuration: VEO_CLIP_DURATION, totalDuration: 0 },
      },
      beatToClip: { kling: [], veo: [] },
      sectionBoundaryClips: { kling: [], veo: [] },
    };
  }

  // 1. Compute clip maps for both engines
  const klingClipCount = Math.ceil(duration / KLING_CLIP_DURATION);
  const veoClipCount = Math.ceil(duration / VEO_CLIP_DURATION);

  const clipMaps = {
    kling: { clipCount: klingClipCount, clipDuration: KLING_CLIP_DURATION, totalDuration: duration },
    veo: { clipCount: veoClipCount, clipDuration: VEO_CLIP_DURATION, totalDuration: duration },
  };

  // Helper to get energy level from value
  const getEnergyLevel = (energy: number): 'low' | 'medium' | 'high' | 'peak' => {
    if (energy < 0.3) return 'low';
    if (energy < 0.6) return 'medium';
    if (energy < 0.85) return 'high';
    return 'peak';
  };

  // Helper to find section at a given time (uses defensive local variable)
  const getSectionAtTime = (time: number): AudioSection | undefined => {
    return sections.find((s) => time >= s.startTime && time < s.endTime);
  };

  // Helper to check if clip crosses a section boundary (uses defensive local variable)
  const findSectionTransition = (
    clipStart: number,
    clipEnd: number,
  ): BeatClipMapping['sectionTransition'] | undefined => {
    for (const section of sections) {
      // Check if section boundary falls within this clip
      if (section.startTime > clipStart && section.startTime < clipEnd) {
        const prevSection = sections.find((s) => s.endTime === section.startTime);
        if (prevSection) {
          return {
            fromSection: prevSection.type,
            toSection: section.type,
            transitionAt: section.startTime,
          };
        }
      }
    }
    return undefined;
  };

  // Helper to get average energy for a time range (uses defensive local variable)
  const getEnergyForRange = (start: number, end: number): { avg: number; peak: number } => {
    const samples = energySamples.filter((s) => s.time >= start && s.time < end);
    if (samples.length === 0) {
      // Fallback to section energy
      const section = getSectionAtTime((start + end) / 2);
      return { avg: section?.averageEnergy || 0.5, peak: section?.maxEnergy || 0.5 };
    }
    const energies = samples.map((s) => s.energy);
    return {
      avg: energies.reduce((a, b) => a + b, 0) / energies.length,
      peak: Math.max(...energies),
    };
  };

  // 2. Build beat-to-clip mappings for each engine (uses defensive local variables)
  const buildBeatToClip = (clipDuration: number, clipCount: number): BeatClipMapping[] => {
    const mappings: BeatClipMapping[] = [];

    for (let i = 0; i < clipCount; i++) {
      const clipStart = i * clipDuration;
      const clipEnd = Math.min((i + 1) * clipDuration, duration);

      // Find beats in this clip
      const beatsInClip = beats.filter((b) => b >= clipStart && b < clipEnd);

      // Get energy for this clip
      const { avg: avgEnergy, peak: peakEnergy } = getEnergyForRange(clipStart, clipEnd);

      // Check for section transition
      const transition = findSectionTransition(clipStart, clipEnd);

      mappings.push({
        clipIndex: i,
        clipStart,
        clipEnd,
        beats: beatsInClip,
        beatCount: beatsInClip.length,
        avgEnergy,
        peakEnergy,
        energyLevel: getEnergyLevel(avgEnergy),
        isSectionBoundary: !!transition,
        sectionTransition: transition,
      });
    }

    return mappings;
  };

  const klingBeatToClip = buildBeatToClip(KLING_CLIP_DURATION, klingClipCount);
  const veoBeatToClip = buildBeatToClip(VEO_CLIP_DURATION, veoClipCount);

  // 3. Extract section boundary clip indices
  const sectionBoundaryClips = {
    kling: klingBeatToClip.filter((m) => m.isSectionBoundary).map((m) => m.clipIndex),
    veo: veoBeatToClip.filter((m) => m.isSectionBoundary).map((m) => m.clipIndex),
  };

  console.log(`   📊 Pre-computed: Kling ${klingClipCount} clips, VEO ${veoClipCount} clips`);
  console.log(
    `   🎯 Section boundaries: Kling [${sectionBoundaryClips.kling.join(',')}], VEO [${sectionBoundaryClips.veo.join(',')}]`,
  );

  return {
    clipMaps,
    beatToClip: {
      kling: klingBeatToClip,
      veo: veoBeatToClip,
    },
    sectionBoundaryClips,
  };
}

// Cache directory for Librosa analysis results
// Centralized temp file management - uses data/cache/audio/
const CACHE_DIR = TempPaths.audioCache();
const METADATA_FILE = join(CACHE_DIR, 'metadata.json');

// Cache configuration
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_MAX_SIZE_BYTES = 1 * 1024 * 1024 * 1024; // 1GB
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily cleanup

// Cache metadata entry
interface CacheMetadataEntry {
  hash: string;
  filePath: string;
  createdAt: number;
  lastAccessed: number;
  fileSize: number;
  audioFileSize: number;
  audioModifiedTime: number;
}

// Cache metadata storage
interface CacheMetadata {
  entries: Record<string, CacheMetadataEntry>;
  totalSize: number;
  lastCleanup: number;
}

// Ensure cache directory exists
try {
  mkdirSync(CACHE_DIR, { recursive: true });
} catch (e) {
  // Ignore if already exists
}

export interface AudioSection {
  index: number;
  type: string; // intro, verse, chorus, bridge, pre-chorus, outro
  startTime: number;
  endTime: number;
  startFormatted: string;
  endFormatted: string;
  durationSeconds: number;
  energyLevel: 'low' | 'medium' | 'high';
  averageEnergy: number;
  maxEnergy: number;
  trend: 'building' | 'steady' | 'dropping';
  peakMoment: number;
  peakMomentFormatted: string;
}

export interface EnergyPoint {
  time: number;
  timeFormatted: string;
  energy: number;
}

// Pre-computed clip map for a specific engine
export interface ClipMap {
  clipCount: number;
  clipDuration: number;
  totalDuration: number;
}

// Beat-to-clip mapping entry
export interface BeatClipMapping {
  clipIndex: number;
  clipStart: number;
  clipEnd: number;
  beats: number[]; // Beat timestamps within this clip
  beatCount: number;
  avgEnergy: number; // Average energy for this clip
  peakEnergy: number; // Peak energy in this clip
  energyLevel: 'low' | 'medium' | 'high' | 'peak';
  isSectionBoundary: boolean; // True if clip crosses section transition
  sectionTransition?: {
    fromSection: string;
    toSection: string;
    transitionAt: number; // Timestamp of transition
  };
}

// Pre-computed derived values for efficiency
export interface PrecomputedClipData {
  clipMaps: {
    kling: ClipMap; // 5-second clips
    veo: ClipMap; // 8-second clips
  };
  beatToClip: {
    kling: BeatClipMapping[];
    veo: BeatClipMapping[];
  };
  sectionBoundaryClips: {
    kling: number[]; // Clip indices that cross section boundaries
    veo: number[];
  };
}

export interface AudioAnalysis {
  bpm: number;
  duration: number;
  durationFormatted: string;
  beatCount: number;
  beats: number[];
  strongOnsets?: number[]; // All detected audio onsets for karaoke word sync
  vocalOnsets?: number[]; // Vocal onsets from Demucs-isolated vocals (more accurate)
  forcedAlignment?: Array<{ word: string; start: number; end: number }>; // Wav2Vec2 forced alignment
  forcedAlignmentError?: string | null; // Error message if forced alignment failed (null if success)
  sections: AudioSection[];
  peaks: EnergyPoint[];
  dips: EnergyPoint[];
  energySamples: { time: number; energy: number }[];
  averageEnergy: number;
  energyRange: { min: number; max: number };
  spectral?: {
    avgCentroid: number;
    brightness: string;
    dynamics: string;
  };
  harmony?: {
    estimatedKey: string;
    mode: string;
    mood: string;
  };
  // NEW: Pre-computed clip data for efficiency
  precomputed?: PrecomputedClipData;
}

export interface AudioAnalysisResult {
  success: boolean;
  analysis?: AudioAnalysis;
  textSummary?: string;
  stemAnalysis?: any; // From DemucsSeparationResult (imported type would cause circular dependency)
  error?: string;
}

export interface MusicAwareVeoPrompt {
  sectionIndex: number;
  sectionType: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  energyLevel: string;
  visualIntensity: string;
  cameraStyle: string;
  pacing: string;
  lightingStyle?: string;
  colorPalette?: string;
  shotType?: string;
  lyricAction?: string;
  prompt: string;
  beatSyncPoints?: number[];
}

export interface MusicAwarePromptsResult {
  success: boolean;
  prompts?: MusicAwareVeoPrompt[];
  cutPoints?: number[];
  clipDuration?: number;
  error?: string;
}

class AudioAnalysisService {
  private pythonScript = join(process.cwd(), 'scripts', 'audio_analyzer.py');
  private metadata: CacheMetadata = { entries: {}, totalSize: 0, lastCleanup: Date.now() };
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.loadMetadata();
    this.performCleanup();
    this.schedulePeriodicCleanup();
  }

  /**
   * Load cache metadata from disk
   */
  private loadMetadata(): void {
    try {
      if (existsSync(METADATA_FILE)) {
        const data = readFileSync(METADATA_FILE, 'utf-8');
        this.metadata = JSON.parse(data);
        console.log(
          `💾 Loaded cache metadata: ${Object.keys(this.metadata.entries).length} entries, ${(this.metadata.totalSize / 1024 / 1024).toFixed(1)}MB`,
        );
      }
    } catch (e) {
      console.warn('⚠️ Failed to load cache metadata, starting fresh');
      this.metadata = { entries: {}, totalSize: 0, lastCleanup: Date.now() };
    }
  }

  /**
   * Save cache metadata to disk (atomic operation)
   */
  private saveMetadata(): void {
    try {
      const tempFile = `${METADATA_FILE}.tmp`;
      writeFileSync(tempFile, JSON.stringify(this.metadata, null, 2));
      // Atomic rename (prevents corruption on crash)
      if (existsSync(METADATA_FILE)) {
        unlinkSync(METADATA_FILE);
      }
      writeFileSync(METADATA_FILE, readFileSync(tempFile));
      unlinkSync(tempFile);
    } catch (e) {
      console.warn('⚠️ Failed to save cache metadata');
    }
  }

  /**
   * Schedule periodic cleanup (daily)
   */
  private schedulePeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      console.log('🧹 Running scheduled cache cleanup...');
      this.performCleanup();
    }, CLEANUP_INTERVAL_MS);

    // Prevent timer from keeping process alive
    this.cleanupTimer.unref();
  }

  /**
   * Perform intelligent cache cleanup
   * - Remove expired entries (> 30 days)
   * - Remove entries for deleted source files
   * - LRU eviction if cache exceeds size limit
   */
  private performCleanup(): void {
    const now = Date.now();
    let removedCount = 0;
    let freedBytes = 0;

    // 1. Remove expired entries
    for (const [hash, entry] of Object.entries(this.metadata.entries)) {
      const age = now - entry.createdAt;
      if (age > CACHE_MAX_AGE_MS) {
        const removed = this.removeCacheEntry(hash);
        if (removed) {
          removedCount++;
          freedBytes += entry.fileSize;
          console.log(
            `   🗑️ Removed expired: ${hash.slice(0, 8)} (${(age / 1000 / 60 / 60 / 24).toFixed(0)} days old)`,
          );
        }
      }
    }

    // 2. Remove entries for deleted or modified source files
    for (const [hash, entry] of Object.entries(this.metadata.entries)) {
      if (!existsSync(entry.filePath)) {
        const removed = this.removeCacheEntry(hash);
        if (removed) {
          removedCount++;
          freedBytes += entry.fileSize;
          console.log(`   🗑️ Removed orphaned: ${hash.slice(0, 8)} (source file deleted)`);
        }
        continue;
      }

      // Check if source file was modified
      try {
        const stats = statSync(entry.filePath);
        if (stats.mtime.getTime() !== entry.audioModifiedTime) {
          const removed = this.removeCacheEntry(hash);
          if (removed) {
            removedCount++;
            freedBytes += entry.fileSize;
            console.log(`   🗑️ Removed stale: ${hash.slice(0, 8)} (source file modified)`);
          }
        }
      } catch (e) {
        // Source file became inaccessible
        const removed = this.removeCacheEntry(hash);
        if (removed) {
          removedCount++;
          freedBytes += entry.fileSize;
        }
      }
    }

    // 3. LRU eviction if cache exceeds size limit
    if (this.metadata.totalSize > CACHE_MAX_SIZE_BYTES) {
      const overage = this.metadata.totalSize - CACHE_MAX_SIZE_BYTES;
      console.log(`   ⚠️ Cache exceeds limit by ${(overage / 1024 / 1024).toFixed(1)}MB, performing LRU eviction...`);

      // Sort by last accessed (oldest first)
      const sortedEntries = Object.entries(this.metadata.entries).sort(
        ([, a], [, b]) => a.lastAccessed - b.lastAccessed,
      );

      let evicted = 0;
      for (const [hash, entry] of sortedEntries) {
        if (this.metadata.totalSize <= CACHE_MAX_SIZE_BYTES * 0.9) {
          // Evict until we're at 90% of limit (some headroom)
          break;
        }

        const removed = this.removeCacheEntry(hash);
        if (removed) {
          evicted++;
          freedBytes += entry.fileSize;
          console.log(
            `   🗑️ Evicted (LRU): ${hash.slice(0, 8)} (last accessed ${((now - entry.lastAccessed) / 1000 / 60 / 60).toFixed(1)}h ago)`,
          );
        }
      }
    }

    this.metadata.lastCleanup = now;
    this.saveMetadata();

    if (removedCount > 0) {
      console.log(
        `✅ Cache cleanup complete: removed ${removedCount} entries, freed ${(freedBytes / 1024 / 1024).toFixed(1)}MB`,
      );
    } else {
      console.log('✅ Cache cleanup complete: no entries removed');
    }
  }

  /**
   * Remove a specific cache entry
   */
  private removeCacheEntry(hash: string): boolean {
    const entry = this.metadata.entries[hash];
    if (!entry) return false;

    const cachePath = join(CACHE_DIR, `librosa_${hash}.json`);
    try {
      if (existsSync(cachePath)) {
        unlinkSync(cachePath);
      }
      this.metadata.totalSize -= entry.fileSize;
      delete this.metadata.entries[hash];
      return true;
    } catch (e) {
      console.warn(`⚠️ Failed to remove cache entry: ${hash}`);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    entryCount: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    lastCleanup: number;
  } {
    const entries = Object.values(this.metadata.entries);
    const now = Date.now();

    return {
      entryCount: entries.length,
      totalSizeBytes: this.metadata.totalSize,
      totalSizeMB: Math.round((this.metadata.totalSize / 1024 / 1024) * 100) / 100,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map((e) => now - e.createdAt)) : null,
      newestEntry: entries.length > 0 ? Math.min(...entries.map((e) => now - e.createdAt)) : null,
      lastCleanup: this.metadata.lastCleanup,
    };
  }

  /**
   * Clear entire cache
   */
  clearCache(): { success: boolean; removedCount: number; freedBytes: number } {
    console.log('🗑️ Clearing entire audio analysis cache...');

    const entryCount = Object.keys(this.metadata.entries).length;
    const totalSize = this.metadata.totalSize;

    for (const hash of Object.keys(this.metadata.entries)) {
      this.removeCacheEntry(hash);
    }

    this.metadata = { entries: {}, totalSize: 0, lastCleanup: Date.now() };
    this.saveMetadata();

    console.log(`✅ Cache cleared: removed ${entryCount} entries, freed ${(totalSize / 1024 / 1024).toFixed(1)}MB`);

    return {
      success: true,
      removedCount: entryCount,
      freedBytes: totalSize,
    };
  }

  /**
   * Delete specific cache entry by hash
   */
  deleteCacheEntry(hash: string): { success: boolean; freed: number } {
    const entry = this.metadata.entries[hash];
    if (!entry) {
      return { success: false, freed: 0 };
    }

    const size = entry.fileSize;
    const removed = this.removeCacheEntry(hash);

    if (removed) {
      this.saveMetadata();
      return { success: true, freed: size };
    }

    return { success: false, freed: 0 };
  }

  /**
   * Force cleanup (manual trigger)
   */
  forceCleanup(): void {
    this.performCleanup();
  }

  /**
   * Format duration in seconds to MM:SS format
   */
  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Convert per-second energy features into song sections (intro, verse, chorus, etc.)
   * This provides backward compatibility with the existing AudioAnalysis interface
   */
  private convertPerSecondToSections(perSecondFeatures: any[], bpm: number): any[] {
    if (!perSecondFeatures || perSecondFeatures.length === 0) {
      return [];
    }

    const sections = [];
    const energyValues = perSecondFeatures.map((f) => f.energy);
    const avgEnergy = energyValues.reduce((a, b) => a + b, 0) / energyValues.length;

    // Simple heuristic: divide into sections based on energy changes
    let currentSection = {
      type: 'intro',
      startTime: 0,
      endTime: 0,
      duration: 0,
      energy: 0,
      peaks: [] as number[],
    };

    let sectionIndex = 0;
    const sectionTypes = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'outro'];

    for (let i = 0; i < perSecondFeatures.length; i++) {
      const feature = perSecondFeatures[i];
      currentSection.endTime = feature.time + 1;
      currentSection.duration = currentSection.endTime - currentSection.startTime;
      currentSection.energy += feature.energy;

      // Section boundary heuristic: significant energy change or 20-second duration
      const isLastSecond = i === perSecondFeatures.length - 1;
      const energyChange = i > 0 ? Math.abs(feature.energy - perSecondFeatures[i - 1].energy) : 0;
      const significantChange = energyChange > avgEnergy * 0.3;
      const longSection = currentSection.duration >= 20;

      if (significantChange || longSection || isLastSecond) {
        currentSection.energy = currentSection.energy / currentSection.duration;
        sections.push({ ...currentSection });

        // Start new section
        sectionIndex++;
        currentSection = {
          type: sectionTypes[sectionIndex % sectionTypes.length],
          startTime: feature.time,
          endTime: feature.time,
          duration: 0,
          energy: 0,
          peaks: [],
        };
      }
    }

    return sections;
  }

  /**
   * Generate a text summary from audio analysis
   * Used when stem analysis provides the data instead of Python script
   */
  private generateTextSummary(analysis: AudioAnalysis): string {
    const energyLevel =
      analysis.sections.reduce((sum, s) => sum + ((s as any).energy || 0), 0) / analysis.sections.length;
    const energyDesc = energyLevel > 0.7 ? 'high-energy' : energyLevel > 0.4 ? 'moderate-energy' : 'low-energy';

    return (
      `This is a ${energyDesc} track at ${analysis.bpm.toFixed(0)} BPM with ${analysis.sections.length} sections spanning ${analysis.durationFormatted}. ` +
      `The song has ${analysis.beatCount} detected beats with an average energy of ${(energyLevel * 100).toFixed(0)}%.`
    );
  }

  /**
   * Generate a cache key from audio file (hash of file content + size + mtime)
   */
  private getAudioCacheKey(audioPath: string): string {
    try {
      const stats = statSync(audioPath);
      const fileSample = readFileSync(audioPath, { encoding: 'binary' }).slice(0, 65536); // First 64KB
      const hashInput = `${fileSample}|${stats.size}|${stats.mtime.getTime()}`;
      return createHash('md5').update(hashInput).digest('hex');
    } catch (error) {
      return createHash('md5')
        .update(audioPath + Date.now())
        .digest('hex');
    }
  }

  /**
   * Get cached Librosa analysis if available
   */
  private getCachedAnalysis(cacheKey: string, audioPath: string): AudioAnalysisResult | null {
    const cachePath = join(CACHE_DIR, `librosa_${cacheKey}.json`);

    try {
      if (existsSync(cachePath)) {
        // Check if source file was modified since cache entry
        const entry = this.metadata.entries[cacheKey];
        if (entry) {
          const stats = statSync(audioPath);
          if (stats.mtime.getTime() !== entry.audioModifiedTime) {
            console.log(`   🔄 Cache invalidated: source file modified`);
            this.removeCacheEntry(cacheKey);
            this.saveMetadata();
            return null;
          }

          // Update last accessed timestamp
          entry.lastAccessed = Date.now();
          this.saveMetadata();
        }

        const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
        console.log(`   💾 Cache HIT: ${cacheKey.slice(0, 8)}`);
        return cached;
      }
    } catch (e) {
      console.log(`   ⚠️ Cache read failed: ${e}`);
      // Cache read failed, will reanalyze
    }

    console.log(`   🔍 Cache MISS: ${cacheKey.slice(0, 8)}`);
    return null;
  }

  /**
   * Save analysis result to cache
   */
  private saveToCache(cacheKey: string, result: AudioAnalysisResult, audioPath: string): void {
    const cachePath = join(CACHE_DIR, `librosa_${cacheKey}.json`);

    try {
      const content = JSON.stringify(result, null, 2);
      writeFileSync(cachePath, content);

      // Update metadata
      const stats = statSync(audioPath);
      const cacheStats = statSync(cachePath);

      // Remove old entry if exists (to update size)
      if (this.metadata.entries[cacheKey]) {
        this.metadata.totalSize -= this.metadata.entries[cacheKey].fileSize;
      }

      this.metadata.entries[cacheKey] = {
        hash: cacheKey,
        filePath: audioPath,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        fileSize: cacheStats.size,
        audioFileSize: stats.size,
        audioModifiedTime: stats.mtime.getTime(),
      };

      this.metadata.totalSize += cacheStats.size;
      this.saveMetadata();

      console.log(
        `   💾 Cached analysis: ${(cacheStats.size / 1024).toFixed(1)}KB (total cache: ${(this.metadata.totalSize / 1024 / 1024).toFixed(1)}MB)`,
      );
    } catch (e) {
      console.warn('   ⚠️ Failed to cache analysis:', e);
    }
  }

  /**
   * Analyze an audio file using Python/librosa
   * OPTIMIZED: Uses cache to skip re-analysis for same audio files
   *
   * @param audioPath - Path to audio file
   * @param lyrics - Optional lyrics for forced alignment (exact word timing)
   * @param forceRefresh - Force re-analysis even if cached (for subtitle resync)
   * @param includeStemAnalysis - If true, also run Demucs stem separation and per-stem analysis
   */
  async analyzeAudio(
    audioPath: string,
    lyrics?: string,
    forceRefresh: boolean = false,
    includeStemAnalysis: boolean = false,
  ): Promise<AudioAnalysisResult> {
    console.log('🎵 Starting audio analysis:', audioPath);
    if (lyrics) {
      console.log(`   📝 Lyrics provided for forced alignment (${lyrics.length} chars)`);
    }
    if (forceRefresh) {
      console.log(`   🔄 FORCE REFRESH enabled - bypassing cache`);
    }

    // Verify file exists
    if (!existsSync(audioPath)) {
      return {
        success: false,
        error: `Audio file not found: ${audioPath}`,
      };
    }

    // Check cache first (unless forceRefresh)
    const cacheKey = this.getAudioCacheKey(audioPath);
    const cached = forceRefresh ? null : this.getCachedAnalysis(cacheKey, audioPath);

    // FORCED ALIGNMENT CHECK: If lyrics provided but cache has no forced alignment, re-analyze
    const needsForcedAlignment = lyrics && lyrics.trim().length > 0;
    const cachedHasForcedAlignment =
      cached?.analysis?.forcedAlignment &&
      Array.isArray(cached.analysis.forcedAlignment) &&
      cached.analysis.forcedAlignment.length > 0;

    if (cached && cached.analysis && (!needsForcedAlignment || cachedHasForcedAlignment)) {
      console.log('✅ Audio analysis (from cache)');
      console.log(`   BPM: ${cached.analysis?.bpm}`);
      console.log(`   Duration: ${cached.analysis?.durationFormatted}`);
      console.log(`   Sections: ${cached.analysis?.sections?.length}`);
      if (cachedHasForcedAlignment) {
        console.log(`   🎯 Forced alignment: ${cached.analysis.forcedAlignment?.length} words`);
      }

      // Ensure pre-computed data exists (backfill for old cache entries)
      if (!cached.analysis.precomputed) {
        console.log('   🔄 Backfilling pre-computed clip data for cached analysis...');
        cached.analysis.precomputed = computePrecomputedClipData(cached.analysis);
        // Update cache with enriched data
        this.saveToCache(cacheKey, cached, audioPath);
      } else {
        console.log(
          `   📊 Pre-computed: Kling ${cached.analysis.precomputed.clipMaps.kling.clipCount} clips, VEO ${cached.analysis.precomputed.clipMaps.veo.clipCount} clips`,
        );
      }

      return cached;
    }

    // Log why we're re-analyzing
    if (cached && needsForcedAlignment && !cachedHasForcedAlignment) {
      console.log('   🔄 Cache exists but needs forced alignment - re-analyzing with lyrics...');
    }

    // Verify Python script exists
    if (!existsSync(this.pythonScript)) {
      return {
        success: false,
        error: 'Audio analyzer script not found',
      };
    }

    try {
      // ========================================
      // STEMS-FIRST UNIFIED ANALYSIS (NEW ARCHITECTURE)
      // ========================================
      // If stem analysis requested, run Demucs FIRST, which now includes full track analysis
      // This ensures perfect temporal alignment between all tracks (same hop_length, frame boundaries)
      if (includeStemAnalysis) {
        console.log('🔧 STEMS-FIRST ANALYSIS: Running Demucs separation + unified analysis...');

        try {
          // Import dynamically to avoid circular dependency
          const { demucsSeparationService } = await import('./demucs-separation-service');
          const stemResult = await demucsSeparationService.separateAndAnalyze(audioPath);

          if (!stemResult.success) {
            console.log(`   ⚠️ Stems-first analysis failed: ${stemResult.error}`);
            console.log(`   🔄 Falling back to Librosa-only analysis...`);
            // Fall through to old Librosa path
          } else {
            console.log(`   ✅ Stem separation complete: ${Object.keys(stemResult.analysis || {}).length} stems`);

            // Extract full_track analysis from unified result
            const fullTrackAnalysis = (stemResult as any).full_track;

            if (!fullTrackAnalysis || !fullTrackAnalysis.success) {
              console.log(`   ⚠️ Full track analysis missing from stem result`);
              console.log(`   🔄 Falling back to Librosa-only analysis...`);
              // Fall through to old Librosa path
            } else {
              // Build analysis result from stem separation's full_track analysis
              const baseAnalysis: any = {
                bpm: fullTrackAnalysis.tempo,
                duration: fullTrackAnalysis.duration,
                durationFormatted: this.formatDuration(fullTrackAnalysis.duration),
                beatCount: fullTrackAnalysis.beat_count,
                beats: fullTrackAnalysis.beats,
                sections: this.convertPerSecondToSections(
                  fullTrackAnalysis.per_second_features,
                  fullTrackAnalysis.tempo,
                ),
                spectral: {
                  avgCentroid: fullTrackAnalysis.overall.avg_brightness,
                  avgBandwidth: fullTrackAnalysis.overall.avg_bandwidth,
                } as any,
                // Note: Forced alignment not yet supported in unified analysis
                // Will need to add lyrics parameter to Demucs script if needed
              };

              // Compute pre-computed clip data for efficiency
              baseAnalysis.precomputed = computePrecomputedClipData(baseAnalysis);

              const analysisResult: AudioAnalysisResult = {
                success: true,
                analysis: baseAnalysis,
                textSummary: this.generateTextSummary(baseAnalysis),
                stemAnalysis: stemResult, // Include stem analysis
              };

              // Save to cache for future use
              this.saveToCache(cacheKey, analysisResult, audioPath);

              console.log('✅ Unified audio analysis complete (stems-first)');
              console.log(`   BPM: ${baseAnalysis.bpm}`);
              console.log(`   Duration: ${baseAnalysis.durationFormatted}`);
              console.log(`   Sections: ${baseAnalysis.sections.length}`);
              console.log(`   🎼 Stems: ${Object.keys(stemResult.analysis || {}).length}`);
              console.log(`   🎯 Temporal alignment: PERFECT (all tracks use same frame boundaries)`);

              return analysisResult;
            }
          }
        } catch (e: any) {
          console.log(`   ⚠️ Stems-first analysis error: ${e.message}`);
          console.log(`   🔄 Falling back to Librosa-only analysis...`);
          // Fall through to old Librosa path
        }
      }

      // ========================================
      // LIBROSA-ONLY ANALYSIS (BACKWARD COMPATIBILITY)
      // ========================================
      console.log('   📊 Running Librosa analysis (not cached)...');

      // Write lyrics to temp file if provided (for forced alignment)
      let lyricsArg = '';
      let lyricsPath = '';
      if (lyrics && lyrics.trim()) {
        lyricsPath = join('/tmp', `lyrics_${Date.now()}.txt`);
        try {
          writeFileSync(lyricsPath, lyrics, 'utf-8');
          lyricsArg = ` "${lyricsPath}"`;
          console.log(`   📝 Wrote lyrics to temp file for forced alignment`);
        } catch (e) {
          console.warn('   ⚠️ Failed to write lyrics file:', e);
        }
      }

      // Get Whisper transcription for ground-truth offset calculation
      // Whisper timestamps are relative to full song timeline - use as anchor
      let whisperArg = '';
      let whisperPath = '';
      if (lyrics && lyrics.trim()) {
        try {
          console.log('   🎤 Getting Whisper transcription for offset calculation...');
          const whisperResult = await transcribeAudioWithTimestamps(audioPath);
          if (whisperResult && whisperResult.words && whisperResult.words.length > 0) {
            whisperPath = join('/tmp', `whisper_${Date.now()}.json`);
            writeFileSync(whisperPath, JSON.stringify({ words: whisperResult.words }), 'utf-8');
            whisperArg = ` "${whisperPath}"`;
            console.log(`   ✅ Whisper: ${whisperResult.words.length} words for offset calculation`);
            console.log(
              `   📊 First Whisper word: "${whisperResult.words[0]?.word}" @ ${whisperResult.words[0]?.start?.toFixed(2)}s`,
            );
          }
        } catch (e) {
          console.warn('   ⚠️ Failed to get Whisper transcription:', e);
        }
      }

      // Run Python analyzer (with optional lyrics + Whisper for forced alignment)
      const { stdout, stderr } = await execAsync(
        `python3 "${this.pythonScript}" "${audioPath}"${lyricsArg}${whisperArg}`,
        {
          timeout: 600000, // 10 minute timeout for forced alignment + Demucs
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        },
      );

      // Clean up temp files
      if (lyricsPath) {
        try {
          unlinkSync(lyricsPath);
        } catch (e) {}
      }
      if (whisperPath) {
        try {
          unlinkSync(whisperPath);
        } catch (e) {}
      }

      if (stderr) {
        console.log('Audio analyzer stderr:', stderr);
      }

      // Parse JSON output
      const result = JSON.parse(stdout);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Analysis failed',
        };
      }

      // Build base analysis object
      const baseAnalysis: AudioAnalysis = {
        ...result.analysis,
        spectral: result.analysis.spectral || undefined,
        harmony: result.analysis.harmony || undefined,
      };

      // Compute pre-computed clip data for efficiency
      baseAnalysis.precomputed = computePrecomputedClipData(baseAnalysis);

      const analysisResult: AudioAnalysisResult = {
        success: true,
        analysis: baseAnalysis,
        textSummary: result.textSummary,
      };

      // Save to cache for future use (includes pre-computed data)
      this.saveToCache(cacheKey, analysisResult, audioPath);

      console.log('✅ Audio analysis complete');
      console.log(`   BPM: ${result.analysis.bpm}`);
      console.log(`   Duration: ${result.analysis.durationFormatted}`);
      console.log(`   Sections: ${result.analysis.sections.length}`);

      // Log forced alignment status (critical for subtitle sync debugging)
      if (result.analysis.forcedAlignment && result.analysis.forcedAlignment.length > 0) {
        console.log(`   🎯 Forced alignment: ${result.analysis.forcedAlignment.length} words aligned`);
      } else if (result.analysis.forcedAlignmentError) {
        console.log(`   ❌ FORCED ALIGNMENT FAILED: ${result.analysis.forcedAlignmentError}`);
      } else if (lyrics && lyrics.trim().length > 0) {
        console.log(`   ⚠️ Forced alignment: No words returned (unknown error)`);
      }

      return analysisResult;
    } catch (error: any) {
      console.error('Audio analysis error:', error);
      return {
        success: false,
        error: error.message || 'Failed to analyze audio',
      };
    }
  }

  /**
   * Generate music-aware VEO prompts using audio analysis + lyrics
   */
  async generateMusicAwarePrompts(
    audioAnalysis: AudioAnalysis,
    textSummary: string,
    lyrics: string,
    characterDescriptions: string,
    visualStyle: string = 'cinematic',
  ): Promise<MusicAwarePromptsResult> {
    console.log('🎬 Generating music-aware VEO prompts...');

    // Extract spectral and harmony data from audio analysis
    const spectralCentroid = audioAnalysis.spectral?.avgCentroid || 2000;
    const musicalMode = audioAnalysis.harmony?.mode || 'minor';

    // Debug logging for spectral/harmony values
    console.log(`   🎼 Spectral: ${spectralCentroid}Hz (${audioAnalysis.spectral?.brightness || 'unknown'})`);
    console.log(`   🎵 Key: ${audioAnalysis.harmony?.estimatedKey || '?'} ${musicalMode}`);

    // Build section-specific guidance from Librosa data
    const sectionGuidance = audioAnalysis.sections
      .map((section, idx) => {
        const additions = buildLibrosaPromptAdditions(section, audioAnalysis, spectralCentroid, musicalMode);
        return `
SECTION ${idx + 1} (${section.type}, ${section.startFormatted} - ${section.endFormatted}):
  Energy: ${section.averageEnergy.toFixed(2)} (${section.energyLevel}) - ${section.trend}
  CAMERA: ${additions.camera}
  ACTION INTENSITY: ${additions.action}
  LIGHTING: ${additions.lighting}
  PACING: ${additions.pacing}
  SHOT TYPE: ${additions.shotType}
  PURPOSE: ${additions.purpose}
  COLOR PALETTE: ${additions.colorPalette}
  CLIP DURATION: ${bpmToClipDuration(audioAnalysis.bpm)} seconds (${audioAnalysis.bpm} BPM, 8-beat phrase)
`;
      })
      .join('\n');

    // Debug logging: Show Librosa → Prompt mapping
    console.log('📊 LIBROSA → PROMPT MAPPING:');
    audioAnalysis.sections.forEach((section, idx) => {
      const additions = buildLibrosaPromptAdditions(section, audioAnalysis, spectralCentroid, musicalMode);
      console.log(
        `   Section ${idx + 1} (${section.type}): Energy ${section.averageEnergy.toFixed(2)} → ${additions.camera.split(',')[0]}`,
      );
    });

    const prompt = `You are a music video director creating VEO 3.1 video prompts that perfectly sync with the song's energy and flow.

## SONG ANALYSIS:
${textSummary}

## LIBROSA-DERIVED SECTION GUIDANCE:
You MUST use these exact camera/lighting/pacing keywords for each section:
${sectionGuidance}

CRITICAL: The keywords above are derived from audio analysis. You MUST include them in each prompt.
- LOW energy sections use SLOW camera, SOFT lighting
- HIGH energy sections use DYNAMIC camera, INTENSE lighting
- These keywords should VISIBLY DIFFER between sections

## ORIGINAL LYRICS:
${lyrics}

## CHARACTERS:
${characterDescriptions}

## VISUAL STYLE: ${visualStyle}

## YOUR TASK:
Generate a VEO video prompt for EACH section of the song. The prompts must:

1. **USE THE ACTUAL LYRIC CONTENT** (MOST IMPORTANT):
   - Each prompt MUST include the specific OBJECTS, ACTIONS, and SETTINGS mentioned in the lyrics for that section
   - If lyrics mention "pizza" and "tacos" - those items MUST be visible in the scene
   - If lyrics mention "breakroom" or "office" - use that exact setting
   - If lyrics describe arguing, debating, or disagreeing - show those specific actions
   - The video should ILLUSTRATE what the lyrics are saying, not just generic moods
   - Example: "They're arguing about pizza vs tacos" → Show characters actually holding/gesturing at pizza and tacos while debating

2. **MATCH THE ENERGY**: 
   - High energy sections → Fast cuts, dynamic camera movement, close-ups, intense expressions
   - Medium energy sections → Moderate pacing, mix of wide and medium shots, building tension
   - Low energy sections → Slow pacing, wide establishing shots, subtle movement, contemplative mood

3. **SYNC WITH PEAKS**: 
   - At energy peaks, include impactful visual moments with the lyric's key objects prominent
   - These should be the "money shots" featuring the debate/conflict from lyrics

4. **RESPECT THE FLOW**:
   - "Building" sections should show increasing intensity of the lyrical conflict
   - "Dropping" sections should show resolution moments
   - "Steady" sections should maintain the debate/discussion energy

5. **TELL THE LYRIC'S STORY**:
   - The narrative should follow what the lyrics describe
   - If it's a food debate - show the food, show the debate
   - Character actions should match what the lyrics say they're doing

For each section, provide:
- Section type and timing
- Camera movement and shot types
- Character actions MATCHING THE LYRICS
- The specific OBJECTS from lyrics visible in scene
- Full VEO prompt (detailed, visual, specific to lyric content)

Respond in JSON format:
{
  "prompts": [
    {
      "sectionIndex": 1,
      "sectionType": "intro",
      "startTime": 0,
      "endTime": 10.5,
      "durationSeconds": 10.5,
      "energyLevel": "low",
      "visualIntensity": "subtle, atmospheric",
      "cameraStyle": "slow dolly, wide establishing",
      "pacing": "contemplative, 4-second shots",
      "lyricAction": "Characters in breakroom, pizza box and taco wrappers on table",
      "prompt": "Cinematic wide shot of office breakroom at lunchtime, pizza box open on table next to taco wrappers, two coworkers facing each other in friendly debate, warm fluorescent lighting, camera slowly dollies forward, 8K quality, film grain..."
    }
  ]
}

Generate prompts for ALL ${audioAnalysis.sections.length} sections. Each prompt should be detailed enough for VEO 3.1 to generate a compelling 8-second clip.`;

    try {
      const response = await openaiService.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 4000,
        systemPrompt:
          "You are an expert music video director who creates visually stunning, musically synchronized video content. Your prompts are detailed, cinematic, and perfectly matched to the song's energy flow. IMPORTANT: Respond ONLY with valid JSON, no additional text.",
      });

      // Parse JSON response - try to find the most complete JSON object
      let parsed: any;
      try {
        // First try parsing the whole response
        parsed = JSON.parse(response.trim());
      } catch {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error('No JSON found in response:', response.substring(0, 500));
          throw new Error('Invalid response format - no JSON found in AI response');
        }
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (parseError: any) {
          console.error('JSON parse error:', parseError.message);
          console.error('Attempted to parse:', jsonMatch[0].substring(0, 500));
          throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
        }
      }

      if (!parsed.prompts || !Array.isArray(parsed.prompts)) {
        console.error('Invalid response structure:', JSON.stringify(parsed).substring(0, 500));
        throw new Error('Invalid response format - expected { prompts: [...] }');
      }

      // Validate each prompt has required fields and ENFORCE deterministic Librosa values
      const validatedPrompts = parsed.prompts.map((p: any, idx: number) => {
        // Get the matching audio section for this prompt
        const audioSection = audioAnalysis.sections[idx] || audioAnalysis.sections[0];
        const librosaAdditions = buildLibrosaPromptAdditions(
          audioSection,
          audioAnalysis,
          spectralCentroid,
          musicalMode,
        );
        const bpmDuration = bpmToClipDuration(audioAnalysis.bpm);

        return {
          sectionIndex: p.sectionIndex ?? idx + 1,
          sectionType: p.sectionType || audioSection?.type || 'verse',
          startTime: audioSection?.startTime ?? p.startTime ?? 0,
          endTime: audioSection?.endTime ?? p.endTime ?? 8,
          durationSeconds: bpmDuration, // Use BPM-calculated duration instead of AI's guess
          energyLevel: audioSection?.energyLevel || p.energyLevel || 'medium',
          visualIntensity: p.visualIntensity || 'moderate',
          cameraStyle: librosaAdditions.camera, // FORCE deterministic camera from Librosa
          pacing: librosaAdditions.pacing, // FORCE deterministic pacing from Librosa
          lightingStyle: librosaAdditions.lighting, // ADD deterministic lighting from Librosa
          colorPalette: librosaAdditions.colorPalette, // ADD deterministic colors from key/mode
          shotType: librosaAdditions.shotType, // ADD deterministic shot type from section template
          lyricAction: p.lyricAction || '',
          prompt: p.prompt || `Section ${idx + 1} visual prompt`,
          // ADD beat sync data for downstream use (first 4 beats in this section)
          beatSyncPoints: audioAnalysis.beats
            .filter((b) => b >= (audioSection?.startTime || 0) && b < (audioSection?.endTime || 8))
            .slice(0, 4),
        };
      });

      // Compute beat-aligned cut points for FFmpeg
      const clipDuration = bpmToClipDuration(audioAnalysis.bpm);
      const beatCutPoints = buildBeatCutPoints(audioAnalysis.beats, clipDuration, audioAnalysis.duration);

      console.log(
        `✅ Generated ${validatedPrompts.length} music-aware prompts with ${beatCutPoints.length} beat-aligned cut points`,
      );
      console.log(`   📏 BPM-based clip duration: ${clipDuration}s (from ${audioAnalysis.bpm} BPM)`);

      return {
        success: true,
        prompts: validatedPrompts,
        cutPoints: beatCutPoints,
        clipDuration: clipDuration,
      };
    } catch (error: any) {
      console.error('Music-aware prompt generation error:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate prompts',
      };
    }
  }

  /**
   * Full pipeline: Analyze audio and generate synced VEO prompts
   */
  async analyzeAndGeneratePrompts(
    audioPath: string,
    lyrics: string,
    characterDescriptions: string,
    visualStyle: string = 'cinematic',
  ): Promise<{
    success: boolean;
    analysis?: AudioAnalysis;
    textSummary?: string;
    prompts?: MusicAwareVeoPrompt[];
    error?: string;
  }> {
    // Step 1: Analyze audio
    const analysisResult = await this.analyzeAudio(audioPath);

    if (!analysisResult.success || !analysisResult.analysis) {
      return {
        success: false,
        error: analysisResult.error || 'Audio analysis failed',
      };
    }

    // Step 2: Generate music-aware prompts
    const promptsResult = await this.generateMusicAwarePrompts(
      analysisResult.analysis,
      analysisResult.textSummary || '',
      lyrics,
      characterDescriptions,
      visualStyle,
    );

    if (!promptsResult.success) {
      return {
        success: false,
        analysis: analysisResult.analysis,
        textSummary: analysisResult.textSummary,
        error: promptsResult.error || 'Prompt generation failed',
      };
    }

    return {
      success: true,
      analysis: analysisResult.analysis,
      textSummary: analysisResult.textSummary,
      prompts: promptsResult.prompts,
    };
  }

  /**
   * Merge audio analysis sections with existing VEO prompts
   * This updates timing and energy info in existing prompts
   */
  mergeWithExistingPrompts(audioAnalysis: AudioAnalysis, existingPrompts: any[]): any[] {
    const updatedPrompts = [...existingPrompts];

    // Calculate total content duration from existing prompts
    const totalPromptDuration = existingPrompts.reduce((sum, p) => sum + (p.durationSeconds || 8), 0);

    // Scale prompts to match actual audio duration
    const scaleFactor = audioAnalysis.duration / totalPromptDuration;

    let currentTime = 0;
    for (let i = 0; i < updatedPrompts.length; i++) {
      const prompt = updatedPrompts[i];
      const originalDuration = prompt.durationSeconds || 8;
      const scaledDuration = originalDuration * scaleFactor;

      // Find matching audio section
      const matchingSection =
        audioAnalysis.sections.find((s) => s.startTime <= currentTime && s.endTime > currentTime) ||
        audioAnalysis.sections[0];

      // Update timing
      prompt.startTime = currentTime;
      prompt.endTime = currentTime + scaledDuration;
      prompt.durationSeconds = scaledDuration;
      prompt.actualDuration = Math.round(scaledDuration);

      // Add energy info
      prompt.audioEnergy = {
        level: matchingSection?.energyLevel || 'medium',
        average: matchingSection?.averageEnergy || 50,
        trend: matchingSection?.trend || 'steady',
      };

      // Find nearby beats for sync points
      const sectionBeats = audioAnalysis.beats.filter((b) => b >= currentTime && b < currentTime + scaledDuration);
      prompt.beatSyncPoints = sectionBeats.slice(0, 4).map((b) => ({
        seconds: (b - currentTime).toFixed(2),
        action: 'visual accent',
      }));

      currentTime += scaledDuration;
    }

    return updatedPrompts;
  }

  /**
   * Detect beat drop / hook point in audio
   * Returns optimal timestamp to start audio for maximum hook impact
   */
  async detectBeatDrop(audioPath: string): Promise<BeatDropResult> {
    console.log('🎯 Detecting beat drop:', audioPath);

    if (!existsSync(audioPath)) {
      return {
        success: false,
        error: `Audio file not found: ${audioPath}`,
      };
    }

    const beatDropScript = join(process.cwd(), 'server/scripts', 'beat_drop_detection.py');

    if (!existsSync(beatDropScript)) {
      return {
        success: false,
        error: 'Beat drop detection script not found',
      };
    }

    try {
      const { stdout, stderr } = await execAsync(`python "${beatDropScript}" "${audioPath}" --verbose`, {
        timeout: 60000, // 1 minute timeout
        maxBuffer: 5 * 1024 * 1024, // 5MB buffer
      });

      if (stderr) {
        console.log('Beat drop stderr:', stderr);
      }

      const result = JSON.parse(stdout);

      console.log('✅ Beat drop detection complete');
      console.log(`   Drop at: ${result.dropTimestamp?.toFixed(2)}s`);
      console.log(`   Confidence: ${(result.confidence * 100)?.toFixed(0)}%`);
      console.log(`   Should trim: ${result.shouldTrim}`);
      console.log(`   Reason: ${result.reason}`);

      return {
        success: true,
        dropTimestamp: result.dropTimestamp,
        confidence: result.confidence,
        recommendedTrim: result.recommendedTrim,
        shouldTrim: result.shouldTrim,
        bpm: result.bpm,
        duration: result.duration,
        introEnergy: result.introEnergy,
        beatCount: result.beatCount,
        firstBeats: result.firstBeats,
        energyCurve: result.energyCurve,
        reason: result.reason,
        ffmpegCommand: result.ffmpegCommand,
      };
    } catch (error: any) {
      console.error('Beat drop detection error:', error);
      return {
        success: false,
        error: error.message || 'Failed to detect beat drop',
      };
    }
  }

  /**
   * Generate FFmpeg command to trim audio at beat drop
   */
  generateTrimCommand(inputPath: string, outputPath: string, startTime: number, fadeIn: number = 0.1): string {
    if (fadeIn > 0) {
      return `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${inputPath}" -af "afade=t=in:st=0:d=${fadeIn}" -c:a aac "${outputPath}"`;
    } else {
      return `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${inputPath}" -c copy "${outputPath}"`;
    }
  }

  /**
   * Trim audio to start at beat drop
   */
  async trimToBeatDrop(
    audioPath: string,
    outputPath?: string,
  ): Promise<{
    success: boolean;
    trimmedPath?: string;
    trimStart?: number;
    error?: string;
  }> {
    const dropResult = await this.detectBeatDrop(audioPath);

    if (!dropResult.success) {
      return { success: false, error: dropResult.error };
    }

    if (!dropResult.shouldTrim) {
      console.log('   ℹ️ No trimming needed:', dropResult.reason);
      return {
        success: true,
        trimmedPath: audioPath,
        trimStart: 0,
      };
    }

    const finalOutput = outputPath || audioPath.replace(/\.mp3$/i, '_trimmed.mp3');
    const trimCommand = this.generateTrimCommand(audioPath, finalOutput, dropResult.recommendedTrim || 0, 0.1);

    try {
      console.log(`   ✂️ Trimming audio: ${dropResult.recommendedTrim?.toFixed(2)}s`);
      await execAsync(trimCommand, { timeout: 60000 });

      return {
        success: true,
        trimmedPath: finalOutput,
        trimStart: dropResult.recommendedTrim,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Trim failed: ${error.message}`,
      };
    }
  }
}

// Beat drop detection result type
export interface BeatDropResult {
  success: boolean;
  dropTimestamp?: number;
  confidence?: number;
  recommendedTrim?: number;
  shouldTrim?: boolean;
  bpm?: number;
  duration?: number;
  introEnergy?: number;
  beatCount?: number;
  firstBeats?: number[];
  energyCurve?: number[];
  reason?: string;
  ffmpegCommand?: string;
  error?: string;
}

// Smart trim result type (intro + outro trimming)
export interface SmartTrimResult {
  success: boolean;
  originalDuration?: number;
  finalDuration?: number;
  timeSaved?: number;
  intro?: {
    trimAt: number;
    shouldTrim: boolean;
    reason: string;
  };
  outro?: {
    trimAt: number;
    shouldTrim: boolean;
    reason: string;
  };
  platform?: string;
  platformLimit?: number;
  fitsPlatform?: boolean;
  bpm?: number;
  ffmpegCommand?: string;
  outputPath?: string;
  executed?: boolean;
  error?: string;
}

// Platform limits for smart trimming
export const PLATFORM_LIMITS = {
  youtube_shorts: 179, // 2:59
  tiktok: 180, // 3:00
  reels: 179, // 2:59
  youtube_long: 600, // 10:00
  none: 99999, // No limit
};

export type TrimPlatform = keyof typeof PLATFORM_LIMITS;

// Smart Audio Trimmer Service (separate from main class for organization)
class SmartAudioTrimmerService {
  private trimmerScript = join(process.cwd(), 'server/scripts', 'smart_audio_trimmer.py');

  /**
   * Calculate optimal trim points for both intro and outro
   */
  async calculateSmartTrim(audioPath: string, platform: TrimPlatform = 'youtube_shorts'): Promise<SmartTrimResult> {
    console.log(`✂️ Smart trim analysis: ${audioPath} (${platform})`);

    if (!existsSync(audioPath)) {
      return { success: false, error: `Audio file not found: ${audioPath}` };
    }

    if (!existsSync(this.trimmerScript)) {
      return { success: false, error: 'Smart audio trimmer script not found' };
    }

    try {
      const { stdout, stderr } = await execAsync(
        `python "${this.trimmerScript}" "${audioPath}" --platform ${platform} --verbose`,
        { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
      );

      if (stderr) {
        console.log('Smart trimmer stderr:', stderr);
      }

      const result = JSON.parse(stdout);

      console.log('✅ Smart trim analysis complete');
      console.log(`   Original: ${result.original_duration?.toFixed(1)}s`);
      console.log(`   Final: ${result.final_duration?.toFixed(1)}s`);
      console.log(`   Saved: ${result.time_saved?.toFixed(1)}s`);
      console.log(`   Fits ${platform}: ${result.fits_platform}`);

      return {
        success: true,
        originalDuration: result.original_duration,
        finalDuration: result.final_duration,
        timeSaved: result.time_saved,
        intro: {
          trimAt: result.intro?.trim_at || 0,
          shouldTrim: result.intro?.should_trim || false,
          reason: result.intro?.reason || '',
        },
        outro: {
          trimAt: result.outro?.trim_at || result.original_duration,
          shouldTrim: result.outro?.should_trim || false,
          reason: result.outro?.reason || '',
        },
        platform,
        platformLimit: PLATFORM_LIMITS[platform],
        fitsPlatform: result.fits_platform,
        bpm: result.bpm,
        ffmpegCommand: result.ffmpeg_command,
      };
    } catch (error: any) {
      console.error('Smart trim error:', error);
      return { success: false, error: error.message || 'Smart trim analysis failed' };
    }
  }

  /**
   * Execute smart trim (calculate + run FFmpeg)
   */
  async executeSmartTrim(audioPath: string, platform: TrimPlatform = 'youtube_shorts'): Promise<SmartTrimResult> {
    console.log(`✂️ Executing smart trim: ${audioPath} (${platform})`);

    if (!existsSync(audioPath)) {
      return { success: false, error: `Audio file not found: ${audioPath}` };
    }

    if (!existsSync(this.trimmerScript)) {
      return { success: false, error: 'Smart audio trimmer script not found' };
    }

    try {
      const { stdout, stderr } = await execAsync(
        `python "${this.trimmerScript}" "${audioPath}" --platform ${platform} --execute --verbose`,
        { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
      );

      if (stderr) {
        console.log('Smart trimmer stderr:', stderr);
      }

      const result = JSON.parse(stdout);

      console.log('✅ Smart trim executed');
      console.log(`   Original: ${result.original_duration?.toFixed(1)}s`);
      console.log(`   Final: ${result.final_duration?.toFixed(1)}s`);
      console.log(`   Saved: ${result.time_saved?.toFixed(1)}s`);
      console.log(`   Output: ${result.output_path}`);

      return {
        success: true,
        originalDuration: result.original_duration,
        finalDuration: result.final_duration,
        timeSaved: result.time_saved,
        intro: {
          trimAt: result.intro?.trim_at || 0,
          shouldTrim: result.intro?.should_trim || false,
          reason: result.intro?.reason || '',
        },
        outro: {
          trimAt: result.outro?.trim_at || result.original_duration,
          shouldTrim: result.outro?.should_trim || false,
          reason: result.outro?.reason || '',
        },
        platform,
        platformLimit: PLATFORM_LIMITS[platform],
        fitsPlatform: result.fits_platform,
        bpm: result.bpm,
        ffmpegCommand: result.ffmpeg_command,
        outputPath: result.output_path,
        executed: result.executed || false,
      };
    } catch (error: any) {
      console.error('Smart trim execution error:', error);
      return { success: false, error: error.message || 'Smart trim execution failed' };
    }
  }
}

export const smartAudioTrimmerService = new SmartAudioTrimmerService();
export const audioAnalysisService = new AudioAnalysisService();

// =============================================================================
// VEO AUDIO SYNC SERVICE
// 8-second BPM alignment and section snapping for VEO clips
// =============================================================================

// VEO-aligned BPMs (divisible by 7.5 for clean 8-second clips)
export const VEO_ALIGNED_BPMS = [60, 90, 120, 150, 180, 210, 240];

export interface BpmAlignmentResult {
  bpm: number;
  beatsIn8Seconds: number;
  barsIn8Seconds: number;
  isAligned: boolean;
  isPerfectlyAligned: boolean;
  recommendation: 'USE' | 'AVOID';
  nearestAligned: number;
}

export interface VeoSyncSection {
  index: number;
  start: number;
  end: number;
  duration: number;
  avgEnergy: number;
  peakEnergy: number;
  energyNormalized: number;
  energyLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  cameraSuggestion: string;
  beatCount: number;
  timestampStr: string;
}

export interface VeoAudioSyncResult {
  success: boolean;
  audioPath?: string;
  duration?: number;
  tempo?: number;
  bpmAligned?: boolean;
  bpmAlignment?: BpmAlignmentResult;
  beatTimes?: number[];
  totalSections?: number;
  sections?: VeoSyncSection[];
  maxDurationApplied?: number;
  error?: string;
}

class VeoAudioSyncService {
  private pythonScript = join(process.cwd(), 'server', 'services', 'veo_audio_sync.py');

  /**
   * Check if a BPM aligns cleanly with 8-second VEO clips
   */
  checkBpmAlignment(bpm: number): BpmAlignmentResult {
    const beatsIn8s = (bpm * 8) / 60;
    const barsIn8s = beatsIn8s / 4; // Assuming 4/4 time

    // Check if beats align to half-bar or full bar
    const isHalfBarAligned = beatsIn8s % 2 < 0.01;
    const isFullBarAligned = beatsIn8s % 4 < 0.01;

    const nearestAligned = VEO_ALIGNED_BPMS.reduce((prev, curr) =>
      Math.abs(curr - bpm) < Math.abs(prev - bpm) ? curr : prev,
    );

    return {
      bpm,
      beatsIn8Seconds: Math.round(beatsIn8s * 100) / 100,
      barsIn8Seconds: Math.round(barsIn8s * 100) / 100,
      isAligned: isHalfBarAligned,
      isPerfectlyAligned: isFullBarAligned,
      recommendation: isHalfBarAligned ? 'USE' : 'AVOID',
      nearestAligned: isHalfBarAligned ? bpm : nearestAligned,
    };
  }

  /**
   * Find nearest VEO-aligned BPM
   */
  findNearestAlignedBpm(targetBpm: number): number {
    return VEO_ALIGNED_BPMS.reduce((prev, curr) =>
      Math.abs(curr - targetBpm) < Math.abs(prev - targetBpm) ? curr : prev,
    );
  }

  /**
   * Snap sections to 8-second boundaries
   * This ensures all VEO clips are exactly 8 seconds (or less for the final clip)
   */
  snapTo8Seconds(
    totalDuration: number,
    maxDuration: number = 180,
  ): Array<{ start: number; end: number; duration: number }> {
    const targetLength = 8;
    const effectiveDuration = Math.min(totalDuration, maxDuration);

    const sections: Array<{ start: number; end: number; duration: number }> = [];

    for (let start = 0; start < effectiveDuration; start += targetLength) {
      const end = Math.min(start + targetLength, effectiveDuration);
      const duration = end - start;

      // Skip tiny remainder sections (less than 2 seconds)
      if (duration < 2) continue;

      sections.push({
        start: Math.round(start * 100) / 100,
        end: Math.round(end * 100) / 100,
        duration: Math.round(duration * 100) / 100,
      });
    }

    return sections;
  }

  /**
   * Analyze audio for VEO sync using the Python module
   * Returns sections snapped to 8-second boundaries with energy analysis
   */
  async analyzeForVeoSync(audioPath: string, maxDuration: number = 180): Promise<VeoAudioSyncResult> {
    console.log('🎵 VEO Audio Sync: Analyzing audio...', audioPath);

    if (!existsSync(audioPath)) {
      return { success: false, error: `Audio file not found: ${audioPath}` };
    }

    if (!existsSync(this.pythonScript)) {
      console.warn('   ⚠️ VEO Audio Sync Python script not found, using fallback');
      return this.fallbackAnalysis(audioPath, maxDuration);
    }

    try {
      const { stdout, stderr } = await execAsync(
        `python3 "${this.pythonScript}" analyze --audio "${audioPath}" --max-duration ${maxDuration}`,
        { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
      );

      if (stderr) {
        console.log('   VEO Audio Sync stderr:', stderr);
      }

      const result = JSON.parse(stdout);

      // Check BPM alignment
      const bpmAlignment = this.checkBpmAlignment(result.tempo);

      console.log(`   ✓ VEO Audio Sync complete`);
      console.log(`   BPM: ${result.tempo} (${bpmAlignment.recommendation})`);
      console.log(`   Duration: ${result.duration}s`);
      console.log(`   Sections: ${result.total_sections} (8-second aligned)`);

      if (!bpmAlignment.isAligned) {
        console.log(`   ⚠️ BPM not aligned! Nearest: ${bpmAlignment.nearestAligned} BPM`);
      }

      return {
        success: true,
        audioPath: result.audio_path,
        duration: result.duration,
        tempo: result.tempo,
        bpmAligned: result.bpm_aligned,
        bpmAlignment,
        beatTimes: result.beat_times,
        totalSections: result.total_sections,
        sections: result.sections?.map((s: any) => ({
          index: s.index,
          start: s.start,
          end: s.end,
          duration: s.duration,
          avgEnergy: s.avg_energy,
          peakEnergy: s.peak_energy,
          energyNormalized: s.energy_normalized,
          energyLevel: s.energy_level,
          cameraSuggestion: s.camera_suggestion,
          beatCount: s.beat_count,
          timestampStr: s.timestamp_str,
        })),
        maxDurationApplied: maxDuration,
      };
    } catch (error: any) {
      console.error('VEO Audio Sync error:', error);
      console.log('   Falling back to simple analysis...');
      return this.fallbackAnalysis(audioPath, maxDuration);
    }
  }

  /**
   * Fallback analysis when Python script unavailable
   * Uses existing audioAnalysisService and snaps to 8-second boundaries
   */
  private async fallbackAnalysis(audioPath: string, maxDuration: number): Promise<VeoAudioSyncResult> {
    try {
      const analysisResult = await audioAnalysisService.analyzeAudio(audioPath);

      if (!analysisResult.success || !analysisResult.analysis) {
        return { success: false, error: analysisResult.error || 'Analysis failed' };
      }

      const analysis = analysisResult.analysis;
      const bpmAlignment = this.checkBpmAlignment(analysis.bpm);
      const snappedSections = this.snapTo8Seconds(analysis.duration, maxDuration);

      // Map snapped sections with energy from original analysis
      const sections: VeoSyncSection[] = snappedSections.map((snap, idx) => {
        // Find overlapping section from original analysis
        const original =
          analysis.sections.find((s) => s.startTime <= snap.start && s.endTime >= snap.end) ||
          analysis.sections[Math.min(idx, analysis.sections.length - 1)];

        const energy = original?.averageEnergy || 0.5;
        let energyLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
        let cameraSuggestion = 'steady tracking, medium shots';

        if (energy > 0.7) {
          energyLevel = 'HIGH';
          cameraSuggestion = 'epic wide shots, fast cuts, dynamic movement';
        } else if (energy < 0.4) {
          energyLevel = 'LOW';
          cameraSuggestion = 'intimate close-ups, slow pans, contemplative';
        }

        return {
          index: idx,
          start: snap.start,
          end: snap.end,
          duration: snap.duration,
          avgEnergy: energy,
          peakEnergy: original?.maxEnergy || energy,
          energyNormalized: energy,
          energyLevel,
          cameraSuggestion,
          beatCount: Math.round((analysis.bpm * snap.duration) / 60),
          timestampStr: `${Math.floor(snap.start / 60)}:${String(Math.floor(snap.start % 60)).padStart(2, '0')}-${Math.floor(snap.end / 60)}:${String(Math.floor(snap.end % 60)).padStart(2, '0')}`,
        };
      });

      console.log(`   ✓ VEO Audio Sync (fallback) complete`);
      console.log(`   BPM: ${analysis.bpm} (${bpmAlignment.recommendation})`);
      console.log(`   Sections: ${sections.length} (8-second aligned)`);

      return {
        success: true,
        audioPath,
        duration: Math.min(analysis.duration, maxDuration),
        tempo: analysis.bpm,
        bpmAligned: bpmAlignment.isAligned,
        bpmAlignment,
        beatTimes: analysis.beats,
        totalSections: sections.length,
        sections,
        maxDurationApplied: maxDuration,
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Fallback analysis failed' };
    }
  }

  /**
   * Get VEO pacing guidance based on BPM and section type
   */
  getPacingGuidance(sectionType: string, bpm: number, energy: number): string {
    // BPM categories
    let bpmCategory: string;
    let cameraSpeed: string;
    let actionTiming: string;

    if (bpm < 80) {
      bpmCategory = 'slow';
      cameraSpeed = 'slow push-in over 4-6 seconds';
      actionTiming = 'Actions unfold gradually, lingering moments';
    } else if (bpm < 110) {
      bpmCategory = 'moderate';
      cameraSpeed = 'steady tracking, smooth pans';
      actionTiming = 'Actions on the beat, measured pacing';
    } else if (bpm < 140) {
      bpmCategory = 'fast';
      cameraSpeed = 'dynamic tracking, quick pans';
      actionTiming = 'Actions synced to beats, energetic cuts';
    } else {
      bpmCategory = 'intense';
      cameraSpeed = 'rapid whip pans, sub-second snaps';
      actionTiming = 'Actions on every half-beat, intense pace';
    }

    // Energy modifiers
    let energyModifier = '';
    if (energy > 0.8) {
      energyModifier = ', camera shake on impacts, maximum drama';
    } else if (energy < 0.3) {
      energyModifier = ', stillness and contemplation, minimal movement';
    }

    return `${cameraSpeed}, ${actionTiming}${energyModifier}`;
  }
}

export const veoAudioSyncService = new VeoAudioSyncService();
