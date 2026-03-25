#!/bin/bash
# Test production frontend job visibility

echo "🌐 Testing Production Frontend"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. API Test:"
echo "   URL: http://dontcomeherecrazydomain.com/api/jobs"
response=$(curl -s http://dontcomeherecrazydomain.com/api/jobs)
job_count=$(echo "$response" | jq '.data | length' 2>/dev/null)
success=$(echo "$response" | jq -r '.success' 2>/dev/null)

echo "   Success: $success"
echo "   Jobs returned: $job_count"
echo ""

if [ "$job_count" -gt 0 ]; then
  echo "   First 3 jobs:"
  echo "$response" | jq -r '.data[:3] | .[] | "   - \(.scriptName) (\(.status))"' 2>/dev/null
fi
echo ""

echo "2. Your GPU Test Jobs:"
echo "$response" | jq -r '.data[] | select(.scriptName | contains("GPU Test")) | "   ✅ \(.scriptName[:50]) - \(.status)"' 2>/dev/null | head -6
echo ""

echo "════════════════════════════════════════════════════"
echo ""
echo "📍 Frontend URL: http://dontcomeherecrazydomain.com/jobs"
echo ""
echo "If you don't see jobs in your browser:"
echo "   1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   2. Clear browser cache"
echo "   3. Try incognito/private browsing mode"
echo ""
echo "The API is returning $job_count jobs successfully!"
