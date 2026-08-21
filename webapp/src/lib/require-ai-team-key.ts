import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';

/**
 * AI 팀 API(`/api/ai-team/*`) 가드 (#207).
 *
 * 헤더 `X-AI-Team-Key` 가 `env.aiTeamKey` 와 일치해야 통과.
 * 불일치 또는 env 미설정 시 404 — 존재 자체 비노출 (ingest·owner 패턴과 일관).
 *
 * **`STOCK_INGEST_KEY` 폴백을 두지 않는다.** 다른 내부 키들(`llmWorkerKey`·`appKey`·
 * `revalidateToken`)은 편의를 위해 폴백을 두지만, 이 키는 **주인의 비공개 글에 쓰기**
 * 권한을 준다. 데몬·안드로이드 앱에 이미 뿌려진 키로 그 문이 열려서는 안 된다.
 */
export function requireAiTeamKey(req: NextRequest): NextResponse | null {
  const expected = env.aiTeamKey.trim();
  if (!expected) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  const got = req.headers.get('x-ai-team-key') ?? '';
  if (got !== expected) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  return null;
}
