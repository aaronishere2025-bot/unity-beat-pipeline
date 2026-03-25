/**
 * Demucs Separation Service
 *
 * Separates audio into 4 stems (vocals, drums, bass, other) using Demucs
 * and analyzes each stem individually for correlation with YouTube retention.
 *
 * FEATURES:
 * - Source separation via Python/Demucs htdemucs model
 * - Per-stem Librosa analysis (energy, spectral features, onsets)
 * - Aggressive caching (by audio file hash) to avoid re-processing
 * - Parallel stem analysis for faster results
 *
 * CACHE STRATEGY:
 * - Stems saved to data/temp/processing/stems/
 * - Cache indexed by audio file hash (same as audio-analysis-service)
 * - Cache persists between jobs for same audio file
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { TempPaths } from '../utils/temp-file-manager';

const execAsync = promisify(exec);

// Stem names output by Demucs
export type StemName = 'vocals' | 'drums' | 'bass' | 'other';
export const STEM_NAMES: StemName[] = ['vocals', 'drums', 'bass', 'other'];

// Per-stem analysis result
export interface StemAnalysis {
  stem_name: StemName;
  duration: number;
  tempo: number;
  beat_count: number;
  beats: number[];
  onset_count: number;
  onsets: number[];
  per_second_features: Array<{
    time: number;
    energy: number;
    brightness: number;
    bandwidth: number;
    zcr: number;
  }>;
  overall: {
    avg_energy: number;
    peak_energy: number;
    energy_variance: number;
    avg_brightness: number;
    avg_bandwidth: number;
  };
}

// Full separation + analysis result
export interface DemucsSeparationResult {
  success: boolean;
  stems?: Record<StemName, string>; // Paths to stem files
  sample_rate?: number;
  duration?: number;
  analysis?: Record<StemName, StemAnalysis>;
  error?: string;
}

// Cache metadata
interface CacheMetadataEntry {
  hash: string;
  audioPath: string;
  stemPaths: Record<StemName, string>;
  createdAt: number;
  lastAccessed: number;
  audioFileSize: number;
  audioModifiedTime: number;
}

interface CacheMetadata {
  entries: Record<string, CacheMetadataEntry>;
  lastCleanup: number;
}

class DemucsSeparationService {
  private pythonScript = join(process.cwd(), 'scripts', 'demucs_separator.py');
  private cacheDir = join(TempPaths.processing(), 'stems_cache');
  private metadataFile = join(this.cacheDir, 'metadata.json');
  private metadata: CacheMetadata = { entries: {}, lastCleanup: Date.now() };

  // Cache configuration
  private readonly CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (stems are large)
  private readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily cleanup

  constructor() {
    // Ensure cache directory exists
    try {
      mkdirSync(this.cacheDir, { recursive: true });
    } catch (e) {
      // Ignore if already exists
    }

    this.loadMetadata();
    this.schedulePeriodicCleanup();
  }

  /**
   * Generate cache key from audio file (hash of content + size + mtime)
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
   * Get cached stems if available
   */
  private getCachedStems(cacheKey: string, audioPath: string): Record<StemName, string> | null {
    const entry = this.metadata.entries[cacheKey];

    if (!entry) {
      console.log(`   🔍 Cache MISS: ${cacheKey.slice(0, 8)} (no entry)`);
      return null;
    }

    // Check if source file was modified
    try {
      const stats = statSync(audioPath);
      if (stats.mtime.getTime() !== entry.audioModifiedTime) {
        console.log(`   🔄 Cache invalidated: source file modified`);
        this.removeCacheEntry(cacheKey);
        return null;
      }
    } catch (e) {
      // Source file became inaccessible
      this.removeCacheEntry(cacheKey);
      return null;
    }

    // Check if all stem files still exist
    for (const stemName of STEM_NAMES) {
      if (!entry.stemPaths[stemName] || !existsSync(entry.stemPaths[stemName])) {
        console.log(`   🔄 Cache invalidated: ${stemName} stem missing`);
        this.removeCacheEntry(cacheKey);
        return null;
      }
    }

    // Update last accessed timestamp
    entry.lastAccessed = Date.now();
    this.saveMetadata();

    console.log(`   💾 Cache HIT: ${cacheKey.slice(0, 8)} (all stems present)`);
    return entry.stemPaths;
  }

  /**
   * Save stems to cache
   */
  private saveStemsToCache(cacheKey: string, audioPath: string, stemPaths: Record<StemName, string>): void {
    try {
      const stats = statSync(audioPath);

      this.metadata.entries[cacheKey] = {
        hash: cacheKey,
        audioPath,
        stemPaths,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        audioFileSize: stats.size,
        audioModifiedTime: stats.mtime.getTime(),
      };

      this.saveMetadata();
      console.log(`   💾 Cached stems for: ${cacheKey.slice(0, 8)}`);
    } catch (e) {
      console.warn('   ⚠️ Failed to cache stems:', e);
    }
  }

  /**
   * Remove a specific cache entry
   */
  private removeCacheEntry(hash: string): boolean {
    const entry = this.metadata.entries[hash];
    if (!entry) return false;

    // Delete stem files
    for (const stemPath of Object.values(entry.stemPaths)) {
      try {
        if (existsSync(stemPath)) {
          unlinkSync(stemPath);
        }
      } catch (e) {
        console.warn(`⚠️ Failed to remove stem file: ${stemPath}`);
      }
    }

    delete this.metadata.entries[hash];
    return true;
  }

  /**
   * Perform cache cleanup (remove expired and orphaned entries)
   */
  private performCleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    // Remove expired entries
    for (const [hash, entry] of Object.entries(this.metadata.entries)) {
      const age = now - entry.createdAt;
      if (age > this.CACHE_MAX_AGE_MS) {
        const removed = this.removeCacheEntry(hash);
        if (removed) {
          removedCount++;
          console.log(
            `   🗑️ Removed expired: ${hash.slice(0, 8)} (${(age / 1000 / 60 / 60 / 24).toFixed(0)} days old)`,
          );
        }
      }
    }

    // Remove entries for deleted or modified source files
    for (const [hash, entry] of Object.entries(this.metadata.entries)) {
      if (!existsSync(entry.audioPath)) {
        const removed = this.removeCacheEntry(hash);
        if (removed) {
          removedCount++;
          console.log(`   🗑️ Removed orphaned: ${hash.slice(0, 8)} (source file deleted)`);
        }
        continue;
      }

      try {
        const stats = statSync(entry.audioPath);
        if (stats.mtime.getTime() !== entry.audioModifiedTime) {
          const removed = this.removeCacheEntry(hash);
          if (removed) {
            removedCount++;
            console.log(`   🗑️ Removed stale: ${hash.slice(0, 8)} (source file modified)`);
          }
        }
      } catch (e) {
        const removed = this.removeCacheEntry(hash);
        if (removed) removedCount++;
      }
    }

    this.metadata.lastCleanup = now;
    this.saveMetadata();

    if (removedCount > 0) {
      console.log(`✅ Stems cache cleanup: removed ${removedCount} entries`);
    }
  }

  /**
   * Schedule periodic cleanup
   */
  private schedulePeriodicCleanup(): void {
    setInterval(() => {
      console.log('🧹 Running scheduled stems cache cleanup...');
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Load cache metadata from disk
   */
  private loadMetadata(): void {
    try {
      if (existsSync(this.metadataFile)) {
        const data = readFileSync(this.metadataFile, 'utf-8');
        this.metadata = JSON.parse(data);
        console.log(`💾 Loaded stems cache: ${Object.keys(this.metadata.entries).length} entries`);
      }
    } catch (e) {
      console.warn('⚠️ Failed to load stems cache metadata, starting fresh');
      this.metadata = { entries: {}, lastCleanup: Date.now() };
    }
  }

  /**
   * Save cache metadata to disk
   */
  private saveMetadata(): void {
    try {
      const tempFile = `${this.metadataFile}.tmp`;
      writeFileSync(tempFile, JSON.stringify(this.metadata, null, 2));
      // Atomic rename
      if (existsSync(this.metadataFile)) {
        unlinkSync(this.metadataFile);
      }
      writeFileSync(this.metadataFile, readFileSync(tempFile));
      unlinkSync(tempFile);
    } catch (e) {
      console.warn('⚠️ Failed to save stems cache metadata');
    }
  }

  /**
   * Separate audio into stems and analyze each one
   *
   * @param audioPath - Path to audio file
   * @param forceRefresh - Skip cache and re-process
   * @returns Separation result with per-stem analysis
   */
  async separateAndAnalyze(audioPath: string, forceRefresh: boolean = false): Promise<DemucsSeparationResult> {
    console.log('🎵 Starting stem separation:', audioPath);

    // Verify file exists
    if (!existsSync(audioPath)) {
      return {
        success: false,
        error: `Audio file not found: ${audioPath}`,
      };
    }

    // Verify Python script exists
    if (!existsSync(this.pythonScript)) {
      return {
        success: false,
        error: 'Demucs separator script not found',
      };
    }

    // Check cache first
    const cacheKey = this.getAudioCacheKey(audioPath);
    const cachedStems = forceRefresh ? null : this.getCachedStems(cacheKey, audioPath);

    let stemPaths: Record<StemName, string>;

    if (cachedStems) {
      console.log('   💾 Using cached stems');
      stemPaths = cachedStems;
    } else {
      // Create output directory for this separation
      const outputDir = join(this.cacheDir, cacheKey);
      mkdirSync(outputDir, { recursive: true });

      try {
        console.log('   📊 Running Demucs separation (not cached)...');
        console.log('   ⏱️  This may take 30-60 seconds...');

        // Run Python script
        const { stdout, stderr } = await execAsync(`python3 "${this.pythonScript}" "${audioPath}" "${outputDir}"`, {
          timeout: 600000, // 10 minute timeout (Demucs can be slow on CPU)
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        if (stderr) {
          console.log('Demucs stderr:', stderr);
        }

        // Parse JSON output
        const result = JSON.parse(stdout);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Demucs separation failed',
          };
        }

        // Save to cache
        stemPaths = result.stems as Record<StemName, string>;
        this.saveStemsToCache(cacheKey, audioPath, stemPaths);

        console.log('✅ Stem separation complete');

        return {
          success: true,
          stems: stemPaths,
          sample_rate: result.sample_rate,
          duration: result.duration,
          analysis: result.analysis as Record<StemName, StemAnalysis>,
          full_track: (result as any).full_track, // NEW: Full track analysis from unified analysis
        } as DemucsSeparationResult;
      } catch (error: any) {
        console.error('Stem separation error:', error);
        return {
          success: false,
          error: error.message || 'Failed to separate stems',
        };
      }
    }

    // If we have cached stems, we still need to run analysis
    // (analysis is fast, so we don't cache it separately)
    console.log('   📊 Running per-stem analysis on cached stems...');

    try {
      // UNIFIED ANALYSIS: Analyze full track + all stems with identical parameters
      // First analyze the original audio file
      const fullTrackAnalysis = await execAsync(
        `python3 -c "import sys; sys.path.insert(0, '${join(process.cwd(), 'scripts')}'); from demucs_separator import analyze_stem; import json; print(json.dumps(analyze_stem('${audioPath}', 'full_track')))"`,
        {
          timeout: 60000,
          maxBuffer: 5 * 1024 * 1024,
        },
      );
      const fullTrackResult = JSON.parse(fullTrackAnalysis.stdout);

      // Then analyze each stem
      const analysisPromises = STEM_NAMES.map(async (stemName) => {
        const stemPath = stemPaths[stemName];
        if (!stemPath || !existsSync(stemPath)) {
          return null;
        }

        // Call Python script to analyze this stem
        // We'll re-use the analyze_stem function from the Python script
        const { stdout } = await execAsync(
          `python3 -c "import sys; sys.path.insert(0, '${join(process.cwd(), 'scripts')}'); from demucs_separator import analyze_stem; import json; print(json.dumps(analyze_stem('${stemPath}', '${stemName}')))"`,
          {
            timeout: 60000, // 1 minute per stem
            maxBuffer: 5 * 1024 * 1024,
          },
        );

        const analysis = JSON.parse(stdout);
        return analysis.success ? analysis : null;
      });

      const analysisResults = await Promise.all(analysisPromises);

      // Build analysis map
      const analysis: Record<StemName, StemAnalysis> = {} as any;
      for (let i = 0; i < STEM_NAMES.length; i++) {
        if (analysisResults[i]) {
          analysis[STEM_NAMES[i]] = analysisResults[i] as StemAnalysis;
        }
      }

      console.log(`✅ Stem analysis complete: ${Object.keys(analysis).length}/${STEM_NAMES.length} stems analyzed`);

      return {
        success: true,
        stems: stemPaths,
        analysis,
        full_track: fullTrackResult.success ? fullTrackResult : undefined, // NEW: Include full track (cast needed)
      } as any;
    } catch (error: any) {
      console.error('Stem analysis error:', error);
      return {
        success: false,
        error: error.message || 'Failed to analyze stems',
      };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    entryCount: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    lastCleanup: number;
  } {
    const entries = Object.values(this.metadata.entries);
    const now = Date.now();

    return {
      entryCount: entries.length,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map((e) => now - e.createdAt)) : null,
      newestEntry: entries.length > 0 ? Math.min(...entries.map((e) => now - e.createdAt)) : null,
      lastCleanup: this.metadata.lastCleanup,
    };
  }

  /**
   * Clear entire cache
   */
  clearCache(): { success: boolean; removedCount: number } {
    console.log('🗑️ Clearing entire stems cache...');

    const entryCount = Object.keys(this.metadata.entries).length;

    for (const hash of Object.keys(this.metadata.entries)) {
      this.removeCacheEntry(hash);
    }

    this.metadata = { entries: {}, lastCleanup: Date.now() };
    this.saveMetadata();

    console.log(`✅ Cache cleared: removed ${entryCount} entries`);

    return {
      success: true,
      removedCount: entryCount,
    };
  }

  /**
   * Force cleanup (manual trigger)
   */
  forceCleanup(): void {
    this.performCleanup();
  }
}

export const demucsSeparationService = new DemucsSeparationService();
