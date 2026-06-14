interface PageStat {
  label: string
  value: React.ReactNode
}

interface PageWrapperProps {
  loading?: boolean
  error?: string
  title: string
  subtitle?: string
  stats?: PageStat[]
  children: React.ReactNode
  action?: React.ReactNode
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-card bg-hairline" />
        ))}
      </div>
      <div className="h-48 rounded-card bg-hairline" />
    </div>
  )
}

export function PageWrapper({
  loading,
  error,
  title,
  subtitle,
  stats,
  children,
  action,
}: PageWrapperProps) {
  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-5 mb-6">
        <div>
          <h1 className="text-2xl font-light leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm font-normal text-ink-mute">{subtitle}</p>
          )}
          {stats && stats.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-baseline gap-1.5 rounded-pill border border-hairline bg-canvas px-3 py-1 text-xs text-ink-mute"
                >
                  <span className="text-[13px] font-medium text-ink tabular-nums">{s.value}</span>
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="rounded-card border border-red-200 border-l-[3px] border-l-red-600 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
