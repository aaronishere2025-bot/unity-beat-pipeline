#!/usr/bin/env python3
"""
Single Clip Per Section Planner
One Kling generation per musical section, looped to fill duration
"""

import json
import sys
from typing import List, Dict, Any

class SingleClipSectionPlanner:
    """
    One Kling generation per musical section.
    Loop it to fill the section, cut on beats.
    """

    def __init__(self, semantic_analysis: dict, librosa_analysis: dict):
        self.sections = semantic_analysis.get('sections', [])
        self.beats = librosa_analysis.get('beats', [])
        self.downbeats = librosa_analysis.get('downbeats', self.beats[::4] if self.beats else [])
        self.tempo = librosa_analysis.get('bpm', 120)

    def plan_generations(self) -> List[Dict[str, Any]]:
        """
        One clip per section. That's it.
        """
        generation_plan = []

        for i, section in enumerate(self.sections):
            section_duration = section['end_time'] - section['start_time']

            # Generate 5-8 second clip (sweet spot for looping)
            clip_duration = min(8.0, max(5.0, section_duration / 2))

            # Start generation at section start, snapped to downbeat
            gen_start = self._snap_to_downbeat(section['start_time'])

            generation_plan.append({
                'id': f"section_{i}_{section['section_type']}",
                'section_index': i,
                'section_type': section['section_type'],
                'mood': section['mood'],
                'energy': section['energy_level'],
                'gen_start': gen_start,
                'gen_duration': clip_duration,
                'section_start': section['start_time'],
                'section_end': section['end_time'],
                'section_duration': section_duration,
                'loop_strategy': self._plan_loop(clip_duration, section_duration, section['start_time'])
            })

        return generation_plan

    def _snap_to_downbeat(self, timestamp: float) -> float:
        """Snap timestamp to nearest downbeat for musical alignment."""
        if not self.downbeats:
            return timestamp
        return min(self.downbeats, key=lambda b: abs(b - timestamp))

    def _plan_loop(self, clip_duration: float, section_duration: float, section_start: float) -> dict:
        """
        Plan how to loop the clip to fill the section.
        """
        if clip_duration >= section_duration:
            return {
                'type': 'trim',
                'output_duration': section_duration
            }

        # Find loop points on downbeats within clip
        clip_end = section_start + clip_duration
        loop_candidates = [b - section_start for b in self.downbeats
                          if section_start < b < clip_end]

        # Best loop point: last downbeat before clip ends (clean musical phrase)
        if loop_candidates:
            loop_point = loop_candidates[-1]
        else:
            # Fallback: 90% of clip
            loop_point = clip_duration * 0.9

        loops_needed = int(section_duration / loop_point) + 1

        return {
            'type': 'loop',
            'loop_point': loop_point,
            'loops_needed': loops_needed,
            'output_duration': section_duration,
            'crossfade_ms': 100  # Smooth loop transition
        }

    def get_cost_summary(self) -> dict:
        plan = self.plan_generations()
        return {
            'total_clips': len(plan),
            'kling_cost_estimate': f"${len(plan) * 0.10:.2f}",
            'average_section_duration': sum(p['section_duration'] for p in plan) / len(plan) if plan else 0,
            'sections': [f"{p['section_type']} ({p['section_duration']:.1f}s)" for p in plan]
        }


class LoopingVideoAssembler:
    """
    FFmpeg commands to loop clips and assemble final video.
    """

    def generate_loop_command(self, clip_path: str, loop_plan: dict, output_path: str) -> str:
        """
        FFmpeg command to create looped clip.
        """
        if loop_plan['type'] == 'trim':
            return f'ffmpeg -y -i "{clip_path}" -t {loop_plan["output_duration"]} -c copy "{output_path}"'

        loop_point = loop_plan['loop_point']
        total_duration = loop_plan['output_duration']
        loops = loop_plan['loops_needed']

        # Stream loop approach (more efficient than complex filter)
        return f'ffmpeg -y -stream_loop {loops} -i "{clip_path}" -t {total_duration} -c:v libx264 -preset fast -crf 18 "{output_path}"'

    def generate_concat_file(self, clips: list, output_path: str = "concat_list.txt") -> str:
        """
        Generate FFmpeg concat demuxer file.
        """
        lines = [f"file '{clip['looped_path']}'" for clip in clips]
        with open(output_path, 'w') as f:
            f.write('\n'.join(lines))
        return output_path

    def generate_final_assembly(self, concat_file: str, audio_path: str, output_path: str) -> str:
        """
        Final assembly: concat clips + add audio.
        """
        return f'ffmpeg -y -f concat -safe 0 -i "{concat_file}" -i "{audio_path}" -c:v libx264 -c:a aac -b:a 192k -map 0:v:0 -map 1:a:0 -shortest "{output_path}"'


def main():
    """CLI for testing the planner."""
    if len(sys.argv) < 3:
        print("Usage: python looping_section_planner.py <semantic_json> <librosa_json>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1]) as f:
        semantic = json.load(f)

    with open(sys.argv[2]) as f:
        librosa = json.load(f)

    planner = SingleClipSectionPlanner(semantic, librosa)
    plan = planner.plan_generations()
    summary = planner.get_cost_summary()

    print(json.dumps({
        'plan': plan,
        'summary': summary
    }, indent=2))


if __name__ == "__main__":
    main()
