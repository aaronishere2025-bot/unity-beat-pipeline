/**
 * NEWS AGGREGATOR
 *
 * Gathers news from multiple independent sources to create
 * balanced, bias-neutral political content.
 *
 * Features:
 * - Multi-source aggregation (independent, not mainstream)
 * - Bias detection and neutralization
 * - Common ground identification
 * - Unity angle extraction
 */

export interface NewsSource {
  name: string;
  url: string;
  bias: 'left' | 'left-center' | 'center' | 'right-center' | 'right';
  type: 'independent' | 'mainstream' | 'nonprofit';
  apiAvailable: boolean;
}

export interface CommonGround {
  topic: string;
  leftValues: string[];
  rightValues: string[];
  commonGround: string[];
  unityAngle: string;
  source: string;
}

export interface PoliticalIssueFramework {
  leftValues: string[];
  rightValues: string[];
  commonGround: string[];
  unityAngle: string;
}

export interface BattleAngle {
  type: string;
  description: string;
  leftCharacter?: string;
  rightCharacter?: string;
  villain?: string;
  setup?: string;
  resolution: string;
}

// ============================================
// NEWS SOURCES (Balanced across spectrum)
// ============================================

export const NEWS_SOURCES: Record<string, NewsSource> = {
  // Left-Independent
  intercept: {
    name: 'The Intercept',
    url: 'https://theintercept.com',
    bias: 'left',
    type: 'independent',
    apiAvailable: false,
  },
  democracy_now: {
    name: 'Democracy Now',
    url: 'https://democracynow.org',
    bias: 'left',
    type: 'nonprofit',
    apiAvailable: false,
  },
  propublica: {
    name: 'ProPublica',
    url: 'https://propublica.org',
    bias: 'left-center',
    type: 'nonprofit',
    apiAvailable: true,
  },

  // Center/Nonpartisan
  breaking_points: {
    name: 'Breaking Points',
    url: 'https://breakingpoints.com',
    bias: 'center',
    type: 'independent',
    apiAvailable: false,
  },
  allsides: {
    name: 'AllSides',
    url: 'https://allsides.com',
    bias: 'center',
    type: 'independent',
    apiAvailable: true,
  },
  ground_news: {
    name: 'Ground News',
    url: 'https://ground.news',
    bias: 'center',
    type: 'independent',
    apiAvailable: true,
  },
  axios: {
    name: 'Axios',
    url: 'https://axios.com',
    bias: 'center',
    type: 'independent',
    apiAvailable: true,
  },
  reuters: {
    name: 'Reuters',
    url: 'https://reuters.com',
    bias: 'center',
    type: 'mainstream',
    apiAvailable: true,
  },
  ap_news: {
    name: 'AP News',
    url: 'https://apnews.com',
    bias: 'center',
    type: 'mainstream',
    apiAvailable: true,
  },

  // Right-Independent
  reason: {
    name: 'Reason',
    url: 'https://reason.com',
    bias: 'right-center',
    type: 'independent',
    apiAvailable: false,
  },
  daily_wire: {
    name: 'Daily Wire',
    url: 'https://dailywire.com',
    bias: 'right',
    type: 'independent',
    apiAvailable: false,
  },
  federalist: {
    name: 'The Federalist',
    url: 'https://thefederalist.com',
    bias: 'right',
    type: 'independent',
    apiAvailable: false,
  },
  just_the_news: {
    name: 'Just the News',
    url: 'https://justthenews.com',
    bias: 'right-center',
    type: 'independent',
    apiAvailable: false,
  },
};

// ============================================
// ISSUE FRAMEWORKS
// ============================================

