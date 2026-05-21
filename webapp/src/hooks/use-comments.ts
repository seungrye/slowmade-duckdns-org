import { useState, useCallback } from "react";
import { nanoid } from "nanoid";
import { showAchievementToasts } from "@/lib/show-achievement-toast";
import type { Comment } from "@/types/comment.d";

export function useComments(postId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?postId=${postId}`);
      const { data } = await response.json();
      setComments(data);
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  }, [postId]);

  const submitComment = useCallback(async (
    parentId: string | null,
    content: string,
  ): Promise<boolean | 'sleeping'> => {
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
      if (!isEnjiCall) showAchievementToasts(result.data);
      if (isEnjiCall && result.data?.enjiSleeping) return 'sleeping' as const;
      return true;
    } catch (error) {
      console.error("Error:", error);
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [postId]);

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
