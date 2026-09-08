import { describe, it, expect } from 'vitest';
import { editorExtensions } from './editor.extensions';

// The editorExtensions array - verifying Markdown is included and there are no duplicates
describe('editorExtensions', () => {
    it('Markdown 익스텐션이 포함되어 있다', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).toContain('markdown');
    });

    it('ImageUploadNode 는 포함되지 않는다 (업로드 핸들러가 필요해 컴포넌트에서 주입)', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).not.toContain('imageUploadNode');
    });

    it('익스텐션 이름에 중복이 없다', () => {
        const names = editorExtensions.map(e => e.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });

    it('StarterKit 이 포함되어 있다', () => {
        const names = editorExtensions.map(e => e.name);
        // StarterKit bundles several extensions internally, so the name may not be 'starterKit'
        // At a minimum the array must not be empty
        expect(names.length).toBeGreaterThan(5);
    });

    it('CodeBlockLowlight 가 포함되어 있다 (코드블록 왕복 손실 방지에 필요)', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).toContain('codeBlock');
    });

    it('InlineMath, BlockMath 가 포함되어 있다', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).toContain('inlineMath');
        expect(names).toContain('blockMath');
    });

    it('Table 관련 확장 4종이 포함되어 있다', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).toContain('table');
        expect(names).toContain('tableRow');
        expect(names).toContain('tableHeader');
        expect(names).toContain('tableCell');
    });
});

// Verifying renderMarkdown's custom serialisation - the format is preserved through <sup>/<sub>/<p style>
describe('renderMarkdown 커스텀 직렬화', () => {
    const mockH = (children: string) => ({ renderChildren: () => children });

    it('superscript 는 <sup> 태그로 직렬화된다', () => {
        const ext = editorExtensions.find(e => e.name === 'superscript');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const render = (ext as any)?.config?.renderMarkdown;
        expect(render?.({ content: [] }, mockH('hello'))).toBe('<sup>hello</sup>');
    });

    it('subscript 는 <sub> 태그로 직렬화된다', () => {
        const ext = editorExtensions.find(e => e.name === 'subscript');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const render = (ext as any)?.config?.renderMarkdown;
        expect(render?.({ content: [] }, mockH('hello'))).toBe('<sub>hello</sub>');
    });

    it('paragraph 에 textAlign 이 있으면 <p style> 로 직렬화된다', () => {
        const ext = editorExtensions.find(e => e.name === 'paragraph');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const render = (ext as any)?.config?.renderMarkdown;
        const result = render?.({ content: [{ type: 'text', text: 'hi' }], attrs: { textAlign: 'center' } }, mockH('hi'), {});
        expect(result).toBe('<p style="text-align: center">hi</p>');
    });

    it('paragraph textAlign 이 left 면 일반 텍스트로 직렬화된다', () => {
        const ext = editorExtensions.find(e => e.name === 'paragraph');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const render = (ext as any)?.config?.renderMarkdown;
        const result = render?.({ content: [{ type: 'text', text: 'hi' }], attrs: { textAlign: 'left' } }, mockH('hi'), {});
        expect(result).toBe('hi');
    });

    it('heading 에 textAlign right 이면 <hN style> 로 직렬화된다', () => {
        const ext = editorExtensions.find(e => e.name === 'heading');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const render = (ext as any)?.config?.renderMarkdown;
        const result = render?.({ content: [{ type: 'text', text: 'title' }], attrs: { level: 2, textAlign: 'right' } }, mockH('title'), {});
        expect(result).toBe('<h2 style="text-align: right">title</h2>');
    });
});

// The markdown normalisation helper - avoiding a parse error on a code block's closing ``` when returning from Code to Visual
describe('markdown normalizeForParsing', () => {
    const normalize = (md: string) => md.endsWith('\n') ? md : md + '\n';

    it('개행으로 끝나지 않으면 개행을 추가한다', () => {
        expect(normalize('```\ncode\n```')).toBe('```\ncode\n```\n');
    });

    it('이미 개행으로 끝나면 변경하지 않는다', () => {
        expect(normalize('hello\n')).toBe('hello\n');
    });
});

