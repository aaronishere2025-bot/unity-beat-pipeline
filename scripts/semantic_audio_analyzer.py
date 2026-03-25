#!/usr/bin/env python3
"""
Semantic Audio Analysis using Gemini 1.5 Pro
Analyzes entire music tracks to understand narrative arc, mood, and visual opportunities
"""

import google.generativeai as genai
import json
import sys
from pathlib import Path

class SemanticAudioAnalyzer:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        # Use gemini-1.5-flash for faster processing and audio support
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    def analyze_full_track(self, audio_path: str, duration_seconds: float) -> dict:
        """
        Send entire track to Gemini for semantic understanding.
        Returns structured timeline of musical meaning.
        """

        # Upload audio file to Gemini
        print(f"📤 Uploading audio to Gemini: {audio_path}", file=sys.stderr)
        audio_file = genai.upload_file(audio_path)

        prompt = f"""You are analyzing a music track that is {duration_seconds:.1f} seconds long.

Listen to the ENTIRE track first, then provide a structured analysis.

Return ONLY valid JSON in this exact format:
{{
    "overall_mood": "one phrase describing the dominant emotional tone",
    "narrative_arc": "brief description of the emotional journey",
    "sections": [
        {{
            "start_time": 0.0,
            "end_time": 15.0,
            "section_type": "intro/verse/chorus/bridge/drop/outro",
            "energy_level": 1-10,
            "mood": "emotional descriptor",
            "visual_suggestion": "what visuals would match this section",
            "key_moment": true/false,
            "moment_description": "if key_moment, why this matters"
        }}
    ],
    "lyrical_themes": ["theme1", "theme2"],
    "genre_elements": ["element1", "element2"],
    "climax_timestamp": 0.0,
    "recommended_visual_style": "overall visual approach suggestion"
}}

Be precise with timestamps. Identify 4-8 distinct sections minimum.
Focus on what would help generate compelling visuals that MATCH the music."""

        print("🎵 Analyzing track semantically...", file=sys.stderr)
        response = self.model.generate_content([audio_file, prompt])

        # Parse JSON from response
        try:
            # Handle potential markdown wrapping
            text = response.text
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            result = json.loads(text.strip())
            print(f"✅ Semantic analysis complete: {len(result.get('sections', []))} sections", file=sys.stderr)
            return result
        except json.JSONDecodeError as e:
            print(f"❌ JSON parse error: {e}", file=sys.stderr)
            print(f"Raw response: {response.text[:500]}", file=sys.stderr)
            # Fallback: return minimal structure
            return {
                "overall_mood": "energetic",
                "narrative_arc": "Analysis failed, using defaults",
                "sections": [],
                "lyrical_themes": [],
                "genre_elements": [],
                "climax_timestamp": duration_seconds / 2,
                "recommended_visual_style": "abstract visuals"
            }

    def analyze_section(self, audio_path: str, start_time: float, end_time: float) -> dict:
        """
        Deep dive on a specific section for detailed prompt generation.
        Use this for your 8-second video segments.
        """

        audio_file = genai.upload_file(audio_path)

        prompt = f"""Focus ONLY on the section from {start_time:.1f}s to {end_time:.1f}s.

Describe in detail:
1. What instruments/sounds are prominent?
2. What emotion does this specific section evoke?
3. Is there movement/energy change within this section?
4. What visual motion would sync with the rhythm?
5. What color palette fits the mood?
6. Describe a scene that would perfectly match this audio.

Return JSON:
{{
    "dominant_sounds": ["sound1", "sound2"],
    "emotion": "specific emotion",
    "energy_trajectory": "building/stable/falling/explosive",
    "rhythm_feel": "description of the groove",
    "suggested_motion": "camera/subject movement style",
    "color_palette": ["color1", "color2", "color3"],
    "scene_description": "2-3 sentence visual scene that matches this audio perfectly",
    "transition_hint": "how to transition out of this section"
}}"""

        response = self.model.generate_content([audio_file, prompt])

        try:
            text = response.text
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            return json.loads(text.strip())
        except json.JSONDecodeError:
            return {
                "dominant_sounds": ["unknown"],
                "emotion": "neutral",
                "energy_trajectory": "stable",
                "rhythm_feel": "steady",
                "suggested_motion": "smooth pan",
                "color_palette": ["blue", "purple", "black"],
                "scene_description": "Abstract visuals",
                "transition_hint": "fade"
            }


