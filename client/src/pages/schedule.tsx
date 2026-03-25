import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, Youtube } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

interface ScheduledUpload {
  id: string;
  scriptName: string;
  scheduledTime: string;
  channelConnectionId: string;
  channelName?: string;
  duration?: number;
  videoUrl?: string;
}

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Fetch all scheduled uploads
  const { data: jobsData } = useQuery<{ data: any[] }>({
    queryKey: ['/api/jobs'],
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch connected channels for display names
  const { data: channels } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ['/api/youtube/connected-channels'],
  });

  // Filter and organize scheduled uploads
  const scheduledUploads: ScheduledUpload[] = (jobsData?.data || [])
    .filter((job: any) => job.unityMetadata?.pendingScheduledUpload)
    .map((job: any) => {
      const metadata = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;

      const channel = channels?.find((c: any) => c.id === metadata.channelConnectionId);

      return {
        id: job.id,
        scriptName: job.script_name,
        scheduledTime: metadata.scheduledUploadTime,
        channelConnectionId: metadata.channelConnectionId,
        channelName: channel?.title || 'Unknown Channel',
        duration: job.duration,
        videoUrl: job.video_url,
      };
    })
    .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());

  // Group by date
  const uploadsByDate: Record<string, ScheduledUpload[]> = {};
  scheduledUploads.forEach((upload) => {
    const date = new Date(upload.scheduledTime).toLocaleDateString();
    if (!uploadsByDate[date]) {
      uploadsByDate[date] = [];
    }
    uploadsByDate[date].push(upload);
  });

  const dates = Object.keys(uploadsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const totalScheduled = scheduledUploads.length;
  const trapCount = scheduledUploads.filter((u) => u.channelName?.includes('Trap')).length;
  const lofiCount = scheduledUploads.filter((u) => u.channelName?.includes('Chill')).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Calendar className="w-8 h-8" />
          Upload Schedule
        </h1>
        <p className="text-muted-foreground mt-2">Manage your scheduled YouTube uploads across multiple channels</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalScheduled}</div>
            <p className="text-xs text-muted-foreground mt-1">Videos queued for upload</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Trap Beats INC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{trapCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Trap & drill beats</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">ChillBeats4Me</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">{lofiCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Lofi study mixes</p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Date List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Days</CardTitle>
            <CardDescription>Click a day to view uploads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No scheduled uploads</p>
            ) : (
              dates.map((date) => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedDate === date ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                  }`}
                >
                  <div className="font-medium">{date}</div>
                  <div className="text-sm opacity-80">
                    {uploadsByDate[date].length} upload{uploadsByDate[date].length !== 1 ? 's' : ''}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upload Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{selectedDate ? `Uploads for ${selectedDate}` : 'Select a day'}</CardTitle>
            <CardDescription>
              {selectedDate && `${uploadsByDate[selectedDate]?.length || 0} videos scheduled`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedDate ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a day from the calendar to view scheduled uploads</p>
              </div>
            ) : (
              <div className="space-y-3">
                {uploadsByDate[selectedDate]?.map((upload) => {
                  const time = new Date(upload.scheduledTime);
                  const isTrap = upload.channelName?.includes('Trap');

                  return (
                    <div
                      key={upload.id}
                      className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-shrink-0">
                        <Youtube className={`w-5 h-5 ${isTrap ? 'text-red-500' : 'text-blue-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm mb-1">{upload.scriptName}</div>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {time.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          {upload.duration && (
                            <Badge variant="secondary" className="text-xs">
                              {Math.floor(upload.duration / 60)}:{(upload.duration % 60).toString().padStart(2, '0')}
                            </Badge>
                          )}
                          <Badge variant={isTrap ? 'destructive' : 'default'} className="text-xs">
                            {upload.channelName}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
