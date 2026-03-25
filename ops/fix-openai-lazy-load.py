#!/usr/bin/env python3
"""Fix all services to lazy-load OpenAI"""

import re
import os

FILES = [
    "server/services/autonomous-goal-agent.ts",
    "server/services/batch-consensus-test.ts",
    "server/services/content-quality-service.ts",
    "server/services/creative-analytics-service.ts",
    "server/services/fact-check-service.ts",
    "server/services/historical-accuracy-validator.ts",
    "server/services/metrics-harvesting-service.ts",
    "server/services/visual-intelligence-service.ts",
    "server/services/youtube-analytics-service.ts",
]

LAZY_LOADER = """let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI();
  }
  if (!openai) {
    throw new Error('OpenAI API key not available');
  }
  return openai;
}"""

for filepath in FILES:
    if not os.path.exists(filepath):
        print(f"⚠️  Skipping {filepath} (not found)")
        continue

    print(f"Fixing {filepath}...")

    with open(filepath, 'r') as f:
        content = f.read()

    # Replace const openai = new OpenAI();
    content = re.sub(
        r'^const openai = new OpenAI\(\);',
        LAZY_LOADER,
        content,
        flags=re.MULTILINE
    )

    # Replace openai. with getOpenAI().
    # But not if it's already getOpenAI() or in a string/comment
    content = re.sub(
        r'\bopenai\.',
        'getOpenAI().',
        content
    )

    with open(filepath, 'w') as f:
        f.write(content)

    print(f"  ✅ Fixed {filepath}")

print("\n✅ All services fixed to lazy-load OpenAI!")
