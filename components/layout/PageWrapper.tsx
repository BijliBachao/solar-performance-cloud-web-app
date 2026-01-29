import { cn } from '@/lib/utils'

interface PageWrapperProps {
  loading?: boolean
  error?: string
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-gray-200 rounded-xl" />
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
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {action && <div>{action}</div>}
      </div>
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
