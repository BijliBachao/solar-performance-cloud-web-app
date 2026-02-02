import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Solar Performance Cloud
        </h1>
        <p className="text-gray-600 mb-6">Create your account</p>
        <SignUp afterSignUpUrl="/auth-redirect" signInUrl="/sign-in" />
      </div>
    </div>
  )
}
