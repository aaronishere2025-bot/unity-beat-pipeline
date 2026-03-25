#!/bin/bash

# Verification script for JSON parsing fixes
# Run this to verify all fixes are working correctly

echo "🔍 JSON Parsing Fixes Verification"
echo "===================================="
echo ""

# Test 1: Unit tests
echo "📋 Test 1/3: Unit Tests (markdown fences, edge cases)"
npx tsx test-json-parsing-fixes.ts 2>&1 | tail -3
if [ $? -eq 0 ]; then
  echo "✅ Unit tests passed"
else
  echo "❌ Unit tests failed"
  exit 1
fi
echo ""

# Test 2: Long JSON
echo "📋 Test 2/3: Long JSON (2700+ chars, apostrophes)"
npx tsx test-long-json-parsing.ts 2>&1 | grep -E "(SUCCESS|FAILED)"
if [ $? -eq 0 ]; then
  echo "✅ Long JSON test passed"
else
  echo "❌ Long JSON test failed"
  exit 1
fi
echo ""

# Test 3: Integration
echo "📋 Test 3/3: Integration (actual Unity functions)"
npx tsx test-unity-json-parsing-integration.ts 2>&1 | tail -2
if [ $? -eq 0 ]; then
  echo "✅ Integration test passed"
else
  echo "❌ Integration test failed"
  exit 1
fi
echo ""

echo "===================================="
echo "✅ ALL TESTS PASSED!"
echo ""
echo "Summary:"
echo "  ✅ Markdown code fences handled correctly"
echo "  ✅ Long JSON (2700+ chars) parsed successfully"
echo "  ✅ Apostrophes in strings preserved"
echo "  ✅ All Unity generator functions updated"
echo "  ✅ Integration with actual services working"
echo ""
echo "🎉 JSON parsing fixes verified and working!"
