'use client';

// MobileDrawer - #242. The mobile side panel plus the hamburger menu.
//
// A right-hand slide-in drawer with a dark overlay. With open=false it is translate-x-full plus aria-hidden=true.
// Closing: the close button, clicking the overlay, or Escape.
//
// Where it is used (the week 5 play page):
//   - the hamburger button is rendered outside (at the top of the page). MobileDrawer itself is *the open-state UI* only.
//   - children hold arbitrary content, such as StatusPanel.

import { useEffect, useRef, type ReactNode } from 'react';

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  // #296 - focus moves automatically to the close button on opening, and escape is handled.
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    // Remembers the previously focused element and moves focus to the close button.
    previousActiveRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      // Restores the previous focus on closing.
      if (previousActiveRef.current instanceof HTMLElement) {
        previousActiveRef.current.focus();
      }
    };
  }, [open, onClose]);

  return (
    <div
      data-testid="mobile-drawer"
      role="dialog"
      aria-modal={open ? 'true' : undefined}
      aria-hidden={open ? 'false' : 'true'}
      aria-label="상태 패널"
      className={`fixed inset-0 z-40 md:hidden ${open ? '' : 'pointer-events-none'}`}
    >
      {/* 배경 오버레이 */}
      <button
        type="button"
        data-testid="mobile-drawer-overlay"
        aria-label="배경 오버레이"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* drawer panel (우측 슬라이드) */}
      <div
        className={`absolute right-0 top-0 h-full w-[85%] max-w-sm bg-amber-50 shadow-xl overflow-y-auto transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="sticky top-0 bg-amber-50 border-b border-amber-300 p-2 flex justify-end">
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            tabIndex={open ? 0 : -1}
            className="rounded text-amber-900 hover:bg-amber-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
          >
            ✕ 닫기
          </button>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}
