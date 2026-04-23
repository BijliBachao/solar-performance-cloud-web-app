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
      <div className="min-h-screen flex items-center justify-center bg-warm-cream">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-bb-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-warm-muted">
            {!isLoaded ? 'Initializing...' : 'Redirecting to dashboard...'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-warm-cream text-warm-text antialiased">
      {/* ══ NAVIGATION ══════════════════════════════════════════════ */}
      <nav className="fixed top-0 w-full bg-warm-cream/90 backdrop-blur-md border-b border-warm-divider z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-solar-gold-400 to-solar-gold-600 flex items-center justify-center shadow-sm">
                <Sun className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-bold text-warm-text whitespace-nowrap">Solar Performance Cloud</span>
                <span className="text-[9px] font-semibold text-warm-muted tracking-wider uppercase">by BijliBachao.pk</span>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-5 lg:gap-8">
              <a href="#demo" className="text-xs font-semibold text-warm-body hover:text-warm-text transition-colors">Demo</a>
              <a href="#how-it-works" className="text-xs font-semibold text-warm-body hover:text-warm-text transition-colors">How It Works</a>
              <a href="#founder" className="text-xs font-semibold text-warm-body hover:text-warm-text transition-colors">Founder</a>
              <a href="#parent" className="text-xs font-semibold text-warm-body hover:text-warm-text transition-colors">Bijli Bachao</a>
            </div>

            <div className="flex items-center gap-3">
              {isSignedIn ? (
                <Link href="/auth-redirect" className="px-4 py-2 text-xs font-bold bg-bb-green-500 text-white rounded-full hover:bg-bb-green-600 transition-colors">
                  Go to Dashboard →
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" className="hidden sm:inline text-xs font-semibold text-warm-body hover:text-warm-text transition-colors">
                    Sign In
                  </Link>
                  <a href="#cta" className="px-4 py-2 text-xs font-bold bg-bb-green-500 text-white rounded-full hover:bg-bb-green-600 transition-colors whitespace-nowrap shadow-sm hover:shadow-md">
                    Book Free Site Visit
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ══ HERO — ASYMMETRIC 60/40 (NVIDIA + Wise + Mastercard) ════ */}
      <section className="relative pt-32 md:pt-40 pb-20 md:pb-32 px-6 overflow-hidden">
        {/* Subtle bb-green + warm-gold radial wash — reduced vs previous */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(1000px circle at 90% 10%, rgba(118,185,0,0.10), transparent 55%), radial-gradient(800px circle at 5% 90%, rgba(245,158,11,0.05), transparent 50%)',
          }}
        />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-12 lg:gap-16 items-center">
          {/* LEFT — headline + CTA */}
          <div className="text-left">
            <EyebrowDot>A Product of Bijli Bachao · Pakistan&apos;s First</EyebrowDot>

            <h1 className="mt-6 text-[42px] sm:text-5xl md:text-6xl lg:text-[64px] font-bold leading-[1.05] tracking-[-0.02em] text-warm-text">
              Detect underperforming strings
              <br className="hidden md:block" />
              <span className="text-warm-body font-normal"> before they cost you money.</span>
            </h1>

            <p className="mt-6 text-lg md:text-xl text-warm-body max-w-xl leading-relaxed font-medium">
              Our engineers install a compact monitoring device at your plant —
              live string-level data every 5 minutes, fault diagnosis in seconds.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <a
                href="#cta"
                className="group px-7 py-3.5 text-sm font-bold bg-bb-green-500 text-white rounded-full hover:bg-bb-green-600 transition-all flex items-center gap-2 shadow-lg shadow-bb-green-500/25 hover:-translate-y-0.5"
              >
                Book a Free Site Visit
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-7 py-3.5 text-sm font-bold text-warm-text rounded-full border-2 border-warm-text/15 hover:border-warm-text/40 transition-all flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp {WHATSAPP_LABEL}
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold text-warm-muted uppercase tracking-wider">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-bb-green-500" /> No commitment</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-bb-green-500" /> Engineer-installed</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-bb-green-500" /> IEC 61724</span>
            </div>
          </div>

          {/* RIGHT — laptop mockup with live-dashboard peek */}
          <div className="relative">
            <LaptopMockup>
              <HeroDashPeek />
            </LaptopMockup>
            {/* Thin orbital curve — Mastercard signature */}
            <svg aria-hidden="true" className="hidden lg:block absolute -top-8 -left-12 w-64 h-64 -z-10 opacity-70" viewBox="0 0 200 200">
              <path d="M 20 180 Q 60 20 180 40" fill="none" stroke="#76B900" strokeWidth="1" strokeDasharray="2 4" />
            </svg>
          </div>
        </div>
      </section>

      {/* ══ DASHBOARD SHOWCASE (right after hero — Wise product-shot) */}
      <section id="demo" className="relative pt-12 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10 max-w-2xl">
            <EyebrowDot>See it live</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-[-0.02em] text-warm-text leading-tight">
              Every string. One screen.
            </h2>
            <p className="mt-3 text-base text-warm-body leading-relaxed font-medium">
              This is how your plant looks inside SPC — health scores, live alerts, fault diagnosis, all on one pane.
            </p>
          </div>

          <div className="relative">
            {/* Floating dashboard card on warm cream */}
            <MiniDashboard />

            {/* Micro-label */}
            <p className="mt-4 text-[11px] font-semibold text-warm-muted uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Representative data · Real plants update every 5 minutes
            </p>
          </div>
        </div>
      </section>

      {/* ══ 3 MINI-DASHBOARDS — Pinterest masonry ═══════════════════ */}
      <section className="py-24 px-6 bg-white border-y border-warm-divider">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 max-w-2xl">
            <EyebrowDot>More views</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-[-0.02em] text-warm-text leading-tight">
              Same data. Different lenses.
            </h2>
            <p className="mt-3 text-base text-warm-body leading-relaxed font-medium">
              Follow one fault — PV7 — from the alert feed to the plant drill-down to the 7-day heatmap.
            </p>
          </div>

          {/* Masonry: alert feed tall LEFT (spans 2 rows) · plant detail + heatmap
              WIDE on the right stacked — fills the grid, no empty space. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:row-span-2"><MiniAlertFeed /></div>
            <div className="lg:col-span-2"><MiniPlantDetail /></div>
            <div className="lg:col-span-2"><MiniHeatmap /></div>
          </div>

          <p className="mt-8 text-[11px] font-semibold text-warm-muted uppercase tracking-wider flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Follow PV7 · fault → plant drill-down → 7-day history
          </p>
        </div>
      </section>

      {/* ══ THREE PILLARS — Pinterest masonry (1 tall + 2 short) ════ */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <EyebrowDot>Why SPC</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1]">
              Three reasons every commercial solar operator in Pakistan should care.
            </h2>
          </div>

          {/* Masonry: 1 tall left (Independence — sharpest weapon) + 2 shorter stacked right */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
            {/* Tall feature pillar */}
            <div className="bg-white border border-warm-divider rounded-2xl p-8 md:p-10 hover:border-bb-green-400 transition-all flex flex-col">
              <div className="w-14 h-14 rounded-2xl bg-bb-green-50 border border-bb-green-200 flex items-center justify-center mb-6">
                <Shield className="w-7 h-7 text-bb-green-700" />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-warm-text mb-4 leading-tight">Independent second opinion</h3>
              <p className="text-base text-warm-body leading-relaxed font-medium mb-6">
                Your inverter vendor&apos;s app was built by the company that sold you the inverter. When hardware underperforms, their app has reasons to soften it. SPC has no inverter to sell you — just the truth about every string.
              </p>
              <div className="mt-auto pt-6 border-t border-warm-divider">
                <p className="text-4xl font-bold text-bb-green-600 font-mono tracking-tight leading-none">Zero</p>
                <p className="text-[11px] font-semibold text-warm-muted uppercase tracking-wider mt-2">vendor conflicts of interest</p>
              </div>
            </div>

            {/* Two stacked right */}
            <div className="grid grid-rows-2 gap-5">
              <div className="bg-white border border-warm-divider rounded-2xl p-7 hover:border-bb-green-400 transition-all flex flex-col">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-bb-green-50 border border-bb-green-200 flex items-center justify-center flex-shrink-0">
                    <Gauge className="w-5 h-5 text-bb-green-700" />
                  </div>
                  <h3 className="text-lg font-bold text-warm-text leading-tight">Catch losses fast</h3>
                </div>
                <p className="text-sm text-warm-body leading-relaxed font-medium">
                  Alerts in 5 minutes, not 5 months. The average commercial plant loses 2–7% of annual generation to undetected faults.
                </p>
                <div className="mt-auto pt-4 flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-bb-green-600 font-mono tracking-tight">&lt; 5 min</p>
                  <p className="text-[11px] font-semibold text-warm-muted uppercase tracking-wider">from fault to phone</p>
                </div>
              </div>

              <div className="bg-white border border-warm-divider rounded-2xl p-7 hover:border-bb-green-400 transition-all flex flex-col">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-bb-green-50 border border-bb-green-200 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5 text-bb-green-700" />
                  </div>
                  <h3 className="text-lg font-bold text-warm-text leading-tight">Every inverter brand, unified</h3>
                </div>
                <p className="text-sm text-warm-body leading-relaxed font-medium">
                  Huawei, Solis, Growatt, Sungrow — one dashboard, one language, one alert stream. Only platform in Pakistan that does this.
                </p>
                <div className="mt-auto pt-4 flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-bb-green-600 font-mono tracking-tight">4 brands</p>
                  <p className="text-[11px] font-semibold text-warm-muted uppercase tracking-wider">in one dashboard</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ GREEN STATEMENT BAND — Vodafone divider ══════════════════ */}
      <section className="bg-bb-green-500 py-10 md:py-14 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xl md:text-3xl lg:text-4xl font-bold tracking-[-0.01em] text-white leading-tight">
            We watch every string. <span className="text-bb-green-100">So you don&apos;t have to.</span>
          </p>
        </div>
      </section>

      {/* ══ SOCIAL PROOF — Vodafone ticker (1 dominant + 3 satellite) */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <EyebrowDot>Trusted across Pakistan&apos;s solar fleet</EyebrowDot>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-10 md:gap-16 items-end">
            {/* Dominant metric */}
            <div>
              <p className="text-[11px] font-bold text-warm-muted uppercase tracking-widest mb-3">Faults caught &amp; resolved</p>
              <p className="text-[72px] md:text-[96px] lg:text-[120px] font-bold text-warm-text font-mono tracking-[-0.04em] leading-[0.9]">
                25,000<span className="text-bb-green-500">+</span>
              </p>
              <p className="mt-3 text-base text-warm-body font-medium leading-relaxed">
                Across 48 plants, 4 inverter brands, 1.3 million live measurements — every fault logged, every recovery tracked.
              </p>
            </div>

            {/* 3 satellites */}
            <div className="grid grid-cols-3 gap-6 md:gap-8 md:border-l md:border-warm-divider md:pl-10">
              {[
                { v: '48', u: 'plants', sub: '2.2 MW under watch' },
                { v: '44 / 48', u: 'producing', sub: 'live right now', accent: true },
                { v: '14+', u: 'years', sub: 'Bijli Bachao in Pakistan' },
              ].map((s) => (
                <div key={s.u}>
                  <p className={`text-2xl md:text-4xl font-bold font-mono tracking-[-0.02em] leading-none ${s.accent ? 'text-bb-green-600' : 'text-warm-text'}`}>{s.v}</p>
                  <p className="text-[11px] font-bold text-warm-text uppercase tracking-wider mt-2">{s.u}</p>
                  <p className="text-[11px] text-warm-muted mt-1 leading-tight">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Provider wordmarks */}
          <div className="mt-14 pt-10 border-t border-warm-divider flex flex-wrap items-center gap-x-12 gap-y-3 md:gap-x-20">
            <span className="text-[11px] font-bold text-warm-muted uppercase tracking-widest mr-2">Works with</span>
            {['Huawei', 'Solis', 'Growatt', 'Sungrow'].map((brand) => (
              <span key={brand} className="text-lg md:text-xl font-bold text-warm-muted tracking-tight">{brand}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PROBLEM / SOLUTION — Mastercard asymmetric ═══════════════ */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <EyebrowDot>The problem</EyebrowDot>
          <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1] max-w-4xl">
            Your solar looks fine. <span className="text-warm-body font-normal">You&apos;re losing money every week.</span>
          </h2>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] gap-8 md:gap-14 items-start">
            {/* LEFT — problem as plain typography, no card */}
            <div className="md:pt-2">
              <p className="text-[11px] font-bold text-red-700 uppercase tracking-widest flex items-center gap-2 mb-5">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                Without SPC
              </p>
              <h3 className="text-xl md:text-2xl font-bold text-warm-text mb-6 leading-snug">One number. Zero visibility.</h3>
              <ul className="space-y-4 text-[15px] text-warm-body leading-relaxed font-medium">
                <li className="flex gap-3"><span className="text-red-500 font-bold flex-shrink-0">✗</span><span>Your inverter app shows a single total — no string detail.</span></li>
                <li className="flex gap-3"><span className="text-red-500 font-bold flex-shrink-0">✗</span><span>Individual strings can drop 30% without you noticing.</span></li>
                <li className="flex gap-3"><span className="text-red-500 font-bold flex-shrink-0">✗</span><span>Annual inspections catch faults 12 months too late.</span></li>
                <li className="flex gap-3"><span className="text-red-500 font-bold flex-shrink-0">✗</span><span>Commercial sites silently lose <strong className="text-warm-text">PKR 40,000–120,000 / year</strong>.</span></li>
              </ul>
            </div>

            {/* RIGHT — solution as lifted-cream card */}
            <div className="bg-warm-cream-lifted border border-warm-divider rounded-2xl p-8 md:p-10">
              <p className="text-[11px] font-bold text-bb-green-700 uppercase tracking-widest flex items-center gap-2 mb-5">
                <span className="w-1.5 h-1.5 bg-bb-green-500 rounded-full" />
                With SPC
              </p>
              <h3 className="text-2xl md:text-3xl font-bold text-warm-text mb-6 leading-tight">Every string. Every 5 minutes.</h3>
              <ul className="space-y-4 text-[15px] text-warm-body leading-relaxed font-medium">
                <li className="flex gap-3"><span className="text-bb-green-600 font-bold flex-shrink-0">✓</span><span>Our engineers install a monitoring device at your plant.</span></li>
                <li className="flex gap-3"><span className="text-bb-green-600 font-bold flex-shrink-0">✓</span><span>Live health scores per string — see faults in minutes.</span></li>
                <li className="flex gap-3"><span className="text-bb-green-600 font-bold flex-shrink-0">✓</span><span>Automatic fault diagnosis tells you <em>why</em> and <em>what to fix</em>.</span></li>
                <li className="flex gap-3"><span className="text-bb-green-600 font-bold flex-shrink-0">✓</span><span>Most sites recover the device cost within <strong className="text-warm-text">90 days</strong>.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══ INDEPENDENCE ANGLE — monumental statement ═══════════════ */}
      <section className="py-24 md:py-32 px-6 bg-warm-cream-lifted border-y border-warm-divider">
        <div className="max-w-5xl mx-auto">
          <EyebrowDot>The independence angle</EyebrowDot>

          <h2 className="mt-6 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-[-0.025em] text-warm-text leading-[1.05] mb-10">
            Your inverter vendor shows you <br className="hidden md:block"/>
            <span className="text-warm-muted line-through decoration-red-400 decoration-[3px] md:decoration-4">what they want you to see.</span>
            <br />
            <span className="text-bb-green-600">SPC shows you what&apos;s actually happening.</span>
          </h2>

          <div className="max-w-3xl text-base md:text-lg text-warm-body leading-relaxed font-medium space-y-5">
            <p>
              Every inverter manufacturer ships their own monitoring app — <strong className="text-warm-text">FusionSolar</strong>,{' '}
              <strong className="text-warm-text">SolisCloud</strong>, <strong className="text-warm-text">ShinePhone</strong>,{' '}
              <strong className="text-warm-text">iSolarCloud</strong>. These apps were built by the company that sold you the inverter. When the hardware underperforms, the app has every reason to soften it.
            </p>
            <p>
              SPC is the <strong className="text-bb-green-700">independent layer</strong>. We don&apos;t sell inverters. We don&apos;t have quarterly numbers to protect. Just the truth — every string, every 5 minutes, across every brand.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            {[
              { icon: Shield, label: 'No inverter to sell' },
              { icon: Eye, label: 'No shortfall to defend' },
              { icon: CheckCircle2, label: 'No agenda but yours' },
            ].map((chip) => (
              <div key={chip.label} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-warm-divider rounded-full">
                <chip.icon className="w-4 h-4 text-bb-green-600" />
                <span className="text-xs font-bold text-warm-text">{chip.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ OVERSIZE NUMBER MOMENT — Vodafone monumental ═══════════ */}
      <section className="py-32 md:py-40 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <EyebrowDot>Under live watch</EyebrowDot>
          <p className="mt-10 text-[110px] sm:text-[140px] md:text-[180px] lg:text-[220px] font-bold text-warm-text font-mono tracking-[-0.05em] leading-[0.85]">
            2.2 <span className="text-bb-green-500">MW</span>
          </p>
          <p className="mt-10 text-base md:text-lg text-warm-body max-w-2xl mx-auto leading-relaxed font-medium">
            Monitored 24/7 across 48 commercial and industrial plants in Pakistan · every string · every 5 minutes
          </p>
        </div>
      </section>

      {/* ══ CAPABILITIES — Mastercard asymmetric (2 hero + 4 compact) */}
      <section className="py-24 md:py-32 px-6 bg-white border-y border-warm-divider">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <EyebrowDot>Capabilities</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1]">
              String-level visibility. <br className="hidden md:block"/>Inverter-level clarity.
            </h2>
          </div>

          {/* 2 hero cards — larger, span 2 cols */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            {[
              { icon: Activity, title: 'Per-String Health Scores', desc: 'Performance and Availability scores per string, per day. See exactly which string is underperforming and whether it is a shading issue or a connection fault — with IEC 61724 alignment behind every number.' },
              { icon: Eye, title: 'Fault Diagnosis Engine', desc: 'Distinguishes dirty panels, bird droppings, tree shadows, loose cables, broken connections, panel degradation — each with specific action guidance. Not just that it is wrong, but why.' },
            ].map((f) => (
              <div key={f.title} className="bg-warm-cream-lifted border border-warm-divider rounded-2xl p-8 md:p-10 hover:border-bb-green-400 transition-all">
                <div className="w-12 h-12 rounded-xl bg-white border border-warm-divider flex items-center justify-center mb-6">
                  <f.icon className="w-6 h-6 text-bb-green-700" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-warm-text mb-3 leading-tight">{f.title}</h3>
                <p className="text-base text-warm-body leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* 4 compact cards — row of 2x2 or 4 across */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: AlertTriangle, title: 'Intelligent Alerts', desc: 'Three severity levels. Skips low-light. Auto-resolves on recovery.' },
              { icon: BarChart3, title: 'Performance Analysis', desc: 'Date-range heatmaps · CSV export · multi-season trends.' },
              { icon: TrendingUp, title: 'Shading Detection', desc: 'Time-of-day pattern analysis pinpoints growing obstructions.' },
              { icon: Layers, title: 'Multi-Brand Dashboard', desc: 'Huawei · Solis · Growatt · Sungrow — one unified view.' },
            ].map((f) => (
              <div key={f.title} className="bg-white border border-warm-divider rounded-2xl p-6 hover:border-bb-green-400 transition-all">
                <f.icon className="w-5 h-5 text-bb-green-600 mb-4" />
                <h3 className="text-base font-bold text-warm-text mb-2 leading-tight">{f.title}</h3>
                <p className="text-sm text-warm-body leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS — Wise zig-zag stepped ═════════════════════ */}
      <section id="how-it-works" className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16 max-w-2xl">
            <EyebrowDot>Process</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1]">
              From site visit to live data <br className="hidden md:block"/>in under an hour.
            </h2>
          </div>

          <div className="space-y-16 md:space-y-24">
            {[
              { step: '01', title: 'On-Site Installation', desc: 'Our field engineer visits your plant. We install the SPC monitoring device, compatible with Huawei, Solis, Growatt, and Sungrow. Under an hour per site.', icon: MapPin, flip: false },
              { step: '02', title: 'Automatic Discovery', desc: 'The device auto-discovers every inverter and string. No manual configuration, no device IDs, no port numbers. Your full fleet is visible within minutes.', icon: Zap, flip: true },
              { step: '03', title: 'Live Monitoring', desc: 'Real-time data every 5 minutes. Health scores, alerts, fault diagnosis — all immediate. Dashboard access forever, from any device.', icon: Activity, flip: false },
            ].map((item) => (
              <div key={item.step} className={`grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14 items-center ${item.flip ? 'md:[&>*:first-child]:order-2' : ''}`}>
                <div>
                  <p className="text-[120px] md:text-[160px] font-bold text-warm-divider font-mono leading-none tracking-[-0.05em] select-none">
                    {item.step}
                  </p>
                </div>
                <div>
                  <div className="inline-flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-bb-green-500 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-warm-muted uppercase tracking-widest">Step {item.step}</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-warm-text mb-4 leading-tight">{item.title}</h3>
                  <p className="text-base md:text-lg text-warm-body leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CASE STUDIES — Pinterest masonry (1 featured + 2 compact) */}
      <section className="py-24 md:py-32 px-6 bg-warm-cream-lifted border-y border-warm-divider">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <EyebrowDot>Outcomes from the field</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1]">
              Real faults. Real numbers. <br className="hidden md:block"/>Real recoveries.
            </h2>
            <p className="mt-4 text-sm text-warm-muted font-medium">
              Representative scenarios from our active fleet · client names anonymized for privacy
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
            {/* Featured card — spans 3 cols */}
            <div className="md:col-span-3 bg-white border border-warm-divider rounded-2xl p-8 md:p-10 flex flex-col">
              <p className="text-[72px] md:text-[96px] font-bold text-bb-green-600 font-mono tracking-[-0.04em] leading-[0.9] mb-2">
                32<span className="text-bb-green-500">%</span>
              </p>
              <p className="text-[11px] font-bold text-warm-muted uppercase tracking-widest mb-6">generation loss detected</p>
              <h3 className="text-xl md:text-2xl font-bold text-warm-text mb-2 leading-tight">
                Tree shadow auto-diagnosed in 12 minutes
              </h3>
              <p className="text-sm font-bold text-warm-muted uppercase tracking-widest mb-5">400 kW rooftop · Multan</p>
              <p className="text-base text-warm-body leading-relaxed font-medium flex-1">
                SPC flagged PV7 underperforming vs peer strings with a recurring midday dip. Fault class: tree shadow (seasonal growth). Owner trimmed the adjacent mulberry within 48 hours — string recovered to 97% within a week.
              </p>
              <div className="mt-6 pt-6 border-t border-warm-divider flex items-center gap-2">
                <Clock className="w-4 h-4 text-bb-green-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-warm-body">12 min to detect · 48 h to fix</p>
              </div>
            </div>

            {/* 2 compact cards — each spans 2 cols, stacked on md+ */}
            <div className="md:col-span-2 grid grid-rows-2 gap-5">
              {[
                { metric: '14%', unit: '', label: 'performance improvement', title: 'Loose DC cable caught same-day', where: '850 kW textile mill · Faisalabad', duration: '3 h to detect · 6 h to fix' },
                { metric: 'PKR 180K', unit: '', label: 'annual savings unlocked', title: 'Four faulty panels identified', where: '1.2 MW housing society · Lahore', duration: '6 weeks tracked · 1 claim filed' },
              ].map((cs) => (
                <div key={cs.title} className="bg-white border border-warm-divider rounded-2xl p-6 flex flex-col">
                  <p className="text-3xl md:text-4xl font-bold text-bb-green-600 font-mono tracking-[-0.03em] leading-none mb-1">{cs.metric}</p>
                  <p className="text-[10px] font-bold text-warm-muted uppercase tracking-widest mb-4">{cs.label}</p>
                  <h3 className="text-base font-bold text-warm-text mb-1 leading-tight">{cs.title}</h3>
                  <p className="text-[11px] font-bold text-warm-muted uppercase tracking-widest mb-auto">{cs.where}</p>
                  <div className="mt-4 pt-3 border-t border-warm-divider flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-bb-green-500 flex-shrink-0" />
                    <p className="text-[11px] font-semibold text-warm-body">{cs.duration}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ FAULT DETECTION TABLE — icon rows, warm theme ═══════════ */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 max-w-3xl">
            <EyebrowDot>Fault detection intelligence</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1]">
              Know what&apos;s wrong. <br className="hidden md:block"/>Know what to fix.
            </h2>
            <p className="mt-4 text-base md:text-lg text-warm-body leading-relaxed font-medium">
              SPC doesn&apos;t just tell you a string is underperforming — it tells you why, and what action to take. Seven fault classes, each with a specific signature.
            </p>
          </div>

          <div className="overflow-x-auto bg-white border border-warm-divider rounded-2xl">
            <table className="w-full text-left">
              <thead className="bg-warm-cream-lifted">
                <tr className="border-b border-warm-divider">
                  <th className="py-4 px-6 text-[10px] font-bold text-warm-muted uppercase tracking-widest">Fault Type</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-warm-muted uppercase tracking-widest">Pattern</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-warm-muted uppercase tracking-widest">Detection</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { fault: 'Dirty / Dusty Panels', pattern: '10–30% current drop, gradual', detection: 'Multiple strings decline together over days' },
                  { fault: 'Bird Droppings', pattern: '>25% sudden drop', detection: 'Individual string, not time-dependent' },
                  { fault: 'Tree Shadow', pattern: 'Drops at specific hours', detection: 'Time-of-day pattern analysis' },
                  { fault: 'Faulty Panel', pattern: '30–50% consistently lower', detection: 'Persistent regardless of weather / time' },
                  { fault: 'Loose Cable', pattern: 'Random on/off, intermittent', detection: 'High performance but low availability' },
                  { fault: 'Broken / Disconnected', pattern: '0V, 0A', detection: 'Complete loss of output' },
                  { fault: 'Panel Degradation', pattern: 'Gradual decline over months', detection: 'Slow health score decrease in trends' },
                ].map((row) => (
                  <tr key={row.fault} className="border-b border-warm-divider hover:bg-warm-cream-lifted transition-colors last:border-b-0">
                    <td className="py-4 px-6 text-sm font-bold text-warm-text">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-bb-green-500 rounded-full" />
                        {row.fault}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-warm-body">{row.pattern}</td>
                    <td className="py-4 px-6 text-sm text-warm-body">{row.detection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══ WHO WE SERVE — flowing pill cards ═══════════════════════ */}
      <section className="py-24 md:py-32 px-6 bg-white border-y border-warm-divider">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <EyebrowDot>Who we serve</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1]">
              Built for Pakistan&apos;s <br className="hidden md:block"/>commercial solar fleet.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Factory, title: 'Factories & Manufacturing', desc: 'Textile mills, paper plants, food processing — where every kWh cuts production cost.' },
              { icon: Layers, title: 'Textile Mills', desc: 'Large rooftop arrays, high stakes, thin margins. Catch faults before monthly target slips.' },
              { icon: Building2, title: 'Shopping Malls', desc: 'Multi-tenant rooftops, air-con load, peak-hour tariffs. Protect the solar offset.' },
              { icon: Home, title: 'Housing Societies', desc: 'Community solar for common-area lighting and lifts. Residents notice when generation drops — you get notified first.' },
              { icon: HeartPulse, title: 'Hospitals & Data Centers', desc: 'Zero downtime tolerance, 24/7 load. String-level visibility means no hidden degradation.' },
              { icon: Network, title: 'Multi-Site Operators', desc: 'Fleet owners with 5+ plants across cities. One dashboard, all sites, one alert stream.' },
            ].map((s) => (
              <div key={s.title} className="bg-warm-cream-lifted border border-warm-divider rounded-2xl p-6 hover:border-bb-green-400 transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-white border border-warm-divider flex items-center justify-center flex-shrink-0">
                    <s.icon className="w-5 h-5 text-bb-green-700" />
                  </div>
                  <h3 className="text-base font-bold text-warm-text leading-snug">{s.title}</h3>
                </div>
                <p className="text-sm text-warm-body leading-relaxed font-medium">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ IEC 61724 — Mastercard orbital badge layout ═════════════ */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-12 md:gap-16 items-center">
          {/* LEFT — asymmetric text */}
          <div>
            <EyebrowDot>International standard</EyebrowDot>
            <h3 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold text-warm-text leading-[1.1] tracking-[-0.02em] mb-6">
              IEC 61724 aligned health scoring.
            </h3>
            <div className="text-base md:text-lg text-warm-body leading-relaxed font-medium space-y-4">
              <p>
                We didn&apos;t invent string monitoring. We made it work for Pakistani conditions, brands, and climate. SPC follows the <strong className="text-warm-text">IEC 61724</strong> standard — each string evaluated on <strong className="text-warm-text">Performance</strong> (current quality) and <strong className="text-warm-text">Availability</strong> (uptime), combined into a single Health Score.
              </p>
              <p>
                Fault classifications align to <strong className="text-warm-text">IEC 62446-1</strong>. You instantly know whether a problem is a <strong className="text-warm-text">panel issue</strong> (shading / degradation) or a <strong className="text-warm-text">wiring issue</strong> (loose cable / intermittent).
              </p>
            </div>
          </div>

          {/* RIGHT — orbital badge */}
          <div className="relative flex items-center justify-center">
            <svg aria-hidden="true" className="absolute inset-0 w-full h-full -z-0" viewBox="0 0 400 400">
              <circle cx="200" cy="200" r="180" fill="none" stroke="#76B900" strokeWidth="1" strokeDasharray="3 5" opacity="0.4" />
              <circle cx="200" cy="200" r="150" fill="none" stroke="#76B900" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
            </svg>
            <div className="relative w-48 h-48 md:w-60 md:h-60 rounded-full bg-white border-4 border-bb-green-500 shadow-[0_30px_60px_-20px_rgba(118,185,0,0.3)] flex items-center justify-center">
              <div className="text-center">
                <Shield className="w-12 h-12 md:w-14 md:h-14 text-bb-green-600 mx-auto mb-2" />
                <p className="text-xs md:text-sm font-bold text-warm-muted uppercase tracking-widest">Aligned to</p>
                <p className="text-2xl md:text-3xl font-bold text-warm-text font-mono tracking-tight mt-1">IEC 61724</p>
                <p className="text-[10px] md:text-xs font-semibold text-warm-muted uppercase tracking-widest mt-1">+ IEC 62446-1</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOUNDER — Mastercard asymmetric with REAL photo ═════════ */}
      <section id="founder" className="py-24 md:py-32 px-6 bg-warm-cream-lifted border-y border-warm-divider">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-12 md:gap-20 items-center">
          {/* LEFT — real photo in perfect circle */}
          <div className="relative flex items-center justify-center md:justify-start">
            <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden ring-4 ring-white shadow-[0_40px_80px_-20px_rgba(26,26,26,0.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/reyyan.jpeg"
                alt="Engr. Reyyan Niaz Khan — Founder, Bijli Bachao"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            {/* Satellite accent dot */}
            <div className="absolute -bottom-2 -right-2 md:-bottom-4 md:-right-4 w-14 h-14 md:w-20 md:h-20 rounded-full bg-bb-green-500 border-4 border-warm-cream-lifted flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 md:w-9 md:h-9 text-white" />
            </div>
          </div>

          {/* RIGHT — name, quote, credentials */}
          <div>
            <EyebrowDot>Meet the engineer behind SPC</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1]">
              Engr. Reyyan Niaz Khan
            </h2>
            <p className="mt-2 text-sm md:text-base text-warm-muted font-bold uppercase tracking-widest">
              Founder &amp; Director · Bijli Bachao
            </p>

            <blockquote className="mt-8 text-xl md:text-2xl text-warm-text font-medium leading-snug border-l-4 border-bb-green-500 pl-6 italic">
              Pakistani businesses deserve the same energy visibility that multinationals have had for decades. SPC is how we deliver it.
            </blockquote>

            <div className="mt-10 grid grid-cols-2 gap-4">
              {[
                { label: 'Education', value: 'UET Lahore' },
                { label: 'Experience', value: '14+ years' },
                { label: 'Field', value: 'Energy engineering' },
                { label: 'Prior Clients', value: '50+ MNCs' },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[10px] font-bold text-warm-muted uppercase tracking-widest mb-1">{item.label}</p>
                  <p className="text-base font-bold text-warm-text">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-warm-divider">
              <p className="text-[10px] font-bold text-warm-muted uppercase tracking-widest mb-3">Previously consulted for</p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-lg font-bold text-warm-text">
                <span>USAID</span>
                <span className="w-1 h-1 rounded-full bg-warm-divider" />
                <span>Schlumberger</span>
                <span className="w-1 h-1 rounded-full bg-warm-divider" />
                <span>Diversey</span>
                <span className="w-1 h-1 rounded-full bg-warm-divider" />
                <span className="text-sm text-warm-muted font-semibold">+ 50 multinationals</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ BIJLI BACHAO PARENT — SPC featured + Vodafone ticker ═══ */}
      <section id="parent" className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <EyebrowDot>Part of the Bijli Bachao family</EyebrowDot>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-warm-text leading-[1.1]">
              Pakistan&apos;s Solar + Energy <br className="hidden md:block"/>
              <span className="text-warm-body font-normal">Automation Company.</span>
            </h2>
            <p className="mt-4 text-base md:text-lg text-warm-body leading-relaxed font-medium">
              We install solar. Then we stay — for 25 years. SPC is one of three platforms Bijli Bachao has built to make every kilowatt count.
            </p>
          </div>

          {/* SPC featured + 2 smaller stacked */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-16">
            {/* SPC featured — 3 cols */}
            <div className="md:col-span-3 bg-white border-2 border-bb-green-500 rounded-2xl p-8 md:p-10 relative flex flex-col">
              <div className="absolute top-4 right-4 px-2.5 py-1 bg-bb-green-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-full">You are here</div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-solar-gold-400 to-solar-gold-600 flex items-center justify-center mb-6">
                <Sun className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-warm-text mb-3 leading-tight">Solar Performance Cloud</h3>
              <p className="text-base text-warm-body leading-relaxed font-medium mb-5">
                Per-string solar monitoring across Huawei, Solis, Growatt, Sungrow. Pakistan&apos;s first independent string-level platform.
              </p>
              <p className="mt-auto text-sm font-mono text-bb-green-700 font-bold">spc.bijlibachao.pk</p>
            </div>

            {/* 2 compact stacked */}
            <div className="md:col-span-2 grid grid-rows-2 gap-5">
              <div className="bg-white border border-warm-divider rounded-2xl p-6 hover:border-bb-green-400 transition-all flex flex-col">
                <div className="w-11 h-11 rounded-xl bg-bb-green-500 flex items-center justify-center mb-4">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-warm-text mb-2 leading-tight">WATTEY</h3>
                <p className="text-sm text-warm-body leading-relaxed font-medium">Real-time IoT energy consumption — grid, generator, solar usage.</p>
                <p className="mt-auto pt-3 text-[11px] font-mono text-warm-muted">wattey.bijlibachao.pk</p>
              </div>
              <div className="bg-white border border-warm-divider rounded-2xl p-6 hover:border-bb-green-400 transition-all flex flex-col">
                <div className="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center mb-4">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-warm-text mb-2 leading-tight">Meter Billing</h3>
                <p className="text-sm text-warm-body leading-relaxed font-medium">Photo-verified automated tenant billing for malls and societies.</p>
                <p className="mt-auto pt-3 text-[11px] font-mono text-warm-muted">metering.wattey.bijlibachao.pk</p>
              </div>
            </div>
          </div>

          {/* Vodafone ticker stats */}
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-10 md:gap-14 items-end">
            <div>
              <p className="text-[11px] font-bold text-warm-muted uppercase tracking-widest mb-3">Bijli Bachao in the field</p>
              <p className="text-[64px] md:text-[96px] font-bold text-warm-text font-mono tracking-[-0.04em] leading-[0.9]">
                14<span className="text-bb-green-500">+ yrs</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-6 md:border-l md:border-warm-divider md:pl-10">
              {[
                { v: '100+', u: 'installations' },
                { v: '0.96', u: 'GWh monitored' },
                { v: '4 + 🇦🇺', u: 'Pakistan cities + AU' },
              ].map((s) => (
                <div key={s.u}>
                  <p className="text-2xl md:text-3xl font-bold font-mono tracking-[-0.02em] leading-none text-warm-text">{s.v}</p>
                  <p className="text-[11px] text-warm-muted mt-2 leading-tight uppercase tracking-wider font-semibold">{s.u}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-3">
            {[
              { icon: Award, label: 'IEC 61724 aligned' },
              { icon: Award, label: 'IEC 62446-1 compliant' },
              { icon: Shield, label: 'Engineer-led, not sales-led' },
            ].map((c) => (
              <div key={c.label} className="inline-flex items-center gap-2 px-4 py-2 bg-warm-cream-lifted border border-warm-divider rounded-full">
                <c.icon className="w-4 h-4 text-bb-green-600" />
                <span className="text-xs font-bold text-warm-text">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA — full-bleed green band ════════════════════════ */}
      <section id="cta" className="bg-bb-green-500 py-20 md:py-28 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-10 md:gap-16 items-center">
          <div>
            <p className="text-[11px] font-bold text-bb-green-100 uppercase tracking-widest mb-4">
              Free site visit · No commitment
            </p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] text-white leading-[1.05] mb-6">
              Ready to see every string on your plant?
            </h2>
            <p className="text-base md:text-lg text-bb-green-50 leading-relaxed font-medium mb-8 max-w-xl">
              Our engineer visits your plant, assesses your inverter fleet, and shows you a live demo on your actual data. If we&apos;re not a fit, we walk away.
            </p>

            {/* Founder trust chip with real photo */}
            <div className="inline-flex items-center gap-3 px-4 py-2.5 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/reyyan.jpeg" alt="Engr. Reyyan Niaz Khan" className="w-8 h-8 rounded-full object-cover ring-2 ring-white/40" />
              <p className="text-xs font-semibold text-white">
                <strong className="font-bold">Reyyan</strong> responds personally within 2 hours
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group px-8 py-4 text-sm font-bold bg-white text-bb-green-700 rounded-full hover:bg-bb-green-50 transition-all flex items-center justify-center gap-2 shadow-xl w-full md:w-auto"
            >
              Book Free Site Visit
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 text-sm font-bold text-white rounded-full border-2 border-white/40 hover:bg-white/10 transition-all flex items-center justify-center gap-2 w-full md:w-auto"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp {WHATSAPP_LABEL}
            </a>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer className="py-16 px-6 bg-warm-cream border-t border-warm-divider">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-solar-gold-400 to-solar-gold-600 flex items-center justify-center">
                  <Sun className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-bold text-warm-text">Solar Performance Cloud</span>
              </div>
              <p className="text-xs text-warm-muted leading-relaxed font-medium">
                Pakistan&apos;s first string-level solar monitoring platform.
                Engineer-installed, engineer-maintained.
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-warm-muted uppercase tracking-widest mb-4">Product</p>
              <ul className="space-y-2.5 text-sm text-warm-body font-medium">
                <li><a href="#demo" className="hover:text-bb-green-700">Dashboard Demo</a></li>
                <li><a href="#how-it-works" className="hover:text-bb-green-700">How It Works</a></li>
                <li><Link href="/sign-in" className="hover:text-bb-green-700">Sign In</Link></li>
                <li><a href="#cta" className="hover:text-bb-green-700">Book Site Visit</a></li>
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-bold text-warm-muted uppercase tracking-widest mb-4">Bijli Bachao</p>
              <ul className="space-y-2.5 text-sm text-warm-body font-medium">
                <li><a href="#founder" className="hover:text-bb-green-700">Meet the Founder</a></li>
                <li><a href="#parent" className="hover:text-bb-green-700">Our Products</a></li>
                <li><a href="https://wattey.bijlibachao.pk" target="_blank" rel="noopener noreferrer" className="hover:text-bb-green-700">Wattey <ArrowUpRight className="inline w-3 h-3" /></a></li>
                <li><a href="https://bijlibachao.pk" target="_blank" rel="noopener noreferrer" className="hover:text-bb-green-700">Bijli Bachao <ArrowUpRight className="inline w-3 h-3" /></a></li>
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-bold text-warm-muted uppercase tracking-widest mb-4">Contact</p>
              <ul className="space-y-2.5 text-sm text-warm-body font-medium">
                <li className="flex items-start gap-1.5"><MapPin className="w-3 h-3 mt-1 text-warm-muted flex-shrink-0" /> 69-Abid Majeed Rd, Lahore</li>
                <li><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-bb-green-700">WhatsApp {WHATSAPP_LABEL}</a></li>
                <li><a href="https://linkedin.com/company/bijli-bachao-pk" target="_blank" rel="noopener noreferrer" className="hover:text-bb-green-700">LinkedIn <ArrowUpRight className="inline w-3 h-3" /></a></li>
                <li><a href="https://facebook.com/BijliBachaoPk" target="_blank" rel="noopener noreferrer" className="hover:text-bb-green-700">Facebook <ArrowUpRight className="inline w-3 h-3" /></a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-warm-divider flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-warm-muted font-medium">
            <div>© 2026 BijliBachao.pk · Founded by Engr. Reyyan Niaz Khan · Since 2012</div>
            <div className="flex items-center gap-4">
              <span>IEC 61724 aligned</span>
              <span className="w-1 h-1 rounded-full bg-warm-divider" />
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
// SIGNATURE PRIMITIVES — used across the landing page.
// Per DESIGN.md §2.9 — landing-page-only Mastercard-style patterns.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function EyebrowDot({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-warm-muted">
      <span className="w-1.5 h-1.5 bg-bb-green-500 rounded-full" />
      {children}
    </span>
  )
}

function LaptopMockup({ children }: { children: React.ReactNode }) {
  // CSS-only laptop frame — Wise-style product shot on landing.
  // The screen area clips its children with a rounded top radius; a base
  // bar + notch suggest a physical laptop without using an image asset.
  return (
    <div className="relative w-full max-w-xl mx-auto">
      {/* Outer laptop lid */}
      <div className="relative rounded-t-xl bg-warm-text p-2 pb-0 shadow-[0_30px_60px_-20px_rgba(26,26,26,0.25),0_18px_36px_-18px_rgba(26,26,26,0.2)]">
        {/* Camera dot */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-warm-text/60 ring-1 ring-warm-divider/20" />
        {/* Screen */}
        <div className="rounded-t-md overflow-hidden bg-white aspect-[16/10]">
          <div className="w-full h-full overflow-hidden">{children}</div>
        </div>
      </div>
      {/* Base bar */}
      <div className="mx-auto h-2 w-[108%] -ml-[4%] bg-gradient-to-b from-warm-text/95 to-warm-text/75 rounded-b-xl" />
      <div className="mx-auto h-1 w-[30%] bg-warm-text/80 rounded-b-md" />
    </div>
  )
}

function HeroDashPeek() {
  // Compact teaser for the hero laptop frame — 4 KPI chips + a tiny
  // spark + 6 string bars. Different view from the big MiniDashboard
  // below so visitors get two moments, not a duplicate.
  return (
    <div className="w-full h-full bg-white p-3 flex flex-col gap-2.5 text-left">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-sm bg-gradient-to-br from-solar-gold-400 to-solar-gold-600 flex items-center justify-center">
            <Sun className="w-2 h-2 text-white" />
          </div>
          <span className="text-[9px] font-bold text-warm-text">Fleet overview · 48 plants</span>
        </div>
        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-bb-green-50 border border-bb-green-200 rounded-sm">
          <span className="w-1 h-1 bg-bb-green-500 rounded-full animate-pulse" />
          <span className="text-[7px] font-bold text-bb-green-700 uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-4 gap-1">
        {[
          { v: '96%', l: 'Health', c: 'text-bb-green-700' },
          { v: '2.2 MW', l: 'Fleet', c: 'text-warm-text' },
          { v: '44/48', l: 'Live', c: 'text-bb-green-700' },
          { v: '3', l: 'Alerts', c: 'text-red-600' },
        ].map((k) => (
          <div key={k.l} className="bg-warm-cream rounded-sm p-1.5 border border-warm-divider">
            <p className={`text-[10px] font-bold ${k.c} font-mono leading-none`}>{k.v}</p>
            <p className="text-[6px] font-semibold text-warm-muted uppercase tracking-wider mt-0.5">{k.l}</p>
          </div>
        ))}
      </div>

      {/* Mini spark */}
      <div className="flex-1 min-h-0 bg-warm-cream rounded-sm border border-warm-divider p-2 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[7px] font-bold text-warm-muted uppercase tracking-wider">24h Fleet Power</span>
          <span className="text-[7px] font-mono text-solar-gold-700 font-bold">Peak 11.2 MW</span>
        </div>
        <div className="flex-1 relative">
          <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id="peek-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M 0 58 L 10 55 L 25 48 L 45 32 L 70 15 L 90 6 L 110 5 L 130 12 L 155 30 L 175 50 L 195 58 L 200 58 L 200 60 L 0 60 Z" fill="url(#peek-fill)" />
            <path d="M 0 58 L 10 55 L 25 48 L 45 32 L 70 15 L 90 6 L 110 5 L 130 12 L 155 30 L 175 50 L 195 58" fill="none" stroke="#f59e0b" strokeWidth="1.2" />
          </svg>
        </div>
      </div>

      {/* String bars */}
      <div className="grid grid-cols-6 gap-0.5">
        {[97, 94, 91, 23, 88, 93].map((v, i) => {
          const isBad = v < 40
          return (
            <div key={i} className={`rounded-sm p-1 border ${isBad ? 'bg-red-50 border-red-200' : 'bg-bb-green-50 border-bb-green-200'}`}>
              <p className={`text-[7px] font-mono font-bold ${isBad ? 'text-red-700' : 'text-bb-green-700'}`}>{v}%</p>
              <div className="h-0.5 bg-warm-divider rounded-full overflow-hidden mt-0.5">
                <div className={`h-full ${isBad ? 'bg-red-500' : 'bg-bb-green-500'}`} style={{ width: `${v}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
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
