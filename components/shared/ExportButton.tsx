'use client'

import { Download } from 'lucide-react'

interface ExportButtonProps {
  dates: string[]
  rows: any[]
  type: 'string' | 'inverter'
}

// Escape CSV value: wrap in quotes, escape internal quotes
function csvVal(val: any): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function ExportButton({ dates, rows, type }: ExportButtonProps) {
  function handleExport() {
    if (rows.length === 0) return

    const lines: string[] = []

    if (type === 'string') {
      const activeRows = rows.filter((r: any) => r.type !== 'unused')
      const unusedRows = rows.filter((r: any) => r.type === 'unused')

      // Header
      lines.push(['Plant', 'Inverter', 'MPPT', 'String', 'Type', 'kW/String', ...dates].join(','))
      // Active rows
      for (const row of activeRows) {
        const scores = dates.map(d => {
          const s = row.scores[d]
          return s !== null && s !== undefined ? `${Math.round(s)}%` : ''
        })
        lines.push([
          csvVal(row.plant_name),
          csvVal(row.device_name),
          `MPPT${row.mppt}`,
          `PV${row.string_number}`,
          'Active',
          row.kw_per_string != null ? `${row.kw_per_string} kW` : '',
          ...scores,
        ].join(','))
      }
      // Unused rows
      if (unusedRows.length > 0) {
        lines.push('')
        lines.push(`Unused / Spare Ports (${unusedRows.length})`)
        for (const row of unusedRows) {
          lines.push([
            csvVal(row.plant_name),
            csvVal(row.device_name),
            `MPPT${row.mppt}`,
            `PV${row.string_number}`,
            'Unused',
            '',
          ].join(','))
        }
      }
    } else {
      // Inverter level
      lines.push(['Plant', 'Inverter', 'kW/Inverter', ...dates].join(','))
      for (const row of rows) {
        const scores = dates.map(d => {
          const s = row.scores[d]
          return s !== null && s !== undefined ? `${Math.round(s)}%` : ''
        })
        lines.push([
          csvVal(row.plant_name),
          csvVal(row.device_name),
          row.kw != null ? `${row.kw} kW` : '',
          ...scores,
        ].join(','))
      }
    }

    // BOM for Excel UTF-8 support + join lines
    const bom = '\uFEFF'
    const csvContent = bom + lines.join('\n') + '\n'

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const fromDate = dates[0] || 'export'
    const toDate = dates[dates.length - 1] || ''
    a.href = url
    a.download = `${type}-analysis-${fromDate}-to-${toDate}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Download className="w-3.5 h-3.5" />
      Export CSV
    </button>
  )
}
