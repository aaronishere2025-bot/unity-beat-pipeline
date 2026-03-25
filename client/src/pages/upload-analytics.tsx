import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Calendar,
  Clock,
  Youtube,
  TrendingUp,
  Eye,
  PlayCircle,
  Lightbulb,
  Loader2,
  BarChart3,
  ChevronDown,
  ChevronUp,
  MousePointer,
  Timer,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ArrowUpRight,
  ArrowDownRight,
  ThumbsUp,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Music,
  Zap,
} from 'lucide-react';
import AnalyticsDashboard from './analytics-dashboard';

// ============================================================================
// INTERFACES
// ============================================================================

interface ScheduledUpload {
  id: string;
  scriptName: string;
  description?: string;
  scheduledTime: string;
  channelConnectionId: string;
  channelName?: string;
  duration?: number;
  videoUrl?: string;
  status: string;
}

interface YoutubeVideo {
  id: string;
  videoId: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  watchTime: number;
  ctr: number;
  avgViewDuration: number;
  publishedAt: string;
  channelId: string;
}

interface Channel {
  id: string;
  title: string;
  channelId: string;
}

interface AIsuggestion {
  videoId: string;
  suggestions: string;
  loading: boolean;
}

// ============================================================================
// CALENDAR COMPONENT
// ============================================================================

interface CalendarDay {
  date: Date;
  uploads: ScheduledUpload[];
}

