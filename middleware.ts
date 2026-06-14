import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Unauthenticated users can only access /login, /cancel and /api routes
  if (!user && pathname !== '/login' && !pathname.startsWith('/api/') && !pathname.startsWith('/cancel')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated users don't need /login (unless flagged with an error)
  const hasError = request.nextUrl.searchParams.has('error')
  if (user && pathname === '/login' && !hasError) {
    const todayUrl = request.nextUrl.clone()
    todayUrl.pathname = '/today'
    return NextResponse.redirect(todayUrl)
  }

  // Guard /settings — only admin and management
  if (user && pathname.startsWith('/settings')) {
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!appUser || !['admin', 'management'].includes(appUser.role)) {
      const todayUrl = request.nextUrl.clone()
      todayUrl.pathname = '/today'
      return NextResponse.redirect(todayUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
