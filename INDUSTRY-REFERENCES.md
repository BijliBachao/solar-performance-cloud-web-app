# Industry References — Solar Monitoring Landscape

**Purpose:** Quick-lookup record of every name mentioned in the Phase B / Phase 2 PR research. Brand, category, one-line description, URL. So we never have to re-research who's who.

**Source research:** [`RESEARCH-orientation-handling.md`](./RESEARCH-orientation-handling.md)
**Compiled:** 2026-04-30

---

## Commercial monitoring platforms (the global incumbents we surveyed)

These are the platforms whose feature sets define the "industry baseline" we measure SPC against.

| # | Brand | Type | Origin | What they do | Reference URL |
|---|---|---|---|---|---|
| 1 | **Enphase Enlighten** | Microinverter monitoring | USA | Per-panel monitoring (each panel = own MPPT). Eliminates string mismatch by hardware design. Sells microinverters. | [enphase.com/installers/monitoring](https://enphase.com/installers/monitoring) |
| 2 | **SolarEdge Monitoring** | DC-optimizer monitoring | Israel | Per-module monitoring via optimizers. Logical-string grouping at commissioning. **Has the same orientation-mismatch bug as SPC** at module level — documented fix is "separate logical strings per orientation." | [monitoring.solaredge.com](https://monitoring.solaredge.com/) |
| 3 | **Tigo Energy Intelligence** | Selective optimization + monitoring | USA | Per-module via TS4 modules. **Group tagging** at design time with tilt, azimuth, shade profile. Markets named-group tagging as a differentiator. | [tigoenergy.com](https://tigoenergy.com/) |
| 4 | **Solar-Log** | Multi-vendor inverter monitoring | Germany | 20-year incumbent. Compares inverters/MPPT trackers via *normalized power* (kW per kWp). "Module group" entries with tilt + azimuth feed expected-yield calculations. | [solar-log.com](https://www.solar-log.com/) |
| 5 | **PVsyst** | Design / yield modeling tool (NOT live monitoring) | Switzerland | The de facto industry reference for *expected yield*. Every commercial solar bid >50 kW in Pakistan is sized with a PVsyst report. Models per-sub-array hourly POA, cell temperature, expected DC kWh. Vocabulary used by engineering-credible clients. | [pvsyst.com](https://www.pvsyst.com/) |
| 6 | **Huawei FusionSolar (SmartPVMS)** | Vendor-tied monitoring | China | Used by SPC's Huawei plants. String-level data depth. Native peer-comparison alarm IDs (2011, 2061–2070). Supports per-sub-array config but installers rarely fill it in (same gap as SPC). | [solar.huawei.com/en/Service-Support/SmartPVMS](https://solar.huawei.com/en/Service-Support/SmartPVMS) |
| 7 | **SMA Sunny Portal** | Vendor-tied monitoring | Germany | The **canonical** sub-array data model: plant → sub-array → string. Each sub-array gets its own PR and target-vs-actual energy. Sunny Portal Professional adds modeled expected yield from internal irradiance data. | [sunnyportal.com](https://www.sunnyportal.com/) |

---

## Inverter brands SPC integrates with (the polling targets)

The four vendor APIs SPC's poller talks to. Each has its own portal (listed in §"vendor portals" below) but SPC consolidates all four.

| Brand | Origin | Pakistan market share | API used by SPC poller |
|---|---|---|---|
| **Huawei** | China | Largest in commercial in Pakistan | FusionSolar OpenAPI / SmartPVMS |
| **Solis (Ginlong)** | China | Strong in residential / small commercial | SolisCloud API |
| **Growatt** | China | Largest in residential in Pakistan | Growatt OpenAPI v1 |
| **Sungrow** | China | Utility-scale + commercial | iSolarCloud API |

---

## Vendor monitoring portals (what each inverter brand ships)

These are what each inverter brand offers as their own monitoring solution. SPC competes / replaces these with a unified multi-brand view.

| Portal | Vendor | What customer sees | Why customers choose SPC instead |
|---|---|---|---|
| **FusionSolar** (also SmartPVMS) | Huawei | Polished. String-level. Vendor-tied. | Want multi-brand fleet view; want independence |
| **SolisCloud** | Solis | Functional. Inverter-level + some string. | Want independence; want better fault diagnosis |
| **ShinePhone** (also OSS) | Growatt | Mobile-first. Mostly inverter-level. | Want string-level; want better dashboards |
| **iSolarCloud** | Sungrow | Functional. Inverter-level. | Want fault diagnosis specificity |

---

## Standards bodies

| Body | Standard | Relevance to SPC |
|---|---|---|
| **IEC** (International Electrotechnical Commission) | **IEC 61724-1** "PV system performance — Part 1: Monitoring" (2021 Ed. 2.0) | The standard everyone cites. Defines monitoring classes A/B/C, sub-array boundary, PR formula. Buy at [webstore.iec.ch/publication/65561](https://webstore.iec.ch/en/publication/65561) (~CHF 250) for clause-exact citations. |
| IEC | **IEC 61724-3** "Energy evaluation method" | Acceptance / capacity testing. Confirms sub-array-aware analysis. Mostly out-of-scope for SPC operational monitoring. |
| IEC | **IEC 62446-1** "System documentation, commissioning tests, inspection" | §4.3 requires recording orientation/tilt per string at commissioning. **This is the data SPC's admin form digitizes.** |
| **NEPRA** (National Electric Power Regulatory Authority) | Pakistan utility regulator | No mandate on operational monitoring KPIs for net-metered/distributed solar. Bidirectional metering required; nothing about per-string PR. |
| **NREL** (US National Renewable Energy Laboratory) | Reference body for solar performance standards | Publishes NSRDB (irradiance dataset), NREL SAM (modeling tool), O&M guidebook. |

---

## Irradiance data sources (POA / GHI providers)

For computing expected yield (Phase 2 PR Medium and beyond). Compared in research §3.

| Source | Owner | Coverage | Granularity | License | Cost | URL |
|---|---|---|---|---|---|---|
| **PVGIS** | EU Joint Research Centre | Global incl. Pakistan via SARAH-3 / ERA5 | Hourly historical (TMY); not live | Free, attribution required, 30 req/sec/IP rate limit | Free | [re.jrc.ec.europa.eu/api/v5_3/](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en) |
| **NREL NSRDB / PSM3** | US Dept. of Energy / NREL | Americas + Asia (Pakistan via Himawari) | 30-min historical, hourly forecast | Free for research; commercial OK with key | Free with API key | [nsrdb.nrel.gov](https://nsrdb.nrel.gov/) |
| **Solcast** | Australia (commercial) | Global, Pakistan well-covered | 5-min live, 30-min forecast | Commercial license required | Quote-based, ~$50–200/mo at SPC's volume | [solcast.com/pricing](https://solcast.com/pricing/irradiance-weather) |
| **Open-Meteo** | Open-Meteo (open-data project) | Global | Hourly, includes shortwave_radiation, direct_normal_irradiance | CC-BY-NC for non-commercial; commercial tier exists | Free 10k req/day non-commercial; paid for commercial | [open-meteo.com](https://open-meteo.com/) |

---

## Local Pakistani solar / monitoring landscape

For competitive context.

| Player | Type | Status | What they offer |
|---|---|---|---|
| **BijliBachao / SPC** | Multi-vendor monitoring + EPC | Active (this project) | The platform we're building |
| **Reon Energy** | EPC + monitoring | Active | Mostly EPC; monitoring via vendor portals |
| **Shams Solar** | EPC | Active | Installation-focused |
| **SkyElectric** | Battery + monitoring | Defunct as monitoring vendor since ~2024 | Was active in residential battery + solar |
| **Vendor portals (FusionSolar / SolisCloud / ShinePhone / iSolarCloud)** | Vendor-tied | Active | Each tied to its own inverter brand |

**Competitive observation from research:** No local Pakistani player offers per-sub-array PR. **SPC building it would be the first in Pakistan.**

---

## Open-source / free-tier baseline (for comparison)

| Project | Type | What it commits to |
|---|---|---|
| **Solarmanv2 portal** | Vendor-agnostic free portal | Inverter-level total kWh, basic alerts |
| **Volkszähler** | Open-source energy logger | Inverter-level data, no analytics |
| **OpenEnergyMonitor** | Open hardware + software | Hobbyist / research focus, not solar-specific |
| **FusionSolar Lite** (free tier) | Vendor free tier | Orientation tagging at commissioning + sub-array peer comparison |
| **Sunny Portal free** | Vendor free tier | Orientation tagging at commissioning + sub-array peer comparison |

**Baseline target for SPC:** match what FusionSolar Lite and Sunny Portal free do (orientation tagging + sub-array PR). Achieved via Phase A + Phase B + Phase 2 PR Small.

---

## Quick "who is X" lookup

If you ever forget who someone is, find them here:

- **Enphase** — American microinverter company. Each panel has its own tiny inverter.
- **SolarEdge** — Israeli company. DC optimizers per panel + central inverter.
- **Tigo** — American add-on optimizer + monitoring. Vendor-neutral.
- **Solar-Log** — German multi-vendor monitoring incumbent. 20+ years old.
- **PVsyst** — Swiss design tool. Industry's reference for "expected yield."
- **Huawei FusionSolar** — Chinese inverter giant's own monitoring portal.
- **SMA Sunny Portal** — German inverter giant's own portal. Defines the canonical sub-array model.
- **Solis / Ginlong** — Chinese inverter brand.
- **Growatt** — Chinese inverter brand. Strong in residential Pakistan.
- **Sungrow** — Chinese inverter brand. Utility-scale + commercial.
- **PVGIS** — Free EU government solar irradiance data API.
- **NREL** — US national lab. Free irradiance data + reference standards.
- **Solcast** — Australian paid live irradiance API. Warranty-grade accuracy.
- **Open-Meteo** — Open-data weather API including solar irradiance. Free at low volume.
- **NEPRA** — Pakistan's utility regulator. Sets net-metering rules; no operational monitoring KPIs.
- **IEC** — International Electrotechnical Commission. Publishes the technical standards.

---

**End of references.** When in doubt about "who's who" in solar monitoring, check this file.
