#!/bin/bash
# Restart server with job visibility fix

echo "🔄 Restarting server with job visibility fix..."
echo ""

# Kill existing server
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "node.*server" 2>/dev/null || true
sleep 3

# Start server
bash -c 'set -a; source .env 2>/dev/null || true; set +a; nohup npm run dev > /tmp/server-jobs-visible.log 2>&1 &'
echo "Server restarting..."
echo ""

# Wait for server
for i in {1..10}; do
  if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ Server ready!"
    break
  fi
  echo "⏳ Waiting for server... ($i/10)"
  sleep 3
done

echo ""
echo "📊 Testing job visibility..."
job_count=$(curl -s http://localhost:8080/api/jobs | jq '.data | length' 2>/dev/null || echo "API error")
echo "Jobs visible: $job_count"
echo ""

if [ "$job_count" != "API error" ] && [ "$job_count" -gt 0 ]; then
  echo "✅ Jobs are now visible in the frontend!"
  echo ""
  echo "View jobs at: http://localhost:8080/jobs"
else
  echo "⚠️  Jobs might not be visible yet. Check logs:"
  echo "   tail -f /tmp/server-jobs-visible.log"
fi
