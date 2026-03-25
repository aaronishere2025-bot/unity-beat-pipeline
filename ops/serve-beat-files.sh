#!/bin/bash
# Serve beat files via Cloudflare Tunnel
# Makes VPS files accessible from any browser

echo "🌐 Starting file server with Cloudflare Tunnel..."
echo ""

cd /home/aaronishere2025/data/videos/renders

echo "📂 Serving files from: $(pwd)"
echo "📊 Files available:"
ls -lh *.mp4 2>/dev/null | tail -10 || echo "   No MP4 files yet"
echo ""

# Start Python HTTP server in background
python3 -m http.server 8765 > /tmp/file-server.log 2>&1 &
SERVER_PID=$!
echo "✅ File server started (PID: $SERVER_PID)"

# Wait for server to start
sleep 2

# Start Cloudflare tunnel
echo ""
echo "🚀 Starting Cloudflare Tunnel..."
echo "⏳ Getting public URL..."
echo ""

cloudflared tunnel --url http://localhost:8765

# Cleanup on exit
trap "kill $SERVER_PID 2>/dev/null" EXIT
