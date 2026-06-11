'use client'

import { useEffect, useState } from 'react'
import { computeSunGate, type SunGateState } from './sun-gate'

/**
 * Live sun-gate state for a plant (or the region, when coords are omitted),
 * recomputed every minute in the browser. Returns null on the first render so
 * server and client markup match — the value is computed inside an effect,
 * never during SSR (mirrors the TopBar PKT-clock pattern).
 */
export function useSunGate(latRaw?: unknown, lngRaw?: unknown): SunGateState | null {
  const [state, setState] = useState<SunGateState | null>(null)

  useEffect(() => {
    const tick = () => setState(computeSunGate(latRaw, lngRaw, new Date()))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [latRaw, lngRaw])

  return state
}
