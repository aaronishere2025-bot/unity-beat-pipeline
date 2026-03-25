#!/bin/bash
JOB_ID=$1
MAX_ATTEMPTS=80  # ~6.5 minutes

for i in $(seq 1 $MAX_ATTEMPTS); do
  sleep 5
  
  RESPONSE=$(curl -s http://localhost:8080/api/jobs/$JOB_ID)
  STATUS=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null)
  PROGRESS=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['progress'])" 2>/dev/null)
  
  echo "[$i] $STATUS | $PROGRESS%"
  
  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo "✅ JOB COMPLETED!"
    echo ""
    echo $RESPONSE | python3 -m json.tool | grep -E '"videoPath"|"thumbnailPath"|"videoUrl"|"thumbnailUrl"|"duration"|"cost"' | head -10
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "❌ JOB FAILED!"
    echo $RESPONSE | python3 -m json.tool | grep '"error"' | head -5
    exit 1
  fi
done

echo "⏱️  Timeout"
exit 1
