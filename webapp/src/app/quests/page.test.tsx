// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuestsPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    json: async () => ({ data: [] }),
    ok: true,
  } as Response);
});

describe('QuestsPage 레이아웃', () => {
  it('컨테이너에 max-w-4xl 클래스가 없다', async () => {
    const { container } = render(<QuestsPage />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper?.className).not.toContain('max-w-4xl');
  });

  it('컨테이너에 mx-auto 클래스가 있다', async () => {
    const { container } = render(<QuestsPage />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper?.className).toContain('mx-auto');
  });
});
