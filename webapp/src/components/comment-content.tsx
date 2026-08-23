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
          // `start` 를 넘겨야 한다 (#220). 마크다운에서 `4.` 로 시작하는 문단은
          // <ol start="4"> 로 파싱되는데, 그걸 버리면 CSS 카운터가 매번 1부터 다시 센다
          // — 항목이 전부 "1." 로 보였다.
          ol: ({ children, start }) => (
            <ol start={start} className="list-decimal ml-5 my-1">
              {children}
            </ol>
          ),
          // Tailwind v4 Preflight 가 제목의 크기·굵기를 지운다. 매핑이 없으면 본문과
          // 똑같이 보인다 (globals.css 에 .comment-markdown 기본 스타일도 없다).
          h1: ({ children }) => <h1 className="text-xl font-bold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>,
          h5: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1">{children}</h5>,
          h6: ({ children }) => <h6 className="text-sm font-semibold mt-2 mb-1">{children}</h6>,
          // 코드블록. `pre` 매핑이 없으면 여러 줄 코드가 아래 인라인용 알약 스타일을
          // 그대로 뒤집어써 뭉개진다. 블록 껍데기는 여기서 입히고, 안쪽 code 의 알약
          // 배경·여백은 되돌린다 — inline 여부를 code 쪽에서 판별하는 것보다 확실하다
          // (언어 표기가 없는 펜스는 className 이 비어 있어 구분이 안 된다).
          pre: ({ children }) => (
            <pre className="overflow-x-auto my-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono">
              {children}
            </code>
          ),
          // remark-gfm 이 표를 <table> 로 파싱하지만 Tailwind Preflight 가 기본 테두리를
          // 지우므로 여기서 명시 스타일. 넓은 표는 가로 스크롤 컨테이너로 감싸 모바일 대응.
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="border-collapse w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left font-semibold whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 align-top">
              {children}
            </td>
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
