import Replicate from 'replicate';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { PATH_CONFIG } from '../config/video-constants';

const execAsync = promisify(exec);

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface AudioSeparationResult {
  vocalsUrl: string;
  instrumentalUrl: string;
  vocalsPath?: string;
  instrumentalPath?: string;
}

export interface LyricsTranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
}

export interface MusicIntelligenceResult {
  tempo: number;
  energy: number;
  mood: string;
  genre: string;
  key?: string;
  sections: Array<{
    type: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'instrumental';
    start: number;
    end: number;
    energy: number;
    description: string;
  }>;
  visualTheme: string;
  colorPalette: string[];
  cinematicStyle: string;
}

export interface FullAudioAnalysis {
  separation: AudioSeparationResult | null;
  lyrics: LyricsTranscriptionResult | null;
  musicIntelligence: MusicIntelligenceResult;
  duration: number;
  hasVocals: boolean;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
            return;
          }
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}

export async function separateAudio(audioPath: string): Promise<AudioSeparationResult> {
  console.log('🎵 Starting audio separation (vocals/instrumental)...');

  try {
    const audioBuffer = fs.readFileSync(audioPath);
    const audioBase64 = audioBuffer.toString('base64');
    const mimeType = audioPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
    const dataUri = `data:${mimeType};base64,${audioBase64}`;

    console.log('   📤 Uploading audio to MVSep model...');

    const output = (await replicate.run('lucataco/mvsep-mdx23-music-separation:latest', {
      input: {
        audio: dataUri,
        only_vocals: true,
      },
    })) as { vocals: string; instrumental: string } | string[];

    let vocalsUrl: string;
    let instrumentalUrl: string;

    if (Array.isArray(output)) {
      vocalsUrl = output[0];
      instrumentalUrl = output[1] || output[0];
    } else if (typeof output === 'object' && output !== null) {
      vocalsUrl = output.vocals || '';
      instrumentalUrl = output.instrumental || '';
    } else {
      throw new Error('Unexpected output format from MVSep');
    }

    console.log('   ✅ Audio separated successfully');
    console.log(`   🎤 Vocals: ${vocalsUrl.substring(0, 60)}...`);
    console.log(`   🎸 Instrumental: ${instrumentalUrl.substring(0, 60)}...`);

    const tempDir = PATH_CONFIG.TEMP_DIR;
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const vocalsPath = path.join(tempDir, `vocals_${Date.now()}.wav`);
    const instrumentalPath = path.join(tempDir, `instrumental_${Date.now()}.wav`);

    console.log('   📥 Downloading separated tracks...');
    await Promise.all([downloadFile(vocalsUrl, vocalsPath), downloadFile(instrumentalUrl, instrumentalPath)]);

    console.log('   ✅ Tracks downloaded');

    return {
      vocalsUrl,
      instrumentalUrl,
      vocalsPath,
      instrumentalPath,
    };
  } catch (error) {
    console.error('   ❌ Audio separation failed:', error);
    throw error;
  }
}

export async function transcribeLyrics(audioPath: string): Promise<LyricsTranscriptionResult> {
  console.log('📝 Starting lyrics transcription with Whisper...');

  try {
    const audioBuffer = fs.readFileSync(audioPath);
    const audioBase64 = audioBuffer.toString('base64');
    const mimeType = audioPath.endsWith('.mp3')
      ? 'audio/mpeg'
      : audioPath.endsWith('.wav')
        ? 'audio/wav'
        : 'audio/mpeg';
    const dataUri = `data:${mimeType};base64,${audioBase64}`;

    console.log('   📤 Sending audio to Whisper model...');

    const output = (await replicate.run(
      'openai/whisper:30414ee7c4fffc37e260fcab7842b5be470b9b840f2b608f5baa9bbef9a259ed',
      {
        input: {
          audio: dataUri,
          model: 'large-v3',
          language: 'en',
          temperature: 0,
          transcription: 'plain text',
          condition_on_previous_text: true,
        },
      },
    )) as { text: string; segments: Array<{ start: number; end: number; text: string }>; language: string };

    console.log('   ✅ Transcription complete');
    console.log(`   📄 Found ${output.text.length} characters of lyrics`);

    return {
      text: output.text || '',
      segments: output.segments || [],
      language: output.language || 'en',
    };
  } catch (error) {
    console.error('   ❌ Transcription failed:', error);
    return {
      text: '',
      segments: [],
      language: 'unknown',
    };
  }
}

