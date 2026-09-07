// Bot comment permissions (#205).
//
// `api/enji` and `api/painter` only checked that the post **existed** before letting it through. Merely being logged in
// allowed commenting via a private post's id, and enji sent 3000 characters of its body to Gemini on someone else's
// command. It was not a read leak (the comment GET already blocks private posts) - the problem is **write authorisation**.
//
// The rule is **the same** as for reading revisions (#168): a private or deleted post is the author's alone.
// So rather than restate it, this delegates to `canReadPostHistory` - two copies of one rule eventually diverge, and
// the diverged one is the one that leaks. That is exactly how #168 happened.
// It has its own name because the caller is asking "may I comment here?", and to leave a place to split should the
// rules genuinely need to diverge later.
import { canReadPostHistory, type PostAccessFields } from './revisions-access';

/**
 * Whether this post may be commented on.
 *
 * @param post the post's permission fields. Absent (not found) is a refusal - it does not even reveal existence.
 * @param viewerEmail the logged-in user's email, or null when logged out (anonymous comments are allowed on public posts).
 */
export function canCommentOn(
  post: PostAccessFields | null | undefined,
  viewerEmail: string | null | undefined,
): boolean {
  return canReadPostHistory(post, viewerEmail);
}
