import { ImageResponse } from 'next/og'

// Open-Graph image — auto-served at /opengraph-image at build time.
// Next.js picks this up and injects og:image meta tags for any page
// that doesn't declare its own. Pure typography + brand accents, no
// AI asset. Matches the landing page's warm-cream + NVIDIA-green look.

// Node runtime — works on self-hosted EC2. Edge runtime is also
// valid but requires edge polyfills. Node is safer here.
export const alt = 'Solar Performance Cloud — Detect underperforming strings before they cost you money.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#F8F7F6',
          display: 'flex',
          flexDirection: 'column',
          padding: '72px 88px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative orbital arc (top-right) */}
        <svg
          width="520"
          height="520"
          viewBox="0 0 520 520"
          style={{ position: 'absolute', top: -120, right: -120, opacity: 0.5 }}
        >
          <circle cx="260" cy="260" r="240" fill="none" stroke="#76B900" strokeWidth="1.5" strokeDasharray="4 8" />
          <circle cx="260" cy="260" r="190" fill="none" stroke="#76B900" strokeWidth="1" strokeDasharray="2 6" opacity="0.6" />
        </svg>

        {/* Top row — eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 56 }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: '#76B900' }} />
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 4,
              color: '#7A7A7A',
            }}
          >
            A Product of Bijli Bachao · Pakistan&apos;s First
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 82,
            fontWeight: 700,
            color: '#1A1A1A',
            lineHeight: 1.04,
            letterSpacing: -2,
            maxWidth: 960,
          }}
        >
          <span>Detect underperforming</span>
          <span>solar strings</span>
          <span style={{ color: '#454545', fontWeight: 400 }}>before they cost you money.</span>
        </div>

        {/* Bottom row — CTA pill + URL */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 56,
          }}
        >
          <div
            style={{
              backgroundColor: '#76B900',
              color: 'white',
              padding: '22px 44px',
              borderRadius: 999,
              fontSize: 28,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            Book a Free Site Visit →
          </div>
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#1A1A1A',
              fontFamily: 'monospace',
              letterSpacing: -0.5,
            }}
          >
            spc.bijlibachao.pk
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
