import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';

const execAsync = promisify(exec);

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface MusicAnalysis {
  bpm?: number;
  energy?: number[];
  mood?: string;
  structure?: {
    sections: Array<{ type: string; start: number; end: number }>;
  };
  beatTimestamps?: number[];
  genre?: string;
  confidence?: number;
  visualStyle?: string; // Suggested visual style based on music
}

export async function analyzeMusicFile(
  filePath: string,
  duration: number,
  userDescription?: string,
): Promise<MusicAnalysis> {
  try {
    // Step 1: Get basic metadata from ffprobe
    const metadata = await extractMetadata(filePath);

    // Step 2: If user provided description, use AI to analyze
    if (userDescription) {
      const aiAnalysis = await analyzeWithAI(duration, userDescription, metadata);
      return {
        ...metadata,
        ...aiAnalysis,
        confidence: 0.7, // Medium confidence since it's AI-based
      };
    }

    // Step 3: If no BPM detected, estimate it with lightweight AI
    let bpm = metadata.bpm;
    if (!bpm) {
      console.log('   🎵 BPM not found in metadata, estimating with AI...');
      bpm = await estimateBPM(duration, metadata.genre);
    }

    // Step 4: Fallback to basic analysis with estimated BPM
    return {
      ...metadata,
      bpm,
      mood: 'neutral',
      energy: generateDefaultEnergy(duration),
      structure: generateDefaultStructure(duration),
      confidence: 0.3, // Low confidence without user input
    };
  } catch (error) {
    console.error('Music analysis failed:', error);
    return {
      mood: 'neutral',
      bpm: 120, // Default BPM for typical music
      energy: generateDefaultEnergy(duration),
      structure: generateDefaultStructure(duration),
      confidence: 0.1,
    };
  }
}

async function extractMetadata(filePath: string): Promise<Partial<MusicAnalysis>> {
  try {
    // Try to extract basic tempo/genre from file metadata
    const cmd = `ffprobe -v error -show_entries format_tags=genre,BPM -of default=noprint_wrappers=1 "${filePath}"`;
    const { stdout } = await execAsync(cmd);

    // Parse output for BPM and genre
    const bpmMatch = stdout.match(/TAG:BPM=(\d+)/i);
    const genreMatch = stdout.match(/TAG:genre=(.*)/i);

    return {
      bpm: bpmMatch ? parseInt(bpmMatch[1]) : undefined,
      genre: genreMatch ? genreMatch[1].trim() : undefined,
    };
  } catch (error) {
    console.error('Metadata extraction failed:', error);
    return {};
  }
}

async function estimateBPM(duration: number, genre?: string): Promise<number> {
  try {
    const prompt = `Estimate the BPM (beats per minute) for a music track.

Duration: ${duration} seconds
${genre ? `Genre: ${genre}` : ''}

Based on typical music characteristics:
- Short tracks (<60s): Usually 120-140 BPM (energetic)
- Medium tracks (60-180s): Usually 100-130 BPM (moderate)
- Long tracks (>180s): Usually 80-120 BPM (varied, often slower)
${genre ? `- ${genre} typical BPM range` : ''}

Return ONLY a valid JSON object with:
{
  "bpm": <estimated BPM as integer>,
  "confidence": <0.1-0.9 confidence score>
}`;

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 512, responseMimeType: 'application/json' },
    });
    const completion = await model.generateContent(prompt);
    const result = JSON.parse(completion.response.text() || '{}');
    const estimatedBPM = result.bpm || 120;
    console.log(`   ✅ Estimated BPM: ${estimatedBPM} (confidence: ${result.confidence || 0.5})`);
    return estimatedBPM;
  } catch (error) {
    console.error('   ⚠️  BPM estimation failed, using default 120 BPM');
    return 120; // Default BPM for typical music
  }
}

async function analyzeWithAI(
  duration: number,
  userDescription: string,
  metadata: Partial<MusicAnalysis>,
): Promise<Partial<MusicAnalysis>> {
  const prompt = `Analyze this music for a video generation system.

Music Duration: ${duration} seconds
${metadata.bpm ? `Detected BPM: ${metadata.bpm}` : ''}
${metadata.genre ? `Genre: ${metadata.genre}` : ''}

User Description: "${userDescription}"

Provide a JSON analysis with:
1. mood: Overall mood (energetic/calm/dark/uplifting/melancholic/epic)
2. energy: Average energy level 0-1 (0.2=calm, 0.5=moderate, 0.8=high energy)
3. visualStyle: Suggested visual style for the video
4. structure: Estimate song structure based on duration and description
   - For typical song: intro (0-10s), verse (10-30s), chorus (30-50s), etc.
   - Return array of sections with type, start, end
5. bpm: Estimated tempo if not detected

Return only valid JSON.`;

  const model = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json' },
  });
  const completion = await model.generateContent(prompt);
  const analysis = JSON.parse(completion.response.text() || '{}');

  return {
    mood: analysis.mood,
    energy: analysis.energy ? [analysis.energy] : undefined,
    visualStyle: analysis.visualStyle,
    bpm: metadata.bpm || analysis.bpm,
    structure: analysis.structure ? { sections: analysis.structure } : undefined,
    genre: metadata.genre || analysis.genre,
  };
}

function generateDefaultEnergy(duration: number): number[] {
  // Simple default: moderate energy throughout
  return [0.5];
}

function generateDefaultStructure(duration: number) {
  // Generate simple structure based on duration
  const sections = [];
  if (duration >= 30) {
    sections.push({ type: 'intro', start: 0, end: Math.min(10, duration * 0.1) });
  }
  if (duration >= 60) {
    sections.push({ type: 'main', start: 10, end: duration - 10 });
    sections.push({ type: 'outro', start: duration - 10, end: duration });
  } else {
    sections.push({ type: 'main', start: 0, end: duration });
  }
  return { sections };
}

export const musicAnalyzer = {
  analyzeMusicFile,
};
