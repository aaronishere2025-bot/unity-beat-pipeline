import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Swords,
  Crown,
  Flame,
  Shield,
  Scroll,
  Building2,
  Globe,
  Sparkles,
  Play,
  Clock,
  DollarSign,
  Zap,
  Search,
  Star,
  ChevronRight,
} from 'lucide-react';

interface TopicItem {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  era: string;
  suggestedFigures: string[];
  color: string;
}

interface TopicCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  topics: TopicItem[];
}

const topicCategories: TopicCategory[] = [
  {
    id: 'ancient',
    name: 'Ancient History',
    description: 'Empires and conquests of the ancient world',
    icon: Scroll,
    topics: [
      {
        id: 'rome',
        name: 'Roman Empire',
        description: 'The rise and fall of Rome',
        icon: Building2,
        era: '753 BC - 476 AD',
        suggestedFigures: ['Julius Caesar', 'Augustus', 'Marcus Aurelius', 'Nero', 'Constantine'],
        color: 'bg-red-500/10 border-red-500/30 hover:border-red-500/50',
      },
      {
        id: 'persian',
        name: 'Persian Empire',
        description: 'Kings of kings and immortal guards',
        icon: Crown,
        era: '550 BC - 330 BC',
        suggestedFigures: ['Cyrus the Great', 'Darius I', 'Xerxes I', 'Artaxerxes'],
        color: 'bg-purple-500/10 border-purple-500/30 hover:border-purple-500/50',
      },
      {
        id: 'greek',
        name: 'Ancient Greece',
        description: 'Philosophy, democracy, and warfare',
        icon: Scroll,
        era: '800 BC - 31 BC',
        suggestedFigures: ['Alexander the Great', 'Leonidas', 'Pericles', 'Themistocles'],
        color: 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500/50',
      },
      {
        id: 'egyptian',
        name: 'Ancient Egypt',
        description: 'Pharaohs and pyramids',
        icon: Crown,
        era: '3100 BC - 30 BC',
        suggestedFigures: ['Cleopatra', 'Ramesses II', 'Tutankhamun', 'Hatshepsut', 'Akhenaten'],
        color: 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50',
      },
      {
        id: 'mongol',
        name: 'Mongol Empire',
        description: 'The great khans and the steppes',
        icon: Swords,
        era: '1206 - 1368 AD',
        suggestedFigures: ['Genghis Khan', 'Kublai Khan', 'Ögedei Khan', 'Subutai'],
        color: 'bg-orange-500/10 border-orange-500/30 hover:border-orange-500/50',
      },
      {
        id: 'chinese',
        name: 'Ancient China',
        description: 'Dynasties and emperors',
        icon: Globe,
        era: '2070 BC - 220 AD',
        suggestedFigures: ['Qin Shi Huang', 'Sun Tzu', 'Confucius', 'Liu Bang'],
        color: 'bg-rose-500/10 border-rose-500/30 hover:border-rose-500/50',
      },
    ],
  },
  {
    id: 'medieval',
    name: 'Medieval Era',
    description: 'Knights, crusades, and kingdoms',
    icon: Shield,
    topics: [
      {
        id: 'crusades',
        name: 'The Crusades',
        description: 'Holy wars and religious conflict',
        icon: Shield,
        era: '1095 - 1291 AD',
        suggestedFigures: ['Richard the Lionheart', 'Saladin', 'Baldwin IV', 'Frederick Barbarossa'],
        color: 'bg-slate-500/10 border-slate-500/30 hover:border-slate-500/50',
      },
      {
        id: 'vikings',
        name: 'Viking Age',
        description: 'Norse raiders and explorers',
        icon: Swords,
        era: '793 - 1066 AD',
        suggestedFigures: ['Ragnar Lothbrok', 'Bjorn Ironside', 'Ivar the Boneless', 'Leif Erikson'],
        color: 'bg-cyan-500/10 border-cyan-500/30 hover:border-cyan-500/50',
      },
      {
        id: 'ottoman',
        name: 'Ottoman Empire',
        description: 'Sultans and conquest',
        icon: Crown,
        era: '1299 - 1922 AD',
        suggestedFigures: ['Suleiman the Magnificent', 'Mehmed II', 'Osman I'],
        color: 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50',
      },
      {
        id: 'samurai',
        name: 'Feudal Japan',
        description: 'Shoguns and samurai warriors',
        icon: Swords,
        era: '1185 - 1868 AD',
        suggestedFigures: ['Oda Nobunaga', 'Tokugawa Ieyasu', 'Miyamoto Musashi', 'Date Masamune'],
        color: 'bg-pink-500/10 border-pink-500/30 hover:border-pink-500/50',
      },
    ],
  },
  {
    id: 'modern',
    name: 'Modern History',
    description: 'World wars and revolutions',
    icon: Flame,
    topics: [
      {
        id: 'ww2',
        name: 'World War II',
        description: 'Global conflict and heroes',
        icon: Flame,
        era: '1939 - 1945',
        suggestedFigures: ['Winston Churchill', 'Dwight Eisenhower', 'George Patton', 'Charles de Gaulle'],
        color: 'bg-zinc-500/10 border-zinc-500/30 hover:border-zinc-500/50',
      },
      {
        id: 'revolution',
        name: 'Revolutions',
        description: 'American, French, and more',
        icon: Flame,
        era: '1775 - 1848',
        suggestedFigures: ['George Washington', 'Napoleon Bonaparte', 'Simón Bolívar', 'Marquis de Lafayette'],
        color: 'bg-indigo-500/10 border-indigo-500/30 hover:border-indigo-500/50',
      },
      {
        id: 'civilwar',
        name: 'American Civil War',
        description: 'Union vs Confederacy',
        icon: Shield,
        era: '1861 - 1865',
        suggestedFigures: ['Abraham Lincoln', 'Ulysses S. Grant', 'Robert E. Lee', 'Frederick Douglass'],
        color: 'bg-blue-600/10 border-blue-600/30 hover:border-blue-600/50',
      },
    ],
  },
];

