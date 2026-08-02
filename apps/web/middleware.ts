import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const url = request.nextUrl.clone()

  // Extract subdomain (www, app, or none)
  const subdomain = hostname.split('.')[0]
  const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1')

  // For localhost, check if port-based routing is used or parse from hostname
  let detectedSubdomain = subdomain
  if (isLocalhost) {
    // Support both www.openschool.local:3000 and localhost:3000 with ?subdomain=app
    const subdomainParam = url.searchParams.get('subdomain')
    if (subdomainParam) {
      detectedSubdomain = subdomainParam
    } else if (hostname.includes('www')) {
      detectedSubdomain = 'www'
    } else if (hostname.includes('app')) {
      detectedSubdomain = 'app'
    }
  }

  // Handle www subdomain (marketing site)
  if (detectedSubdomain === 'www' || (!detectedSubdomain && !isLocalhost)) {
    // Allow access to marketing routes and auth routes
    if (
      url.pathname.startsWith('/auth') ||
      url.pathname === '/' ||
      url.pathname.startsWith('/(marketing)')
    ) {
      return NextResponse.next()
    }

    // Redirect app routes to app subdomain
    if (url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/(app)')) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://app.openschool.local:3000'
      const redirectUrl = new URL(url.pathname, appUrl)
      redirectUrl.search = url.search
      return NextResponse.redirect(redirectUrl)
    }

    return NextResponse.next()
  }

  // Handle app subdomain (authenticated app)
  if (detectedSubdomain === 'app') {
    // Allow auth routes (login, signup, callback)
    if (
      url.pathname.startsWith('/auth/login') ||
      url.pathname.startsWith('/auth/signup') ||
      url.pathname.startsWith('/auth/callback')
    ) {
      return NextResponse.next()
    }

    // Check authentication for protected routes
    const response = NextResponse.next()

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing required Supabase environment variables')
      }

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
            for (const { name, value, options } of cookiesToSet) {
              request.cookies.set(name, value)
              response.cookies.set(name, value, options)
            }
          },
        },
      })

      const {
        data: { session },
      } = await supabase.auth.getSession()

      // If not authenticated and trying to access protected route, redirect to login
      if (!session && !url.pathname.startsWith('/auth')) {
        const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || 'http://www.openschool.local:3000'
        const redirectUrl = new URL('/auth/login', wwwUrl)
        redirectUrl.searchParams.set('redirect', url.pathname)
        return NextResponse.redirect(redirectUrl)
      }

      // If authenticated and on auth pages, redirect to dashboard
      if (
        session &&
        (url.pathname.startsWith('/auth/login') || url.pathname.startsWith('/auth/signup'))
      ) {
        const redirectUrl = new URL('/dashboard', url)
        return NextResponse.redirect(redirectUrl)
      }
    } catch (error) {
      // On auth error, redirect to login for safety rather than allowing unauthenticated access
      console.error('Middleware auth error:', error)
      const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || 'http://www.openschool.local:3000'
      const redirectUrl = new URL('/auth/login', wwwUrl)
      redirectUrl.searchParams.set('error', 'session_error')
      return NextResponse.redirect(redirectUrl)
    }

    return response
  }

  // Default: allow the request
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
