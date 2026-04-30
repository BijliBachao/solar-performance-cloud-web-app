# Research — Industry Practice for Non-Standard Orientation Strings

**Status:** Reference document · 2026-04-30
**Purpose:** Fact-based foundation for Phase B (`PLAN-string-orientation-flag.md`) and Phase 2 PR (`PLAN-performance-ratio-phase2.md`). Read this when picking the next-level architecture for orientation-aware analysis.

**TL;DR:** The established solar industry **does not** rely on naive peer comparison for non-standard orientation strings. IEC 61724-1 defines *sub-array* as a separate analysis boundary, and every commercial monitoring platform supports per-sub-array tagging. SPC's current peer-only logic sits **below the free-tier baseline** of every global incumbent. The pragmatic single-developer fix is a 3-step ladder:

1. **Phase B Option A** (boolean `exclude_from_peer_comparison`) — silences false alerts immediately
2. **Phase 2 PR Small** (fixed PSH = 5.5) — gives absolute scoring
3. **Sub-array tagging + PVGIS TMY** (Phase B Option B + Phase 2 Medium) — reaches industry baseline when a serious client asks

---

## 1. IEC 61724-1 (the standard everyone cites)

The current edition is **2021 (Ed. 2.0)**. Older editions superseded.

### Three monitoring classes

| Class | Use | What's required | Where SPC sits |
|---|---|---|---|
| **A** | Utility-scale / research | POA irradiance sensor per sub-array, calibrated cell tech, ≤1-min logging, ~$2k+ hardware per sub-array | Out of scope |
| **B** | Commercial PV plants | Modeled POA + sub-array PR + quality logging | Achievable target for SPC |
| **C** | Smallest systems | Energy meter + inverter data only | **SPC today** |

Industrial / C&I customers asking for engineering-credible reports increasingly specify **Class B**. Class C is defensible for residential and small commercial.

### Sub-array is a first-class concept

- Clause 5 ("Measured parameters") and Annex A define **array** and **sub-array** as separate boundaries.
- Clause 5.2 distinguishes irradiance measurement at *array level* from *sub-array level*.
- The standard explicitly anticipates that sub-arrays can have **different orientations and tilts**.
- **Where sub-arrays differ in orientation, the standard recommends a sub-array PR computed against the POA irradiance at that sub-array's plane.**

**Performance Ratio formula (IEC 61724-1):**

```
PR = Y_f / Y_r

Y_f (final yield)    = actual kWh / nameplate kWp
Y_r (reference yield) = POA irradiance / 1 kW/m² STC
```

**Crucial:** the reference yield depends on **POA (Plane-of-Array)**, not GHI (Global Horizontal Irradiance). A wall-mounted sub-array's PR is computed against the irradiance hitting that 90° wall, not the horizontal plane. This is what makes orientation-aware PR fair.

Ed. 2.0 also standardizes a **temperature-corrected PR (PR_corr)** using cell temperature for fairer cross-season comparison.

### IEC 62446-1 (commissioning) is the unsung hero

- Section 4.3 explicitly requires recording **module orientation and tilt per string** in the as-built handover dossier.
- Section 6 requires per-string Voc/Isc commissioning tests.

**Implication:** every IEC-compliant install in Pakistan already produces, on paper, exactly the metadata SPC needs. The data exists; the gap is that it never reaches the monitoring platform. **Phase B's admin entry form is essentially digitizing data the installer already wrote down.**

### IEC 61724-3 (energy evaluation)

Mostly out of scope for SPC (acceptance/capacity testing, not operational monitoring), but it confirms that the industry's energy-yield evaluation is **always sub-array-aware**.

### Citation honesty

