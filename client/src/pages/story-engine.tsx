import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Book,
  Plus,
  Users,
  MapPin,
  Gem,
  Film,
  Music,
  Loader2,
  Play,
  ChevronRight,
  Trash2,
  Eye,
  Palette,
  Clapperboard,
  Sparkles,
  Copy,
  Upload,
  FileAudio,
  CheckCircle2,
  Mic2,
  Swords,
  Video,
  Save,
  Flame,
  Monitor,
} from 'lucide-react';
import { SiTiktok, SiYoutube } from 'react-icons/si';
import { Progress } from '@/components/ui/progress';
import type { Series, Episode, CharacterProfile } from '@shared/schema';

export default function StoryEnginePage() {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showCreateSeries, setShowCreateSeries] = useState(false);
  const [showCreateEpisode, setShowCreateEpisode] = useState(false);
  const [showRapBattle, setShowRapBattle] = useState(false);
  const { toast } = useToast();

  const { data: seriesListData, isLoading: loadingSeries } = useQuery<{ success: boolean; data: Series[] }>({
    queryKey: ['/api/series'],
  });
  const seriesList = seriesListData?.data || [];

  const { data: episodesData, isLoading: loadingEpisodes } = useQuery<{ success: boolean; data: Episode[] }>({
    queryKey: ['/api/series', selectedSeriesId, 'episodes'],
    enabled: !!selectedSeriesId,
  });
  const episodes = episodesData?.data || [];

  const selectedSeries = seriesList.find((s) => s.id === selectedSeriesId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Story Engine</h1>
          <p className="text-muted-foreground mt-1">
            Create episodic animated content with AI-powered story generation
          </p>
        </div>
        <Button onClick={() => setShowCreateSeries(true)} data-testid="button-create-series">
          <Plus className="mr-2 h-4 w-4" />
          New Series
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4">
          <Card className="h-[calc(100vh-12rem)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Book className="h-5 w-5" />
                Story Bibles
              </CardTitle>
              <CardDescription>Your animated series collection</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-20rem)]">
                {loadingSeries ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : seriesList.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <Book className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No series created yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Create your first story bible to get started</p>
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {seriesList.map((series) => (
                      <SeriesListItem
                        key={series.id}
                        series={series}
                        isSelected={selectedSeriesId === series.id}
                        onClick={() => setSelectedSeriesId(series.id)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-8">
          {selectedSeries ? (
            <SeriesDetail
              series={selectedSeries}
              episodes={episodes}
              loadingEpisodes={loadingEpisodes}
              onCreateEpisode={() => setShowCreateEpisode(true)}
              onRapBattle={() => setShowRapBattle(true)}
            />
          ) : (
            <Card className="h-[calc(100vh-12rem)] flex items-center justify-center">
              <div className="text-center">
                <Sparkles className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium mb-2">Select a Series</h3>
                <p className="text-muted-foreground max-w-sm">
                  Choose a story bible from the left or create a new one to start building your animated series
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <CreateSeriesDialog open={showCreateSeries} onOpenChange={setShowCreateSeries} />

      {selectedSeriesId && (
        <CreateEpisodeDialog open={showCreateEpisode} onOpenChange={setShowCreateEpisode} seriesId={selectedSeriesId} />
      )}

      {selectedSeries && (
        <RapBattleDialog open={showRapBattle} onOpenChange={setShowRapBattle} series={selectedSeries} />
      )}
    </div>
  );
}

function SeriesListItem({ series, isSelected, onClick }: { series: Series; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-colors hover-elevate ${
        isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-accent/50'
      }`}
      data-testid={`series-item-${series.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{series.title}</div>
          <div className="text-sm text-muted-foreground mt-1">{series.protagonist?.name || 'Unknown protagonist'}</div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              {series.episodeCount || 0} episodes
            </Badge>
            <Badge variant="outline" className="text-xs">
              {series.storyArc?.genre || 'Unknown genre'}
            </Badge>
          </div>
        </div>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`}
        />
      </div>
    </button>
  );
}

function SeriesDetail({
  series,
  episodes,
  loadingEpisodes,
  onCreateEpisode,
  onRapBattle,
}: {
  series: Series;
  episodes: Episode[];
  loadingEpisodes: boolean;
  onCreateEpisode: () => void;
  onRapBattle: () => void;
}) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/series/${series.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/series'] });
      toast({ title: 'Series deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <Tabs defaultValue="overview" className="h-[calc(100vh-12rem)]">
      <div className="flex items-center justify-between mb-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="characters" data-testid="tab-characters">
            Characters
          </TabsTrigger>
          <TabsTrigger value="world" data-testid="tab-world">
            World
          </TabsTrigger>
          <TabsTrigger value="episodes" data-testid="tab-episodes">
            Episodes
          </TabsTrigger>
          <TabsTrigger value="lyrics" data-testid="tab-lyrics">
            Lyrics
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCreateEpisode} data-testid="button-add-episode">
            <Plus className="h-4 w-4 mr-1" />
            Add Episode
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRapBattle}
            disabled={!series.antagonist}
            data-testid="button-rap-battle"
          >
            <Swords className="h-4 w-4 mr-1" />
            Rap Battle
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-series"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <TabsContent value="overview" className="h-[calc(100%-3rem)] overflow-auto">
        <OverviewTab series={series} />
      </TabsContent>

      <TabsContent value="characters" className="h-[calc(100%-3rem)] overflow-auto">
        <CharactersTab series={series} />
      </TabsContent>

      <TabsContent value="world" className="h-[calc(100%-3rem)] overflow-auto">
        <WorldTab series={series} />
      </TabsContent>

      <TabsContent value="episodes" className="h-[calc(100%-3rem)] overflow-auto">
        <EpisodesTab series={series} episodes={episodes} loading={loadingEpisodes} onCreateEpisode={onCreateEpisode} />
      </TabsContent>

      <TabsContent value="lyrics" className="h-[calc(100%-3rem)] overflow-auto">
        <LyricsTab series={series} />
      </TabsContent>
    </Tabs>
  );
}

function OverviewTab({ series }: { series: Series }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{series.title}</CardTitle>
          <CardDescription>
            {series.storyArc?.genre} | {series.storyArc?.tone}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Premise</Label>
            <p className="text-sm text-muted-foreground mt-1">{series.storyArc?.premise}</p>
          </div>
          <div>
            <Label className="text-sm font-medium">Central Conflict</Label>
            <p className="text-sm text-muted-foreground mt-1">{series.storyArc?.conflict}</p>
          </div>
          <div>
            <Label className="text-sm font-medium">Stakes</Label>
            <p className="text-sm text-muted-foreground mt-1">{series.storyArc?.stakes}</p>
          </div>
          <div>
            <Label className="text-sm font-medium">Themes</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {series.storyArc?.themes?.map((theme, i) => (
                <Badge key={i} variant="secondary">
                  {theme}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {series.visualStyle && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Visual Style
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Cinematic Style</Label>
              <p className="text-sm text-muted-foreground mt-1">{series.visualStyle.cinematicStyle}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Lighting</Label>
              <p className="text-sm text-muted-foreground mt-1">{series.visualStyle.lighting}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Color Palette</Label>
              <div className="flex gap-2 mt-2">
                {series.visualStyle.colorPalette?.map((color, i) => (
                  <div key={i} className="w-8 h-8 rounded-md border" style={{ backgroundColor: color }} title={color} />
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Mood Board</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {series.visualStyle.moodBoard?.map((keyword, i) => (
                  <Badge key={i} variant="outline">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CharacterProfileImage({
  characterProfileId,
  name,
  role,
}: {
  characterProfileId?: string;
  name: string;
  role: 'protagonist' | 'antagonist';
}) {
  const { data: profilesData, isLoading } = useQuery<{ success: boolean; data: CharacterProfile[] }>({
    queryKey: ['/api/character-profiles'],
  });

  const profiles = profilesData?.data || [];
  const profile = profiles.find((p) => p.id === characterProfileId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 animate-pulse">
        <div className="h-12 w-12 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-2 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
        <div
          className={`h-12 w-12 rounded-full flex items-center justify-center ${role === 'protagonist' ? 'bg-primary/20' : 'bg-destructive/20'}`}
        >
          <Users className={`h-6 w-6 ${role === 'protagonist' ? 'text-primary' : 'text-destructive'}`} />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">No character profile</div>
          <div className="text-xs text-muted-foreground/60">Generate or upload an image</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
      <img
        src={profile.refImageUrl}
        alt={profile.name}
        className="h-12 w-12 rounded-full object-cover border-2 border-primary"
      />
      <div className="flex-1">
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          <span className="text-xs text-green-600 dark:text-green-400">Profile Ready</span>
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-32">Consistent character enabled</div>
      </div>
    </div>
  );
}

function CharactersTab({ series }: { series: Series }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Protagonist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CharacterProfileImage
            characterProfileId={series.protagonist?.characterProfileId}
            name={series.protagonist?.name || 'Unknown'}
            role="protagonist"
          />
          <div>
            <div className="font-medium text-lg">{series.protagonist?.name}</div>
            <p className="text-sm text-muted-foreground mt-1">{series.protagonist?.description}</p>
          </div>
          <Separator />
          <div>
            <Label className="text-sm font-medium">Motivation</Label>
            <p className="text-sm text-muted-foreground mt-1">{series.protagonist?.motivation}</p>
          </div>
          <div>
            <Label className="text-sm font-medium">Backstory</Label>
            <p className="text-sm text-muted-foreground mt-1">{series.protagonist?.backstory}</p>
          </div>
          <div>
            <Label className="text-sm font-medium">Traits</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {series.protagonist?.traits?.map((trait, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {trait}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {series.antagonist && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-destructive" />
              Antagonist
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CharacterProfileImage
              characterProfileId={series.antagonist?.characterProfileId}
              name={series.antagonist?.name || 'Unknown'}
              role="antagonist"
            />
            <div>
              <div className="font-medium text-lg">{series.antagonist.name}</div>
              <p className="text-sm text-muted-foreground mt-1">{series.antagonist.description}</p>
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-medium">Motivation</Label>
              <p className="text-sm text-muted-foreground mt-1">{series.antagonist.motivation}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Backstory</Label>
              <p className="text-sm text-muted-foreground mt-1">{series.antagonist.backstory}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Traits</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {series.antagonist.traits?.map((trait, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {trait}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {series.supportingCharacters && series.supportingCharacters.length > 0 && (
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Supporting Cast</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {series.supportingCharacters.map((char, i) => (
                  <div key={i} className="p-3 rounded-lg bg-accent/30">
                    <div className="font-medium">{char.name}</div>
                    <div className="text-xs text-muted-foreground">{char.role}</div>
                    <p className="text-sm mt-2">{char.description}</p>
                    <div className="text-xs text-muted-foreground mt-1">Relationship: {char.relationship}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function WorldTab({ series }: { series: Series }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {series.setting?.name}
          </CardTitle>
          <CardDescription>
            {series.setting?.era} | {series.setting?.atmosphere}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{series.setting?.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Key Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {series.setting?.locations?.map((loc, i) => (
              <div key={i} className="p-4 rounded-lg border">
                <div className="font-medium">{loc.name}</div>
                <p className="text-sm text-muted-foreground mt-1">{loc.description}</p>
                <div className="text-xs mt-2">
                  <span className="text-muted-foreground">Visual: </span>
                  {loc.visualStyle}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {series.macguffin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gem className="h-5 w-5" />
              The MacGuffin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="font-medium text-lg">{series.macguffin.name}</div>
              <p className="text-sm text-muted-foreground mt-1">{series.macguffin.description}</p>
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-medium">Significance</Label>
              <p className="text-sm text-muted-foreground mt-1">{series.macguffin.significance}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Visual Description</Label>
              <p className="text-sm text-muted-foreground mt-1">{series.macguffin.visualDescription}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LyricsTab({ series }: { series: Series }) {
  const { toast } = useToast();
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [theme, setTheme] = useState('');
  const [conflict, setConflict] = useState('');
  const [musicStyle, setMusicStyle] = useState('epic orchestral');
  const [tempo, setTempo] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [mood, setMood] = useState('dramatic');

  const songs = (series as any).generatedSongs || [];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/series/${series.id}/generate-music-prompt`, {
        theme: theme || series.storyArc?.premise || 'The journey begins',
        conflict: conflict || series.storyArc?.conflict || 'Overcoming adversity',
        location: series.setting?.name || 'The world',
        emotionalJourney: 'struggle to triumph',
        musicStyle,
        tempo,
        mood,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/series'] });
      toast({ title: 'Lyrics generated!', description: 'New lyrics have been added' });
      setShowGenerateForm(false);
      setTheme('');
      setConflict('');
    },
    onError: (error: Error) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!`, description: 'Paste it into Suno' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Generated Lyrics</h3>
          <p className="text-sm text-muted-foreground">
            {songs.length} {songs.length === 1 ? 'song' : 'songs'} for Suno
          </p>
        </div>
        <Button onClick={() => setShowGenerateForm(!showGenerateForm)} data-testid="button-generate-lyrics">
          <Sparkles className="h-4 w-4 mr-2" />
          Generate New Lyrics
        </Button>
      </div>

      {showGenerateForm && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Generate Lyrics for Next Episode
            </CardTitle>
            <CardDescription>AI will create Suno-ready lyrics based on your story</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Episode Theme</Label>
                <Input
                  placeholder="e.g., The hero's first challenge"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  data-testid="input-lyrics-theme"
                />
              </div>
              <div className="space-y-2">
                <Label>Conflict</Label>
                <Input
                  placeholder="e.g., Facing the unknown"
                  value={conflict}
                  onChange={(e) => setConflict(e.target.value)}
                  data-testid="input-lyrics-conflict"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Music Style</Label>
                <Select value={musicStyle} onValueChange={setMusicStyle}>
                  <SelectTrigger data-testid="select-lyrics-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="epic orchestral">Epic Orchestral</SelectItem>
                    <SelectItem value="cinematic electronic">Cinematic Electronic</SelectItem>
                    <SelectItem value="folk acoustic">Folk Acoustic</SelectItem>
                    <SelectItem value="rock anthemic">Rock Anthemic</SelectItem>
                    <SelectItem value="hip hop dramatic">Hip Hop Dramatic</SelectItem>
                    <SelectItem value="pop emotional">Pop Emotional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tempo</Label>
                <Select value={tempo} onValueChange={(v) => setTempo(v as 'slow' | 'medium' | 'fast')}>
                  <SelectTrigger data-testid="select-lyrics-tempo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slow">Slow (Ballad)</SelectItem>
                    <SelectItem value="medium">Medium (Cinematic)</SelectItem>
                    <SelectItem value="fast">Fast (Action)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mood</Label>
                <Select value={mood} onValueChange={setMood}>
                  <SelectTrigger data-testid="select-lyrics-mood">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dramatic">Dramatic</SelectItem>
                    <SelectItem value="triumphant">Triumphant</SelectItem>
                    <SelectItem value="melancholic">Melancholic</SelectItem>
                    <SelectItem value="mysterious">Mysterious</SelectItem>
                    <SelectItem value="intense">Intense</SelectItem>
                    <SelectItem value="hopeful">Hopeful</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowGenerateForm(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-submit-lyrics"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {songs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <Music className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">No Lyrics Yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            Click "Generate New Lyrics" above to create Suno-ready lyrics for your next episode.
          </p>
        </Card>
      ) : (
        songs.map((song: any, index: number) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Music className="h-5 w-5" />
                    Episode {song.episodeNumber}: {song.episodeTitle}
                  </CardTitle>
                  {song.synopsis && <CardDescription className="mt-1">{song.synopsis}</CardDescription>}
                </div>
                <Badge variant="secondary">{new Date(song.createdAt).toLocaleDateString()}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Suno Style
                  </Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(song.style, 'Style')}
                    data-testid={`button-copy-style-${index}`}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-sm">{song.style}</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Music className="h-4 w-4" />
                    Lyrics
                  </Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(song.lyrics, 'Lyrics')}
                    data-testid={`button-copy-lyrics-${index}`}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <ScrollArea className="h-[300px] w-full rounded-lg border">
                  <pre className="p-4 text-sm font-mono whitespace-pre-wrap">{song.lyrics}</pre>
                </ScrollArea>
              </div>

              {song.tags && song.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {song.tags.map((tag: string, i: number) => (
                    <Badge key={i} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// Episode Detail Dialog - View and edit episode content
function EpisodeDetailDialog({
  episode,
  series,
  onClose,
  onGenerateVideo,
  isGenerating,
  onEpisodeUpdated,
}: {
  episode: Episode | null;
  series: Series;
  onClose: () => void;
  onGenerateVideo: (episodeId: string, aspectRatio: string) => void;
  isGenerating: boolean;
  onEpisodeUpdated?: () => void;
}) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDraggingMusic, setIsDraggingMusic] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>(episode?.aspectRatio || '9:16');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} copied to clipboard` });
  };

  const handleMusicUpload = async (file: File) => {
    if (!episode) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append('music', file);

      setUploadProgress(30);

      const response = await fetch(`/api/episodes/${episode.id}/add-music`, {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(80);

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to upload music');
      }

      setUploadProgress(100);
      toast({
        title: 'Music Added',
        description: `Music uploaded and analyzed (${Math.round(result.data.audioAnalysis?.duration || 0)}s, ${result.data.audioAnalysis?.tempo || '?'} BPM)`,
      });

      onEpisodeUpdated?.();
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  if (!episode) return null;

  const isRapBattle = episode.episodeType === 'rap_battle';
  const canGenerate = episode.status === 'scripted' || episode.status === 'draft' || episode.status === 'failed';
  const hasContent = isRapBattle
    ? (episode.battleData?.rounds?.length || 0) > 0
    : (episode.generatedScenes?.length || 0) > 0;

  return (
    <Dialog open={!!episode} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="dialog-episode-detail"
      >
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            {isRapBattle && <Swords className="h-5 w-5 text-red-500" />}
            <div>
              <DialogTitle>
                Episode {episode.episodeNumber}: {episode.title}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Badge
                  variant={
                    episode.status === 'completed'
                      ? 'default'
                      : episode.status === 'generating'
                        ? 'secondary'
                        : episode.status === 'failed'
                          ? 'destructive'
                          : 'outline'
                  }
                >
                  {episode.status}
                </Badge>
                <span>
                  {isRapBattle
                    ? `${episode.battleData?.rounds?.length || 0} rounds`
                    : `${episode.generatedScenes?.length || 0} scenes`}
                </span>
                {episode.audioAnalysis && (
                  <>
                    <span className="text-muted-foreground">|</span>
                    <span>{Math.round(episode.audioAnalysis.duration)}s</span>
                    <span>{episode.audioAnalysis.tempo} BPM</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div
          className="flex-1 overflow-y-auto pr-2"
          style={{ scrollbarWidth: 'auto', scrollbarColor: 'hsl(var(--primary)) hsl(var(--muted))' }}
        >
          <div className="space-y-6 pr-2">
            {/* Synopsis */}
            <div>
              <Label className="text-sm font-medium">Synopsis</Label>
              <p className="mt-1 text-sm text-muted-foreground">{episode.synopsis}</p>
            </div>

            {/* Rap Battle Content */}
            {isRapBattle && episode.battleData && (
              <>
                {/* Battle Setting & Stakes */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Setting</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {episode.battleData.setting || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Stakes</Label>
                    <p className="mt-1 text-sm text-muted-foreground">{episode.battleData.stakes || 'Not specified'}</p>
                  </div>
                </div>

                {/* Suno Style */}
                {episode.battleData.sunoStyle && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Suno Style
                      </Label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(episode.battleData!.sunoStyle, 'Suno Style')}
                        data-testid="button-copy-battle-style"
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">{episode.battleData.sunoStyle}</div>
                  </div>
                )}

                {/* Visual Theme and Hook Moment */}
                {(episode.battleData.visualTheme || episode.battleData.hookMoment) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {episode.battleData.visualTheme && (
                      <div className="p-3 rounded-lg border">
                        <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                          <Eye className="h-4 w-4" />
                          Visual Theme
                        </Label>
                        <p className="text-sm text-muted-foreground">{episode.battleData.visualTheme}</p>
                      </div>
                    )}
                    {episode.battleData.hookMoment && (
                      <div className="p-3 rounded-lg border">
                        <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                          <Flame className="h-4 w-4" />
                          Hook Moment
                        </Label>
                        <p className="text-sm text-muted-foreground">{episode.battleData.hookMoment}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Clean Lyrics for Suno */}
                {episode.battleData.cleanLyrics && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Music className="h-4 w-4" />
                        Clean Lyrics (for Suno)
                      </Label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(episode.battleData!.cleanLyrics, 'Clean Lyrics')}
                        data-testid="button-copy-clean-lyrics"
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <ScrollArea className="h-[200px] w-full rounded-lg border">
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap">{episode.battleData.cleanLyrics}</pre>
                    </ScrollArea>
                  </div>
                )}

                {/* Battle Rounds */}
                {episode.battleData.rounds && episode.battleData.rounds.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Mic2 className="h-4 w-4" />
                      Battle Rounds
                    </Label>
                    <div className="space-y-4">
                      {episode.battleData.rounds.map((round, idx) => (
                        <Card
                          key={idx}
                          className={
                            round.role === 'protagonist'
                              ? 'border-l-4 border-l-blue-500'
                              : 'border-l-4 border-l-red-500'
                          }
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">
                                Round {round.roundNumber}: {round.character}
                              </CardTitle>
                              <Badge variant="outline">{round.role}</Badge>
                            </div>
                            <CardDescription className="text-xs">
                              {round.voiceTag} | {round.mood} | {round.cameraMovement}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xs text-muted-foreground mb-2">{round.scene}</p>
                            <pre className="text-sm whitespace-pre-wrap bg-muted/30 p-2 rounded">{round.lyrics}</pre>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Regular Episode Content */}
            {!isRapBattle && (
              <>
                {/* Generated Scenes */}
                {episode.generatedScenes && episode.generatedScenes.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Film className="h-4 w-4" />
                      Scenes ({episode.generatedScenes.length})
                    </Label>
                    <div className="space-y-2">
                      {episode.generatedScenes.map((scene, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-muted/30 text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">Scene {scene.sceneNumber}</span>
                            <span className="text-xs text-muted-foreground">
                              {scene.start}s - {scene.end}s
                            </span>
                          </div>
                          <p className="text-muted-foreground">{scene.prompt}</p>
                          {scene.cameraWork && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Camera: {scene.cameraWork} | Mood: {scene.mood}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Plot Points */}
                {episode.plotPoints && episode.plotPoints.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Plot Points</Label>
                    <div className="space-y-2">
                      {episode.plotPoints.map((point, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-muted/30 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {point.emotionalBeat}
                            </Badge>
                          </div>
                          <p>{point.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">Scene: {point.scene}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* No Content Message */}
            {!hasContent && (
              <div className="text-center py-8 text-muted-foreground">
                <Film className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>This episode is in {episode.status} status.</p>
                <p className="text-sm">Upload music or generate content to get started.</p>
              </div>
            )}

            {/* Music Upload Section - Drag & Drop for episodes that need music */}
            {hasContent && !episode.musicUrl && canGenerate && (
              <div
                className={`space-y-3 p-6 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                  isDraggingMusic
                    ? 'border-primary bg-primary/10'
                    : 'border-muted-foreground/30 bg-muted/20 hover:border-primary/50 hover:bg-muted/30'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingMusic(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingMusic(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingMusic(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type.startsWith('audio/')) {
                    handleMusicUpload(file);
                  }
                }}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                data-testid="dropzone-music-upload"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMusicUpload(file);
                  }}
                  data-testid="input-music-upload-detail"
                />

                <div className="text-center">
                  {isUploading ? (
                    <>
                      <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" />
                      <p className="text-sm font-medium">Uploading & Analyzing...</p>
                      <Progress value={uploadProgress} className="mt-2 h-2" />
                      <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
                    </>
                  ) : (
                    <>
                      <FileAudio className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {isDraggingMusic ? 'Drop your music file here!' : 'Drag & Drop Music File'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">or click to browse (MP3, WAV, M4A)</p>
                      <p className="text-xs text-muted-foreground mt-3 max-w-sm mx-auto">
                        Copy the Suno Style and lyrics above, generate in Suno, then upload here
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Music Info - Show if music is attached */}
            {episode.musicUrl && (
              <div className="space-y-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <Label className="text-sm font-medium flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Music className="h-4 w-4" />
                  Music Attached
                </Label>
                <div className="flex items-center gap-4 text-sm">
                  {episode.audioAnalysis && (
                    <>
                      <span>{Math.round(episode.audioAnalysis.duration)}s</span>
                      <span>{episode.audioAnalysis.tempo} BPM</span>
                      <span className="capitalize">{episode.audioAnalysis.mood}</span>
                    </>
                  )}
                </div>
                <audio
                  src={episode.musicUrl}
                  controls
                  className="w-full h-8 mt-2"
                  data-testid="audio-episode-preview"
                />
              </div>
            )}
          </div>
        </div>

        {/* Aspect Ratio Selector - TikTok / YouTube Style Buttons - Always show when music is attached */}
        {hasContent && episode.musicUrl && (
          <div className="p-3 rounded-lg bg-muted/50 border space-y-3">
            <Label className="text-sm font-medium">Video Format</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={aspectRatio === '9:16' ? 'default' : 'outline'}
                className={`flex-1 h-16 flex-col gap-1 ${aspectRatio === '9:16' ? 'bg-black hover:bg-black/90 text-white' : ''}`}
                onClick={() => setAspectRatio('9:16')}
                data-testid="button-tiktok-format"
              >
                <SiTiktok className="h-5 w-5" />
                <span className="text-xs">9:16 Vertical</span>
              </Button>
              <Button
                type="button"
                variant={aspectRatio === '16:9' ? 'default' : 'outline'}
                className={`flex-1 h-16 flex-col gap-1 ${aspectRatio === '16:9' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                onClick={() => setAspectRatio('16:9')}
                data-testid="button-youtube-format"
              >
                <SiYoutube className="h-5 w-5" />
                <span className="text-xs">16:9 Horizontal</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {aspectRatio === '9:16' ? 'TikTok, Reels, Shorts' : 'YouTube, Desktop'}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={onClose} data-testid="button-close-episode-detail">
            Close
          </Button>
          {hasContent && episode.musicUrl && (
            <Button
              onClick={() => onGenerateVideo(episode.id, aspectRatio)}
              disabled={isGenerating || isUploading}
              className={aspectRatio === '9:16' ? 'bg-black hover:bg-black/90' : 'bg-red-600 hover:bg-red-700'}
              data-testid="button-generate-from-detail"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : aspectRatio === '9:16' ? (
                <SiTiktok className="h-4 w-4 mr-2" />
              ) : (
                <SiYoutube className="h-4 w-4 mr-2" />
              )}
              {episode.status === 'generating' ? 'Restart Generation' : 'Generate Video'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EpisodesTab({
  series,
  episodes,
  loading,
  onCreateEpisode,
}: {
  series: Series;
  episodes: Episode[];
  loading: boolean;
  onCreateEpisode: () => void;
}) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: 'uploading' | 'analyzing' | 'generating' | 'complete' | null;
    percent: number;
    message: string;
  }>({ stage: null, percent: 0, message: '' });

  const getCharacterIdsForEpisode = (episode: Episode): string[] => {
    const characterIds: string[] = [];

    if (episode.episodeType === 'rap_battle') {
      if (series.protagonist?.characterProfileId) {
        characterIds.push(series.protagonist.characterProfileId);
      }
      if (series.antagonist?.characterProfileId) {
        characterIds.push(series.antagonist.characterProfileId);
      }
    }

    return characterIds;
  };

  const generateVideoMutation = useMutation({
    mutationFn: async ({ episodeId, aspectRatio }: { episodeId: string; aspectRatio: string }) => {
      const episode = episodes.find((ep) => ep.id === episodeId);
      const characterIds = episode ? getCharacterIdsForEpisode(episode) : [];

      const mode = characterIds.length > 0 ? 'consistent' : 'veo';
      console.log(
        `🎬 Starting video generation in ${mode} mode with ${characterIds.length} character profiles, aspect ratio: ${aspectRatio}`,
      );

      const res = await apiRequest('POST', `/api/episodes/${episodeId}/generate-video`, { characterIds, aspectRatio });
      return res.json();
    },
    onSuccess: (_, { episodeId, aspectRatio }) => {
      const episode = episodes.find((ep) => ep.id === episodeId);
      const characterIds = episode ? getCharacterIdsForEpisode(episode) : [];
      const mode = characterIds.length > 0 ? 'Consistent Character' : 'VEO Cinematic';

      queryClient.invalidateQueries({ queryKey: ['/api/series', series.id, 'episodes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({
        title: 'Video generation started!',
        description: `Using ${mode} mode (${aspectRatio})${characterIds.length > 0 ? ` with ${characterIds.length} character profile(s)` : ''}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to start generation', description: error.message, variant: 'destructive' });
    },
  });

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find((f) => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i));

    if (!audioFile) {
      toast({
        title: 'Invalid file type',
        description: 'Please drop an audio file (MP3, WAV, M4A, etc.)',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploadProgress({ stage: 'uploading', percent: 10, message: 'Uploading audio...' });

      const formData = new FormData();
      formData.append('music', audioFile);
      formData.append('separateAudio', 'true');
      formData.append('transcribeLyrics', 'true');

      setUploadProgress({ stage: 'analyzing', percent: 30, message: 'Analyzing music & generating episode...' });

      const response = await fetch(`/api/series/${series.id}/episodes/generate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate episode');
      }

      const result = await response.json();

      if (!result.success || !result.data?.id) {
        throw new Error('Episode creation failed');
      }

      setUploadProgress({ stage: 'generating', percent: 70, message: 'Starting video generation...' });

      queryClient.invalidateQueries({ queryKey: ['/api/series', series.id, 'episodes'] });

      const characterIds: string[] = [];
      if (series.protagonist?.characterProfileId) {
        characterIds.push(series.protagonist.characterProfileId);
      }
      if (series.antagonist?.characterProfileId) {
        characterIds.push(series.antagonist.characterProfileId);
      }

      const mode = characterIds.length > 0 ? 'Consistent Character' : 'VEO Cinematic';
      console.log(`🎬 Auto-generating video in ${mode} mode with ${characterIds.length} character profiles`);

      const videoResponse = await fetch(`/api/episodes/${result.data.id}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterIds }),
      });

      if (!videoResponse.ok) {
        const errorData = await videoResponse.json();
        throw new Error(errorData.error || 'Failed to start video generation');
      }

      setUploadProgress({ stage: 'complete', percent: 100, message: 'Video generation started!' });

      queryClient.invalidateQueries({ queryKey: ['/api/series', series.id, 'episodes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });

      toast({
        title: 'Video generation started!',
        description: `Episode "${result.data.title}" is generating using ${mode} mode${characterIds.length > 0 ? ` with ${characterIds.length} character profile(s)` : ''}`,
      });

      setTimeout(() => {
        setUploadProgress({ stage: null, percent: 0, message: '' });
      }, 2000);
    } catch (error: any) {
      console.error('Auto-generation error:', error);
      setUploadProgress({ stage: null, percent: 0, message: '' });
      toast({
        title: 'Generation failed',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fakeDropEvent = {
        preventDefault: () => {},
        dataTransfer: { files: [file] },
      } as unknown as React.DragEvent<HTMLElement>;
      handleDrop(fakeDropEvent);
    }
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="space-y-4">
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
          onChange={handleFileSelect}
          className="hidden"
          id="audio-file-input"
          data-testid="input-audio-file"
        />
        <label
          htmlFor={uploadProgress.stage ? undefined : 'audio-file-input'}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            block border-2 border-dashed rounded-lg p-12 text-center transition-all duration-200
            ${
              isDragging
                ? 'border-primary bg-primary/5 scale-[1.02]'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }
            ${uploadProgress.stage ? 'pointer-events-none opacity-90' : 'cursor-pointer'}
          `}
          data-testid="dropzone-audio"
        >
          {uploadProgress.stage ? (
            <div className="space-y-4" data-testid="status-upload-progress">
              {uploadProgress.stage === 'complete' ? (
                <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
              ) : (
                <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin" />
              )}
              <div className="space-y-2">
                <p className="font-medium text-lg" data-testid="text-progress-message">
                  {uploadProgress.message}
                </p>
                <Progress value={uploadProgress.percent} className="w-64 mx-auto" data-testid="progress-upload" />
                <p className="text-sm text-muted-foreground" data-testid="text-progress-stage">
                  {uploadProgress.stage === 'uploading' && 'Uploading your audio file...'}
                  {uploadProgress.stage === 'analyzing' && 'AI is analyzing mood, tempo & creating scenes...'}
                  {uploadProgress.stage === 'generating' && 'Queuing video generation job...'}
                  {uploadProgress.stage === 'complete' && 'Check the Jobs page for progress!'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className={`transition-transform duration-200 ${isDragging ? 'scale-110' : ''}`}>
                {isDragging ? (
                  <FileAudio className="h-16 w-16 mx-auto text-primary mb-4" />
                ) : (
                  <Upload className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                )}
              </div>
              <h3 className="font-semibold text-xl mb-2">
                {isDragging ? 'Drop to generate video!' : 'Drop Audio Here'}
              </h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Drag and drop an audio file, or click to browse. Auto-generates episode and video.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">MP3</Badge>
                <Badge variant="outline">WAV</Badge>
                <Badge variant="outline">M4A</Badge>
                <Badge variant="outline">AAC</Badge>
                <span className="mx-2">|</span>
                <span>Max 20MB</span>
              </div>
            </>
          )}
        </label>

        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <span className="text-sm text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <Button
          onClick={onCreateEpisode}
          variant="outline"
          className="w-full"
          data-testid="button-create-first-episode"
        >
          <Music className="mr-2 h-4 w-4" />
          Generate Music Prompt for Suno First
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {episodes.map((episode) => (
        <Card
          key={episode.id}
          className="hover-elevate cursor-pointer transition-all"
          onClick={() => setSelectedEpisode(episode)}
          data-testid={`card-episode-${episode.id}`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {episode.episodeType === 'rap_battle' && <Swords className="h-4 w-4 text-red-500" />}
                  Episode {episode.episodeNumber}: {episode.title}
                </CardTitle>
                <CardDescription>
                  {episode.episodeType === 'rap_battle'
                    ? `${episode.battleData?.rounds?.length || 0} rounds`
                    : `${episode.generatedScenes?.length || 0} scenes`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    episode.status === 'completed'
                      ? 'default'
                      : episode.status === 'generating'
                        ? 'secondary'
                        : episode.status === 'failed'
                          ? 'destructive'
                          : 'outline'
                  }
                >
                  {episode.status}
                </Badge>
                {(episode.status === 'scripted' || episode.status === 'generating' || episode.status === 'failed') && (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      generateVideoMutation.mutate({
                        episodeId: episode.id,
                        aspectRatio: episode.aspectRatio || '9:16',
                      });
                    }}
                    disabled={generateVideoMutation.isPending}
                    data-testid={`button-generate-episode-${episode.id}`}
                  >
                    {generateVideoMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Play className="h-4 w-4 mr-1" />
                    )}
                    {episode.status === 'generating' || episode.status === 'failed' ? 'Retry Video' : 'Generate Video'}
                  </Button>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-2">{episode.synopsis}</p>
            {episode.audioAnalysis && (
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span>Duration: {Math.round(episode.audioAnalysis.duration)}s</span>
                <span>Tempo: {episode.audioAnalysis.tempo} BPM</span>
                <span>Mood: {episode.audioAnalysis.mood}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Episode Detail Dialog */}
      <EpisodeDetailDialog
        episode={selectedEpisode}
        series={series}
        onClose={() => setSelectedEpisode(null)}
        onGenerateVideo={(episodeId, aspectRatio) => generateVideoMutation.mutate({ episodeId, aspectRatio })}
        isGenerating={generateVideoMutation.isPending}
        onEpisodeUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/series', series.id, 'episodes'] });
          setSelectedEpisode(null);
        }}
      />
    </div>
  );
}

function CreateSeriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [person, setPerson] = useState('');
  const [place, setPlace] = useState('');
  const [thing, setThing] = useState('');
  const [genre, setGenre] = useState('');
  const [tone, setTone] = useState('');
  const [timePeriod, setTimePeriod] = useState('');
  const [isHistoricalFigure, setIsHistoricalFigure] = useState(false);
  const [additionalContext, setAdditionalContext] = useState('');
  const [generatedLyrics, setGeneratedLyrics] = useState<{
    episodeTitle: string;
    sunoPrompt: { style: string; lyrics: string; tags: string[] };
    episodeContext: { title: string; synopsis: string };
  } | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/series/generate', {
        person,
        place,
        thing,
        genre,
        tone,
        timePeriod,
        isHistoricalFigure,
        additionalContext,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/series'] });

      // Check if we have auto-generated lyrics
      if (data.autoGeneratedLyrics) {
        setGeneratedLyrics(data.autoGeneratedLyrics);
        setShowLyrics(true);
        toast({
          title: 'Story Bible + Lyrics Generated!',
          description: `${data.data?.title || 'Series'} with Episode 1 lyrics based on real events`,
        });
      } else {
        toast({
          title: isHistoricalFigure ? 'Historical Story Bible generated!' : 'Story Bible generated!',
          description: isHistoricalFigure ? 'Your fact-checked historical series is ready' : 'Your new series is ready',
        });
        onOpenChange(false);
        resetForm();
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setPerson('');
    setPlace('');
    setThing('');
    setGenre('');
    setTone('');
    setTimePeriod('');
    setIsHistoricalFigure(false);
    setAdditionalContext('');
    setGeneratedLyrics(null);
    setShowLyrics(false);
  };

  const closeLyricsAndReset = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) resetForm();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {showLyrics && generatedLyrics ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                Episode 1 Lyrics Generated!
              </DialogTitle>
              <DialogDescription>
                Based on real historical events - copy these to Suno to create music
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <h4 className="font-semibold text-sm mb-1">{generatedLyrics.episodeTitle}</h4>
                <p className="text-xs text-muted-foreground">{generatedLyrics.episodeContext?.synopsis}</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Suno Style (copy this)
                </Label>
                <div className="relative">
                  <Textarea
                    value={generatedLyrics.sunoPrompt?.style || ''}
                    readOnly
                    className="resize-none text-sm min-h-[60px]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLyrics.sunoPrompt?.style || '');
                      toast({ title: 'Copied style to clipboard!' });
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  Lyrics (copy this)
                </Label>
                <div className="relative">
                  <Textarea
                    value={generatedLyrics.sunoPrompt?.lyrics || ''}
                    readOnly
                    className="resize-none text-sm min-h-[300px] font-mono"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLyrics.sunoPrompt?.lyrics || '');
                      toast({ title: 'Copied lyrics to clipboard!' });
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
              </div>

              {generatedLyrics.sunoPrompt?.tags && (
                <div className="flex flex-wrap gap-2">
                  {generatedLyrics.sunoPrompt.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeLyricsAndReset}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Create Story Bible
              </DialogTitle>
              <DialogDescription>Enter three elements and AI will generate a complete story bible</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Historical Figure Toggle */}
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50 border">
                <Checkbox
                  id="historical"
                  checked={isHistoricalFigure}
                  onCheckedChange={(checked) => setIsHistoricalFigure(checked === true)}
                  data-testid="checkbox-historical"
                />
                <div className="flex-1">
                  <Label htmlFor="historical" className="font-medium cursor-pointer">
                    Real Person from History
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {timePeriod && !person
                      ? 'Select a time period and AI will discover a fascinating historical figure for you!'
                      : "AI will research and fact-check the historical figure's life story"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="person">
                    <Users className="h-4 w-4 inline mr-1" />
                    {isHistoricalFigure ? 'Historical Figure' : 'Person (Protagonist)'}
                    {isHistoricalFigure && timePeriod && (
                      <span className="text-muted-foreground text-xs ml-1">(optional)</span>
                    )}
                  </Label>
                  <Input
                    id="person"
                    placeholder={
                      isHistoricalFigure
                        ? timePeriod
                          ? 'Leave empty to auto-discover...'
                          : 'e.g., Leonardo da Vinci'
                        : 'e.g., A rebellious space pilot'
                    }
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    data-testid="input-person"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="place">
                    <MapPin className="h-4 w-4 inline mr-1" />
                    {isHistoricalFigure ? 'Location / Region' : 'Place (Setting)'}
                    {isHistoricalFigure && timePeriod && (
                      <span className="text-muted-foreground text-xs ml-1">(optional)</span>
                    )}
                  </Label>
                  <Input
                    id="place"
                    placeholder={
                      isHistoricalFigure
                        ? timePeriod
                          ? 'Leave empty to auto-discover...'
                          : 'e.g., Renaissance Italy'
                        : 'e.g., A dying space station'
                    }
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    data-testid="input-place"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thing">
                    <Gem className="h-4 w-4 inline mr-1" />
                    {isHistoricalFigure ? 'Key Achievement / Event' : 'Thing (MacGuffin)'}
                    {isHistoricalFigure && timePeriod && (
                      <span className="text-muted-foreground text-xs ml-1">(optional)</span>
                    )}
                  </Label>
                  <Input
                    id="thing"
                    placeholder={
                      isHistoricalFigure
                        ? timePeriod
                          ? 'Leave empty to auto-discover...'
                          : 'e.g., The Mona Lisa'
                        : 'e.g., Ancient star map'
                    }
                    value={thing}
                    onChange={(e) => setThing(e.target.value)}
                    data-testid="input-thing"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timePeriod">Time Period (optional)</Label>
                  <Select value={timePeriod} onValueChange={setTimePeriod}>
                    <SelectTrigger data-testid="select-time-period">
                      <SelectValue placeholder="Select era" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prehistoric">Prehistoric</SelectItem>
                      <SelectItem value="ancient">Ancient (3000 BC - 500 AD)</SelectItem>
                      <SelectItem value="medieval">Medieval (500 - 1500)</SelectItem>
                      <SelectItem value="renaissance">Renaissance (1400 - 1600)</SelectItem>
                      <SelectItem value="early-modern">Early Modern (1500 - 1800)</SelectItem>
                      <SelectItem value="industrial">Industrial Era (1760 - 1914)</SelectItem>
                      <SelectItem value="modern">Modern (1914 - 1990)</SelectItem>
                      <SelectItem value="contemporary">Contemporary (1990 - Present)</SelectItem>
                      <SelectItem value="near-future">Near Future</SelectItem>
                      <SelectItem value="far-future">Far Future</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre">Genre (optional)</Label>
                  <Select value={genre} onValueChange={setGenre}>
                    <SelectTrigger data-testid="select-genre">
                      <SelectValue placeholder="Select genre" />
                    </SelectTrigger>
                    <SelectContent>
                      {isHistoricalFigure ? (
                        <>
                          <SelectItem value="biography">Biography</SelectItem>
                          <SelectItem value="documentary">Documentary</SelectItem>
                          <SelectItem value="historical-drama">Historical Drama</SelectItem>
                          <SelectItem value="epic">Epic</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="sci-fi">Sci-Fi</SelectItem>
                          <SelectItem value="fantasy">Fantasy</SelectItem>
                          <SelectItem value="action">Action</SelectItem>
                          <SelectItem value="drama">Drama</SelectItem>
                          <SelectItem value="comedy">Comedy</SelectItem>
                          <SelectItem value="horror">Horror</SelectItem>
                          <SelectItem value="thriller">Thriller</SelectItem>
                          <SelectItem value="romance">Romance</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tone">Tone (optional)</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger data-testid="select-tone">
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="gritty">Gritty</SelectItem>
                      <SelectItem value="hopeful">Hopeful</SelectItem>
                      <SelectItem value="epic">Epic</SelectItem>
                      <SelectItem value="whimsical">Whimsical</SelectItem>
                      <SelectItem value="intense">Intense</SelectItem>
                      <SelectItem value="mysterious">Mysterious</SelectItem>
                      <SelectItem value="inspiring">Inspiring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="context">
                  {isHistoricalFigure ? 'Focus Areas (optional)' : 'Additional Context (optional)'}
                </Label>
                <Textarea
                  id="context"
                  placeholder={
                    isHistoricalFigure
                      ? 'Specific events, achievements, or aspects of their life to highlight...'
                      : 'Any additional story details, themes, or constraints...'
                  }
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  className="resize-none"
                  rows={3}
                  data-testid="input-context"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={
                  generateMutation.isPending ||
                  (isHistoricalFigure
                    ? !timePeriod // Historical mode: just need time period
                    : !person || !place || !thing) // Fictional: need all three
                }
                data-testid="button-generate-series"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Story Bible...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Story Bible
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface MusicPromptResult {
  sunoPrompt: {
    style: string;
    lyrics: string;
    tags: string[];
  };
  episodeContext: {
    title: string;
    synopsis: string;
    visualThemes: string[];
    keyMoments: string[];
  };
  recommendedDuration: number;
}

function CreateEpisodeDialog({
  open,
  onOpenChange,
  seriesId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesId: string;
}) {
  const [activeTab, setActiveTab] = useState<'generate' | 'upload'>('generate');
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [separateAudio, setSeparateAudio] = useState(true);
  const [transcribeLyrics, setTranscribeLyrics] = useState(true);
  const [userDescription, setUserDescription] = useState('');

  // Episode generator form state
  const [theme, setTheme] = useState('');
  const [conflict, setConflict] = useState('');
  const [location, setLocation] = useState('');
  const [emotionalJourney, setEmotionalJourney] = useState('struggle to triumph');
  const [musicStyle, setMusicStyle] = useState('');
  const [tempo, setTempo] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [mood, setMood] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState<MusicPromptResult | null>(null);

  const { toast } = useToast();

  // Generate music prompt mutation
  const generatePromptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/series/${seriesId}/generate-music-prompt`, {
        theme,
        conflict,
        location,
        emotionalJourney,
        musicStyle,
        tempo,
        mood,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedPrompt(data.data.musicPrompt);
      toast({ title: 'Music prompt generated!', description: 'Copy the lyrics and style to Suno' });
    },
    onError: (error: Error) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (musicFile) {
        formData.append('music', musicFile);
      }
      formData.append('separateAudio', String(separateAudio));
      formData.append('transcribeLyrics', String(transcribeLyrics));
      if (userDescription) {
        formData.append('userDescription', userDescription);
      }

      const res = await fetch(`/api/series/${seriesId}/episodes/generate`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create episode');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/series', seriesId, 'episodes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/series'] });
      toast({ title: 'Episode created!', description: data.message });
      onOpenChange(false);
      setMusicFile(null);
      setUserDescription('');
      setGeneratedPrompt(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Episode creation failed', description: error.message, variant: 'destructive' });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!`, description: 'Paste it into Suno' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5" />
            Create New Episode
          </DialogTitle>
          <DialogDescription>Generate a music prompt with lyrics, or upload existing music</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'generate' | 'upload')} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate" data-testid="tab-generate">
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Music Prompt
            </TabsTrigger>
            <TabsTrigger value="upload" data-testid="tab-upload">
              <Music className="h-4 w-4 mr-2" />
              Upload Music
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-6 mt-4">
            {!generatedPrompt ? (
              <>
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <p className="font-medium mb-1">Suno Workflow</p>
                  <p className="text-muted-foreground">
                    1. Fill in episode variables below → 2. Copy generated lyrics & style to Suno → 3. Generate music in
                    Suno → 4. Upload music here
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="theme">Theme *</Label>
                    <Select value={theme} onValueChange={setTheme}>
                      <SelectTrigger data-testid="select-theme">
                        <SelectValue placeholder="Select theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="revenge">Revenge</SelectItem>
                        <SelectItem value="redemption">Redemption</SelectItem>
                        <SelectItem value="discovery">Discovery</SelectItem>
                        <SelectItem value="survival">Survival</SelectItem>
                        <SelectItem value="betrayal">Betrayal</SelectItem>
                        <SelectItem value="love">Love</SelectItem>
                        <SelectItem value="power">Power</SelectItem>
                        <SelectItem value="sacrifice">Sacrifice</SelectItem>
                        <SelectItem value="freedom">Freedom</SelectItem>
                        <SelectItem value="identity">Identity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="conflict">Conflict *</Label>
                    <Input
                      id="conflict"
                      placeholder="e.g., alien invasion, rival DJ battle"
                      value={conflict}
                      onChange={(e) => setConflict(e.target.value)}
                      data-testid="input-conflict"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">Location (optional)</Label>
                    <Input
                      id="location"
                      placeholder="e.g., Mercury surface, underground bunker"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      data-testid="input-location"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emotional-journey">Emotional Journey</Label>
                    <Select value={emotionalJourney} onValueChange={setEmotionalJourney}>
                      <SelectTrigger data-testid="select-journey">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="struggle to triumph">Struggle to Triumph</SelectItem>
                        <SelectItem value="fear to courage">Fear to Courage</SelectItem>
                        <SelectItem value="doubt to confidence">Doubt to Confidence</SelectItem>
                        <SelectItem value="loss to acceptance">Loss to Acceptance</SelectItem>
                        <SelectItem value="anger to peace">Anger to Peace</SelectItem>
                        <SelectItem value="isolation to connection">Isolation to Connection</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="music-style">Music Style *</Label>
                    <Select value={musicStyle} onValueChange={setMusicStyle}>
                      <SelectTrigger data-testid="select-music-style">
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trap">Trap</SelectItem>
                        <SelectItem value="lo-fi hip hop">Lo-Fi Hip Hop</SelectItem>
                        <SelectItem value="synthwave">Synthwave</SelectItem>
                        <SelectItem value="epic orchestral">Epic Orchestral</SelectItem>
                        <SelectItem value="drill">Drill</SelectItem>
                        <SelectItem value="phonk">Phonk</SelectItem>
                        <SelectItem value="ambient electronic">Ambient Electronic</SelectItem>
                        <SelectItem value="cinematic score">Cinematic Score</SelectItem>
                        <SelectItem value="boom bap">Boom Bap</SelectItem>
                        <SelectItem value="dark techno">Dark Techno</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tempo">Tempo *</Label>
                    <Select value={tempo} onValueChange={(v) => setTempo(v as 'slow' | 'medium' | 'fast')}>
                      <SelectTrigger data-testid="select-tempo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Slow (70-90 BPM)</SelectItem>
                        <SelectItem value="medium">Medium (100-120 BPM)</SelectItem>
                        <SelectItem value="fast">Fast (130-160 BPM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mood">Mood *</Label>
                    <Select value={mood} onValueChange={setMood}>
                      <SelectTrigger data-testid="select-mood">
                        <SelectValue placeholder="Select mood" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="intense">Intense</SelectItem>
                        <SelectItem value="mysterious">Mysterious</SelectItem>
                        <SelectItem value="uplifting">Uplifting</SelectItem>
                        <SelectItem value="melancholic">Melancholic</SelectItem>
                        <SelectItem value="aggressive">Aggressive</SelectItem>
                        <SelectItem value="ethereal">Ethereal</SelectItem>
                        <SelectItem value="triumphant">Triumphant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => generatePromptMutation.mutate()}
                    disabled={!theme || !conflict || !musicStyle || !mood || generatePromptMutation.isPending}
                    data-testid="button-generate-prompt"
                  >
                    {generatePromptMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate Suno Prompt
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{generatedPrompt.episodeContext.title}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setGeneratedPrompt(null)}>
                    Generate New
                  </Button>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">{generatedPrompt.episodeContext.synopsis}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Suno Style Description</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(generatedPrompt.sunoPrompt.style, 'Style')}
                        data-testid="button-copy-style"
                      >
                        Copy
                      </Button>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-sm font-mono">
                      {generatedPrompt.sunoPrompt.style}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Lyrics (8-Beat Structure)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(generatedPrompt.sunoPrompt.lyrics, 'Lyrics')}
                        data-testid="button-copy-lyrics"
                      >
                        Copy
                      </Button>
                    </div>
                    <ScrollArea className="h-64 border rounded-lg">
                      <pre className="p-3 text-sm whitespace-pre-wrap font-mono">
                        {generatedPrompt.sunoPrompt.lyrics}
                      </pre>
                    </ScrollArea>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {generatedPrompt.sunoPrompt.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <p className="text-sm font-medium mb-2">Next Steps:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Copy the style and lyrics above</li>
                    <li>Go to Suno and create a new song</li>
                    <li>Paste the style and lyrics, generate the music</li>
                    <li>Download the music and switch to "Upload Music" tab</li>
                  </ol>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setActiveTab('upload')}
                  data-testid="button-go-to-upload"
                >
                  <Music className="mr-2 h-4 w-4" />I have the music - Go to Upload
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="space-y-6 mt-4">
            <div className="space-y-2">
              <Label htmlFor="music">Music File</Label>
              <Input
                id="music"
                type="file"
                accept="audio/*"
                onChange={(e) => setMusicFile(e.target.files?.[0] || null)}
                data-testid="input-music-file"
              />
              <p className="text-xs text-muted-foreground">MP3, WAV, M4A, or OGG (max 20MB)</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="separate">Separate Vocals</Label>
                  <p className="text-xs text-muted-foreground">Extract vocals and instrumentals using AI</p>
                </div>
                <Switch
                  id="separate"
                  checked={separateAudio}
                  onCheckedChange={setSeparateAudio}
                  data-testid="switch-separate-audio"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="transcribe">Transcribe Lyrics</Label>
                  <p className="text-xs text-muted-foreground">Convert vocals to text for story context</p>
                </div>
                <Switch
                  id="transcribe"
                  checked={transcribeLyrics}
                  onCheckedChange={setTranscribeLyrics}
                  data-testid="switch-transcribe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Music Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe the song's mood, theme, or any context..."
                value={userDescription}
                onChange={(e) => setUserDescription(e.target.value)}
                className="resize-none"
                rows={2}
                data-testid="input-music-description"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                data-testid="button-create-episode"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing & Generating...
                  </>
                ) : (
                  <>
                    <Music className="mr-2 h-4 w-4" />
                    Create Episode
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface RapBattleResult {
  title: string;
  synopsis: string;
  rounds: Array<{
    roundNumber: number;
    roundType: string;
    performer: string;
    lyrics: string;
    scene: {
      description: string;
      environment: string;
      cameraWork: string;
      lighting: string;
      mood: string;
    };
  }>;
  sunoStyle: string;
  hookMoment: string;
  visualTheme: string;
}

function RapBattleDialog({
  open,
  onOpenChange,
  series,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  series: Series;
}) {
  const [battleTheme, setBattleTheme] = useState('');
  const [conflictType, setConflictType] = useState<string>('power');
  const [productionStyle, setProductionStyle] = useState('hard_trap');
  const [antagonistVocalStyle, setAntagonistVocalStyle] = useState('raw_rap');
  const [protagonistVocalStyle, setProtagonistVocalStyle] = useState('raw_rap');
  const [antagonistTone, setAntagonistTone] = useState('dismissive_cold');
  const [protagonistTone, setProtagonistTone] = useState('rising_from_ashes');
  const [bpm, setBpm] = useState(140);
  const [generatedBattle, setGeneratedBattle] = useState<RapBattleResult | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [generationType, setGenerationType] = useState<'full' | 'protagonist' | 'antagonist'>('full');
  const [videoMode, setVideoMode] = useState<'veo' | 'consistent'>('veo');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('9:16'); // Default to vertical for social media

  // Post-processing options
  const [enableCaptions, setEnableCaptions] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<'minimal' | 'neon' | 'fire' | 'clean' | 'bold'>('bold');
  const [enableLoop, setEnableLoop] = useState(true);
  const [loopCrossfade, setLoopCrossfade] = useState(0.5);

  // Engagement Engine state
  const [engagementPreset, setEngagementPreset] = useState('viral_battle');
  const [viralStructure, setViralStructure] = useState('hook_hold_payoff');
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>(['hot_take', 'quotable_bar', 'callback_hook']);

  const { toast } = useToast();

  // Fetch available style options
  const { data: styleOptions } = useQuery<{
    success: boolean;
    data: {
      emotionalTones: Array<{ key: string; name: string; description: string; feeling: string }>;
      productionStyles: Array<{ key: string; name: string; description: string; genre: string; tempo: string }>;
      vocalStyles: Array<{ key: string; name: string; description: string }>;
    };
  }>({
    queryKey: ['/api/battle-styles'],
  });

  // Fetch engagement triggers and presets
  const { data: engagementOptions } = useQuery<{
    success: boolean;
    data: {
      triggers: Record<string, { name: string; type: string; psychology: string; examples: string[] }>;
      presets: Record<string, { name: string; description: string; triggers: string[]; structure: string }>;
      structures: Record<string, { name: string; description: string }>;
    };
  }>({
    queryKey: ['/api/engagement/triggers'],
  });

  // Fetch engagement checklist
  const { data: engagementChecklist } = useQuery<{
    success: boolean;
    data: {
      hook: { title: string; items: Array<{ id: string; label: string }> };
      retention: { title: string; items: Array<{ id: string; label: string }> };
      rewatch: { title: string; items: Array<{ id: string; label: string }> };
      comment: { title: string; items: Array<{ id: string; label: string }> };
      share: { title: string; items: Array<{ id: string; label: string }> };
    };
  }>({
    queryKey: ['/api/engagement/checklist'],
    enabled: !!generatedBattle,
  });

  // State for checklist items
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggleCheckItem = (itemId: string) => {
    setCheckedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const getChecklistProgress = () => {
    const checklist = engagementChecklist?.data;
    if (!checklist) return { checked: 0, total: 0, percentage: 0 };

    let total = 0;
    let checked = 0;
    Object.values(checklist).forEach((section) => {
      section.items.forEach((item) => {
        total++;
        if (checkedItems[item.id]) checked++;
      });
    });
    return { checked, total, percentage: total > 0 ? Math.round((checked / total) * 100) : 0 };
  };

  // Apply preset when selected
  const handlePresetChange = (preset: string) => {
    setEngagementPreset(preset);
    const presetData = engagementOptions?.data?.presets?.[preset];
    if (presetData) {
      setSelectedTriggers(presetData.triggers || []);
      setViralStructure(presetData.structure || 'hook_hold_payoff');
    }
  };

  // Toggle trigger selection
  const toggleTrigger = (triggerId: string) => {
    setSelectedTriggers((prev) => {
      const current = prev || [];
      return current.includes(triggerId) ? current.filter((t) => t !== triggerId) : [...current, triggerId];
    });
  };

  const generateBattleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/series/${series.id}/rap-battle`, {
        battleTheme,
        conflictType,
        productionStyle,
        antagonistVocalStyle,
        protagonistVocalStyle,
        antagonistTone,
        protagonistTone,
        bpm,
        // Engagement Engine options
        engagementPreset,
        engagementTriggers: selectedTriggers,
        viralStructure,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setGeneratedBattle(data.data.battleScript);
        toast({ title: 'Rap battle generated!', description: 'Copy the lyrics and style to Suno' });
      } else {
        toast({ title: 'Generation failed', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    },
  });

  const saveBattleMutation = useMutation({
    mutationFn: async () => {
      if (!generatedBattle) throw new Error('No battle to save');
      const res = await apiRequest('POST', `/api/series/${series.id}/episodes/save-battle`, {
        battleScript: generatedBattle,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        toast({
          title: 'Rap battle saved!',
          description: data.data.message || 'Battle saved as new episode',
        });
        queryClient.invalidateQueries({ queryKey: ['/api/series', series.id, 'episodes'] });
        onOpenChange(false);
      } else {
        toast({ title: 'Save failed', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  const createEpisodeMutation = useMutation({
    mutationFn: async (genType: 'full' | 'protagonist' | 'antagonist') => {
      if (!generatedBattle) throw new Error('No battle generated');
      if (!musicFile) throw new Error('No music file uploaded');

      const formData = new FormData();
      formData.append('episodeType', 'rap_battle');
      formData.append('music', musicFile);
      formData.append('generationType', genType);

      // Filter battle script based on generation type
      let filteredBattle = { ...generatedBattle };
      const protagonistName = series.protagonist?.name || '';
      const antagonistName = series.antagonist?.name || '';

      if (genType === 'protagonist') {
        filteredBattle = {
          ...generatedBattle,
          title: `${generatedBattle.title} - ${protagonistName}'s Version`,
          rounds: generatedBattle.rounds.filter((r) => r.performer === protagonistName),
        };
      } else if (genType === 'antagonist') {
        filteredBattle = {
          ...generatedBattle,
          title: `${generatedBattle.title} - ${antagonistName}'s Version`,
          rounds: generatedBattle.rounds.filter((r) => r.performer === antagonistName),
        };
      }

      formData.append('battleScript', JSON.stringify(filteredBattle));
      formData.append('userDescription', `Rap Battle: ${battleTheme} (${genType})`);

      // Add video generation mode and aspect ratio
      formData.append('videoMode', videoMode);
      formData.append('aspectRatio', aspectRatio);

      // Add post-processing options
      formData.append(
        'postProcessing',
        JSON.stringify({
          enableCaptions,
          captionStyle,
          enableLoop,
          loopCrossfade,
          bpm,
        }),
      );

      // Only add character profile IDs for consistent mode
      if (videoMode === 'consistent') {
        const characterIds: string[] = [];
        if (genType === 'protagonist' && series.protagonist?.characterProfileId) {
          characterIds.push(series.protagonist.characterProfileId);
        } else if (genType === 'antagonist' && series.antagonist?.characterProfileId) {
          characterIds.push(series.antagonist.characterProfileId);
        } else {
          if (series.protagonist?.characterProfileId) characterIds.push(series.protagonist.characterProfileId);
          if (series.antagonist?.characterProfileId) characterIds.push(series.antagonist.characterProfileId);
        }

        if (characterIds.length > 0) {
          formData.append('characterIds', JSON.stringify(characterIds));
        }
      }

      const res = await fetch(`/api/series/${series.id}/episodes/generate`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create episode');
      }
      return { data: await res.json(), genType };
    },
    onSuccess: ({ genType }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/series', series.id, 'episodes'] });
      const typeLabel =
        genType === 'protagonist'
          ? `${series.protagonist?.name || 'Protagonist'}'s`
          : genType === 'antagonist'
            ? `${series.antagonist?.name || 'Antagonist'}'s`
            : 'Full';
      toast({ title: `${typeLabel} rap battle episode created!` });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create episode', description: error.message, variant: 'destructive' });
    },
  });

  const generateBothVersionsMutation = useMutation({
    mutationFn: async () => {
      if (!generatedBattle) throw new Error('No battle generated');
      if (!musicFile) throw new Error('No music file uploaded');

      const results = [];

      // Generate protagonist version
      const protagonistFormData = new FormData();
      protagonistFormData.append('episodeType', 'rap_battle');
      protagonistFormData.append('music', musicFile);
      protagonistFormData.append('generationType', 'protagonist');

      const protagonistName = series.protagonist?.name || 'Protagonist';
      const antagonistName = series.antagonist?.name || 'Antagonist';

      const protagonistBattle = {
        ...generatedBattle,
        title: `${generatedBattle.title} - ${protagonistName}'s Version`,
        rounds: generatedBattle.rounds.filter((r) => r.performer === protagonistName),
      };
      protagonistFormData.append('battleScript', JSON.stringify(protagonistBattle));
      protagonistFormData.append('userDescription', `Rap Battle: ${battleTheme} (protagonist)`);
      protagonistFormData.append('videoMode', videoMode);
      protagonistFormData.append('aspectRatio', aspectRatio);

      // Add post-processing options
      protagonistFormData.append(
        'postProcessing',
        JSON.stringify({
          enableCaptions,
          captionStyle,
          enableLoop,
          loopCrossfade,
          bpm,
        }),
      );

      if (videoMode === 'consistent' && series.protagonist?.characterProfileId) {
        protagonistFormData.append('characterIds', JSON.stringify([series.protagonist.characterProfileId]));
      }

      const res1 = await fetch(`/api/series/${series.id}/episodes/generate`, {
        method: 'POST',
        body: protagonistFormData,
        credentials: 'include',
      });

      if (!res1.ok) {
        const error = await res1.json();
        throw new Error(error.error || 'Failed to create protagonist episode');
      }
      results.push(await res1.json());

      // Generate antagonist version
      const antagonistFormData = new FormData();
      antagonistFormData.append('episodeType', 'rap_battle');
      antagonistFormData.append('music', musicFile);
      antagonistFormData.append('generationType', 'antagonist');

      const antagonistBattle = {
        ...generatedBattle,
        title: `${generatedBattle.title} - ${antagonistName}'s Version`,
        rounds: generatedBattle.rounds.filter((r) => r.performer === antagonistName),
      };
      antagonistFormData.append('battleScript', JSON.stringify(antagonistBattle));
      antagonistFormData.append('userDescription', `Rap Battle: ${battleTheme} (antagonist)`);
      antagonistFormData.append('videoMode', videoMode);
      antagonistFormData.append('aspectRatio', aspectRatio);

      // Add post-processing options
      antagonistFormData.append(
        'postProcessing',
        JSON.stringify({
          enableCaptions,
          captionStyle,
          enableLoop,
          loopCrossfade,
          bpm,
        }),
      );

      if (videoMode === 'consistent' && series.antagonist?.characterProfileId) {
        antagonistFormData.append('characterIds', JSON.stringify([series.antagonist.characterProfileId]));
      }

      const res2 = await fetch(`/api/series/${series.id}/episodes/generate`, {
        method: 'POST',
        body: antagonistFormData,
        credentials: 'include',
      });

      if (!res2.ok) {
        const error = await res2.json();
        throw new Error(error.error || 'Failed to create antagonist episode');
      }
      results.push(await res2.json());

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/series', series.id, 'episodes'] });
      toast({
        title: 'Both versions created!',
        description: `${series.protagonist?.name || 'Protagonist'} and ${series.antagonist?.name || 'Antagonist'} episodes ready`,
      });
      onOpenChange(false);
      setGeneratedBattle(null);
      setMusicFile(null);
      setBattleTheme('');
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create episodes', description: error.message, variant: 'destructive' });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard!` });
  };

  const getAllLyrics = () => {
    if (!generatedBattle) return '';
    return generatedBattle.rounds
      .map((r) => {
        const roundType = r.roundType || `Round ${r.roundNumber || '?'}`;
        const performer = r.performer || 'Unknown';
        return `[${roundType.toUpperCase()} - ${performer.toUpperCase()}]\n${r.lyrics || ''}`;
      })
      .join('\n\n');
  };

  const getProtagonistLyrics = () => {
    if (!generatedBattle) return '';
    const protagonistName = series.protagonist?.name || '';
    return generatedBattle.rounds
      .filter((r) => r.performer === protagonistName)
      .map((r) => {
        const roundType = r.roundType || `Round ${r.roundNumber || '?'}`;
        return `[${roundType.toUpperCase()} - ${r.performer.toUpperCase()}]\n${r.lyrics || ''}`;
      })
      .join('\n\n');
  };

  const getAntagonistLyrics = () => {
    if (!generatedBattle) return '';
    const antagonistName = series.antagonist?.name || '';
    return generatedBattle.rounds
      .filter((r) => r.performer === antagonistName)
      .map((r) => {
        const roundType = r.roundType || `Round ${r.roundNumber || '?'}`;
        return `[${roundType.toUpperCase()} - ${r.performer.toUpperCase()}]\n${r.lyrics || ''}`;
      })
      .join('\n\n');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i)) {
        setMusicFile(file);
        toast({ title: 'Music file added', description: file.name });
      } else {
        toast({ title: 'Invalid file type', description: 'Please drop an audio file', variant: 'destructive' });
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setMusicFile(files[0]);
      toast({ title: 'Music file selected', description: files[0].name });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Rap Battle Generator
          </DialogTitle>
          <DialogDescription>
            Create an epic lyrical showdown between {series.protagonist?.name || 'protagonist'} and{' '}
            {series.antagonist?.name || 'antagonist'}
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex-1 overflow-y-auto pr-2"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--primary)) transparent' }}
        >
          {!generatedBattle ? (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Mic2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{series.protagonist?.name || 'Protagonist'}</p>
                      <p className="text-xs text-muted-foreground">Hero</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {series.protagonist?.motivation || 'Will defend their honor'}
                  </p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                      <Mic2 className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="font-medium">{series.antagonist?.name || 'Antagonist'}</p>
                      <p className="text-xs text-muted-foreground">Villain</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {series.antagonist?.motivation || 'Seeks to dominate'}
                  </p>
                </Card>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="battleTheme">Battle Theme</Label>
                  <Input
                    id="battleTheme"
                    placeholder="What's the core conflict? (e.g., 'legacy vs destruction', 'truth vs lies')"
                    value={battleTheme}
                    onChange={(e) => setBattleTheme(e.target.value)}
                    data-testid="input-battle-theme"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="conflictType">Conflict Type</Label>
                  <Select value={conflictType} onValueChange={setConflictType}>
                    <SelectTrigger data-testid="select-conflict-type">
                      <SelectValue placeholder="Select conflict type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="power">Power Struggle</SelectItem>
                      <SelectItem value="honor">Honor & Pride</SelectItem>
                      <SelectItem value="revenge">Revenge & Justice</SelectItem>
                      <SelectItem value="survival">Survival & Dominance</SelectItem>
                      <SelectItem value="ideology">Clashing Ideologies</SelectItem>
                      <SelectItem value="territory">Territory & Control</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-base font-medium">Production Style</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="productionStyle" className="text-sm">
                        Beat Style
                      </Label>
                      <Select value={productionStyle} onValueChange={setProductionStyle}>
                        <SelectTrigger data-testid="select-production-style">
                          <SelectValue placeholder="Select beat style" />
                        </SelectTrigger>
                        <SelectContent>
                          {styleOptions?.data?.productionStyles?.map((style) => (
                            <SelectItem key={style.key} value={style.key}>
                              {style.name}
                            </SelectItem>
                          )) || (
                            <>
                              <SelectItem value="hard_trap">Hard Trap</SelectItem>
                              <SelectItem value="boom_bap_battle">Boom Bap Battle</SelectItem>
                              <SelectItem value="dark_orchestral_trap">Dark Orchestral</SelectItem>
                              <SelectItem value="melodic_trap">Melodic Trap</SelectItem>
                              <SelectItem value="drill">Drill</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bpm" className="text-sm">
                        BPM
                      </Label>
                      <Select value={bpm.toString()} onValueChange={(v) => setBpm(parseInt(v))}>
                        <SelectTrigger data-testid="select-bpm">
                          <SelectValue placeholder="Select tempo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="90">90 BPM (Slow)</SelectItem>
                          <SelectItem value="110">110 BPM (Medium)</SelectItem>
                          <SelectItem value="130">130 BPM (Uptempo)</SelectItem>
                          <SelectItem value="140">140 BPM (Fast)</SelectItem>
                          <SelectItem value="150">150 BPM (Aggressive)</SelectItem>
                          <SelectItem value="160">160 BPM (Intense)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-base font-medium">Vocal Styles</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm text-primary">{series.protagonist?.name || 'Protagonist'}</Label>
                      <Select value={protagonistVocalStyle} onValueChange={setProtagonistVocalStyle}>
                        <SelectTrigger data-testid="select-protagonist-vocal">
                          <SelectValue placeholder="Vocal style" />
                        </SelectTrigger>
                        <SelectContent>
                          {styleOptions?.data?.vocalStyles?.map((style) => (
                            <SelectItem key={style.key} value={style.key}>
                              {style.name}
                            </SelectItem>
                          )) || (
                            <>
                              <SelectItem value="raw_rap">Raw Rap</SelectItem>
                              <SelectItem value="melodic_flow">Melodic Flow</SelectItem>
                              <SelectItem value="aggressive_attack">Aggressive Attack</SelectItem>
                              <SelectItem value="smooth_delivery">Smooth Delivery</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <Select value={protagonistTone} onValueChange={setProtagonistTone}>
                        <SelectTrigger data-testid="select-protagonist-tone">
                          <SelectValue placeholder="Emotional tone" />
                        </SelectTrigger>
                        <SelectContent>
                          {styleOptions?.data?.emotionalTones?.map((tone) => (
                            <SelectItem key={tone.key} value={tone.key}>
                              {tone.name}
                            </SelectItem>
                          )) || (
                            <>
                              <SelectItem value="rising_from_ashes">Rising From Ashes</SelectItem>
                              <SelectItem value="righteous_fury">Righteous Fury</SelectItem>
                              <SelectItem value="underdog_fire">Underdog Fire</SelectItem>
                              <SelectItem value="calm_confidence">Calm Confidence</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-destructive">{series.antagonist?.name || 'Antagonist'}</Label>
                      <Select value={antagonistVocalStyle} onValueChange={setAntagonistVocalStyle}>
                        <SelectTrigger data-testid="select-antagonist-vocal">
                          <SelectValue placeholder="Vocal style" />
                        </SelectTrigger>
                        <SelectContent>
                          {styleOptions?.data?.vocalStyles?.map((style) => (
                            <SelectItem key={style.key} value={style.key}>
                              {style.name}
                            </SelectItem>
                          )) || (
                            <>
                              <SelectItem value="raw_rap">Raw Rap</SelectItem>
                              <SelectItem value="melodic_flow">Melodic Flow</SelectItem>
                              <SelectItem value="aggressive_attack">Aggressive Attack</SelectItem>
                              <SelectItem value="smooth_delivery">Smooth Delivery</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <Select value={antagonistTone} onValueChange={setAntagonistTone}>
                        <SelectTrigger data-testid="select-antagonist-tone">
                          <SelectValue placeholder="Emotional tone" />
                        </SelectTrigger>
                        <SelectContent>
                          {styleOptions?.data?.emotionalTones?.map((tone) => (
                            <SelectItem key={tone.key} value={tone.key}>
                              {tone.name}
                            </SelectItem>
                          )) || (
                            <>
                              <SelectItem value="dismissive_cold">Dismissive Cold</SelectItem>
                              <SelectItem value="arrogant_superiority">Arrogant Superiority</SelectItem>
                              <SelectItem value="menacing_threat">Menacing Threat</SelectItem>
                              <SelectItem value="calculated_destruction">Calculated Destruction</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Engagement Engine Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-500" />
                    <Label className="text-base font-medium">Engagement Engine</Label>
                    <Badge variant="secondary" className="text-xs">
                      Viral Triggers
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Content Preset</Label>
                      <Select value={engagementPreset} onValueChange={handlePresetChange}>
                        <SelectTrigger data-testid="select-engagement-preset">
                          <SelectValue placeholder="Select preset" />
                        </SelectTrigger>
                        <SelectContent>
                          {engagementOptions?.data?.presets ? (
                            Object.entries(engagementOptions.data.presets).map(([key, preset]) => (
                              <SelectItem key={key} value={key}>
                                {preset.name}
                              </SelectItem>
                            ))
                          ) : (
                            <>
                              <SelectItem value="viral_battle">Viral Battle Track</SelectItem>
                              <SelectItem value="emotional_ballad">Emotional Ballad</SelectItem>
                              <SelectItem value="hype_anthem">Hype Anthem</SelectItem>
                              <SelectItem value="story_song">Story Song</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {engagementOptions?.data?.presets?.[engagementPreset]?.description ||
                          'Optimized trigger combination'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Viral Structure</Label>
                      <Select value={viralStructure} onValueChange={setViralStructure}>
                        <SelectTrigger data-testid="select-viral-structure">
                          <SelectValue placeholder="Select structure" />
                        </SelectTrigger>
                        <SelectContent>
                          {engagementOptions?.data?.structures ? (
                            Object.entries(engagementOptions.data.structures).map(([key, struct]) => (
                              <SelectItem key={key} value={key}>
                                {struct.name}
                              </SelectItem>
                            ))
                          ) : (
                            <>
                              <SelectItem value="hook_hold_payoff">Hook → Hold → Payoff</SelectItem>
                              <SelectItem value="open_loop">Open Loop</SelectItem>
                              <SelectItem value="perspective_flip">Perspective Flip</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {engagementOptions?.data?.structures?.[viralStructure]?.description ||
                          'Narrative structure for virality'}
                      </p>
                    </div>
                  </div>

                  {/* Trigger Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm">Active Triggers ({selectedTriggers?.length || 0})</Label>
                    <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
                      {engagementOptions?.data?.triggers ? (
                        Object.entries(engagementOptions.data.triggers).map(([key, trigger]) => (
                          <Badge
                            key={key}
                            variant={selectedTriggers?.includes(key) ? 'default' : 'outline'}
                            className={`cursor-pointer text-xs ${
                              selectedTriggers?.includes(key)
                                ? trigger.type === 'comment'
                                  ? 'bg-blue-500'
                                  : trigger.type === 'rewatch'
                                    ? 'bg-purple-500'
                                    : trigger.type === 'share'
                                      ? 'bg-green-500'
                                      : 'bg-orange-500'
                                : ''
                            }`}
                            onClick={() => toggleTrigger(key)}
                            data-testid={`trigger-${key}`}
                          >
                            {trigger.name}
                          </Badge>
                        ))
                      ) : (
                        <>
                          <Badge
                            variant={selectedTriggers?.includes('hot_take') ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => toggleTrigger('hot_take')}
                          >
                            Hot Take
                          </Badge>
                          <Badge
                            variant={selectedTriggers?.includes('quotable_bar') ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => toggleTrigger('quotable_bar')}
                          >
                            Quotable Bar
                          </Badge>
                          <Badge
                            variant={selectedTriggers?.includes('callback_hook') ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => toggleTrigger('callback_hook')}
                          >
                            Callback Hook
                          </Badge>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Click triggers to toggle. Colors:
                      <span className="text-blue-500 ml-1">Comment</span> •
                      <span className="text-purple-500 ml-1">Rewatch</span> •
                      <span className="text-green-500 ml-1">Share</span> •
                      <span className="text-orange-500 ml-1">Save</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => generateBattleMutation.mutate()}
                  disabled={generateBattleMutation.isPending || !battleTheme.trim()}
                  data-testid="button-generate-battle"
                >
                  {generateBattleMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Battle...
                    </>
                  ) : (
                    <>
                      <Swords className="mr-2 h-4 w-4" />
                      Generate Rap Battle
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{generatedBattle.title}</h3>
                  <p className="text-sm text-muted-foreground">{generatedBattle.synopsis}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGeneratedBattle(null)}
                    data-testid="button-regenerate"
                  >
                    <Sparkles className="mr-1 h-4 w-4" />
                    Regenerate
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveBattleMutation.mutate()}
                    disabled={saveBattleMutation.isPending}
                    data-testid="button-save-battle"
                  >
                    {saveBattleMutation.isPending ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-1 h-4 w-4" />
                        Save to Episode
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Full Lyrics</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(getAllLyrics(), 'Lyrics')}
                    data-testid="button-copy-lyrics"
                  >
                    <Copy className="mr-1 h-4 w-4" />
                    Copy All
                  </Button>
                </div>

                <ScrollArea className="h-[300px] border rounded-lg p-4 bg-muted/50">
                  <pre className="text-sm whitespace-pre-wrap font-mono">{getAllLyrics()}</pre>
                </ScrollArea>
              </div>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Suno Style</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(generatedBattle.sunoStyle, 'Style')}
                    data-testid="button-copy-style"
                  >
                    <Copy className="mr-1 h-4 w-4" />
                    Copy
                  </Button>
                </div>
                <p className="text-sm bg-background p-2 rounded border">{generatedBattle.sunoStyle}</p>

                <div>
                  <Label className="font-medium">Hook Moment</Label>
                  <p className="text-sm text-muted-foreground mt-1">{generatedBattle.hookMoment}</p>
                </div>

                <div>
                  <Label className="font-medium">Visual Theme</Label>
                  <p className="text-sm text-muted-foreground mt-1">{generatedBattle.visualTheme}</p>
                </div>
              </Card>

              <div className="space-y-2">
                <Label className="font-medium">Round Breakdown</Label>
                <div className="grid grid-cols-2 gap-2">
                  {generatedBattle.rounds.map((round, idx) => (
                    <Card key={idx} className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={round.performer === series.protagonist?.name ? 'default' : 'destructive'}>
                          Round {round.roundNumber}
                        </Badge>
                        <span className="text-sm font-medium">{round.roundType}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{round.performer}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{round.scene.environment}</p>
                    </Card>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Pre-Publish Engagement Checklist */}
              {engagementChecklist?.data && (
                <Card className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="h-5 w-5 text-orange-500" />
                      <Label className="text-base font-medium">Pre-Publish Checklist</Label>
                    </div>
                    <Badge variant={getChecklistProgress().percentage >= 80 ? 'default' : 'secondary'}>
                      {getChecklistProgress().checked}/{getChecklistProgress().total} (
                      {getChecklistProgress().percentage}%)
                    </Badge>
                  </div>

                  <Progress value={getChecklistProgress().percentage} className="h-2" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(engagementChecklist.data).map(([key, section]) => (
                      <div key={key} className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">{section.title}</Label>
                        <div className="space-y-1.5">
                          {section.items.map((item) => (
                            <div key={item.id} className="flex items-start gap-2">
                              <Checkbox
                                id={item.id}
                                checked={checkedItems[item.id] || false}
                                onCheckedChange={() => toggleCheckItem(item.id)}
                                className="mt-0.5"
                                data-testid={`checkbox-${item.id}`}
                              />
                              <label
                                htmlFor={item.id}
                                className={`text-xs cursor-pointer ${
                                  checkedItems[item.id] ? 'text-muted-foreground line-through' : ''
                                }`}
                              >
                                {item.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {getChecklistProgress().percentage < 80 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Complete at least 80% of the checklist before publishing for maximum engagement
                    </p>
                  )}
                </Card>
              )}

              <Separator />

              <div className="space-y-4">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Music for Video Generation
                </Label>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : musicFile
                        ? 'border-green-500 bg-green-500/5'
                        : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                  data-testid="dropzone-music"
                >
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="music-file-input"
                    data-testid="input-music-file"
                  />
                  <label htmlFor="music-file-input" className="cursor-pointer">
                    {musicFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-green-500" />
                        <p className="font-medium text-green-700 dark:text-green-400">{musicFile.name}</p>
                        <p className="text-xs text-muted-foreground">Click or drop to replace</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <FileAudio className="h-8 w-8 text-muted-foreground" />
                        <p className="font-medium">Drop your Suno-generated music here</p>
                        <p className="text-xs text-muted-foreground">or click to browse (MP3, WAV, M4A)</p>
                      </div>
                    )}
                  </label>
                </div>

                {musicFile && (
                  <div className="space-y-3">
                    <Label className="font-medium">Separate Lyrics (for Suno versions)</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                              <Mic2 className="h-3 w-3 text-primary" />
                            </div>
                            <span className="text-sm font-medium">{series.protagonist?.name || 'Protagonist'}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(getProtagonistLyrics(), `${series.protagonist?.name}'s Lyrics`)
                            }
                            data-testid="button-copy-protagonist-lyrics"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {generatedBattle.rounds.filter((r) => r.performer === series.protagonist?.name).length} rounds
                        </p>
                      </Card>

                      <Card className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-destructive/20 flex items-center justify-center">
                              <Mic2 className="h-3 w-3 text-destructive" />
                            </div>
                            <span className="text-sm font-medium">{series.antagonist?.name || 'Antagonist'}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(getAntagonistLyrics(), `${series.antagonist?.name}'s Lyrics`)
                            }
                            data-testid="button-copy-antagonist-lyrics"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {generatedBattle.rounds.filter((r) => r.performer === series.antagonist?.name).length} rounds
                        </p>
                      </Card>
                    </div>
                  </div>
                )}

                {musicFile && (
                  <div className="space-y-3">
                    <Label className="font-medium flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Video Generation Mode
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <Card
                        className={`p-4 cursor-pointer transition-all ${
                          videoMode === 'veo'
                            ? 'border-primary bg-primary/5 ring-2 ring-primary'
                            : 'hover:border-muted-foreground/50'
                        }`}
                        onClick={() => setVideoMode('veo')}
                        data-testid="mode-select-veo"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                              videoMode === 'veo' ? 'border-primary' : 'border-muted-foreground'
                            }`}
                          >
                            {videoMode === 'veo' && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">VEO Mode</span>
                              <Badge variant="secondary" className="text-xs">
                                Higher Quality
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Google VEO 2 - Best visual quality, cinematic physics & lighting
                            </p>
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                              Characters may vary between scenes
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card
                        className={`p-4 cursor-pointer transition-all ${
                          videoMode === 'consistent'
                            ? 'border-primary bg-primary/5 ring-2 ring-primary'
                            : 'hover:border-muted-foreground/50'
                        }`}
                        onClick={() => setVideoMode('consistent')}
                        data-testid="mode-select-consistent"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                              videoMode === 'consistent' ? 'border-primary' : 'border-muted-foreground'
                            }`}
                          >
                            {videoMode === 'consistent' && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Consistent Mode</span>
                              <Badge variant="outline" className="text-xs">
                                Same Face
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              IP-Adapter + Luma - Same character appearance across all scenes
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                              Uses character profile portraits
                            </p>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Aspect Ratio Selection */}
                    <div className="pt-3">
                      <Label className="font-medium flex items-center gap-2 mb-3">
                        <Monitor className="h-4 w-4" />
                        Aspect Ratio
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Card
                          className={`p-3 cursor-pointer transition-all ${
                            aspectRatio === '9:16'
                              ? 'border-primary bg-primary/5 ring-2 ring-primary'
                              : 'hover:border-muted-foreground/50'
                          }`}
                          onClick={() => setAspectRatio('9:16')}
                          data-testid="aspect-ratio-9-16"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-10 border-2 rounded flex items-center justify-center text-xs font-mono border-current">
                              9:16
                            </div>
                            <div>
                              <span className="font-medium">Vertical</span>
                              <p className="text-xs text-muted-foreground">TikTok, Reels, Shorts</p>
                            </div>
                          </div>
                        </Card>

                        <Card
                          className={`p-3 cursor-pointer transition-all ${
                            aspectRatio === '16:9'
                              ? 'border-primary bg-primary/5 ring-2 ring-primary'
                              : 'hover:border-muted-foreground/50'
                          }`}
                          onClick={() => setAspectRatio('16:9')}
                          data-testid="aspect-ratio-16-9"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-6 border-2 rounded flex items-center justify-center text-xs font-mono border-current">
                              16:9
                            </div>
                            <div>
                              <span className="font-medium">Horizontal</span>
                              <p className="text-xs text-muted-foreground">YouTube, Desktop</p>
                            </div>
                          </div>
                        </Card>
                      </div>
                    </div>
                  </div>
                )}

                {musicFile && (
                  <div className="space-y-3 pt-3 border-t">
                    <Label className="font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Post-Processing Options
                    </Label>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={enableCaptions}
                              onCheckedChange={setEnableCaptions}
                              data-testid="switch-enable-captions"
                            />
                            <span className="text-sm">Lyric Captions</span>
                          </div>
                        </div>

                        {enableCaptions && (
                          <Select value={captionStyle} onValueChange={(v) => setCaptionStyle(v as typeof captionStyle)}>
                            <SelectTrigger className="w-full" data-testid="select-caption-style">
                              <SelectValue placeholder="Caption style" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bold">Bold - Large impact text</SelectItem>
                              <SelectItem value="neon">Neon - Cyan/magenta glow</SelectItem>
                              <SelectItem value="fire">Fire - Orange/gold flames</SelectItem>
                              <SelectItem value="clean">Clean - Helvetica soft shadow</SelectItem>
                              <SelectItem value="minimal">Minimal - White with outline</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={enableLoop}
                              onCheckedChange={setEnableLoop}
                              data-testid="switch-enable-loop"
                            />
                            <span className="text-sm">Auto-Loop</span>
                          </div>
                        </div>

                        {enableLoop && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Crossfade:</span>
                            <Slider
                              value={[loopCrossfade]}
                              onValueChange={([v]) => setLoopCrossfade(v)}
                              min={0.3}
                              max={3.0}
                              step={0.1}
                              className="flex-1"
                              data-testid="slider-loop-crossfade"
                            />
                            <span className="text-xs font-mono w-8">{loopCrossfade.toFixed(1)}s</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {enableCaptions && enableLoop
                        ? `Captions (${captionStyle}) + seamless loop (${loopCrossfade}s crossfade)`
                        : enableCaptions
                          ? `Captions only (${captionStyle} style)`
                          : enableLoop
                            ? `Loop only (${loopCrossfade}s crossfade)`
                            : 'No post-processing'}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>

                {musicFile && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => createEpisodeMutation.mutate('protagonist')}
                      disabled={createEpisodeMutation.isPending || generateBothVersionsMutation.isPending}
                      data-testid="button-create-protagonist-episode"
                    >
                      {createEpisodeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Mic2 className="mr-2 h-4 w-4 text-primary" />
                      )}
                      {series.protagonist?.name || 'Protagonist'} Only
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => createEpisodeMutation.mutate('antagonist')}
                      disabled={createEpisodeMutation.isPending || generateBothVersionsMutation.isPending}
                      data-testid="button-create-antagonist-episode"
                    >
                      {createEpisodeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Mic2 className="mr-2 h-4 w-4 text-destructive" />
                      )}
                      {series.antagonist?.name || 'Antagonist'} Only
                    </Button>

                    <Button
                      onClick={() => generateBothVersionsMutation.mutate()}
                      disabled={createEpisodeMutation.isPending || generateBothVersionsMutation.isPending}
                      data-testid="button-create-both-episodes"
                    >
                      {generateBothVersionsMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Both...
                        </>
                      ) : (
                        <>
                          <Swords className="mr-2 h-4 w-4" />
                          Generate Both Versions
                        </>
                      )}
                    </Button>
                  </>
                )}

                {!musicFile && (
                  <Button disabled variant="secondary">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Music to Generate
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
