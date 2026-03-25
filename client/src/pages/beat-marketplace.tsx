import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import BeatPlayer from '@/components/BeatPlayer';
import {
  Store,
  Search,
  Filter,
  TrendingUp,
  Clock,
  Music2,
  ExternalLink,
  ShoppingCart,
  Sparkles,
  Tag,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Beat {
  id: string;
  beatName: string;
  description: string | null;
  priceUSD: string;
  stripePaymentLinkUrl: string;
  views: number;
  purchases: number;
  isGenerated: boolean;
  audioUrl?: string;
  bpm?: number;
  key?: string;
  duration?: number;
  createdAt: string;
  tags?: string[];
}

type SortOption = 'newest' | 'popular' | 'price-low' | 'price-high';
type FilterOption = 'all' | 'generated' | 'uploaded';

export default function BeatMarketplace() {
  const { toast } = useToast();
  const [beats, setBeats] = useState<Beat[]>([]);
  const [filteredBeats, setFilteredBeats] = useState<Beat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  useEffect(() => {
    loadBeats();
  }, []);

  useEffect(() => {
    filterAndSortBeats();
  }, [beats, searchQuery, sortBy, filterBy]);

  const loadBeats = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/beat-marketplace/browse');

      if (!res.ok) {
        throw new Error('Failed to load beats');
      }

      const data = await res.json();
      setBeats(data.beats || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load beats',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortBeats = () => {
    let filtered = [...beats];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (beat) =>
          beat.beatName.toLowerCase().includes(query) ||
          beat.description?.toLowerCase().includes(query) ||
          beat.tags?.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    // Type filter
    if (filterBy === 'generated') {
      filtered = filtered.filter((beat) => beat.isGenerated);
    } else if (filterBy === 'uploaded') {
      filtered = filtered.filter((beat) => !beat.isGenerated);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'popular':
          return b.purchases - a.purchases;
        case 'price-low':
          return parseFloat(a.priceUSD) - parseFloat(b.priceUSD);
        case 'price-high':
          return parseFloat(b.priceUSD) - parseFloat(a.priceUSD);
        default:
          return 0;
      }
    });

    setFilteredBeats(filtered);
  };

  const handlePurchase = (beat: Beat) => {
    // Track view
    fetch(`/api/beat-marketplace/track-view/${beat.id}`, { method: 'POST' }).catch(console.error);

    // Open Stripe payment link
    window.open(beat.stripePaymentLinkUrl, '_blank');

    toast({
      title: 'Opening Checkout',
      description: "You'll be redirected to Stripe to complete your purchase",
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Store className="w-10 h-10 text-primary" />
              Beat Marketplace
            </h1>
            <p className="text-muted-foreground text-lg">Browse and purchase professional beats for your projects</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Available Beats</div>
            <div className="text-3xl font-bold text-primary">{beats.length}</div>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search beats by name, description, or tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Sort */}
              <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Newest First
                    </div>
                  </SelectItem>
                  <SelectItem value="popular">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Most Popular
                    </div>
                  </SelectItem>
                  <SelectItem value="price-low">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Price: Low to High
                    </div>
                  </SelectItem>
                  <SelectItem value="price-high">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Price: High to Low
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Filter */}
              <Select value={filterBy} onValueChange={(value: FilterOption) => setFilterBy(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      All Beats
                    </div>
                  </SelectItem>
                  <SelectItem value="generated">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      AI Generated
                    </div>
                  </SelectItem>
                  <SelectItem value="uploaded">
                    <div className="flex items-center gap-2">
                      <Music2 className="h-4 w-4" />
                      User Uploaded
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results Count */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {filteredBeats.length} of {beats.length} beats
          </span>
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
              Clear Search
            </Button>
          )}
        </div>

        {/* Beat Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : filteredBeats.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Music2 className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No beats found</h3>
              <p className="text-muted-foreground text-center max-w-md">
                {searchQuery
                  ? 'Try adjusting your search query or filters'
                  : 'No beats are currently available. Check back soon!'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBeats.map((beat) => (
              <Card key={beat.id} className="flex flex-col hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <CardTitle className="text-xl">{beat.beatName}</CardTitle>
                    {beat.isGenerated && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        AI
                      </Badge>
                    )}
                  </div>
                  {beat.description && <CardDescription className="line-clamp-2">{beat.description}</CardDescription>}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                    {beat.bpm && <span>{beat.bpm} BPM</span>}
                    {beat.key && <span>Key: {beat.key}</span>}
                  </div>
                </CardHeader>

                <CardContent className="flex-1">
                  {beat.audioUrl ? (
                    <BeatPlayer
                      audioUrl={beat.audioUrl}
                      bpm={beat.bpm}
                      key={beat.key}
                      duration={beat.duration}
                      compact
                    />
                  ) : (
                    <div className="flex items-center justify-center h-16 bg-muted rounded-lg">
                      <Music2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ShoppingCart className="h-4 w-4" />
                      {beat.purchases} sales
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      {beat.views} views
                    </div>
                  </div>

                  {/* Tags */}
                  {beat.tags && beat.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {beat.tags.slice(0, 3).map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex items-center justify-between border-t pt-4">
                  <div className="text-2xl font-bold text-primary">${parseFloat(beat.priceUSD).toFixed(2)}</div>
                  <Button onClick={() => handlePurchase(beat)} size="lg">
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Buy Now
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Footer */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg mb-1">Want to sell your own beats?</h3>
              <p className="text-sm text-muted-foreground">List your beats on the marketplace and start earning</p>
            </div>
            <Button asChild variant="outline">
              <a href="/beat-store">
                <Store className="h-4 w-4 mr-2" />
                Go to Seller Dashboard
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
