#!/bin/bash
# Sync entire project from instance 1 to instance 2

echo "🔄 Syncing project files to ai-workspace-2..."
echo "════════════════════════════════════════════════════════════════"
echo ""

# Create tarball of project (excluding node_modules, temp files)
echo "📦 Creating project archive..."
cd /home/aaronishere2025
tar -czf /tmp/unity-project.tar.gz \
  --exclude='node_modules' \
  --exclude='venv' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='/tmp/unity-scratch/*' \
  --exclude='/tmp/audio-analysis-cache/*' \
  --exclude='*.log' \
  . 2>/dev/null

echo "📤 Copying to instance 2..."
gcloud compute scp \
  /tmp/unity-project.tar.gz \
  ai-workspace-2:/tmp/ \
  --zone=us-central1-a \
  --project=unity-ai-1766877776

echo "📥 Extracting on instance 2..."
gcloud compute ssh ai-workspace-2 \
  --zone=us-central1-a \
  --project=unity-ai-1766877776 \
  --command="cd ~ && tar -xzf /tmp/unity-project.tar.gz && rm /tmp/unity-project.tar.gz"

# Cleanup
rm /tmp/unity-project.tar.gz

echo ""
echo "✅ Project synced to instance 2!"
echo ""
echo "📝 NEXT STEP: SSH into instance 2 and run setup:"
echo ""
echo "   gcloud compute ssh ai-workspace-2 --zone=us-central1-a --project=unity-ai-1766877776"
echo "   bash ~/setup-instance-2.sh"
echo ""
echo "════════════════════════════════════════════════════════════════"
