'use client'

import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Solar Performance Cloud
        </h1>
        <p className="text-gray-600 mb-6">Sign in to your account</p>
        <SignIn
          afterSignInUrl="/auth-redirect"
          signUpUrl="/sign-up"
          routing="path"
          path="/sign-in"
        />
      </div>
    </div>
  )
}
