# SPC Dashboard Design System

> Adapted from NVIDIA design principles. Light theme only. Applied to `/dashboard/*` (customer-facing pages).

---

## 1. Theme: Light Industrial

NVIDIA's industrial precision on a clean white foundation. No dark mode. The NVIDIA Green (`#76b900`) is a **signal color** — borders, accents, active states — never a background fill.

**Core feel:** Clean, confident, data-dense. A solar monitoring tool that looks like it was built by engineers, not designers. Every pixel earns its space.

---

## 2. Color Palette

### Brand
| Token | Hex | Usage |
|-------|-----|-------|
| `--spc-green` | `#76b900` | Primary accent — active sidebar, borders, badges, links, CTA outlines |
| `--spc-green-light` | `#e8f5d0` | Green tint surface — success backgrounds, active row highlight |
| `--spc-green-dark` | `#5a8f00` | Hover state for green elements |

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-page` | `#f5f5f5` | Page background (light gray, not pure white) |
| `--bg-card` | `#ffffff` | Card/panel backgrounds |
| `--bg-sidebar` | `#1a1a1a` | Sidebar only — dark for contrast |
| `--bg-topbar` | `#ffffff` | Top bar — white with bottom border |
| `--bg-hover` | `#f0f0f0` | Row/item hover |
| `--bg-muted` | `#fafafa` | Subtle alternate row, disabled surfaces |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#0a0a0a` | Headings, primary content |
| `--text-secondary` | `#525252` | Body text, descriptions |
| `--text-muted` | `#898989` | Metadata, timestamps, placeholders |
| `--text-on-dark` | `#ffffff` | Text on sidebar (dark bg) |
| `--text-on-dark-muted` | `#a7a7a7` | Muted text on sidebar |

### Status
| Token | Hex | Usage |
|-------|-----|-------|
| `--status-healthy` | `#76b900` | Healthy/online badge, score ≥90% |
| `--status-warning` | `#ef9100` | Warning badge, score 50-89% |
| `--status-critical` | `#e52020` | Critical badge, score <50% |
| `--status-offline` | `#898989` | Offline/no data |
| `--status-info` | `#0046a4` | Info alerts, links |

### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| `--border-default` | `#e5e5e5` | Card borders, dividers |
| `--border-strong` | `#5e5e5e` | Table headers, section dividers |
| `--border-accent` | `#76b900` | Active/selected items, focus state |

---

## 3. Typography

