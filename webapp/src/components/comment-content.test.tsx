// @vitest-environment jsdom
//
// 덧글 마크다운 렌더 (#220).
//
// AI 팀 논의가 전부 덧글로 오가는데 읽기가 나빴다. 원인은 컴포넌트 맵이 `children` 만
// 받고 나머지를 버리거나(번호), 아예 매핑이 없는 것(제목·코드블록)이다. Tailwind v4
// Preflight 가 기본 스타일을 지우므로 **매핑이 없으면 본문과 구분이 사라진다.**
// (`globals.css` 에 `.comment-markdown` 기본 스타일도 없다.)
//
// jsdom 에는 Tailwind CSS 가 없어 계산된 스타일을 볼 수 없다. 그래서 "그 역할을 하는
// 클래스가 붙었는가"로 확인한다 — 우리가 통제하는 값이라 이게 확인 가능한 최선이다.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommentContent from './comment-content';

describe('CommentContent — 번호 매긴 목록', () => {
  // 이게 사용자가 본 증상이다: 1~7번 항목이 화면에 전부 "1." 로 나왔다.
  it('4. 로 시작하면 4번부터 센다', () => {
    const { container } = render(<CommentContent content={'4. 넷\n5. 다섯'} />);
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('4');
  });

  it('1. 로 시작하는 평범한 목록은 그대로 둔다', () => {
    const { container } = render(<CommentContent content={'1. 하나\n2. 둘'} />);
    const start = container.querySelector('ol')?.getAttribute('start');
    expect(start === null || start === '1').toBe(true);
  });

  it('목록 스타일(번호 표시)은 유지된다', () => {
    const { container } = render(<CommentContent content={'1. 하나'} />);
    expect(container.querySelector('ol')?.className).toMatch(/list-decimal/);
  });
});

describe('CommentContent — 제목', () => {
  // Preflight 가 h1~h6 의 크기·굵기를 지운다. 매핑이 없으면 본문과 똑같이 보인다.
  it('제목은 본문과 구분되는 크기를 갖는다', () => {
    render(<CommentContent content={'## 제목입니다\n\n본문입니다'} />);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.className).toMatch(/text-/);
    expect(h2.className).toMatch(/font-/);
  });

  it('h3 도 마찬가지', () => {
    render(<CommentContent content={'### 작은 제목'} />);
    expect(screen.getByRole('heading', { level: 3 }).className).toMatch(/text-/);
  });
});

describe('CommentContent — 코드', () => {
  const fence = '```\nconst a = 1;\nconst b = 2;\n```';

  // pre 매핑이 없으면 여러 줄 코드가 인라인용 알약 스타일을 뒤집어써 뭉개진다.
  it('코드블록은 pre 로 감싸이고 긴 줄은 가로 스크롤된다', () => {
    const { container } = render(<CommentContent content={fence} />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.className).toMatch(/overflow-x-auto/);
  });

  it('코드블록 안에서는 인라인 알약 배경을 지운다', () => {
    const { container } = render(<CommentContent content={fence} />);
    // jsdom 에 CSS 가 없어 계산값을 못 보므로, pre 가 자식 code 를 되돌리는지로 본다.
    expect(container.querySelector('pre')?.className).toMatch(/bg-transparent/);
  });

  it('인라인 코드는 알약 스타일을 유지한다', () => {
    const { container } = render(<CommentContent content={'본문 `code` 끝'} />);
    expect(container.querySelector('p code')?.className).toMatch(/rounded/);
  });
});
