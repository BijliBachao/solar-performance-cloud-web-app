'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import {
  Sun, BarChart3, ArrowRight, Activity, AlertTriangle, Eye,
  TrendingUp, Shield, Layers, MessageCircle, CheckCircle2,
  ArrowUpRight, Zap, Clock, Target, Users, MapPin, Award,
  Factory, Building2, Home, HeartPulse, Network, Gauge,
} from 'lucide-react'
import {
  HEALTH_HEALTHY, HEALTH_CAUTION, HEALTH_WARNING, HEALTH_SEVERE,
} from '@/lib/string-health'

const WHATSAPP_URL = 'https://wa.me/923234578775'
const WHATSAPP_LABEL = '+92 323 457 8775'

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
        credentials: 'include',
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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-solar-gold-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-600">
            {!isLoaded ? 'Initializing...' : 'Redirecting to dashboard...'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* ══ NAVIGATION ══════════════════════════════════════════════ */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-sm bg-gradient-to-br from-solar-gold-400 to-solar-gold-600 flex items-center justify-center shadow-sm">
                <Sun className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-bold text-slate-900 whitespace-nowrap">Solar Performance Cloud</span>
                <span className="text-[9px] font-semibold text-slate-500 tracking-wider uppercase">by BijliBachao.pk</span>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-5 lg:gap-8">
              <a href="#demo" className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">Demo</a>
              <a href="#how-it-works" className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">How It Works</a>
              <a href="#founder" className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">Founder</a>
              <a href="#parent" className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">Bijli Bachao</a>
            </div>

            <div className="flex items-center gap-3">
              {isSignedIn ? (
                <Link href="/auth-redirect" className="px-4 py-2 text-xs font-bold bg-solar-gold-500 text-white rounded-sm hover:bg-solar-gold-600 transition-colors">
                  Go to Dashboard →
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" className="hidden sm:inline text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                    Sign In
                  </Link>
                  <a href="#cta" className="px-4 py-2 text-xs font-bold bg-solar-gold-500 text-white rounded-sm hover:bg-solar-gold-600 transition-colors whitespace-nowrap shadow-sm hover:shadow-md">
                    Book Free Site Visit
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ══ HERO ════════════════════════════════════════════════════ */}
      <section className="relative pt-36 pb-24 px-6 overflow-hidden">
        {/* Subtle gold radial gradient background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(1200px circle at 50% -10%, rgba(245,158,11,0.12), transparent 60%), radial-gradient(900px circle at 80% 40%, rgba(251,191,36,0.08), transparent 50%)',
          }}
        />

        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 border border-solar-gold-200 bg-solar-gold-50 rounded-full text-solar-gold-800 text-[9px] md:text-[10px] font-bold uppercase tracking-wider md:tracking-widest mb-8 shadow-sm max-w-[95vw] text-center">
            <span className="w-1.5 h-1.5 bg-bb-green-500 rounded-full flex-shrink-0 animate-pulse" />
            <span>A Product of Bijli Bachao <span className="hidden sm:inline">· Pakistan&apos;s First String-Level Monitoring</span></span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] mb-8 tracking-tight text-slate-900">
            Detect underperforming strings
            <br className="hidden md:block" />
            <span className="text-solar-gold-600"> before they cost you money.</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-3xl mx-auto leading-relaxed">
            Our engineers install a compact monitoring device at your plant —
            live string-level data every 5 minutes, fault diagnosis in seconds,
            no guesswork, no downtime surprises.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <a
              href="#cta"
              className="group px-8 py-4 text-sm font-bold bg-solar-gold-500 text-white rounded-sm hover:bg-solar-gold-600 transition-all flex items-center gap-2 shadow-lg shadow-solar-gold-500/20 hover:shadow-xl hover:shadow-solar-gold-500/30 hover:-translate-y-0.5"
            >
              Book a Free Site Visit
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 sm:px-8 py-4 text-sm font-bold border-2 border-bb-green-500 text-bb-green-700 rounded-sm hover:bg-bb-green-500 hover:text-white transition-all flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp {WHATSAPP_LABEL}
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-bb-green-500" /> No commitment</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-bb-green-500" /> Engineer-installed</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-bb-green-500" /> IEC 61724 aligned</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-bb-green-500" /> 14+ years in Pakistan</span>
          </div>
        </div>
      </section>

      {/* ══ THREE PILLARS ════════════════════════════════════════════ */}
      <section className="py-20 px-6 border-t border-slate-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">Why SPC</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 max-w-3xl mx-auto">
              Three reasons every commercial solar operator in Pakistan should care.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Gauge,
                title: 'Catch losses fast',
                desc: 'Alerts in 5 minutes, not 5 months. The average commercial solar plant loses 2–7% of annual generation to undetected string faults. SPC surfaces them same-day — before weeks of lost kWh stack up.',
                stat: '< 5 min',
                statLabel: 'from fault to your phone',
              },
              {
                icon: Shield,
                title: 'Independent second opinion',
                desc: 'Your inverter vendor\'s app was built by the company that sold you the inverter. When hardware underperforms, their app has reasons to soften it. SPC has no inverter to sell you — just the truth about every string.',
                stat: 'Zero',
                statLabel: 'vendor conflicts of interest',
              },
              {
                icon: Layers,
                title: 'Every inverter brand, unified',
                desc: 'Huawei FusionSolar, Solis, Growatt, Sungrow — one dashboard, one language, one alert stream. The only platform in Pakistan that unifies four inverter brands in a single pane of glass.',
                stat: '4 brands',
                statLabel: 'in one dashboard',
              },
            ].map((pillar) => (
              <div key={pillar.title} className="bg-white border border-slate-200 rounded-sm p-7 hover:border-solar-gold-300 hover:shadow-md transition-all group">
                <div className="w-12 h-12 rounded-sm bg-gradient-to-br from-solar-gold-100 to-solar-gold-200 border border-solar-gold-300 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <pillar.icon className="w-6 h-6 text-solar-gold-700" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{pillar.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">{pillar.desc}</p>
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-2xl font-bold text-solar-gold-600 font-mono tracking-tight">{pillar.stat}</p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-1">{pillar.statLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SOCIAL PROOF BAR ════════════════════════════════════════ */}
      <section className="py-12 border-y border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">
            Trusted across Pakistan&apos;s solar fleet
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
            {[
              { value: '48 plants · 2.2 MW', label: 'Across Pakistan', accent: 'text-slate-900' },
              { value: '44 / 48', label: 'Producing right now', accent: 'text-bb-green-600' },
              { value: '1.3M+', label: 'Data points captured', accent: 'text-slate-900' },
              { value: '25,000+', label: 'Faults detected & resolved', accent: 'text-slate-900' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className={`text-2xl md:text-3xl font-bold ${stat.accent} font-mono tracking-tight`}>{stat.value}</p>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-2">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-8 md:gap-16 opacity-60">
            {['Huawei', 'Solis', 'Growatt', 'Sungrow'].map((brand) => (
              <span key={brand} className="text-base md:text-lg font-bold text-slate-500 tracking-tight">
                {brand}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PROBLEM → SOLUTION ═══════════════════════════════════════ */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">The Problem</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Your solar looks fine.
              <br />
              <span className="text-red-600">You&apos;re losing money every week.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-14">
            {/* Problem card */}
            <div className="bg-red-50 border border-red-200 rounded-sm p-8">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest">Without SPC</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">One number. Zero visibility.</h3>
              <ul className="space-y-3 text-sm text-slate-700 leading-relaxed">
                <li className="flex gap-2"><span className="text-red-600 font-bold">✗</span> Your inverter app shows a single total — no string detail.</li>
                <li className="flex gap-2"><span className="text-red-600 font-bold">✗</span> Individual strings can drop 30% without you noticing.</li>
                <li className="flex gap-2"><span className="text-red-600 font-bold">✗</span> Annual inspections catch faults 12 months too late.</li>
                <li className="flex gap-2"><span className="text-red-600 font-bold">✗</span> Typical commercial site silently loses <strong>PKR 40,000–120,000 / year</strong>.</li>
              </ul>
            </div>

            {/* Solution card */}
            <div className="bg-bb-green-50 border border-bb-green-200 rounded-sm p-8">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-bb-green-600" />
                <span className="text-[10px] font-bold text-bb-green-700 uppercase tracking-widest">With SPC</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">Every string. Every 5 minutes.</h3>
              <ul className="space-y-3 text-sm text-slate-700 leading-relaxed">
                <li className="flex gap-2"><span className="text-bb-green-600 font-bold">✓</span> Our engineers install a monitoring device at your plant.</li>
                <li className="flex gap-2"><span className="text-bb-green-600 font-bold">✓</span> Live health scores per string — see faults in minutes.</li>
                <li className="flex gap-2"><span className="text-bb-green-600 font-bold">✓</span> Automatic fault diagnosis tells you <em>why</em> and <em>what to fix</em>.</li>
                <li className="flex gap-2"><span className="text-bb-green-600 font-bold">✓</span> Most sites recover the device cost within <strong>90 days</strong>.</li>
              </ul>
            </div>
          </div>

          {/* Founder pull quote */}
          <figure className="relative max-w-4xl mx-auto bg-gradient-to-br from-solar-gold-50 to-white border border-solar-gold-200 rounded-sm p-10 md:p-14 text-center">
            <span aria-hidden="true" className="absolute top-4 left-6 text-7xl font-bold text-solar-gold-300 leading-none">&ldquo;</span>
            <blockquote className="text-xl md:text-2xl font-bold text-slate-900 leading-snug relative z-10">
              Your solar plant might look fine on the surface, but individual strings could be silently underperforming — costing you generation and revenue every day.
            </blockquote>
            <figcaption className="mt-6 flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-solar-gold-500 to-solar-gold-700 flex items-center justify-center text-white text-xs font-bold">
                RN
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-900">Engr. Reyyan Niaz Khan</p>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Founder · Bijli Bachao</p>
              </div>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ══ INDEPENDENCE ANGLE ══════════════════════════════════════ */}
      <section className="py-24 px-6 bg-gradient-to-br from-solar-gold-50 via-white to-solar-gold-50 border-y border-solar-gold-200">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-[10px] font-bold text-solar-gold-700 uppercase tracking-widest mb-6">
            The Independence Angle
          </p>

          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight text-slate-900 leading-[1.15] md:leading-[1.1] mb-8">
            Your inverter vendor shows you <br className="hidden md:block"/>
            <span className="text-slate-500 line-through decoration-red-400 decoration-[3px] md:decoration-4">what they want you to see.</span>
            <br />
            <span className="text-solar-gold-600">SPC shows you what&apos;s actually happening.</span>
          </h2>

          <div className="max-w-3xl mx-auto text-base md:text-lg text-slate-700 leading-relaxed space-y-4">
            <p>
              Every inverter manufacturer ships their own monitoring app — <strong className="text-slate-900">FusionSolar</strong>,{' '}
              <strong className="text-slate-900">SolisCloud</strong>, <strong className="text-slate-900">ShinePhone</strong>,{' '}
              <strong className="text-slate-900">iSolarCloud</strong>. These apps were built by the company that sold you the inverter.
              When the hardware underperforms, the app has every reason to soften it.
            </p>
            <p>
              SPC is the <strong className="text-solar-gold-700">independent layer</strong>. We don&apos;t sell inverters.
              We don&apos;t have quarterly numbers to protect. We have zero incentive to hide a broken string from you.
              Just the truth — every string, every 5 minutes, across every brand.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
            <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-sm shadow-sm">
              <Shield className="w-4 h-4 text-solar-gold-600" />
              <span className="text-xs font-bold text-slate-700">No inverter to sell</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-sm shadow-sm">
              <Eye className="w-4 h-4 text-solar-gold-600" />
              <span className="text-xs font-bold text-slate-700">No shortfall to defend</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-sm shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-solar-gold-600" />
              <span className="text-xs font-bold text-slate-700">No agenda but yours</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══ INLINE MINI-DASHBOARD (THE DEMO) ═════════════════════════ */}
      <section id="demo" className="py-24 px-6 bg-slate-50 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-0"
          style={{
            background:
              'radial-gradient(900px circle at 15% 25%, rgba(245,158,11,0.10), transparent 55%), radial-gradient(800px circle at 85% 75%, rgba(118,185,0,0.08), transparent 55%)',
          }}
        />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">See It Live</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Every string. One screen. <span className="text-bb-green-600">Live.</span>
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              This is how your plant looks inside SPC. Scroll through — health scores, alerts, fault diagnosis, all on one pane.
            </p>
          </div>

          <MiniDashboard />

          <div className="flex items-center justify-center gap-2 mt-6 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <Eye className="w-3.5 h-3.5" />
            Representative data · Your actual plants are visualized with real 5-minute live feeds
          </div>

          <div className="flex justify-center mt-10">
            <a
              href="#cta"
              className="group px-8 py-4 text-sm font-bold bg-solar-gold-500 text-white rounded-sm hover:bg-solar-gold-600 transition-all flex items-center gap-2 shadow-lg"
            >
              See Your Plant on This Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* ══ PRODUCT TOUR — 3 MINI-DASHBOARDS ═════════════════════════ */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">More Views, More Control</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Same data. <span className="text-solar-gold-600">Different lenses.</span>
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Jump between alert stream, plant detail, and time-based history — all live, all linked. Follow one fault from the moment it fires to the day it resolves.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <MiniAlertFeed />
            <MiniPlantDetail />
            <MiniHeatmap />
          </div>

          <div className="flex items-center justify-center gap-2 mt-8 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <Eye className="w-3.5 h-3.5" />
            Follow the story · PV7 appears in all three — fault → drill-down → 7-day history
          </div>
        </div>
      </section>

      {/* ══ CAPABILITIES ═════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">Capabilities</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              String-level visibility. Inverter-level clarity.
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Built by engineers for engineers. Every feature solves a problem Pakistani solar operators told us about.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Activity, title: 'Per-String Health Scores', desc: 'Performance and Availability scores per string, per day. See exactly which string is underperforming and whether it is a shading issue or a connection fault.' },
              { icon: AlertTriangle, title: 'Intelligent Alerts', desc: 'Three severity levels — Critical (>50% drop), Warning (25–50%), Info (10–25%). Skips low-light conditions. Auto-resolves when strings recover.' },
              { icon: Eye, title: 'Fault Diagnosis', desc: 'Distinguishes dirty panels, bird droppings, tree shadows, loose cables, broken connections, panel degradation — each with specific action guidance.' },
              { icon: BarChart3, title: 'Performance Analysis', desc: 'Date-range heatmaps of health scores across all strings. Export to CSV. Compare trends over weeks, months, or seasons.' },
              { icon: TrendingUp, title: 'Shading Detection', desc: 'Time-of-day pattern analysis pinpoints tree shadows and building obstructions as they grow — before they cost a full season of generation.' },
              { icon: Layers, title: 'Multi-Brand Dashboard', desc: 'Huawei, Solis, Growatt, Sungrow — one unified view. No switching between four different apps. The only platform in Pakistan that does this.' },
            ].map((feature) => (
              <div key={feature.title} className="bg-white border border-slate-200 rounded-sm p-6 hover:border-solar-gold-300 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-sm bg-solar-gold-50 border border-solar-gold-200 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-solar-gold-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">Process</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              From site visit to live data <br className="hidden md:block"/>
              <span className="text-solar-gold-600">in under an hour.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4">
            {[
              { step: '01', title: 'On-Site Installation', desc: 'Our field engineer visits your plant. We install the SPC monitoring device, compatible with Huawei, Solis, Growatt, and Sungrow. Under an hour per site.', icon: MapPin },
              { step: '02', title: 'Automatic Discovery', desc: 'The device auto-discovers every inverter and string. No manual configuration, no device IDs, no port numbers. Your full fleet is visible within minutes.', icon: Zap },
              { step: '03', title: 'Live Monitoring', desc: 'Real-time data every 5 minutes. Health scores, alerts, fault diagnosis — all immediate. Dashboard access forever, from any device, anywhere.', icon: Activity },
            ].map((item, i) => (
              <div key={item.step} className="relative bg-white border border-slate-200 rounded-sm p-6 md:p-8 hover:border-solar-gold-300 hover:shadow-md transition-all overflow-hidden">
                <div className="absolute top-0 right-2 md:-top-2 md:right-auto md:-left-1 text-[56px] md:text-[72px] font-bold text-solar-gold-100 leading-none font-mono select-none pointer-events-none">
                  {item.step}
                </div>
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-sm bg-solar-gold-500 flex items-center justify-center mb-4 md:mb-6">
                    <item.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-14">
            <a href="#cta" className="group px-8 py-4 text-sm font-bold bg-solar-gold-500 text-white rounded-sm hover:bg-solar-gold-600 transition-all flex items-center gap-2 shadow-lg">
              Schedule Site Visit
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* ══ CASE STUDIES (METRIC-FIRST) ══════════════════════════════ */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">Outcomes From The Field</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Real faults. Real numbers. <br className="hidden md:block"/>
              <span className="text-solar-gold-600">Real recoveries.</span>
            </h2>
            <p className="text-sm md:text-base text-slate-500 max-w-2xl mx-auto">
              Representative scenarios from our active fleet · Client names anonymized for privacy
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                metric: '32%',
                metricLabel: 'generation loss detected',
                title: 'Tree shadow auto-diagnosed in 12 minutes',
                where: '400 kW rooftop · Multan',
                body: 'SPC flagged PV7 underperforming vs peer strings with a recurring midday dip. Fault class: tree shadow (seasonal growth). Owner trimmed the adjacent mulberry within 48 hours — string recovered to 97% within a week.',
                duration: '12 min to detect · 48 h to fix',
              },
              {
                metric: '14%',
                metricLabel: 'performance improvement',
                title: 'Loose DC cable caught same-day',
                where: '850 kW textile mill · Faisalabad',
                body: 'Two strings on the same inverter showed intermittent availability drops, high performance when active — classic loose-cable signature. Site engineer re-torqued the combiner terminals the same afternoon. Issue resolved before the next billing cycle.',
                duration: '3 h to detect · 6 h to fix',
              },
              {
                metric: 'PKR 180K',
                metricLabel: 'annual savings unlocked',
                title: 'Four faulty panels identified',
                where: '1.2 MW housing society · Lahore',
                body: 'Fleet-wide health trend surfaced four strings declining together over 6 weeks. Fault class: panel degradation (batch defect). Manufacturer honoured warranty replacement. Recovered ~18,000 kWh/year — pays for SPC many times over.',
                duration: '6 weeks tracked · 1 claim filed',
              },
            ].map((cs) => (
              <div key={cs.title} className="bg-white border border-slate-200 rounded-sm p-7 hover:border-solar-gold-300 hover:shadow-md transition-all flex flex-col">
                <div className="mb-5">
                  <p className="text-4xl md:text-5xl font-bold text-solar-gold-600 font-mono tracking-tight leading-none mb-2">
                    {cs.metric}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{cs.metricLabel}</p>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2 leading-snug">{cs.title}</h3>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">{cs.where}</p>
                <p className="text-sm text-slate-600 leading-relaxed flex-1 mb-5">{cs.body}</p>
                <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-bb-green-500 flex-shrink-0" />
                  <p className="text-[11px] font-semibold text-slate-600">{cs.duration}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-12">
            <a href="#cta" className="group px-8 py-4 text-sm font-bold bg-solar-gold-500 text-white rounded-sm hover:bg-solar-gold-600 transition-all flex items-center gap-2 shadow-lg">
              See What SPC Finds on Your Plant
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* ══ FAULT DETECTION TABLE ════════════════════════════════════ */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">Fault Detection Intelligence</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Know what&apos;s wrong. <br className="hidden md:block"/>
              <span className="text-solar-gold-600">Know what to fix.</span>
            </h2>
            <p className="text-base text-slate-600 max-w-2xl leading-relaxed">
              SPC doesn&apos;t just tell you a string is underperforming — it tells you why, and what action to take. Seven fault classes, each with a specific signature.
            </p>
          </div>

          <div className="overflow-x-auto bg-white border border-slate-200 rounded-sm shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr className="border-b-2 border-slate-200">
                  <th className="py-4 px-5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fault Type</th>
                  <th className="py-4 px-5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pattern</th>
                  <th className="py-4 px-5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Detection</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { fault: 'Dirty / Dusty Panels', pattern: '10–30% current drop, gradual', detection: 'Multiple strings decline together over days' },
                  { fault: 'Bird Droppings', pattern: '>25% sudden drop', detection: 'Individual string, not time-dependent' },
                  { fault: 'Tree Shadow', pattern: 'Drops at specific hours', detection: 'Time-of-day pattern analysis' },
                  { fault: 'Faulty Panel', pattern: '30–50% consistently lower', detection: 'Persistent regardless of weather/time' },
                  { fault: 'Loose Cable', pattern: 'Random on/off, intermittent', detection: 'High performance but low availability' },
                  { fault: 'Broken / Disconnected', pattern: '0V, 0A', detection: 'Complete loss of output' },
                  { fault: 'Panel Degradation', pattern: 'Gradual decline over months', detection: 'Slow health score decrease in trends' },
                ].map((row) => (
                  <tr key={row.fault} className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-b-0">
                    <td className="py-4 px-5 text-sm font-bold text-slate-900">{row.fault}</td>
                    <td className="py-4 px-5 text-xs text-slate-600">{row.pattern}</td>
                    <td className="py-4 px-5 text-xs text-slate-600">{row.detection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══ WHO WE SERVE ═════════════════════════════════════════════ */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">Who We Serve</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Built for Pakistan&apos;s <br className="hidden md:block"/>
              <span className="text-solar-gold-600">commercial solar fleet.</span>
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              SPC is purpose-built for commercial and industrial operators with 10 kW to 5 MW installations. If your solar is worth money, SPC is worth installing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: Factory, title: 'Factories & Manufacturing', desc: 'Textile mills, paper plants, food processing — where every kWh cuts production cost.' },
              { icon: Layers, title: 'Textile Mills', desc: 'Large rooftop arrays, high stakes, thin margins. Catch faults before monthly target slips.' },
              { icon: Building2, title: 'Shopping Malls', desc: 'Multi-tenant rooftops, air-con load, peak-hour tariffs. Protect the solar offset that pays for itself.' },
              { icon: Home, title: 'Housing Societies', desc: 'Community solar for common-area lighting and lifts. Residents notice when generation drops — you get notified first.' },
              { icon: HeartPulse, title: 'Hospitals & Data Centers', desc: 'Zero downtime tolerance, 24/7 load. String-level visibility means no hidden degradation on critical infrastructure.' },
              { icon: Network, title: 'Multi-Site Operators', desc: 'Fleet owners with 5+ plants across cities. One dashboard, all sites, one alert stream — no juggling four vendor apps.' },
            ].map((s) => (
              <div key={s.title} className="bg-white border border-slate-200 rounded-sm p-5 sm:p-6 hover:border-solar-gold-300 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-sm bg-solar-gold-50 border border-solar-gold-200 flex items-center justify-center flex-shrink-0">
                    <s.icon className="w-5 h-5 text-solar-gold-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">{s.title}</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ IEC STANDARD ═════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-solar-gold-50 via-white to-solar-gold-50 border border-solar-gold-200 rounded-sm p-10 md:p-14 shadow-sm">
            <div className="flex items-start gap-5">
              <div className="w-12 h-12 rounded-sm bg-solar-gold-500 flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-solar-gold-700 uppercase tracking-widest mb-2">International Standard</p>
                <h3 className="text-2xl md:text-3xl font-bold mb-4 text-slate-900">IEC 61724 Aligned Health Scoring</h3>
                <p className="text-sm md:text-base text-slate-700 leading-relaxed mb-5">
                  We didn&apos;t invent string monitoring. We made it work for Pakistani conditions, brands, and climate. SPC follows the <strong className="text-slate-900">IEC 61724</strong> international standard for photovoltaic system performance monitoring. Each string is evaluated on two separate metrics — <strong className="text-slate-900">Performance</strong> (current quality when producing) and <strong className="text-slate-900">Availability</strong> (percentage of daylight hours active) — combined into a single Health Score.
                </p>
                <p className="text-sm md:text-base text-slate-700 leading-relaxed">
                  Fault classifications align to <strong className="text-slate-900">IEC 62446-1</strong> continuity, polarity, and insulation tests. This means you instantly know whether a problem is a <strong className="text-slate-900">panel issue</strong> (low performance, high availability = shading / degradation) or a <strong className="text-slate-900">wiring issue</strong> (high performance, low availability = loose cable / intermittent fault).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOUNDER ══════════════════════════════════════════════════ */}
      <section id="founder" className="py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-6">Meet The Engineer Behind SPC</p>

          <div className="w-24 h-24 md:w-28 md:h-28 mx-auto rounded-full bg-gradient-to-br from-solar-gold-400 via-solar-gold-500 to-solar-gold-700 flex items-center justify-center text-white text-3xl md:text-4xl font-bold mb-8 shadow-xl shadow-solar-gold-500/30">
            RN
          </div>

          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-2">Engr. Reyyan Niaz Khan</h2>
          <p className="text-sm md:text-base text-slate-500 font-semibold uppercase tracking-wider mb-10">
            Founder &amp; Director · Bijli Bachao
          </p>

          <blockquote className="text-xl md:text-2xl font-bold text-slate-900 leading-snug max-w-3xl mx-auto mb-10 relative">
            <span aria-hidden="true" className="absolute -top-4 -left-2 text-6xl text-solar-gold-300 leading-none">&ldquo;</span>
            <span className="relative">
              Pakistani businesses deserve the same energy visibility that multinationals have had for decades. SPC is how we deliver it.
            </span>
          </blockquote>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-10">
            {[
              { label: 'Education', value: 'UET Lahore' },
              { label: 'Experience', value: '14+ years' },
              { label: 'Field', value: 'Energy engineering' },
              { label: 'Prior Clients', value: '50+ MNCs' },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-slate-200 rounded-sm p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{item.label}</p>
                <p className="text-sm font-bold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
            Previously consulted for
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-base md:text-lg font-bold text-slate-400">
            <span>USAID</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>Schlumberger</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>Diversey</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-sm text-slate-500 font-semibold">+ 50 multinationals</span>
          </div>
        </div>
      </section>

      {/* ══ BIJLI BACHAO PARENT ══════════════════════════════════════ */}
      <section id="parent" className="py-24 px-6 bg-slate-50 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-0"
          style={{
            background:
              'radial-gradient(900px circle at 75% 25%, rgba(245,158,11,0.10), transparent 55%), radial-gradient(800px circle at 15% 75%, rgba(118,185,0,0.08), transparent 55%)',
          }}
        />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <p className="text-[10px] font-bold text-solar-gold-600 uppercase tracking-widest mb-4">Part of the Bijli Bachao Family</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Pakistan&apos;s Solar + Energy
              <br className="hidden md:block"/>
              <span className="text-solar-gold-600"> Automation Company.</span>
            </h2>
            <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto">
              We install solar. Then we stay — for 25 years. SPC is one of three platforms Bijli Bachao has built to make every kilowatt count.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-14">
            <div className="bg-white border-2 border-solar-gold-400 rounded-sm p-7 relative shadow-md">
              <div className="absolute top-3 right-3 px-2 py-0.5 bg-solar-gold-500 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">You are here</div>
              <div className="w-10 h-10 rounded-sm bg-gradient-to-br from-solar-gold-400 to-solar-gold-600 flex items-center justify-center mb-4">
                <Sun className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Solar Performance Cloud</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">Per-string solar monitoring across Huawei, Solis, Growatt, Sungrow. Pakistan&apos;s first.</p>
              <p className="text-[11px] font-mono text-solar-gold-700 font-bold">spc.bijlibachao.pk</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-sm p-7 hover:border-bb-green-300 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-sm bg-bb-green-500 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">WATTEY</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">Real-time IoT energy consumption — grid, generator, solar usage, all in one dashboard.</p>
              <p className="text-[11px] font-mono text-slate-500">wattey.bijlibachao.pk</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-sm p-7 hover:border-blue-300 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-sm bg-blue-500 flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Meter Billing</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">Photo-verified automated tenant billing for shopping malls and housing societies.</p>
              <p className="text-[11px] font-mono text-slate-500">metering.wattey.bijlibachao.pk</p>
            </div>
          </div>

          {/* Parent brand stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-slate-200 border border-slate-200 rounded-sm overflow-hidden">
            {[
              { value: '100+', label: 'Installations' },
              { value: '500+ kW', label: 'Capacity installed' },
              { value: '0.96 GWh', label: 'Monitored' },
              { value: '14+ yrs', label: 'In the field' },
              { value: '4 cities', label: 'Across Pakistan' },
              { value: '🇦🇺', label: 'AU subsidiary' },
            ].map((item) => (
              <div key={item.label} className="bg-white px-4 py-5 text-center">
                <p className="text-lg md:text-xl font-bold text-slate-900 font-mono tracking-tight">{item.value}</p>
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mt-1">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 mt-10 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-bb-green-600" /> IEC 61724 aligned</span>
            <span className="flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-bb-green-600" /> IEC 62446-1 compliant</span>
            <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-bb-green-600" /> Engineer-led, not sales-led</span>
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA — RISK REVERSAL ════════════════════════════════ */}
      <section id="cta" className="py-24 px-6 bg-gradient-to-br from-solar-gold-50 via-white to-solar-gold-50">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[10px] font-bold text-solar-gold-700 uppercase tracking-widest mb-4">
            Free Site Visit · No Commitment · No Obligation
          </p>

          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-5">
            Ready to see <br className="hidden md:block"/>
            <span className="text-solar-gold-600">every string on your plant?</span>
          </h2>

          <p className="text-base md:text-lg text-slate-700 mb-10 max-w-2xl mx-auto leading-relaxed">
            Our engineer visits your plant, assesses your inverter fleet, and shows you a <strong className="text-slate-900">live demo on your actual data</strong>.
            If we&apos;re not a fit, we walk away. What have you got to lose?
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group px-8 py-4 text-sm font-bold bg-solar-gold-500 text-white rounded-sm hover:bg-solar-gold-600 transition-all flex items-center gap-2 shadow-lg shadow-solar-gold-500/20 hover:shadow-xl hover:shadow-solar-gold-500/30 hover:-translate-y-0.5"
            >
              Book Free Site Visit
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 text-sm font-bold border-2 border-bb-green-500 text-bb-green-700 rounded-sm hover:bg-bb-green-500 hover:text-white transition-all flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp {WHATSAPP_LABEL}
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-bb-green-500" /> Typical response within 2 hours</span>
            <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-bb-green-500" /> Available across Pakistan</span>
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-bb-green-500" /> Founder-led engineering</span>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer className="py-14 px-6 border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-solar-gold-400 to-solar-gold-600 flex items-center justify-center">
                  <Sun className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-bold text-slate-900">Solar Performance Cloud</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Pakistan&apos;s first string-level solar monitoring platform.
                Engineer-installed, engineer-maintained.
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Product</p>
              <ul className="space-y-2 text-xs text-slate-700">
                <li><a href="#demo" className="hover:text-solar-gold-600">Dashboard Demo</a></li>
                <li><a href="#how-it-works" className="hover:text-solar-gold-600">How It Works</a></li>
                <li><Link href="/sign-in" className="hover:text-solar-gold-600">Sign In</Link></li>
                <li><a href="#cta" className="hover:text-solar-gold-600">Book Site Visit</a></li>
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Bijli Bachao</p>
              <ul className="space-y-2 text-xs text-slate-700">
                <li><a href="#founder" className="hover:text-solar-gold-600">Meet the Founder</a></li>
                <li><a href="#parent" className="hover:text-solar-gold-600">Our Products</a></li>
                <li><a href="https://wattey.bijlibachao.pk" target="_blank" rel="noopener noreferrer" className="hover:text-solar-gold-600">Wattey <ArrowUpRight className="inline w-3 h-3" /></a></li>
                <li><a href="https://bijlibachao.pk" target="_blank" rel="noopener noreferrer" className="hover:text-solar-gold-600">Bijli Bachao <ArrowUpRight className="inline w-3 h-3" /></a></li>
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Contact</p>
              <ul className="space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-1.5"><MapPin className="w-3 h-3 mt-0.5 text-slate-400 flex-shrink-0" /> 69-Abid Majeed Rd, Lahore</li>
                <li><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-solar-gold-600">WhatsApp {WHATSAPP_LABEL}</a></li>
                <li><a href="https://linkedin.com/company/bijli-bachao-pk" target="_blank" rel="noopener noreferrer" className="hover:text-solar-gold-600">LinkedIn <ArrowUpRight className="inline w-3 h-3" /></a></li>
                <li><a href="https://facebook.com/BijliBachaoPk" target="_blank" rel="noopener noreferrer" className="hover:text-solar-gold-600">Facebook <ArrowUpRight className="inline w-3 h-3" /></a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div>© 2026 BijliBachao.pk · Founded by Engr. Reyyan Niaz Khan · Since 2012</div>
            <div className="flex items-center gap-4">
              <span>IEC 61724 aligned</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>Made with engineering, not hype.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MINI-DASHBOARD — representative-but-fake data, renders the actual
// look of SPC for landing-page visitors. All numbers are illustrative.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MiniDashboard() {
  const strings = [
    { id: 'PV1', health: 98, c: 8.7, state: 'healthy' as const },
    { id: 'PV2', health: 96, c: 8.5, state: 'healthy' as const },
    { id: 'PV3', health: 94, c: 8.3, state: 'healthy' as const },
    { id: 'PV4', health: 92, c: 8.2, state: 'healthy' as const },
    { id: 'PV5', health: 95, c: 8.4, state: 'healthy' as const },
    { id: 'PV6', health: 97, c: 8.6, state: 'healthy' as const },
    { id: 'PV7', health: 23, c: 2.1, state: 'critical' as const },
    { id: 'PV8', health: 91, c: 8.1, state: 'healthy' as const },
    { id: 'PV9', health: 88, c: 7.9, state: 'healthy' as const },
    { id: 'PV10', health: 72, c: 6.4, state: 'warning' as const },
    { id: 'PV11', health: 93, c: 8.3, state: 'healthy' as const },
    { id: 'PV12', health: 96, c: 8.5, state: 'healthy' as const },
  ]

  const stateColor = {
    healthy: { bar: 'bg-bb-green-500', text: 'text-bb-green-700', bg: 'bg-bb-green-50', border: 'border-bb-green-200' },
    warning: { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    critical: { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
      {/* Dashboard header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-sm bg-gradient-to-br from-solar-gold-400 to-solar-gold-600 flex items-center justify-center flex-shrink-0">
            <Sun className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">Mall of Multan · Rooftop Solar</p>
            <p className="text-[10px] text-slate-500 font-mono truncate">12.8 MW · 1,847 strings · 4 brands</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 bg-bb-green-50 border border-bb-green-200 rounded-sm self-start sm:self-auto flex-shrink-0">
          <span className="w-1.5 h-1.5 bg-bb-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-bb-green-700 uppercase tracking-wider">Live · 5 min</span>
        </div>
      </div>

      {/* Top KPI strip — 2x2 on mobile, 4 across on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border-b border-slate-200">
        {[
          { label: 'Fleet Health', value: '96%', trend: '+2.1%', color: 'text-bb-green-700' },
          { label: 'Energy Today', value: '47,283 kWh', trend: '+12% vs yest.', color: 'text-bb-green-700' },
          { label: 'Inverters Online', value: '44 / 44', trend: 'All online', color: 'text-bb-green-700' },
          { label: 'Active Alerts', value: '3', trend: '1 critical', color: 'text-red-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white px-3 sm:px-4 py-3">
            <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{kpi.label}</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 font-mono tracking-tight truncate">{kpi.value}</p>
            <p className={`text-[9px] font-bold ${kpi.color} uppercase tracking-wider`}>{kpi.trend}</p>
          </div>
        ))}
      </div>

      {/* Sparkline row */}
      <div className="px-4 sm:px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">24h Fleet Power</p>
          <p className="text-[10px] font-mono text-slate-500">Peak: <span className="text-solar-gold-700 font-bold">11.2 MW @ 12:15 PKT</span></p>
        </div>
        <Sparkline />
      </div>

      {/* Active alert */}
      <div className="flex items-start gap-2.5 sm:gap-3 px-4 sm:px-5 py-3 bg-red-50 border-b border-red-200">
        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-red-700">Inverter 6 · PV7 — Critical underperformance</p>
          <p className="text-[10px] text-red-600 mt-0.5 leading-relaxed">32% below peers · pattern matches <strong>tree shadow</strong> · 12 min ago</p>
        </div>
        <button className="text-[10px] font-bold text-red-700 uppercase tracking-wider hover:text-red-900 hidden sm:block flex-shrink-0">Diagnose →</button>
      </div>

      {/* String grid — 4 on mobile, 6 on tablet, 12 on desktop */}
      <div className="p-4 sm:p-5 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inverter 6 · 12 strings · Live</p>
          <p className="text-[10px] font-mono text-slate-500">Avg 8.3 A · Max 8.7 A · Fault 1</p>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-1.5">
          {strings.map((s) => {
            const c = stateColor[s.state]
            return (
              <div key={s.id} className={`${c.bg} rounded-sm p-2 border ${c.border}`}>
                <p className="text-[9px] font-mono font-bold text-slate-700 mb-1">{s.id}</p>
                <p className={`text-xs font-bold ${c.text} font-mono`}>{s.health}%</p>
                <div className="mt-1.5 h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full ${c.bar}`} style={{ width: `${s.health}%` }} />
                </div>
                <p className="text-[8px] font-mono text-slate-500 mt-1">{s.c.toFixed(1)} A</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Sparkline() {
  // Exaggerated solar curve — morning ramp, noon peak, afternoon taper
  const points = [
    0, 0.02, 0.05, 0.12, 0.28, 0.48, 0.68, 0.82, 0.91, 0.96,
    0.99, 1.00, 0.98, 0.94, 0.87, 0.76, 0.61, 0.43, 0.25, 0.11,
    0.04, 0.01, 0, 0,
  ]
  const W = 800
  const H = 70
  const max = 1
  const stepX = W / (points.length - 1)
  const path = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${H - (v / max) * (H - 8) - 4}`)
    .join(' ')
  const area = `${path} L ${W} ${H} L 0 ${H} Z`

  // Peak at index 11 (noon)
  const peakX = 11 * stepX
  const peakY = H - (points[11] / max) * (H - 8) - 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spk-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spk-fill)" />
      <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={peakX} cy={peakY} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
    </svg>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRODUCT-TOUR MINI DASHBOARDS (§5.5) — all representative data.
// Story thread: PV7 on Mall of Multan is flagged critical across all
// three — alert feed (top row) → plant detail → 7-day heatmap history.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MiniAlertFeed() {
  const alerts = [
    { sev: 'critical' as const, plant: 'Mall of Multan', pv: 'PV7', fault: '32% below peers · Tree shadow', time: '12 min ago' },
    { sev: 'warning' as const, plant: 'Faisalabad Mill', pv: 'PV23', fault: 'Intermittent availability · Loose cable', time: '38 min ago' },
    { sev: 'warning' as const, plant: 'Lahore Society', pv: 'PV12', fault: '18% below peers · Partial shading', time: '2 hr ago' },
    { sev: 'info' as const, plant: 'Karachi Factory', pv: 'PV41', fault: 'Gradual decline · Dirty panels', time: '4 hr ago' },
    { sev: 'info' as const, plant: 'Multan Hospital', pv: 'PV8', fault: 'Mild drop · Dust accumulation', time: '6 hr ago' },
  ]
  const sevStyle = {
    critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'CRITICAL' },
    warning: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'WARNING' },
    info: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500', label: 'INFO' },
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-md overflow-hidden flex flex-col">
      <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-solar-gold-600" />
            Live Alerts
          </p>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Fleet-wide · 5 active</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-sm">
          <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[9px] font-bold text-red-700">1 CRITICAL</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100 flex-1">
        {alerts.map((a, i) => {
          const s = sevStyle[a.sev]
          return (
            <div key={i} className="px-4 sm:px-5 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`w-1 self-stretch rounded-full ${s.dot} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[8px] font-bold ${s.text} ${s.bg} px-1.5 py-0.5 rounded-sm tracking-wider`}>{s.label}</span>
                    <span className="text-xs font-bold text-slate-900 truncate">{a.plant} · {a.pv}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 truncate">{a.fault}</p>
                </div>
                <span className="text-[9px] text-slate-400 font-mono flex-shrink-0 whitespace-nowrap mt-0.5">{a.time}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-center">
        <span className="text-[10px] font-bold text-solar-gold-700 uppercase tracking-wider">View all 96 alerts →</span>
      </div>
    </div>
  )
}

function MiniPlantDetail() {
  const strings = [
    { id: 'PV1', pct: 97, state: 'healthy' as const },
    { id: 'PV2', pct: 94, state: 'healthy' as const },
    { id: 'PV3', pct: 92, state: 'healthy' as const },
    { id: 'PV4', pct: 90, state: 'healthy' as const },
    { id: 'PV5', pct: 89, state: 'healthy' as const },
    { id: 'PV6', pct: 86, state: 'healthy' as const },
  ]

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-md overflow-hidden flex flex-col">
      <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-solar-gold-600" />
            Faisalabad Mill
          </p>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">850 kW · 8 inv · 48 strings</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-bb-green-50 border border-bb-green-200 rounded-sm flex-shrink-0">
          <span className="w-1 h-1 bg-bb-green-500 rounded-full animate-pulse" />
          <span className="text-[9px] font-bold text-bb-green-700">LIVE</span>
        </div>
      </div>

      <div className="px-5 py-5 border-b border-slate-200 text-center bg-gradient-to-b from-bb-green-50/50 to-white">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Plant Health</p>
        <p className="text-5xl font-bold text-bb-green-600 font-mono tracking-tight leading-none">89<span className="text-2xl">%</span></p>
        <p className="text-[10px] text-bb-green-700 font-mono mt-2 font-semibold">+1.2% vs yesterday</p>
      </div>

      <div className="px-5 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">24h power</p>
          <p className="text-[9px] font-mono text-slate-500">Peak <span className="text-solar-gold-700 font-bold">712 kW</span></p>
        </div>
        <MiniSparkline />
      </div>

      <div className="p-5 flex-1 bg-white">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-3">Inverter 3 · Top 6 strings</p>
        <div className="space-y-2">
          {strings.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-slate-700 w-8 flex-shrink-0">{s.id}</span>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-bb-green-500 rounded-full" style={{ width: `${s.pct}%` }} />
              </div>
              <span className="text-[10px] font-mono font-bold text-bb-green-700 w-8 text-right flex-shrink-0">{s.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MiniSparkline() {
  // Smaller version of the main sparkline
  const pts = [0, 0.05, 0.15, 0.35, 0.6, 0.82, 0.95, 1.0, 0.97, 0.9, 0.75, 0.55, 0.3, 0.1, 0, 0]
  const W = 400, H = 40
  const stepX = W / (pts.length - 1)
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${H - v * (H - 4) - 2}`).join(' ')
  const area = `${path} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id="mini-spk-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mini-spk-fill)" />
      <path d={path} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MiniHeatmap() {
  // 6 strings × 7 days. PV7 declines over the last 3 days (story thread).
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const rows = [
    { id: 'PV5', vals: [95, 96, 94, 97, 95, 96, 94] },
    { id: 'PV6', vals: [93, 94, 93, 95, 94, 93, 92] },
    { id: 'PV7', vals: [94, 95, 93, 82, 58, 34, 23] },  // THE STORY
    { id: 'PV8', vals: [92, 93, 91, 94, 93, 92, 91] },
    { id: 'PV9', vals: [96, 94, 95, 93, 96, 95, 94] },
    { id: 'PV10', vals: [88, 90, 89, 91, 90, 89, 87] },
  ]

  const heatColor = (v: number) => {
    if (v >= HEALTH_HEALTHY) return '#76B900' // bb-green-500 — healthy (NVIDIA green, landing-only signal)
    if (v >= HEALTH_CAUTION) return '#9BD42E' // bb-green-400 — mostly healthy
    if (v >= HEALTH_WARNING) return '#fbbf24' // amber-400 — warning band
    if (v >= HEALTH_SEVERE) return '#f59e0b' // solar-gold-500 — severe
    return '#ef4444' // red-500 — critical
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-md overflow-hidden flex flex-col">
      <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-solar-gold-600" />
            Health Heatmap · 7d
          </p>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">Mall of Multan · Inverter 6</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-sm flex-shrink-0">
          <AlertTriangle className="w-2.5 h-2.5 text-red-600" />
          <span className="text-[9px] font-bold text-red-700">1 declining</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 flex-1 bg-white">
        {/* Day header */}
        <div className="flex items-center gap-1 mb-2 pl-10">
          {days.map((d) => (
            <span key={d} className="text-[8px] font-mono text-slate-400 flex-1 text-center uppercase tracking-wider">{d}</span>
          ))}
        </div>

        {/* Rows */}
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1">
              <span className={`text-[10px] font-mono font-bold w-9 flex-shrink-0 ${row.id === 'PV7' ? 'text-red-600' : 'text-slate-700'}`}>{row.id}</span>
              {row.vals.map((v, i) => (
                <div
                  key={i}
                  title={`${v}% health`}
                  className="flex-1 h-6 rounded-[2px] ring-1 ring-slate-200"
                  style={{ backgroundColor: heatColor(v) }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
          <span className="text-[9px] text-slate-500 font-mono">Poor</span>
          <div className="flex h-1.5 flex-1 gap-0.5">
            {[15, 35, 55, 75, 95].map((v) => (
              <div key={v} className="flex-1 rounded-[1px]" style={{ backgroundColor: heatColor(v) }} />
            ))}
          </div>
          <span className="text-[9px] text-slate-500 font-mono">Perfect</span>
        </div>

        {/* Annotation */}
        <div className="mt-3 flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-sm">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-700 leading-relaxed">
            <strong className="font-mono">PV7</strong> declining 3 days running · auto-classified: <strong>tree shadow</strong>
          </p>
        </div>
      </div>
    </div>
  )
}
