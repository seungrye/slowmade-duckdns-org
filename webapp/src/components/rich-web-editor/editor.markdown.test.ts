// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('katex/dist/katex.min.css', () => ({}));
vi.mock('./editor.scss', () => ({}));
vi.mock('@/components/tiptap-node/code-block-node/code-block-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/list-node/list-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/image-node/image-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/paragraph-node/paragraph-node.scss', () => ({}));
vi.mock('@/hooks/use-mobile', () => ({ useMobile: () => false }));

import { Editor } from '@tiptap/react';
import { editorExtensions, looksLikeMarkdown } from './editor.extensions';

// Markdown 모드 → Visual 전환 시 markdown 문자열이 HTML 로 정상 변환되는지 검증.
// 사용자 보고: "post editor 에서 md 에디트 상태에서 submit 시 정상적으로 html 로
// 변환되지 않는 거 같다 — 예) `> abc` → <blockquote>abc</blockquote> 처리 안 됨."
// editor.tsx 의 getContent() / handleToggleMarkdown 흐름이
//   editor.commands.setContent(md, { contentType: 'markdown' })
// 를 통해 markdown 을 파싱하므로 그 변환이 실제로 동작하는지 확인.
describe('markdown → HTML 변환 (contentType: markdown)', () => {
    const newEditor = () => new Editor({ extensions: editorExtensions, content: '' });

    it('"> abc" 가 <blockquote> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('> abc\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<blockquote');
        expect(html).toContain('abc');
        editor.destroy();
    });

    it('"`code`" 가 inline <code> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('hello `code` world\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<code');
        expect(html).toContain('code');
        editor.destroy();
    });

    it('"# title" 이 <h1> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('# title\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<h1');
        expect(html).toContain('title');
        editor.destroy();
    });

    it('"## title" 이 <h2> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('## title\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<h2');
        editor.destroy();
    });

    it('"**bold**" 가 <strong> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('hello **bold** word\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<strong');
        expect(html).toContain('bold');
        editor.destroy();
    });

    it('"*italic*" 가 <em> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('hello *italic* word\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<em');
        expect(html).toContain('italic');
        editor.destroy();
    });

    it('"- item" bullet list 가 <ul><li> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('- item1\n- item2\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<ul');
        expect(html).toContain('<li');
        expect(html).toContain('item1');
        editor.destroy();
    });

    it('"1. item" ordered list 가 <ol><li> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('1. first\n2. second\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<ol');
        expect(html).toContain('<li');
        expect(html).toContain('first');
        editor.destroy();
    });

    it('"```js\\ncode\\n```" fenced code block 이 <pre><code> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('```js\nconsole.log(1)\n```\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<pre');
        expect(html).toContain('<code');
        editor.destroy();
    });

    it('"---" 가 <hr> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('above\n\n---\n\nbelow\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<hr');
        editor.destroy();
    });

    it('"[text](url)" 링크가 <a href> 로 변환된다', () => {
        const editor = newEditor();
        editor.commands.setContent('see [docs](https://example.com) for info\n', { contentType: 'markdown' });
        const html = editor.getHTML();
        expect(html).toContain('<a ');
        expect(html).toContain('href="https://example.com"');
        editor.destroy();
    });
});

// editor.tsx 의 getContent() 흐름 모사 — markdown 모드에서 submit 했을 때
// setContent(md, {contentType: 'markdown'}) → getHTML() 이 동기적으로 변환된
// HTML 을 돌려주는지 검증. (사용자 보고: md 모드에서 submit 시 변환 안 됨)
describe('getContent() 모사 — markdown 모드에서 submit 시 HTML 추출', () => {
    const submitFromMarkdown = (md: string) => {
        const editor = new Editor({ extensions: editorExtensions, content: '' });
        const normalized = md.endsWith('\n') ? md : md + '\n';
        editor.commands.setContent(normalized, { contentType: 'markdown' });
        const html = editor.getHTML();
        editor.destroy();
        return html;
    };

    it('`> abc` markdown 입력 → submit → <blockquote> 포함 HTML', () => {
        const html = submitFromMarkdown('> abc');
        expect(html).toContain('<blockquote');
        expect(html).toContain('abc');
    });

    it('`` `abc` `` markdown 입력 → submit → <code> 포함 HTML', () => {
        const html = submitFromMarkdown('`abc`');
        expect(html).toContain('<code');
        expect(html).toContain('abc');
    });

    it('`# title` markdown 입력 → submit → <h1> 포함 HTML', () => {
        const html = submitFromMarkdown('# title');
        expect(html).toContain('<h1');
        expect(html).toContain('title');
    });

    it('복합 markdown (heading + list + blockquote) 모두 변환된다', () => {
        const html = submitFromMarkdown('# T\n\n- a\n- b\n\n> q\n');
        expect(html).toContain('<h1');
        expect(html).toContain('<ul');
        expect(html).toContain('<blockquote');
    });
});

