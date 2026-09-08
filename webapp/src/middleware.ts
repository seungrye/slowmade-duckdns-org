import { NextRequest, NextResponse } from 'next/server'

/**
 * The owner-only paths - finally verified by `requireOwner` in the server component or API route,
 * but the middleware also cuts them off with a 404 when *the session cookie itself is absent*,
 * a fast first guard keeping the request out of the route code.
 *
 * NextAuth's session cookie is named `authjs.session-token` (v5 dev) or
 * `__Secure-authjs.session-token` (prod). The cookie's presence means *some* authenticated user
 * - the real owner check happens in the server component.
 */
// `/scenes/` - Eternia's authoring tools (#179). The real check is requireOwner in scenes/layout.tsx.
const OWNER_ONLY_PREFIXES = ['/admin/', '/api/admin/', '/scenes/']

function isOwnerOnlyPath(pathname: string): boolean {
  return OWNER_ONLY_PREFIXES.some((p) => pathname === p.slice(0, -1) || pathname.startsWith(p))
}

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get('authjs.session-token') ||
      request.cookies.get('__Secure-authjs.session-token') ||
      // Compatibility - the v4 next-auth name
      request.cookies.get('next-auth.session-token') ||
      request.cookies.get('__Secure-next-auth.session-token'),
  )
}

/**
 * The retro emulator player (#109) - the document /games/retro's play screen opens in an iframe.
 *
 * The CSP is lowered in two places for **this document alone**. The site-wide policy is unchanged.
 *
 * 1. `frame-ancestors 'self'` - leaving the default 'none' would block even us from framing it.
 *    An outside site still cannot wrap it.
 *
 * 2. `'unsafe-eval'` - EmulatorJS's core files (`cores/*-wasm.data`) are **7z archives** that must be
 *    unpacked in the browser, and the emscripten glue that does it calls
 *    `cwrap("extract", "number", ["string"])`. emscripten's cwrap avoids eval only when the arguments and return
 *    are all numbers; with a string in there, as here, it builds the wrapper through eval.
 *    That is, without this **every core load fails silently** (wasm-unsafe-eval is not enough - that
 *    allows WebAssembly alone).
 *    Every script this document calls is same-origin, and the only reflected input, `name`, is
 *    sanitised by player.html.
 *
 * 3. `blob:` (script-src and connect-src) - the core is unpacked from the 7z, the result made into a Blob,
 *    loaded through a `<script>` and read with fetch. Opening only one of the two stalls the boot with "Loading the script 'blob:…'
 *    violates CSP" or "Failed to fetch". These values were confirmed by running five systems
 *    through a headless browser.
 *
 * What is absent here is deliberately absent - EmulatorJS checks its version against cdn.emulatorjs.org at startup,
 * and that host is not in `connect-src`, so **it is blocked.** Self-hosting being the point,
 * blocking it is correct (player.html swallows that failure quietly).
 */
const EMULATOR_PLAYER_PATH = '/games/retro/player.html'

export function middleware(request: NextRequest) {
  if (isOwnerOnlyPath(request.nextUrl.pathname) && !hasSessionCookie(request)) {
    return new NextResponse(null, { status: 404 })
  }
  const isEmulatorPlayer = request.nextUrl.pathname === EMULATOR_PLAYER_PATH
  const cspHeader = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' - allowing /games/bevy-rogue's Bevy (WASM) compilation.
    // Safer than 'unsafe-eval' (JS eval stays forbidden; only WebAssembly is allowed).
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isEmulatorPlayer ? " 'unsafe-eval' blob:" : ''} https://cdn.jsdelivr.net https://www.googletagmanager.com`,
    // cdn.jsdelivr.net - allowing the Pretendard font CSS (@font-face) to load (#247).
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' blob: data: https:",
    // cdn.jsdelivr.net - allowing the Pretendard woff2 font files to load (#247).
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
      // The large-upload routes (api/attachment/upload, audio/upload, games/retro/rom-upload and
      // work-log/release) are excluded.
      // A middleware match makes Next buffer the request body and cap it at 10MB by default ->
      // an upload over 10MB is truncated and req.formData() fails to parse (500). All the middleware does on these
      // routes is set the response's CSP and security headers (the owner check is the route's requireAuth/requireOwner,
      // and nginx adds nosniff), so excluding them is safe.
      //
      // This is why the rom upload lives on **a different path** from the list (`api/games/retro/roms`) - excluding by prefix
      // would drag the nested `[id]/file` (the rom download) out with it and strip its security headers.
      // attachment keeps its upload separate for the same reason.
      //
      // work-log/release joined later (#407). The moment an APK went over 10MB it was truncated and
      // `req.formData()` failed, and the server log said so plainly:
      //   "Request body exceeded 10MB for /api/work-log/release."
      // **This list has to be revisited whenever a new upload route is added.**
      source: '/((?!_next/static|_next/image|favicon.ico|api/attachment/upload|api/web-adventure/audio/upload|api/games/retro/rom-upload|api/work-log/release).*)',
    },
  ],
}
