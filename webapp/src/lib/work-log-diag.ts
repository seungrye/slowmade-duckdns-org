// work_log 진단 올리기 (#409) — 순수 부분.
//
// 앱이 죽으면 자취가 폰에만 남는다. 사람이 '진단 내보내기' 를 해서 보내 줘야 볼 수 있는데,
// 중간 한 단계라도 빠지면 아무것도 못 본다 — 실제로 세 판을 자취 없이 고쳤다.
// 그래서 앱이 **이미 있는 통로**(APK 배포에 쓰는 x-app-key 길)로 올리게 한다.
//
// APK 와 달리 **글자**라 작다. MinIO 에 둘 것도 없이 DB 에 그대로 담는다.

/** 받아 줄 진단 글 상한. 실제로는 수십 KB 다 — 1MB 면 넉넉하고, Next 의 10MB 벽에도 안 닿는다. */
export const MAX_DIAG_BYTES = 1024 * 1024;

/** 버전 이름·기기 이름은 짧다. 길게 오면 자른다 — 목록을 망가뜨리지 않게. */
const MAX_LABEL = 120;

export interface DiagUpload {
  versionCode: number;
  versionName: string;
  device: string;
  /** 왜 올렸나 — 'crash' | 'anr' | 'manual' 처럼 짧은 말. 목록에서 훑을 때 쓴다. */
  kind: string;
  body: string;
}

/**
 * 올라온 것이 쓸 만한지 본다. **못 쓰겠으면 null** — 부르는 쪽이 400 을 돌려준다.
 *
 * 버전·기기는 없어도 받는다(옛 판이 올릴 수도 있다). **글이 비면 받지 않는다** —
 * 빈 것을 쌓아 봐야 최근 스무 벌 자리만 밀어낸다.
 */
export function parseDiagUpload(raw: {
  versionCode?: unknown;
  versionName?: unknown;
  device?: unknown;
  kind?: unknown;
  body?: unknown;
}): DiagUpload | null {
  const body = typeof raw.body === 'string' ? raw.body : '';
  if (!body.trim()) return null;
  if (Buffer.byteLength(body, 'utf8') > MAX_DIAG_BYTES) return null;

  const code = Number(raw.versionCode);
  return {
    versionCode: Number.isFinite(code) && code > 0 ? Math.floor(code) : 0,
    versionName: clip(raw.versionName),
    device: clip(raw.device),
    kind: clip(raw.kind) || 'unknown',
    body,
  };
}

function clip(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_LABEL) : '';
}
