#!/usr/bin/env python3
"""
Backfill Audio DNA - Scan existing audio/video files and extract acoustic fingerprints.
Uses the existing audio_analyzer.py infrastructure for comprehensive analysis.

Usage:
    python3 scripts/backfill_audio_dna.py --folder ./renders/2025_archive
    python3 scripts/backfill_audio_dna.py --folder ./output --extensions mp3,wav,mp4
"""

import os
import sys
import json
import argparse
import subprocess
import tempfile
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

try:
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    print("Installing psycopg2...")
    subprocess.run([sys.executable, "-m", "pip", "install", "psycopg2-binary"], check=True)
    import psycopg2
    from psycopg2.extras import Json

try:
    from moviepy.editor import VideoFileClip
    HAS_MOVIEPY = True
except ImportError:
    HAS_MOVIEPY = False
    print("⚠️  moviepy not installed - video file support disabled")

from audio_analyzer import extract_fingerprint

def extract_audio_from_video(video_path: str) -> str:
    """Extract audio from video file to temporary WAV."""
    if not HAS_MOVIEPY:
        raise ImportError("moviepy required for video processing")
    
    temp_wav = tempfile.mktemp(suffix=".wav")
    video = VideoFileClip(video_path)
    video.audio.write_audiofile(temp_wav, codec='pcm_s16le', logger=None)
    video.close()
    return temp_wav

def get_video_id_from_filename(filename: str) -> str:
    """Extract video ID from filename (removes extension and common suffixes)."""
    name = Path(filename).stem
    # Remove common suffixes like _final, _v2, etc.
    for suffix in ['_final', '_v2', '_v3', '_render', '_output']:
        if name.endswith(suffix):
            name = name[:-len(suffix)]
    return name

def store_fingerprint(conn, video_id: str, fingerprint: dict):
    """Store fingerprint in audio_dna table."""
    cur = conn.cursor()
    
    # Extract DNA scores from nested dict
    dna_scores = fingerprint.get('dna_scores', {})
    
    # Map fingerprint fields to database columns (matching Python output)
    cur.execute("""
        INSERT INTO audio_dna (
            package_id, bpm, duration_seconds,
            energy_rms_mean, energy_variance,
            first_energy_spike_seconds, energy_curve,
            hook_energy_ratio, predicted_hook_survival,
            spectral_centroid_mean, spectral_contrast_mean,
            zero_crossing_rate, onset_density,
            beat_strength,
            percussiveness_score, brightness_score,
            dna_score_energy, dna_score_rhythm, dna_score_clarity, dna_score_hook,
            raw_features
        ) VALUES (
            %s, %s, %s,
            %s, %s,
            %s, %s,
            %s, %s,
            %s, %s,
            %s, %s,
            %s,
            %s, %s,
            %s, %s, %s, %s,
            %s
        )
        ON CONFLICT (package_id) DO UPDATE SET
            bpm = EXCLUDED.bpm,
            energy_rms_mean = EXCLUDED.energy_rms_mean,
            energy_curve = EXCLUDED.energy_curve,
            hook_energy_ratio = EXCLUDED.hook_energy_ratio,
            predicted_hook_survival = EXCLUDED.predicted_hook_survival,
            dna_score_energy = EXCLUDED.dna_score_energy,
            dna_score_rhythm = EXCLUDED.dna_score_rhythm,
            dna_score_clarity = EXCLUDED.dna_score_clarity,
            dna_score_hook = EXCLUDED.dna_score_hook,
            raw_features = EXCLUDED.raw_features
    """, (
        video_id,
        fingerprint.get('bpm'),
        fingerprint.get('duration_seconds'),
        fingerprint.get('energy_mean'),  # Python output field name
        fingerprint.get('energy_variance'),
        fingerprint.get('first_energy_spike_seconds'),
        fingerprint.get('energy_curve'),
        fingerprint.get('hook_energy_ratio'),
        fingerprint.get('predicted_hook_survival'),
        fingerprint.get('spectral_centroid_mean'),
        fingerprint.get('spectral_contrast_mean'),
        fingerprint.get('zcr_mean'),  # Python output field name
        fingerprint.get('onset_density'),
        fingerprint.get('beat_regularity'),  # Python output field name
        fingerprint.get('percussiveness_score'),
        fingerprint.get('brightness_score'),
        dna_scores.get('energy_score'),
        dna_scores.get('rhythm_score'),
        dna_scores.get('clarity_score'),
        dna_scores.get('hook_score'),
        Json(fingerprint)  # Store full fingerprint as raw_features
    ))
    
    conn.commit()
    cur.close()

