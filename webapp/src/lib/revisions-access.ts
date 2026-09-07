// Revision read permissions (#168).
//
// A penetration test confirmed that a private post's **title and full body** leaked while logged out.
// Neither `/api/post/revisions` nor `/api/post/revision` had any authorisation check.
//
// The judgement is gathered in one place - two routes with different rules means one of them leaks again.
// The rule matches attachments (`api/attachment/*`): a private or deleted post is **the author's alone**.

export interface PostAccessFields {
  isPrivate?: boolean;
  isDeleted?: boolean;
  userEmail?: string;
}

/**
 * Whether this post's revision history may be read.
 *
 * @param post the post's permission fields. Absent (not found) is a refusal - it does not even reveal existence.
 * @param viewerEmail the logged-in user's email, or null when logged out.
 */
export function canReadPostHistory(
  post: PostAccessFields | null | undefined,
  viewerEmail: string | null | undefined,
): boolean {
  if (!post) return false;
  const restricted = post.isPrivate === true || post.isDeleted === true;
  if (!restricted) return true;
  // It checks for a value first, so two empty strings cannot match and be mistaken for the owner.
  return !!viewerEmail && !!post.userEmail && viewerEmail === post.userEmail;
}
