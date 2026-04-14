interface PageWrapperProps {
  loading?: boolean
  error?: string
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[#f0f0f0] rounded" />
        ))}
      </div>
      <div className="h-48 bg-[#f0f0f0] rounded" />
      <div className="h-32 bg-[#f0f0f0] rounded" />
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
        <h1 className="text-xl font-bold text-[#0a0a0a] leading-tight">{title}</h1>
        {action && <div>{action}</div>}
      </div>
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-[#e52020]">
          {error}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
