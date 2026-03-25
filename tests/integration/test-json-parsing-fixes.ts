/**
 * TEST: JSON Parsing Fixes for Unity Content Generator
 *
 * This test verifies that cleanMalformedJSON correctly handles
 * markdown code fences and other common AI response issues.
 */

// Test the cleanMalformedJSON function
function cleanMalformedJSON(jsonStr: string): string {
  let cleaned = jsonStr.trim();

  // 1. Remove markdown code fences if present (with newlines)
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7); // Remove ```json
    // Remove any newline characters immediately after
    cleaned = cleaned.replace(/^[\r\n]+/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3); // Remove ```
    cleaned = cleaned.replace(/^[\r\n]+/, '');
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
    // Remove any newline characters before the ending ```
    cleaned = cleaned.replace(/[\r\n]+$/, '');
  }

  cleaned = cleaned.trim();

  // 2. Fix unterminated strings at the end (common with token limits)
  cleaned = cleaned.replace(/:\s*"([^"]*?)$/, ':"$1"}');

  // 3. Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  // 4. Fix missing closing braces/brackets (attempt to balance)
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;

  if (openBrackets > closeBrackets) {
    cleaned += ']'.repeat(openBrackets - closeBrackets);
  }
  if (openBraces > closeBraces) {
    cleaned += '}'.repeat(openBraces - closeBraces);
  }

  // 5. Fix unescaped quotes within strings (basic heuristic)
  // DISABLED: This pattern is too aggressive and breaks valid JSON across lines
  // Most modern LLMs don't make this mistake anyway
  // cleaned = cleaned.replace(/"([^"]*)"([^"]*)"([^"]*)"(\s*[:,}\]])/g, (match, p1, p2, p3, p4) => {
  //   if (!/[:{}\[\]]/.test(p2)) {
  //     return `"${p1}\\"${p2}\\"${p3}"${p4}`;
  //   }
  //   return match;
  // });

  // 6. Remove any null bytes or problematic control characters (but keep \n and \r for formatting)
  // Note: JSON.parse handles whitespace, so we only remove truly problematic characters
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // 7. Fix missing quotes around property names (common error)
  // DISABLED: This can break valid JSON in complex cases
  // cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

  // 8. Fix single quotes to double quotes
  // DISABLED: This breaks apostrophes in strings like "Khan's" or "it's"
  // cleaned = cleaned.replace(/'/g, '"');

  return cleaned;
}

// Test cases
const testCases = [
  {
    name: 'Markdown code fence with json tag',
    input: '```json\n{"name": "Caesar", "title": "Emperor"}\n```',
    expected: { name: 'Caesar', title: 'Emperor' },
  },
  {
    name: 'Markdown code fence without language tag',
    input: '```\n{"name": "Cleopatra", "title": "Pharaoh"}\n```',
    expected: { name: 'Cleopatra', title: 'Pharaoh' },
  },
  {
    name: 'Plain JSON (no markdown)',
    input: '{"name": "Alexander", "title": "King"}',
    expected: { name: 'Alexander', title: 'King' },
  },
  {
    name: 'JSON with trailing comma',
    input: '{"name": "Napoleon", "title": "Emperor",}',
    expected: { name: 'Napoleon', title: 'Emperor' },
  },
  {
    name: 'JSON with missing closing brace',
    input: '{"name": "Genghis", "title": "Khan"',
    expected: { name: 'Genghis', title: 'Khan' },
  },
  {
    name: 'Markdown fence with carriage return and newline',
    input: '```json\r\n{"name": "Hannibal", "title": "General"}\r\n```',
    expected: { name: 'Hannibal', title: 'General' },
  },
  {
    name: 'Markdown fence with extra whitespace',
    input: '```json  \n  \n{"name": "Spartacus", "title": "Gladiator"}  \n  \n```',
    expected: { name: 'Spartacus', title: 'Gladiator' },
  },
  {
    name: 'Complex nested object with markdown',
    input: `\`\`\`json
{
  "basic_info": {
    "full_name": "Julius Caesar",
    "lived": "100-44 BCE"
  },
  "key_events": [
    {
      "event": "Crossing the Rubicon",
      "year": "49 BCE"
    }
  ]
}
\`\`\``,
    expected: {
      basic_info: {
        full_name: 'Julius Caesar',
        lived: '100-44 BCE',
      },
      key_events: [
        {
          event: 'Crossing the Rubicon',
          year: '49 BCE',
        },
      ],
    },
  },
  // NOTE: These test cases are now EXPECTED TO FAIL since we disabled
  // the aggressive transformations that broke valid JSON
  // {
  //   name: 'JSON with unquoted property names',
  //   input: '{name: "Caesar", title: "Emperor"}',
  //   expected: { name: 'Caesar', title: 'Emperor' },
  // },
  // {
  //   name: 'JSON with single quotes',
  //   input: "{'name': 'Caesar', 'title': 'Emperor'}",
  //   expected: { name: 'Caesar', title: 'Emperor' },
  // },
];

// Run tests
console.log('🧪 Testing JSON Parsing Fixes\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  try {
    const cleaned = cleanMalformedJSON(testCase.input);
    const parsed = JSON.parse(cleaned);

    // Deep equality check
    const matches = JSON.stringify(parsed) === JSON.stringify(testCase.expected);

    if (matches) {
      console.log(`✅ PASS: ${testCase.name}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${testCase.name}`);
      console.log(`   Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`   Got:      ${JSON.stringify(parsed)}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${testCase.name}`);
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`   Input: ${testCase.input.substring(0, 100)}...`);
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  console.log('\n✅ All tests passed! JSON parsing fixes are working correctly.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Review the cleanMalformedJSON function.');
  process.exit(1);
}
