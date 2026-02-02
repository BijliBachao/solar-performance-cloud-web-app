'use client'
import { ClerkProvider } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorPrimary: '#f97316',
    colorTextOnPrimaryBackground: '#ffffff',
    colorBackground: '#ffffff',
    colorInputBackground: '#f9fafb',
    colorInputText: '#111827',
  },
  elements: {
    formButtonPrimary: 'bg-orange-600 hover:bg-orange-700',
    card: 'shadow-lg',
  },
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      telemetry={false}
      standardBrowser={true}
      touchSession={false}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignUpUrl="/auth-redirect"
      afterSignInUrl="/auth-redirect"
    >
      {children}
    </ClerkProvider>
  )
}