class UnifiedAudioTimeline:
    def __init__(self, librosa_analysis: dict, semantic_analysis: dict):
        self.technical = librosa_analysis
        self.semantic = semantic_analysis
        self.merged_timeline = self._merge()

    def _merge(self) -> list:
        """
        Combine technical beat data with semantic understanding.
        """
        timeline = []

        for section in self.semantic.get('sections', []):
            # Find all beats that fall within this section
            section_beats = [
                b for b in self.technical.get('beats', [])
                if section['start_time'] <= b <= section['end_time']
            ]

            # Get energy curve for this section from librosa
            section_energy = self._get_energy_slice(
                section['start_time'],
                section['end_time']
            )

            timeline.append({
                'start': section['start_time'],
                'end': section['end_time'],
                # Technical
                'beats': section_beats,
                'avg_energy': sum(section_energy) / len(section_energy) if section_energy else 0.5,
                'beat_count': len(section_beats),
                # Semantic
                'mood': section.get('mood', 'neutral'),
                'visual_suggestion': section.get('visual_suggestion', ''),
                'is_climax': section.get('key_moment', False),
                'section_type': section.get('section_type', 'unknown'),
                # Combined insight
                'prompt_weight': self._calculate_prompt_weight(section, section_beats)
            })

        return timeline

    def _get_energy_slice(self, start: float, end: float) -> list:
        """Extract energy values for a time range."""
        energy_curve = self.technical.get('energy_curve', [])
        if not energy_curve:
            return [0.5]

        # Energy curve is sampled at 0.5s intervals
        start_idx = int(start / 0.5)
        end_idx = int(end / 0.5)

        return energy_curve[start_idx:end_idx] if start_idx < len(energy_curve) else [0.5]

    def _calculate_prompt_weight(self, section: dict, beats: list) -> float:
        """
        Calculate how important this section is for visual emphasis.
        Higher weight = more dramatic/interesting visuals needed.
        """
        weight = section.get('energy_level', 5) / 10.0  # 0.0 to 1.0

        if section.get('key_moment', False):
            weight += 0.3

        if section.get('section_type') in ['chorus', 'drop', 'climax']:
            weight += 0.2

        return min(weight, 1.0)

    def get_segment_prompt_context(self, timestamp: float) -> dict:
        """
        For any given timestamp, get full context for video prompt generation.
        """
        for segment in self.merged_timeline:
            if segment['start'] <= timestamp < segment['end']:
                return {
                    'current_segment': segment,
                    'overall_narrative': self.semantic.get('narrative_arc', ''),
                    'themes': self.semantic.get('lyrical_themes', []),
                    'visual_style': self.semantic.get('recommended_visual_style', ''),
                    'is_near_climax': abs(timestamp - self.semantic.get('climax_timestamp', 0)) < 10
                }
        return None

    def to_json(self) -> str:
        """Export complete timeline as JSON."""
        return json.dumps({
            'technical': self.technical,
            'semantic': self.semantic,
            'merged_timeline': self.merged_timeline
        }, indent=2)


def main():
    if len(sys.argv) < 2:
        print("Usage: python semantic_audio_analyzer.py <audio_file> [duration]", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    duration = float(sys.argv[2]) if len(sys.argv) > 2 else 120.0

    # Get API key from environment
    import os
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("❌ GEMINI_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    analyzer = SemanticAudioAnalyzer(api_key)
    result = analyzer.analyze_full_track(audio_path, duration)

    # Output JSON to stdout (for TypeScript to parse)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
