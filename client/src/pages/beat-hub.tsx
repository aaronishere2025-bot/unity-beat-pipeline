import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import BeatPlayer from '@/components/BeatPlayer';
import {
  Store,
  Music,
  Wand2,
  Sparkles,
  TrendingUp,
  DollarSign,
  Eye,
  ShoppingCart,
  Music2,
  Loader2,
  ExternalLink,
  BarChart3,
  Copy,
  Check,
  Plus,
  Search,
  Filter,
  Clock,
  Tag,
  Zap,
  Settings,
  Info,
  CheckCircle2,
  Play,
  XCircle,
  Film,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';

// ============================================================================
// INTERFACES
// ============================================================================

interface BeatListing {
  id: string;
  beatName: string;
  description: string | null;
  priceUSD: string;
  stripePaymentLinkUrl: string;
  views: number;
  purchases: number;
  totalRevenueUSD: string;
  isGenerated: boolean;
  active: boolean;
  createdAt: string;
}

interface Analytics {
  totalListings: number;
  activeListings: number;
  totalSales: number;
  totalRevenue: string;
  totalViews: number;
  conversionRate: string;
  avgRevenuePerListing: string;
}

interface Beat {
  id: string;
  beatName: string;
  description: string | null;
  priceUSD: string;
  stripePaymentLinkUrl: string;
  views: number;
  purchases: number;
  isGenerated: boolean;
  audioUrl?: string;
  bpm?: number;
  key?: string;
  duration?: number;
  createdAt: string;
  tags?: string[];
}

interface BeatVideo {
  id: string;
  title: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  bpm?: number;
  key?: string;
}

type SortOption = 'newest' | 'popular' | 'price-low' | 'price-high';
type FilterOption = 'all' | 'generated' | 'uploaded';
type GenerateMode = 'single' | 'batch' | 'custom';

// Beat style presets
const BEAT_PRESETS = {
  trap: {
    name: 'Trap',
    description: 'Hard-hitting 808s, hi-hats, and aggressive percussion',
    icon: '🔥',
    bpmRange: [140, 160] as [number, number],
    defaultBpm: 150,
    tags: ['trap', 'hip-hop', 'aggressive'],
    style: 'Dark and aggressive trap beat with heavy bass',
  },
  lofi: {
    name: 'Lo-Fi',
    description: 'Chill, relaxing beats with vinyl crackle',
    icon: '🌙',
    bpmRange: [70, 90] as [number, number],
    defaultBpm: 80,
    tags: ['lofi', 'chill', 'study'],
    style: 'Lo-fi hip hop beat with jazzy chords and vinyl texture',
  },
  boom_bap: {
    name: 'Boom Bap',
    description: 'Classic 90s hip-hop drums and samples',
    icon: '🎧',
    bpmRange: [85, 95] as [number, number],
    defaultBpm: 90,
    tags: ['boom-bap', 'hip-hop', 'classic'],
    style: '90s style boom bap beat with punchy drums',
  },
  drill: {
    name: 'Drill',
    description: 'Dark, menacing drill with sliding 808s',
    icon: '⚡',
    bpmRange: [135, 145] as [number, number],
    defaultBpm: 140,
    tags: ['drill', 'dark', 'aggressive'],
    style: 'Dark drill beat with sliding 808s and hard-hitting percussion',
  },
  ambient: {
    name: 'Ambient',
    description: 'Atmospheric, ethereal soundscapes',
    icon: '✨',
    bpmRange: [60, 80] as [number, number],
    defaultBpm: 70,
    tags: ['ambient', 'atmospheric', 'chill'],
    style: 'Ambient atmospheric beat with ethereal pads and textures',
  },
  custom: {
    name: 'Custom',
    description: 'Create your own unique style',
    icon: '🎨',
    bpmRange: [60, 180] as [number, number],
    defaultBpm: 120,
    tags: [],
    style: '',
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function BeatHub() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Tab state (from URL parameter)
  const urlParams = new URLSearchParams(window.location.search);
  const [activeTab, setActiveTab] = useState(urlParams.get('tab') || 'my-beats');

  // Shared analytics state
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  // My Beats tab state
  const [listings, setListings] = useState<BeatListing[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [beatName, setBeatName] = useState('');
  const [listingDescription, setListingDescription] = useState('');
  const [listingPrice, setListingPrice] = useState('9.99');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Marketplace tab state
  const [beats, setBeats] = useState<Beat[]>([]);
  const [filteredBeats, setFilteredBeats] = useState<Beat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  // Generate tab state
  const [generateMode, setGenerateMode] = useState<GenerateMode>(() => {
    // Remember last mode from localStorage
    const saved = localStorage.getItem('beatGenerateMode');
    return (saved as GenerateMode) || 'single';
  });
  const [expandGenerateMode, setExpandGenerateMode] = useState(false);
  const [preset, setPreset] = useState<keyof typeof BEAT_PRESETS>('trap');
  const [customStyle, setCustomStyle] = useState('');
  const [genBeatDescription, setGenBeatDescription] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState(BEAT_PRESETS.trap.defaultBpm);
  const [duration, setDuration] = useState(180);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [includeVisuals, setIncludeVisuals] = useState(true);
  const [autoListForSale, setAutoListForSale] = useState(false);
  const [price, setPrice] = useState('9.99');
  const [batchCount, setBatchCount] = useState(5);
  const [randomizeStyles, setRandomizeStyles] = useState(false);
  const [randomizeDurations, setRandomizeDurations] = useState(false);

  // Custom configuration mode state
  interface CustomBeatConfig {
    id: string;
    style: keyof typeof BEAT_PRESETS;
    duration: number;
    bpm: number;
  }
  const [customBeats, setCustomBeats] = useState<CustomBeatConfig[]>([
    { id: '1', style: 'trap', duration: 180, bpm: BEAT_PRESETS.trap.defaultBpm },
  ]);

  // History tab state
  const [generating, setGenerating] = useState(false);

  // History tab - fetch recent beat videos
  const { data: beatVideos, refetch: refetchBeatVideos } = useQuery<BeatVideo[]>({
    queryKey: ['/api/beats/list'],
    refetchInterval: 5000,
  });

  const [isLoading, setIsLoading] = useState(false);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'my-beats') {
      loadMyBeatsData();
    } else if (activeTab === 'marketplace') {
      loadMarketplaceBeats();
    }
  }, [activeTab]);

  // Filter and sort marketplace beats
  useEffect(() => {
    if (activeTab === 'marketplace') {
      filterAndSortBeats();
    }
  }, [beats, searchQuery, sortBy, filterBy]);

  // Update URL when tab changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.pushState({}, '', url);
  }, [activeTab]);

  // Save generate mode to localStorage
  useEffect(() => {
    localStorage.setItem('beatGenerateMode', generateMode);
  }, [generateMode]);

  // ============================================================================
  // MY BEATS TAB FUNCTIONS
  // ============================================================================

  const loadMyBeatsData = async () => {
    try {
      setIsLoading(true);
      const listingsRes = await fetch('/api/beat-store/listings', {
        credentials: 'include',
      });

      if (!listingsRes.ok) {
        if (listingsRes.status === 401) {
          setIsLoading(false); // Reset loading state before redirect
          setLocation('/dashboard');
          return;
        }
        throw new Error('Failed to load listings');
      }

      const listingsData = await listingsRes.json();
      setListings(listingsData.listings || []);

      const analyticsRes = await fetch('/api/beat-store/analytics', {
        credentials: 'include',
      });

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load beat store data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/beat-store/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jobId: selectedJobId,
          beatName,
          description: listingDescription,
          priceUSD: parseFloat(listingPrice),
          isGenerated: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create listing');
      }

      toast({
        title: 'Success!',
        description: 'Your beat is now listed for sale',
      });

      setIsDialogOpen(false);
      loadMyBeatsData();

      setSelectedJobId('');
      setBeatName('');
      setListingDescription('');
      setListingPrice('9.99');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create listing',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPaymentLink = (listing: BeatListing) => {
    navigator.clipboard.writeText(listing.stripePaymentLinkUrl);
    setCopiedId(listing.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: 'Copied!',
      description: 'Payment link copied to clipboard',
    });
  };

  // ============================================================================
  // MARKETPLACE TAB FUNCTIONS
  // ============================================================================

  const loadMarketplaceBeats = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/beat-marketplace/browse');

      if (!res.ok) {
        throw new Error('Failed to load beats');
      }

      const data = await res.json();
      setBeats(data.beats || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load beats',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortBeats = () => {
    let filtered = [...beats];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (beat) =>
          beat.beatName.toLowerCase().includes(query) ||
          beat.description?.toLowerCase().includes(query) ||
          beat.tags?.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    if (filterBy === 'generated') {
      filtered = filtered.filter((beat) => beat.isGenerated);
    } else if (filterBy === 'uploaded') {
      filtered = filtered.filter((beat) => !beat.isGenerated);
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'popular':
          return b.purchases - a.purchases;
        case 'price-low':
          return parseFloat(a.priceUSD) - parseFloat(b.priceUSD);
        case 'price-high':
          return parseFloat(b.priceUSD) - parseFloat(a.priceUSD);
        default:
          return 0;
      }
    });

    setFilteredBeats(filtered);
  };

  const handlePurchase = (beat: Beat) => {
    fetch(`/api/beat-marketplace/track-view/${beat.id}`, { method: 'POST' }).catch(console.error);
    window.open(beat.stripePaymentLinkUrl, '_blank');
    toast({
      title: 'Opening Checkout',
      description: "You'll be redirected to Stripe to complete your purchase",
    });
  };

  // ============================================================================
  // GENERATE TAB FUNCTIONS
  // ============================================================================

  const selectedPreset = BEAT_PRESETS[preset];

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (generateMode === 'custom') {
        // Custom mode: send pre-configured beatConfigs array
        const beatConfigs = customBeats.map((beat, i) => {
          const presetData = BEAT_PRESETS[beat.style];
          return {
            style: presetData.style,
            bpm: beat.bpm,
            duration: beat.duration,
            tags: presetData.tags,
            beatName: `${presetData.name} Beat ${Date.now()}_${i + 1}`,
          };
        });

        const response = await apiRequest('POST', '/api/beats/generate-batch', {
          count: customBeats.length,
          style: '', // Not used when beatConfigs is provided
          bpm: 0, // Not used when beatConfigs is provided
          duration: 0, // Not used when beatConfigs is provided
          aspectRatio,
          includeVisuals,
          tags: [],
          beatConfigs, // Send custom configurations
        });
        return response.json();
      } else if (generateMode === 'batch') {
        // Batch mode: generate array of beat configs if randomizing
        let beatConfigs = null;

        if (randomizeStyles || randomizeDurations) {
          beatConfigs = [];
          const presetKeys = Object.keys(BEAT_PRESETS).filter((k) => k !== 'custom') as (keyof typeof BEAT_PRESETS)[];
          const durationOptions = [120, 180, 240, 300, 600, 900, 1200, 1800];

          for (let i = 0; i < batchCount; i++) {
            const randomPreset = randomizeStyles ? presetKeys[Math.floor(Math.random() * presetKeys.length)] : preset;
            const randomDuration = randomizeDurations
              ? durationOptions[Math.floor(Math.random() * durationOptions.length)]
              : duration;
            const presetData = BEAT_PRESETS[randomPreset];

            beatConfigs.push({
              style: presetData.style,
              bpm: presetData.defaultBpm,
              duration: randomDuration,
              tags: presetData.tags,
              beatName: `${presetData.name} Beat ${Date.now()}_${i + 1}`,
            });
          }
        }

        const response = await apiRequest('POST', '/api/beats/generate-batch', {
          count: batchCount,
          style: preset === 'custom' ? customStyle : selectedPreset.style,
          bpm,
          duration,
          aspectRatio,
          includeVisuals,
          tags: selectedPreset.tags,
          randomizeStyles,
          randomizeDurations,
          beatConfigs, // Array of individual beat configs if randomizing
        });
        return response.json();
      } else {
        // Single mode
        const response = await apiRequest('POST', '/api/beats/generate', {
          beatName: beatName || `${selectedPreset.name} Beat ${Date.now()}`,
          style: preset === 'custom' ? customStyle : selectedPreset.style,
          beatDescription: genBeatDescription.trim(),
          lyrics: lyrics.trim() || undefined, // Only send if not empty (beats are instrumental)
          bpm,
          duration,
          aspectRatio,
          includeVisuals,
          autoListForSale,
          price: autoListForSale ? parseFloat(price) : undefined,
          tags: selectedPreset.tags,
        });
        return response.json();
      }
    },
    onSuccess: (data) => {
      if (generateMode === 'custom') {
        toast({
          title: 'Custom Generation Started!',
          description: `Successfully queued ${customBeats.length} custom-configured beats`,
        });
        setActiveTab('history');
        refetchBeatVideos();
      } else if (generateMode === 'batch') {
        toast({
          title: 'Batch Generation Started!',
          description: `Successfully queued ${batchCount} beats for generation`,
        });
        setActiveTab('history');
        refetchBeatVideos();
      } else {
        toast({
          title: 'Beat Generation Started!',
          description: `Your ${selectedPreset.name} beat is being generated.`,
        });
        setLocation(`/jobs/${data.jobId}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePresetChange = (newPreset: keyof typeof BEAT_PRESETS) => {
    setPreset(newPreset);
    const presetData = BEAT_PRESETS[newPreset];
    setBpm(presetData.defaultBpm);
  };

  const handleGenerate = () => {
    if (preset === 'custom' && !customStyle.trim()) {
      toast({
        title: 'Custom Style Required',
        description: 'Please describe the style you want for your beat',
        variant: 'destructive',
      });
      return;
    }

    generateMutation.mutate();
  };

  const estimatedCost =
    generateMode === 'custom'
      ? `$${(customBeats.length * (includeVisuals ? 0.6 : 0.1)).toFixed(2)}`
      : generateMode === 'batch'
        ? randomizeDurations
          ? `$${(includeVisuals ? 0.6 : 0.1) * batchCount * 0.5}-${(includeVisuals ? 0.6 : 0.1) * batchCount * 2.5}` // Range for varied durations
          : `$${((includeVisuals ? 0.6 : 0.1) * batchCount).toFixed(2)}`
        : `$${(includeVisuals ? 0.6 : 0.1).toFixed(2)}`;
  const estimatedTime =
    generateMode === 'custom'
      ? (() => {
          const totalMinutes = customBeats.reduce((sum, beat) => {
            const beatMinutes = includeVisuals ? (beat.duration >= 1800 ? 20 : 18) : 4;
            return sum + beatMinutes;
          }, 0);
          return `${totalMinutes}-${totalMinutes + customBeats.length * 4} min`;
        })()
      : generateMode === 'batch'
        ? randomizeDurations
          ? `${batchCount * 4}-${batchCount * 30} min (varies)`
          : `${batchCount * (includeVisuals ? 18 : 4)}-${batchCount * (includeVisuals ? 22 : 6)} min`
        : includeVisuals
          ? '15-20 min'
          : '3-5 min';

  // ============================================================================
  // HISTORY TAB FUNCTIONS
  // ============================================================================

  const generateDailyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/beats/generate-daily', {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Daily Beats Generation Started! 🎵',
        description: `Generating ${data.count || 6} videos: 1 lofi (30min) + 5 trap beats (4min each).`,
      });
      refetchBeatVideos();
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleGenerate5Videos = () => {
    setGenerating(true);
    generateMutation.mutate();
  };

  const handleGenerateDailyBeats = () => {
    generateDailyMutation.mutate();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      failed: 'destructive',
      processing: 'secondary',
      queued: 'outline',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading && !analytics && listings.length === 0 && beats.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
        <p className="text-muted-foreground text-sm">Loading Beat Hub...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
              <Music className="w-8 h-8 md:w-10 md:h-10 text-primary" />
              Beat Hub
            </h1>
            <p className="text-muted-foreground text-base md:text-lg mt-1.5">
              Your all-in-one platform for beat generation, marketplace, and sales
            </p>
          </div>
        </div>

        {/* Shared Analytics */}
        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 space-y-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Listings</CardTitle>
                  <Music className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-3xl font-bold">{analytics.totalListings}</div>
                <p className="text-sm text-muted-foreground">{analytics.activeListings} active</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 space-y-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
                  <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-3xl font-bold">{analytics.totalSales}</div>
                <p className="text-sm text-muted-foreground">{analytics.conversionRate} conversion</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 space-y-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-3xl font-bold">${analytics.totalRevenue}</div>
                <p className="text-sm text-muted-foreground">${analytics.avgRevenuePerListing} avg per beat</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 space-y-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-3xl font-bold">{analytics.totalViews}</div>
                <p className="text-sm text-muted-foreground">Across all listings</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-muted/50">
            <TabsTrigger
              value="my-beats"
              className="flex items-center gap-2 py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Store className="w-4 h-4" />
              <span className="hidden sm:inline">My Beats</span>
            </TabsTrigger>
            <TabsTrigger
              value="marketplace"
              className="flex items-center gap-2 py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Marketplace</span>
            </TabsTrigger>
            <TabsTrigger
              value="generate"
              className="flex items-center gap-2 py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">Generate</span>
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex items-center gap-2 py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          {/* ===== MY BEATS TAB ===== */}
          <TabsContent value="my-beats" className="space-y-6 mt-0">
            {/* Create Listing Dialog */}
            <div className="flex justify-end">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="shadow-sm">
                    <Plus className="w-4 h-4 mr-2" />
                    List Beat
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-xl">List Beat for Sale</DialogTitle>
                    <DialogDescription className="text-base">
                      Create a Stripe payment link for your beat. 0% commission on platform-generated beats!
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleCreateListing} className="space-y-5 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="jobId" className="text-sm font-medium">
                        Job ID
                      </Label>
                      <Input
                        id="jobId"
                        value={selectedJobId}
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        placeholder="Enter job ID from completed beat generation"
                        required
                        className="h-10"
                      />
                      <p className="text-xs text-muted-foreground">Find this in your jobs dashboard</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="beatName" className="text-sm font-medium">
                        Beat Name
                      </Label>
                      <Input
                        id="beatName"
                        value={beatName}
                        onChange={(e) => setBeatName(e.target.value)}
                        placeholder="e.g., Trap Beat #1 - Dark Vibes"
                        required
                        className="h-10"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description" className="text-sm font-medium">
                        Description
                      </Label>
                      <Textarea
                        id="description"
                        value={listingDescription}
                        onChange={(e) => setListingDescription(e.target.value)}
                        placeholder="Describe your beat..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="price" className="text-sm font-medium">
                        Price (USD)
                      </Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          min="0.99"
                          value={listingPrice}
                          onChange={(e) => setListingPrice(e.target.value)}
                          required
                          className="h-10 pl-9"
                        />
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                        You keep 100% (0% commission)
                      </p>
                    </div>

                    <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating Listing...
                        </>
                      ) : (
                        'Create Listing'
                      )}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Listings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Your Listings</CardTitle>
                <CardDescription>
                  {listings.length === 0
                    ? 'No listings yet. Create your first listing above!'
                    : `${listings.length} beat${listings.length !== 1 ? 's' : ''} listed for sale`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {listings.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <Music className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">No beats listed yet</h3>
                    <p className="text-muted-foreground text-sm">
                      Start by generating a beat or listing an existing one
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {listings.map((listing) => (
                      <div
                        key={listing.id}
                        className="flex flex-col md:flex-row md:items-center justify-between p-5 border rounded-xl hover:shadow-md hover:border-primary/50 transition-all gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-semibold text-lg truncate">{listing.beatName}</h3>
                            {listing.isGenerated && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                <Sparkles className="w-3 h-3 mr-1" />
                                0% Fee
                              </Badge>
                            )}
                            {listing.active ? (
                              <Badge variant="default" className="text-xs shrink-0">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs shrink-0">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          {listing.description && (
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{listing.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1.5 font-medium text-primary">
                              <DollarSign className="w-4 h-4" />${listing.priceUSD}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Eye className="w-4 h-4" />
                              {listing.views} views
                            </span>
                            <span className="flex items-center gap-1.5">
                              <ShoppingCart className="w-4 h-4" />
                              {listing.purchases} sales
                            </span>
                            <span className="flex items-center gap-1.5">
                              <TrendingUp className="w-4 h-4" />${listing.totalRevenueUSD} revenue
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="default"
                            onClick={() => copyPaymentLink(listing)}
                            className="flex-1 md:flex-none"
                          >
                            {copiedId === listing.id ? (
                              <>
                                <Check className="w-4 h-4 mr-2" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy Link
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => window.open(listing.stripePaymentLinkUrl, '_blank')}
                            className="shrink-0"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Commission Info */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Commission Structure
                </CardTitle>
                <CardDescription className="text-sm">Transparent pricing for all beat types</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-green-500/10 border-2 border-green-500/30 rounded-xl gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <p className="font-semibold text-green-700 dark:text-green-400 text-base">
                        Platform-Generated Beats
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">Beats generated through our platform</p>
                  </div>
                  <div className="text-center md:text-right shrink-0">
                    <div className="text-4xl font-bold text-green-700 dark:text-green-400">0%</div>
                    <p className="text-xs text-muted-foreground font-medium mt-1">commission</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-blue-500/10 border-2 border-blue-500/30 rounded-xl gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Music2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <p className="font-semibold text-blue-700 dark:text-blue-400 text-base">External Uploads</p>
                    </div>
                    <p className="text-sm text-muted-foreground">Beats uploaded from external sources</p>
                  </div>
                  <div className="text-center md:text-right shrink-0">
                    <div className="text-4xl font-bold text-blue-700 dark:text-blue-400">10%</div>
                    <p className="text-xs text-muted-foreground font-medium mt-1">commission</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== MARKETPLACE TAB ===== */}
          <TabsContent value="marketplace" className="space-y-6 mt-0">
            {/* Search and Filters */}
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search beats by name, description, or tags..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-11"
                      />
                    </div>
                  </div>

                  <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Newest First
                        </div>
                      </SelectItem>
                      <SelectItem value="popular">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Most Popular
                        </div>
                      </SelectItem>
                      <SelectItem value="price-low">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4" />
                          Price: Low to High
                        </div>
                      </SelectItem>
                      <SelectItem value="price-high">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4" />
                          Price: High to Low
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterBy} onValueChange={(value: FilterOption) => setFilterBy(value)}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4" />
                          All Beats
                        </div>
                      </SelectItem>
                      <SelectItem value="generated">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          AI Generated
                        </div>
                      </SelectItem>
                      <SelectItem value="uploaded">
                        <div className="flex items-center gap-2">
                          <Music2 className="h-4 w-4" />
                          User Uploaded
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Results Count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{filteredBeats.length}</span> of{' '}
                <span className="font-semibold text-foreground">{beats.length}</span> beats
              </p>
              {searchQuery && (
                <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="hover:bg-muted">
                  Clear Search
                </Button>
              )}
            </div>

            {/* Beat Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-full" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-32 w-full" />
                    </CardContent>
                    <CardFooter>
                      <Skeleton className="h-10 w-full" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : filteredBeats.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Music2 className="w-16 h-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No beats found</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    {searchQuery
                      ? 'Try adjusting your search query or filters'
                      : 'No beats are currently available. Check back soon!'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBeats.map((beat) => (
                  <Card
                    key={beat.id}
                    className="flex flex-col hover:shadow-xl hover:scale-[1.02] transition-all duration-200 overflow-hidden group"
                  >
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <CardTitle className="text-xl line-clamp-2 flex-1">{beat.beatName}</CardTitle>
                        {beat.isGenerated && (
                          <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                            <Sparkles className="h-3 w-3" />
                            AI
                          </Badge>
                        )}
                      </div>
                      {beat.description && (
                        <CardDescription className="line-clamp-2 text-sm">{beat.description}</CardDescription>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3 font-medium">
                        {beat.bpm && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
                            <Music2 className="h-3 w-3" />
                            {beat.bpm} BPM
                          </span>
                        )}
                        {beat.key && <span className="px-2 py-1 rounded-md bg-muted">Key: {beat.key}</span>}
                      </div>
                    </CardHeader>

                    <CardContent className="flex-1 space-y-4">
                      {beat.audioUrl ? (
                        <BeatPlayer
                          audioUrl={beat.audioUrl}
                          bpm={beat.bpm}
                          key={beat.key}
                          duration={beat.duration}
                          compact
                        />
                      ) : (
                        <div className="flex items-center justify-center h-20 bg-muted rounded-lg">
                          <Music2 className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <ShoppingCart className="h-4 w-4" />
                          <span>{beat.purchases} sales</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Eye className="h-4 w-4" />
                          <span>{beat.views} views</span>
                        </div>
                      </div>

                      {beat.tags && beat.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {beat.tags.slice(0, 3).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="flex items-center justify-between border-t pt-5 bg-muted/30">
                      <div className="text-2xl font-bold text-primary">${parseFloat(beat.priceUSD).toFixed(2)}</div>
                      <Button
                        onClick={() => handlePurchase(beat)}
                        size="lg"
                        className="group-hover:shadow-lg transition-shadow"
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Buy Now
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== GENERATE TAB ===== */}
          <TabsContent value="generate" className="space-y-6 mt-0">
            {/* Generate Mode Selector (Slide-down panel) */}
            <Card className="border-2 border-primary/20 shadow-sm">
              <CardHeader className="pb-4">
                <div
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => setExpandGenerateMode(!expandGenerateMode)}
                >
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Generation Mode
                    </CardTitle>
                    <CardDescription className="mt-1.5 text-base">
                      {generateMode === 'single'
                        ? 'Generate one beat at a time'
                        : `Generate ${batchCount} beats at once`}
                    </CardDescription>
                  </div>
                  <div className="p-2 rounded-lg group-hover:bg-muted transition-colors">
                    {expandGenerateMode ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>

              {expandGenerateMode && (
                <CardContent className="space-y-5 pt-0">
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <button
                      onClick={() => setGenerateMode('single')}
                      className={`p-5 rounded-xl border-2 transition-all text-left ${
                        generateMode === 'single'
                          ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50 hover:bg-accent hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Music className="w-5 h-5 text-primary" />
                        <div className="font-semibold text-lg">Single Beat</div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Generate one customized beat with full control
                      </div>
                    </button>

                    <button
                      onClick={() => setGenerateMode('batch')}
                      className={`p-5 rounded-xl border-2 transition-all text-left ${
                        generateMode === 'batch'
                          ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50 hover:bg-accent hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-5 h-5 text-primary" />
                        <div className="font-semibold text-lg">Batch Generate</div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Generate multiple beats quickly with same settings
                      </div>
                    </button>

                    <button
                      onClick={() => setGenerateMode('custom')}
                      className={`p-5 rounded-xl border-2 transition-all text-left ${
                        generateMode === 'custom'
                          ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50 hover:bg-accent hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Settings className="w-5 h-5 text-primary" />
                        <div className="font-semibold text-lg">Custom Config</div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Configure each beat individually with unique settings
                      </div>
                    </button>
                  </div>

                  {generateMode === 'batch' && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="batchCount" className="text-sm font-medium">
                          Number of Beats
                        </Label>
                        <Select value={batchCount.toString()} onValueChange={(value) => setBatchCount(parseInt(value))}>
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 beats</SelectItem>
                            <SelectItem value="10">10 beats</SelectItem>
                            <SelectItem value="11">11 beats</SelectItem>
                            <SelectItem value="15">15 beats</SelectItem>
                            <SelectItem value="20">20 beats</SelectItem>
                            <SelectItem value="30">30 beats</SelectItem>
                            <SelectItem value="50">50 beats</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="batchDuration" className="text-sm font-medium">
                          Duration per Beat
                        </Label>
                        <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="120">2 minutes</SelectItem>
                            <SelectItem value="180">3 minutes (Standard)</SelectItem>
                            <SelectItem value="240">4 minutes</SelectItem>
                            <SelectItem value="300">5 minutes</SelectItem>
                            <SelectItem value="600">10 minutes</SelectItem>
                            <SelectItem value="900">15 minutes</SelectItem>
                            <SelectItem value="1200">20 minutes</SelectItem>
                            <SelectItem value="1800">30 minutes (Lofi Mix)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {randomizeDurations
                            ? 'Durations will be randomly selected between 2-30 minutes'
                            : '30-minute lofi mixes perfect for study/work sessions'}
                        </p>
                      </div>

                      <Separator className="my-4" />

                      {/* Randomization Options */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Sparkles className="w-4 h-4" />
                          <span>Variety Options</span>
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                          <div className="space-y-0.5">
                            <div className="font-medium text-sm">🎨 Randomize Styles</div>
                            <div className="text-xs text-muted-foreground">
                              Each beat gets a random genre (Trap, Lofi, Drill, Boom Bap, Ambient)
                            </div>
                          </div>
                          <Switch checked={randomizeStyles} onCheckedChange={setRandomizeStyles} />
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                          <div className="space-y-0.5">
                            <div className="font-medium text-sm">⏱️ Randomize Durations</div>
                            <div className="text-xs text-muted-foreground">
                              Each beat gets a random duration (2min, 3min, 5min, 10min, 30min)
                            </div>
                          </div>
                          <Switch checked={randomizeDurations} onCheckedChange={setRandomizeDurations} />
                        </div>

                        {(randomizeStyles || randomizeDurations) && (
                          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                            <div className="flex items-start gap-2">
                              <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-primary">Infinite Variety Mode Active</div>
                                <div className="text-xs text-muted-foreground">
                                  {randomizeStyles &&
                                    randomizeDurations &&
                                    'Each beat will have a unique style AND duration.'}
                                  {randomizeStyles &&
                                    !randomizeDurations &&
                                    'Each beat will have a unique style with the same duration.'}
                                  {!randomizeStyles &&
                                    randomizeDurations &&
                                    'Each beat will have the same style with unique durations.'}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {generateMode === 'custom' && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Settings className="w-4 h-4" />
                            <span>Custom Beat Configuration</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Configure each beat individually with unique style and duration
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newBeat: CustomBeatConfig = {
                                id: Date.now().toString(),
                                style: 'trap',
                                duration: 180,
                                bpm: BEAT_PRESETS.trap.defaultBpm,
                              };
                              setCustomBeats([...customBeats, newBeat]);
                            }}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Add Beat
                          </Button>
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                        {customBeats.map((beat, index) => (
                          <div key={beat.id} className="p-4 rounded-lg border bg-card space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm flex items-center gap-2">
                                <Music className="w-4 h-4 text-primary" />
                                Beat #{index + 1}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (customBeats.length > 1) {
                                    setCustomBeats(customBeats.filter((b) => b.id !== beat.id));
                                  }
                                }}
                                disabled={customBeats.length === 1}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              {/* Style selector */}
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Style</Label>
                                <Select
                                  value={beat.style}
                                  onValueChange={(value: keyof typeof BEAT_PRESETS) => {
                                    const updatedBeats = customBeats.map((b) =>
                                      b.id === beat.id
                                        ? { ...b, style: value, bpm: BEAT_PRESETS[value].defaultBpm }
                                        : b,
                                    );
                                    setCustomBeats(updatedBeats);
                                  }}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="trap">🔥 Trap</SelectItem>
                                    <SelectItem value="lofi">🌙 Lo-Fi</SelectItem>
                                    <SelectItem value="boomBap">🎧 Boom Bap</SelectItem>
                                    <SelectItem value="drill">⚡ Drill</SelectItem>
                                    <SelectItem value="ambient">✨ Ambient</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Duration selector */}
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Duration</Label>
                                <Select
                                  value={beat.duration.toString()}
                                  onValueChange={(value) => {
                                    const updatedBeats = customBeats.map((b) =>
                                      b.id === beat.id ? { ...b, duration: parseInt(value) } : b,
                                    );
                                    setCustomBeats(updatedBeats);
                                  }}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="120">2 minutes</SelectItem>
                                    <SelectItem value="180">3 minutes</SelectItem>
                                    <SelectItem value="240">4 minutes</SelectItem>
                                    <SelectItem value="300">5 minutes</SelectItem>
                                    <SelectItem value="600">10 minutes</SelectItem>
                                    <SelectItem value="900">15 minutes</SelectItem>
                                    <SelectItem value="1200">20 minutes</SelectItem>
                                    <SelectItem value="1800">30 minutes (Lofi)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="text-xs text-muted-foreground flex items-center justify-between">
                              <span>
                                {BEAT_PRESETS[beat.style].name} • {beat.duration / 60} min • {beat.bpm} BPM
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                ${beat.duration >= 1800 ? '0.60' : '0.60'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-primary">
                              Total: {customBeats.length} beats configured
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Each beat will have unique visuals from 304M+ combinations
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Preset Selection (hide in custom mode since styles are configured per beat) */}
                {generateMode !== 'custom' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Choose Style
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Select a preset or create your own custom style
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(BEAT_PRESETS).map(([key, presetData]) => (
                          <button
                            key={key}
                            onClick={() => handlePresetChange(key as keyof typeof BEAT_PRESETS)}
                            className={`
                            p-5 rounded-xl border-2 transition-all text-left group hover:scale-[1.02]
                            ${
                              preset === key
                                ? 'border-primary bg-primary/10 shadow-lg ring-2 ring-primary/20'
                                : 'border-border hover:border-primary/50 hover:bg-accent hover:shadow-md'
                            }
                          `}
                          >
                            <div className="text-3xl mb-3 transition-transform group-hover:scale-110">
                              {presetData.icon}
                            </div>
                            <div className="font-semibold mb-1.5 text-base">{presetData.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {presetData.description}
                            </div>
                          </button>
                        ))}
                      </div>

                      {preset === 'custom' && (
                        <div className="mt-5 p-4 rounded-lg bg-muted/50 border">
                          <Label htmlFor="customStyle" className="text-sm font-medium">
                            Custom Style Description
                          </Label>
                          <Textarea
                            id="customStyle"
                            placeholder="Describe the style you want (e.g., 'Upbeat electronic dance music with synth leads')"
                            value={customStyle}
                            onChange={(e) => setCustomStyle(e.target.value)}
                            rows={3}
                            className="mt-2 resize-none"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Beat Settings (only show in single mode) */}
                {generateMode === 'single' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Settings className="w-5 h-5 text-primary" />
                        Beat Settings
                      </CardTitle>
                      <CardDescription className="text-sm">Customize your beat parameters</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="beatName" className="text-sm font-medium">
                          Beat Name <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Input
                          id="beatName"
                          placeholder={`${selectedPreset.name} Beat`}
                          value={beatName}
                          onChange={(e) => setBeatName(e.target.value)}
                          className="h-11"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="beatDescription" className="text-sm font-medium">
                          Beat Description <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Textarea
                          id="beatDescription"
                          placeholder="Describe your beat vibe..."
                          value={genBeatDescription}
                          onChange={(e) => setGenBeatDescription(e.target.value)}
                          rows={3}
                          className="resize-none"
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">BPM (Tempo)</Label>
                          <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
                            {bpm} BPM
                          </Badge>
                        </div>
                        <div className="px-1">
                          <Slider
                            value={[bpm]}
                            onValueChange={(values) => setBpm(values[0])}
                            min={selectedPreset.bpmRange[0]}
                            max={selectedPreset.bpmRange[1]}
                            step={1}
                            className="py-2"
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground px-1">
                          <span>{selectedPreset.bpmRange[0]} BPM</span>
                          <span>{selectedPreset.bpmRange[1]} BPM</span>
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-5 rounded-xl border-2 hover:border-primary/50 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Film className="w-4 h-4 text-primary" />
                              <div className="font-medium">Include Visuals</div>
                            </div>
                            <div className="text-sm text-muted-foreground">Generate themed video clip (+$0.50)</div>
                          </div>
                          <Switch checked={includeVisuals} onCheckedChange={setIncludeVisuals} className="ml-4" />
                        </div>

                        <div className="flex items-center justify-between p-5 rounded-xl border-2 hover:border-primary/50 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Store className="w-4 h-4 text-primary" />
                              <div className="font-medium">Auto-List for Sale</div>
                            </div>
                            <div className="text-sm text-muted-foreground">List on marketplace after generation</div>
                          </div>
                          <Switch checked={autoListForSale} onCheckedChange={setAutoListForSale} className="ml-4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar - Summary & Generate */}
              <div className="space-y-6">
                <Card className="sticky top-6 border-2 shadow-lg">
                  <CardHeader className="bg-muted/50">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Info className="w-5 h-5 text-primary" />
                      Generation Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="text-sm text-muted-foreground">Mode</div>
                        <div className="font-semibold">
                          {generateMode === 'single'
                            ? 'Single Beat'
                            : generateMode === 'custom'
                              ? `Custom (${customBeats.length}×)`
                              : `Batch (${batchCount}×)`}
                        </div>
                      </div>

                      {generateMode !== 'custom' && (
                        <>
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div className="text-sm text-muted-foreground">Style</div>
                            <div className="font-semibold flex items-center gap-2">
                              <span>{selectedPreset.icon}</span>
                              {selectedPreset.name}
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div className="text-sm text-muted-foreground">BPM</div>
                            <div className="font-semibold">{bpm} BPM</div>
                          </div>
                        </>
                      )}

                      {generateMode === 'custom' && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-sm text-muted-foreground mb-2">Custom Configuration</div>
                          <div className="space-y-1">
                            {customBeats.map((beat, idx) => (
                              <div key={beat.id} className="text-xs flex items-center justify-between">
                                <span>
                                  Beat #{idx + 1}: {BEAT_PRESETS[beat.style].icon} {BEAT_PRESETS[beat.style].name}
                                </span>
                                <span className="text-muted-foreground">
                                  {beat.duration / 60}min • {beat.bpm}BPM
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          Estimated Cost
                        </div>
                        <Badge variant="secondary" className="text-base font-bold px-3">
                          {estimatedCost}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Estimated Time
                        </div>
                        <Badge variant="secondary" className="text-sm font-semibold">
                          {estimatedTime}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2 pt-6 bg-muted/30">
                    <Button
                      onClick={handleGenerate}
                      disabled={generateMutation.isPending}
                      size="lg"
                      className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                    >
                      {generateMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 mr-2" />
                          Generate{' '}
                          {generateMode === 'custom'
                            ? `${customBeats.length} Custom Beats`
                            : generateMode === 'batch'
                              ? `${batchCount} Beats`
                              : 'Beat'}
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ===== HISTORY TAB ===== */}
          <TabsContent value="history" className="space-y-6 mt-0">
            {/* Batch Generation Buttons */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Batch Generation</CardTitle>
                <CardDescription className="text-sm">
                  Generate multiple beat-driven videos using Suno music
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="p-6 rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="default" className="text-xs font-semibold">
                          RECOMMENDED
                        </Badge>
                      </div>
                      <h3 className="font-bold text-xl mb-1.5">Daily Beats</h3>
                      <p className="text-sm text-muted-foreground">1 lofi beat (30min) + 5 trap beats (4min each)</p>
                    </div>
                    <Button
                      size="lg"
                      onClick={handleGenerateDailyBeats}
                      disabled={generateDailyMutation.isPending}
                      className="shadow-md hover:shadow-lg transition-all md:shrink-0"
                    >
                      {generateDailyMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Music className="w-5 h-5 mr-2" />
                          Generate Daily Beats
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-primary/20">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="font-medium">6 videos</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-blue-500" />
                      <span className="font-medium">$1.20 cost</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className="font-medium">~35-40 min</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <Button
                    size="lg"
                    onClick={handleGenerate5Videos}
                    disabled={generating || generateMutation.isPending}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    {generating || generateMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" />
                        Generate 5 Beat Videos
                      </>
                    )}
                  </Button>
                  <div className="text-sm text-muted-foreground">Creates 5 videos with synchronized visuals</div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Beat Videos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Recent Beat Videos</CardTitle>
                <CardDescription className="text-sm">Track your beat-driven video generation jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  {beatVideos && beatVideos.length > 0 ? (
                    <div className="space-y-3">
                      {beatVideos.map((video) => (
                        <div
                          key={video.id}
                          className="flex flex-col md:flex-row md:items-center justify-between p-5 rounded-xl border-2 bg-card hover:border-primary/50 hover:shadow-md transition-all gap-4"
                        >
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <div className="mt-1 shrink-0">{getStatusIcon(video.status)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-base mb-1.5 truncate">{video.title}</div>
                              <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                                {video.bpm && (
                                  <Badge variant="outline" className="text-xs">
                                    {video.bpm} BPM
                                  </Badge>
                                )}
                                {video.key && (
                                  <Badge variant="outline" className="text-xs">
                                    {video.key}
                                  </Badge>
                                )}
                                {video.createdAt && (
                                  <span className="text-xs">{new Date(video.createdAt).toLocaleString()}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                            {getStatusBadge(video.status)}
                            <Button variant="outline" size="default" asChild>
                              <a href={`/jobs/${video.id}`}>View Details</a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center px-4">
                      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                        <Music className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">No beat videos yet</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mb-6">
                        Start generating your first batch of beats using the buttons above
                      </p>
                      <Button onClick={handleGenerateDailyBeats} disabled={generateDailyMutation.isPending} size="lg">
                        <Music className="w-5 h-5 mr-2" />
                        Generate Daily Beats
                      </Button>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
