import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Settings as SettingsIcon, ExternalLink, Shield, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { SiYoutube, SiGoogle } from 'react-icons/si';
import { Link } from 'wouter';

export default function SettingsPage() {
  const { data: youtubeStatus } = useQuery<{
    data: { configured: boolean; authenticated: boolean; channel?: { name: string } };
  }>({
    queryKey: ['/api/youtube/status'],
  });

  const isYoutubeConnected = youtubeStatus?.data?.authenticated;
  const channelName = youtubeStatus?.data?.channel?.name;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold mb-2" data-testid="text-page-title">
            Settings
          </h1>
          <p className="text-muted-foreground">Configure your video generation system preferences</p>
        </div>

        {/* YouTube Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-md bg-red-100 dark:bg-red-950">
                <SiYoutube className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  YouTube Integration
                  {isYoutubeConnected ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <XCircle className="w-3 h-3 mr-1" />
                      Not Connected
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {isYoutubeConnected && channelName
                    ? `Connected to: ${channelName}`
                    : 'Connect your YouTube account to upload videos directly'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isYoutubeConnected && (
              <Button
                variant="default"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => (window.location.href = '/api/youtube/auth')}
                data-testid="button-connect-youtube"
              >
                <SiYoutube className="w-4 h-4 mr-2" />
                Connect YouTube Account
              </Button>
            )}

            {isYoutubeConnected && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => (window.location.href = '/api/youtube/auth')}
                  data-testid="button-reconnect-youtube"
                >
                  Reconnect Account
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => window.open('https://myaccount.google.com/permissions', '_blank')}
                  data-testid="button-revoke-youtube"
                >
                  Revoke Access
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </div>
            )}

            <Separator />

            {/* YouTube API Terms & Conditions */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Terms of Service & Privacy
              </h4>
              <p className="text-sm text-muted-foreground">
                This application uses YouTube API Services. By connecting your YouTube account, you agree to be bound by
                the following:
              </p>
              <div className="grid gap-2">
                <a
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid="link-youtube-tos"
                >
                  <SiYoutube className="w-4 h-4 text-red-600" />
                  YouTube Terms of Service
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid="link-google-privacy"
                >
                  <SiGoogle className="w-4 h-4" />
                  Google Privacy Policy
                  <ExternalLink className="w-3 h-3" />
                </a>
                <Link
                  href="/privacy-policy"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid="link-app-privacy"
                >
                  <FileText className="w-4 h-4" />
                  Our Privacy Policy
                </Link>
              </div>
            </div>

            <Separator />

            {/* Data Usage Disclosure */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                How We Use YouTube Data
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Upload videos you create to your YouTube channel</li>
                <li>Set video titles, descriptions, tags, and privacy settings</li>
                <li>Retrieve your channel information for display</li>
                <li>Fetch video analytics to improve content recommendations</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                We do not store your YouTube credentials. Access can be revoked anytime at{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Account Permissions
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Content Disclosure */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted">
                <Shield className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>AI Content Disclosure</CardTitle>
                <CardDescription>YouTube July 2025 Monetization Compliance</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All videos uploaded through this application automatically include AI content disclosure (
              <code className="bg-muted px-1 rounded">selfDeclaredAiContent: true</code>) as required by YouTube's
              monetization guidelines effective July 2025.
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Auto-Enabled
              </Badge>
              <span className="text-sm text-muted-foreground">AI content disclosure is automatically applied</span>
            </div>
          </CardContent>
        </Card>

        {/* General Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted">
                <SettingsIcon className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Additional configuration options</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Additional settings for API configuration, notification preferences, cost limits, and more will be
              available here in future updates.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
