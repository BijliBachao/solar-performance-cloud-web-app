'use client'

import { Suspense } from 'react'
import { NocConsole } from '@/components/admin/NocConsole'

/**
 * NOC console route — /admin/noc
 * Fleet-wide string health for Network Operations Centre triage.
 * SUPER_ADMIN only (enforced by the API endpoint).
 */
export default function NocPage() {
  return (
    <div className="px-4 sm:px-6 py-5 max-w-[1600px] mx-auto">
      <Suspense fallback={<div className="text-xs text-slate-500">Loading NOC…</div>}>
        <NocConsole />
      </Suspense>
    </div>
  )
}