export async function analyzeMusicIntelligence(
  audioPath: string,
  duration: number,
  lyrics?: string,
  userDescription?: string,
): Promise<MusicIntelligenceResult> {
  console.log('🧠 Analyzing music intelligence...');

  try {
    let bpmInfo = '';
    try {
      const cmd = `ffprobe -v error -show_entries format_tags=genre,BPM -of default=noprint_wrappers=1 "${audioPath}"`;
      const { stdout } = await execAsync(cmd);
      const bpmMatch = stdout.match(/TAG:BPM=(\d+)/i);
      const genreMatch = stdout.match(/TAG:genre=(.*)/i);
      if (bpmMatch) bpmInfo += `Detected BPM: ${bpmMatch[1]}\n`;
      if (genreMatch) bpmInfo += `Detected Genre: ${genreMatch[1]}\n`;
    } catch (e) {}

    const prompt = `You are a professional music analyst and film score supervisor. Analyze this music for video generation.

MUSIC INFORMATION:
Duration: ${duration} seconds
${bpmInfo}
${userDescription ? `User Description: "${userDescription}"` : ''}
${lyrics ? `Lyrics:\n${lyrics.substring(0, 2000)}` : 'This appears to be an instrumental track.'}

Provide a comprehensive analysis for generating synchronized visuals. Return a JSON object with:

{
  "tempo": <BPM as number, estimate if not detected>,
  "energy": <0.0-1.0 average energy level>,
  "mood": "<dominant mood: energetic/calm/dark/uplifting/melancholic/epic/mysterious/romantic/aggressive>",
  "genre": "<music genre>",
  "key": "<musical key if detectable, e.g., 'C major', 'A minor'>",
  "sections": [
    {
      "type": "<intro|verse|chorus|bridge|instrumental|outro>",
      "start": <start time in seconds>,
      "end": <end time in seconds>,
      "energy": <0.0-1.0 energy for this section>,
      "description": "<brief visual description for this section>"
    }
  ],
  "visualTheme": "<overall visual theme recommendation>",
  "colorPalette": ["<color1>", "<color2>", "<color3>"],
  "cinematicStyle": "<recommended cinematic approach: documentary/narrative/abstract/action/romantic/horror>"
}

Guidelines for sections:
- Intro: Usually 0-15s, establishes atmosphere
- Verse: Storytelling sections, moderate energy
- Chorus: High energy, emotionally impactful
- Bridge: Transition or contrast section
- Instrumental: No vocals, focus on music
- Outro: Closing section, often fades

For a ${duration}s track, create ${Math.max(4, Math.ceil(duration / 20))} sections minimum.`;

    console.log('   📊 Sending to AI for deep analysis...');

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
    });

    const result = await model.generateContent(prompt);
    const analysis = JSON.parse(result.response.text()) as MusicIntelligenceResult;

    console.log('   ✅ Music intelligence analysis complete');
    console.log(`   🎵 Tempo: ${analysis.tempo} BPM`);
    console.log(`   ⚡ Energy: ${analysis.energy}`);
    console.log(`   😊 Mood: ${analysis.mood}`);
    console.log(`   🎬 Style: ${analysis.cinematicStyle}`);
    console.log(`   📊 Sections: ${analysis.sections?.length || 0}`);

    return analysis;
  } catch (error) {
    console.error('   ❌ Music intelligence failed:', error);
    return generateDefaultAnalysis(duration);
  }
}

