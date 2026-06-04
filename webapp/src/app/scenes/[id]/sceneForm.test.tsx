// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SceneForm } from './sceneForm';
import type { Scene } from '@/types/web-adventure';

const baseScene: Scene = {
  id: 'scene_x',
  title: '제목',
  illustration: 'x.png',
  body: ['첫 줄'],
  choices: [],
};

describe('SceneForm — 기본 필드', () => {
  it('title 입력 필드가 렌더된다', () => {
    render(<SceneForm scene={baseScene} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('제목')).toBeTruthy();
  });

  it('title 이 빈 값이면 validation 메시지 노출', () => {
    render(<SceneForm scene={{ ...baseScene, title: '' }} onChange={vi.fn()} />);
    expect(screen.getByText(/제목.*필수/)).toBeTruthy();
  });

  it('body 한 줄 미만이면 validation 메시지 노출', () => {
    render(<SceneForm scene={{ ...baseScene, body: [] }} onChange={vi.fn()} />);
    expect(screen.getByText(/본문.*한 줄 이상.*필수|본문.*한 줄 이상 입력/)).toBeTruthy();
  });

  it('illustration 입력 필드가 렌더된다', () => {
    render(<SceneForm scene={baseScene} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('x.png')).toBeTruthy();
  });

  it('title 변경 시 onChange 호출', () => {
    const fn = vi.fn();
    render(<SceneForm scene={baseScene} onChange={fn} />);
    const input = screen.getByLabelText('제목') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '바뀐 제목' } });
    expect(fn).toHaveBeenCalled();
    const arg = fn.mock.calls[fn.mock.calls.length - 1][0] as Scene;
    expect(arg.title).toBe('바뀐 제목');
  });
});

describe('SceneForm — onEnter setFlags', () => {
  it('setFlags 토글 추가 가능', () => {
    const fn = vi.fn();
    render(<SceneForm scene={baseScene} onChange={fn} />);
    // 새 플래그 추가 입력
    const flagInput = screen.getByPlaceholderText('새 flag 키') as HTMLInputElement;
    fireEvent.change(flagInput, { target: { value: 'visited' } });
    fireEvent.click(screen.getByText('+ 플래그'));
    expect(fn).toHaveBeenCalled();
    const arg = fn.mock.calls[fn.mock.calls.length - 1][0] as Scene;
    expect(arg.onEnter?.setFlags).toMatchObject({ visited: true });
  });

  it('기존 setFlags 항목 제거 가능', () => {
    const fn = vi.fn();
    render(
      <SceneForm
        scene={{ ...baseScene, onEnter: { setFlags: { visited: true } } }}
        onChange={fn}
      />
    );
    const removeBtn = screen.getByLabelText('플래그 visited 삭제');
    fireEvent.click(removeBtn);
    const arg = fn.mock.calls[fn.mock.calls.length - 1][0] as Scene;
    expect(arg.onEnter?.setFlags?.visited).toBeUndefined();
  });
});

describe('SceneForm — isEnding 토글', () => {
  it('isEnding 토글 켜면 endingId select 노출', () => {
    render(
      <SceneForm
        scene={{ ...baseScene, isEnding: true, endingId: 'main' }}
        onChange={vi.fn()}
      />
    );
    const select = screen.getByLabelText('엔딩 ID') as HTMLSelectElement;
    expect(select.value).toBe('main');
  });

  it('isEnding 켜고 endingId 없으면 validation 메시지', () => {
    render(
      <SceneForm
        scene={{ ...baseScene, isEnding: true }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/엔딩.*ID.*필수/)).toBeTruthy();
  });

  it('isEnding 꺼지면 endingId select 미노출', () => {
    render(<SceneForm scene={baseScene} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('엔딩 ID')).toBeNull();
  });
});
