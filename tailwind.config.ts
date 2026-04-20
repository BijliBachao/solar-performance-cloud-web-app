import type { Config } from 'tailwindcss'

/**
 * SPC Design System — Tailwind Tokens
 *
 * Single source: DESIGN.md at the project root.
 * See `lib/design-tokens.ts` for status/provider/health lookups.
 *
 * Rule: no pure black (#000) or near-black (#1a1a1a) anywhere.
 * Slate 900 (#0F172A) replaces black. Slate 800 (#1E293B) replaces #1a1a1a.
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
        // ━━━ SPC BRAND (canonical) ━━━━━━━━━━━━━━━━━━━━━━━━
        // Used via `bg-spc-green`, `text-spc-green`, `border-spc-green`.
        // Brand green is a SIGNAL color — borders, accents, active state, underlines.
        // NEVER used as a large surface fill.
        spc: {
          green: '#76b900',
          'green-light': '#bff230',
          'green-dark': '#5a8f00',
          'green-tint': '#E8F5D0',
        },

        // ━━━ SURFACE / BACKGROUND ━━━━━━━━━━━━━━━━━━━━━━━━
        // `bg-page` = page background (slate-50).
        // `bg-sidebar` = deep slate (REPLACES black).
        // `bg-sidebar-hover` / `bg-dark-card` = slate-800 (REPLACES #1a1a1a).
        surface: {
          page: '#F8FAFC',
          card: '#FFFFFF',
          subtle: '#F8FAFC',
          hover: '#F1F5F9',
          sidebar: '#0F172A',
          'sidebar-hover': '#1E293B',
          'dark-card': '#1E293B',
        },

        // ━━━ PROVIDER BADGE ACCENTS ━━━━━━━━━━━━━━━━━━━━━━
        // Per-brand badge color pairs. Used via `lib/design-tokens.ts` lookup.
        provider: {
          huawei: '#DC2626',
          solis: '#2563EB',
          growatt: '#EA580C',
          sungrow: '#7C3AED',
        },

        // ━━━ LEGACY PRIMARY (orange — DEPRECATED) ━━━━━━━━━━
        // `primary-*` currently used by shadcn UI primitives (button, badge, input,
        // select, tabs, dialog) for focus rings + filled buttons.
        // TODO Phase 2: migrate those primitives to use `spc-green` and remove this.
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          900: '#7c2d12',
        },

        // ━━━ LEGACY ACCENT (green — unused, DEPRECATED) ━━━━
        // No files reference `accent-*`. Keeping ramp for any future migration.
        accent: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },

        // ━━━ LEGACY GRAY (DEPRECATED — use slate-* instead) ━━━
        // Tailwind's default `slate-*` ramp (#F8FAFC..#0F172A) is the SPC neutral scale.
        // This block is kept ONLY to avoid breaking existing `gray-50..gray-900` usage
        // in components/pages that haven't been migrated yet. Do NOT use in new code.
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
        card: '0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
        hover: '0 4px 12px rgba(15, 23, 42, 0.10)',
        modal: '0 20px 40px rgba(15, 23, 42, 0.15)',
        'focus-ring': '0 0 0 2px #76b900',
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