I could not access the IEC 61724-1:2021 PDF directly to cite exact clause numbers. The above is paraphrased from secondary sources (Hukseflux app notes, Seven Sensor explainers, ResearchGate papers) that summarize the standard. If a client demands clause-exact citations, the standard must be purchased from the [IEC Webstore](https://webstore.iec.ch/en/publication/65561) (~CHF 250).

---

## 2. What commercial platforms actually do

### Cross-platform summary

| Platform | Per-string orientation tag at commissioning? | Sub-array as separate health unit? | Expected-yield model per sub-array? | Naive peer-comparison only? | Self-comparison (vs own history)? |
|---|---|---|---|---|---|
| Enphase Enlighten | Per-module (each panel = own MPPT) | Auto | Internal | No | Yes |
| SolarEdge Monitoring | Yes (logical string at commissioning) | Yes | Internal | No | Yes |
| Tigo Energy Intelligence | Yes (group) | Yes | Internal | No | Yes |
| Solar-Log | Yes (module group) | Yes | Internal + target file | Optional | Yes |
| Huawei FusionSolar | Yes (sub-array, almost never filled) | Yes | Internal (SmartPVMS) | **Yes (default)** | Yes |
| SMA Sunny Portal | Yes (canonical sub-array model) | Yes | Internal | No | Yes |
| **SPC today** | **No** | **No** | **No** | **Yes** | **No** |

### Key observations

- **Every commercial platform supports sub-array tagging.** Captured once at commissioning, edited only when the physical install changes.
- **None relies on naive peer comparison alone.**
- **Most run peer-comparison and expected-yield in parallel** and let the user choose which alerts fire.
- **SolarEdge has SPC's exact bug** at the optimizer level: when an installer puts east + west panels in the same logical string, "Module Mismatch Analysis" falsely flags the west panels at noon. SolarEdge's documented fix is *separate logical strings per orientation*. **Their installer-time grouping step is the industry baseline for SPC's Phase B.**
- **Huawei FusionSolar has the deepest string-level data** but still relies on a human filling in the orientation field. Most Pakistani installers don't. **There is no magic — the orientation must come from human entry.**
- **PVsyst is the modeling reference.** Every commercial solar bid in Pakistan above ~50 kW is sized by a PVsyst report. When a client pushes back on "your dashboard says my wall panels are bad," the answer they expect is "compared to your PVsyst report's expected yield for that wall sub-array."

### Standard data model (industry-converged)

```
Plant
  └── Sub-array (a.k.a. "PV Section", "Module Group", "Logical String Group")
        ├── azimuth (degrees from south, signed)
        ├── tilt (degrees)
        ├── module model + count
        ├── shade profile / horizon (optional, often omitted)
        ├── installed kWp
        └── String[] (each string belongs to exactly one sub-array)
```

If SPC ever builds named groups (Phase B Option B), copy the SMA / Tigo vocabulary: `peer_group` string column on `string_configs` plus optional `azimuth` and `tilt` columns is the minimum viable sub-array model.

---

## 3. POA irradiance sourcing

For sub-array PR you need POA irradiance per sub-array per time period. Three production approaches:

| Approach | Class | Cost | Accuracy |
|---|---|---|---|
| Per-sub-array pyranometer | A | ~$2,000 hw + cabling per sub-array + calibration | Highest |
| Modeled POA from satellite GHI/DHI/DNI + lat/lon + azimuth + tilt | B | Software | High |
| Modeled POA from clear-sky model + cloud cover from weather API | B-/C+ | Cheap | Medium |

### Public irradiance data sources

| Source | Coverage | Granularity | License | Cost | Notes |
|---|---|---|---|---|---|
| **PVGIS (EU JRC)** | Global incl. Pakistan via SARAH-3/ERA5 | Hourly historical (TMY); not live | Free, attribution required, rate limit 30 req/sec/IP | Free | Best for **expected typical year** — not real-time. Good for monthly PR; weak for daily because it ignores actual cloud cover. API at `https://re.jrc.ec.europa.eu/api/v5_3/` |
| **NREL NSRDB / PSM3** | Americas + Asia (Pakistan via Himawari-derived dataset) | 30-min historical, hourly forecast | Free for research; commercial use needs API key, no fee | Free with NREL API key | Good for back-fill; not designed for real-time per-site |
| **Solcast** | Global, Pakistan well-covered | 5-min live, 30-min forecast | Commercial license required | Quote-based; ~$50–200/mo at SPC's scale (estimate) | Industry standard for warranty-grade monitoring |
| **Open-Meteo** | Global | Hourly, includes shortwave_radiation, direct_normal_irradiance | CC-BY-NC for non-commercial; commercial tier exists | Free tier 10k req/day non-commercial; paid for commercial | Cheapest live option, accuracy lower than Solcast |

### Cost / complexity ladder for SPC

- **No POA at all** (today): zero cost, no PR.
- **PVGIS TMY, fixed once at plant config:** zero ongoing cost, ~1 day of dev. Gets monthly PR.
- **Open-Meteo live:** ~3 days dev + free at SPC's volume (50 plants × 24 polls/day = 1,200 req/day, well within free tier). Daily PR meaningful.
- **Solcast live:** ~5 days dev + ~$50–200/month. Warranty-grade.

---

## 4. Self-comparison (string vs own historical baseline)

- **Established practice as a secondary metric.** Every commercial platform offers it.
  - SolarEdge: "Energy Profile Anomaly"
  - SMA: "Specific Yield Trend"
  - Solar-Log: "Plant Profile Comparison"
- **Typical window:** 30-day rolling baseline weighted by hour-of-day. Some platforms also use "same week last year" for seasonal correction.
- **Cold-start handling:** modeled expected yield for new strings, OR comparing to similar string with confidence flag, OR 30-day quiet period before alerts fire.
- **Standards status:** No IEC clause prescribes self-comparison — it's an industry convention, not a standard. Treated as complement to PR, not replacement.

For SPC, self-comparison is **defensible as a fallback for peer-excluded strings until Phase 2 PR lands.** Implementation: weighted moving average per `(device_id, string_number, hour_of_day)`.

---

## 5. Pakistani / South Asian context

### Regulatory floor

- **NEPRA** does not currently mandate operational-monitoring KPIs for net-metered or distributed solar.
- Net-metering rules require a bidirectional meter; nothing about per-string PR.
- Utility-scale (>1 MW) IPP contracts often reference IEC 61724 in the EPC contract, but that's commissioning, not monitoring.

### Local platform landscape

- **BijliBachao / SPC** (this project)
- **Reon Energy monitoring**
- **Shams Solar**
- **SkyElectric** (defunct as a monitoring vendor since ~2024)
- Various Chinese-vendor-tied portals (FusionSolar, SolisCloud, Growatt ShinePhone)

**None of the local players I'm aware of offer per-sub-array PR.** Most are wrappers over the inverter vendor's portal. **This is a competitive opportunity for SPC** — doing sub-array PR with PVGIS would put SPC ahead of the vendor portals in Pakistan.

### Common Pakistani install patterns SPC must accommodate

- Flat roof + parapet wall mounts (Lahore, Faisalabad, Multan)
- Tilted panels on rusted iron sheet roofs (textile mills) — high temperature derating, not orientation
- Carport canopies at near-flat tilt (housing societies in Lahore/Karachi) — low summer output
- Vertical walls (industrial sites at structural roof capacity)
- Mixed-vintage installs (a 2019 string of 350 W panels next to a 2024 string of 550 W panels on the same inverter) — affects nameplate, not orientation, but breaks any uniformity assumption

### Pressure source

The Pakistani market has **no regulatory floor** that forces SPC above peer comparison. The pressure is purely **customer-trust-driven**, exactly as `problems/02-non-standard-orientation-peer-comparison.md` describes.

---

## 6. The 3-step ladder for SPC (recommended)

### Step 1 — Defensible v1 (a few days)

**`exclude_from_peer_comparison` boolean** (Phase B Option A, already documented in `PLAN-string-orientation-flag.md`). Matches what SolarEdge does when a customer mis-configures a logical string — removes the false alert and tells the user "this string is operating as designed."

It's **below** SMA / Tigo's data model but **above** SPC's current "alert on every wall panel every day." The honest UI label is **"Peer comparison disabled — no fault detection until Phase 2 PR."** Customers prefer "we know what we don't know" over "we cry wolf."

### Step 2 — Industry-baseline absolute scoring (a few days more)

**Phase 2 PR Small** (fixed PSH = 5.5, compute on read), already documented in `PLAN-performance-ratio-phase2.md`. Gives peer-excluded strings a fault score. Combined with Step 1, this matches the **free-tier baseline of FusionSolar Lite, Sunny Portal free, etc.**

### Step 3 — Industry baseline (a few weeks, when a client asks)

**Sub-array tagging with named groups + within-group peer comparison + fixed monthly expected yield from PVGIS TMY.** This is where SolarEdge / Tigo / Solar-Log / SMA all sit.

Database additions: `peer_group` string + `azimuth` + `tilt` on `string_configs`. One-time PVGIS fetch per plant to compute expected monthly kWh per kWp. Admin "sub-array" management view.

**This is the moment SPC crosses the "engineering-credible" line for industrial / commercial customers.**

### Step 4 — Warranty-grade (only if a major industrial client demands it)

**Per-sub-array daily PR with modeled POA from a live irradiance API** (Open-Meteo for cheap, Solcast for accuracy). Months of work, ongoing API spend. **Don't pre-build this.**

---

## 7. Open-source / free-tier baseline

Looking at the open-source landscape (Solarmanv2's portal, Volkszähler, OpenEnergyMonitor) — **none commit to anything beyond inverter-level total kWh and basic alerts.** The free tiers of commercial platforms (FusionSolar Lite, Sunny Portal free) commit to the Phase B v1 level: orientation tagging at commissioning + sub-array peer comparison.

**SPC committing to Phase B Option A v1 + Phase 2 PR with PVGIS TMY puts it on par with the free tier of the global incumbents.** That's the right target for a single-developer Pakistani platform.

---

## 8. Honest gaps in this research

- IEC 61724-1:2021 clause numbers cited from secondary sources (Hukseflux, Seven Sensor). Buy the standard for clause-exact citations.
- Solcast and Open-Meteo's per-Pakistan-site daily accuracy not benchmarked. Both should be validated against actual SPC plant production for a few months before committing alert thresholds.
- No public statement from any Chinese inverter vendor portal (Solis, Growatt, Sungrow) commits to sub-array PR; their string-level features are all peer-comparison-based.

---

## 9. Decision points this research answers

| Question | Answer |
|---|---|
| Is "no scoring + raw measurements only" defensible as Phase B v1? | **Yes.** Matches SolarEdge's documented fix for the same bug. UI label honest about the gap. |
| Is sub-array tagging the industry baseline? | **Yes.** Every commercial platform supports it. Captured at commissioning per IEC 62446-1 §4.3. |
| Is per-string PR the only honest approach? | **No.** Per-sub-array PR is the standard. SPC's existing `string_configs` table can hold sub-array metadata when the time comes. |
| What does an open-source / free-tier platform realistically commit to? | **Sub-array tagging + per-sub-array peer comparison + PVGIS TMY expected yield.** SPC's Phase B + Phase 2 PR Small reaches this. |
| What replaces fault scoring for peer-excluded strings until Phase 2 PR lands? | **Self-comparison** (string vs own 30-day rolling history) is the industry-standard secondary metric. Optional Phase B v1.5 enhancement. Lower priority once Phase 2 PR is live. |
| Should SPC build groups (Option B) before PR? | **No.** Build the boolean (Option A) + PR first. Groups are step 3, only when a client asks. |
| Should SPC build a live irradiance API integration now? | **No.** PVGIS TMY first. Live irradiance only when a major client pays for warranty-grade reporting. |

---

## 10. References

| Citation | Source |
|---|---|
| IEC 61724-1:2021 webstore listing | https://webstore.iec.ch/en/publication/65561 |
| Hukseflux PR walk-through, IEC 61724-aligned | https://www.hukseflux.com/applications/solar-energy-pv-system-performance-monitoring/how-to-calculate-pv-performance-ratio |
| Seven Sensor on POA-based PR per IEC 61724-1 | https://www.sevensensor.com/how-to-calculate-pr-performance-ratio-using-poa-irradiance-data-according-to-iec-61724-1 |
| SolarEdge logical/physical string mismatch behavior | https://www.solarpaneltalk.com/forum/solar-panels-for-home/solar-panels-for-your-home/400516-solaredge-monitoring-logical-physical-string-does-not-match-actual-strings |
| Solar-Log monitoring product page | https://www.solar-log.com/en/products-solutions/monitoring-solar-log-web-eneresttm |
| Huawei FusionSolar alarm management | https://support.huawei.com/enterprise/en/doc/EDOC1100165054/cf38aae6/monitoring-alarm-information |
| PVGIS API (free, EU JRC) | https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en |
| Solcast pricing | https://solcast.com/pricing/irradiance-weather |

---

**End of research. The plan docs (`PLAN-string-orientation-flag.md`, `PLAN-performance-ratio-phase2.md`) are now informed by this research. The 3-step ladder above is the path forward.**
