import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, Music, Video, Sparkles, Info, DollarSign } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function PricingCalculator() {
  const [durationMinutes, setDurationMinutes] = useState(3);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [includeVideo, setIncludeVideo] = useState(true);

  // Pricing constants
  const SUNO_COST_PER_SONG = 0.1;
  const KLING_COST_PER_CLIP = 0.1;
  const CLIP_DURATION_SECONDS = 8;
  const PROCESSING_FEE_PERCENT = 0.1; // 10% processing fee

  // Calculate costs
  const costs = useMemo(() => {
    const durationSeconds = durationMinutes * 60;

    // Audio cost (Suno generates ~2-4 min songs, need multiple for longer videos)
    let audioCost = 0;
    if (includeAudio) {
      const songsNeeded = Math.ceil(durationMinutes / 3); // Estimate 3 min per song
      audioCost = songsNeeded * SUNO_COST_PER_SONG;
    }

    // Video cost (one clip per 8 seconds)
    let videoCost = 0;
    let clipCount = 0;
    if (includeVideo) {
      clipCount = Math.ceil(durationSeconds / CLIP_DURATION_SECONDS);
      videoCost = clipCount * KLING_COST_PER_CLIP;
    }

    // Processing fee
    const subtotal = audioCost + videoCost;
    const processingFee = subtotal * PROCESSING_FEE_PERCENT;

    // Total
    const total = audioCost + videoCost + processingFee;

    // User pricing (3x markup for sustainability)
    const userPrice = total * 3;

    return {
      audioCost,
      videoCost,
      clipCount,
      processingFee,
      subtotal,
      total,
      userPrice,
    };
  }, [durationMinutes, includeAudio, includeVideo]);

  return (
    <Card className="border-2 border-primary/20 shadow-lg">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Calculator className="w-6 h-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Cost Calculator</CardTitle>
            <CardDescription>See exactly what you'll pay before you generate</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Duration Slider */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Video Length</Label>
            <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
              {durationMinutes} min
            </Badge>
          </div>
          <Slider
            value={[durationMinutes]}
            onValueChange={(values) => setDurationMinutes(values[0])}
            min={0.5}
            max={30}
            step={0.5}
            className="py-4"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>30 seconds</span>
            <span>30 minutes</span>
          </div>
        </div>

        <Separator />

        {/* Include Audio Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            <Music className="w-5 h-5 text-primary" />
            <div>
              <Label htmlFor="include-audio" className="text-base font-medium cursor-pointer">
                Include AI-Generated Music
              </Label>
              <p className="text-xs text-muted-foreground mt-1">Suno AI creates custom beats for your video</p>
            </div>
          </div>
          <Switch id="include-audio" checked={includeAudio} onCheckedChange={setIncludeAudio} />
        </div>

        {/* Include Video Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            <Video className="w-5 h-5 text-primary" />
            <div>
              <Label htmlFor="include-video" className="text-base font-medium cursor-pointer">
                Include AI-Generated Visuals
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Kling AI generates video clips synchronized to your music
              </p>
            </div>
          </div>
          <Switch id="include-video" checked={includeVideo} onCheckedChange={setIncludeVideo} />
        </div>

        <Separator />

        {/* Cost Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Cost Breakdown</h3>
          </div>

          {/* Audio Cost */}
          {includeAudio && (
            <div className="flex items-center justify-between text-sm">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-help">
                      <Music className="w-4 h-4 text-muted-foreground" />
                      <span>AI Music Generation</span>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Suno AI generates ~3-minute songs. For {durationMinutes} minutes, we need{' '}
                      {Math.ceil(durationMinutes / 3)} song(s) at $0.10 each.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-medium">${costs.audioCost.toFixed(2)}</span>
            </div>
          )}

          {/* Video Cost */}
          {includeVideo && (
            <div className="flex items-center justify-between text-sm">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-help">
                      <Video className="w-4 h-4 text-muted-foreground" />
                      <span>AI Video Generation ({costs.clipCount} clips)</span>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Each video clip is 8 seconds long and costs $0.10. For {durationMinutes} minutes (
                      {durationMinutes * 60}s), you need {costs.clipCount} clips.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-medium">${costs.videoCost.toFixed(2)}</span>
            </div>
          )}

          {/* Processing Fee */}
          {(includeAudio || includeVideo) && (
            <div className="flex items-center justify-between text-sm">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-help">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span>Processing & Infrastructure</span>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">10% fee covers video assembly, FFmpeg processing, storage, and delivery.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-medium">${costs.processingFee.toFixed(2)}</span>
            </div>
          )}

          <Separator />

          {/* Total Cost */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">Our Cost</div>
            <div className="text-sm font-semibold">${costs.total.toFixed(2)}</div>
          </div>

          {/* User Price */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10 border-2 border-primary/30">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              <span className="text-lg font-bold">Your Price</span>
            </div>
            <div className="text-3xl font-bold text-primary">${costs.userPrice.toFixed(2)}</div>
          </div>

          {/* Explanation */}
          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
            <p className="font-medium mb-1">Why 3x markup?</p>
            <p>
              We charge 3x our cost to cover platform operations, customer support, development, and ensure long-term
              sustainability. This is transparent pricing - you can see exactly what goes where.
            </p>
          </div>

          {/* Empty State */}
          {!includeAudio && !includeVideo && (
            <div className="text-center py-8 text-muted-foreground">
              <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Enable at least one option to see pricing</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
