// Jumping from a notification to a comment (#241, #243) - the pure part.
//
// It first targeted the individual comment with `#comment-<id>`. But PrivatePostGate renders a private post later on
// the client, so the target was not in the DOM at the moment the browser tried to jump to the hash.
// Appearing later does not make the browser jump again.
//
// The speech bubble on the main screen (`post-item.tsx`) goes to `#comments-section` - **a section anchor**, which
// works regardless of render timing. Notifications follow that. The comment id travels as a query, and once that
// comment has rendered after arrival, it scrolls there as well.
// **Even if it is never found, the section has already been reached** - there is no ending up nowhere.

/** The comment section anchor. The same value the main screen's bubble uses. */
export const COMMENTS_SECTION = 'comments-section';

/** The query name that carries the target comment. */
const COMMENT_PARAM = 'c';

/**
 * The address a notification item points to.
 *
 * The query comes first and the hash last - a query after a hash is treated as part of the hash and never parsed.
 */
export function notificationHref(postId: string, commentId: string): string {
  const base = `/post/view/${encodeURIComponent(postId)}`;
  const query = commentId ? `?${COMMENT_PARAM}=${encodeURIComponent(commentId)}` : '';
  return `${base}${query}#${COMMENTS_SECTION}`;
}

/**
 * Extracts the element id of the comment to scroll to from the query.
 *
 * @returns `comment-<comment id>`, or null when it does not apply.
 */
export function targetCommentId(search: string): string | null {
  const id = new URLSearchParams(search).get(COMMENT_PARAM);
  if (!id) return null;
  return `comment-${id}`;
}

/**
 * Whether the comment section may scroll **to its top** (#247).
 *
 * Once the body has rendered (`richContentRendered`), the section reads the hash and scrolls to its own top. That ran
 * **after** CommentAnchor's "centre on that comment" and overwrote it - which is why tapping a notification always
 * landed at the start of the comment list. With a destination set, it stands aside.
 */
export function shouldScrollToSection(hash: string, search: string): boolean {
  if (hash !== `#${COMMENTS_SECTION}`) return false;
  return targetCommentId(search) === null;
}

/**
 * Where in the viewport to place the comment's top (#255).
 *
 * Two fifths down. The upper 40% shows the preceding context (what the reply is to), and the comment reads from its first line.
 */
export const ANCHOR_VIEWPORT_RATIO = 0.4;

/**
 * The scroll position to stop at when jumping to that comment (#255).
 *
 * It used to centre **the middle of the comment** with `scrollIntoView({ block: 'center' })`.
 * A comment taller than the viewport then has its top pushed off screen - measured (1680x1000), the comment was 1154
 * tall with a top of -77. The middle was exact while the first line sat above the screen.
 *
 * **The element's height is not consulted at all** - only the top matters, so however long the comment, the first line is never pushed off.
 *
 * @param rectTop  the element's top relative to the viewport (`getBoundingClientRect().top`)
 * @param scrollY  the current scroll position
 * @param viewportHeight the viewport height
 */
export function scrollTopFor(
  rectTop: number,
  scrollY: number,
  viewportHeight: number,
  ratio: number = ANCHOR_VIEWPORT_RATIO,
): number {
  const documentTop = rectTop + scrollY;
  // Near the top of the document there is nowhere further up - a negative request is clamped to 0 by the browser, but
  // the computed result is pinned at 0 too, so the intent can be fixed by a test.
  return Math.max(0, documentTop - viewportHeight * ratio);
}
