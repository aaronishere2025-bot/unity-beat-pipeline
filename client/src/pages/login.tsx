import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GoogleOAuthButton } from '@/components/google-oauth-button';
import { Music, Sparkles, TrendingUp } from 'lucide-react';

export default function Login() {
  const [location, setLocation] = useLocation();

  // Redirect if already logged in
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });
        if (response.ok) {
          setLocation('/dashboard');
        }
      } catch (error) {
        // User not logged in, stay on login page
      }
    };
    checkAuth();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-xl">
            <Music className="w-10 h-10 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold">VEO Studio</CardTitle>
            <CardDescription className="text-lg mt-2">AI-Powered Beat Generation & Marketplace</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3 text-center">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
              <p className="text-sm">
                <strong>5 Free Beat Credits</strong> on signup
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <TrendingUp className="w-5 h-5 text-primary flex-shrink-0" />
              <p className="text-sm">
                <strong>0% Commission</strong> on AI-generated beat sales
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Music className="w-5 h-5 text-primary flex-shrink-0" />
              <p className="text-sm">Generate professional beats in seconds</p>
            </div>
          </div>

          <div className="pt-4">
            <GoogleOAuthButton
              className="w-full h-12 text-base"
              size="lg"
              onSuccess={(user) => {
                console.log('Login successful:', user);
                setLocation('/dashboard');
              }}
              onError={(error) => {
                console.error('Login failed:', error);
              }}
            />
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
