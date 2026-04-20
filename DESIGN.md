# SPC Design System — NVIDIA-Inspired, No Black

> **Single source of truth for all UI in the Solar Performance Cloud platform.**
> Every dashboard page, every admin page, every shared component follows this file.
> If it contradicts this file, it's wrong — fix the code, not the rules.

---

## 0. The One Rule

**NEVER use pure black (`#000000`, `#000`, `rgb(0,0,0)`) anywhere.**
**NEVER use near-black (`#1a1a1a`, `#0a0a0a`, `#111`, `#252525`).**

What the NVIDIA system uses as "black," SPC uses as **Deep Slate** (`#0F172A`).
What the NVIDIA system uses as "near-black card surfaces" (`#1a1a1a`), SPC uses as **Slate 800** (`#1E293B`).

Everything else from the NVIDIA system carries over: the green, the 2px radius, the bold typography, the minimal shadows, the industrial voice.

---

## 1. Visual Theme & Atmosphere

SPC's platform communicates **engineering precision** through design restraint. A high-contrast, data-forward interface that treats every pixel as a status indicator. The interface is built on **Deep Slate** (`#0F172A`) and **White** (`#FFFFFF`), punctuated by **SPC Green** (`#76b900`) — the signature signal color for healthy state, active navigation, and borders.

**Why slate instead of black:** Deep slate reads as professional engineering dark — like the dark mode of Linear, Stripe, Vercel, or Grafana. Pure black reads as amateur "night theme" or consumer dark mode. Slate has warmth (a subtle blue shift) that works with both the green brand color and the data-viz palette (amber, red, blue) without fighting them.

**Key Characteristics:**
- SPC Green (`#76b900`) as pure accent — borders, underlines, active indicators, healthy state. **Never** a full background fill.
- Deep Slate (`#0F172A`) as the "dark" surface — sidebar, dark cards, dark headers. Never pure black.
- White (`#FFFFFF`) as primary card surface on a light Slate 50 (`#F8FAFC`) page.
- Inter font family with system fallbacks — industrial, clean, data-friendly.
- Tight line-heights (1.25 for headings) creating dense, authoritative text blocks.
- Minimal border radius (2px) everywhere — sharp, engineered corners.
- Green-bordered buttons (`2px solid #76b900`) as primary interactive pattern.
- Lucide React icon set (default) for consistency — no emojis, no multi-icon libraries.

---

## 2. Color Palette & Roles

### Primary Brand

| Token | Hex | Usage |
|-------|-----|-------|
| **SPC Green** | `#76b900` | Primary accent — borders, link underlines, CTA outlines, active nav, healthy status. Never a surface fill. |
| **SPC Green Light** | `#bff230` | Bright highlights, hover accents on dark surfaces. |
| **SPC Green Dark** | `#5a8f00` | Hover state for green elements, pressed buttons. |
| **SPC Green Tint** | `#E8F5D0` | Light green surface wash — healthy row highlight, success background callouts. |

### Surface & Background (the no-black replacements)

| Token | Hex | Usage |
|-------|-----|-------|
| **Deep Slate** | `#0F172A` | Sidebar, dark top bars, dark sections. **Replaces black**. |
| **Slate 800** | `#1E293B` | Dark card backgrounds on dark sections, sidebar hover, modals on dark pages. **Replaces `#1a1a1a`**. |
| **Slate 700** | `#334155` | Dark section dividers, subtle dark borders. |
| **Slate 50** | `#F8FAFC` | Page background (subtle warm gray). |
| **Slate 100** | `#F1F5F9` | Alternate rows, disabled surfaces, subtle hover. |
| **Slate 200** | `#E2E8F0` | Default borders, card dividers. |
| **White** | `#FFFFFF` | Card backgrounds on light pages, top bar, inputs. |
| **Hover (light)** | `#F1F5F9` | Row hover on white backgrounds. |
| **Hover (dark)** | `#1E293B` | Row hover on deep slate backgrounds. |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| **Text Primary** | `#0F172A` | Headings, primary content on light surfaces. **Replaces black text**. |
| **Text Secondary** | `#475569` | Body text, descriptions. |
| **Text Muted** | `#94A3B8` | Metadata, timestamps, placeholders. |
| **Text Disabled** | `#CBD5E1` | Disabled text, inactive elements. |
| **Text On Dark** | `#F8FAFC` | Text on Deep Slate / Slate 800 surfaces. |
| **Text On Dark Muted** | `#94A3B8` | Muted text on dark surfaces (sidebar metadata). |

### Status (solar-specific, 5-state + health grades)

Every status color appears in 3 forms: foreground (text/icon), background wash, border.

#### 5-State String Classification (IEC 62446)

