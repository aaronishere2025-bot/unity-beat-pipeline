#!/bin/bash
# Complete dual-instance setup automation

set -e

echo "🚀 COMPLETE DUAL INSTANCE SETUP"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "This will set up:"
echo "  1. Instance 2 with your project files"
echo "  2. Auto-scaler on instance 1"
echo "  3. Systemd services for auto-start"
echo ""
echo "Time required: ~5 minutes"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."
echo ""

# Step 1: Sync project to instance 2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 STEP 1/3: Syncing project files to instance 2..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bash /home/aaronishere2025/sync-project-to-instance-2.sh

# Step 2: Setup instance 2
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚙️  STEP 2/3: Setting up instance 2..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Run setup on instance 2
gcloud compute ssh ai-workspace-2 \
  --zone=us-central1-a \
  --project=unity-ai-1766877776 \
  --command="bash ~/setup-instance-2.sh"

# Install systemd service on instance 2
gcloud compute ssh ai-workspace-2 \
  --zone=us-central1-a \
  --project=unity-ai-1766877776 \
  --command="bash ~/setup-systemd-worker.sh"

# Step 3: Setup auto-scaler on instance 1
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 STEP 3/3: Installing auto-scaler on instance 1..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bash /home/aaronishere2025/setup-auto-scaler.sh

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ SETUP COMPLETE!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "🎉 Your dual-instance setup is ready!"
echo ""
echo "📊 What's running:"
echo "   • Instance 1: Always on (primary + auto-scaler)"
echo "   • Instance 2: Auto-starts when queue > 10 jobs"
echo ""
echo "💰 Cost savings:"
echo "   • Base: $240/month (instance 1 only)"
echo "   • Peak: $480/month (both instances 24/7)"
echo "   • Average: $300-360/month (auto-scaling)"
echo ""
echo "📝 Monitor auto-scaler:"
echo "   tail -f /home/aaronishere2025/logs/auto-scaler.log"
echo ""
echo "📖 Full documentation:"
echo "   cat /home/aaronishere2025/DUAL-INSTANCE-SETUP.md"
echo ""
echo "════════════════════════════════════════════════════════════════"
