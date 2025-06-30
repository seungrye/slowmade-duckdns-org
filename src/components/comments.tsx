'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { CommentType } from "@/models/comment";
import { Manrope } from 'next/font/google';
import { nanoid } from "nanoid";

const manrope = Manrope({ subsets: ['latin'] });

type Props = { postId: string };

type Comment = CommentType & {
  _id: string  // InferSchemaType에는 이게 없음
  parent: string | null
}

export default function Comments({ postId }: Props) {
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);

  const content = useRef<HTMLTextAreaElement>(null);


  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?postId=${postId}`);
      const data = await response.json();
      setComments(data);
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  }, [postId]);

  useEffect(() => {
    if (!submitting) fetchComments();
  }, [submitting, fetchComments]);

  const submitComment = useCallback(async (parentId: string | null = null) => {
    // 에디터에서 값 가져오기
    if (!content.current?.value.trim()) {
      return toast.error("덧글을 입력해주세요.");
    } else {
      setSubmitting(true);
    }

    let anonidToken = localStorage.getItem('anonid-token');
    if (!anonidToken) {
      anonidToken = nanoid(8); // 최초 방문자에게 고유 ID 생성
      localStorage.setItem('anonid-token', anonidToken);
    }

    try {
      const postData = {
        postId,
        parentId,
        content: content.current?.value
      }
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...postData,
          anonid: anonidToken
        }),
      });

      if (response.ok) {
        toast.success("덧글이 성공적으로 작성되었습니다!");
        if (content.current) {
          content.current.value = "";
        }
      } else {
        toast.error("덧글 작성에 실패했습니다.");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("덧글 작성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [postId]);

  const nestedComments = useCallback((parentId: string | null = null) => {
    if (comments.length === 0) return null;

    // console.log("comments", comments);
    // console.log("parentId", parentId);

    return comments
      .filter(c => c.parent === parentId)
      .map(c => (
        <Fragment key={c._id}>
          <div className={`${Boolean(parentId) ? "ml-6 md:ml-12 " : ""}flex items-start gap-4 border border-gray-200 rounded-lg rounded-br-none p-4`}>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className={`font-medium text-gray-900 dark:text-white ${manrope.className}`}>{c.author}</h3>
                <span className="text-sm text-gray-500">·</span>
                <span className="text-sm text-gray-500">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                {c.content}
              </p>
              <button
                className="text-sm text-blue-600 hover:underline mt-2"
                onClick={() => setOpenReplyFor(prev => (prev === c._id ? null : c._id))}
              >
                Reply
              </button>

              {/* ✅ Reply form (열려있는 댓글일 때만 표시) */}
              {openReplyFor === c._id && (
                <form className="mt-4 flex flex-col md:flex-row md:items-stretch md:gap-4">
                  <label htmlFor="comment" className="sr-only">
                    Add a comment
                  </label>
                  <textarea
                    id="comment"
                    rows={4}
                    className="min-h-20 block w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                    placeholder="Write your comment here..."
                    ref={content}
                  ></textarea>
                  <button
                    type="submit"
                    className="mt-4 md:mt-0 inline-flex justify-end items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600"
                    onClick={() => submitComment(parentId || c._id)}
                    disabled={submitting}
                  >
                    Post comment
                  </button>
                </form>
              )}
            </div>
          </div>

          {nestedComments(c._id)} {/* 대댓글 추가 UI 위치 */}
        </Fragment>
      ));
  }, [comments, openReplyFor, submitting, submitComment]);



  return <>
    <Toaster position="bottom-right" /> {/* ✅ 토스트 메시지 표시 위치 */}

    <h2 className="text-xl font-semibold mb-2">{comments?.length || 0} 덧글</h2>

    {/* 댓글 목록 */}
    <div className="space-y-4">
      {nestedComments(null)}
    </div>

    {/* 댓글 작성 폼 */}
    <form className="mt-4 flex flex-col md:flex-row md:items-stretch md:gap-4">
      <label htmlFor="comment" className="sr-only">Add a comment</label>
      <textarea id="comment" rows={4} className="min-h-20 block w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white" placeholder="Write your comment here..."
        onClick={() => setOpenReplyFor(null)}
        ref={content}
      ></textarea>
      <button type="submit" className="mt-4 md:mt-0 inline-flex justify-end items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600"
        onClick={() => submitComment()}
        disabled={submitting}
      >

        Post comment
      </button>
    </form>
  </>
}