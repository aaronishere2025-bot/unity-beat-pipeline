/**
 * CreditBadge Component - Displays user's free credit balance
 * Shows prominently in navigation
 */

import { useCredits } from '@/hooks/useCredits';
import { Sparkles } from 'lucide-react';

export function CreditBadge() {
  const { freeBeatCredits, hasCredits } = useCredits();

  if (freeBeatCredits === 0) {
    return null; // Don't show if no credits
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full text-white text-sm font-medium">
      <Sparkles className="w-4 h-4" />
      <span>
        {freeBeatCredits} Free Beat{freeBeatCredits !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

/**
 * Larger version for dashboard
 */
export function CreditCard() {
  const { freeBeatCredits, hasCredits } = useCredits();

  return (
    <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-6 text-white">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6" />
        <h3 className="text-lg font-semibold">Free Credits</h3>
      </div>

      <div className="mt-4">
        <div className="text-4xl font-bold mb-1">{freeBeatCredits}</div>
        <div className="text-blue-100 text-sm">
          {hasCredits ? 'Free beat generations remaining' : 'No free credits'}
        </div>
      </div>

      {!hasCredits && (
        <div className="mt-4 pt-4 border-t border-white/20">
          <p className="text-sm text-blue-100">Generate beats for just $2.50 each</p>
        </div>
      )}
    </div>
  );
}
