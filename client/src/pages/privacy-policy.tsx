import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, Shield, Youtube, Database, Lock, Mail } from 'lucide-react';
import { Link } from 'wouter';

export default function PrivacyPolicyPage() {
  const lastUpdated = 'December 23, 2025';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-primary" />
              <div>
                <CardTitle className="text-2xl" data-testid="text-privacy-title">
                  Privacy Policy
                </CardTitle>
                <p className="text-sm text-muted-foreground">Last Updated: {lastUpdated}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="lead">
              This Privacy Policy describes how Epic Rap Battles Video Generator ("we," "our," or "the App") collects,
              uses, and shares information when you use our service.
            </p>

            <section className="mt-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Youtube className="w-5 h-5" />
                YouTube API Services
              </h2>
              <p>
                This application uses YouTube API Services to enable video uploads to YouTube. By using our service, you
                agree to be bound by the{' '}
                <a
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  YouTube Terms of Service
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </p>
              <p>
                Our use of information received from YouTube APIs adheres to the{' '}
                <a
                  href="http://www.google.com/policies/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Google Privacy Policy
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </p>
            </section>

            <section className="mt-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Database className="w-5 h-5" />
                Information We Collect
              </h2>

              <h3 className="text-lg font-medium mt-4">YouTube API Data</h3>
              <p>When you connect your YouTube account, we access:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Your YouTube channel information (name, ID)</li>
                <li>Ability to upload videos to your channel</li>
                <li>Video analytics for videos uploaded through our service</li>
                <li>Video metadata (titles, descriptions, view counts) for performance tracking</li>
              </ul>

              <h3 className="text-lg font-medium mt-4">Content You Create</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>AI-generated videos, music, and lyrics created through our service</li>
                <li>Video metadata and upload preferences</li>
                <li>Job history and generation settings</li>
              </ul>

              <h3 className="text-lg font-medium mt-4">Technical Information</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>OAuth tokens for YouTube API access (stored securely)</li>
                <li>Usage logs and error reports for service improvement</li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Lock className="w-5 h-5" />
                How We Use Your Information
              </h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>
                  <strong>Video Uploads:</strong> To upload AI-generated videos to your YouTube channel on your behalf
                </li>
                <li>
                  <strong>Analytics:</strong> To display video performance metrics and provide content improvement
                  suggestions
                </li>
                <li>
                  <strong>Service Improvement:</strong> To improve video generation quality and user experience
                </li>
                <li>
                  <strong>AI Content Disclosure:</strong> To properly mark uploaded content as AI-generated per YouTube
                  requirements
                </li>
              </ul>
              <p className="mt-4">
                We do <strong>not</strong> sell, rent, or share your personal information with third parties for
                marketing purposes.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-semibold">Third-Party Services</h2>
              <p>Our service integrates with the following third-party services:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>
                  <strong>YouTube/Google:</strong> For video uploads and analytics
                </li>
                <li>
                  <strong>Suno AI:</strong> For music generation
                </li>
                <li>
                  <strong>Kling AI / Google VEO:</strong> For video clip generation
                </li>
                <li>
                  <strong>OpenAI:</strong> For content generation and transcription
                </li>
                <li>
                  <strong>Rumble:</strong> For cross-platform streaming (optional)
                </li>
              </ul>
              <p className="mt-2">Each of these services has their own privacy policies governing their use of data.</p>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-semibold">Data Storage and Security</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>OAuth tokens are stored securely and encrypted</li>
                <li>We do not store your YouTube password</li>
                <li>Generated videos are stored temporarily for upload, then can be deleted</li>
                <li>We use industry-standard security measures to protect your data</li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-semibold">Revoking Access</h2>
              <p>
                You can revoke this application's access to your YouTube account at any time by visiting the{' '}
                <a
                  href="https://security.google.com/settings/security/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Google Security Settings
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </p>
              <p className="mt-2">
                After revoking access, we will no longer be able to upload videos to your YouTube channel or access your
                channel analytics. Any data already stored in our system will be retained according to our data
                retention policy unless you request deletion.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-semibold">Data Deletion</h2>
              <p>
                To request deletion of your data, please contact us using the information below. We will delete your
                stored data within 30 days of receiving your request.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-semibold">Cookies and Tracking</h2>
              <p>
                This application uses session cookies to maintain your login state and preferences. We do not use
                third-party tracking cookies for advertising purposes.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Mail className="w-5 h-5" />
                Contact Us
              </h2>
              <p>
                If you have any questions or concerns about this Privacy Policy or our data practices, please contact us
                at:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> privacy@yourdomain.com
              </p>
            </section>

            <section className="mt-8 p-4 bg-muted rounded-lg">
              <h2 className="text-xl font-semibold">Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the
                new Privacy Policy on this page and updating the "Last Updated" date.
              </p>
            </section>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          <p>
            This application uses YouTube API Services.{' '}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              YouTube Terms of Service
            </a>
            {' | '}
            <a
              href="http://www.google.com/policies/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Google Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
