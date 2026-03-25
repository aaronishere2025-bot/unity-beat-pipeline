#!/bin/bash
# Analyze test scripts for OpenAI usage

echo "🔍 Analyzing test scripts for OpenAI API usage..."
echo ""

# Find all test and generate scripts
for file in test-*.ts generate-*.ts; do
  if [ -f "$file" ]; then
    # Count OpenAI API calls
    openai_count=$(grep -c "openai\." "$file" 2>/dev/null || echo 0)
    chat_count=$(grep -c "chat.completions" "$file" 2>/dev/null || echo 0)
    gpt_count=$(grep -c "gpt-4o\|gpt-4-turbo\|gpt-5" "$file" 2>/dev/null || echo 0)

    total=$((openai_count + chat_count))

    if [ "$total" -gt 0 ]; then
      echo "📄 $file"
      echo "   OpenAI refs: $openai_count | Chat completions: $chat_count | GPT models: $gpt_count"

      # Check if it has loops
      has_loop=$(grep -E "for.*of|while|forEach|map\(" "$file" | head -1)
      if [ -n "$has_loop" ]; then
        echo "   ⚠️  Contains loops - potential for many API calls!"
      fi

      # Check file size (larger scripts might do more)
      size=$(wc -l < "$file")
      echo "   Lines: $size"
      echo ""
    fi
  fi
done | head -100

echo ""
echo "💡 Scripts with the most OpenAI usage are most likely to cause high costs."
