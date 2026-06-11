-- V1 String-Performance — additive columns for the intra-inverter metric.
-- LOCKED spec: median-of-medians, 8AM-4PM PKT window, 60% completeness gate,
-- display cap 100 (raw kept), bands 95/85/60/Dead, condition tags, plant type.
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded backfills. Safe to re-run.
BEGIN;

-- string_hourly: median-within-hour current + how many 5-min readings landed in the hour
ALTER TABLE string_hourly  ADD COLUMN IF NOT EXISTS median_current  numeric(10,3);
ALTER TABLE string_hourly  ADD COLUMN IF NOT EXISTS reading_count   integer;

-- string_daily: keep performance/health_score as the DISPLAY value (cap 100);
-- add the uncapped raw value (sensor-fault visibility) + data completeness %
ALTER TABLE string_daily   ADD COLUMN IF NOT EXISTS raw_performance   numeric(6,2);
ALTER TABLE string_daily   ADD COLUMN IF NOT EXISTS data_completeness numeric(5,2);

-- string_configs: human-readable condition tag + optional manual historical baseline
ALTER TABLE string_configs ADD COLUMN IF NOT EXISTS condition_tag           varchar(30);
ALTER TABLE string_configs ADD COLUMN IF NOT EXISTS manual_baseline_current numeric(10,3);

-- plants: single-location vs multi-location (V1 logic runs on single only)
ALTER TABLE plants         ADD COLUMN IF NOT EXISTS plant_type varchar(20) NOT NULL DEFAULT 'single_location';

-- Backfill stand-in for HISTORICAL hours (predate the median writer): old hours
-- have no raw 5-min medians on hand, and avg_current is an acceptable stand-in
-- for history (new hours get true medians from updateHourlyAggregates).
UPDATE string_hourly SET median_current = avg_current WHERE median_current IS NULL AND avg_current IS NOT NULL;

-- reading_count is intentionally LEFT NULL for pre-migration hours — we do NOT
-- know the true 5-min sample count, so fabricating one (e.g. 12) would feed the
-- 60% data-completeness gate a fake signal. The completeness gate MUST treat a
-- NULL reading_count as "legacy / not gateable" (score the day, don't gate on
-- fabricated completeness). Only post-migration hours carry a real count.

COMMIT;