export default function KlingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedTopic, setSelectedTopic] = useState<TopicItem | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<string>('');
  const [customFigure, setCustomFigure] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [videoFormat, setVideoFormat] = useState<string>('tiktok_9_16');

  const createJobMutation = useMutation({
    mutationFn: async (data: { figure: string; topic: TopicItem; format: string }) => {
      const response = await apiRequest('POST', '/api/kling/generate', {
        figure: data.figure,
        topicId: data.topic.id,
        topicName: data.topic.name,
        era: data.topic.era,
        format: data.format,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Video Generation Started',
        description: `Creating video for ${selectedFigure || customFigure}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      setIsDialogOpen(false);
      setLocation('/jobs');
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleTopicClick = (topic: TopicItem) => {
    setSelectedTopic(topic);
    setSelectedFigure('');
    setCustomFigure('');
    setIsDialogOpen(true);
  };

  const handleGenerate = () => {
    const figure = customFigure || selectedFigure;
    if (!figure || !selectedTopic) {
      toast({
        title: 'Select a Figure',
        description: 'Please choose or enter a historical figure',
        variant: 'destructive',
      });
      return;
    }
    createJobMutation.mutate({
      figure,
      topic: selectedTopic,
      format: videoFormat,
    });
  };

  const filteredCategories = topicCategories
    .map((category) => ({
      ...category,
      topics: category.topics.filter(
        (topic) =>
          topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          topic.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          topic.suggestedFigures.some((f) => f.toLowerCase().includes(searchQuery.toLowerCase())),
      ),
    }))
    .filter((category) => category.topics.length > 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-kling-title">
            <Zap className="w-8 h-8 text-primary" />
            Kling AI Studio
          </h1>
          <p className="text-muted-foreground mt-1">Select a topic and generate professional AI videos automatically</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="px-3 py-1">
            <DollarSign className="w-3 h-3 mr-1" />
            ~$0.14 per 5s clip
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            <Clock className="w-3 h-3 mr-1" />
            ~2 min generation
          </Badge>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search topics, eras, or historical figures..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-topics"
        />
      </div>

      <Tabs defaultValue="ancient" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          {topicCategories.map((category) => (
            <TabsTrigger
              key={category.id}
              value={category.id}
              className="flex items-center gap-2"
              data-testid={`tab-${category.id}`}
            >
              <category.icon className="w-4 h-4" />
              {category.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {topicCategories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(searchQuery ? filteredCategories.find((c) => c.id === category.id)?.topics : category.topics)?.map(
                (topic) => (
                  <Card
                    key={topic.id}
                    className={`cursor-pointer transition-all duration-200 border-2 ${topic.color} hover-elevate`}
                    onClick={() => handleTopicClick(topic)}
                    data-testid={`card-topic-${topic.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <topic.icon className="w-5 h-5" />
                          <CardTitle className="text-lg">{topic.name}</CardTitle>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <CardDescription>{topic.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <Badge variant="secondary" className="text-xs">
                          {topic.era}
                        </Badge>
                        <div className="flex flex-wrap gap-1">
                          {topic.suggestedFigures.slice(0, 3).map((figure) => (
                            <Badge key={figure} variant="outline" className="text-xs">
                              <Star className="w-2 h-2 mr-1" />
                              {figure}
                            </Badge>
                          ))}
                          {topic.suggestedFigures.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{topic.suggestedFigures.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ),
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTopic && <selectedTopic.icon className="w-5 h-5" />}
              {selectedTopic?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTopic?.description} • {selectedTopic?.era}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Historical Figure</Label>
              <Select
                value={selectedFigure}
                onValueChange={(v) => {
                  setSelectedFigure(v);
                  setCustomFigure('');
                }}
              >
                <SelectTrigger data-testid="select-figure">
                  <SelectValue placeholder="Choose a figure..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedTopic?.suggestedFigures.map((figure) => (
                    <SelectItem key={figure} value={figure}>
                      {figure}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Custom Figure</Label>
              <Input
                placeholder="Enter any historical figure..."
                value={customFigure}
                onChange={(e) => {
                  setCustomFigure(e.target.value);
                  setSelectedFigure('');
                }}
                data-testid="input-custom-figure"
              />
            </div>

            <div className="space-y-2">
              <Label>Video Format</Label>
              <Select value={videoFormat} onValueChange={setVideoFormat}>
                <SelectTrigger data-testid="select-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiktok_9_16">TikTok 9:16 (Vertical)</SelectItem>
                  <SelectItem value="youtube_16_9">YouTube 16:9 (Horizontal)</SelectItem>
                  <SelectItem value="instagram_1_1">Instagram 1:1 (Square)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card className="bg-muted/50">
              <CardContent className="p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Cost</span>
                  <span className="font-medium">~$4-6</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">~180 seconds</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Engine</span>
                  <Badge variant="secondary" className="text-xs">
                    Kling 2.5 Turbo
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={createJobMutation.isPending || (!selectedFigure && !customFigure)}
              data-testid="button-generate"
            >
              {createJobMutation.isPending ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Generate Video
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