| State | Foreground | Background | Border | When |
|-------|-----------|------------|--------|------|
| **Normal / Healthy** | `#76b900` | `#E8F5D0` | `#76b900` at 30% | Health ≥90% |
| **Warning** | `#D97706` | `#FFFBEB` | `#FCD34D` | 25–50% gap, 50–89% health |
| **Critical** | `#DC2626` | `#FEF2F2` | `#FCA5A5` | >50% gap, <50% health |
| **Open Circuit** | `#7C3AED` | `#F5F3FF` | `#C4B5FD` | Voltage present, zero current |
| **Disconnected / Offline** | `#64748B` | `#F1F5F9` | `#CBD5E1` | No data / stale >15 min |

#### Health Grade Colors (for tables, heatmaps, reports)

| Grade | Range | Foreground | Background |
|-------|-------|-----------|------------|
| **Healthy** | ≥90% | `#076600` | `#E8F5D0` |
| **Caution** | 75–89% | `#B45309` | `#FEF3C7` |
| **Warning** | 50–74% | `#D97706` | `#FFFBEB` |
| **Severe** | 25–49% | `#DC2626` | `#FEF2F2` |
| **Dead** | 0–24% | `#991B1B` | `#FEE2E2` |
| **No Data** | null | `#94A3B8` | `#F1F5F9` |

#### Alert Severity Colors

| Severity | Foreground | Background | Border |
|----------|-----------|------------|--------|
| **CRITICAL** | `#DC2626` | `#FEF2F2` | `#DC2626` (left border 3px) |
| **WARNING** | `#D97706` | `#FFFBEB` | `#D97706` (left border 3px) |
| **INFO** | `#0046A4` | `#EFF6FF` | `#0046A4` (left border 3px) |

### Informational (neutral data viz)

| Token | Hex | Usage |
|-------|-----|-------|
| **Info Blue** | `#0046A4` | Info badges, links, secondary highlights. |
| **Info Blue Light** | `#DBEAFE` | Info surface wash. |
| **Amber** | `#F59E0B` | Secondary warm accent, chart highlights. |
| **Purple** | `#7C3AED` | Open circuit status, secondary accents only. |

### Interactive States

| State | Treatment |
|-------|-----------|
| **Link (light bg)** | `#0F172A` text, `2px solid #76b900` underline. Hover: `#3860BE` (blue shift), underline removed. |
| **Link (dark bg)** | `#FFFFFF` text, no underline. Hover: `#76b900`. |
| **Button Hover** | See button specs in §4. Default: fill with accent, text flips. |
| **Focus Ring** | `2px solid #76b900` offset 2px. Never black. |
| **Active / Pressed** | Scale(1), darker shade of accent color. |

### Depth & Shadows (no pure-black shadows)

All shadows use **slate-tinted black** instead of pure black — gives a warmer, cleaner elevation.

| Level | Value |
|-------|-------|
| **Flat (Level 0)** | No shadow. Page bg, inline text. |
| **Card (Level 1)** | `0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)` |
| **Hover (Level 2)** | `0 4px 12px rgba(15, 23, 42, 0.10)` |
| **Modal (Level 3)** | `0 20px 40px rgba(15, 23, 42, 0.15)` |
| **Focus** | `0 0 0 2px #76b900` (glow ring, not shadow) |

---

## 3. Typography Rules

### Font Family

**Primary:** `Inter`, with fallbacks: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.
*(Inter is Tailwind-default. No custom font files needed.)*

**Icon Font:** Lucide React (already in dependencies). Use at `strokeWidth={2}` default, `strokeWidth={1.5}` for decorative, `strokeWidth={2.5}` for emphasis.

**Monospace (data only):** `ui-monospace, 'SF Mono', 'Roboto Mono', 'Menlo', monospace`. Use for currents, voltages, percentages, timestamps, IDs. Never for prose.

### Hierarchy

