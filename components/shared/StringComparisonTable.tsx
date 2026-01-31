import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface StringData {
  string_number: number
  voltage: number
  current: number
  power: number
  gap_percent: number
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'OFFLINE'
}

interface StringComparisonTableProps {
  strings: StringData[]
}

export function StringComparisonTable({ strings }: StringComparisonTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>String #</TableHead>
          <TableHead>Voltage (V)</TableHead>
          <TableHead>Current (A)</TableHead>
          <TableHead>Power (W)</TableHead>
          <TableHead>Gap %</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {strings.map((s) => (
          <TableRow
            key={s.string_number}
            className={cn(
              s.status === 'CRITICAL' && 'bg-red-50',
              s.status === 'WARNING' && 'bg-yellow-50',
              s.status === 'OFFLINE' && 'bg-gray-50 opacity-60'
            )}
          >
            <TableCell className="font-medium">PV{s.string_number}</TableCell>
            <TableCell>{s.voltage.toFixed(1)}</TableCell>
            <TableCell>{s.status === 'OFFLINE' ? <span className="text-gray-400">0.00</span> : s.current.toFixed(2)}</TableCell>
            <TableCell>{s.status === 'OFFLINE' ? <span className="text-gray-400">0.0</span> : s.power.toFixed(1)}</TableCell>
            <TableCell>
              {s.status === 'OFFLINE' ? (
                <span className="text-gray-400">—</span>
              ) : (
                <span
                  className={cn(
                    'font-medium',
                    s.gap_percent > 50 && 'text-red-600',
                    s.gap_percent > 25 && s.gap_percent <= 50 && 'text-yellow-600',
                    s.gap_percent <= 25 && 'text-green-600'
                  )}
                >
                  {s.gap_percent.toFixed(1)}%
                </span>
              )}
            </TableCell>
            <TableCell>
              <StatusBadge status={s.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
