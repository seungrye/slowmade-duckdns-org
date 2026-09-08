'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

// The comment body's markdown render.
// - react-markdown treats raw HTML as text and blocks dangerous URLs (javascript: and so on)
//   by default, so it is safe for user input (no dangerouslySetInnerHTML).
// - remark-gfm: [text](url) plus raw-URL autolinking, strikethrough, tables and so on.
// - remark-breaks: a single newline -> <br> (preserving the previous whitespace-pre-wrap behaviour).

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
          // `start` has to be passed through (#220). A markdown paragraph starting with `4.` parses as
          // <ol start="4">, and dropping that makes the CSS counter start from 1 every time
          // - every item appeared as "1.".
          ol: ({ children, start }) => (
            <ol start={start} className="list-decimal ml-5 my-1">
              {children}
            </ol>
          ),
          // Tailwind v4's Preflight strips a heading's size and weight. With no mapping it looks exactly
          // like the body (globals.css has no .comment-markdown defaults either).
          h1: ({ children }) => <h1 className="text-xl font-bold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>,
          h5: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1">{children}</h5>,
          h6: ({ children }) => <h6 className="text-sm font-semibold mt-2 mb-1">{children}</h6>,
          // Code blocks. With no `pre` mapping, multi-line code takes on the inline pill style
          // below and is mangled. The block's shell is applied here and the inner code's pill
          // background and padding are undone - more reliable than deciding inline-ness on the code side
          // (a fence with no language has an empty className and cannot be told apart).
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
          // remark-gfm parses a table into a <table>, but Tailwind's Preflight strips the default borders,
          // so the style is explicit here. A wide table is wrapped in a horizontal scroll container for mobile.
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
