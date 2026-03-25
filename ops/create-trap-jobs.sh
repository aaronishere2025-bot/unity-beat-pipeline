#!/bin/bash

curl -X POST http://localhost:8080/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"mode": "music", "scriptName": "Purple Waves [145 BPM trap]", "scriptContent": "dark trap, heavy 808 bass, rolling hi-hats, 145 BPM, atmospheric synths, menacing vibes, aggressive, purple aesthetic", "aspectRatio": "9:16"}'

echo ""
sleep 2

curl -X POST http://localhost:8080/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"mode": "music", "scriptName": "Neon Nights [150 BPM trap]", "scriptContent": "hard trap, distorted 808s, snare rolls, 150 BPM, neon synth stabs, dark energy, cyberpunk vibes", "aspectRatio": "9:16"}'

echo ""
sleep 2

curl -X POST http://localhost:8080/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"mode": "music", "scriptName": "Dark Energy [148 BPM trap]", "scriptContent": "trap banger, sub bass rumble, tight snares, 148 BPM, eerie melodies, aggressive drops, shadowy atmosphere", "aspectRatio": "9:16"}'

echo ""
sleep 2

curl -X POST http://localhost:8080/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"mode": "music", "scriptName": "Shadow Trap [152 BPM trap]", "scriptContent": "brutal trap, massive 808 slides, rapid hi-hat triplets, 152 BPM, haunting vocal chops, relentless energy", "aspectRatio": "9:16"}'

echo ""
echo "✅ All 4 trap beats queued!"
