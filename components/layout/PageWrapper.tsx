interface PageWrapperProps {
  loading?: boolean
  error?: string
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-md bg-slate-100" />
        ))}
      </div>
      <div className="h-48 rounded-md bg-slate-100" />
    </div>
  )
}

export function PageWrapper({
  loading,
  error,
  title,
  children,
  action,
}: PageWrapperProps) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">
          {title}
        </h1>
        {action && <div>{action}</div>}
      </div>
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="rounded-md border border-red-200 border-l-[3px] border-l-red-600 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
