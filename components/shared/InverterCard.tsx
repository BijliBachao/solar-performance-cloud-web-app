import { cn } from '@/lib/utils'
import { Cpu } from 'lucide-react'

interface InverterCardProps {
  device: {
    id: string
    device_name: string | null
    model: string | null
    max_strings: number | null
    string_summary?: { ok: number; warning: number; critical: number }
  }
}

export function InverterCard({ device }: InverterCardProps) {
  const summary = device.string_summary || { ok: 0, warning: 0, critical: 0 }
  const total = summary.ok + summary.warning + summary.critical

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="h-5 w-5 text-gray-400" />
        <h4 className="font-medium text-gray-900">
          {device.device_name || device.id}
        </h4>
      </div>
      {device.model && (
        <p className="text-xs text-gray-500 mb-3">{device.model}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1 h-2 rounded-full overflow-hidden bg-gray-100">
          {summary.ok > 0 && (
            <div
              className="bg-green-500 rounded-full"
              style={{ width: `${(summary.ok / total) * 100}%` }}
            />
          )}
          {summary.warning > 0 && (
            <div
              className="bg-yellow-500 rounded-full"
              style={{ width: `${(summary.warning / total) * 100}%` }}
            />
          )}
          {summary.critical > 0 && (
            <div
              className="bg-red-500 rounded-full"
              style={{ width: `${(summary.critical / total) * 100}%` }}
            />
          )}
        </div>
        <span className="text-xs text-gray-500">
          {device.max_strings || total} strings
        </span>
      </div>
      <div className="flex gap-3 mt-2 text-xs">
        <span className="text-green-600">{summary.ok} OK</span>
        <span className="text-yellow-600">{summary.warning} Warn</span>
        <span className="text-red-600">{summary.critical} Crit</span>
      </div>
    </div>
  )
}
