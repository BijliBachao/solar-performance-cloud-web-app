'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, Check, Info } from 'lucide-react'
import { VALID_PLANT_TYPES } from '@/lib/api-validation'

type PlantType = (typeof VALID_PLANT_TYPES)[number]

const PLANT_TYPE_LABELS: Record<PlantType, string> = {
  single_location: 'Single Location',
  multi_location: 'Multi-Location',
}

// Small admin control to toggle plants.plant_type. Plants are auto-created by
// the pollers (no create form), so this is edit-only. V1 scoring is IDENTICAL
// for single_location; multi_location is a forward-compat marker for V1.1
// branch/multi-location rollups — it does not change scoring today.
export function PlantTypeControl({ plantCode }: { plantCode: string }) {
  const [value, setValue] = useState<PlantType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/plants/${plantCode}`, { credentials: 'include' })
        if (!res.ok) return
        const json = await res.json()
        if (active && (json.plant_type === 'single_location' || json.plant_type === 'multi_location')) {
          setValue(json.plant_type)
        } else if (active) {
          setValue('single_location')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [plantCode])

  const handleChange = async (next: PlantType) => {
    if (next === value) return
    const prev = value
    setValue(next)
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/plants/${plantCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plant_type: next }),
      })
      if (!res.ok) {
        setValue(prev) // revert on failure
        setError('Failed to update plant type')
        return
      }
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 2000)
    } catch {
      setValue(prev)
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-7 w-44 bg-canvas-soft rounded-input animate-pulse" />
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-medium uppercase tracking-widest text-ink-mute">
        Plant Type
      </label>
      <select
        value={value ?? 'single_location'}
        disabled={saving}
        onChange={(ev) => handleChange(ev.target.value as PlantType)}
        aria-label="Plant type"
        className={cn(
          'h-7 px-2 text-[12px] border border-hairline-input rounded-input bg-canvas text-ink',
          'focus:outline-none focus:border-primary focus:shadow-focus',
          'disabled:opacity-50',
        )}
      >
        {VALID_PLANT_TYPES.map((t) => (
          <option key={t} value={t}>{PLANT_TYPE_LABELS[t]}</option>
        ))}
      </select>
      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-mute" strokeWidth={2} />}
      {savedTick && <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.5} />}
      {error && <span className="text-[10px] font-semibold text-red-600">{error}</span>}
      <span
        className="inline-flex items-center text-ink-mute"
        title="V1 performance scoring is identical for Single Location. Multi-Location is a marker for V1.1 branch/multi-location rollups and does not change scoring today."
      >
        <Info className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
    </div>
  )
}
