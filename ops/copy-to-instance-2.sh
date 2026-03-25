#!/bin/bash
# Copy setup files to instance 2

echo "📤 Copying setup files to ai-workspace-2..."

# Copy setup scripts
gcloud compute scp \
  /home/aaronishere2025/setup-instance-2.sh \
  /home/aaronishere2025/setup-systemd-worker.sh \
  ai-workspace-2:~/ \
  --zone=us-central1-a \
  --project=unity-ai-1766877776

echo "✅ Files copied! Now SSH into instance 2 and run:"
echo "   bash ~/setup-instance-2.sh"
