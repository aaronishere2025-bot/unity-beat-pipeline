# Beat Analyzer Module

Standalone beat analysis pipeline for Suno-generated audio tracks. Outputs structured data for video prompt generation in the Unity Video System.

## Features

- **BPM Detection**: Accurate tempo detection using librosa
- **Key Detection**: Musical key identification (e.g., "C minor", "G major")
- **Segment Detection**: Automatic verse/chorus/bridge/intro/outro identification
- **Energy Mapping**: Energy curve sampled at regular intervals for visual synchronization
- **Drop Points**: Identifies dramatic energy spikes (bass drops, transitions)
- **Beat Timestamps**: Every beat timestamp in the track
- **Transition Candidates**: Optimal timestamps for scene changes

## Installation

Required dependencies (already installed in venv):
```bash
pip install librosa numpy pydantic soundfile scipy
```

## Usage

### Command Line Interface

```bash
# Basic analysis (outputs JSON to stdout)
cd scripts
python -m beat_analyzer.cli /path/to/track.mp3

# Pretty-printed JSON
python -m beat_analyzer.cli /path/to/track.mp3 --pretty

# Save to file
python -m beat_analyzer.cli /path/to/track.mp3 -o analysis.json

# Segments only (no beat timestamps)
python -m beat_analyzer.cli /path/to/track.mp3 --segments-only

# Quiet mode (suppress progress messages)
python -m beat_analyzer.cli /path/to/track.mp3 --quiet
```

### Python API

```python
from beat_analyzer import analyze_track

# Analyze a track
result = analyze_track('/path/to/audio.mp3', verbose=True)

# Access results
print(f"BPM: {result.bpm}")
print(f"Key: {result.key}")
print(f"Duration: {result.duration}s")

# Iterate over segments
for segment in result.segments:
    print(f"{segment.type}: {segment.start:.1f}s - {segment.end:.1f}s (energy: {segment.energy:.2f})")

# Get beat timestamps
beats = result.beats  # List of floats

# Get energy curve
energy_curve = result.energy_curve  # List of (time, energy) tuples

# Get drop points
for drop in result.drop_points:
    print(f"Drop at {drop.timestamp:.1f}s (intensity: {drop.intensity:.2f})")

# Get transition candidates
transitions = result.transition_candidates  # List of timestamps

# Export to JSON
output_dict = result.model_dump()
import json
json.dump(output_dict, open('output.json', 'w'), indent=2)
```

## Output Structure

```json
{
  "filename": "historical_rap_lincoln.mp3",
  "duration": 185.3,
  "bpm": 95.0,
  "key": "G minor",
  "segments": [
    {
      "type": "intro",
      "start": 0.0,
      "end": 8.5,
      "energy": 0.25,
      "label": null
    },
    {
      "type": "verse",
      "start": 8.5,
      "end": 38.2,
      "energy": 0.55,
      "label": "verse_1"
    },
    {
      "type": "chorus",
      "start": 38.2,
      "end": 58.1,
      "energy": 0.85,
      "label": "chorus_1"
    }
  ],
  "beats": [0.0, 0.63, 1.26, 1.89, ...],
  "energy_curve": [[0.0, 0.2], [0.5, 0.22], [1.0, 0.25], ...],
  "drop_points": [
    {"timestamp": 38.2, "intensity": 0.8}
  ],
  "transition_candidates": [8.5, 38.2, 58.1, 88.0, ...],
  "metadata": {
    "spectral_centroid_mean": 2840.5,
    "spectral_centroid_std": 450.2,
    "onset_count": 312,
    "energy_trend": "building",
    "sample_rate": 22050
  }
}
```

## Module Structure

```
beat_analyzer/
├── __init__.py           # Package exports
├── schema.py             # Pydantic models for validation
├── analyzer.py           # Main analysis engine
├── energy_mapper.py      # Energy curve and drop point detection
├── segment_detector.py   # Verse/chorus/bridge detection
└── cli.py                # Command-line interface
```

## Segment Types

- **intro**: Opening section, typically low-medium energy
- **verse**: Story/narrative sections, medium energy
- **chorus**: High-energy repeated sections
- **bridge**: Transition section, often contrasting energy
- **outro**: Ending section, typically lower energy
- **drop**: Very high energy moment (bass drop, beat drop)
- **break**: Short low-energy pause

## Integration with Unity Video System

This module outputs data that will be consumed by:
- `server/services/prompt-generator.ts` - Creates scene-aware prompts based on segments
- Video generation pipeline - Uses `transition_candidates` for clip boundaries
- `server/services/unity-content-generator.ts` - Synchronizes visuals with music structure

## Example Test

```bash
# Test with existing audio file
cd scripts
python -m beat_analyzer.cli ../data/temp/processing/stems_cache/*/vocals.wav --pretty
```

## Performance

- Analysis speed: ~2-5 seconds for a 3-minute track
- Memory usage: ~200-500 MB during analysis
- Output size: ~50-200 KB JSON (depends on track length and number of beats)

## Troubleshooting

**Error: "No module named 'beat_analyzer'"**
- Ensure you're running from the `scripts/` directory
- Or set PYTHONPATH: `export PYTHONPATH=/path/to/scripts:$PYTHONPATH`

**Error: "No module named 'pydantic'"**
- Install in virtual environment: `source venv/bin/activate && pip install pydantic`

**Analysis taking too long**
- Check file size - very long tracks (>10 minutes) may take longer
- Ensure sufficient RAM available (at least 2GB free)

## Future Enhancements

- [ ] YAML output support (requires `pip install pyyaml`)
- [ ] Confidence scores for segment detection
- [ ] Multiple key detection for modulating songs
- [ ] Tempo changes detection
- [ ] Time signature detection
- [ ] Mood/emotion classification per segment