// looksLikeMarkdown 휴리스틱 — markdown 표현이 명확하면 true, 일반 문장은 false
describe('looksLikeMarkdown 휴리스틱', () => {
    it('heading 두 개 이상 — markdown 으로 판단', () => {
        expect(looksLikeMarkdown('# title\n\n## sub\n')).toBe(true);
    });

    it('blockquote 한 줄 — markdown 으로 판단 (2점)', () => {
        expect(looksLikeMarkdown('> quoted line')).toBe(true);
    });

    it('list 한 줄 — 단일 약한 신호이므로 false', () => {
        expect(looksLikeMarkdown('- single bullet')).toBe(false);
    });

    it('list 두 줄 — markdown 으로 판단', () => {
        expect(looksLikeMarkdown('- a\n- b')).toBe(true);
    });

    it('fenced code block — markdown 으로 판단', () => {
        expect(looksLikeMarkdown('```\nx\n```')).toBe(true);
    });

    it('일반 문장 — markdown 아님', () => {
        expect(looksLikeMarkdown('Hello, world. This is just text.')).toBe(false);
    });

    it('빈 문자열 — false', () => {
        expect(looksLikeMarkdown('')).toBe(false);
    });

    it('inline code 한 줄 — 단일 약한 신호이므로 false (오인 변환 방지)', () => {
        expect(looksLikeMarkdown('use `npm` to install')).toBe(false);
    });

    it('bold + inline code 같은 줄 — 약한 신호 1점 (오인 변환 방지를 위해 false)', () => {
        // 같은 줄의 약한 신호는 1점으로만 누적 (false positive 방지)
        expect(looksLikeMarkdown('use `npm` to **install**')).toBe(false);
    });

    it('bold + heading — 강한 신호 2점 이상 → true', () => {
        expect(looksLikeMarkdown('# title\n\nthis is **bold**')).toBe(true);
    });
});

// MarkdownPaste extension — paste 한 plain text 가 markdown 패턴이면 변환되어 들어간다.
// jsdom 에 DataTransfer 가 없으므로 ProseMirror view 의 handlePaste prop 을 직접 호출.
describe('MarkdownPaste 익스텐션 — paste 자동 변환', () => {
    const makeClipboardEvent = (dataMap: Record<string, string>): ClipboardEvent => {
        // DataTransfer 의 setData/getData 를 모킹한 가짜 객체
        const data = { ...dataMap };
        const clipboardData = {
            getData: (type: string) => data[type] ?? '',
            setData: (type: string, value: string) => { data[type] = value; },
            types: Object.keys(data),
        } as unknown as DataTransfer;
        // ClipboardEvent 생성 (jsdom 에는 있을 수도 / 없을 수도 있으므로 fallback)
        const ev = {
            clipboardData,
            preventDefault: () => undefined,
            stopPropagation: () => undefined,
        } as unknown as ClipboardEvent;
        return ev;
    };

    // ProseMirror view.someProp 으로 등록된 handlePaste 들을 직접 호출
    type EditorView = {
        someProp<T>(propName: string, fn: (value: (...args: unknown[]) => unknown) => T | undefined): T | undefined;
    };
    type SliceLike = unknown;
    const invokeHandlePaste = (editor: Editor, dataMap: Record<string, string>) => {
        const ev = makeClipboardEvent(dataMap);
        const view = editor.view as unknown as EditorView;
        return view.someProp('handlePaste', (handlePaste) => {
            return handlePaste(editor.view, ev, {} as SliceLike) as boolean;
        });
    };

    it('markdown 텍스트 paste → blockquote/heading 등이 노드로 변환', () => {
        const editor = new Editor({ extensions: editorExtensions, content: '<p></p>' });
        editor.commands.focus();
        const handled = invokeHandlePaste(editor, { 'text/plain': '# title\n\n> quoted\n' });
        expect(handled).toBe(true);
        const html = editor.getHTML();
        expect(html).toContain('<h1');
        expect(html).toContain('<blockquote');
        editor.destroy();
    });

    it('일반 텍스트 paste → handlePaste 가 false 반환하여 기본 동작에 위임', () => {
        const editor = new Editor({ extensions: editorExtensions, content: '<p></p>' });
        editor.commands.focus();
        const handled = invokeHandlePaste(editor, { 'text/plain': 'hello world' });
        // looksLikeMarkdown false → 우리 핸들러는 처리하지 않음
        // someProp 는 truthy 첫 결과만 반환하므로 undefined 또는 false 여야 함
        expect(handled).toBeFalsy();
        editor.destroy();
    });

    it('text/html 함께 들어오면 우리 핸들러는 처리하지 않는다 (브라우저 rich text 보존)', () => {
        const editor = new Editor({ extensions: editorExtensions, content: '<p></p>' });
        editor.commands.focus();
        const handled = invokeHandlePaste(editor, {
            'text/plain': '# title\n\n> quoted\n',
            'text/html': '<p>different</p>',
        });
        // text/html 우선 → markdownPaste 는 preventDefault 안 함
        expect(handled).toBeFalsy();
        editor.destroy();
    });
});

// getMarkdown() 으로 다시 markdown 으로 직렬화했을 때 핵심 표현이 보존되는지 (라운드트립)
describe('markdown 라운드트립 (md → HTML → md)', () => {
    it('blockquote 가 라운드트립에서 보존된다', () => {
        const editor = new Editor({ extensions: editorExtensions, content: '' });
        editor.commands.setContent('> hello\n', { contentType: 'markdown' });
        const md = editor.getMarkdown();
        expect(md).toMatch(/^>\s*hello/m);
        editor.destroy();
    });

    it('heading 이 라운드트립에서 보존된다', () => {
        const editor = new Editor({ extensions: editorExtensions, content: '' });
        editor.commands.setContent('# hello\n', { contentType: 'markdown' });
        const md = editor.getMarkdown();
        expect(md).toMatch(/^#\s+hello/m);
        editor.destroy();
    });
});
