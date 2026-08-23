export function intEnv(name: string, defaultValue: number): number {
  const val = process.env[name];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const env = {
  mongoUri: process.env.MONGO_URI ?? '',

  minio: {
    // MinIO 서버 연결용 host (path 불가 — S3 클라이언트 endPoint 로 사용).
    endpoint: process.env.MINIO_ENDPOINT ?? '',
    // 브라우저에 노출할 public URL base. apex 경로(예: slowmade.duckdns.org/s3)를 써서
    // minio-api 서브도메인 DNS 간헐 실패를 우회한다. 미설정이면 endpoint 로 fallback(하위호환).
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

  achievements: {
    firstPost: intEnv('ACHIEVEMENT_FIRST_POST_POINTS', 10),
    postCount10: intEnv('ACHIEVEMENT_POST_COUNT_10_POINTS', 20),
    postCount50: intEnv('ACHIEVEMENT_POST_COUNT_50_POINTS', 50),
    postCount100: intEnv('ACHIEVEMENT_POST_COUNT_100_POINTS', 100),
    postCount250: intEnv('ACHIEVEMENT_POST_COUNT_250_POINTS', 250),
    postCount500: intEnv('ACHIEVEMENT_POST_COUNT_500_POINTS', 500),
    postCount1000: intEnv('ACHIEVEMENT_POST_COUNT_1000_POINTS', 1000),
    postCount2500: intEnv('ACHIEVEMENT_POST_COUNT_2500_POINTS', 2500),
    postCount5000: intEnv('ACHIEVEMENT_POST_COUNT_5000_POINTS', 5000),
    postCount10000: intEnv('ACHIEVEMENT_POST_COUNT_10000_POINTS', 10000),
    post10Likes: intEnv('ACHIEVEMENT_POST_10_LIKES_POINTS', 50),
    firstComment: intEnv('ACHIEVEMENT_FIRST_COMMENT_POINTS', 5),
    commentCount10: intEnv('ACHIEVEMENT_COMMENT_COUNT_10_POINTS', 10),
    commentCount50: intEnv('ACHIEVEMENT_COMMENT_COUNT_50_POINTS', 25),
    commentCount100: intEnv('ACHIEVEMENT_COMMENT_COUNT_100_POINTS', 50),
    commentCount250: intEnv('ACHIEVEMENT_COMMENT_COUNT_250_POINTS', 100),
    commentCount500: intEnv('ACHIEVEMENT_COMMENT_COUNT_500_POINTS', 250),
    commentCount1000: intEnv('ACHIEVEMENT_COMMENT_COUNT_1000_POINTS', 500),
  },

  // canonical/OG/sitemap/metadata 용 사이트 URL. SITE_URL(메인 도메인)을 우선하고,
  // 없으면 NEXTAUTH_URL 로 fallback(하위호환). 로그인 콜백은 NEXTAUTH_URL 이 그대로 담당.
  siteUrl: process.env.SITE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',

  enjiImage: {
    // 사이트 전체 일일 한도 (Pollinations 비용 X, 남용 방지용)
    dailyLimit: intEnv('ENJI_IMAGE_DAILY_LIMIT', 50),
  },

  painterImage: {
    // painter-bot 사이트 전체 일일 한도 (Pollinations 비용 X, 남용 방지용)
    dailyLimit: intEnv('PAINTER_IMAGE_DAILY_LIMIT', 50),
  },

  pollinations: {
    // 서버 사이드 secret API key (sk_). 빈 문자열이면 헤더 전송 안 함.
    apiKey: process.env.POLLINATIONS_API_KEY ?? '',
  },

  // owner-only hidden 메뉴 접근 허용 이메일. 비어 있으면 모든 owner 가드 차단.
  ownerEmail: process.env.OWNER_EMAIL ?? '',

  netplay: {
    /**
     * 고전 게임 netplay (#186). 켜면 플레이어에 "함께 하기" 진입이 생긴다.
     *
     * 시그널링 서버(`/netplay/`)가 떠 있어야 의미가 있으므로 기본은 꺼짐.
     */
    enabled: (process.env.RETRO_NETPLAY ?? '') === '1',
    /**
     * WebRTC ICE 서버 목록(JSON 배열 문자열).
     *
     * **비어 있으면 같은 랜에서만 붙는다** — EmulatorJS 가 콘솔에 그렇게 경고한다(실측).
     * 밖에서 접속하려면 STUN 이 필요하고, 양쪽 다 symmetric NAT(모바일 CGNAT 등)면 STUN
     * 으로도 안 돼 TURN(중계)을 넣어야 한다. 그때 **코드가 아니라 이 값만** 바꾸면 되게 뺐다.
     *
     * 예) [{"urls":"stun:stun.l.google.com:19302"},
     *      {"urls":"turn:my.host:3478","username":"u","credential":"p"}]
     */
    iceServers: process.env.RETRO_NETPLAY_ICE_SERVERS ?? '',
  },

  google: {
    // 로그인(GoogleProvider)과 토큰 갱신이 함께 쓴다.
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },

  // stock-automator 데몬이 /api/ingest/* 호출 시 X-Ingest-Key 헤더로 검증.
  // 빈 문자열이면 ingest 전부 차단 (Default secure).
  stockIngestKey: process.env.STOCK_INGEST_KEY ?? '',

  // 로컬 LLM 서버(shim) /llm/* 를 nginx auth_request 로 게이트할 때, 비-브라우저(opencode 등)가
  // Authorization: Bearer 로 제시하는 키. 관리자 세션(OWNER_EMAIL)은 이 키 없이도 통과.
  // 빈 문자열이면 키 경로 비활성(세션만 허용, Default secure).
  llmKey: process.env.LLM_KEY ?? '',

  // 로컬 LLM shim(BigMoeOnEdge OpenAI 호환) 내부 호출 base URL. 피드백 노트 생성·서버 상태
  // 조회에 site 백엔드가 직접 호출(외부 노출 없음). 기본은 localhost shim.
  llmBaseUrl: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:8848/v1',

  // 피드백 노트 워커(/api/web-adventure/feedback-notes/worker) 를 host cron 이 호출할 때 쓰는
  // 내부 키. 비어 있으면 워커는 owner 세션으로만 실행(cron 불가). STOCK_INGEST_KEY 재사용 가능.
  llmWorkerKey: process.env.LLM_WORKER_KEY || process.env.STOCK_INGEST_KEY || '',

  // 안드로이드 앱(로그인 없음)이 엔딩 결과를 /api/web-adventure/app-end-run 에 제출할 때 쓰는
  // 공유 키(APK 빌드에 주입, x-app-key 헤더). 클라이언트에 있어 강보안은 아니며 오용 방지·회전용.
  // 빈 문자열이면 app-end-run 비활성(default secure). STOCK_INGEST_KEY 재사용 가능.
  appKey: process.env.APP_KEY || process.env.STOCK_INGEST_KEY || '',

  // AI 팀(Claude·MiniMax)이 /api/ai-team/* 호출 시 X-AI-Team-Key 헤더로 검증.
  // **폴백을 두지 않는다** — 이 키는 주인의 비공개 글에 쓰기 권한을 주므로, 데몬·앱에 이미
  // 뿌려진 STOCK_INGEST_KEY 로 열려서는 안 된다. 빈 문자열이면 전부 차단(Default secure).
  aiTeamKey: process.env.AI_TEAM_KEY ?? '',

  // 서버 내부 self-call(/api/revalidate) 검증 토큰. 백그라운드 작업(AI 태그)이 request scope
  // 밖에서 revalidatePath 를 못 하므로, 라우트 핸들러를 self-fetch 해 캐시를 무효화할 때 쓴다.
  // 새 env 없이 STOCK_INGEST_KEY 를 재사용(프로덕션에 이미 존재 → 즉시 동작, 인스턴스 간 일관).
  // 빈 문자열이면 엔드포인트·트리거 모두 비활성(Default secure).
  revalidateToken: process.env.REVALIDATE_TOKEN || process.env.STOCK_INGEST_KEY || '',
} as const;

export function validateEnv(): void {
  const required = ['MONGO_URI', 'MINIO_ENDPOINT', 'MINIO_ACCESSKEY', 'MINIO_SECRETKEY', 'MINIO_BUCKET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`필수 환경변수가 설정되지 않았습니다: ${missing.join(', ')}`);
  }
}
