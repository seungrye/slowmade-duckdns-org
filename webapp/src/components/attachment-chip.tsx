"use client";

import { attachmentIconDataUri } from "@/components/rich-web-editor/attachment-icon";

export type AttachmentChipData = { id: string; name: string; size: number; mimeType: string };

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 첨부 칩 — FA 파일 아이콘만 표시(박스·라벨 없음). 파일명은 호버 시 모던 툴팁으로.
 * - downloadHref: 있으면 <a href download>(뷰에서 클릭 다운로드).
 * - onRemove: 있으면 아이콘 우하단에 X 삭제 버튼(작성에서만).
 * - 호버: 아이콘에 약간의 쉐도우(drop-shadow).
 */
export function AttachmentChip({
  att,
  onRemove,
  downloadHref,
}: {
  att: AttachmentChipData;
  onRemove?: () => void;
  downloadHref?: string;
}) {
  const label = `${att.name} (${fmtBytes(att.size)})`;
  const cls = "group relative inline-flex shrink-0 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-400";

  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachmentIconDataUri(att.mimeType)}
        alt=""
        className="h-9 w-auto block transition group-hover:drop-shadow-md"
      />
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`${att.name} 삭제`}
          className="absolute -bottom-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white text-[10px] leading-none shadow"
        >
          ×
        </button>
      )}
      {/* 모던 툴팁 — 아이콘 위에 뜨는 파일명(호버). */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900/95 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 dark:bg-gray-700/95"
      >
        {att.name}
        <span className="ml-1.5 text-gray-300 dark:text-gray-400">{fmtBytes(att.size)}</span>
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900/95 dark:border-t-gray-700/95" />
      </span>
    </>
  );

  if (downloadHref) {
    return (
      <a href={downloadHref} aria-label={label} className={cls} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <span aria-label={label} className={cls}>
      {inner}
    </span>
  );
}
