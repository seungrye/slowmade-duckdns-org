import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * #228 — post 본문(TipTap viewer) 의 blockquote + 코드블럭(<pre>, inline <code>)
 * 이 Nanum Gothic Coding (monospace) 폰트로 렌더되어야 한다.
 *
 * 폰트 호스팅 전략: `next/font/google` 의 `Nanum_Gothic_Coding` 을 layout.tsx
 * 에서 self-host 하여 CSS variable `--font-nanum-gothic-coding` 로 노출.
 *
 * 검증 전략: jsdom 의 getComputedStyle 은 외부 CSS 룰을 평가하지 못하므로,
 * 빌드 산출물(.scss / layout.tsx) 의 원본 텍스트를 직접 읽어 다음을 검증한다:
 *   1) layout.tsx 가 next/font/google 에서 Nanum_Gothic_Coding 을 import,
 *      400/700 weight 로 설정하고 `--font-nanum-gothic-coding` CSS variable
 *      을 <html> className 에 부착한다.
 *   2) paragraph-node.scss 의 blockquote 룰에 `var(--font-nanum-gothic-coding)`
 *      이 1순위인 monospace 폰트 스택이 지정된다.
 *   3) code-block-node.scss 의 inline `code` 및 `pre code` 룰의 font-family
 *      가 `var(--font-nanum-gothic-coding)` 1순위 monospace 스택으로 갱신된다.
 *   4) 일반 본문(p, h1 등) 은 monospace 가 적용되지 않는다.
 *   5) post 본문 wrapper(.tiptap.ProseMirror) 셀렉터 내부로 격리되어 다른
 *      영역의 blockquote/code 에는 영향이 없다.
 */
