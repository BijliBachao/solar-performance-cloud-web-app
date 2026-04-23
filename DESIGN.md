# SPC Design System — "Solar Corporate"

> **Single source of truth for all SPC UI.** Every page, every component, every chart follows this file. If code contradicts this spec, **fix the code, not the rules.**
>
> **Version:** v3 — Solar Corporate (supersedes v1 NVIDIA-industrial, v2 unnamed slate).
> **Paired files:** `tailwind.config.ts` · `app/globals.css` · `lib/design-tokens.ts`

---

## 0. The Spirit of the System

SPC is a **data-dense solar monitoring platform for commercial solar owners in Pakistan**. The design must communicate:

1. **Corporate trust** — this is a platform for a ₨50M+ solar investment, not a consumer app
2. **Warm energy** — solar = sunlight = warmth (gold, not cold-blue)
3. **White clarity** — pure white canvas, institutional discipline, editorial calm
4. **Colorful status** — at-a-glance state (healthy/warning/critical/offline) through consistent color
5. **Data precision** — tabular numerals, crisp edges, charts that read like financial reports

### Inspirations — what we take, what we leave

The system synthesizes disciplines from several reference systems:

| From | We take | We leave |
|---|---|---|
| **Vodafone** | Pure white canvas, flat surfaces, borders-only delineation, institutional dark panels for data zones, 2-tier button system | Single-color brand (we need multiple accent colors), monumental uppercase display |
| **Stripe** | Conservative 4–8px radius, tabular numerals for data, navy-not-black headings, multi-layer blue-tinted card shadows for featured surfaces | Weight-300 whisper headlines (we need more assertive 600/700), purple brand color |
| **Wise** | Named color semantics, white canvas, green = positive (we use emerald) | Pill-shaped everything, weight-900 billboard display, scale animations |
| **Mastercard** | Three-surface rhythm (canvas → lifted → institutional dark), eyebrow labels with accent dot | Warm cream canvas (we stay white), extreme 40px+ radii, editorial orbital motifs |
| **Clay** | Named color palette approach, warm accent vocabulary (not just Tailwind names) | Consumer-playful hover rotations, hard-offset shadows, craft/artisanal feel |

**SPC is the corporate institutional cousin of Stripe, with the editorial discipline of Vodafone, warmed by a solar-gold brand.**

---

## 1. The Non-Negotiable Rules

These five rules win over any other instruction. If something conflicts, these rules are right.

1. **No pure black anywhere.** `#000000`, `rgb(0,0,0)`, `#0a0a0a`, `#111`, `#1a1a1a`, `#252525` are **forbidden**. Use `#0F172A` (slate-900) where dark is needed.
2. **Pure white canvas.** Page background is `#FFFFFF`. Cards sit on white, separated by borders, not shadows. No warm cream, no subtle gray-50.
3. **Solar Gold is the brand.** `#F59E0B` is SPC's signature — primary CTAs, active states, focus rings, key accents. Never replaced, never tinted beyond its ramp.
4. **Status colors come from ONE lookup.** Every green/amber/red/violet/blue status instance flows through `STATUS_STYLES` in `lib/design-tokens.ts`. No inline `text-emerald-*` / `bg-red-*` for status.
5. **Monospace for numbers.** Every current, voltage, percentage, timestamp, count, ID uses `font-mono`. Numbers NEVER sit in Inter.

---

## 2. Color System

### 2.1 Brand — Solar Gold

SPC's identity color. Warm, energetic, optimistic. Used deliberately as the single "branded" color in the UI.

| Token | Hex | Usage |
|---|---|---|
| `--solar-gold-50` | `#FFFBEB` | Subtle gold tint — hover wash, active row |
| `--solar-gold-100` | `#FEF3C7` | Gold surface — active nav bg, soft highlight |
| `--solar-gold-400` | `#FBBF24` | Light accent, illustrations |
| **`--solar-gold-500`** | **`#F59E0B`** | **PRIMARY — CTAs, active states, focus rings, brand accent** |
| `--solar-gold-600` | `#D97706` | Hover state for primary buttons |
| `--solar-gold-700` | `#B45309` | Pressed state, bold accent text |
| `--solar-gold-900` | `#78350F` | Darkest amber — almost never used |

**Tailwind class:** `bg-solar-gold` (primary shade) / `bg-solar-gold-50` / `bg-solar-gold-600` / etc.

### 2.2 Canvas — Pure White with Slate Structure

| Token | Hex | Usage |
|---|---|---|
| `--bg-page` | `#FFFFFF` | Page background — pure white, Vodafone-style |
| `--bg-card` | `#FFFFFF` | Card background |
| `--bg-subtle` | `#F8FAFC` | Alt rows, disabled surfaces, subtle section bg |
| `--bg-hover` | `#F1F5F9` | Row hover, button ghost hover |
| `--bg-sidebar` | `#FFFFFF` | **White sidebar** (Vodafone discipline — not dark) |
| `--bg-institutional` | `#0F172A` | Deep slate for footer, data-only panels, admin-dense zones |
| `--bg-institutional-alt` | `#1E293B` | Slate-800 — inner panels on institutional surfaces |

**Rule:** Institutional dark (`#0F172A`) appears ONLY on footer, auth pages, and optional data-panel zones (e.g. large chart overlays). Never as the main app surface.

### 2.3 Text — Navy for Headings, Slate for Body

Stripe-inspired. Headings are a deep warm navy — *warmer* than pure black, *darker* than any slate — so large type feels premium, not clinical.

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#0F172A` | Headings, main data values (slate-900) |
| `--text-heading` | `#0F172A` | Same as primary — semantic alias for h1/h2/h3 |
| `--text-body` | `#475569` | Body paragraphs, descriptions (slate-600) |
| `--text-label` | `#334155` | Form labels, emphasized secondary (slate-700) |
| `--text-muted` | `#94A3B8` | Metadata, timestamps, captions (slate-400) |
| `--text-disabled` | `#CBD5E1` | Disabled text (slate-300) |
| `--text-on-dark` | `#F8FAFC` | Text on institutional dark surfaces (slate-50) |
| `--text-on-dark-muted` | `#94A3B8` | Muted text on dark (slate-400) |
| `--text-link` | `#D97706` | Inline links (solar-gold-600 — bold, warm) |
| `--text-link-hover` | `#B45309` | Link hover (solar-gold-700) |

### 2.4 Status — The Five-State System

