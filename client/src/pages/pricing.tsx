import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, DollarSign, Zap, TrendingUp, Gift, Music, Video, Cog } from 'lucide-react';

export default function PricingPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-block mb-2">
            <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
              💳 Credit System - Buy Once, Use Anytime
            </Badge>
          </div>
          <h1 className="text-4xl font-bold">Simple Credit Pricing</h1>
          <p className="text-xl text-muted-foreground">
            1 credit = $0.10 • Buy in bulk, use anytime • Credits never expire
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2">What You Can Generate</h2>
          <p className="text-muted-foreground">Pay-per-use pricing with credits</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Audio Only */}
          <Card>
            <CardHeader>
              <div className="text-center mb-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-2xl font-bold text-muted-foreground line-through">100</span>
                  <span className="text-4xl font-bold text-primary">75</span>
                </div>
                <div className="text-sm text-muted-foreground">credits ($7.50)</div>
                <Badge className="mt-2 bg-green-500">25% OFF</Badge>
              </div>
              <CardTitle className="text-center">Audio Only</CardTitle>
              <CardDescription className="text-center">30-minute music mix</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>8 AI-generated beats</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>Commercial license</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>MP3 + WAV download</span>
                </li>
              </ul>

              <Button className="w-full">Generate</Button>
            </CardContent>
          </Card>

          {/* Full Video - HERO CARD */}
          <Card className="border-2 border-primary shadow-lg relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg">
                ⭐ MOST POPULAR
              </Badge>
            </div>

            <CardHeader className="pt-8">
              <div className="text-center mb-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-2xl font-bold text-muted-foreground line-through">500</span>
                  <span className="text-4xl font-bold text-primary">300</span>
                </div>
                <div className="text-sm text-muted-foreground">credits ($30.00)</div>
                <Badge className="mt-2 bg-green-500">40% OFF</Badge>
              </div>
              <CardTitle className="text-center">Full Video Package</CardTitle>
              <CardDescription className="text-center">3-minute AI music video</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>AI music + visuals</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>History-themed narratives</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>16:9 or 9:16 format</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>YouTube ready</span>
                </li>
              </ul>

              <div className="text-xs text-center text-muted-foreground p-3 bg-primary/5 rounded-lg">
                <strong className="text-foreground">World's first 1-click AI video platform.</strong> Complete music
                video in minutes.
              </div>

              <Button className="w-full">Generate</Button>
            </CardContent>
          </Card>

          {/* BYO Audio */}
          <Card>
            <CardHeader>
              <div className="text-center mb-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-2xl font-bold text-muted-foreground line-through">400</span>
                  <span className="text-4xl font-bold text-primary">300</span>
                </div>
                <div className="text-sm text-muted-foreground">credits ($30.00)</div>
                <Badge className="mt-2 bg-green-500">25% OFF</Badge>
              </div>
              <CardTitle className="text-center">Bring Your Own Audio</CardTitle>
              <CardDescription className="text-center">Your track + AI visuals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>Upload your audio</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>AI video generation</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>Beat-synchronized</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>16:9 or 9:16 format</span>
                </li>
              </ul>

              <Button className="w-full">Generate</Button>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Credit Packages */}
        <div>
          <h2 className="text-2xl font-bold mb-6 text-center">Buy Credits</h2>
          <p className="text-center text-muted-foreground mb-6">
            1 credit = $0.10 • Credits never expire • Use anytime
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">$10</CardTitle>
                <CardDescription>100 credits</CardDescription>
                <Badge variant="outline" className="mt-2 text-xs">
                  Minimal Package
                </Badge>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Buy Credits</Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-500/50 relative">
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-green-500">+50 BONUS • 10%</Badge>
              </div>
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-lg">$50</CardTitle>
                <CardDescription>550 credits</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Buy Credits</Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-500/50 relative">
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-green-500">+150 BONUS • 15%</Badge>
              </div>
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-lg">$100</CardTitle>
                <CardDescription>1,150 credits</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Buy Credits</Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-500/50 relative">
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-green-500">+375 BONUS • 15%</Badge>
              </div>
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-lg">$250</CardTitle>
                <CardDescription>2,875 credits</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Buy Credits</Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-500/50 relative">
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-green-500">+750 BONUS • 15%</Badge>
              </div>
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-lg">$500</CardTitle>
                <CardDescription>5,750 credits</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Buy Credits</Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-amber-500/50 relative">
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500">+2,000 BONUS • 20%</Badge>
              </div>
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-lg">$1,000</CardTitle>
                <CardDescription>12,000 credits</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Buy Credits</Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* Free Trial */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Gift className="w-8 h-8 text-primary" />
              <div>
                <CardTitle>New User Bonus</CardTitle>
                <CardDescription>Get started for free</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold mb-2">100 Free Credits</div>
                <div className="text-sm text-muted-foreground">
                  Every new signup receives 100 credits ($10 value) - enough for 1 free 30-minute mix!
                </div>
              </div>
              <Button size="lg">Sign Up Now</Button>
            </div>
          </CardContent>
        </Card>

        {/* How Credits Work */}
        <div className="text-center">
          <Card className="inline-block bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-2 border-blue-300 dark:border-blue-700">
            <CardContent className="p-6 max-w-3xl">
              <h3 className="text-xl font-bold mb-3 flex items-center justify-center gap-2">
                <DollarSign className="w-6 h-6 text-primary" />
                How Credits Work
              </h3>
              <div className="grid md:grid-cols-3 gap-4 text-left">
                <div>
                  <div className="font-semibold mb-1">Simple Math</div>
                  <p className="text-sm text-muted-foreground">1 credit = $0.10. Buy in bulk, use anytime.</p>
                </div>
                <div>
                  <div className="font-semibold mb-1">Never Expire</div>
                  <p className="text-sm text-muted-foreground">Your credits last forever. No pressure to use them.</p>
                </div>
                <div>
                  <div className="font-semibold mb-1">No Surprises</div>
                  <p className="text-sm text-muted-foreground">
                    See exact credit cost before generating. Full transparency.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* FAQ */}
        <div>
          <h2 className="text-2xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How does billing work?</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Buy credits in advance (100, 1000, 5000, or 10000 credits). We'll deduct credits each time you generate
                content. No subscriptions or commitments. 1 credit = $0.10.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What if I run out of credits?</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Simply buy more credits anytime. We'll warn you before generating if you don't have enough credits.
                Choose from 100, 1000, 5000, or 10000 credit packages.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I get a refund?</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                If generation fails, we automatically refund the credits to your account. For other cases, contact
                support.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Do credits expire?</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                No! Your credits never expire. Buy once, use whenever you're ready. No time limits or expiration dates.
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-primary/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  What makes this so fast?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <p>
                  <strong className="text-foreground">Generate 30 minutes of music in just 10 minutes.</strong> Our
                  AI-powered pipeline handles everything automatically - from composition to mixing to mastering.
                </p>
                <p>
                  <strong className="text-foreground">
                    Package to 15 different social platforms instantly (coming soon).
                  </strong>{' '}
                  We automatically format your content for TikTok, Instagram Reels, YouTube Shorts, Facebook, Twitter,
                  LinkedIn, and more. No manual resizing, no re-encoding - just click and distribute.
                </p>
                <p>
                  <strong className="text-foreground">Full AI visuals for videos up to 3 minutes.</strong> You're
                  looking at the world's first 1-click full-gen AI video platform, currently in testing. Our Kling AI
                  integration generates cinematic video clips synchronized to your music - history-themed narratives,
                  beat-synced visuals, or your own creative direction. All rendered in minutes, not hours. No manual
                  editing required.
                </p>
                <p className="font-medium text-foreground">
                  What takes traditional creators days, you can do in minutes. That's the power of AI automation.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
