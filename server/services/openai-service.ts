// Fully migrated to Gemini - no OpenAI dependency
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { apiCostTracker } from './api-cost-tracker';

// Lazy-load Gemini client to allow secrets to be loaded first
let _gemini: GoogleGenerativeAI | null = null;
let _fileManager: GoogleAIFileManager | null = null;
let _initialized = false;

function getGeminiClient(): GoogleGenerativeAI {
  if (_gemini) return _gemini;

  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('No GEMINI_API_KEY or AI_INTEGRATIONS_GEMINI_API_KEY found');
  }

  _gemini = new GoogleGenerativeAI(apiKey);
  if (!_initialized) {
    console.log('✅ Gemini client initialized with API key');
    _initialized = true;
  }

  return _gemini;
}

function getFileManager(): GoogleAIFileManager {
  if (_fileManager) return _fileManager;

  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('No GEMINI_API_KEY for file manager');
  }

  _fileManager = new GoogleAIFileManager(apiKey);
  return _fileManager;
}

// Export Gemini client getter for other services that import from here
export { getGeminiClient };

// Legacy export name kept for backward compatibility (used by clip-quality-validator etc.)
// This is now a Gemini client, not an OpenAI client
export const openai = {
  _isGemini: true,
  getGenerativeModel: (config: any) => getGeminiClient().getGenerativeModel(config),
};

const GEMINI_MODEL = 'gemini-2.5-flash';

// Cache directory for transcription results
const TRANSCRIPTION_CACHE_DIR = join(process.cwd(), 'data', 'cache', 'whisper');

// Ensure cache directory exists
try {
  mkdirSync(TRANSCRIPTION_CACHE_DIR, { recursive: true });
} catch (e) {
  // Ignore if already exists
}

/**
 * Generate a cache key from audio file (hash of file content + size)
 */
function getAudioCacheKey(audioPath: string): string {
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
 * Timeout wrapper to prevent API calls from hanging indefinitely
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

/**
 * Tracked Gemini completion with cost logging
 */
async function trackedGeminiCompletion(
  prompt: string,
  operation: string,
  options: {
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    jobId?: string;
  } = {},
): Promise<string> {
  const { systemPrompt, temperature = 0.7, maxOutputTokens = 8192, responseMimeType, jobId } = options;

  const gemini = getGeminiClient();
  const model = gemini.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(responseMimeType ? { responseMimeType } : {}),
    },
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text() || '';

  const usage = result.response.usageMetadata;
  if (usage) {
    await apiCostTracker.trackGemini({
      model: GEMINI_MODEL,
      operation,
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
      jobId,
      success: true,
      metadata: { wrapperFunction: operation },
    });
  }

  return text;
}

/**
 * Tracked Gemini multimodal completion (text + images)
 */
async function trackedGeminiMultimodal(
  parts: any[],
  operation: string,
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    jobId?: string;
  } = {},
): Promise<string> {
  const { temperature = 0.3, maxOutputTokens = 2000, responseMimeType, jobId } = options;

  const gemini = getGeminiClient();
  const model = gemini.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(responseMimeType ? { responseMimeType } : {}),
    },
  });

  const result = await model.generateContent(parts);
  const text = result.response.text() || '';

  const usage = result.response.usageMetadata;
  if (usage) {
    await apiCostTracker.trackGemini({
      model: GEMINI_MODEL,
      operation,
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
      jobId,
      success: true,
      metadata: { wrapperFunction: operation },
    });
  }

  return text;
}

interface ScriptAnalysis {
  summary: string;
  keyMoments: string[];
  emotions: string[];
  sceneCount: number;
  estimatedDuration: number;
}

/**
 * Analyzes a script using the "Storytelling River" framework
 * Identifies key narrative moments, emotions, and scene structure
 */
