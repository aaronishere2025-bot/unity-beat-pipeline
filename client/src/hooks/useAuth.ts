/**
 * useAuth Hook - Manages user authentication state
 * Provides current user, login status, and auth methods
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  freeBeatCreditsRemaining: number;
  stripeCustomerId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

async function fetchCurrentUser(): Promise<User | null> {
  const response = await fetch('/api/auth/me', {
    credentials: 'include', // Include cookies
  });

  if (response.status === 401) {
    return null; // Not authenticated
  }

  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }

  return response.json();
}

async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Logout failed');
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  // Fetch current user
  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery<User | null>({
    queryKey: ['user'],
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Clear user data from cache
      queryClient.setQueryData(['user'], null);
      queryClient.invalidateQueries({ queryKey: ['user'] });

      // Redirect to home
      window.location.href = '/';
    },
  });

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    refetch,
  };
}

/**
 * Get Google OAuth authorization URL
 */
export async function getGoogleAuthUrl(): Promise<string> {
  const response = await fetch('/api/auth/google/url');
  if (!response.ok) {
    throw new Error('Failed to get auth URL');
  }
  const data = await response.json();
  return data.authUrl;
}

/**
 * Redirect to Google OAuth login
 */
export async function loginWithGoogle(): Promise<void> {
  const authUrl = await getGoogleAuthUrl();
  window.location.href = authUrl;
}
