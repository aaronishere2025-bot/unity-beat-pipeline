#!/bin/bash
# Upload lofi video to YouTube with correct metadata

curl -X POST http://localhost:8080/api/youtube/upload-job \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "4f9b6119-b75e-408e-b287-70fb16d5fe03",
    "customMetadata": {
      "title": "Lofi Study Mix - 30 Minutes 🎧 Chill Beats to Study/Work/Relax",
      "description": "🎵 30-Minute Lofi Hip Hop Mix\n\nPerfect for studying, working, coding, or just relaxing. This seamless 30-minute lofi beat provides the ideal background atmosphere for focus and productivity.\n\n🎹 Mix Info:\n• Duration: 30:00\n• Genre: Lofi Hip Hop / Chillhop\n• BPM: 80-85\n• Mood: Chill, Relaxed, Peaceful\n• Style: Jazzy chords, vinyl crackle, mellow bass, ambient pads\n\n📊 Production:\n• Smooth jazz samples\n• Vinyl crackle texture\n• Soft piano melodies\n• Mellow bass lines\n• Ambient atmospheric pads\n• Rain sounds & tape hiss\n\nPerfect for:\n✅ Study sessions (30 minutes uninterrupted)\n✅ Focus work & deep concentration\n✅ Reading & writing\n✅ Coding & programming\n✅ Creative projects\n✅ Relaxation & meditation\n✅ Background music for content creation\n\n🎵 Music: AI Generated (Suno V5)\n🎬 Video: Kling AI\n🤖 100% AI Created\n\n🔔 Subscribe for more chill beats\n💬 Let me know what you'\''re studying/working on!\n\n#lofi #lofihiphop #chillbeats #studymusic #focusmusic #lofibeats #studybeats #workmusic #relaxingmusic #chillhop #lofistudy #studymix #30minutes #extended #chillvibes #lofimusic #studyplaylist #concentrationmusic #ambientmusic #calmmusic",
      "tags": ["lofi", "lofi hip hop", "chill beats", "study music", "focus music", "lofi beats", "study beats", "work music", "relaxing music", "chillhop", "lofi study", "study mix", "30 minutes", "extended mix", "chill vibes", "lofi music", "study playlist", "concentration music", "ambient music", "calm music", "80-85 bpm", "jazz samples", "vinyl crackle", "AI generated", "suno music", "lofi beats to study to", "study session", "focus beats", "productivity music", "background music"],
      "privacyStatus": "private"
    }
  }' | python3 -m json.tool
