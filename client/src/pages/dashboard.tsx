import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Film,
  TrendingUp,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Play,
  Sparkles,
  Video,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  CheckCircle,
  Info,
} from 'lucide-react';
import { SiTiktok, SiYoutube } from 'react-icons/si';
import { Link } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Job } from '@shared/schema';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface Conflict {
  type: string;
  gptClaim: string;
  geminiClaim: string;
  severity: string;
  resolution?: string;
}

interface GptOutput {
  topic?: string;
  era?: string;
  keyFacts?: string[];
  narrativeHook?: string;
  themes?: string[];
  historicalSignificance?: string;
}

interface GeminiOutput {
  factCheckResults?: Array<{
    claim: string;
    status: string;
    correction?: string;
  }>;
  overallAssessment?: string;
  policyViolations?: string[];
}

interface ConsensusReport {
  id: number;
  topic: string;
  status: string;
  consensusScore: number;
  action: string;
  actionReasoning: string;
  blockedReason?: string;
  conflicts: string | Conflict[];
  gptOutput?: string | GptOutput;
  geminiOutput?: string | GeminiOutput;
  createdAt: string;
}

interface TopicSuggestion {
  topic: string;
  reason: string;
  score: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ConsensusReport | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  const { data: recentJobs, isLoading } = useQuery<{ data: Job[] }>({
    queryKey: ['/api/jobs'],
    enabled: true,
    refetchInterval: 5000,
  });

  const { data: consensusData, isLoading: consensusLoading } = useQuery<{ data: ConsensusReport[] }>({
    queryKey: ['/api/consensus/history'],
    enabled: true,
    refetchInterval: 10000,
  });

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<{ data: TopicSuggestion[] }>({
    queryKey: ['/api/analytics/suggested-topics'],
    enabled: true,
    refetchInterval: 60000,
  });

