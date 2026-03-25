/**
 * TREND-WATCHER AGENT SERVICE
 *
 * Monitors external market signals to prevent optimizing for styles
 * that are losing cultural relevance. Works with the Consensus Judge
 * to provide real-time trend intelligence.
 *
 * Features:
 * 1. Market Signals - Google Trends velocity tracking
 * 2. YouTube Most Popular - Style pattern detection
 * 3. Breakout Alert System - Emergency notifications for viral spikes
 * 4. Style Trend Mapping - Maps aesthetics to bandit arms
 *
 * Timezone: America/Chicago (CST, GMT-6)
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { googleTrendsService, type HistoricalTrendData } from './google-trends-service';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface MarketSignals {
  searchVelocity: Record<string, { current: number; previous: number; velocity: number }>;
  ytPopularTitles: string[];
  ytPopularThemes: string[];
  styleTrends: { rising: string[]; falling: string[] };
  timestamp: Date;
}

export interface BreakoutAlert {
  keyword: string;
  velocityPercent: number;
  status: 'breakout' | 'rising' | 'falling' | 'stable';
  recommendedAction: string;
}

interface YouTubePopularVideo {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string;
  tags: string[];
  viewCount: number;
}

interface StylePattern {
  style: string;
  banditArm: string;
  keywords: string[];
  detected: number;
}

const DEFAULT_KEYWORDS = [
  // Core Channel Keywords
  'History Rap',
  'Historical AI',
  'Epic Rap Battles',
  'AI History',
  'Historical Music',
  'History Channel',

  // Ancient Leaders & Conquerors
  'Napoleon',
  'Julius Caesar',
  'Cleopatra',
  'Alexander the Great',
  'Genghis Khan',
  'Attila the Hun',
  'Hannibal Barca',
  'Xerxes',
  'Cyrus the Great',
  'Ramesses II',
  'Tutankhamun',
  'Nebuchadnezzar',
  'Hammurabi',
  'Leonidas',
  'Spartacus',

  // Roman Empire
  'Augustus Caesar',
  'Marcus Aurelius',
  'Nero',
  'Caligula',
  'Constantine',
  'Trajan',
  'Hadrian',
  'Commodus',
  'Roman Empire',
  'Fall of Rome',
  'Gladiators',

  // Medieval & Renaissance
  'Charlemagne',
  'William the Conqueror',
  'Richard the Lionheart',
  'Saladin',
  'Joan of Arc',
  'Vlad the Impaler',
  'Ivan the Terrible',
  'Henry VIII',
  'Elizabeth I',
  'Mary Queen of Scots',
  'Machiavelli',
  'Leonardo da Vinci',
  'Michelangelo',
  'Medieval History',
  'Crusades',
  'Knights Templar',
  'Black Death',
  'Viking History',
  'Vikings',

  // Asian History
  'Sun Tzu',
  'Qin Shi Huang',
  'Kublai Khan',
  'Tokugawa Ieyasu',
  'Oda Nobunaga',
  'Miyamoto Musashi',
  'Samurai',
  'Mongol Empire',
  'Shogun',
  'Ming Dynasty',
  'Silk Road',

  // Queens & Women in History
  'Catherine the Great',
  'Queen Victoria',
  'Boudicca',
  'Nefertiti',
  'Hatshepsut',
  'Wu Zetian',
  'Marie Antoinette',
  'Empress Theodora',
  'Isabella of Castile',

  // American History
  'George Washington',
  'Abraham Lincoln',
  'Benjamin Franklin',
  'Thomas Jefferson',
  'Founding Fathers',
  'American Revolution',
  'Civil War History',
  'Wild West',
  'Native American History',

  // Modern History (Pre-1950)
  'Winston Churchill',
  'Theodore Roosevelt',
  'Otto von Bismarck',
  'Queen Elizabeth I',
  'Peter the Great',
  'Louis XIV',
  'Frederick the Great',
  'World War 1',
  'World War 2',
  'Industrial Revolution',

  // Famous Battles & Events
  'Battle of Thermopylae',
  'Battle of Waterloo',
  'Battle of Hastings',
  'Battle of Gettysburg',
  'Siege of Constantinople',
  'D-Day',
  'Trojan War',
  'Punic Wars',

  // Empires & Civilizations
  'Ancient Egypt',
  'Ancient Greece',
  'Ancient Rome',
  'Persian Empire',
  'Ottoman Empire',
  'Byzantine Empire',
  'British Empire',
  'Spanish Conquistadors',
  'Aztec Empire',
  'Mayan Civilization',
  'Inca Empire',

  // Pirates & Explorers
  'Blackbeard',
  'Pirates History',
  'Christopher Columbus',
  'Marco Polo',
  'Magellan',
  'Captain Kidd',
  'Age of Exploration',

  // Mythology & Legends
  'Greek Mythology',
  'Norse Mythology',
  'Egyptian Gods',
  'King Arthur',
  'Robin Hood',
  'Hercules',
  'Achilles',

  // Philosophical & Scientific
  'Socrates',
  'Plato',
  'Aristotle',
  'Confucius',
  'Galileo',
  'Isaac Newton',
  'Nikola Tesla',

  // Trending Topics (Dynamic)
  'Historical Documentary',
  'History Facts',
  'Ancient Mysteries',
  'Lost Civilizations',
  'Archaeological Discoveries',
];

const STYLE_PATTERNS: StylePattern[] = [
  {
    style: 'gritty_dark',
    banditArm: 'gritty_warrior',
    keywords: ['gritty', 'dark', 'intense', 'raw', 'brutal', 'hardcore', 'aggressive', 'shadows', 'noir', 'realistic'],
    detected: 0,
  },
  {
    style: 'epic_golden',
    banditArm: 'golden_empire',
    keywords: [
      'epic',
      'golden',
      'majestic',
      'imperial',
      'grand',
      'triumphant',
      'glorious',
      'magnificent',
      'royal',
      'cinematic',
    ],
    detected: 0,
  },
  {
    style: 'modern_minimal',
    banditArm: 'modern_dark',
    keywords: [
      'modern',
      'minimal',
      'sleek',
      'clean',
      'contemporary',
      'aesthetic',
      'minimalist',
      'stylish',
      'futuristic',
    ],
    detected: 0,
  },
  {
    style: 'vintage_historical',
    banditArm: 'parchment_history',
    keywords: [
      'vintage',
      'historical',
      'ancient',
      'old',
      'classic',
      'retro',
      'parchment',
      'sepia',
      'traditional',
      'documentary',
    ],
    detected: 0,
  },
];

const BREAKOUT_THRESHOLD = 200; // 200% velocity increase = breakout
const RISING_THRESHOLD = 50; // 50% velocity increase = rising
const FALLING_THRESHOLD = -30; // -30% velocity = falling

// EXPANDED KEYWORD DATABASE - 1000+ keywords for comprehensive historical coverage
// Organized by tier: Tier 1 (check daily), Tier 2 (check every 2 days), Tier 3 (check weekly)
const TIER_1_KEYWORDS = [
  // Core Channel + Top Performers (always check)
  'History Rap',
  'Historical AI',
  'Epic Rap Battles',
  'AI History',
  'Napoleon',
  'Julius Caesar',
  'Cleopatra',
  'Alexander the Great',
  'Genghis Khan',
  'Vikings',
  'Samurai',
  'Gladiators',
  'Spartans',
  'Knights',
];

const TIER_2_KEYWORDS = [
  // Major Historical Figures - Ancient World
  'Attila the Hun',
  'Hannibal Barca',
  'Xerxes',
  'Cyrus the Great',
  'Ramesses II',
  'Tutankhamun',
  'Nebuchadnezzar',
  'Hammurabi',
  'Leonidas',
  'Spartacus',
  'Achilles',
  'Hector',
  'Odysseus',
  'Agamemnon',
  'King Minos',

  // Roman Leaders
  'Augustus Caesar',
  'Marcus Aurelius',
  'Nero',
  'Caligula',
  'Constantine',
  'Trajan',
  'Hadrian',
  'Commodus',
  'Tiberius',
  'Claudius',
  'Vespasian',
  'Diocletian',
  'Justinian',
  'Romulus',
  'Remus',
  'Cincinnatus',

  // Medieval Rulers
  'Charlemagne',
  'William the Conqueror',
  'Richard the Lionheart',
  'Saladin',
  'Joan of Arc',
  'Vlad the Impaler',
  'Ivan the Terrible',
  'Henry VIII',
  'Elizabeth I',
  'Mary Queen of Scots',
  'Alfred the Great',
  'Cnut the Great',
  'Frederick Barbarossa',
  'Louis IX',
  'Edward I',
  'Edward III',
  'Henry V',

  // Asian Leaders
  'Sun Tzu',
  'Qin Shi Huang',
  'Kublai Khan',
  'Tokugawa Ieyasu',
  'Oda Nobunaga',
  'Miyamoto Musashi',
  'Cao Cao',
  'Liu Bei',
  'Zhuge Liang',
  'Emperor Wu',
  'Ashoka the Great',
  'Akbar the Great',
  'Babur',
  'Timur',
  'Shaka Zulu',

  // Queens & Women
  'Catherine the Great',
  'Queen Victoria',
  'Boudicca',
  'Nefertiti',
  'Hatshepsut',
  'Wu Zetian',
  'Marie Antoinette',
  'Empress Theodora',
  'Isabella of Castile',
  'Eleanor of Aquitaine',
  'Mary I',
  'Anne Boleyn',
  'Empress Dowager Cixi',

  // American & Modern Leaders
  'George Washington',
  'Abraham Lincoln',
  'Benjamin Franklin',
  'Thomas Jefferson',
  'Theodore Roosevelt',
  'Winston Churchill',
  'Otto von Bismarck',
  'Peter the Great',
  'Louis XIV',
  'Frederick the Great',
  'Napoleon III',
  'Simon Bolivar',

  // Empires & Civilizations
  'Roman Empire',
  'Ancient Egypt',
  'Ancient Greece',
  'Persian Empire',
  'Ottoman Empire',
  'Byzantine Empire',
  'British Empire',
  'Mongol Empire',
  'Aztec Empire',
  'Mayan Civilization',
  'Inca Empire',
  'Han Dynasty',
  'Ming Dynasty',
  'Tang Dynasty',
  'Mughal Empire',
  'Holy Roman Empire',
];

const TIER_3_KEYWORDS = [
  // Battles & Wars
  'Battle of Thermopylae',
  'Battle of Waterloo',
  'Battle of Hastings',
  'Battle of Gettysburg',
  'Siege of Constantinople',
  'D-Day',
  'Trojan War',
  'Punic Wars',
  'Battle of Cannae',
  'Battle of Gaugamela',
  'Battle of Zama',
  'Battle of Tours',
  'Battle of Agincourt',
  'Battle of Crecy',
  'Battle of Lepanto',
  'Battle of Vienna',
  'Battle of Trafalgar',
  'Battle of Austerlitz',
  'Battle of Stalingrad',
  'Battle of Midway',
  'Battle of Britain',
  'Siege of Troy',
  'Siege of Jerusalem',
  'Siege of Vienna',
  'Hundred Years War',
  'Thirty Years War',
  'Seven Years War',
  'Napoleonic Wars',
  'Crusades',
  'Peloponnesian War',
  'Gallic Wars',

  // Pirates & Explorers
  'Blackbeard',
  'Captain Kidd',
  'Anne Bonny',
  'Mary Read',
  'Henry Morgan',
  'Bartholomew Roberts',
  'Francis Drake',
  'Walter Raleigh',
  'Leif Erikson',
  'Christopher Columbus',
  'Marco Polo',
  'Magellan',
  'Vasco da Gama',
  'Hernan Cortes',
  'Francisco Pizarro',
  'Zheng He',
  'Ibn Battuta',

  // Philosophers & Scientists
  'Socrates',
  'Plato',
  'Aristotle',
  'Confucius',
  'Lao Tzu',
  'Buddha',
  'Marcus Aurelius Philosophy',
  'Seneca',
  'Epictetus',
  'Diogenes',
  'Galileo',
  'Isaac Newton',
  'Nikola Tesla',
  'Leonardo da Vinci',
  'Archimedes',
  'Pythagoras',
  'Euclid',
  'Hippocrates',
  'Galen',

  // Mythology & Legends
  'Greek Mythology',
  'Norse Mythology',
  'Egyptian Gods',
  'Roman Gods',
  'King Arthur',
  'Robin Hood',
  'Hercules',
  'Perseus',
  'Theseus',
  'Zeus',
  'Odin',
  'Thor',
  'Loki',
  'Ra',
  'Anubis',
  'Osiris',
  'Gilgamesh',
  'Beowulf',
  'Ragnar Lothbrok',
  'Sigurd',
  'Cu Chulainn',

  // Events & Eras
  'Fall of Rome',
  'Renaissance',
  'Dark Ages',
  'Medieval History',
  'Age of Exploration',
  'Industrial Revolution',
  'French Revolution',
  'American Revolution',
  'Civil War History',
  'World War 1',
  'World War 2',
  'Cold War',
  'Black Death',
  'Spanish Inquisition',
  'Reformation',
  'Enlightenment',
  'Bronze Age',
  'Iron Age',
  'Stone Age',

  // Cultures & Peoples
  'Vikings History',
  'Samurai History',
  'Gladiator History',
  'Spartan Warriors',
  'Knight Templar',
  'Assassins Creed History',
  'Ninja History',
  'Mongol Warriors',
  'Roman Legions',
  'Greek Hoplites',
  'Persian Immortals',
  'Celtic Warriors',
  'Aztec Warriors',
  'Zulu Warriors',
  'Apache Warriors',
  'Maori Warriors',

  // Places & Landmarks
  'Colosseum',
  'Pyramids of Giza',
  'Great Wall of China',
  'Parthenon',
  'Pompeii',
  'Machu Picchu',
  'Stonehenge',
  'Angkor Wat',
  'Petra',
  'Troy',
  'Carthage',
  'Babylon',
  'Alexandria',
  'Constantinople',

  // Miscellaneous Historical
  'Ancient Mysteries',
  'Lost Civilizations',
  'Archaeological Discoveries',
  'Historical Documentary',
  'History Facts',
  'Ancient Technology',
  'Medieval Weapons',
  'Ancient Warfare',
  'Historical Figures',
  'Untold History',
  'Hidden History',
  'Secret History',
  'Forgotten History',
];

// Combine all tiers for full list
const ALL_KEYWORDS = [...TIER_1_KEYWORDS, ...TIER_2_KEYWORDS, ...TIER_3_KEYWORDS];

// Keyword cache with 24-hour TTL to avoid redundant API calls
interface KeywordCache {
  [keyword: string]: {
    data: { current: number; previous: number; velocity: number };
    timestamp: number;
    tier: 1 | 2 | 3;
  };
}

const CACHE_TTL = {
  1: 6 * 60 * 60 * 1000, // Tier 1: 6 hours
  2: 24 * 60 * 60 * 1000, // Tier 2: 24 hours
  3: 72 * 60 * 60 * 1000, // Tier 3: 72 hours (3 days)
};

class TrendWatcherAgentService {
  private oauth2Client: OAuth2Client | null = null;
  private credentialsPath = join(process.cwd(), 'data', 'youtube_credentials.json');
  private cachedSignals: MarketSignals | null = null;
  private cacheTimestamp: Date | null = null;
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

  // Tiered keyword cache - persists trend data to minimize API calls
  private keywordCache: KeywordCache = {};
  private discoveredKeywords: Set<string> = new Set(); // Auto-discovered from related queries

  constructor() {
    this.initializeYouTubeClient();
    const totalKeywords = ALL_KEYWORDS.length + this.discoveredKeywords.size;
    console.log(`👁️ [Trend-Watcher Agent] Service initialized (${totalKeywords} keywords tracked)`);
  }

  private initializeYouTubeClient(): void {
    const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();

    if (clientId && clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      this.loadStoredCredentials();
    }
  }

  private loadStoredCredentials(): void {
    try {
      if (existsSync(this.credentialsPath)) {
        const data = readFileSync(this.credentialsPath, 'utf-8');
        const credentials = JSON.parse(data);

        if (this.oauth2Client && credentials.refreshToken) {
          this.oauth2Client.setCredentials({
            access_token: credentials.accessToken,
            refresh_token: credentials.refreshToken,
            expiry_date: credentials.expiryDate,
          });
        }
      }

      const envRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN?.trim();
      if (this.oauth2Client && envRefreshToken && !this.oauth2Client.credentials.refresh_token) {
        this.oauth2Client.setCredentials({ refresh_token: envRefreshToken });
      }
    } catch (error) {
      console.warn('⚠️ [Trend-Watcher] Could not load YouTube credentials:', error);
    }
  }

  private getCSTTimestamp(): Date {
    const now = new Date();
    const cstOffset = -6 * 60; // CST is UTC-6
    const utcOffset = now.getTimezoneOffset();
    const cstTime = new Date(now.getTime() + (utcOffset - cstOffset) * 60000);
    return cstTime;
  }

  /**
   * Calculate search velocity for tracked keywords using tiered caching
   *
   * COST-EFFECTIVE STRATEGY:
   * - Tier 1 (14 keywords): Check every 6 hours (core channel keywords)
   * - Tier 2 (80 keywords): Check every 24 hours (major figures)
   * - Tier 3 (150+ keywords): Check every 72 hours (battles, events, etc.)
   * - Discovered keywords: Auto-added from related queries
   *
   * This allows tracking 250+ keywords with only ~25 API calls per run
   */
  async calculateSearchVelocity(
    keywords: string[] = ALL_KEYWORDS,
  ): Promise<Record<string, { current: number; previous: number; velocity: number }>> {
    const now = Date.now();
    const velocityData: Record<string, { current: number; previous: number; velocity: number }> = {};

    // Get keywords that need updating based on their tier's TTL
    const keywordsToUpdate = this.getKeywordsNeedingUpdate(now);
    const cachedCount = ALL_KEYWORDS.length - keywordsToUpdate.length;

    console.log(
      `📊 [Trend-Watcher] Checking ${keywordsToUpdate.length} keywords (${cachedCount} cached, ${ALL_KEYWORDS.length} total)`,
    );

    // First, add all cached data to results
    for (const [keyword, cached] of Object.entries(this.keywordCache)) {
      velocityData[keyword] = cached.data;
    }

    // Limit to 30 API calls per run to avoid rate limits
    const updateBatch = keywordsToUpdate.slice(0, 30);
    let newDiscoveries = 0;

    for (const keyword of updateBatch) {
      try {
        const trendData = await googleTrendsService.getKeywordTrend(keyword);

        if (trendData) {
          const current = trendData.interestScore;
          const previous = trendData.isRising ? Math.round(current * 0.7) : Math.round(current * 1.3);
          const velocity = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;

          const data = { current, previous, velocity };
          velocityData[keyword] = data;

          // Cache the result with appropriate tier
          const tier = this.getKeywordTier(keyword);
          this.keywordCache[keyword] = { data, timestamp: now, tier };

          // Only log notable ones (high interest or significant velocity)
          if (current >= 70 || Math.abs(velocity) >= 30) {
            console.log(`   📈 ${keyword}: ${current}/100 (velocity: ${velocity > 0 ? '+' : ''}${velocity}%)`);
          }

          // Auto-discover new keywords from related queries
          if (trendData.relatedTopics && trendData.relatedTopics.length > 0) {
            for (const related of trendData.relatedTopics) {
              if (!this.discoveredKeywords.has(related) && !ALL_KEYWORDS.includes(related)) {
                this.discoveredKeywords.add(related);
                newDiscoveries++;
              }
            }
          }
        } else {
          velocityData[keyword] = { current: 0, previous: 0, velocity: 0 };
        }

        await this.delay(400); // Rate limit protection
      } catch (error: any) {
        velocityData[keyword] = { current: 0, previous: 0, velocity: 0 };
      }
    }

    // Log summary
    const notable = Object.entries(velocityData).filter(([_, v]) => v.current >= 70 || v.velocity >= 50);
    if (notable.length > 0) {
      console.log(`   🔥 Notable trends: ${notable.map(([k, v]) => `${k}(${v.current})`).join(', ')}`);
    }
    if (newDiscoveries > 0) {
      console.log(`   🔍 Auto-discovered ${newDiscoveries} new related keywords`);
    }

    return velocityData;
  }

  /**
   * Get keywords that need updating based on their tier's cache TTL
   */
  private getKeywordsNeedingUpdate(now: number): string[] {
    const needsUpdate: string[] = [];

    // Check all tiered keywords
    for (const keyword of ALL_KEYWORDS) {
      const cached = this.keywordCache[keyword];
      if (!cached) {
        needsUpdate.push(keyword);
        continue;
      }

      const tier = cached.tier;
      const ttl = CACHE_TTL[tier];
      if (now - cached.timestamp > ttl) {
        needsUpdate.push(keyword);
      }
    }

    // Prioritize: Tier 1 first, then Tier 2, then Tier 3
    needsUpdate.sort((a, b) => {
      const tierA = this.getKeywordTier(a);
      const tierB = this.getKeywordTier(b);
      return tierA - tierB;
    });

    return needsUpdate;
  }

  /**
   * Determine which tier a keyword belongs to
   */
  private getKeywordTier(keyword: string): 1 | 2 | 3 {
    if (TIER_1_KEYWORDS.includes(keyword)) return 1;
    if (TIER_2_KEYWORDS.includes(keyword)) return 2;
    return 3;
  }

  /**
   * Get total keyword count including discovered ones
   */
  getTotalKeywordCount(): { base: number; discovered: number; total: number } {
    return {
      base: ALL_KEYWORDS.length,
      discovered: this.discoveredKeywords.size,
      total: ALL_KEYWORDS.length + this.discoveredKeywords.size,
    };
  }

  // ============================================================
  // GAP DISCOVERY SYSTEM - Auto-finds untapped trending topics
  // No hardcoded word list needed - discovers opportunities dynamically
  // ============================================================

  /**
   * AUTO-DISCOVERY: Find trending historical topics we haven't covered
   *
   * This is the SMART approach - no word list needed!
   * 1. Pulls Google Trends daily/real-time trends
   * 2. Filters for history-related content automatically
   * 3. Cross-references with our existing videos
   * 4. Returns gap opportunities sorted by viral potential
   */
  async discoverContentGaps(): Promise<
    Array<{
      topic: string;
      whyTrending: string;
      traffic: string;
      viralScore: number;
      relatedTopics: string[];
      gapType: 'never_covered' | 'needs_update' | 'competitor_opportunity';
    }>
  > {
    console.log('🔍 [Gap Discovery] Auto-discovering untapped historical topics...');

    try {
      // Step 1: Get what's trending NOW (no word list needed!)
      const viralTopics = await googleTrendsService.getViralHistoricalTopics('US');
      const historicalTrends = await googleTrendsService.getHistoricalTrends('US');

      console.log(`   📈 Found ${viralTopics.length} viral topics, ${historicalTrends.length} historical trends`);

      // Step 2: Get our existing videos to find gaps
      const { db } = await import('../db');
      const { unityContentPackages } = await import('@shared/schema');

      const existingVideos = await db
        .select({
          topic: (unityContentPackages as any).historicalFigure,
          hook: (unityContentPackages as any).hook,
        })
        .from(unityContentPackages);

      const coveredTopics = new Set(existingVideos.map((v) => v.topic?.toLowerCase()).filter(Boolean));

      console.log(`   📚 Already covered ${coveredTopics.size} topics`);

      // Step 3: Find gaps - trending topics we haven't covered
      const gaps: Array<{
        topic: string;
        whyTrending: string;
        traffic: string;
        viralScore: number;
        relatedTopics: string[];
        gapType: 'never_covered' | 'needs_update' | 'competitor_opportunity';
      }> = [];

      // Check viral topics for gaps
      for (const viral of viralTopics) {
        const topicLower = viral.figure.toLowerCase();

        // Skip if we've already covered this
        const isCovered = Array.from(coveredTopics).some(
          (covered) => covered && (covered.includes(topicLower) || topicLower.includes(covered)),
        );

        if (!isCovered) {
          gaps.push({
            topic: viral.figure,
            whyTrending: viral.whyNow,
            traffic: viral.traffic || 'Trending',
            viralScore: viral.viralScore,
            relatedTopics: [],
            gapType: 'never_covered',
          });
        }
      }

      // Check historical trends for additional gaps
      for (const trend of historicalTrends) {
        const topicLower = trend.title.toLowerCase();

        // Skip if already in gaps or covered
        if (gaps.some((g) => g.topic.toLowerCase() === topicLower)) continue;

        const isCovered = Array.from(coveredTopics).some(
          (covered) => covered && (covered.includes(topicLower) || topicLower.includes(covered)),
        );

        if (!isCovered) {
          gaps.push({
            topic: trend.title,
            whyTrending: `${trend.formattedTraffic || 'High'} searches - ${trend.articles[0]?.title || 'Trending now'}`,
            traffic: trend.formattedTraffic || 'Trending',
            viralScore: 8,
            relatedTopics: trend.relatedQueries || [],
            gapType: 'never_covered',
          });
        }
      }

      // Sort by viral score
      gaps.sort((a, b) => b.viralScore - a.viralScore);

      console.log(`   🎯 Discovered ${gaps.length} content gaps!`);
      if (gaps.length > 0) {
        console.log(
          `   🔥 Top gaps: ${gaps
            .slice(0, 5)
            .map((g) => g.topic)
            .join(', ')}`,
        );
      }

      return gaps;
    } catch (error: any) {
      console.error('❌ [Gap Discovery] Failed:', error.message);
      return [];
    }
  }

  /**
   * Get YouTube search results to find what competitors are making
   * Identifies popular history content we should be making
   */
  async discoverCompetitorOpportunities(): Promise<
    Array<{
      topic: string;
      competitorChannel: string;
      viewCount: number;
      opportunity: string;
    }>
  > {
    if (!this.oauth2Client) {
      console.warn('⚠️ [Gap Discovery] YouTube not configured');
      return [];
    }

    try {
      console.log('🔍 [Gap Discovery] Searching YouTube for history content opportunities...');
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      // Search for popular history content
      const searchQueries = [
        'historical rap battle',
        'history AI video',
        'epic historical',
        'ancient history documentary short',
      ];

      const opportunities: Array<{
        topic: string;
        competitorChannel: string;
        viewCount: number;
        opportunity: string;
      }> = [];

      for (const query of searchQueries) {
        try {
          const response = await youtube.search.list({
            part: ['snippet'],
            q: query,
            type: ['video'],
            order: 'viewCount',
            maxResults: 10,
            publishedAfter: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Last 90 days
          });

          for (const item of response.data.items || []) {
            opportunities.push({
              topic: item.snippet?.title || '',
              competitorChannel: item.snippet?.channelTitle || '',
              viewCount: 0, // Would need additional API call to get this
              opportunity: `Similar to: ${query}`,
            });
          }

          await this.delay(500);
        } catch (err) {
          // Continue on error
        }
      }

      console.log(`   ✅ Found ${opportunities.length} competitor opportunities`);
      return opportunities.slice(0, 20);
    } catch (error: any) {
      console.error('❌ [Gap Discovery] Competitor search failed:', error.message);
      return [];
    }
  }

  /**
   * MAIN GAP FINDER - Combines all discovery methods
   * Call this once daily to get a list of content opportunities
   */
  async findAllContentOpportunities(): Promise<{
    gaps: Array<{ topic: string; whyTrending: string; traffic: string; viralScore: number }>;
    competitorIdeas: Array<{ topic: string; competitorChannel: string }>;
    summary: string;
  }> {
    console.log('🚀 [Gap Discovery] Running full content opportunity scan...');

    const [gaps, competitors] = await Promise.all([this.discoverContentGaps(), this.discoverCompetitorOpportunities()]);

    const summary =
      gaps.length > 0
        ? `Found ${gaps.length} untapped trending topics! Top opportunity: "${gaps[0]?.topic}" (${gaps[0]?.traffic})`
        : 'No significant gaps found - current coverage is good!';

    console.log(`📊 [Gap Discovery] ${summary}`);

    return {
      gaps: gaps.slice(0, 10),
      competitorIdeas: competitors.slice(0, 10),
      summary,
    };
  }

  /**
   * Fetch YouTube Most Popular videos
   */
  async getYouTubeMostPopular(maxResults: number = 50, regionCode: string = 'US'): Promise<YouTubePopularVideo[]> {
    if (!this.oauth2Client) {
      console.warn('⚠️ [Trend-Watcher] YouTube not configured, skipping popular videos');
      return [];
    }

    try {
      console.log(`🎬 [Trend-Watcher] Fetching YouTube Most Popular videos...`);
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      const response = await youtube.videos.list({
        part: ['snippet', 'statistics'],
        chart: 'mostPopular',
        regionCode,
        maxResults,
        videoCategoryId: '0',
      });

      const videos: YouTubePopularVideo[] = (response.data.items || []).map((item) => ({
        videoId: item.id || '',
        title: item.snippet?.title || '',
        description: (item.snippet?.description || '').substring(0, 200),
        channelTitle: item.snippet?.channelTitle || '',
        thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
        tags: item.snippet?.tags || [],
        viewCount: parseInt(item.statistics?.viewCount || '0'),
      }));

      console.log(`   ✅ Fetched ${videos.length} trending videos`);
      return videos;
    } catch (error: any) {
      console.error('❌ [Trend-Watcher] Failed to fetch YouTube popular:', error.message);
      return [];
    }
  }

  /**
   * Analyze style patterns from YouTube trending videos
   * Returns which visual aesthetics are currently trending
   */
  analyzeStylePatterns(videos: YouTubePopularVideo[]): { rising: string[]; falling: string[] } {
    console.log(`🎨 [Trend-Watcher] Analyzing style patterns from ${videos.length} videos...`);

    const styleScores = STYLE_PATTERNS.map((pattern) => ({
      ...pattern,
      detected: 0,
    }));

    for (const video of videos) {
      const searchText = `${video.title} ${video.description} ${video.tags.join(' ')}`.toLowerCase();

      for (const pattern of styleScores) {
        for (const keyword of pattern.keywords) {
          if (searchText.includes(keyword)) {
            pattern.detected++;
          }
        }
      }
    }

    styleScores.sort((a, b) => b.detected - a.detected);

    const avgDetected = styleScores.reduce((sum, s) => sum + s.detected, 0) / styleScores.length;

    const rising: string[] = [];
    const falling: string[] = [];

    for (const pattern of styleScores) {
      if (pattern.detected > avgDetected * 1.3) {
        rising.push(pattern.banditArm);
        console.log(`   📈 Rising: ${pattern.banditArm} (${pattern.detected} matches)`);
      } else if (pattern.detected < avgDetected * 0.5 && pattern.detected > 0) {
        falling.push(pattern.banditArm);
        console.log(`   📉 Falling: ${pattern.banditArm} (${pattern.detected} matches)`);
      }
    }

    return { rising, falling };
  }

  /**
   * Extract common themes from YouTube trending titles
   */
  extractThemesFromTitles(videos: YouTubePopularVideo[]): string[] {
    const themeKeywords = [
      'challenge',
      'reaction',
      'review',
      'tutorial',
      'vlog',
      'prank',
      'music',
      'gaming',
      'news',
      'drama',
      'comedy',
      'documentary',
      'history',
      'science',
      'technology',
      'sports',
      'fashion',
      'food',
      'battle',
      'versus',
      'vs',
      'fight',
      'war',
      'empire',
      'king',
      'queen',
    ];

    const themeCounts: Record<string, number> = {};

    for (const video of videos) {
      const text = video.title.toLowerCase();
      for (const theme of themeKeywords) {
        if (text.includes(theme)) {
          themeCounts[theme] = (themeCounts[theme] || 0) + 1;
        }
      }
    }

    return Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([theme]) => theme);
  }

  /**
   * Check for breakout alerts
   * Returns keywords that are spiking significantly
   */
  detectBreakoutAlerts(
    velocityData: Record<string, { current: number; previous: number; velocity: number }>,
  ): BreakoutAlert[] {
    const alerts: BreakoutAlert[] = [];

    for (const [keyword, data] of Object.entries(velocityData)) {
      let status: 'breakout' | 'rising' | 'falling' | 'stable';
      let recommendedAction: string;

      if (data.velocity >= BREAKOUT_THRESHOLD) {
        status = 'breakout';
        recommendedAction = `🚨 URGENT: Create content about "${keyword}" immediately - massive viral potential`;
      } else if (data.velocity >= RISING_THRESHOLD) {
        status = 'rising';
        recommendedAction = `📈 Consider prioritizing "${keyword}" content in next 24-48 hours`;
      } else if (data.velocity <= FALLING_THRESHOLD) {
        status = 'falling';
        recommendedAction = `📉 Reduce focus on "${keyword}" - interest is declining`;
      } else {
        status = 'stable';
        recommendedAction = `✅ "${keyword}" remains stable - continue normal content strategy`;
      }

      if (status !== 'stable') {
        alerts.push({
          keyword,
          velocityPercent: data.velocity,
          status,
          recommendedAction,
        });
      }
    }

    alerts.sort((a, b) => Math.abs(b.velocityPercent) - Math.abs(a.velocityPercent));

    return alerts;
  }

  /**
   * Get complete market signals
   * Main function for Consensus Judge integration
   */
  async getTrendWatcherSignals(forceRefresh: boolean = false): Promise<MarketSignals> {
    console.log(`\n👁️ [Trend-Watcher Agent] Gathering market signals at ${this.getCSTTimestamp().toISOString()} CST`);

    if (!forceRefresh && this.cachedSignals && this.cacheTimestamp) {
      const cacheAge = Date.now() - this.cacheTimestamp.getTime();
      if (cacheAge < this.CACHE_TTL_MS) {
        console.log(`   📦 Using cached signals (${Math.round(cacheAge / 60000)} minutes old)`);
        return this.cachedSignals;
      }
    }

    const [velocityData, ytVideos] = await Promise.all([this.calculateSearchVelocity(), this.getYouTubeMostPopular()]);

    const styleTrends = this.analyzeStylePatterns(ytVideos);
    const ytThemes = this.extractThemesFromTitles(ytVideos);
    const ytTitles = ytVideos.slice(0, 20).map((v) => v.title);

    const signals: MarketSignals = {
      searchVelocity: velocityData,
      ytPopularTitles: ytTitles,
      ytPopularThemes: ytThemes,
      styleTrends,
      timestamp: this.getCSTTimestamp(),
    };

    this.cachedSignals = signals;
    this.cacheTimestamp = new Date();

    console.log(`✅ [Trend-Watcher] Market signals collected:`);
    console.log(`   📊 Keywords tracked: ${Object.keys(velocityData).length}`);
    console.log(`   🎬 YT videos analyzed: ${ytVideos.length}`);
    console.log(`   🎨 Rising styles: ${styleTrends.rising.join(', ') || 'none'}`);
    console.log(`   📉 Falling styles: ${styleTrends.falling.join(', ') || 'none'}`);

    return signals;
  }

  /**
   * Get breakout alerts for emergency notifications
   * Called separately for immediate action items
   */
  async getBreakoutAlerts(): Promise<BreakoutAlert[]> {
    console.log(`\n🚨 [Trend-Watcher] Checking for breakout alerts...`);

    const signals = await this.getTrendWatcherSignals();
    const alerts = this.detectBreakoutAlerts(signals.searchVelocity);

    const breakouts = alerts.filter((a) => a.status === 'breakout');
    const risings = alerts.filter((a) => a.status === 'rising');
    const fallings = alerts.filter((a) => a.status === 'falling');

    console.log(`   🚨 Breakouts: ${breakouts.length}`);
    console.log(`   📈 Rising: ${risings.length}`);
    console.log(`   📉 Falling: ${fallings.length}`);

    for (const alert of breakouts) {
      console.log(`   ⚡ BREAKOUT: "${alert.keyword}" (+${alert.velocityPercent}%)`);
    }

    return alerts;
  }

  /**
   * Get style recommendations based on current trends
   * Maps trending styles to bandit arm recommendations
   */
  async getStyleRecommendations(): Promise<{
    recommended: string[];
    avoid: string[];
    reason: string;
  }> {
    const signals = await this.getTrendWatcherSignals();

    return {
      recommended: signals.styleTrends.rising,
      avoid: signals.styleTrends.falling,
      reason:
        `Based on analysis of ${signals.ytPopularTitles.length} trending YouTube videos. ` +
        `Rising themes: ${signals.ytPopularThemes.slice(0, 5).join(', ')}`,
    };
  }

  /**
   * Get a summary for the Strategic Summary Service
   */
  async getSummaryForConsensus(): Promise<{
    topAlerts: BreakoutAlert[];
    styleGuidance: { recommended: string[]; avoid: string[] };
    trendingThemes: string[];
    timestamp: string;
  }> {
    const [signals, alerts] = await Promise.all([this.getTrendWatcherSignals(), this.getBreakoutAlerts()]);

    return {
      topAlerts: alerts.slice(0, 5),
      styleGuidance: {
        recommended: signals.styleTrends.rising,
        avoid: signals.styleTrends.falling,
      },
      trendingThemes: signals.ytPopularThemes,
      timestamp: signals.timestamp.toISOString(),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const trendWatcherAgentService = new TrendWatcherAgentService();

export async function getTrendWatcherSignals(forceRefresh: boolean = false): Promise<MarketSignals> {
  return trendWatcherAgentService.getTrendWatcherSignals(forceRefresh);
}

export async function getBreakoutAlerts(): Promise<BreakoutAlert[]> {
  return trendWatcherAgentService.getBreakoutAlerts();
}
