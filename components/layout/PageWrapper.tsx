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
          <div key={i} className="h-24 bg-[#252525] rounded-sm" />
        ))}
      </div>
      <div className="h-48 bg-[#252525] rounded-sm" />
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
        <h1 className="text-lg font-bold text-[#0a0a0a] tracking-tight">{title}</h1>
        {action && <div>{action}</div>}
      </div>
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="rounded-sm border-l-[3px] border-l-[#e52020] bg-[#1a1a1a] p-4 text-xs font-semibold text-[#e52020]">
          {error}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
