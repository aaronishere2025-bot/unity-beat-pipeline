#!/bin/bash
# Smart sync - only source code, no generated files

echo "🔄 Smart Sync: Source Code Only"
echo "════════════════════════════════════════════════════════════════"
echo ""

cd /home/aaronishere2025

# Create list of files to include (source code only)
echo "📋 Creating file list..."
tar -czf /tmp/unity-source.tar.gz \
  --exclude='node_modules' \
  --exclude='venv' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='data/videos/*' \
  --exclude='data/thumbnails/*' \
  --exclude='data/audio/*' \
  --exclude='/tmp/*' \
  --exclude='*.mp4' \
  --exclude='*.mp3' \
  --exclude='*.wav' \
  --exclude='*.flac' \
  --exclude='*.jpg' \
  --exclude='*.png' \
  --exclude='*.log' \
  --exclude='*.pyc' \
  --exclude='__pycache__' \
  --exclude='.next' \
  --exclude='.cache' \
  server \
  client \
  shared \
  scripts \
  analytics-engines \
  tools \
  package.json \
  package-lock.json \
  tsconfig.json \
  vite.config.ts \
  drizzle.config.ts \
  *.sh \
  *.md 2>/dev/null

ARCHIVE_SIZE=$(ls -lh /tmp/unity-source.tar.gz | awk '{print $5}')
echo "   ✅ Archive created: $ARCHIVE_SIZE"

echo "📤 Copying to instance 2..."
gcloud compute scp \
  /tmp/unity-source.tar.gz \
  ai-workspace-2:/tmp/ \
  --zone=us-central1-a \
  --project=unity-ai-1766877776

echo "📥 Extracting on instance 2..."
gcloud compute ssh ai-workspace-2 \
  --zone=us-central1-a \
  --project=unity-ai-1766877776 \
  --command="cd ~ && tar -xzf /tmp/unity-source.tar.gz && rm /tmp/unity-source.tar.gz"

rm /tmp/unity-source.tar.gz

echo ""
echo "✅ Source code synced successfully!"
echo "   Size: $ARCHIVE_SIZE (only source code, no generated files)"
echo ""
