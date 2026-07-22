"use client";

import { attachmentIconDataUri } from "@/components/rich-web-editor/attachment-icon";

export type AttachmentChipData = { id: string; name: string; size: number; mimeType: string };

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 첨부 칩 — FA 파일 아이콘 + 파일명. 전용 첨부 영역(작성 하단·뷰 섹션)에서 공용.
 * - downloadHref: 있으면 <a href download>(뷰에서 클릭 다운로드).
 * - onRemove: 있으면 아이콘 우하단에 X 삭제 버튼(작성에서만).
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
  const title = `${att.name} (${fmtBytes(att.size)})`;
  const cls =
    "inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 " +
    "bg-gray-50 dark:bg-gray-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-300 " +
    "transition-colors no-underline max-w-full";

  const inner = (
    <>
      <span className="relative inline-flex shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachmentIconDataUri(att.mimeType)} alt="" className="h-8 w-auto block" />
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`${att.name} 삭제`}
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white text-[10px] leading-none shadow"
          >
            ×
          </button>
        )}
      </span>
      <span className="truncate max-w-[12rem] text-sm text-gray-700 dark:text-gray-200">{att.name}</span>
    </>
  );

  if (downloadHref) {
    return (
      <a href={downloadHref} title={title} className={cls} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <span title={title} className={cls}>
      {inner}
    </span>
  );
}
