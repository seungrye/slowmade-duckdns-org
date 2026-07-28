import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireInternalToken } from "@/lib/require-internal-token";

export const dynamic = "force-dynamic";

/**
 * 서버 내부 self-call 전용 캐시 무효화 엔드포인트.
 *
 * 배경: 백그라운드 작업(예: AI 태그 추천, suggest-tags.generateAndUpdateTags)은 HTTP 응답 종료 뒤라
 * request scope 밖 → 거기서 부른 revalidatePath 는 무효(삼켜짐). 그래서 그 작업이 이 라우트 핸들러를
 * self-fetch 하면, 핸들러는 정상 request scope 라 revalidatePath 가 실제로 캐시를 무효화한다.
 *
 * 가드: 헤더 X-Internal-Token 이 env.revalidateToken 과 일치해야 통과(불일치/미설정 → 404 비노출).
 * 경로는 allowlist 로 제한(임의 경로 무효화 남용 방지).
 */

// 무효화 허용 경로 — 글 상세, 태그 목록만.
const ALLOW = [/^\/post\/view\/[A-Za-z0-9_-]+$/, /^\/tags$/];

function isAllowed(path: string): boolean {
  return typeof path === "string" && ALLOW.some((re) => re.test(path));
}

export async function POST(req: NextRequest) {
  const guard = requireInternalToken(req);
  if (guard) return guard;

  let body: { paths?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const paths = Array.isArray(body.paths) ? (body.paths as unknown[]) : [];

  const revalidated: string[] = [];
  for (const p of paths) {
    if (typeof p === "string" && isAllowed(p)) {
      revalidatePath(p);
      revalidated.push(p);
    }
  }
  return NextResponse.json({ revalidated });
}
