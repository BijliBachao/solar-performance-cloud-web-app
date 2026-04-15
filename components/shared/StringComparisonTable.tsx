import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GAP_CRITICAL, GAP_INFO, type StringStatus } from '@/lib/string-health'

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

const rowStyle: Record<string, string> = {
  CRITICAL: 'bg-red-50',
  WARNING: 'bg-yellow-50',
  OPEN_CIRCUIT: 'bg-red-100 font-semibold',
  DISCONNECTED: 'bg-gray-100 font-semibold',
}

const statusLabel: Record<string, { text: string; color: string }> = {
  NORMAL: { text: 'Normal', color: 'text-emerald-600' },
  WARNING: { text: 'Warning', color: 'text-amber-600' },
  CRITICAL: { text: 'Critical', color: 'text-red-600' },
  OPEN_CIRCUIT: { text: 'Open Circuit', color: 'text-red-800' },
  DISCONNECTED: { text: 'Disconnected', color: 'text-gray-700' },
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
          const sl = statusLabel[s.status] || statusLabel.NORMAL
          return (
            <TableRow
              key={s.string_number}
              className={rowStyle[s.status] || ''}
            >
              <TableCell className="font-medium">PV{s.string_number}</TableCell>
              <TableCell>{s.voltage.toFixed(1)}</TableCell>
              <TableCell>{s.current.toFixed(2)}</TableCell>
              <TableCell>{s.power.toFixed(1)}</TableCell>
              <TableCell className="font-mono">{s.energy_kwh != null ? s.energy_kwh.toFixed(1) : '—'}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    'font-medium',
                    s.gap_percent > GAP_CRITICAL && 'text-red-600',
                    s.gap_percent > GAP_INFO && s.gap_percent <= GAP_CRITICAL && 'text-yellow-600',
                    s.gap_percent <= GAP_INFO && 'text-green-600'
                  )}
                >
                  {s.gap_percent.toFixed(1)}%
                </span>
              </TableCell>
              <TableCell>
                <span className={cn('text-xs font-semibold', sl.color)}>{sl.text}</span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
