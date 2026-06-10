'use client';

import { Fragment } from "react";
import { Manrope } from 'next/font/google';
import type { Session } from "next-auth";
import type { Comment } from "@/types/comment.d";
import CommentInput from "./comment-input";
import CommentContent from "./comment-content";

const manrope = Manrope({ subsets: ['latin'] });

interface CommentItemProps {
  comment: Comment;
  isNested: boolean;
  session: Session | null;
  openReplyFor: string | null;
  onReplyToggle: (id: string) => void;
  onDelete: (commentId: string) => void;
  onParentClick: (parentId: string | null) => void;
  onRef: (el: HTMLDivElement | null) => void;
  onReplySubmit: (parentId: string, content: string) => Promise<boolean>;
  submitting: boolean;
  /** 직속 자식(답글) 수 — 0 이면 접기 토글 미표시. */
  childCount?: number;
  /** 이 코멘트의 자식들이 접혀 있는지. */
  isCollapsed?: boolean;
  /** 접기 토글. */
  onToggleCollapse?: (id: string) => void;
  children?: React.ReactNode;
}

export default function CommentItem({
  comment: c,
  isNested,
  session,
  openReplyFor,
  onReplyToggle,
  onDelete,
  onParentClick,
  onRef,
  onReplySubmit,
  submitting,
  childCount = 0,
  isCollapsed = false,
  onToggleCollapse,
  children,
}: CommentItemProps) {
  const indentClass = isNested ? "ml-6 md:ml-12 " : "";
  // 접기 토글 버튼 (자식 있을 때만).
  const collapseBtn =
    childCount > 0 && onToggleCollapse ? (
      <button
        type="button"
        className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:underline mt-2"
        onClick={() => onToggleCollapse(c._id)}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? `답글 ${childCount}개 펼치기` : `답글 ${childCount}개 접기`}
      >
        {isCollapsed ? `▶ 답글 ${childCount}개 펼치기` : `▼ 답글 ${childCount}개 접기`}
      </button>
    ) : null;

  return (
    <Fragment>
      {c.isDeleted ? (
        <div
          id={`comment-${c._id}`}
          ref={onRef}
          className={`${indentClass}border border-gray-200 dark:border-gray-700 rounded-lg rounded-br-none p-4`}
        >
          <p className="text-gray-500 italic">{c.content}</p>
        </div>
      ) : c.isEnji ? (
        <div
          id={`comment-${c._id}`}
          ref={onRef}
          className={`${indentClass}flex items-start gap-4 border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30 rounded-lg rounded-br-none p-4 transition-all duration-300`}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-label="enji">✨</span>
              <h3 className={`font-medium text-purple-700 dark:text-purple-300 tracking-tighter ${manrope.className}`}>
                {c.author}
              </h3>
              <span className="text-sm text-gray-500">·</span>
              <span className="text-sm text-gray-500">
                {new Date(c.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="mt-1">
              <CommentContent content={c.content} />
            </div>
            {c.imageUrl && (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.imageUrl}
                  alt={c.imagePrompt ?? 'enji-bot 생성 이미지'}
                  className="max-w-full md:max-w-md rounded-lg border border-purple-200 dark:border-purple-800"
                  loading="lazy"
                />
                <div className="mt-1 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
                  <span aria-label="AI 생성">✨ AI 생성</span>
                  <a
                    href={c.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    원본 보기
                  </a>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              {session?.user && (
                <button
                  className="text-sm text-purple-600 hover:underline mt-2"
                  onClick={() => onReplyToggle(c._id)}
                  aria-label="Open reply form"
                >
                  Reply
                </button>
              )}
              {collapseBtn}
            </div>
            {openReplyFor === c._id && (
              <CommentInput
                inputId={`reply-${c._id}`}
                onSubmit={(content) => onReplySubmit(c._id, content)}
                disabled={submitting}
                placeholder={c.author === 'painter-bot' ? 'painter-bot 에게 그림 요청...' : 'enji에게 답장...'}
              />
            )}
          </div>
        </div>
      ) : (
        <div
          id={`comment-${c._id}`}
          ref={onRef}
          className={`${indentClass}flex items-start gap-4 border border-gray-200 dark:border-gray-700 rounded-lg rounded-br-none p-4 transition-all duration-300`}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className={`font-medium text-gray-900 dark:text-white tracking-tighter ${manrope.className}`}>
                {c.author}
              </h3>
              <span className="text-sm text-gray-500">·</span>
              <span className="text-sm text-gray-500">
                {new Date(c.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="mt-1">
              {c.parent && (
                <a
                  href={`#comment-${c.parent._id}`}
                  onClick={(e) => { e.preventDefault(); onParentClick(c.parent?._id ?? null); }}
                  className="inline-block text-blue-600 hover:underline mb-1 p-1 bg-blue-50 dark:bg-blue-900/30 rounded-md"
                  aria-label={`부모 댓글로 이동: @${c.parent.author}`}
                >
                  {c.parent.author}
                </a>
              )}
              <CommentContent content={c.content} />
            </div>
            <div className="flex items-center gap-3">
              <button
                className="text-sm text-blue-600 hover:underline mt-2"
                onClick={() => onReplyToggle(c._id)}
                aria-label="Open reply form"
              >
                Reply
              </button>

              {session?.user?.email === c.authorId?.email && (
                <button
                  className="text-sm text-red-600 hover:underline mt-2"
                  onClick={() => onDelete(c._id)}
                >
                  Delete
                </button>
              )}

              {collapseBtn}
            </div>

            {openReplyFor === c._id && (
              <CommentInput
                inputId={`reply-${c._id}`}
                onSubmit={(content) => onReplySubmit(c._id, content)}
                disabled={submitting}
                placeholder="Write your reply here..."
              />
            )}
          </div>
        </div>
      )}
      {!isCollapsed && children}
    </Fragment>
  );
}
