// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmulatorFrame from './EmulatorFrame';

function iframe(): HTMLIFrameElement | null {
  return document.querySelector('iframe');
}

describe('EmulatorFrame', () => {
  it('플레이어 주소를 iframe 에 꽂는다', () => {
    render(<EmulatorFrame core="fceumm" rom="/games/retro/roms/a.nes" name="Lan Master" />);
    const src = iframe()!.getAttribute('src')!;
    expect(src.startsWith('/games/retro/player.html?')).toBe(true);
    const q = new URL(src, 'https://x.test').searchParams;
    expect(q.get('core')).toBe('fceumm');
    expect(q.get('rom')).toBe('/games/retro/roms/a.nes');
    expect(q.get('name')).toBe('Lan Master');
  });

  it('게임패드를 허용한다 — 안 주면 iframe 안에서 패드가 안 잡힌다', () => {
    render(<EmulatorFrame core="mgba" rom="/api/games/retro/roms/1/file" />);
    expect(iframe()!.getAttribute('allow')).toContain('gamepad');
  });

  it('지원하지 않는 코어면 iframe 을 만들지 않고 안내만 보여 준다', () => {
    render(<EmulatorFrame core="pcsx_rearmed" rom="/x.bin" />);
    expect(iframe()).toBeNull();
    expect(screen.getByText(/실행할 수 없습니다/)).toBeInTheDocument();
  });

  it('외부 출처 롬도 실행하지 않는다', () => {
    render(<EmulatorFrame core="fceumm" rom="https://evil.test/a.nes" />);
    expect(iframe()).toBeNull();
  });

  it('게임이 바뀌면 iframe 을 새로 만든다 — 재사용하면 이전 게임 상태를 물고 있다', () => {
    const { rerender } = render(<EmulatorFrame core="fceumm" rom="/games/retro/roms/a.nes" />);
    const first = iframe();
    rerender(<EmulatorFrame core="fceumm" rom="/games/retro/roms/b.nes" />);
    expect(iframe()).not.toBe(first);
  });

  it('언마운트하면 iframe 이 사라진다 — 그 안의 전역·오디오가 함께 정리된다', () => {
    const { unmount } = render(<EmulatorFrame core="gambatte" rom="/games/retro/roms/a.gb" />);
    expect(iframe()).not.toBeNull();
    unmount();
    expect(iframe()).toBeNull();
  });
});
