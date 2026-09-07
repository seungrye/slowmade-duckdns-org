import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireInternalToken } from "@/lib/require-internal-token";

export const dynamic = "force-dynamic";

/**
 * The cache-invalidation endpoint for the server's internal self-calls only.
 *
 * Background: a background job (AI tag suggestions, suggest-tags.generateAndUpdateTags) runs after the HTTP response
 * has ended and so outside the request scope -> a revalidatePath called there is ineffective (swallowed). When that
 * job self-fetches this route handler, the handler is in a proper request scope and revalidatePath really invalidates the cache.
 *
 * The guard: the X-Internal-Token header must match env.revalidateToken (a mismatch or an unset env gives a 404, revealing nothing).
 * Paths are restricted by an allowlist (preventing abuse through invalidating arbitrary paths).
 */

// The paths that may be invalidated - post detail and the tag list only.
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
