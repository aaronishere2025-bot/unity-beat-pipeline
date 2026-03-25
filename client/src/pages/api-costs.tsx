import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Video, Image, Zap, Clock, AlertCircle, TrendingUp, Calendar, Activity } from 'lucide-react';
import { useState } from 'react';

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
  veo31Fast?: {
    name: string;
    provider: string;
    costPerSecond: number;
    costPerSecondWithAudio: number;
    defaultDuration: number;
    costPerClip: number;
    costPerClipWithAudio: number;
    model: string;
    note: string;
  };
  veo2?: {
    name: string;
    provider: string;
    costPerClip: number;
    clipDuration: number;
    costPerSecond: number;
    model: string;
  };
  ipAdapter: {
    name: string;
    provider: string;
    costPerImage: number;
    model: string;
  };
  lumaRay: {
    name: string;
    provider: string;
    costPerVideo: number;
    duration: string;
  };
  lumaDirect: {
    name: string;
    provider: string;
    costPerVideo: number;
    duration: string;
  };
  consistentCharacterCombo: {
    name: string;
    description: string;
    costPerClipMin: number;
    costPerClipMax: number;
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

function PricingRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-primary' : ''}`}>{value}</span>
    </div>
  );
}

function ServiceIcon({ service }: { service: string }) {
  switch (service) {
    case 'kling':
      return <Video className="w-4 h-4 text-pink-500" />;
    case 'suno':
      return <Activity className="w-4 h-4 text-purple-500" />;
    case 'gemini':
      return <Zap className="w-4 h-4 text-blue-500" />;
    case 'claude':
      return <Zap className="w-4 h-4 text-orange-500" />;
    case 'veo31':
    case 'veo31_i2v':
      return <Video className="w-4 h-4 text-primary" />;
    case 'veo2':
      return <Video className="w-4 h-4 text-blue-500" />;
    case 'openai':
      return <Zap className="w-4 h-4 text-green-500" />;
    case 'ip_adapter':
      return <Image className="w-4 h-4 text-purple-500" />;
    case 'luma_ray':
    case 'luma_direct':
      return <Video className="w-4 h-4 text-orange-500" />;
    case 'youtube':
      return <Video className="w-4 h-4 text-red-500" />;
    default:
      return <Activity className="w-4 h-4 text-muted-foreground" />;
  }
}

function formatServiceName(service: string): string {
  const names: Record<string, string> = {
    kling: 'Kling AI',
    suno: 'Suno Music',
    gemini: 'Gemini 2.0',
    claude: 'Claude Sonnet',
    veo31: 'VEO 3.1 Fast',
    veo31_i2v: 'VEO 3.1 I2V',
    veo2: 'VEO 2',
    openai: 'OpenAI',
    ip_adapter: 'IP-Adapter',
    luma_ray: 'Luma Ray',
    luma_direct: 'Luma Direct',
    youtube: 'YouTube API',
  };
  return names[service] || service;
}

