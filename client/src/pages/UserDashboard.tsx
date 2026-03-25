/**
 * User Dashboard - Main dashboard for authenticated users
 * Shows credit balance, recent jobs, quick actions
 */

import { useAuth } from '@/hooks/useAuth';
import { useCredits } from '@/hooks/useCredits';
import { CreditCard } from '@/components/CreditBadge';
import { useQuery } from '@tanstack/react-query';
import { Music, Video, Package, Clock, CheckCircle, XCircle, Loader2, DollarSign } from 'lucide-react';
import { Link } from 'wouter';

interface Job {
  id: string;
  mode: string;
  status: string;
  createdAt: string;
  userChargeUSD: string;
  stripeChargeId: string;
  scriptName?: string;
  progress: number;
}

async function fetchUserJobs(): Promise<Job[]> {
  const response = await fetch('/api/user/jobs?limit=10', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch jobs');
  }

  return response.json();
}

function JobStatusBadge({ status }: { status: string }) {
  const config = {
    completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Completed' },
    processing: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Processing' },
    queued: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Queued' },
    failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' },
  };

  const { icon: Icon, color, bg, label } = config[status as keyof typeof config] || config.queued;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${bg} ${color}`}>
      <Icon className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      <span>{label}</span>
    </div>
  );
}

export function UserDashboard() {
  const { user, logout } = useAuth();
  const { freeBeatCredits } = useCredits();

  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['user-jobs'],
    queryFn: fetchUserJobs,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Music className="w-8 h-8 text-purple-600" />
              <h1 className="text-2xl font-bold text-gray-900">BeatForge</h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Credit Badge */}
              {freeBeatCredits > 0 && (
                <div className="hidden md:block">
                  <div className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full text-sm font-medium">
                    {freeBeatCredits} Free Beat{freeBeatCredits !== 1 ? 's' : ''}
                  </div>
                </div>
              )}

              {/* User Menu */}
              <div className="flex items-center gap-3">
                {user?.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-10 h-10 rounded-full border-2 border-purple-500"
                  />
                )}
                <div className="hidden md:block">
                  <div className="text-sm font-medium text-gray-900">{user?.displayName}</div>
                  <div className="text-xs text-gray-500">{user?.email}</div>
                </div>
                <button onClick={() => logout()} className="text-sm text-gray-600 hover:text-gray-900">
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user?.displayName?.split(' ')[0]}!</h2>
          <p className="text-gray-600">Create AI-powered beats and videos in minutes.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {/* Free Credits */}
          <div className="col-span-1">
            <CreditCard />
          </div>

          {/* Quick Actions */}
          <Link href="/beat-generations">
            <a className="block bg-white rounded-xl p-6 border border-gray-200 hover:border-purple-500 hover:shadow-lg transition-all cursor-pointer group">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-500 transition-colors">
                  <Music className="w-6 h-6 text-purple-600 group-hover:text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">Generate Beat</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">Create AI beats</p>
              <div className="text-lg font-bold text-purple-600">$2.50</div>
            </a>
          </Link>

          <Link href="/upload">
            <a className="block bg-white rounded-xl p-6 border border-gray-200 hover:border-pink-500 hover:shadow-lg transition-all cursor-pointer group">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-pink-100 rounded-lg group-hover:bg-pink-500 transition-colors">
                  <Video className="w-6 h-6 text-pink-600 group-hover:text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">Generate Video</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">AI music videos</p>
              <div className="text-lg font-bold text-pink-600">$3.60</div>
            </a>
          </Link>

          <Link href="/beat-generations">
            <a className="block bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <Package className="w-6 h-6" />
                <h3 className="font-semibold">Full Package</h3>
              </div>
              <p className="text-sm text-purple-100 mb-2">Beat + Video</p>
              <div className="text-lg font-bold">$6.10</div>
              <div className="text-xs text-purple-100 mt-1">Save $0.00</div>
            </a>
          </Link>
        </div>

        {/* Recent Jobs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Generations</h3>
          </div>

          {jobsLoading ? (
            <div className="p-12 text-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-purple-600" />
              <div>Loading your jobs...</div>
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <div className="font-medium mb-1">No generations yet</div>
              <div className="text-sm">Create your first beat or video to get started!</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <a className="block px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        {/* Icon */}
                        <div
                          className={`p-2 rounded-lg ${
                            job.mode === 'music' || job.mode === 'beats' ? 'bg-purple-100' : 'bg-pink-100'
                          }`}
                        >
                          {job.mode === 'music' || job.mode === 'beats' ? (
                            <Music className="w-5 h-5 text-purple-600" />
                          ) : (
                            <Video className="w-5 h-5 text-pink-600" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {job.scriptName ||
                              `${job.mode === 'music' || job.mode === 'beats' ? 'Beat' : 'Video'} Generation`}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(job.createdAt).toLocaleDateString()} at{' '}
                            {new Date(job.createdAt).toLocaleTimeString()}
                          </div>
                        </div>

                        {/* Status */}
                        <JobStatusBadge status={job.status} />

                        {/* Cost */}
                        {job.userChargeUSD && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg">
                            {job.stripeChargeId === 'FREE_CREDIT' ? (
                              <div className="text-sm font-medium text-green-600">Free</div>
                            ) : (
                              <>
                                <DollarSign className="w-4 h-4 text-gray-600" />
                                <span className="text-sm font-medium text-gray-900">
                                  {parseFloat(job.userChargeUSD).toFixed(2)}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Progress */}
                        {job.status === 'processing' && (
                          <div className="w-32">
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 transition-all"
                                style={{ width: `${job.progress}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1 text-center">{job.progress}%</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          )}

          {jobs && jobs.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <Link href="/jobs">
                <a className="text-sm text-purple-600 hover:text-purple-700 font-medium">View all generations →</a>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
