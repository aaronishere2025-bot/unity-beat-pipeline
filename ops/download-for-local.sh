#!/bin/bash
# Run this on your LOCAL computer to download the automation script

echo "📥 Downloading Gumroad automation files..."
echo ""

# Create local directory
mkdir -p ~/gumroad-automation
cd ~/gumroad-automation

# Download the automation script
scp aaronishere2025@YOUR_SERVER_IP:/home/aaronishere2025/gumroad-automation.ts ./
scp aaronishere2025@YOUR_SERVER_IP:/home/aaronishere2025/package.json ./

echo ""
echo "✅ Files downloaded to: ~/gumroad-automation"
echo ""
echo "Next steps:"
echo "  cd ~/gumroad-automation"
echo "  npm install puppeteer"
echo "  GUMROAD_HEADLESS=false npx tsx gumroad-automation.ts"
