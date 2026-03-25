/**
 * Test parsing of long JSON responses (like deep research)
 */

// Simulate a long JSON response like the one that's failing
const longJsonResponse = `{
  "basic_info": {
    "full_name": "Genghis Khan (born Temüjin)",
    "lived": "1162-1227",
    "region": "Mongolian Steppe, Central Asia",
    "known_for": "Founder of the Mongol Empire, which became the largest contiguous land empire in history"
  },
  "character_appearance": {
    "physical": "Strong, broad-shouldered warrior with weathered face, dark eyes that convey both wisdom and ferocity, distinctive Mongolian features, battle scars",
    "age_to_depict": "45, at peak of his power during the empire's expansion",
    "distinctive_features": "Piercing gaze, commanding presence, visible battle scars, traditional Mongolian warrior braids",
    "primary_outfit": "Layered Mongolian warrior armor with lamellar plates, fur-lined deel (traditional robe), leather boots",
    "accessories": "Composite bow, sword at hip, horse tack, traditional Mongolian symbols of power",
    "presence": "Commanding, calculating, radiates authority and military genius"
  },
  "origin_scene": {
    "childhood_moment": "Young Temüjin witnesses his father's murder, forced to flee across the harsh Mongolian steppe",
    "childhood_setting": "Vast windswept steppe under dramatic storm clouds, young boy clutching reins of a horse"
  },
  "key_events": [
    {
      "event": "Unification of Mongolian Tribes",
      "year": "1206",
      "what_happened": "After decades of warfare, Temüjin unites the warring Mongolian tribes under his leadership and is proclaimed Genghis Khan",
      "why_it_matters": "Created the foundation for the largest contiguous land empire, revolutionized military tactics",
      "visual_setting": "Vast gathering of thousands of warriors on the steppe, ceremonial kurultai assembly, banners flying",
      "scene_direction": "Wide shot of assembled tribes, zoom to Genghis being crowned",
      "emotional_beat": "Triumph after years of struggle"
    },
    {
      "event": "Conquest of Khwarazm",
      "year": "1219-1221",
      "what_happened": "After the murder of Mongolian envoys, Genghis Khan launches devastating campaign against the Khwarazmian Empire",
      "why_it_matters": "Demonstrated Mongol military superiority, opened routes to Europe and the Middle East",
      "visual_setting": "Siege of Samarkand, massive armies crossing deserts, cities in flames",
      "scene_direction": "Epic battle scenes, siege warfare, Mongol cavalry charges",
      "emotional_beat": "Ruthless determination, vengeance"
    }
  ],
  "philosophical_thread": "From an orphaned boy to the founder of history's largest empire through strategic genius, adaptability, and merit-based leadership",
  "visual_style_notes": "Epic historical battle scenes, vast Mongolian steppes, mounted warriors, traditional Mongolian architecture"
}`;

console.log('Testing long JSON parsing (5700+ characters)...\n');

function cleanMalformedJSON(jsonStr: string): string {
  let cleaned = jsonStr.trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
    cleaned = cleaned.replace(/^[\r\n]+/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
    cleaned = cleaned.replace(/^[\r\n]+/, '');
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
    cleaned = cleaned.replace(/[\r\n]+$/, '');
  }

  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/:\s*"([^"]*?)$/, ':"$1"}');
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

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

  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // DISABLED: These transformations break valid JSON
  // cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
  // cleaned = cleaned.replace(/'/g, '"');

  return cleaned;
}

try {
  console.log('Original length:', longJsonResponse.length);
  console.log('First 100 chars:', longJsonResponse.substring(0, 100));
  console.log('');

  const cleaned = cleanMalformedJSON(longJsonResponse);
  console.log('Cleaned length:', cleaned.length);
  console.log('First 100 chars:', cleaned.substring(0, 100));
  console.log('');

  const parsed = JSON.parse(cleaned);
  console.log('✅ SUCCESS - Parsed long JSON');
  console.log('Basic info:', parsed.basic_info);
  console.log('Key events:', parsed.key_events?.length);
} catch (error) {
  console.log('❌ FAILED:', error instanceof Error ? error.message : String(error));

  // Try to identify the specific issue
  const cleaned = cleanMalformedJSON(longJsonResponse);
  console.log('\nDEBUG: Trying to parse...');
  console.log('Cleaned JSON (first 500 chars):');
  console.log(cleaned.substring(0, 500));
  console.log('\nLast 200 chars:');
  console.log(cleaned.substring(cleaned.length - 200));
}