export const ISSUE_FRAMEWORKS: Record<string, PoliticalIssueFramework> = {
  immigration: {
    leftValues: ['compassion', 'path to citizenship', 'asylum rights', 'family unity'],
    rightValues: ['border security', 'legal immigration', 'national security', 'rule of law'],
    commonGround: [
      'System is broken',
      'Legal immigration should be easier/faster',
      'Human trafficking is wrong',
      "Children shouldn't suffer",
      'Workers need protections',
    ],
    unityAngle: 'Fix the system together - security AND humanity',
  },
  economy: {
    leftValues: ['living wage', 'worker rights', 'income inequality', 'corporate accountability'],
    rightValues: ['free market', 'low taxes', 'small business', 'deregulation'],
    commonGround: [
      'Working people are struggling',
      'Small businesses matter',
      'Corruption is the enemy',
      'Fair competition benefits everyone',
      'Cost of living is too high',
    ],
    unityAngle: 'Working people vs the system that fails them',
  },
  healthcare: {
    leftValues: ['universal coverage', 'affordable care', 'prescription costs', 'mental health'],
    rightValues: ['choice', 'free market', 'innovation', 'personal responsibility'],
    commonGround: [
      'Healthcare is too expensive',
      'Insurance companies have too much power',
      'Prescription drug prices are outrageous',
      'Mental health matters',
      'System serves profits over patients',
    ],
    unityAngle: 'Patients vs the profiteers',
  },
  tech_privacy: {
    leftValues: ['data protection', 'anti-monopoly', 'worker rights in gig economy'],
    rightValues: ['free speech online', 'anti-censorship', 'market freedom'],
    commonGround: [
      'Big tech has too much power',
      'Our data is being exploited',
      'Algorithms are manipulating us',
      'Free speech matters',
      'Kids need protection online',
    ],
    unityAngle: 'The people vs the algorithm',
  },
  political_division: {
    leftValues: ['unity', 'dialogue', 'understanding'],
    rightValues: ['unity', 'dialogue', 'understanding'],
    commonGround: [
      "We've been manipulated into hating each other",
      'Politicians profit from division',
      'Media profits from outrage',
      "We have more in common than we're told",
      "Neighbors shouldn't be enemies",
    ],
    unityAngle: 'The people vs those who profit from our division',
  },
  gun_rights: {
    leftValues: ['safety', 'regulation', 'background checks', 'community protection'],
    rightValues: ['second amendment', 'self-defense', 'freedom', 'constitutional rights'],
    commonGround: [
      'Kids should be safe at school',
      'Mental health needs more attention',
      'Criminals should not have easy access to weapons',
      'Law-abiding citizens have rights',
      'Violence affects all communities',
    ],
    unityAngle: 'Protect our communities AND our rights',
  },
  climate: {
    leftValues: ['environmental protection', 'renewable energy', 'regulations', 'climate justice'],
    rightValues: ['energy independence', 'jobs', 'innovation', 'market solutions'],
    commonGround: [
      'Clean air and water matter to everyone',
      'Energy costs affect working families',
      'American innovation can lead the world',
      'Rural and urban communities both need solutions',
      'Future generations deserve a healthy planet',
    ],
    unityAngle: 'Clean energy that creates jobs AND protects our land',
  },
};

// ============================================
// NEWS AGGREGATOR CLASS
// ============================================

export class NewsAggregator {
  /**
   * Gather news from multiple sources across the political spectrum
   */
  gatherBalancedNews(topic: string): {
    topic: string;
    sourcesQueried: Record<string, string[]>;
    articles: Record<string, any[]>;
    note: string;
  } {
    return {
      topic,
      sourcesQueried: {
        left: ['intercept', 'democracy_now', 'propublica'],
        center: ['breaking_points', 'allsides', 'reuters', 'ap_news'],
        right: ['reason', 'daily_wire', 'federalist'],
      },
      articles: {
        left: [],
        center: [],
        right: [],
      },
      note: 'Populate with actual API calls or manual research',
    };
  }

