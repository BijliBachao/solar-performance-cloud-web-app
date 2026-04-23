# SPC Landing Page — Design Spec

> **Purpose:** Single source of truth for every design decision on `app/page.tsx` (the public marketing landing page at `https://spc.bijlibachao.pk/`). If code contradicts this doc, **the doc is right** — fix the code.
>
> **Version:** v1 (2026-04-23) · **Scope:** `app/page.tsx` ONLY · dashboard + admin stay on DESIGN.md v3 (Solar Corporate).
>
> **Relationship to DESIGN.md:** This spec is the landing-page specialisation allowed by DESIGN.md §2.9 — solar-gold demoted, NVIDIA green introduced as signal colour, warm-cream canvas instead of pure white. Dashboard and admin continue to follow DESIGN.md v3 without any change.
>
> **Paired files:** `app/page.tsx` · `app/layout.tsx` · `app/opengraph-image.tsx` · `app/twitter-image.tsx` · `tailwind.config.ts` · `middleware.ts`

---

## Table of Contents

1. [Why this page exists](#1-why-this-page-exists)
2. [The 5 design systems we borrowed from](#2-the-5-design-systems-we-borrowed-from)
3. [Non-negotiable rules](#3-non-negotiable-rules)
4. [Colour system](#4-colour-system)
5. [Typography](#5-typography)
6. [Layout primitives](#6-layout-primitives)
7. [Section-by-section design rationale](#7-section-by-section-design-rationale)
8. [Signature patterns (applied everywhere)](#8-signature-patterns-applied-everywhere)
9. [Responsive strategy](#9-responsive-strategy)
10. [What we explicitly DID NOT copy](#10-what-we-explicitly-did-not-copy)
11. [Metadata & SEO](#11-metadata--seo)
12. [Open Graph / Twitter preview card](#12-open-graph--twitter-preview-card)
13. [Mini-dashboard discipline](#13-mini-dashboard-discipline)
14. [File map](#14-file-map)
15. [Maintenance & future changes](#15-maintenance--future-changes)

---

## 1. Why this page exists

The landing page at `https://spc.bijlibachao.pk/` is the **first impression** for a Pakistani commercial solar plant owner, engineer, or CFO. The page has ONE job: **convince a cold visitor to book a free site visit with our engineer.**

### Audience

- **Primary:** Plant managers and operations engineers at factories, textile mills, housing societies, and shopping malls with 10 kW – 5 MW installations.
- **Secondary:** CFOs / owners signing off on operational spend.
- **Tertiary:** Engineering consultants and multi-site operators.

### Target behaviour

- Above the fold: understand what SPC is in one sentence.
- Mid-scroll: see live/representative dashboard proof.
- Bottom third: trust the founder + parent brand, then convert.

### Design challenge

The version before this redesign was a conversion-optimised-checklist page — 7× repeated CTAs, 17 monotonous sections, two competing accent colours, 4 fake dashboards. Felt desperate, not polished. This redesign took the same content and restructured layouts per 5 well-known design systems to produce a **confident statement page** in the spirit of Stripe / Linear / Wise.

---

## 2. The 5 design systems we borrowed from

The user supplied five design-system reference files under `/home/mudassir/work/Ali/websites/untitled2/deisgn-system/`. Each of those five systems is known for distinct layout moves. We took the sharpest moves from each and left the mismatches behind.

### 2.1 NVIDIA — Accent as signal, never as fill

- **Take:** accent colour (#76B900 green) used as borders, underlines, icon tints, dots — **never** as button backgrounds or large surface fills.
- **Take:** weight 700 as the default for labels and navigation (bold-as-default voice).
- **Take:** industrial density — tight line heights, monospace numbers.
- **Leave:** aggressive black backgrounds. User explicitly rejected dark.

### 2.2 Vodafone — Monumental display + calm body

- **Take:** huge headline (7xl / 220px moments) paired with restful 16–18px body.
- **Take:** three-surface rhythm (cream editorial → divider band → dark institutional) — adapted: cream / white / cream-lifted / full-bleed green (skipping the dark panel).
- **Take:** full-bleed coloured bands as section dividers (the green statement band and final CTA band).
- **Leave:** pure red primary, rotated labels, dark institutional panels.

### 2.3 Wise — Confidence through typography + product shots

- **Take:** product shot in device frame (laptop mockup in hero).
- **Take:** dense bold typography (weight 600 body default, weight 700 interactive).
- **Take:** zig-zag stepped onboarding layout (How It Works).
- **Leave:** weight 900 display, OpenType contextual alternates, scale-on-hover animations.

### 2.4 Mastercard — Whitespace as structure + orbital portraits

- **Take:** warm cream canvas `#F8F7F6` instead of pure white.
- **Take:** asymmetric composition with 400–500 px whitespace between pieces (founder layout, IEC orbital).
- **Take:** eyebrow-dot pattern `• LABEL` above every section heading.
- **Take:** 20 px pill radius for CTAs; 40 px stadium for hero-scale surfaces.
- **Take:** orbital dashed arcs connecting elements (hero laptop, IEC badge).
- **Take:** circular portraits (50% radius) for founder photo.
- **Leave:** cream that conflicts with signed-in dashboard (we kept the landing on cream but dashboard still on white per DESIGN.md).

### 2.5 Pinterest — Masonry cards + warm neutrals

- **Take:** masonry / non-uniform card layouts (Three Pillars, mini-dashboards, case studies).
- **Take:** rounded cards (`rounded-2xl`, 16 px) — bigger than dashboard's `rounded-sm`.
- **Take:** plum-toned near-black text `#1A1A1A` instead of pure black.
- **Take:** depth from content + spacing, not from drop shadows.
- **Leave:** consumer-playful hover rotations, infinite-scroll grids, sand/olive secondary buttons.

---

## 3. Non-negotiable rules

These rules win over any other instruction. If something below contradicts them, **these rules are right.**

1. **No dark backgrounds.** Not `bg-black`, `#000`, slate-900, or institutional charcoal. Cream, white, and cream-lifted are the only surface colours. Dashboard and admin keep slate-900 where DESIGN.md allows; the landing page does not.
2. **Solar-gold is almost invisible on this page.** It appears only on (a) the Sun logo icon in nav + footer, (b) the SPC tile's gradient sun in the Parent Brand section, (c) the sparkline curve inside the big MiniDashboard, and (d) the "severe" band in the heatmap. Nowhere else. NVIDIA green is the single accent.
3. **NVIDIA green is a signal colour, never a button fill** except primary CTAs (Book Site Visit + nav button). It's used for: eyebrow dots, live pulse dots, trust checkmarks, progress bars, healthy heatmap cells, orbital arcs, pillar icon frames. The quiet restraint is the point — per NVIDIA rule.
4. **One CTA shape.** All buttons are `rounded-full` pills. No sharp `rounded-sm` on the landing page. Pill radius is Mastercard + Wise shared discipline.
5. **Eyebrow-dot opens every section.** `<EyebrowDot>LABEL</EyebrowDot>` at the top of every heading zone — Mastercard signature. No bare titles, no centered page-title layouts.
6. **Typography bold-as-default.** Body text uses `font-medium` (500). Interactive text uses `font-bold` (700). No 400. Bold body feels confident; thin body feels consumer.
7. **Mini-dashboard components stay slate.** They represent product UI and the real `/dashboard` is slate. Colour-mismatch on the landing is intentional — "marketing = warm cream, product = slate".
8. **Vertical rhythm is 128 px desktop / 96 px mobile** between sections. No 96 px or less on desktop. Mastercard whitespace discipline.
9. **No AI-generated images.** The whole page uses CSS / SVG / ImageResponse typography moments. Only real asset: `public/landing/reyyan.jpeg` (Reyyan's real headshot).

---

## 4. Colour system

### 4.1 Palette

All Tailwind tokens defined in `tailwind.config.ts`. Scoped to landing page per `DESIGN.md §2.9`.

| Token | Hex | Where used on landing |
|---|---|---|
| `bg-warm-cream` | `#F8F7F6` | **Main page canvas**, hero section bg, most section bgs |
| `bg-warm-cream-lifted` | `#F3F0EE` | Lifted panels (solution card, independence angle, case studies, founder section, capability hero cards) |
| `bg-white` | `#FFFFFF` | Content cards, nav bar, dashboard showcase frame, fault table, capability compact cards, parent brand product cards |
| `border-warm-divider` | `#E0E0D8` | All card borders, separator lines, horizontal dividers |
| `text-warm-text` | `#1A1A1A` | Headings, main data values (plum-black per Pinterest) |
| `text-warm-body` | `#454545` | Body paragraphs, descriptions |
| `text-warm-muted` | `#7A7A7A` | Captions, eyebrow labels, micro copy (matches Vodafone `#7e7e7e`) |
| `bg-bb-green-500` | `#76B900` | **Primary CTA fill** (Book Free Site Visit), live-pulse dots, statement band, final CTA band, heatmap healthy cells |
| `bg-bb-green-50` | `#F5FBE5` | Subtle success tint (live badges, healthy-state backgrounds) |
| `bg-bb-green-100` | `#E7F5BF` | Soft green on the statement-band text |
| `text-bb-green-600` / `-700` | `#5F9400` / `#4B7500` | Healthy % numbers, eyebrow-dot labels in emphasis |
| `border-bb-green-500` | `#76B900` | Accent ring on SPC parent tile ("You are here"), IEC orbital badge ring |
| Status red `bg-red-50` / `text-red-700` / `bg-red-500` | Tailwind defaults | Problem card, critical alerts, "dead" heatmap cells. Inherited from DESIGN.md §2.4 status system. |
| Status amber | Tailwind defaults | Warning alerts, "warning" heatmap cells. Inherited. |

### 4.2 Rules

- **NVIDIA green is the single accent.** Solar-gold is demoted. Red/amber are status, not accent.
- **Text pairs:** heading `text-warm-text` → body `text-warm-body` → muted `text-warm-muted`. No mixing slate-* with warm-* on landing.
- **Borders over shadows.** Cards use `border border-warm-divider`. Shadow is used only on (a) the big dashboard showcase container, (b) laptop mockup, (c) founder portrait, (d) final CTA pill.
- **Hover state:** `hover:border-bb-green-400`. No colour change on buttons on hover — only subtle translate/shadow.

### 4.3 Why NOT teal

Early synthesis proposed a teal (`#18A038`). We rejected: user explicitly liked NVIDIA green, and teal would be a third brand colour in the ecosystem. Keeping the landing on `#76B900` matches the Bijli Bachao parent-brand origin design and doesn't introduce a new colour.

---

## 5. Typography

### 5.1 Font

- **Sans:** `Inter` via `next/font/google`. Same font as the dashboard — consistent across marketing and product.
- No monospace font declared at landing level; numeric text uses `font-mono` which cascades to Tailwind default mono (`ui-monospace`).

### 5.2 Scale

| Role | Tailwind | px | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| **Hero headline** | `text-[42px] sm:text-5xl md:text-6xl lg:text-[64px]` | 42 → 64 | 700 | 1.05 | -0.02em |
| **Section H2** | `text-3xl md:text-4xl lg:text-5xl` | 30 → 48 | 700 | 1.1 | -0.02em |
| **Vodafone oversize number** | `text-[110px] sm:text-[140px] md:text-[180px] lg:text-[220px]` | 110 → 220 | 700 | 0.85 | -0.05em |
| **Social-proof dominant metric** | `text-[72px] md:text-[96px] lg:text-[120px]` | 72 → 120 | 700 mono | 0.9 | -0.04em |
| **Case-study featured metric** | `text-[72px] md:text-[96px]` | 72 → 96 | 700 mono | 0.9 | -0.04em |
| **Section sub-heading** | `text-xl md:text-2xl` | 20 → 24 | 700 | 1.3 | normal |
| **Body Large** | `text-base md:text-lg` | 16 → 18 | **500** | 1.5 | normal |
| **Body** | `text-sm` | 14 | 500 | 1.5 | normal |
| **Micro** | `text-xs` | 12 | 500 | 1.5 | normal |
| **Eyebrow (via `<EyebrowDot>`)** | `text-[11px] font-bold uppercase` | 11 | 700 | 1.3 | +0.12em |
| **Button** | `text-sm font-bold` | 14 | 700 | 1.25 | normal |

### 5.3 Principles

- **Weight 500 is the baseline for body text.** 400 reads too thin for a serious B2B page. NVIDIA + Wise agreed on this; we adopted it.
- **Weight 700 for every interactive or emphasised element.** Buttons, links, labels, headings.
- **Monospace only for numbers** — metrics, counts, URLs. Mastercard doesn't use mono; we do because our product is data-driven and it reinforces the "engineering-led, not sales-led" Bijli Bachao voice.
- **Negative letter-spacing on display type** (-0.02em / -0.04em / -0.05em) — standard at large sizes, per Wise + Vodafone practice.
- **UPPERCASE only at ≤12px.** Never uppercase the H1/H2. Mastercard + NVIDIA unanimous.

---

## 6. Layout primitives

Three reusable components live at the bottom of `app/page.tsx`. Never ship landing-page work without re-using these or extending them.

### 6.1 `<EyebrowDot>`

Opens every section. One line, uppercase, tracked 0.12em, with a 6×6 `#76B900` dot to the left.

```tsx
<span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-warm-muted">
  <span className="w-1.5 h-1.5 bg-bb-green-500 rounded-full" />
  {children}
</span>
```

**Source:** Mastercard §4. **Purpose:** section wayfinding, single consistent pattern across 17 sections.

### 6.2 `<LaptopMockup>`

CSS-only laptop frame rendering product shots in the hero. No image asset. Warm-text body + rounded-t-xl screen area + base bar. Accepts children that fill the 16:10 screen area.

**Source:** Wise product-shot discipline. **Purpose:** gives the hero an immediate "this is a product" anchor without requiring AI or stock imagery.

### 6.3 `<HeroDashPeek>`

A compact, fleet-overview-style dashboard rendered inside the laptop mockup. Different from the big `<MiniDashboard>` below (which focuses on a single plant). The duality means the hero + §5 showcase deliver two moments, not a duplicate.

**Composition:**
- Top bar: Sun logo + "Fleet overview · 48 plants" + live badge
- 4 KPI chips on a warm cream background
- Mini solar sparkline (re-uses the same SVG path shape as the main sparkline, smaller)
- 6 string bars with % readings

### 6.4 Borrowed primitives (already existed)

- `<MiniDashboard>` — full big fleet dashboard (Mall of Multan, 12 strings, 24h sparkline, active alert)
- `<MiniAlertFeed>` — live alerts feed (5 alerts with severity pills)
- `<MiniPlantDetail>` — plant drill-down (Faisalabad Mill, 89% health, 6 bars)
- `<MiniHeatmap>` — 6×7 heatmap (PV7 narrative)
- `<Sparkline>` / `<MiniSparkline>` — solar generation curves
- These are still slate-themed — they represent product UI, not marketing. See §13.

---

## 7. Section-by-section design rationale

Full source mapping: each section's heading comment in `app/page.tsx` matches the section number below.

### §1 Nav

- **Position:** sticky top, `bg-warm-cream/90 backdrop-blur`.
- **Left:** logo (solar-gold Sun icon + wordmark + "by BijliBachao.pk" sublabel).
- **Middle:** 4 anchor links (Demo, How It Works, Founder, Bijli Bachao). Hidden on mobile.
- **Right:** Sign In link + Book Free Site Visit pill (bb-green-500).
- **Rationale:** Mastercard nav pattern — clean, always-visible CTA, small wordmark pair.

### §2 Hero — Asymmetric 60/40

- **Layout:** CSS Grid `lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]` — headline left (60%), laptop mockup right (40%).
- **Left column:** `<EyebrowDot>` → 64px headline with mixed-weight span (bold + regular) → 18px subhead → 2 pill CTAs (green solid + outline) → 3 trust checkmarks.
- **Right column:** `<LaptopMockup>` wrapping `<HeroDashPeek>`; thin dashed bb-green orbital arc behind it (SVG, opacity 0.7, 1 px stroke, 2-4 dash pattern).
- **Background:** subtle bb-green + warm-gold radial gradients, 10% / 5% opacity respectively.
- **Rationale:** centred heros look conservative and consumer. Asymmetric with an in-context product shot is the Wise / NVIDIA B2B signal — "this is a tool, here's what it looks like". The orbital arc is a Mastercard trademark.

### §3 Dashboard Showcase — Wise product shot enlarged

- **Layout:** max-w-6xl container, eyebrow-dot + "See it live" + "Every string. One screen." heading + the full `<MiniDashboard>` floating on warm cream.
- **Purpose:** the showcase is the natural follow-up to the hero tease. User specifically requested dashboard visibility right after hero.
- **Rationale:** Wise puts product-UI photography directly after its hero. We adapted with in-HTML rendering, which looks more alive than static screenshots.

### §4 Three Mini-Dashboards — Pinterest masonry

- **Layout:** `grid-cols-1 lg:grid-cols-3` with `<MiniAlertFeed>` spanning `row-span-2` (left, tall) and `<MiniPlantDetail>` + `<MiniHeatmap>` each `col-span-2` (right, wide). Fills completely — no empty row bug.
- **Story thread:** PV7 appears in all three (flagged in alerts → drilled into in plant detail → declines visibly in heatmap).
- **Rationale:** Pinterest masonry signals product depth more than 3 identical cards would.

### §5 Three Pillars — Pinterest masonry (1 tall + 2 short)

- **Layout:** `grid-cols-1 lg:grid-cols-[1fr_1fr]`. LEFT: one tall pillar (Independent Second Opinion — our sharpest weapon per competitor research). RIGHT: 2-row grid with Catch Losses Fast top + Every Brand Unified bottom.
- **Visual hierarchy:** the tall card uses a larger 56px `<Shield>` icon in a 2xl radius container, 3xl heading, pt-6 stat strip. The short cards use 44px icons + lg heading inline.
- **Rationale:** Pinterest mixed card sizes create natural visual hierarchy where an identical 3-col grid would read as a checklist.

### §6 Full-bleed Green Statement Band

- **Layout:** 80 px tall, `bg-bb-green-500`, centred white 4xl text "We watch every string. So you don't have to." No button.
- **Rationale:** Vodafone divider band — breaks the visual monotony of scrolling through cards. One pure brand moment, no clutter, no CTA.

### §7 Social Proof — Vodafone ticker

- **Layout:** `grid-cols-[minmax(0,2fr)_minmax(0,3fr)]`. LEFT: dominant `25,000+` metric at 120px with its label + rationale copy. RIGHT: 3 satellite stats (48 plants, 44/48, 14+ yrs) with a left-border separator on md+.
- **Footer:** inverter brand wordmarks (Huawei · Solis · Growatt · Sungrow) with a "WORKS WITH" label.
- **Rationale:** Vodafone ticker pattern — 1 monumental number + 3 supporting numbers = asymmetric emphasis > 4 equal tiles.

### §8 Problem / Solution — Mastercard asymmetric

- **Layout:** `grid-cols-[minmax(0,4fr)_minmax(0,7fr)]`. LEFT (35%): problem as plain typography, no card, red eyebrow-dot + heading + bulleted ✗ list. RIGHT (60%): solution as lifted-cream card with green eyebrow-dot + heading + ✓ list.
- **Rationale:** Mastercard whitespace discipline + intentional asymmetry. The solution visually outweighs the problem by virtue of card presence.

### §9 Independence Angle — monumental statement

- **Layout:** 3xl → 6xl display type on warm-cream-lifted full-width band. The "what they want you to see" phrase is struck through with red decoration; the "SPC shows what's actually happening" phrase is in bb-green-600.
- **Trust chips:** 3 pill chips (No inverter to sell / No shortfall to defend / No agenda but yours) at the bottom.
- **Rationale:** Vodafone monumental display; the struck-through/green-override typography expresses opposition more powerfully than paragraph prose could.

### §10 Oversize Number Moment — `2.2 MW`

- **Layout:** full-bleed warm-cream section, `<EyebrowDot>` → single `2.2 MW` number at 110px-220px (mobile-desktop) → one-sentence caption.
- **Rationale:** Vodafone §4 monumental single-metric moment. Gives the page a "stop and stare" beat between information-dense sections.

### §11 Capabilities — Mastercard asymmetric (2 hero + 4 compact)

- **Layout:** 2-column grid for HERO cards (Per-String Health + Fault Diagnosis Engine — expanded copy, 8-10 px padding, larger icon in a 12x12 white container). Below: 4-column grid of COMPACT cards (Intelligent Alerts, Performance Analysis, Shading Detection, Multi-Brand Dashboard).
- **Rationale:** Mastercard mixed hierarchy — two headline capabilities get double the visual weight + word count; four supporting ones are tighter.

### §12 How It Works — Wise zig-zag

- **Layout:** 3 rows, each `grid-cols-2`. Row 1: giant "01" on left, step description on right. Row 2: flipped (`order-2` on the number via CSS). Row 3: flipped back.
- **Giant number:** `text-[120px] md:text-[160px] font-mono` in `text-warm-divider` (very low contrast) — decorative, not readable.
- **Rationale:** Wise onboarding layout. The flipping rhythm breaks the natural "3 equal cards" trap.

### §13 Case Studies — Pinterest masonry (1 featured + 2 compact)

- **Layout:** `grid-cols-5`. Featured card spans `col-span-3` with its metric at 72-96px. 2 compact cards span `col-span-2` total in a 2-row grid (`grid-rows-2`).
- **Rationale:** Pinterest masonry. The featured case gets double weight because 32% is our strongest outcome metric.

### §14 Fault Detection Table

- **Layout:** clean table with 3 columns (Fault / Pattern / Detection), warm-cream-lifted header, 7 rows each led by a small bb-green bullet dot.
- **Rationale:** comparison data is actually honest in a table — no need to invent a grid. Just retheme the defaults.

### §15 Who We Serve

- **Layout:** 6-segment grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) of cream-lifted cards on a white section.
- **Rationale:** 6 customer segments benefits more from a scannable grid than from masonry — reader wants to find their industry fast.

### §16 IEC 61724 — Mastercard orbital badge

- **Layout:** `grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`. LEFT: eyebrow + H3 + 2 paragraphs. RIGHT: a 240px (192 on mobile) circular badge with 4px bb-green ring, containing shield icon + "ALIGNED TO IEC 61724" + subtext. Behind the badge: 2 concentric dashed bb-green arcs (SVG) at 150px and 180px radius with opacity 0.4/0.6.
- **Rationale:** Mastercard orbital signature — the dashed arcs simulate radar/precision. The circle gives a badge-like moment without requiring a real logo.

### §17 Founder — Mastercard asymmetric (REAL photo)

- **Layout:** `grid-cols-[minmax(0,2fr)_minmax(0,3fr)]`. LEFT: Reyyan's real headshot (`public/landing/reyyan.jpeg`) in a 256-320px perfect circle with `ring-4 ring-white` and deep warm-text shadow; a satellite 56-80px bb-green CheckCircle badge at bottom-right. RIGHT: eyebrow → 4xl-5xl name → uppercase subtitle → italic quote with a 4px bb-green left border → 2x2 credentials grid → "Previously consulted for" row (USAID · Schlumberger · Diversey · +50).
- **Rationale:** Mastercard portrait-led founder section. The asymmetric whitespace around the circle photo signals gravity and seniority. The satellite badge is a Mastercard pattern where a secondary shape "docks" on the primary.
- **Decision on photo vs monogram:** user provided real photo; monograms (`RN` letters) read as placeholders on a B2B page. Real photo is strictly better for trust.

### §18 Parent Brand — SPC featured + Vodafone ticker

- **Layout:** `grid-cols-5`. Featured SPC card spans `col-span-3`, "You are here" pill (bb-green-500 with white text), bb-green-500 2px border, 14×14 solar-gold gradient Sun icon, 2xl-3xl title, full description, mono URL. Compact cards span `col-span-2` (Wattey + Meter Billing) in a 2-row grid.
- **Stats below:** Vodafone ticker — `14+ yrs` dominant on left, 3 satellites on right (100+ installations, 0.96 GWh, 4 + 🇦🇺).
- **Trust chips:** 3 pill chips at the bottom for IEC 61724 / IEC 62446-1 / Engineer-led.
- **Rationale:** reinforces that SPC is the hero product of a larger, credible company. Vodafone stat ticker again gives asymmetric emphasis.

### §19 Final CTA — full-bleed green band

- **Layout:** `bg-bb-green-500`, `grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`. LEFT: eyebrow in bb-green-100 → white 5xl headline → bb-green-50 subhead → Reyyan's real photo as 32px circle inside a translucent white chip reading "**Reyyan** responds personally within 2 hours". RIGHT: two stacked CTAs (Book Free Site Visit white-on-green pill + WhatsApp outline pill).
- **Rationale:** Vodafone full-bleed band signature close + Mastercard trust-move (real person + name + timing promise). Commits the reader after 18 sections of evidence.

### §20 Footer

- **Layout:** 4-column grid (Brand · Product · Bijli Bachao · Contact) on warm-cream with warm-divider border at top. Bottom row: copyright + standards + "Made with engineering, not hype."
- **Rationale:** conventional 4-column B2B footer. Hover states use bb-green-700 text, consistent with link convention.

---

## 8. Signature patterns (applied everywhere)

These 8 patterns appear across many sections and give the page its consistent voice. When adding a new section, apply them.

1. **Eyebrow-dot before every heading** — `<EyebrowDot>LABEL</EyebrowDot>` (Mastercard)
2. **Pill CTAs, 20-24px radius (`rounded-full`)** (Mastercard + Wise unanimous)
3. **Warm cream canvas, white cards, cream-lifted for featured cards** (Mastercard + Pinterest)
4. **Asymmetric grids** (NVIDIA + Mastercard) — `[minmax(0,3fr)_minmax(0,2fr)]` or `col-span-3` + `col-span-2` patterns. No 3-identical-cards defaults.
5. **Monumental single-number moments** (Vodafone) — oversize metric + tiny eyebrow + massive whitespace.
6. **Orbital dashed arcs** (Mastercard) — thin SVG dashed curves connecting visual elements.
7. **Green signal, never fill** (NVIDIA) — accent colour on borders/dots/icons, never as a large colour block except the 2 intentional statement bands.
8. **128px / 96px vertical rhythm** (Mastercard) — section padding `py-24 md:py-32`.

---

## 9. Responsive strategy

### 9.1 Breakpoints (Tailwind defaults)

- `sm`: 640 px
- `md`: 768 px
- `lg`: 1024 px
- `xl`: 1280 px

### 9.2 Default adaptations

- **Hero:** 60/40 split on lg+ becomes stacked on md-; laptop mockup sits below headline.
- **Social-proof ticker:** 2-column md+ becomes stacked.
- **Problem/Solution asymmetric:** `[4fr_7fr]` becomes stacked on md-.
- **Masonry sections:** all collapse to `grid-cols-1` on mobile. Tall/wide spans only activate at lg+.
- **How It Works zig-zag:** the `order-2` flipping is disabled on md- (stacks uniformly).
- **Founder asymmetric:** 2:3 on md+ becomes stacked with photo on top.
- **Mini-dashboard KPI strip:** 4-col on md+ becomes 2×2 grid.
- **Mini-dashboard string grid:** 12 cols → 6 cols at sm → 4 cols on mobile.
- **Heading scale:** hero `text-[42px]` on mobile → `text-[64px]` on lg. Section H2 `text-3xl` → `text-5xl`.

### 9.3 Oversize number responsive

The `2.2 MW` monumental moment scales down on mobile (`text-[110px]`) so it doesn't cause overflow. Same for the 25,000+ social-proof metric.

---

## 10. What we explicitly DID NOT copy

| Source | Pattern | Why not |
|---|---|---|
| NVIDIA | Pure black background, aggressive dark UI | User rejected dark for the landing |
| NVIDIA | 2-px sharp radius on CTAs | We standardised on Mastercard pill |
| Vodafone | Red primary colour | Would clash with bb-green accent |
| Vodafone | Rotated section labels | Gimmicky for B2B solar |
| Wise | Weight 900 display type | Consumer, not B2B |
| Wise | Scale-on-hover button animations | Too playful |
| Mastercard | Cream across the whole product | Dashboard stays white per DESIGN.md; only landing gets cream |
| Mastercard | Weight 450 body | Inter doesn't support 450 cleanly |
| Pinterest | Masonry grid for every section | Masonry only where it earns its weight; Who We Serve stays a regular grid |
| Pinterest | Thick image borders | We don't have enough images for this to matter |
| Omnidian (competitor) | 2 GW / 250 clients scale claims | SPC is 2.2 MW — would look fake |
| Omnidian | Performance guarantee (95%) | We don't offer a financial guarantee |
| Raptor Maps | Drone / aerial imagery | Not our delivery mechanism |
| AlsoEnergy | "Edge-to-cloud" enterprise jargon | Wrong register for SMB |
| TrackSo | Hardware-required positioning | We pivoted TO engineer-installed (opposite direction) |

---

## 11. Metadata & SEO

All metadata lives in `app/layout.tsx` via the `export const metadata: Metadata` object.

### 11.1 Title

**Default:** `"Solar Performance Cloud — Detect underperforming solar strings before they cost you money"` (91 chars).

**Template for inner pages:** `%s | Solar Performance Cloud`.

### 11.2 Description

**Single source of truth:** `const DESCRIPTION` at the top of `layout.tsx`.

> "Pakistan's first string-level solar monitoring. Our engineers install a compact monitoring device at your plant — live data every 5 minutes across Huawei, Solis, Growatt, and Sungrow inverters. A Product of Bijli Bachao."

240 chars — slightly over Google's 160 char ideal but the truncation still shows all 4 brands + the Bijli Bachao attribution.

### 11.3 Keywords

14 terms, Pakistan- and industry-focused:

```
solar monitoring Pakistan · PV string monitoring · commercial solar Pakistan ·
industrial solar monitoring · Huawei FusionSolar alternative · SolisCloud monitoring ·
Growatt monitoring · Sungrow iSolarCloud · IEC 61724 · IEC 62446 ·
Bijli Bachao · solar fault detection · rooftop solar Lahore · solar O&M Pakistan
```

### 11.4 Author / publisher

- `authors: [{ name: 'Engr. Reyyan Niaz Khan', url: 'https://bijlibachao.pk' }]`
- `creator: 'BijliBachao.pk'`
- `publisher: 'BijliBachao.pk'`
- `applicationName: 'Solar Performance Cloud'`
- `category: 'Solar Energy Monitoring'`

### 11.5 Robots

```
index: true, follow: true
googleBot: { 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 }
```

### 11.6 Canonical

`https://spc.bijlibachao.pk` — prevents the sign-in redirect URL from ranking.

### 11.7 Viewport

```ts
themeColor: '#F8F7F6'       // matches warm-cream canvas
colorScheme: 'light'
width: 'device-width'
initialScale: 1, maximumScale: 5
```

---

## 12. Open Graph / Twitter preview card

### 12.1 Generation

`app/opengraph-image.tsx` uses Next.js `ImageResponse` to generate a 1200×630 PNG **from pure JSX + inline styles + inline SVG**. No AI asset. No external image dependency.

`app/twitter-image.tsx` re-exports the same image for `summary_large_image` Twitter cards.

### 12.2 Composition

```
┌─────────────────────────────────────────────┐  warm-cream #F8F7F6
│                                  ╭────╮      │
│                               ╭──╯    ╰──╮   │  <- dashed orbital arcs (bb-green)
│  • A PRODUCT OF BIJLI BACHAO ·  PAKISTAN'S   │  <- eyebrow with green dot
│                                               │
│  Detect underperforming                       │
│  solar strings                [82px 700 #1A1A1A]
│  before they cost you money.  [82px 400 #454545]
│                                               │
│                                               │
│  [▶ Book a Free Site Visit →]    spc.bijlibachao.pk
│  (22px 700 white-on-bb-green-500 pill)       │
└─────────────────────────────────────────────┘
```

### 12.3 Middleware

`middleware.ts` exposes `/opengraph-image(.*)` and `/twitter-image(.*)` as public routes. Without this, Clerk auth would redirect social preview bots to `/sign-in` and kill the card.

### 12.4 Caching

Next.js adds a query hash (`?c63fe2a29caa0e92`) to the og:image URL so bots re-fetch when the image source changes. Social platforms (WhatsApp, LinkedIn) cache aggressively — to force refresh, use the platform's cache debugger:

- Facebook / WhatsApp: https://developers.facebook.com/tools/debug/
- LinkedIn: https://www.linkedin.com/post-inspector/
- Twitter: https://cards-dev.twitter.com/validator

---

## 13. Mini-dashboard discipline

### 13.1 Why they stay slate

The 4 mini-dashboard components (`MiniDashboard`, `MiniAlertFeed`, `MiniPlantDetail`, `MiniHeatmap`) visually represent what the visitor will see **after they sign in**. The real `/dashboard` uses slate backgrounds, white cards, solar-gold accents. If we warmed these mini-dashboards up to match the landing page, visitors would sign in and feel whiplash.

**The separation is intentional:**
- Warm cream + bb-green = **marketing** content
- Slate + solar-gold = **product** surfaces

### 13.2 Exceptions

The mini-dashboards on the landing DO replace emerald-* status colour with `bb-green-*` for healthy indicators. This is a small nod to landing-brand consistency without breaking the slate product look:

```ts
healthy: { bar: 'bg-bb-green-500', text: 'text-bb-green-700', bg: 'bg-bb-green-50', border: 'border-bb-green-200' }
```

On the real `/dashboard`, the `STATUS_STYLES` lookup in `lib/design-tokens.ts` uses `emerald-*` — that stays unchanged.

### 13.3 Future

If we ever retheme the product dashboard to NVIDIA-green-based, the mini-dashboard components become a shared source of truth. Today they're a small exception. Document if we ever sync them up.

---

## 14. File map

| File | Purpose |
|---|---|
| `app/page.tsx` | The landing page itself — all 19 sections + 4 mini-dashboard components + primitives (`<EyebrowDot>`, `<LaptopMockup>`, `<HeroDashPeek>`, `<Sparkline>`, `<MiniSparkline>`) |
| `app/layout.tsx` | Root metadata + viewport + `<html>` + `<body>` |
| `app/opengraph-image.tsx` | Generated 1200×630 OG PNG via Next.js `ImageResponse` |
| `app/twitter-image.tsx` | Re-export of opengraph-image for `summary_large_image` Twitter cards |
| `tailwind.config.ts` | `warm-*` and `bb-green-*` landing-only tokens |
| `middleware.ts` | Public-route matcher for `/opengraph-image` + `/twitter-image` (and the existing health endpoints) |
| `DESIGN.md` | Project-wide design system (§2.9 documents the landing-page exception) |
| `LANDING-DESIGN.md` | This document |
| `public/landing/reyyan.jpeg` | Founder's real headshot, used in §17 + §19 |

---

## 15. Maintenance & future changes

### 15.1 Adding a new section

Before you add anything to `app/page.tsx`:

1. Ask: does this earn its place? We have 19 sections already. Cut before add.
2. If yes, which of the 8 signature patterns does it use? Start from one.
3. Prefer mass-hierarchy asymmetry over symmetry. No 3-identical-card defaults.
4. Lead with `<EyebrowDot>`. Rhythm demands it.
5. Pick a section background: warm-cream (default), white, or warm-cream-lifted. Avoid introducing a new bg colour without an entry here.
6. Build responsive at `grid-cols-1` first, then add `md:` / `lg:` patterns.
7. Run `bash scripts/audit-pre-deploy.sh` before pushing.

### 15.2 Changing colours

Landing-page colours live in `tailwind.config.ts` under `warm-*` and `bb-green-*`. Dashboard / admin colours live in `solar-gold-*`. DO NOT:

- Use `bb-green-*` classes outside `app/page.tsx` (validator will allow it but it'll break visual consistency with the signed-in product).
- Use `warm-*` tokens outside `app/page.tsx` for the same reason.
- Introduce a third accent colour. Two (solar-gold for product, bb-green for landing) is the max.

### 15.3 Updating the OG image

`app/opengraph-image.tsx` is the source. After editing:

- Run `npm run build` locally (or verify on EC2) — the image is regenerated at build time.
- Share the landing URL into WhatsApp/LinkedIn to eyeball the new preview.
- If caching is an issue, run through the social debuggers listed in §12.4.

### 15.4 Updating the headshot

Replace `public/landing/reyyan.jpeg` with a new file of the same name. Same dimensions recommended (square, ≥512×512). The circular crop will handle the rest.

### 15.5 When the product dashboard colour is ever retoned to green

This is a big if. If the product moves off solar-gold:

1. Update DESIGN.md §2.1 (brand colour section).
2. Update `tailwind.config.ts` — likely by pointing `solar-gold` DEFAULT to `#76B900` and updating the ramp.
3. Run the validator — it blocks `#76b900` in `/dashboard` scope; you'll need to rewrite check 5.6 in `scripts/validate-centralized.sh`.
4. Update this document's §13 (mini-dashboard discipline) — the separation is gone.

### 15.6 Keep content prose out of this file

If the landing page copy changes (headlines, features, case studies), update the content in `app/page.tsx` but DO NOT paste the updated copy here. This doc is about **design decisions**, not marketing prose.

---

## Credits

- **Design systems referenced:** NVIDIA, Vodafone, Wise, Mastercard, Pinterest (docs under `/home/mudassir/work/Ali/websites/untitled2/deisgn-system/`).
- **Competitor analysis:** `/home/mudassir/work/Ali/websites/untitled2/w/docs/answerr/SPC/SPC-COMPETITOR-RESEARCH.md`.
- **Brand research:** compiled from `/home/mudassir/work/Ali/websites/untitled2/w/website-bb/docs/` and `/home/mudassir/work/Ali/websites/untitled2/w/docs/`.
- **Parent design system:** `DESIGN.md` (Solar Corporate v3).
- **Founder:** Engr. Reyyan Niaz Khan, Bijli Bachao.

*Last updated: 2026-04-23 · paired with `app/page.tsx` commit `5fab0f9`.*
