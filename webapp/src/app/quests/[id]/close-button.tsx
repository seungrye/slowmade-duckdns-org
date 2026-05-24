"use client";

/** 편집 패널 닫기(✕) 버튼. onClose 가 없으면 렌더하지 않는다. */
export function CloseButton({ onClose }: { onClose?: () => void }) {
  if (!onClose) return null;
  return (
    <button
      onClick={onClose}
      aria-label="패널 닫기"
      title="닫기"
      className="px-2 py-0.5 text-xs rounded border text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      ✕
    </button>
  );
}
