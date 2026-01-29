import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface MonthlyHealthData {
  string_number: number
  avg_health_score: number
  avg_current: number
  days_critical: number
  days_warning: number
}

interface MonthlyHealthReportProps {
  data: MonthlyHealthData[]
}

function getHealthColor(score: number): string {
  if (score >= 90) return 'bg-green-100 text-green-800'
  if (score >= 75) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

export function MonthlyHealthReport({ data }: MonthlyHealthReportProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-center text-gray-500 py-4">
        No health data available for this period.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>String #</TableHead>
          <TableHead>Health Score</TableHead>
          <TableHead>Avg Current (A)</TableHead>
          <TableHead>Days Critical</TableHead>
          <TableHead>Days Warning</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.string_number}>
            <TableCell className="font-medium">
              PV{row.string_number}
            </TableCell>
            <TableCell>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  getHealthColor(row.avg_health_score)
                )}
              >
                {row.avg_health_score.toFixed(1)}%
              </span>
            </TableCell>
            <TableCell>{row.avg_current.toFixed(2)}</TableCell>
            <TableCell>
              {row.days_critical > 0 ? (
                <span className="text-red-600 font-medium">
                  {row.days_critical}
                </span>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </TableCell>
            <TableCell>
              {row.days_warning > 0 ? (
                <span className="text-yellow-600 font-medium">
                  {row.days_warning}
                </span>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