function generateDefaultAnalysis(duration: number): MusicIntelligenceResult {
  const sectionDuration = 20;
  const numSections = Math.ceil(duration / sectionDuration);
  const sections = [];

  for (let i = 0; i < numSections; i++) {
    const start = i * sectionDuration;
    const end = Math.min((i + 1) * sectionDuration, duration);
    let type: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'instrumental' = 'verse';

    if (i === 0) type = 'intro';
    else if (i === numSections - 1) type = 'outro';
    else if (i % 3 === 1) type = 'chorus';
    else if (i % 5 === 0) type = 'bridge';

    sections.push({
      type,
      start,
      end,
      energy: type === 'chorus' ? 0.8 : type === 'intro' || type === 'outro' ? 0.4 : 0.6,
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} section`,
    });
  }

  return {
    tempo: 120,
    energy: 0.6,
    mood: 'neutral',
    genre: 'unknown',
    sections,
    visualTheme: 'cinematic',
    colorPalette: ['#1a1a2e', '#16213e', '#0f3460'],
    cinematicStyle: 'narrative',
  };
}

export async function analyzeFullAudio(
  audioPath: string,
  options: {
    separateAudio?: boolean;
    transcribeLyrics?: boolean;
    userDescription?: string;
  } = {},
): Promise<FullAudioAnalysis> {
  console.log('🎬 Starting full audio intelligence analysis...');
  console.log(`   📁 File: ${audioPath}`);

  const { stdout: durationOutput } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
  );
  const duration = parseFloat(durationOutput.trim());
  console.log(`   ⏱️  Duration: ${duration.toFixed(2)}s`);

  let separation: AudioSeparationResult | null = null;
  let lyrics: LyricsTranscriptionResult | null = null;
  let hasVocals = false;

  if (options.separateAudio) {
    try {
      separation = await separateAudio(audioPath);

      if (options.transcribeLyrics && separation.vocalsPath) {
        lyrics = await transcribeLyrics(separation.vocalsPath);
        hasVocals = lyrics.text.length > 20;
      }
    } catch (error) {
      console.error('   ⚠️  Audio separation failed, continuing with full track analysis');
    }
  } else if (options.transcribeLyrics) {
    lyrics = await transcribeLyrics(audioPath);
    hasVocals = lyrics.text.length > 20;
  }

  const musicIntelligence = await analyzeMusicIntelligence(audioPath, duration, lyrics?.text, options.userDescription);

  console.log('✅ Full audio analysis complete!');
  console.log(`   🎤 Has vocals: ${hasVocals}`);
  console.log(`   📝 Lyrics: ${lyrics?.text?.length || 0} characters`);

  return {
    separation,
    lyrics,
    musicIntelligence,
    duration,
    hasVocals,
  };
}

export async function generateScenesFromMusic(
  analysis: FullAudioAnalysis,
  characterContext?: string,
  storyContext?: string,
): Promise<
  Array<{
    sceneNumber: number;
    start: number;
    end: number;
    prompt: string;
    cameraWork: string;
    mood: string;
    character?: string;
  }>
> {
  console.log('🎬 Generating scenes from music analysis...');

  const prompt = `You are a music video director. Create visual scene prompts based on this music analysis.

MUSIC ANALYSIS:
Tempo: ${analysis.musicIntelligence.tempo} BPM
Mood: ${analysis.musicIntelligence.mood}
Energy: ${analysis.musicIntelligence.energy}
Style: ${analysis.musicIntelligence.cinematicStyle}
Visual Theme: ${analysis.musicIntelligence.visualTheme}
Color Palette: ${analysis.musicIntelligence.colorPalette.join(', ')}

SONG SECTIONS:
${analysis.musicIntelligence.sections
  .map(
    (s, i) =>
      `${i + 1}. ${s.type.toUpperCase()} (${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s) - Energy: ${s.energy} - ${s.description}`,
  )
  .join('\n')}

${
  analysis.hasVocals && analysis.lyrics
    ? `
LYRICS:
${analysis.lyrics.text.substring(0, 3000)}
`
    : 'INSTRUMENTAL TRACK - Focus on mood and atmosphere'
}

${characterContext ? `CHARACTER CONTEXT:\n${characterContext}` : ''}
${storyContext ? `STORY CONTEXT:\n${storyContext}` : ''}

Generate a scene for each music section. Return JSON:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "start": 0,
      "end": 15,
      "prompt": "<detailed 150+ char visual prompt for video generation>",
      "cameraWork": "<camera movement and shot type>",
      "mood": "<scene mood>",
      "character": "<character name if applicable>"
    }
  ]
}

Match scene energy to music energy. High energy sections = dynamic camera movement, action.
Low energy = slow movement, atmospheric shots. Chorus = impactful visuals.`;

  const model = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
  });

  const genResult = await model.generateContent(prompt);
  const result = JSON.parse(genResult.response.text() || '{"scenes":[]}');

  console.log(`   ✅ Generated ${result.scenes?.length || 0} scenes`);

  return result.scenes || [];
}

export const audioIntelligence = {
  separateAudio,
  transcribeLyrics,
  analyzeMusicIntelligence,
  analyzeFullAudio,
  generateScenesFromMusic,
};