function DragDropCalendar({
  uploads,
  channelId,
  onDrop,
}: {
  uploads: ScheduledUpload[];
  channelId: string;
  onDrop: (jobId: string, date: Date, channelId: string) => void;
}) {
  const [draggedJob, setDraggedJob] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  // Generate calendar for 7 days based on offset
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + weekOffset * 7 + i);
    date.setHours(0, 0, 0, 0);

    const dayUploads = uploads.filter((u) => {
      if (!u.scheduledTime) return false; // Skip if no schedule time
      const uploadDate = new Date(u.scheduledTime);
      uploadDate.setHours(0, 0, 0, 0);
      return uploadDate.getTime() === date.getTime();
    });

    return { date, uploads: dayUploads };
  });

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    setDraggedJob(jobId);
    e.dataTransfer.effectAllowed = 'move';
    // Add visual feedback
    e.currentTarget.classList.add('opacity-50');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50');
    setDraggedJob(null);
    setHoveredDate(null);
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredDate(dateStr);
  };

  const handleDragLeave = () => {
    setHoveredDate(null);
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (draggedJob) {
      onDrop(draggedJob, date, channelId);
      setDraggedJob(null);
      setHoveredDate(null);
    }
  };

  const currentWeekStart = new Date();
  currentWeekStart.setDate(currentWeekStart.getDate() + weekOffset * 7);
  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);

  return (
    <div className="space-y-3">
      {/* Calendar Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
            disabled={weekOffset === 0}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-medium px-3">
            {currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' - '}
            {currentWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(weekOffset + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {weekOffset > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
            Today
          </Button>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const dateStr = day.date.toLocaleDateString();
          const isToday = day.date.toDateString() === new Date().toDateString();
          const isPast = day.date < new Date(new Date().setHours(0, 0, 0, 0));
          const isHovered = hoveredDate === dateStr;
          const uploadCount = day.uploads.length;

          return (
            <div
              key={dateStr}
              className={`
                group relative p-3 rounded-xl border-2 min-h-[160px] transition-all duration-200 cursor-pointer
                ${isToday ? 'border-primary bg-primary/5 shadow-lg' : 'border-border'}
                ${isPast ? 'opacity-60' : ''}
                ${isHovered && !isPast ? 'border-primary bg-primary/10 scale-105 shadow-xl ring-2 ring-primary/20' : ''}
                ${!isPast ? 'hover:shadow-md hover:border-primary/50' : ''}
              `}
              onClick={(e) => {
                // Only open modal if not dragging
                if (!draggedJob) {
                  setSelectedDay(day);
                }
              }}
              onDragOver={(e) => !isPast && handleDragOver(e, dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => !isPast && handleDrop(e, day.date)}
            >
              {/* Date Header */}
              <div className="mb-3">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="flex items-center justify-between">
                  <div className={`text-2xl font-bold ${isToday ? 'text-primary' : ''}`}>{day.date.getDate()}</div>
                  {uploadCount > 0 ? (
                    <Badge
                      variant={isToday ? 'default' : 'secondary'}
                      className="text-xs group-hover:bg-primary group-hover:text-white transition-colors"
                    >
                      {uploadCount}
                    </Badge>
                  ) : (
                    <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      Click
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Items */}
              <ScrollArea className="h-[80px]">
                <div className="space-y-1.5">
                  {day.uploads.map((upload) => {
                    const time = new Date(upload.scheduledTime);
                    const isDragging = draggedJob === upload.id;

                    return (
                      <div
                        key={upload.id}
                        draggable={!isPast}
                        onDragStart={(e) => !isPast && handleDragStart(e, upload.id)}
                        onDragEnd={handleDragEnd}
                        className={`
                          group relative text-xs p-2 rounded-lg cursor-move
                          transition-all duration-200
                          ${isDragging ? 'opacity-50' : ''}
                          ${
                            upload.status === 'completed'
                              ? 'bg-green-500/20 border border-green-500/30 hover:bg-green-500/30'
                              : 'bg-primary/20 border border-primary/30 hover:bg-primary/30'
                          }
                        `}
                        title={`${upload.scriptName}\n\n${upload.description}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <GripVertical className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                          <Clock className="w-3 h-3" />
                          <span className="font-medium">
                            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="truncate pl-4 text-[11px] opacity-90 font-medium">
                          {upload.scriptName.substring(0, 20)}
                          {upload.scriptName.length > 20 ? '...' : ''}
                        </div>
                        {upload.description && (
                          <div className="truncate pl-4 text-[10px] opacity-70 mt-0.5">
                            {upload.description.substring(0, 30)}
                            {upload.description.length > 30 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Drop Zone Indicator */}
              {isHovered && !isPast && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-xl border-2 border-dashed border-primary pointer-events-none">
                  <div className="text-xs font-semibold text-primary flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Drop to schedule
                  </div>
                </div>
              )}

              {/* Today Indicator */}
              {isToday && (
                <div className="absolute top-2 right-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Helper Text */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <GripVertical className="w-3 h-3" />
          Drag to reschedule
        </span>
        <span className="flex items-center gap-1.5">
          <MousePointer className="w-3 h-3" />
          Click any day to view details
        </span>
      </div>

      {/* Day Detail Modal */}
      <Dialog open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {selectedDay && (
                <>
                  {selectedDay.date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedDay && selectedDay.uploads.length > 0 ? (
                <>
                  {selectedDay.uploads.length} video{selectedDay.uploads.length !== 1 ? 's' : ''} scheduled for this day
                </>
              ) : (
                <>No videos scheduled for this day</>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedDay && selectedDay.uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No videos scheduled for this day yet.</p>
              <p className="text-xs text-muted-foreground mt-2">
                Drag and drop videos from the "Ready to Schedule" section to add them.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-3">
                {selectedDay?.uploads
                  .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
                  .map((upload) => {
                    const time = new Date(upload.scheduledTime);

                    return (
                      <Card key={upload.id} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* Time Badge */}
                            <div className="flex-shrink-0">
                              <Badge className="text-sm font-mono">
                                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Badge>
                            </div>

                            {/* Video Details */}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm mb-1">{upload.scriptName}</h4>
                              {upload.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{upload.description}</p>
                              )}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Youtube className="w-3 h-3" />
                                  {upload.channelName}
                                </span>
                                {upload.duration && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {Math.floor(upload.duration / 60)}:
                                    {(upload.duration % 60).toString().padStart(2, '0')}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Status */}
                            <div className="flex-shrink-0">
                              {upload.status === 'completed' ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-green-500/10 text-green-700 border-green-500/20"
                                >
                                  Ready
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
                                >
                                  Processing
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// CHANNEL SECTION COMPONENT
// ============================================================================

function ChannelSection({
  channel,
  uploads,
  videos,
  onScheduleChange,
}: {
  channel: Channel;
  uploads: ScheduledUpload[];
  videos: YoutubeVideo[];
  onScheduleChange: (jobId: string, date: Date, channelId: string) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [aiSuggestions, setAISuggestions] = useState<Record<string, AIsuggestion>>({});

  const channelUploads = uploads.filter((u) => u.channelConnectionId === channel.id);
  const channelVideos = videos.filter((v) => v.channelId === channel.channelId);

  const totalViews = channelVideos.reduce((sum, v) => sum + v.views, 0);
  const avgCTR = channelVideos.length > 0 ? channelVideos.reduce((sum, v) => sum + v.ctr, 0) / channelVideos.length : 0;

  const loadAISuggestions = useMutation({
    mutationFn: async (videoId: string) => {
      const response = await apiRequest('GET', `/api/youtube/video-suggestions/${videoId}`);
      return response.json();
    },
    onSuccess: (data, videoId) => {
      setAISuggestions((prev) => ({
        ...prev,
        [videoId]: { videoId, suggestions: data.suggestions, loading: false },
      }));
      toast({
        title: 'AI Suggestions Loaded',
        description: 'Generated improvement suggestions for this video',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Load Suggestions',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleGetSuggestions = (videoId: string) => {
    setAISuggestions((prev) => ({
      ...prev,
      [videoId]: { videoId, suggestions: '', loading: true },
    }));
    loadAISuggestions.mutate(videoId);
  };

  return (
    <Card className="mb-6 overflow-hidden border-2 hover:border-primary/50 transition-all duration-200">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between cursor-pointer group" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-4">
            <div
              className={`
              w-12 h-12 rounded-xl flex items-center justify-center transition-all
              ${expanded ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500'}
            `}
            >
              <Youtube className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl flex items-center gap-2 group-hover:text-primary transition-colors">
                {channel.title}
              </CardTitle>
              <CardDescription className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {channelUploads.length} scheduled
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="flex items-center gap-1.5">
                  <PlayCircle className="w-3.5 h-3.5" />
                  {channelVideos.length} videos
                </span>
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Channel Stats */}
            <div className="hidden md:flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-0.5">Total Views</div>
                <div className="text-lg font-bold">{totalViews.toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-0.5">Avg CTR</div>
                <div className="text-lg font-bold">{avgCTR.toFixed(2)}%</div>
              </div>
            </div>

            {/* Expand/Collapse Button */}
            <Button variant="ghost" size="sm" className="shrink-0">
              {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Stats */}
        <div className="md:hidden flex items-center gap-4 mt-3 pt-3 border-t">
          <div className="flex-1 text-center">
            <div className="text-xs text-muted-foreground mb-0.5">Total Views</div>
            <div className="text-base font-bold">{totalViews.toLocaleString()}</div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="flex-1 text-center">
            <div className="text-xs text-muted-foreground mb-0.5">Avg CTR</div>
            <div className="text-base font-bold">{avgCTR.toFixed(2)}%</div>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-8 pt-0">
          {/* Section Header with Badge */}
          <Separator />

          {/* Drag-Drop Calendar */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Upload Schedule
                <Badge variant="secondary" className="text-xs">
                  Drag & Drop
                </Badge>
              </h3>
              {channelUploads.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {channelUploads.length} video{channelUploads.length !== 1 ? 's' : ''} queued
                </Badge>
              )}
            </div>

            {channelUploads.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Calendar className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">No uploads scheduled for this channel</p>
                </CardContent>
              </Card>
            ) : (
              <DragDropCalendar uploads={channelUploads} channelId={channel.id} onDrop={onScheduleChange} />
            )}
          </div>

          <Separator />

          {/* Video Performance Table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Video Performance
              </h3>
              <Badge variant="outline" className="text-xs">
                Top {Math.min(channelVideos.length, 10)} videos
              </Badge>
            </div>

            {channelVideos.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Youtube className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">No Videos Yet</h4>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Videos published to this channel will appear here with detailed performance analytics
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-3 pr-4">
                  {channelVideos
                    .sort((a, b) => b.views - a.views)
                    .slice(0, 10)
                    .map((video, index) => {
                      const suggestion = aiSuggestions[video.videoId];
                      const avgCTR = channelVideos.reduce((sum, v) => sum + v.ctr, 0) / channelVideos.length;
                      const ctrStatus = video.ctr > avgCTR * 1.2 ? 'high' : video.ctr < avgCTR * 0.8 ? 'low' : 'medium';
                      const engagementRate = ((video.likes + video.comments) / video.views) * 100;

                      return (
                        <Card key={video.videoId} className="group hover:shadow-lg transition-all duration-200">
                          <CardContent className="p-5">
                            {/* Video Header */}
                            <div className="flex items-start gap-3 mb-4">
                              <div
                                className={`
                                w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                                ${index < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                              `}
                              >
                                #{index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm mb-1 truncate group-hover:text-primary transition-colors">
                                  {video.title}
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Published{' '}
                                  {new Date(video.publishedAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleGetSuggestions(video.videoId)}
                                disabled={suggestion?.loading}
                                className="shrink-0"
                              >
                                {suggestion?.loading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Sparkles className={`w-4 h-4 ${suggestion?.suggestions ? 'text-primary' : ''}`} />
                                )}
                              </Button>
                            </div>

                            {/* Performance Metrics Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Eye className="w-3.5 h-3.5" />
                                  Views
                                </div>
                                <div className="text-lg font-bold">{video.views.toLocaleString()}</div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <MousePointer className="w-3.5 h-3.5" />
                                  CTR
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-lg font-bold">{video.ctr.toFixed(2)}%</div>
                                  {ctrStatus === 'high' && <ArrowUpRight className="w-4 h-4 text-green-500" />}
                                  {ctrStatus === 'low' && <ArrowDownRight className="w-4 h-4 text-red-500" />}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Timer className="w-3.5 h-3.5" />
                                  Avg Duration
                                </div>
                                <div className="text-lg font-bold">
                                  {Math.floor(video.avgViewDuration / 60)}:
                                  {(video.avgViewDuration % 60).toString().padStart(2, '0')}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <TrendingUp className="w-3.5 h-3.5" />
                                  Engagement
                                </div>
                                <div className="text-lg font-bold">{engagementRate.toFixed(2)}%</div>
                              </div>
                            </div>

                            {/* Engagement Breakdown */}
                            <div className="flex items-center gap-4 mb-3 text-sm">
                              <div className="flex items-center gap-1.5">
                                <ThumbsUp className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">{video.likes.toLocaleString()}</span>
                                <span className="text-muted-foreground text-xs">likes</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">{video.comments.toLocaleString()}</span>
                                <span className="text-muted-foreground text-xs">comments</span>
                              </div>
                            </div>

                            {/* Performance Bars */}
                            <div className="space-y-2 mb-3">
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">CTR Performance</span>
                                  <span className="font-medium">
                                    {ctrStatus === 'high' ? 'Above' : ctrStatus === 'low' ? 'Below' : 'At'} average
                                  </span>
                                </div>
                                <Progress
                                  value={(video.ctr / (avgCTR * 2)) * 100}
                                  className={`h-2 ${
                                    ctrStatus === 'high'
                                      ? 'bg-green-500/20'
                                      : ctrStatus === 'low'
                                        ? 'bg-red-500/20'
                                        : 'bg-yellow-500/20'
                                  }`}
                                />
                              </div>
                            </div>

                            {/* AI Suggestions */}
                            {suggestion && !suggestion.loading && suggestion.suggestions && (
                              <>
                                <Separator className="my-4" />
                                <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg">
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                      <Sparkles className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                      <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                                        AI Improvement Suggestions
                                        <Badge variant="secondary" className="text-xs">
                                          New
                                        </Badge>
                                      </div>
                                      <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                        {suggestion.suggestions}
                                      </div>
                                      <div className="mt-3 flex gap-2">
                                        <Button size="sm" variant="default" className="text-xs">
                                          <CheckCircle2 className="w-3 h-3 mr-1.5" />
                                          Apply Suggestions
                                        </Button>
                                        <Button size="sm" variant="outline" className="text-xs">
                                          View Details
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function UploadAnalytics() {
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const [activeTab, setActiveTab] = useState(urlParams.get('tab') || 'schedule');

  // Fetch all scheduled uploads
  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ data: any[] }>({
    queryKey: ['/api/jobs'],
    refetchInterval: 30000,
  });

  // Fetch connected channels
  const { data: channelsResponse, isLoading: channelsLoading } = useQuery<{ data: Channel[] }>({
    queryKey: ['/api/youtube/connected-channels'],
  });

  const channels = channelsResponse?.data || [];

  // Fetch analytics for all videos
  const { data: videosResponse, isLoading: videosLoading } = useQuery<{ data: YoutubeVideo[] }>({
    queryKey: ['/api/youtube/analytics/all'],
    refetchInterval: 60000,
  });

  const videosData = videosResponse?.data || [];

  // Mutation to update schedule
  const updateScheduleMutation = useMutation({
    mutationFn: async ({ jobId, date, channelId }: { jobId: string; date: Date; channelId: string }) => {
      const response = await apiRequest('PATCH', `/api/jobs/${jobId}/schedule`, {
        scheduledTime: date.toISOString(),
        channelConnectionId: channelId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Schedule Updated',
        description: 'Video schedule has been updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Update Schedule',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Parse scheduled uploads - show completed jobs ready to upload OR jobs with scheduled time
  const scheduledUploads: ScheduledUpload[] = (jobsData?.data || [])
    .filter((job: any) => {
      // Include ALL completed jobs not yet uploaded to YouTube with video files
      const hasVideo = job.videoUrl || job.video_url;
      const notUploaded = !job.youtubeVideoId;

      return job.status === 'completed' && hasVideo && notUploaded;
    })
    .map((job: any) => {
      const metadata = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;

      const channel = channels?.find((c) => c.id === metadata?.channelConnectionId);

      // Extract description from metadata or script content
      let description = metadata?.description || job.script_content || '';
      if (description && description.length > 150) {
        description = description.substring(0, 150) + '...';
      }

      const upload = {
        id: job.id,
        scriptName: job.script_name || job.scriptName || 'Untitled Video',
        description: description || 'No description available',
        scheduledTime: job.scheduled_time || job.scheduledTime, // Handle both snake_case and camelCase
        channelConnectionId: metadata?.channelConnectionId || '',
        channelName: channel?.title || 'Unknown Channel',
        duration: job.duration,
        videoUrl: job.video_url,
        status: job.status,
      };

      // Debug: Log first few scheduled items
      if (upload.scheduledTime) {
        console.log('📅 Scheduled video:', upload.scriptName, '→', upload.channelName, 'at', upload.scheduledTime);
      }

      return upload;
    });

  // Debug: Count scheduled vs unscheduled
  const withSchedule = scheduledUploads.filter((u) => u.scheduledTime);
  const withoutSchedule = scheduledUploads.filter((u) => !u.scheduledTime);
  console.log(
    `📊 Total uploads: ${scheduledUploads.length}, Scheduled: ${withSchedule.length}, Unscheduled: ${withoutSchedule.length}`,
  );

  const videos: YoutubeVideo[] = videosData || [];

  const handleScheduleChange = (jobId: string, date: Date, channelId: string) => {
    // Set time to noon by default when dragging to a new date
    date.setHours(12, 0, 0, 0);
    updateScheduleMutation.mutate({ jobId, date, channelId });
  };

  // Bulk schedule mutation - distributes all unscheduled videos across days
  const bulkScheduleMutation = useMutation({
    mutationFn: async () => {
      // Get all unscheduled completed jobs
      const unscheduledJobs = scheduledUploads
        .filter((u) => !u.scheduledTime && u.status === 'completed')
        .map((u) => u.id);

      if (unscheduledJobs.length === 0) {
        throw new Error('No videos ready to schedule');
      }

      // Default: spread across 7 days, 2 uploads per day
      const daysToSpread = Math.ceil(unscheduledJobs.length / 2);
      const uploadsPerDay = 2;
      const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow

      const response = await apiRequest('POST', '/api/youtube/bulk-schedule', {
        jobIds: unscheduledJobs,
        startDate: startDate.toISOString(),
        daysToSpread,
        uploadsPerDay,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Videos Scheduled Successfully!',
          description: `${data.data.scheduled} videos distributed across ${data.data.summary.daysUsed} days`,
        });
        // Refetch jobs to update UI
        window.location.reload();
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Scheduling Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const totalScheduled = scheduledUploads.length;
  const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
  const totalVideos = videos.length;

  const isLoading = jobsLoading || channelsLoading || videosLoading;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <Calendar className="w-10 h-10 text-primary" />
              Upload & Analytics
            </h1>
            <p className="text-muted-foreground text-lg mt-1">
              Manage schedules and track performance across all channels
            </p>
          </div>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading data...
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-2 hover:border-primary/50 transition-all duration-200 hover:shadow-lg">
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-10 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-muted animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Scheduled Uploads</p>
                    <div className="text-4xl font-bold mb-2">{totalScheduled}</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Videos in queue
                    </p>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                    <Clock className="w-7 h-7 text-blue-500" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-all duration-200 hover:shadow-lg">
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-10 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-muted animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Total Videos</p>
                    <div className="text-4xl font-bold mb-2">{totalVideos}</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <PlayCircle className="w-3 h-3" />
                      Across all channels
                    </p>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                    <PlayCircle className="w-7 h-7 text-purple-500" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-all duration-200 hover:shadow-lg">
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-10 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-muted animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Total Views</p>
                    <div className="text-4xl font-bold mb-2">{totalViews.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      Cumulative performance
                    </p>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
                    <Eye className="w-7 h-7 text-green-500" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 h-12">
            <TabsTrigger value="schedule" className="text-sm">
              <Calendar className="w-4 h-4 mr-2" />
              Schedule & Performance
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-sm">
              <BarChart3 className="w-4 h-4 mr-2" />
              Global Analytics
            </TabsTrigger>
          </TabsList>

          {/* Schedule Tab - Per-Channel Sections */}
          <TabsContent value="schedule" className="space-y-6">
            {!channels || channels.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500/20 to-red-500/5 flex items-center justify-center mb-6">
                    <Youtube className="w-12 h-12 text-red-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">No Channels Connected</h3>
                  <p className="text-muted-foreground text-center max-w-lg mb-6 leading-relaxed">
                    Connect your YouTube channels to unlock powerful scheduling and analytics features. Track
                    performance, optimize uploads, and get AI-powered insights.
                  </p>
                  <div className="flex gap-3">
                    <Button size="lg" asChild>
                      <a href="/settings">
                        <Youtube className="w-4 h-4 mr-2" />
                        Connect YouTube Channel
                      </a>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                      <a href="/analytics">
                        <BarChart3 className="w-4 h-4 mr-2" />
                        View Analytics
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Auto-Schedule Button - Always visible */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Zap className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">Bulk Schedule</h3>
                          <p className="text-sm text-muted-foreground">
                            {scheduledUploads.filter((u) => !u.scheduledTime).length > 0
                              ? `Distribute ${scheduledUploads.filter((u) => !u.scheduledTime).length} videos across days (2 per day, optimal times)`
                              : 'All videos already scheduled'}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => bulkScheduleMutation.mutate()}
                        disabled={
                          bulkScheduleMutation.isPending ||
                          scheduledUploads.filter((u) => !u.scheduledTime).length === 0
                        }
                        size="lg"
                        className="gap-2"
                      >
                        {bulkScheduleMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Distributing videos...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            Schedule All ({scheduledUploads.filter((u) => !u.scheduledTime).length})
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Unscheduled Videos Section */}
                {scheduledUploads.filter((u) => !u.channelConnectionId).length > 0 && (
                  <Card className="border-2 border-dashed border-primary/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Ready to Schedule
                        <Badge className="ml-2">
                          {scheduledUploads.filter((u) => !u.channelConnectionId).length} videos
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Or manually drag these videos to a channel calendar below to schedule them for upload
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px]">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pr-4">
                          {scheduledUploads
                            .filter((u) => !u.channelConnectionId)
                            .slice(0, 50) // Limit to first 50
                            .map((upload) => (
                              <Card
                                key={upload.id}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('jobId', upload.id);
                                }}
                                className="cursor-move hover:shadow-lg transition-all hover:border-primary border-2"
                                title={`${upload.scriptName}\n\n${upload.description}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                                      <GripVertical className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold text-sm truncate">{upload.scriptName}</h4>
                                      {upload.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                          {upload.description}
                                        </p>
                                      )}
                                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                        {upload.status === 'completed' ? (
                                          <>
                                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                                            Ready to upload
                                          </>
                                        ) : (
                                          <>
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            In progress
                                          </>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Channel Sections */}
                {channels.map((channel) => (
                  <ChannelSection
                    key={channel.id}
                    channel={channel}
                    uploads={scheduledUploads}
                    videos={videos}
                    onScheduleChange={handleScheduleChange}
                  />
                ))}

                {/* Add Channel CTA */}
                <Card
                  className="border-dashed border-2 hover:border-primary transition-colors cursor-pointer"
                  onClick={() => (window.location.href = '/settings')}
                >
                  <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                        <Youtube className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium mb-1">Add Another Channel</p>
                      <p className="text-xs text-muted-foreground">
                        Connect more YouTube channels to manage multiple content streams
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab - Global Dashboard */}
          <TabsContent value="analytics" className="space-y-6">
            <AnalyticsDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
