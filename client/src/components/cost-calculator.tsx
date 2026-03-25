import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DollarSign, TrendingUp } from 'lucide-react';

export function CostCalculator() {
  const [videoCount, setVideoCount] = useState(10);
  const [mode, setMode] = useState<'veo' | 'consistent'>('veo');

  const costPerVideo = mode === 'veo' ? 9.05 : 0.75;
  const totalCost = videoCount * costPerVideo;
  const monthlyProjection = videoCount * 30 * costPerVideo;

  return (
    <Card data-testid="card-cost-calculator">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Cost Calculator
        </CardTitle>
        <CardDescription>Estimate your video generation costs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Generation Mode</Label>
            <div className="flex items-center gap-2">
              <button
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  mode === 'veo' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover-elevate'
                }`}
                onClick={() => setMode('veo')}
                data-testid="button-mode-veo"
              >
                VEO
              </button>
              <button
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  mode === 'consistent'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover-elevate'
                }`}
                onClick={() => setMode('consistent')}
                data-testid="button-mode-consistent"
              >
                Consistent
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Videos per Day</Label>
              <Badge variant="outline" className="font-mono" data-testid="text-video-count">
                {videoCount}
              </Badge>
            </div>
            <Slider
              value={[videoCount]}
              onValueChange={(value) => setVideoCount(value[0])}
              min={1}
              max={100}
              step={1}
              data-testid="slider-video-count"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cost per Video</span>
            <span className="font-mono font-semibold" data-testid="text-cost-per-video">
              ${costPerVideo.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Daily Total</span>
            <span className="text-lg font-semibold" data-testid="text-daily-total">
              ${totalCost.toFixed(2)}
            </span>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Monthly Projection</span>
            </div>
            <span className="text-xl font-semibold text-primary" data-testid="text-monthly-projection">
              ${monthlyProjection.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-md bg-muted">
          <p className="text-xs text-muted-foreground">
            {mode === 'veo'
              ? 'VEO Cinematic mode provides professional-quality videos with storytelling intelligence and cinematography.'
              : 'Consistent Character mode is optimized for daily uploads with character consistency across episodes.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
