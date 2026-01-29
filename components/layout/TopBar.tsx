'use client'
import { UserButton } from '@clerk/nextjs'

interface TopBarProps {
  title?: string
}

export function TopBar({ title }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div>
        {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
      </div>
      <div className="flex items-center gap-4">
        <UserButton
          afterSignOutUrl="/sign-in"
          appearance={{
            elements: {
              avatarBox: 'h-8 w-8',
            },
          }}
        />
      </div>
    </header>
  )
}
