#!/bin/bash
# Verification script for JSON parsing improvements

echo "========================================================================"
echo "JSON PARSING IMPROVEMENTS VERIFICATION"
echo "========================================================================"
echo

FILE="server/services/unity-content-generator.ts"

echo "Checking file: $FILE"
echo

# Check if cleanMalformedJSON function exists
if grep -q "function cleanMalformedJSON" "$FILE"; then
    echo "✅ cleanMalformedJSON function found"
    LINE=$(grep -n "function cleanMalformedJSON" "$FILE" | cut -d: -f1)
    echo "   Location: Line $LINE"
else
    echo "❌ cleanMalformedJSON function NOT found"
fi
echo

# Check if extractAndParseJSON calls cleanMalformedJSON
if grep -A 5 "function extractAndParseJSON" "$FILE" | grep -q "cleanMalformedJSON"; then
    echo "✅ extractAndParseJSON calls cleanMalformedJSON"
else
    echo "⚠️  extractAndParseJSON might not be calling cleanMalformedJSON"
fi
echo

# Check if extractLyricScenes has retry logic
if grep -A 100 "export async function extractLyricScenes" "$FILE" | grep -q "maxAttempts = 3"; then
    echo "✅ extractLyricScenes has 3-tier retry mechanism"
else
    echo "❌ extractLyricScenes retry mechanism NOT found"
fi
echo

# Check for improved error messages
if grep -q "attempt \${parseAttempts}/\${maxAttempts}" "$FILE"; then
    echo "✅ Enhanced error messages with attempt tracking"
else
    echo "❌ Enhanced error messages NOT found"
fi
echo

# Count JSON.parse occurrences
PARSE_COUNT=$(grep -c "JSON\.parse" "$FILE")
echo "📊 Total JSON.parse calls in file: $PARSE_COUNT"
echo

# Check for specific cleaning strategies
echo "Checking cleaning strategies in cleanMalformedJSON:"
echo

STRATEGIES=(
    "startsWith('...json')" "Remove markdown code fences"
    "trailing commas" "Remove trailing commas"
    "openBraces.*closeBraces" "Balance braces/brackets"
    "[\x00-\x09" "Remove control characters"
    "replace(/'/g" "Fix single quotes"
)

for ((i=0; i<${#STRATEGIES[@]}; i+=2)); do
    PATTERN="${STRATEGIES[i]}"
    DESC="${STRATEGIES[i+1]}"
    if grep -q "$PATTERN" "$FILE"; then
        echo "  ✅ $DESC"
    else
        echo "  ⚠️  $DESC (pattern not found)"
    fi
done

echo
echo "========================================================================"
echo "Test file verification"
echo "========================================================================"
echo

TEST_FILE="test-json-parsing-improvements.ts"
if [ -f "$TEST_FILE" ]; then
    echo "✅ Test file exists: $TEST_FILE"
    TEST_COUNT=$(grep -c "name:" "$TEST_FILE" || echo "0")
    echo "   Test cases: $TEST_COUNT"
else
    echo "❌ Test file NOT found: $TEST_FILE"
fi

echo
DOC_FILE="JSON_PARSING_IMPROVEMENTS.md"
if [ -f "$DOC_FILE" ]; then
    echo "✅ Documentation exists: $DOC_FILE"
    LINES=$(wc -l < "$DOC_FILE")
    echo "   Lines: $LINES"
else
    echo "❌ Documentation NOT found: $DOC_FILE"
fi

echo
echo "========================================================================"
echo "✅ Verification complete!"
echo "========================================================================"
