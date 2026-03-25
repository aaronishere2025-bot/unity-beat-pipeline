#!/bin/bash

echo "🤖 Setting Up Auto-Scaler for Instance 2"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Create systemd service file
echo "📝 Creating systemd service..."

sudo tee /etc/systemd/system/unity-auto-scaler.service > /dev/null <<EOF
[Unit]
Description=Unity AI Auto-Scaler for Instance 2
After=network.target

[Service]
Type=simple
User=aaronishere2025
WorkingDirectory=/home/aaronishere2025
ExecStart=/usr/bin/npx tsx /home/aaronishere2025/auto-scaler.ts
Restart=always
RestartSec=10
StandardOutput=append:/home/aaronishere2025/logs/auto-scaler.log
StandardError=append:/home/aaronishere2025/logs/auto-scaler.error.log

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Service file created at /etc/systemd/system/unity-auto-scaler.service"
echo ""

# Create logs directory
mkdir -p /home/aaronishere2025/logs
echo "✅ Logs directory created"
echo ""

# Reload systemd
echo "🔄 Reloading systemd..."
sudo systemctl daemon-reload
echo ""

# Enable service (start on boot)
echo "⚙️  Enabling service..."
sudo systemctl enable unity-auto-scaler.service
echo ""

# Start service
echo "🚀 Starting auto-scaler..."
sudo systemctl start unity-auto-scaler.service
echo ""

# Check status
echo "📊 Service status:"
sudo systemctl status unity-auto-scaler.service --no-pager
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "✅ AUTO-SCALER SETUP COMPLETE!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Useful Commands:"
echo "───────────────────────────────────────────────────────────────────"
echo "# Check status"
echo "sudo systemctl status unity-auto-scaler"
echo ""
echo "# View logs (live)"
echo "tail -f /home/aaronishere2025/logs/auto-scaler.log"
echo ""
echo "# Restart service"
echo "sudo systemctl restart unity-auto-scaler"
echo ""
echo "# Stop service"
echo "sudo systemctl stop unity-auto-scaler"
echo ""
echo "# Disable auto-start on boot"
echo "sudo systemctl disable unity-auto-scaler"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "🎯 HOW IT WORKS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "1. Auto-scaler checks job queue every 60 seconds"
echo ""
echo "2. START INSTANCE 2 when:"
echo "   • 10+ jobs are queued"
echo "   • Instance 2 is currently stopped"
echo ""
echo "3. STOP INSTANCE 2 when:"
echo "   • No jobs queued/processing"
echo "   • Idle for 15+ minutes"
echo ""
echo "4. KEEP RUNNING when:"
echo "   • Jobs are being processed"
echo "   • New jobs keep coming in"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "💰 COST SAVINGS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Scenario 1: 24/7 workload"
echo "   Instance 2 running: 100% uptime = \$240/month"
echo ""
echo "Scenario 2: Business hours (8am-6pm, Mon-Fri)"
echo "   Instance 2 running: ~40% uptime = \$96/month"
echo "   Savings: \$144/month (60% off!)"
echo ""
echo "Scenario 3: Batch jobs (4 hours/day)"
echo "   Instance 2 running: ~17% uptime = \$40/month"
echo "   Savings: \$200/month (83% off!)"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "📊 MONITORING"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Watch the auto-scaler in action:"
echo "tail -f /home/aaronishere2025/logs/auto-scaler.log"
echo ""
echo "You'll see output like:"
echo "───────────────────────────────────────────────────────────────────"
echo "[2026-01-30T03:00:00Z] 🔍 Checking job queue..."
echo "   Jobs: 2 queued, 3 processing"
echo "😴 Low load (2 jobs) - instance 2 stays off"
echo "💰 Saving money! (~\$0.33/hour = ~\$8/day)"
echo ""
echo "[2026-01-30T03:15:00Z] 🔍 Checking job queue..."
echo "   Jobs: 15 queued, 8 processing"
echo "🚨 HIGH LOAD: 15 jobs queued (threshold: 10)"
echo "   Starting instance 2 to handle load..."
echo "🚀 Starting ai-workspace-2..."
echo "✅ ai-workspace-2 started successfully"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "🔧 CUSTOMIZATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Edit /home/aaronishere2025/auto-scaler.ts to adjust:"
echo "───────────────────────────────────────────────────────────────────"
echo "const QUEUE_THRESHOLD_START = 10;  // Start at 10+ jobs"
echo "const IDLE_MINUTES_STOP = 15;      // Stop after 15 min idle"
echo "const CHECK_INTERVAL_MS = 60000;   // Check every 60 seconds"
echo ""
echo "After editing, restart:"
echo "sudo systemctl restart unity-auto-scaler"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "✅ Auto-scaler is now running in the background!"
echo "═══════════════════════════════════════════════════════════════════"
