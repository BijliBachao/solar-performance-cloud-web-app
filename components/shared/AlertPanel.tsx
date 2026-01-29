'use client'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Info, XCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Alert {
  id: number
  severity: string
  message: string
  device_name?: string
  string_number: number
  created_at: string
  gap_percent?: number | null
}

interface AlertPanelProps {
  alerts: Alert[]
  onResolve?: (id: number) => void
}

const severityConfig: Record<
  string,
  { icon: any; color: string; border: string; bg: string }
> = {
  CRITICAL: {
    icon: XCircle,
    color: 'text-red-600',
    border: 'border-l-red-500',
    bg: 'bg-red-50',
  },
  WARNING: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-50',
  },
  INFO: {
    icon: Info,
    color: 'text-blue-600',
    border: 'border-l-blue-500',
    bg: 'bg-blue-50',
  },
}

export function AlertPanel({ alerts, onResolve }: AlertPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
        <p>No active alerts</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const config = severityConfig[alert.severity] || severityConfig.INFO
        const Icon = config.icon
        return (
          <div
            key={alert.id}
            className={cn(
              'border-l-4 rounded-r-lg p-4',
              config.border,
              config.bg
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Icon className={cn('h-5 w-5 mt-0.5', config.color)} />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {alert.message}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {alert.device_name && `${alert.device_name} - `}
                    String {alert.string_number}
                    {alert.gap_percent != null &&
                      ` - Gap: ${Number(alert.gap_percent).toFixed(1)}%`}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(alert.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
              {onResolve && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResolve(alert.id)}
                  className="text-xs"
                >
                  Resolve
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
