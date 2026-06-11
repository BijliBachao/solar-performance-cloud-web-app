'use client'

import { Sunrise } from 'lucide-react'
import { useSunGate } from '@/lib/use-sun-gate'

interface SunGateBannerProps {
  /** Raw plant coords (Decimal/string/null). */
  latRaw?: unknown
  lngRaw?: unknown
}

/** Human "in about N min / h" phrasing for the wait, or null when unknown. */
function describeWait(minutes: number | null): string | null {
  if (minutes == null) return null
  if (minutes < 1) return 'in under a minute'
  if (minutes < 90) return `in about ${minutes} min`
  return `in about ${Math.round(minutes / 60)} h`
}

/**
 * Plant-page banner shown ONLY while the sun is below the live-data gate.
 * Explains why the LIVE string readings / live health ring are still blank and
 * roughly when they return. Copy adapts to three states — pre-dawn night,
 * morning ramp, and dusk descent — so it never tells an evening viewer to
 * "wait for sunrise". The settled daily score is NOT gated this way, so the
 * Previous Day view always has data. Auto-hides once the gate arms. Rendered on
 * both the customer and admin plant pages (one shared PlantDetailView).
 */
export function SunGateBanner({ latRaw, lngRaw }: SunGateBannerProps) {
  const gate = useSunGate(latRaw, lngRaw)
  if (!gate || gate.armed) return null

  const { elevationDeg, thresholdDeg, minutesUntilArmed, rising } = gate
  const belowHorizon = elevationDeg < 0
  const wait = describeWait(minutesUntilArmed)

  // Three states: night (sun down), morning ramp (low + climbing), dusk (low +
  // descending). Only the first two are a "wait"; dusk is "done for the day".
  let heading: string
  let body: string
  if (belowHorizon) {
    heading = 'Waiting for sunrise'
    body = `Live string readings and the live health ring resume after sunrise${
      wait ? ` (${wait})` : ''
    } — they appear once the sun rises above ${thresholdDeg}°.`
  } else if (rising) {
    heading = `Sun is low — ${elevationDeg.toFixed(1)}°`
    body = `Live string readings and the live health ring fill in once the sun rises above ${thresholdDeg}°${
      wait ? ` (${wait})` : ''
    }. Below that, output is too faint to score fairly, so it's held back to avoid false faults.`
  } else {
    heading = 'Live monitoring paused for the evening'
    body = `The sun has dropped below ${thresholdDeg}°, so live string readings pause until tomorrow morning.`
  }

  return (
    <div className="px-4 sm:px-6 max-w-[1440px] mx-auto mt-3">
      <div className="bg-sky-50 border border-sky-200 rounded-sm px-4 py-2.5 flex items-start gap-2.5">
        <Sunrise className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
        <p className="text-xs text-sky-900">
          <span className="font-bold">{heading}</span> — {body} Yesterday&apos;s settled results are
          unaffected and shown in the <span className="font-semibold">Previous Day</span> view.
        </p>
      </div>
    </div>
  )
}
