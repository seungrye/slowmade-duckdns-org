// MobileDrawer — #242. 모바일 사이드 패널 접근 햄버거 메뉴.
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileDrawer from './MobileDrawer';

describe('MobileDrawer', () => {
  it('open=false → 콘텐츠 있어도 hidden (aria-hidden 또는 translate-x-full)', () => {
    render(
      <MobileDrawer open={false} onClose={vi.fn()}>
        <div>패널 내용</div>
      </MobileDrawer>,
    );
    const drawer = screen.getByTestId('mobile-drawer');
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
  });

  it('open=true → aria-hidden=false 콘텐츠 표시', () => {
    render(
      <MobileDrawer open={true} onClose={vi.fn()}>
        <div>패널 내용</div>
      </MobileDrawer>,
    );
    const drawer = screen.getByTestId('mobile-drawer');
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByText('패널 내용')).toBeInTheDocument();
  });

  it('닫기 버튼 클릭 → onClose 호출', () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer open={true} onClose={onClose}>
        <div>x</div>
      </MobileDrawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: /닫기/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('배경 오버레이 클릭 → onClose 호출', () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer open={true} onClose={onClose}>
        <div>x</div>
      </MobileDrawer>,
    );
    fireEvent.click(screen.getByTestId('mobile-drawer-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape 키 → onClose 호출', () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer open={true} onClose={onClose}>
        <div>x</div>
      </MobileDrawer>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