export default function ApiCostsPage() {
  const [period, setPeriod] = useState<'today' | 'month' | 'all'>('month');

  const { data: pricing, isLoading: pricingLoading } = useQuery<ApiPricing>({
    queryKey: ['/api/pricing'],
  });

  const { data: usageData, isLoading: usageLoading } = useQuery<{ success: boolean; data: UsageStats }>({
    queryKey: ['/api/usage', period],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const usage = usageData?.data;

  if (pricingLoading) {
    return (
      <div className="container max-w-6xl py-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!pricing) {
    return (
      <div className="container max-w-6xl py-8">
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <span className="text-muted-foreground">Failed to load pricing information</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          API Costs & Usage
        </h1>
        <p className="text-muted-foreground">Real-time API usage tracking and pricing</p>
      </div>

      {/* Usage Dashboard */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Real-Time Usage
          </h2>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
            <TabsList>
              <TabsTrigger value="today" data-testid="tab-today">
                Today
              </TabsTrigger>
              <TabsTrigger value="month" data-testid="tab-month">
                This Month
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">
                All Time
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Spend Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <DollarSign className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {period === 'today' ? "Today's" : period === 'month' ? 'This Month' : 'All Time'} Spend
                  </p>
                  {usageLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-primary" data-testid="text-total-spend">
                      ${(usage?.totalCost || 0).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Service Breakdown Cards */}
          {usage &&
            Object.entries(usage.byService)
              .slice(0, 3)
              .map(([service, data]) => (
                <Card key={service}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <ServiceIcon service={service} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-muted-foreground truncate">{formatServiceName(service)}</p>
                        <p className="text-xl font-bold" data-testid={`text-spend-${service}`}>
                          ${data.cost.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">{data.count} calls</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

          {/* Empty state if no usage */}
          {(!usage || Object.keys(usage.byService).length === 0) && !usageLoading && (
            <>
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <Video className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">VEO 3.1</p>
                    <p className="text-xl font-bold">$0.00</p>
                    <p className="text-xs text-muted-foreground">0 clips</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <Zap className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">OpenAI</p>
                    <p className="text-xl font-bold">$0.00</p>
                    <p className="text-xs text-muted-foreground">0 calls</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <Image className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Other</p>
                    <p className="text-xl font-bold">$0.00</p>
                    <p className="text-xs text-muted-foreground">0 calls</p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Recent Activity */}
        {usage && usage.recentUsage.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Recent API Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {usage.recentUsage.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <ServiceIcon service={item.service} />
                      <div>
                        <p className="text-sm font-medium">{formatServiceName(item.service)}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.operation}
                          {item.durationSeconds && ` (${item.durationSeconds}s)`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">${parseFloat(item.cost).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      {/* Pricing Reference */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Pricing Reference
        </h2>
        <p className="text-sm text-muted-foreground">Current rates for all AI services (December 2025)</p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pricing.kling && (
            <PricingCard title={pricing.kling.name} description={pricing.kling.provider} icon={Video} badge="Primary">
              <div className="space-y-1">
                <PricingRow label="Per Clip" value={`$${pricing.kling.costPerClip.toFixed(2)}`} highlight />
                <PricingRow label="Duration" value={pricing.kling.clipDuration} />
                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground mt-2">{pricing.kling.note}</p>
              </div>
            </PricingCard>
          )}

          {pricing.suno && (
            <PricingCard title={pricing.suno.name} description={pricing.suno.provider} icon={Activity} badge="Primary">
              <div className="space-y-1">
                <PricingRow label="Per Song" value={`$${pricing.suno.costPerSong.toFixed(2)}`} highlight />
                <PricingRow label="Duration" value={pricing.suno.songDuration} />
                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground">{pricing.suno.note}</p>
              </div>
            </PricingCard>
          )}

          {pricing.gemini && (
            <PricingCard title={pricing.gemini.name} description={pricing.gemini.provider} icon={Zap}>
              <div className="space-y-1">
                <PricingRow label="Typical Cost" value={`~$${pricing.gemini.typicalCost.toFixed(3)}`} highlight />
                <PricingRow
                  label="Per 1M input tokens"
                  value={`$${(pricing.gemini.costPerInputToken * 1000000).toFixed(2)}`}
                />
                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground">{pricing.gemini.note}</p>
              </div>
            </PricingCard>
          )}

          {pricing.claude && (
            <PricingCard title={pricing.claude.name} description={pricing.claude.provider} icon={Zap}>
              <div className="space-y-1">
                <PricingRow label="Typical Cost" value={`~$${pricing.claude.typicalCost.toFixed(2)}`} highlight />
                <PricingRow
                  label="Per 1M input tokens"
                  value={`$${(pricing.claude.costPerInputToken * 1000000).toFixed(0)}`}
                />
                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground">{pricing.claude.note}</p>
              </div>
            </PricingCard>
          )}
        </div>
      </div>

      {/* Cost Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Video Cost Calculator (Kling + Suno)
          </CardTitle>
          <CardDescription className="text-xs">
            Typical costs for videos using Kling AI video generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">45 Second Video</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Kling: 9 clips × $0.10 = $0.90</p>
                <p>Suno: ~$0.10</p>
                <p>Claude/Gemini: ~$0.02</p>
                <Separator className="my-2" />
                <p className="font-medium text-foreground">Total: ~$1.02</p>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">1.5 Minute Video</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Kling: 18 clips × $0.10 = $1.80</p>
                <p>Suno: ~$0.10</p>
                <p>Claude/Gemini: ~$0.02</p>
                <Separator className="my-2" />
                <p className="font-medium text-foreground">Total: ~$1.92</p>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">30 Minute Lofi Mix</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Suno: 8 songs × $0.10 = $0.80</p>
                <p>Kling: 1 loop clip = $0.10</p>
                <p>Total clips: $0.90</p>
                <Separator className="my-2" />
                <p className="font-medium text-foreground">Total: ~$0.90</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-4 py-4">
          <DollarSign className="w-8 h-8 text-primary" />
          <div>
            <p className="text-sm font-medium">Daily Cost Limit</p>
            <p className="text-2xl font-bold text-primary" data-testid="text-daily-limit">
              ${pricing.dailyLimit.toFixed(2)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
