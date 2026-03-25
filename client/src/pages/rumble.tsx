import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Radio, Play, Square, Plus, Tv, Clock, Eye, RefreshCw, Upload } from 'lucide-react';

interface RumbleChannel {
  id: number;
  channelName: string;
  streamKey: string;
  niche: string;
  isActive: number;
  totalStreams: number;
  totalWatchMinutes: number | null;
  lastStreamAt: string | null;
}

interface ActiveStream {
  channelId: number;
  pid: number;
}

interface CompletedJob {
  id: string;
  scriptName: string;
  videoUrl?: string;
  status: string;
}

export default function RumblePage() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [streamDialogOpen, setStreamDialogOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({ channelName: '', streamKey: '', niche: 'history' });
  const [selectedVideoPath, setSelectedVideoPath] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [streamDuration, setStreamDuration] = useState('120');

  const { data: channels, isLoading: channelsLoading } = useQuery<RumbleChannel[]>({
    queryKey: ['/api/rumble/channels'],
  });

  const { data: activeStreams, refetch: refetchStreams } = useQuery<ActiveStream[]>({
    queryKey: ['/api/rumble/streams/active'],
    refetchInterval: 10000,
  });

  const { data: completedJobs } = useQuery<CompletedJob[]>({
    queryKey: ['/api/jobs'],
    select: (data: any) => data?.filter((j: any) => j.status === 'completed' && j.videoUrl) || [],
  });

  const addChannelMutation = useMutation({
    mutationFn: async (channel: typeof newChannel) => {
      return apiRequest('POST', '/api/rumble/channels', channel);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rumble/channels'] });
      setAddDialogOpen(false);
      setNewChannel({ channelName: '', streamKey: '', niche: 'history' });
      toast({ title: 'Channel Added', description: 'Rumble channel configured successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const startStreamMutation = useMutation({
    mutationFn: async (config: { videoPath: string; channelId: number; loopDurationMinutes: number }) => {
      return apiRequest('POST', '/api/rumble/stream', config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rumble/streams/active'] });
      setStreamDialogOpen(false);
      toast({ title: 'Stream Started', description: 'Video is now streaming to Rumble' });
    },
    onError: (error: any) => {
      toast({ title: 'Stream Error', description: error.message, variant: 'destructive' });
    },
  });

  const stopStreamMutation = useMutation({
    mutationFn: async (channelId: number) => {
      return apiRequest('POST', '/api/rumble/stream/stop', { channelId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rumble/streams/active'] });
      toast({ title: 'Stream Stopped', description: 'Rumble stream has been stopped' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const isChannelStreaming = (channelId: number) => {
    return activeStreams?.some((s) => s.channelId === channelId);
  };

  const handleStartStream = () => {
    if (!selectedVideoPath || !selectedChannelId) {
      toast({ title: 'Missing Info', description: 'Select a video and channel', variant: 'destructive' });
      return;
    }
    startStreamMutation.mutate({
      videoPath: selectedVideoPath,
      channelId: selectedChannelId,
      loopDurationMinutes: parseInt(streamDuration) || 120,
    });
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2" data-testid="text-page-title">
              Rumble Streaming
            </h1>
            <p className="text-muted-foreground">Stream videos to Rumble via RTMP for instant monetization</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchStreams()} data-testid="button-refresh-streams">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-channel">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Channel
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Rumble Channel</DialogTitle>
                  <DialogDescription>Enter your Rumble stream credentials from rumble.com/live</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="channelName">Channel Name</Label>
                    <Input
                      id="channelName"
                      placeholder="My History Channel"
                      value={newChannel.channelName}
                      onChange={(e) => setNewChannel({ ...newChannel, channelName: e.target.value })}
                      data-testid="input-channel-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="streamKey">Stream Key</Label>
                    <Input
                      id="streamKey"
                      type="password"
                      placeholder="From Rumble live settings"
                      value={newChannel.streamKey}
                      onChange={(e) => setNewChannel({ ...newChannel, streamKey: e.target.value })}
                      data-testid="input-stream-key"
                    />
                    <p className="text-xs text-muted-foreground">
                      Get this from rumble.com/live → Create New Live Stream → Streamer Configuration
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="niche">Content Niche</Label>
                    <Select value={newChannel.niche} onValueChange={(v) => setNewChannel({ ...newChannel, niche: v })}>
                      <SelectTrigger data-testid="select-niche">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="history" data-testid="select-niche-history">
                          History
                        </SelectItem>
                        <SelectItem value="battles" data-testid="select-niche-battles">
                          Battles & Wars
                        </SelectItem>
                        <SelectItem value="leaders" data-testid="select-niche-leaders">
                          Great Leaders
                        </SelectItem>
                        <SelectItem value="science" data-testid="select-niche-science">
                          Science & Inventors
                        </SelectItem>
                        <SelectItem value="misc" data-testid="select-niche-misc">
                          Miscellaneous
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => addChannelMutation.mutate(newChannel)}
                    disabled={addChannelMutation.isPending || !newChannel.channelName || !newChannel.streamKey}
                    data-testid="button-save-channel"
                  >
                    {addChannelMutation.isPending ? 'Adding...' : 'Add Channel'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Info Banner */}
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Radio className="w-5 h-5 text-red-500 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">RTMP Streaming Advantage</p>
                <p className="text-xs text-muted-foreground">
                  Unlike YouTube's upload quota limits, RTMP streaming has no daily limits. Stream 24/7 if you want.
                  Rumble also prioritizes live content, increasing your chances of being "Rumbled" (going viral).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Streams */}
        {activeStreams && activeStreams.length > 0 && (
          <Card className="border-red-500/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <CardTitle className="text-lg">Live Streams</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeStreams.map((stream) => {
                  const channel = channels?.find((c) => c.id === stream.channelId);
                  return (
                    <div
                      key={stream.channelId}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      data-testid={`card-active-stream-${stream.channelId}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                          <Tv className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-stream-channel-${stream.channelId}`}>
                            {channel?.channelName || `Channel ${stream.channelId}`}
                          </p>
                          <p
                            className="text-xs text-muted-foreground"
                            data-testid={`text-stream-pid-${stream.channelId}`}
                          >
                            PID: {stream.pid}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => stopStreamMutation.mutate(stream.channelId)}
                        disabled={stopStreamMutation.isPending}
                        data-testid={`button-stop-stream-${stream.channelId}`}
                      >
                        <Square className="w-4 h-4 mr-2" />
                        Stop
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Channels List */}
        <Card>
          <CardHeader>
            <CardTitle>Configured Channels</CardTitle>
            <CardDescription>Your Rumble channels for RTMP streaming</CardDescription>
          </CardHeader>
          <CardContent>
            {channelsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading channels...</div>
            ) : channels && channels.length > 0 ? (
              <div className="space-y-3">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`card-channel-${channel.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-muted rounded-md flex items-center justify-center">
                        <Tv className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium" data-testid={`text-channel-name-${channel.id}`}>
                            {channel.channelName}
                          </p>
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-niche-${channel.id}`}>
                            {channel.niche}
                          </Badge>
                          {isChannelStreaming(channel.id) && (
                            <Badge className="bg-red-500 text-xs" data-testid={`badge-live-${channel.id}`}>
                              LIVE
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1" data-testid={`text-total-streams-${channel.id}`}>
                            <Upload className="w-3 h-3" />
                            {channel.totalStreams} streams
                          </span>
                          {channel.totalWatchMinutes && (
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {channel.totalWatchMinutes} min watched
                            </span>
                          )}
                          {channel.lastStreamAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last: {new Date(channel.lastStreamAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isChannelStreaming(channel.id) ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => stopStreamMutation.mutate(channel.id)}
                          disabled={stopStreamMutation.isPending}
                          data-testid={`button-stop-${channel.id}`}
                        >
                          <Square className="w-4 h-4 mr-2" />
                          Stop Stream
                        </Button>
                      ) : (
                        <Dialog
                          open={streamDialogOpen && selectedChannelId === channel.id}
                          onOpenChange={(open) => {
                            setStreamDialogOpen(open);
                            if (open) setSelectedChannelId(channel.id);
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" data-testid={`button-stream-${channel.id}`}>
                              <Play className="w-4 h-4 mr-2" />
                              Start Stream
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Start Stream to {channel.channelName}</DialogTitle>
                              <DialogDescription>Select a completed video to stream to Rumble</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <div className="space-y-2">
                                <Label>Select Video</Label>
                                <Select value={selectedVideoPath} onValueChange={setSelectedVideoPath}>
                                  <SelectTrigger data-testid="select-video">
                                    <SelectValue placeholder="Choose a completed video" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {completedJobs?.map((job) => (
                                      <SelectItem
                                        key={job.id}
                                        value={job.videoUrl?.replace('/api/videos/', 'data/videos/') || ''}
                                        data-testid={`select-video-option-${job.id}`}
                                      >
                                        {job.scriptName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {(!completedJobs || completedJobs.length === 0) && (
                                  <p className="text-xs text-muted-foreground">
                                    No completed videos available. Generate some videos first!
                                  </p>
                                )}
                              </div>
                              <div className="space-y-2">
                                <Label>Stream Duration</Label>
                                <Select value={streamDuration} onValueChange={setStreamDuration}>
                                  <SelectTrigger data-testid="select-duration">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="30" data-testid="select-duration-30">
                                      30 minutes
                                    </SelectItem>
                                    <SelectItem value="60" data-testid="select-duration-60">
                                      1 hour
                                    </SelectItem>
                                    <SelectItem value="120" data-testid="select-duration-120">
                                      2 hours
                                    </SelectItem>
                                    <SelectItem value="240" data-testid="select-duration-240">
                                      4 hours
                                    </SelectItem>
                                    <SelectItem value="480" data-testid="select-duration-480">
                                      8 hours
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Video will loop for the selected duration
                                </p>
                              </div>
                              <Button
                                className="w-full"
                                onClick={handleStartStream}
                                disabled={startStreamMutation.isPending || !selectedVideoPath}
                                data-testid="button-confirm-stream"
                              >
                                {startStreamMutation.isPending ? (
                                  'Starting...'
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-2" />
                                    Start Streaming
                                  </>
                                )}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Tv className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No Rumble channels configured</p>
                <Button variant="outline" onClick={() => setAddDialogOpen(true)} data-testid="button-add-first-channel">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Channel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="font-medium">1. Get Your Stream Credentials</p>
              <p className="text-sm text-muted-foreground">
                Go to rumble.com/live → Click "Create New Live Stream" → Fill in a placeholder title → Under "Streamer
                Configuration", copy the Server URL and Stream Key
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-medium">2. Add Channel Here</p>
              <p className="text-sm text-muted-foreground">
                Click "Add Channel" and paste your stream key. The server URL is automatically configured.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-medium">3. Stream Your Videos</p>
              <p className="text-sm text-muted-foreground">
                Select a completed video and start streaming. The video will loop for your selected duration. Rumble
                will save the stream as a VOD (Video on Demand) automatically.
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Instant Monetization Advantage</p>
              <p className="text-xs text-muted-foreground mt-1">
                Unlike YouTube requiring 1,000 subscribers for monetization, Rumble allows instant monetization through
                their licensing program. Historical content performs particularly well on Rumble's freedom-focused
                audience.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
