import OpenAI from 'openai';

const openai = new OpenAI();

const systemPrompt = `You are a CINEMATIC VIDEO PROMPT GENERATOR creating eye-catching, dynamic VEO video prompts.

## CRITICAL: PROMPT FORMAT (MUST FOLLOW EXACTLY)
Every prompt MUST start with CAMERA MOVEMENT in ALL CAPS, followed by a colon:
- "SLOW MOTION LOW ANGLE: Subject BURSTS into frame..."
- "WHIP PAN: Subject frozen mid-step, expression TRANSFORMS..."

## REQUIRED ELEMENTS:
1. **CAMERA MOVEMENT FIRST** (ALL CAPS): SLOW MOTION LOW ANGLE, WHIP PAN, PUSH IN, CRANE DOWN, EXTREME CLOSE-UP
2. **DYNAMIC VERBS IN CAPS**: BURSTS, EMERGES, SWIRLING, BLAZING, TRANSFORMS, CATCHING, STREAMING
3. **VISUAL ENERGY**: Light descriptors like "CATCHING light", "DANCING flames"
4. **END WITH 9:16**: Every prompt ends with "9:16" for vertical format

## EXAMPLE PROMPTS:
- "SLOW MOTION LOW ANGLE: Rolled carpet BURSTS open, CLEOPATRA VII emerges like striking cobra, gold dust SWIRLING in torchlight, kohl eyes BLAZING. 9:16"
- "WHIP PAN: JULIUS CAESAR frozen mid-step, jaw DROPPED, wine goblet SLIPPING from fingers, red wine SPLASHING. 9:16"

## FORBIDDEN:
- Generic prompts like "Epic shot of X doing Y"
- Prompts that don't start with CAMERA MOVEMENT
- Boring, static descriptions

Generate the most VISUALLY DYNAMIC prompt possible.`;

const userPrompt = `Generate a VEO video prompt for this scene:

HISTORICAL FIGURE: Genghis Khan (Temüjin) - Weathered Mongol warrior, broad shoulders, wispy gray beard, leather armor, wolf-fur collar

EVENT: Unification of the Mongol Tribes (1206) - raises ceremonial banner as warriors kneel

LOCATION: Vast Mongolian steppe at sunset
CAMERA: Slow crane up
LIGHTING: Golden sunset with dust particles

LYRICS: "From nothing I rose, a boy without a name / Now empires tremble, they'll remember my flame"

Return ONLY the VEO prompt text. Start with CAMERA MOVEMENT in CAPS, end with "9:16"`;

async function testOpenAI() {
  console.log('=== CALLING OPENAI... ===\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 300,
  });

  const result = response.choices[0].message.content;

  console.log('=== RAW OPENAI RESPONSE ===');
  console.log('---START---');
  console.log(result);
  console.log('---END---');
  console.log('\n=== ANALYSIS ===');
  console.log('Starts with CAPS camera?:', /^[A-Z\s]+:/.test(result || ''));
  console.log('Ends with 9:16?:', result?.trim().endsWith('9:16'));
}

testOpenAI().catch(console.error);
