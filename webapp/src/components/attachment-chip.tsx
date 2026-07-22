"use client";

import * as React from "react";
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  useHover,
  useFocus,
  useRole,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";
import { attachmentIconDataUri } from "@/components/rich-web-editor/attachment-icon";

export type AttachmentChipData = { id: string; name: string; size: number; mimeType: string };

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 첨부 칩 — FA 파일 아이콘만 표시(박스·라벨 없음). 파일명은 호버 시 모던 툴팁으로.
 * 툴팁은 floating-ui 포탈(body 렌더)이라 부모의 overflow:hidden 에도 잘리지 않고,
 * 화면 가장자리에서 flip/shift 로 자동 재배치된다.
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
  const [open, setOpen] = React.useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { move: false }),
    useFocus(context),
    useRole(context, { role: "tooltip" }),
  ]);

  const cls =
    "group relative inline-flex shrink-0 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-400";

  const icon = (
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
          className="absolute -bottom-1.5 -right-1.5 text-red-500 hover:text-red-600 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {/* close-circle(솔리드) — 빨간 원에 X 컷아웃. 흰 배경 원으로 X 가 흰색으로 보이게. */}
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="block h-4 w-4 rounded-full bg-white drop-shadow-sm">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M22 12c0 5.5228 -4.4772 10 -10 10 -5.52285 0 -10 -4.4772 -10 -10C2 6.47715 6.47715 2 12 2c5.5228 0 10 4.47715 10 10ZM8.96963 8.96965c0.29289 -0.29289 0.76776 -0.29289 1.06067 0L12 10.9393l1.9696 -1.96963c0.2929 -0.29289 0.7678 -0.29289 1.0607 0 0.2929 0.29289 0.2929 0.76777 0 1.06063L13.0606 12l1.9697 1.9696c0.2929 0.2929 0.2929 0.7678 0 1.0607 -0.2929 0.2929 -0.7678 0.2929 -1.0607 0L12 13.0607l-1.9697 1.9696c-0.29288 0.2929 -0.76776 0.2929 -1.06065 0 -0.29289 -0.2929 -0.29289 -0.7678 0 -1.0606L10.9393 12l-1.96967 -1.9697c-0.2929 -0.29288 -0.2929 -0.76776 0 -1.06065Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
      {downloadHref && (
        /* 다운로드 배지 — 호버/포커스 시 아이콘 우하단에 표시(파란 원+흰 아래화살표). 클릭은 링크가 처리. */
        <span
          data-role="download-badge"
          aria-hidden="true"
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-blue-500 text-white shadow opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="w-2.5 h-2.5">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </>
  );

  // 툴팁은 항상 mount 하고 opacity 로만 표시 토글(포탈은 body 에 렌더).
  const tip = (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        role="tooltip"
        className={`pointer-events-none z-50 whitespace-nowrap rounded-lg bg-gray-900/95 px-2.5 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-sm transition-opacity duration-150 dark:bg-gray-700/95 ${open ? "opacity-100" : "opacity-0"}`}
      >
        {att.name}
        <span className="ml-1.5 text-gray-300 dark:text-gray-400">{fmtBytes(att.size)}</span>
      </div>
    </FloatingPortal>
  );

  if (downloadHref) {
    return (
      <>
        <a
          ref={refs.setReference}
          {...getReferenceProps()}
          href={downloadHref}
          aria-label={label}
          className={cls}
          target="_blank"
          rel="noopener noreferrer"
        >
          {icon}
        </a>
        {tip}
      </>
    );
  }
  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} aria-label={label} className={cls}>
        {icon}
      </span>
      {tip}
    </>
  );
}
