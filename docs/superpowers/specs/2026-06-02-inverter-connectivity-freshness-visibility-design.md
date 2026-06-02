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

**Why two signals, not one (verified by live probe 2026-06-02):** only 3 of 5
providers expose a vendor data-timestamp. Huawei (our biggest fleet, 16 inverters)
and Sungrow expose **none** — their realtime endpoints return only the reading map.
Relying on the vendor timestamp alone would leave a frozen Huawei/Sungrow feed
showing "live" — the exact blind spot this feature exists to kill. So freshness is
driven by **value-change detection** (works for all 5), with the vendor timestamp
used additively where available (for display + as a second freshness signal).

Provider timestamp findings (probe, 2026-06-02):

| Provider | Vendor data-time field | Notes |
|---|---|---|
| CSI | `lastReportTime` (`"YYYY-MM-DD HH:MM:SS"`) | parsed as UTC on the UTC host (existing convention) |
| Solis | `dataTimestamp` (ms epoch, UTC) | already captured on `SolisInverterDetail` |
| Growatt | `time` (`"YYYY-MM-DD HH:MM:SS"`, **account-local = PKT**) | parse as **PKT (+05:00)**. The sibling `calendar` epoch is timezone-shifted ~3 h and is NOT used. |
| Huawei | **none** (`getDeviceRealtimeData` → only `devId` + `dataItemMap`) | value-change only |
| Sungrow | **none** (`getDeviceRealTimeData` → only `device_point`) | value-change only |

### 3.1 Per-device signals (persisted on `devices`)
- `vendor_last_data_at` (DateTime?, nullable): vendor's own data time — CSI/Solis/Growatt; null for Huawei/Sungrow. **Display + secondary freshness.**
- `reading_changed_at` (DateTime?, nullable): the last poll time (our clock) at which the device's reading **signature changed**. **Primary freshness signal, all providers.**
- `last_reading_sig` (String?, nullable): short signature of the most recent reading (e.g. SHA-1 hex of the sorted `s:V:I:P` tuples, 2-dp rounded). Persisted so value-change survives a poller restart.

The poller computes the signature each cycle; if it differs from `devices.last_reading_sig`, it sets `reading_changed_at = now` and stores the new sig. Identical signature → leave both (the feed is frozen). Restart-safe because the prior sig lives in the DB.

### 3.2 Classification (pure function in `lib/string-health.ts`)

```
type ConnectivityStatus = 'live' | 'frozen' | 'offline' | 'idle'

classifyConnectivity(
  effectiveFreshAtMs: number | null,  // max(vendor_last_data_at, reading_changed_at); newest evidence of genuinely-new data
  lastWriteAtMs: number | null,       // MAX(string_measurements.timestamp) for the device — when WE last wrote a row
  sunUp: boolean,                     // from lib/solar-geometry.ts for the plant lat/long
  nowMs: number = Date.now(),
): ConnectivityStatus
```

Rules (in order):

| Result | Condition | Meaning |
|---|---|---|
| `idle` | `!sunUp` | night — no data expected, not an alarm |
| `live` | `effectiveFreshAtMs != null && nowMs - effectiveFreshAtMs < VENDOR_FEED_STALE_MS` | genuinely new data within 2 h |
| `frozen` | not live, day, **and** `lastWriteAtMs != null && nowMs - lastWriteAtMs < STALE_MS` | we ARE still receiving rows but the values haven't changed for ≥ 2 h (stuck-but-responding — non-gated Huawei/Growatt/Sungrow case) |
| `offline` | not live, day, otherwise | we're not even writing rows (no response, or gated provider that stopped writing on its stale gate — the CSI datalogger-dead case) |

- **Frozen threshold = `VENDOR_FEED_STALE_MS` (2 h)** — reuse the existing constant; avoids false-positives on slow-but-live feeds (the Solis inverter that advances every ~15–45 min stays `live` via either signal).
- **Offline uses `STALE_MS` (15 min)** on `lastWriteAtMs` — 3 missed 5-min polls = genuinely not receiving.
- **Sun gate** uses the existing `lib/solar-geometry.ts` with the plant's lat/long — without it the fleet reads "offline" every night.
- Note: a true freeze shows as `frozen` on non-gated providers (we keep writing dupes) and as `offline` on gated providers (CSI/Solis stop writing) — both honestly describe what's happening at our layer and both surface "no fresh data since X".
- Pure, deterministic, unit-testable; only clock coupling is the injectable `nowMs`.

## 4. Data model

Additive, safe for `prisma db push` (all nullable, no backfill needed):

```prisma
model devices {
  ...
  vendor_last_data_at  DateTime?   // vendor's own "data as of" time (CSI/Solis/Growatt); null for Huawei/Sungrow
  reading_changed_at   DateTime?   // last poll time the reading signature changed (all providers)
  last_reading_sig     String?     @db.VarChar(64)  // signature of the latest reading (for restart-safe value-change)
}
```

