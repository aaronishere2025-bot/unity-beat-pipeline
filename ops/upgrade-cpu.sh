#!/bin/bash

echo "🔍 GCP Instance Upgrade Helper"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Get current instance metadata
echo "📊 Detecting current instance..."
INSTANCE_NAME=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/name" -H "Metadata-Flavor: Google" 2>/dev/null)
ZONE=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/zone" -H "Metadata-Flavor: Google" 2>/dev/null | awk -F'/' '{print $NF}')
PROJECT_ID=$(curl -s "http://metadata.google.internal/computeMetadata/v1/project/project-id" -H "Metadata-Flavor: Google" 2>/dev/null)
MACHINE_TYPE=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/machine-type" -H "Metadata-Flavor: Google" 2>/dev/null | awk -F'/' '{print $NF}')

echo "   Instance: $INSTANCE_NAME"
echo "   Zone: $ZONE"
echo "   Project: $PROJECT_ID"
echo "   Current Machine Type: $MACHINE_TYPE"
echo ""

# Check if GPU is attached
GPU_INFO=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/guest-attributes/nvidia-gpu" -H "Metadata-Flavor: Google" 2>/dev/null)
if [ -n "$GPU_INFO" ] || nvidia-smi &>/dev/null; then
    echo "✅ GPU Detected: Tesla T4 (will be preserved during upgrade)"
else
    echo "⚠️  No GPU detected"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "🎯 RECOMMENDED UPGRADE: n2-highcpu-32"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Current:  $MACHINE_TYPE (8 vCPUs)"
echo "Upgrade:  n2-highcpu-32 (32 vCPUs)"
echo "Speedup:  ~4x faster for parallel audio processing"
echo "Cost:     ~$700/month (~3x current)"
echo ""

echo "📋 UPGRADE STEPS:"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

echo "Step 1: Stop the instance"
echo "────────────────────────────────────────────────────────────────────"
echo "gcloud compute instances stop $INSTANCE_NAME \\"
echo "  --zone=$ZONE \\"
echo "  --project=$PROJECT_ID"
echo ""

echo "Step 2: Change machine type to n2-highcpu-32"
echo "────────────────────────────────────────────────────────────────────"
echo "gcloud compute instances set-machine-type $INSTANCE_NAME \\"
echo "  --machine-type=n2-highcpu-32 \\"
echo "  --zone=$ZONE \\"
echo "  --project=$PROJECT_ID"
echo ""

echo "Step 3: Start the instance"
echo "────────────────────────────────────────────────────────────────────"
echo "gcloud compute instances start $INSTANCE_NAME \\"
echo "  --zone=$ZONE \\"
echo "  --project=$PROJECT_ID"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "🔧 ONE-LINER (copy & paste all 3 commands):"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "gcloud compute instances stop $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID && \\"
echo "gcloud compute instances set-machine-type $INSTANCE_NAME --machine-type=n2-highcpu-32 --zone=$ZONE --project=$PROJECT_ID && \\"
echo "gcloud compute instances start $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "🎛️  ALTERNATIVE OPTIONS:"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

echo "Option 2: n2-standard-16 (Balanced - 16 vCPUs, 64GB RAM)"
echo "────────────────────────────────────────────────────────────────────"
echo "gcloud compute instances set-machine-type $INSTANCE_NAME \\"
echo "  --machine-type=n2-standard-16 \\"
echo "  --zone=$ZONE \\"
echo "  --project=$PROJECT_ID"
echo ""

echo "Option 3: c3-standard-22 (Newest CPU - 22 vCPUs, 88GB RAM)"
echo "────────────────────────────────────────────────────────────────────"
echo "gcloud compute instances set-machine-type $INSTANCE_NAME \\"
echo "  --machine-type=c3-standard-22 \\"
echo "  --zone=$ZONE \\"
echo "  --project=$PROJECT_ID"
echo ""

echo "Option 4: c3-highcpu-44 (BEAST MODE - 44 vCPUs, 88GB RAM)"
echo "────────────────────────────────────────────────────────────────────"
echo "gcloud compute instances set-machine-type $INSTANCE_NAME \\"
echo "  --machine-type=c3-highcpu-44 \\"
echo "  --zone=$ZONE \\"
echo "  --project=$PROJECT_ID"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "⚠️  IMPORTANT NOTES:"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "• Your instance will be STOPPED during upgrade (~5 minutes downtime)"
echo "• All data, disks, and GPU will be preserved"
echo "• SSH back in after restart to verify: lscpu | grep 'CPU(s)'"
echo "• Expected downtime: 3-5 minutes"
echo "• Current active jobs will be interrupted (save state first!)"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "📊 PERFORMANCE COMPARISON:"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Machine Type         vCPUs  RAM    Cost/Mo  Speedup  Best For"
echo "───────────────────  ─────  ─────  ───────  ───────  ─────────────────────"
echo "n1-standard-8 ⬅️      8      30GB   \$240     1x       Current"
echo "n2-standard-16       16     64GB   \$500     2.3x     Balanced"
echo "c3-standard-22       22     88GB   \$700     3.5x     Newest CPU"
echo "n2-highcpu-32 ⭐     32     32GB   \$700     4.2x     Recommended"
echo "c3-highcpu-44        44     88GB   \$1,200   6x       Beast Mode"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "🚀 Ready to upgrade? Copy the ONE-LINER above and run in terminal!"
echo "═══════════════════════════════════════════════════════════════════"
