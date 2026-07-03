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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const commentRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const collapseInitDone = useRef(false);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // 삭제된 최상위 댓글의 자식들은 기본 접힘 — 사용자가 펼치면 볼 수 있음(최초 로드 1회).
  useEffect(() => {
    if (collapseInitDone.current || comments.length === 0) return;
    collapseInitDone.current = true;
    const deletedTopIds = comments
      .filter((c) => c.parent == null && c.isDeleted)
      .map((c) => c._id);
    if (deletedTopIds.length > 0) {
      setCollapsed((prev) => new Set([...prev, ...deletedTopIds]));
    }
  }, [comments]);

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
    const parent = comments.find(c => c._id === parentId);
    // parent 가 봇(enji-bot / painter-bot) 이면 author 명을 그대로 넘겨 라우팅 결정.
    const parentBotAuthor = parent?.isEnji ? parent.author : undefined;
    const ok = await submitComment(parentId, content, parentBotAuthor);
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
      .map((c: Comment) => {
        // 최상위 댓글에만 접기 — "답글 N개" 는 *스레드 전체 후손 수*.
        const countDescendants = (id: string): number => {
          const kids = comments.filter((cc) => (cc.parent ? cc.parent._id : null) === id);
          return kids.reduce((sum, k) => sum + 1 + countDescendants(k._id), 0);
        };
        const childCount = parentId === null ? countDescendants(c._id) : 0;
        return (
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
            childCount={childCount}
            isCollapsed={collapsed.has(c._id)}
            onToggleCollapse={toggleCollapse}
          >
            {renderComments(c._id)}
          </CommentItem>
        );
      });
  }, [comments, openReplyFor, submitting, session, handleDelete, handleParentClick, handleReplySubmit, collapsed, toggleCollapse]);

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
          ...(session ? ['enji-bot', 'painter-bot'] : []),
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