- All nullable: existing rows start `null`. First poll after deploy populates `last_reading_sig` + `reading_changed_at`; until then a device classifies `offline` (day) / `idle` (night). Self-heals within one cycle.
- No data migration required.

## 5. Poller changes (write path)

Two responsibilities added to each poller's per-device processing, computed
**before any freshness-gate early-return** so a frozen device still records the truth:

**(a) Value-change signature (all 5 providers).** A shared helper computes a signature
from the parsed strings, e.g.:

```
readingSignature(strings: {string_number:number; voltage:number; current:number; power:number}[]): string
// sha1 hex of strings.sort(by string_number).map(s => `${s.string_number}:${V.toFixed(2)}:${I.toFixed(3)}:${P.toFixed(2)}`).join('|')
```

Then: read `devices.last_reading_sig`; if the new sig differs, set
`reading_changed_at = new Date()` and `last_reading_sig = newSig`; else leave both.

**(b) Vendor data-timestamp (where available).** Parse the vendor field to a `Date`
and store in `vendor_last_data_at`:

| Provider | Field | Parse |
|---|---|---|
| CSI | `data.lastReportTime` | `new Date("YYYY-MM-DDTHH:MM:SSZ")` (UTC host convention) |
| Solis | `detail.dataTimestamp` | ms epoch → `new Date(ms)` (already captured) |
| Growatt | `deviceData.time` | **PKT**: `new Date(time.replace(' ','T') + '+05:00')`. Do NOT use `calendar` (tz-shifted). |
| Huawei | — | leave `null` (no field; freshness from value-change) |
| Sungrow | — | leave `null` (no field; freshness from value-change) |

Implementation notes:
- Fold both writes into the per-device `prisma.devices.update` each poller already
  performs (CSI/Solis update model/max_strings; Growatt/Huawei/Sungrow add a small
  update). At most one extra `devices.update` per device per cycle (70 devices /5 min — negligible).
- CSI/Solis: record `vendor_last_data_at` even on the freshness-gate stale/duplicate
  branch, so the stored value reflects the real last-data time during a freeze.
- The signature uses the SAME parsed strings the poller already builds for
  `string_measurements` — no extra vendor call.

## 6. API changes

A shared helper computes per-device connectivity so the plant API and NOC agree:
`deviceConnectivity(device, lastWriteAtMs, sunUp, now)` →
`{status, vendorLastDataAt, readingChangedAt, effectiveFreshAt}`, where
`effectiveFreshAt = max(vendor_last_data_at, reading_changed_at)` and `status =
classifyConnectivity(effectiveFreshAt, lastWriteAtMs, sunUp, now)`.

- **`/api/plants/[code]`** (`route.ts`): per device add `vendor_last_data_at`,
  `reading_changed_at`, and computed `connectivity` (it already returns `provider`,
  `model`, `last_synced`; `last_data_at` per device = `MAX(string_measurements.timestamp)`).
  Sun state from the plant's lat/long. Plant-level `last_data_at` already returned.
- **`/api/admin/string-health-donut`** (NOC): add a fleet connectivity rollup —
  per-inverter `{deviceId, plantCode, inverterName, provider, connectivity,
  effectiveFreshAt}` and aggregate counts `{live, frozen, offline, idle}`. Reuse the
  devices join already in the donut loader; needs per-device `lastWriteAt` +
  `reading_changed_at` + `vendor_last_data_at` + the plant lat/long for the sun gate.

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

- **Unit — `classifyConnectivity`:** live (via vendor ts OR reading-change), frozen
  (stuck values + still writing), offline (not writing / gated-stopped), idle (night);
  the 2 h boundary (strict `<`); the 15 min offline boundary; the slow-Solis case
  (15–45 min old → live).
- **Unit — `readingSignature`:** stable for identical readings, changes when any
  string's V/I/P changes, order-independent (sorted by string_number).
- **Poller tests:** each poller sets `reading_changed_at`/`last_reading_sig` only when
  the signature changes; CSI/Solis/Growatt also set `vendor_last_data_at` (Growatt from
  `time` as PKT); a repeated identical reading does NOT advance `reading_changed_at`.
- **API tests:** `/api/plants/[code]` returns per-device `connectivity`; NOC rollup
  counts `{live,frozen,offline,idle}` are correct.
- **Live validation post-deploy:** all 5 providers populate `reading_changed_at`;
  CSI/Solis/Growatt populate `vendor_last_data_at`; a producing inverter reads `live`;
  a deliberately-checked stuck feed reads `frozen`/`offline`; night reads `idle`.

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
