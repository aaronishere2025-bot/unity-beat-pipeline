#!/usr/bin/env bash
#
# Daily cron wrapper for content generation pipeline.
# Logs output to /tmp/daily-cron-<date>.log
#
# Crontab entry (run at midnight PT daily):
#   0 0 * * * /home/aaronishere2025/tools/daily-cron.sh
#
set -euo pipefail

WORKDIR="/home/aaronishere2025"
LOGFILE="/tmp/daily-cron-$(date +%Y-%m-%d).log"

cd "$WORKDIR"

echo "=== Daily cron started at $(date) ===" >> "$LOGFILE"

# Source nvm / node if available (cron has minimal PATH)
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node/" 2>/dev/null | tail -1)/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

npx tsx tools/daily-cron-runner.ts >> "$LOGFILE" 2>&1
EXIT_CODE=$?

echo "=== Daily cron finished at $(date) with exit code $EXIT_CODE ===" >> "$LOGFILE"

# Prune logs older than 14 days
find /tmp -name 'daily-cron-*.log' -mtime +14 -delete 2>/dev/null || true

exit $EXIT_CODE
