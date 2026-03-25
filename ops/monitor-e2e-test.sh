#!/bin/bash
# E2E Test Monitor - Checks progress every 5 minutes and saves to file

LOG_FILE="/tmp/claude/-home-aaronishere2025/tasks/be7d965.output"
REPORT_FILE="/home/aaronishere2025/E2E_TEST_STATUS.md"

while true; do
  TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

  echo "# E2E Test Status Report" > "$REPORT_FILE"
  echo "Last checked: $TIMESTAMP" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  # Check if test is still running
  if ps aux | grep -v grep | grep "test-e2e-video-generation" > /dev/null; then
    echo "## Status: 🔄 RUNNING" >> "$REPORT_FILE"
  else
    echo "## Status: ⏹️ STOPPED" >> "$REPORT_FILE"
  fi

  echo "" >> "$REPORT_FILE"
  echo "## Progress Milestones:" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"

  # Check for key milestones
  grep -E "Secrets loaded|Discovered:|Lyrics generated|Timing analysis|Characters created|Package created|Job created|Suno|Kling|FFmpeg|Upload|complete|Error|failed" "$LOG_FILE" | tail -30 >> "$REPORT_FILE"

  echo '```' >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "## Last 20 Lines:" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  tail -20 "$LOG_FILE" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"

  # Check if completed or failed
  if grep -q "Test complete\|Video uploaded\|failed permanently" "$LOG_FILE"; then
    echo "" >> "$REPORT_FILE"
    echo "## ✅ TEST FINISHED" >> "$REPORT_FILE"
    echo "Check full log at: $LOG_FILE" >> "$REPORT_FILE"
    break
  fi

  # Wait 5 minutes before next check
  sleep 300
done