| Role | Size | Weight | Line Height | Tailwind Class | Use |
|------|------|--------|-------------|----------------|-----|
| **Display Hero** | 36px (2.25rem) | 700 | 1.25 | `text-4xl font-bold leading-tight` | Landing heros, big CTAs |
| **Page Title** | 24px (1.5rem) | 700 | 1.25 | `text-2xl font-bold leading-tight` | Dashboard page titles (H1) |
| **Section Heading** | 18px (1.125rem) | 700 | 1.25 | `text-lg font-bold leading-tight` | Section titles (H2) |
| **Sub-heading** | 16px (1rem) | 700 | 1.25 | `text-base font-bold leading-tight` | Subsections (H3), card titles |
| **Body Large** | 16px | 400 | 1.5 | `text-base` | Primary reading text |
| **Body** | 14px (0.875rem) | 400 | 1.5 | `text-sm` | Default body text in dashboards |
| **Body Bold** | 14px | 600 | 1.5 | `text-sm font-semibold` | Emphasized labels |
| **Caption** | 12px (0.75rem) | 500 | 1.5 | `text-xs font-medium` | Metadata, timestamps |
| **Micro** | 11px (0.6875rem) | 600 | 1.25 | `text-[11px] font-semibold` | Tiny UI text |
| **Badge** | 10px (0.625rem) | 700 | 1 | `text-[10px] font-bold uppercase tracking-wide` | Status badges, pills |
| **Button** | 14px | 700 | 1.25 | `text-sm font-bold leading-tight` | Button labels |
| **Nav Label** | 13px (0.8125rem) | 700 | 1.25 | `text-[13px] font-bold uppercase tracking-wide` | Sidebar nav, tab labels |

### Principles

1. **Bold as default voice** — interactive, structural, and status elements are weight 700. Body paragraphs are 400. Never use 500 for prose.
2. **Tight headings, relaxed body** — heading line-height 1.25, body 1.5. This contrast creates visual hierarchy.
3. **Uppercase for nav and badges only** — never for headings or body text.
4. **Monospace for numbers** — currents, voltages, percentages, counts, timestamps, UUIDs. Use `font-mono` Tailwind class.
5. **No decorative tracking** — letter-spacing normal everywhere except uppercase nav/badges (slight positive tracking).
6. **No font stacks mixing** — Inter for UI, monospace for data. No serif, no script, no display fonts.

---

## 4. Component Stylings

### Buttons

**Primary — Green Border (default for CTAs)**
```
Background: transparent
Text: #0F172A (on light bg) or #FFFFFF (on dark bg)
Padding: 11px 13px (compact) or 10px 16px (standard)
Border: 2px solid #76b900
Radius: 2px
Font: 14px weight 700
Hover: background #76b900, text #FFFFFF
Active: background #5a8f00, text #FFFFFF, scale(1)
Focus: outline 2px #76b900 offset 2px
Disabled: opacity 0.5, cursor not-allowed
```

**Secondary — Slate Border**
```
Background: transparent
Text: #475569
Border: 1px solid #E2E8F0
Radius: 2px
Padding: 10px 16px
Font: 14px weight 600
Hover: background #F1F5F9, border #94A3B8
```

**Destructive — Red Border**
```
Background: transparent
Text: #DC2626
Border: 2px solid #DC2626
Radius: 2px
Hover: background #DC2626, text #FFFFFF
```

**Ghost — No border**
```
Background: transparent
Text: #475569
Padding: 8px 12px
Hover: background #F1F5F9, text #0F172A
```

**Icon-only**
```
Size: 32×32px (standard) or 28×28px (compact)
Padding: 6px
Border: 1px solid transparent
Hover: background #F1F5F9, border #E2E8F0
```

### Cards

**Standard Card (default)**
```
Background: #FFFFFF
Border: 1px solid #E2E8F0
Radius: 2px
Shadow: none (flat default)
Padding: 16px (content-dense) or 24px (spacious)
```

**Dark Card (dark section or sidebar content)**
```
Background: #1E293B (Slate 800)
Border: 1px solid #334155 (Slate 700)
Radius: 2px
Text: #F8FAFC primary, #94A3B8 muted
Padding: 16px
```

**KPI Card**
```
Background: #FFFFFF
Border: 1px solid #E2E8F0
Top accent bar: 2px solid (status color) — green/amber/red based on metric state
Radius: 2px
Padding: 16px
Label: 10px bold uppercase tracking-wide #94A3B8
Value: 28px font-mono weight 700 #0F172A
Subtitle: 12px weight 500 #94A3B8
Icon: 32×32 in muted color box at top-right
```

**Plant Card**
```
Background: #FFFFFF
Border: 1px solid #E2E8F0
Radius: 2px
Padding: 16px
Left accent stripe: 3px solid (health-status color)
Plant name: 14px weight 700 #0F172A
Provider badge: 10px bold uppercase — one of:
  Huawei: bg-red-50 text-red-700 border-red-200
  Solis: bg-blue-50 text-blue-700 border-blue-200
  Growatt: bg-orange-50 text-orange-700 border-orange-200
  Sungrow: bg-purple-50 text-purple-700 border-purple-200
Stats row: 12px weight 500 #94A3B8, values in font-mono 14px weight 600 #0F172A
Hover: border #76b900, cursor pointer, transition 150ms
```

