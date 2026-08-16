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
// `/scenes/` — 〈에테르니아〉 작성 도구 (#179). 진짜 검증은 scenes/layout.tsx 의 requireOwner.
const OWNER_ONLY_PREFIXES = ['/admin/', '/api/admin/', '/scenes/']

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

/**
 * 레트로 에뮬레이터 플레이어 (#109) — /games/retro 의 플레이 화면이 iframe 으로 띄우는 문서.
 *
 * 이 문서 **하나만** CSP 를 두 군데 낮춘다. 사이트 전체 정책은 그대로다.
 *
 * 1. `frame-ancestors 'self'` — 기본값 'none' 을 그대로 두면 우리 자신이 띄우는 것까지 막힌다.
 *    외부 사이트가 감싸는 건 여전히 안 된다.
 *
 * 2. `'unsafe-eval'` — EmulatorJS 의 코어 파일(`cores/*-wasm.data`)은 **7z 아카이브**라
 *    브라우저에서 풀어야 하는데, 그 일을 하는 emscripten 글루가
 *    `cwrap("extract", "number", ["string"])` 를 부른다. emscripten 의 cwrap 은 인자·반환이
 *    전부 number 일 때만 eval 없이 끝나고, 여기처럼 string 이 끼면 래퍼를 eval 로 만든다.
 *    즉 이게 없으면 **모든 코어 로딩이 조용히 실패한다**(wasm-unsafe-eval 로는 부족 — 그건
 *    WebAssembly 만 허용한다).
 *    이 문서가 부르는 스크립트는 전부 same-origin 이고, 유일한 반사 입력인 `name` 은
 *    player.html 이 정화한다.
 *
 * 3. `blob:` (script-src·connect-src) — 코어를 7z 에서 푼 뒤 그 결과를 Blob 으로 만들어
 *    `<script>` 로 싣고 fetch 로 읽는다. 둘 중 하나만 열면 "Loading the script 'blob:…'
 *    violates CSP" 또는 "Failed to fetch" 로 부팅이 멈춘다. 헤드리스 브라우저로 다섯 기종을
 *    돌려 가며 확인한 값이다.
 *
 * 여기 없는 것은 일부러 없는 것이다 — EmulatorJS 는 시작할 때 cdn.emulatorjs.org 로 버전을
 * 확인하는데, `connect-src` 에 그 호스트를 넣지 않아 **막힌다.** 자체 호스팅이 목적이므로
 * 막히는 게 맞다(그 실패는 player.html 이 조용히 삼킨다).
 */
const EMULATOR_PLAYER_PATH = '/games/retro/player.html'

export function middleware(request: NextRequest) {
  if (isOwnerOnlyPath(request.nextUrl.pathname) && !hasSessionCookie(request)) {
    return new NextResponse(null, { status: 404 })
  }
  const isEmulatorPlayer = request.nextUrl.pathname === EMULATOR_PLAYER_PATH
  const cspHeader = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' — /games/bevy-rogue 의 Bevy(WASM) 컴파일 허용.
    // 'unsafe-eval' 보다 안전(JS eval 은 여전히 금지, WebAssembly 만 허용).
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isEmulatorPlayer ? " 'unsafe-eval' blob:" : ''} https://cdn.jsdelivr.net https://www.googletagmanager.com`,
    // cdn.jsdelivr.net — Pretendard 폰트 CSS(@font-face) 로드 허용(#247).
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' blob: data: https:",
    // cdn.jsdelivr.net — Pretendard woff2 폰트 파일 로드 허용(#247).
    "font-src 'self' https://cdn.jsdelivr.net",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isEmulatorPlayer ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    `connect-src 'self'${isEmulatorPlayer ? ' blob:' : ''} https://firebase.googleapis.com https://firebaseinstallations.googleapis.com https://firebaseremoteconfig.googleapis.com https://www.google-analytics.com https://analytics.google.com https://firebaselogging.googleapis.com https://firebaselogging-pa.googleapis.com`,
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
      // 대용량 업로드 라우트(api/attachment/upload·audio/upload·games/retro/rom-upload)는 제외한다.
      // middleware 가 매칭되면 Next 가 요청 본문을 버퍼링하며 기본 10MB 로 제한 →
      // 10MB 초과 업로드가 잘려 req.formData() 파싱 실패(500). 이 라우트에서 middleware 가
      // 하는 일은 응답 CSP·보안헤더뿐이라(owner 검증은 라우트 requireAuth/requireOwner,
      // nginx 가 nosniff 추가) 제외해도 안전.
      //
      // 롬 업로드가 목록(`api/games/retro/roms`)과 **다른 경로**인 이유가 여기 있다 — 접두사로
      // 빼면 하위 `[id]/file`(롬 내려받기)까지 딸려 빠져 보안 헤더가 사라진다.
      // attachment 도 같은 이유로 upload 를 따로 뒀다.
      source: '/((?!_next/static|_next/image|favicon.ico|api/attachment/upload|api/web-adventure/audio/upload|api/games/retro/rom-upload).*)',
    },
  ],
}
