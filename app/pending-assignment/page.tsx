'use client'
import { useClerk } from '@clerk/nextjs'

export default function PendingAssignmentPage() {
  const { signOut } = useClerk()
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center p-8 bg-white rounded-xl shadow-lg">
        <div className="text-5xl mb-4">&#9203;</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Account Pending Assignment
        </h1>
        <p className="text-gray-600 mb-6">
          Your account has been created. Please wait for an administrator to
          assign you to an organization.
        </p>
        <button
          onClick={() => signOut({ redirectUrl: '/sign-in' })}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
