import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  ArrowLeft,
  Play,
  Square,
  RefreshCw,
  Upload,
  Film,
  Clock,
  DollarSign,
  FileVideo,
  AlertCircle,
  CheckCircle,
  Loader2,
  TrendingUp,
  Eye,
  ThumbsUp,
  MessageSquare,
  Share2,
  Users,
  BarChart3,
  Music,
  Sparkles,
  Zap,
  Activity,
  ArrowRight,
  XCircle,
} from 'lucide-react';
import { SiYoutube, SiTiktok } from 'react-icons/si';
import type { Job, JobProgressLog } from '@shared/schema';
import { AnimatedPerformanceCharts } from '@/components/animated-performance-charts';

interface VideoAnalyticsRaw {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: string | number;
  likeCount: string | number;
  commentCount: string | number;
  shareCount?: string | number;
  subscribersGained?: string | number;
  averageViewDuration?: string | number;
  averageViewPercentage?: string | number;
  impressions?: string | number;
  ctr?: string | number;
}

interface ClipBreakdown {
  clipIndex: number;
  clipPath?: string;
  visualScores: {
    eraAccuracy: number;
    characterConsistency: number;
    anachronismScore: number;
    continuityScore: number;
    overall: number;
  };
  prePost: {
    preRegenerationScore: number;
    postRegenerationScore: number | null;
    wasRegenerated: boolean;
    regenerationCount: number;
    improvement: number | null;
  };
  passed: boolean;
  analysis?: string;
  createdAt?: string;
}

interface QualityScoresResponse {
  success: boolean;
  breakdown?: {
    visualLayer: {
      avgEraAccuracy: number;
      avgCharacterConsistency: number;
      avgAnachronismScore: number;
      avgContinuityScore: number;
    };
    audioLayer: {
      dnaScores: {
        energy_score: number;
        rhythm_score: number;
        clarity_score: number;
        hook_score: number;
      };
    };
    regenerationStats: {
      totalClips: number;
      regeneratedClips: number;
      avgPreScore: number | null;
      avgPostScore: number | null;
      avgImprovement: number | null;
    };
    clips?: ClipBreakdown[];
  };
  error?: string;
}

function parseNumber(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(num) ? 0 : num;
}

