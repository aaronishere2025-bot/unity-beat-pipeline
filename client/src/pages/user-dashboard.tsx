import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Coins,
  CreditCard,
  TrendingUp,
  Music,
  DollarSign,
  Calendar,
  Loader2,
  LogOut,
  Store,
  Video,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { AddPaymentMethodModal } from '@/components/AddPaymentMethodModal';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  freeBeatCreditsRemaining: number;
  stripeCustomerId: string | null;
  createdAt: string;
}

interface JobStats {
  totalJobs: number;
  completedJobs: number;
  totalSpent: number;
  thisMonthSpent: number;
}

export default function UserDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [jobStats, setJobStats] = useState<JobStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      // Get current user
      const userRes = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (!userRes.ok) {
        if (userRes.status === 401) {
          setLocation('/');
          return;
        }
        throw new Error('Failed to load user data');
      }

      const userData = await userRes.json();
      setUser(userData);

      // Load job stats
      const statsRes = await fetch('/api/user/stats', {
        credentials: 'include',
      });

      if (statsRes.ok) {
        const stats = await statsRes.json();
        setJobStats({
          totalJobs: stats.totalJobs,
          completedJobs: stats.completedJobs,
          totalSpent: parseFloat(stats.totalSpent),
          thisMonthSpent: parseFloat(stats.thisMonthSpent),
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      localStorage.removeItem('auth_token');
      toast({
        title: 'Logged Out',
        description: 'You have been successfully logged out',
      });
      setLocation('/');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to logout',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {user.avatarUrl && (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="w-16 h-16 rounded-full border-2 border-border"
              />
            )}
            <div>
              <h1 className="text-3xl font-bold">{user.displayName}</h1>
              <p className="text-muted-foreground">{user.email}</p>
              <p className="text-sm text-muted-foreground">Member since {memberSince}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Credits Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5" />
              Free Credits
            </CardTitle>
            <CardDescription>Generate beats without payment using your free credits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-4xl font-bold">{user.freeBeatCreditsRemaining}</div>
                <p className="text-sm text-muted-foreground mt-1">beats remaining</p>
              </div>
              <Badge variant={user.freeBeatCreditsRemaining > 0 ? 'default' : 'secondary'}>
                {user.freeBeatCreditsRemaining > 0 ? 'Active' : 'Depleted'}
              </Badge>
            </div>

            {user.freeBeatCreditsRemaining === 0 && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm">
                  Your free credits are depleted. You'll be charged <strong>$2.50 per beat</strong> for new generations.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Video className="w-4 h-4" />
                Total Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{jobStats?.totalJobs || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{jobStats?.completedJobs || 0} completed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Spent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(jobStats?.totalSpent || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(jobStats?.thisMonthSpent || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Current billing period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Avg per Job
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${jobStats?.totalJobs ? ((jobStats?.totalSpent || 0) / jobStats.totalJobs).toFixed(2) : '0.00'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Based on history</p>
            </CardContent>
          </Card>
        </div>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>Pay only for what you generate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Music className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">Beat Generation</p>
                  <p className="text-sm text-muted-foreground">AI-generated instrumentals with commercial license</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">$2.50</div>
                <p className="text-xs text-muted-foreground">per beat</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment Method
            </CardTitle>
            <CardDescription>
              {user.stripeCustomerId
                ? 'Your payment method is on file'
                : 'Add a payment method to continue after free credits'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user.stripeCustomerId ? (
              <Badge variant="default">Payment Method Configured</Badge>
            ) : (
              <Button onClick={() => setShowPaymentModal(true)}>Add Payment Method</Button>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Generate Beats</CardTitle>
              <CardDescription>Create professional AI beats</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setLocation('/generate-beat')}>
                <Music className="w-4 h-4 mr-2" />
                Generate Beat
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Beat Store</CardTitle>
              <CardDescription>List and sell your beats</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" onClick={() => setLocation('/beat-store')}>
                <Store className="w-4 h-4 mr-2" />
                Manage Beat Store
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Method Setup Modal */}
      <AddPaymentMethodModal
        open={showPaymentModal}
        onOpenChange={setShowPaymentModal}
        onSuccess={() => {
          toast({
            title: 'Success!',
            description: 'Payment method added successfully',
          });
          loadUserData(); // Refresh user data to show updated payment status
        }}
      />
    </div>
  );
}
