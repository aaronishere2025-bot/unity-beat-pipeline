#!/bin/bash
JOB_ID="461ce127-41f8-4fea-8382-c903d29cedf9"
START=$(date +%s)

echo "🎵 MONITORING 45-MINUTE LOFI GENERATION"
echo "   Job ID: $JOB_ID"
echo "   Started: $(date '+%I:%M:%S %p')"
echo ""

LAST_PROGRESS=0
CHECK_COUNT=0

while true; do
  sleep 10
  CHECK_COUNT=$((CHECK_COUNT + 1))
  ELAPSED=$(($(date +%s) - START))
  MIN=$((ELAPSED / 60))
  SEC=$((ELAPSED % 60))
  
  RESPONSE=$(curl -s http://localhost:8080/api/jobs/$JOB_ID)
  STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "error")
  PROGRESS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['progress'])" 2>/dev/null || echo "0")
  
  # Only print if progress changed or every 30 seconds
  if [ "$PROGRESS" != "$LAST_PROGRESS" ] || [ $((CHECK_COUNT % 3)) -eq 0 ]; then
    printf "[%02d:%02d] Status: %-12s | Progress: %3s%%" "$MIN" "$SEC" "$STATUS" "$PROGRESS"
    
    # Estimate songs completed (rough)
    SONGS_DONE=$(( (PROGRESS - 5) / 7 ))
    if [ $SONGS_DONE -gt 0 ] && [ $SONGS_DONE -le 15 ]; then
      printf " | Songs: ~%d/15" "$SONGS_DONE"
    fi
    
    echo ""
    LAST_PROGRESS=$PROGRESS
  fi
  
  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo "✅ SUCCESS! 45-minute lofi completed!"
    echo "   Total time: ${MIN}m ${SEC}s"
    echo ""
    echo "📊 FINAL RESULTS:"
    echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print('   Video Path:', d.get('videoPath') or '❌ NOT SET')
print('   Thumbnail:', d.get('thumbnailPath') or '❌ NOT SET')
print('   Duration:', str(d.get('duration') or 0) + 's')
print('   Cost: \$' + str(d.get('cost') or 0))
"
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "❌ FAILED after ${MIN}m ${SEC}s"
    ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('error') or json.load(sys.stdin)['data'].get('errorMessage') or 'Unknown')" 2>/dev/null)
    echo "   Error: $ERROR"
    exit 1
  fi
  
  # Safety timeout after 70 minutes
  if [ $ELAPSED -gt 4200 ]; then
    echo ""
    echo "⏱️  Safety timeout reached (70 minutes)"
    exit 1
  fi
done
