import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Download,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Filter,
  Smartphone,
  Copy,
  Check,
  FileText,
  XCircle,
  Film,
  ExternalLink,
  Upload,
  Sparkles,
  Image,
  RefreshCw,
  Calendar,
  CalendarCheck,
  Users,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { SiTiktok, SiYoutube } from 'react-icons/si';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Job } from '@shared/schema';

interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  thumbnailPrompt: string;
  categoryId: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
}

interface ExploredTopic {
  id: string;
  topicType: string;
  primaryName: string;
  normalizedName: string;
  fiveW1H: {
    who?: { mainSubject?: string; keyPeople?: string[] };
    what?: { primaryEvent?: string; significance?: string };
    why?: { motivation?: string; modernRelevance?: string };
    where?: { primaryLocation?: string; region?: string };
    when?: { era?: string; timePeriod?: string };
    how?: { mechanism?: string };
  };
  viralPotential: number;
  discoveryAngle: string;
  visualAppeal?: number;
  status: string;
  sourceMetadata?: any;
  createdAt: string;
  usedAt?: string;
}

interface PoolStatus {
  total: number;
  discovered: number;
  queued: number;
  used: number;
  rejected: number;
}

interface PoolBreakdown {
  byEra: Record<string, number>;
  byType: Record<string, number>;
  avgViralPotential: number;
}

