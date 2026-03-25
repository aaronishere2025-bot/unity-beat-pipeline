import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DollarSign, Loader2, Gift, Zap } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AddFundsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QUICK_AMOUNTS = [
  { amount: 10, credits: 100, label: '100', bonus: 0, badge: null },
  { amount: 50, credits: 550, label: '550', bonus: 50, badge: '+50 • 10%' },
  { amount: 100, credits: 1150, label: '1,150', bonus: 150, badge: '+150 • 15%' },
  { amount: 250, credits: 2875, label: '2,875', bonus: 375, badge: '+375 • 15%' },
  { amount: 500, credits: 5750, label: '5,750', bonus: 750, badge: '+750 • 15%' },
  { amount: 1000, credits: 12000, label: '12,000', bonus: 2000, badge: '+2,000 • 20%' },
];

export function AddFundsModal({ open, onOpenChange }: AddFundsModalProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<number>(100);
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate credits with progressive bonus tiers
  const calculateCredits = (dollars: number) => {
    const baseCredits = dollars * 10;
    let bonusPercent = 0;

    // Progressive bonus tiers
    if (dollars >= 1000) {
      bonusPercent = 0.2; // 20% bonus
    } else if (dollars >= 500) {
      bonusPercent = 0.15; // 15% bonus
    } else if (dollars >= 100) {
      bonusPercent = 0.15; // 15% bonus
    } else if (dollars >= 50) {
      bonusPercent = 0.1; // 10% bonus
    }

    const bonus = Math.floor(baseCredits * bonusPercent);
    return baseCredits + bonus;
  };

  const credits = calculateCredits(amount);
  const baseCredits = amount * 10;
  const bonus = credits - baseCredits;

  const handleAddFunds = async () => {
    if (amount < 10) {
      toast({
        title: 'Invalid Amount',
        description: 'Minimum purchase is $10 (100 credits)',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      const response = await apiRequest('POST', '/api/stripe/create-add-funds-session', {
        amount,
      });

      const data = await response.json();

      if (data.sessionUrl) {
        // Redirect to Stripe Checkout
        window.location.href = data.sessionUrl;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error: any) {
      console.error('Add funds error:', error);
      toast({
        title: 'Payment Failed',
        description: error.message || 'Failed to create checkout session',
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Buy Credits
          </DialogTitle>
          <DialogDescription>1 credit = $0.10 • Credits never expire • Use anytime</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quick Amount Buttons */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Credit Packages</Label>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((preset) => (
                <Button
                  key={preset.amount}
                  variant={amount === preset.amount ? 'default' : 'outline'}
                  onClick={() => setAmount(preset.amount)}
                  className={`flex flex-col h-auto py-3 relative ${preset.bonus > 0 ? 'border-green-500/50' : ''}`}
                >
                  {preset.badge && (
                    <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-green-500 text-[10px] px-1.5 py-0">
                      {preset.badge}
                    </Badge>
                  )}
                  <span className="text-base font-bold">{preset.label}</span>
                  <span className="text-xs text-muted-foreground">credits</span>
                  <span className="text-xs text-muted-foreground mt-0.5">${preset.amount}</span>
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Custom Amount Input */}
          <div>
            <Label htmlFor="custom-amount" className="text-sm font-medium mb-2 block">
              Or Enter Custom Amount
            </Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="custom-amount"
                type="number"
                min="10"
                step="10"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="pl-9"
                placeholder="Enter amount"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Minimum: $10 (100 credits)</p>
          </div>

          <Separator />

          {/* Summary */}
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">You Pay</span>
              <span className="text-2xl font-bold">${amount.toFixed(2)}</span>
            </div>

            <Separator />

            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1 font-medium">
                <Zap className="w-5 h-5 text-primary" />
                You Get
              </span>
              <span className="text-3xl font-bold text-primary">{credits.toLocaleString()} credits</span>
            </div>

            {bonus > 0 && (
              <div className="flex items-center justify-center gap-2 bg-green-500/10 rounded py-1.5">
                <Gift className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-600">
                  +{bonus.toLocaleString()} bonus credits included!
                </span>
              </div>
            )}

            <div className="text-xs text-center text-muted-foreground">
              {amount >= 1000 && '20% bonus on $1,000+ • '}
              {amount >= 500 && amount < 1000 && '15% bonus on $500+ • '}
              {amount >= 100 && amount < 500 && '15% bonus on $100+ • '}
              {amount >= 50 && amount < 100 && '10% bonus on $50+ • '}
              Credits never expire
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>

          <Button onClick={handleAddFunds} disabled={isProcessing || amount < 10}>
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Buy {credits.toLocaleString()} Credits
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
