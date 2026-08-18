// /api/internal/netplay-check — nginx `auth_request` 전용 (#186, #188).
//
// netplay 시그널링 서버(`/netplay/`)를 그냥 열어 두면 **로그인도 안 한 아무나** 붙을 수 있다.
// nginx 가 매 요청마다 여기로 물어보고, 200 일 때만 통과시킨다. socket.io 핸드셰이크도 결국
// 일반 HTTP 요청이라 이 검사에 걸린다.
//
// **소유자가 아니라 로그인 사용자면 통과한다** (#188). 같은 롬을 각자 올린 다른 계정끼리도
// 함께 하려면 소유자 전용이어서는 안 된다. 방은 롬 바이트로 갈리므로, 같은 롬을 가진 사람만
// 같은 방에 들어간다.
//
// **본문을 주지 않는다.** nginx auth_request 는 상태 코드만 본다(본문은 버려진다).
// 굳이 실어 보내면 어디에도 안 쓰이면서 정보만 흘린다.
//
// 브라우저가 같은 오리진으로 붙으므로 세션 쿠키가 그대로 실려 온다 — 그래서 이 방식이 된다.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';

export async function GET() {
  const authed = await requireAuth();
  // 헬퍼는 실패 시 자기 형식의 응답을 주지만, auth_request 규약에서는 401 이어야 한다
  // (nginx 가 401/403 만 "인가 실패"로 다루고 나머지는 500 으로 본다).
  if (authed instanceof NextResponse) return new NextResponse(null, { status: 401 });
  return new NextResponse(null, { status: 200 });
}
