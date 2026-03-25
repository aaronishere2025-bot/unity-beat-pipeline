#!/usr/bin/env tsx
// Test what prompt is actually being generated
function generateInstrumentalStructure(targetDurationSeconds: number, style?: string): string {
  const minutes = Math.floor(targetDurationSeconds / 60);

  // Extract BPM from style if available
  let bpm = '';
  if (style) {
    const bpmMatch = style.match(/(\d+)\s*BPM/i);
    if (bpmMatch) {
      bpm = ` ${bpmMatch[1]} bpm`;
    }
  }

  // Extract genre (first part before |)
  let genre = '';
  if (style) {
    const genreMatch = style.split('|')[0].trim();
    genre = genreMatch.split(',')[0].trim(); // Just first genre
  }

  // Build structure based on target duration
  let structure = '';

  if (targetDurationSeconds <= 90) {
    structure = `[Intro]\n[Verse]\n[Chorus]\n[Outro]`;
  } else if (targetDurationSeconds <= 180) {
    structure = `[Intro]\n[Verse]\n[Chorus]\n[Verse]\n[Chorus]\n[Bridge]\n[Chorus]\n[Outro]`;
  } else if (targetDurationSeconds <= 300) {
    structure = `[Intro]\n[Verse]\n[Build]\n[Chorus]\n[Verse]\n[Build]\n[Chorus]\n[Bridge]\n[Breakdown]\n[Chorus]\n[Outro]`;
  } else {
    structure = `[Intro]\n[Verse]\n[Build]\n[Chorus]\n[Verse]\n[Build]\n[Chorus]\n[Bridge]\n[Breakdown]\n[Chorus]\n[Verse]\n[Chorus]\n[Outro]`;
  }

  // Combine genre/bpm info with structure
  const prompt = `${genre}${bpm} ${minutes} minutes\n\n${structure}`;

  return prompt;
}

const prompt = generateInstrumentalStructure(180, 'trap hip hop | 140 BPM | hard 808s');
console.log('='.repeat(60));
console.log('FULL PROMPT (180s target):');
console.log('='.repeat(60));
console.log(JSON.stringify(prompt)); // JSON to show escaped chars
console.log('='.repeat(60));
console.log(prompt); // Raw output
console.log('='.repeat(60));
console.log(`Length: ${prompt.length} chars`);
console.log(`Lines: ${prompt.split('\n').length}`);
