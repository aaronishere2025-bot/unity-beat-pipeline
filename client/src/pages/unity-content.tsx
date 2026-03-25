import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Mic2,
  Music,
  Loader2,
  Copy,
  Sparkles,
  BookOpen,
  Zap,
  Video,
  Clock,
  DollarSign,
  Users,
  Film,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Layers,
  Camera,
  Lightbulb,
  Target,
  Play,
  Upload,
  FileAudio,
  X,
  Volume2,
  Save,
  Trash2,
  FolderOpen,
  MoreVertical,
  ExternalLink,
  RefreshCw,
  BarChart3,
  Type,
  Sword,
} from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface TimingAnalysis {
  totalSyllables: number;
  totalBeats: number;
  totalDurationSeconds: number;
  formattedDuration: string;
  bpm: number;
  syllablesPerBeat: number;
  sections: Array<{
    name: string;
    type: string;
    lineCount: number;
    syllableCount: number;
    estimatedBeats: number;
    estimatedDurationSeconds: number;
    veoClipsNeeded: number;
  }>;
  totalVeoClips: number;
  estimatedVeoCost: number;
  warnings: string[];
  recommendations: string[];
}

interface CharacterCast {
  id: number;
  name?: string; // v2.0: Real names like "MIKE", "DANIELLE"
  age: number;
  gender: string;
  appearance: string;
  wardrobeBase: string;
  vibe: string;
  role: string;
  humanizingDetail?: string; // v2.0: The detail that makes them real
}

interface VeoPrompt {
  sectionName: string;
  sectionIndex: number;
  durationSeconds: number;
  characterIds: number[];
  sceneDetails: {
    location: string;
    timeOfDay: string;
    wardrobe: string;
    props: string[];
  };
  characterAction: {
    startingPosition: string;
    movement: string;
    expression: string;
    keyGesture: string;
  };
  camera: {
    shotType: string;
    angle: string;
    movement: string;
    startingFrame: string;
    endingFrame: string;
  };
  lighting: {
    keyLight: string;
    fillRim: string;
    practicalLights: string;
    mood: string;
    colorGrade: string;
  };
  beatSync: {
    timings: Array<{ seconds: string; action: string }>;
  };
  fullPrompt: string;
}

interface SunoStyleTags {
  bpm: number;
  genre: string;
  subgenre: string;
  vocals: string;
  instruments: string[];
  production: string[];
  mood: string[];
  fullStyleString: string;
}

interface ContentPackage {
  lyrics: {
    raw: string;
    sections: Record<string, string>;
  };
  sunoStyleTags: SunoStyleTags;
  characterCast: CharacterCast[];
  veoPrompts: VeoPrompt[];
  timing: TimingAnalysis;
  metadata: {
    topic: string;
    message: string;
    visualStyle: string;
    visualStyleV2?: string; // v2.0 visual tone
    setting?: string; // v2.0 setting approach
    stylePreset?: string; // Style preset (comedy_meme, wholesome, etc.)
    battleMode?: boolean; // VS BATTLE MODE for epic combat scenes
    targetDuration: number;
    generatedAt: string;
  };
}

interface VideoStyle {
  id: string;
  name: string;
  description: string;
  cameraStyles: string[];
  lightingMoods: string[];
  locations: string[];
}

interface VibePreset {
  id: string;
  voice: string;
  energy: string;
  mood: string;
  visual: string;
  description: string;
}

interface ContentOptions {
  voices: Array<{ id: string; description: string }>;
  energies: Array<{ id: string; description: string }>;
  moods: Array<{ id: string; description: string }>;
  visualStyles: Array<{ id: string; description: string }>;
  settings: Array<{ id: string; description: string }>;
  vibePresets: VibePreset[];
}

const TARGET_DURATIONS = [
  { value: 30, label: '30 sec', clips: '~4 clips' },
  { value: 60, label: '1 min', clips: '~8 clips' },
  { value: 120, label: '2 min', clips: '~15 clips' },
  { value: 180, label: '3 min', clips: '~23 clips' },
];

