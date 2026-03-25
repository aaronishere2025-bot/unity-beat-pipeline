import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, AlertCircle, AlertOctagon, Info, CheckCircle2, RefreshCw } from 'lucide-react';

interface ErrorRow {
  id: string;
  error_type: string;
  error_message: string;
  severity: string;
  service: string;
  operation: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  resolved: boolean;
}

interface ErrorSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface RepeatingErrorsResponse {
  success: boolean;
  data: ErrorRow[];
  summary: ErrorSummary;
}

const TIME_WINDOWS = [
  { label: 'All Time', value: '0' },
  { label: '24h', value: '24' },
  { label: '7d', value: '168' },
  { label: '30d', value: '720' },
];

const severityConfig: Record<
  string,
  { color: string; icon: typeof AlertTriangle; variant: 'destructive' | 'default' | 'secondary' | 'outline' }
> = {
  critical: { color: 'text-red-600', icon: AlertOctagon, variant: 'destructive' },
  high: { color: 'text-orange-500', icon: AlertTriangle, variant: 'destructive' },
  medium: { color: 'text-yellow-500', icon: AlertCircle, variant: 'default' },
  low: { color: 'text-blue-400', icon: Info, variant: 'secondary' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ErrorMonitorPage() {
  const [hours, setHours] = useState('0');
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<RepeatingErrorsResponse>({
    queryKey: ['/api/errors/repeating', hours],
    queryFn: async () => {
      const res = await fetch(`/api/errors/repeating?hours=${hours}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/errors/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: 'manual' }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/errors/repeating'] });
    },
  });

  const summary = data?.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  const errors = data?.data || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Error Monitor</h1>
          <p className="text-muted-foreground">Repeating pipeline errors sorted by frequency</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-500">High</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{summary.high}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-500">Medium</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{summary.medium}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-400">Low</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{summary.low}</div>
          </CardContent>
        </Card>
      </div>

      {/* Time Window Filter */}
      <Tabs value={hours} onValueChange={setHours}>
        <TabsList>
          {TIME_WINDOWS.map((tw) => (
            <TabsTrigger key={tw.value} value={tw.value}>
              {tw.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Error Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading errors...</div>
          ) : errors.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>No unresolved errors in this time window</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Count</TableHead>
                  <TableHead className="w-[100px]">Severity</TableHead>
                  <TableHead className="w-[160px]">Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[160px]">Service</TableHead>
                  <TableHead className="w-[100px]">Last Seen</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((err) => {
                  const sev = severityConfig[err.severity] || severityConfig.low;
                  const SevIcon = sev.icon;
                  return (
                    <TableRow key={err.id}>
                      <TableCell className="font-mono font-bold text-lg">{err.occurrence_count}</TableCell>
                      <TableCell>
                        <Badge variant={sev.variant} className="gap-1">
                          <SevIcon className="w-3 h-3" />
                          {err.severity || 'low'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{err.error_type || '-'}</TableCell>
                      <TableCell className="max-w-[400px] truncate text-sm" title={err.error_message}>
                        {err.error_message?.substring(0, 120) || '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-medium">{err.service || '-'}</span>
                        {err.operation && <span className="block text-muted-foreground">{err.operation}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {err.last_seen ? timeAgo(err.last_seen) : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolveMutation.mutate(err.id)}
                          disabled={resolveMutation.isPending}
                        >
                          Resolve
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
