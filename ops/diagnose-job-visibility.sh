#!/bin/bash
# Diagnose why jobs aren't visible

echo "🔍 Job Visibility Diagnostic"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. API Response Summary:"
response=$(curl -s http://dontcomeherecrazydomain.com/api/jobs)
total=$(echo "$response" | jq '.data | length')
echo "   Total jobs returned: $total"
echo ""

echo "2. Jobs by User ID:"
echo "$response" | jq -r '.data | group_by(.userId) | .[] | "\(.  | length) jobs with userId: \(.[0].userId)"' | head -10
echo ""

echo "3. Most Recent Jobs (what you SHOULD see):"
echo "$response" | jq -r '.data[:10] | .[] | "   - \(.scriptName) (userId: \(.userId[:8] // "null"))"'
echo ""

echo "════════════════════════════════════════════════════"
echo ""
echo "❓ QUESTION: Are you logged in to dontcomeherecrazydomain.com?"
echo ""
echo "If YES:"
echo "   - You'll only see jobs for YOUR user account"
echo "   - You need to log OUT to see all jobs"
echo ""
echo "If NO:"
echo "   - You should see ALL $total jobs"
echo "   - Try hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo ""
echo "📱 To check: Open browser DevTools (F12) → Network tab → Refresh page"
echo "   Look for the /api/jobs request and check the response"
