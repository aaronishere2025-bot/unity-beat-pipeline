#!/bin/bash
# Setup script for ai-workspace-2 (Instance 2)
# Run this ON INSTANCE 2 after SSH'ing in

set -e

echo "🔧 Setting up ai-workspace-2 (Instance 2)"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Update system
echo "📦 Updating system packages..."
sudo apt-get update -qq
sudo apt-get install -y git curl ffmpeg python3 python3-pip python3-venv -qq

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null
sudo apt-get install -y nodejs -qq

# Project files should already be synced
echo "📂 Checking project files..."
cd ~
if [ ! -f "package.json" ]; then
    echo "⚠️  Project files not found!"
    echo "   Run sync-project-to-instance-2.sh on instance 1 first"
    exit 1
fi
echo "   ✅ Project files found"

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm install > /dev/null 2>&1

# Setup Python virtual environment
echo "🐍 Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate
pip install --quiet librosa numpy pydantic soundfile scipy opencv-python demucs torch

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p /tmp/unity-scratch
mkdir -p /tmp/audio-analysis-cache
mkdir -p data/videos/renders
mkdir -p data/thumbnails
mkdir -p logs

# Setup .env file
echo "🔐 Setting up environment variables..."
cat > .env << 'EOF'
# Environment
NODE_ENV=production
PORT=8080

# Instance role
INSTANCE_ROLE=worker  # This is instance 2 (worker node)

# Database - SAME as instance 1
DATABASE_URL=postgresql://neondb_owner:npg_dmY5oHPz6DAe@ep-shy-cake-a0ent59wd.us-east-2.aws.neon.tech/neondb?sslmode=require

# All other secrets loaded from GCP Secret Manager
EOF

echo ""
echo "✅ Instance 2 setup complete!"
echo ""
echo "📝 NEXT STEPS:"
echo ""
echo "1. Edit .env file and add your DATABASE_URL:"
echo "   nano ~/unity-ai/.env"
echo ""
echo "2. Start the job worker:"
echo "   cd ~/unity-ai"
echo "   npm run dev"
echo ""
echo "3. Set up auto-start (optional):"
echo "   Run: bash ~/unity-ai/setup-systemd-worker.sh"
echo ""
echo "════════════════════════════════════════════════════════════════"
