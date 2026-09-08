// The closed padlock icon (a JSX SVG) marking a private post. Shared before the view's title and the list titles (home, tags, the dashboard).
// The shape matches lockIconSvg(true)'s closed padlock in rich-web-editor/attachment-icon.ts (visual consistency).
// The colour and size are controlled by className (currentColor) - a soft grey 1em by default.

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
