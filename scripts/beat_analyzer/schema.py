"""
Pydantic models for beat analyzer output validation.

Defines the structured output schema for audio analysis results.
"""

from typing import List, Literal, Optional, Tuple, Dict, Any
from pydantic import BaseModel, Field, field_validator


SegmentType = Literal["intro", "verse", "chorus", "bridge", "outro", "drop", "break"]


class Segment(BaseModel):
    """Represents a musical section (verse, chorus, etc.)"""

    type: SegmentType
    start: float = Field(..., description="Start time in seconds")
    end: float = Field(..., description="End time in seconds")
    energy: float = Field(..., ge=0.0, le=1.0, description="Energy level (0-1)")
    label: Optional[str] = Field(None, description="Optional human-readable label (e.g., 'verse_1')")

    @field_validator('start', 'end')
    @classmethod
    def validate_time(cls, v: float) -> float:
        """Ensure timestamps are non-negative"""
        if v < 0:
            raise ValueError("Timestamps must be non-negative")
        return v

    @field_validator('end')
    @classmethod
    def validate_end_after_start(cls, v: float, info) -> float:
        """Ensure end time is after start time"""
        if 'start' in info.data and v <= info.data['start']:
            raise ValueError("End time must be after start time")
        return v


class DropPoint(BaseModel):
    """Represents a dramatic energy spike (bass drop, etc.)"""

    timestamp: float = Field(..., description="Time of the drop in seconds")
    intensity: float = Field(..., ge=0.0, le=1.0, description="How dramatic the drop is (0-1)")

    @field_validator('timestamp')
    @classmethod
    def validate_timestamp(cls, v: float) -> float:
        """Ensure timestamp is non-negative"""
        if v < 0:
            raise ValueError("Timestamp must be non-negative")
        return v


class AnalysisResult(BaseModel):
    """Complete audio analysis result"""

    filename: str = Field(..., description="Name of the analyzed audio file")
    duration: float = Field(..., gt=0, description="Total duration in seconds")
    bpm: float = Field(..., gt=0, description="Beats per minute (tempo)")
    key: Optional[str] = Field(None, description="Musical key (e.g., 'C minor')")

    segments: List[Segment] = Field(
        default_factory=list,
        description="List of detected musical sections"
    )
    beats: List[float] = Field(
        default_factory=list,
        description="Timestamps of every beat in the track"
    )
    energy_curve: List[Tuple[float, float]] = Field(
        default_factory=list,
        description="Energy curve sampled at regular intervals [(time, energy), ...]"
    )
    drop_points: List[DropPoint] = Field(
        default_factory=list,
        description="Detected energy spikes/drops"
    )
    transition_candidates: List[float] = Field(
        default_factory=list,
        description="Timestamps good for scene transitions (section boundaries)"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional librosa analysis data"
    )

    @field_validator('beats', 'transition_candidates')
    @classmethod
    def validate_sorted_timestamps(cls, v: List[float]) -> List[float]:
        """Ensure timestamp lists are sorted"""
        return sorted(v)

    model_config = {
        "json_schema_extra": {
            "example": {
                "filename": "historical_rap_lincoln.mp3",
                "duration": 185.3,
                "bpm": 95.0,
                "key": "G minor",
                "segments": [
                    {"type": "intro", "start": 0.0, "end": 8.5, "energy": 0.25, "label": None},
                    {"type": "verse", "start": 8.5, "end": 38.2, "energy": 0.55, "label": "verse_1"}
                ],
                "beats": [0.0, 0.63, 1.26],
                "energy_curve": [[0.0, 0.2], [0.5, 0.22]],
                "drop_points": [{"timestamp": 38.2, "intensity": 0.8}],
                "transition_candidates": [8.5, 38.2],
                "metadata": {"spectral_centroid_mean": 2840.5}
            }
        }
    }
