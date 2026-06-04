# NOC v3 — Donut-First Triage Console

**Date:** 2026-06-04
**Status:** Approved (user, after deep research) — building
**Research:** 110-agent deep-research run; verified findings from Power BI/Tableau (cross-filtering),
Algolia (facet composition), NN/g (filter UX), SWR + nuqs docs (refresh/URL state). Dimensions
"incident widgets" and "solar-portal specifics" did not survive verification → those parts are
explicit design judgment.

## Persona & constraints
- Internal ops, **live triage**: "what's broken now, where, act on it".
- **Donut stays the centerpiece** (client-validated) — it becomes the *primary filter control*.
- Auto-refresh ~60 s + manual, **in place** — no full-page reloads ever.

## Interaction model (research-backed)
1. **Donut = cross-FILTER** (remove non-matching rows, not highlight). Click slice → table filters.
   Selected slice full-color, others dim; click again to deselect; second slice on the SAME donut
   adds (OR within facet). Explicit clear affordances: per-chip ×, "Clear all", Esc.
2. **Facet composition:** `org AND health(OR-set) AND connectivity(OR-set) AND search`.
   Each donut **recomputes under the other facets** (coordinated views):
   - Health donut counts = strings of devices matching the connectivity selection (+org/search).
   - Connectivity donut counts = devices having ≥1 string in the selected health buckets (+org/search).
3. **Two refresh regimes:** user filter change → dim table + progress (no row flicker);
   60 s background poll → silent in-place update, tiny spinner + "Updated Xs ago", pause when tab hidden.
   SWR: `refreshInterval:60000`, `revalidateOnFocus`, `keepPreviousData:true`, skeleton only on
   `isLoading`, subtle indicator on `isValidating`.
4. **URL state, shallow:** filters mirrored to the query string client-first (history.replaceState —
   nuqs semantics without the dependency). Deep-linkable/shareable; never triggers Next navigation.
5. **States:** first load = skeletons; empty filter result = "No strings match these filters" +
   chips + Clear all; error = retry card (existing pattern).

## Layout
KPI strip (clickable quick-filters) on top; left column = the two interactive donuts (health,
connectivity) + idle caption; right = active-filter chips, worst-first strings table (severity sort),
row → plant drill-down; below table = "Needs attention" worst-offenders panel.

## API additions (additive)
`GET /api/admin/string-health-donut?mode=prev-day`
- `buckets=critical,abnormal` (CSV, OR within health facet; supersedes single `bucket`, which stays
  accepted for back-compat)
- `conn=offline,frozen` (CSV, OR within connectivity facet; filters rows to devices in those states)
- `q=text` (case-insensitive match on plant name/code + inverter name)
- Counts/connectivity respect the cross-facet rule above.
- New `kpis`: `{ offlineInverters, frozenInverters, criticalStrings, plantsWithIssues, livePct }`.
- New `attention`: top 8 plants ranked by `critStrings*1 + frozen*2 + offline*3`, each with
  `{plantCode, plantName, critStrings, frozen, offline, worstSince}`.

## Phases
1. **Interaction core** — client state + shallow URL, interactive multi-select donuts, chips/Esc,
   AND/OR composition incl. conn+q+buckets API, SWR refresh model, empty/loading/error.
2. **Triage content** — KPI strip, Needs-Attention panel, worst-first default sort.
3. **Polish** — keyboard nav (↑/↓/Enter), pause-on-interaction (deferred unless trivial).

## Out of scope
True per-string "time-in-state" history; websockets/SSE; map view; pgBouncer-class infra.
