// jsdom 파일에서만 싣는다 — node 환경 파일(288 중 221)이 매번 물 이유가 없다.
// 실측: setup 합계 40s → 10s, 전체 43s → 34s. 매처가 실렸는지는 test-setup.test.ts 가 못 박는다.
// (기본 진입점 '@testing-library/jest-dom' 은 타입 파일이 모듈이 아니라 동적 import 에서
//  tsc 가 TS2306 을 낸다. vitest 전용 진입점은 정상적인 모듈이다.)
if (typeof window !== 'undefined') await import('@testing-library/jest-dom/vitest');
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── .env / .env.local 로드 (#91) ────────────────────────────────────────────
// 서사 검증 테스트(lib/web-adventure/__tests__)는 mongo 에서 씬을 읽는데, 하나같이
//     if (!process.env.MONGO_URI) return;
// 로 시작한다. 즉 MONGO_URI 가 없으면 씬을 불러오지 않고 **조용히 통과**한다.
// 실제로 그렇게 돌고 있었다 — 18 파일 110 개가 아무것도 검증하지 않은 채 초록이었고,
// DB 를 물리자마자 2 건이 실패했다.
//
// vitest 는 next 처럼 .env 를 자동으로 읽지 않으므로 여기서 채워 넣는다. dotenv 를 새로
// 들이지 않고 직접 파싱한다(저장소의 스크립트들이 쓰는 방식과 같다).
// **필요한 키만** 가져온다. 파일 전체를 넣으면 다른 테스트가 깨진다 — 예컨대 업로드
// 테스트는 S3 관련 env 가 없는 상태를 가정하고 'test-endpoint.com' 를 기대하는데,
// 실제 값이 들어가면 그 가정이 무너진다(실제로 겪었다).
const WANTED = ['MONGO_URI', 'MONGODB_URI'];

function loadEnvFile(name: string): void {
  const p = resolve(__dirname, '..', name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (!WANTED.includes(key)) continue;
    if (process.env[key] !== undefined) continue; // 이미 주어진 값이 우선
    process.env[key] = m[2].trim().replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
}
loadEnvFile('.env');
loadEnvFile('.env.local');
// 스크립트마다 키 이름이 갈려 있어(MONGO_URI / MONGODB_URI) 한쪽만 있으면 채워 준다.
if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;

if (!process.env.MONGO_URI) {
  // 조용히 넘어가면 검증이 꺼진 줄 모른 채 초록을 보게 된다. 눈에 띄게 알린다.
  console.warn(
    '\n[test-setup] MONGO_URI 가 없어 서사 검증(__tests__)이 실제로 돌지 않습니다.\n' +
      '            통과해도 검증된 것이 아닙니다 — .env.local 을 확인하세요.\n',
  );
}

// jsdom 에는 ResizeObserver / DOMMatrix 가 없으나 @xyflow/react 가 마운트 시점에
// 참조한다. 빈 stub 으로 충분 — 테스트는 레이아웃 측정을 검증하지 않는다.
// (#222 — /scenes/graph ReactFlow 도입.)
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// jsdom 에는 matchMedia 도 없다. useMobile() 이 마운트 시점에 부르므로, 그 훅을 쓰는
// 컴포넌트를 렌더하는 테스트가 전부 죽는다(#95 에서 겪었다). 기본은 "모바일 아님".
// 모바일 동작을 검증하려면 테스트에서 window.matchMedia 와 innerWidth 를 함께 바꾼다.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (typeof globalThis !== 'undefined') {
  const g = globalThis as Record<string, unknown>;
  if (!g.ResizeObserver) g.ResizeObserver = StubResizeObserver;
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    if (!w.ResizeObserver) w.ResizeObserver = StubResizeObserver;
  }
}
