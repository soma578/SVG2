import { createServerClient } from '@supabase/ssr'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse, type NextRequest } from 'next/server'

const rateLimitRedisUrl =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.UPSTASH_REDIS_REST_KV_REST_API_URL

const rateLimitRedisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN

const hasRateLimitEnv = Boolean(rateLimitRedisUrl && rateLimitRedisToken)

const redis = hasRateLimitEnv
  ? new Redis({
      url: rateLimitRedisUrl!,
      token: rateLimitRedisToken!,
    })
  : null

const apiRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, '1 m'),
      prefix: 'ratelimit:api',
      analytics: true,
    })
  : null

const republishRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 m'),
      prefix: 'ratelimit:republish',
      analytics: true,
    })
  : null

const adminRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'ratelimit:admin',
      analytics: true,
    })
  : null

const rateLimitIdentifier = (request: NextRequest) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  request.headers.get('cf-connecting-ip') ||
  'anonymous'

const applyLimitHeaders = (
  response: NextResponse,
  result: { limit: number; remaining: number; reset: number },
) => {
  response.headers.set('X-RateLimit-Limit', String(result.limit))
  response.headers.set('X-RateLimit-Remaining', String(result.remaining))
  response.headers.set('X-RateLimit-Reset', String(result.reset))
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isApiRoute = pathname.startsWith('/api/')
  const isAdminRoute = pathname.startsWith('/admin')
  const limiter = pathname === '/api/republish'
    ? republishRateLimit
    : isApiRoute
      ? apiRateLimit
      : isAdminRoute
        ? adminRateLimit
        : null
  const limitResult = limiter
    ? await limiter.limit(rateLimitIdentifier(request))
    : null

  if (limitResult && !limitResult.success) {
    const response = NextResponse.json(
      { ok: false, error: 'rate limit exceeded' },
      { status: 429 },
    )
    applyLimitHeaders(response, limitResult)
    response.headers.set('Retry-After', String(Math.max(1, Math.ceil((limitResult.reset - Date.now()) / 1000))))
    return response
  }

  if (isApiRoute) {
    const response = NextResponse.next()
    if (limitResult) applyLimitHeaders(response, limitResult)
    return response
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = pathname === '/admin/login'

  if (isAdminRoute && !isLoginPage && !user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  if (isLoginPage && user) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  if (limitResult) applyLimitHeaders(supabaseResponse, limitResult)
  return supabaseResponse
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*'],
}
