import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import {
  Store,
  Plus,
  TrendingUp,
  DollarSign,
  Eye,
  ShoppingCart,
  Music,
  Loader2,
  ExternalLink,
  BarChart3,
  Copy,
  Check,
} from 'lucide-react';

interface BeatListing {
  id: string;
  beatName: string;
  description: string | null;
  priceUSD: string;
  stripePaymentLinkUrl: string;
  views: number;
  purchases: number;
  totalRevenueUSD: string;
  isGenerated: boolean;
  active: boolean;
  createdAt: string;
}

interface Analytics {
  totalListings: number;
  activeListings: number;
  totalSales: number;
  totalRevenue: string;
  totalViews: number;
  conversionRate: string;
  avgRevenuePerListing: string;
}

export default function BeatStore() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [listings, setListings] = useState<BeatListing[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [selectedJobId, setSelectedJobId] = useState('');
  const [beatName, setBeatName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('9.99');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load listings
      const listingsRes = await fetch('/api/beat-store/listings', {
        credentials: 'include',
      });

      if (!listingsRes.ok) {
        if (listingsRes.status === 401) {
          setLocation('/dashboard');
          return;
        }
        throw new Error('Failed to load listings');
      }

      const listingsData = await listingsRes.json();
      setListings(listingsData.listings || []);

      // Load analytics
      const analyticsRes = await fetch('/api/beat-store/analytics', {
        credentials: 'include',
      });

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load beat store data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/beat-store/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jobId: selectedJobId,
          beatName,
          description,
          priceUSD: parseFloat(price),
          isGenerated: true, // Platform-generated (0% commission)
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create listing');
      }

      toast({
        title: 'Success!',
        description: 'Your beat is now listed for sale',
      });

      setIsDialogOpen(false);
      loadData();

      // Reset form
      setSelectedJobId('');
      setBeatName('');
      setDescription('');
      setPrice('9.99');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create listing',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPaymentLink = (listing: BeatListing) => {
    navigator.clipboard.writeText(listing.stripePaymentLinkUrl);
    setCopiedId(listing.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: 'Copied!',
      description: 'Payment link copied to clipboard',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Store className="w-8 h-8" />
              Beat Store
            </h1>
            <p className="text-muted-foreground mt-1">List and sell your AI-generated beats</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                List Beat
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>List Beat for Sale</DialogTitle>
                <DialogDescription>
                  Create a Stripe payment link for your beat. 0% commission on platform-generated beats!
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateListing} className="space-y-4">
                <div>
                  <Label htmlFor="jobId">Job ID</Label>
                  <Input
                    id="jobId"
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    placeholder="Enter job ID from completed beat generation"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Find this in your jobs dashboard</p>
                </div>

                <div>
                  <Label htmlFor="beatName">Beat Name</Label>
                  <Input
                    id="beatName"
                    value={beatName}
                    onChange={(e) => setBeatName(e.target.value)}
                    placeholder="e.g., Trap Beat #1 - Dark Vibes"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your beat..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="price">Price (USD)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0.99"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">You keep 100% (0% commission)</p>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Listing'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Analytics */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  Total Listings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalListings}</div>
                <p className="text-xs text-muted-foreground mt-1">{analytics.activeListings} active</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Total Sales
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalSales}</div>
                <p className="text-xs text-muted-foreground mt-1">{analytics.conversionRate} conversion</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${analytics.totalRevenue}</div>
                <p className="text-xs text-muted-foreground mt-1">${analytics.avgRevenuePerListing} avg per beat</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Total Views
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalViews}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all listings</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Listings */}
        <Card>
          <CardHeader>
            <CardTitle>Your Listings</CardTitle>
            <CardDescription>
              {listings.length === 0
                ? 'No listings yet. Create your first listing above!'
                : `${listings.length} beat${listings.length !== 1 ? 's' : ''} listed for sale`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {listings.length === 0 ? (
              <div className="text-center py-12">
                <Music className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No beats listed yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {listings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{listing.beatName}</h3>
                        {listing.isGenerated && (
                          <Badge variant="secondary" className="text-xs">
                            0% Fee
                          </Badge>
                        )}
                        {listing.active ? (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      {listing.description && (
                        <p className="text-sm text-muted-foreground mb-2">{listing.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />${listing.priceUSD}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {listing.views} views
                        </span>
                        <span className="flex items-center gap-1">
                          <ShoppingCart className="w-3 h-3" />
                          {listing.purchases} sales
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />${listing.totalRevenueUSD} revenue
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyPaymentLink(listing)}>
                        {copiedId === listing.id ? (
                          <Check className="w-4 h-4 mr-2" />
                        ) : (
                          <Copy className="w-4 h-4 mr-2" />
                        )}
                        Copy Link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(listing.stripePaymentLinkUrl, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Commission Structure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">Platform-Generated Beats</p>
                <p className="text-sm text-muted-foreground">Beats generated through our platform</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-green-700 dark:text-green-400">0%</div>
                <p className="text-xs text-muted-foreground">commission</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div>
                <p className="font-medium text-blue-700 dark:text-blue-400">External Uploads</p>
                <p className="text-sm text-muted-foreground">Beats uploaded from external sources</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">10%</div>
                <p className="text-xs text-muted-foreground">commission</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
