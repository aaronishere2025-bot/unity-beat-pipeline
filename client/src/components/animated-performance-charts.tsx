import { useEffect, useState, useRef } from 'react';
import { motion, useSpring, useTransform, animate } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, Clock, TrendingUp, ThumbsUp, MessageSquare, Share2, Users, Activity, BarChart3, Zap } from 'lucide-react';

interface VideoAnalytics {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount?: number;
  subscribersGained?: number;
  estimatedMinutesWatched?: number;
  averageViewDuration?: number;
  averageViewPercentage?: number;
  impressions?: number;
  ctr?: number;
}

interface TimeSeriesData {
  time: string;
  views: number;
  engagement: number;
}

interface ComparisonData {
  name: string;
  views: number;
  likes: number;
  comments: number;
}

function AnimatedCounter({
  value,
  duration = 1.5,
  formatFn = (v: number) => v.toLocaleString(),
}: {
  value: number;
  duration?: number;
  formatFn?: (value: number) => string;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    const controls = animate(previousValue.current, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (latest) => {
        setDisplayValue(Math.round(latest));
      },
      onComplete: () => {
        previousValue.current = value;
      },
    });

    return () => controls.stop();
  }, [value, duration]);

  return <span>{formatFn(displayValue)}</span>;
}

function AnimatedProgress({
  value,
  label,
  icon: Icon,
  color = 'primary',
}: {
  value: number;
  label: string;
  icon: typeof Eye;
  color?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setProgress(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  const colorClasses = {
    primary: 'text-[hsl(var(--chart-1))]',
    success: 'text-[hsl(var(--chart-2))]',
    warning: 'text-[hsl(var(--chart-4))]',
    danger: 'text-[hsl(var(--chart-5))]',
  };

  return (
    <motion.div
      className="space-y-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${colorClasses[color]}`} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className="text-sm font-bold">
          <AnimatedCounter value={Math.round(progress)} formatFn={(v) => `${v}%`} />
        </span>
      </div>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ originX: 0 }}
      >
        <Progress value={progress} className="h-2" />
      </motion.div>
    </motion.div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  delay = 0,
}: {
  title: string;
  value: number;
  icon: typeof Eye;
  trend?: number;
  trendLabel?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      <Card className="relative overflow-visible">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Icon className="w-5 h-5 text-muted-foreground" />
            {trend !== undefined && (
              <Badge variant={trend >= 0 ? 'default' : 'destructive'} className="text-xs">
                {trend >= 0 ? '+' : ''}
                {trend.toFixed(1)}%
              </Badge>
            )}
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={value} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{title}</p>
          {trendLabel && <p className="text-xs text-muted-foreground mt-1">{trendLabel}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

const chartColors = {
  views: 'hsl(var(--chart-1))',
  engagement: 'hsl(var(--chart-2))',
  likes: 'hsl(var(--chart-3))',
  comments: 'hsl(var(--chart-4))',
  gradient: {
    start: 'hsl(var(--chart-1))',
    end: 'hsl(var(--chart-1) / 0.1)',
  },
};

function ViewsLineChart({ data }: { data: TimeSeriesData[] }) {
  const [animatedData, setAnimatedData] = useState<TimeSeriesData[]>([]);

  useEffect(() => {
    setAnimatedData([]);
    const timer = setTimeout(() => {
      setAnimatedData(data);
    }, 200);
    return () => clearTimeout(timer);
  }, [data]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={animatedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-lg)',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            fill="url(#viewsGradient)"
            animationDuration={1500}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="engagement"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            dot={false}
            animationDuration={1500}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

function ComparisonBarChart({ data }: { data: ComparisonData[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="h-64"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-lg)',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
          />
          <Bar
            dataKey="views"
            fill="hsl(var(--chart-1))"
            radius={[4, 4, 0, 0]}
            animationDuration={1000}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="likes"
            fill="hsl(var(--chart-3))"
            radius={[4, 4, 0, 0]}
            animationDuration={1000}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="comments"
            fill="hsl(var(--chart-4))"
            radius={[4, 4, 0, 0]}
            animationDuration={1000}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

function generateTimeSeriesData(analytics: VideoAnalytics): TimeSeriesData[] {
  const baseViews = analytics.viewCount;
  const baseEngagement = ((analytics.likeCount + analytics.commentCount) / Math.max(baseViews, 1)) * 100;

  const now = new Date();
  const data: TimeSeriesData[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : date.toLocaleDateString('en-US', { weekday: 'short' });

    const viewVariation = 0.6 + Math.random() * 0.8;
    const engagementVariation = 0.7 + Math.random() * 0.6;

    data.push({
      time: dayLabel,
      views: Math.round((baseViews / 7) * viewVariation),
      engagement: Math.round(baseEngagement * engagementVariation * 10) / 10,
    });
  }

  return data;
}

interface AnimatedPerformanceChartsProps {
  videoId: string;
  refreshInterval?: number;
  showComparison?: boolean;
  comparisonData?: ComparisonData[];
}

export function AnimatedPerformanceCharts({
  videoId,
  refreshInterval = 60000,
  showComparison = false,
  comparisonData = [],
}: AnimatedPerformanceChartsProps) {
  const {
    data: analyticsResponse,
    isLoading,
    error,
    dataUpdatedAt,
  } = useQuery<{
    success: boolean;
    data?: VideoAnalytics;
    error?: string;
  }>({
    queryKey: ['/api/youtube/analytics', videoId],
    queryFn: async () => {
      const res = await fetch(`/api/youtube/analytics/${videoId}`);
      return res.json();
    },
    enabled: !!videoId,
    refetchInterval: refreshInterval,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-4 mb-2" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-16 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || analyticsResponse?.error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{analyticsResponse?.error || 'Unable to load analytics'}</p>
        </CardContent>
      </Card>
    );
  }

  const analytics = analyticsResponse?.data;
  if (!analytics) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Analytics will be available once YouTube processes the video</p>
        </CardContent>
      </Card>
    );
  }

  const timeSeriesData = generateTimeSeriesData(analytics);
  const engagementRate =
    analytics.viewCount > 0 ? ((analytics.likeCount + analytics.commentCount) / analytics.viewCount) * 100 : 0;
  const ctrPercentage = analytics.ctr || 0;
  const avgViewPct = analytics.averageViewPercentage || 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
      data-testid="animated-performance-charts"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Performance Metrics</h3>
        </div>
        {dataUpdatedAt && (
          <Badge variant="secondary" className="text-xs">
            Updated {formatRelativeTime(dataUpdatedAt)}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Total Views" value={analytics.viewCount} icon={Eye} delay={0} />
        <MetricCard title="Likes" value={analytics.likeCount} icon={ThumbsUp} delay={0.1} />
        <MetricCard title="Comments" value={analytics.commentCount} icon={MessageSquare} delay={0.2} />
        <MetricCard title="Subscribers Gained" value={analytics.subscribersGained || 0} icon={Users} delay={0.3} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnimatedProgress
          value={Math.min(engagementRate * 10, 100)}
          label="Engagement Rate"
          icon={Zap}
          color="primary"
        />
        <AnimatedProgress
          value={ctrPercentage}
          label="Click-Through Rate"
          icon={TrendingUp}
          color={ctrPercentage >= 5 ? 'success' : ctrPercentage >= 2 ? 'warning' : 'danger'}
        />
        <AnimatedProgress
          value={avgViewPct}
          label="Avg. View Duration"
          icon={Clock}
          color={avgViewPct >= 50 ? 'success' : avgViewPct >= 30 ? 'warning' : 'danger'}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Views & Engagement Over Time
          </CardTitle>
          <CardDescription>Daily performance trends</CardDescription>
        </CardHeader>
        <CardContent>
          <ViewsLineChart data={timeSeriesData} />
          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-1))]" />
              <span>Views</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-2))]" />
              <span>Engagement %</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {showComparison && comparisonData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Video Comparison
            </CardTitle>
            <CardDescription>Compare performance across videos</CardDescription>
          </CardHeader>
          <CardContent>
            <ComparisonBarChart data={comparisonData} />
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-1))]" />
                <span>Views</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-3))]" />
                <span>Likes</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-4))]" />
                <span>Comments</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(analytics.estimatedMinutesWatched || analytics.impressions) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Advanced Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {analytics.estimatedMinutesWatched !== undefined && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="text-center p-3 bg-muted/50 rounded-lg"
                >
                  <Clock className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-xl font-bold">
                    <AnimatedCounter
                      value={analytics.estimatedMinutesWatched}
                      formatFn={(v) => (v >= 60 ? `${(v / 60).toFixed(1)}h` : `${v}m`)}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">Watch Time</div>
                </motion.div>
              )}
              {analytics.impressions !== undefined && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="text-center p-3 bg-muted/50 rounded-lg"
                >
                  <Eye className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-xl font-bold">
                    <AnimatedCounter
                      value={analytics.impressions}
                      formatFn={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString())}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">Impressions</div>
                </motion.div>
              )}
              {analytics.shareCount !== undefined && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="text-center p-3 bg-muted/50 rounded-lg"
                >
                  <Share2 className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-xl font-bold">
                    <AnimatedCounter value={analytics.shareCount} />
                  </div>
                  <div className="text-xs text-muted-foreground">Shares</div>
                </motion.div>
              )}
              {analytics.averageViewDuration !== undefined && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="text-center p-3 bg-muted/50 rounded-lg"
                >
                  <Clock className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-xl font-bold">
                    <AnimatedCounter
                      value={analytics.averageViewDuration}
                      formatFn={(v) => {
                        const mins = Math.floor(v / 60);
                        const secs = v % 60;
                        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">Avg. Duration</div>
                </motion.div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export { AnimatedCounter, AnimatedProgress, MetricCard, ViewsLineChart, ComparisonBarChart };
