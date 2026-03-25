/**
 * Beat Store Page - Manage beat listings and sales
 * Users can list their generated beats for sale, track sales, and view analytics
 */

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Music, DollarSign, Eye, ShoppingCart, Plus, Edit, Trash2, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';

interface BeatListing {
  id: string;
  beatName: string;
  description: string | null;
  priceUSD: string;
  stripePaymentLinkUrl: string;
  views: number;
  purchases: number;
  totalRevenueUSD: string;
  isGenerated: boolean;
  active: boolean;
  createdAt: string;
}

interface Analytics {
  totalListings: number;
  activeListings: number;
  totalSales: number;
  totalRevenue: string;
  totalViews: number;
  conversionRate: string;
  avgRevenuePerListing: string;
}

async function fetchBeatListings(): Promise<BeatListing[]> {
  const response = await fetch('/api/beat-store/listings', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch listings');
  }

  return response.json();
}

async function fetchAnalytics(): Promise<Analytics> {
  const response = await fetch('/api/beat-store/analytics', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch analytics');
  }

  return response.json();
}

async function deleteListing(listingId: string): Promise<void> {
  const response = await fetch(`/api/beat-store/listings/${listingId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to delete listing');
  }
}

export function BeatStorePage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [showNewListingForm, setShowNewListingForm] = useState(false);

  const { data: listings, isLoading: listingsLoading } = useQuery<BeatListing[]>({
    queryKey: ['beat-listings'],
    queryFn: fetchBeatListings,
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ['beat-analytics'],
    queryFn: fetchAnalytics,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteListing,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beat-listings'] });
      queryClient.invalidateQueries({ queryKey: ['beat-analytics'] });
    },
  });

  const handleDelete = async (listingId: string, beatName: string) => {
    if (confirm(`Are you sure you want to remove "${beatName}" from your store?`)) {
      await deleteMutation.mutateAsync(listingId);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Music className="w-8 h-8 text-purple-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Beat Store</h1>
                <p className="text-sm text-gray-600">Sell your beats, keep 100%</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/app">
                <a className="text-sm text-gray-600 hover:text-gray-900">← Back to Dashboard</a>
              </Link>
              {user?.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-10 h-10 rounded-full border-2 border-purple-500"
                />
              )}
              <button onClick={() => logout()} className="text-sm text-gray-600 hover:text-gray-900">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Analytics Cards */}
        {analytics && (
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <Music className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-gray-900">Total Listings</h3>
              </div>
              <div className="text-3xl font-bold text-purple-600">{analytics.totalListings}</div>
              <div className="text-xs text-gray-500 mt-1">{analytics.activeListings} active</div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <ShoppingCart className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-gray-900">Total Sales</h3>
              </div>
              <div className="text-3xl font-bold text-green-600">{analytics.totalSales}</div>
              <div className="text-xs text-gray-500 mt-1">{analytics.conversionRate} conversion</div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Total Revenue</h3>
              </div>
              <div className="text-3xl font-bold text-blue-600">${analytics.totalRevenue}</div>
              <div className="text-xs text-gray-500 mt-1">${analytics.avgRevenuePerListing} avg/listing</div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <Eye className="w-5 h-5 text-orange-600" />
                <h3 className="font-semibold text-gray-900">Total Views</h3>
              </div>
              <div className="text-3xl font-bold text-orange-600">{analytics.totalViews}</div>
            </div>
          </div>
        )}

        {/* Commission Info Banner */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl p-6 mb-8">
          <h3 className="text-lg font-bold mb-2">🎉 Zero Commission on Generated Beats!</h3>
          <p className="text-purple-100">
            Platform-generated beats: <strong>0% commission</strong> - you keep 100% of sales!
            <br />
            All beats: 10% platform fee (way better than BeatStars 30% or Airbit 20%)
          </p>
        </div>

        {/* Listings Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">My Beat Listings</h3>
            <button
              onClick={() => setShowNewListingForm(!showNewListingForm)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Listing
            </button>
          </div>

          {listingsLoading ? (
            <div className="p-12 text-center text-gray-500">
              <Music className="w-12 h-12 mx-auto mb-3 text-gray-400 animate-pulse" />
              <div>Loading your beat listings...</div>
            </div>
          ) : !listings || listings.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Music className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <div className="font-medium mb-1">No beats listed yet</div>
              <div className="text-sm">Generate a beat and list it for sale to get started!</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {listings.map((listing) => (
                <div key={listing.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {/* Beat Info */}
                      <div className="p-3 bg-purple-100 rounded-lg">
                        <Music className="w-6 h-6 text-purple-600" />
                      </div>

                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{listing.beatName}</div>
                        <div className="text-sm text-gray-500">{listing.description || 'No description'}</div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {listing.views} views
                          </span>
                          <span className="flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3" />
                            {listing.purchases} sales
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />${listing.totalRevenueUSD} revenue
                          </span>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">${listing.priceUSD}</div>
                        <div className="text-xs text-gray-500">{listing.isGenerated ? '0% fee' : '10% fee'}</div>
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-2">
                        {listing.active ? (
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            Active
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                            Inactive
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <a
                          href={listing.stripePaymentLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View payment link"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit listing"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(listing.id, listing.beatName)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete listing"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Listing Form (placeholder) */}
        {showNewListingForm && (
          <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Beat Listing</h3>
            <div className="text-sm text-gray-600">
              To list a beat for sale, generate a beat from the{' '}
              <Link href="/beat-generations">
                <a className="text-purple-600 hover:text-purple-700 font-medium">Beat Generations</a>
              </Link>{' '}
              page, then click "List for Sale" on the completed job.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
