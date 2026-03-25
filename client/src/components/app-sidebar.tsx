import {
  Film,
  ListChecks,
  Settings,
  Bot,
  Music,
  Calendar,
  Sparkles,
  Zap,
  Plus,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AddFundsModal } from './add-funds-modal';

interface UserBalance {
  balance: number;
  totalSpent: number;
  monthlySpend: number;
  subscriptionTier: string;
}

const menuItems = [
  {
    title: 'Dashboard',
    url: '/',
    icon: Film,
    testId: 'link-dashboard',
  },
  {
    title: 'Job Queue',
    url: '/jobs',
    icon: ListChecks,
    testId: 'link-jobs',
  },
  {
    title: 'Characters',
    url: '/characters',
    icon: Users,
    testId: 'link-characters',
  },
  {
    title: 'Beat Hub',
    url: '/beat-hub',
    icon: Music,
    testId: 'link-beat-hub',
  },
  {
    title: 'Upload & Analytics',
    url: '/upload-analytics',
    icon: Calendar,
    testId: 'link-upload-analytics',
  },
  {
    title: 'Automation',
    url: '/automation',
    icon: Bot,
    testId: 'link-automation',
  },
  {
    title: 'Pricing',
    url: '/pricing',
    icon: Sparkles,
    testId: 'link-pricing',
  },
  {
    title: 'Error Monitor',
    url: '/error-monitor',
    icon: AlertTriangle,
    testId: 'link-error-monitor',
  },
  {
    title: 'Admin Panel',
    url: '/admin-panel',
    icon: Settings,
    testId: 'link-admin-panel',
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);

  const { data: balanceData } = useQuery<UserBalance>({
    queryKey: ['/api/auth/balance'],
    refetchInterval: 10000,
  });

  const balance = balanceData?.balance || 0;
  const credits = Math.floor(balance * 10); // Convert dollars to credits (1 credit = $0.10)

  return (
    <Sidebar>
      <SidebarHeader className="p-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-app-title">
              UnityForge AI
            </h2>
            <p className="text-sm text-muted-foreground">Content Studio</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={item.testId}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Account Balance</SidebarGroupLabel>
          <SidebarGroupContent>
            <Card className="mx-2">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Credits</span>
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-3xl font-bold text-primary" data-testid="text-credits-balance">
                    {credits.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">${balance.toFixed(2)} • 1 credit = $0.10</div>
                  <Button size="sm" className="w-full" onClick={() => setShowAddFundsModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Buy Credits
                  </Button>
                </div>
              </CardContent>
            </Card>
          </SidebarGroupContent>
        </SidebarGroup>

        <AddFundsModal open={showAddFundsModal} onOpenChange={setShowAddFundsModal} />
      </SidebarContent>

      <SidebarFooter className="p-4">
        <p className="text-xs text-muted-foreground text-center">UnityForge AI • v1.0</p>
      </SidebarFooter>
    </Sidebar>
  );
}
