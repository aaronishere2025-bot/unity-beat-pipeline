#!/bin/bash
JOB_ID="f3e2f072-139a-400d-83c0-f1ee73e829f8"
START_TIME=$(date +%s)

echo "🔍 Monitoring 45-minute lofi generation..."
echo "   Started at: $(date '+%I:%M:%S %p')"
echo ""

for i in $(seq 1 40); do  # 40 checks × 2min = 80 minutes max
  sleep 120  # Check every 2 minutes
  
  ELAPSED=$(($(date +%s) - START_TIME))
  ELAPSED_MIN=$((ELAPSED / 60))
  
  RESPONSE=$(curl -s http://localhost:8080/api/jobs/$JOB_ID)
  STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d['status'])" 2>/dev/null || echo "error")
  PROGRESS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d['progress'])" 2>/dev/null || echo "0")
  MSG=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d.get('progressMessage') or '')" 2>/dev/null || echo "")
  
  printf "[%2d min] %s | %3s%% | %s\n" "$ELAPSED_MIN" "$STATUS" "$PROGRESS" "$MSG"
  
  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo "✅ SUCCESS! 45-minute lofi completed in $ELAPSED_MIN minutes"
    echo ""
    echo "$RESPONSE" | python3 -m json.tool | grep -E '"videoPath"|"thumbnailPath"|"duration"|"cost"' | head -10
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "❌ FAILED after $ELAPSED_MIN minutes"
    echo ""
    ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('error') or json.load(sys.stdin)['data'].get('errorMessage') or 'Unknown')" 2>/dev/null)
    echo "Error: $ERROR"
    exit 1
  fi
done

echo "⏱️ Timeout after 80 minutes"
exit 1
