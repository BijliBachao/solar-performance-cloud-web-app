-- Guarantee at the DATABASE level that there is at most ONE open (unresolved)
-- alert per (device_id, string_number, severity).
--
-- The poller's generateAlerts (lib/poller-utils.ts) already de-dups in
-- application code — it loads the open alerts for a device and only inserts the
-- ones not already open. But nothing ENFORCED the invariant: a race between
-- overlapping poll cycles, or any future logic slip, could create duplicate
-- open alerts and spam the alert list (the kind of thing that erodes trust in
-- the alert feed). This partial unique index makes the duplicate physically
-- impossible. lib/poller-utils.ts now inserts with skipDuplicates:true, so a
-- rare collision becomes a silent no-op instead of a failed insert batch.
--
-- IDEMPOTENT: the de-dup UPDATE is a no-op once no duplicates remain; the index
-- uses IF NOT EXISTS. SAFE to replay via deploy-to-ec2.sh's migration loop.
-- Runs AFTER `prisma db push` — Prisma cannot represent a partial index, so it
-- lives here rather than in schema.prisma (a comment marks it there). `db push`
-- runs without --accept-data-loss, so it will NOT drop this unmanaged index;
-- and even if the index were ever absent at push time, the CREATE below + the
-- poller's app-level de-dup cover the brief window.

BEGIN;

-- 1. Resolve pre-existing duplicate OPEN alerts so the unique index can build.
--    Keep the OLDEST row per (device_id, string_number, severity) — it carries
--    the original detection time — and resolve the newer duplicates.
UPDATE alerts a
SET resolved_at = NOW(),
    resolved_by = 'system:dedup-open-alerts-2026-06-09'
WHERE a.resolved_at IS NULL
  AND a.id <> (
    SELECT MIN(b.id) FROM alerts b
    WHERE b.resolved_at IS NULL
      AND b.device_id = a.device_id
      AND b.string_number = a.string_number
      AND b.severity = a.severity
  );

-- 2. Enforce the invariant going forward.
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open_unique_idx
  ON alerts (device_id, string_number, severity)
  WHERE resolved_at IS NULL;

COMMIT;
