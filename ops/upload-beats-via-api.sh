#!/bin/bash
# Upload 5 trap beats via HTTP API with YouTube scheduler

VIDEOS=(
  "/home/aaronishere2025/data/videos/renders/music_7f3330bd-c287-4e3d-b42f-3a7efdd54475_1769306531569.mp4|2026-01-25T12:00:00Z|7:00 AM"
  "/home/aaronishere2025/data/videos/renders/music_2fcb1ee7-f51c-49e5-a9aa-59caac285fe0_1769306822281.mp4|2026-01-25T15:00:00Z|10:00 AM"
  "/home/aaronishere2025/data/videos/renders/music_b109f4cc-efe2-4218-a7d3-bc6f8dd8dd06_1769307053617.mp4|2026-01-25T18:00:00Z|1:00 PM"
  "/home/aaronishere2025/data/videos/renders/music_379ca5b8-b213-4dd4-b6df-7e24996e0182_1769307277762.mp4|2026-01-25T21:00:00Z|4:00 PM"
  "/home/aaronishere2025/data/videos/renders/music_42ebd2ea-931b-4308-9761-36118f2d48df_1769307507675.mp4|2026-01-26T00:00:00Z|7:00 PM"
)

CHANNEL="yt_1768620554675_usovd1wx3"  # Trap Beats INC

echo "🎵 UPLOADING 5 TRAP BEATS VIA HTTP API"
echo ""

for i in "${!VIDEOS[@]}"; do
  IFS='|' read -r VIDEO_PATH PUBLISH_AT TIME_LABEL <<< "${VIDEOS[$i]}"

  echo "──────────────────────────────────────────────────────────────────────"
  echo "🎬 Uploading $((i+1))/5: Trap Beat #$((i+1))"
  echo "   Schedule: $TIME_LABEL"
  echo "──────────────────────────────────────────────────────────────────────"

  # Get job ID from video path
  JOB_ID=$(basename "$VIDEO_PATH" | sed 's/music_\(.*\)_[0-9]*.mp4/\1/')

  echo "   Job ID: $JOB_ID"
  echo "   Video: $VIDEO_PATH"
  echo "   Publish at: $PUBLISH_AT"

  # Upload via API
  RESPONSE=$(curl -s -X POST \
    "http://localhost:8080/api/youtube/upload-job" \
    -H "Content-Type: application/json" \
    -d "{
      \"jobId\": \"$JOB_ID\",
      \"channelId\": \"$CHANNEL\",
      \"scheduledUploadTime\": \"$PUBLISH_AT\"
    }")

  echo "   Response: $RESPONSE"
  echo ""

  # Wait between uploads
  if [ $i -lt $((${#VIDEOS[@]} - 1)) ]; then
    echo "   ⏳ Waiting 10 seconds before next upload..."
    sleep 10
  fi
done

echo "======================================================================"
echo "✅ ALL 5 TRAP BEATS UPLOADED"
echo "======================================================================"
