import { describe, it, expect } from 'vitest';

vi.mock('katex/dist/katex.min.css', () => ({}));
vi.mock('./editor.scss', () => ({}));
vi.mock('@/components/tiptap-node/code-block-node/code-block-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/list-node/list-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/image-node/image-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/paragraph-node/paragraph-node.scss', () => ({}));
vi.mock('next/font/google', () => ({ Manrope: () => ({ className: 'manrope' }) }));
vi.mock('@/hooks/use-mobile', () => ({ useMobile: () => false }));

import { tiptapExtensions } from './viewer';
import { StarterKit } from '@tiptap/starter-kit';

describe('tiptapExtensions (viewer)', () => {
  const starterKit = tiptapExtensions.find(e => e.name === StarterKit.name);

  it('StarterKit이 포함된다', () => {
    expect(starterKit).toBeDefined();
  });

  it('StarterKit에서 link가 비활성화된다', () => {
    expect((starterKit as typeof StarterKit).options.link).toBe(false);
  });

  it('StarterKit에서 underline이 비활성화된다', () => {
    expect((starterKit as typeof StarterKit).options.underline).toBe(false);
  });

  it('StarterKit에서 trailingNode가 비활성화된다', () => {
    expect((starterKit as typeof StarterKit).options.trailingNode).toBe(false);
  });

  it('명시적 확장 이름에 중복이 없다', () => {
    const names = tiptapExtensions.map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
