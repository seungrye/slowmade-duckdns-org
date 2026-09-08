// @vitest-environment jsdom
//
// The comment markdown render (#220).
//
// The AI team's discussion happens entirely in comments and read badly. The cause is a component map that takes `children`
// alone and drops the rest (the numbers), or has no mapping at all (headings, code blocks). Tailwind v4's
// Preflight strips the default styles, so **with no mapping they become indistinguishable from the body.**
// (`globals.css` has no `.comment-markdown` defaults either.)
//
// jsdom has no Tailwind CSS, so computed styles cannot be seen. It is checked as "was the class that does that job
// attached" - a value we control, and the best check available.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommentContent from './comment-content';

describe('CommentContent — 번호 매긴 목록', () => {
  // This is the symptom the user saw: items 1 through 7 all appeared on screen as "1.".
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
  // Preflight strips h1~h6's size and weight. With no mapping they look exactly like the body.
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

  // With no pre mapping, multi-line code takes on the inline pill style and is mangled.
  it('코드블록은 pre 로 감싸이고 긴 줄은 가로 스크롤된다', () => {
    const { container } = render(<CommentContent content={fence} />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.className).toMatch(/overflow-x-auto/);
  });

  it('코드블록 안에서는 인라인 알약 배경을 지운다', () => {
    const { container } = render(<CommentContent content={fence} />);
    // jsdom has no CSS and no computed values, so it is checked by whether pre undoes it on the child code.
    expect(container.querySelector('pre')?.className).toMatch(/bg-transparent/);
  });

  it('인라인 코드는 알약 스타일을 유지한다', () => {
    const { container } = render(<CommentContent content={'본문 `code` 끝'} />);
    expect(container.querySelector('p code')?.className).toMatch(/rounded/);
  });
});
