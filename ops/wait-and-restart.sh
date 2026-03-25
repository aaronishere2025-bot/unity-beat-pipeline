#!/bin/bash

echo "⏳ Monitoring job cd821046 until completion..."

while true; do
  STATUS=$(curl -s http://localhost:8080/api/jobs | jq -r '.data[] | select(.id | startswith("cd821046")) | .status')
  PROGRESS=$(curl -s http://localhost:8080/api/jobs | jq -r '.data[] | select(.id | startswith("cd821046")) | .progress')

  if [ "$STATUS" == "completed" ] || [ "$STATUS" == "failed" ]; then
    echo ""
    echo "✅ Job finished with status: $STATUS"
    echo ""
    echo "🔄 Restarting server with parallel generation..."

    # Kill existing server
    pkill -f "npm run dev" || true
    sleep 2

    # Start new server
    cd /home/aaronishere2025
    bash -c 'set -a; source .env 2>/dev/null || true; set +a; nohup npm run dev > /tmp/server-parallel.log 2>&1 &'

    echo "⏳ Waiting for server to start..."
    for i in {1..10}; do
      sleep 3
      if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
        echo "✅ Server ready with parallel generation!"
        echo ""
        echo "🎵 Creating new 30-min lofi test job..."
        npx tsx generate-30min-lofi-single-clip.ts
        exit 0
      fi
      echo "   Attempt $i/10..."
    done

    echo "❌ Server failed to start"
    exit 1
  fi

  echo "   Status: $STATUS | Progress: ${PROGRESS}%"
  sleep 10
done
