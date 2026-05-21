import { useState, useCallback, useRef } from "react";
import { nanoid } from "nanoid";
import { showAchievementToasts } from "@/lib/show-achievement-toast";
import type { Comment } from "@/types/comment.d";

const ENJI_POLL_INTERVAL_MS = 2000;
const ENJI_POLL_DEADLINE_MS = 30_000;

export function useComments(postId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?postId=${postId}`);
      const { data } = await response.json();
      setComments(data);
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  }, [postId]);

  const startEnjiPolling = useCallback((userCommentId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const deadline = Date.now() + ENJI_POLL_DEADLINE_MS;

    pollingRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        return;
      }
      try {
        const res = await fetch(`/api/comments?postId=${postId}`);
        const { data } = await res.json();
        setComments(data);
        const found = (data as Comment[]).some(
          (c) => c.isEnji && c.parent?._id === userCommentId
        );
        if (found) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        }
      } catch {
        // ignore polling errors
      }
    }, ENJI_POLL_INTERVAL_MS);
  }, [postId]);

  const submitComment = useCallback(async (
    parentId: string | null,
    content: string,
  ): Promise<boolean> => {
    if (!content.trim()) return false;

    setSubmitting(true);

    let anonidToken = localStorage.getItem('anonid-token');
    if (!anonidToken) {
      anonidToken = nanoid(8);
      localStorage.setItem('anonid-token', anonidToken);
    }

    const isEnjiCall = /@enji/i.test(content);
    const endpoint = isEnjiCall ? '/api/enji' : '/api/comments';

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, parentId, content, anonid: anonidToken }),
      });

      if (!response.ok) return false;

      const result = await response.json();

      if (!isEnjiCall) {
        showAchievementToasts(result.data);
        return true;
      }

      const userCommentId = String(result.data?.userComment?._id ?? '');
      if (userCommentId) startEnjiPolling(userCommentId);
      return true;
    } catch (error) {
      console.error("Error:", error);
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [postId, startEnjiPolling]);

  const deleteComment = useCallback(async (commentId: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });
      return response.ok;
    } catch (error) {
      console.error("Error deleting comment:", error);
      return false;
    }
  }, []);

  return { comments, submitting, fetchComments, submitComment, deleteComment };
}
