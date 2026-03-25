#!/bin/bash
# Setup systemd service for Unity job worker (Instance 2)

echo "🤖 Setting up Unity worker as systemd service"
echo "════════════════════════════════════════════════════════════════"

# Get current directory
WORK_DIR="$(pwd)"

# Create systemd service file
echo "📝 Creating systemd service file..."
sudo tee /etc/systemd/system/unity-worker.service > /dev/null <<EOF
[Unit]
Description=Unity AI Worker (Instance 2)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORK_DIR
Environment=NODE_ENV=production
Environment=PORT=8080
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10
StandardOutput=append:/home/$USER/logs/worker.log
StandardError=append:/home/$USER/logs/worker-error.log

[Install]
WantedBy=multi-user.target
EOF

# Create log directory
mkdir -p ~/logs

# Reload systemd
echo "🔄 Reloading systemd..."
sudo systemctl daemon-reload

# Enable service
echo "✅ Enabling unity-worker service..."
sudo systemctl enable unity-worker

# Start service
echo "🚀 Starting unity-worker service..."
sudo systemctl start unity-worker

# Show status
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Unity worker service installed and started!"
echo ""
echo "📊 Service status:"
sudo systemctl status unity-worker --no-pager -l
echo ""
echo "📝 Useful commands:"
echo "   Check status:  sudo systemctl status unity-worker"
echo "   View logs:     tail -f ~/logs/worker.log"
echo "   Stop worker:   sudo systemctl stop unity-worker"
echo "   Start worker:  sudo systemctl start unity-worker"
echo "   Restart:       sudo systemctl restart unity-worker"
echo ""
echo "════════════════════════════════════════════════════════════════"
