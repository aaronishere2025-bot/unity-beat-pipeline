import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, DollarSign, Loader2 } from 'lucide-react';

interface CostBreakdown {
  musicCost?: number;
  videoCost?: number;
  postCost?: number;
  total: number;
}

interface CostWarningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costBreakdown: CostBreakdown;
  currentBalance: number;
  onConfirm: () => void;
  isProcessing?: boolean;
  title?: string;
  description?: string;
}

export function CostWarningModal({
  open,
  onOpenChange,
  costBreakdown,
  currentBalance,
  onConfirm,
  isProcessing = false,
  title = 'Confirm Generation',
  description = 'Review the cost before proceeding',
}: CostWarningModalProps) {
  const afterBalance = currentBalance - costBreakdown.total;
  const isInsufficientBalance = afterBalance < 0;
  const isLowBalance = afterBalance < 10 && afterBalance >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cost Breakdown */}
          <div className="space-y-2">
            <div className="text-sm font-medium mb-3">Cost Breakdown</div>

            {costBreakdown.musicCost !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">AI Beat (Suno)</span>
                <span className="font-medium">${costBreakdown.musicCost.toFixed(2)}</span>
              </div>
            )}

            {costBreakdown.videoCost !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Video Generation (Kling)</span>
                <span className="font-medium">${costBreakdown.videoCost.toFixed(2)}</span>
              </div>
            )}

            {costBreakdown.postCost !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Multi-Platform Post</span>
                <span className="font-medium">${costBreakdown.postCost.toFixed(2)}</span>
              </div>
            )}

            <Separator className="my-3" />

            <div className="flex justify-between text-base font-semibold">
              <span>Total Cost</span>
              <span className="text-primary">${costBreakdown.total.toFixed(2)}</span>
            </div>
          </div>

          <Separator />

          {/* Balance Status */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your Current Balance</span>
              <span className="font-medium">${currentBalance.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance After Generation</span>
              <span
                className={`font-semibold ${
                  isInsufficientBalance ? 'text-red-600' : isLowBalance ? 'text-orange-600' : 'text-green-600'
                }`}
              >
                ${Math.max(0, afterBalance).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {isInsufficientBalance && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-red-900 dark:text-red-100 mb-1">Insufficient Balance</div>
                <div className="text-red-700 dark:text-red-300">
                  You need ${Math.abs(afterBalance).toFixed(2)} more to complete this generation. Please add funds to
                  your account.
                </div>
              </div>
            </div>
          )}

          {isLowBalance && !isInsufficientBalance && (
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Low Balance Warning</div>
                <div className="text-orange-700 dark:text-orange-300">
                  Your balance will be low after this generation. Consider adding more funds.
                </div>
              </div>
            </div>
          )}

          {!isInsufficientBalance && !isLowBalance && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-green-900 dark:text-green-100">Ready to Generate</div>
                <div className="text-green-700 dark:text-green-300">
                  You have sufficient balance for this generation.
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>

          {isInsufficientBalance ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                // TODO: Open add funds modal
              }}
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Add Funds
            </Button>
          ) : (
            <Button onClick={onConfirm} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>Generate - ${costBreakdown.total.toFixed(2)}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
