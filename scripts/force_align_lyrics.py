#!/usr/bin/env python3
"""
Force Align Lyrics to Audio
Uses Wav2Vec2-based forced alignment to get precise word-level timings
from actual audio instead of beat-based estimation.
"""

import sys
import json
import os

def align_lyrics_to_audio(audio_path: str, lyrics: str) -> dict:
    """
    Align lyrics to audio and return word-level timings.
    
    Args:
        audio_path: Path to audio file (MP3 or WAV)
        lyrics: Full lyrics text
        
    Returns:
        Dict with word timings: {words: [{word, start, end}, ...], metadata: {...}}
    """
    try:
        from forcealign import ForceAlign
        
        print(f"🎤 ForceAlign: Aligning lyrics to audio...")
        print(f"   Audio: {audio_path}")
        print(f"   Lyrics: {len(lyrics)} chars, ~{len(lyrics.split())} words")
        
        # Create aligner with lyrics
        aligner = ForceAlign(audio_file=audio_path, transcript=lyrics)
        
        # Run alignment
        words = aligner.inference()
        
        # Extract word timings
        word_timings = []
        for word in words:
            word_timings.append({
                'word': word.word,
                'start': round(word.time_start, 3),
                'end': round(word.time_end, 3)
            })
        
        # Calculate stats
        if word_timings:
            first_word = word_timings[0]
            last_word = word_timings[-1]
            total_duration = last_word['end'] - first_word['start']
            
            print(f"✅ Aligned {len(word_timings)} words")
            print(f"   First word '{first_word['word']}' at {first_word['start']:.2f}s")
            print(f"   Last word '{last_word['word']}' at {last_word['end']:.2f}s")
            print(f"   Total vocal duration: {total_duration:.2f}s")
        
        return {
            'success': True,
            'words': word_timings,
            'metadata': {
                'total_words': len(word_timings),
                'first_word_time': word_timings[0]['start'] if word_timings else 0,
                'last_word_time': word_timings[-1]['end'] if word_timings else 0,
                'audio_path': audio_path
            }
        }
        
    except Exception as e:
        print(f"❌ ForceAlign error: {e}")
        return {
            'success': False,
            'error': str(e),
            'words': [],
            'metadata': {}
        }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python force_align_lyrics.py <audio_path> <lyrics_file_or_text>")
        print("  audio_path: Path to MP3/WAV file")
        print("  lyrics: Either a file path or quoted lyrics text")
        sys.exit(1)
    
    audio_path = sys.argv[1]
    lyrics_arg = sys.argv[2]
    
    # Check if lyrics_arg is a file or text
    if os.path.exists(lyrics_arg):
        with open(lyrics_arg, 'r') as f:
            lyrics = f.read()
    else:
        lyrics = lyrics_arg
    
    result = align_lyrics_to_audio(audio_path, lyrics)
    
    # Output as JSON
    print("\n📊 Word Timings JSON:")
    print(json.dumps(result, indent=2))
