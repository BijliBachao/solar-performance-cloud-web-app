'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import {
  Sun, BarChart3, Bell, ArrowRight, Zap, Activity,
  AlertTriangle, Check, Eye, TrendingUp, Shield, Clock,
  Cpu, ChevronRight, Layers, Radio,
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
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#76b900] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#a7a7a7]">
            {!isLoaded ? 'Initializing...' : 'Redirecting to dashboard...'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Navigation ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 w-full bg-black/90 backdrop-blur-sm border-b border-[#333] z-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-sm bg-[#76b900]/20 flex items-center justify-center">
                <Sun className="w-4 h-4 text-[#76b900]" />
              </div>
              <div>
                <span className="text-sm font-bold text-white">Solar Performance Cloud</span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-xs font-semibold text-[#a7a7a7] hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="text-xs font-semibold text-[#a7a7a7] hover:text-white transition-colors">How It Works</a>
              <a href="#faults" className="text-xs font-semibold text-[#a7a7a7] hover:text-white transition-colors">Fault Detection</a>
            </div>

            <div className="flex items-center gap-3">
              {isSignedIn ? (
                <Link href="/auth-redirect" className="px-4 py-1.5 text-xs font-bold border-2 border-[#76b900] text-[#76b900] rounded-sm hover:bg-[#76b900] hover:text-white transition-colors">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" className="text-xs font-semibold text-[#a7a7a7] hover:text-white transition-colors">
                    Sign In
                  </Link>
                  <Link href="/sign-up" className="px-4 py-1.5 text-xs font-bold border-2 border-[#76b900] text-[#76b900] rounded-sm hover:bg-[#76b900] hover:text-white transition-colors">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="pt-28 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#76b900]/30 rounded-sm text-[#76b900] text-[10px] font-bold uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 bg-[#76b900] rounded-full animate-pulse" />
            IEC 61724 Aligned Monitoring
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold leading-[1.15] mb-6 tracking-tight">
            Detect underperforming strings
            <br />
            <span className="text-[#76b900]">before they cost you money.</span>
          </h1>

          <p className="text-base md:text-lg text-[#a7a7a7] mb-10 max-w-2xl mx-auto leading-relaxed">
            Real-time PV string-level monitoring across Huawei, Solis, Growatt, and Sungrow inverters.
            No hardware required. Data syncs every 5 minutes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/sign-up"
              className="px-6 py-2.5 text-sm font-bold border-2 border-[#76b900] text-white bg-[#76b900] rounded-sm hover:bg-[#5a8f00] hover:border-[#5a8f00] transition-colors flex items-center gap-2"
            >
              Start Monitoring <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/sign-in"
              className="px-6 py-2.5 text-sm font-bold border-2 border-[#5e5e5e] text-[#a7a7a7] rounded-sm hover:border-white hover:text-white transition-colors"
            >
              Sign In
            </Link>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#333] rounded-sm overflow-hidden max-w-3xl mx-auto">
            {[
              { value: '41', label: 'Plants Monitored' },
              { value: '46', label: 'Inverters Connected' },
              { value: '245', label: 'Active PV Strings' },
              { value: '5 min', label: 'Data Sync Interval' },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#1a1a1a] px-6 py-4 text-center">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-[10px] font-semibold text-[#898989] uppercase tracking-wider mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Brands ─────────────────────────────────────────────────── */}
      <section className="py-12 border-y border-[#333]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-[10px] font-bold text-[#898989] uppercase tracking-widest mb-6">
            Works with your existing inverters
          </p>
          <div className="flex items-center justify-center gap-12 md:gap-20">
            {['Huawei', 'Solis', 'Growatt', 'Sungrow'].map((brand) => (
              <span key={brand} className="text-lg md:text-xl font-bold text-[#5e5e5e]">
                {brand}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Zero Hardware ──────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#5e5e5e] rounded-sm text-[#898989] text-[10px] font-bold uppercase tracking-wider mb-6">
            Zero Hardware Required
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">
            No sensors. No gateways. No wiring.
          </h2>
          <p className="text-base text-[#a7a7a7] max-w-2xl mx-auto leading-relaxed">
            Your inverters are already collecting string-level data and uploading it to the cloud.
            We connect to their APIs directly — Huawei FusionSolar, SolisCloud, Growatt OpenAPI, and Sungrow iSolarCloud.
            Setup takes minutes, not days.
          </p>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-6 bg-[#0d0d0d]">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-bold text-[#76b900] uppercase tracking-widest mb-3">Capabilities</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-12 tracking-tight">
            String-level visibility.<br />Inverter-level clarity.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Activity, title: 'Per-String Health Scores', desc: 'Performance and Availability scores per string, per day. See exactly which string is underperforming and whether it\'s a shading issue or a connection fault.' },
              { icon: AlertTriangle, title: 'Intelligent Alerts', desc: 'Three severity levels — Critical (>50% drop), Warning (25-50%), Info (10-25%). Skips low-light conditions. Auto-resolves when strings recover.' },
              { icon: Eye, title: 'Fault Diagnosis', desc: 'Distinguishes between dirty panels, bird droppings, tree shadows, loose cables, broken connections, and panel degradation — each with specific action guidance.' },
              { icon: BarChart3, title: 'Performance Analysis', desc: 'Date-range heatmaps showing health scores across all strings. Export to CSV. Compare performance trends over weeks and months.' },
              { icon: TrendingUp, title: 'Shading Detection', desc: 'Time-of-day pattern analysis identifies current drops at specific hours — pinpointing tree shadows and building obstructions as they grow.' },
              { icon: Layers, title: 'Multi-Brand Dashboard', desc: 'Huawei, Solis, Growatt, and Sungrow inverters in one unified view. No switching between four different apps.' },
            ].map((feature) => (
              <div key={feature.title} className="bg-[#1a1a1a] border border-[#333] rounded-sm p-5">
                <feature.icon className="w-5 h-5 text-[#76b900] mb-3" />
                <h3 className="text-sm font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-xs text-[#a7a7a7] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-bold text-[#76b900] uppercase tracking-widest mb-3">Process</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-12 tracking-tight">
            From sign-up to monitoring<br />in under 5 minutes.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Share Credentials', desc: 'Provide your inverter cloud API credentials (FusionSolar, SolisCloud, Growatt OpenAPI, or iSolarCloud). We handle the rest.' },
              { step: '02', title: 'Automatic Discovery', desc: 'SPC discovers all your plants, inverters, and strings automatically. No manual configuration of devices or port numbers.' },
              { step: '03', title: 'Real-Time Monitoring', desc: 'Data flows every 5 minutes. Health scores, alerts, and fault diagnosis start immediately. Access your dashboard from any device.' },
            ].map((item) => (
              <div key={item.step} className="relative">
                <span className="text-5xl font-bold text-[#1a1a1a] absolute -top-2 -left-1">{item.step}</span>
                <div className="pt-10">
                  <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-xs text-[#a7a7a7] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fault Detection ────────────────────────────────────────── */}
      <section id="faults" className="py-20 px-6 bg-[#0d0d0d]">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-bold text-[#76b900] uppercase tracking-widest mb-3">Fault Detection</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">
            Know what&apos;s wrong.<br />Know what to fix.
          </h2>
          <p className="text-base text-[#a7a7a7] mb-10 max-w-2xl leading-relaxed">
            SPC doesn&apos;t just tell you a string is underperforming — it tells you why, and what action to take.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-[#333]">
                  <th className="py-3 pr-6 text-[10px] font-bold text-[#898989] uppercase tracking-wider">Fault Type</th>
                  <th className="py-3 pr-6 text-[10px] font-bold text-[#898989] uppercase tracking-wider">Pattern</th>
                  <th className="py-3 text-[10px] font-bold text-[#898989] uppercase tracking-wider">Detection</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { fault: 'Dirty / Dusty Panels', pattern: '10-30% current drop, gradual', detection: 'Multiple strings decline together over days' },
                  { fault: 'Bird Droppings', pattern: '>25% sudden drop', detection: 'Individual string, not time-dependent' },
                  { fault: 'Tree Shadow', pattern: 'Drops at specific hours', detection: 'Time-of-day pattern analysis' },
                  { fault: 'Faulty Panel', pattern: '30-50% consistently lower', detection: 'Persistent regardless of weather/time' },
                  { fault: 'Loose Cable', pattern: 'Random on/off, intermittent', detection: 'High performance but low availability' },
                  { fault: 'Broken / Disconnected', pattern: '0V, 0A', detection: 'Complete loss of output' },
                  { fault: 'Panel Degradation', pattern: 'Gradual decline over months', detection: 'Slow health score decrease in trends' },
                ].map((row) => (
                  <tr key={row.fault} className="border-b border-[#252525] hover:bg-[#1a1a1a] transition-colors">
                    <td className="py-3 pr-6 text-sm font-bold text-white">{row.fault}</td>
                    <td className="py-3 pr-6 text-xs text-[#a7a7a7]">{row.pattern}</td>
                    <td className="py-3 text-xs text-[#a7a7a7]">{row.detection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── IEC Standard ───────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-8 md:p-12">
            <div className="flex items-start gap-4">
              <Shield className="w-8 h-8 text-[#76b900] flex-shrink-0 mt-1" />
              <div>
                <p className="text-[10px] font-bold text-[#76b900] uppercase tracking-widest mb-2">International Standard</p>
                <h3 className="text-xl md:text-2xl font-bold mb-3">IEC 61724 Aligned Health Scoring</h3>
                <p className="text-sm text-[#a7a7a7] leading-relaxed mb-6">
                  Our health scoring system follows the IEC 61724 standard for photovoltaic system performance monitoring.
                  Each string is evaluated on two separate metrics — <strong className="text-white">Performance</strong> (current quality when producing) and <strong className="text-white">Availability</strong> (percentage of daylight hours the string was active) — then combined into a single Health Score.
                </p>
                <p className="text-sm text-[#a7a7a7] leading-relaxed">
                  This separation means you instantly know whether a problem is a <strong className="text-white">panel issue</strong> (low performance, high availability = shading or degradation) or a <strong className="text-white">wiring issue</strong> (high performance, low availability = loose cable or intermittent fault).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#0d0d0d] border-t border-[#333]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">
            Stop guessing. Start monitoring.
          </h2>
          <p className="text-base text-[#a7a7a7] mb-8 max-w-xl mx-auto leading-relaxed">
            Every day without string-level monitoring is a day you&apos;re losing generation without knowing it.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="px-8 py-3 text-sm font-bold border-2 border-[#76b900] text-white bg-[#76b900] rounded-sm hover:bg-[#5a8f00] hover:border-[#5a8f00] transition-colors flex items-center gap-2"
            >
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/sign-in"
              className="px-8 py-3 text-sm font-bold border-2 border-[#5e5e5e] text-[#a7a7a7] rounded-sm hover:border-white hover:text-white transition-colors"
            >
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="py-10 px-6 border-t border-[#333]">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-sm bg-[#76b900]/20 flex items-center justify-center">
              <Sun className="w-3.5 h-3.5 text-[#76b900]" />
            </div>
            <span className="text-xs font-bold text-[#a7a7a7]">Solar Performance Cloud</span>
            <span className="text-xs text-[#5e5e5e]">by BijliBachao.pk</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-[#5e5e5e]">
            <span>Founded by Engr. Reyyan Niaz Khan</span>
            <span>·</span>
            <span>Lahore, Pakistan</span>
            <span>·</span>
            <a href="https://wa.me/923234578775" className="hover:text-[#76b900] transition-colors">WhatsApp</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