Every status indicator across the app uses these five keys, accessed via `STATUS_STYLES` in `lib/design-tokens.ts`. Never bypass the lookup.

Maps to the 5-state IEC 62446 string classification and the 3-severity alert system.

| Key | FG text | BG fill | Border | Solid | Dot | Use |
|---|---|---|---|---|---|---|
| **healthy** | `text-emerald-700` | `bg-emerald-50` | `border-emerald-200` | `bg-emerald-600 text-white` | `bg-emerald-500` | Normal / Healthy / Success |
| **warning** | `text-amber-700` | `bg-amber-50` | `border-amber-200` | `bg-amber-600 text-white` | `bg-amber-500` | Warning / Needs attention |
| **critical** | `text-red-700` | `bg-red-50` | `border-red-200` | `bg-red-600 text-white` | `bg-red-500` | Critical / Error / Failure |
| **offline** | `text-slate-500` | `bg-slate-100` | `border-slate-200` | `bg-slate-500 text-white` | `bg-slate-400` | Disconnected / No data |
| **open-circuit** | `text-violet-700` | `bg-violet-50` | `border-violet-200` | `bg-violet-600 text-white` | `bg-violet-500` | Open Circuit (voltage but 0A) |
| **info** | `text-blue-700` | `bg-blue-50` | `border-blue-200` | `bg-blue-700 text-white` | `bg-blue-500` | Informational / Neutral alert |

### 2.5 Health Grade System — Six-Bucket Score

For daily health scores (0–100%), heatmap cells, monthly reports. Six buckets map cleanly to status ramps.

| Grade | Range | FG | BG | Display |
|---|---|---|---|---|
| **healthy** | ≥90% | `text-emerald-700` | `bg-emerald-50` | "Healthy" |
| **caution** | 75–89% | `text-amber-800` | `bg-amber-100` | "Caution" |
| **warning** | 50–74% | `text-amber-700` | `bg-amber-50` | "Warning" |
| **severe** | 25–49% | `text-red-700` | `bg-red-50` | "Severe" |
| **dead** | 0–24% | `text-red-900` | `bg-red-100` | "Dead" |
| **no-data** | null | `text-slate-400` | `bg-slate-50` | "—" |

### 2.6 Accent Colors — For Richness Without Chaos

Supporting colors for non-status uses: chart differentiation, provider badges, editorial accents.

| Name | Hex | Use |
|---|---|---|
| **Sky Data** | `#0EA5E9` (sky-500) | Info headers, secondary chart series, "inverter count" type metadata |
| **Ocean Deep** | `#0369A1` (sky-700) | Text on sky-50 backgrounds |
| **Forest Deep** | `#059669` (emerald-600) | Alternative green for "sustainability" narratives, secondary charts |
| **Sunset Orange** | `#F97316` (orange-500) | Energy flow indicators, provider accent (Growatt) |
| **Plum** | `#7C3AED` (violet-600) | Analysis / advanced features accent |
| **Rose** | `#E11D48` (rose-600) | Alternative critical when red is overused |

### 2.7 Provider Badge Colors — Locked

Each inverter brand gets a consistent badge color across the app. Via `providerBadge()` helper.

| Provider | FG | BG | Border |
|---|---|---|---|
| **Huawei** | `text-red-700` | `bg-red-50` | `border-red-200` |
| **Solis** | `text-blue-700` | `bg-blue-50` | `border-blue-200` |
| **Growatt** | `text-orange-700` | `bg-orange-50` | `border-orange-200` |
| **Sungrow** | `text-violet-700` | `bg-violet-50` | `border-violet-200` |

### 2.8 Shadow System — Discipline, Not Drama

SPC uses shadows sparingly — borders carry most hierarchy. Shadows are reserved for floating elements (modals, dropdowns, hovers). All shadows are slate-tinted (never pure black).

| Level | Value | Use |
|---|---|---|
| **Flat (L0)** | No shadow | 95% of cards, default surfaces |
| **L1 — Card hover** | `0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.02)` | Hovered card lift |
| **L2 — Popover** | `0 4px 12px rgba(15, 23, 42, 0.08)` | Dropdowns, tooltips (if light), inline menus |
| **L3 — Modal** | `0 20px 40px rgba(15, 23, 42, 0.15)` | Dialogs, floating panels |
| **L4 — Featured** | `0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 30px rgba(15, 23, 42, 0.08)` | Stripe-inspired dual-layer for "special" cards |
| **Focus ring** | `0 0 0 3px rgba(245, 158, 11, 0.25)` | Keyboard focus — solar-gold tint |

---

### 2.9 Landing-Page Exception — Dual Accent (bb-green)

**Scope: `app/page.tsx` ONLY.** Every other file (dashboard, admin, auth, components/shared) continues to follow the single-brand rule in §2.1 (solar-gold is the *only* brand accent).

The public landing page is allowed a **secondary signal colour** — `bb-green` (`#76B900`) — for energetic "alive" indicators alongside solar-gold. Rationale: the landing must convert cold traffic in a market where NVIDIA-green reads as "technical / electric / active" (Pakistani B2B). The product itself does not need a second accent because signed-in users already know they're in.

| Token | Hex | Usage on landing |
|---|---|---|
| `bb-green-50` | `#F5FBE5` | Subtle tint — success-state row hover, healthy-cell background |
| `bb-green-100` | `#E7F5BF` | Soft surface — live-badge background |
| `bb-green-400` | `#9BD42E` | Progress-bar fill (healthy band) |
| **`bb-green-500`** | **`#76B900`** | **PRIMARY SIGNAL — live pulse dots, "producing" indicators, heatmap healthy cells, trust-check icons** |
| `bb-green-600` | `#5F9400` | Hover on green interactive elements, dark text on pale green |
| `bb-green-700` | `#4B7500` | Bold accent text on bb-green-50 |

**Rules of the exception:**

1. **Solar-gold is still the CTA colour.** Every "Book Site Visit / Sign In / Get Started" button on the landing is solar-gold. Green is *never* a button fill — it's signal only (per Bijli Bachao parent-brand discipline).
2. **Green means "alive / producing / healthy."** Live pulse dots, "44 of 48 producing" stats, healthy heatmap cells, trust-check icons. Nothing else.
3. **Strictly scoped.** `bb-green-*` Tailwind classes must not appear outside `app/page.tsx`. The validator (check 5.6) enforces this for `app/dashboard/` and `components/shared/`.
4. **Pull-away strategy.** If future marketing expands this to `app/(marketing)/*`, update this section — never silently.

