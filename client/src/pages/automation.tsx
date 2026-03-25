import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Play,
  Square,
  Search,
  Zap,
  Calendar,
  TrendingUp,
  Sparkles,
  RefreshCw,
  Upload,
  Video,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Bot,
  Target,
  Lightbulb,
  Link,
  Unlink,
  ExternalLink,
  Eye,
  ThumbsUp,
  MessageCircle,
  BarChart3,
  Flame,
  Trophy,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Star,
  FlaskConical,
  Shuffle,
  Brain,
  ChevronDown,
  ChevronUp,
  Share2,
  Users,
  UserPlus,
  UserMinus,
  Globe,
  Timer,
  Percent,
  Type,
  ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SiYoutube, SiRumble } from 'react-icons/si';

interface AutomationStatus {
  isRunning: boolean;
  lastDiscovery: string | null;
  pendingTopics: number;
  generatingVideos: number;
  completedVideos: number;
  failedVideos: number;
  uploadQueue: { pending: number; completed: number };
  nextDiscovery: string | null;
  nextUpload: string | null;
}

interface ActiveJob {
  id: string;
  name: string;
  status: string;
  progress: number;
  createdAt?: string;
}

interface RumbleStatusResponse {
  success: boolean;
  data: {
    configured: boolean;
    hasRtmpUrl: boolean;
    hasStreamKey: boolean;
    hasApiKey: boolean;
    username: string | null;
    followers: number;
  };
}

interface YouTubeStatusResponse {
  success: boolean;
  data: {
    configured: boolean;
    authenticated: boolean;
    channel: {
      name: string;
      id: string;
      thumbnail?: string;
    } | null;
    requiredEnvVars: Record<string, boolean>;
  };
}

interface TopicCandidate {
  figure: string;
  event: string;
  hook: string;
  whyNow: string;
  viralScore: number;
  source: string;
  category?: string;
  year?: number;
}

interface YouTubeVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  privacyStatus: string;
}

interface YouTubeAnalyticsResponse {
  success: boolean;
  data: {
    videos: YouTubeVideo[];
    totals: {
      totalViews: number;
      totalLikes: number;
      totalComments: number;
    };
    videoCount: number;
  };
}

interface DashboardTheme {
  id: string;
  name: string;
  category: 'proven' | 'neutral' | 'emerging' | 'failing';
  categoryIcon: string;
  successRate: number;
  sampleCount: number;
  trend: 'improving' | 'declining' | 'stable';
  trendIcon: string;
  whyItWorks: string;
  description: string;
  contributingVideos: Array<{
    videoId: string;
    title: string;
    views: number;
    wasSuccess: boolean;
  }>;
  examples: string[];
  antiPatterns: string[];
}

interface PatternIntelligenceResponse {
  success: boolean;
  data: DashboardTheme[];
}

interface PatternAnalyticsResponse {
  success: boolean;
  data: {
    thematicAnalysis: {
      themeCount: number;
      lastClusteringTime: string | null;
      holdoutRate: number;
      categories: {
        proven: number;
        neutral: number;
        emerging: number;
        failing: number;
      };
    };
  };
}

interface VideoInsights {
  videoId: string;
  title: string;
  publishedAt: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    engagementRate: number;
    estimatedCTR?: number;
    estimatedAVD?: number;
    shares?: number;
    subscribersGained?: number;
    subscribersLost?: number;
    watchTimeMinutes?: number;
    averageViewPercentage?: number;
    impressions?: number;
  };
  trafficSources?: {
    browse?: number;
    search?: number;
    suggested?: number;
    external?: number;
    direct?: number;
    notifications?: number;
    playlists?: number;
  };
  performanceTier: 'viral' | 'high' | 'medium' | 'low' | 'new';
  appliedThemes: Array<{
    themeId: string;
    themeName: string;
    categoryAtGeneration: string;
    currentCategory: string;
    successRateAtGeneration: number;
    currentSuccessRate: number;
    whyItWorks: string;
    trend: 'improving' | 'declining' | 'stable';
  }>;
  contributedThemes: Array<{
    themeId: string;
    themeName: string;
    signal: 'positive' | 'negative';
    reason: string;
  }>;
  wasInHoldout: boolean;
  generatedAt: string;
  packageId?: string;
}

