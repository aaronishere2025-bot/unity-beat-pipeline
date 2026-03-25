import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import {
  Music,
  Sparkles,
  Wand2,
  Loader2,
  Zap,
  Settings,
  Info,
  CheckCircle2,
  Play,
  DollarSign,
  Smartphone,
  Film,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

// Beat style presets
const BEAT_PRESETS = {
  trap: {
    name: 'Trap',
    description: 'Hard-hitting 808s, hi-hats, and aggressive percussion',
    icon: '🔥',
    bpmRange: [140, 160],
    defaultBpm: 150,
    tags: ['trap', 'hip-hop', 'aggressive'],
    style: 'Dark and aggressive trap beat with heavy bass',
  },
  lofi: {
    name: 'Lo-Fi',
    description: 'Chill, relaxing beats with vinyl crackle',
    icon: '🌙',
    bpmRange: [70, 90],
    defaultBpm: 80,
    tags: ['lofi', 'chill', 'study'],
    style: 'Lo-fi hip hop beat with jazzy chords and vinyl texture',
  },
  boom_bap: {
    name: 'Boom Bap',
    description: 'Classic 90s hip-hop drums and samples',
    icon: '🎧',
    bpmRange: [85, 95],
    defaultBpm: 90,
    tags: ['boom-bap', 'hip-hop', 'classic'],
    style: '90s style boom bap beat with punchy drums',
  },
  drill: {
    name: 'Drill',
    description: 'Dark, menacing drill with sliding 808s',
    icon: '⚡',
    bpmRange: [135, 145],
    defaultBpm: 140,
    tags: ['drill', 'dark', 'aggressive'],
    style: 'Dark drill beat with sliding 808s and hard-hitting percussion',
  },
  ambient: {
    name: 'Ambient',
    description: 'Atmospheric, ethereal soundscapes',
    icon: '✨',
    bpmRange: [60, 80],
    defaultBpm: 70,
    tags: ['ambient', 'atmospheric', 'chill'],
    style: 'Ambient atmospheric beat with ethereal pads and textures',
  },
  custom: {
    name: 'Custom',
    description: 'Create your own unique style',
    icon: '🎨',
    bpmRange: [60, 180],
    defaultBpm: 120,
    tags: [],
    style: '',
  },
};

export default function GenerateBeat() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Form state
  const [preset, setPreset] = useState<keyof typeof BEAT_PRESETS>('trap');
  const [beatName, setBeatName] = useState('');
  const [customStyle, setCustomStyle] = useState('');
  const [beatDescription, setBeatDescription] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState(BEAT_PRESETS.trap.defaultBpm);
  const [duration, setDuration] = useState(180); // 3 minutes default
  const [aspectRatio, setAspectRatio] = useState('16:9'); // Default to horizontal
  const [includeVisuals, setIncludeVisuals] = useState(true);
  const [autoListForSale, setAutoListForSale] = useState(false);
  const [price, setPrice] = useState('9.99');

  const selectedPreset = BEAT_PRESETS[preset];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/beats/generate', {
        beatName: beatName || `${selectedPreset.name} Beat ${Date.now()}`,
        style: preset === 'custom' ? customStyle : selectedPreset.style,
        beatDescription: beatDescription.trim(),
        lyrics: lyrics.trim(),
        bpm,
        duration,
        aspectRatio,
        includeVisuals,
        autoListForSale,
        price: autoListForSale ? parseFloat(price) : undefined,
        tags: selectedPreset.tags,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Beat Generation Started!',
        description: `Your ${selectedPreset.name} beat is being generated. Check the jobs page for progress.`,
      });
      setLocation(`/jobs/${data.jobId}`);
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePresetChange = (newPreset: keyof typeof BEAT_PRESETS) => {
    setPreset(newPreset);
    const presetData = BEAT_PRESETS[newPreset];
    setBpm(presetData.defaultBpm);
  };

  const handleGenerate = () => {
    if (preset === 'custom' && !customStyle.trim()) {
      toast({
        title: 'Custom Style Required',
        description: 'Please describe the style you want for your beat',
        variant: 'destructive',
      });
      return;
    }

    generateMutation.mutate();
  };

  const estimatedCost = includeVisuals ? 0.6 : 0.1;
  const estimatedTime = includeVisuals ? '15-20 min' : '3-5 min';

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Wand2 className="w-10 h-10 text-primary" />
            Generate Beat
          </h1>
          <p className="text-muted-foreground text-lg">Create professional beats with AI-powered music generation</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Preset Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Choose Style
                </CardTitle>
                <CardDescription>Select a preset or create your own custom style</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(BEAT_PRESETS).map(([key, presetData]) => (
                    <button
                      key={key}
                      onClick={() => handlePresetChange(key as keyof typeof BEAT_PRESETS)}
                      className={`
                        p-4 rounded-lg border-2 transition-all text-left
                        ${
                          preset === key
                            ? 'border-primary bg-primary/10 shadow-lg'
                            : 'border-border hover:border-primary/50 hover:bg-accent'
                        }
                      `}
                    >
                      <div className="text-2xl mb-2">{presetData.icon}</div>
                      <div className="font-semibold mb-1">{presetData.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{presetData.description}</div>
                    </button>
                  ))}
                </div>

                {preset === 'custom' && (
                  <div className="mt-4">
                    <Label htmlFor="customStyle">Custom Style Description</Label>
                    <Textarea
                      id="customStyle"
                      placeholder="Describe the style you want (e.g., 'Upbeat electronic dance music with synth leads')"
                      value={customStyle}
                      onChange={(e) => setCustomStyle(e.target.value)}
                      rows={3}
                      className="mt-2"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Beat Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Beat Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Beat Name */}
                <div className="space-y-2">
                  <Label htmlFor="beatName">Beat Name (Optional)</Label>
                  <Input
                    id="beatName"
                    placeholder={`${selectedPreset.name} Beat`}
                    value={beatName}
                    onChange={(e) => setBeatName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Leave empty for auto-generated name</p>
                </div>

                {/* Beat Description */}
                <div className="space-y-2">
                  <Label htmlFor="beatDescription">Beat Description (Optional)</Label>
                  <Textarea
                    id="beatDescription"
                    placeholder="Describe your beat vibe (e.g., 'Dark and moody trap with heavy bass, perfect for late night vibes')"
                    value={beatDescription}
                    onChange={(e) => setBeatDescription(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    AI will extract mood, instruments, and vibes to enhance generation
                  </p>
                </div>

                {/* Lyrics */}
                <div className="space-y-2">
                  <Label htmlFor="lyrics">Lyrics (Optional - for full songs)</Label>
                  <Textarea
                    id="lyrics"
                    placeholder="Add lyrics to create a full song with vocals instead of instrumental..."
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    rows={6}
                    className="resize-none font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for instrumental only. Add lyrics for a full song with vocals.
                  </p>
                </div>

                {/* BPM Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>BPM (Tempo)</Label>
                    <Badge variant="outline">{bpm} BPM</Badge>
                  </div>
                  <Slider
                    value={[bpm]}
                    onValueChange={(values) => setBpm(values[0])}
                    min={selectedPreset.bpmRange[0]}
                    max={selectedPreset.bpmRange[1]}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Recommended: {selectedPreset.bpmRange[0]} - {selectedPreset.bpmRange[1]} BPM
                  </p>
                </div>

                {/* Duration Selector */}
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">1 minute</SelectItem>
                      <SelectItem value="120">2 minutes</SelectItem>
                      <SelectItem value="180">3 minutes (Recommended)</SelectItem>
                      <SelectItem value="240">4 minutes</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                      <SelectItem value="600">10 minutes</SelectItem>
                      <SelectItem value="900">15 minutes</SelectItem>
                      <SelectItem value="1200">20 minutes</SelectItem>
                      <SelectItem value="1800">30 minutes (Lofi Mix)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Aspect Ratio Selector */}
                <div className="space-y-2">
                  <Label htmlFor="aspectRatio">Video Format (Aspect Ratio)</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio} defaultValue="16:9">
                    <SelectTrigger>
                      <SelectValue placeholder="16:9 - Widescreen (YouTube)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="9:16">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-4 h-4" />
                          <span>9:16 - Vertical (TikTok, Reels, Shorts)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="16:9">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4" />
                          <span>16:9 - Widescreen (YouTube, TV)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="1:1">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4" />
                          <span>1:1 - Square (Instagram Feed)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="4:3">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4" />
                          <span>4:3 - Classic (Old TV)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose video format for visuals (only applies if visuals are enabled)
                  </p>
                </div>

                {/* Visual Generation Toggle */}
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="space-y-0.5">
                    <div className="font-medium">Include Visuals</div>
                    <div className="text-sm text-muted-foreground">
                      Generate 1 themed Kling clip matching beat style, looped (+$0.10)
                    </div>
                    <div className="text-xs text-muted-foreground">
                      e.g., Travis Scott vibes for trap, cozy study room for lofi
                    </div>
                  </div>
                  <Switch checked={includeVisuals} onCheckedChange={setIncludeVisuals} />
                </div>

                {/* Auto-List Toggle */}
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="space-y-0.5">
                    <div className="font-medium">Auto-List for Sale</div>
                    <div className="text-sm text-muted-foreground">
                      Automatically list on marketplace after generation
                    </div>
                  </div>
                  <Switch checked={autoListForSale} onCheckedChange={setAutoListForSale} />
                </div>

                {autoListForSale && (
                  <div className="space-y-2 ml-4">
                    <Label htmlFor="price">Sale Price (USD)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        min="0.99"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Summary & Generate */}
          <div className="space-y-6">
            {/* Summary Card */}
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Generation Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Style</div>
                  <div className="font-semibold">{selectedPreset.name}</div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground mb-1">BPM</div>
                  <div className="font-semibold">{bpm} BPM</div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground mb-1">Duration</div>
                  <div className="font-semibold">{duration / 60} min</div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground mb-1">Features</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>AI Music Generation</span>
                    </div>
                    {includeVisuals && (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span>Synchronized Visuals</span>
                      </div>
                    )}
                    {autoListForSale && (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span>Auto-List (${price})</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Estimated Cost:</span>
                    <Badge variant="outline">${estimatedCost.toFixed(2)}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Estimated Time:</span>
                    <Badge variant="outline">{estimatedTime}</Badge>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button onClick={handleGenerate} disabled={generateMutation.isPending} size="lg" className="w-full">
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      Generate Beat
                    </>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">You'll be redirected to track progress</p>
              </CardFooter>
            </Card>

            {/* Tips Card */}
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm">💡 Pro Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>• Trap beats work best at 140-160 BPM</p>
                <p>• Lo-fi is perfect for study/chill content</p>
                <p>• Visuals increase engagement by 3-5x</p>
                <p>• Auto-listing saves time for monetization</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
