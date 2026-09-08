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

// Verifying that a markdown string converts to HTML properly when switching from Markdown mode to Visual.
// Reported by a user: "submitting from md edit mode in the post editor does not seem to convert to html
// properly - e.g. `> abc` is not handled as <blockquote>abc</blockquote>."
// editor.tsx's getContent() / handleToggleMarkdown flow parses the markdown
//   editor.commands.setContent(md, { contentType: 'markdown' })
// through this, so whether that conversion really works is checked.
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

// Imitating editor.tsx's getContent() flow - verifying that on submitting from markdown mode,
// setContent(md, {contentType: 'markdown'}) -> getHTML() returns the converted
// HTML synchronously. (Reported by a user: no conversion on submitting in md mode.)
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

// The looksLikeMarkdown heuristic - true on clear markdown, false on an ordinary sentence
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
        // Weak signals on the same line accumulate as 1 point only (avoiding false positives)
        expect(looksLikeMarkdown('use `npm` to **install**')).toBe(false);
    });

    it('bold + heading — 강한 신호 2점 이상 → true', () => {
        expect(looksLikeMarkdown('# title\n\nthis is **bold**')).toBe(true);
    });
});

// The MarkdownPaste extension - pasted plain text matching a markdown pattern is converted as it goes in.
// jsdom has no DataTransfer, so ProseMirror view's handlePaste prop is called directly.
describe('MarkdownPaste 익스텐션 — paste 자동 변환', () => {
    const makeClipboardEvent = (dataMap: Record<string, string>): ClipboardEvent => {
        // A fake object mocking DataTransfer's setData/getData
        const data = { ...dataMap };
        const clipboardData = {
            getData: (type: string) => data[type] ?? '',
            setData: (type: string, value: string) => { data[type] = value; },
            types: Object.keys(data),
        } as unknown as DataTransfer;
        // Creating a ClipboardEvent (jsdom may or may not have one, hence the fallback)
        const ev = {
            clipboardData,
            preventDefault: () => undefined,
            stopPropagation: () => undefined,
        } as unknown as ClipboardEvent;
        return ev;
    };

    // Calling the handlePaste handlers registered through ProseMirror's view.someProp directly
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
        // looksLikeMarkdown false -> our handler does not take it
        // someProp returns only the first truthy result, so it must be undefined or false
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
        // text/html takes precedence -> markdownPaste does not preventDefault
        expect(handled).toBeFalsy();
        editor.destroy();
    });
});

// Whether the key constructs survive being serialised back to markdown with getMarkdown() (the round trip)
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
