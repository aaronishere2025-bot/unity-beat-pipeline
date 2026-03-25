import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Music, Loader2, Play, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BeatVideo {
  id: string;
  title: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  bpm?: number;
  key?: string;
}

export default function BeatGenerationsPage() {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  // Fetch recent beat videos
  const { data: beatVideos, refetch } = useQuery<BeatVideo[]>({
    queryKey: ['/api/beats/list'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Generate 5 beat videos mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/beats/generate-batch', {
        count: 5,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Beat Generation Started',
        description: `Successfully queued ${data.count || 5} beat-driven videos for generation`,
      });
      refetch();
      setGenerating(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
      setGenerating(false);
    },
  });

  // Generate daily beats (5 trap + 1 lofi 30min)
  const generateDailyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/beats/generate-daily', {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Daily Beats Generation Started! 🎵',
        description: `Generating ${data.count || 6} videos: 1 lofi (30min) + 5 trap beats (4min each). Check dashboard for progress.`,
      });
      refetch();
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

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold mb-2 flex items-center gap-2">
            <Music className="w-8 h-8" />
            Beat Generations
          </h1>
          <p className="text-muted-foreground">Generate beat-driven videos with Suno music and synchronized visuals</p>
        </div>

        {/* Main Action Card */}
        <Card>
          <CardHeader>
            <CardTitle>Batch Generation</CardTitle>
            <CardDescription>
              Generate multiple beat-driven videos using Suno music with automatic beat analysis and sync
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Daily Beats Button (Featured) */}
            <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">Daily Beats (Recommended)</h3>
                  <p className="text-sm text-muted-foreground">
                    1 lofi (30min) + 5 trap beats (4min each) • Auto-scheduled for YouTube
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={handleGenerateDailyBeats}
                  disabled={generateDailyMutation.isPending}
                  className="flex items-center gap-2"
                >
                  {generateDailyMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Music className="w-5 h-5" />
                      Generate Daily Beats
                    </>
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>✅ 6 videos total</div>
                <div>💰 $1.20 cost</div>
                <div>⏱️ ~35-40 min</div>
              </div>
            </div>

            <Separator />

            {/* Regular 5 Beats Button */}
            <div className="flex items-center gap-4">
              <Button
                size="lg"
                onClick={handleGenerate5Videos}
                disabled={generating || generateMutation.isPending}
                className="flex items-center gap-2"
                variant="outline"
              >
                {generating || generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Generate 5 Beat Videos
                  </>
                )}
              </Button>
              <div className="text-sm text-muted-foreground">
                Creates 5 videos with Suno music, beat analysis, and synchronized visuals
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium mb-1">Music Generation</div>
                <div className="text-muted-foreground">Suno AI tracks with BPM detection</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium mb-1">Beat Analysis</div>
                <div className="text-muted-foreground">Librosa beat detection & energy curves</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium mb-1">Visual Sync</div>
                <div className="text-muted-foreground">Kling video clips synced to beats</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Beat Videos */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Beat Videos</CardTitle>
            <CardDescription>Track your beat-driven video generation jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {beatVideos && beatVideos.length > 0 ? (
                <div className="space-y-3">
                  {beatVideos.map((video) => (
                    <div
                      key={video.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(video.status)}
                        <div className="flex-1">
                          <div className="font-medium">{video.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {video.bpm && `${video.bpm} BPM`}
                            {video.key && ` • ${video.key}`}
                            {video.createdAt && ` • ${new Date(video.createdAt).toLocaleString()}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(video.status)}
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/jobs/${video.id}`}>View</a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-center">
                  <Music className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">No beat videos yet</p>
                  <p className="text-sm text-muted-foreground">
                    Click "Generate 5 Beat Videos" to create your first batch
                  </p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