def main():
    parser = argparse.ArgumentParser(description='Backfill audio DNA from existing files')
    parser.add_argument('--folder', required=True, help='Folder containing audio/video files')
    parser.add_argument('--extensions', default='mp3,wav,mp4,m4a,webm', 
                        help='Comma-separated file extensions to process')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be processed without storing')
    args = parser.parse_args()
    
    # Get database URL
    db_url = os.environ.get('DATABASE_URL')
    if not db_url and not args.dry_run:
        print("❌ DATABASE_URL environment variable not set")
        sys.exit(1)
    
    # Parse extensions
    extensions = [f".{ext.strip().lower()}" for ext in args.extensions.split(',')]
    video_extensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv']
    
    # Find files
    folder = Path(args.folder)
    if not folder.exists():
        print(f"❌ Folder not found: {folder}")
        sys.exit(1)
    
    files = []
    for ext in extensions:
        files.extend(folder.glob(f"*{ext}"))
        files.extend(folder.glob(f"**/*{ext}"))  # Recursive
    
    files = list(set(files))  # Remove duplicates
    print(f"🔍 Found {len(files)} files to process")
    
    if not files:
        print("No files found matching extensions:", extensions)
        sys.exit(0)
    
    # Connect to database
    conn = None
    if not args.dry_run:
        conn = psycopg2.connect(db_url)
        print("✅ Connected to database")
    
    # Process files
    processed = 0
    failed = 0
    
    for filepath in files:
        video_id = get_video_id_from_filename(filepath.name)
        print(f"\n👂 Processing: {filepath.name} → {video_id}")
        
        try:
            audio_path = str(filepath)
            temp_audio = None
            
            # Extract audio from video if needed
            if filepath.suffix.lower() in video_extensions:
                if not HAS_MOVIEPY:
                    print(f"   ⚠️  Skipping video (moviepy not installed)")
                    failed += 1
                    continue
                print(f"   🎬 Extracting audio from video...")
                temp_audio = extract_audio_from_video(str(filepath))
                audio_path = temp_audio
            
            # Extract fingerprint
            print(f"   🧬 Extracting acoustic fingerprint...")
            fingerprint = extract_fingerprint(audio_path)
            
            # Clean up temp file
            if temp_audio and os.path.exists(temp_audio):
                os.remove(temp_audio)
            
            if not fingerprint:
                print(f"   ❌ Fingerprint extraction failed")
                failed += 1
                continue
            
            # Display key metrics
            print(f"   📊 BPM: {fingerprint.get('bpm', 0):.1f}")
            print(f"   📊 Energy Curve: {fingerprint.get('energy_curve', 'unknown')}")
            print(f"   📊 Hook Survival: {fingerprint.get('predicted_hook_survival', 0)*100:.0f}%")
            print(f"   📊 DNA Scores: E{fingerprint.get('dna_score_energy', 0):.0f} R{fingerprint.get('dna_score_rhythm', 0):.0f} C{fingerprint.get('dna_score_clarity', 0):.0f} H{fingerprint.get('dna_score_hook', 0):.0f}")
            
            # Store in database
            if not args.dry_run:
                store_fingerprint(conn, video_id, fingerprint)
                print(f"   ✅ Stored in database")
            else:
                print(f"   📝 Would store (dry run)")
            
            processed += 1
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
            failed += 1
    
    # Close connection
    if conn:
        conn.close()
    
    print(f"\n{'='*50}")
    print(f"🏁 Backfill Complete!")
    print(f"   ✅ Processed: {processed}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📊 Total: {len(files)}")
    
    if processed > 0 and not args.dry_run:
        print(f"\n🎯 The system now has ears for {processed} audio files.")
        print(f"   Run your Strategic Summary to see audio insights!")

if __name__ == "__main__":
    main()