  const longFormMutation = useMutation({
    mutationFn: async (topic: string) => {
      return apiRequest('POST', '/api/long-form/initialize', {
        topic,
        narrativeArc: 'three_act',
        stylePreset: 'documentary',
      });
    },
    onSuccess: () => {
      toast({ title: 'Long-form video started', description: 'Check Jobs page for progress' });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      setSelectedTopic(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to start', description: error.message, variant: 'destructive' });
    },
  });

  const jobs = recentJobs?.data || [];
  const consensusReports = consensusData?.data || [];
  const suggestedTopics = suggestionsData?.data || [];
  const activeJobs = jobs.filter((j) => j.status === 'processing' || j.status === 'queued');
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const blockedCount = consensusReports.filter((r) => r.action === 'BLOCKED').length;
  const verifiedCount = consensusReports.filter((r) => r.action === 'PROCEED').length;

  const totalPages = Math.ceil(consensusReports.length / pageSize);

  // Clamp pagination when dataset size changes
  useEffect(() => {
    if (totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, currentPage]);

  const paginatedReports = consensusReports.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const parseConflicts = (conflicts: string | Conflict[]): Conflict[] => {
    if (typeof conflicts === 'string') {
      try {
        return JSON.parse(conflicts || '[]');
      } catch {
        return [];
      }
    }
    return conflicts || [];
  };

  const parseGptOutput = (output: string | GptOutput | undefined): GptOutput | null => {
    if (!output) return null;
    if (typeof output === 'string') {
      try {
        return JSON.parse(output);
      } catch {
        return null;
      }
    }
    return output;
  };

  const parseGeminiOutput = (output: string | GeminiOutput | undefined): GeminiOutput | null => {
    if (!output) return null;
    if (typeof output === 'string') {
      try {
        return JSON.parse(output);
      } catch {
        return null;
      }
    }
    return output;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'major':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'minor':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
    }
  };

  const getConflictTypeIcon = (type: string) => {
    switch (type) {
      case 'fact':
        return <AlertTriangle className="w-3 h-3" />;
      case 'date':
        return <Clock className="w-3 h-3" />;
      case 'name':
        return <Info className="w-3 h-3" />;
      case 'policy':
        return <ShieldX className="w-3 h-3" />;
      default:
        return <Info className="w-3 h-3" />;
    }
  };

  // Determine Gemini status based on conflicts and geminiOutput
  const getGeminiStatus = (report: ConsensusReport): 'success' | 'conflict' | 'failed' => {
    const conflicts = parseConflicts(report.conflicts);
    const geminiOutput = parseGeminiOutput(report.geminiOutput);

    // Check for policy violations - these are failures
    if (conflicts.some((c: Conflict) => c.type === 'policy')) {
      return 'failed';
    }

    // Check geminiOutput for policy violations
    if (geminiOutput?.policyViolations && geminiOutput.policyViolations.length > 0) {
      return 'failed';
    }

    // Check geminiOutput for fact-check failures
    if (geminiOutput?.factCheckResults) {
      const hasUnverified = geminiOutput.factCheckResults.some(
        (r) => r.status !== 'verified' && r.status !== 'accurate',
      );
      if (hasUnverified && conflicts.length > 0) {
        return 'failed';
      }
    }

    // Has conflicts but not policy-related = conflict status
    if (conflicts.length > 0) {
      return 'conflict';
    }

    return 'success';
  };

  // Determine GPT status based on conflicts
  const getGptStatus = (report: ConsensusReport): 'success' | 'issue' => {
    const conflicts = parseConflicts(report.conflicts);
    const hasGptIssue = conflicts.some((c: Conflict) => c.type === 'fact' || c.type === 'date' || c.type === 'name');
    return hasGptIssue ? 'issue' : 'success';
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold mb-2" data-testid="text-page-title">
            Video Generation Dashboard
          </h1>
          <p className="text-muted-foreground">
            Create stunning videos with VEO cinematic quality or cost-effective consistent characters
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold" data-testid="text-active-jobs">
                {isLoading ? <Skeleton className="h-8 w-12" /> : activeJobs.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Currently processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <Film className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold" data-testid="text-completed-jobs">
                {isLoading ? <Skeleton className="h-8 w-12" /> : completedJobs.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Ready to download</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold" data-testid="text-success-rate">
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : jobs.length > 0 ? (
                  `${Math.round((completedJobs.length / jobs.length) * 100)}%`
                ) : (
                  '—'
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">All time</p>
            </CardContent>
          </Card>
        </div>

        {/* Consensus Engine Status - For Google Audit */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Consensus Engine
            </CardTitle>
            <CardDescription>
              Cross-model AI verification (GPT-4o + Gemini) - Click any row to view details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-600 border-green-500/30"
                data-testid="badge-verified-count"
              >
                <ShieldCheck className="w-3 h-3 mr-1" />
                {verifiedCount} Verified
              </Badge>
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-600 border-red-500/30"
                data-testid="badge-blocked-count"
              >
                <ShieldX className="w-3 h-3 mr-1" />
                {blockedCount} Blocked
              </Badge>
              <Badge
                variant="outline"
                className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                data-testid="badge-review-count"
              >
                <ShieldAlert className="w-3 h-3 mr-1" />
                {consensusReports.filter((r) => r.action === 'MANUAL_REVIEW').length} Review
              </Badge>
              <span className="text-sm text-muted-foreground ml-auto">{consensusReports.length} total reports</span>
            </div>

            {consensusLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : consensusReports.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No consensus checks yet</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">Topic</th>
                        <th className="text-center py-2 px-2 font-medium">GPT-4o</th>
                        <th className="text-center py-2 px-2 font-medium">Gemini</th>
                        <th className="text-center py-2 px-2 font-medium">Master Consensus</th>
                        <th className="text-center py-2 px-2 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedReports.map((report) => {
                        const gptStatus = getGptStatus(report);
                        const geminiStatus = getGeminiStatus(report);

                        return (
                          <tr
                            key={report.id}
                            className="border-b cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setSelectedReport(report)}
                            data-testid={`row-consensus-${report.id}`}
                          >
                            <td className="py-2 px-2 font-medium">{report.topic}</td>
                            <td className="py-2 px-2 text-center">
                              {gptStatus === 'issue' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                                >
                                  Issue
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                                  Success
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              {geminiStatus === 'failed' ? (
                                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                                  Failed
                                </Badge>
                              ) : geminiStatus === 'conflict' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                                >
                                  Conflict
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                                  Success
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              {report.action === 'PROCEED' ? (
                                <Badge className="bg-green-600 text-white" data-testid={`badge-consensus-${report.id}`}>
                                  <ShieldCheck className="w-3 h-3 mr-1" />
                                  VERIFIED
                                </Badge>
                              ) : report.action === 'BLOCKED' ? (
                                <Badge className="bg-red-600 text-white" data-testid={`badge-consensus-${report.id}`}>
                                  <ShieldX className="w-3 h-3 mr-1" />
                                  BLOCKED
                                </Badge>
                              ) : (
                                <Badge
                                  className="bg-yellow-600 text-white"
                                  data-testid={`badge-consensus-${report.id}`}
                                >
                                  <ShieldAlert className="w-3 h-3 mr-1" />
                                  REVIEW
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span
                                className={`font-mono ${report.consensusScore >= 80 ? 'text-green-600' : report.consensusScore >= 50 ? 'text-yellow-600' : 'text-red-600'}`}
                              >
                                {report.consensusScore}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage + 1} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Consensus Detail Sheet */}
        <Sheet open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
          <SheetContent className="sm:max-w-xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {selectedReport?.action === 'PROCEED' ? (
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                ) : selectedReport?.action === 'BLOCKED' ? (
                  <ShieldX className="w-5 h-5 text-red-600" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-yellow-600" />
                )}
                {selectedReport?.topic}
              </SheetTitle>
              <SheetDescription>
                Consensus Score:{' '}
                <span
                  className={`font-mono font-bold ${(selectedReport?.consensusScore ?? 0) >= 80 ? 'text-green-600' : (selectedReport?.consensusScore ?? 0) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}
                >
                  {selectedReport?.consensusScore}%
                </span>
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="h-[calc(100vh-10rem)] mt-4 pr-4">
              {selectedReport &&
                (() => {
                  const conflicts = parseConflicts(selectedReport.conflicts);
                  const gptOutput = parseGptOutput(selectedReport.gptOutput);
                  const geminiOutput = parseGeminiOutput(selectedReport.geminiOutput);

                  return (
                    <div className="space-y-6">
                      {/* GPT-4o Section */}
                      <div>
                        <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                          <span className="w-6 h-6 rounded bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-bold">
                            G
                          </span>
                          GPT-4o Narrative
                        </h3>
                        {gptOutput ? (
                          <div className="space-y-3 pl-8">
                            {gptOutput.era && (
                              <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wide">Era</span>
                                <p className="text-sm">{gptOutput.era}</p>
                              </div>
                            )}
                            {gptOutput.narrativeHook && (
                              <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                                  Narrative Hook
                                </span>
                                <p className="text-sm">{gptOutput.narrativeHook}</p>
                              </div>
                            )}
                            {gptOutput.keyFacts && gptOutput.keyFacts.length > 0 && (
                              <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wide">Key Facts</span>
                                <ul className="text-sm space-y-1 mt-1">
                                  {gptOutput.keyFacts.map((fact, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                      <CheckCircle className="w-3 h-3 text-green-600 mt-1 flex-shrink-0" />
                                      <span>{fact}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {gptOutput.themes && gptOutput.themes.length > 0 && (
                              <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wide">Themes</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {gptOutput.themes.map((theme, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">
                                      {theme}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* GPT Issues from conflicts */}
                            {conflicts.filter((c) => c.type === 'fact' || c.type === 'date' || c.type === 'name')
                              .length > 0 && (
                              <div className="mt-4 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                                <span className="text-xs text-yellow-600 uppercase tracking-wide font-medium">
                                  Issues Found
                                </span>
                                <div className="space-y-2 mt-2">
                                  {conflicts
                                    .filter((c) => c.type === 'fact' || c.type === 'date' || c.type === 'name')
                                    .map((conflict, i) => (
                                      <div key={i} className="text-sm">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className={getSeverityColor(conflict.severity)}>
                                            {getConflictTypeIcon(conflict.type)}
                                            <span className="ml-1">
                                              {conflict.type} ({conflict.severity})
                                            </span>
                                          </Badge>
                                        </div>
                                        <p className="mt-1 text-muted-foreground">
                                          <strong>GPT claimed:</strong> {conflict.gptClaim}
                                        </p>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground pl-8">No GPT output data available</p>
                        )}
                      </div>

                      <Separator />

                      {/* Gemini Section */}
                      <div>
                        <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                          <span className="w-6 h-6 rounded bg-purple-500/10 text-purple-600 flex items-center justify-center text-xs font-bold">
                            G
                          </span>
                          Gemini Fact-Check
                        </h3>
                        <div className="space-y-3 pl-8">
                          {geminiOutput?.overallAssessment && (
                            <div>
                              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                                Overall Assessment
                              </span>
                              <p className="text-sm">{geminiOutput.overallAssessment}</p>
                            </div>
                          )}

                          {geminiOutput?.factCheckResults && geminiOutput.factCheckResults.length > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                                Fact Check Results
                              </span>
                              <ul className="text-sm space-y-2 mt-1">
                                {geminiOutput.factCheckResults.map((result, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    {result.status === 'verified' ? (
                                      <CheckCircle className="w-3 h-3 text-green-600 mt-1 flex-shrink-0" />
                                    ) : (
                                      <AlertTriangle className="w-3 h-3 text-yellow-600 mt-1 flex-shrink-0" />
                                    )}
                                    <div>
                                      <span>{result.claim}</span>
                                      {result.correction && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          Correction: {result.correction}
                                        </p>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Gemini Conflicts */}
                          {conflicts.length > 0 && (
                            <div className="mt-4 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                              <span className="text-xs text-orange-600 uppercase tracking-wide font-medium">
                                Conflicts Detected ({conflicts.length})
                              </span>
                              <div className="space-y-3 mt-2">
                                {conflicts.map((conflict, i) => (
                                  <div key={i} className="text-sm border-l-2 border-orange-400 pl-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="outline" className={getSeverityColor(conflict.severity)}>
                                        {getConflictTypeIcon(conflict.type)}
                                        <span className="ml-1">{conflict.type}</span>
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">
                                        {conflict.severity}
                                      </Badge>
                                    </div>
                                    <p className="text-muted-foreground">
                                      <strong>GPT:</strong> {conflict.gptClaim}
                                    </p>
                                    <p className="text-muted-foreground">
                                      <strong>Gemini:</strong> {conflict.geminiClaim}
                                    </p>
                                    {conflict.resolution && (
                                      <p className="mt-1 text-green-600 text-xs flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" />
                                        <strong>Resolved:</strong> {conflict.resolution}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Policy Violations */}
                          {geminiOutput?.policyViolations && geminiOutput.policyViolations.length > 0 && (
                            <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                              <span className="text-xs text-red-600 uppercase tracking-wide font-medium">
                                Policy Violations
                              </span>
                              <ul className="text-sm space-y-1 mt-2">
                                {geminiOutput.policyViolations.map((violation, i) => (
                                  <li key={i} className="flex items-start gap-2 text-red-600">
                                    <ShieldX className="w-3 h-3 mt-1 flex-shrink-0" />
                                    <span>{violation}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {!geminiOutput && conflicts.length === 0 && (
                            <div className="flex items-center gap-2 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-sm">All facts verified - no conflicts</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <Separator />

                      {/* Master Consensus Decision */}
                      <div>
                        <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                          <span className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            M
                          </span>
                          Master Consensus Decision
                        </h3>
                        <div className="pl-8 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Action:</span>
                            {selectedReport.action === 'PROCEED' ? (
                              <Badge className="bg-green-600 text-white">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                VERIFIED - PROCEED
                              </Badge>
                            ) : selectedReport.action === 'BLOCKED' ? (
                              <Badge className="bg-red-600 text-white">
                                <ShieldX className="w-3 h-3 mr-1" />
                                BLOCKED
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-600 text-white">
                                <ShieldAlert className="w-3 h-3 mr-1" />
                                MANUAL REVIEW
                              </Badge>
                            )}
                          </div>
                          {selectedReport.actionReasoning && (
                            <div>
                              <span className="text-xs text-muted-foreground uppercase tracking-wide">Reasoning</span>
                              <p className="text-sm">{selectedReport.actionReasoning}</p>
                            </div>
                          )}
                          {selectedReport.blockedReason && (
                            <div className="p-2 rounded bg-red-500/5 border border-red-500/20">
                              <span className="text-xs text-red-600 uppercase tracking-wide">Blocked Reason</span>
                              <p className="text-sm text-red-600">{selectedReport.blockedReason}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="text-xs text-muted-foreground pt-4 border-t">
                        Created: {new Date(selectedReport.createdAt).toLocaleString()}
                      </div>
                    </div>
                  );
                })()}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* Long-Form Video Generation - 1-Click with AI Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              Long-Form Video Generator
            </CardTitle>
            <CardDescription>Create 10-minute historical epic videos with AI-suggested topics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {suggestionsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : suggestedTopics.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { topic: 'Julius Caesar', reason: 'Proven engagement: betrayal + power', score: 92 },
                    { topic: 'Cleopatra', reason: 'Trending: strategic alliances', score: 88 },
                    { topic: 'Alexander the Great', reason: 'High CTR: conquest themes', score: 85 },
                  ].map((suggestion, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border cursor-pointer transition-all hover-elevate ${
                        selectedTopic === suggestion.topic ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                      onClick={() => setSelectedTopic(suggestion.topic)}
                      data-testid={`suggestion-${idx}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-medium">{suggestion.topic}</span>
                        <Badge variant="outline" className="text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          {suggestion.score}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {suggestedTopics.slice(0, 3).map((suggestion, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border cursor-pointer transition-all hover-elevate ${
                        selectedTopic === suggestion.topic ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                      onClick={() => setSelectedTopic(suggestion.topic)}
                      data-testid={`suggestion-${idx}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-medium">{suggestion.topic}</span>
                        <Badge variant="outline" className="text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          {suggestion.score}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  className="gap-2"
                  disabled={!selectedTopic || longFormMutation.isPending}
                  onClick={() => selectedTopic && longFormMutation.mutate(selectedTopic)}
                  data-testid="button-generate-longform"
                >
                  {longFormMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Generate 10-Min Epic
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedTopic ? `Selected: ${selectedTopic}` : 'Select a topic above'}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                Creates 6-chapter narrative with ~110 Kling clips (~$12 total cost)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Start</CardTitle>
            <CardDescription>Get started with your video generation</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Link href="/upload">
              <Button className="gap-2" data-testid="button-upload-script">
                <Upload className="w-4 h-4" />
                Upload Script
              </Button>
            </Link>
            <Link href="/characters">
              <Button variant="outline" className="gap-2" data-testid="button-manage-characters">
                Manage Characters
              </Button>
            </Link>
            <Link href="/jobs">
              <Button variant="outline" className="gap-2" data-testid="button-view-queue">
                View Job Queue
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
            <CardDescription>Your latest video generation requests</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12" data-testid="empty-state-no-jobs">
                <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No videos yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Upload your first script to get started</p>
                <Link href="/upload">
                  <Button data-testid="button-upload-first-script">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Your First Script
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.slice(0, 5).map((job) => (
                  <Link key={job.id} href={`/jobs/${job.id}`}>
                    <div
                      className="flex items-center gap-4 p-3 rounded-md hover-elevate active-elevate-2 cursor-pointer"
                      data-testid={`job-item-${job.id}`}
                    >
                      <div
                        className={`w-12 h-12 rounded flex items-center justify-center ${
                          job.aspectRatio === '9:16'
                            ? 'bg-black text-white'
                            : job.aspectRatio === '16:9'
                              ? 'bg-red-600 text-white'
                              : job.status === 'completed'
                                ? 'bg-primary/10 text-primary'
                                : job.status === 'processing'
                                  ? 'bg-chart-4/10 text-chart-4'
                                  : job.status === 'failed'
                                    ? 'bg-destructive/10 text-destructive'
                                    : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {job.aspectRatio === '9:16' ? (
                          <SiTiktok className="w-6 h-6" />
                        ) : job.aspectRatio === '16:9' ? (
                          <SiYoutube className="w-6 h-6" />
                        ) : (
                          <Film className="w-6 h-6" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" data-testid={`text-job-name-${job.id}`}>
                          {job.scriptName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {job.mode === 'veo' || job.mode === 'unity_kling'
                            ? 'Kling AI'
                            : job.mode === 'kling'
                              ? 'Kling AI'
                              : 'Consistent Character'}{' '}
                          ·{' '}
                          {job.aspectRatio === '9:16'
                            ? 'TikTok 9:16'
                            : job.aspectRatio === '16:9'
                              ? 'YouTube 16:9'
                              : job.aspectRatio || '16:9'}{' '}
                          · {job.status}
                        </p>
                      </div>
                      {job.status === 'processing' && (
                        <div className="text-sm text-muted-foreground" data-testid={`text-progress-${job.id}`}>
                          {job.progress}%
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