export default function JobsPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed' | 'discover'>('all');
  const [previewJob, setPreviewJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false);
  const [uploadJobId, setUploadJobId] = useState<string | null>(null);
  const [youtubeMetadata, setYoutubeMetadata] = useState<YouTubeMetadata | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<any>(null);
  const [scheduledUploadTime, setScheduledUploadTime] = useState<string>('');
  const [bulkScheduleOpen, setBulkScheduleOpen] = useState(false);
  const [daysToSpread, setDaysToSpread] = useState<number>(7);
  const [uploadsPerDay, setUploadsPerDay] = useState<number>(2);
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  const { toast } = useToast();

  // YouTube status query (default channel)
  const { data: youtubeStatus } = useQuery<{
    data: { configured: boolean; authenticated: boolean; channel?: { name: string; id: string; thumbnail?: string } };
  }>({
    queryKey: ['/api/youtube/status'],
  });

  // Connected channels query
  const { data: connectedChannels } = useQuery<
    Array<{ id: string; channelId: string; title: string; thumbnailUrl: string; status: string }>
  >({
    queryKey: ['/api/youtube/connected-channels'],
    select: (data: any) => data?.data || data || [],
  });

  const { data: jobsData, isLoading } = useQuery<{ data: Job[] }>({
    queryKey: ['/api/jobs'],
    refetchInterval: (query) => {
      const jobs = query.state.data?.data || [];
      const hasActiveJobs = jobs.some((j: Job) => j.status === 'processing' || j.status === 'queued');
      // Refresh every 3s if active jobs, otherwise every 5s to catch new jobs
      return hasActiveJobs ? 3000 : 5000;
    },
  });

  // === Discover Tab State ===
  const [discoverStatusFilter, setDiscoverStatusFilter] = useState<string>('discovered');
  const [discoverSort, setDiscoverSort] = useState<'viral' | 'recent'>('viral');
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  // Track background refill status
  const [refillInProgress, setRefillInProgress] = useState(false);

  // Topic pool query (for Discover tab)
  const { data: topicPoolData, isLoading: isLoadingTopics } = useQuery<{
    success: boolean;
    status: PoolStatus;
    breakdown: PoolBreakdown;
    topics: ExploredTopic[];
  }>({
    queryKey: ['/api/automation/topic-pool', discoverStatusFilter],
    queryFn: () => fetch(`/api/automation/topic-pool?status=${discoverStatusFilter}&limit=100`).then((r) => r.json()),
    enabled: filter === 'discover',
    refetchInterval: refillInProgress ? 5000 : 30000, // Poll faster during active refill
  });

  const poolTopics = topicPoolData?.topics || [];
  const sortedTopics = [...poolTopics].sort((a, b) => {
    if (discoverSort === 'viral') return b.viralPotential - a.viralPotential;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Poll refill status when a background refill is running
  const { data: refillStatus } = useQuery<{
    active: boolean;
    status?: string;
    elapsedSeconds?: string;
    count?: number;
  }>({
    queryKey: ['/api/automation/topic-pool/refill-status'],
    queryFn: () => fetch('/api/automation/topic-pool/refill-status').then((r) => r.json()),
    enabled: refillInProgress,
    refetchInterval: 3000, // Poll every 3 seconds
  });

  // When background refill completes, refresh the pool data
  useEffect(() => {
    if (refillInProgress && refillStatus && !refillStatus.active) {
      setRefillInProgress(false);
      queryClient.invalidateQueries({ queryKey: ['/api/automation/topic-pool'] });
      if (refillStatus.status === 'done') {
        toast({
          title: 'Discovery complete',
          description: `New characters discovered and added to pool! (${refillStatus.elapsedSeconds}s)`,
        });
      } else if (refillStatus.status === 'error') {
        toast({
          title: 'Discovery had errors',
          description: 'Some characters may have been added. Check the pool.',
          variant: 'destructive',
        });
      }
    }
  }, [refillStatus, refillInProgress]);

  // Refill topic pool mutation
  const refillPoolMutation = useMutation({
    mutationFn: (count: number) => apiRequest('POST', '/api/automation/topic-pool/refill', { count }),
    onSuccess: (data: any) => {
      if (data.async) {
        // Large batch - running in background
        setRefillInProgress(true);
        toast({ title: 'Discovery started', description: data.message });
      } else {
        // Small batch - completed synchronously
        queryClient.invalidateQueries({ queryKey: ['/api/automation/topic-pool'] });
        toast({ title: 'Discovery complete', description: 'New historical figures discovered and added to pool!' });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Discovery failed', description: error.message, variant: 'destructive' });
    },
  });

  // Force refresh mutation
  const forceRefreshMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/automation/topic-pool/refresh'),
    onSuccess: (data: any) => {
      if (data.async) {
        setRefillInProgress(true);
        toast({
          title: 'Refresh started',
          description: 'Clearing old topics and generating fresh batch in background...',
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/automation/topic-pool'] });
        toast({ title: 'Pool refreshed', description: 'Old topics cleared, fresh batch generated!' });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Refresh failed', description: error.message, variant: 'destructive' });
    },
  });

  // Generate video from a discovered topic
  const generateFromTopicMutation = useMutation({
    mutationFn: (topic: ExploredTopic) =>
      apiRequest('POST', '/api/automation/generate', {
        figure: topic.primaryName,
        story: topic.discoveryAngle,
      }),
    onSuccess: (_data, topic) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/topic-pool'] });
      toast({ title: 'Video queued!', description: `Creating video for ${topic.primaryName}` });
    },
    onError: (error: any) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    },
  });

  // Reject a topic
  const rejectTopicMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest('POST', `/api/automation/topic-pool/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/topic-pool'] });
      toast({ title: 'Topic rejected' });
    },
  });

  // Batch generate
  const batchGenerateMutation = useMutation({
    mutationFn: (topicIds: string[]) => apiRequest('POST', '/api/automation/topic-pool/batch-generate', { topicIds }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/topic-pool'] });
      setSelectedTopics(new Set());
      toast({
        title: 'Batch generation started',
        description: `${data.generated} videos queued, ${data.failed} failed`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Batch generation failed', description: error.message, variant: 'destructive' });
    },
  });

  const toggleTopicSelection = (id: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllTopics = () => {
    if (selectedTopics.size === sortedTopics.filter((t) => t.status === 'discovered').length) {
      setSelectedTopics(new Set());
    } else {
      setSelectedTopics(new Set(sortedTopics.filter((t) => t.status === 'discovered').map((t) => t.id)));
    }
  };

  // Fetch Unity packages to get clips and final video status
  const { data: packagesData } = useQuery<{ data: any[] }>({
    queryKey: ['/api/unity/packages'],
  });

  // Helper to find package for a job
  const findPackageForJob = (job: Job) => {
    return packagesData?.data?.find(
      (pkg: any) =>
        job?.mode === 'unity_kling' &&
        (pkg.title === job.scriptName?.replace(' - Unity VEO', '') || pkg.packageData?.jobId === job.id),
    );
  };

  // For preview modal
  const matchingPackage = previewJob ? findPackageForJob(previewJob) : null;

  // Get clips from package or fallback to job's completedClips
  const packageClips = matchingPackage?.packageData?.generatedClips || [];
  const jobClips = (previewJob?.completedClips || []).map((clip: any) => ({
    ...clip,
    // Transform videoPath to videoUrl for UI compatibility
    videoUrl: clip.videoPath?.startsWith('/home/runner/workspace/')
      ? `/api/videos/${clip.videoPath.split('/').pop()}`
      : clip.videoUrl || clip.videoPath,
  }));
  const generatedClips = packageClips.length > 0 ? packageClips : jobClips;

  const jobs = jobsData?.data || [];

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest('POST', `/api/jobs/${jobId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({
        title: 'Job cancelled',
        description: 'The queued job has been cancelled.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to cancel job',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  const stopJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest('POST', `/api/jobs/${jobId}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({
        title: 'Job stopped',
        description: 'The processing job has been stopped. Clips generated so far are saved.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to stop job',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  const retryJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest('POST', `/api/jobs/${jobId}/retry`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({
        title: 'Job queued for retry',
        description: 'The failed job has been reset and will be processed again.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to retry job',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  // YouTube metadata generation mutation
  const generateMetadataMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest('POST', '/api/youtube/generate-metadata', { jobId });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        const metadata = Array.isArray(data.data) ? data.data[0] : data.data;
        setYoutubeMetadata(metadata);
        toast({
          title: 'Metadata generated',
          description: 'AI-generated title, description, and tags are ready for review.',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to generate metadata',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  // YouTube thumbnail generation mutation
  const generateThumbnailMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest('POST', '/api/youtube/generate-thumbnail', { prompt });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data?.thumbnailUrl) {
        setThumbnailUrl(data.data.thumbnailUrl);
        toast({
          title: 'Thumbnail generated',
          description: 'AI-generated thumbnail is ready.',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to generate thumbnail',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  // Bulk schedule mutation
  const bulkScheduleMutation = useMutation({
    mutationFn: async ({
      jobIds,
      startDate,
      daysToSpread,
      uploadsPerDay,
    }: {
      jobIds: string[];
      startDate: string;
      daysToSpread: number;
      uploadsPerDay: number;
    }) => {
      const response = await apiRequest('POST', '/api/youtube/bulk-schedule', {
        jobIds,
        startDate,
        daysToSpread,
        uploadsPerDay,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setBulkScheduleOpen(false);
        queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
        toast({
          title: 'Videos Scheduled!',
          description: `${data.data.scheduled} videos scheduled across ${data.data.summary.daysUsed} days`,
        });
      } else {
        toast({
          title: 'Scheduling failed',
          description: data.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to schedule',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  // YouTube upload mutation
  const uploadToYouTubeMutation = useMutation({
    mutationFn: async ({
      jobId,
      metadata,
      channelConnectionId,
      scheduledTime,
    }: {
      jobId: string;
      metadata: YouTubeMetadata;
      channelConnectionId?: string;
      scheduledTime?: string;
    }) => {
      const response = await apiRequest('POST', '/api/youtube/upload-job', {
        jobId,
        customMetadata: metadata,
        channelConnectionId: channelConnectionId,
        scheduledUploadTime: scheduledTime || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setYoutubeDialogOpen(false);
        setYoutubeMetadata(null);
        setUploadJobId(null);
        setThumbnailUrl(null);
        setSelectedChannel(null);
        setScheduledUploadTime('');

        if (data.data?.scheduled) {
          toast({
            title: 'Upload Scheduled!',
            description: `Video will be uploaded at ${new Date(data.data.scheduledTime).toLocaleString()}`,
          });
        } else if (data.data?.videoUrl) {
          toast({
            title: 'Uploaded to YouTube!',
            description: `Video is now on your channel (private). View at: ${data.data.videoUrl}`,
          });
        }
      } else {
        toast({
          title: 'Upload failed',
          description: data.error || data.data?.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to upload',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  // Open YouTube upload dialog and generate metadata
  const openYouTubeUpload = (jobId: string) => {
    setUploadJobId(jobId);
    setYoutubeMetadata(null);
    setThumbnailUrl(null);
    setYoutubeDialogOpen(true);
    generateMetadataMutation.mutate(jobId);
  };

  const filteredJobs = jobs.filter((job) => {
    if (filter === 'active') return job.status === 'processing' || job.status === 'queued';
    if (filter === 'completed') return job.status === 'completed';
    if (filter === 'failed') return job.status === 'failed';
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-primary" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-chart-4 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      queued: { variant: 'secondary', label: 'Queued' },
      processing: { variant: 'default', label: 'Processing' },
      completed: { variant: 'outline', label: 'Completed' },
      failed: { variant: 'destructive', label: 'Failed' },
      cancelled: { variant: 'secondary', label: 'Cancelled' },
    };
    const config = variants[status] || variants.queued;
    return (
      <Badge variant={config.variant} data-testid={`badge-status-${status}`}>
        {config.label}
      </Badge>
    );
  };

  const formatCost = (cost: string | null) => {
    if (!cost) return '—';
    return `$${parseFloat(cost).toFixed(2)}`;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCreatedAt = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return '—';
    const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    const hoursDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    if (hoursDiff < 24) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold mb-2" data-testid="text-page-title">
              Job Queue
            </h1>
            <p className="text-muted-foreground">Monitor and manage your video generation jobs</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Filter className="w-3 h-3" />
              {filteredJobs.length} {filter === 'all' ? 'total' : filter}
            </Badge>
            {filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setBulkScheduleOpen(true)} className="gap-2">
                <CalendarCheck className="w-4 h-4" />
                Schedule All
              </Button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-filter-all">
              All Jobs
            </TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-filter-active">
              Active
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-filter-completed">
              Completed
            </TabsTrigger>
            <TabsTrigger value="failed" data-testid="tab-filter-failed">
              Failed
            </TabsTrigger>
            <TabsTrigger value="discover" data-testid="tab-filter-discover" className="gap-1">
              <Users className="w-3 h-3" />
              Discover
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Discover Tab Content */}
        {filter === 'discover' ? (
          <div className="space-y-4">
            {/* Pool Status Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Total', value: topicPoolData?.status?.total || 0, color: 'text-foreground' },
                {
                  label: 'Discovered',
                  value: topicPoolData?.status?.discovered || 0,
                  color: 'text-green-500',
                  onClick: () => setDiscoverStatusFilter('discovered'),
                },
                {
                  label: 'Queued',
                  value: topicPoolData?.status?.queued || 0,
                  color: 'text-blue-500',
                  onClick: () => setDiscoverStatusFilter('queued'),
                },
                {
                  label: 'Used',
                  value: topicPoolData?.status?.used || 0,
                  color: 'text-muted-foreground',
                  onClick: () => setDiscoverStatusFilter('used'),
                },
                {
                  label: 'Rejected',
                  value: topicPoolData?.status?.rejected || 0,
                  color: 'text-red-500',
                  onClick: () => setDiscoverStatusFilter('rejected'),
                },
              ].map((stat) => (
                <Card
                  key={stat.label}
                  className={`cursor-pointer transition-all ${discoverStatusFilter === stat.label.toLowerCase() ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
                  onClick={stat.onClick || (() => setDiscoverStatusFilter('all'))}
                >
                  <CardContent className="p-4 text-center">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Era Breakdown + Avg Viral Potential */}
            {topicPoolData?.breakdown && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">Era Diversity:</span>
                      {Object.entries(topicPoolData.breakdown.byEra).map(([era, count]) => (
                        <Badge key={era} variant="outline" className="gap-1">
                          {era === 'ancient' ? '🏛️' : era === 'medieval' ? '⚔️' : era === 'modern' ? '🏭' : '📜'}
                          {era}: {count}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="secondary" className="gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Avg Viral: {topicPoolData.breakdown.avgViralPotential.toFixed(1)}/10
                      </Badge>
                      {Object.entries(topicPoolData.breakdown.byType).map(([type, count]) => (
                        <Badge key={type} variant="outline" className="text-xs">
                          {type}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions Bar */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Historical Figure Discovery
                    </CardTitle>
                    <CardDescription>
                      Auto-generate viral-worthy historical figures with AI. Select and generate videos in bulk.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={() => refillPoolMutation.mutate(5)}
                      disabled={refillPoolMutation.isPending || forceRefreshMutation.isPending || refillInProgress}
                      className="gap-2"
                      data-testid="button-discover-50"
                    >
                      {refillPoolMutation.isPending || refillInProgress ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {refillInProgress && refillStatus?.elapsedSeconds
                            ? `Discovering... (${refillStatus.elapsedSeconds}s)`
                            : 'Discovering...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Discover 5 Characters
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => forceRefreshMutation.mutate()}
                      disabled={forceRefreshMutation.isPending || refillPoolMutation.isPending || refillInProgress}
                      className="gap-2"
                    >
                      {forceRefreshMutation.isPending || refillInProgress ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Fresh Batch
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Toolbar: Filters, Sort, Batch Actions */}
              <div className="px-6 pb-3 flex items-center justify-between flex-wrap gap-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  {/* Status sub-filter */}
                  <div className="flex items-center gap-1">
                    {['discovered', 'queued', 'used', 'all'].map((s) => (
                      <Button
                        key={s}
                        variant={discoverStatusFilter === s ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setDiscoverStatusFilter(s)}
                        className="text-xs h-7 px-2"
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Button>
                    ))}
                  </div>
                  <span className="text-muted-foreground">|</span>
                  {/* Sort */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant={discoverSort === 'viral' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setDiscoverSort('viral')}
                      className="text-xs h-7 px-2 gap-1"
                    >
                      <TrendingUp className="w-3 h-3" />
                      Viral
                    </Button>
                    <Button
                      variant={discoverSort === 'recent' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setDiscoverSort('recent')}
                      className="text-xs h-7 px-2 gap-1"
                    >
                      <Clock className="w-3 h-3" />
                      Recent
                    </Button>
                  </div>
                </div>

                {/* Batch actions */}
                <div className="flex items-center gap-2">
                  {sortedTopics.filter((t) => t.status === 'discovered').length > 0 && (
                    <Button variant="ghost" size="sm" onClick={selectAllTopics} className="text-xs h-7">
                      {selectedTopics.size === sortedTopics.filter((t) => t.status === 'discovered').length
                        ? 'Deselect All'
                        : 'Select All'}
                    </Button>
                  )}
                  {selectedTopics.size > 0 && (
                    <>
                      <Badge variant="secondary">{selectedTopics.size} selected</Badge>
                      <Button
                        size="sm"
                        onClick={() => batchGenerateMutation.mutate(Array.from(selectedTopics))}
                        disabled={batchGenerateMutation.isPending}
                        className="gap-1 h-7"
                      >
                        {batchGenerateMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        Generate {selectedTopics.size} Videos
                      </Button>
                    </>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {sortedTopics.length} shown
                  </Badge>
                </div>
              </div>

              <CardContent className="pt-0">
                {isLoadingTopics ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-20 flex-1" />
                      </div>
                    ))}
                  </div>
                ) : sortedTopics.length === 0 ? (
                  <div className="text-center py-16">
                    <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-xl font-medium mb-2">
                      {discoverStatusFilter === 'all'
                        ? 'No characters discovered yet'
                        : `No ${discoverStatusFilter} characters`}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                      Click "Discover 5 Characters" to auto-generate a pool of viral historical figures using AI +
                      trending topics
                    </p>
                    <Button
                      onClick={() => refillPoolMutation.mutate(5)}
                      disabled={refillPoolMutation.isPending || refillInProgress}
                      className="gap-2"
                    >
                      {refillPoolMutation.isPending || refillInProgress ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Discover 5 Characters
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedTopics.map((topic) => {
                      const isExpanded = expandedTopic === topic.id;
                      const isSelected = selectedTopics.has(topic.id);
                      const isTrending = !!topic.sourceMetadata;
                      const era = topic.fiveW1H?.when?.era || 'unknown';
                      const eraEmoji =
                        era === 'ancient' ? '🏛️' : era === 'medieval' ? '⚔️' : era === 'modern' ? '🏭' : '📜';

                      return (
                        <div
                          key={topic.id}
                          className={`rounded-lg border transition-all ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'bg-card hover:bg-muted/30'}`}
                        >
                          {/* Main Row */}
                          <div className="flex items-center gap-3 p-4">
                            {/* Checkbox */}
                            {topic.status === 'discovered' && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTopicSelection(topic.id)}
                                className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-primary"
                              />
                            )}

                            {/* Viral Score Circle */}
                            <div
                              className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold shrink-0 ${
                                topic.viralPotential >= 8
                                  ? 'bg-green-500/20 text-green-600'
                                  : topic.viralPotential >= 6
                                    ? 'bg-yellow-500/20 text-yellow-600'
                                    : 'bg-red-500/20 text-red-500'
                              }`}
                            >
                              {topic.viralPotential}
                            </div>

                            {/* Content */}
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                            >
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <h4 className="font-semibold">{topic.primaryName}</h4>
                                <Badge
                                  variant={
                                    topic.status === 'discovered'
                                      ? 'default'
                                      : topic.status === 'queued'
                                        ? 'secondary'
                                        : topic.status === 'used'
                                          ? 'outline'
                                          : 'destructive'
                                  }
                                  className="text-[10px]"
                                >
                                  {topic.status}
                                </Badge>
                                {isTrending && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] gap-1 border-orange-500/50 text-orange-600"
                                  >
                                    <TrendingUp className="w-2.5 h-2.5" />
                                    Trending
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {eraEmoji} {era}
                                </span>
                                {topic.fiveW1H?.where?.region && (
                                  <span className="text-xs text-muted-foreground">• {topic.fiveW1H.where.region}</span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-1">{topic.discoveryAngle}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              {topic.status === 'discovered' && (
                                <>
                                  <Button
                                    size="sm"
                                    className="gap-1 h-8"
                                    onClick={() => generateFromTopicMutation.mutate(topic)}
                                    disabled={generateFromTopicMutation.isPending}
                                  >
                                    {generateFromTopicMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Zap className="w-3 h-3" />
                                    )}
                                    Generate
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      rejectTopicMutation.mutate({ id: topic.id, reason: 'Manually rejected' })
                                    }
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {topic.status === 'used' && (
                                <Badge variant="outline" className="text-[10px] text-green-600">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Generated
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Expanded Detail Panel */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-0 border-t mx-4 mb-2 mt-0">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                                {/* 5W1H Details */}
                                <div className="space-y-3">
                                  <h5 className="text-sm font-semibold flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" />
                                    5W1H Context
                                  </h5>
                                  {topic.fiveW1H?.who?.mainSubject && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase">Who</span>
                                      <p className="text-sm">{topic.fiveW1H.who.mainSubject}</p>
                                      {topic.fiveW1H.who.keyPeople && topic.fiveW1H.who.keyPeople.length > 0 && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          Key people: {topic.fiveW1H.who.keyPeople.join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {topic.fiveW1H?.what?.primaryEvent && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase">What</span>
                                      <p className="text-sm">{topic.fiveW1H.what.primaryEvent}</p>
                                      {topic.fiveW1H.what.significance && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          {topic.fiveW1H.what.significance}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {topic.fiveW1H?.when?.timePeriod && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase">When</span>
                                      <p className="text-sm">
                                        {topic.fiveW1H.when.timePeriod} ({era})
                                      </p>
                                    </div>
                                  )}
                                  {topic.fiveW1H?.where?.primaryLocation && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase">Where</span>
                                      <p className="text-sm">{topic.fiveW1H.where.primaryLocation}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Right Column: Why, How, Scores */}
                                <div className="space-y-3">
                                  {topic.fiveW1H?.why?.motivation && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase">Why</span>
                                      <p className="text-sm">{topic.fiveW1H.why.motivation}</p>
                                      {topic.fiveW1H.why.modernRelevance && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          Modern relevance: {topic.fiveW1H.why.modernRelevance}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {topic.fiveW1H?.how?.mechanism && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase">How</span>
                                      <p className="text-sm">{topic.fiveW1H.how.mechanism}</p>
                                    </div>
                                  )}

                                  {/* Scores */}
                                  <div className="flex items-center gap-3 pt-2">
                                    <div className="text-center">
                                      <p
                                        className={`text-lg font-bold ${topic.viralPotential >= 8 ? 'text-green-500' : topic.viralPotential >= 6 ? 'text-yellow-500' : 'text-red-500'}`}
                                      >
                                        {topic.viralPotential}/10
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">Viral Score</p>
                                    </div>
                                    {topic.visualAppeal && (
                                      <div className="text-center">
                                        <p className="text-lg font-bold text-blue-500">{topic.visualAppeal}/100</p>
                                        <p className="text-[10px] text-muted-foreground">Visual Appeal</p>
                                      </div>
                                    )}
                                    {isTrending && (
                                      <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-600">
                                        Source: YouTube Trends
                                      </Badge>
                                    )}
                                    {!isTrending && (
                                      <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-600">
                                        Source: AI Discovery
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Discovery Angle (full) */}
                                  <div className="bg-muted/50 rounded-lg p-3">
                                    <span className="text-xs font-medium text-muted-foreground uppercase">
                                      Viral Hook
                                    </span>
                                    <p className="text-sm mt-1">{topic.discoveryAngle}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Jobs</CardTitle>
              <CardDescription>Complete history of your video generation requests</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12" />
                      <Skeleton className="h-12 flex-1" />
                    </div>
                  ))}
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="text-center py-12" data-testid="empty-state-no-jobs">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No jobs found</h3>
                  <p className="text-sm text-muted-foreground">
                    {filter === 'all' ? 'Upload a script to create your first job' : `No ${filter} jobs at the moment`}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Thumbnail</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.map((job) => (
                        <TableRow
                          key={job.id}
                          data-testid={`row-job-${job.id}`}
                          className="cursor-pointer hover-elevate"
                          onClick={() => setPreviewJob(job)}
                        >
                          <TableCell>
                            {job.thumbnailUrl ? (
                              <img
                                src={job.thumbnailUrl}
                                alt={job.scriptName ?? undefined}
                                className="w-16 h-9 object-cover rounded border"
                              />
                            ) : (
                              <div className="w-16 h-9 bg-muted rounded border flex items-center justify-center">
                                <Film className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              {getStatusIcon(job.status)}
                              {getStatusBadge(job.status)}
                              {job.retryCount && job.retryCount > 0 && (
                                <Badge variant="outline" className="text-xs" data-testid={`badge-retry-${job.id}`}>
                                  Retry {job.retryCount}/{job.maxRetries || 3}
                                </Badge>
                              )}
                              {job.mode === 'unity_kling' &&
                                job.status === 'completed' &&
                                findPackageForJob(job)?.packageData?.finalVideoUrl && (
                                  <Badge
                                    className="text-xs bg-primary/20 text-primary border-primary/30"
                                    data-testid={`badge-final-ready-${job.id}`}
                                  >
                                    <Film className="w-3 h-3 mr-1" />
                                    Final Ready
                                  </Badge>
                                )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium" data-testid={`text-job-name-${job.id}`}>
                                {job.scriptName}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">{job.id.slice(0, 8)}...</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  job.mode === 'veo' || job.mode === 'unity_kling'
                                    ? 'default'
                                    : job.mode === 'kling'
                                      ? 'outline'
                                      : job.mode === 'music'
                                        ? 'default'
                                        : 'secondary'
                                }
                              >
                                {job.mode === 'veo' || job.mode === 'unity_kling'
                                  ? 'Kling'
                                  : job.mode === 'kling'
                                    ? 'Kling'
                                    : job.mode === 'music'
                                      ? 'Music'
                                      : 'Consistent'}
                              </Badge>
                              {job.aspectRatio === '9:16' ? (
                                <Badge variant="outline" className="bg-black text-white border-black">
                                  <SiTiktok className="w-3 h-3 mr-1" />
                                  9:16
                                </Badge>
                              ) : job.aspectRatio === '16:9' ? (
                                <Badge variant="outline" className="bg-red-600 text-white border-red-600">
                                  <SiYoutube className="w-3 h-3 mr-1" />
                                  16:9
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="w-32 space-y-1">
                              <Progress value={job.progress} className="h-2" />
                              <p className="text-xs text-muted-foreground" data-testid={`text-progress-${job.id}`}>
                                {job.progress}%
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm" data-testid={`text-cost-${job.id}`}>
                              {formatCost(job.cost)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm" data-testid={`text-duration-${job.id}`}>
                              {formatDuration(
                                job.duration || (job.audioDuration ? parseFloat(job.audioDuration) : null),
                              )}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground" data-testid={`text-created-${job.id}`}>
                              {formatCreatedAt(job.createdAt)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {job.status === 'queued' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-cancel-${job.id}`}
                                  disabled={cancelJobMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelJobMutation.mutate(job.id);
                                  }}
                                >
                                  <XCircle className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
                              {job.status === 'processing' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-stop-${job.id}`}
                                  disabled={stopJobMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    stopJobMutation.mutate(job.id);
                                  }}
                                >
                                  <XCircle className="w-4 h-4 text-orange-500" />
                                </Button>
                              )}
                              {/* Retry Button for failed jobs */}
                              {job.status === 'failed' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-retry-${job.id}`}
                                  disabled={retryJobMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    retryJobMutation.mutate(job.id);
                                  }}
                                  title="Retry failed job"
                                >
                                  <RefreshCw className="w-4 h-4 text-blue-500" />
                                </Button>
                              )}
                              {/* YouTube Upload Button for completed jobs */}
                              {job.status === 'completed' &&
                                (job.videoUrl || findPackageForJob(job)?.packageData?.finalVideoUrl) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    data-testid={`button-youtube-${job.id}`}
                                    title={
                                      youtubeStatus?.data?.authenticated ||
                                      (connectedChannels && connectedChannels.length > 0)
                                        ? 'Upload to YouTube'
                                        : 'Connect YouTube first'
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (
                                        !youtubeStatus?.data?.authenticated &&
                                        !(connectedChannels && connectedChannels.length > 0)
                                      ) {
                                        toast({
                                          title: 'YouTube not connected',
                                          description: 'Go to Settings to connect your YouTube account first.',
                                          variant: 'destructive',
                                        });
                                        return;
                                      }
                                      openYouTubeUpload(job.id);
                                    }}
                                  >
                                    <SiYoutube
                                      className={`w-4 h-4 ${youtubeStatus?.data?.authenticated || (connectedChannels && connectedChannels.length > 0) ? 'text-red-500' : 'text-muted-foreground'}`}
                                    />
                                  </Button>
                                )}
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-view-${job.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewJob(job);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Job Detail Modal */}
      <Dialog open={!!previewJob} onOpenChange={(open) => !open && setPreviewJob(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-video-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewJob && getStatusIcon(previewJob.status)}
              {previewJob?.scriptName}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              <Badge
                variant={
                  previewJob?.mode === 'veo' || previewJob?.mode === 'unity_kling'
                    ? 'default'
                    : previewJob?.mode === 'kling'
                      ? 'outline'
                      : previewJob?.mode === 'music'
                        ? 'default'
                        : 'secondary'
                }
              >
                {previewJob?.mode === 'veo' || previewJob?.mode === 'unity_kling'
                  ? 'Kling AI'
                  : previewJob?.mode === 'kling'
                    ? 'Kling AI'
                    : previewJob?.mode === 'music'
                      ? 'Music Video'
                      : 'Consistent Character'}
              </Badge>
              {previewJob?.aspectRatio === '9:16' ? (
                <Badge variant="outline" className="bg-black text-white border-black">
                  <SiTiktok className="w-3 h-3 mr-1" />
                  TikTok 9:16
                </Badge>
              ) : previewJob?.aspectRatio === '16:9' ? (
                <Badge variant="outline" className="bg-red-600 text-white border-red-600">
                  <SiYoutube className="w-3 h-3 mr-1" />
                  YouTube 16:9
                </Badge>
              ) : null}
              {previewJob && getStatusBadge(previewJob.status)}
              {previewJob?.cost && <span className="font-mono">{formatCost(previewJob.cost)}</span>}
              {(previewJob?.duration || previewJob?.audioDuration) && (
                <span>
                  {formatDuration(
                    previewJob.duration || (previewJob.audioDuration ? parseFloat(previewJob.audioDuration) : null),
                  )}
                </span>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-4">
            {/* Thumbnail Preview */}
            {previewJob?.thumbnailUrl && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Thumbnail</span>
                </div>
                <img src={previewJob.thumbnailUrl} alt="Video thumbnail" className="w-full rounded-lg border" />
              </div>
            )}

            {/* Unity VEO - Final Assembled Video (check both package and job for videoUrl) */}
            {previewJob?.mode === 'unity_kling' &&
            previewJob?.status === 'completed' &&
            (matchingPackage?.packageData?.finalVideoUrl || previewJob?.videoUrl) ? (
              <div className="space-y-4">
                {/* Final Video Player */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="font-medium">Final Assembled Video</span>
                    <Badge variant="outline" className="text-xs">
                      {generatedClips.length} clips + music
                    </Badge>
                  </div>
                  <video
                    controls
                    autoPlay
                    preload="metadata"
                    playsInline
                    className={`rounded-lg bg-black ${previewJob.aspectRatio === '9:16' ? 'h-[60vh] max-h-[600px] mx-auto' : 'w-full aspect-video'}`}
                    data-testid="video-final"
                    poster={previewJob.thumbnailUrl || undefined}
                    onError={(e) => console.error('Video error:', e)}
                    onLoadStart={() => console.log('Video loading started')}
                    onLoadedData={() => console.log('Video data loaded')}
                  >
                    <source
                      src={matchingPackage?.packageData?.finalVideoUrl || previewJob?.videoUrl}
                      type="video/mp4"
                    />
                    Your browser does not support the video tag.
                  </video>
                </div>

                {/* Download & Upload Buttons for Final Video */}
                <div className="flex flex-col items-center gap-3 pt-2 border-t">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <a
                      href={`${matchingPackage?.packageData?.finalVideoUrl || previewJob?.videoUrl}/download`}
                      data-testid="link-download-final"
                    >
                      <Button>
                        <Download className="w-4 h-4 mr-2" />
                        Download Final Video
                      </Button>
                    </a>
                    {(youtubeStatus?.data?.authenticated || (connectedChannels && connectedChannels.length > 0)) && (
                      <Button
                        variant="outline"
                        className="gap-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
                        onClick={() => previewJob && openYouTubeUpload(previewJob.id)}
                        data-testid="button-youtube-upload"
                      >
                        <SiYoutube className="w-4 h-4" />
                        Upload to YouTube
                      </Button>
                    )}
                  </div>
                  <Link href="/unity-content">
                    <Button variant="outline" className="gap-1">
                      <ExternalLink className="w-3 h-3" />
                      View in Unity Content
                    </Button>
                  </Link>
                </div>

                {/* Collapsible Clips Preview */}
                {generatedClips.length > 0 && (
                  <details className="border rounded-lg">
                    <summary className="p-3 cursor-pointer hover-elevate flex items-center gap-2">
                      <Film className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Download Individual Clips ({generatedClips.filter((c: any) => !c.error).length}/
                        {generatedClips.length})
                      </span>
                    </summary>
                    <div className="p-3 pt-0">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {generatedClips.map((clip: any, i: number) => (
                          <div key={i} className="relative rounded-lg overflow-hidden border bg-muted/30 group">
                            {clip.error ? (
                              <div className="p-2 flex items-center justify-center h-[80px] text-destructive">
                                <AlertCircle className="h-4 w-4" />
                              </div>
                            ) : (
                              <>
                                <video className="w-full h-[80px] object-cover bg-black" src={clip.videoUrl} controls />
                                <a
                                  href={clip.videoUrl}
                                  download={`clip_${clip.clipIndex + 1}.mp4`}
                                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                  data-testid={`link-download-clip-${i}`}
                                >
                                  <Button size="sm" variant="secondary" className="gap-1">
                                    <Download className="w-3 h-3" />
                                    Clip {clip.clipIndex + 1}
                                  </Button>
                                </a>
                              </>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex justify-between items-center">
                              <span className="text-[10px] text-white font-medium">#{clip.clipIndex + 1}</span>
                              {!clip.error && (
                                <a
                                  href={clip.videoUrl}
                                  download={`clip_${clip.clipIndex + 1}.mp4`}
                                  className="text-white hover:text-primary transition-colors"
                                  data-testid={`button-download-clip-${i}`}
                                >
                                  <Download className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                )}
              </div>
            ) : previewJob?.mode === 'unity_kling' &&
              previewJob?.status === 'completed' &&
              generatedClips.length > 0 ? (
              /* Unity VEO - Clips only (no final video yet) */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Generated Clips ({generatedClips.filter((c: any) => !c.error).length}/{generatedClips.length})
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      Awaiting assembly
                    </Badge>
                  </div>
                  {matchingPackage && (
                    <Link href="/unity-content">
                      <Button variant="outline" size="sm" className="gap-1">
                        <ExternalLink className="w-3 h-3" />
                        View in Unity
                      </Button>
                    </Link>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
                  {generatedClips.slice(0, 12).map((clip: any, i: number) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border bg-muted/30 group">
                      {clip.error ? (
                        <div className="p-2 flex flex-col items-center justify-center h-[100px] text-destructive">
                          <AlertCircle className="h-4 w-4 mb-1" />
                          <p className="text-[10px] text-center line-clamp-2">{clip.error}</p>
                        </div>
                      ) : (
                        <>
                          <video
                            controls
                            className="w-full h-[100px] object-cover bg-black"
                            src={clip.videoUrl}
                            data-testid={`video-clip-${i}`}
                          />
                          <a
                            href={clip.videoUrl}
                            download={`clip_${clip.clipIndex + 1}.mp4`}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <Button size="sm" variant="secondary" className="gap-1">
                              <Download className="w-3 h-3" />
                              Download
                            </Button>
                          </a>
                        </>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex justify-between items-center">
                        <span className="text-[10px] text-white font-medium">#{clip.clipIndex + 1}</span>
                        {!clip.error && (
                          <a
                            href={clip.videoUrl}
                            download={`clip_${clip.clipIndex + 1}.mp4`}
                            className="text-white hover:text-primary transition-colors"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {generatedClips.length > 12 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{generatedClips.length - 12} more clips - view all in Unity Content
                  </p>
                )}
              </div>
            ) : previewJob?.mode === 'unity_kling' &&
              previewJob?.status === 'completed' &&
              generatedClips.length === 0 ? (
              <div className="bg-muted rounded-lg p-8 text-center aspect-video flex flex-col items-center justify-center">
                <Film className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Clips Found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Clips may still be loading or the package wasn't found
                </p>
                <Link href="/unity-content">
                  <Button variant="outline" size="sm" className="mt-4 gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Go to Unity Content
                  </Button>
                </Link>
              </div>
            ) : previewJob?.status === 'completed' && previewJob?.videoUrl ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="font-medium">{previewJob.mode === 'music' ? 'Music Video' : 'Final Video'}</span>
                    {previewJob.mode === 'music' && (
                      <Badge variant="outline" className="text-xs">
                        Beat Visualization
                      </Badge>
                    )}
                  </div>
                  <video
                    controls
                    autoPlay
                    preload="metadata"
                    playsInline
                    className={`rounded-lg bg-black ${previewJob.aspectRatio === '9:16' ? 'h-[60vh] max-h-[600px] mx-auto' : 'w-full aspect-video'}`}
                    data-testid="video-player"
                    poster={previewJob.thumbnailUrl || undefined}
                    onError={(e) => console.error('Video error:', e)}
                    onLoadStart={() => console.log('Video loading started')}
                    onLoadedData={() => console.log('Video data loaded')}
                  >
                    <source src={previewJob.videoUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
                <div className="flex flex-col items-center gap-3 pt-2 border-t">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <a href={`${previewJob.videoUrl}/download`} data-testid="link-download-video">
                      <Button>
                        <Download className="w-4 h-4 mr-2" />
                        Download Video
                      </Button>
                    </a>
                    {(youtubeStatus?.data?.authenticated || (connectedChannels && connectedChannels.length > 0)) && (
                      <Button
                        variant="outline"
                        className="gap-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
                        onClick={() => previewJob && openYouTubeUpload(previewJob.id)}
                        data-testid="button-youtube-upload"
                      >
                        <SiYoutube className="w-4 h-4" />
                        Upload to YouTube
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : previewJob?.status === 'processing' ? (
              <div className="bg-muted rounded-lg p-8 text-center aspect-video flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium">Generating Video...</p>
                <Progress value={previewJob.progress} className="w-48 h-2 mt-4" />
                <p className="text-sm text-muted-foreground mt-2">{previewJob.progress}% complete</p>
              </div>
            ) : previewJob?.status === 'queued' ? (
              <div className="bg-muted rounded-lg p-8 text-center aspect-video flex flex-col items-center justify-center">
                <Clock className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Waiting in Queue</p>
                <p className="text-sm text-muted-foreground mt-2">This job will start processing soon</p>
              </div>
            ) : previewJob?.status === 'failed' ? (
              <div className="bg-destructive/10 rounded-lg p-8 text-center aspect-video flex flex-col items-center justify-center">
                <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                <p className="text-lg font-medium">Generation Failed</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  {previewJob.errorMessage || 'An error occurred during video generation'}
                </p>
              </div>
            ) : null}
            {/* Generated Prompts Section */}
            {(previewJob as any)?.generatedPrompts && (previewJob as any).generatedPrompts.length > 0 && (
              <details className="border rounded-lg" data-testid="section-prompts">
                <summary className="p-3 cursor-pointer hover-elevate flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">
                    View Generated Prompts ({(previewJob as any).generatedPrompts.length} clips)
                  </span>
                </summary>
                <div className="p-3 pt-0 space-y-2 max-h-80 overflow-y-auto">
                  {(previewJob as any).generatedPrompts.map((p: any, i: number) => (
                    <div key={i} className="border rounded-lg p-3 bg-muted/30 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          Clip {p.clipIndex + 1}
                        </Badge>
                        {p.energy && (
                          <span className="text-muted-foreground">Energy: {parseFloat(p.energy).toFixed(1)}</span>
                        )}
                        {p.camera && <span className="text-muted-foreground">{p.camera}</span>}
                      </div>
                      <p className="text-foreground whitespace-pre-wrap font-mono">{p.prompt}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Generated Description Section */}
            {previewJob?.generatedDescription && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Upload Description</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(previewJob.generatedDescription || '');
                      setCopied(true);
                      toast({ title: 'Copied!', description: 'Description copied to clipboard' });
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    data-testid="button-copy-description"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                  {previewJob.generatedDescription}
                </pre>
              </div>
            )}

            {/* Download Buttons - Only for Completed Jobs */}
            {previewJob?.status === 'completed' && previewJob?.videoUrl && (
              <div className="flex items-center justify-between gap-4 pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  <p className="font-mono text-xs">{previewJob?.id}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (previewJob?.videoUrl) {
                        const link = document.createElement('a');
                        link.href = previewJob.videoUrl;
                        link.download = `${previewJob.scriptName}.mp4`;
                        link.click();
                      }
                    }}
                    data-testid="button-download-video"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download 16:9
                  </Button>
                  <Button
                    onClick={() => {
                      if (previewJob) {
                        toast({
                          title: 'Converting...',
                          description: 'Creating vertical version (this may take a moment)',
                        });
                        const link = document.createElement('a');
                        link.href = `/api/jobs/${previewJob.id}/download-vertical`;
                        link.download = `${previewJob.scriptName}_vertical.mp4`;
                        link.click();
                      }
                    }}
                    data-testid="button-download-vertical"
                  >
                    <Smartphone className="w-4 h-4 mr-2" />
                    Download 9:16
                  </Button>
                </div>
              </div>
            )}

            {/* Job ID for non-completed jobs */}
            {previewJob?.status !== 'completed' && (
              <div className="text-sm text-muted-foreground pt-2 border-t">
                <p className="font-mono text-xs">{previewJob?.id}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* YouTube Upload Dialog */}
      <Dialog
        open={youtubeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setYoutubeDialogOpen(false);
            setYoutubeMetadata(null);
            setUploadJobId(null);
            setThumbnailUrl(null);
            setSelectedChannel(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-youtube-upload">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiYoutube className="w-5 h-5 text-red-500" />
              Upload to YouTube
            </DialogTitle>
            <DialogDescription>
              AI-generated title, description, and tags for your video. Edit before uploading.
            </DialogDescription>
          </DialogHeader>

          {generateMetadataMutation.isPending ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Generating optimized metadata with AI...</p>
            </div>
          ) : youtubeMetadata ? (
            <div className="space-y-4">
              {/* Channel Selection */}
              <div className="space-y-2">
                <Label htmlFor="channel-select">YouTube Channel</Label>
                <select
                  id="channel-select"
                  value={selectedChannel?.id || ''}
                  onChange={(e) => {
                    const channel = connectedChannels?.find((c: any) => c.id === e.target.value);
                    setSelectedChannel(channel || null);
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select a channel...</option>
                  {connectedChannels?.map((channel: any) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.title}
                    </option>
                  ))}
                </select>

                {selectedChannel && (
                  <div className="flex items-center gap-3 p-2 rounded-lg border bg-muted/50">
                    <img
                      src={selectedChannel.thumbnailUrl}
                      alt={selectedChannel.title}
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{selectedChannel.title}</p>
                      <p className="text-xs text-green-600">✓ Ready to upload</p>
                    </div>
                  </div>
                )}

                {!selectedChannel && connectedChannels && connectedChannels.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {connectedChannels.length} authenticated channel{connectedChannels.length !== 1 ? 's' : ''}{' '}
                    available
                  </p>
                )}
              </div>

              {/* Scheduled Upload Time */}
              <div className="space-y-2">
                <Label htmlFor="scheduled-time">Schedule Upload (Optional)</Label>
                <Input
                  id="scheduled-time"
                  type="datetime-local"
                  value={scheduledUploadTime}
                  onChange={(e) => setScheduledUploadTime(e.target.value)}
                  className="w-full"
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="text-xs text-muted-foreground">
                  {scheduledUploadTime
                    ? `Will upload at ${new Date(scheduledUploadTime).toLocaleString()}`
                    : 'Leave empty to upload immediately'}
                </p>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="yt-title">Title</Label>
                <Input
                  id="yt-title"
                  value={youtubeMetadata.title}
                  onChange={(e) => setYoutubeMetadata({ ...youtubeMetadata, title: e.target.value })}
                  maxLength={100}
                  data-testid="input-youtube-title"
                />
                <p className="text-xs text-muted-foreground">{(youtubeMetadata.title || '').length}/100 characters</p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="yt-description">Description</Label>
                <Textarea
                  id="yt-description"
                  value={youtubeMetadata.description}
                  onChange={(e) => setYoutubeMetadata({ ...youtubeMetadata, description: e.target.value })}
                  rows={6}
                  maxLength={5000}
                  data-testid="input-youtube-description"
                />
                <p className="text-xs text-muted-foreground">
                  {(youtubeMetadata.description || '').length}/5000 characters
                </p>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label htmlFor="yt-tags">Tags (comma-separated)</Label>
                <Input
                  id="yt-tags"
                  value={youtubeMetadata.tags.join(', ')}
                  onChange={(e) =>
                    setYoutubeMetadata({
                      ...youtubeMetadata,
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  data-testid="input-youtube-tags"
                />
                <p className="text-xs text-muted-foreground">{youtubeMetadata.tags.length} tags</p>
              </div>

              {/* Thumbnail Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Thumbnail</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateThumbnailMutation.mutate(youtubeMetadata.thumbnailPrompt)}
                    disabled={generateThumbnailMutation.isPending}
                    data-testid="button-generate-thumbnail"
                  >
                    {generateThumbnailMutation.isPending ? (
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 mr-2" />
                    )}
                    Generate Thumbnail
                  </Button>
                </div>

                {thumbnailUrl ? (
                  <div className="relative rounded-lg overflow-hidden border">
                    <img
                      src={thumbnailUrl}
                      alt="Generated thumbnail"
                      className="w-full aspect-video object-cover"
                      data-testid="img-thumbnail-preview"
                    />
                    <a
                      href={thumbnailUrl}
                      download="thumbnail.png"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 right-2"
                    >
                      <Button size="sm" variant="secondary">
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </Button>
                    </a>
                  </div>
                ) : (
                  <div className="border border-dashed rounded-lg p-4 text-center text-muted-foreground">
                    <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Click "Generate Thumbnail" to create an AI thumbnail</p>
                    <p className="text-xs mt-1">You can upload this to YouTube Studio after the video is uploaded</p>
                  </div>
                )}

                {/* Thumbnail Prompt */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Edit thumbnail prompt
                  </summary>
                  <Textarea
                    value={youtubeMetadata.thumbnailPrompt}
                    onChange={(e) => setYoutubeMetadata({ ...youtubeMetadata, thumbnailPrompt: e.target.value })}
                    rows={3}
                    className="mt-2"
                    data-testid="input-thumbnail-prompt"
                  />
                </details>
              </div>

              {/* Privacy Notice */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">
                  <strong>Privacy:</strong> Videos are uploaded as <Badge variant="secondary">Private</Badge> by
                  default. You can change visibility in YouTube Studio after upload.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p>Failed to generate metadata. Please try again.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => uploadJobId && generateMetadataMutation.mutate(uploadJobId)}
              >
                Retry
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setYoutubeDialogOpen(false)} data-testid="button-cancel-upload">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (uploadJobId && youtubeMetadata && selectedChannel) {
                  uploadToYouTubeMutation.mutate({
                    jobId: uploadJobId,
                    metadata: youtubeMetadata,
                    channelConnectionId: selectedChannel.id,
                    scheduledTime: scheduledUploadTime || undefined,
                  });
                }
              }}
              disabled={!youtubeMetadata || uploadToYouTubeMutation.isPending || !selectedChannel}
              className="gap-2 bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-upload"
            >
              {uploadToYouTubeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload to YouTube
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Schedule Dialog */}
      <Dialog open={bulkScheduleOpen} onOpenChange={setBulkScheduleOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-bulk-schedule">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Schedule All Videos
            </DialogTitle>
            <DialogDescription>
              Automatically distribute your completed videos across multiple days with optimal posting times
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium">Ready to Schedule</p>
                  <p className="text-xs text-muted-foreground">
                    {filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length} completed videos
                  </p>
                </div>
                <Badge variant="outline" className="text-lg font-bold">
                  {filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length}
                </Badge>
              </div>

              {/* Preview calculation */}
              {filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    📅 Spread across: <strong>{daysToSpread} days</strong>
                  </p>
                  <p>
                    📊 Videos per day: <strong>{uploadsPerDay}</strong>
                  </p>
                  <p>⏰ Posting times: 12pm, 2pm, 4pm, 6pm, 8pm</p>
                  <p>🎯 Optimal distribution for maximum reach</p>
                </div>
              )}
            </div>

            {/* Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date & Time</Label>
                <Input
                  id="start-date"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="text-xs text-muted-foreground">
                  First video will be scheduled for {new Date(startDate).toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="days-spread">Days to Spread</Label>
                  <Input
                    id="days-spread"
                    type="number"
                    min={1}
                    max={30}
                    value={daysToSpread}
                    onChange={(e) => setDaysToSpread(parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground">How many days to distribute videos</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="uploads-per-day">Uploads Per Day</Label>
                  <Input
                    id="uploads-per-day"
                    type="number"
                    min={1}
                    max={10}
                    value={uploadsPerDay}
                    onChange={(e) => setUploadsPerDay(parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground">Videos to post each day</p>
                </div>
              </div>
            </div>

            {/* Video List Preview */}
            <div className="space-y-2">
              <Label>Videos to Schedule</Label>
              <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                {filteredJobs
                  .filter((j) => j.status === 'completed' && !j.youtubeVideoId)
                  .slice(0, 10)
                  .map((job, index) => (
                    <div key={job.id} className="flex items-center gap-3 p-2 border-b last:border-b-0">
                      <span className="text-xs text-muted-foreground w-6">#{index + 1}</span>
                      {job.thumbnailUrl ? (
                        <img src={job.thumbnailUrl} alt="" className="w-12 h-7 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-7 bg-muted rounded flex items-center justify-center">
                          <Film className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                      <p className="text-sm flex-1 truncate">{job.scriptName}</p>
                    </div>
                  ))}
                {filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length > 10 && (
                  <div className="p-2 text-center text-xs text-muted-foreground">
                    +{filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length - 10} more videos
                  </div>
                )}
              </div>
            </div>

            {/* Warning */}
            {filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p>No completed videos available to schedule</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const completedJobs = filteredJobs
                  .filter((j) => j.status === 'completed' && !j.youtubeVideoId)
                  .map((j) => j.id);

                if (completedJobs.length === 0) {
                  toast({
                    title: 'No videos to schedule',
                    description: 'All completed videos have already been uploaded',
                    variant: 'destructive',
                  });
                  return;
                }

                bulkScheduleMutation.mutate({
                  jobIds: completedJobs,
                  startDate,
                  daysToSpread,
                  uploadsPerDay,
                });
              }}
              disabled={
                bulkScheduleMutation.isPending ||
                filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length === 0
              }
              className="gap-2"
            >
              {bulkScheduleMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <CalendarCheck className="w-4 h-4" />
                  Schedule {filteredJobs.filter((j) => j.status === 'completed' && !j.youtubeVideoId).length} Videos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
