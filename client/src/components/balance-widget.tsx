import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Plus, TrendingUp, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AddFundsModal } from './add-funds-modal';

interface UserBalance {
  balance: number;
  totalSpent: number;
  monthlySpend: number;
  subscriptionTier: string;
}

export function BalanceWidget() {
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);

  const { data: balanceData, isLoading } = useQuery<UserBalance>({
    queryKey: ['/api/auth/balance'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-muted rounded w-32"></div>
            <div className="h-4 bg-muted rounded w-24"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const balance = balanceData?.balance || 0;
  const totalSpent = balanceData?.totalSpent || 0;
  const monthlySpend = balanceData?.monthlySpend || 0;
  const tier = balanceData?.subscriptionTier || 'free';

  // Determine balance status
  const isLowBalance = balance < 10;
  const balanceColor = isLowBalance ? 'text-orange-600' : 'text-green-600';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <CardTitle>Account Balance</CardTitle>
          </div>
          {tier !== 'free' && (
            <Badge variant="secondary" className="capitalize">
              {tier}
            </Badge>
          )}
        </div>
        <CardDescription>Your current credits and spending</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Balance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Current Balance</span>
            {isLowBalance && (
              <Badge variant="outline" className="text-orange-600 border-orange-600">
                Low Balance
              </Badge>
            )}
          </div>
          <div className={`text-4xl font-bold ${balanceColor} flex items-center gap-2`}>
            <DollarSign className="w-8 h-8" />
            {balance.toFixed(2)}
          </div>
        </div>

        {/* Add Funds Button */}
        <Button className="w-full" size="lg" onClick={() => setShowAddFundsModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Funds
        </Button>

        {/* Add Funds Modal */}
        <AddFundsModal open={showAddFundsModal} onOpenChange={setShowAddFundsModal} />

        <Separator />

        {/* Spending Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground mb-1">This Month</div>
            <div className="font-semibold flex items-center gap-1">
              <TrendingUp className="w-4 h-4 text-blue-500" />${monthlySpend.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Lifetime</div>
            <div className="font-semibold">${totalSpent.toFixed(2)}</div>
          </div>
        </div>

        <Separator />

        {/* Quick Pricing Reference */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="font-medium text-foreground mb-2">Pricing Guide</div>
          <div className="flex justify-between">
            <span>AI Beat</span>
            <span className="font-medium">$2.50</span>
          </div>
          <div className="flex justify-between">
            <span>Full Video (30s)</span>
            <span className="font-medium">~$3-6</span>
          </div>
          <div className="flex justify-between">
            <span>Full Video (3 min)</span>
            <span className="font-medium">~$30-50</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
