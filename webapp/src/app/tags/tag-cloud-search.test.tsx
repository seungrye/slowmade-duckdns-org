// @vitest-environment jsdom
//
// 태그 클라우드의 prefetch (#481).
//
// 이 화면은 태그를 **전부** 한 번에 그린다(현재 457개). Next 는 viewport 에 들어온
// <Link> 를 자동으로 prefetch 하는데, 여기서는 그게 한 화면에 수백 개라 페이지를 여는
// 것만으로 `?_rsc=` 요청이 400건 넘게 쏟아진다 — 실측 초당 190건.
// 정작 사용자가 누르는 건 하나다.
//
// 헬퍼(filterTags/getTagSize) 단위 테스트는 tag-cloud-search.test.ts 에 따로 있다.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// prefetch 는 DOM 에 드러나지 않는다 — prop 을 받아 속성으로 노출시켜야 볼 수 있다.
vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch,
    children,
  }: {
    href: string;
    prefetch?: boolean;
    children: ReactNode;
  }) => (
    <a href={href} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}));

import TagCloudSearch from './tag-cloud-search';

describe('TagCloudSearch — 태그 링크 prefetch', () => {
  it('태그 링크는 prefetch 하지 않는다 — 한 화면에 수백 개가 동시에 보인다', () => {
    render(
      <TagCloudSearch
        initialTags={[
          { tag: 'react', count: 3 },
          { tag: 'nextjs', count: 1 },
        ]}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute('data-prefetch')).toBe('false');
    }
  });
});
