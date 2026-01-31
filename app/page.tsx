'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import {
  Sun, BarChart3, GitCompareArrows, Bell, FileText,
  ArrowRight, Shield, Zap, Activity, ChevronRight,
  AlertTriangle, Check, Eye, TrendingUp,
} from 'lucide-react'

export default function LandingPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const [redirecting, setRedirecting] = useState(false)
  const [showLanding, setShowLanding] = useState(false)

  useEffect(() => {
    const forceShowLanding = setTimeout(() => {
      setShowLanding(true)
      setRedirecting(false)
    }, 2000)

    if (isLoaded && isSignedIn && !redirecting && !showLanding) {
      clearTimeout(forceShowLanding)
      setRedirecting(true)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        setShowLanding(true)
        setRedirecting(false)
      }, 2000)

      fetch('/api/auth/user', {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      })
        .then(res => { clearTimeout(timeoutId); return res.json() })
        .then(data => {
          if (data.profile?.role === 'SUPER_ADMIN') router.push('/admin')
          else if (data.profile?.status === 'PENDING_ASSIGNMENT' || !data.profile?.organizationId) router.push('/pending-assignment')
          else router.push('/dashboard')
        })
        .catch(() => { clearTimeout(timeoutId); setShowLanding(true); setRedirecting(false) })
    }

    return () => clearTimeout(forceShowLanding)
  }, [isLoaded, isSignedIn, router, redirecting, showLanding])

  if (showLanding || (isLoaded && !isSignedIn)) {
    // Continue to landing page
  } else if (!isLoaded || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-500">
            {!isLoaded ? 'Initializing...' : 'Redirecting to dashboard...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center">
                <Sun className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-gray-900">Solar Cloud</span>
                <span className="text-xs text-gray-500 block -mt-1">by Bijli Bachao</span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-8 text-sm">
              <a href="#problem" className="text-gray-600 hover:text-gray-900 transition-colors">Problem</a>
              <a href="#solution" className="text-gray-600 hover:text-gray-900 transition-colors">Solution</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              {isSignedIn ? (
                <Link
                  href="/auth-redirect"
                  className="px-3 md:px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium text-sm"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                    Sign In
                  </Link>
                  <Link
                    href="/sign-up"
                    className="px-3 md:px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium text-sm"
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50 via-white to-white" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-orange-100/50 rounded-full blur-3xl" />

        <div className="max-w-5xl mx-auto relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-100 border border-orange-200 rounded-full text-orange-700 text-sm mb-6">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            PV String Monitoring
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-gray-900">
            Detect <span className="text-orange-600">underperforming strings</span>
            <br />
            before they cost you money.
          </h1>

          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Solar Performance Cloud gives you real-time visibility into every PV string across all your inverters.
            Spot degradation, shading issues, and faults instantly.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <Link
              href="/sign-up"
              className="px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all font-semibold flex items-center gap-2 group shadow-lg shadow-orange-500/25"
            >
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/sign-in"
              className="px-6 py-3 bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-medium border border-gray-300"
            >
              Sign In
            </Link>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-500" />
              <span>Huawei SmartPVMS</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-500" />
              <span>5-min sync</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500" />
              <span>Real-time alerts</span>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">
              The hidden problem with solar plants
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Your solar plant might look fine on the surface, but individual strings could be silently underperforming — costing you generation and revenue every day.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Before */}
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl p-8 border-2 border-red-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-red-700">Without Monitoring</h3>
              </div>

              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="text-red-500 font-bold mt-0.5">&#10005;</span>
                  <span>Inverter shows total power — no per-string breakdown</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="text-red-500 font-bold mt-0.5">&#10005;</span>
                  <span>Shaded or dirty panels go unnoticed for months</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="text-red-500 font-bold mt-0.5">&#10005;</span>
                  <span>No way to compare string performance across inverters</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="text-red-500 font-bold mt-0.5">&#10005;</span>
                  <span>Faults found only during annual inspections</span>
                </li>
              </ul>
            </div>

            {/* After */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border-2 border-green-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-green-700">With Solar Cloud</h3>
              </div>

              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="text-green-500 font-bold mt-0.5">&#10003;</span>
                  <span>See voltage, current, and power for every string</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="text-green-500 font-bold mt-0.5">&#10003;</span>
                  <span>Auto-detect underperformers vs average</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="text-green-500 font-bold mt-0.5">&#10003;</span>
                  <span>Side-by-side string comparison with charts</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="text-green-500 font-bold mt-0.5">&#10003;</span>
                  <span>Instant alerts when strings drop below threshold</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Solution / Features Section */}
      <section id="solution" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">
              Everything you need to monitor PV health
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              From real-time data to monthly reports — one platform for complete string-level visibility.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: BarChart3,
                title: 'Real-time Monitoring',
                description: 'Track PV string voltage, current, and power every 5 minutes from Huawei SmartPVMS.',
                color: 'orange',
              },
              {
                icon: GitCompareArrows,
                title: 'String Comparison',
                description: 'Compare strings side-by-side. Instantly see which ones are below average.',
                color: 'blue',
              },
              {
                icon: Bell,
                title: 'Smart Alerts',
                description: 'Automatic alerts when strings drop below 50%, 75%, or 90% of average current.',
                color: 'red',
              },
              {
                icon: FileText,
                title: 'Health Reports',
                description: 'Daily health scores per string. Monthly trends to track degradation over time.',
                color: 'green',
              },
            ].map((feature) => {
              const colorMap: Record<string, string> = {
                orange: 'bg-orange-100 text-orange-600 group-hover:bg-orange-200',
                blue: 'bg-blue-100 text-blue-600 group-hover:bg-blue-200',
                red: 'bg-red-100 text-red-600 group-hover:bg-red-200',
                green: 'bg-green-100 text-green-600 group-hover:bg-green-200',
              }
              return (
                <div
                  key={feature.title}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-all group"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${colorMap[feature.color]}`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-100 rounded-full text-orange-700 text-sm font-medium mb-4">
              <Zap className="w-4 h-4" />
              How It Works
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Connect your plant. <span className="text-orange-600">See every string.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: Eye,
                title: 'Connect',
                description: 'We connect to your Huawei FusionSolar / SmartPVMS account. No hardware needed.',
              },
              {
                step: '02',
                icon: Activity,
                title: 'Monitor',
                description: 'Every 5 minutes, we pull string-level data from all your inverters automatically.',
              },
              {
                step: '03',
                icon: TrendingUp,
                title: 'Optimize',
                description: 'Get alerts on underperformers, compare strings, and track health over time.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div className="w-16 h-16 bg-white rounded-2xl border-2 border-orange-200 flex items-center justify-center shadow-sm">
                    <item.icon className="w-7 h-7 text-orange-500" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>

          {/* CTA Box */}
          <div className="mt-16 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-8 text-center text-white shadow-xl">
            <h3 className="text-2xl md:text-3xl font-bold mb-2">Ready to see your strings?</h3>
            <p className="text-orange-100 mb-6">Start monitoring in minutes. No hardware installation required.</p>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-orange-600 rounded-xl font-bold hover:bg-orange-50 transition-colors"
            >
              Get Started Free
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
                <Sun className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="font-bold text-gray-900">Solar Performance Cloud</span>
                <span className="text-xs text-gray-500 block">by Bijli Bachao</span>
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link href="/sign-in" className="hover:text-gray-900 transition-colors">Sign In</Link>
              <Link href="/sign-up" className="hover:text-gray-900 transition-colors">Sign Up</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