export async function analyzeScript(script: string): Promise<ScriptAnalysis> {
  try {
    const systemPrompt = `You are a storytelling analyst using the "Storytelling River" framework. Analyze scripts for:
1. Stepping stones (key narrative moments)
2. Forward motion (story progression)
3. Emotional arcs
4. Visual needs for cinematography

Respond in JSON format with: summary, keyMoments (array), emotions (array), sceneCount (number), estimatedDuration (seconds).`;

    const content = await withTimeout(
      trackedGeminiCompletion(`Analyze this script:\n\n${script}`, 'analyzeScript', {
        systemPrompt,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      }),
      180000,
      'Gemini script analysis timed out after 3 minutes',
    );

    const analysis = JSON.parse(content) as ScriptAnalysis;
    return analysis;
  } catch (error) {
    console.error('Script analysis error:', error);
    return {
      summary: 'Script analysis unavailable',
      keyMoments: ['Beginning', 'End'],
      emotions: ['neutral'],
      sceneCount: 2,
      estimatedDuration: 16,
    };
  }
}

/**
 * Generates VEO-compatible prompts from script analysis
 * Maps emotions to cinematography techniques
 */
export async function generateVEOPrompts(
  script: string,
  analysis: ScriptAnalysis,
  scene: string = 'neutral background',
): Promise<string[]> {
  try {
    const targetSceneCount = analysis.sceneCount || 6;

    const systemPrompt = `You are a VEO prompt engineer. Create detailed visual prompts (150+ characters each) for Google's VEO 2 video generation.

Each prompt must include:
1. Subject (main character/object)
2. Context (location: ${scene})
3. Action (what's happening)
4. Style (visual aesthetic)
5. Camera work (shot type, movement)
6. Composition (framing)
7. Ambiance (lighting, mood)

Generate exactly ${targetSceneCount} prompts that tell the story visually. Respond in JSON format with a "prompts" array.`;

    const content = await withTimeout(
      trackedGeminiCompletion(
        `Script: ${script}\n\nKey moments: ${analysis.keyMoments.join(', ')}\nEmotions: ${analysis.emotions.join(', ')}`,
        'generateVEOPrompts',
        {
          systemPrompt,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      ),
      180000,
      'Gemini prompt generation timed out after 3 minutes',
    );

    const result = JSON.parse(content) as { prompts: string[] };

    // Fallback prompts if AI fails
    if (!result.prompts || result.prompts.length === 0) {
      console.log('Generating fallback prompts');
      return analysis.keyMoments.slice(0, targetSceneCount).map((moment, i) => {
        const shotType = i % 3 === 0 ? 'wide establishing shot' : i % 3 === 1 ? 'medium shot' : 'close-up shot';
        return `${scene}, ${shotType}, ${moment}, cinematic lighting, professional production, ${analysis.emotions[0] || 'neutral'} mood`;
      });
    }

    return result.prompts;
  } catch (error) {
    console.error('VEO prompt generation error:', error);
    // Return fallback prompts on error
    const targetSceneCount = analysis.sceneCount || 2;
    return analysis.keyMoments.slice(0, targetSceneCount).map((moment, i) => {
      const shotType = i % 3 === 0 ? 'wide establishing shot' : i % 3 === 1 ? 'medium shot' : 'close-up shot';
      return `${scene}, ${shotType}, ${moment}, cinematic lighting, professional production`;
    });
  }
}

/**
 * Generates a character reference image using Gemini native image generation
 * Returns base64 encoded image data
 */
export async function generateCharacterImage(
  characterName: string,
  characterDescription: string,
  traits: string[],
  visualStyle?: string,
): Promise<{ imageBase64: string; prompt: string }> {
  const styleHints = visualStyle || 'cinematic character portrait, dramatic lighting, professional quality';

  const prompt = `Professional character portrait of ${characterName}: ${characterDescription}.
Character traits: ${traits.join(', ')}.
Style: ${styleHints}, centered composition, clear face visibility, suitable for animation reference, neutral background, front-facing 3/4 view, high detail on facial features.
NO text, NO watermarks, NO logos.`;

  console.log(`🎨 Generating character image for: ${characterName}`);

  try {
    // Use @google/genai for image generation (Gemini native image gen)
    const { GoogleGenAI } = await import('@google/genai');
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found for image generation');

    const genai = new GoogleGenAI({ apiKey });
    const response = await withTimeout(
      genai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: prompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
      120000,
      'Character image generation timed out after 2 minutes',
    );

    // Extract image from response
    let imageBase64 = '';
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!imageBase64) {
      throw new Error('No image data returned from Gemini image generation');
    }

    await apiCostTracker.trackGemini({
      model: 'gemini-2.5-flash-image',
      operation: 'generateCharacterImage',
      inputTokens: prompt.length / 4,
      outputTokens: 0,
      success: true,
      metadata: { characterName },
    });

    console.log(`✅ Generated character image for: ${characterName}`);
    return { imageBase64, prompt };
  } catch (error) {
    console.error(`❌ Failed to generate character image for ${characterName}:`, error);
    throw error;
  }
}

