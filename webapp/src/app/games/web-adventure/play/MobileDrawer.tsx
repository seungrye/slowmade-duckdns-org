'use client';

// MobileDrawer — #242. 모바일 사이드 패널 + 햄버거 메뉴.
//
// 우측 slide-in drawer + 어두운 오버레이. open=false 시 translate-x-full + aria-hidden=true.
// 닫기: 닫기 버튼, 오버레이 클릭, Escape.
//
// 사용처 (play page 5주차):
//   - 햄버거 버튼은 외부에서 렌더 (page 측 상단). MobileDrawer 자체는 *열린 상태 UI* 만.
//   - children 에 StatusPanel 등 임의 콘텐츠.

import { useEffect, useRef, type ReactNode } from 'react';

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  // #296 — 열림 시 닫기 버튼으로 자동 focus + escape 처리.
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    // 이전 focused element 기억 + 닫기 버튼으로 focus 이동.
    previousActiveRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      // 닫힐 때 이전 focus 복원.
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
