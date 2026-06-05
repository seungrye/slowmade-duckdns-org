import { describe, test, expect } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * #232 — Nanum Gothic Coding 폰트 *전체 되돌리기*.
 *
 * #228 / #230 / #232 에서 추가된 모든 폰트 관련 변경(layout.tsx 의 Google Fonts
 * CDN link / preconnect, globals.css 의 .nanum-gothic-coding-* 클래스,
 * paragraph-node.scss · code-block-node.scss 의 "Nanum Gothic Coding"
 * font-family 명시)을 *원본 상태* 로 되돌린다.
 *
 * 본 테스트는 *제거된 흔적이 없음* 을 검증한다 — RED 단계에서는 변경 전이라
 * 모두 fail, GREEN 단계에서는 모두 pass 한다.
 */

const projectRoot = resolve(__dirname, '../..');

describe('#232 폰트 변경 전체 되돌리기 — 흔적 0', () => {
  test('layout.tsx 에 Google Fonts link 가 없다', async () => {
    const layout = await readFile(resolve(projectRoot, 'src/app/layout.tsx'), 'utf-8');
    expect(layout).not.toMatch(/googleapis\.com/);
    expect(layout).not.toMatch(/fonts\.gstatic\.com/);
    expect(layout).not.toMatch(/Nanum/i);
  });

  test('globals.css 에 nanum-gothic-coding 클래스가 없다', async () => {
    const css = await readFile(resolve(projectRoot, 'src/app/globals.css'), 'utf-8');
    expect(css).not.toMatch(/nanum-gothic-coding/i);
    expect(css).not.toMatch(/Nanum Gothic Coding/i);
  });

  test('paragraph-node.scss 에 Nanum Gothic Coding 폰트 명시가 없다', async () => {
    const scss = await readFile(
      resolve(projectRoot, 'src/components/tiptap-node/paragraph-node/paragraph-node.scss'),
      'utf-8',
    );
    expect(scss).not.toMatch(/Nanum Gothic Coding/i);
  });

  test('code-block-node.scss 에 Nanum Gothic Coding 폰트 명시가 없다', async () => {
    const scss = await readFile(
      resolve(projectRoot, 'src/components/tiptap-node/code-block-node/code-block-node.scss'),
      'utf-8',
    );
    expect(scss).not.toMatch(/Nanum Gothic Coding/i);
  });

  test('blockquote-font.test.ts 파일이 존재하지 않는다', async () => {
    await expect(
      access(resolve(projectRoot, 'src/components/rich-web-editor/blockquote-font.test.ts')),
    ).rejects.toThrow();
  });

  test('#229 mermaid svg 크기 규칙은 globals.css 에 유지된다', async () => {
    const css = await readFile(resolve(projectRoot, 'src/app/globals.css'), 'utf-8');
    expect(css).toMatch(/\.mermaid-rendered svg/);
    expect(css).toMatch(/max-width:\s*100%/);
  });
});
