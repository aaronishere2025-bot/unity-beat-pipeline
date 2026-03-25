import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorDetails {
  message: string;
  timestamp: string;
  url: string;
  cookies: string;
  responseStatus?: number;
  responseBody?: string;
  urlParams: string;
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing sign in...');
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Check if we have success parameter (backend redirected here after setting cookie)
      const urlParams = new URLSearchParams(window.location.search);
      const success = urlParams.get('success');
      const error = urlParams.get('error');
      const token = urlParams.get('token'); // Token passed via URL as fallback

      const details: ErrorDetails = {
        message: '',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        cookies: document.cookie || 'NO COOKIES FOUND (httpOnly cookies are hidden)',
        urlParams: window.location.search || 'NO PARAMS',
      };

      if (error) {
        details.message = `OAuth error from URL: ${error}`;
        setErrorDetails(details);
        throw new Error(`OAuth error: ${error}`);
      }

      if (!success) {
        details.message = 'Authentication incomplete - no success parameter';
        setErrorDetails(details);
        throw new Error('Authentication incomplete');
      }

      if (!token) {
        details.message = 'No token found in URL';
        setErrorDetails(details);
        throw new Error('No authentication token');
      }

      // Fetch user data using the token from URL
      console.log('[AuthCallback] Fetching /api/auth/me with token');
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`, // Send token in header
        },
      });
      console.log('[AuthCallback] Response status:', response.status);
      console.log('[AuthCallback] Response headers:', Object.fromEntries(response.headers.entries()));

      details.responseStatus = response.status;

      if (!response.ok) {
        const responseText = await response.text();
        details.responseBody = responseText;
        details.message = `API returned ${response.status}: ${responseText}`;
        setErrorDetails(details);
        throw new Error('Failed to fetch user data');
      }

      const user = await response.json();

      setStatus('success');
      setMessage(`Welcome, ${user.displayName || user.email}!`);

      // Check if new user (just created)
      const isNewUser =
        !user.lastLoginAt || new Date(user.createdAt).getTime() === new Date(user.lastLoginAt).getTime();

      // Show welcome message for new users
      if (isNewUser) {
        setMessage(`Welcome! You have ${user.freeBeatCreditsRemaining} free beat credits to get started.`);
      }

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        setLocation('/dashboard');
      }, 2000);
    } catch (error) {
      console.error('OAuth callback error:', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    }
  };

  const handleRetry = () => {
    setLocation('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            {status === 'loading' && <Loader2 className="w-8 h-8 text-primary animate-spin" />}
            {status === 'success' && <CheckCircle2 className="w-8 h-8 text-green-500" />}
            {status === 'error' && <XCircle className="w-8 h-8 text-destructive" />}
          </div>
          <CardTitle>
            {status === 'loading' && 'Signing You In'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Sign In Failed'}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>

        {status === 'error' && (
          <CardContent className="space-y-4">
            {errorDetails && (
              <div className="bg-muted p-4 rounded-md">
                <div className="text-xs font-mono whitespace-pre-wrap break-all">
                  <div className="font-bold mb-2">🔍 ERROR DETAILS (Copy & Paste):</div>
                  <div className="space-y-1">
                    <div>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
                    <div>
                      <strong>Message:</strong> {errorDetails.message}
                    </div>
                    <div>
                      <strong>Timestamp:</strong> {errorDetails.timestamp}
                    </div>
                    <div>
                      <strong>Current URL:</strong> {errorDetails.url}
                    </div>
                    <div>
                      <strong>URL Parameters:</strong> {errorDetails.urlParams}
                    </div>
                    <div>
                      <strong>Cookies:</strong> {errorDetails.cookies}
                    </div>
                    {errorDetails.responseStatus && (
                      <div>
                        <strong>Response Status:</strong> {errorDetails.responseStatus}
                      </div>
                    )}
                    {errorDetails.responseBody && (
                      <div>
                        <strong>Response Body:</strong> {errorDetails.responseBody}
                      </div>
                    )}
                    <div>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
                  </div>
                </div>
              </div>
            )}
            <Button onClick={handleRetry} className="w-full">
              Return to Home
            </Button>
          </CardContent>
        )}

        {status === 'success' && (
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">Redirecting to dashboard...</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
