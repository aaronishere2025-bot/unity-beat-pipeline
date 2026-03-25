#!/usr/bin/env python3
"""
Beat Analyzer CLI

Standalone command-line interface for analyzing audio tracks.

Usage:
    python -m beat_analyzer.cli /path/to/track.mp3
    python -m beat_analyzer.cli /path/to/track.mp3 --pretty
    python -m beat_analyzer.cli /path/to/track.mp3 -o analysis.json
    python -m beat_analyzer.cli /path/to/track.mp3 --segments-only
"""

import sys
import json
import argparse
from pathlib import Path

try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False

from .analyzer import analyze_track


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Analyze audio tracks for beat, energy, and segment information",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic analysis (output to stdout)
  python -m beat_analyzer.cli track.mp3

  # Pretty-printed JSON
  python -m beat_analyzer.cli track.mp3 --pretty

  # Save to file
  python -m beat_analyzer.cli track.mp3 -o analysis.json

  # YAML format
  python -m beat_analyzer.cli track.mp3 --format yaml

  # Only show segments (no beat timestamps)
  python -m beat_analyzer.cli track.mp3 --segments-only
        """
    )

    parser.add_argument(
        'audio_file',
        type=str,
        help='Path to audio file (.mp3, .wav, .flac)'
    )

    parser.add_argument(
        '-o', '--output',
        type=str,
        default=None,
        help='Output file path (default: stdout)'
    )

    parser.add_argument(
        '--format',
        type=str,
        choices=['json', 'yaml'],
        default='json',
        help='Output format (default: json)'
    )

    parser.add_argument(
        '--pretty',
        action='store_true',
        help='Pretty-print output (JSON only)'
    )

    parser.add_argument(
        '--segments-only',
        action='store_true',
        help='Only output segments (exclude beat timestamps and energy curve)'
    )

    parser.add_argument(
        '--quiet',
        action='store_true',
        help='Suppress progress messages'
    )

    args = parser.parse_args()

    # Check if file exists
    audio_path = Path(args.audio_file)
    if not audio_path.exists():
        print(f"❌ Error: File not found: {args.audio_file}", file=sys.stderr)
        sys.exit(1)

    # Check YAML availability
    if args.format == 'yaml' and not YAML_AVAILABLE:
        print("❌ Error: PyYAML not installed. Install with: pip install pyyaml", file=sys.stderr)
        sys.exit(1)

    # Run analysis
    try:
        result = analyze_track(str(audio_path), verbose=not args.quiet)
    except Exception as e:
        print(f"❌ Analysis failed: {e}", file=sys.stderr)
        sys.exit(1)

    # Convert to dict
    output_data = result.model_dump()

    # Apply segments-only filter
    if args.segments_only:
        output_data = {
            'filename': output_data['filename'],
            'duration': output_data['duration'],
            'bpm': output_data['bpm'],
            'key': output_data['key'],
            'segments': output_data['segments'],
            'transition_candidates': output_data['transition_candidates']
        }

    # Format output
    if args.format == 'json':
        if args.pretty:
            output_str = json.dumps(output_data, indent=2)
        else:
            output_str = json.dumps(output_data)
    else:  # yaml
        output_str = yaml.dump(output_data, default_flow_style=False)

    # Write output
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            f.write(output_str)

        if not args.quiet:
            print(f"\n💾 Saved to: {args.output}", file=sys.stderr)
    else:
        print(output_str)


if __name__ == '__main__':
    main()