export default function AutomationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [figure, setFigure] = useState('');
  const [story, setStory] = useState('');
  const [activeDiscoveryTab, setActiveDiscoveryTab] = useState('suggestions');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showAllVideos, setShowAllVideos] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<AutomationStatus>({
    queryKey: ['/api/automation/status'],
    refetchInterval: 5000,
  });

  const { data: pendingTopics } = useQuery<{ topics: TopicCandidate[] }>({
    queryKey: ['/api/automation/topics'],
    refetchInterval: 10000,
  });

  const { data: completedVideos } = useQuery<{ videos: any[] }>({
    queryKey: ['/api/automation/videos'],
    refetchInterval: 10000,
  });

  const { data: activeJobs } = useQuery<{ jobs: ActiveJob[] }>({
    queryKey: ['/api/automation/jobs'],
    refetchInterval: 2000, // Faster refresh for real-time feel
  });

  // Find the most recent processing or queued job
  const currentJob = activeJobs?.jobs?.find((j) => j.status === 'processing' || j.status === 'queued');

  // YouTube status query
  const {
    data: youtubeStatusResponse,
    isLoading: youtubeLoading,
    refetch: refetchYouTube,
  } = useQuery<YouTubeStatusResponse>({
    queryKey: ['/api/youtube/status'],
    refetchInterval: 30000,
  });

  // Extract data from response
  const youtubeStatus = youtubeStatusResponse?.data;

  // Rumble status query
  const {
    data: rumbleStatusResponse,
    isLoading: rumbleLoading,
    refetch: refetchRumble,
  } = useQuery<RumbleStatusResponse>({
    queryKey: ['/api/rumble/status'],
    refetchInterval: 30000,
  });
  const rumbleStatus = rumbleStatusResponse?.data;

  // YouTube Analytics query - only fetch when authenticated
  const {
    data: youtubeAnalytics,
    isLoading: analyticsLoading,
    refetch: refetchAnalytics,
  } = useQuery<YouTubeAnalyticsResponse>({
    queryKey: ['/api/youtube/analytics'],
    enabled: youtubeStatus?.authenticated === true,
    refetchInterval: 60000,
  });

  // AI Analytics Insights - powered by GPT analysis
  const {
    data: analyticsInsights,
    isLoading: insightsLoading,
    refetch: refetchInsights,
  } = useQuery<{
    success: boolean;
    data: {
      topPerformers: Array<{
        videoId: string;
        title: string;
        viewCount: number;
        engagementRate: number;
        performanceTier: string;
      }>;
      lowPerformers: Array<{
        videoId: string;
        title: string;
        viewCount: number;
      }>;
      patterns: {
        bestTitlePatterns: string[];
        optimalVideoLength: string;
        winningTopics: string[];
        audiencePreferences: string[];
      };
      recommendations: string[];
      promptEnhancements: string[];
    };
  }>({
    queryKey: ['/api/analytics/insights'],
    enabled: youtubeStatus?.authenticated === true,
    refetchInterval: 300000, // 5 minutes
  });

  // Channel summary with trends
  const { data: channelSummary } = useQuery<{
    success: boolean;
    data: {
      totalVideos: number;
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      averageEngagement: number;
      viralCount: number;
      recentTrend: 'up' | 'down' | 'stable';
      topPerformer: any;
    };
  }>({
    queryKey: ['/api/analytics/summary'],
    enabled: youtubeStatus?.authenticated === true,
    refetchInterval: 60000,
  });

  // A/B Testing status
  const { data: abTestingData } = useQuery<{
    success: boolean;
    data: {
      variants: { id: string; name: string; description: string; visualStyle: string; colorGrade: string }[];
      distribution: { id: string; name: string; weight: number; description: string }[];
      performance: { variantId: string; name: string; count: number; avgViews: number; avgEngagement: number }[];
      recentAssignments: { variantId: string; figure: string; assignedAt: string }[];
    };
  }>({
    queryKey: ['/api/ab-testing/status'],
    refetchInterval: 60000,
  });

  // Rewind analytics - what really stands out
  const {
    data: rewindData,
    isLoading: rewindLoading,
    refetch: refetchRewind,
  } = useQuery<{
    success: boolean;
    data: {
      period: { start: string; end: string };
      momentum: {
        biggestGainer: { video: any; viewsGained: number; percentGrowth: number } | null;
        newlyViral: any[];
        risingStars: { video: any; momentum: number }[];
        declining: { video: any; viewsLost: number } | null;
      };
      standouts: {
        topEngagement: any | null;
        mostCommented: any | null;
        highestLikeRatio: any | null;
      };
      channelStats: {
        totalViewsThisWeek: number;
        avgViewsPerVideo: number;
        viralRate: number;
        engagementTrend: 'up' | 'down' | 'stable';
      };
      sparklines: { videoId: string; title: string; dataPoints: number[]; totalViews?: number }[];
      aiSummary: string;
    };
  }>({
    queryKey: ['/api/analytics/rewind'],
    enabled: youtubeStatus?.authenticated === true,
    refetchInterval: 300000, // 5 minutes
  });

  // Pattern Intelligence themes
  const {
    data: patternThemesResponse,
    isLoading: patternThemesLoading,
    refetch: refetchPatternThemes,
  } = useQuery<PatternIntelligenceResponse>({
    queryKey: ['/api/pattern-intelligence/themes'],
    refetchInterval: 60000,
  });

  // Pattern Intelligence analytics (for stats)
  const { data: patternAnalyticsResponse } = useQuery<PatternAnalyticsResponse>({
    queryKey: ['/api/pattern-intelligence'],
    refetchInterval: 60000,
  });

  const patternThemes = patternThemesResponse?.data || [];
  const patternAnalytics = patternAnalyticsResponse?.data?.thematicAnalysis;

  // Creative Analytics query
  const {
    data: creativeAnalyticsResponse,
    isLoading: creativeLoading,
    refetch: refetchCreative,
  } = useQuery<{
    success: boolean;
    data: {
      insights: {
        thumbnailWinners: Array<{ pattern: string; description: string; whyItWorks: string; confidence: number }>;
        titleWinners: Array<{ pattern: string; description: string; whyItWorks: string; confidence: number }>;
        hookWinners: Array<{ pattern: string; description: string; whyItWorks: string; confidence: number }>;
        recommendations: string[];
        lastAnalyzed: string;
      } | null;
      stats: {
        totalVideosTracked: number;
        videosWithPerformance: number;
        patternsIdentified: number;
        lastAnalysis: string | null;
        topThumbnailPattern: string | null;
        topTitlePattern: string | null;
        topHookPattern: string | null;
      };
      formulas: {
        thumbnail: string[];
        title: string[];
        hook: string[];
      };
    };
  }>({
    queryKey: ['/api/creative-analytics'],
    refetchInterval: 120000, // 2 minutes
  });

  const creativeAnalytics = creativeAnalyticsResponse?.data;

  // Thumbnail A/B Testing query
  const {
    data: thumbnailVariantsResponse,
    isLoading: thumbnailVariantsLoading,
    refetch: refetchThumbnailVariants,
  } = useQuery<{
    success: boolean;
    data: {
      variants: Array<{
        id: string;
        name: string;
        description: string;
        weight: number;
        videoCount: number;
        avgCtr: number;
        bestCtr: number;
        isLeading: boolean;
      }>;
      totalVideos: number;
      hasEnoughData: boolean;
      leadingVariant: string | null;
    };
  }>({
    queryKey: ['/api/creative-analytics/thumbnail-variants'],
    refetchInterval: 60000,
  });

  const thumbnailVariants = thumbnailVariantsResponse?.data;

  // Recalculate thumbnail weights mutation
  const recalculateWeightsMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/creative-analytics/recalculate-weights'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/creative-analytics/thumbnail-variants'] });
      toast({
        title: 'Weights Updated',
        description: 'Thumbnail variant weights recalculated based on CTR performance.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Creative analytics sync mutation
  const syncCreativeMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/creative-analytics/sync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/creative-analytics'] });
      toast({ title: 'Creative Analytics Synced', description: 'YouTube data synced for creative analysis.' });
    },
    onError: (error: any) => {
      toast({ title: 'Sync Error', description: error.message, variant: 'destructive' });
    },
  });

  // Creative analytics analyze mutation
  const analyzeCreativeMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/creative-analytics/analyze'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/creative-analytics'] });
      toast({ title: 'Analysis Complete', description: 'Creative patterns analyzed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Analysis Error', description: error.message, variant: 'destructive' });
    },
  });

  // State for expanded category sections
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    proven: true,
    neutral: false,
    emerging: false,
    failing: false,
  });

  // State for expanded theme videos
  const [expandedThemes, setExpandedThemes] = useState<Record<string, boolean>>({});

  // Video Insights query - fetches when a video is selected
  const {
    data: videoInsightsResponse,
    isLoading: insightsVideoLoading,
    isError: insightsVideoError,
  } = useQuery<{ success: boolean; data: VideoInsights }>({
    queryKey: ['/api/videos', selectedVideoId, 'insights'],
    enabled: !!selectedVideoId,
  });

  // Handle video insights error - show toast and close modal
  useEffect(() => {
    if (insightsVideoError && selectedVideoId) {
      toast({
        title: 'Failed to Load Insights',
        description: 'Could not fetch video insights. Please try again later.',
        variant: 'destructive',
      });
      setSelectedVideoId(null);
    }
  }, [insightsVideoError, selectedVideoId, toast]);

  const startMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/automation/start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      toast({ title: 'Automation Started', description: 'The system is now running.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/automation/stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      toast({ title: 'Automation Stopped', description: 'The system has been stopped.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const discoverMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/automation/discover'),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/topics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      toast({
        title: 'Discovery Complete',
        description: `Found ${data?.topics?.length || 0} viral-worthy topics.`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const generateMutation = useMutation({
    mutationFn: ({ figure, story }: { figure: string; story: string }) =>
      apiRequest('POST', '/api/automation/generate', { figure, story }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/videos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      setFigure('');
      setStory('');
      toast({
        title: 'Job Created',
        description: `Video generation started for ${data?.video?.figure}.`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const pipelineMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/automation/pipeline'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/topics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/videos'] });
      toast({ title: 'Pipeline Complete', description: 'Daily pipeline has finished running.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const fullPipelineMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/automation/full-pipeline');
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/topics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/videos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pattern-intelligence/themes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({
        title: 'Full Pipeline Complete',
        description: `Analytics: ${data.analytics ? '✓' : 'skipped'} | Topics: ${data.topicsFound} | Videos: ${data.videosCreated}`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Pipeline Error', description: error.message, variant: 'destructive' });
    },
  });

  const youtubeDisconnectMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/youtube/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/youtube/status'] });
      toast({ title: 'YouTube Disconnected', description: 'Your YouTube account has been disconnected.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const clusteringMutation = useMutation({
    mutationFn: (force: boolean = false) => apiRequest('POST', '/api/pattern-intelligence/cluster', { force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pattern-intelligence/themes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pattern-intelligence'] });
      toast({
        title: 'Clustering Complete',
        description: 'Pattern themes have been re-analyzed with proper video assignments.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Clustering Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleConnectYouTube = async () => {
    try {
      const response = await fetch('/api/youtube/auth-url');
      const data = await response.json();
      const authUrl = data.data?.authUrl || data.authUrl;
      if (authUrl) {
        window.open(authUrl, '_blank', 'width=600,height=700');
        toast({
          title: 'YouTube Connection',
          description: 'Complete the authorization in the new window, then refresh this page.',
        });
      } else {
        toast({
          title: 'Error',
          description: data.error || data.data?.error || 'Failed to get auth URL',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    refetch: refetchSuggestions,
  } = useQuery<{ suggestions: TopicCandidate[] }>({
    queryKey: ['/api/automation/suggestions'],
    enabled: activeDiscoveryTab === 'suggestions',
    staleTime: 60000,
  });

  const {
    data: thisDay,
    isLoading: thisDayLoading,
    refetch: refetchThisDay,
  } = useQuery<{ topics: TopicCandidate[] }>({
    queryKey: ['/api/automation/this-day'],
    enabled: activeDiscoveryTab === 'thisday',
    staleTime: 60000,
  });

  const {
    data: trending,
    isLoading: trendingLoading,
    refetch: refetchTrending,
  } = useQuery<{ topics: TopicCandidate[] }>({
    queryKey: ['/api/automation/trending'],
    enabled: activeDiscoveryTab === 'trending',
    staleTime: 60000,
  });

  const {
    data: anniversaries,
    isLoading: anniversariesLoading,
    refetch: refetchAnniversaries,
  } = useQuery<{ topics: TopicCandidate[] }>({
    queryKey: ['/api/automation/anniversaries'],
    enabled: activeDiscoveryTab === 'anniversaries',
    staleTime: 60000,
  });

  const handleGenerateFromTopic = (topic: TopicCandidate) => {
    generateMutation.mutate({ figure: topic.figure, story: topic.event });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not scheduled';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getScoreColor = (score: number) => {
    if (score >= 8.5) return 'text-green-500';
    if (score >= 7) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'this_day':
        return (
          <Badge variant="outline">
            <Calendar className="w-3 h-3 mr-1" /> This Day
          </Badge>
        );
      case 'trending':
        return (
          <Badge variant="outline">
            <TrendingUp className="w-3 h-3 mr-1" /> Trending
          </Badge>
        );
      case 'anniversary':
        return (
          <Badge variant="outline">
            <Sparkles className="w-3 h-3 mr-1" /> Anniversary
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Lightbulb className="w-3 h-3 mr-1" /> Suggested
          </Badge>
        );
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-automation">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="w-8 h-8" />
            Unity Automation
          </h1>
          <p className="text-muted-foreground">Automated content discovery, generation, and YouTube upload</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            onClick={() => fullPipelineMutation.mutate()}
            disabled={fullPipelineMutation.isPending}
            data-testid="button-run-full-pipeline"
          >
            {fullPipelineMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            {fullPipelineMutation.isPending ? 'Running...' : 'Run Full Pipeline'}
          </Button>
          <Button
            variant={status?.isRunning ? 'destructive' : 'outline'}
            onClick={() => (status?.isRunning ? stopMutation.mutate() : startMutation.mutate())}
            disabled={startMutation.isPending || stopMutation.isPending}
            data-testid="button-toggle-automation"
          >
            {startMutation.isPending || stopMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : status?.isRunning ? (
              <Square className="w-4 h-4 mr-2" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {status?.isRunning ? 'Stop' : 'Schedule'} Automation
          </Button>
        </div>
      </div>

      {/* PROMINENT CURRENT JOB BANNER */}
      {currentJob && (
        <Card className="border-2 border-blue-500 bg-blue-500/5" data-testid="card-current-job">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <span className="absolute inset-0 w-8 h-8 rounded-full bg-blue-500/20 animate-ping" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {currentJob.status === 'queued' ? 'Job Queued' : 'Generating Video'}
                  </CardTitle>
                  <CardDescription className="text-base font-medium">{currentJob.name}</CardDescription>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {currentJob.progress}%
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">ID: {currentJob.id.slice(0, 8)}...</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={currentJob.progress} className="h-3" />
            <p className="text-sm text-muted-foreground mt-2">
              {currentJob.status === 'queued'
                ? 'Waiting to start...'
                : currentJob.progress < 10
                  ? 'Initializing content package...'
                  : currentJob.progress < 30
                    ? 'Generating music and analyzing audio...'
                    : currentJob.progress < 70
                      ? 'Creating video clips with Kling AI...'
                      : currentJob.progress < 90
                        ? 'Processing subtitles and combining clips...'
                        : 'Finalizing video...'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              {statusLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : status?.isRunning ? (
                <>
                  <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  Running
                </>
              ) : (
                <>
                  <span className="w-3 h-3 bg-gray-400 rounded-full" />
                  Stopped
                </>
              )}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Topics</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-pending-topics">
              {status?.pendingTopics || 0}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed Videos</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-completed-videos">
              {status?.completedVideos || 0}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Upload Queue</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-upload-queue">
              {status?.uploadQueue?.pending || 0} pending
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Content Discovery
            </CardTitle>
            <CardDescription>Find viral-worthy historical topics for video generation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => discoverMutation.mutate()}
                disabled={discoverMutation.isPending}
                data-testid="button-run-discovery"
              >
                {discoverMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Target className="w-4 h-4 mr-2" />
                )}
                Run Full Discovery
              </Button>
              <Button
                variant="outline"
                onClick={() => pipelineMutation.mutate()}
                disabled={pipelineMutation.isPending}
                data-testid="button-run-pipeline"
              >
                {pipelineMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Run Full Pipeline
              </Button>
            </div>

            <Tabs value={activeDiscoveryTab} onValueChange={setActiveDiscoveryTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="suggestions">
                  <Lightbulb className="w-4 h-4 mr-1" />
                  Suggestions
                </TabsTrigger>
                <TabsTrigger value="thisday">
                  <Calendar className="w-4 h-4 mr-1" />
                  This Day
                </TabsTrigger>
                <TabsTrigger value="trending">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  Trending
                </TabsTrigger>
                <TabsTrigger value="anniversaries">
                  <Sparkles className="w-4 h-4 mr-1" />
                  Anniversaries
                </TabsTrigger>
              </TabsList>

              <TabsContent value="suggestions" className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">AI-suggested viral topics</span>
                  <Button variant="ghost" size="sm" onClick={() => refetchSuggestions()}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <TopicList
                  topics={suggestions?.suggestions || []}
                  isLoading={suggestionsLoading}
                  onGenerate={handleGenerateFromTopic}
                  getScoreColor={getScoreColor}
                  getSourceBadge={getSourceBadge}
                  isPending={generateMutation.isPending}
                />
              </TabsContent>

              <TabsContent value="thisday" className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">Historical events on this date</span>
                  <Button variant="ghost" size="sm" onClick={() => refetchThisDay()}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <TopicList
                  topics={thisDay?.topics || []}
                  isLoading={thisDayLoading}
                  onGenerate={handleGenerateFromTopic}
                  getScoreColor={getScoreColor}
                  getSourceBadge={getSourceBadge}
                  isPending={generateMutation.isPending}
                />
              </TabsContent>

              <TabsContent value="trending" className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">Currently trending historical topics</span>
                  <Button variant="ghost" size="sm" onClick={() => refetchTrending()}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <TopicList
                  topics={trending?.topics || []}
                  isLoading={trendingLoading}
                  onGenerate={handleGenerateFromTopic}
                  getScoreColor={getScoreColor}
                  getSourceBadge={getSourceBadge}
                  isPending={generateMutation.isPending}
                />
              </TabsContent>

              <TabsContent value="anniversaries" className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">Upcoming milestone anniversaries</span>
                  <Button variant="ghost" size="sm" onClick={() => refetchAnniversaries()}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <TopicList
                  topics={anniversaries?.topics || []}
                  isLoading={anniversariesLoading}
                  onGenerate={handleGenerateFromTopic}
                  getScoreColor={getScoreColor}
                  getSourceBadge={getSourceBadge}
                  isPending={generateMutation.isPending}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5" />
                Manual Generation
              </CardTitle>
              <CardDescription>Create a video for a specific historical figure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Historical Figure (e.g., Julius Caesar)"
                value={figure}
                onChange={(e) => setFigure(e.target.value)}
                data-testid="input-figure"
              />
              <Input
                placeholder="Story/Event (e.g., The Pirate Kidnapping)"
                value={story}
                onChange={(e) => setStory(e.target.value)}
                data-testid="input-story"
              />
              <Button
                className="w-full"
                onClick={() => generateMutation.mutate({ figure, story })}
                disabled={!figure || !story || generateMutation.isPending}
                data-testid="button-generate-manual"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Generate Video
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Next Discovery</span>
                <span>{formatDate(status?.nextDiscovery || null)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Next Upload</span>
                <span>{formatDate(status?.nextUpload || null)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Discovery</span>
                <span>{formatDate(status?.lastDiscovery || null)}</span>
              </div>
            </CardContent>
          </Card>

          {/* YouTube Settings Card */}
          <Card data-testid="card-youtube-settings">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiYoutube className="w-5 h-5 text-red-500" />
                YouTube Auto-Upload
              </CardTitle>
              <CardDescription>Automatically upload completed videos to YouTube</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {youtubeLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : !youtubeStatus?.configured ? (
                <div className="text-sm text-muted-foreground">
                  <p>YouTube API not configured.</p>
                  <p className="text-xs mt-1">
                    Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI in secrets.
                  </p>
                </div>
              ) : youtubeStatus?.authenticated ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Connected</p>
                      {youtubeStatus.channel && (
                        <p className="text-xs text-muted-foreground">{youtubeStatus.channel.name}</p>
                      )}
                    </div>
                    {youtubeStatus.channel?.id && (
                      <a
                        href={`https://youtube.com/channel/${youtubeStatus.channel.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        data-testid="link-youtube-channel"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => youtubeDisconnectMutation.mutate()}
                    disabled={youtubeDisconnectMutation.isPending}
                    data-testid="button-disconnect-youtube"
                  >
                    {youtubeDisconnectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Unlink className="w-4 h-4 mr-2" />
                    )}
                    Disconnect
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Videos upload as private. Check your YouTube Studio to review and publish.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                    <XCircle className="w-5 h-5 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">Not Connected</p>
                      <p className="text-xs text-muted-foreground">
                        Connect your YouTube account to enable auto-upload
                      </p>
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleConnectYouTube} data-testid="button-connect-youtube">
                    <Link className="w-4 h-4 mr-2" />
                    Connect YouTube
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => refetchYouTube()} data-testid="button-refresh-youtube">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rumble Settings Card */}
          <Card data-testid="card-rumble-settings">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SiRumble className="w-5 h-5 text-green-500" />
                Rumble Livestream
              </CardTitle>
              <CardDescription>Stream videos to Rumble as livestreams</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rumbleLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : rumbleStatus?.configured ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Connected</p>
                      {rumbleStatus.username && (
                        <p className="text-xs text-muted-foreground">
                          @{rumbleStatus.username} ({rumbleStatus.followers} followers)
                        </p>
                      )}
                    </div>
                    <a
                      href={`https://rumble.com/user/${rumbleStatus.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      data-testid="link-rumble-channel"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Videos will stream as live broadcasts. Go to Rumble Studio to set up your stream first.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                    <XCircle className="w-5 h-5 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">Not Configured</p>
                      <p className="text-xs text-muted-foreground">
                        Set up RTMP credentials to enable Rumble streaming
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Required secrets:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li className={rumbleStatus?.hasRtmpUrl ? 'text-green-500' : ''}>
                        RUMBLE_RTMP_URL {rumbleStatus?.hasRtmpUrl && '✓'}
                      </li>
                      <li className={rumbleStatus?.hasStreamKey ? 'text-green-500' : ''}>
                        RUMBLE_STREAM_KEY {rumbleStatus?.hasStreamKey && '✓'}
                      </li>
                      <li className={rumbleStatus?.hasApiKey ? 'text-green-500' : ''}>
                        RUMBLE_API_KEY (optional) {rumbleStatus?.hasApiKey && '✓'}
                      </li>
                    </ul>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => refetchRumble()} data-testid="button-refresh-rumble">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Recent Videos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                {completedVideos?.videos?.length ? (
                  <div className="space-y-2">
                    {completedVideos.videos.slice(0, 10).map((video, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded border">
                        {video.youtubeId ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : video.videoPath ? (
                          <Video className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        <span className="text-sm truncate flex-1">{video.figure}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4">No videos generated yet</div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="w-5 h-5" />
            Active Jobs
          </CardTitle>
          <CardDescription>Recent and active video generation jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {activeJobs?.jobs && activeJobs.jobs.length > 0 ? (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {activeJobs.jobs.slice(0, 20).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 p-3 rounded border"
                    data-testid={`job-item-${job.id.slice(0, 8)}`}
                  >
                    {job.status === 'processing' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    ) : job.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : job.status === 'failed' ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : job.status === 'queued' ? (
                      <Clock className="w-4 h-4 text-yellow-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{job.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {job.id.slice(0, 8)}...</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          job.status === 'completed'
                            ? 'default'
                            : job.status === 'failed'
                              ? 'destructive'
                              : job.status === 'processing'
                                ? 'secondary'
                                : 'outline'
                        }
                      >
                        {job.status}
                      </Badge>
                      {job.status === 'processing' && (
                        <span className="text-xs text-muted-foreground">{job.progress}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No jobs in the system yet.</p>
              <p className="text-xs">Generate a video to see it here.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* YouTube Analytics Section - only shown when authenticated */}
      {youtubeStatus?.authenticated && (
        <Card data-testid="card-youtube-analytics">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  YouTube Analytics
                </CardTitle>
                <CardDescription>Performance metrics for your uploaded videos</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchAnalytics()}
                disabled={analyticsLoading}
                data-testid="button-refresh-analytics"
              >
                <RefreshCw className={`w-4 h-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Loading analytics...</span>
              </div>
            ) : !youtubeAnalytics?.data ? (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Unable to load analytics.</p>
                <p className="text-xs">Try refreshing or check your YouTube connection.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total Videos</CardDescription>
                      <CardTitle className="text-2xl" data-testid="text-total-videos">
                        {youtubeAnalytics.data.videoCount}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription className="flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Total Views
                      </CardDescription>
                      <CardTitle className="text-2xl" data-testid="text-total-views">
                        {youtubeAnalytics.data.totals.totalViews.toLocaleString()}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription className="flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3" /> Total Likes
                      </CardDescription>
                      <CardTitle className="text-2xl" data-testid="text-total-likes">
                        {youtubeAnalytics.data.totals.totalLikes.toLocaleString()}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> Total Comments
                      </CardDescription>
                      <CardTitle className="text-2xl" data-testid="text-total-comments">
                        {youtubeAnalytics.data.totals.totalComments.toLocaleString()}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                {/* Videos Table */}
                {youtubeAnalytics.data.videos.length > 0 ? (
                  <div className="space-y-3">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[80px]">Thumbnail</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead className="text-right">Views</TableHead>
                            <TableHead className="text-right">Likes</TableHead>
                            <TableHead className="text-right">Comments</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Published</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(showAllVideos
                            ? youtubeAnalytics.data.videos
                            : youtubeAnalytics.data.videos.slice(0, 10)
                          ).map((video) => (
                            <TableRow
                              key={video.videoId}
                              data-testid={`row-video-${video.videoId}`}
                              className="cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => setSelectedVideoId(video.videoId)}
                            >
                              <TableCell>
                                <div className="block">
                                  <img
                                    src={video.thumbnailUrl}
                                    alt={video.title}
                                    className="w-16 h-9 object-cover rounded"
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium line-clamp-2" data-testid={`link-video-${video.videoId}`}>
                                  {video.title}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="flex items-center justify-end gap-1">
                                  <Eye className="w-3 h-3 text-muted-foreground" />
                                  {video.viewCount.toLocaleString()}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="flex items-center justify-end gap-1">
                                  <ThumbsUp className="w-3 h-3 text-muted-foreground" />
                                  {video.likeCount.toLocaleString()}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="flex items-center justify-end gap-1">
                                  <MessageCircle className="w-3 h-3 text-muted-foreground" />
                                  {video.commentCount.toLocaleString()}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={video.privacyStatus === 'public' ? 'default' : 'secondary'}>
                                  {video.privacyStatus}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(video.publishedAt).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Show More/Less buttons */}
                    {youtubeAnalytics.data.videos.length > 10 && (
                      <div className="flex justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAllVideos(!showAllVideos)}
                          data-testid="button-toggle-videos"
                        >
                          {showAllVideos ? (
                            <>
                              <ChevronUp className="w-4 h-4 mr-1" />
                              Show Less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4 mr-1" />
                              Show More ({youtubeAnalytics.data.videos.length - 10} more)
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border rounded-md">
                    <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No videos found on your channel.</p>
                    <p className="text-xs">Upload your first video to see analytics here.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Performance Insights - shows when authenticated and has data */}
      {youtubeStatus?.authenticated && analyticsInsights?.data && (
        <Card data-testid="card-ai-insights">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-500" />
                  AI Performance Insights
                </CardTitle>
                <CardDescription>GPT-powered analysis to improve future videos</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {channelSummary?.data?.recentTrend && (
                  <Badge
                    variant={
                      channelSummary.data.recentTrend === 'up'
                        ? 'default'
                        : channelSummary.data.recentTrend === 'down'
                          ? 'destructive'
                          : 'secondary'
                    }
                    data-testid="badge-trend"
                  >
                    <TrendingUp
                      className={`w-3 h-3 mr-1 ${channelSummary.data.recentTrend === 'down' ? 'rotate-180' : ''}`}
                    />
                    {channelSummary.data.recentTrend === 'up'
                      ? 'Trending Up'
                      : channelSummary.data.recentTrend === 'down'
                        ? 'Trending Down'
                        : 'Stable'}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchInsights()}
                  disabled={insightsLoading}
                  data-testid="button-refresh-insights"
                >
                  <RefreshCw className={`w-4 h-4 ${insightsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Quick Stats */}
              {channelSummary?.data && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-green-600 dark:text-green-400">Viral Videos</CardDescription>
                      <CardTitle className="text-2xl" data-testid="text-viral-count">
                        {channelSummary.data.viralCount}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Avg Engagement</CardDescription>
                      <CardTitle className="text-2xl" data-testid="text-avg-engagement">
                        {channelSummary.data.averageEngagement}%
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total Views</CardDescription>
                      <CardTitle className="text-2xl" data-testid="text-summary-views">
                        {channelSummary.data.totalViews.toLocaleString()}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Top Performer</CardDescription>
                      <CardTitle className="text-sm truncate" data-testid="text-top-performer">
                        {channelSummary.data.topPerformer?.viewCount?.toLocaleString() || 0} views
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>
              )}

              {/* Winning Patterns */}
              {analyticsInsights.data.patterns && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Winning Topics
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-2">
                        {analyticsInsights.data.patterns.winningTopics.slice(0, 5).map((topic, i) => (
                          <Badge key={i} variant="secondary" data-testid={`badge-topic-${i}`}>
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" />
                        Audience Preferences
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-2">
                        {analyticsInsights.data.patterns.audiencePreferences.slice(0, 5).map((pref, i) => (
                          <Badge key={i} variant="outline" data-testid={`badge-pref-${i}`}>
                            {pref}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* AI Recommendations */}
              {analyticsInsights.data.recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      AI Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-2">
                      {analyticsInsights.data.recommendations.slice(0, 5).map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-rec-${i}`}>
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Feedback Loop Status */}
              {analyticsInsights.data.promptEnhancements.length > 0 && (
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-purple-500" />
                      Active Feedback Loop
                    </CardTitle>
                    <CardDescription className="text-xs">
                      These patterns are automatically applied to new video generation prompts
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {analyticsInsights.data.promptEnhancements.slice(0, 4).map((enhancement, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="bg-purple-500/20 text-purple-700 dark:text-purple-300"
                          data-testid={`badge-enhancement-${i}`}
                        >
                          {enhancement}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* A/B Testing - Style Variants */}
      {abTestingData?.data && (
        <Card data-testid="card-ab-testing">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="w-4 h-4 text-purple-500" />
              A/B Testing Active
              <Badge variant="secondary" className="bg-purple-500/20 text-purple-700 dark:text-purple-300">
                <Shuffle className="w-3 h-3 mr-1" />
                {abTestingData.data.variants.length} Styles
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              New videos will randomly use different visual styles to find what performs best
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {abTestingData.data.distribution.map((variant) => (
                <Badge
                  key={variant.id}
                  variant="outline"
                  className="text-xs"
                  data-testid={`badge-variant-${variant.id}`}
                >
                  {variant.name} ({variant.weight}%)
                </Badge>
              ))}
            </div>
            {abTestingData.data.performance.some((p) => p.count > 0) && (
              <div className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium">Best performer:</span>{' '}
                {abTestingData.data.performance
                  .filter((p) => p.count > 0)
                  .sort((a, b) => b.avgEngagement - a.avgEngagement)[0]?.name || 'Collecting data...'}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Performance Rewind - What Really Stands Out */}
      {youtubeStatus?.authenticated && rewindData?.data && (
        <Card data-testid="card-rewind">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  Performance Rewind
                </CardTitle>
                <CardDescription>
                  {rewindData.data.period.start} to {rewindData.data.period.end}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchRewind()}
                disabled={rewindLoading}
                data-testid="button-refresh-rewind"
              >
                <RefreshCw className={`w-4 h-4 ${rewindLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* AI Summary */}
              {rewindData.data.aiSummary && (
                <div className="p-4 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/20">
                  <p className="text-sm italic" data-testid="text-ai-summary">
                    "{rewindData.data.aiSummary}"
                  </p>
                </div>
              )}

              {/* Momentum Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Biggest Gainer */}
                {rewindData.data.momentum.biggestGainer && (
                  <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-green-500" />
                        Top Performer
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="font-medium text-sm truncate" data-testid="text-biggest-gainer">
                        {rewindData.data.momentum.biggestGainer.video.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                          <Eye className="w-3 h-3 mr-1" />
                          {rewindData.data.momentum.biggestGainer.video.viewCount?.toLocaleString() || 0} views
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Viral Rate */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-500" />
                      Viral Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-2xl font-bold" data-testid="text-viral-rate">
                      {rewindData.data.channelStats.viralRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">of videos went viral</p>
                  </CardContent>
                </Card>

                {/* Avg Views */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Avg Views/Video
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-2xl font-bold" data-testid="text-avg-views">
                      {rewindData.data.channelStats.avgViewsPerVideo.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-1 text-xs">
                      {rewindData.data.channelStats.engagementTrend === 'up' && (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                          <ArrowUp className="w-3 h-3" /> Trending Up
                        </Badge>
                      )}
                      {rewindData.data.channelStats.engagementTrend === 'down' && (
                        <Badge variant="secondary" className="bg-red-500/20 text-red-700 dark:text-red-300">
                          <ArrowDown className="w-3 h-3" /> Trending Down
                        </Badge>
                      )}
                      {rewindData.data.channelStats.engagementTrend === 'stable' && (
                        <Badge variant="secondary">Stable</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Standouts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {rewindData.data.standouts.topEngagement && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Best Engagement</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm font-medium truncate">{rewindData.data.standouts.topEngagement.title}</p>
                      <p className="text-xs text-green-600">
                        {rewindData.data.standouts.topEngagement.engagementRate?.toFixed(1)}% engagement
                      </p>
                    </CardContent>
                  </Card>
                )}
                {rewindData.data.standouts.mostCommented && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Most Discussed</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm font-medium truncate">{rewindData.data.standouts.mostCommented.title}</p>
                      <p className="text-xs text-blue-600">
                        {rewindData.data.standouts.mostCommented.commentCount} comments
                      </p>
                    </CardContent>
                  </Card>
                )}
                {rewindData.data.standouts.highestLikeRatio && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Most Liked</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm font-medium truncate">{rewindData.data.standouts.highestLikeRatio.title}</p>
                      <p className="text-xs text-pink-600">
                        {rewindData.data.standouts.highestLikeRatio.likeToViewRatio?.toFixed(1)}% like ratio
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sparklines - Video Trends */}
              {rewindData.data.sparklines.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Weekly Trends</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {rewindData.data.sparklines.slice(0, 5).map((video, i) => (
                        <div key={video.videoId} className="flex items-center gap-3" data-testid={`sparkline-${i}`}>
                          <div className="w-32 truncate text-xs text-muted-foreground">
                            {video.title.slice(0, 20)}...
                          </div>
                          <div className="flex-1 flex items-end gap-0.5 h-6">
                            {video.dataPoints.map((val, j) => {
                              const max = Math.max(...video.dataPoints, 1);
                              const height = (val / max) * 100;
                              return (
                                <div
                                  key={j}
                                  className="flex-1 bg-blue-500/60 rounded-t"
                                  style={{ height: `${Math.max(height, 5)}%` }}
                                />
                              );
                            })}
                          </div>
                          <div className="w-20 text-right text-xs font-medium">
                            {(video.totalViews || 0).toLocaleString()} views
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Rising Stars */}
              {rewindData.data.momentum.risingStars.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-orange-500" />
                      Rising Stars
                    </CardTitle>
                    <CardDescription className="text-xs">Videos gaining momentum but not yet viral</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {rewindData.data.momentum.risingStars.map((star, i) => (
                        <Badge key={i} variant="outline" className="border-orange-500/50">
                          {star.video.title.slice(0, 30)}... ({star.momentum} views/day)
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Creative Analytics - Thumbnail/Title/Hook Performance */}
      <Card data-testid="card-creative-analytics">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Creative Analytics
              </CardTitle>
              <CardDescription>Learn what thumbnails, titles, and hooks drive clicks</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncCreativeMutation.mutate()}
                disabled={syncCreativeMutation.isPending}
                data-testid="button-sync-creative"
              >
                {syncCreativeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sync Data
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => analyzeCreativeMutation.mutate()}
                disabled={analyzeCreativeMutation.isPending}
                data-testid="button-analyze-creative"
              >
                {analyzeCreativeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FlaskConical className="w-4 h-4 mr-2" />
                )}
                Analyze Patterns
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {creativeLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="ml-2">Loading creative analytics...</span>
            </div>
          ) : !creativeAnalytics ? (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No creative data yet.</p>
              <p className="text-xs">Click "Sync Data" to pull YouTube metrics for analysis.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Videos Tracked</CardDescription>
                    <CardTitle className="text-2xl" data-testid="text-videos-tracked">
                      {creativeAnalytics.stats.totalVideosTracked}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>With Performance Data</CardDescription>
                    <CardTitle className="text-2xl" data-testid="text-with-performance">
                      {creativeAnalytics.stats.videosWithPerformance}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Patterns Found</CardDescription>
                    <CardTitle className="text-2xl text-amber-500" data-testid="text-patterns-found">
                      {creativeAnalytics.stats.patternsIdentified}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Last Analysis</CardDescription>
                    <CardTitle className="text-sm" data-testid="text-last-analysis">
                      {creativeAnalytics.stats.lastAnalysis
                        ? new Date(creativeAnalytics.stats.lastAnalysis).toLocaleDateString()
                        : 'Never'}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Winning Formulas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Thumbnail Winners */}
                <Card className="border-amber-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-amber-500" />
                      Thumbnail Formulas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {creativeAnalytics.formulas.thumbnail.slice(0, 3).map((formula, i) => (
                        <div key={i} className="text-xs p-2 bg-amber-500/5 rounded border border-amber-500/10">
                          {formula}
                        </div>
                      ))}
                    </div>
                    {creativeAnalytics.stats.topThumbnailPattern && (
                      <Badge variant="secondary" className="mt-2 bg-amber-500/20">
                        Top: {creativeAnalytics.stats.topThumbnailPattern.slice(0, 40)}...
                      </Badge>
                    )}
                  </CardContent>
                </Card>

                {/* Title Winners */}
                <Card className="border-blue-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Type className="w-4 h-4 text-blue-500" />
                      Title Formulas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {creativeAnalytics.formulas.title.slice(0, 3).map((formula, i) => (
                        <div key={i} className="text-xs p-2 bg-blue-500/5 rounded border border-blue-500/10">
                          {formula}
                        </div>
                      ))}
                    </div>
                    {creativeAnalytics.stats.topTitlePattern && (
                      <Badge variant="secondary" className="mt-2 bg-blue-500/20">
                        Top: {creativeAnalytics.stats.topTitlePattern.slice(0, 40)}...
                      </Badge>
                    )}
                  </CardContent>
                </Card>

                {/* Hook Winners */}
                <Card className="border-green-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-green-500" />
                      Hook Formulas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {creativeAnalytics.formulas.hook.slice(0, 3).map((formula, i) => (
                        <div key={i} className="text-xs p-2 bg-green-500/5 rounded border border-green-500/10">
                          {formula}
                        </div>
                      ))}
                    </div>
                    {creativeAnalytics.stats.topHookPattern && (
                      <Badge variant="secondary" className="mt-2 bg-green-500/20">
                        Top: {creativeAnalytics.stats.topHookPattern.slice(0, 40)}...
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* AI Recommendations */}
              {creativeAnalytics.insights?.recommendations && creativeAnalytics.insights.recommendations.length > 0 && (
                <Card className="bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      AI Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1">
                      {creativeAnalytics.insights.recommendations.map((rec, i) => (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <ArrowRight className="w-3 h-3 mt-0.5 text-amber-500 flex-shrink-0" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Thumbnail A/B Testing */}
              <Card className="border-purple-500/20" data-testid="card-thumbnail-ab-testing">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-purple-500" />
                        Thumbnail A/B Testing
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Testing different thumbnail styles to find what gets the most clicks
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => recalculateWeightsMutation.mutate()}
                      disabled={recalculateWeightsMutation.isPending}
                      data-testid="button-recalculate-weights"
                    >
                      {recalculateWeightsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Update Weights
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {thumbnailVariantsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : !thumbnailVariants ? (
                    <p className="text-xs text-muted-foreground">No variant data yet</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Summary */}
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-muted-foreground">{thumbnailVariants.totalVideos} videos tested</span>
                        {thumbnailVariants.leadingVariant && (
                          <Badge variant="secondary" className="bg-purple-500/20">
                            <Trophy className="w-3 h-3 mr-1" />
                            Leader: {thumbnailVariants.leadingVariant}
                          </Badge>
                        )}
                        {!thumbnailVariants.hasEnoughData && (
                          <Badge variant="outline" className="text-amber-500 border-amber-500/50">
                            Need more data
                          </Badge>
                        )}
                      </div>

                      {/* Variant Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                        {thumbnailVariants.variants.map((variant) => (
                          <Card
                            key={variant.id}
                            className={`p-3 ${variant.isLeading ? 'border-purple-500 bg-purple-500/5' : ''}`}
                            data-testid={`card-variant-${variant.id}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium flex items-center gap-1">
                                {variant.isLeading && <Trophy className="w-3 h-3 text-purple-500" />}
                                {variant.name}
                              </span>
                              <Badge variant="outline" className="text-xs px-1.5 py-0">
                                {variant.weight}%
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{variant.description}</p>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{variant.videoCount} videos</span>
                              {variant.avgCtr > 0 ? (
                                <span className={`font-medium ${variant.isLeading ? 'text-purple-500' : ''}`}>
                                  {variant.avgCtr.toFixed(1)}% CTR
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </Card>
                        ))}
                      </div>

                      <p className="text-xs text-muted-foreground mt-2">
                        Higher performing variants automatically get assigned to more videos. Minimum 5% kept for each
                        to continue testing.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pattern Intelligence Analytics */}
      <Card data-testid="card-pattern-intelligence">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-violet-500" />
                Pattern Intelligence
              </CardTitle>
              <CardDescription>AI-discovered themes that explain WHY videos succeed</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => clusteringMutation.mutate(true)}
                disabled={clusteringMutation.isPending}
                data-testid="button-run-clustering"
              >
                {clusteringMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FlaskConical className="w-4 h-4 mr-2" />
                )}
                Re-cluster Now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchPatternThemes()}
                disabled={patternThemesLoading}
                data-testid="button-refresh-patterns"
              >
                <RefreshCw className={`w-4 h-4 ${patternThemesLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {patternThemesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="ml-2">Loading pattern intelligence...</span>
            </div>
          ) : patternThemes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No patterns discovered yet.</p>
              <p className="text-xs">Click "Run Clustering" after you have some video performance data.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Themes</CardDescription>
                    <CardTitle className="text-2xl" data-testid="text-total-themes">
                      {patternAnalytics?.themeCount || patternThemes.length}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1">
                      <span>Proven</span>
                    </CardDescription>
                    <CardTitle className="text-2xl text-green-600" data-testid="text-proven-count">
                      {patternAnalytics?.categories?.proven ||
                        patternThemes.filter((t) => t.category === 'proven').length}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Neutral</CardDescription>
                    <CardTitle className="text-2xl" data-testid="text-neutral-count">
                      {patternAnalytics?.categories?.neutral ||
                        patternThemes.filter((t) => t.category === 'neutral').length}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Emerging</CardDescription>
                    <CardTitle className="text-2xl text-blue-500" data-testid="text-emerging-count">
                      {patternAnalytics?.categories?.emerging ||
                        patternThemes.filter((t) => t.category === 'emerging').length}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                  <CardHeader className="pb-2">
                    <CardDescription>Failing</CardDescription>
                    <CardTitle className="text-2xl text-red-500" data-testid="text-failing-count">
                      {patternAnalytics?.categories?.failing ||
                        patternThemes.filter((t) => t.category === 'failing').length}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>A/B Holdout</CardDescription>
                    <CardTitle className="text-lg" data-testid="text-holdout-rate">
                      {patternAnalytics?.holdoutRate || 15}%
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Last Clustering Time */}
              {patternAnalytics?.lastClusteringTime && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Last clustering: {new Date(patternAnalytics.lastClusteringTime).toLocaleString()}
                </div>
              )}

              {/* Learning Status Indicator - Shows what's actively being applied */}
              {patternThemes.filter((t) => t.category === 'proven').length > 0 && (
                <Card
                  className="bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-violet-500/30"
                  data-testid="card-learning-status"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Learning Active
                      <Badge variant="outline" className="border-green-500/50 text-green-600 text-xs">
                        Feedback Loop Running
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      These themes are being injected into every new video prompt
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-green-600 dark:text-green-400">
                        🔥 Currently Applied to New Content:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {patternThemes
                          .filter((t) => t.category === 'proven')
                          .slice(0, 3)
                          .map((theme) => (
                            <Badge
                              key={theme.id}
                              variant="secondary"
                              className="bg-green-500/20 text-green-700 dark:text-green-300 text-xs"
                              data-testid={`badge-applied-theme-${theme.id}`}
                            >
                              {theme.name} ({theme.successRate.toFixed(0)}%)
                            </Badge>
                          ))}
                      </div>
                      {patternThemes.filter((t) => t.category === 'failing').length > 0 && (
                        <>
                          <div className="text-xs font-medium text-red-600 dark:text-red-400 mt-2">
                            ⛔ Actively Avoiding:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {patternThemes
                              .filter((t) => t.category === 'failing')
                              .slice(0, 2)
                              .map((theme) => (
                                <Badge
                                  key={theme.id}
                                  variant="outline"
                                  className="border-red-500/50 text-red-600 text-xs"
                                  data-testid={`badge-avoided-theme-${theme.id}`}
                                >
                                  {theme.name} ({theme.successRate.toFixed(0)}%)
                                </Badge>
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Collapsible Category Sections */}
              <div className="space-y-4">
                {/* Proven Themes */}
                {patternThemes.filter((t) => t.category === 'proven').length > 0 && (
                  <Collapsible
                    open={expandedCategories.proven}
                    onOpenChange={(open) => setExpandedCategories((prev) => ({ ...prev, proven: open }))}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between p-4 h-auto bg-green-500/10 hover:bg-green-500/20"
                        data-testid="button-toggle-proven"
                      >
                        <span className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
                          <span className="text-lg">🔥</span>
                          Proven Themes (50%+ success)
                          <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                            {patternThemes.filter((t) => t.category === 'proven').length}
                          </Badge>
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${expandedCategories.proven ? 'rotate-180' : ''}`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-3">
                      {patternThemes
                        .filter((t) => t.category === 'proven')
                        .map((theme) => (
                          <ThemeCard
                            key={theme.id}
                            theme={theme}
                            expanded={expandedThemes[theme.id] || false}
                            onToggle={() => setExpandedThemes((prev) => ({ ...prev, [theme.id]: !prev[theme.id] }))}
                          />
                        ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Neutral Themes */}
                {patternThemes.filter((t) => t.category === 'neutral').length > 0 && (
                  <Collapsible
                    open={expandedCategories.neutral}
                    onOpenChange={(open) => setExpandedCategories((prev) => ({ ...prev, neutral: open }))}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between p-4 h-auto bg-muted/50 hover:bg-muted"
                        data-testid="button-toggle-neutral"
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          <span className="text-lg">⚖️</span>
                          Neutral Themes (35-50% success)
                          <Badge variant="secondary">
                            {patternThemes.filter((t) => t.category === 'neutral').length}
                          </Badge>
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${expandedCategories.neutral ? 'rotate-180' : ''}`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-3">
                      {patternThemes
                        .filter((t) => t.category === 'neutral')
                        .map((theme) => (
                          <ThemeCard
                            key={theme.id}
                            theme={theme}
                            expanded={expandedThemes[theme.id] || false}
                            onToggle={() => setExpandedThemes((prev) => ({ ...prev, [theme.id]: !prev[theme.id] }))}
                          />
                        ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Emerging Themes */}
                {patternThemes.filter((t) => t.category === 'emerging').length > 0 && (
                  <Collapsible
                    open={expandedCategories.emerging}
                    onOpenChange={(open) => setExpandedCategories((prev) => ({ ...prev, emerging: open }))}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between p-4 h-auto bg-blue-500/10 hover:bg-blue-500/20"
                        data-testid="button-toggle-emerging"
                      >
                        <span className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-400">
                          <span className="text-lg">📊</span>
                          Emerging Themes (testing phase)
                          <Badge variant="secondary" className="bg-blue-500/20 text-blue-700 dark:text-blue-300">
                            {patternThemes.filter((t) => t.category === 'emerging').length}
                          </Badge>
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${expandedCategories.emerging ? 'rotate-180' : ''}`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-3">
                      {patternThemes
                        .filter((t) => t.category === 'emerging')
                        .map((theme) => (
                          <ThemeCard
                            key={theme.id}
                            theme={theme}
                            expanded={expandedThemes[theme.id] || false}
                            onToggle={() => setExpandedThemes((prev) => ({ ...prev, [theme.id]: !prev[theme.id] }))}
                          />
                        ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Failing Themes */}
                {patternThemes.filter((t) => t.category === 'failing').length > 0 && (
                  <Collapsible
                    open={expandedCategories.failing}
                    onOpenChange={(open) => setExpandedCategories((prev) => ({ ...prev, failing: open }))}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between p-4 h-auto bg-red-500/10 hover:bg-red-500/20"
                        data-testid="button-toggle-failing"
                      >
                        <span className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
                          <span className="text-lg">⛔</span>
                          Failing Themes (&lt;35% success)
                          <Badge variant="secondary" className="bg-red-500/20 text-red-700 dark:text-red-300">
                            {patternThemes.filter((t) => t.category === 'failing').length}
                          </Badge>
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${expandedCategories.failing ? 'rotate-180' : ''}`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-3">
                      {patternThemes
                        .filter((t) => t.category === 'failing')
                        .map((theme) => (
                          <ThemeCard
                            key={theme.id}
                            theme={theme}
                            expanded={expandedThemes[theme.id] || false}
                            onToggle={() => setExpandedThemes((prev) => ({ ...prev, [theme.id]: !prev[theme.id] }))}
                          />
                        ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pendingTopics?.topics && pendingTopics.topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Generation Queue</CardTitle>
            <CardDescription>Topics waiting to be converted into videos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingTopics.topics.map((topic, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold">{topic.figure}</h3>
                    <span className={`text-lg font-bold ${getScoreColor(topic.viralScore)}`}>
                      {topic.viralScore.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{topic.hook}</p>
                  <div className="mt-2 flex items-center gap-2">{getSourceBadge(topic.source)}</div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video Insights Modal */}
      <VideoInsightsModal
        videoId={selectedVideoId}
        insights={videoInsightsResponse?.data || null}
        isLoading={insightsVideoLoading}
        isError={insightsVideoError}
        onClose={() => setSelectedVideoId(null)}
      />
    </div>
  );
}

interface TopicListProps {
  topics: TopicCandidate[];
  isLoading: boolean;
  onGenerate: (topic: TopicCandidate) => void;
  getScoreColor: (score: number) => string;
  getSourceBadge: (source: string) => JSX.Element;
  isPending: boolean;
}

function TopicList({ topics, isLoading, onGenerate, getScoreColor, getSourceBadge, isPending }: TopicListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Finding topics...</span>
      </div>
    );
  }

  if (!topics.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No topics found. Click refresh to discover new topics.
      </div>
    );
  }

  return (
    <ScrollArea className="h-80">
      <div className="space-y-3">
        {topics.map((topic, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{topic.figure}</h3>
                  <span className={`text-sm font-bold ${getScoreColor(topic.viralScore)}`}>
                    {topic.viralScore.toFixed(1)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{topic.hook}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{topic.whyNow}</p>
                <div className="mt-2">{getSourceBadge(topic.source)}</div>
              </div>
              <Button
                size="sm"
                onClick={() => onGenerate(topic)}
                disabled={isPending}
                data-testid={`button-generate-topic-${i}`}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

interface ThemeCardProps {
  theme: DashboardTheme;
  expanded: boolean;
  onToggle: () => void;
}

function ThemeCard({ theme, expanded, onToggle }: ThemeCardProps) {
  const getSuccessRateColor = (rate: number) => {
    if (rate >= 50) return 'text-green-600 dark:text-green-400';
    if (rate >= 35) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getSuccessRateBg = (rate: number) => {
    if (rate >= 50) return 'bg-green-500/20';
    if (rate >= 35) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  return (
    <Card className="p-4" data-testid={`card-theme-${theme.id}`}>
      <div className="space-y-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg" aria-label={theme.category}>
                {theme.categoryIcon}
              </span>
              <h4 className="font-semibold" data-testid={`text-theme-name-${theme.id}`}>
                {theme.name}
              </h4>
              <Badge
                variant="secondary"
                className={getSuccessRateBg(theme.successRate)}
                data-testid={`badge-success-rate-${theme.id}`}
              >
                <span className={getSuccessRateColor(theme.successRate)}>{theme.successRate.toFixed(0)}%</span>
                <span className="text-muted-foreground ml-1">({theme.sampleCount} videos)</span>
              </Badge>
              <span className="text-sm" title={theme.trend} data-testid={`text-trend-${theme.id}`}>
                {theme.trendIcon}
              </span>
            </div>
          </div>
        </div>

        {/* WHY Explanation - Honest labeling based on actual performance */}
        <div
          className={`bg-muted/50 rounded-md p-3 border-l-4 ${
            theme.category === 'proven'
              ? 'border-green-500'
              : theme.category === 'neutral'
                ? 'border-yellow-500'
                : theme.category === 'failing'
                  ? 'border-red-500'
                  : 'border-violet-500'
          }`}
        >
          <p
            className={`text-sm font-medium mb-1 ${
              theme.category === 'proven'
                ? 'text-green-700 dark:text-green-300'
                : theme.category === 'neutral'
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : theme.category === 'failing'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-violet-700 dark:text-violet-300'
            }`}
          >
            {theme.category === 'proven'
              ? 'Why it works:'
              : theme.category === 'neutral'
                ? 'Possible reason:'
                : theme.category === 'failing'
                  ? 'Theory (not proven by data):'
                  : 'Testing hypothesis:'}
          </p>
          <p className="text-sm text-muted-foreground" data-testid={`text-why-${theme.id}`}>
            {theme.whyItWorks}
          </p>
          {theme.category === 'failing' && theme.sampleCount > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Data shows this theme is underperforming. Consider avoiding.
            </p>
          )}
          {theme.category === 'emerging' && theme.sampleCount < 3 && (
            <p className="text-xs text-muted-foreground mt-2">
              Needs more data to confirm. Currently testing with {theme.sampleCount} video
              {theme.sampleCount !== 1 ? 's' : ''}.
            </p>
          )}
        </div>

        {/* Description */}
        {theme.description && <p className="text-sm text-muted-foreground">{theme.description}</p>}

        {/* Examples */}
        {theme.examples.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {theme.examples.slice(0, 4).map((example, i) => (
              <Badge key={i} variant="outline" className="text-xs" data-testid={`badge-example-${theme.id}-${i}`}>
                {example}
              </Badge>
            ))}
          </div>
        )}

        {/* Contributing Videos - Collapsible */}
        {theme.contributingVideos.length > 0 && (
          <Collapsible open={expanded} onOpenChange={onToggle}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-xs"
                data-testid={`button-toggle-videos-${theme.id}`}
              >
                <span className="flex items-center gap-1">
                  <Video className="w-3 h-3" />
                  {theme.contributingVideos.length} Contributing Videos
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="space-y-1 pl-4 border-l-2 border-muted">
                {theme.contributingVideos.map((video, i) => (
                  <div
                    key={video.videoId || i}
                    className="flex items-center justify-between gap-2 text-xs py-1"
                    data-testid={`row-video-${theme.id}-${i}`}
                  >
                    <span className="truncate flex-1">
                      {video.wasSuccess ? (
                        <CheckCircle className="w-3 h-3 inline mr-1 text-green-500" />
                      ) : (
                        <XCircle className="w-3 h-3 inline mr-1 text-red-500" />
                      )}
                      {video.title}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                      <Eye className="w-3 h-3" />
                      {video.views.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Anti-patterns (what to avoid) */}
        {theme.antiPatterns.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="text-red-500 font-medium">Avoid:</span> {theme.antiPatterns.slice(0, 3).join(', ')}
          </div>
        )}
      </div>
    </Card>
  );
}

// Video Insights Modal Component
interface VideoInsightsModalProps {
  videoId: string | null;
  insights: VideoInsights | null;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}

function VideoInsightsModal({ videoId, insights, isLoading, isError, onClose }: VideoInsightsModalProps) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'proven':
        return '🔥';
      case 'neutral':
        return '⚖️';
      case 'emerging':
        return '📊';
      case 'failing':
        return '⛔';
      default:
        return '📊';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <ArrowUp className="w-3 h-3 text-green-500" />;
      case 'declining':
        return <ArrowDown className="w-3 h-3 text-red-500" />;
      default:
        return <span className="text-muted-foreground">→</span>;
    }
  };

  const getPerformanceTierBadge = (tier: string) => {
    const config: Record<
      string,
      { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: JSX.Element; label: string }
    > = {
      viral: { variant: 'default', icon: <Flame className="w-3 h-3 mr-1" />, label: 'Viral' },
      high: { variant: 'default', icon: <Trophy className="w-3 h-3 mr-1" />, label: 'High' },
      medium: { variant: 'secondary', icon: <Star className="w-3 h-3 mr-1" />, label: 'Medium' },
      low: { variant: 'outline', icon: <ArrowDown className="w-3 h-3 mr-1" />, label: 'Low' },
      new: { variant: 'secondary', icon: <Sparkles className="w-3 h-3 mr-1" />, label: 'New' },
    };
    const c = config[tier] || config.new;
    return (
      <Badge variant={c.variant} data-testid="badge-performance-tier">
        {c.icon}
        {c.label}
      </Badge>
    );
  };

  const getCategoryTransition = (from: string, to: string) => {
    if (from === to) return null;
    const fromIcon = getCategoryIcon(from);
    const toIcon = getCategoryIcon(to);

    let message = '';
    if (from === 'emerging' && to === 'proven') {
      message = 'This video helped prove this theme';
    } else if (from === 'proven' && to === 'failing') {
      message = 'Theme declined after this video';
    } else if (from === 'neutral' && to === 'proven') {
      message = 'Theme became proven';
    } else if (from === 'neutral' && to === 'failing') {
      message = 'Theme started failing';
    } else {
      message = 'Category changed';
    }

    return (
      <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
        {fromIcon}→{toIcon} {message}
      </span>
    );
  };

  const getSuccessRateChange = (was: number, now: number) => {
    const diff = now - was;
    const sign = diff >= 0 ? '+' : '';
    const color =
      diff > 0
        ? 'text-green-600 dark:text-green-400'
        : diff < 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-muted-foreground';
    return (
      <span className="text-xs">
        Was {was.toFixed(0)}% → Now {now.toFixed(0)}%{' '}
        <span className={color}>
          ({sign}
          {diff.toFixed(0)}%)
        </span>
      </span>
    );
  };

  return (
    <Dialog open={!!videoId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-video-insights">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-video-title">
            <Video className="w-5 h-5" />
            {isLoading ? 'Loading...' : insights?.title || 'Video Insights'}
          </DialogTitle>
          <DialogDescription>Complete audit trail for this video's theme usage and performance</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="text-center py-8 text-muted-foreground">
            <XCircle className="w-12 h-12 mx-auto mb-3 text-red-500 opacity-70" />
            <p className="font-medium text-red-600 dark:text-red-400">Failed to load insights</p>
            <p className="text-sm">There was an error fetching video insights. Please try again.</p>
            <Button variant="outline" className="mt-4" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : !insights ? (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No insights available</p>
            <p className="text-sm">This video may not have theme tracking data yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Video Info & Link */}
            <div className="flex items-start gap-4">
              <a
                href={`https://youtube.com/watch?v=${insights.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-24 h-14 bg-muted rounded-md flex items-center justify-center overflow-hidden">
                  <SiYoutube className="w-8 h-8 text-red-500" />
                </div>
              </a>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {getPerformanceTierBadge(insights.performanceTier)}
                  {insights.wasInHoldout && (
                    <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30">
                      <FlaskConical className="w-3 h-3 mr-1" />
                      Holdout Group
                    </Badge>
                  )}
                </div>
                <a
                  href={`https://youtube.com/watch?v=${insights.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" />
                  Watch on YouTube
                </a>
              </div>
            </div>

            {/* Performance Metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="text-center p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <Eye className="w-3 h-3" /> Views
                    </div>
                    <div className="text-lg font-semibold">{insights.metrics.views.toLocaleString()}</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <ThumbsUp className="w-3 h-3" /> Likes
                    </div>
                    <div className="text-lg font-semibold">{insights.metrics.likes.toLocaleString()}</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <MessageCircle className="w-3 h-3" /> Comments
                    </div>
                    <div className="text-lg font-semibold">{insights.metrics.comments.toLocaleString()}</div>
                  </div>
                  {insights.metrics.shares !== undefined && (
                    <div className="text-center p-3 bg-muted/50 rounded-md">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                        <Share2 className="w-3 h-3" /> Shares
                      </div>
                      <div className="text-lg font-semibold">{insights.metrics.shares.toLocaleString()}</div>
                    </div>
                  )}
                  <div className="text-center p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <TrendingUp className="w-3 h-3" /> Engagement
                    </div>
                    <div className="text-lg font-semibold">{insights.metrics.engagementRate.toFixed(1)}%</div>
                  </div>
                </div>
                {(insights.metrics.estimatedCTR ||
                  insights.metrics.estimatedAVD ||
                  insights.metrics.watchTimeMinutes ||
                  insights.metrics.averageViewPercentage ||
                  insights.metrics.impressions) && (
                  <div className="mt-3 pt-3 border-t flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {insights.metrics.estimatedCTR !== undefined && (
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        CTR: {insights.metrics.estimatedCTR.toFixed(1)}%
                      </span>
                    )}
                    {insights.metrics.estimatedAVD !== undefined && (
                      <span className="flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        Avg Duration: {Math.floor(insights.metrics.estimatedAVD / 60)}m{' '}
                        {Math.floor(insights.metrics.estimatedAVD % 60)}s
                      </span>
                    )}
                    {insights.metrics.watchTimeMinutes !== undefined && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Watch Time: {insights.metrics.watchTimeMinutes.toLocaleString()} min
                      </span>
                    )}
                    {insights.metrics.averageViewPercentage !== undefined && (
                      <span className="flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        Avg View: {insights.metrics.averageViewPercentage.toFixed(1)}%
                      </span>
                    )}
                    {insights.metrics.impressions !== undefined && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        Impressions: {insights.metrics.impressions.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subscriber Impact */}
            {(insights.metrics.subscribersGained !== undefined || insights.metrics.subscribersLost !== undefined) && (
              <Card data-testid="card-subscriber-impact">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Subscriber Impact
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    {insights.metrics.subscribersGained !== undefined && (
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-green-500/10 rounded-md">
                          <UserPlus className="w-4 h-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                            +{insights.metrics.subscribersGained.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">Gained</div>
                        </div>
                      </div>
                    )}
                    {insights.metrics.subscribersLost !== undefined && insights.metrics.subscribersLost > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-red-500/10 rounded-md">
                          <UserMinus className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                            -{insights.metrics.subscribersLost.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">Lost</div>
                        </div>
                      </div>
                    )}
                    {insights.metrics.subscribersGained !== undefined &&
                      insights.metrics.subscribersLost !== undefined && (
                        <div className="flex items-center gap-2 ml-auto">
                          <div className="text-sm text-muted-foreground">Net:</div>
                          <Badge
                            variant={
                              insights.metrics.subscribersGained - insights.metrics.subscribersLost >= 0
                                ? 'default'
                                : 'destructive'
                            }
                          >
                            {insights.metrics.subscribersGained - insights.metrics.subscribersLost >= 0 ? '+' : ''}
                            {(insights.metrics.subscribersGained - insights.metrics.subscribersLost).toLocaleString()}
                          </Badge>
                        </div>
                      )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Traffic Sources */}
            {insights.trafficSources &&
              Object.keys(insights.trafficSources).some(
                (k) => (insights.trafficSources as any)[k] !== undefined && (insights.trafficSources as any)[k] > 0,
              ) && (
                <Card data-testid="card-traffic-sources">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Traffic Sources
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { key: 'browse', label: 'Browse/Home', icon: Eye },
                        { key: 'search', label: 'YouTube Search', icon: Search },
                        { key: 'suggested', label: 'Suggested Videos', icon: Sparkles },
                        { key: 'external', label: 'External Sites', icon: ExternalLink },
                        { key: 'direct', label: 'Direct/Unknown', icon: Link },
                        { key: 'notifications', label: 'Notifications', icon: Zap },
                        { key: 'playlists', label: 'Playlists', icon: Video },
                      ].map(({ key, label, icon: Icon }) => {
                        const value = (insights.trafficSources as any)?.[key];
                        if (value === undefined || value <= 0) return null;
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm truncate">{label}</span>
                                <span className="text-sm font-medium shrink-0">{value.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${Math.min(value, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Applied Themes Section */}
            <div data-testid="section-applied-themes">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Applied Themes
                <Badge variant="secondary" className="text-xs">
                  {insights.appliedThemes.length}
                </Badge>
              </h3>
              {insights.appliedThemes.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-md text-center">
                  No themes were tracked when this video was generated.
                </div>
              ) : (
                <div className="space-y-3">
                  {insights.appliedThemes.map((theme) => (
                    <Card key={theme.themeId} className="p-4" data-testid={`card-theme-${theme.themeId}`}>
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg">{getCategoryIcon(theme.currentCategory)}</span>
                            <span className="font-medium">{theme.themeName}</span>
                            <div className="flex items-center gap-1">{getTrendIcon(theme.trend)}</div>
                          </div>
                          <Badge
                            variant="secondary"
                            className={
                              theme.currentSuccessRate >= 50
                                ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                                : theme.currentSuccessRate >= 35
                                  ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                                  : 'bg-red-500/20 text-red-700 dark:text-red-300'
                            }
                          >
                            {theme.currentSuccessRate.toFixed(0)}%
                          </Badge>
                        </div>

                        {/* Category Change Indicator */}
                        {theme.categoryAtGeneration !== theme.currentCategory && (
                          <div className="flex items-center gap-2">
                            {getCategoryTransition(theme.categoryAtGeneration, theme.currentCategory)}
                          </div>
                        )}

                        {/* Success Rate Change */}
                        <div className="text-muted-foreground">
                          {getSuccessRateChange(theme.successRateAtGeneration, theme.currentSuccessRate)}
                        </div>

                        {/* Why It Works */}
                        <div className="bg-violet-500/10 rounded-md p-2 border-l-3 border-violet-500">
                          <p className="text-xs text-muted-foreground">{theme.whyItWorks}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Contributed Themes Section */}
            <div data-testid="section-contributed-themes">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Contributed Themes
                <Badge variant="secondary" className="text-xs">
                  {insights.contributedThemes.length}
                </Badge>
              </h3>
              {insights.contributedThemes.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-md text-center">
                  No theme contributions recorded yet. Analytics data may still be processing.
                </div>
              ) : (
                <div className="space-y-2">
                  {insights.contributedThemes.map((contrib) => (
                    <div
                      key={contrib.themeId}
                      className={`flex items-center justify-between gap-2 p-3 rounded-md ${
                        contrib.signal === 'positive' ? 'bg-green-500/10' : 'bg-red-500/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {contrib.signal === 'positive' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="font-medium">{contrib.themeName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{contrib.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Metadata Footer */}
            <div className="pt-4 border-t text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Generated: {insights.generatedAt ? new Date(insights.generatedAt).toLocaleDateString() : 'Unknown'}
              </span>
              {insights.packageId && <span>Package: {insights.packageId.slice(0, 8)}...</span>}
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={onClose} data-testid="button-close-insights">
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