**Inverter Card (live monitoring)**
```
Background: #FFFFFF
Border: 1px solid #E2E8F0
Radius: 2px
Padding: 16px
Device name: 14px weight 700 #0F172A
Model subtitle: 11px weight 500 #94A3B8 (e.g. "Huawei SUN2000-3KTL")
Health bar: 4px tall, stacked segments (green/amber/red), full width
String count + breakdown: 12px weight 600, color by status
```

### Alert Items

```
Container: bg-white, radius 2px, border 1px solid #E2E8F0
Left border accent: 3px solid (severity color — red/amber/blue)
Padding: 12px 16px
Severity badge: 10px bold uppercase px-1.5 py-0.5 rounded-sm
  CRITICAL: bg-red-50 text-red-700 border red-200
  WARNING: bg-amber-50 text-amber-700 border amber-200
  INFO: bg-blue-50 text-blue-700 border blue-200
Plant name: 12px weight 600 #0F172A
Device + String: 12px weight 500 #475569 — "Inverter6 → PV3"
Message: 14px weight 400 #0F172A
Timestamp: 11px weight 500 #94A3B8
Duration: 11px weight 600 #475569
Resolve button: ghost button with green hover — see §4 Buttons
```

### String Health Matrix Cells

```
Cell size: 40×40px minimum, grid 8-column
Radius: 2px
Border: 1px solid (status color)
Background: (status background color — green-50, amber-50, red-50, etc.)
Text: PV# on top, current/gap% below, font-mono weight 600
Hover: scale(1.05), shadow level 1
Tooltip: on hover — Voltage, Current, Power, Gap%, Status
```

### Heatmap Cells (performance analysis)

```
Cell size: 24×24px minimum (dense) or 32×32px (readable)
Radius: 0 (no radius in heatmap — flush grid)
Border: 1px solid #FFFFFF (white separator between cells)
Background: health grade color (see Health Grade table above)
Text: 10px font-mono weight 600 — value % inside cell, foreground contrast with bg
Empty: #F1F5F9 with dash
```

### Tables (data-dense)

```
Container: bg-white, border 1px solid #E2E8F0, radius 2px, overflow-hidden
Header: bg #F8FAFC, 12px bold uppercase tracking-wide #475569
  Border-bottom: 2px solid #E2E8F0
  Padding: 12px 16px
Row: bg #FFFFFF, border-b 1px solid #F1F5F9
Row hover: bg #F8FAFC
Cell: 13px weight 400 #0F172A
  Numbers: font-mono weight 500
  Padding: 10px 16px
Sticky columns: bg #FFFFFF with right border 1px #E2E8F0
Device separator row: border-t 2px solid #E2E8F0
Alt rows (optional): even rows bg #F8FAFC
```

### Badges (status + provider)

```
Base: 10px bold uppercase tracking-wide px-1.5 py-0.5 radius 2px
Solid variant: bg (foreground color), text white
Soft variant (default): bg (bg color at 10-20% opacity), text (foreground), border (border color)
Sizes: Default 10px. Compact 9px with py-0.
```

### Inputs & Selects

```
Background: #FFFFFF
Border: 1px solid #E2E8F0
Radius: 2px
Padding: 10px 12px
Font: 14px weight 400 #0F172A
Placeholder: #94A3B8
Focus: border #76b900, ring 2px #76b900 at 20% opacity
Disabled: bg #F1F5F9, text #94A3B8
Error: border #DC2626, ring 2px #DC2626 at 20%
```

### Filter Pills (date range, category filters)

```
Default: bg #F1F5F9, text #475569, radius 2px, px-3 py-1.5, 12px weight 600
Active: bg #E8F5D0, text #5a8f00, border 1px solid #76b900
Hover: bg #E2E8F0
```

### Modal / Dialog

```
Overlay: rgba(15, 23, 42, 0.5) — slate-tinted, not pure black
Container: bg #FFFFFF, radius 2px, max-w-md or larger
Padding: 24px
Header: border-b 1px solid #E2E8F0, padding-bottom 12px
  Title: 18px weight 700 #0F172A
Body: 14px weight 400 #0F172A, py-4
Footer: border-t 1px solid #E2E8F0, padding-top 12px
  Buttons: right-aligned, gap 8px
```

### Tooltip

```
Background: #0F172A (Deep Slate)
Text: #F8FAFC, 12px weight 500
Padding: 6px 10px
Radius: 2px
Arrow: 4px solid #0F172A
Shadow: Level 2
```

### Tabs

```
Container: border-b 2px solid #E2E8F0
Tab default: 14px weight 600 #475569, px-4 py-3, border-b 2px transparent
Tab hover: text #0F172A, border-b 2px #E2E8F0
Tab active: text #76b900, border-b 2px #76b900, weight 700
```

### Loading States

