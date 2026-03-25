import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Zap,
  Target,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ArrowRightLeft,
  Users,
  Lightbulb,
  Eye,
  MousePointer,
  Timer,
  Download,
  Brain,
  Trophy,
  XCircle,
  Sparkles,
} from 'lucide-react';

function formatLastUpdated(timestamp: number | undefined): string {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

interface SwapVelocity {
  avgSwapsPerVideo: number;
  videosNeverSwapped: number;
  videosSwappedOnce: number;
  videosSwappedTwice: number;
  variantAWinRate: number;
  variantBWinRate: number;
  variantCWinRate: number;
  recommendation: string;
  explanation: string;
}

interface DailyDigest {
  date: string;
  totalVideosMonitored: number;
  swapsToday: number;
  lockedWinners: number;
  lockedLosers: number;
  bestPerformer: {
    videoId: string;
    character: string;
    winningVariant: string;
    improvementPercent: number;
  } | null;
  worstPerformer: {
    videoId: string;
    character: string;
  } | null;
  swapVelocity: SwapVelocity;
}

interface SwapNotification {
  videoId: string;
  timestamp: string;
  fromVariant: string;
  toVariant: string;
  character?: string;
  reason: string;
}

interface BanditArm {
  name: string;
  successes: number;
  failures: number;
  selectionCount: number;
  winRate: number;
}

interface GapOpportunity {
  topic: string;
  score: number;
  reason: string;
  trendMomentum: number;
  competitionLevel: string;
}

function PerformanceTab() {
  const { data: digestData, isLoading: digestLoading } = useQuery<{ data: DailyDigest }>({
    queryKey: ['/api/orchestrator/daily-digest'],
    refetchInterval: 30000,
  });

  const { data: swapsData, isLoading: swapsLoading } = useQuery<{ data: SwapNotification[] }>({
    queryKey: ['/api/orchestrator/recent-swaps'],
    refetchInterval: 10000,
  });

  const digest = digestData?.data;
  const recentSwaps = swapsData?.data || [];

  if (digestLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const velocityColor = (recommendation: string | undefined) => {
    switch (recommendation) {
      case 'dialed_in':
        return 'text-green-500';
      case 'variant_a_needs_work':
        return 'text-yellow-500';
      case 'too_aggressive':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const velocity = digest?.swapVelocity || {
    avgSwapsPerVideo: 0,
    videosNeverSwapped: 0,
    videosSwappedOnce: 0,
    videosSwappedTwice: 0,
    variantAWinRate: 0,
    variantBWinRate: 0,
    variantCWinRate: 0,
    recommendation: 'insufficient_data',
    explanation: 'Waiting for data...',
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-videos-monitored">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Videos Monitored</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{digest?.totalVideosMonitored || 0}</div>
            <p className="text-xs text-muted-foreground">Active in monitoring window</p>
          </CardContent>
        </Card>

        <Card data-testid="card-swaps-today">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Swaps Today</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{digest?.swapsToday || 0}</div>
            <p className="text-xs text-muted-foreground">Title/thumbnail changes</p>
          </CardContent>
        </Card>

        <Card data-testid="card-locked-winners">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Locked Winners</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{digest?.lockedWinners || 0}</div>
            <p className="text-xs text-muted-foreground">Above p75 threshold</p>
          </CardContent>
        </Card>

        <Card data-testid="card-locked-losers">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Locked Losers</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{digest?.lockedLosers || 0}</div>
            <p className="text-xs text-muted-foreground">All variants exhausted</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-swap-velocity">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Swap Velocity
            </CardTitle>
            <CardDescription>How quickly videos need optimization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{velocity.videosNeverSwapped}</div>
                <div className="text-xs text-muted-foreground">Never Swapped</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{velocity.videosSwappedOnce}</div>
                <div className="text-xs text-muted-foreground">Swapped Once</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{velocity.videosSwappedTwice}</div>
                <div className="text-xs text-muted-foreground">Swapped Twice</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Avg Swaps/Video</span>
                <span className="font-medium">{velocity.avgSwapsPerVideo.toFixed(2)}</span>
              </div>
              <Progress value={Math.min(velocity.avgSwapsPerVideo * 50, 100)} className="h-2" />
            </div>

            {velocity.recommendation && (
              <Alert>
                <Lightbulb className="h-4 w-4" />
                <AlertTitle className={velocityColor(velocity.recommendation)}>
                  {velocity.recommendation.replace(/_/g, ' ').toUpperCase()}
                </AlertTitle>
                <AlertDescription className="text-xs">{velocity.explanation}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-variant-performance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Variant Win Rates
            </CardTitle>
            <CardDescription>Which variant performs best overall</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">A</Badge>
                    Initial Title
                  </span>
                  <span className="font-medium">{(velocity.variantAWinRate * 100).toFixed(0)}%</span>
                </div>
                <Progress value={velocity.variantAWinRate * 100} className="h-2" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">B</Badge>
                    First Alternative
                  </span>
                  <span className="font-medium">{(velocity.variantBWinRate * 100).toFixed(0)}%</span>
                </div>
                <Progress value={velocity.variantBWinRate * 100} className="h-2" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">C</Badge>
                    Second Alternative
                  </span>
                  <span className="font-medium">{(velocity.variantCWinRate * 100).toFixed(0)}%</span>
                </div>
                <Progress value={velocity.variantCWinRate * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-recent-swaps">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Recent Swaps
          </CardTitle>
          <CardDescription>Latest title/thumbnail changes</CardDescription>
        </CardHeader>
        <CardContent>
          {swapsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentSwaps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No swaps recorded yet</p>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {recentSwaps.map((swap, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`row-swap-${i}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{swap.character || 'Unknown'}</span>
                        <Badge variant="outline" className="text-xs">
                          {swap.fromVariant} → {swap.toVariant}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{swap.reason}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(swap.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface VisualStyleArm {
  id: string;
  styleName: string;
  colorMultiplier: number;
  contrast: number;
  fontFamily: string;
  overlayTexture: string | null;
  alpha: number;
  beta: number;
  trials: number;
  successes: number;
  avgCtr: number | null;
  avgRetention: number | null;
  avgViews: number | null;
  consecutiveUses: number;
  lastUsedAt: string | null;
}

function OptimizationTab() {
  const { data: banditsData, isLoading: banditsLoading } = useQuery<{
    data: { characters: BanditArm[]; styles: BanditArm[] };
  }>({
    queryKey: ['/api/analytics/bandits'],
    refetchInterval: 60000,
  });

  const { data: gapsData, isLoading: gapsLoading } = useQuery<{ data: GapOpportunity[] }>({
    queryKey: ['/api/gaps/opportunities'],
    refetchInterval: 120000,
  });

  const { data: visualStylesData, isLoading: visualStylesLoading } = useQuery<{ data: VisualStyleArm[] }>({
    queryKey: ['/api/style-bandit/stats'],
    refetchInterval: 60000,
  });

  const characters = banditsData?.data?.characters || [];
  const styles = banditsData?.data?.styles || [];
  const opportunities = gapsData?.data || [];
  const visualStyles = visualStylesData?.data || [];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-character-bandit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Character Performance
            </CardTitle>
            <CardDescription>Thompson Sampling rankings</CardDescription>
          </CardHeader>
          <CardContent>
            {banditsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : characters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No character data available</p>
            ) : (
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {characters.slice(0, 10).map((char, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded bg-muted/30"
                      data-testid={`row-character-${i}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium w-6">{i + 1}.</span>
                        <span className="text-sm">{char.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={char.winRate > 0.5 ? 'default' : 'secondary'}>
                          {(char.winRate * 100).toFixed(0)}%
                        </Badge>
                        <span className="text-xs text-muted-foreground">{char.selectionCount} videos</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-style-bandit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Style Performance
            </CardTitle>
            <CardDescription>Suno style optimization</CardDescription>
          </CardHeader>
          <CardContent>
            {banditsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : styles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No style data available</p>
            ) : (
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {styles.map((style, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded bg-muted/30"
                      data-testid={`row-style-${i}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium w-6">{i + 1}.</span>
                        <span className="text-sm">{style.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={style.winRate > 0.5 ? 'default' : 'secondary'}>
                          {(style.winRate * 100).toFixed(0)}%
                        </Badge>
                        <span className="text-xs text-muted-foreground">{style.selectionCount} uses</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visual Style Bandit - Anti-Bot Protection */}
      <Card data-testid="card-visual-style-bandit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Visual Style Performance
          </CardTitle>
          <CardDescription>
            Thompson Sampling for video aesthetics (anti-bot protection - max 5 consecutive uses per style)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visualStylesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : visualStyles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No visual styles configured</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {visualStyles.map((style) => {
                const winRate = style.trials > 0 ? style.successes / style.trials : 0;
                const sampledProbability = style.alpha / (style.alpha + style.beta);
                const isHot = style.consecutiveUses >= 3;
                const isBlocked = style.consecutiveUses >= 5;

                return (
                  <Card
                    key={style.id}
                    className={`bg-muted/30 ${isBlocked ? 'border-destructive' : isHot ? 'border-yellow-500' : ''}`}
                    data-testid={`card-visual-style-${style.styleName}`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm capitalize">{style.styleName.replace('_', ' ')}</span>
                        {isBlocked ? (
                          <Badge variant="destructive" className="text-xs">
                            Blocked
                          </Badge>
                        ) : isHot ? (
                          <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">
                            Hot
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Active
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Win Rate</span>
                          <span className="font-medium">{(winRate * 100).toFixed(0)}%</span>
                        </div>
                        <Progress value={winRate * 100} className="h-1.5" />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Trials</span>
                          <span className="font-medium">{style.trials}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Successes</span>
                          <span className="font-medium text-green-500">{style.successes}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Avg CTR</span>
                          <span className="font-medium">{style.avgCtr ? `${style.avgCtr.toFixed(1)}%` : '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Consecutive</span>
                          <span
                            className={`font-medium ${isBlocked ? 'text-destructive' : isHot ? 'text-yellow-500' : ''}`}
                          >
                            {style.consecutiveUses}/5
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Sampling: {(sampledProbability * 100).toFixed(0)}%</span>
                          <span className="text-xs">({style.fontFamily})</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-gap-opportunities">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Content Opportunities
          </CardTitle>
          <CardDescription>Untapped topics with high potential</CardDescription>
        </CardHeader>
        <CardContent>
          {gapsLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No gap opportunities detected</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {opportunities.slice(0, 6).map((opp, i) => (
                <Card key={i} className="bg-muted/30" data-testid={`card-opportunity-${i}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{opp.topic}</span>
                      <Badge variant="outline">{opp.score.toFixed(0)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{opp.reason}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <TrendingUp className="h-3 w-3" />
                      <span>Momentum: {(opp.trendMomentum * 100).toFixed(0)}%</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface StrategicSummaryData {
  id: string;
  executiveSummary: string;
  winnersLosers: {
    winners: { item: string; metric: string; insight: string }[];
    losers: { item: string; metric: string; insight: string }[];
  };
  patternInsights: {
    themes: string;
    lyrics: string;
    audio: string;
    thumbnails: string;
    postingTimes: string;
  };
  recommendations: string[];
  warnings: string[];
  costsBreakdown: {
    total: number;
    byService: { service: string; cost: number }[];
  };
  confidenceLevel: string;
  generatedAt: string;
}

function StrategicSummaryTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summaryData, isLoading } = useQuery<{ data: StrategicSummaryData | null }>({
    queryKey: ['/api/strategic-summary/latest'],
    refetchInterval: 60000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/strategic-summary/generate', {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Summary Generated',
        description: 'Strategic summary has been generated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/strategic-summary/latest'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate summary',
        variant: 'destructive',
      });
    },
  });

  const summary = summaryData?.data;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-4">
      <Card data-testid="card-executive-summary">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Strategic Summary
            </CardTitle>
            <CardDescription>
              AI-generated analysis of system performance
              {summary?.generatedAt && (
                <span className="ml-2 text-xs">Last updated: {formatDate(summary.generatedAt)}</span>
              )}
            </CardDescription>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            size="sm"
            data-testid="button-generate-summary"
          >
            {generateMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Now
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !summary ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Summary Available</AlertTitle>
              <AlertDescription>
                Click &quot;Generate Now&quot; to create your first strategic summary, or wait for the nightly 10pm
                analysis.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm leading-relaxed">{summary.executiveSummary}</p>
              <Badge variant="outline" className="mt-2">
                Confidence: {summary.confidenceLevel || 'medium'}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="card-winners">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-green-500" />
                  Winners
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.winnersLosers?.winners?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clear winners identified</p>
                ) : (
                  <div className="space-y-3">
                    {summary.winnersLosers?.winners?.map((w, i) => (
                      <div key={i} className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{w.item}</span>
                          <Badge variant="secondary">{w.metric}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{w.insight}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-losers">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  Losers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.winnersLosers?.losers?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clear losers identified</p>
                ) : (
                  <div className="space-y-3">
                    {summary.winnersLosers?.losers?.map((l, i) => (
                      <div key={i} className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{l.item}</span>
                          <Badge variant="secondary">{l.metric}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{l.insight}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-recommendations">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!summary.recommendations?.length ? (
                <p className="text-sm text-muted-foreground">No recommendations at this time</p>
              ) : (
                <ul className="space-y-2">
                  {summary.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {summary.warnings && summary.warnings.length > 0 && (
            <Alert variant="destructive" data-testid="alert-warnings">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {summary.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Card data-testid="card-pattern-insights">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Pattern Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {summary.patternInsights?.themes && (
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm flex items-center gap-1">
                      <Target className="h-3 w-3" /> Themes
                    </h4>
                    <p className="text-xs text-muted-foreground">{summary.patternInsights.themes}</p>
                  </div>
                )}
                {summary.patternInsights?.lyrics && (
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm flex items-center gap-1">
                      <Activity className="h-3 w-3" /> Lyrics
                    </h4>
                    <p className="text-xs text-muted-foreground">{summary.patternInsights.lyrics}</p>
                  </div>
                )}
                {summary.patternInsights?.audio && (
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Audio
                    </h4>
                    <p className="text-xs text-muted-foreground">{summary.patternInsights.audio}</p>
                  </div>
                )}
                {summary.patternInsights?.thumbnails && (
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Thumbnails
                    </h4>
                    <p className="text-xs text-muted-foreground">{summary.patternInsights.thumbnails}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function HealthTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [channelUrl, setChannelUrl] = useState('');

  const {
    data: statusData,
    isLoading: statusLoading,
    dataUpdatedAt: statusUpdatedAt,
  } = useQuery<{ data: string }>({
    queryKey: ['/api/orchestrator/status'],
    refetchInterval: 30000,
  });

  const { data: costsData, dataUpdatedAt: costsUpdatedAt } = useQuery<{
    data: {
      totalCost: number;
      breakdown: Record<string, { count: number; cost: number }>;
    };
  }>({
    queryKey: ['/api/costs/summary'],
    refetchInterval: 60000,
  });

  const { data: videoCounts } = useQuery<{ data: { total: number; active: number; expired: number; locked: number } }>({
    queryKey: ['/api/orchestrator/video-counts'],
    refetchInterval: 60000,
  });

  const importMutation = useMutation({
    mutationFn: async (url?: string) => {
      const response = await apiRequest('POST', '/api/orchestrator/import-videos', {
        maxResults: 100,
        channelUrl: url || undefined,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Import Complete',
        description: data.message || `Imported ${data.data?.imported || 0} videos`,
      });
      setChannelUrl('');
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrator/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrator/video-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrator/swap-velocity'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import videos from YouTube',
        variant: 'destructive',
      });
    },
  });

  const lastUpdated = Math.max(statusUpdatedAt || 0, costsUpdatedAt || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <Timer className="h-3 w-3" />
        <span data-testid="text-health-updated">Updated {formatLastUpdated(lastUpdated)}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-orchestrator-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Orchestrator</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-green-600">Running</div>
            <p className="text-xs text-muted-foreground">Hook Monitor active</p>
          </CardContent>
        </Card>

        <Card data-testid="card-api-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">YouTube API</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">Connected</div>
            <p className="text-xs text-muted-foreground">Analytics available</p>
          </CardContent>
        </Card>

        <Card data-testid="card-monthly-cost">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">${costsData?.data?.totalCost?.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">API spend this month</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-cost-breakdown">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Cost Breakdown
          </CardTitle>
          <CardDescription>API costs by service this month</CardDescription>
        </CardHeader>
        <CardContent>
          {costsData?.data?.breakdown ? (
            <div className="space-y-3">
              {Object.entries(costsData.data.breakdown)
                .sort(([, a], [, b]) => b.cost - a.cost)
                .map(([service, data]) => {
                  const percentage = costsData.data.totalCost > 0 ? (data.cost / costsData.data.totalCost) * 100 : 0;
                  return (
                    <div key={service} className="space-y-1" data-testid={`cost-service-${service}`}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{service}</span>
                        <span className="text-muted-foreground">
                          ${data.cost.toFixed(2)} ({data.count} calls)
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              {Object.keys(costsData.data.breakdown).length === 0 && (
                <p className="text-sm text-muted-foreground">No API usage recorded yet</p>
              )}
            </div>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-import-videos">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Import YouTube Videos
          </CardTitle>
          <CardDescription>Import videos from any YouTube channel for historical analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Paste YouTube channel URL (e.g., youtube.com/@handle)"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                className="flex-1"
                data-testid="input-channel-url"
              />
              <Button
                onClick={() => importMutation.mutate(channelUrl || undefined)}
                disabled={importMutation.isPending}
                data-testid="button-import-videos"
              >
                {importMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </div>
            {videoCounts?.data && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Total: {videoCounts.data.total}</span>
                <span>Active: {videoCounts.data.active}</span>
                <span>Expired: {videoCounts.data.expired}</span>
                <span>Locked: {videoCounts.data.locked}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Leave empty to import from your connected channel (recommended). Or paste another channel&apos;s URL to
            import their videos. Videos older than 12h are marked &quot;expired&quot; but still contribute to swap
            velocity stats.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="card-system-status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            System Status
          </CardTitle>
          <CardDescription>Central Orchestrator details</CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
              {statusData?.data || 'Loading...'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalyticsDashboard() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-analytics-title">
          Analytics Dashboard
        </h1>
        <p className="text-muted-foreground">Monitor performance, optimization, and system health in one place</p>
      </div>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList data-testid="tabs-analytics">
          <TabsTrigger value="performance" data-testid="tab-performance">
            <TrendingUp className="h-4 w-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="optimization" data-testid="tab-optimization">
            <Zap className="h-4 w-4 mr-2" />
            Optimization
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">
            <Activity className="h-4 w-4 mr-2" />
            Health
          </TabsTrigger>
          <TabsTrigger value="strategy" data-testid="tab-strategy">
            <Brain className="h-4 w-4 mr-2" />
            Strategy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <PerformanceTab />
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <OptimizationTab />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <HealthTab />
        </TabsContent>

        <TabsContent value="strategy" className="space-y-4">
          <StrategicSummaryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
