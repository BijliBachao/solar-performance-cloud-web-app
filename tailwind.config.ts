import type { Config } from 'tailwindcss'

/**
 * SPC Design System v3 — "Solar Corporate"
 *
 * Single source: DESIGN.md at the project root.
 * Paired files: app/globals.css · lib/design-tokens.ts
 *
 * Rules (non-negotiable):
 *  - No pure black (#000) or near-black (#1a1a1a) anywhere
 *  - Pure white canvas
 *  - Solar Gold (#F59E0B) is the brand color — primary CTAs, active states, focus rings
 *  - Status colors come from STATUS_STYLES lookup in lib/design-tokens.ts
 */
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ━━━ SOLAR GOLD — the brand (v3 canonical) ━━━━━━━━━━━
        // Used as primary CTAs, active states, focus rings, brand accent.
        // Class names: bg-solar-gold, text-solar-gold-600, border-solar-gold-200
        // ━━━ SEMANTIC TOKENS → CSS vars (single source: globals.css :root) ━━━
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          press: 'var(--color-primary-press)',
          soft: 'var(--color-primary-soft)',
          subtle: 'var(--color-primary-subtle)',
          50: 'var(--color-primary-subtle)',
          100: 'var(--color-primary-subtle)',
          500: 'var(--color-primary)',
          600: 'var(--color-primary-hover)',
          700: 'var(--color-primary-press)',
          900: '#1c1e54',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          secondary: 'var(--color-ink-secondary)',
          mute: 'var(--color-ink-mute)',
        },
        canvas: {
          DEFAULT: 'var(--color-canvas)',
          soft: 'var(--color-canvas-soft)',
        },
        cream: 'var(--color-cream)',
        hairline: {
          DEFAULT: 'var(--color-hairline)',
          input: 'var(--color-hairline-input)',
        },
        'on-primary': 'var(--color-on-primary)',
        chart: {
          1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)',
          5: 'var(--chart-5)', 6: 'var(--chart-6)', 7: 'var(--chart-7)', 8: 'var(--chart-8)',
        },

        // solar-gold — legacy brand name, now → indigo via vars
        'solar-gold': {
          DEFAULT: 'var(--color-primary)',
          50: 'var(--color-primary-subtle)',
          100: 'var(--color-primary-subtle)',
          200: '#d9d4ff',
          400: 'var(--color-primary-soft)',
          500: 'var(--color-primary)',
          600: 'var(--color-primary-hover)',
          700: 'var(--color-primary-press)',
          800: 'var(--color-primary-press)',
          900: '#1c1e54',
        },

        // ━━━ BB-GREEN — LANDING PAGE ONLY (secondary signal) ━━━
        // Scope: app/page.tsx ONLY per DESIGN.md §2.9.
        // Never used on dashboard/admin — validator 5.6 blocks #76b900
        // in app/dashboard/ + components/shared/.
        // Rule: signal colour (live dots, producing, healthy accents),
        // never a button fill. Solar-gold remains the brand / CTA colour.
        'bb-green': {
          DEFAULT: '#76B900',
          50: '#F5FBE5',
          100: '#E7F5BF',
          200: '#CFEA7E',
          400: '#9BD42E',
          500: '#76B900',
          600: '#5F9400',
          700: '#4B7500',
          800: '#375700',
          900: '#273D00',
        },

        // ━━━ WARM NEUTRALS — LANDING PAGE ONLY (per DESIGN.md §2.9) ━━━
        // Mastercard + Pinterest warm canvas — replaces cool slate tones
        // on app/page.tsx. Dashboard/admin stay on cool slate palette.
        warm: {
          cream: '#F8F7F6',      // canvas (Mastercard §2)
          'cream-lifted': '#F3F0EE', // lifted card surface
          divider: '#E0E0D8',    // card border / subtle separator
          text: '#1A1A1A',       // heading near-black (Pinterest)
          body: '#454545',       // body warm mid-gray
          muted: '#7A7A7A',      // captions / metadata (Vodafone #7e7e7e)
        },

        // ━━━ SPC namespace alias — backward-compat ━━━━━━━━━━
        // Legacy class names (bg-spc-green, text-spc-green-dark) still work —
        // they now render as Solar Gold. Gradual migration; new code should
        // use `solar-gold` directly for clarity.
        spc: {
          green: 'var(--color-primary)',
          'green-light': 'var(--color-primary-soft)',
          'green-dark': 'var(--color-primary-hover)',
          'green-tint': 'var(--color-primary-subtle)',
          gold: 'var(--color-primary)',
          'gold-light': 'var(--color-primary-soft)',
          'gold-dark': 'var(--color-primary-hover)',
          'gold-tint': 'var(--color-primary-subtle)',
        },

        // ━━━ SURFACES — white canvas discipline ━━━━━━━━━━━━━
        // Canvas is pure white (Vodafone discipline).
        // Institutional dark is reserved for footer / auth / optional data panels.
        surface: {
          page: 'var(--color-canvas)',
          card: 'var(--color-canvas)',
          subtle: 'var(--color-canvas-soft)',
          hover: '#F1F5F9', // slate-100 — row/item hover
          sidebar: 'var(--color-canvas)',
          'sidebar-hover': 'var(--color-canvas-soft)',
          institutional: '#0F172A', // slate-900 — footer/auth only
          'institutional-alt': '#1E293B', // slate-800
        },

        // ━━━ PROVIDER BADGE ACCENTS (unchanged — per-brand identity) ━━━
        provider: {
          huawei: '#DC2626',
          solis: '#2563EB',
          growatt: '#EA580C',
          sungrow: '#7C3AED',
        },

        // ━━━ LEGACY primary — now maps to solar-gold ━━━━━━━━━━
        // shadcn and other primitives still reference `primary-*`; redefining
        // the ramp keeps them working while delivering the new brand visually.
        // (primary is defined above as a semantic token → CSS vars)

        // ━━━ LEGACY accent / gray (DEPRECATED — use slate-*) ━━━━
        // Kept to avoid breaking un-migrated files; do NOT use in new code.
        accent: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },

      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          '"SF Mono"',
          '"Roboto Mono"',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },

      boxShadow: {
        // Blue-tinted shadows via CSS vars (single source: globals.css).
        card: 'var(--shadow-card)',
        hover: 'var(--shadow-hover)',
        modal: 'var(--shadow-modal)',
        featured: 'var(--shadow-featured)',
        'focus-ring': 'var(--shadow-focus-ring)',
      },

      borderRadius: {
        input: 'var(--radius-input)',
        card: 'var(--radius-card)',
        pill: 'var(--radius-pill)',
      },

      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-slide-in': 'fadeSlideIn 0.5s ease-out forwards',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeSlideIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
