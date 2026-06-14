'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, Lock, MessageCircle, Mail } from 'lucide-react'

/**
 * Single-viewport product gateway for spc.bijlibachao.pk.
 * Pure visual layer — all auth/redirect logic lives in app/page.tsx.
 * Daylight Stripe-mesh hero (Option G) + sunrise-sweep loader + solar
 * generation-curve horizon. Palette per DESIGN-stripe.md.
 */

const WHATSAPP_URL = 'https://wa.me/923234578775'
const WHATSAPP_LABEL = '+92 323 457 8775'
const SUPPORT_EMAIL = 'dev.bijlibachaopk@gmail.com'

export default function LandingHero({ signedIn }: { signedIn: boolean }) {
  const loaderRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)

  // Loader dissolve + soft mouse-parallax. All listeners cleaned up on unmount.
  useEffect(() => {
    const loader = loaderRef.current
    const hide = () => loader?.classList.add('is-gone')

    const timers: number[] = []
    const onLoad = () => timers.push(window.setTimeout(hide, 1450))
    if (document.readyState === 'complete') timers.push(window.setTimeout(hide, 1450))
    else window.addEventListener('load', onLoad)
    timers.push(window.setTimeout(hide, 2100)) // safety fallback

    let raf = 0
    let onMove: ((e: MouseEvent) => void) | undefined
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce && sceneRef.current) {
      const layers = Array.from(sceneRef.current.querySelectorAll<HTMLElement>('[data-d]'))
      let tx = 0, ty = 0
      const apply = () => {
        raf = 0
        for (const l of layers) {
          const d = parseFloat(l.dataset.d || '0')
          l.style.transform = `translate3d(${(-tx * d).toFixed(2)}px,${(-ty * d * 0.5).toFixed(2)}px,0)`
        }
      }
      onMove = (e: MouseEvent) => {
        tx = e.clientX / window.innerWidth - 0.5
        ty = e.clientY / window.innerHeight - 0.5
        if (!raf) raf = requestAnimationFrame(apply)
      }
      window.addEventListener('mousemove', onMove)
    }

    return () => {
      window.removeEventListener('load', onLoad)
      if (onMove) window.removeEventListener('mousemove', onMove)
      timers.forEach(clearTimeout)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="spc-landing">
      {/* ── sunrise-sweep loader ───────────────────────────────── */}
      <div className="loader" ref={loaderRef} role="status" aria-label="Loading Solar Performance Cloud">
        <div className="lw">
          <div className="sunwrap">
            <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
              <defs>
                <linearGradient id="spc-rg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f7d9a8" />
                  <stop offset="48%" stopColor="#f6a35a" />
                  <stop offset="100%" stopColor="#533afd" />
                </linearGradient>
              </defs>
              <circle className="track" cx="60" cy="60" r="52" />
              <circle className="prog" cx="60" cy="60" r="52" />
            </svg>
            <span className="orb" />
          </div>
          <div className="ln">Solar Performance Cloud</div>
        </div>
      </div>

      {/* ── daylight scene ─────────────────────────────────────── */}
      <div className="scene" ref={sceneRef}>
        <div className="mesh layer" data-d="4" aria-hidden="true">
          <span className="b b1" /><span className="b b2" /><span className="b b3" /><span className="b b4" /><span className="b b5" />
        </div>
        <div className="sun" aria-hidden="true" />
        <div className="layer" data-d="14" aria-hidden="true"><span className="cloud cl1" /><span className="cloud cl2" /></div>
        <div className="layer" data-d="22" aria-hidden="true"><span className="cloud cl3" /></div>
        <div className="veil" aria-hidden="true" />

        {/* solar generation curve — a day of production, anchored as the horizon */}
        <svg className="curve" data-d="2" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="spc-gen-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f6a35a" />
              <stop offset="52%" stopColor="#9b6cff" />
              <stop offset="100%" stopColor="#533afd" />
            </linearGradient>
            <linearGradient id="spc-gen-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(246,163,90,.18)" />
              <stop offset="42%" stopColor="rgba(102,94,253,.13)" />
              <stop offset="100%" stopColor="rgba(102,94,253,0)" />
            </linearGradient>
          </defs>
          <path className="area" d="M0 300 C 320 300, 520 96, 720 88 C 920 96, 1120 300, 1440 300 L1440 320 L0 320 Z" fill="url(#spc-gen-fill)" />
          <path className="line" d="M0 300 C 320 300, 520 96, 720 88 C 920 96, 1120 300, 1440 300" />
        </svg>

        <main className="content">
          <div className="brand r2 d1">
            <span className="mark" aria-hidden="true">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" fill="#fff" stroke="none" />
                <path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
              </svg>
            </span>
            <span className="txt">
              <span className="name">Solar Performance Cloud</span>
              <br />
              <span className="by">by BijliBachao.pk</span>
            </span>
          </div>

          <h1 className="headline r2 d2">Monitoring every plant,<br />down to the string.</h1>
          <p className="sub r2 d3">Real-time health, performance, and alerts for every solar plant you run — sign in to your live dashboard.</p>

          <div className="cta r2 d4">
            {signedIn ? (
              <Link className="btn btn-primary" href="/auth-redirect">Go to Dashboard <ArrowRight size={15} /></Link>
            ) : (
              <>
                <Link className="btn btn-primary" href="/sign-in">Log in <ArrowRight size={15} /></Link>
                <Link className="btn btn-secondary" href="/sign-up">Sign up</Link>
              </>
            )}
          </div>

          <div className="foot r2 d5"><Lock size={13} /> Secure, encrypted access</div>
          <div className="support r2 d5">
            <span>Need help? Contact Reyyan</span>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><MessageCircle size={13} /> {WHATSAPP_LABEL}</a>
            <span className="dotsep" aria-hidden="true" />
            <a href={`mailto:${SUPPORT_EMAIL}`}><Mail size={13} /> {SUPPORT_EMAIL}</a>
          </div>
        </main>
      </div>

      <style jsx>{`
        .spc-landing {
          --primary:#533afd; --primary-press:#2e2b8c; --primary-soft:#665efd; --lavender:#b9b9f9;
          --ink:#0d253d; --ink-mute:#64748d; --cream:#f5e9d4; --magenta:#f96bee; --ruby:#ea2261; --canvas:#fff;
          position:relative; height:100vh; height:100dvh; width:100%; overflow:hidden;
          color:var(--ink); font-weight:300; font-feature-settings:"ss01"; -webkit-font-smoothing:antialiased;
        }

        /* loader */
        .loader{position:fixed;inset:0;z-index:100;display:grid;place-items:center;
          background:radial-gradient(125% 125% at 50% 40%, #fcf3e3 0%, #f2e8d7 55%, #ece2d2 100%);
          animation:dawn 1.5s ease-out forwards;transition:opacity .75s ease,visibility .75s ease}
        .loader.is-gone{opacity:0;visibility:hidden;pointer-events:none}
        @keyframes dawn{0%{filter:brightness(.9) saturate(.88)}100%{filter:brightness(1.07) saturate(1.02)}}
        .lw{display:flex;flex-direction:column;align-items:center;gap:22px}
        .sunwrap{position:relative;width:118px;height:118px;display:grid;place-items:center}
        .ring{position:absolute;inset:0;transform:rotate(-90deg)}
        .ring .track{fill:none;stroke:rgba(28,30,84,.07);stroke-width:3}
        .ring .prog{fill:none;stroke:url(#spc-rg);stroke-width:3;stroke-linecap:round;
          stroke-dasharray:327;stroke-dashoffset:327;animation:sweep 1.2s cubic-bezier(.4,0,.2,1) .15s forwards}
        @keyframes sweep{to{stroke-dashoffset:0}}
        .orb{width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 50% 42%,#fff,var(--cream) 42%,#f7d9a8 70%);
          box-shadow:0 0 36px 10px rgba(247,217,168,.85),0 0 16px 4px rgba(102,94,253,.16);
          animation:rise 1.3s ease-out forwards, breathe 1.7s ease-in-out infinite}
        @keyframes rise{0%{transform:scale(.8);opacity:.65}100%{transform:scale(1);opacity:1}}
        @keyframes breathe{0%,100%{box-shadow:0 0 32px 8px rgba(247,217,168,.72),0 0 14px 3px rgba(102,94,253,.14)}
          50%{box-shadow:0 0 46px 14px rgba(247,217,168,.96),0 0 20px 5px rgba(102,94,253,.2)}}
        .ln{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--ink-mute);opacity:0;animation:lnin .6s ease .4s forwards}
        @keyframes lnin{to{opacity:.85}}
        .loader.is-gone .orb{animation:none;transform:scale(2.7);
          box-shadow:0 0 150px 80px rgba(255,249,235,.96),0 0 80px 40px rgba(247,217,168,.85);
          transition:transform .8s ease, box-shadow .8s ease}
        .loader.is-gone .ring,.loader.is-gone .ln{opacity:0;transition:opacity .4s ease}

        /* scene */
        .scene{position:absolute;inset:0;background:linear-gradient(180deg,#fbfcff 0%,#fdfaf3 70%,#fbf3e4 100%)}
        .layer{position:absolute;inset:0;will-change:transform}

        .mesh{position:absolute;inset:-12% -12% 26% -12%;filter:blur(72px);opacity:.95;pointer-events:none}
        .b{position:absolute;border-radius:50%}
        .b1{width:44vw;height:44vw;left:-4vw;top:-10vh;background:radial-gradient(circle at 32% 32%,#f7d9a8,#f5e9d4 60%,transparent 72%);animation:m1 26s ease-in-out infinite alternate}
        .b2{width:42vw;height:42vw;left:24vw;top:-14vh;background:radial-gradient(circle,#c9b6ff,var(--lavender) 55%,transparent 72%);animation:m2 30s ease-in-out infinite alternate}
        .b3{width:40vw;height:40vw;right:-6vw;top:-12vh;background:radial-gradient(circle,#6f63ff,var(--primary) 50%,transparent 70%);opacity:.5;animation:m3 24s ease-in-out infinite alternate}
        .b4{width:30vw;height:30vw;right:12vw;top:4vh;background:radial-gradient(circle,#ff9ad1,var(--magenta) 45%,transparent 70%);opacity:.32;animation:m2 32s ease-in-out infinite alternate-reverse}
        .b5{width:26vw;height:26vw;left:10vw;top:6vh;background:radial-gradient(circle,#ffc28a,#f6a35a 48%,transparent 70%);opacity:.42;animation:m1 28s ease-in-out infinite alternate-reverse}
        @keyframes m1{from{transform:translate(0,0) scale(1)}to{transform:translate(4vw,3vh) scale(1.08)}}
        @keyframes m2{from{transform:translate(0,0) scale(1)}to{transform:translate(-5vw,4vh) scale(1.1)}}
        @keyframes m3{from{transform:translate(0,0) scale(1)}to{transform:translate(-3vw,5vh) scale(1.12)}}
        .veil{position:absolute;inset:0;background:radial-gradient(120% 78% at 50% 26%, transparent 42%, rgba(255,255,255,.55) 78%, #fff 100%);pointer-events:none}

        .sun{position:absolute;top:-8%;left:50%;transform:translateX(-50%);width:50vw;height:50vw;border-radius:50%;
          background:radial-gradient(circle,rgba(255,255,255,.9) 0%,rgba(255,243,214,.7) 26%,rgba(245,233,212,.25) 48%,transparent 64%);animation:bask 9s ease-in-out infinite}
        @keyframes bask{0%,100%{opacity:.85}50%{opacity:1}}

        .cloud{position:absolute;border-radius:50%;background:radial-gradient(circle at 50% 55%,#fff,rgba(255,255,255,.55) 55%,transparent 75%);filter:blur(7px)}
        .cl1{width:480px;height:130px;top:18%;left:-12%;opacity:.8;animation:drift 70s linear infinite}
        .cl2{width:340px;height:100px;top:34%;left:-12%;opacity:.55;animation:drift 95s linear infinite;animation-delay:-40s}
        .cl3{width:560px;height:150px;top:50%;left:-12%;opacity:.7;animation:drift 80s linear infinite;animation-delay:-55s}
        @keyframes drift{from{transform:translateX(-12vw)}to{transform:translateX(120vw)}}

        .curve{position:absolute;inset:auto 0 0 0;height:46vh;width:100%;pointer-events:none;will-change:transform}
        .curve .area{opacity:0;animation:areafade 1.6s ease 1.5s forwards}
        .curve .line{fill:none;stroke:url(#spc-gen-stroke);stroke-width:2.4;stroke-linecap:round;opacity:.9;
          stroke-dasharray:2200;stroke-dashoffset:2200;animation:draw 2.1s 1.4s cubic-bezier(.4,0,.2,1) forwards}
        @keyframes draw{to{stroke-dashoffset:0}}
        @keyframes areafade{to{opacity:1}}

        .content{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px}
        .r2{opacity:0;transform:translateY(14px);animation:up .8s cubic-bezier(.16,1,.3,1) forwards}
        .d1{animation-delay:1.3s}.d2{animation-delay:1.45s}.d3{animation-delay:1.6s}.d4{animation-delay:1.78s}.d5{animation-delay:1.98s}
        @keyframes up{to{opacity:1;transform:none}}
        .brand{display:inline-flex;align-items:center;gap:11px;margin-bottom:32px}
        .mark{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,var(--primary-soft),var(--primary) 60%,#4434d4);box-shadow:0 8px 20px rgba(83,58,253,.28)}
        .name{font-size:15px;font-weight:500;letter-spacing:-.2px;color:var(--ink)}
        .by{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-mute);margin-top:2px}
        .txt{text-align:left}
        .headline{font-size:clamp(34px,6vw,58px);font-weight:300;line-height:1.05;letter-spacing:-1.4px;color:var(--ink);margin-bottom:18px}
        .sub{font-size:clamp(15px,2vw,17px);font-weight:300;line-height:1.5;color:var(--ink-mute);max-width:30em;margin:0 auto 30px}
        .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
        .btn{font-size:15px;font-weight:400;border-radius:9999px;padding:12px 24px;cursor:pointer;border:1px solid transparent;text-decoration:none;display:inline-flex;align-items:center;gap:7px;transition:transform .18s,box-shadow .18s,background .18s}
        .btn-primary{background:var(--primary);color:#fff;box-shadow:0 8px 22px rgba(83,58,253,.30)}
        .btn-primary:hover{transform:translateY(-1.5px);box-shadow:0 12px 30px rgba(83,58,253,.42)}
        .btn-secondary{background:rgba(255,255,255,.72);color:var(--primary);border-color:var(--primary);backdrop-filter:blur(6px)}
        .btn-secondary:hover{transform:translateY(-1.5px);background:#fff}
        .foot{margin-top:30px;font-size:12px;color:var(--ink-mute);display:inline-flex;align-items:center;gap:6px;opacity:.9}
        .support{margin-top:14px;font-size:12px;color:var(--ink-mute);display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center}
        .support a{color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:5px;font-weight:400}
        .support a:hover{text-decoration:underline}
        .dotsep{width:3px;height:3px;border-radius:50%;background:var(--ink-mute);opacity:.5}

        @media (max-width:520px){
          .support{flex-direction:column;gap:6px}
          .dotsep{display:none}
        }
        @media (prefers-reduced-motion: reduce){
          .spc-landing *{animation:none!important;transition:none!important}
          .r2{opacity:1;transform:none}
          .curve .line{stroke-dashoffset:0}.curve .area{opacity:1}
          .loader{display:none}
        }
      `}</style>
    </div>
  )
}
