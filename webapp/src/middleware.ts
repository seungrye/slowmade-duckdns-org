import { NextRequest, NextResponse } from 'next/server'

/**
 * owner 전용 경로 — server component / API route 에서 `requireOwner` 로
 * 최종 검증되지만, middleware 에서도 *session cookie 자체 미존재* 시
 * 즉시 404 로 끊어 라우트 코드 진입을 막는 빠른 1차 가드.
 *
 * NextAuth 세션 쿠키 명칭은 `authjs.session-token` (v5 dev) 또는
 * `__Secure-authjs.session-token` (prod). 쿠키 존재 = 인증된 *어떤* 사용자
 * — 진짜 owner 검증은 server component 측에서.
 */
const OWNER_ONLY_PREFIXES = ['/admin/', '/api/admin/']

function isOwnerOnlyPath(pathname: string): boolean {
  return OWNER_ONLY_PREFIXES.some((p) => pathname === p.slice(0, -1) || pathname.startsWith(p))
}

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get('authjs.session-token') ||
      request.cookies.get('__Secure-authjs.session-token') ||
      // 호환 — v4 next-auth 이름
      request.cookies.get('next-auth.session-token') ||
      request.cookies.get('__Secure-next-auth.session-token'),
  )
}

export function middleware(request: NextRequest) {
  if (isOwnerOnlyPath(request.nextUrl.pathname) && !hasSessionCookie(request)) {
    return new NextResponse(null, { status: 404 })
  }
  const cspHeader = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' — /games/bevy-rogue 의 Bevy(WASM) 컴파일 허용.
    // 'unsafe-eval' 보다 안전(JS eval 은 여전히 금지, WebAssembly 만 허용).
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self' https://firebase.googleapis.com https://firebaseinstallations.googleapis.com https://firebaseremoteconfig.googleapis.com https://www.google-analytics.com https://analytics.google.com https://firebaselogging.googleapis.com https://firebaselogging-pa.googleapis.com",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join('; ')

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', cspHeader)
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
    },
  ],
}
