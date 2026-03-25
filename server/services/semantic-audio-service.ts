/**
 * Semantic Audio Analysis Service
 * Integrates Gemini's semantic understanding with librosa's technical analysis
 * to generate context-aware video prompts
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface SemanticSection {
  start_time: number;
  end_time: number;
  section_type: 'intro' | 'verse' | 'chorus' | 'bridge' | 'drop' | 'outro' | string;
  energy_level: number;
  mood: string;
  visual_suggestion: string;
  key_moment: boolean;
  moment_description?: string;
}

interface SemanticAnalysis {
  overall_mood: string;
  narrative_arc: string;
  sections: SemanticSection[];
  lyrical_themes: string[];
  genre_elements: string[];
  climax_timestamp: number;
  recommended_visual_style: string;
}

interface MergedSegment {
  start: number;
  end: number;
  beats: number[];
  avg_energy: number;
  beat_count: number;
  mood: string;
  visual_suggestion: string;
  is_climax: boolean;
  section_type: string;
  prompt_weight: number;
}

interface PromptContext {
  current_segment: MergedSegment;
  overall_narrative: string;
  themes: string[];
  visual_style: string;
  is_near_climax: boolean;
}

class SemanticAudioService {
  /**
   * Analyze audio semantically using Gemini 1.5 Pro
   */
  async analyzeTrack(audioPath: string, duration: number): Promise<SemanticAnalysis | null> {
    try {
      console.log(`🎵 Running semantic analysis with Gemini...`);

      const pythonScript = path.join(process.cwd(), 'scripts', 'semantic_audio_analyzer.py');

      const { stdout, stderr } = await execAsync(`python3 "${pythonScript}" "${audioPath}" ${duration}`, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: {
          ...process.env,
          PYTHONPATH: path.join(process.cwd(), 'scripts'),
        },
      });

      if (stderr) {
        console.log(`   [Gemini stderr]: ${stderr}`);
      }

      const result = JSON.parse(stdout);
      console.log(`   ✅ Semantic analysis: ${result.sections?.length || 0} sections identified`);
      console.log(`   🎭 Overall mood: ${result.overall_mood}`);
      console.log(`   📖 Narrative: ${result.narrative_arc}`);

      return result;
    } catch (error: any) {
      console.error(`   ❌ Semantic analysis failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Merge semantic understanding with technical librosa data
   */
  mergeAnalysis(librosaData: any, semanticData: SemanticAnalysis): MergedSegment[] {
    const timeline: MergedSegment[] = [];

    for (const section of semanticData.sections) {
      // Find beats in this section
      const sectionBeats = (librosaData.beats || []).filter(
        (b: number) => b >= section.start_time && b < section.end_time,
      );

      // Get energy slice for this section
      const energyCurve = librosaData.energy_curve || [];
      const startIdx = Math.floor(section.start_time / 0.5);
      const endIdx = Math.floor(section.end_time / 0.5);
      const sectionEnergy = energyCurve.slice(startIdx, endIdx);
      const avgEnergy =
        sectionEnergy.length > 0
          ? sectionEnergy.reduce((a: number, b: number) => a + b, 0) / sectionEnergy.length
          : 0.5;

      // Calculate prompt weight (importance for visual emphasis)
      let promptWeight = section.energy_level / 10.0;
      if (section.key_moment) promptWeight += 0.3;
      if (['chorus', 'drop', 'climax'].includes(section.section_type)) promptWeight += 0.2;
      promptWeight = Math.min(promptWeight, 1.0);

      timeline.push({
        start: section.start_time,
        end: section.end_time,
        beats: sectionBeats,
        avg_energy: avgEnergy,
        beat_count: sectionBeats.length,
        mood: section.mood,
        visual_suggestion: section.visual_suggestion,
        is_climax: section.key_moment,
        section_type: section.section_type,
        prompt_weight: promptWeight,
      });
    }

    return timeline;
  }

  /**
   * Get prompt context for a specific timestamp
   */
  getPromptContext(
    timestamp: number,
    mergedTimeline: MergedSegment[],
    semanticData: SemanticAnalysis,
  ): PromptContext | null {
    const segment = mergedTimeline.find((s) => timestamp >= s.start && timestamp < s.end);

    if (!segment) return null;

    return {
      current_segment: segment,
      overall_narrative: semanticData.narrative_arc,
      themes: semanticData.lyrical_themes,
      visual_style: semanticData.recommended_visual_style,
      is_near_climax: Math.abs(timestamp - semanticData.climax_timestamp) < 10,
    };
  }

  /**
   * Generate enhanced video prompt using semantic context
   */
  generateEnhancedPrompt(
    basePrompt: string,
    context: PromptContext,
    channelType: 'trap_channel' | 'lofi_channel',
  ): string {
    const { current_segment, overall_narrative, visual_style, is_near_climax } = context;

    // Build context-aware prompt
    let enhancedPrompt = basePrompt;

    // Add mood modifier
    const moodMap: Record<string, string> = {
      energetic: 'dynamic, high-energy',
      calm: 'peaceful, serene',
      dark: 'moody, shadowy',
      uplifting: 'bright, inspiring',
      melancholic: 'nostalgic, wistful',
      aggressive: 'intense, powerful',
    };

    const moodModifier = moodMap[current_segment.mood.toLowerCase()] || current_segment.mood;

    // Add section-specific modifiers
    if (current_segment.section_type === 'intro') {
      enhancedPrompt += ', establishing shot, slow reveal';
    } else if (current_segment.section_type === 'drop' || is_near_climax) {
      enhancedPrompt += ', explosive visuals, dramatic lighting, intense motion';
    } else if (current_segment.section_type === 'outro') {
      enhancedPrompt += ', fading away, resolution, peaceful ending';
    }

    // Add visual suggestion if strong
    if (current_segment.visual_suggestion && current_segment.prompt_weight > 0.7) {
      enhancedPrompt += `, ${current_segment.visual_suggestion}`;
    }

    // Add mood
    enhancedPrompt += `, ${moodModifier} atmosphere`;

    // Add recommended visual style
    if (visual_style) {
      enhancedPrompt += `, ${visual_style}`;
    }

    // Channel-specific style enhancement
    if (channelType === 'trap_channel') {
      if (current_segment.avg_energy > 0.7) {
        enhancedPrompt += ', bold colors, sharp contrasts, urban aesthetic';
      }
    } else if (channelType === 'lofi_channel') {
      enhancedPrompt +=
        ', dark moody lighting, purple-blue color grading, rainy night aesthetic, melancholic atmosphere';
    }

    return enhancedPrompt;
  }

  /**
   * Get optimal clip boundaries based on semantic sections
   */
  getClipBoundaries(semanticData: SemanticAnalysis, targetDuration: number): number[] {
    const boundaries: number[] = [];

    // Start with section boundaries
    for (const section of semanticData.sections) {
      boundaries.push(section.start_time);

      // For long sections, add intermediate boundaries
      const sectionLength = section.end_time - section.start_time;
      if (sectionLength > targetDuration * 2) {
        const numSplits = Math.floor(sectionLength / targetDuration);
        for (let i = 1; i < numSplits; i++) {
          boundaries.push(section.start_time + (i * sectionLength) / numSplits);
        }
      }
    }

    // Add climax as a boundary (ensure clips align with key moment)
    if (!boundaries.includes(semanticData.climax_timestamp)) {
      boundaries.push(semanticData.climax_timestamp);
    }

    return boundaries.sort((a, b) => a - b);
  }
}

export const semanticAudioService = new SemanticAudioService();
export type { SemanticAnalysis, MergedSegment, PromptContext };
