#!/usr/bin/env tsx
// Test updated prompt
function generateInstrumentalStructure(targetDurationSeconds: number, style?: string): string {
  const minutes = Math.floor(targetDurationSeconds / 60);

  let bpm = '';
  if (style) {
    const bpmMatch = style.match(/(\d+)\s*BPM/i);
    if (bpmMatch) {
      bpm = ` ${bpmMatch[1]} bpm`;
    }
  }

  let genre = '';
  if (style) {
    const genreMatch = style.split('|')[0].trim();
    genre = genreMatch.split(',')[0].trim();
  }

  let structure = '';

  if (targetDurationSeconds <= 90) {
    structure = `[Intro]
(instrumental)

[Verse]
(instrumental)

[Chorus]
(instrumental)

[Outro]
(instrumental)`;
  } else if (targetDurationSeconds <= 180) {
    structure = `[Intro]
(instrumental)

[Verse]
(instrumental)

[Chorus]
(instrumental)

[Verse]
(instrumental)

[Chorus]
(instrumental)

[Bridge]
(instrumental)

[Chorus]
(instrumental)

[Outro]
(instrumental)`;
  }

  const prompt = `${genre}${bpm} ${minutes} minutes\n\n${structure}`;
  return prompt;
}

const prompt = generateInstrumentalStructure(180, 'trap hip hop | 140 BPM');
console.log('='.repeat(70));
console.log('UPDATED PROMPT (with instrumental markers):');
console.log('='.repeat(70));
console.log(prompt);
console.log('='.repeat(70));
console.log(`Length: ${prompt.length} chars (was 99)`);
console.log(`Sections: ${prompt.split('\n').filter((s) => s.startsWith('[')).length}`);