  /**
   * Identify common ground between left and right positions
   */
  findCommonGround(topic?: string): CommonGround {
    const topicLower = topic?.toLowerCase() || '';

    // Check for predefined framework
    for (const [issueKey, framework] of Object.entries(ISSUE_FRAMEWORKS)) {
      if (topicLower.includes(issueKey)) {
        return {
          topic: topic || issueKey,
          leftValues: framework.leftValues,
          rightValues: framework.rightValues,
          commonGround: framework.commonGround,
          unityAngle: framework.unityAngle,
          source: 'predefined_framework',
        };
      }
    }

    // Default to political division framework
    const defaultFramework = ISSUE_FRAMEWORKS.political_division;
    return {
      topic: topic || 'political_division',
      leftValues: defaultFramework.leftValues,
      rightValues: defaultFramework.rightValues,
      commonGround: defaultFramework.commonGround,
      unityAngle: defaultFramework.unityAngle,
      source: 'default_unity_framework',
    };
  }

  /**
   * Check if topic is political
   */
  isPoliticalTopic(topic: string): boolean {
    const politicalKeywords = [
      'immigration',
      'election',
      'democrat',
      'republican',
      'congress',
      'senate',
      'president',
      'policy',
      'law',
      'rights',
      'freedom',
      'government',
      'political',
      'vote',
      'conservative',
      'liberal',
      'left',
      'right',
      'division',
    ];
    const topicLower = topic.toLowerCase();
    return politicalKeywords.some((keyword) => topicLower.includes(keyword));
  }

  /**
   * Generate a balanced summary of an issue for content creation
   */
  generateBalancedSummary(topic: string): string {
    const commonGround = this.findCommonGround(topic);

    return `
TOPIC: ${topic}

LEFT PERSPECTIVE:
Values: ${commonGround.leftValues.join(', ')}

RIGHT PERSPECTIVE:
Values: ${commonGround.rightValues.join(', ')}

COMMON GROUND (What BOTH sides agree on):
${commonGround.commonGround.map((point) => `• ${point}`).join('\n')}

UNITY ANGLE FOR CONTENT:
${commonGround.unityAngle}

SUGGESTED APPROACH:
1. Acknowledge both perspectives fairly
2. Highlight the common ground
3. Point out who benefits from the division
4. Call for unity against the real enemy (system, corruption, manipulation)
5. End with hope and human connection
`;
  }

  /**
   * Generate multiple angles for a political rap battle
   */
  generateBattleAngles(topic: string): BattleAngle[] {
    const commonGround = this.findCommonGround(topic);

    return [
      {
        type: 'values_clash',
        description: 'Two people with different values realize they want the same outcome',
        leftCharacter: `Values: ${commonGround.leftValues.slice(0, 2).join(', ')}`,
        rightCharacter: `Values: ${commonGround.rightValues.slice(0, 2).join(', ')}`,
        resolution: commonGround.commonGround[0],
      },
      {
        type: 'manipulation_reveal',
        description: "Both sides realize they've been played against each other",
        villain: 'The system/politicians/media that profits from division',
        resolution: 'Turn on the real enemy together',
      },
      {
        type: 'neighbor_story',
        description: "Two neighbors who discovered they're not so different",
        setup: 'Started as enemies, became friends',
        resolution: 'Human connection > political labels',
      },
      {
        type: 'algorithm_awakening',
        description: 'Both realize social media has been feeding them outrage',
        villain: 'The algorithm',
        resolution: 'Put down the phone, talk to each other',
      },
    ];
  }

  /**
   * Get sources by bias
   */
  getSourcesByBias(bias: NewsSource['bias']): NewsSource[] {
    return Object.values(NEWS_SOURCES).filter((s) => s.bias === bias);
  }

  /**
   * Get all independent sources
   */
  getIndependentSources(): NewsSource[] {
    return Object.values(NEWS_SOURCES).filter((s) => s.type === 'independent');
  }

  /**
   * Get sources with API access
   */
  getApiSources(): NewsSource[] {
    return Object.values(NEWS_SOURCES).filter((s) => s.apiAvailable);
  }
}

// Export singleton
export const newsAggregator = new NewsAggregator();