**Font:** System stack — `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
(We use Tailwind defaults — no custom font needed. The industrial feel comes from weight and spacing, not a custom typeface.)

### Scale

| Role | Size | Weight | Line Height | Tailwind Class |
|------|------|--------|-------------|----------------|
| Page Title | 20px | 700 | 1.25 | `text-xl font-bold leading-tight` |
| Section Heading | 16px | 700 | 1.25 | `text-base font-bold leading-tight` |
| Card Title | 14px | 700 | 1.25 | `text-sm font-bold leading-tight` |
| Body | 14px | 400 | 1.5 | `text-sm` |
| Body Bold | 14px | 600 | 1.5 | `text-sm font-semibold` |
| Caption | 12px | 500 | 1.5 | `text-xs font-medium` |
| Micro | 11px | 600 | 1.25 | `text-[11px] font-semibold` |
| Badge | 10px | 700 | 1 | `text-[10px] font-bold uppercase tracking-wide` |

### Principles
- **Bold headings, regular body** — never use 400 weight for headings
- **Tight heading line-height** (1.25) vs relaxed body (1.5)
- **Uppercase for badges and status labels only** — not for headings
- **Numbers in tabular/monospace** — `font-mono` for scores, percentages, currents

---

## 4. Spacing

**Base unit:** 4px

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Inline gaps, badge padding |
| `sm` | 8px | Between related items |
| `md` | 12px | Card padding, section gaps |
| `lg` | 16px | Between sections |
| `xl` | 24px | Page padding, major sections |
| `2xl` | 32px | Between page blocks |

**Cards:** 16px padding (p-4)
**Page:** 24px padding (p-6)
**Between cards:** 16px gap (gap-4)

---

## 5. Border Radius

| Element | Radius | Tailwind |
|---------|--------|----------|
| Buttons | 2px | `rounded-sm` |
| Cards | 4px | `rounded` |
| Badges | 2px | `rounded-sm` |
| Inputs/Selects | 4px | `rounded` |
| Avatars | 50% | `rounded-full` |
| Everything else | 4px max | `rounded` |

**No large border radius.** No `rounded-xl`, no `rounded-2xl`. This is industrial, not friendly.

---

## 6. Shadows

| Level | Shadow | Usage |
|-------|--------|-------|
| None | — | Most elements (flat is default) |
| Card | `0 1px 3px rgba(0,0,0,0.08)` | Cards, dropdowns |
| Elevated | `0 2px 8px rgba(0,0,0,0.12)` | Modals, popovers |

**Minimal shadows.** Depth comes from borders and background contrast, not drop shadows.

---

## 7. Component Specs

### Sidebar (Dark)
```
Background: #1a1a1a
Width: 240px (fixed)
Logo section: h-14, border-b border-[#333]
Nav items: 
  Default: text-[#a7a7a7], px-3 py-2, text-sm font-semibold
  Hover: bg-[#252525] text-white
  Active: bg-[#76b900]/10 text-[#76b900] border-l-2 border-[#76b900]
Icon: w-5 h-5, mr-3
Section dividers: border-t border-[#333] my-2
```

### Top Bar
```
Background: #ffffff
Height: 56px (h-14)
Border: border-b border-[#e5e5e5]
Title: text-base font-bold text-[#0a0a0a]
Right side: user avatar + org name in text-xs text-[#898989]
```

### KPI Cards
```
Background: #ffffff
Border: 1px solid #e5e5e5
Radius: 4px
Padding: 16px
Title: text-xs font-semibold uppercase tracking-wide text-[#898989]
Value: text-2xl font-bold text-[#0a0a0a]
Subtitle: text-xs text-[#898989]
Icon: w-8 h-8 in muted green bg (#e8f5d0) rounded-sm
Accent bar: 2px top border in status color (green/yellow/red)
```

### Plant Cards
```
Background: #ffffff
Border: 1px solid #e5e5e5
Radius: 4px
Padding: 16px
Plant name: text-sm font-bold text-[#0a0a0a]
Provider badge: text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm
  Huawei: bg-red-50 text-red-700 border border-red-200
  Solis: bg-blue-50 text-blue-700 border border-blue-200
  Growatt: bg-orange-50 text-orange-700 border border-orange-200
  Sungrow: bg-purple-50 text-purple-700 border border-purple-200
Health badge: 
  Healthy: bg-[#e8f5d0] text-[#5a8f00] border border-[#76b900]/30
  Faulty: bg-red-50 text-red-700 border border-red-200
  Disconnected: bg-gray-100 text-gray-500 border border-gray-200
Stats row: text-xs text-[#898989], values in font-semibold text-[#0a0a0a]
Hover: border-[#76b900] transition
Click: navigates to /dashboard/plants/[id]
```

### Alert Items
```
Border-left: 3px solid (severity color)
Background: white (not colored)
Padding: 12px 16px
Severity badge: text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm
  CRITICAL: bg-red-50 text-[#e52020] border border-red-200
  WARNING: bg-amber-50 text-[#ef9100] border border-amber-200
  INFO: bg-blue-50 text-[#0046a4] border border-blue-200
Plant name: text-xs font-semibold text-[#0a0a0a]
Device + String: text-xs text-[#525252] — "Inverter6 → PV3"
Message: text-sm text-[#0a0a0a]
Time: text-[11px] text-[#898989]
Duration: text-[11px] font-semibold text-[#525252]
Resolve button: text-xs font-semibold text-[#76b900] border border-[#76b900] rounded-sm px-2 py-1
  Hover: bg-[#76b900] text-white
```

### Buttons
```
Primary (Green outline):
  bg-transparent border-2 border-[#76b900] text-[#76b900] rounded-sm
  px-4 py-2 text-sm font-bold
  Hover: bg-[#76b900] text-white
  Active: bg-[#5a8f00] text-white

Secondary:
  bg-transparent border border-[#e5e5e5] text-[#525252] rounded-sm
  px-4 py-2 text-sm font-semibold
  Hover: bg-[#f5f5f5] border-[#898989]

Destructive:
  bg-transparent border border-[#e52020] text-[#e52020] rounded-sm
  Hover: bg-[#e52020] text-white

Ghost:
  bg-transparent text-[#898989] rounded-sm
  Hover: bg-[#f5f5f5] text-[#525252]

Disabled:
  opacity-50 cursor-not-allowed
```

### Tables (Analysis)
```
Header: bg-[#f5f5f5] text-xs font-bold uppercase tracking-wide text-[#898989]
  Border-bottom: 2px solid #e5e5e5
Row: bg-white border-b border-[#f0f0f0]
Row hover: bg-[#fafafa]
Cell text: text-xs font-mono (for numbers)
Sticky columns: bg-white with right border
Device separator: border-t-2 border-[#e5e5e5]
Active section: normal styling
Inactive section banner: bg-amber-50 border-t-2 border-amber-300 text-amber-700
Unused section banner: bg-[#fafafa] border-t-2 border-[#e5e5e5] text-[#898989]
```

### Filters & Inputs
```
Select/Input:
  bg-white border border-[#e5e5e5] rounded text-sm
  px-3 py-2
  Focus: border-[#76b900] ring-1 ring-[#76b900]/20
  
Filter pills:
  Default: bg-[#f5f5f5] text-[#525252] rounded-sm px-3 py-1.5 text-xs font-semibold
  Active: bg-[#76b900]/10 text-[#76b900] border border-[#76b900]/30
  Hover: bg-[#f0f0f0]

Date presets (7D, 14D, 30D):
  Same as filter pills
```

### Empty States
```
Icon: w-10 h-10 text-[#e5e5e5]
Heading: text-sm font-bold text-[#525252]
Description: text-xs text-[#898989]
Center-aligned, py-12
```

### Loading
```
Skeleton: bg-[#f0f0f0] animate-pulse rounded
Spinner: border-2 border-[#76b900] border-t-transparent rounded-full animate-spin
```

---

## 8. Page Layouts

### Sidebar + Content
```
Sidebar: fixed left, w-60, h-screen, bg-[#1a1a1a]
Content: ml-60
  Top bar: fixed top, h-14, bg-white, border-b
  Main: pt-14, p-6, bg-[#f5f5f5]
```

### Dashboard Overview (`/dashboard`)
```
┌─────────────────────────────────────────────┐
│ KPI Cards (4 across)                         │
│ [Plants] [Alerts] [Health] [Last Update]     │
├─────────────────────────────────────────────┤
│ Your Plants (grid, 3 across)                 │
│ [Plant Card] [Plant Card] [Plant Card]       │
├─────────────────────────────────────────────┤
│ Recent Alerts (list, max 5)                  │
│ [Alert] [Alert] [Alert]    [View All →]      │
└─────────────────────────────────────────────┘
```

### Alerts (`/dashboard/alerts`)
```
┌─────────────────────────────────────────────┐
│ Filters: [All|CRITICAL|WARNING|INFO]         │
│          [Plant ▼] [Resolved ▼] [Date range] │
├─────────────────────────────────────────────┤
│ Alert list with pagination                   │
│ [Alert with plant name + device + string]    │
│ [Alert with resolve button]                  │
├─────────────────────────────────────────────┤
│ [← Previous]  Page 1 of 5  [Next →]         │
└─────────────────────────────────────────────┘
```

### Analysis (`/dashboard/analysis`)
```
┌─────────────────────────────────────────────┐
│ Tabs: [String Level | Inverter Level]        │
│ Filters: [Plant ▼] [Inverter ▼] [Date] [Go] │
├─────────────────────────────────────────────┤
│ Summary bar                                  │
├─────────────────────────────────────────────┤
│ Column + Color guide                         │
├─────────────────────────────────────────────┤
│ Data table (sticky headers, Perf/Avail cols) │
└─────────────────────────────────────────────┘
```

---

## 9. Rules

1. **Green is a signal, not a surface.** Never use `#76b900` as a full background. Use it for: borders, text accents, active states, badges, chart highlights.
2. **2px radius everywhere.** Exception: cards get 4px. No large radius.
3. **Bold for headings and labels, regular for body.** Weight 600-700 for anything interactive or structural.
4. **Dense but not cramped.** Tight gaps between related items (8px), breathing room between sections (24px).
5. **Borders over shadows.** Use 1px borders for hierarchy, not drop shadows.
6. **Monospace for data.** All percentages, currents, voltages, counts use `font-mono`.
7. **Uppercase for badges and status labels only.** Not for headings or nav items (except sidebar if needed).
8. **White cards on gray page.** Cards are `#ffffff` on `#f5f5f5` page background — subtle contrast.
9. **No decorative elements.** No gradients, no rounded blobs, no illustrations. Data speaks.
10. **Consistent status colors across all pages.** Same green/amber/red/gray everywhere.
