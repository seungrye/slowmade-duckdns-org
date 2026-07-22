// 비공개 표시용 잠긴 자물쇠 아이콘(JSX SVG). 뷰 제목·목록(홈·태그·대시보드) 제목 앞에 공용.
// 모양은 rich-web-editor/attachment-icon.ts 의 lockIconSvg(true) 닫힌 자물쇠와 동일(시각 일관성).
// 색·크기는 className(currentColor)로 제어 — 기본은 은은한 회색 1em.

export function PrivateLockIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 22"
      role="img"
      aria-label="비공개"
      className={`inline-block shrink-0 ${className ?? "h-[1em] w-[1em] align-[-0.15em] text-gray-400"}`}
    >
      <rect x="4" y="10" width="12" height="9" rx="2" fill="currentColor" />
      <path d="M6.5 10V7.5a3.5 3.5 0 017 0V10" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
