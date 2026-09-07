export function intEnv(name: string, defaultValue: number): number {
  const val = process.env[name];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const env = {
  mongoUri: process.env.MONGO_URI ?? '',

  minio: {
    // The host for connecting to the MinIO server (no path - it is used as the S3 client's endPoint).
    endpoint: process.env.MINIO_ENDPOINT ?? '',
    // The public URL base exposed to the browser. Using an apex path (slowmade.duckdns.org/s3, say) works around
    // intermittent DNS failures on the minio-api subdomain. Unset, it falls back to the endpoint (for compatibility).
    publicHost: process.env.MINIO_PUBLIC_HOST || process.env.MINIO_ENDPOINT || '',
    accessKey: process.env.MINIO_ACCESSKEY ?? '',
    secretKey: process.env.MINIO_SECRETKEY ?? '',
    bucket: process.env.MINIO_BUCKET ?? '',
    port: process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT, 10) : undefined,
  },

  points: {
    newPost: intEnv('POINTS_FOR_NEW_POST', 5),
    newComment: intEnv('POINTS_FOR_NEW_COMMENT', 1),
    deletePostCost: intEnv('DELETE_POST_COST', 7),
  },


  // The site URL for canonical, OG, sitemap and metadata. SITE_URL (the main domain) wins, falling back to
  // NEXTAUTH_URL for compatibility. The login callback still uses NEXTAUTH_URL as before.
  siteUrl: process.env.SITE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',

  enjiImage: {
    // The site-wide daily limit (Pollinations is free; this is to prevent abuse)
    dailyLimit: intEnv('ENJI_IMAGE_DAILY_LIMIT', 50),
  },

  painterImage: {
    // The site-wide daily limit for painter-bot (Pollinations is free; this is to prevent abuse)
    dailyLimit: intEnv('PAINTER_IMAGE_DAILY_LIMIT', 50),
  },

  pollinations: {
    // The server-side secret API key (sk_). Empty means the header is not sent.
    apiKey: process.env.POLLINATIONS_API_KEY ?? '',
  },

  // The emails allowed into the owner-only hidden menu. Empty blocks every owner guard.
  ownerEmail: process.env.OWNER_EMAIL ?? '',

  netplay: {
    /**
     * Netplay for the classic games (#186). Turning it on adds a "play together" entry to the player.
     *
     * It only means anything with the signalling server (`/netplay/`) running, so it is off by default.
     */
    enabled: (process.env.RETRO_NETPLAY ?? '') === '1',
    /**
     * The WebRTC ICE server list (a JSON array string).
     *
     * **Empty means it only connects on the same LAN** - EmulatorJS warns exactly that in the console (measured).
     * Connecting from outside needs STUN, and if both ends are behind symmetric NAT (mobile CGNAT and the like) even
     * STUN fails and TURN (relaying) is required. This was pulled out so that then **only this value changes, not the code**.
     *
     * e.g. [{"urls":"stun:stun.l.google.com:19302"},
     *       {"urls":"turn:my.host:3478","username":"u","credential":"p"}]
     */
    iceServers: process.env.RETRO_NETPLAY_ICE_SERVERS ?? '',
  },

  google: {
    // Shared by login (GoogleProvider) and token refresh.
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },

  // Verified as the X-Ingest-Key header when the stock-automator daemon calls /api/ingest/*.
  // Empty blocks ingest entirely (secure by default).
  stockIngestKey: process.env.STOCK_INGEST_KEY ?? '',

  // The key non-browser clients (opencode and the like) present as `Authorization: Bearer` when the local LLM server
  // (the shim) at /llm/* is gated by nginx auth_request. An admin session (OWNER_EMAIL) passes without it.
  // Empty disables the key path (sessions only, secure by default).
  llmKey: process.env.LLM_KEY ?? '',

  // The internal base URL of the local LLM shim (BigMoeOnEdge, OpenAI-compatible). The site backend calls it directly
  // for feedback-note generation and server status (never exposed externally). It defaults to the localhost shim.
  llmBaseUrl: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:8848/v1',

  // The internal key the host cron uses to call the feedback-note worker
  // (/api/web-adventure/feedback-notes/worker). Empty means the worker runs only under an owner session (no cron). STOCK_INGEST_KEY can be reused.
  llmWorkerKey: process.env.LLM_WORKER_KEY || process.env.STOCK_INGEST_KEY || '',

  // The shared key the Android app (which has no login) uses to submit ending results to
  // /api/web-adventure/app-end-run (injected into the APK build, sent as x-app-key). Being in the client it is not strong security - it prevents misuse and allows rotation.
  // Empty disables app-end-run (secure by default). STOCK_INGEST_KEY can be reused.
  appKey: process.env.APP_KEY || process.env.STOCK_INGEST_KEY || '',

  // The token verifying the server's internal self-call (/api/revalidate). A background job (AI tagging) has no request scope
  // and cannot call revalidatePath from outside, so it self-fetches the route handler to invalidate the cache.
  // STOCK_INGEST_KEY is reused rather than adding an env var (it already exists in production, so it works at once and stays consistent across instances).
  // Empty disables both the endpoint and the trigger (secure by default).
  revalidateToken: process.env.REVALIDATE_TOKEN || process.env.STOCK_INGEST_KEY || '',

  // The Korea Astronomy and Space Science Institute's special-days data on the public data portal (#328). Used by the header calendar badge.
  // **Empty turns the feature off quietly** - no badge and no error. Adding a key turns it on.
  // It shares no fallback with the other keys: this is an identity card presented outward, not a lock of ours.
  holidayApiKey: process.env.HOLIDAY_API_KEY ?? '',
} as const;

export function validateEnv(): void {
  const required = ['MONGO_URI', 'MINIO_ENDPOINT', 'MINIO_ACCESSKEY', 'MINIO_SECRETKEY', 'MINIO_BUCKET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`필수 환경변수가 설정되지 않았습니다: ${missing.join(', ')}`);
  }
}
