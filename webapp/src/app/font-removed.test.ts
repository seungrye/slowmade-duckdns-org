import { describe, test, expect } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * #232 - *reverting all of* the Nanum Gothic Coding font work.
 *
 * Every font-related change added in #228, #230 and #232 (layout.tsx's Google Fonts
 * CDN link and preconnect, globals.css's .nanum-gothic-coding-* classes, and the
 * "Nanum Gothic Coding" font-family declarations in paragraph-node.scss and
 * code-block-node.scss) is reverted to *its original state*.
 *
 * This test verifies that *no trace remains* - in the RED phase everything fails, since it is
 * before the change, and in the GREEN phase everything passes.
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

  test('#253 mermaid CSS rule 은 제거되어 더 이상 globals.css 에 없다', async () => {
    const css = await readFile(resolve(projectRoot, 'src/app/globals.css'), 'utf-8');
    expect(css).not.toMatch(/\.mermaid-rendered svg/);
  });
});
