import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  DollarSign,
  Video,
  Image,
  Zap,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Activity,
  Settings as SettingsIcon,
  ExternalLink,
  Shield,
  FileText,
  CheckCircle2,
  XCircle,
  Wrench,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  MinusIcon,
} from 'lucide-react';
import { SiYoutube, SiGoogle } from 'react-icons/si';
import { Link } from 'wouter';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ============================================================================
// INTERFACES
// ============================================================================

interface ApiPricing {
  kling?: {
    name: string;
    provider: string;
    costPerClip: number;
    clipDuration: string;
    model: string;
    note: string;
  };
  suno?: {
    name: string;
    provider: string;
    costPerSong: number;
    songDuration: string;
    note: string;
  };
  gemini?: {
    name: string;
    provider: string;
    costPerInputToken: number;
    costPerOutputToken: number;
    typicalCost: number;
    note: string;
  };
  claude?: {
    name: string;
    provider: string;
    costPerInputToken: number;
    costPerOutputToken: number;
    typicalCost: number;
    note: string;
  };
  openai?: {
    name: string;
    provider: string;
    costPerInputToken: number;
    costPerOutputToken: number;
    typicalScriptCost: number;
    note: string;
  };
  dailyLimit: number;
}

interface ApiUsage {
  id: number;
  service: string;
  operation: string;
  cost: string;
  durationSeconds?: string;
  tokens?: number;
  jobId?: string;
  createdAt: string;
}

interface UsageStats {
  totalCost: number;
  byService: Record<string, { count: number; cost: number }>;
  recentUsage: ApiUsage[];
}

// Chart color palette
const CHART_COLORS = {
  kling: 'hsl(var(--chart-1))',
  suno: 'hsl(var(--chart-2))',
  openai: 'hsl(var(--chart-3))',
  claude: 'hsl(var(--chart-4))',
  gemini: 'hsl(var(--chart-5))',
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function TrendIndicator({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MinusIcon className="w-3 h-3" />
        <span>No change</span>
      </div>
    );
  }

  const isPositive = value > 0;
  return (
    <div className={`flex items-center gap-1 text-xs ${isPositive ? 'text-red-600' : 'text-green-600'}`}>
      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      <span>
        {Math.abs(value)}
        {suffix}
      </span>
    </div>
  );
}

