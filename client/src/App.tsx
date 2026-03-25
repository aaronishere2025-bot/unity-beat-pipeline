import { Switch, Route, Redirect } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthGuard, GuestGuard } from '@/components/AuthGuard';
import { LandingPage } from '@/pages/LandingPage';
import AuthCallback from '@/pages/auth-callback';
import UserDashboard from '@/pages/user-dashboard';
import BeatMarketplace from '@/pages/beat-marketplace';
import Dashboard from '@/pages/dashboard';
import JobsPage from '@/pages/jobs';
import CharactersPage from '@/pages/characters';
import StoryEnginePage from '@/pages/story-engine';
import UnityContentPage from '@/pages/unity-content';
import VideoToolsPage from '@/pages/video-tools';
import KlingPage from '@/pages/kling';
import AutomationPage from '@/pages/automation';
import RumblePage from '@/pages/rumble';
import PrivacyPolicyPage from '@/pages/privacy-policy';
import JobDetailPage from '@/pages/job-detail';
import AnalyticsChatPage from '@/pages/analytics-chat';
import PricingPage from '@/pages/pricing';
import NotFound from '@/pages/not-found';
import BeatHub from './pages/beat-hub';
import UploadAnalytics from './pages/upload-analytics';
import AdminPanel from './pages/admin-panel';
import ErrorMonitorPage from './pages/error-monitor';

// Layout wrapper for authenticated pages with sidebar
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const style = {
    '--sidebar-width': '20rem',
    '--sidebar-width-icon': '4rem',
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between p-4 border-b bg-background shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">BeatForge Platform</div>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Routes - No Sidebar */}
      <Route path="/">
        <GuestGuard>
          <LandingPage />
        </GuestGuard>
      </Route>

      {/* Auth Callback - No guard needed, No Sidebar */}
      <Route path="/auth/callback">
        <AuthCallback />
      </Route>

      {/* Protected Routes - Require Authentication + Sidebar */}
      <Route path="/dashboard">
        <AuthGuard>
          <AuthenticatedLayout>
            <UserDashboard />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/app">
        <AuthGuard>
          <AuthenticatedLayout>
            <Dashboard />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/jobs">
        <AuthGuard>
          <AuthenticatedLayout>
            <JobsPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/jobs/:id">
        <AuthGuard>
          <AuthenticatedLayout>
            <JobDetailPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/characters">
        <AuthGuard>
          <AuthenticatedLayout>
            <CharactersPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/story-engine">
        <AuthGuard>
          <AuthenticatedLayout>
            <StoryEnginePage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/unity-content">
        <AuthGuard>
          <AuthenticatedLayout>
            <UnityContentPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/marketplace">
        <AuthenticatedLayout>
          <BeatMarketplace />
        </AuthenticatedLayout>
      </Route>
      <Route path="/video-tools">
        <AuthGuard>
          <AuthenticatedLayout>
            <VideoToolsPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/kling">
        <AuthGuard>
          <AuthenticatedLayout>
            <KlingPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/automation">
        <AuthGuard>
          <AuthenticatedLayout>
            <AutomationPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/rumble">
        <AuthGuard>
          <AuthenticatedLayout>
            <RumblePage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/analytics-chat">
        <AuthGuard>
          <AuthenticatedLayout>
            <AnalyticsChatPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/pricing">
        <AuthenticatedLayout>
          <PricingPage />
        </AuthenticatedLayout>
      </Route>
      <Route path="/privacy-policy">
        <AuthenticatedLayout>
          <PrivacyPolicyPage />
        </AuthenticatedLayout>
      </Route>

      {/* New Consolidated Pages */}
      <Route path="/beat-hub">
        <AuthGuard>
          <AuthenticatedLayout>
            <BeatHub />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/upload-analytics">
        <AuthGuard>
          <AuthenticatedLayout>
            <UploadAnalytics />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/error-monitor">
        <AuthGuard>
          <AuthenticatedLayout>
            <ErrorMonitorPage />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>
      <Route path="/admin-panel">
        <AuthGuard>
          <AuthenticatedLayout>
            <AdminPanel />
          </AuthenticatedLayout>
        </AuthGuard>
      </Route>

      {/* Redirect Routes for Backward Compatibility */}
      <Route path="/beat-store">
        <Redirect to="/beat-hub?tab=my-beats" />
      </Route>
      <Route path="/beat-marketplace">
        <Redirect to="/beat-hub?tab=marketplace" />
      </Route>
      <Route path="/generate-beat">
        <Redirect to="/beat-hub?tab=generate" />
      </Route>
      <Route path="/beat-generations">
        <Redirect to="/beat-hub?tab=history" />
      </Route>
      <Route path="/schedule">
        <Redirect to="/upload-analytics?tab=schedule" />
      </Route>
      <Route path="/analytics">
        <Redirect to="/upload-analytics?tab=analytics" />
      </Route>
      <Route path="/api-costs">
        <Redirect to="/admin-panel?tab=costs" />
      </Route>
      <Route path="/settings">
        <Redirect to="/admin-panel?tab=settings" />
      </Route>

      {/* 404 Not Found */}
      <Route>
        <AuthenticatedLayout>
          <NotFound />
        </AuthenticatedLayout>
      </Route>
    </Switch>
  );
}

function App() {
  const style = {
    '--sidebar-width': '20rem',
    '--sidebar-width-icon': '4rem',
  };

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
