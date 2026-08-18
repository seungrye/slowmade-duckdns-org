// /api/internal/owner-check — nginx `auth_request` 전용 (#186).
//
// netplay 시그널링 서버(`/netplay/`)를 그냥 열어 두면 **누구나 방에 끼어들 수 있는 공개
// 엔드포인트**가 하나 생긴다. nginx 가 매 요청마다 여기로 물어보고, 200 일 때만 통과시킨다.
// socket.io 핸드셰이크도 결국 일반 HTTP 요청이라 이 검사에 걸린다.
//
// **본문을 주지 않는다.** nginx auth_request 는 상태 코드만 본다(본문은 버려진다).
// 굳이 실어 보내면 어디에도 안 쓰이면서 정보만 흘린다.
//
// 브라우저가 같은 오리진으로 붙으므로 세션 쿠키가 그대로 실려 온다 — 그래서 이 방식이 된다.

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';

export async function GET() {
  const owner = await requireOwner();
  // requireOwner 는 실패 시 404 를 돌려주지만, auth_request 규약에서는 401 이 맞다
  // (nginx 가 401/403 만 "인가 실패"로 다루고 나머지는 500 으로 본다).
  if (owner instanceof NextResponse) return new NextResponse(null, { status: 401 });
  return new NextResponse(null, { status: 200 });
}
