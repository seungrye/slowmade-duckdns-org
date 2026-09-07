import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/lib/env";

// The gate for nginx's auth_request - deciding access to the local LLM server's /llm/*.
//   Allowed (200): an admin session (session.email === OWNER_EMAIL) or Authorization: Bearer <LLM_KEY>.
//   Refused (401): anything else.
// requireOwner gives a non-admin a 404, but auth_request treats only 401 and 403 among non-2xx as "refused" and
// everything else (404 included) as a 500, so this returns strictly 200 or 401. Hence it lives outside /api/admin/
// (also dodging the middleware's owner-only 404 gate). The webapp only checks authentication - it never touches the system.

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

// The auth_request subrequest's method varies by implementation, so both GET and POST are allowed.
export const GET = handle;
export const POST = handle;
