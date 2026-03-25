import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Video, Crop, Download, Loader2, Copy, Smartphone, Monitor, Square, FileVideo, Layers } from 'lucide-react';

export default function VideoToolsPage() {
  const { toast } = useToast();
  const [videoPath, setVideoPath] = useState('');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [position, setPosition] = useState<'center' | 'left' | 'right'>('center');
  const [croppedVideos, setCroppedVideos] = useState<{
    format4x3?: string;
    format9x16?: string;
    multiFormat?: { landscape: string; tablet: string; vertical: string };
  }>({});

  const crop4x3Mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/video/crop-4x3', {
        inputPath: videoPath,
        orientation,
        position,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setCroppedVideos((prev) => ({ ...prev, format4x3: data.data.outputPath }));
        toast({
          title: 'Video Cropped',
          description: `4:3 ${orientation} video created successfully`,
        });
      } else {
        toast({
          title: 'Cropping Failed',
          description: data.error || 'Failed to crop video',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const crop9x16Mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/video/crop-9x16', {
        inputPath: videoPath,
        position,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setCroppedVideos((prev) => ({ ...prev, format9x16: data.data.outputPath }));
        toast({
          title: 'Video Cropped',
          description: '9:16 vertical video created successfully',
        });
      } else {
        toast({
          title: 'Cropping Failed',
          description: data.error || 'Failed to crop video',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const multiFormatMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/video/export-multi-format', {
        inputPath: videoPath,
        baseName: `export_${Date.now()}`,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setCroppedVideos((prev) => ({ ...prev, multiFormat: data.data }));
        toast({
          title: 'Multi-Format Export Complete',
          description: 'All 3 formats (16:9, 4:3, 9:16) created',
        });
      } else {
        toast({
          title: 'Export Failed',
          description: data.error || 'Failed to export formats',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const isPending = crop4x3Mutation.isPending || crop9x16Mutation.isPending || multiFormatMutation.isPending;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Path copied to clipboard' });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-video-tools-title">
            Video Tools
          </h1>
          <p className="text-muted-foreground mt-1">Convert video formats for TikTok, Shorts, and Reels</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Square className="h-3 w-3" />
            4:3 Format
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Smartphone className="h-3 w-3" />
            9:16 Vertical
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Layers className="h-3 w-3" />
            Multi-Export
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crop className="h-5 w-5" />
                Video Format Conversion
              </CardTitle>
              <CardDescription>Crop 16:9 videos to 4:3 or 9:16 for social media platforms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="video-path">Video Path</Label>
                <Input
                  id="video-path"
                  placeholder="e.g., temp/my_video.mp4 or outputs/final.mp4"
                  value={videoPath}
                  onChange={(e) => setVideoPath(e.target.value)}
                  data-testid="input-video-path"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the path to your 16:9 video file relative to project root
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Square className="h-4 w-4" />
                  4:3 Crop Options
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Orientation</Label>
                    <Select value={orientation} onValueChange={(v) => setOrientation(v as 'landscape' | 'portrait')}>
                      <SelectTrigger data-testid="select-orientation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="landscape">
                          <div className="flex items-center gap-2">
                            <Monitor className="h-4 w-4" />
                            Landscape
                          </div>
                        </SelectItem>
                        <SelectItem value="portrait">
                          <div className="flex items-center gap-2">
                            <Smartphone className="h-4 w-4" />
                            Portrait
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {orientation === 'landscape' ? '1440x1080' : '1080x1440'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Position</Label>
                    <Select value={position} onValueChange={(v) => setPosition(v as 'center' | 'left' | 'right')}>
                      <SelectTrigger data-testid="select-position">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Crop alignment</p>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => crop4x3Mutation.mutate()}
                  disabled={!videoPath || isPending}
                  data-testid="button-crop-4x3"
                >
                  {crop4x3Mutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Crop className="h-4 w-4 mr-2" />
                  )}
                  Crop to 4:3
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  9:16 Vertical (TikTok/Shorts/Reels)
                </h3>
                <p className="text-xs text-muted-foreground">Center crop to 1080x1920 vertical format</p>

                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => crop9x16Mutation.mutate()}
                  disabled={!videoPath || isPending}
                  data-testid="button-crop-9x16"
                >
                  {crop9x16Mutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Smartphone className="h-4 w-4 mr-2" />
                  )}
                  Crop to 9:16 Vertical
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export All Formats
                </h3>
                <p className="text-xs text-muted-foreground">
                  Creates 16:9 (original), 4:3 (tablet), and 9:16 (vertical) versions simultaneously
                </p>

                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => multiFormatMutation.mutate()}
                  disabled={!videoPath || isPending}
                  data-testid="button-export-multi"
                >
                  {multiFormatMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Layers className="h-4 w-4 mr-2" />
                  )}
                  Export All 3 Formats
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-7">
          <Card className="h-[calc(100vh-14rem)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileVideo className="h-5 w-5" />
                Output Videos
              </CardTitle>
              <CardDescription>Cropped video files will appear here with their paths</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-22rem)]">
                {croppedVideos.format4x3 || croppedVideos.format9x16 || croppedVideos.multiFormat ? (
                  <div className="space-y-6">
                    {croppedVideos.format4x3 && (
                      <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="gap-1">
                            <Square className="h-3 w-3" />
                            4:3 {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
                          </Badge>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(croppedVideos.format4x3!)}>
                            <Copy className="h-4 w-4 mr-1" />
                            Copy Path
                          </Button>
                        </div>
                        <code
                          className="text-sm block bg-background p-3 rounded-md font-mono"
                          data-testid="text-output-4x3"
                        >
                          {croppedVideos.format4x3}
                        </code>
                      </div>
                    )}

                    {croppedVideos.format9x16 && (
                      <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="gap-1">
                            <Smartphone className="h-3 w-3" />
                            9:16 Vertical
                          </Badge>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(croppedVideos.format9x16!)}>
                            <Copy className="h-4 w-4 mr-1" />
                            Copy Path
                          </Button>
                        </div>
                        <code
                          className="text-sm block bg-background p-3 rounded-md font-mono"
                          data-testid="text-output-9x16"
                        >
                          {croppedVideos.format9x16}
                        </code>
                      </div>
                    )}

                    {croppedVideos.multiFormat && (
                      <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                        <Badge variant="default" className="gap-1">
                          <Layers className="h-3 w-3" />
                          Multi-Format Export Complete
                        </Badge>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-4 p-3 bg-background rounded-md">
                            <div className="flex items-center gap-2">
                              <Monitor className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">16:9 Landscape</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="text-xs text-muted-foreground">
                                {croppedVideos.multiFormat.landscape}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(croppedVideos.multiFormat!.landscape)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4 p-3 bg-background rounded-md">
                            <div className="flex items-center gap-2">
                              <Square className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">4:3 Tablet</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="text-xs text-muted-foreground">{croppedVideos.multiFormat.tablet}</code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(croppedVideos.multiFormat!.tablet)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4 p-3 bg-background rounded-md">
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">9:16 Vertical</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="text-xs text-muted-foreground">
                                {croppedVideos.multiFormat.vertical}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(croppedVideos.multiFormat!.vertical)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                    <Video className="h-16 w-16 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">No videos converted yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Enter a video path and select a format to get started
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4 justify-center">
                      <Badge variant="outline">4:3 Landscape</Badge>
                      <Badge variant="outline">4:3 Portrait</Badge>
                      <Badge variant="outline">9:16 Vertical</Badge>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
