'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import toast, { Toaster } from "react-hot-toast";
import { useComments } from "@/hooks/use-comments";
import CommentItem from "@/components/comment-item";
import CommentInput from "@/components/comment-input";
import type { Comment } from "@/types/comment.d";

type Props = { postId: string };

export default function Comments({ postId }: Props) {
  const { data: session } = useSession();
  const { comments, submitting, fetchComments, submitComment, deleteComment } = useComments(postId);
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    const handleRenderComplete = () => {
      if (window.location.hash !== '#comments-section') return;
      const element = document.getElementById('comments-section');
      if (element) {
        requestAnimationFrame(() => element.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    };
    window.addEventListener('richContentRendered', handleRenderComplete);
    return () => window.removeEventListener('richContentRendered', handleRenderComplete);
  }, []);

  const handleParentClick = useCallback((parentId: string | null) => {
    if (!parentId) return;
    const el = commentRefs.current.get(parentId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-scroll');
      setTimeout(() => el.classList.remove('highlight-scroll'), 1500);
    }
  }, []);

  const handleReplySubmit = useCallback(async (parentId: string, content: string) => {
    const parentIsEnji = comments.some(c => c._id === parentId && c.isEnji);
    const ok = await submitComment(parentId, content, parentIsEnji);
    if (ok) {
      toast.success("덧글이 성공적으로 작성되었습니다!");
      setOpenReplyFor(null);
      fetchComments();
    } else {
      toast.error("덧글 작성에 실패했습니다.");
    }
    return !!ok;
  }, [submitComment, fetchComments, comments]);

  const handleTopLevelSubmit = useCallback(async (content: string) => {
    const ok = await submitComment(null, content);
    if (ok) {
      toast.success("덧글이 성공적으로 작성되었습니다!");
      fetchComments();
    } else {
      toast.error("덧글을 입력해주세요.");
    }
    return !!ok;
  }, [submitComment, fetchComments]);

  const handleDelete = useCallback(async (commentId: string) => {
    if (!confirm("정말로 이 댓글을 삭제하시겠습니까?")) return;
    const ok = await deleteComment(commentId);
    if (ok) {
      toast.success('댓글이 삭제되었습니다.');
      fetchComments();
    } else {
      toast.error('댓글 삭제에 실패했습니다.');
    }
  }, [deleteComment, fetchComments]);

  const renderComments = useCallback((parentId: string | null = null): React.ReactNode => {
    if (comments.length === 0) return null;
    return comments
      .filter(c => (c.parent ? c.parent._id : null) === parentId)
      .map((c: Comment) => (
        <CommentItem
          key={c._id}
          comment={c}
          isNested={Boolean(parentId)}
          session={session}
          openReplyFor={openReplyFor}
          onReplyToggle={(id) => setOpenReplyFor(prev => prev === id ? null : id)}
          onDelete={handleDelete}
          onParentClick={handleParentClick}
          onRef={(el) => {
            if (el) commentRefs.current.set(c._id, el);
            else commentRefs.current.delete(c._id);
          }}
          onReplySubmit={handleReplySubmit}
          submitting={submitting}
        >
          {renderComments(c._id)}
        </CommentItem>
      ));
  }, [comments, openReplyFor, submitting, session, handleDelete, handleParentClick, handleReplySubmit]);

  return (
    <section id="comments-section">
      <Toaster position="bottom-right" />
      <style jsx global>{`
        .highlight-scroll { animation: highlight-animation 1.5s ease-out; }
        @keyframes highlight-animation {
          0% { background-color: rgba(59, 130, 246, 0.3); }
          100% { background-color: transparent; }
        }
        .dark .highlight-scroll { animation: highlight-animation-dark 1.5s ease-out; }
        @keyframes highlight-animation-dark {
          0% { background-color: rgba(59, 130, 246, 0.4); }
          100% { background-color: transparent; }
        }
      `}</style>

      <h2 className="text-xl font-semibold mb-2">{comments?.length || 0} 덧글</h2>

      <div className="space-y-4">
        {renderComments(null)}
      </div>

      <CommentInput
        onSubmit={handleTopLevelSubmit}
        disabled={submitting}
        mentions={[
          ...(session ? ['enji'] : []),
          ...new Set(
            comments
              .filter(c => !c.isDeleted && !c.isEnji && c.authorId != null)
              .map(c => c.author)
          ),
        ]}
      />
    </section>
  );
}
