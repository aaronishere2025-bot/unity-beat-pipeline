/**
 * Landing Page - Marketing page with Google OAuth login
 * Highlights competitive pricing and value proposition
 */

import { useState } from 'react';
import { loginWithGoogle } from '@/hooks/useAuth';
import { Music, DollarSign, Sparkles, Check, ArrowRight } from 'lucide-react';

export function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          {/* Logo / Brand */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <Music className="w-12 h-12 text-purple-400" />
            <h1 className="text-4xl font-bold text-white">BeatForge</h1>
          </div>

          {/* Headline */}
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Generate AI Beats.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              Keep 100% of Sales.
            </span>
          </h2>

          <p className="text-xl text-gray-300 mb-8">
            Create professional beats with AI for just $2.50. Sell them instantly with 0% commission.
            <br />
            <span className="text-purple-400 font-semibold">Try 5 beats free</span> - no credit card required.
          </p>

          {/* CTA Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-purple-900 rounded-full font-bold text-lg hover:bg-purple-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-900"></div>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Sign in with Google</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

          <p className="text-gray-400 text-sm mt-4">Get 5 free beat generations instantly. No credit card required.</p>
        </div>

        {/* Pricing Card - Centered */}
        <div className="flex justify-center mt-20 max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-lg rounded-2xl p-8 border-2 border-purple-400 relative max-w-md w-full">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-purple-500 text-white text-xs font-bold rounded-full">
              SIMPLE PRICING
            </div>
            <div className="flex items-center justify-center gap-3 mb-6">
              <Music className="w-10 h-10 text-purple-400" />
              <h3 className="text-2xl font-bold text-white">Beat Generation</h3>
            </div>
            <div className="mb-6 text-center">
              <div className="text-5xl font-bold text-white">$2.50</div>
              <div className="text-gray-400 text-lg">per beat</div>
            </div>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <Check className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-lg">AI-generated beats in any style</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-lg">Commercial license included</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-lg">Instant beat store listing</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-lg font-semibold text-purple-400">0% commission on sales</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-lg">Download MP3 + WAV files</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Competitive Comparison */}
        <div className="mt-20 max-w-4xl mx-auto bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">Why Creators Choose Us</h3>

          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="text-gray-400 text-sm mb-2">BeatStars</div>
              <div className="text-white font-semibold mb-1">30% commission</div>
              <div className="text-gray-500 text-sm">+ $10/mo for 0%</div>
            </div>

            <div>
              <div className="text-gray-400 text-sm mb-2">Airbit</div>
              <div className="text-white font-semibold mb-1">20% commission</div>
              <div className="text-gray-500 text-sm">+ $8/mo for 0%</div>
            </div>

            <div className="border-2 border-purple-400 rounded-lg p-4 bg-purple-500/10">
              <div className="text-purple-400 text-sm mb-2 font-semibold">BeatForge</div>
              <div className="text-white font-bold mb-1">10% commission</div>
              <div className="text-purple-300 text-sm">No monthly fees</div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-gray-300">
              On a <span className="text-white font-semibold">$5 beat sale</span>, you keep{' '}
              <span className="text-green-400 font-bold">$4.50</span> vs <span className="text-red-400">$3.50</span> on
              BeatStars
            </p>
            <p className="text-purple-400 font-semibold mt-2">That's $1.00 more per sale. Every. Single. Time.</p>
          </div>
        </div>

        {/* Simple Pricing Info */}
        <div className="mt-12 max-w-2xl mx-auto bg-blue-500/10 backdrop-blur-lg rounded-xl p-6 border border-blue-500/20">
          <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-400" />
            Simple, Fair Pricing
          </h4>
          <p className="text-gray-300 text-sm">
            Just <span className="text-blue-400 font-semibold">10% commission</span> on all sales. No hidden fees, no
            monthly subscriptions - way better than BeatStars (30%) or Airbit (20%).
          </p>
        </div>

        {/* Final CTA */}
        <div className="text-center mt-16">
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-bold text-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-5 h-5" />
            <span>Start Creating - 5 Free Beats</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