```
Skeleton: bg #F1F5F9 animate-pulse radius 2px
  Height varies by content: 14px for lines, 32px for values, 80px for cards
Spinner: 
  border 2px solid #E2E8F0
  border-top 2px solid #76b900
  radius 50%, animate-spin
  sizes: 16px (inline), 24px (default), 40px (page)
Shimmer: gradient overlay from #F1F5F9 to #E2E8F0 — used on content cards
```

### Empty States

```
Icon: 48×48px, stroke 1.5, color #CBD5E1
Heading: 14px weight 700 #475569
Description: 12px weight 500 #94A3B8
Center-aligned, py-12
Optional CTA: secondary button below description
```

### Toast / Notification

```
Container: radius 2px, padding 12px 16px, shadow Level 3
Background: #FFFFFF
Border-left: 3px solid (severity color)
Icon: 20×20 (severity color)
Text: 13px weight 500 #0F172A
Dismiss: ghost icon button right-aligned
```

---

## 5. Layout Principles

### Spacing System

**Base unit:** 4px (Tailwind's default rem scale).

| Tailwind | Pixels | Use |
|----------|--------|-----|
| `gap-1` / `p-1` | 4px | Inline gaps, badge padding |
| `gap-2` / `p-2` | 8px | Between related items |
| `gap-3` / `p-3` | 12px | Card padding (compact) |
| `gap-4` / `p-4` | 16px | Card padding (standard), between cards |
| `gap-5` / `p-5` | 20px | Between minor sections |
| `gap-6` / `p-6` | 24px | Page padding, between major sections |
| `gap-8` / `p-8` | 32px | Between page blocks |
| `gap-12` | 48px | Between distinct content zones |

**Rules:**
- **Cards:** 16px padding (`p-4`) default, 24px (`p-6`) for spacious overview cards
- **Page:** 24px padding (`p-6`) on main content area
- **Between cards:** 16px gap (`gap-4`)
- **Dense tables:** 10–12px row padding
- **Section breaks:** 24–32px vertical spacing

### Grid & Container

- **Sidebar:** 240px fixed (`w-60`) left
- **Content max-width:** 1440px (`max-w-[1440px]`) centered on very large screens
- **Card grids:**
  - KPIs: 4 columns (desktop), 2 (tablet), 1 (mobile)
  - Plant cards: 3 columns (desktop), 2 (tablet), 1 (mobile)
  - Data grids: responsive auto-fit with min cell width
- **Gaps:** 16–20px between cards, 24–32px between sections

### Border Radius Scale

| Size | Value | Use |
|------|-------|-----|
| Micro | 1px | Inline spans, tag elements |
| **Standard** | **2px** | **Default for everything — buttons, cards, inputs, badges** |
| Full | 9999px (`rounded-full`) | Avatar images, pulsing dots, chips |

**No `rounded-lg`, `rounded-xl`, `rounded-2xl` anywhere.** This is a solar performance tool, not a consumer app.

### Whitespace Philosophy

- **Purposeful density** — SPC is a data-dense monitoring tool. Whitespace separates concepts, not luxuries.
- **Section rhythm** — Alternate white cards on slate-50 page bg. Dark (deep slate) sections only for sidebar and footer.
- **Card density** — Plant cards and inverter cards sit at 16px gap, catalog feel.
- **Within cards** — Tight vertical rhythm: labels 4px above values, sections 12–16px apart.

---

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| **Flat (L0)** | No shadow | Page bg, inline elements, most content |
| **Subtle (L1)** | `0 1px 3px rgba(15, 23, 42, 0.08)` | Cards, hovering panels |
| **Medium (L2)** | `0 4px 12px rgba(15, 23, 42, 0.10)` | Dropdown menus, popovers, hover-lifted cards |
| **High (L3)** | `0 20px 40px rgba(15, 23, 42, 0.15)` | Modals, dialogs, toast notifications |
| **Green Accent (L2 brand)** | `2px solid #76b900` | Active elements, CTAs, selected state |
| **Focus Ring** | `0 0 0 2px #76b900` glow | Keyboard focus on interactive elements |

**Shadow Philosophy:** Depth in SPC comes from **color contrast and borders**, not simulated light. White cards on slate-50 page; slate-tinted shadows (never pure black) for minimal elevation. No glassmorphism. No blur effects. Clarity over atmosphere.

---

## 7. Icon System

**Library:** Lucide React (installed via `lucide-react`).

### Sizes

| Context | Size | Tailwind |
|---------|------|----------|
| Inline with text | 14px | `h-3.5 w-3.5` |
| Button icon | 16px | `h-4 w-4` |
| Nav item | 18px | `h-[18px] w-[18px]` |
| Card header icon | 20px | `h-5 w-5` |
| Feature icon | 24px | `h-6 w-6` |
| Empty state / large | 48px | `h-12 w-12` |

### Stroke Widths

- `strokeWidth={1.5}` — decorative, large feature icons
- `strokeWidth={2}` — **default for all UI icons**
- `strokeWidth={2.5}` — emphasis / bold active state

### Icon + Text Gap

Always 6–8px (`gap-1.5` or `gap-2`). Never less than 6px.

### Icon Colors

Use currentColor by default — let the text color of the parent drive icon color. Explicit colors only for status icons (alert severity, health state).

---

## 8. Status Color Enforcement

**All status colors come from ONE place** — the `classifyRealtime()` and `bucketHealthScore()` functions in `lib/string-health.ts`. UI components receive the status string/enum and map it to colors via a **single lookup table** (see §11 Agent Prompt Guide).

**Never** hardcode status colors in individual components. A component that displays health should receive the status and look up the color, not decide the color itself.

---

## 9. Page Templates

### Dashboard Home (`/dashboard`)

```
┌───────────────────────────────────────────┐
│ Page Title (24px bold)                    │
├───────────────────────────────────────────┤
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐                      │
│ │K1│ │K2│ │K3│ │K4│   4 KPI cards        │
│ └──┘ └──┘ └──┘ └──┘                      │
├───────────────────────────────────────────┤
│ Section: Your Plants                      │
│ ┌────┐ ┌────┐ ┌────┐                     │
│ │ P1 │ │ P2 │ │ P3 │   Plant cards grid  │
│ └────┘ └────┘ └────┘                     │
├───────────────────────────────────────────┤
│ Section: Recent Alerts                    │
│ [Alert] [Alert] [Alert]  [View All →]    │
└───────────────────────────────────────────┘
```

### Plant Detail (`/dashboard/plants/[code]`)

```
┌───────────────────────────────────────────┐
│ Plant Header (name, capacity, status)     │
├───────────────────────────────────────────┤
│ [Live] [Alerts] [Monthly] ← Tabs          │
├───────────────────────────────────────────┤
│ String Summary bar (X OK / Y Warn / Z Crit)│
├───────────────────────────────────────────┤
│ Inverter Cards (stacked, each w/ matrix)  │
│ ┌────────────────────────────┐            │
│ │ INV1 - Huawei SUN2000      │            │
│ │ [Health bar] [Stats]       │            │
│ │ [String matrix 8x]         │            │
│ └────────────────────────────┘            │
└───────────────────────────────────────────┘
```

### Analysis (`/dashboard/analysis` + `/admin/analysis`)

```
┌───────────────────────────────────────────┐
│ Tabs: [String Level] [Inverter Level]     │
│ Filters: [Plant ▾] [Inverter ▾] [Range]   │
├───────────────────────────────────────────┤
│ Summary bar: 284 strings, avg 87% health  │
├───────────────────────────────────────────┤
│ Color guide (horizontal legend)           │
├───────────────────────────────────────────┤
│ Heatmap table: rows=strings, cols=dates   │
│ (sticky left cols, scrollable right)      │
└───────────────────────────────────────────┘
```

### Alerts (`/dashboard/alerts`)

```
┌───────────────────────────────────────────┐
│ Filters: [All][CRIT][WARN][INFO]          │
│          [Plant ▾] [Status ▾] [Date]      │
├───────────────────────────────────────────┤
│ Alert list (paginated, 20 per page)       │
│ [Alert item] [Alert item] ...             │
├───────────────────────────────────────────┤
│ [← Prev]  Page 1 of 5  [Next →]          │
└───────────────────────────────────────────┘
```

---

## 10. Layout Components

### Sidebar (unified — same for dashboard AND admin)

```
Position: fixed left, w-60 (240px), h-screen
Background: #0F172A (Deep Slate)
Border-right: 1px solid #1E293B

Logo section: h-14, border-b 1px solid #1E293B, px-4
  SPC wordmark + small sun icon, color #FFFFFF + #76b900 accent

Nav items: px-3 py-2.5, 13px bold uppercase tracking-wide
  Default: text-[#94A3B8]
  Hover: bg-[#1E293B], text-[#F8FAFC]
  Active: bg-[#76b900]/10, text-[#76b900], border-l-2 border-[#76b900]
  Icon: h-[18px] w-[18px], mr-3

Section dividers: border-t 1px solid #1E293B, my-3

User section (bottom): border-t 1px solid #1E293B, px-4 py-4
  Avatar: 32×32 rounded-full
  Name: 13px weight 600 #F8FAFC
  Role: 11px weight 500 #94A3B8
```

### Top Bar

```
Position: fixed top, h-14, left-60, right-0
Background: #FFFFFF
Border-bottom: 1px solid #E2E8F0
Padding: 0 24px
Layout: flex justify-between items-center

Left: page title (16px weight 700 #0F172A)
Right: [org switcher] [notifications] [avatar dropdown]
  Gap: 12px between each
```

### Page Wrapper

```
Background: #F8FAFC (page bg)
Padding: 24px
Min-height: calc(100vh - 56px)

Loading state: centered spinner, no dark skeleton overlay
Error state: card with red left border, error icon, message, retry CTA
```

---

## 11. Responsive Behavior

### Breakpoints (Tailwind defaults)

| Name | Width | Tailwind | Key Changes |
|------|-------|----------|-------------|
| Mobile | <640px | (default) | Single column, hamburger nav, card grids collapse |
| SM | 640px+ | `sm:` | 2-column card grids begin |
| MD | 768px+ | `md:` | 3-column card grids |
| LG | 1024px+ | `lg:` | Sidebar visible, full layout |
| XL | 1280px+ | `xl:` | 4-column KPIs, max layout |
| 2XL | 1536px+ | `2xl:` | Maximum content width centered |

### Mobile Collapsing

- Sidebar: hidden at <1024px, replaced by hamburger menu opening full-screen nav
- KPI cards: 4 → 2 → 1 column
- Plant cards: 3 → 2 → 1 column
- Data tables: horizontal scroll preserved (never shrink data cells)
- Page padding: 24px → 16px on mobile

### Typography Scaling

- Display 36px → 28px on mobile
- Page Title 24px → 20px on mobile
- Body 14px stays 14px (readability)
- Button text stays 14px

---

## 12. Rules (ten commandments)

1. **No pure black. No near-black.** `#000`, `#0a0a0a`, `#111`, `#1a1a1a`, `#252525` are **forbidden**. Use `#0F172A` (Deep Slate) and `#1E293B` (Slate 800) instead.
2. **Green is a signal, not a surface.** `#76b900` is used for borders, underlines, text accents, active states, badges, chart highlights. **Never** as a large background fill except in tiny badges and 10% tints (`#76b900/10`).
3. **2px radius everywhere.** Exceptions: avatars get `rounded-full`, heatmap cells get `rounded-none`. Nothing else.
4. **Bold for headings and labels (700), semibold for emphasized body (600), regular for prose (400).** Weight 500 is for captions only.
5. **Dense but not cramped.** Tight gaps between related items (8px), breathing room between sections (24px).
6. **Borders over shadows.** Use 1px borders for hierarchy; use shadows only for lifted elements (Level 2+).
7. **Monospace for data.** Currents, voltages, percentages, timestamps, IDs all use `font-mono`.
8. **Uppercase for badges and nav only.** Not for headings, not for body text, not for buttons.
9. **Same status colors platform-wide.** Green/amber/red/gray/purple from the status table. No inline Tailwind color class (`green-500`, `amber-500`, etc.) in a component's JSX — always use the centralized status lookup.
10. **One theme — unified dashboard + admin.** No role-based theme switching. Same sidebar, same cards, same colors.

---

## 13. Agent Prompt Guide

### Quick Color Reference (paste into prompts)

```
Brand accent:        #76b900  (SPC Green — borders, underlines, active, healthy)
Page background:     #F8FAFC  (Slate 50)
Card background:     #FFFFFF  (White)
Sidebar / dark surface: #0F172A  (Deep Slate — REPLACES black)
Dark card / sidebar hover: #1E293B  (Slate 800 — REPLACES #1a1a1a)
Primary text:        #0F172A  (on light bg — REPLACES black text)
Secondary text:      #475569
Muted text:          #94A3B8
Default border:      #E2E8F0
Subtle border:       #F1F5F9
Link hover:          #3860BE
Button hover fill:   #76b900 (text flips to white)

STATUS COLORS (single lookup):
healthy:     text #076600 / bg #E8F5D0 / border #76b900
caution:     text #B45309 / bg #FEF3C7 / border #F59E0B
warning:     text #D97706 / bg #FFFBEB / border #FCD34D
severe:      text #DC2626 / bg #FEF2F2 / border #FCA5A5
dead:        text #991B1B / bg #FEE2E2 / border #DC2626
open-circuit: text #7C3AED / bg #F5F3FF / border #C4B5FD
offline:     text #64748B / bg #F1F5F9 / border #CBD5E1
info:        text #0046A4 / bg #EFF6FF / border #BFDBFE
```

### Example Component Prompts

- **KPI Card:** "White card, 1px solid #E2E8F0 border, 2px radius, 16px padding. Top accent bar 2px (status color). Label 10px bold uppercase tracking-wide #94A3B8. Value 28px font-mono bold #0F172A. Subtitle 12px medium #94A3B8."

- **Plant Card:** "White card, 1px solid #E2E8F0, 2px radius, 16px padding. Left accent 3px stripe (health-status color). Plant name 14px bold #0F172A. Provider badge top-right (brand color per Huawei/Solis/etc). Stats row at bottom: 12px medium #94A3B8 labels, font-mono 14px semibold #0F172A values. Hover: border #76b900."

- **Sidebar Item (active):** "px-3 py-2.5, 13px bold uppercase. bg-[#76b900]/10 text-[#76b900] border-l-2 border-[#76b900]. Icon 18×18 at left with 12px gap to text."

- **Alert Item:** "White container, 2px radius, 1px border #E2E8F0. Left border 3px solid (severity color red/amber/blue). 12px 16px padding. Severity badge 10px bold uppercase. Plant name 12px semibold. Message 14px regular. Timestamp 11px medium #94A3B8. Ghost resolve button right-aligned."

- **Data Table:** "Container white, 1px border #E2E8F0, 2px radius, overflow-hidden. Header bg #F8FAFC, 12px bold uppercase #475569, 2px border-bottom. Rows bg white, 1px border-bottom #F1F5F9. Hover bg #F8FAFC. Cells 13px regular #0F172A, numbers in font-mono."

### Iteration Rules

1. **Replace black:** every instance of `#000`, `#000000`, or `bg-black` → `#0F172A` or Slate class equivalent.
2. **Replace #1a1a1a:** every instance → `#1E293B` (`bg-slate-800` or the design token).
3. **Status colors come from a central map**, not individual components.
4. **Never raw Tailwind color classes** (`green-500`, `amber-600`, `red-700`) in a health/status context — use the status lookup.
5. **All buttons are outlined (green border) by default.** Filled buttons only on hover/active/pressed states.
6. **Weight 700 is dominant.** All interactive elements bold.
7. **2px radius default.** Anywhere you see `rounded-lg` / `rounded-md` / `rounded-xl` — change to `rounded-sm`.
8. **Tight line-heights for headings (1.25), relaxed for body (1.5).**

### Forbidden Patterns — what to rip out on sight

- Any `#000`, `#000000`, `#0a0a0a`, `#111`, `#1a1a1a`, `#252525`, `bg-black`, `text-black` in the codebase.
- Any `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl` — replace with `rounded-sm`.
- Any `bg-gradient-to-*` with black stops — replace stops with slate.
- Any raw `green-*`, `emerald-*`, `amber-*`, `red-*` Tailwind class applied to health or alert status — replace with centralized status lookup.
- Any component that branches theme on `role === 'admin'` vs `role === 'user'` — unify to one theme.
- Drop shadows using `rgba(0,0,0,0.x)` — replace with `rgba(15,23,42,0.x)` (slate-tinted).

---

## 14. Migration Mapping — old tokens → new tokens

When refactoring existing code, use this direct replacement table:

| Old | New |
|-----|-----|
| `#000000`, `#000` | `#0F172A` |
| `#1a1a1a`, `bg-[#1a1a1a]` | `#1E293B`, `bg-slate-800` |
| `#0a0a0a`, `text-[#0a0a0a]` | `#0F172A`, `text-slate-900` |
| `#252525` (loading skeleton) | `#F1F5F9` (light skeleton) or `#1E293B` (dark context) |
| `#333` (dark borders) | `#334155` (slate-700) |
| `#5e5e5e` (border strong) | `#CBD5E1` (slate-300) |
| `#898989` (text muted) | `#94A3B8` (slate-400) |
| `#a7a7a7` (text muted on dark) | `#94A3B8` |
| `#525252` (text secondary) | `#475569` (slate-600) |
| `#f5f5f5` (page bg) | `#F8FAFC` (slate-50) |
| `#e5e5e5` (border default) | `#E2E8F0` (slate-200) |
| `#f0f0f0` (hover bg) | `#F1F5F9` (slate-100) |
| `#ef9100` (warning orange) | `#D97706` (amber-600) |
| `#e52020` (critical red) | `#DC2626` (red-600) |
| `#5e9ed6` (info blue) | `#0046A4` (info blue — standardized) |
| `emerald-500` / `green-500` (status) | status lookup for healthy |
| `amber-500` / `yellow-600` (status) | status lookup for warning |
| `red-500` / `red-600` (status) | status lookup for critical/severe |
| `rounded-lg`, `rounded-md`, `rounded-xl` | `rounded-sm` (2px) |
| `rgba(0,0,0,0.3)` shadow | `rgba(15,23,42,0.08)` L1 or `(15,23,42,0.10)` L2 |

---

**End of DESIGN.md.**
**This file is the single source of truth. If code disagrees, fix the code.**
