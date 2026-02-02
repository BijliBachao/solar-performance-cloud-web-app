import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/auth-redirect',
  '/pending-assignment',
  '/api/webhooks/clerk(.*)',
])

const isAdminRoute = createRouteMatcher(['/admin(.*)'])
const isDashboardRoute = createRouteMatcher(['/dashboard(.*)'])

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth()
  const { pathname } = request.nextUrl

  if (isPublicRoute(request)) return

  if (!userId) {
    if (pathname.startsWith('/api/'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const signInUrl = new URL('/sign-in', request.url)
    signInUrl.searchParams.set('redirect_url', pathname)
    return NextResponse.redirect(signInUrl)
  }

  if (isAdminRoute(request) || isDashboardRoute(request)) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', userId)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)'],
}
