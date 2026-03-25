"""
Beat Analyzer Module

Standalone beat analysis pipeline for Suno-generated audio tracks.
Outputs structured data for video prompt generation.

Usage:
    from beat_analyzer import analyze_track

    result = analyze_track('/path/to/audio.mp3')
    print(result.bpm, result.segments)
"""

from .schema import (
    Segment,
    DropPoint,
    AnalysisResult,
    SegmentType
)
from .analyzer import analyze_track

__version__ = '1.0.0'
__all__ = [
    'analyze_track',
    'Segment',
    'DropPoint',
    'AnalysisResult',
    'SegmentType'
]
