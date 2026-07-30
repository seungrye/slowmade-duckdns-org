import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/lib/env";

// nginx auth_request 용 게이트 — 로컬 LLM 서버 /llm/* 접근 허가 판정.
//   허가(200): 관리자 세션(session.email === OWNER_EMAIL) 또는 Authorization: Bearer <LLM_KEY>.
//   거부(401): 그 외.
// requireOwner 는 비관리자에 404 를 주지만, auth_request 는 non-2xx 중 401/403 만 "거부"로 처리하고
// 그 외(404 등)는 500 으로 보므로 여기선 반드시 200/401 만 반환한다. 그래서 /api/admin/ 밖에 둔다
// (미들웨어의 owner-only 404 게이트도 회피). webapp 은 인증 확인만 — 시스템 무접촉.

function bearer(req: NextRequest): string {
  const h = req.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

async function authorized(req: NextRequest): Promise<boolean> {
  const owner = env.ownerEmail.trim();
  if (owner) {
    const session = await auth();
    if (session?.user?.email === owner) return true;
  }
  const key = env.llmKey.trim();
  if (key && bearer(req) === key) return true;
  return false;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: (await authorized(req)) ? 200 : 401 });
}

// auth_request 서브요청 메서드가 구현별로 다를 수 있어 GET/POST 모두 허용.
export const GET = handle;
export const POST = handle;
