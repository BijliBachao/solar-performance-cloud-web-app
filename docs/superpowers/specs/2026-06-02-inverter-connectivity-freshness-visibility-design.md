# Inverter Connectivity & Data-Freshness Visibility

**Date:** 2026-06-02
**Status:** Approved (design) — pending spec review → implementation plan
**Author:** Ali Ahmed + Claude

---

## 1. Problem

When the 5 CSI inverters froze on 2026-05-25, **nobody could see it from the UI.**
The dashboards looked normal for 6 days. The freeze was only found by querying the
database directly. Two root causes:

1. We poll each inverter every 5 min and stamp the row with **our** clock time, so
   stored data always looks "recent" — even when the inverter is returning the
   **same frozen numbers** every cycle.
2. We never persist the vendor's **own** "data as of HH:MM" timestamp (CSI
   `lastReportTime`, Solis `dataTimestamp`, Growatt `last_update_time`, …). That
   stamp is the only reliable signal that a feed has stalled. We read it in the
   poller and throw it away.

**Goal:** make "from what time are we not getting data, and for which inverter"
visible to any operator on the plant page and the NOC — without a DB query.

## 2. Goals / Non-goals

**Goals**
- Persist each inverter's vendor data-timestamp every poll.
- Per-inverter connectivity status: **Live / Frozen / Offline / Idle(night)**.
- Plant page (`/admin/plants/[code]`): show plant "data last received" + per-inverter
  name, provider, model, status, and "vendor last data: HH:MM (Xh ago)".
- NOC (`/admin/noc`): a **connectivity donut** (Live / Frozen / Offline) beside the
  existing health donut, with slices that filter the table to those inverters.

**Non-goals (out of scope for this spec)**
- Alerting/notifications on frozen feeds (Sentry/email) — separate P1 work.
- Changing the string-health algorithm or the existing health donut.
- Per-string freshness (we operate at the inverter/device level here).
- Historical freshness charts / uptime SLA reporting.

## 3. Status model (single source of truth)

Add one pure function to `lib/string-health.ts` (the centralization rule requires
all classification logic to live there):

```
type ConnectivityStatus = 'live' | 'frozen' | 'offline' | 'idle'

classifyConnectivity(
  vendorLastDataAtMs: number | null,   // devices.vendor_last_data_at (epoch ms) or null
  sunUp: boolean,                      // from lib/solar-geometry.ts for the plant lat/long
  nowMs: number = Date.now(),
): ConnectivityStatus
```

Rules (evaluated in order):

| Result | Condition | Meaning |
|---|---|---|
| `live` | `vendorLastDataAtMs != null && nowMs - vendorLastDataAtMs < VENDOR_FEED_STALE_MS` | vendor data is fresh (< 2 h) |
| `idle` | not live **and** `!sunUp` | night / no sun — no data is expected, not an alarm |
| `frozen` | not live **and** `sunUp` **and** `vendorLastDataAtMs != null` | we HAD data but it stalled ≥ 2 h ago during daylight (the CSI case) |
| `offline` | not live **and** `sunUp` **and** `vendorLastDataAtMs == null` | no vendor data at all during daylight (never reported / disconnected) |

- **Threshold = `VENDOR_FEED_STALE_MS` (2 h)** — reuse the existing constant, the same
  one the write-gate uses. Keeps "frozen" consistent everywhere and avoids
  false-positives on slow-but-live feeds (e.g. the Solis inverter that advances its
  `dataTimestamp` only every ~15–45 min stays **live**).
- **Sun gate** uses the existing `lib/solar-geometry.ts` with the plant's lat/long.
  Without it the whole fleet would read "offline" every night.
- Pure, deterministic, fully unit-testable. No DB or clock coupling beyond the
  injectable `nowMs`.

## 4. Data model

Additive, safe for `prisma db push` (nullable column, no default backfill needed):

```prisma
model devices {
  ...
  vendor_last_data_at  DateTime?   // vendor's own "data as of" time (epoch from API)
}
```

- Nullable: existing rows start `null` → classified `offline` during day / `idle` at
  night until the next poll populates it. Self-heals within one cycle.
- No data migration required.

## 5. Poller changes (write path)

Each poller persists `vendor_last_data_at` from the vendor's own field, **as early as
possible — before any freshness gate's early-return** — so a *frozen* inverter still
records its true (stale) last-data time and the UI can show "frozen since HH:MM".

