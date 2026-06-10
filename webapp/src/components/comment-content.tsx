'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

// 코멘트 본문 markdown 렌더.
// - react-markdown 은 raw HTML 을 텍스트로 처리하고 위험 URL(javascript: 등)을
//   기본 차단하므로 사용자 입력에 안전 (dangerouslySetInnerHTML 미사용).
// - remark-gfm: [text](url) + raw URL 자동 링크 + 취소선/표 등.
// - remark-breaks: 단일 줄바꿈 → <br> (기존 whitespace-pre-wrap 동작 보존).

export default function CommentContent({ content }: { content: string }) {
  return (
    <div className="comment-markdown text-gray-700 dark:text-gray-300 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={typeof src === 'string' ? src : ''}
              alt={alt ?? ''}
              loading="lazy"
              className="max-w-full md:max-w-md rounded-lg my-2 border border-gray-200 dark:border-gray-700"
            />
          ),
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc ml-5 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-5 my-1">{children}</ol>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-3 my-1 text-gray-600 dark:text-gray-400">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
