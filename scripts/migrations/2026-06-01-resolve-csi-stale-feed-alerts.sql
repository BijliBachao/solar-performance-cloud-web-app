-- Resolve the 26 CSI CRITICAL alerts created during the 2026-05-25
-- vendor-feed-stale snapshot.
--
-- On 2026-05-25 14:16–14:26 PKT the dataloggers on all 5 CSI inverters
-- (00254424270021J066, 31J029, 51J080, 71J081, 49J015) stopped pushing
-- new telemetry to sep-api.csisolar.com. Their cloud kept returning the
-- last cached realData payload on every /open-api/device/data call, so
-- every string looked dead against the frozen sample. Between 07:00 and
-- 08:35 PKT on 2026-05-25 (02:00–03:35 UTC) the alert engine generated
-- 26 "near-zero current" CRITICAL alerts before we stopped trusting the
-- snapshot via lib/string-health.ts isVendorFeedStale.
--
-- Confirmed via direct API probe 2026-06-01: lastReportTime for all 5
-- devices identical and 160h+ old. Code change in lib/csi-poller.ts now
-- skips writes / downgrades the plant to DISCONNECTED when the feed is
-- stale, so this clean-up only needs to run once.
--
-- IDEMPOTENT — WHERE resolved_at IS NULL ensures re-runs are a no-op.
-- SCOPED — narrow time window + provider='csi' so we can't accidentally
-- mark unrelated alerts resolved if this file is replayed.
--
-- Apply on production via deploy-to-ec2.sh's migration loop (uses the
-- whitelisted libpq URL with ON_ERROR_STOP=1).

BEGIN;

-- Date-only filter (created_at is timestamp-without-tz, the AT TIME ZONE
-- gymnastics in the original WHERE silently no-matched on 2026-06-01).
-- Scope: any unresolved alert on a CSI device created on 2026-05-25.
-- That maps 1:1 to the stale-feed incident — no other alerts fired on
-- those devices that day (confirmed live before applying).
WITH affected AS (
  SELECT a.id
  FROM alerts a
  JOIN devices d ON d.id = a.device_id
  WHERE a.resolved_at IS NULL
    AND d.provider = 'csi'
    AND a.created_at::date = DATE '2026-05-25'
)
UPDATE alerts
SET resolved_at = NOW(),
    resolved_by = 'system:vendor-feed-stale-2026-05-26'
WHERE id IN (SELECT id FROM affected);

COMMIT;