/**
 * Generates character images for both protagonist and antagonist
 */
export async function generateCharacterImages(
  protagonist: { name: string; description: string; traits: string[] },
  antagonist: { name: string; description: string; traits: string[] },
  visualStyle?: string,
): Promise<{
  protagonist: { imageBase64: string; prompt: string };
  antagonist: { imageBase64: string; prompt: string };
}> {
  console.log('🎨 Generating character images for story bible...');

  const [protagResult, antagResult] = await Promise.all([
    generateCharacterImage(
      protagonist.name,
      protagonist.description,
      protagonist.traits,
      visualStyle ? `${visualStyle}, heroic lighting` : 'heroic cinematic portrait, warm lighting',
    ),
    generateCharacterImage(
      antagonist.name,
      antagonist.description,
      antagonist.traits,
      visualStyle ? `${visualStyle}, ominous lighting` : 'ominous cinematic portrait, dramatic shadows',
    ),
  ]);

  console.log('✅ Both character images generated successfully');
  return { protagonist: protagResult, antagonist: antagResult };
}

/**
 * Generates a compelling video description for uploads (YouTube, social media)
 * Creates engaging copy based on script content, title, and episode context
 */
export async function generateVideoDescription(params: {
  title: string;
  scriptContent: string;
  duration?: number;
  mode?: string;
  seriesTitle?: string;
  episodeNumber?: number;
}): Promise<string> {
  const { title, scriptContent, duration, mode, seriesTitle, episodeNumber } = params;

  console.log('📝 Generating video description for:', title);

  try {
    const systemPrompt = `You write video descriptions like a Wikipedia editor - dry, factual, zero marketing language.

BANNED PHRASES (never use):
- "This video..." / "In this video..." / "delves into" / "explores"
- "Dive into" / "Discover" / "Join us" / "Subscribe" / "Like and share"
- "captivating" / "stunning" / "powerful" / "tragic" / "epic"
- "imbued with" / "resonant with" / "reflective of"
- Any call to action

STYLE:
- Start directly with the subject, not "This video"
- State facts: dates, names, places, events
- No adjectives unless historically accurate (e.g. "Ptolemaic" is OK, "tragic" is not)
- Write like an encyclopedia entry, not marketing copy
- Maximum 100 words

FORMAT:
[Subject name and dates]. [What happened - 2-3 factual sentences]. [One sentence on historical context or visual period].

---
[4-5 hashtags]`;

    const description = await withTimeout(
      trackedGeminiCompletion(
        `Write a description for:

Title: ${title}
${seriesTitle ? `Series: ${seriesTitle}` : ''}
${episodeNumber ? `Episode: ${episodeNumber}` : ''}
${duration ? `Duration: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : ''}

Content to describe:
${scriptContent.substring(0, 2000)}${scriptContent.length > 2000 ? '...' : ''}`,
        'generateVideoDescription',
        {
          systemPrompt,
          maxOutputTokens: 512,
        },
      ),
      60000,
      'Video description generation timed out',
    );

    console.log('✅ Video description generated successfully');
    return description;
  } catch (error) {
    console.error('❌ Failed to generate video description:', error);
    return `${title}

${seriesTitle ? `From the ${seriesTitle} series.` : 'AI-generated animated video.'}

---
#History #Animation #Documentary`;
  }
}

/**
 * Word-level timestamp from transcription
 */
export interface WhisperWord {
  word: string;
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

/**
 * Transcription result with word-level timestamps
 */
export interface WhisperTranscription {
  text: string;
  words: WhisperWord[];
  language: string;
  duration: number;
}

/**
 * Get cached transcription if available
 */
function getCachedTranscription(cacheKey: string): WhisperTranscription | null {
  const cachePath = join(TRANSCRIPTION_CACHE_DIR, `whisper_${cacheKey}.json`);
  try {
    if (existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
      console.log(`   💾 Found cached transcription`);
      return cached;
    }
  } catch (e) {
    // Cache read failed, will re-transcribe
  }
  return null;
}

/**
 * Save transcription to cache
 */
function saveTranscriptionToCache(cacheKey: string, transcription: WhisperTranscription): void {
  const cachePath = join(TRANSCRIPTION_CACHE_DIR, `whisper_${cacheKey}.json`);
  try {
    writeFileSync(cachePath, JSON.stringify(transcription, null, 2));
    console.log(`   💾 Cached transcription for future use`);
  } catch (e) {
    console.warn('   ⚠️ Failed to cache transcription');
  }
}

/**
 * Transcribe audio using Gemini with word-level timestamps
 * Used for karaoke-style subtitle synchronization
 * OPTIMIZED: Uses cache to skip re-transcription for same audio files
 * @param audioPath - Path to the audio file (MP3, WAV, etc.)
 * @returns Transcription with word-level timestamps
 */
export async function transcribeAudioWithTimestamps(audioPath: string): Promise<WhisperTranscription> {
  const fs = await import('fs');

  console.log(`🎤 Transcribing audio with Gemini: ${audioPath}`);

  // Check if file exists
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Check cache first
  const cacheKey = getAudioCacheKey(audioPath);
  const cached = getCachedTranscription(cacheKey);
  if (cached) {
    console.log(`   ✅ Transcribed ${cached.words.length} words (from cache)`);
    console.log(
      `   📝 First 5 words: ${cached.words
        .slice(0, 5)
        .map((w) => `"${w.word}" @${w.start.toFixed(2)}s`)
        .join(', ')}`,
    );
    return cached;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not configured - skipping transcription');
      return { text: '', words: [], language: 'en', duration: 0 };
    }

    console.log('   📊 Running Gemini audio transcription (not cached)...');

    // Upload audio file to Gemini File API
    const fileManager = getFileManager();
    const mimeType = audioPath.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
    const uploaded = await fileManager.uploadFile(audioPath, {
      mimeType,
      displayName: `transcription_${cacheKey}`,
    });

    console.log(`   📤 Uploaded audio file: ${uploaded.file.name}`);

    // Wait for file to be processed
    let file = uploaded.file;
    while (file.state === 'PROCESSING') {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = await fileManager.getFile(file.name);
      file = result;
    }

    if (file.state === 'FAILED') {
      throw new Error('Audio file processing failed in Gemini');
    }

    // Transcribe with Gemini
    const gemini = getGeminiClient();
    const model = gemini.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await withTimeout(
      model.generateContent([
        {
          fileData: {
            fileUri: file.uri,
            mimeType,
          },
        },
        {
          text: `Transcribe this audio with word-level timestamps. Return ONLY valid JSON in this exact format, no other text:
{"text":"full transcription text","words":[{"word":"example","start":0.0,"end":0.5}],"language":"en","duration":0.0}

Rules:
- Every word must have start and end times in seconds (floating point)
- Times must be monotonically increasing
- Include ALL spoken words
- Set "duration" to the total audio duration in seconds
- If the audio is instrumental/music only with no speech, return {"text":"","words":[],"language":"en","duration":0.0}`,
        },
      ]),
      300000,
      'Gemini transcription timed out after 5 minutes',
    );

    const responseText = result.response.text() || '';

    // Track cost
    const usage = result.response.usageMetadata;
    if (usage) {
      await apiCostTracker.trackGemini({
        model: GEMINI_MODEL,
        operation: 'transcribeAudio',
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        success: true,
        metadata: { audioPath },
      });
    }

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('   ⚠️ Could not parse transcription JSON, returning empty');
      return { text: '', words: [], language: 'en', duration: 0 };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Filter out music symbols
    const MUSIC_SYMBOL_PATTERN = /^[♪♫♬♩\s]+$/;

    const words: WhisperWord[] = (parsed.words || [])
      .map((w: any) => ({
        word: (w.word || '').trim(),
        start: w.start || 0,
        end: w.end || 0,
      }))
      .filter((w: WhisperWord) => {
        if (w.word.length === 0) return false;
        if (MUSIC_SYMBOL_PATTERN.test(w.word)) return false;
        return true;
      });

    const transcription: WhisperTranscription = {
      text: parsed.text || '',
      words,
      language: parsed.language || 'en',
      duration: parsed.duration || words[words.length - 1]?.end || 0,
    };

    // Save to cache for future use
    saveTranscriptionToCache(cacheKey, transcription);

    console.log(`   ✅ Transcribed ${words.length} words`);
    console.log(
      `   📝 First 5 words: ${words
        .slice(0, 5)
        .map((w) => `"${w.word}" @${w.start.toFixed(2)}s`)
        .join(', ')}`,
    );

    // Clean up uploaded file
    try {
      await fileManager.deleteFile(file.name);
    } catch (e) {
      // Ignore cleanup errors
    }

    return transcription;
  } catch (error: any) {
    console.error('❌ Gemini transcription failed:', error.message);
    throw error;
  }
}

/**
 * Align known lyrics with transcription timestamps
 * Uses fuzzy matching to map original lyrics to transcribed words
 * @param lyrics - Original lyrics text
 * @param transcription - Transcription with timestamps
 * @returns Lyrics with word-level timestamps
 */
export function alignLyricsWithTranscription(lyrics: string, transcription: WhisperTranscription): WhisperWord[] {
  console.log('🔗 Aligning lyrics with transcription timestamps...');

  // Clean and tokenize lyrics
  const lyricWords = lyrics
    .replace(/\[.*?\]/g, '') // Remove section markers like [Verse 1]
    .replace(/[^\w\s']/g, ' ') // Remove punctuation except apostrophes
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  // Clean transcribed words
  const transcribedWords = transcription.words.map((w) => ({
    ...w,
    normalized: w.word.replace(/[^\w']/g, '').toLowerCase(),
  }));

  const alignedWords: WhisperWord[] = [];
  let transcriptIdx = 0;

  for (const lyricWord of lyricWords) {
    const normalizedLyric = lyricWord.replace(/[^\w']/g, '').toLowerCase();

    // Look ahead to find matching word in transcript
    let found = false;
    for (let i = transcriptIdx; i < Math.min(transcriptIdx + 10, transcribedWords.length); i++) {
      if (
        transcribedWords[i].normalized === normalizedLyric ||
        transcribedWords[i].normalized.includes(normalizedLyric) ||
        normalizedLyric.includes(transcribedWords[i].normalized)
      ) {
        alignedWords.push({
          word: lyricWord, // Use original lyric word
          start: transcribedWords[i].start,
          end: transcribedWords[i].end,
        });
        transcriptIdx = i + 1;
        found = true;
        break;
      }
    }

    // If no match found, estimate timing based on previous word
    if (!found && alignedWords.length > 0) {
      const lastWord = alignedWords[alignedWords.length - 1];
      const avgWordDuration = 0.3; // Average word duration estimate
      alignedWords.push({
        word: lyricWord,
        start: lastWord.end,
        end: lastWord.end + avgWordDuration,
      });
    } else if (!found) {
      // First word with no match - use transcript start
      alignedWords.push({
        word: lyricWord,
        start: transcribedWords[0]?.start || 0,
        end: transcribedWords[0]?.end || 0.3,
      });
    }
  }

  console.log(`   ✅ Aligned ${alignedWords.length} lyric words with timestamps`);
  return alignedWords;
}

/**
 * General-purpose text generation using Gemini
 * Useful for creative content generation like lyrics, prompts, etc.
 */
export async function generateText(
  prompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  } = {},
): Promise<string> {
  const { temperature = 0.8, maxTokens = 2000, systemPrompt } = options;

  try {
    return await trackedGeminiCompletion(prompt, 'text_generation', {
      systemPrompt,
      temperature,
      maxOutputTokens: maxTokens,
    });
  } catch (error) {
    console.error('Text generation error:', error);
    throw error;
  }
}

// Re-export viral lyrics engine functions
export {
  generateViralLyrics,
  rewriteLyricsViral,
  parseLyricsToSegments,
  VIRAL_LYRICS_PROMPT,
  viralLyricsEngine,
  type LyricsResult,
  type LyricSegment,
} from './viral-lyrics-engine';

export const openaiService = {
  analyzeScript,
  generateVEOPrompts,
  generateCharacterImage,
  generateCharacterImages,
  generateVideoDescription,
  generateText,
  transcribeAudioWithTimestamps,
  alignLyricsWithTranscription,
};