function PricingCard({
  title,
  description,
  icon: Icon,
  children,
  badge,
}: {
  title: string;
  description: string;
  icon: any;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
          {badge && (
            <Badge variant="outline" className="shrink-0">
              {badge}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminPanel() {
  const urlParams = new URLSearchParams(window.location.search);
  const [activeTab, setActiveTab] = useState(urlParams.get('tab') || 'costs');

  // API Costs queries
  const { data: pricingData, isLoading: pricingLoading } = useQuery<{ data: ApiPricing }>({
    queryKey: ['/api/pricing'],
  });

  const { data: usageData, isLoading: usageLoading } = useQuery<{ data: UsageStats }>({
    queryKey: ['/api/api-usage/stats'],
  });

  // Settings queries
  const { data: youtubeStatus } = useQuery<{
    data: { configured: boolean; authenticated: boolean; channel?: { name: string } };
  }>({
    queryKey: ['/api/youtube/status'],
  });

  const pricing = pricingData?.data;
  const usage = usageData?.data;
  const isYoutubeConnected = youtubeStatus?.data?.authenticated;
  const channelName = youtubeStatus?.data?.channel?.name;

  const totalCostToday = usage?.totalCost || 0;
  const totalCallsToday = Object.values(usage?.byService || {}).reduce((sum, service) => sum + service.count, 0);

  // Prepare chart data
  const serviceDistributionData = useMemo(() => {
    if (!usage?.byService) return [];
    return Object.entries(usage.byService)
      .map(([name, data]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: data.cost,
        count: data.count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [usage]);

  const hourlyUsageData = useMemo(() => {
    if (!usage?.recentUsage) return [];

    // Group by hour
    const hourlyMap = new Map<string, { cost: number; calls: number }>();

    usage.recentUsage.forEach((call) => {
      const date = new Date(call.createdAt);
      const hour = `${date.getHours().toString().padStart(2, '0')}:00`;

      const existing = hourlyMap.get(hour) || { cost: 0, calls: 0 };
      hourlyMap.set(hour, {
        cost: existing.cost + parseFloat(call.cost),
        calls: existing.calls + 1,
      });
    });

    return Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({
        hour,
        cost: data.cost,
        calls: data.calls,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }, [usage]);

  const topExpensiveServices = useMemo(() => {
    if (!usage?.byService) return [];
    return Object.entries(usage.byService)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 3);
  }, [usage]);

  // Prepare 7-day cost trend data
  const weeklyTrendData = useMemo(() => {
    if (!usage?.recentUsage) return [];

    // Group by date (last 7 days)
    const dailyMap = new Map<string, { cost: number; calls: number }>();
    const today = new Date();

    // Initialize last 7 days with 0
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyMap.set(dateStr, { cost: 0, calls: 0 });
    }

    // Aggregate data by date
    usage.recentUsage.forEach((call) => {
      const date = new Date(call.createdAt);
      const dateStr = date.toISOString().split('T')[0];

      const existing = dailyMap.get(dateStr);
      if (existing) {
        dailyMap.set(dateStr, {
          cost: existing.cost + parseFloat(call.cost),
          calls: existing.calls + 1,
        });
      }
    });

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cost: data.cost,
        calls: data.calls,
        fullDate: date,
      }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [usage]);

  // Prepare heatmap data (hour x day of week)
  const heatmapData = useMemo(() => {
    if (!usage?.recentUsage) return [];

    const matrix: { hour: string; day: string; intensity: number }[] = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Initialize 24 hours x 7 days
    const countMap = new Map<string, number>();

    usage.recentUsage.forEach((call) => {
      const date = new Date(call.createdAt);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const key = `${hour}-${dayOfWeek}`;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });

    // Find max for normalization
    const maxCalls = Math.max(...Array.from(countMap.values()), 1);

    // Create data points
    for (let hour = 0; hour < 24; hour++) {
      for (let day = 0; day < 7; day++) {
        const key = `${hour}-${day}`;
        const calls = countMap.get(key) || 0;
        matrix.push({
          hour: `${hour.toString().padStart(2, '0')}:00`,
          day: days[day],
          intensity: calls / maxCalls, // Normalized 0-1
        });
      }
    }

    return matrix;
  }, [usage]);

  const chartConfig = {
    cost: {
      label: 'Cost',
      color: 'hsl(var(--chart-1))',
    },
    calls: {
      label: 'Calls',
      color: 'hsl(var(--chart-2))',
    },
  } satisfies ChartConfig;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <Wrench className="w-10 h-10 text-primary" />
              Admin Panel
            </h1>
            <p className="text-muted-foreground text-lg mt-1">Manage API costs, usage, and system settings</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Cost Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${totalCostToday.toFixed(2)}</div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Avg: ${totalCallsToday > 0 ? (totalCostToday / totalCallsToday).toFixed(4) : '0.00'}/call
                </p>
                {pricing?.dailyLimit && (
                  <Badge
                    variant={totalCostToday > pricing.dailyLimit * 0.8 ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {((totalCostToday / pricing.dailyLimit) * 100).toFixed(0)}% of limit
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" />
                API Calls Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalCallsToday}</div>
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">
                  {topExpensiveServices[0]?.name
                    ? `Top: ${topExpensiveServices[0].name} (${topExpensiveServices[0].count})`
                    : 'No usage yet'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Most Expensive
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {topExpensiveServices[0] ? (
                  <span className="capitalize">{topExpensiveServices[0].name}</span>
                ) : (
                  <span className="text-muted-foreground text-xl">—</span>
                )}
              </div>
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">
                  {topExpensiveServices[0] ? `$${topExpensiveServices[0].cost.toFixed(2)} today` : 'No data'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                YouTube Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isYoutubeConnected ? (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <XCircle className="w-3 h-3 mr-1" />
                    Not Connected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 truncate">
                {isYoutubeConnected ? channelName : 'Connect your account'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="costs">
              <DollarSign className="w-4 h-4 mr-2" />
              API Costs
            </TabsTrigger>
            <TabsTrigger value="settings">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* ===== API COSTS TAB ===== */}
          <TabsContent value="costs" className="space-y-6">
            {pricingLoading || usageLoading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-3/4" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-[300px] w-full" />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <>
                {/* Video Generation APIs */}
                <div>
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <Video className="w-6 h-6" />
                    Video Generation APIs
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pricing?.kling && (
                      <PricingCard
                        title={pricing.kling.name}
                        description={pricing.kling.provider}
                        icon={Video}
                        badge="Primary"
                      >
                        <div className="space-y-3">
                          <div>
                            <div className="text-2xl font-bold text-primary">
                              ${pricing.kling.costPerClip.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">per {pricing.kling.clipDuration} clip</div>
                          </div>
                          <Separator />
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Model:</span>
                              <span className="font-medium">{pricing.kling.model}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Usage:</span>
                              <span className="font-medium">{usage?.byService['kling']?.count || 0} clips today</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cost today:</span>
                              <span className="font-medium">${(usage?.byService['kling']?.cost || 0).toFixed(2)}</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">{pricing.kling.note}</p>
                        </div>
                      </PricingCard>
                    )}
                  </div>
                </div>

                {/* Music Generation APIs */}
                <div>
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <Zap className="w-6 h-6" />
                    Music Generation APIs
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pricing?.suno && (
                      <PricingCard title={pricing.suno.name} description={pricing.suno.provider} icon={Zap}>
                        <div className="space-y-3">
                          <div>
                            <div className="text-2xl font-bold text-primary">
                              ${pricing.suno.costPerSong.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">per {pricing.suno.songDuration} song</div>
                          </div>
                          <Separator />
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Usage:</span>
                              <span className="font-medium">{usage?.byService['suno']?.count || 0} songs today</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cost today:</span>
                              <span className="font-medium">${(usage?.byService['suno']?.cost || 0).toFixed(2)}</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">{pricing.suno.note}</p>
                        </div>
                      </PricingCard>
                    )}
                  </div>
                </div>

                {/* AI Text Generation APIs */}
                <div>
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <Image className="w-6 h-6" />
                    AI Text Generation APIs
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {pricing?.openai && (
                      <PricingCard title={pricing.openai.name} description={pricing.openai.provider} icon={Image}>
                        <div className="space-y-3">
                          <div>
                            <div className="text-2xl font-bold text-primary">
                              ${pricing.openai.typicalScriptCost.toFixed(4)}
                            </div>
                            <div className="text-xs text-muted-foreground">typical script cost</div>
                          </div>
                          <Separator />
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Input:</span>
                              <span className="font-medium">${pricing.openai.costPerInputToken}/M tokens</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Output:</span>
                              <span className="font-medium">${pricing.openai.costPerOutputToken}/M tokens</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Calls today:</span>
                              <span className="font-medium">{usage?.byService['openai']?.count || 0}</span>
                            </div>
                          </div>
                        </div>
                      </PricingCard>
                    )}

                    {pricing?.claude && (
                      <PricingCard title={pricing.claude.name} description={pricing.claude.provider} icon={Image}>
                        <div className="space-y-3">
                          <div>
                            <div className="text-2xl font-bold text-primary">
                              ${pricing.claude.typicalCost.toFixed(4)}
                            </div>
                            <div className="text-xs text-muted-foreground">typical cost</div>
                          </div>
                          <Separator />
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Input:</span>
                              <span className="font-medium">${pricing.claude.costPerInputToken}/M tokens</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Output:</span>
                              <span className="font-medium">${pricing.claude.costPerOutputToken}/M tokens</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Calls today:</span>
                              <span className="font-medium">{usage?.byService['claude']?.count || 0}</span>
                            </div>
                          </div>
                        </div>
                      </PricingCard>
                    )}

                    {pricing?.gemini && (
                      <PricingCard title={pricing.gemini.name} description={pricing.gemini.provider} icon={Image}>
                        <div className="space-y-3">
                          <div>
                            <div className="text-2xl font-bold text-primary">
                              ${pricing.gemini.typicalCost.toFixed(4)}
                            </div>
                            <div className="text-xs text-muted-foreground">typical cost</div>
                          </div>
                          <Separator />
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Input:</span>
                              <span className="font-medium">${pricing.gemini.costPerInputToken}/M tokens</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Output:</span>
                              <span className="font-medium">${pricing.gemini.costPerOutputToken}/M tokens</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Calls today:</span>
                              <span className="font-medium">{usage?.byService['gemini']?.count || 0}</span>
                            </div>
                          </div>
                        </div>
                      </PricingCard>
                    )}
                  </div>
                </div>

                {/* Empty State */}
                {(!usage || totalCallsToday === 0) && (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="rounded-full bg-muted p-6 mb-4">
                        <Activity className="w-12 h-12 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">No API Usage Yet</h3>
                      <p className="text-muted-foreground text-center max-w-md mb-6">
                        Start generating content to see API usage analytics, cost breakdowns, and service distribution
                        charts.
                      </p>
                      <Link href="/">
                        <Button>Create Your First Video</Button>
                      </Link>
                    </CardContent>
                  </Card>
                )}

                {/* Cost Analytics */}
                {usage && totalCallsToday > 0 && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Service Distribution Pie Chart */}
                      {serviceDistributionData.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <PieChart className="w-5 h-5" />
                              Cost Distribution by Service
                            </CardTitle>
                            <CardDescription>Breakdown of today's spending</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ChartContainer config={chartConfig} className="h-[300px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <RechartsPie>
                                  <Pie
                                    data={serviceDistributionData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                  >
                                    {serviceDistributionData.map((entry, index) => (
                                      <Cell
                                        key={`cell-${index}`}
                                        fill={
                                          CHART_COLORS[entry.name.toLowerCase() as keyof typeof CHART_COLORS] ||
                                          'hsl(var(--chart-1))'
                                        }
                                      />
                                    ))}
                                  </Pie>
                                  <ChartTooltip
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                                            <div className="flex flex-col">
                                              <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                {data.name}
                                              </span>
                                              <span className="font-bold text-muted-foreground">
                                                ${data.value.toFixed(2)}
                                              </span>
                                              <span className="text-xs text-muted-foreground">{data.count} calls</span>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                </RechartsPie>
                              </ResponsiveContainer>
                            </ChartContainer>
                          </CardContent>
                        </Card>
                      )}

                      {/* Service Cost Breakdown Bar Chart */}
                      {serviceDistributionData.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <BarChart3 className="w-5 h-5" />
                              Service Usage Breakdown
                            </CardTitle>
                            <CardDescription>Cost and call count by service</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ChartContainer config={chartConfig} className="h-[300px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={serviceDistributionData}>
                                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                  <XAxis dataKey="name" className="text-xs" />
                                  <YAxis className="text-xs" />
                                  <ChartTooltip content={<ChartTooltipContent />} />
                                  <Bar
                                    dataKey="value"
                                    fill="hsl(var(--chart-1))"
                                    name="Cost ($)"
                                    radius={[4, 4, 0, 0]}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </ChartContainer>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Hourly Usage Trend */}
                    {hourlyUsageData.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Activity className="w-5 h-5" />
                            API Usage Timeline
                          </CardTitle>
                          <CardDescription>Cost and call volume over time</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ChartContainer config={chartConfig} className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={hourlyUsageData}>
                                <defs>
                                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="hour" className="text-xs" />
                                <YAxis className="text-xs" />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Area
                                  type="monotone"
                                  dataKey="cost"
                                  stroke="hsl(var(--chart-1))"
                                  fill="url(#colorCost)"
                                  name="Cost ($)"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </ChartContainer>
                        </CardContent>
                      </Card>
                    )}

                    {/* 7-Day Cost Trend */}
                    {weeklyTrendData.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />
                            7-Day Cost Trend
                          </CardTitle>
                          <CardDescription>Daily spending patterns over the last week</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ChartContainer config={chartConfig} className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={weeklyTrendData}>
                                <defs>
                                  <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="date" className="text-xs" />
                                <YAxis className="text-xs" />
                                <ChartTooltip
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="rounded-lg border bg-background p-3 shadow-sm">
                                          <div className="flex flex-col gap-1">
                                            <span className="text-sm font-semibold">{data.date}</span>
                                            <span className="text-lg font-bold text-primary">
                                              ${data.cost.toFixed(2)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              {data.calls} API calls
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="cost"
                                  stroke="hsl(var(--chart-3))"
                                  strokeWidth={2}
                                  fill="url(#colorTrend)"
                                  name="Daily Cost ($)"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </ChartContainer>
                        </CardContent>
                      </Card>
                    )}

                    {/* Usage Heatmap */}
                    {heatmapData.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            API Usage Heatmap
                          </CardTitle>
                          <CardDescription>
                            Hourly usage patterns by day of week (darker = more activity)
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {/* Days header */}
                            <div className="grid grid-cols-8 gap-1 text-xs font-medium text-center">
                              <div></div>
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                                <div key={day} className="py-2">
                                  {day}
                                </div>
                              ))}
                            </div>

                            {/* Heatmap grid */}
                            <div className="space-y-1">
                              {Array.from({ length: 24 }, (_, hour) => (
                                <div key={hour} className="grid grid-cols-8 gap-1">
                                  {/* Hour label */}
                                  <div className="flex items-center justify-end pr-2 text-xs text-muted-foreground">
                                    {hour.toString().padStart(2, '0')}:00
                                  </div>

                                  {/* Cells for each day */}
                                  {Array.from({ length: 7 }, (_, day) => {
                                    const cell = heatmapData.find(
                                      (d) =>
                                        d.hour === `${hour.toString().padStart(2, '0')}:00` &&
                                        d.day === ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day],
                                    );
                                    const intensity = cell?.intensity || 0;

                                    return (
                                      <div
                                        key={`${hour}-${day}`}
                                        className="aspect-square rounded-sm transition-all hover:ring-2 hover:ring-primary cursor-pointer"
                                        style={{
                                          backgroundColor:
                                            intensity === 0
                                              ? 'hsl(var(--muted))'
                                              : `hsl(var(--chart-4) / ${0.2 + intensity * 0.8})`,
                                        }}
                                        title={`${cell?.day} ${cell?.hour}: ${Math.round(intensity * 100)}% activity`}
                                      />
                                    );
                                  })}
                                </div>
                              ))}
                            </div>

                            {/* Legend */}
                            <div className="flex items-center justify-center gap-2 pt-4">
                              <span className="text-xs text-muted-foreground">Less</span>
                              {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
                                <div
                                  key={intensity}
                                  className="w-4 h-4 rounded-sm"
                                  style={{
                                    backgroundColor:
                                      intensity === 0
                                        ? 'hsl(var(--muted))'
                                        : `hsl(var(--chart-4) / ${0.2 + intensity * 0.8})`,
                                  }}
                                />
                              ))}
                              <span className="text-xs text-muted-foreground">More</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}

                {/* Recent Usage Table */}
                {usage && totalCallsToday > 0 && usage.recentUsage.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Recent API Calls
                      </CardTitle>
                      <CardDescription>Last 10 API calls with detailed information</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {usage.recentUsage.slice(0, 10).map((call) => (
                          <div
                            key={call.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className="capitalize"
                                  style={{
                                    borderColor: CHART_COLORS[call.service.toLowerCase() as keyof typeof CHART_COLORS],
                                  }}
                                >
                                  {call.service}
                                </Badge>
                                <span className="font-medium text-sm truncate">{call.operation}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(call.createdAt).toLocaleString()}
                                {call.jobId && <span className="ml-2">• Job: {call.jobId.slice(0, 8)}</span>}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="font-semibold text-lg">${parseFloat(call.cost).toFixed(4)}</div>
                              {call.durationSeconds && (
                                <div className="text-xs text-muted-foreground">{call.durationSeconds}s</div>
                              )}
                              {call.tokens && (
                                <div className="text-xs text-muted-foreground">
                                  {call.tokens.toLocaleString()} tokens
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ===== SETTINGS TAB ===== */}
          <TabsContent value="settings" className="space-y-6">
            {/* Settings Header */}
            <div>
              <h2 className="text-2xl font-semibold mb-2">System Configuration</h2>
              <p className="text-muted-foreground">Manage integrations, compliance, and platform settings</p>
            </div>

            {/* Integration Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ExternalLink className="w-5 h-5" />
                Integrations
              </h3>

              {/* YouTube Integration */}
              <Card className="overflow-hidden">
                <CardHeader className="bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-md bg-red-100 dark:bg-red-950">
                      <SiYoutube className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        YouTube Integration
                        {isYoutubeConnected ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            <XCircle className="w-3 h-3 mr-1" />
                            Not Connected
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {isYoutubeConnected && channelName
                          ? `Connected to: ${channelName}`
                          : 'Connect your YouTube account to enable video uploads'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Connection Actions */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Connection Status</h4>
                    {!isYoutubeConnected ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Connect your YouTube account to automatically upload generated videos to your channel.
                        </p>
                        <Button
                          variant="default"
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => (window.location.href = '/api/youtube/auth')}
                        >
                          <SiYoutube className="w-4 h-4 mr-2" />
                          Connect YouTube Account
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => (window.location.href = '/api/youtube/auth')}>
                          Reconnect Account
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => window.open('https://myaccount.google.com/permissions', '_blank')}
                        >
                          Manage Permissions
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Data Usage */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Data Usage & Permissions
                    </h4>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <p className="text-sm font-medium">We access the following YouTube data:</p>
                      <ul className="text-sm text-muted-foreground space-y-1.5 ml-4">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                          <span>Upload videos to your channel</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                          <span>Set video metadata (title, description, tags, privacy)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                          <span>Retrieve channel information for display</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                          <span>Fetch video analytics for optimization</span>
                        </li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-3">
                        We never store your YouTube credentials. All access is managed through OAuth 2.0 and can be
                        revoked at any time.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Legal Links */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Terms & Privacy
                    </h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      This application uses YouTube API Services. By connecting, you agree to:
                    </p>
                    <div className="grid gap-2">
                      <a
                        href="https://www.youtube.com/t/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline p-2 rounded-md hover:bg-muted/50"
                      >
                        <SiYoutube className="w-4 h-4 text-red-600" />
                        YouTube Terms of Service
                        <ExternalLink className="w-3 h-3 ml-auto" />
                      </a>
                      <a
                        href="https://policies.google.com/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline p-2 rounded-md hover:bg-muted/50"
                      >
                        <SiGoogle className="w-4 h-4" />
                        Google Privacy Policy
                        <ExternalLink className="w-3 h-3 ml-auto" />
                      </a>
                      <Link
                        href="/privacy-policy"
                        className="flex items-center gap-2 text-sm text-primary hover:underline p-2 rounded-md hover:bg-muted/50"
                      >
                        <FileText className="w-4 h-4" />
                        Our Privacy Policy
                        <ExternalLink className="w-3 h-3 ml-auto" />
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Compliance Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Compliance & Disclosure
              </h3>

              {/* AI Content Disclosure */}
              <Card className="border-green-200 dark:border-green-900">
                <CardHeader className="bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-md bg-green-100 dark:bg-green-950">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        AI Content Disclosure
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      </CardTitle>
                      <CardDescription>YouTube Monetization Compliance (July 2025)</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      All videos uploaded through this platform automatically include AI content disclosure as required
                      by YouTube's monetization guidelines.
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-background px-2 py-1 rounded border">selfDeclaredAiContent: true</code>
                      <span className="text-muted-foreground">• Applied automatically</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                    <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100">Why This Matters</p>
                      <p className="text-blue-700 dark:text-blue-300 mt-1">
                        Proper disclosure ensures your content remains eligible for monetization and complies with
                        YouTube's policies for AI-generated content.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Advanced Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" />
                Advanced Configuration
              </h3>

              {/* Cost Limits */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted">
                      <DollarSign className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle>Cost Management</CardTitle>
                      <CardDescription>API usage limits and budget controls</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Daily Budget Limit</label>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">${pricing?.dailyLimit || 50}</span>
                        <Badge variant="secondary">Default</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        You'll receive notifications when approaching this limit. Custom limits coming soon.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Future Settings Placeholder */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted">
                      <Wrench className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle>Additional Settings</CardTitle>
                      <CardDescription>More configuration options</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Additional settings for notifications, webhooks, API rate limits, and advanced features will be
                    available in future updates.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
