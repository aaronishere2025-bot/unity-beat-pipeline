/**
 * useCredits Hook - Tracks user's credit balance
 * Updates in real-time as credits are used
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';

export interface CreditBalance {
  freeBeatCredits: number;
  totalGenerated: number;
  totalSpent: number;
}

async function fetchCreditBalance(): Promise<CreditBalance> {
  const response = await fetch('/api/user/credits', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch credits');
  }

  return response.json();
}

export function useCredits() {
  const { user, isAuthenticated } = useAuth();

  const {
    data: credits,
    isLoading,
    error,
    refetch,
  } = useQuery<CreditBalance>({
    queryKey: ['credits', user?.id],
    queryFn: fetchCreditBalance,
    enabled: isAuthenticated, // Only fetch if user is logged in
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  // Get free credits from user object (more reliable)
  const freeBeatCredits = user?.freeBeatCreditsRemaining ?? 0;
  const hasCredits = freeBeatCredits > 0;

  return {
    freeBeatCredits,
    hasCredits,
    credits,
    isLoading,
    error,
    refetch,
  };
}
