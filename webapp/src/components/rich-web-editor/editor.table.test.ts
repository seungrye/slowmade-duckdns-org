// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// CSS and SCSS such as editor.scss are not parsed under jsdom, so they are ignored
vi.mock('katex/dist/katex.min.css', () => ({}));
vi.mock('./editor.scss', () => ({}));
vi.mock('@/components/tiptap-node/code-block-node/code-block-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/list-node/list-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/image-node/image-node.scss', () => ({}));
vi.mock('@/components/tiptap-node/paragraph-node/paragraph-node.scss', () => ({}));
vi.mock('@/hooks/use-mobile', () => ({ useMobile: () => false }));

import { Editor } from '@tiptap/react';
import { editorExtensions } from './editor.extensions';
import { tiptapExtensions } from './viewer';

// Verifying that the table node is in the schema on both the editor and the viewer
// and that insertTable() produces <table> HTML
describe('Table 확장 — editorExtensions', () => {
    it('insertTable() 호출 후 getHTML() 결과에 <table> 이 포함된다', () => {
        const editor = new Editor({ extensions: editorExtensions, content: '' });
        editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
        const html = editor.getHTML();
        expect(html).toContain('<table');
        expect(html).toContain('<tr');
        expect(html).toContain('<th');
        editor.destroy();
    });

    it('table HTML 컨텐츠를 setContent 로 주입하면 ProseMirror 가 인식한다', () => {
        const editor = new Editor({
            extensions: editorExtensions,
            content: '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>',
        });
        const html = editor.getHTML();
        expect(html).toContain('<table');
        expect(html).toContain('A');
        expect(html).toContain('B');
        editor.destroy();
    });
});

describe('Table 확장 — viewer tiptapExtensions', () => {
    it('viewer 도 table 노드를 렌더링한다', () => {
        const editor = new Editor({
            extensions: tiptapExtensions,
            editable: false,
            content: '<table><tbody><tr><th>H</th></tr><tr><td>D</td></tr></tbody></table>',
        });
        const html = editor.getHTML();
        expect(html).toContain('<table');
        expect(html).toContain('H');
        expect(html).toContain('D');
        editor.destroy();
    });
});
