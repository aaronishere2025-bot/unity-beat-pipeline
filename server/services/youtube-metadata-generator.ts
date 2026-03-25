/**
 * YouTube Metadata Generator Service
 *
 * Uses Gemini to generate optimized YouTube titles,
 * descriptions, tags, and thumbnail prompts based on video content and style.
 *
 * Integrates with Pattern Intelligence and Hook Templates for data-driven optimization.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Replicate from 'replicate';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

// Use Replicate for image generation (FLUX Schnell)
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Cache for hook templates (refresh every 10 minutes)
let hookTemplatesCache: { templates: any[]; fetchedAt: Date } | null = null;
const HOOK_CACHE_TTL_MS = 10 * 60 * 1000;

// Historical sources database - real academic sources for credibility
const HISTORICAL_SOURCES: Record<string, string[]> = {
  // Ancient World
  caesar: [
    'Suetonius, "The Twelve Caesars"',
    'Plutarch, "Parallel Lives"',
    'Adrian Goldsworthy, "Caesar: Life of a Colossus"',
  ],
  'julius caesar': [
    'Suetonius, "The Twelve Caesars"',
    'Plutarch, "Parallel Lives"',
    'Adrian Goldsworthy, "Caesar: Life of a Colossus"',
  ],
  cleopatra: ['Stacy Schiff, "Cleopatra: A Life"', 'Plutarch, "Life of Antony"', 'Cassius Dio, "Roman History"'],
  alexander: [
    'Arrian, "Anabasis of Alexander"',
    'Plutarch, "Life of Alexander"',
    'Robin Lane Fox, "Alexander the Great"',
  ],
  'alexander the great': [
    'Arrian, "Anabasis of Alexander"',
    'Plutarch, "Life of Alexander"',
    'Robin Lane Fox, "Alexander the Great"',
  ],
  augustus: ['Suetonius, "The Twelve Caesars"', 'Anthony Everitt, "Augustus"', 'Tacitus, "Annals"'],
  nero: ['Suetonius, "The Twelve Caesars"', 'Tacitus, "Annals"', 'Cassius Dio, "Roman History"'],
  hannibal: ['Polybius, "Histories"', 'Livy, "History of Rome"', 'Patrick N. Hunt, "Hannibal"'],
  spartacus: ['Plutarch, "Life of Crassus"', 'Appian, "Civil Wars"', 'Barry Strauss, "The Spartacus War"'],

  // Medieval
  'genghis khan': [
    'Jack Weatherford, "Genghis Khan and the Making of the Modern World"',
    'The Secret History of the Mongols',
    'Frank McLynn, "Genghis Khan: His Conquests, His Empire, His Legacy"',
  ],
  charlemagne: [
    'Einhard, "Life of Charlemagne"',
    'Rosamond McKitterick, "Charlemagne"',
    'Alessandro Barbero, "Charlemagne"',
  ],
  saladin: [
    'Stanley Lane-Poole, "Saladin and the Fall of the Kingdom of Jerusalem"',
    'Baha al-Din, "The Rare and Excellent History of Saladin"',
    'Anne-Marie Edde, "Saladin"',
  ],
  richard: ['John Gillingham, "Richard I"', 'Thomas Asbridge, "The Crusades"', 'Chronicles of the Third Crusade'],
  'joan of arc': [
    'Marina Warner, "Joan of Arc"',
    'Trial Records of Joan of Arc (1431)',
    'Regine Pernoud, "Joan of Arc"',
  ],
  'william the conqueror': [
    'David Bates, "William the Conqueror"',
    'The Anglo-Saxon Chronicle',
    'Marc Morris, "The Norman Conquest"',
  ],

  // Renaissance & Early Modern
  'leonardo da vinci': [
    'Walter Isaacson, "Leonardo da Vinci"',
    'Giorgio Vasari, "Lives of the Artists"',
    'Martin Kemp, "Leonardo"',
  ],
  machiavelli: [
    'Niccolo Machiavelli, "The Prince" (Primary Source)',
    'Miles J. Unger, "Machiavelli"',
    'Maurizio Viroli, "Niccolo\'s Smile"',
  ],
  'henry viii': ['Alison Weir, "Henry VIII"', 'David Starkey, "Six Wives"', 'Peter Ackroyd, "Tudors"'],
  elizabeth: ['Alison Weir, "Elizabeth the Queen"', 'Anne Somerset, "Elizabeth I"', 'John Guy, "Elizabeth"'],
  napoleon: ['Andrew Roberts, "Napoleon: A Life"', 'Adam Zamoyski, "Napoleon"', "Napoleon's Memoirs (Primary Source)"],

  // American History
  washington: [
    'Ron Chernow, "Washington: A Life"',
    'Joseph Ellis, "His Excellency"',
    'Library of Congress Washington Papers',
  ],
  'george washington': [
    'Ron Chernow, "Washington: A Life"',
    'Joseph Ellis, "His Excellency"',
    'Library of Congress Washington Papers',
  ],
  lincoln: [
    'Doris Kearns Goodwin, "Team of Rivals"',
    'David Herbert Donald, "Lincoln"',
    'Lincoln Papers, Library of Congress',
  ],
  'abraham lincoln': [
    'Doris Kearns Goodwin, "Team of Rivals"',
    'David Herbert Donald, "Lincoln"',
    'Lincoln Papers, Library of Congress',
  ],
  hamilton: [
    'Ron Chernow, "Alexander Hamilton"',
    'Federalist Papers (Primary Source)',
    'National Archives Hamilton Collection',
  ],
  jefferson: [
    'Jon Meacham, "Thomas Jefferson: The Art of Power"',
    'Jefferson Papers, Library of Congress',
    'Annette Gordon-Reed, "The Hemingses of Monticello"',
  ],
  'teddy roosevelt': [
    'Edmund Morris, "The Rise of Theodore Roosevelt"',
    'Doris Kearns Goodwin, "The Bully Pulpit"',
    'Theodore Roosevelt Center Archives',
  ],
  'theodore roosevelt': [
    'Edmund Morris, "The Rise of Theodore Roosevelt"',
    'Doris Kearns Goodwin, "The Bully Pulpit"',
    'Theodore Roosevelt Center Archives',
  ],

  // World War Era
  churchill: [
    'William Manchester, "The Last Lion"',
    'Andrew Roberts, "Churchill: Walking with Destiny"',
    'Churchill Archives Centre',
  ],
  'winston churchill': [
    'William Manchester, "The Last Lion"',
    'Andrew Roberts, "Churchill: Walking with Destiny"',
    'Churchill Archives Centre',
  ],
  hitler: [
    'Ian Kershaw, "Hitler"',
    'Richard J. Evans, "The Third Reich Trilogy"',
    'U.S. Holocaust Memorial Museum Archives',
  ],
  stalin: [
    'Stephen Kotkin, "Stalin"',
    'Robert Service, "Stalin: A Biography"',
    'Russian State Archive of Social and Political History',
  ],
  fdr: ['Jean Edward Smith, "FDR"', 'Doris Kearns Goodwin, "No Ordinary Time"', 'FDR Presidential Library'],
  'franklin roosevelt': [
    'Jean Edward Smith, "FDR"',
    'Doris Kearns Goodwin, "No Ordinary Time"',
    'FDR Presidential Library',
  ],
  eisenhower: [
    'Jean Edward Smith, "Eisenhower in War and Peace"',
    'Stephen Ambrose, "Supreme Commander"',
    'Eisenhower Presidential Library',
  ],
  patton: [
    'Carlo D\'Este, "Patton: A Genius for War"',
    'Martin Blumenson, "The Patton Papers"',
    'U.S. Army Center of Military History',
  ],

  // Scientists & Inventors
  tesla: [
    'W. Bernard Carlson, "Tesla: Inventor of the Electrical Age"',
    'Nikola Tesla, "My Inventions" (Autobiography)',
    'Smithsonian Institution Archives',
  ],
  'nikola tesla': [
    'W. Bernard Carlson, "Tesla: Inventor of the Electrical Age"',
    'Nikola Tesla, "My Inventions" (Autobiography)',
    'Smithsonian Institution Archives',
  ],
  edison: [
    'Edmund Morris, "Edison"',
    'Paul Israel, "Edison: A Life of Invention"',
    'Thomas Edison National Historical Park',
  ],
  einstein: [
    'Walter Isaacson, "Einstein: His Life and Universe"',
    'Albert Einstein Archives, Hebrew University',
    'American Institute of Physics',
  ],
  oppenheimer: [
    'Kai Bird & Martin Sherwin, "American Prometheus"',
    'Los Alamos National Laboratory Archives',
    'Atomic Heritage Foundation',
  ],
  darwin: [
    'Adrian Desmond & James Moore, "Darwin"',
    'Charles Darwin, "On the Origin of Species" (Primary)',
    'Cambridge University Darwin Correspondence',
  ],
  newton: ['James Gleick, "Isaac Newton"', 'Richard Westfall, "Never at Rest"', 'Cambridge University Newton Project'],

  // Civil Rights & Social Leaders
  mlk: [
    'Taylor Branch, "Parting the Waters"',
    'David Garrow, "Bearing the Cross"',
    'Martin Luther King Jr. Center Archives',
  ],
  'martin luther king': [
    'Taylor Branch, "Parting the Waters"',
    'David Garrow, "Bearing the Cross"',
    'Martin Luther King Jr. Center Archives',
  ],
  'malcolm x': [
    'Manning Marable, "Malcolm X: A Life of Reinvention"',
    'Malcolm X, "Autobiography" with Alex Haley',
    'Schomburg Center for Research in Black Culture',
  ],
  gandhi: [
    'Ramachandra Guha, "Gandhi: The Years That Changed the World"',
    'Gandhi Heritage Portal (Primary Sources)',
    'National Gandhi Museum Archives',
  ],
  mandela: [
    'Nelson Mandela, "Long Walk to Freedom" (Autobiography)',
    'Anthony Sampson, "Mandela"',
    'Nelson Mandela Foundation Archives',
  ],

  // Warriors & Military Leaders
  'sun tzu': [
    'Sun Tzu, "The Art of War" (Primary Source)',
    'Ralph D. Sawyer, "The Seven Military Classics"',
    'Victor H. Mair, "The Art of War: Sun Zi\'s Military Methods"',
  ],
  attila: [
    'Christopher Kelly, "The End of Empire: Attila the Hun"',
    'Priscus of Panium (Primary Source)',
    'Peter Heather, "The Fall of the Roman Empire"',
  ],
  viking: [
    'Neil Price, "Children of Ash and Elm"',
    'Snorri Sturluson, "Prose Edda" (Primary)',
    'National Museum of Denmark',
  ],
  samurai: [
    'Stephen Turnbull, "Samurai: The World of the Warrior"',
    'Hagakure (Primary Source)',
    'Tokyo National Museum',
  ],
  vlad: ['Radu Florescu, "Dracula: Prince of Many Faces"', 'Ottoman Court Records', 'Romanian National Archives'],

  // Default sources for general history
  default: ['Encyclopedia Britannica', 'Oxford Dictionary of National Biography', 'History.com Editorial Archives'],
};

function getHistoricalSources(topic: string): string[] {
  const lowerTopic = topic.toLowerCase();

  // Try exact match first
  for (const [key, sources] of Object.entries(HISTORICAL_SOURCES)) {
    if (lowerTopic.includes(key)) {
      return sources;
    }
  }

  // Return default sources if no match
  return HISTORICAL_SOURCES['default'];
}

// Banned words that should never appear in YouTube titles (content policy)
const BANNED_TITLE_WORDS = ['nazi', 'nazis'];

// Sanitize title by removing banned words (case-insensitive)
function sanitizeTitleBannedWords(title: string): string {
  let sanitized = title;
  for (const word of BANNED_TITLE_WORDS) {
    // Match whole word, case-insensitive
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    sanitized = sanitized.replace(regex, '').replace(/\s+/g, ' ').trim();
  }
  return sanitized;
}

function generateHistoricalContextSection(topic: string): string {
  const sources = getHistoricalSources(topic);
  const selectedSources = sources.slice(0, 3);

  return `
---
HISTORICAL CONTEXT
This video presents a creative interpretation of historical events. 
For accurate historical information, we recommend these scholarly sources:

References:
${selectedSources.map((s, i) => `${i + 1}. ${s}`).join('\n')}

This content is created for educational entertainment. While we strive for historical accuracy, 
some elements are dramatized for storytelling purposes.
---`;
}

async function getHookTemplates(): Promise<{ template: string; category: string; confidence: number }[]> {
  try {
    // Check cache
    if (hookTemplatesCache && Date.now() - hookTemplatesCache.fetchedAt.getTime() < HOOK_CACHE_TTL_MS) {
      return hookTemplatesCache.templates;
    }

    // Fetch from metrics harvesting service
    const { metricsHarvestingService } = await import('./metrics-harvesting-service');
    const templates = await metricsHarvestingService.getActiveHookTemplates();

    hookTemplatesCache = { templates, fetchedAt: new Date() };
    return templates;
  } catch (error) {
    console.warn('Failed to fetch hook templates:', error);
    return [];
  }
}

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  thumbnailPrompt: string;
  categoryId: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
}

export interface VideoContentInfo {
  jobName: string;
  mode: string;
  aspectRatio: string;
  unityMetadata?: {
    topic?: string;
    vibe?: string;
    character1?: { type?: string; name?: string };
    character2?: { type?: string; name?: string };
    style?: string;
    battleType?: string;
    lyrics?: string;
  };
  duration?: number;
  generatedClipsCount?: number;
}

class YouTubeMetadataGenerator {
  /**
   * Generate metadata specifically for music mode (type beats, lofi, etc.)
   */
  private async generateMusicMetadata(videoInfo: VideoContentInfo): Promise<YouTubeMetadata> {
    const { jobName, unityMetadata } = videoInfo;
    const style = (unityMetadata as any)?.musicStyle || '';
    const isLofi = /lofi|chill.*study|study.*beats/i.test(jobName) || /lofi/i.test(style);
    const isTrap = /trap/i.test(jobName) || /trap/i.test(style);

    // Determine artist type based on style
    let artistType = 'Future';
    let beatName = 'Vibrant';

    if (isTrap && style) {
      // Check for specific patterns - more specific patterns first
      if (/ambient|ethereal|reverb|rage/i.test(style)) {
        artistType = 'Playboi Carti';
        beatName = 'Ethereal';
      } else if (/vibrant|bouncy|colorful|party|uplifting/i.test(style)) {
        artistType = 'Future';
        beatName = 'Vibrant';
      } else if (/soul|soulful|introspective/i.test(style)) {
        artistType = 'Rod Wave';
        beatName = 'Soulful';
      } else if (/chill.*trap|atmospheric.*synth|spacey|travis/i.test(style)) {
        artistType = 'Travis Scott';
        beatName = 'Astro';
      } else if (/melodic|emotional.*piano|lil.*durk/i.test(style)) {
        artistType = 'Lil Durk';
        beatName = 'Dreams';
      } else if (/dreamy|smooth.*808/i.test(style)) {
        // Generic melodic trap - default to popular artists
        const artists = ['Lil Durk', 'Travis Scott', 'Future'];
        artistType = artists[Math.floor(Math.random() * artists.length)];
        beatName = artistType === 'Lil Durk' ? 'Dreams' : artistType === 'Travis Scott' ? 'Astro' : 'Vibrant';
      }
    }

    // Extract BPM from style if available
    const bpmMatch = style.match(/(\d{2,3})\s*BPM/i);
    const bpm = bpmMatch ? bpmMatch[1] : '140';

    let title, description, tags;

    if (isLofi) {
      // Lofi study beats format — varied titles
      const duration = Math.floor((videoInfo.duration || 1800) / 60);
      const year = new Date().getFullYear();
      const lofiTitles = [
        `${duration} Minutes Chill Lofi Beats to Study/Relax 📚 Lofi Hip Hop Mix ${year}`,
        `☕ ${duration} Min Lofi Jazz Beats for Deep Focus | Study Music ${year}`,
        `🌙 Late Night Lofi | ${duration} Minutes of Chill Study Beats`,
        `📚 Lofi Study Session — ${duration} Min Chill Hip Hop Mix`,
        `🎧 ${duration} Minutes Lofi Beats | Relax, Study, Chill ${year}`,
        `🌧️ Rainy Day Lofi | ${duration} Min Chill Beats to Study To`,
        `✨ ${duration} Min Lofi Mix — Smooth Beats for Focus & Flow`,
        `🍃 Peaceful Lofi Beats | ${duration} Minutes Study & Relax Mix`,
        `🎹 Jazzy Lofi Hip Hop | ${duration} Min Chill Study Beats ${year}`,
        `🌌 ${duration} Minutes Ambient Lofi | Deep Focus Study Music`,
      ];
      title = lofiTitles[Math.floor(Math.random() * lofiTitles.length)];

      description = `${Math.floor((videoInfo.duration || 1800) / 60)} minutes of chill lofi hip hop beats perfect for studying, working, or relaxing.

🎧 Continuous lofi mix with smooth rhodes piano, jazzy bass, and dusty drums
📚 Perfect background music for focus and concentration
☕ Late night study vibes

Perfect for:
✓ Studying
✓ Working from home
✓ Reading
✓ Relaxing
✓ Creative work
✓ Meditation

🤖 100% AI Generated Music

#lofi #lofihiphop #studymusic #chillbeats #lofibeats #studybeats #chillmusic #relaxingmusic #focusmusic #lofimusic #studywithme #ambientmusic #jazzhiphop #chillhop #lofi${new Date().getFullYear()}

---
Subscribe for daily lofi beats! 🔔
Like if this helps you focus! 👍`;

      tags = [
        'lofi',
        'lofi hip hop',
        'study music',
        'chill beats',
        'relaxing music',
        'focus music',
        'study beats',
        `lofi ${new Date().getFullYear()}`,
        'chill music',
        'work music',
      ];
    } else {
      // Type beat format
      title = `🔥 ${artistType} Type Beat - "${beatName}" | ${isTrap ? 'Trap' : 'Hip Hop'} Instrumental ${new Date().getFullYear()}`;

      description = `🔥 ${artistType} Type Beat - "${beatName}"

${bpm} BPM | ${isTrap ? 'Trap' : 'Hip Hop'} Beat

${style.replace(/\d+\s*BPM,?\s*/i, '').trim()}

Perfect for artists looking for that ${artistType} sound.

💰 BUY THIS BEAT (Untagged):
[Your BeatStars/Airbit link]

📧 Contact: [Your email]

🤖 100% AI Generated Music

#typebeat #${artistType.toLowerCase().replace(/\s+/g, '')}typebeat #trapbeat #instrumental #beatsforsale #typebeat${new Date().getFullYear()} #rapbeat #freebeat #${isTrap ? 'trap' : 'hiphop'}instrumental

---
Free for non-profit use with credit
Purchase for commercial use

© ${new Date().getFullYear()} All rights reserved.`;

      tags = [
        'type beat',
        `${artistType.toLowerCase()} type beat`,
        'trap beat',
        'instrumental',
        'rap beat',
        'beats for sale',
        'free beat',
        `type beat ${new Date().getFullYear()}`,
      ];
    }

    return {
      title,
      description,
      tags,
      thumbnailPrompt: isLofi
        ? 'Cozy study setup with laptop, coffee cup, plants, warm lighting, lofi aesthetic'
        : `Dark studio with neon lights, 808 bass visualization, ${artistType} style artwork`,
      categoryId: '10', // Music
      privacyStatus: 'private',
    };
  }

  async generateMetadata(videoInfo: VideoContentInfo): Promise<YouTubeMetadata> {
    // Route to music-specific metadata generation for music mode
    if (videoInfo.mode === 'music') {
      return this.generateMusicMetadata(videoInfo);
    }

    try {
      const prompt = await this.buildPromptWithHooks(videoInfo);

      const sysPrompt = `You are a YouTube SEO expert for a HISTORY CHANNEL. You create titles about REAL HISTORICAL FIGURES AND EVENTS.

Your responses must be in valid JSON format with these exact fields:
- title: History-focused title featuring the ACTUAL HISTORICAL FIGURE (under 100 chars, include 1-2 emojis)
- description: Educational description with historical context, hashtags, and call-to-action (under 5000 chars)
- tags: Array of 15-25 relevant tags including historical keywords
- thumbnailPrompt: Detailed image generation prompt for a compelling historical thumbnail
- categoryId: "27" (Education) or "22" (People & Blogs)
- privacyStatus: "private" (for initial upload safety)

**CRITICAL RULES:**
1. NEVER use "AI vs" in titles - this is NOT about AI, it's about HISTORY
2. NEVER compare random unrelated figures (e.g., "Shakespeare vs Tupac" is WRONG)
3. ALWAYS use the EXACT historical figure name provided (e.g., "Spartacus", "Cleopatra", "George Washington")
4. Titles should focus on the HISTORICAL EVENT or STORY, not generic clickbait
5. If topic is Christmas-related (Befana, Krampus, Santa, etc.), include Christmas/holiday theme
6. This is a DOCUMENTARY/HISTORY channel - treat content seriously

GOOD EXAMPLES:
- "Spartacus: The Slave Who Shook Rome ⚔️ Epic True Story"
- "Cleopatra's Final Days 👑 The Queen's Last Stand"
- "Befana: Italy's Christmas Witch 🎄 The Legend"
- "Krampus: The Dark Side of Christmas 🎅 Alpine Terror"

BAD EXAMPLES (NEVER DO THIS):
- "AI vs History" ❌
- "AI vs Human Creativity" ❌
- "Shakespeare vs Tupac" ❌
- "Napoleon vs Alexander" (unless the video is ACTUALLY about both) ❌`;

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
        systemInstruction: sysPrompt,
      });
      const result = await model.generateContent(prompt);
      const content = result.response.text();
      if (!content) {
        throw new Error('No response from Gemini');
      }

      const metadata = JSON.parse(content) as YouTubeMetadata;

      // Ensure privacy is always private for safety
      metadata.privacyStatus = 'private';

      // Validate, sanitize banned words, and clean up
      const rawTitle = metadata.title?.substring(0, 100) || this.generateFallbackTitle(videoInfo);
      metadata.title = sanitizeTitleBannedWords(rawTitle);
      metadata.tags = (metadata.tags || []).slice(0, 30);
      metadata.thumbnailPrompt = metadata.thumbnailPrompt || this.generateFallbackThumbnailPrompt(videoInfo);
      metadata.categoryId = metadata.categoryId || '10';

      // Always append Historical Context with real sources to description
      const topic = videoInfo.unityMetadata?.topic || videoInfo.jobName || 'Historical Figure';
      const historicalContext = generateHistoricalContextSection(topic);
      const baseDescription = metadata.description || this.generateFallbackDescription(videoInfo);
      metadata.description = (baseDescription + historicalContext).substring(0, 5000);

      console.log('✅ Generated YouTube metadata:', metadata.title);
      console.log('📚 Added historical sources for:', topic);
      return metadata;
    } catch (error: any) {
      console.error('Failed to generate YouTube metadata:', error.message);
      return this.generateFallbackMetadata(videoInfo);
    }
  }

  private async buildPromptWithHooks(videoInfo: VideoContentInfo): Promise<string> {
    const { jobName, mode, aspectRatio, unityMetadata, duration, generatedClipsCount } = videoInfo;

    // VIRAL HOOK: Discover the "One Thing Nobody Knows" about this topic
    const topic = unityMetadata?.topic || jobName?.replace(' - Unity Kling', '') || 'Historical Figure';
    let unknownFactGuidance = '';
    try {
      const { factReconciliationService } = await import('./fact-reconciliation-service');
      const unknownFacts = await factReconciliationService.discoverUnknownFacts(topic);

      if (unknownFacts.unknownFact && unknownFacts.unknownFact !== 'Unknown fact not discovered') {
        unknownFactGuidance = `

**🔮 VIRAL HOOK - "The One Thing Nobody Knows":**
UNKNOWN FACT: ${unknownFacts.unknownFact}
HOOK ANGLE: ${unknownFacts.hookAngle}
EMOTIONAL TRIGGER: ${unknownFacts.emotionalTrigger}
CURIOSITY GAP: ${unknownFacts.curiosityGap}

USE THIS UNKNOWN FACT to create a title that makes people STOP scrolling!
The title should HINT at this fact without giving it all away.`;
        console.log(`   🔮 Injected Unknown Fact hook for: ${topic}`);
      }
    } catch (err: any) {
      console.log(`   ⚠️ Could not fetch unknown facts: ${err.message}`);
    }

    // Fetch hook templates for data-driven title generation
    const hookTemplates = await getHookTemplates();
    let hookGuidance = '';

    if (hookTemplates.length > 0) {
      console.log(`\n📊 ANALYTICS FEEDBACK INJECTION:`);
      console.log(`   🪝 Hook templates found: ${hookTemplates.length}`);
      hookTemplates.slice(0, 5).forEach((t, i) => {
        console.log(`      ${i + 1}. "${t.template}" (${t.category}, ${(t.confidence * 100).toFixed(0)}% conf)`);
      });
      hookGuidance = `

**PROVEN TITLE FORMULAS (from top-performing videos):**
Use one of these validated title patterns:
${hookTemplates
  .slice(0, 5)
  .map((t) => `- ${t.template} (${t.category}, ${(t.confidence * 100).toFixed(0)}% confidence)`)
  .join('\n')}

Adapt these templates to fit the video content. Fill in placeholders with relevant names/topics.`;
      console.log(`   ✅ Injecting ${hookGuidance.length} chars of pattern guidance into GPT prompt`);
    } else {
      console.log(`\n📊 ANALYTICS FEEDBACK: No hook templates found - using default prompting`);
    }

    let prompt = `Generate YouTube metadata for this AI-generated video:

**Video Title:** ${jobName}
**Mode:** ${mode === 'unity_kling' ? 'Unity Kling' : mode === 'veo' ? 'Kling AI' : 'Consistent Character Animation'}
**Aspect Ratio:** ${aspectRatio} (${aspectRatio === '9:16' ? 'YouTube Shorts/TikTok vertical' : 'Standard YouTube horizontal'})
**Duration:** ${duration ? `${Math.round(duration / 60)} minutes` : 'Short-form content'}
**Clips:** ${generatedClipsCount || 'Multiple'} AI-generated scenes`;

    if (unityMetadata) {
      const mainFigure = unityMetadata.topic || unityMetadata.character1?.name || 'Historical Figure';
      const secondFigure = unityMetadata.character2?.name || unityMetadata.character2?.type;

      prompt += `

**Content Details:**
- MAIN HISTORICAL FIGURE: ${mainFigure} (USE THIS NAME IN THE TITLE!)
${secondFigure ? `- Secondary Figure: ${secondFigure}` : '- Format: Solo Historical Rap'}
- Vibe: ${unityMetadata.vibe || 'Energetic'}
- Content Type: ${unityMetadata.battleType || 'Historical Rap'}
- Visual Style: ${unityMetadata.style || 'Cinematic'}
${(unityMetadata as any).hook ? `- Hook/Angle: ${(unityMetadata as any).hook}` : ''}
${(unityMetadata as any).story ? `- THE SPECIFIC STORY: ${(unityMetadata as any).story}` : ''}

**CRITICAL TITLE REQUIREMENTS:**
1. The title MUST include "${mainFigure}" - this is the main subject
2. The title MUST reference the SPECIFIC STORY or EVENT - not just the person's name
   - BAD: "Cleopatra's Epic Rap 🔥" (too generic)
   - GOOD: "Cleopatra's Secret Affair with Caesar 🔥 The Forbidden Romance" (specific story)
   - BAD: "Vikings Rap Battle ⚔️" (too generic)  
   - GOOD: "Vikings Raid Lindisfarne 793 AD ⚔️ The Attack That Changed History" (specific event)
3. Include the KEY DRAMATIC MOMENT or historical event that makes this video unique`;

      if (unityMetadata.lyrics && typeof unityMetadata.lyrics === 'string') {
        const lyricsPreview = unityMetadata.lyrics.substring(0, 500);
        prompt += `

**Lyrics Preview:**
${lyricsPreview}...`;
      }
    }

    prompt += `
${unknownFactGuidance}
${hookGuidance}

**Requirements:**
1. Title MUST be story-specific with emojis (🔥💥⚔️ etc)
   - MUST mention the SPECIFIC historical event, battle, scandal, or moment - NOT just the person's name
   - If PROVEN TITLE FORMULAS are provided above, prefer adapting one of those patterns
   - Fill in [FIGURE], [OPPONENT], [DRAMATIC_MOMENT] placeholders with actual content from THE SPECIFIC STORY above
2. Description should include:
   - Hook in first 2 lines
   - Brief content summary
   - "Made with AI" disclosure
   - Relevant hashtags (#AIGenerated #Shorts etc)
   - Call to action (like, subscribe, comment)
   - **IMPORTANT: Include a "HISTORICAL CONTEXT" section at the end with 2-3 real scholarly references**
3. Tags should include: AI generated, ${aspectRatio === '9:16' ? 'shorts, vertical video' : 'music video'}, rap battle, animation
4. Thumbnail prompt should create a STRIKING visual with:
   - Bold contrasting colors
   - Dynamic action pose
   - Space for text overlay
   - Eye-catching composition`;

    return prompt;
  }

  private generateFallbackTitle(videoInfo: VideoContentInfo): string {
    const topic = videoInfo.unityMetadata?.topic || videoInfo.jobName?.replace(' - Unity VEO', '') || 'Epic Battle';
    return `🔥 ${topic} | AI Rap Battle #Shorts`;
  }

  private generateFallbackDescription(videoInfo: VideoContentInfo): string {
    const topic = videoInfo.unityMetadata?.topic || videoInfo.jobName || 'Epic Content';
    const sources = getHistoricalSources(topic);
    const selectedSources = sources.slice(0, 3);

    return `${topic} - An AI-generated rap battle experience!

🎵 Music: 100% AI Generated
🎬 Video: 100% AI Generated
🤖 Fully AI Created

#AIGenerated #RapBattle #Shorts #Animation #AIArt #History #Educational

---
Like and subscribe for more AI content!
Comment below: Who won this battle? 👇

---
HISTORICAL CONTEXT
This video presents a creative interpretation of historical events.
For accurate historical information, we recommend these scholarly sources:

References:
${selectedSources.map((s, i) => `${i + 1}. ${s}`).join('\n')}

This content is created for educational entertainment.`;
  }

  private generateFallbackThumbnailPrompt(videoInfo: VideoContentInfo): string {
    const char1 = videoInfo.unityMetadata?.character1?.name || 'warrior';
    const char2 = videoInfo.unityMetadata?.character2?.name || 'challenger';

    return `Epic battle thumbnail showing ${char1} vs ${char2}, dramatic lightning background, bold "VS" text in center, intense expressions, vibrant neon colors, cinematic lighting, professional YouTube thumbnail style, 1280x720, high contrast, action poses, dynamic composition`;
  }

  private generateFallbackMetadata(videoInfo: VideoContentInfo): YouTubeMetadata {
    return {
      title: this.generateFallbackTitle(videoInfo),
      description: this.generateFallbackDescription(videoInfo),
      tags: [
        'AI Generated',
        'Rap Battle',
        'Shorts',
        'Animation',
        'AI Art',
        'Music Video',
        'VEO',
        'Suno',
        'AI Music',
        'Viral',
        'Epic Battle',
        'AI Animation',
      ],
      thumbnailPrompt: this.generateFallbackThumbnailPrompt(videoInfo),
      categoryId: '10',
      privacyStatus: 'private',
    };
  }

  async generateThumbnail(prompt: string): Promise<string | null> {
    try {
      // Use FLUX Schnell on Replicate for fast, high-quality thumbnails
      const enhancedPrompt = `YouTube thumbnail: ${prompt}. Make it eye-catching, professional, and optimized for click-through rate. Include bold colors and dramatic composition. Photorealistic, cinematic lighting, 16:9 aspect ratio, no text. IMPORTANT: Adults only - no children, no babies, no young people under 18. Only mature adult historical figures.`;

      const output = (await replicate.run('black-forest-labs/flux-schnell', {
        input: {
          prompt: enhancedPrompt,
          num_outputs: 1,
          aspect_ratio: '16:9',
          output_format: 'webp',
          output_quality: 90,
        },
      })) as string[];

      const imageUrl = output?.[0];
      if (imageUrl) {
        console.log('✅ Generated YouTube thumbnail (FLUX)');
        return imageUrl;
      }
      return null;
    } catch (error: any) {
      console.error('Failed to generate thumbnail:', error.message);
      return null;
    }
  }

  /**
   * Generate a historical figure thumbnail with era-appropriate background
   * @param topic - The historical topic (e.g., "The Tudor Dynasty", "Oppenheimer and the Manhattan Project")
   * @param character1Name - Primary historical figure name
   * @param character2Name - Optional secondary figure
   * @returns URL of generated thumbnail image
   */
  async generateHistoricalThumbnail(
    topic: string,
    character1Name?: string,
    character2Name?: string,
    style?: 'dramatic' | 'action',
  ): Promise<string | null> {
    try {
      // Different prompt styles for A/B testing
      const styleInstructions =
        style === 'action'
          ? `Focus on an ACTION SCENE showing the historical figure in their most famous moment:
- Full body or medium shot showing dynamic pose or movement
- Show them DOING something iconic (leading troops, giving speech, in battle, etc.)
- Include supporting elements (soldiers, crowds, weapons, vehicles) that tell the story
- Epic wide-angle cinematic composition
- Vibrant, high-energy atmosphere`
          : `Focus on a DRAMATIC CLOSE-UP portrait:
- Close-up of face (fills 50-70% of frame) with intense, piercing eyes staring at viewer
- Moody, atmospheric lighting with strong rim lighting
- Dark, blurred background with subtle era-appropriate elements
- Intimate, powerful expression that draws viewer in
- High contrast, film noir style composition`;

      // First, use Gemini to create a detailed, era-appropriate thumbnail prompt
      const thumbSysPrompt = `You are an expert at creating image prompts for YouTube thumbnails featuring historical figures.

Your task is to create a detailed image generation prompt that will produce a striking, click-worthy thumbnail showing:
1. ${style === 'action' ? 'An epic action scene' : 'A dramatic close-up portrait'} of the main historical figure
2. An era-appropriate background that represents their time period
3. Professional YouTube thumbnail composition (bold, high contrast, eye-catching)

IMPORTANT RULES:
${styleInstructions}
- Use period-accurate clothing, accessories, and setting elements
- Include dramatic lighting that fits the era (candlelight for medieval, atomic glow for nuclear age, etc.)
- Make it look like a professional documentary or history channel thumbnail
- Include atmospheric elements (smoke, fire, flags, architecture) appropriate to the era
- DO NOT include any text in the image
- ADULTS ONLY: Never include children, babies, or young people under 18. Only mature adult historical figures. This is critical for click-through rate.

Respond with ONLY the image generation prompt, nothing else.`;

      const thumbModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.8, maxOutputTokens: 500 },
        systemInstruction: thumbSysPrompt,
      });
      const thumbResult =
        await thumbModel.generateContent(`Create a ${style === 'action' ? 'ACTION-FOCUSED' : 'PORTRAIT-FOCUSED'} YouTube thumbnail prompt for a historical rap video about: "${topic}"

Main historical figure: ${character1Name || 'the main figure from this topic'}
${character2Name ? `Secondary figure: ${character2Name}` : ''}

The thumbnail should ${style === 'action' ? 'show them in action during their most iconic moment' : 'prominently feature their face with dramatic expression'}.`);

      const thumbnailPrompt = thumbResult.response.text();
      if (!thumbnailPrompt) {
        throw new Error('No prompt generated');
      }

      console.log(`🎨 Generated historical thumbnail prompt for "${topic}"`);
      console.log(`   Prompt: ${thumbnailPrompt.substring(0, 100)}...`);

      // Generate the thumbnail image using FLUX Schnell on Replicate
      const fullPrompt = `${thumbnailPrompt} Technical requirements: Professional YouTube thumbnail style, 16:9 aspect ratio composition, ultra high detail, photorealistic oil painting style, dramatic cinematic lighting, museum-quality historical portrait, no text or watermarks.`;

      const output = (await replicate.run('black-forest-labs/flux-schnell', {
        input: {
          prompt: fullPrompt,
          num_outputs: 1,
          aspect_ratio: '16:9',
          output_format: 'webp',
          output_quality: 90,
        },
      })) as string[];

      const imageUrl = output?.[0];
      if (imageUrl) {
        console.log(`✅ Generated historical thumbnail for "${topic}" (FLUX)`);
        return imageUrl;
      }
      return null;
    } catch (error: any) {
      console.error('Failed to generate historical thumbnail:', error.message);
      // No fallback - return null to indicate failure
      return null;
    }
  }

  /**
   * Download a thumbnail from URL to a local file
   * @param imageUrl - URL of the image to download
   * @param outputPath - Local file path to save the image
   */
  async downloadThumbnail(imageUrl: string, outputPath: string): Promise<boolean> {
    try {
      const { writeFileSync, mkdirSync, existsSync } = await import('fs');
      const { dirname } = await import('path');

      // Ensure directory exists
      const dir = dirname(outputPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Download the image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      writeFileSync(outputPath, buffer);
      console.log(`✅ Downloaded thumbnail to ${outputPath}`);
      return true;
    } catch (error: any) {
      console.error('Failed to download thumbnail:', error.message);
      return false;
    }
  }
}

export const youtubeMetadataGenerator = new YouTubeMetadataGenerator();