function getScoreBadgeVariant(score: number): 'default' | 'secondary' | 'destructive' {
  if (score >= 70) return 'default';
  if (score >= 40) return 'secondary';
  return 'destructive';
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const { toast } = useToast();

  const {
    data: jobData,
    isLoading,
    error,
  } = useQuery<{ data: Job }>({
    queryKey: ['/api/jobs', jobId],
    enabled: !!jobId,
    refetchInterval: (data) => {
      const job = data?.state?.data?.data;
      if (job?.status === 'processing' || job?.status === 'queued') {
        return 3000;
      }
      return false;
    },
  });

  const { data: logsData, isLoading: logsLoading } = useQuery<{ data: JobProgressLog[] }>({
    queryKey: ['/api/jobs', jobId, 'progress-logs'],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/progress-logs`, {
        credentials: 'include',
      });
      return res.json();
    },
    enabled: !!jobId,
    refetchInterval: jobData?.data?.status === 'processing' ? 5000 : false,
  });

  const youtubeVideoId = jobData?.data?.youtubeVideoId;

  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery<{ success: boolean; data?: VideoAnalyticsRaw; error?: string }>({
    queryKey: ['/api/youtube/analytics', youtubeVideoId],
    queryFn: async () => {
      const res = await fetch(`/api/youtube/analytics/${youtubeVideoId}`, {
        credentials: 'include',
      });
      return res.json();
    },
    enabled: !!youtubeVideoId,
    refetchInterval: 60000,
    retry: false,
  });

  const { data: qualityScoresData, isLoading: qualityScoresLoading } = useQuery<QualityScoresResponse>({
    queryKey: ['/api/accuracy/full-breakdown', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/accuracy/full-breakdown/${jobId}`, {
        credentials: 'include',
      });
      return res.json();
    },
    enabled: !!jobId && jobData?.data?.status === 'completed',
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/jobs/${jobId}/cancel`);
    },
    onSuccess: () => {
      toast({ title: 'Job cancelled' });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to cancel', description: err.message, variant: 'destructive' });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/jobs/${jobId}/retry`);
    },
    onSuccess: () => {
      toast({ title: 'Job retried' });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to retry', description: err.message, variant: 'destructive' });
    },
  });

  const job = jobData?.data;
  const logs = logsData?.data || [];
  const analyticsRaw = analyticsData?.success ? analyticsData.data : null;
  const analyticsErrorMsg = analyticsData?.error;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Job Not Found</h2>
            <p className="text-muted-foreground mb-4">The job you're looking for doesn't exist or has been deleted.</p>
            <Link href="/jobs">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Jobs
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case 'queued':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Queued
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/30">
            <AlertCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="secondary">
            <XCircle className="w-3 h-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCost = (cost: string | null) => {
    if (!cost) return '—';
    return `$${parseFloat(cost).toFixed(2)}`;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleString();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" data-testid="text-job-title">
            {job.scriptName}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{job.id}</p>
        </div>
        {getStatusBadge(job.status)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {job.status === 'processing' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Generating video...</span>
                    <span data-testid="text-progress">{job.progress}%</span>
                  </div>
                  <Progress value={job.progress} className="h-2" />
                </div>
              </CardContent>
            </Card>
          )}

          {job.videoUrl && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  Video Output
                </CardTitle>
              </CardHeader>
              <CardContent>
                <video
                  src={job.videoUrl}
                  controls
                  className="w-full rounded-lg max-h-[400px]"
                  poster={job.thumbnailUrl || undefined}
                  data-testid="video-output"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Script Content</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                <pre
                  className="text-sm whitespace-pre-wrap font-mono bg-muted p-4 rounded-lg"
                  data-testid="text-script"
                >
                  {job.scriptContent}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>

          {logs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {logs.map((log, idx) => (
                      <div key={log.id || idx} className="flex gap-3 text-sm">
                        <span className="text-muted-foreground shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-muted-foreground">{log.progress}%</span>
                        <span data-testid={`text-log-${idx}`}>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {youtubeVideoId && (
            <div data-testid="card-youtube-analytics" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <SiYoutube className="w-5 h-5 text-red-600" />
                    YouTube Analytics
                  </CardTitle>
                  <CardDescription>
                    <a
                      href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                      data-testid="link-youtube-video"
                    >
                      View on YouTube
                    </a>
                  </CardDescription>
                </CardHeader>
              </Card>
              <AnimatedPerformanceCharts videoId={youtubeVideoId} refreshInterval={60000} />
            </div>
          )}

          <Card data-testid="card-quality-scores">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Quality Scores
              </CardTitle>
              <CardDescription>Visual and audio quality analysis</CardDescription>
            </CardHeader>
            <CardContent>
              {qualityScoresLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-4 w-24" />
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                </div>
              ) : !qualityScoresData?.success || !qualityScoresData?.breakdown ? (
                <div className="text-center py-6">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground" data-testid="text-quality-empty">
                    {job.status === 'completed'
                      ? 'Quality scores not available for this job'
                      : 'Quality scores will be available after job completion'}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Visual Layer</span>
                    </div>
                    <div className="space-y-3" data-testid="section-visual-scores">
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Era Accuracy</span>
                          <Badge
                            variant={getScoreBadgeVariant(qualityScoresData.breakdown.visualLayer.avgEraAccuracy)}
                            data-testid="score-era-accuracy"
                          >
                            {Math.round(qualityScoresData.breakdown.visualLayer.avgEraAccuracy)}
                          </Badge>
                        </div>
                        <Progress value={qualityScoresData.breakdown.visualLayer.avgEraAccuracy} className="h-2" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Character Consistency</span>
                          <Badge
                            variant={getScoreBadgeVariant(
                              qualityScoresData.breakdown.visualLayer.avgCharacterConsistency,
                            )}
                            data-testid="score-character-consistency"
                          >
                            {Math.round(qualityScoresData.breakdown.visualLayer.avgCharacterConsistency)}
                          </Badge>
                        </div>
                        <Progress
                          value={qualityScoresData.breakdown.visualLayer.avgCharacterConsistency}
                          className="h-2"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Anachronism Score</span>
                          <Badge
                            variant={getScoreBadgeVariant(qualityScoresData.breakdown.visualLayer.avgAnachronismScore)}
                            data-testid="score-anachronism"
                          >
                            {Math.round(qualityScoresData.breakdown.visualLayer.avgAnachronismScore)}
                          </Badge>
                        </div>
                        <Progress value={qualityScoresData.breakdown.visualLayer.avgAnachronismScore} className="h-2" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Continuity Score</span>
                          <Badge
                            variant={getScoreBadgeVariant(qualityScoresData.breakdown.visualLayer.avgContinuityScore)}
                            data-testid="score-continuity"
                          >
                            {Math.round(qualityScoresData.breakdown.visualLayer.avgContinuityScore)}
                          </Badge>
                        </div>
                        <Progress value={qualityScoresData.breakdown.visualLayer.avgContinuityScore} className="h-2" />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Music className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Audio Layer</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3" data-testid="section-audio-scores">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <Zap className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-lg font-bold" data-testid="score-energy">
                          {Math.round(qualityScoresData.breakdown.audioLayer.dnaScores.energy_score)}
                        </div>
                        <div className="text-xs text-muted-foreground">Energy</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <Activity className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-lg font-bold" data-testid="score-rhythm">
                          {Math.round(qualityScoresData.breakdown.audioLayer.dnaScores.rhythm_score)}
                        </div>
                        <div className="text-xs text-muted-foreground">Rhythm</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <BarChart3 className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-lg font-bold" data-testid="score-clarity">
                          {Math.round(qualityScoresData.breakdown.audioLayer.dnaScores.clarity_score)}
                        </div>
                        <div className="text-xs text-muted-foreground">Clarity</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <TrendingUp className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-lg font-bold" data-testid="score-hook">
                          {Math.round(qualityScoresData.breakdown.audioLayer.dnaScores.hook_score)}
                        </div>
                        <div className="text-xs text-muted-foreground">Hook</div>
                      </div>
                    </div>
                  </div>

                  {qualityScoresData.breakdown.clips && qualityScoresData.breakdown.clips.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <RefreshCw className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Per-Clip Breakdown</span>
                          <Badge variant="secondary" className="ml-auto">
                            {qualityScoresData.breakdown.clips.length} clips
                          </Badge>
                        </div>

                        {qualityScoresData.breakdown.regenerationStats.regeneratedClips > 0 && (
                          <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between text-sm mb-2">
                              <span className="text-muted-foreground">Regenerated</span>
                              <span className="font-medium" data-testid="stat-regenerated-clips">
                                {qualityScoresData.breakdown.regenerationStats.regeneratedClips} /{' '}
                                {qualityScoresData.breakdown.regenerationStats.totalClips}
                              </span>
                            </div>
                            {qualityScoresData.breakdown.regenerationStats.avgPreScore !== null &&
                              qualityScoresData.breakdown.regenerationStats.avgPostScore !== null && (
                                <div
                                  className="flex items-center justify-center gap-2 text-sm"
                                  data-testid="stat-improvement"
                                >
                                  <span className="text-muted-foreground">Avg:</span>
                                  <Badge variant="secondary">
                                    {Math.round(qualityScoresData.breakdown.regenerationStats.avgPreScore)}
                                  </Badge>
                                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                  <Badge variant="default">
                                    {Math.round(qualityScoresData.breakdown.regenerationStats.avgPostScore)}
                                  </Badge>
                                  {qualityScoresData.breakdown.regenerationStats.avgImprovement !== null &&
                                    qualityScoresData.breakdown.regenerationStats.avgImprovement > 0 && (
                                      <Badge variant="default" className="ml-1">
                                        +{Math.round(qualityScoresData.breakdown.regenerationStats.avgImprovement)}
                                      </Badge>
                                    )}
                                </div>
                              )}
                          </div>
                        )}

                        <ScrollArea className="h-48" data-testid="section-clip-breakdown">
                          <div className="space-y-2 pr-3">
                            {qualityScoresData.breakdown.clips.map((clip) => (
                              <div
                                key={clip.clipIndex}
                                className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-sm"
                                data-testid={`clip-score-${clip.clipIndex}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-8">#{clip.clipIndex + 1}</span>
                                  {clip.prePost.wasRegenerated && (
                                    <RefreshCw className="w-3 h-3 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {clip.prePost.wasRegenerated && clip.prePost.postRegenerationScore !== null ? (
                                    <>
                                      <Badge variant="secondary" className="text-xs">
                                        {Math.round(clip.prePost.preRegenerationScore)}
                                      </Badge>
                                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                      <Badge
                                        variant={getScoreBadgeVariant(clip.prePost.postRegenerationScore)}
                                        className="text-xs"
                                      >
                                        {Math.round(clip.prePost.postRegenerationScore)}
                                      </Badge>
                                      {clip.prePost.improvement !== null && clip.prePost.improvement > 0 && (
                                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                                          +{Math.round(clip.prePost.improvement)}
                                        </span>
                                      )}
                                      {clip.prePost.improvement !== null && clip.prePost.improvement < 0 && (
                                        <span className="text-xs font-medium text-red-600 dark:text-red-400">
                                          {Math.round(clip.prePost.improvement)}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <Badge
                                      variant={getScoreBadgeVariant(clip.visualScores.overall)}
                                      className="text-xs"
                                    >
                                      {Math.round(clip.visualScores.overall)}
                                    </Badge>
                                  )}
                                  {clip.passed ? (
                                    <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                                  ) : (
                                    <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium" data-testid="text-mode">
                  {job.mode === 'kling' || job.mode === 'unity_kling' ? 'Kling AI' : job.mode}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Aspect Ratio</span>
                <div className="flex items-center gap-2">
                  {job.aspectRatio === '9:16' ? (
                    <SiTiktok className="w-4 h-4" />
                  ) : (
                    <SiYoutube className="w-4 h-4 text-red-600" />
                  )}
                  <span data-testid="text-aspect-ratio">{job.aspectRatio}</span>
                </div>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span data-testid="text-duration">{formatDuration(job.duration)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-mono" data-testid="text-cost">
                  {formatCost(job.cost)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clips</span>
                <span data-testid="text-clips">{job.clipCount || '—'}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-sm" data-testid="text-created">
                  {formatDate(job.createdAt)}
                </span>
              </div>
              {job.updatedAt && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Updated</span>
                    <span className="text-sm" data-testid="text-updated">
                      {formatDate(job.updatedAt)}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {job.unityMetadata && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Unity Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.unityMetadata.topic && (
                  <div>
                    <span className="text-sm text-muted-foreground">Topic</span>
                    <p className="font-medium" data-testid="text-topic">
                      {job.unityMetadata.topic}
                    </p>
                  </div>
                )}
                {job.unityMetadata.hook && (
                  <div>
                    <span className="text-sm text-muted-foreground">Hook</span>
                    <p className="text-sm" data-testid="text-hook">
                      {job.unityMetadata.hook}
                    </p>
                  </div>
                )}
                {job.unityMetadata.viralScore !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Viral Score</span>
                    <Badge variant="outline" data-testid="text-viral-score">
                      {job.unityMetadata.viralScore}/100
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {job.errorMessage && (
            <Card className="border-destructive/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Error
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-destructive" data-testid="text-error">
                  {job.errorMessage}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {(job.status === 'processing' || job.status === 'queued') && (
              <Button
                variant="destructive"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                data-testid="button-cancel"
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Square className="w-4 h-4 mr-2" />
                )}
                Cancel Job
              </Button>
            )}
            {job.status === 'failed' && (
              <Button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                data-testid="button-retry"
              >
                {retryMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Retry Job
              </Button>
            )}
            {job.status === 'completed' && job.videoUrl && (
              <Button variant="outline" asChild data-testid="button-download">
                <a href={job.videoUrl} download>
                  <FileVideo className="w-4 h-4 mr-2" />
                  Download Video
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