export default function UnityContentPage() {
  const [activeTab, setActiveTab] = useState('generator');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-unity-title">
            Unity Content System
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate complete music video packages with lyrics, style tags, and VEO prompts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            AI Powered
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Timer className="h-3 w-3" />
            Pre-calculated Timing
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="generator" data-testid="tab-generator">
            <Zap className="h-4 w-4 mr-2" />
            Generator
          </TabsTrigger>
          <TabsTrigger value="output" data-testid="tab-output">
            <Film className="h-4 w-4 mr-2" />
            Output
          </TabsTrigger>
          <TabsTrigger value="saved" data-testid="tab-saved">
            <FolderOpen className="h-4 w-4 mr-2" />
            Saved
          </TabsTrigger>
          <TabsTrigger value="rhymes" data-testid="tab-rhymes">
            <BookOpen className="h-4 w-4 mr-2" />
            Rhymes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generator">
          <ContentGenerator />
        </TabsContent>

        <TabsContent value="output">
          <OutputPackage />
        </TabsContent>

        <TabsContent value="saved">
          <SavedPackages />
        </TabsContent>

        <TabsContent value="rhymes">
          <RhymeTools />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContentGenerator() {
  const { toast } = useToast();
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [bpm, setBpm] = useState(125);
  const [targetDuration, setTargetDuration] = useState(120);
  const [voice, setVoice] = useState('observational');
  const [energy, setEnergy] = useState('building');
  const [mood, setMood] = useState('ironic_to_warm');
  const [visualStyle, setVisualStyle] = useState('cinematic');
  const [visualStyleV2, setVisualStyleV2] = useState('cinematic'); // v2.0 visual style
  const [setting, setSetting] = useState('everyday'); // v2.0 setting approach
  const [selectedPreset, setSelectedPreset] = useState('custom'); // v2.0 vibe preset
  const [stylePreset, setStylePreset] = useState('comedy_meme'); // Style preset for VEO aesthetics
  const [battleMode, setBattleMode] = useState(false); // VS BATTLE MODE: Warriors in themed armor
  const [vertical, setVertical] = useState(true);
  const [customBars, setCustomBars] = useState('');
  const [avoidTerms, setAvoidTerms] = useState('');
  const [characterCount, setCharacterCount] = useState(3); // How many named characters to include
  const [autoGenerateVeo, setAutoGenerateVeo] = useState(false); // Auto-start VEO generation after pipeline
  const [contentPackage, setContentPackage] = useState<ContentPackage | null>(null);

  const { data: stylesData } = useQuery<{ success: boolean; data: { styles: VideoStyle[] } }>({
    queryKey: ['/api/unity/video-styles'],
  });
  const styles = stylesData?.data?.styles || [];

  const { data: optionsData } = useQuery<{ success: boolean; data: ContentOptions }>({
    queryKey: ['/api/unity/content-options'],
  });
  const options = optionsData?.data;

  // v2.0: Handle vibe preset selection - auto-populates voice, energy, mood, visual
  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    if (presetId && options?.vibePresets) {
      const preset = options.vibePresets.find((p) => p.id === presetId);
      if (preset) {
        setVoice(preset.voice);
        setEnergy(preset.energy);
        setMood(preset.mood);
        setVisualStyleV2(preset.visual);
      }
    }
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/unity/generate-package', {
        topic,
        message,
        voice,
        energy,
        mood,
        visualStyle,
        visualStyleV2, // v2.0 visual style
        setting, // v2.0 setting approach
        stylePreset, // Style preset for VEO aesthetics (comedy_meme, wholesome, etc.)
        battleMode, // VS BATTLE MODE: Warriors in themed armor
        bpm,
        targetDurationSeconds: targetDuration,
        vertical,
        customBars: customBars.split('\n').filter((b) => b.trim()),
        avoidTerms: avoidTerms
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        characterCount, // How many named characters to include
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setContentPackage(data.data);
        toast({
          title: 'Content Package Generated',
          description: `${data.data.timing.formattedDuration} video with ${data.data.timing.totalVeoClips} clips`,
        });
      } else {
        toast({
          title: 'Generation Failed',
          description: data.error || 'Failed to generate content',
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

  // FULL PIPELINE: Generate package → Suno → Librosa → Enhanced VEO prompts → VEO Generation (all automatic)
  const fullPipelineMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/unity/generate-full-pipeline', {
        topic,
        message,
        voice,
        energy,
        mood,
        visualStyle,
        visualStyleV2,
        setting,
        stylePreset, // Style preset for VEO aesthetics
        battleMode, // VS BATTLE MODE: Warriors in themed armor
        bpm,
        targetDurationSeconds: targetDuration,
        vertical,
        customBars: customBars.split('\n').filter((b) => b.trim()),
        avoidTerms: avoidTerms
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        characterCount,
        autoGenerateVeo, // NEW: Auto-start VEO video generation
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        const pkg = data.data.package;
        const status = data.data.pipelineStatus;

        // Set the content package from the saved package data
        if (pkg?.packageData) {
          setContentPackage(pkg.packageData);
        }

        // Show detailed success toast
        const parts = [];
        if (status.sunoGenerated) parts.push(`Suno: ${status.sunoTrackCount} tracks`);
        if (status.librosaAnalyzed) parts.push(`Librosa: ${status.librosaData?.bpm} BPM`);
        if (status.veoPromptsEnhanced) parts.push(`Kling: ${status.veoClipCount} clips`);
        if (status.veoGeneration?.jobId) parts.push(`Job: ${status.veoGeneration.status}`);

        toast({
          title: status.veoGeneration?.jobId ? 'Pipeline + VEO Started!' : 'Full Pipeline Complete!',
          description: parts.join(' • ') || 'Package generated',
        });

        // Invalidate packages and jobs queries to refresh
        queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      } else {
        toast({
          title: 'Pipeline Failed',
          description: data.error || 'Failed to complete pipeline',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Pipeline Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: `${label} copied to clipboard`,
    });
  };

  const canGenerate = topic.trim().length > 0 && message.trim().length > 0;

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-5 space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Content Brief
            </CardTitle>
            <CardDescription>Define your unity message and target specifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                placeholder="e.g., American Unity, Healing Division, Digital Freedom"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                data-testid="input-topic"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Core Message</Label>
              <Textarea
                id="message"
                placeholder="What's the main message? e.g., 'We're all being manipulated to fight each other when we should be united'"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                data-testid="input-message"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Duration</Label>
                <Select value={String(targetDuration)} onValueChange={(v) => setTargetDuration(Number(v))}>
                  <SelectTrigger data-testid="select-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label} ({d.clips})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>BPM: {bpm}</Label>
                <Slider
                  value={[bpm]}
                  onValueChange={(v) => setBpm(v[0])}
                  min={80}
                  max={160}
                  step={5}
                  data-testid="slider-bpm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Mic2 className="h-5 w-5" />
              Voice & Style
            </CardTitle>
            <CardDescription>v2.0: FACTS + FUN messaging with narrative arc</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* v2.0 Vibe Preset Selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Quick Vibe Preset
              </Label>
              <Select value={selectedPreset} onValueChange={handlePresetChange}>
                <SelectTrigger data-testid="select-preset">
                  <SelectValue placeholder="Choose a preset to auto-fill..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom Settings</SelectItem>
                  {options?.vibePresets?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id
                        .split('_')
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ')}
                    </SelectItem>
                  )) || (
                    <>
                      <SelectItem value="daily_show">Daily Show Style</SelectItem>
                      <SelectItem value="kitchen_table">Kitchen Table Talk</SelectItem>
                      <SelectItem value="street_corner">Street Corner Wisdom</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {selectedPreset && options?.vibePresets && (
                <p className="text-xs text-muted-foreground">
                  {options.vibePresets.find((p) => p.id === selectedPreset)?.description}
                </p>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Voice Style</Label>
                <Select
                  value={voice}
                  onValueChange={(v) => {
                    setVoice(v);
                    setSelectedPreset('custom');
                  }}
                >
                  <SelectTrigger data-testid="select-voice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.voices?.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.id.charAt(0).toUpperCase() + v.id.slice(1)}
                      </SelectItem>
                    )) || (
                      <>
                        <SelectItem value="observational">Observational</SelectItem>
                        <SelectItem value="storyteller">Storyteller</SelectItem>
                        <SelectItem value="clever">Clever</SelectItem>
                        <SelectItem value="soulful">Soulful</SelectItem>
                        <SelectItem value="passionate">Passionate</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Energy Level</Label>
                <Select
                  value={energy}
                  onValueChange={(e) => {
                    setEnergy(e);
                    setSelectedPreset('custom');
                  }}
                >
                  <SelectTrigger data-testid="select-energy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.energies?.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.id.charAt(0).toUpperCase() + e.id.slice(1)}
                      </SelectItem>
                    )) || (
                      <>
                        <SelectItem value="building">Building</SelectItem>
                        <SelectItem value="rolling">Rolling</SelectItem>
                        <SelectItem value="explosive">Explosive</SelectItem>
                        <SelectItem value="chill">Chill</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mood Arc</Label>
                <Select
                  value={mood}
                  onValueChange={(m) => {
                    setMood(m);
                    setSelectedPreset('custom');
                  }}
                >
                  <SelectTrigger data-testid="select-mood">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.moods?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id
                          .split('_')
                          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ')}
                      </SelectItem>
                    )) || (
                      <>
                        <SelectItem value="ironic_to_warm">Ironic to Warm</SelectItem>
                        <SelectItem value="tense_to_hopeful">Tense to Hopeful</SelectItem>
                        <SelectItem value="playful">Playful Throughout</SelectItem>
                        <SelectItem value="reflective">Reflective</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Setting Approach</Label>
                <Select value={setting} onValueChange={setSetting}>
                  <SelectTrigger data-testid="select-setting">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.settings?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.id.charAt(0).toUpperCase() + s.id.slice(1)}
                      </SelectItem>
                    )) || (
                      <>
                        <SelectItem value="everyday">Everyday Places</SelectItem>
                        <SelectItem value="contrast">Visual Contrasts</SelectItem>
                        <SelectItem value="symbolic">Symbolic Spaces</SelectItem>
                        <SelectItem value="mixed">Mixed Approach</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Film className="h-5 w-5" />
              Visual Style
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Video Style Template</Label>
                <Select value={visualStyle} onValueChange={setVisualStyle}>
                  <SelectTrigger data-testid="select-visual-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {styles.length > 0 ? (
                      styles.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="cinematic">Cinematic Epic</SelectItem>
                        <SelectItem value="gritty">Street Cypher</SelectItem>
                        <SelectItem value="debate_stage">Debate Stage</SelectItem>
                        <SelectItem value="news_montage">News Montage</SelectItem>
                        <SelectItem value="motion_graphics">Motion Graphics</SelectItem>
                        <SelectItem value="documentary">Documentary</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>v2.0 Visual Tone</Label>
                <Select
                  value={visualStyleV2}
                  onValueChange={(v) => {
                    setVisualStyleV2(v);
                    setSelectedPreset('custom');
                  }}
                >
                  <SelectTrigger data-testid="select-visual-style-v2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.visualStyles?.map((vs) => (
                      <SelectItem key={vs.id} value={vs.id}>
                        {vs.id.charAt(0).toUpperCase() + vs.id.slice(1)}
                      </SelectItem>
                    )) || (
                      <>
                        <SelectItem value="cinematic">Cinematic</SelectItem>
                        <SelectItem value="comedic">Comedic</SelectItem>
                        <SelectItem value="documentary">Documentary</SelectItem>
                        <SelectItem value="symbolic">Symbolic</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {styles.find((s) => s.id === visualStyle) && (
              <p className="text-xs text-muted-foreground">{styles.find((s) => s.id === visualStyle)?.description}</p>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <Label className="text-base font-medium">Style Preset</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Controls the overall aesthetic, lighting, and vibe of generated VEO clips
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'comedy_meme',
                    label: 'Comedy/Meme',
                    emoji: '😂',
                    desc: 'Nathan For You vibes, absurdist, food-forward',
                  },
                  {
                    id: 'wholesome',
                    label: 'Wholesome',
                    emoji: '🤗',
                    desc: 'Warm lighting, genuine moments, family-friendly',
                  },
                  { id: 'corporate', label: 'Corporate', emoji: '💼', desc: 'Clean, professional, stock footage feel' },
                  {
                    id: 'indie_raw',
                    label: 'Indie/Raw',
                    emoji: '🎬',
                    desc: 'Handheld, gritty, authentic documentary style',
                  },
                  { id: 'horror', label: 'Horror', emoji: '👻', desc: 'Dark shadows, tension, unsettling atmosphere' },
                  { id: 'documentary', label: 'Documentary', emoji: '🎞️', desc: 'BBC/Netflix historical epic style' },
                ].map((preset) => (
                  <Button
                    key={preset.id}
                    variant={stylePreset === preset.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStylePreset(preset.id)}
                    className="flex flex-col h-auto py-3 gap-1"
                    data-testid={`button-style-preset-${preset.id}`}
                  >
                    <span className="text-lg">{preset.emoji}</span>
                    <span className="text-xs font-medium">{preset.label}</span>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground italic">
                {stylePreset === 'comedy_meme' &&
                  '🍕🌮 Food is the star! Deadpan delivery, absurdist poses, warm kitchen lighting.'}
                {stylePreset === 'wholesome' && '☀️ Golden hour lighting, genuine smiles, cozy environments.'}
                {stylePreset === 'corporate' && '📊 Clean compositions, neutral colors, professional lighting.'}
                {stylePreset === 'indie_raw' && '🎥 Handheld camera, natural lighting, gritty authenticity.'}
                {stylePreset === 'horror' && '🌙 Deep shadows, blue/cyan tones, subtle unease.'}
                {stylePreset === 'documentary' &&
                  '🎞️ Epic crane shots, period lighting, BBC/Netflix historical drama aesthetic.'}
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sword className="h-4 w-4 text-primary" />
                <Label className="text-base font-medium">VS Battle Mode</Label>
                <Badge variant={battleMode ? 'default' : 'secondary'} className="ml-2">
                  {battleMode ? 'ENABLED' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant={battleMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBattleMode(!battleMode)}
                  data-testid="button-battle-mode"
                >
                  <Sword className="h-4 w-4 mr-1" />
                  {battleMode ? 'Battle Mode ON' : 'Enable Battle Mode'}
                </Button>
              </div>
              {battleMode && (
                <div className="p-3 bg-muted border border-border rounded-lg">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <Sword className="h-3 w-3" />
                    EPIC WARRIORS MODE: Characters become themed warriors in armor!
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    For VS topics like "pizza vs tacos": Creates Pizza Paladin in cheese plate armor fighting Taco
                    Knight with salsa blade! Full combat sequences with weapon clashes.
                  </p>
                </div>
              )}
              {!battleMode && (
                <p className="text-xs text-muted-foreground">
                  Enable for VS topics (e.g., "pizza vs tacos") to create epic warrior battles with themed armor and
                  weapons
                </p>
              )}
            </div>

            <Separator />

            <div className="flex items-center gap-4 flex-wrap">
              <Label>Aspect Ratio:</Label>
              <div className="flex gap-2">
                <Button
                  variant={vertical ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setVertical(true)}
                  data-testid="button-vertical"
                >
                  9:16 Vertical
                </Button>
                <Button
                  variant={!vertical ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setVertical(false)}
                  data-testid="button-landscape"
                >
                  16:9 Landscape
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced">
            <AccordionTrigger>Advanced Options</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Number of Characters
                </Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[characterCount]}
                    onValueChange={(v) => setCharacterCount(v[0])}
                    min={1}
                    max={6}
                    step={1}
                    className="flex-1"
                    data-testid="slider-character-count"
                  />
                  <Badge variant="secondary" className="min-w-[3rem] justify-center">
                    {characterCount} {characterCount === 1 ? 'person' : 'people'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Named characters like Mike, Danielle, Jenny with specific humanizing details
                </p>
              </div>
              <div className="space-y-2">
                <Label>Custom Bars (one per line)</Label>
                <Textarea
                  placeholder="Add your own lines to include..."
                  value={customBars}
                  onChange={(e) => setCustomBars(e.target.value)}
                  rows={3}
                  data-testid="input-custom-bars"
                />
              </div>
              <div className="space-y-2">
                <Label>Terms to Avoid (comma separated)</Label>
                <Input
                  placeholder="e.g., fight, hate, enemy"
                  value={avoidTerms}
                  onChange={(e) => setAvoidTerms(e.target.value)}
                  data-testid="input-avoid-terms"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex items-center gap-2 mb-2">
          <Checkbox
            id="auto-veo"
            checked={autoGenerateVeo}
            onCheckedChange={(checked) => setAutoGenerateVeo(checked === true)}
            data-testid="checkbox-auto-veo"
          />
          <Label htmlFor="auto-veo" className="text-sm cursor-pointer">
            Auto-generate VEO videos after pipeline (~$20/min)
          </Label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            className="h-12"
            variant="outline"
            onClick={() => generateMutation.mutate()}
            disabled={!canGenerate || generateMutation.isPending || fullPipelineMutation.isPending}
            data-testid="button-generate-package"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Layers className="h-5 w-5 mr-2" />
                Package Only
              </>
            )}
          </Button>

          <Button
            className="h-12"
            onClick={() => fullPipelineMutation.mutate()}
            disabled={!canGenerate || generateMutation.isPending || fullPipelineMutation.isPending}
            data-testid="button-full-pipeline"
          >
            {fullPipelineMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Full Pipeline...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5 mr-2" />
                {autoGenerateVeo ? 'Full Pipeline + VEO' : 'Full Auto Pipeline'}
              </>
            )}
          </Button>
        </div>

        {fullPipelineMutation.isPending && (
          <div className="text-center text-sm text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
            Generating package, sending to Suno, analyzing with Librosa, enhancing VEO prompts...
            <br />
            <span className="text-xs">This may take 3-5 minutes</span>
          </div>
        )}
      </div>

      <div className="col-span-7">
        {contentPackage ? (
          <ContentPackageDisplay
            contentPackage={contentPackage}
            copyToClipboard={copyToClipboard}
            vertical={vertical}
          />
        ) : (
          <Card className="h-full">
            <CardContent className="flex flex-col items-center justify-center h-[600px] text-center">
              <Layers className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Package Generated Yet</h3>
              <p className="text-muted-foreground max-w-md">
                Fill in your topic and message, then click "Generate Complete Package" to create lyrics, Suno style
                tags, character cast, and VEO prompts - all synchronized.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ContentPackageDisplay({
  contentPackage,
  copyToClipboard,
  vertical,
}: {
  contentPackage: ContentPackage;
  copyToClipboard: (text: string, label: string) => void;
  vertical: boolean;
}) {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('overview');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Suno API integration state
  const [sunoTaskId, setSunoTaskId] = useState<string | null>(null);
  const [sunoStatus, setSunoStatus] = useState<'idle' | 'generating' | 'complete' | 'error'>('idle');
  const [sunoProgress, setSunoProgress] = useState<string>('');
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const MAX_POLL_ATTEMPTS = 60; // 5 minutes max (60 * 5 seconds)

  // Query Suno API status and credits
  const { data: sunoStatusResponse, isError: sunoStatusError } = useQuery<{
    success: boolean;
    data: { configured: boolean; credits?: number };
  }>({
    queryKey: ['/api/suno/status'],
    refetchInterval: false,
  });

  // Extract data from wrapped response
  const sunoConfigured = sunoStatusResponse?.data?.configured ?? false;
  const sunoCredits = sunoStatusResponse?.data?.credits;

  useEffect(() => {
    setIsSaved(false);
  }, [contentPackage.metadata.generatedAt]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  // Clear polling and reset state helper
  const clearPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    setPollCount(0);
  };

  // Poll for Suno task completion
  const pollSunoStatus = async (taskId: string) => {
    try {
      // Check max poll attempts
      setPollCount((prev) => {
        const newCount = prev + 1;
        if (newCount >= MAX_POLL_ATTEMPTS) {
          setSunoStatus('error');
          setSunoProgress('Generation timed out after 5 minutes. Try again.');
          clearPolling();
          toast({
            title: 'Generation Timeout',
            description: 'Music generation took too long. Please try again.',
            variant: 'destructive',
          });
        }
        return newCount;
      });

      const response = await fetch(`/api/suno/status/${taskId}`);
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        if (data.status === 'complete') {
          if (!data.tracks || data.tracks.length === 0) {
            setSunoStatus('error');
            setSunoProgress('Generation completed but no tracks returned');
            clearPolling();
            return;
          }

          // Generation complete - download the audio
          setSunoProgress('Downloading audio...');

          // Get the first track
          const track = data.tracks[0];
          if (!track.audio_url) {
            setSunoStatus('error');
            setSunoProgress('Track missing audio URL');
            clearPolling();
            return;
          }

          const downloadResponse = await fetch('/api/suno/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioUrl: track.audio_url,
              trackIndex: 0,
            }),
          });

          if (!downloadResponse.ok) {
            throw new Error('Download request failed');
          }

          const downloadData = await downloadResponse.json();

          if (downloadData.success && downloadData.audioPath) {
            // Fetch the audio file and set it
            const audioResponse = await fetch(downloadData.audioPath);
            if (!audioResponse.ok) {
              throw new Error('Failed to fetch downloaded audio');
            }

            const blob = await audioResponse.blob();
            const file = new File([blob], `suno_${Date.now()}.mp3`, { type: 'audio/mpeg' });

            setAudioFile(file);
            setAudioUrl(downloadData.audioPath);
            setSunoStatus('complete');
            setSunoProgress('');
            clearPolling();

            toast({
              title: 'Music Generated',
              description: 'Your Suno music has been generated and is ready to use!',
            });
          } else {
            throw new Error(downloadData.error || 'Download failed');
          }
        } else if (data.status === 'failed') {
          setSunoStatus('error');
          setSunoProgress('Generation failed on Suno servers');
          clearPolling();

          toast({
            title: 'Generation Failed',
            description: 'Suno music generation failed. Please try again.',
            variant: 'destructive',
          });
        } else {
          // Still processing
          const trackCount = data.tracks?.length || 0;
          setSunoProgress(`Status: ${data.status}... ${trackCount > 0 ? `(${trackCount} tracks found)` : ''}`);
        }
      } else {
        // API returned success: false
        console.error('Suno status check error:', data.error);
      }
    } catch (error: any) {
      console.error('Error polling Suno status:', error);
      // Don't fail immediately on network errors - continue polling
      setSunoProgress(`Checking status... (attempt ${pollCount})`);
    }
  };

  // Suno generation mutation
  const sunoGenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/suno/generate', {
        lyrics: contentPackage.lyrics.raw,
        style: contentPackage.sunoStyleTags.fullStyleString,
        title: contentPackage.metadata.topic,
        model: 'V4',
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.taskId) {
        setSunoTaskId(data.taskId);
        setSunoStatus('generating');
        setSunoProgress('Starting generation...');

        // Start polling for completion
        const interval = setInterval(() => {
          pollSunoStatus(data.taskId);
        }, 5000);
        setPollInterval(interval);

        toast({
          title: 'Generation Started',
          description: 'Suno is generating your music. This may take 1-2 minutes.',
        });
      } else {
        throw new Error(data.error || 'Failed to start generation');
      }
    },
    onError: (error: Error) => {
      setSunoStatus('error');
      setSunoProgress('');
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleAudioUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    }
  };

  const removeAudio = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioFile(null);
    setAudioUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const packageData = {
        metadata: {
          topic: contentPackage.metadata.topic,
          generatedAt: contentPackage.metadata.generatedAt,
          version: '2.0',
          targetPlatform: 'YouTube Shorts / TikTok',
          visualStyleV2: contentPackage.metadata.visualStyleV2 || 'cinematic',
          setting: contentPackage.metadata.setting || 'symbolic',
          voice: 'observational',
          energy: 'building',
          mood: 'hopeful-realistic',
        },
        timing: {
          totalSyllables: contentPackage.timing.totalSyllables,
          totalBeats: contentPackage.timing.totalBeats,
          estimatedDurationSeconds: contentPackage.timing.totalDurationSeconds,
          formattedDuration: contentPackage.timing.formattedDuration,
          bpm: contentPackage.timing.bpm,
          syllablesPerBeat: contentPackage.timing.syllablesPerBeat,
          sectionsBreakdown: contentPackage.timing.sections.map((s) => ({
            section: s.name,
            lines: s.lineCount,
            syllables: s.syllableCount,
            durationSeconds: s.estimatedDurationSeconds,
            clipCount: s.veoClipsNeeded,
          })),
          totalVeoClips: contentPackage.timing.totalVeoClips,
          estimatedVeoCost: contentPackage.timing.estimatedVeoCost,
          warnings: contentPackage.timing.warnings,
          recommendations: contentPackage.timing.recommendations,
        },
        lyrics: {
          raw: contentPackage.lyrics.raw,
          sections: Object.entries(contentPackage.lyrics.sections).map(([type, content]) => ({
            type,
            content,
          })),
        },
        sunoStyleTags: contentPackage.sunoStyleTags,
        characterCast: contentPackage.characterCast,
        aspectRatio: vertical ? '9:16' : '16:9',
        veoPrompts: contentPackage.veoPrompts.map((p, i) => ({
          clipNumber: i + 1,
          section: p.sectionName,
          lyricSnippet: '',
          prompt: p.fullPrompt,
          duration: p.durationSeconds,
          shotType: p.camera.shotType,
        })),
      };

      // Save the package first
      const response = await apiRequest('POST', '/api/unity/packages', {
        title: contentPackage.metadata.topic,
        topic: contentPackage.metadata.topic,
        packageData,
        audioFileName: audioFile?.name || null,
        audioFileSize: audioFile?.size || null,
        status: audioFile ? 'audio_ready' : 'draft',
      });
      const result = await response.json();

      // If there's an audio file, upload it to the package
      if (result.success && audioFile && result.data?.id) {
        const formData = new FormData();
        formData.append('audio', audioFile);

        const audioResponse = await fetch(`/api/unity/packages/${result.data.id}/audio`, {
          method: 'POST',
          body: formData,
        });

        if (!audioResponse.ok) {
          console.warn('Audio upload failed, but package was saved');
        }
      }

      return result;
    },
    onSuccess: (data) => {
      if (data.success) {
        setIsSaved(true);
        toast({
          title: 'Package Saved',
          description: audioFile
            ? 'Your content package and audio have been saved.'
            : 'Your content package has been saved successfully.',
        });
        queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save package',
        variant: 'destructive',
      });
    },
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Content Package</CardTitle>
            <CardDescription>{contentPackage.metadata.topic}</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {contentPackage.timing.formattedDuration}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Film className="h-3 w-3" />
              {contentPackage.timing.totalVeoClips} clips
            </Badge>
            <Badge variant="outline" className="gap-1">
              <DollarSign className="h-3 w-3" />
              ~${contentPackage.timing.estimatedVeoCost}
            </Badge>
            <Button
              variant={isSaved ? 'secondary' : 'default'}
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || isSaved}
              className="gap-1"
              data-testid="button-save-package"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSaved ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaved ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeSection} onValueChange={setActiveSection}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
            <TabsTrigger value="suno">Suno Tags</TabsTrigger>
            <TabsTrigger value="audio" className="gap-1">
              <Volume2 className="h-3 w-3" />
              Audio
            </TabsTrigger>
            <TabsTrigger value="characters">Cast</TabsTrigger>
            <TabsTrigger value="veo">Kling Prompts</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] mt-4">
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{contentPackage.timing.formattedDuration}</div>
                    <div className="text-sm text-muted-foreground">Total Duration</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{contentPackage.timing.totalVeoClips}</div>
                    <div className="text-sm text-muted-foreground">VEO Clips Needed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">${contentPackage.timing.estimatedVeoCost}</div>
                    <div className="text-sm text-muted-foreground">Est. VEO Cost</div>
                  </CardContent>
                </Card>
              </div>

              {/* v2.0 Style Settings */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    v2.0 Style Settings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">Visual Style</Label>
                      <p className="font-medium capitalize">{contentPackage.metadata.visualStyle}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Visual Tone (v2.0)</Label>
                      <p className="font-medium capitalize">{contentPackage.metadata.visualStyleV2 || 'cinematic'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Setting Approach</Label>
                      <p className="font-medium capitalize">{contentPackage.metadata.setting || 'everyday'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Section Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {contentPackage.timing.sections.map((section, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {section.type}
                          </Badge>
                          <span className="font-medium">{section.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span>{section.lineCount} lines</span>
                          <span>{section.syllableCount} syllables</span>
                          <span>{section.estimatedDurationSeconds}s</span>
                          <Badge variant="outline">{section.veoClipsNeeded} clips</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {contentPackage.timing.warnings.length > 0 && (
                <Card className="border-yellow-500/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div className="space-y-1">
                        {contentPackage.timing.warnings.map((w, i) => (
                          <p key={i} className="text-sm">
                            {w}
                          </p>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {contentPackage.timing.recommendations.length > 0 && (
                <Card className="border-blue-500/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div className="space-y-1">
                        {contentPackage.timing.recommendations.map((r, i) => (
                          <p key={i} className="text-sm">
                            {r}
                          </p>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="lyrics" className="space-y-4">
              <div className="flex items-center justify-between gap-2 mb-4">
                <Label>Full Lyrics</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(contentPackage.lyrics.raw, 'Lyrics')}
                  data-testid="button-copy-lyrics"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All
                </Button>
              </div>
              <Textarea
                value={contentPackage.lyrics.raw}
                readOnly
                className="h-[400px] font-mono text-sm"
                data-testid="textarea-lyrics"
              />
            </TabsContent>

            <TabsContent value="suno" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Music className="h-4 w-4" />
                      Style of Music (for Suno)
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(contentPackage.sunoStyleTags.fullStyleString, 'Suno style tags')}
                      data-testid="button-copy-suno-style"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre
                    className="bg-muted/50 p-4 rounded-md text-sm whitespace-pre-wrap font-mono"
                    data-testid="text-suno-style"
                  >
                    {contentPackage.sunoStyleTags.fullStyleString}
                  </pre>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <Label className="text-xs text-muted-foreground">Genre</Label>
                    <p className="font-medium">{contentPackage.sunoStyleTags.genre}</p>
                    <p className="text-sm text-muted-foreground">{contentPackage.sunoStyleTags.subgenre}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <Label className="text-xs text-muted-foreground">Vocals</Label>
                    <p className="font-medium">{contentPackage.sunoStyleTags.vocals}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Instruments</Label>
                <div className="flex flex-wrap gap-1">
                  {contentPackage.sunoStyleTags.instruments.map((inst, i) => (
                    <Badge key={i} variant="secondary">
                      {inst}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Production</Label>
                <div className="flex flex-wrap gap-1">
                  {contentPackage.sunoStyleTags.production.map((prod, i) => (
                    <Badge key={i} variant="outline">
                      {prod}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Mood</Label>
                <div className="flex flex-wrap gap-1">
                  {contentPackage.sunoStyleTags.mood.map((m, i) => (
                    <Badge key={i} variant="outline">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator className="my-4" />

              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Generate Music with Suno API
                  </CardTitle>
                  <CardDescription>Generate music directly without leaving this page</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!sunoConfigured ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Suno API key not configured. Add SUNO_API_KEY to your secrets.
                    </div>
                  ) : sunoStatus === 'generating' ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <div>
                          <p className="font-medium">Generating Music...</p>
                          <p className="text-sm text-muted-foreground">{sunoProgress || 'Please wait...'}</p>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary animate-pulse w-2/3 rounded-full" />
                      </div>
                      <p className="text-xs text-muted-foreground">This usually takes 1-2 minutes</p>
                    </div>
                  ) : sunoStatus === 'complete' ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Music generated! Check the Audio tab to preview.
                    </div>
                  ) : sunoStatus === 'error' ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-red-500">
                        <AlertTriangle className="h-4 w-4" />
                        {sunoProgress || 'Generation failed. Please try again.'}
                      </div>
                      <Button
                        onClick={() => {
                          setSunoStatus('idle');
                          setSunoProgress('');
                          clearPolling();
                        }}
                        variant="outline"
                        size="sm"
                        data-testid="button-retry-suno"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Try Again
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        Click below to generate a music track using the lyrics and style tags above.
                        {sunoCredits !== undefined && <span className="ml-2 text-xs">(Credits: {sunoCredits})</span>}
                      </div>
                      <Button
                        onClick={() => sunoGenerateMutation.mutate()}
                        disabled={sunoGenerateMutation.isPending}
                        className="w-full gap-2"
                        data-testid="button-generate-suno"
                      >
                        {sunoGenerateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Music className="h-4 w-4" />
                        )}
                        Generate Music with Suno
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audio" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileAudio className="h-4 w-4" />
                    Suno MP3 Upload
                  </CardTitle>
                  <CardDescription>Upload your Suno-generated MP3 to preview with the video timing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!audioFile ? (
                    <div
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover-elevate transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="upload-audio-dropzone"
                    >
                      <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-sm text-muted-foreground mb-2">Click to upload your Suno MP3</p>
                      <p className="text-xs text-muted-foreground">MP3, WAV, or other audio formats</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleAudioUpload}
                        data-testid="input-audio-file"
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileAudio className="h-8 w-8 text-primary" />
                          <div>
                            <p className="font-medium text-sm">{audioFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={removeAudio} data-testid="button-remove-audio">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Audio Player</Label>
                        <audio
                          ref={audioRef}
                          src={audioUrl || undefined}
                          controls
                          className="w-full"
                          data-testid="audio-player"
                        />
                      </div>

                      <Card className="bg-muted/30">
                        <CardContent className="pt-4">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <Label className="text-xs text-muted-foreground">Target Duration</Label>
                              <p className="font-medium">{contentPackage.timing.formattedDuration}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">BPM</Label>
                              <p className="font-medium">{contentPackage.sunoStyleTags.bpm}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Total Clips</Label>
                              <p className="font-medium">{contentPackage.timing.totalVeoClips}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Button className="w-full gap-2" size="lg" data-testid="button-generate-veo">
                        <Video className="h-5 w-5" />
                        Generate VEO Video ({contentPackage.timing.totalVeoClips} clips - ~$
                        {contentPackage.timing.estimatedVeoCost})
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Workflow</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>
                      Copy the <span className="font-medium text-foreground">Suno Tags</span> to generate your song
                    </li>
                    <li>
                      Copy the <span className="font-medium text-foreground">Lyrics</span> to Suno's lyrics field
                    </li>
                    <li>Generate the song in Suno</li>
                    <li>Download the MP3 and upload it here</li>
                    <li>
                      Click <span className="font-medium text-foreground">Generate VEO</span> to create video clips
                    </li>
                    <li>Videos sync automatically to the audio timeline</li>
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="characters" className="space-y-4">
              <div className="flex items-center justify-between gap-2 mb-4">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Character Cast ({contentPackage.characterCast.length})
                </Label>
              </div>

              {contentPackage.characterCast.map((char, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">
                        {char.name ? `${char.name} (ID ${char.id})` : `Character ${char.id}`}
                      </CardTitle>
                      <Badge variant="secondary">{char.role}</Badge>
                    </div>
                    {char.humanizingDetail && (
                      <CardDescription className="text-xs italic">"{char.humanizingDetail}"</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground">Age</Label>
                        <p>{char.age} years old</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Gender</Label>
                        <p className="capitalize">{char.gender}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Vibe</Label>
                        <p>{char.vibe}</p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Appearance</Label>
                      <p className="text-sm">{char.appearance}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Wardrobe</Label>
                      <p className="text-sm">{char.wardrobeBase}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        const charName = char.name || `Character ${char.id}`;
                        const charText = `${charName}: ${char.age}yo ${char.gender}, ${char.appearance}. Wardrobe: ${char.wardrobeBase}. Vibe: ${char.vibe}. Role: ${char.role}.${char.humanizingDetail ? ` (${char.humanizingDetail})` : ''}`;
                        navigator.clipboard.writeText(charText);
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Character Description
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="veo" className="space-y-4">
              <div className="flex items-center justify-between gap-2 mb-4">
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Kling Prompts ({contentPackage.veoPrompts.length} sections)
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allPrompts = contentPackage.veoPrompts
                      .map((p) => `[${p.sectionName}]\n${p.fullPrompt}`)
                      .join('\n\n---\n\n');
                    navigator.clipboard.writeText(allPrompts);
                  }}
                  data-testid="button-copy-all-veo"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All
                </Button>
              </div>

              {contentPackage.veoPrompts.map((prompt, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">{prompt.sectionName}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{Math.round(prompt.durationSeconds)}s</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigator.clipboard.writeText(prompt.fullPrompt)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <pre className="bg-muted/50 p-3 rounded-md text-xs whitespace-pre-wrap font-mono">
                      {prompt.fullPrompt}
                    </pre>

                    <Accordion type="single" collapsible>
                      <AccordionItem value="details">
                        <AccordionTrigger className="text-xs">View Details</AccordionTrigger>
                        <AccordionContent className="space-y-3 text-xs">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs text-muted-foreground">Scene</Label>
                              <p>{String(prompt.sceneDetails?.location || '')}</p>
                              <p className="text-muted-foreground">{String(prompt.sceneDetails?.timeOfDay || '')}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Camera</Label>
                              <p>{String(prompt.camera?.shotType || '')}</p>
                              <p className="text-muted-foreground">{String(prompt.camera?.movement || '')}</p>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Lighting</Label>
                            <p>
                              {String(prompt.lighting?.keyLight || '')} - {String(prompt.lighting?.mood || '')}
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Beat Sync</Label>
                            <div className="space-y-1">
                              {prompt.beatSync?.timings?.map((t: any, j: number) => (
                                <div key={j} className="flex gap-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {typeof t.seconds === 'object'
                                      ? JSON.stringify(t.seconds)
                                      : String(t.seconds || '')}
                                  </Badge>
                                  <span>
                                    {typeof t.action === 'object' ? JSON.stringify(t.action) : String(t.action || '')}
                                  </span>
                                </div>
                              )) || <p className="text-muted-foreground">No timing data</p>}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function OutputPackage() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center h-64 text-center">
        <Film className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Output Package View</h3>
        <p className="text-muted-foreground">
          Generate content first, then switch to this tab for a focused view of outputs.
        </p>
      </CardContent>
    </Card>
  );
}

function RhymeTools() {
  const { toast } = useToast();
  const [searchWord, setSearchWord] = useState('');

  const { data: rhymeData } = useQuery<{ success: boolean; data: any }>({
    queryKey: ['/api/unity/rhyme-data'],
  });

  const searchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', `/api/unity/rhymes/${encodeURIComponent(searchWord)}`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Rhymes Found',
          description: `Found ${data.data.rhymes?.length || 0} rhymes`,
        });
      }
    },
  });

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Rhyme Lookup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Find Rhymes</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter a word..."
                  value={searchWord}
                  onChange={(e) => setSearchWord(e.target.value)}
                  data-testid="input-rhyme-search"
                />
                <Button
                  onClick={() => searchMutation.mutate()}
                  disabled={!searchWord || searchMutation.isPending}
                  data-testid="button-search-rhymes"
                >
                  {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                </Button>
              </div>
            </div>

            {searchMutation.data?.success && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Results</Label>
                <div className="flex flex-wrap gap-1">
                  {searchMutation.data.data.rhymes?.map((r: string, i: number) => (
                    <Badge key={i} variant="secondary">
                      {r}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="col-span-8">
        <Card>
          <CardHeader>
            <CardTitle>Unity Rhyme Families</CardTitle>
            <CardDescription>Pre-built rhyme stacks for unity themes</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {rhymeData?.data?.families && (
                <div className="space-y-4">
                  {Object.entries(rhymeData.data.families as Record<string, any>).map(([key, family]) => (
                    <div key={key} className="border-b pb-4 last:border-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-medium capitalize">{family.name || key}</span>
                        <Badge variant="outline" className="text-xs">
                          {family.theme}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {family.rhymes?.slice(0, 10).map((r: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {r}
                          </Badge>
                        ))}
                        {family.rhymes?.length > 10 && (
                          <Badge variant="outline" className="text-xs">
                            +{family.rhymes.length - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface SavedPackageData {
  id: string;
  title: string;
  topic: string;
  packageData: any;
  audioFileName: string | null;
  audioFileSize: number | null;
  audioFilePath: string | null;
  status: string;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

function SavedPackages() {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<SavedPackageData | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<SavedPackageData | null>(null);

  const { data: packagesData, isLoading } = useQuery<{ success: boolean; data: SavedPackageData[] }>({
    queryKey: ['/api/unity/packages'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/unity/packages/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Package Deleted',
        description: 'The content package has been removed.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
      setDeleteDialogOpen(false);
      setPackageToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete package',
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (pkg: SavedPackageData) => {
    setPackageToDelete(pkg);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (packageToDelete) {
      deleteMutation.mutate(packageToDelete.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'audio_ready':
        return <Badge className="bg-green-500/20 text-green-500">Audio Ready</Badge>;
      case 'generating':
        return <Badge className="bg-yellow-500/20 text-yellow-500">Generating</Badge>;
      case 'completed':
        return <Badge className="bg-blue-500/20 text-blue-500">Completed</Badge>;
      default:
        return <Badge variant="secondary">Draft</Badge>;
    }
  };

  const packages = packagesData?.data || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (packages.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-64 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Saved Packages</h3>
          <p className="text-muted-foreground">Generate content and save it to see your packages here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Saved Packages ({packages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPackage?.id === pkg.id ? 'border-primary bg-primary/5' : 'hover-elevate'
                      }`}
                      onClick={() => setSelectedPackage(pkg)}
                      data-testid={`saved-package-${pkg.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{pkg.title}</p>
                          <p className="text-sm text-muted-foreground truncate">{pkg.topic}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {getStatusBadge(pkg.status)}
                            {pkg.audioFileName && (
                              <Badge variant="outline" className="gap-1 text-xs">
                                <Volume2 className="h-3 w-3" />
                                Audio
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">{formatDate(pkg.updatedAt)}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(pkg);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selectedPackage ? (
            <SavedPackageDetail package={selectedPackage} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <ExternalLink className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Select a Package</h3>
                <p className="text-muted-foreground">Click on a package to view its details and generate videos.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{packageToDelete?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SavedPackageDetail({ package: pkg }: { package: SavedPackageData }) {
  const { toast } = useToast();
  const packageData = pkg.packageData;
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingVeo, setIsGeneratingVeo] = useState(false);
  const [isGeneratingKling, setIsGeneratingKling] = useState(false);
  const [veoProgress, setVeoProgress] = useState(0);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<'9:16' | '16:9'>(
    (packageData?.aspectRatio as '9:16' | '16:9') || '9:16',
  );
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingKaraoke, setIsGeneratingKaraoke] = useState(false);
  const [selectedKaraokeStyle, setSelectedKaraokeStyle] = useState<'bounce' | 'glow' | 'fire' | 'neon' | 'minimal'>(
    'bounce',
  );
  const [includeKaraokeInVideo, setIncludeKaraokeInVideo] = useState(false);
  const [enableI2V, setEnableI2V] = useState(false);
  const [isGeneratingSuno, setIsGeneratingSuno] = useState(false);
  const [sunoPollingId, setSunoPollingId] = useState<NodeJS.Timeout | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${label} copied to clipboard`,
    });
  };

  const handleGenerateSuno = async () => {
    setIsGeneratingSuno(true);

    toast({
      title: 'Starting Suno Generation',
      description: 'Generating music with Suno AI... This may take 2-5 minutes.',
    });

    try {
      const response = await fetch(`/api/unity/packages/${pkg.id}/generate-suno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.success && result.data?.taskId) {
        toast({
          title: 'Suno Generation Started',
          description: `Task ID: ${result.data.taskId}. Polling for completion...`,
        });

        // Start polling for completion
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await fetch(`/api/unity/packages/${pkg.id}/suno-status`);
            const statusResult = await statusResponse.json();

            if (statusResult.success) {
              if (statusResult.data.status === 'complete') {
                clearInterval(pollInterval);
                setSunoPollingId(null);
                setIsGeneratingSuno(false);

                toast({
                  title: 'Suno Generation Complete!',
                  description: 'Audio has been generated and saved to the package.',
                });

                queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
              } else if (statusResult.data.status === 'failed') {
                clearInterval(pollInterval);
                setSunoPollingId(null);
                setIsGeneratingSuno(false);

                toast({
                  title: 'Suno Generation Failed',
                  description: statusResult.data.error || 'Unknown error occurred',
                  variant: 'destructive',
                });
              }
              // else still processing, continue polling
            }
          } catch (pollError) {
            console.error('Polling error:', pollError);
          }
        }, 10000); // Poll every 10 seconds

        setSunoPollingId(pollInterval);

        // Auto-stop polling after 5 minutes
        setTimeout(() => {
          if (pollInterval) {
            clearInterval(pollInterval);
            setSunoPollingId(null);
            setIsGeneratingSuno(false);
            toast({
              title: 'Suno Generation Timeout',
              description: 'Generation is taking longer than expected. Check back later.',
              variant: 'destructive',
            });
          }
        }, 300000);
      } else {
        throw new Error(result.error || 'Failed to start Suno generation');
      }
    } catch (error: any) {
      setIsGeneratingSuno(false);
      toast({
        title: 'Suno Generation Failed',
        description: error.message || 'Failed to generate audio with Suno',
        variant: 'destructive',
      });
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (sunoPollingId) {
        clearInterval(sunoPollingId);
      }
    };
  }, [sunoPollingId]);

  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('audio/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select an audio file (MP3, WAV, etc.)',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch(`/api/unity/packages/${pkg.id}/audio`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Audio Uploaded',
          description: `${file.name} has been saved to this package.`,
        });
        // Refresh the packages list to show updated audio
        queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload audio file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (audioInputRef.current) {
        audioInputRef.current.value = '';
      }
    }
  };

  const handleRecalculateTiming = async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch(`/api/unity/packages/${pkg.id}/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Timing Recalculated',
          description: `Updated to ${result.data.formattedDuration} with ${result.data.totalVeoClips} clips ($${result.data.estimatedVeoCost.toFixed(2)})`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
      } else {
        throw new Error(result.error || 'Recalculation failed');
      }
    } catch (error: any) {
      toast({
        title: 'Recalculation Failed',
        description: error.message || 'Failed to recalculate timing',
        variant: 'destructive',
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleTranscribe = async () => {
    setIsTranscribing(true);

    toast({
      title: 'Transcribing Audio',
      description: 'Analyzing audio with Whisper for word-level timestamps...',
    });

    try {
      const response = await fetch(`/api/unity/packages/${pkg.id}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alignWithLyrics: true }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Transcription Complete!',
          description: `Found ${result.data.wordCount} words (${result.data.alignedWithLyrics ? 'aligned with lyrics' : 'raw transcription'})`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
      } else {
        throw new Error(result.error || 'Transcription failed');
      }
    } catch (error: any) {
      toast({
        title: 'Transcription Failed',
        description: error.message || 'Failed to transcribe audio',
        variant: 'destructive',
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerateKaraoke = async () => {
    setIsGeneratingKaraoke(true);

    toast({
      title: 'Generating Karaoke Subtitles',
      description: `Creating ${selectedKaraokeStyle} style subtitles with beat sync...`,
    });

    try {
      const response = await fetch(`/api/unity/packages/${pkg.id}/generate-karaoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style: selectedKaraokeStyle,
          videoWidth: selectedAspectRatio === '9:16' ? 1080 : 1920,
          videoHeight: selectedAspectRatio === '9:16' ? 1920 : 1080,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Karaoke Subtitles Generated!',
          description: `${result.data.wordCount} words, ${result.data.beatSyncEnabled ? `${result.data.beatCount} beats synced` : 'no beat sync'}`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
      } else {
        throw new Error(result.error || 'Karaoke generation failed');
      }
    } catch (error: any) {
      toast({
        title: 'Karaoke Generation Failed',
        description: error.message || 'Failed to generate karaoke subtitles',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingKaraoke(false);
    }
  };

  const handleGenerateVeo = async () => {
    if (!packageData?.veoPrompts || packageData.veoPrompts.length === 0) {
      toast({
        title: 'No Kling Prompts',
        description: 'This package has no VEO prompts to generate.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingVeo(true);
    setVeoProgress(0);

    // Calculate estimated cost based on mode
    const clipCount = packageData.timing?.totalVeoClips || packageData.veoPrompts?.length || 0;
    const costPerClip = enableI2V ? 1.6 : 1.2; // I2V is $0.20/s * 8s, Fast is $0.15/s * 8s
    const estimatedCost = clipCount * costPerClip;
    const modeLabel = enableI2V ? 'I2V (character lock)' : 'Fast';

    toast({
      title: 'VEO Generation Started',
      description: `${modeLabel}: ${clipCount} clips (~$${estimatedCost.toFixed(2)}). ${enableI2V ? 'Sequential frame chaining for continuity.' : 'Parallel generation.'}`,
    });

    try {
      const response = await fetch(`/api/unity/packages/${pkg.id}/generate-veo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aspectRatio: selectedAspectRatio,
          includeKaraoke: includeKaraokeInVideo,
          karaokeStyle: selectedKaraokeStyle,
          enableI2V: enableI2V,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'VEO Generation Complete!',
          description: `Generated ${result.data.successfulClips}/${result.data.totalClips} clips ($${result.data.totalCost.toFixed(2)})`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
      } else {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (error: any) {
      toast({
        title: 'VEO Generation Failed',
        description: error.message || 'Failed to generate VEO clips',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingVeo(false);
      setVeoProgress(0);
    }
  };

  const handleGenerateKling = async () => {
    if (!packageData?.veoPrompts || packageData.veoPrompts.length === 0) {
      toast({
        title: 'No Kling Prompts',
        description: 'This package has no VEO prompts to generate.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingKling(true);

    const clipCount = packageData.timing?.totalVeoClips || packageData.veoPrompts?.length || 0;
    const costPerClip = 0.14; // Kling/Runway is ~$0.14/5s clip
    const estimatedCost = clipCount * costPerClip;

    toast({
      title: 'Kling (Runway) Generation Started',
      description: `Generating ${clipCount} clips via kie.ai (~$${estimatedCost.toFixed(2)})`,
    });

    try {
      const response = await fetch(`/api/unity/packages/${pkg.id}/generate-veo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aspectRatio: selectedAspectRatio,
          includeKaraoke: includeKaraokeInVideo,
          karaokeStyle: selectedKaraokeStyle,
          enableI2V: false,
          videoEngine: 'kling',
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Kling Generation Complete!',
          description: `Generated ${result.data.successfulClips}/${result.data.totalClips} clips ($${result.data.totalCost.toFixed(2)})`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/unity/packages'] });
      } else {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (error: any) {
      toast({
        title: 'Kling Generation Failed',
        description: error.message || 'Failed to generate Kling clips',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingKling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{pkg.title}</CardTitle>
            <CardDescription>{pkg.topic}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {pkg.audioFilePath ? (
              <Badge className="bg-green-500/20 text-green-500 gap-1">
                <Volume2 className="h-3 w-3" />
                {pkg.audioFileName}
              </Badge>
            ) : (
              <>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                  data-testid="input-audio-upload-saved"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isUploading || isGeneratingSuno}
                  data-testid="button-upload-audio-saved"
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isUploading ? 'Uploading...' : 'Add Audio'}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1"
                  onClick={handleGenerateSuno}
                  disabled={isGeneratingSuno || isUploading}
                  data-testid="button-generate-suno"
                >
                  {isGeneratingSuno ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Music className="h-4 w-4" />
                      Generate Suno
                    </>
                  )}
                </Button>
              </>
            )}
            <div className="flex items-center gap-1 border rounded-md">
              <Button
                variant={selectedAspectRatio === '9:16' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedAspectRatio('9:16')}
                className="rounded-r-none"
                data-testid="button-aspect-9-16"
              >
                9:16
              </Button>
              <Button
                variant={selectedAspectRatio === '16:9' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedAspectRatio('16:9')}
                className="rounded-l-none"
                data-testid="button-aspect-16-9"
              >
                16:9
              </Button>
            </div>
            {/* I2V Mode Toggle */}
            <div
              className={`flex items-center gap-2 border rounded-md px-2 py-1 ${enableI2V ? 'border-primary bg-primary/10' : ''}`}
              title="I2V mode uses frame chaining for character consistency. Slower ($1.60/clip) but maintains visual continuity between clips."
            >
              <label className="flex items-center gap-2 cursor-pointer" data-testid="toggle-i2v">
                <input
                  type="checkbox"
                  checked={enableI2V}
                  onChange={(e) => setEnableI2V(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                  data-testid="checkbox-enable-i2v"
                />
                <span className="text-sm">
                  I2V
                  {enableI2V && <span className="text-xs text-muted-foreground ml-1">($1.60/clip)</span>}
                </span>
              </label>
            </div>
            {/* Karaoke Toggle - auto-transcribes if not already done */}
            <div
              className={`flex items-center gap-2 border rounded-md px-2 py-1 ${includeKaraokeInVideo ? 'border-yellow-500/50 bg-yellow-500/10' : ''}`}
              title={
                packageData?.whisperTranscription
                  ? `Karaoke ready: ${packageData.whisperTranscription.wordCount} words transcribed`
                  : 'Will auto-transcribe audio when video generation starts'
              }
            >
              <label className="flex items-center gap-2 cursor-pointer" data-testid="toggle-karaoke">
                <input
                  type="checkbox"
                  checked={includeKaraokeInVideo}
                  onChange={(e) => setIncludeKaraokeInVideo(e.target.checked)}
                  className="h-4 w-4 accent-yellow-500"
                  disabled={!pkg.audioFilePath}
                  data-testid="checkbox-include-karaoke"
                />
                <span className="text-sm">
                  Karaoke
                  {!packageData?.whisperTranscription && includeKaraokeInVideo && (
                    <span className="text-[10px] text-yellow-600 ml-1">(auto)</span>
                  )}
                </span>
              </label>
              {includeKaraokeInVideo && (
                <select
                  value={selectedKaraokeStyle}
                  onChange={(e) => setSelectedKaraokeStyle(e.target.value as any)}
                  className="text-xs bg-transparent border-0 focus:ring-0 cursor-pointer"
                  data-testid="select-karaoke-style-veo"
                >
                  <option value="bounce">Bounce</option>
                  <option value="glow">Glow</option>
                  <option value="fire">Fire</option>
                  <option value="neon">Neon</option>
                  <option value="minimal">Minimal</option>
                </select>
              )}
            </div>
            <Button
              variant="default"
              className="gap-2"
              onClick={handleGenerateVeo}
              disabled={isGeneratingVeo || isGeneratingKling || pkg.status === 'generating'}
              data-testid="button-generate-veo-saved"
            >
              {isGeneratingVeo || pkg.status === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  VEO...
                </>
              ) : packageData?.generatedClips?.length > 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  VEO
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" />
                  VEO
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
              onClick={handleGenerateKling}
              disabled={isGeneratingKling || isGeneratingVeo || pkg.status === 'generating'}
              data-testid="button-generate-kling-saved"
            >
              {isGeneratingKling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kling...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Kling
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
            <TabsTrigger value="prompts">Kling Prompts</TabsTrigger>
            {packageData?.generatedClips?.length > 0 && (
              <TabsTrigger value="clips" className="gap-1">
                <Film className="h-3 w-3" />
                Clips ({packageData.generatedClips.filter((c: any) => !c.error).length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Audio Player - show if saved audio exists */}
            {pkg.audioFilePath && (
              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-green-500/20">
                        <Volume2 className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Saved Audio</p>
                        <p className="text-xs text-muted-foreground">{pkg.audioFileName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {packageData.audioInfo?.formattedDuration ? (
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          {packageData.audioInfo.formattedDuration}
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={handleRecalculateTiming}
                          disabled={isRecalculating}
                          data-testid="button-recalculate-timing"
                        >
                          {isRecalculating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {isRecalculating ? 'Recalculating...' : 'Sync Timing'}
                        </Button>
                      )}
                    </div>
                  </div>
                  <audio controls className="w-full h-10" src={pkg.audioFilePath} data-testid="audio-player-saved">
                    Your browser does not support the audio element.
                  </audio>

                  {/* Librosa Audio Analysis Display */}
                  {packageData.audioAnalysis && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Audio Analysis (Librosa)</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-lg font-bold text-primary">{Math.round(packageData.audioAnalysis.bpm)}</p>
                          <p className="text-[10px] text-muted-foreground">BPM</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-lg font-bold">{packageData.audioAnalysis.sections?.length || 0}</p>
                          <p className="text-[10px] text-muted-foreground">Sections</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-lg font-bold">{packageData.audioAnalysis.beatCount || 0}</p>
                          <p className="text-[10px] text-muted-foreground">Beats</p>
                        </div>
                      </div>

                      {/* Energy Peaks */}
                      {packageData.audioAnalysis.peaks && packageData.audioAnalysis.peaks.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground mb-2">Energy Peaks (sync points):</p>
                          <div className="flex flex-wrap gap-1">
                            {packageData.audioAnalysis.peaks.slice(0, 5).map((peak: any, i: number) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">
                                {peak.timeFormatted} ({Math.round(peak.energy)}%)
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Section Types */}
                      {packageData.audioAnalysis.sections && packageData.audioAnalysis.sections.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground mb-2">Detected Sections:</p>
                          <div className="flex flex-wrap gap-1">
                            {packageData.audioAnalysis.sections.map((section: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px] gap-1">
                                <span className="capitalize">{section.type}</span>
                                <span className="text-muted-foreground">
                                  {section.startFormatted}-{section.endFormatted}
                                </span>
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    section.energyLevel === 'high'
                                      ? 'bg-red-500'
                                      : section.energyLevel === 'medium'
                                        ? 'bg-yellow-500'
                                        : 'bg-green-500'
                                  }`}
                                />
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Karaoke Subtitles Section */}
                  <div className="mt-4 pt-4 border-t" data-testid="section-karaoke-subtitles">
                    <div className="flex items-center gap-2 mb-3">
                      <Type className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Karaoke Subtitles</span>
                      {packageData.whisperTranscription && (
                        <Badge variant="secondary" className="text-[10px]" data-testid="badge-whisper-wordcount">
                          {packageData.whisperTranscription.wordCount} words
                        </Badge>
                      )}
                      {packageData.karaokeSubtitles && (
                        <Badge className="bg-green-500/20 text-green-500 text-[10px]" data-testid="badge-karaoke-ready">
                          Ready
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Step 1: Whisper Transcription */}
                      <div
                        className="flex items-center justify-between p-2 bg-muted/30 rounded"
                        data-testid="row-whisper-transcription"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] w-5 h-5 p-0 justify-center">
                            1
                          </Badge>
                          <span className="text-sm">Word Timestamps</span>
                          {packageData.whisperTranscription ? (
                            <Badge
                              className="bg-green-500/20 text-green-500 text-[10px] gap-1"
                              data-testid="status-transcribe-complete"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {packageData.whisperTranscription.alignedWithLyrics ? 'Aligned' : 'Transcribed'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground" data-testid="status-transcribe-pending">
                              via Whisper API
                            </span>
                          )}
                        </div>
                        <Button
                          variant={packageData.whisperTranscription ? 'outline' : 'default'}
                          size="sm"
                          onClick={handleTranscribe}
                          disabled={isTranscribing}
                          data-testid="button-transcribe-audio"
                        >
                          {isTranscribing ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : packageData.whisperTranscription ? (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          ) : null}
                          {isTranscribing
                            ? 'Transcribing...'
                            : packageData.whisperTranscription
                              ? 'Re-transcribe'
                              : 'Transcribe'}
                        </Button>
                      </div>

                      {/* Step 2: Generate Karaoke Subtitles */}
                      <div
                        className="flex items-center justify-between p-2 bg-muted/30 rounded"
                        data-testid="row-karaoke-generation"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] w-5 h-5 p-0 justify-center">
                            2
                          </Badge>
                          <span className="text-sm">Generate Subtitles</span>
                          <select
                            value={selectedKaraokeStyle}
                            onChange={(e) => setSelectedKaraokeStyle(e.target.value as any)}
                            className="text-xs px-2 py-1 rounded border bg-background"
                            data-testid="select-karaoke-style"
                          >
                            <option value="bounce">Bounce</option>
                            <option value="glow">Glow</option>
                            <option value="fire">Fire</option>
                            <option value="neon">Neon</option>
                            <option value="minimal">Minimal</option>
                          </select>
                        </div>
                        <Button
                          variant={packageData.karaokeSubtitles ? 'outline' : 'default'}
                          size="sm"
                          onClick={handleGenerateKaraoke}
                          disabled={isGeneratingKaraoke || !packageData.whisperTranscription}
                          data-testid="button-generate-karaoke"
                        >
                          {isGeneratingKaraoke ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : packageData.karaokeSubtitles ? (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          ) : null}
                          {isGeneratingKaraoke
                            ? 'Generating...'
                            : packageData.karaokeSubtitles
                              ? 'Regenerate'
                              : 'Generate'}
                        </Button>
                      </div>

                      {/* Karaoke Status */}
                      {packageData.karaokeSubtitles && (
                        <div
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                          data-testid="status-karaoke-info"
                        >
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          <span>
                            {packageData.karaokeSubtitles.style} style,
                            {packageData.karaokeSubtitles.beatSyncEnabled ? ' beat-synced' : ' no beat sync'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">Duration</Label>
                    {packageData.audioInfo && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        from audio
                      </Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold mt-1">{packageData.timing?.formattedDuration || 'N/A'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">VEO Clips</Label>
                  </div>
                  <p className="text-2xl font-bold mt-1">{packageData.timing?.totalVeoClips || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">Est. Cost</Label>
                  </div>
                  <p className="text-2xl font-bold mt-1">
                    ${packageData.timing?.estimatedVeoCost?.toFixed(2) || '0.00'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Section Timing Breakdown - shows after audio sync */}
            {(packageData.timing?.sections || packageData.timing?.sectionsBreakdown) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Section Timing Breakdown
                    {packageData.audioInfo && (
                      <Badge variant="outline" className="text-[10px]">
                        synced to audio
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(packageData.timing?.sections || packageData.timing?.sectionsBreakdown)?.map(
                      (section: any, i: number) => {
                        const sectionName = section.section || section.name || `Section ${i + 1}`;
                        const duration = section.estimatedDurationSeconds || section.durationSeconds || 0;
                        const clips = section.clipCount || section.veoClipsNeeded || 0;
                        const mins = Math.floor(duration / 60);
                        const secs = Math.round(duration % 60);
                        const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;

                        return (
                          <div key={i} className="flex items-center justify-between py-1 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] w-6 h-5 p-0 justify-center">
                                {i + 1}
                              </Badge>
                              <span className="text-sm font-medium">{sectionName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-muted-foreground">{timeStr}</span>
                              <Badge variant="secondary" className="gap-1">
                                <Film className="h-3 w-3" />
                                {clips} clip{clips !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Suno Style Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <pre className="text-sm bg-muted/50 p-2 rounded flex-1 overflow-x-auto">
                    {packageData.sunoStyleTags?.fullStyleString || 'N/A'}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(packageData.sunoStyleTags?.fullStyleString || '', 'Suno tags')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Character Cast ({packageData.characterCast?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {packageData.characterCast?.map((char: any, i: number) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{char.name || `Character ${char.id}`}</div>
                      <Badge variant="secondary" className="text-xs">
                        {char.role}
                      </Badge>
                    </div>
                    {char.humanizingDetail && (
                      <p className="text-xs text-muted-foreground italic">"{char.humanizingDetail}"</p>
                    )}
                    {char.description && <p className="text-xs text-muted-foreground">{char.description}</p>}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {char.age && <Badge variant="outline">{char.age} yrs</Badge>}
                      {char.gender && (
                        <Badge variant="outline" className="capitalize">
                          {char.gender}
                        </Badge>
                      )}
                      {char.vibe && <Badge variant="outline">{char.vibe}</Badge>}
                      {char.visualStyle && <Badge variant="outline">{char.visualStyle}</Badge>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lyrics">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Full Lyrics</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(packageData.lyrics?.raw || '', 'Lyrics')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <pre className="text-sm whitespace-pre-wrap font-mono">
                    {packageData.lyrics?.raw || 'No lyrics available'}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prompts">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Kling Prompts ({packageData.veoPrompts?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {packageData.veoPrompts?.map((prompt: any, i: number) => (
                      <div key={i} className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{prompt.clipNumber || i + 1}</Badge>
                            <span className="text-sm font-medium">{prompt.section || prompt.sectionName}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(prompt.fullPrompt || prompt.prompt || '', `Clip ${i + 1}`)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                          {prompt.fullPrompt || prompt.prompt}
                        </pre>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Generated Clips Tab */}
          {packageData?.generatedClips?.length > 0 && (
            <TabsContent value="clips">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">
                      Generated Clips ({packageData.generatedClips.filter((c: any) => !c.error).length}/
                      {packageData.generatedClips.length})
                    </CardTitle>
                    {packageData.totalCost && (
                      <Badge variant="outline" className="gap-1">
                        <DollarSign className="h-3 w-3" />${packageData.totalCost.toFixed(2)} spent
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="grid grid-cols-2 gap-4">
                      {packageData.generatedClips.map((clip: any, i: number) => (
                        <div key={i} className="relative rounded-lg overflow-hidden border bg-muted/30">
                          {clip.error ? (
                            <div className="p-4 flex flex-col items-center justify-center h-[180px] text-destructive">
                              <AlertTriangle className="h-8 w-8 mb-2" />
                              <p className="text-xs text-center">{clip.error}</p>
                            </div>
                          ) : (
                            <>
                              <video
                                controls
                                className="w-full h-[180px] object-cover bg-black"
                                src={clip.videoUrl}
                                data-testid={`video-clip-${i}`}
                              >
                                Your browser does not support the video tag.
                              </video>
                              <div className="p-2 bg-background/80 absolute bottom-0 left-0 right-0">
                                <div className="flex items-center justify-between gap-1">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {clip.section} #{clip.clipIndex + 1}
                                  </Badge>
                                  {clip.cost && (
                                    <span className="text-[10px] text-muted-foreground">${clip.cost.toFixed(2)}</span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