**Why this is still one brand:** solar-gold remains the *brand*. Green is a *signal colour* (like emerald in the status system). A visitor's mental model: "gold = SPC", "green = alive / healthy". Consistent with the semantic colour discipline of §2.4.

---

## 3. Typography

### 3.1 Fonts

- **Sans (UI):** `Inter` with fallback `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Mono (data):** `'JetBrains Mono'` fallback `ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace`
- **Icon set:** Lucide React — `strokeWidth={2}` default

Inter is free, widely available, and close in character to Stripe's proprietary sohne-var. JetBrains Mono gives a confident monospace for numeric display.

### 3.2 Type Scale

| Role | Tailwind | Px | Weight | Line-height | Letter-spacing | Case | Use |
|---|---|---|---|---|---|---|---|
| **Display** | `text-4xl` | 36 | 700 | 1.1 | -1% | Title | Marketing / landing heroes |
| **Page Title (H1)** | `text-2xl` | 24 | 700 | 1.2 | tight | Title | Dashboard page titles |
| **Section Heading (H2)** | `text-xl` | 20 | 700 | 1.25 | tight | Title | Major sections |
| **Sub-heading (H3)** | `text-lg` | 18 | 700 | 1.3 | normal | Title | Cards, panels |
| **Card Title (H4)** | `text-base` | 16 | 700 | 1.35 | normal | Title | Card headings |
| **Body Large** | `text-base` | 16 | 400 | 1.5 | normal | Sentence | Feature paragraphs |
| **Body** | `text-sm` | 14 | 400 | 1.5 | normal | Sentence | Default body in dashboards |
| **Body Semibold** | `text-sm font-semibold` | 14 | 600 | 1.5 | normal | Sentence | Emphasized body |
| **Label** | `text-sm font-semibold` | 14 | 600 | 1.4 | normal | Sentence | Form labels |
| **Caption** | `text-xs` | 12 | 500 | 1.5 | normal | Sentence | Metadata, timestamps |
| **Eyebrow** | `text-[11px] font-bold uppercase tracking-wider` | 11 | 700 | 1.3 | +0.5px | UPPERCASE | Section wayfinding labels |
| **Badge** | `text-[11px] font-semibold` | 11 | 600 | 1.2 | normal | Title | Status badges — Title Case, NOT uppercase |
| **Micro** | `text-[10px] font-bold uppercase tracking-widest` | 10 | 700 | 1.3 | +1px | UPPERCASE | Tiny wayfinding (KPI card labels) |
| **Data Large** | `text-[28px] font-mono font-bold` | 28 | 700 | 1 | tabular | — | KPI card primary value |
| **Data** | `font-mono` | 14 | 500 | 1.4 | tabular | — | All inline numbers, currents, voltages |
| **Data Caption** | `text-xs font-mono` | 12 | 400 | 1.4 | tabular | — | Timestamps, IDs in captions |

### 3.3 Principles

1. **Title Case by default.** Uppercase is ONLY for eyebrow labels and micro wayfinding (KPI card labels, sidebar nav). Not for headings, not for buttons, not for badges.
2. **Monospace for numbers.** Every numeric value — current, voltage, percentage, count, timestamp, UUID, date — uses `font-mono`. Never Inter.
3. **Weight hierarchy is strict:** 700 for headings and interactive emphasis, 600 for labels and buttons, 500 for captions, 400 for body. No 300 (we're corporate confident, not Stripe whisper).
4. **No italics.** Emphasis comes from weight and color.
5. **Letter-spacing tightens with size.** Display uses `-1%`, body is normal, uppercase eyebrows/micro use `+0.5–1px` positive tracking.

---

## 4. Spacing

Base unit: **4px** (Tailwind's default).

| Token | Tailwind | Px | Typical Use |
|---|---|---|---|
| xs | `gap-1` / `p-1` | 4 | Inline icon–text gaps, badge padding |
| sm | `gap-2` / `p-2` | 8 | Related items, tight lists |
| md | `gap-3` / `p-3` | 12 | Compact card padding, form row gaps |
| **base** | `gap-4` / `p-4` | 16 | **Default card padding, between cards** |
| lg | `gap-5` / `p-5` | 20 | Between minor sections |
| xl | `gap-6` / `p-6` | 24 | Page padding, between major sections |
| 2xl | `gap-8` / `p-8` | 32 | Between distinct content zones |
| 3xl | `gap-12` | 48 | Section breaks (desktop) |
| 4xl | `gap-16` | 64 | Page-level rhythm |

**Rules:**
- Card internal padding: **16px (`p-4`) default**, 24px (`p-6`) for hero/featured
- Between cards in a grid: **16px gap (`gap-4`)**
- Page content padding: **24px (`p-6`)** on main column
- Vertical rhythm between sections: **24–32px** (`space-y-6` or `space-y-8`)

---

## 5. Border Radius — Conservative

Stripe/Vodafone-inspired. Nothing pill-shaped except status chips and avatars.

| Token | Value | Tailwind | Use |
|---|---|---|---|
| **sharp** | 2px | `rounded-sm` | Badges, eyebrow pills, small chips |
| **default** | 4px | `rounded` | Buttons, inputs, most interactive elements |
| **card** | 6px | `rounded-md` | Cards (the workhorse) |
| **featured** | 8px | `rounded-lg` | Featured cards, hero tiles |
| **circle** | 50% | `rounded-full` | Avatars, dots, round icon buttons |

**Forbidden:** `rounded-xl` (12px+), `rounded-2xl` (16px+), `rounded-3xl`. This is a corporate data platform, not a consumer app.

---

## 6. Icon System

**Library:** `lucide-react` (already installed). **Never** mix in other icon libraries.

### 6.1 Sizes

| Context | Size | Tailwind |
|---|---|---|
| Inline with text (12–14px body) | 14 | `h-3.5 w-3.5` |
| Button icon | 16 | `h-4 w-4` |
| Nav / KPI icon | 18 | `h-[18px] w-[18px]` |
| Card header icon | 20 | `h-5 w-5` |
| Feature / chip icon | 24 | `h-6 w-6` |
| Empty state / hero icon | 40–48 | `h-10 w-10` / `h-12 w-12` |

### 6.2 Stroke Widths

- `strokeWidth={1.5}` — decorative large icons only
- **`strokeWidth={2}`** — default for all UI icons
- `strokeWidth={2.5}` — active / selected emphasis

### 6.3 Icon Colors

Icons inherit `currentColor` by default. Explicit color only for status icons where meaning is color-encoded.

---

## 7. Motion & Transitions

SPC uses motion sparingly and predictably. No rotation, no scale, no bounce — that's consumer-playful. We're corporate.

| Pattern | Duration | Easing |
|---|---|---|
| Color / opacity transitions | `150ms` | `ease` |
| Hover lift (shadow) | `200ms` | `ease-out` |
| Modal fade-in | `200ms` | `ease-out` |
| Skeleton pulse | `1.5s` | `ease-in-out` infinite |
| Spinner rotate | `1s` | `linear` infinite |

**No scale-on-hover. No rotation on buttons.** Corporate software stays still.

---

## 8. Surfaces — The Three-Tier System

SPC uses three distinct surface layers. Every element sits on one of these three.

### 8.1 Canvas (Level 0)

- `#FFFFFF` pure white
- Page background, editorial rhythm
- **95% of the app sits here**

