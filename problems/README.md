# SPC Problems Folder

**Purpose:** Written record of real production problems we are solving. Read these BEFORE jumping to a solution.

**Convention:**
- Each file describes ONE problem in depth — what users see, what's actually happening, why current code fails, customer impact, what NOT to break.
- **No solutions live in this folder.** Solutions go in `PLAN-*.md` files at the project root, referenced from each problem doc.
- Each problem has a numbered prefix (`01-`, `02-`, …) for ordering and easy reference.

---

## Open problems

| # | File | One-line summary | Status |
|---|---|---|---|
| 01 | [`01-unused-strings-electrical-noise.md`](./01-unused-strings-electrical-noise.md) | Empty PV ports show induction-leak voltage and SPC fires false alerts on them forever | Documented · solution pending |
| 02 | [`02-non-standard-orientation-peer-comparison.md`](./02-non-standard-orientation-peer-comparison.md) | Strings on east/west roofs, walls, or partial shade are flagged as "underperforming" because peer comparison treats them as identical to south-facing peers | Documented · solution pending |

---

## Why these problems matter together

Both problems share the same **root cause**: SPC has no install-time context per string. The system assumes every PV channel reported by an inverter API is:

- A real, physically-wired string (Problem 1 violates this — empty ports report noise)
- Oriented identically to its inverter siblings (Problem 2 violates this — different angles produce differently)
- Comparable to its peers via simple peer averaging (both problems break this assumption)

The **shared symptom** is **alert fatigue**:

> If a customer sees the same critical-red alert on PV2 every day for three weeks, they stop reading SPC alerts. When a real fault then appears on PV9, they miss it.

Alert fatigue is the most expensive product failure for a monitoring tool. Fixing it is more important than adding new features.

---

## What infrastructure already exists

Phase 1 of the panel-config feature gave us the `string_configs` table with composite primary key `(device_id, string_number)`. That table is the right home for the install-time metadata we need to add (`is_used`, `orientation`, etc.). **No new table needed.**

See `prisma/schema.prisma` model `string_configs` and the existing admin page at `/admin/plants/[plantCode]/strings`.

---

## What this folder is NOT

- ❌ Not a roadmap (use `BACKLOG.md` for that)
- ❌ Not a solution log (use `PLAN-*.md` for that)
- ❌ Not a changelog (use `CHANGELOG.md` for that)
- ❌ Not feature ideas — only documented production problems with real customer impact

If you have an idea but no concrete customer pain, it goes in `BACKLOG.md`, not here.
