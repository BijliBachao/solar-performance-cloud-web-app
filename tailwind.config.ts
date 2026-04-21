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
        'solar-gold': {
          DEFAULT: '#F59E0B',
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },

        // ━━━ SPC namespace alias — backward-compat ━━━━━━━━━━
        // Legacy class names (bg-spc-green, text-spc-green-dark) still work —
        // they now render as Solar Gold. Gradual migration; new code should
        // use `solar-gold` directly for clarity.
        spc: {
          green: '#F59E0B',
          'green-light': '#FBBF24',
          'green-dark': '#D97706',
          'green-tint': '#FEF3C7',
          // Forward-compatible aliases
          gold: '#F59E0B',
          'gold-light': '#FBBF24',
          'gold-dark': '#D97706',
          'gold-tint': '#FEF3C7',
        },

        // ━━━ SURFACES — white canvas discipline ━━━━━━━━━━━━━
        // Canvas is pure white (Vodafone discipline).
        // Institutional dark is reserved for footer / auth / optional data panels.
        surface: {
          page: '#FFFFFF',
          card: '#FFFFFF',
          subtle: '#F8FAFC', // slate-50 — alt rows, disabled surfaces
          hover: '#F1F5F9', // slate-100 — row/item hover
          sidebar: '#FFFFFF', // white sidebar (Vodafone discipline)
          'sidebar-hover': '#F8FAFC',
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
        primary: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          900: '#78350F',
        },

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
        // Slate-tinted shadows — never pure black.
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.02)',
        hover: '0 4px 12px rgba(15, 23, 42, 0.08)',
        modal: '0 20px 40px rgba(15, 23, 42, 0.15)',
        featured:
          '0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 30px rgba(15, 23, 42, 0.08)',
        'focus-ring': '0 0 0 3px rgba(245, 158, 11, 0.25)',
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