### 8.2 Lifted (Level 1)

- Still white, but with **1px slate-200 border** to separate from canvas
- All cards, panels, tables, forms
- Optional shadow L1 on hover

### 8.3 Institutional (Level 2 — dark)

- `#0F172A` slate-900
- Reserved for footer, auth pages, dense data-only panels
- Used as **contrast chapter breaks**, not dominant surfaces
- White text, slate-400 muted, slate-700 dividers

**Forbidden surface patterns:**
- Warm cream `#FAF9F7` (that's Clay/Mastercard, we're Vodafone-white)
- Any color-tinted background (e.g., `bg-blue-50` as page bg)
- Gradients as surfaces

---

## 9. Buttons

Two-tier structure inspired by Vodafone's pattern, but SPC's primary is filled solar-gold (warmer, more inviting than Vodafone's red rectangle).

### 9.1 Variants

| Variant | Look | When |
|---|---|---|
| **Primary** | `bg-solar-gold text-white hover:bg-solar-gold-600` | The ONE primary CTA per fold ("Assign", "Save", "Create") |
| **Outline** | `bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 hover:border-slate-300` | Secondary actions (Cancel, Back, Retry) |
| **Ghost** | `text-slate-600 hover:bg-slate-100 hover:text-slate-900` | Inline table actions, header nav |
| **Destructive** | `bg-red-600 text-white hover:bg-red-700` | Delete, Remove, Unassign |
| **Link** | `text-solar-gold-600 hover:text-solar-gold-700 underline-offset-4 hover:underline` | Inline text-link buttons |

### 9.2 Base Spec

```
font: 14px weight 600 leading-tight
padding: 10px 16px (default), 8px 12px (sm), 12px 20px (lg)
radius: 4px (rounded)
focus-ring: 0 0 0 3px rgba(245, 158, 11, 0.25) — solar-gold @ 25%
transition: 150ms ease
disabled: opacity 0.5, cursor not-allowed
```

### 9.3 Sizes

- `sm` — 32px tall (`h-8`) · 14px text · 12px horizontal padding
- `default` — 40px tall (`h-10`) · 14px text · 16px horizontal padding
- `lg` — 44px tall (`h-11`) · 16px text · 20px horizontal padding
- `icon` — 40×40 square, icon only

### 9.4 Rules

1. **One primary per fold.** If you have two filled gold buttons visible at the same time, one of them is wrong.
2. **Cancel is always Outline.** Never ghost, never primary.
3. **Destructive confirms first.** Never a single-click delete — use a confirm dialog.
4. **No full-pill buttons.** Radius is 4px — corporate discipline.

---

## 10. Inputs & Forms

### 10.1 Text Input / Select / Textarea

```
background: white
border: 1px solid slate-200
radius: 4px
padding: 10px 12px
font: 14px weight 400 slate-900
placeholder: slate-400
height: 40px (h-10) default

focus:
  border-color: solar-gold (#F59E0B)
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25)

disabled:
  background: slate-50
  text: slate-400

error:
  border-color: red-500
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.20)
```

### 10.2 Label

- `text-sm font-semibold text-slate-700`
- 6px gap below label to input (`space-y-1.5`)
- Asterisk for required: append ` *` in text-red-600

### 10.3 Helper text / Error message

- `text-xs text-slate-500` (helper)
- `text-xs text-red-600 font-medium` (error)
- 4px gap above (`mt-1`)

### 10.4 Checkbox / Radio / Switch

**Checkbox & Radio**
- 16×16px, 2px radius (checkbox) or 50% (radio)
- Border: slate-300 default, solar-gold when checked
- Fill: solar-gold when checked
- Check icon: white, strokeWidth 3
- Focus ring: solar-gold @ 25%

**Switch**
- 40×24px, fully rounded
- Off: slate-300 track, white thumb
- On: solar-gold track, white thumb
- 150ms ease transition

---

## 11. Badges & Chips

### 11.1 Badge (status indicator)

```
base: inline-flex items-center rounded-sm border px-1.5 py-0.5
      text-[11px] font-semibold
case: Title Case (not uppercase — corporate, readable)
```

Variants use the status lookup:
- `healthy` → emerald tint + border + text
- `warning` → amber tint + border + text
- `critical` → red tint + border + text
- `info` → blue tint + border + text
- `neutral` → slate tint + border + text

### 11.2 Eyebrow Pill (wayfinding label)

For section headers ("• DASHBOARD", "• ANALYSIS"):
```
text: 11px weight 700 uppercase tracking-wider
preceded by: 4px accent dot in solar-gold
color: slate-500
```

### 11.3 Filter Chip

```
inactive: bg-white border border-slate-200 text-slate-600 text-xs px-3 py-1.5 rounded-md
active:   bg-solar-gold-50 border-solar-gold-400 text-solar-gold-700 font-semibold
hover:    bg-slate-50
```

### 11.4 Provider Badge

Uses `providerBadge()` helper — see §2.7. Format: 11px weight 600, TitleCase label, 2px radius.

---

## 12. Cards — Four Patterns

SPC has four distinct card types. Use the right one for the job.

### 12.1 Standard Card (default)

General-purpose panel — forms, text content, simple sections.

```
background: white
border: 1px solid slate-200
radius: 6px (rounded-md)
padding: 16px (p-4)
shadow: none by default
hover (if interactive): shadow L1, border-slate-300
```

### 12.2 KPI Card

Dashboard summary metric — the star of every dashboard home.

```
structure:
  top: 2px accent bar (full width, status color)
  padding: 16px
  row 1: eyebrow label LEFT (10px bold uppercase slate-400)
         icon chip RIGHT (32×32, bg-{accent}-50, text-{accent}-600)
  row 2: primary value (28px font-mono bold slate-900)
  row 3: subtitle stats (11px weight 500 mono, 2 metrics max)

hover: border → accent color, cursor pointer
```

Five flavors based on semantic meaning:
- **Neutral KPI:** solar-gold accent bar + solar-gold icon chip
- **Healthy KPI:** emerald bar + chip
- **Warning KPI:** amber bar + chip
- **Critical KPI:** red bar + chip
- **Info KPI:** blue bar + chip

### 12.3 Plant Card (list item)

Compact card for plant grids.

```
background: white
border: 1px solid slate-200
radius: 6px
padding: 16px
left accent: 3px colored stripe (full height, status color)

content:
  header row: plant name (14px bold) + provider badge (right)
  stats row: capacity (mono) · devices (mono) · last-sync
  footer: alert count (if >0)

hover: border → solar-gold, shadow L1
```

### 12.4 Institutional Panel

Dark panel for data-heavy zones (optional — use sparingly).

```
background: #0F172A (slate-900)
border: none or slate-700
padding: 24px
text: white primary, slate-400 muted
inner cards: bg-slate-800 border-slate-700
```

Use for: admin-only data zones, chart-heavy "data rooms", footer.
Never use as the main page surface.

---

## 13. Tables — Data-Dense Discipline

```
container: bg-white, border 1px slate-200, radius 6px, overflow-hidden
header:
  bg: slate-50
  height: 40px (h-10)
  text: 11px weight 700 uppercase tracking-wider slate-600
  border-bottom: 2px slate-200
  padding: 12px 16px

row:
  bg: white
  border-bottom: 1px slate-100 (subtle)
  hover: bg-slate-50
  selected: bg-solar-gold-50

cell:
  padding: 12px 16px
  text: 14px weight 400 slate-700
  numbers: font-mono weight 500 slate-900

sticky columns:
  bg: white (to hide scroll)
  right-border: 1px slate-200

alt rows (optional):
  even: bg-slate-50
```

### Table action links (inline)

Inside table cells, use `ghost`-style inline action links:
- Primary action ("View" / "Assign"): `text-solar-gold-600 hover:text-solar-gold-700 font-semibold`
- Destructive ("Unassign" / "Delete"): `text-red-600 hover:text-red-700 font-semibold`
- Neutral nav ("Details"): `text-slate-600 hover:text-slate-900 font-semibold`

---

## 14. Tabs — Underline Style

Inspired by Vodafone's editorial discipline, not pill-style.

```
container: border-b border-slate-200

tab (default):
  padding: 12px 16px
  font: 14px weight 600 slate-600
  border-bottom: 2px transparent (-1px bleed into container border)

hover:
  text: slate-900
  border-bottom: 2px slate-300

active:
  text: solar-gold-600
  border-bottom: 2px solar-gold
  font-weight: 700

focus-ring: solar-gold @ 25%
```

---

## 15. Dialogs / Modals

```
overlay:
  bg: rgba(15, 23, 42, 0.5)  — slate-tinted, NOT black
  backdrop-filter: blur(2px)

container:
  bg: white
  border: 1px slate-200
  radius: 8px (featured — slightly larger than default cards)
  padding: 24px
  shadow: L3 (0 20px 40px rgba(15,23,42,0.15))
  max-width: 512px default, 640px for data-heavy dialogs

title: 18px weight 700 slate-900 (section heading style)
description: 14px weight 400 slate-600, 4px below title

body: py-4

footer:
  flex justify-end gap-2
  border-top: 1px slate-200 (only if body is long)
  padding-top: 16px
  Cancel button LEFT of primary action

close-X:
  top-right, 8px from edge
  slate-400 hover slate-900
  focus-ring: solar-gold @ 25%
```

---

## 16. Tooltips

Dark tooltips per Linear/Vercel/Stripe pattern — high contrast, no ambiguity.

```
bg: #0F172A (slate-900)
text: slate-50
font: 12px weight 500
padding: 6px 10px
radius: 4px
shadow: L2
max-width: 280px
arrow: 4px solid slate-900
```

---

## 17. Toasts & Banners

### 17.1 Inline Banner (in-page feedback)

For success/error/warning messages tied to a specific action.

```
padding: 12px 16px
radius: 4px
border: 1px solid {status}-200
background: {status}-50
text: {status}-700 with font-medium
icon: 16px status color, strokeWidth 2

layout: flex items-start gap-2
```

Variants: `success` (emerald), `warning` (amber), `error` (red), `info` (blue).

### 17.2 Toast (floating notification)

```
bg: white
border: 1px solid slate-200
border-left: 3px solid {status-color}
radius: 6px
padding: 12px 16px
shadow: L3
width: 360px
position: fixed top-right, 16px margin

title: 14px weight 600 slate-900
description: 13px weight 400 slate-600
icon: 20px status-color at left
dismiss: ghost icon top-right
```

---

## 18. Pagination

```
container: flex items-center justify-between
           border-top: 1px slate-200
           padding: 12px 16px

page indicator: text-xs font-mono text-slate-500  — "1 / 5"
prev/next: Outline buttons, size sm
disabled state: cursor-not-allowed opacity-50
```

---

## 19. Loading, Empty, Error States

### 19.1 Loading — Spinner

```
<div className="w-5 h-5 border-2 border-solar-gold border-t-transparent rounded-full animate-spin" />
<span className="text-sm font-semibold text-slate-400">Loading...</span>
```

Sizes: inline (14px), default (20px), page (40px).

### 19.2 Loading — Skeleton

```
bg: slate-100
radius: 4px
animation: pulse (opacity 1 → 0.5 → 1 at 1.5s ease-in-out)

shapes:
  text-line: h-3 (12px)
  value: h-8 (32px)
  card: h-24 (96px)
  avatar: h-10 w-10 rounded-full
```

### 19.3 Empty State

```
container: text-center py-12

icon: 48×48 (h-12 w-12), slate-300, strokeWidth 1.5
heading: 14px weight 700 slate-600 (below icon, mt-3)
description: 12px weight 500 slate-400 (below heading, mt-1)
optional CTA: Outline button below description, mt-4
```

### 19.4 Error State

```
container: text-center py-12

icon: 32×32 AlertTriangle, text-red-500, strokeWidth 2
message: 14px weight 600 text-red-700, mt-3
retry: Outline button below, mt-4
```

---

## 20. Progress Bars — Three Flavors

### 20.1 Linear Progress

Continuous percentage (e.g., upload, loading bar).

```
track: bg-slate-200, 4px tall (h-1), rounded-full
fill:  bg-solar-gold, transitions 300ms ease
label: 11px mono text-slate-600, displayed above or right
```

### 20.2 Segmented Status Bar

Shows breakdown of N states (healthy/warning/critical/etc). Used in inverter cards.

```
container: flex gap-0.5 h-1.5 bg-slate-100 rounded-full overflow-hidden

segment 1: STATUS_STYLES.healthy.dot, width = percentage
segment 2: STATUS_STYLES.warning.dot, width = percentage
... etc

label: "{percent}% healthy" 11px mono font-semibold text-slate-600
```

### 20.3 Segmented Health Bar

Visual score indicator (e.g., 4 bars filled = 90–100% healthy).

```
container: flex gap-0.5
segment:
  size: 10×12px (w-2.5 h-3)
  radius: 2px (rounded-sm)
  filled: STATUS_STYLES.{grade}.dot
  unfilled: bg-slate-200

percentage display: 12px mono text-slate-700 (right of bars)
```

---

## 21. Charts — The Critical Section

Charts are half of SPC's value. Every chart follows these rules so they feel like one coherent data system, not a zoo.

### 21.1 Chart Canvas

```
background: white (transparent — inherits from parent card)
grid lines: stroke #E2E8F0 (slate-200), strokeDasharray "3 3"
  horizontal grid only (vertical=false) for most bar/line charts

axis line: stroke #CBD5E1 (slate-300) OR none
axis ticks:
  font: 11px font-sans text-slate-400
  stroke: none (tickLine={false})

axis label (e.g. "Current (A)"):
  font: 11px weight 500 text-slate-600
  positioning: insideLeft, rotated -90 (Y axis)
```

### 21.2 Chart Tooltip (light, not dark)

```
bg: white
border: 1px solid slate-200
radius: 4px
padding: 8px 12px
shadow: L2 (0 4px 12px rgba(15,23,42,0.08))

title (label): 12px weight 600 slate-600
value: 12px font-mono weight 700 slate-900
secondary lines: 11px slate-600

cursor-line: slate-100 (subtle hover guide)
```

Tooltips are **light** on charts because the chart backdrop is white — high contrast + less visual weight than our UI tooltip which is dark.

### 21.3 Chart Legend

```
font: 11px weight 500 slate-600
item gap: 12px
dot-before-label: 8×8 circle in series color
```

### 21.4 Line Chart — Multi-Series

Used for: string current trend over 24h/7d/30d.

```
stroke-width: 2
stroke: from TREND_LINE_PALETTE (see below)
dot: none (cleaner for dense data)
active-dot: radius 4, fill = stroke
type: monotone (smooth curves)
```

**TREND_LINE_PALETTE** — 24 distinct colors for overlaying many strings. Ordered to maximize contrast between adjacent indices:

1. `#F59E0B` solar-gold (brand — reserved for first series or highlight)
2. `#0EA5E9` sky
3. `#10B981` emerald
4. `#7C3AED` violet
5. `#F97316` orange
6. `#EC4899` pink
7. `#0891B2` cyan
8. `#DC2626` red
9. `#65A30D` lime
10. `#2563EB` blue
11. `#0D9488` teal
12. `#E11D48` rose
13. `#A855F7` purple
14. `#0284C7` sky-darker
15. `#B45309` amber-darker
16. `#059669` emerald-darker
17. `#6D28D9` violet-darker
18. `#F43F5E` rose-lighter
19. `#047857` emerald-deep
20. `#1D4ED8` blue-deep
21. `#B91C1C` red-deep
22. `#4338CA` indigo
23. `#16A34A` green
24. `#A16207` amber-deep

### 21.5 Bar Chart — Status-Encoded

Used for: string current deviation (bars colored by status).

```
radius: [2, 2, 0, 0]  — rounded top only
maxBarSize: 40
fill: status-matched color from BAR_COLOR_BY_STATUS:
  NORMAL:       #10B981 (emerald-500)
  WARNING:      #F59E0B (amber-500)
  CRITICAL:     #EF4444 (red-500)
  OPEN_CIRCUIT: #8B5CF6 (violet-500)
  DISCONNECTED: #94A3B8 (slate-400)

reference line (e.g. "average"):
  stroke: #F59E0B (solar-gold)
  strokeWidth: 2
  strokeDasharray: "6 3"
  label: 10px weight 700 color-matched at right
```

### 21.6 Heatmap — Performance Grid

Used for: string-level and inverter-level performance analysis.

```
cell:
  size: 28×28 minimum (dense) or 32×32 (readable)
  gap: 2px (via white borders between cells)
  radius: 0 (flush grid — heatmap reads as a single matrix)
  bg: HEALTH_GRADE_STYLES[grade].bg
  text: 10px font-mono weight 600, foreground contrast with bg

sticky left columns:
  bg: white
  right-border: 1px slate-200
  font: 12px weight 600 slate-900

day/week headers:
  bg: slate-50
  text: 10px weight 700 uppercase tracking-wider slate-600
  padding: 8px 12px

empty cell: bg-slate-50, text slate-300 "—"
```

### 21.7 Area Chart — Cumulative

For cumulative energy over time (if added):
```
fill: gradient from solar-gold @ 40% opacity → solar-gold @ 0% opacity
stroke: solar-gold, strokeWidth 2
grid: same as line chart
```

### 21.8 Donut / Pie

Avoided where possible (bar charts communicate comparison better). If required:
```
colors: status-encoded palette
stroke: white, strokeWidth 2 (gap between slices)
inner-label: 14px weight 700 font-mono (total) + 11px muted (unit)
```

### 21.9 Chart Color Rules

- **Status-meaning charts** (health, status): always use STATUS_STYLES palette
- **Multi-series distinction charts** (per-string trends): use TREND_LINE_PALETTE
- **Single-metric charts** (total power over time): use solar-gold
- **Never mix status and generic palettes in the same chart**

---

## 22. Sidebar — White with Gold Accent

**New direction per Vodafone discipline:** white sidebar, not dark slate. Lets the canvas feel unified.

```
position: fixed left, w-60 (240px), h-screen
bg: white
border-right: 1px slate-200

logo section:
  h-14 (56px)
  border-bottom: 1px slate-200
  padding: 0 20px
  layout: logo-icon (in solar-gold-100 container) + "Solar Performance Cloud" wordmark

nav items (ul > li):
  padding: 10px 12px
  font: 13px weight 600 Title Case (NOT uppercase — corporate readability)
  icon: 18×18 text-slate-500 (inactive)
  color: slate-700 (default)

nav hover:
  bg: slate-50
  text: slate-900
  icon: slate-700

nav active:
  bg: solar-gold-50
  text: solar-gold-700
  icon: solar-gold-600
  border-left: 3px solid solar-gold (full height of item, -3px inset)
  font-weight: 700

section divider:
  h-px bg-slate-200 my-3

user section (bottom):
  border-top: 1px slate-200
  padding: 16px 20px
  avatar: 32×32 rounded-full
  name: 13px weight 600 slate-900
  role: 11px weight 500 slate-500
```

**Alternative:** for authenticated pages with high data density, we may later offer a dark sidebar as an opt-in theme. Default is white.

---

## 23. TopBar

```
position: fixed top, h-14 (56px)
bg: white
border-bottom: 1px slate-200
padding: 0 24px
layout: flex items-center justify-between

LEFT:
  page title (from route)
  16px weight 700 slate-900

RIGHT:
  [notifications icon] [avatar dropdown]
  gap: 12px
```

---

## 24. Breadcrumbs

For deep navigation:
```
font: 12px weight 500
color: slate-500
separator: "/" in slate-300
last (current): slate-900 font-semibold

gap: 8px between items
hover: solar-gold-600
```

---

## 25. Page Templates

### 25.1 Dashboard Home

```
┌──────────────────────────────────────────────┐
│ White sidebar │ White topbar                  │
│               ├───────────────────────────────┤
│               │ Page title (24px bold)        │
│               │ [eyebrow · OVERVIEW]          │
│               ├───────────────────────────────┤
│               │ ┌─┐┌─┐┌─┐┌─┐  4 KPI cards    │
│               │ └─┘└─┘└─┘└─┘                  │
│               ├───────────────────────────────┤
│               │ Section: Plants               │
│               │ [plant cards grid 3-col]      │
│               ├───────────────────────────────┤
│               │ Section: Recent Alerts        │
│               │ [alert items]  [View All →]   │
└──────────────────────────────────────────────┘
```

### 25.2 List Page (plants / orgs / users)

```
Page Header bar (white, bordered bottom):
  title (24px) + stats dots row + actions (Back / New)
  below: search + filter row

Content area:
  Table card (white, slate-200 border, radius 6px)
  Pagination footer
```

### 25.3 Detail Page (plant detail)

```
Plant Header (white card, full-bleed):
  title (24px) + status badge + provider badge
  info bar: capacity · devices · last sync · string summary
  actions right: Live/Paused · Refresh · Back

Tabs (underline): [Overview] [Alert History]

Overview tab:
  Inverter sections (one white card per inverter)
    - KPI header row
    - Status bar
    - String Health Matrix
    - String Comparison Table
    - Current Deviation Chart
    - Active Alerts
    - String Trend Chart
    - Collapsible: Fault Diagnosis
    - Collapsible: Monthly Health Report

Alert History tab:
  Alert History Log card
```

### 25.4 Analysis Page

```
Page Header:
  title + view tabs [String Level / Inverter Level]

Filters row:
  plant select · device select · date range preset · CSV export

Summary row:
  eyebrow stat + key numbers (mono)

Color legend (horizontal):
  6 health grade chips with labels

Heatmap card:
  rows = strings, cols = dates
  sticky left cols for meta
  scrollable right area
```

### 25.5 Alerts Page

```
Page Header:
  title + total-count stats dots

Filters: severity pills · status pills · plant select · date range

Alert list (grouped by date):
  date header
  alert items (list of Alert History Log pattern)

Pagination
```

### 25.6 Auth Pages (sign-in / sign-up / waiting)

Only surface where **Institutional dark** (slate-900) may take over the full page as a backdrop, with the auth card white in the center. Gives auth a distinct moment separate from the app.

---

## 26. Responsive

### 26.1 Breakpoints (Tailwind defaults)

| Name | Min-width | Behavior |
|---|---|---|
| (mobile) | 0 | 1-col layout, hamburger nav, stacked cards |
| `sm` | 640 | 2-col KPI/plant grids begin |
| `md` | 768 | 3-col KPI grids, expanded tables |
| `lg` | 1024 | Sidebar visible, full layout |
| `xl` | 1280 | 4-col KPI grids, max content padding |
| `2xl` | 1536 | Content capped at 1440px, symmetric gutters |

### 26.2 Mobile Adaptations

- **Sidebar:** hidden; replaced by hamburger → full-screen overlay
- **Page padding:** 24px → 16px
- **KPI grid:** 4-col → 2-col → 1-col
- **Plant grid:** 3-col → 2-col → 1-col
- **Tables:** horizontal scroll preserved, never shrink cells
- **Page title:** 24px → 20px
- **Alert items:** stack metadata rows

---

## 27. Accessibility

- **Focus ring:** 3px solar-gold @ 25% opacity, visible on all interactive elements
- **Contrast:** all text meets WCAG AA (4.5:1 for body, 3:1 for large text)
- **Keyboard:** all interactive elements navigable via Tab, Enter/Space activates
- **ARIA:** buttons with icon-only get `aria-label`, dialogs get `aria-labelledby` + `aria-describedby`
- **Motion:** respect `prefers-reduced-motion` — disable transitions for users who opt out

---

## 28. Content & Voice

- **Page titles:** Title Case, no periods — "Dashboard Overview"
- **Section labels (eyebrow):** UPPERCASE + dot — "• OVERVIEW"
- **Button labels:** Title Case, verb-first — "Assign Plant" not "Plant Assignment"
- **Badges:** Title Case — "Healthy", "Faulty", "Offline" (not UPPERCASE)
- **Empty states:** plainspoken — "No plants yet" not "No data to display"
- **Error messages:** tell the user what to do — "Check your connection and retry"
- **Numbers:** always format — "2.2 MW" not "2196.5 kW" in overview contexts

---

## 29. The Ten Commandments (Quick Reference)

1. **Canvas is pure white.** No warm cream, no gray-50 body. Use slate-50 for alt-row fills only.
2. **No pure black.** Slate-900 `#0F172A` for any "dark" — text, institutional panels, shadows.
3. **Solar Gold is the brand.** Used for primary buttons, active nav, focus rings, key accents. Never another color plays this role.
4. **Status colors come from the lookup.** Six keys: healthy / warning / critical / offline / open-circuit / info. No inline `bg-emerald-*` etc. for status.
5. **Title Case for badges and buttons.** Uppercase is for eyebrow labels and micro wayfinding only.
6. **Monospace for all numbers.** Currents, voltages, percentages, timestamps, counts, IDs.
7. **Conservative radius.** 4px default, 6px cards, 8px featured. Never 12px+ on cards or buttons.
8. **Borders over shadows.** Use 1px slate-200 for hierarchy. Shadows only for floating elements.
9. **Icons all strokeWidth 2.** Lucide React only. No emoji, no mixed libraries.
10. **One primary CTA per fold.** If two filled gold buttons are visible simultaneously, one is wrong.

---

## 30. Migration Mapping — Old Tokens → New

When updating existing code, these are the direct replacements:

| Old | New |
|---|---|
| `#1a1a1a`, `bg-[#1a1a1a]` | `#0F172A` (slate-900) — only on institutional panels |
| `#0a0a0a`, `#000`, `bg-black`, `text-black` | `#0F172A` or `text-slate-900` |
| `#f5f5f5` (page bg) | `#FFFFFF` pure white (NOT `bg-slate-50`) |
| `bg-slate-50` (page bg) | `bg-white` |
| `#e5e5e5`, `border-[#e5e5e5]` | `border-slate-200` |
| `#898989`, `#a7a7a7` (text) | `text-slate-400` |
| `#525252` (text secondary) | `text-slate-600` |
| `#5e5e5e` | `text-slate-500` or `border-slate-300` |
| `#76b900` (NVIDIA green, old brand) | `#F59E0B` solar-gold |
| `border-spc-green`, `text-spc-green` | `border-solar-gold`, `text-solar-gold-600` |
| `bg-spc-green/10 text-spc-green` (active nav) | `bg-solar-gold-50 text-solar-gold-700` |
| `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl` | `rounded-md` (6px) for cards, `rounded` (4px) for buttons |
| `rounded-full` (on buttons) | `rounded` (4px) — no pill buttons |
| Badge `rounded-full` or `rounded-sm` UPPERCASE | `rounded-sm` TITLE CASE |
| `emerald-*`, `amber-*`, `red-*` inline status | `STATUS_STYLES[key].{fg/bg/border/dot}` lookup |
| `rgba(0,0,0,*)` shadows | `rgba(15, 23, 42, *)` slate-tinted |
| Dark tooltips (bg-slate-900) | **Light tooltips on charts** (bg-white) · dark tooltips OK on general UI |

---

## 31. Token Map — Files & Their Roles

| File | Owns |
|---|---|
| `DESIGN.md` (this file) | The spec. Canonical decisions. If this says X, everything else is X. |
| `tailwind.config.ts` | Tailwind utility classes: `bg-solar-gold`, `text-solar-gold-700`, `border-solar-gold`, etc. |
| `app/globals.css` | CSS variables, scrollbar, base resets. |
| `lib/design-tokens.ts` | Runtime lookups: `STATUS_STYLES`, `HEALTH_GRADE_STYLES`, `PROVIDER_BADGE_STYLES`, `statusKeyFromX(...)` mappers. |
| `components/ui/*` | shadcn primitives using the tokens. |
| `components/shared/*` | App-specific components consuming tokens + primitives. |

### Who decides what

- **This doc** decides design truth — colors, sizes, patterns, radii.
- **`tailwind.config`** decides class names — `bg-solar-gold`, `shadow-card`, etc.
- **`design-tokens.ts`** decides mapping domain→visual — "Plant status 3 → healthy key → emerald styles".
- **Components** decide structure — how a KPI card is assembled.

No single file knows everything. Each owns one layer. **Changing a color requires editing exactly one file per layer.**

---

## 32. Agent Prompt Guide

When an AI agent (future Claude session, Codex, etc.) touches this codebase, give it this quick reference.

### Quick Color Reference

```
Brand:            #F59E0B  (solar-gold) — primary CTAs, active, focus
Canvas:           #FFFFFF  (white page)
Alt surface:      #F8FAFC  (slate-50 — alt rows only)
Card:             #FFFFFF  (white card on white page, slate-200 border)
Institutional:    #0F172A  (slate-900 — footer, auth, dense panels only)
Heading text:     #0F172A  (slate-900)
Body text:        #475569  (slate-600)
Muted text:       #94A3B8  (slate-400)
Border default:   #E2E8F0  (slate-200)
Link:             #D97706  (solar-gold-600)

STATUS (from lib/design-tokens.ts STATUS_STYLES):
  healthy:     emerald-50 / emerald-200 / emerald-700 / emerald-500 (dot)
  warning:     amber-50   / amber-200   / amber-700   / amber-500
  critical:    red-50     / red-200     / red-700     / red-500
  info:        blue-50    / blue-200    / blue-700    / blue-500
  offline:     slate-100  / slate-200   / slate-500   / slate-400
  open-circuit: violet-50 / violet-200  / violet-700  / violet-500
```

### Iteration Rules

1. If a status color is needed, import from `@/lib/design-tokens` — never inline.
2. Primary CTA is `<Button>` default — solar-gold filled.
3. Secondary/Cancel is `<Button variant="outline">`.
4. Numbers get `font-mono`.
5. Page titles are `text-2xl font-bold text-slate-900`.
6. Sidebar is white. Tooltips on charts are white. Tooltips in general UI are dark slate-900.
7. Radius: 4px buttons / 6px cards / never larger except avatars (full).
8. Icons: Lucide React only, `strokeWidth={2}`.
9. Eyebrow labels are UPPERCASE with dot prefix. Badges are Title Case.
10. No pure black, ever. No warm cream, ever.

### Forbidden Patterns — Refuse to Merge

- Any `bg-black`, `text-black`, `#000`, `#1a1a1a`, `#0a0a0a` — ship blocker
- `rounded-xl` or larger on cards or buttons
- Status color hardcoded (`bg-red-50` for alert card) instead of STATUS_STYLES
- Pill-shaped buttons (full radius)
- Animations with `scale(…)` or `rotate(…)` — corporate software stays still
- Gradients on surfaces (hero gradients OK sparingly, never on cards)

---

**End of DESIGN.md.**
**When in doubt, default to white + slate + solar-gold. When the token says X, X is right.**
