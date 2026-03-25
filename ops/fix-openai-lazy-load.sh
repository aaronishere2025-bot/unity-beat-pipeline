#!/bin/bash
# Fix all services to lazy-load OpenAI

FILES=(
  "server/services/autonomous-goal-agent.ts"
  "server/services/batch-consensus-test.ts"
  "server/services/content-quality-service.ts"
  "server/services/creative-analytics-service.ts"
  "server/services/fact-check-service.ts"
  "server/services/historical-accuracy-validator.ts"
  "server/services/metrics-harvesting-service.ts"
  "server/services/visual-intelligence-service.ts"
  "server/services/youtube-analytics-service.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing $file..."

    # Replace const openai = new OpenAI() with lazy loader
    sed -i 's/^const openai = new OpenAI();$/let openai: OpenAI | null = null;\n\nfunction getOpenAI(): OpenAI {\n  if (!openai \&\& process.env.OPENAI_API_KEY) {\n    openai = new OpenAI();\n  }\n  if (!openai) {\n    throw new Error('\''OpenAI API key not available'\'');\n  }\n  return openai;\n}/' "$file"

    # Replace openai. with getOpenAI().
    sed -i 's/\bopenai\./getOpenAI()./g' "$file"

    echo "  ✓ Fixed $file"
  fi
done

echo ""
echo "✅ All services fixed to lazy-load OpenAI!"
