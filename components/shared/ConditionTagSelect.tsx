'use client'

import { cn } from '@/lib/utils'
import { VALID_CONDITION_TAGS } from '@/lib/api-validation'

export type ConditionTag = (typeof VALID_CONDITION_TAGS)[number]

// Human labels for each tag. Keyed off the central VALID_CONDITION_TAGS enum so
// the dropdown can never drift from the Zod schema / DB column.
export const CONDITION_TAG_LABELS: Record<ConditionTag, string> = {
  normal: 'Normal',
  known_shaded: 'Known Shaded',
  different_tilt: 'Different Tilt',
  different_orientation: 'Different Orientation',
  under_observation: 'Under Observation',
  excluded: 'Excluded',
  other: 'Other',
}

interface ConditionTagSelectProps {
  value: ConditionTag | null
  onChange: (tag: ConditionTag | null) => void
  disabled?: boolean
  className?: string
}

// Small labelled <select> over the 7 condition tags. An empty selection maps to
// `null` (no tag set). Used in the admin strings-config table; selecting a tag
// also auto-flips the row's Peer-comp toggle via the parent's edit state.
export function ConditionTagSelect({
  value,
  onChange,
  disabled,
  className,
}: ConditionTagSelectProps) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as ConditionTag))}
      aria-label="Condition tag"
      className={cn(
        'h-7 px-2 text-[12px] border border-slate-200 rounded-sm bg-white text-slate-900',
        'focus:outline-none focus:border-solar-gold focus:ring-2 focus:ring-solar-gold/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      <option value="">— None —</option>
      {VALID_CONDITION_TAGS.map((tag) => (
        <option key={tag} value={tag}>
          {CONDITION_TAG_LABELS[tag]}
        </option>
      ))}
    </select>
  )
}
