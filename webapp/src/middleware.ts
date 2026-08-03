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
    // cdn.jsdelivr.net — Pretendard 폰트 CSS(@font-face) 로드 허용(#247).
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' blob: data: https:",
    // cdn.jsdelivr.net — Pretendard woff2 폰트 파일 로드 허용(#247).
    "font-src 'self' https://cdn.jsdelivr.net",
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
      // 대용량 업로드 라우트(api/attachment/upload·audio/upload)는 제외한다.
      // middleware 가 매칭되면 Next 가 요청 본문을 버퍼링하며 기본 10MB 로 제한 →
      // 10MB 초과 업로드가 잘려 req.formData() 파싱 실패(500). 이 라우트에서 middleware 가
      // 하는 일은 응답 CSP·보안헤더뿐이라(owner 검증은 라우트 requireAuth/requireOwner,
      // nginx 가 nosniff 추가) 제외해도 안전.
      source: '/((?!_next/static|_next/image|favicon.ico|api/attachment/upload|api/web-adventure/audio/upload).*)',
    },
  ],
}
