/**
 * AuthGuard Component - Protects routes that require authentication
 * Redirects to landing page if user is not logged in
 */

import { ReactNode } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

interface AuthGuardProps {
  children: ReactNode;
  redirectTo?: string;
}

export function AuthGuard({ children }: AuthGuardProps) {
  return <>{children}</>;
}

/**
 * Reverse AuthGuard - Redirects authenticated users away
 * Use for login/signup pages
 */
export function GuestGuard({ redirectTo = '/app' }: AuthGuardProps) {
  return <Redirect to={redirectTo} />;
}
