#!/usr/bin/env python3
"""
Test the enhanced beat analyzer with narrative arc mapping.
Generates sample output to show the new cohesion features.
"""

import json
import sys

# Sample output showing the enhanced structure
SAMPLE_OUTPUT = {
    "filename": "julius_caesar_historical_rap.mp3",
    "duration": 62.5,
    "bpm": 95.0,
    "key": "G minor",
    "segments": [
        {"type": "intro", "start": 0.0, "end": 8.5, "energy": 0.25, "label": None},
        {"type": "verse", "start": 8.5, "end": 30.2, "energy": 0.55, "label": "verse_1"},
        {"type": "chorus", "start": 30.2, "end": 45.8, "energy": 0.85, "label": "chorus_1"},
        {"type": "bridge", "start": 45.8, "end": 54.3, "energy": 0.65, "label": None},
        {"type": "outro", "start": 54.3, "end": 62.5, "energy": 0.30, "label": None}
    ],
    "beats": [0.0, 0.63, 1.26, 1.89, 2.52, 3.15],  # Truncated for display
    "energy_curve": [[0.0, 0.22], [0.5, 0.24], [1.0, 0.26]],  # Truncated
    "drop_points": [
        {"timestamp": 30.2, "intensity": 0.82},
        {"timestamp": 45.8, "intensity": 0.68}
    ],
    "transition_candidates": [8.5, 30.2, 45.8, 54.3],
    "metadata": {
        "spectral_centroid_mean": 2145.7,
        "spectral_centroid_std": 412.3,
        "onset_count": 287,
        "energy_trend": "building",
        "sample_rate": 22050,
        "narrative_arc": {
            "mood_arc": [
                "establishing",    # intro
                "building",        # verse
                "peak",           # chorus
                "sustain",        # bridge
                "resolve"         # outro
            ],
            "energy_peaks": [30.2, 32.5, 38.1],
            "energy_valleys": [5.2, 46.8, 58.3],
            "downbeats": [0.0, 2.52, 5.04, 7.56, 10.08],  # Every 4th beat
            "spectral_mood_curve": [
                [0.0, "dark"],
                [10.5, "moody"],
                [30.2, "balanced"],
                [45.8, "moody"],
                [58.0, "dark"]
            ],
            "tempo_changes": [],  # Empty if BPM is constant
            "visual_pacing": {
                "camera_evolution": "static → slow push → dynamic movement → slow pull → static",
                "intensity_evolution": "calm → building → intense → reflective → closure",
                "major_transitions": [
                    {
                        "timestamp": 8.5,
                        "type": "gentle",
                        "from_section": "intro",
                        "to_section": "verse",
                        "energy_delta": 0.30
                    },
                    {
                        "timestamp": 30.2,
                        "type": "dramatic",
                        "from_section": "verse",
                        "to_section": "chorus",
                        "energy_delta": 0.30
                    },
                    {
                        "timestamp": 45.8,
                        "type": "gentle",
                        "from_section": "chorus",
                        "to_section": "bridge",
                        "energy_delta": 0.20
                    },
                    {
                        "timestamp": 54.3,
                        "type": "dramatic",
                        "from_section": "bridge",
                        "to_section": "outro",
                        "energy_delta": 0.35
                    }
                ],
                "recommended_clip_duration": "5 seconds (standard pacing)"
            },
            "cohesion_hints": {
                "recurring_motifs": [
                    "heroic close-up",
                    "symbolic object or setting",
                    "environment establishing shot",
                    "character signature item or costume detail"
                ],
                "color_palette_arc": [
                    "muted grays",           # establishing
                    "deep blues",            # building
                    "intense reds",          # peak
                    "deep blues",            # sustain
                    "muted grays"            # resolve
                ],
                "subject_consistency": "maintain same character/setting throughout entire video",
                "visual_continuity_priority": "high"
            }
        }
    }
}

def main():
    """Print the sample output in pretty JSON format."""
    print("=" * 80)
    print("ENHANCED BEAT ANALYZER OUTPUT WITH NARRATIVE ARC")
    print("=" * 80)
    print()
    print(json.dumps(SAMPLE_OUTPUT, indent=2))
    print()
    print("=" * 80)
    print("KEY ADDITIONS FOR COHESIVE PROMPT GENERATION:")
    print("=" * 80)
    print()
    print("1. MOOD ARC:", " → ".join(SAMPLE_OUTPUT["metadata"]["narrative_arc"]["mood_arc"]))
    print("   - Tells the story progression throughout the track")
    print()
    print("2. ENERGY PEAKS:", len(SAMPLE_OUTPUT["metadata"]["narrative_arc"]["energy_peaks"]), "action moments")
    print("   - Timestamps:", SAMPLE_OUTPUT["metadata"]["narrative_arc"]["energy_peaks"])
    print()
    print("3. DOWNBEATS:", len(SAMPLE_OUTPUT["metadata"]["narrative_arc"]["downbeats"]), "strong beats for precise cuts")
    print("   - These are your exact cut points for video transitions")
    print()
    print("4. SPECTRAL MOOD:", "dark → moody → balanced → moody → dark")
    print("   - Maps brightness to visual tone (dark = tense, bright = energetic)")
    print()
    print("5. VISUAL PACING:")
    print("   - Camera:", SAMPLE_OUTPUT["metadata"]["narrative_arc"]["visual_pacing"]["camera_evolution"])
    print("   - Intensity:", SAMPLE_OUTPUT["metadata"]["narrative_arc"]["visual_pacing"]["intensity_evolution"])
    print()
    print("6. COHESION HINTS:")
    print("   - Subject:", SAMPLE_OUTPUT["metadata"]["narrative_arc"]["cohesion_hints"]["subject_consistency"])
    print("   - Recurring motifs:", len(SAMPLE_OUTPUT["metadata"]["narrative_arc"]["cohesion_hints"]["recurring_motifs"]))
    print("   - Color palette evolves with mood")
    print()
    print("=" * 80)
    print("NEXT STEP: Feed this to GPT-4o for SINGLE cohesive prompt generation")
    print("=" * 80)

if __name__ == "__main__":
    main()