describe('#228 blockquote + 코드블럭 — Nanum Gothic Coding monospace 폰트 적용', () => {
  const projectRoot = resolve(__dirname, '../../..');

  const paragraphNodeScss = readFileSync(
    resolve(projectRoot, 'src/components/tiptap-node/paragraph-node/paragraph-node.scss'),
    'utf-8',
  );
  const codeBlockNodeScss = readFileSync(
    resolve(projectRoot, 'src/components/tiptap-node/code-block-node/code-block-node.scss'),
    'utf-8',
  );
  const layoutTsx = readFileSync(
    resolve(projectRoot, 'src/app/layout.tsx'),
    'utf-8',
  );

  describe('layout.tsx — next/font/google 설정', () => {
    it('next/font/google 에서 Nanum_Gothic_Coding 을 import 한다', () => {
      expect(layoutTsx).toMatch(/import\s*\{[^}]*Nanum_Gothic_Coding[^}]*\}\s*from\s*["']next\/font\/google["']/);
    });

    it('Nanum_Gothic_Coding 을 400 weight 로 설정한다', () => {
      expect(layoutTsx).toMatch(/Nanum_Gothic_Coding\s*\(\s*\{[\s\S]*?weight\s*:\s*\[[^\]]*["']400["'][^\]]*\][\s\S]*?\}\s*\)/);
    });

    it('Nanum_Gothic_Coding 을 700 weight 로 설정한다', () => {
      expect(layoutTsx).toMatch(/Nanum_Gothic_Coding\s*\(\s*\{[\s\S]*?weight\s*:\s*\[[^\]]*["']700["'][^\]]*\][\s\S]*?\}\s*\)/);
    });

    it('Nanum_Gothic_Coding 의 CSS variable 을 --font-nanum-gothic-coding 으로 노출한다', () => {
      expect(layoutTsx).toMatch(/variable\s*:\s*["']--font-nanum-gothic-coding["']/);
    });

    it('Nanum_Gothic_Coding 은 display: swap 을 사용한다 (FOIT 방지)', () => {
      expect(layoutTsx).toMatch(/Nanum_Gothic_Coding\s*\(\s*\{[\s\S]*?display\s*:\s*["']swap["'][\s\S]*?\}\s*\)/);
    });

    it('<html> className 에 nanum gothic coding 의 .variable 이 부착된다', () => {
      // const nanumGothicCoding = Nanum_Gothic_Coding(...)  → className 에 .variable
      expect(layoutTsx).toMatch(/<html[\s\S]*?className=\{[^}]*nanumGothicCoding\.variable/);
    });
  });

  describe('paragraph-node.scss — blockquote 폰트', () => {
    it('blockquote 룰에 var(--font-nanum-gothic-coding) 이 1순위 font-family 로 지정된다', () => {
      const blockquoteMatch = paragraphNodeScss.match(
        /BLOCKQUOTE[\s\S]*?blockquote\s*\{([\s\S]*?)\n\s{2}\}/,
      );
      expect(blockquoteMatch).not.toBeNull();
      const blockquoteBody = blockquoteMatch![1];

      // font-family 가 var(--font-nanum-gothic-coding) 으로 시작해야 한다
      expect(blockquoteBody).toMatch(/font-family\s*:\s*var\(--font-nanum-gothic-coding\)/);
    });

    it('blockquote 의 font-family 스택에 monospace 폴백이 포함된다', () => {
      const blockquoteMatch = paragraphNodeScss.match(
        /BLOCKQUOTE[\s\S]*?blockquote\s*\{([\s\S]*?)\n\s{2}\}/,
      );
      const blockquoteBody = blockquoteMatch![1];

      // monospace 폴백 포함
      expect(blockquoteBody).toMatch(/font-family[^;]*monospace\s*;/);
    });

    it('blockquote 룰은 .tiptap.ProseMirror 셀렉터 내부로 격리된다 (post 본문 안만)', () => {
      // .tiptap.ProseMirror { ... blockquote { ... } ... } 형태
      const isolationMatch = paragraphNodeScss.match(
        /\.tiptap\.ProseMirror\s*\{[\s\S]*?blockquote\s*\{[\s\S]*?font-family\s*:\s*var\(--font-nanum-gothic-coding\)/,
      );
      expect(isolationMatch).not.toBeNull();
    });

    it('blockquote 룰은 기존 ::before pseudo-element (좌측 보더) 를 유지한다', () => {
      expect(paragraphNodeScss).toMatch(/&::before,\s*\n\s*&\.is-empty::before/);
      expect(paragraphNodeScss).toMatch(/background-color:\s*var\(--blockquote-bg-color\)/);
    });

    it('일반 본문 p:not(:first-child) 에는 monospace 가 적용되지 않는다 — 기존 폰트 스택 유지', () => {
      const paragraphRule = paragraphNodeScss.match(
        /p:not\(:first-child\)\s*\{([\s\S]*?)\}/,
      );
      expect(paragraphRule).not.toBeNull();
      expect(paragraphRule![1]).not.toMatch(/font-family/);
    });
  });

  describe('code-block-node.scss — pre / inline code 폰트', () => {
    it('inline code 의 font-family 가 var(--font-nanum-gothic-coding) 1순위로 갱신된다', () => {
      // 파일 내 첫 번째 `\n  code {` (.tiptap.ProseMirror 의 inline code 룰).
      // `pre code` 는 들여쓰기 4 칸이므로 2 칸 들여쓰기로 inline code 만 매칭한다.
      const inlineCodeMatch = codeBlockNodeScss.match(
        /\n  code\s*\{([\s\S]*?)\n  \}/,
      );
      expect(inlineCodeMatch).not.toBeNull();
      const inlineCodeBody = inlineCodeMatch![1];
      expect(inlineCodeBody).toMatch(/font-family\s*:\s*var\(--font-nanum-gothic-coding\)/);
      // 그리고 이 매칭이 inline code 룰 (background-color: var(--tt-inline-code-bg-color) 포함) 인지 확인
      expect(inlineCodeBody).toMatch(/var\(--tt-inline-code-bg-color\)/);
    });

    it('pre code 의 font-family 가 var(--font-nanum-gothic-coding) 1순위로 갱신된다', () => {
      // pre { ... code { ... font-family ... } ... } 패턴 — pre 블록 내부의 code 룰
      const preBlockMatch = codeBlockNodeScss.match(
        /\bpre\s*\{[\s\S]*?\bcode\s*\{([\s\S]*?)\n\s{4}\}/,
      );
      expect(preBlockMatch).not.toBeNull();
      const preCodeBody = preBlockMatch![1];
      expect(preCodeBody).toMatch(/font-family\s*:\s*var\(--font-nanum-gothic-coding\)/);
    });

    it('code-block 폰트 스택에 monospace 폴백이 포함된다', () => {
      // var(--font-nanum-gothic-coding) 라인이 들어간 font-family 선언 전부가
      // monospace 폴백을 포함해야 한다.
      const fontFamilyLines = codeBlockNodeScss.match(
        /font-family\s*:\s*var\(--font-nanum-gothic-coding\)[^;]*;/g,
      );
      expect(fontFamilyLines).not.toBeNull();
      expect(fontFamilyLines!.length).toBeGreaterThanOrEqual(2); // inline + pre code
      for (const line of fontFamilyLines!) {
        expect(line).toMatch(/monospace/);
      }
    });

    it('code-block 룰은 .tiptap.ProseMirror 셀렉터 내부로 격리된다', () => {
      // 모든 font-family: var(--font-nanum-gothic-coding) 선언이
      // .tiptap.ProseMirror { ... } 블록 내부에 위치해야 한다.
      // 단순화: 파일 상단의 selector wrapping 패턴 검증.
      const wrappingMatch = codeBlockNodeScss.match(
        /\.tiptap\.ProseMirror\s*\{[\s\S]*?font-family\s*:\s*var\(--font-nanum-gothic-coding\)/,
      );
      expect(wrappingMatch).not.toBeNull();
    });
  });
});