| Provider | Vendor field | Status |
|---|---|---|
| CSI | `lastReportTime` (`"YYYY-MM-DD HH:MM:SS"`, also seen `+08:00` suffixed) | already read in `processCsiDevice` |
| Solis | `dataTimestamp` (ms epoch) | already captured on `SolisInverterDetail` |
| Growatt | `last_update_time` / `lastUpdateTime` | **client does not extract yet — add** |
| Huawei | real-time KPI `collectTime` (ms epoch) — **verify exact field during impl** | TBD-verify |
| Sungrow | device real-time time field — **verify exact field during impl** | TBD-verify |

Implementation notes:
- Parse to a `Date`; store via a single `prisma.devices.update`. Where a poller already
  issues a device update (CSI model/max_strings), fold `vendor_last_data_at` into it to
  avoid an extra write; otherwise issue a small dedicated update.
- For CSI/Solis the value comes from the same response the freshness gate inspects, so
  record it in the same place the gate reads it (even on the stale/duplicate branch, so
  the stored value reflects the real last-data time).
- Huawei/Sungrow exact field names are verified by a live probe in the implementation
  plan (same approach used to confirm Solis `dataTimestamp`). If a provider truly
  exposes no per-device data timestamp, fall back to `last_synced` and document it.

## 6. API changes

- **`/api/plants/[code]`** (`route.ts`): include `vendor_last_data_at` in the per-device
  payload (it already returns devices with `provider`, `model`, `last_synced`). Compute
  and return `connectivity` per device using `classifyConnectivity` + the plant's
  sun state. Plant-level `last_data_at` is already returned.
- **`/api/admin/string-health-donut`** (NOC): add a fleet connectivity rollup —
  per-inverter `{deviceId, plantCode, inverterName, provider, vendor_last_data_at,
  connectivity}` and aggregate counts `{live, frozen, offline, idle}`. Reuse the
  existing devices join already present in the donut loader.

## 7. UI changes

### 7.1 Plant page (`components/shared/PlantDetailView.tsx`)
- **Header:** "Data last received: 2 min ago" (surface the already-fetched
  `last_data_at`; red/amber when stale).
- **Per inverter** (`InverterDetailSection`): show **name · provider badge · model**, a
  connectivity status chip (Live/Frozen/Offline/Idle), and **"vendor last data:
  HH:MM (Xh ago)"**. Frozen → amber chip + "feed stalled since …".
- Status chip styling comes from `lib/design-tokens.ts` `STATUS_STYLES` (extend with
  `frozen` / `idle` keys if not present — no hardcoded colors).

### 7.2 NOC (`app/admin/noc/page.tsx`)
- Add a **connectivity donut** next to the health donut, slices Live / Frozen / Offline
  (Idle shown as a muted count beneath, excluded from the 3 slices since it's
  expected at night). Built on the existing `DonutCore` primitive.
- Slices **click-to-filter** the existing table to the inverters in that bucket (same
  interaction pattern as the health donut), so "4 frozen" drills to exactly which.

## 8. Testing

- **Unit (`lib/__tests__`):** `classifyConnectivity` — live, frozen, offline, idle; the
  2 h boundary (strict `<`); night-vs-day; null vendor timestamp; the slow-Solis case
  (15–45 min old → still live).
- **Poller tests:** assert each poller writes `vendor_last_data_at` from the mocked
  vendor field, including on the stale/duplicate gate branch (CSI/Solis).
- **API tests:** `/api/plants/[code]` returns per-device `connectivity`; NOC rollup
  counts are correct.
- **Live validation post-deploy:** confirm `vendor_last_data_at` populates for all 5
  providers; the previously-frozen CSI window (if it recurs) reads "frozen"; healthy
  inverters read "live"; night reads "idle".

## 9. Rollout

1. Schema `db push` (additive nullable column) → deploy poller changes → `vendor_last_data_at`
   begins populating within one poll cycle.
2. Deploy API + UI changes.
3. Validate live per §8.
4. Standard pre/post-deploy audit gates; superpowers code-review before deploy.

## 10. Risks & mitigations

- **Huawei/Sungrow field unknown** → verified by live probe in the plan before coding;
  documented fallback to `last_synced`.
- **Provider timezone quirks** (CSI `+08:00` suffix, Solis ms epoch) → parse to absolute
  epoch; `classifyConnectivity` works in epoch ms only. Covered by unit tests.
- **Night handling wrong** → would false-flag offline overnight; mitigated by the sun
  gate + explicit `idle` state and unit tests.
- **Extra DB writes** → fold `vendor_last_data_at` into existing per-device updates where
  possible; at most one small update per device per cycle (70 devices × 1/5 min — negligible).

## 11. Out of scope / follow-ups
- Frozen-feed alerting (Sentry/email) — P1.
- Extending the *write-gate* (skip-on-stale) to Huawei/Growatt/Sungrow — separate P2;
  this spec only *observes/persists* their vendor timestamp, it does not gate their writes.
