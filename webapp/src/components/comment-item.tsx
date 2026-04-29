'use client';

import { Fragment } from "react";
import { Manrope } from 'next/font/google';
import type { Session } from "next-auth";
import type { Comment } from "@/types/comment.d";
import CommentInput from "./comment-input";

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
  children,
}: CommentItemProps) {
  const indentClass = isNested ? "ml-6 md:ml-12 " : "";

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
            <p className="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
              {c.parent && (
                <a
                  href={`#comment-${c.parent._id}`}
                  onClick={(e) => { e.preventDefault(); onParentClick(c.parent?._id ?? null); }}
                  className="text-blue-600 hover:underline mr-2 p-1 bg-blue-50 dark:bg-blue-900/30 rounded-md"
                  aria-label={`부모 댓글로 이동: @${c.parent.author}`}
                >
                  {c.parent.author}
                </a>
              )}
              {c.content}
            </p>
            <button
              className="text-sm text-blue-600 hover:underline mt-2"
              onClick={() => onReplyToggle(c._id)}
              aria-label="Open reply form"
            >
              Reply
            </button>

            {session?.user?.email === c.authorId?.email && (
              <button
                className="text-sm text-red-600 hover:underline mt-2 ml-4"
                onClick={() => onDelete(c._id)}
              >
                Delete
              </button>
            )}

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
      {children}
    </Fragment>
  );
}
