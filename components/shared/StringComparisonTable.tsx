import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GAP_CRITICAL, GAP_INFO, type StringStatus } from '@/lib/string-health'
import {
  STATUS_STYLES,
  statusKeyFromStringStatus,
} from '@/lib/design-tokens'

interface StringData {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: StringStatus
  energy_kwh?: number
}

interface StringComparisonTableProps {
  strings: StringData[]
}

/**
 * Row tint + font-weight per string status. Tints are a lightened variant
 * of the status background so the row reads as a status cue without
 * competing with the badge/fg color in the Status cell.
 */
const rowTintByStatus: Record<StringStatus, string> = {
  NORMAL: '',
  WARNING: 'bg-amber-50/60',
  CRITICAL: 'bg-red-50/60',
  OPEN_CIRCUIT: 'bg-violet-50 font-semibold',
  DISCONNECTED: 'bg-slate-100 font-semibold',
}

function gapColorClass(gap: number): string {
  if (gap > GAP_CRITICAL) return STATUS_STYLES.critical.fg
  if (gap > GAP_INFO) return STATUS_STYLES.warning.fg
  return STATUS_STYLES.healthy.fg
}

export function StringComparisonTable({ strings }: StringComparisonTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>String</TableHead>
          <TableHead>Voltage (V)</TableHead>
          <TableHead>Current (A)</TableHead>
          <TableHead>Power (W)</TableHead>
          <TableHead>kWh Today</TableHead>
          <TableHead>Gap %</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {strings.map((s) => {
          const statusStyle = STATUS_STYLES[statusKeyFromStringStatus(s.status)]
          return (
            <TableRow key={s.string_number} className={rowTintByStatus[s.status]}>
              <TableCell className="font-semibold font-mono text-slate-900">PV{s.string_number}</TableCell>
              <TableCell className="font-mono text-slate-700">{s.voltage.toFixed(1)}</TableCell>
              <TableCell className="font-mono text-slate-700">{s.current.toFixed(2)}</TableCell>
              <TableCell className="font-mono text-slate-700">{s.power.toFixed(1)}</TableCell>
              <TableCell className="font-mono text-slate-700">
                {s.energy_kwh != null ? s.energy_kwh.toFixed(1) : '—'}
              </TableCell>
              <TableCell>
                <span className={cn('font-mono font-semibold', gapColorClass(s.gap_percent))}>
                  {s.gap_percent.toFixed(1)}%
                </span>
              </TableCell>
              <TableCell>
                <span className={cn('text-xs font-semibold', statusStyle.fg)}>
                  {statusStyle.label}
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
