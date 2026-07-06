import { Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { StarterKit } from "@tiptap/starter-kit"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Heading } from "@tiptap/extension-heading"
import ImageResize from "tiptap-extension-resize-image"
import { TaskItem } from "@tiptap/extension-task-item"
import { TaskList } from "@tiptap/extension-task-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Underline } from "@tiptap/extension-underline"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { InlineMath, BlockMath } from "@tiptap/extension-mathematics"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableCell } from "@tiptap/extension-table-cell"
import { Markdown } from "@tiptap/markdown"
import { Link } from "@/components/tiptap-extension/link-extension"
import { Selection } from "@/components/tiptap-extension/selection-extension"
import { TrailingNode } from "@/components/tiptap-extension/trailing-node-extension"
import { lowlight } from "@/lib/lowlight"

type JSONContent = { type?: string; attrs?: Record<string, unknown>; content?: JSONContent[]; text?: string }
type RenderHelpers = { renderChildren: (nodes: JSONContent | JSONContent[]) => string }
type RenderContext = { previousNode?: JSONContent | null }

// Paragraph — textAlign 속성이 있으면 <p style="text-align: ..."> 로 직렬화
const ParagraphWithAlign = Paragraph.extend({
    renderMarkdown(node: JSONContent, h: RenderHelpers, ctx: RenderContext) {
        const content = Array.isArray(node.content) ? node.content : [];
        const align: string | undefined = node.attrs?.textAlign as string | undefined;
        const children = content.length === 0 ? '' : h.renderChildren(node);
        if (align && align !== 'left') {
            return `<p style="text-align: ${align}">${children}</p>`;
        }
        if (content.length === 0) {
            const prev = ctx?.previousNode;
            const prevContent = Array.isArray(prev?.content) ? prev.content : [];
            return prev?.type === 'paragraph' && prevContent.length === 0 ? '&nbsp;' : '';
        }
        return children;
    },
});

// Heading — textAlign 속성이 있으면 <hN style="text-align: ..."> 로 직렬화
const HeadingWithAlign = Heading.extend({
    renderMarkdown(node: JSONContent, h: RenderHelpers) {
        const level = node.attrs?.level ? parseInt(String(node.attrs.level), 10) : 1;
        const align: string | undefined = node.attrs?.textAlign as string | undefined;
        if (!node.content) return '';
        const children = h.renderChildren(node.content as JSONContent[]);
        if (align && align !== 'left') {
            return `<h${level} style="text-align: ${align}">${children}</h${level}>`;
        }
        return `${'#'.repeat(level)} ${children}`;
    },
});

// Superscript/Subscript — <sup>/<sub> 인라인 HTML로 직렬화 (왕복 손실 방지)
const SuperscriptWithMarkdown = Superscript.extend({
    renderMarkdown(node: JSONContent, h: RenderHelpers) {
        return `<sup>${h.renderChildren(node)}</sup>`;
    },
});

const SubscriptWithMarkdown = Subscript.extend({
    renderMarkdown(node: JSONContent, h: RenderHelpers) {
        return `<sub>${h.renderChildren(node)}</sub>`;
    },
});

// 텍스트가 명백한 markdown 표현(heading/blockquote/list/code/fence 등)을 한 줄 이상 포함하면
// markdown 으로 간주. 단순히 `*` 만 하나 있다고 markdown 으로 판단하지는 않음(오인 변환 방지).
export const looksLikeMarkdown = (text: string): boolean => {
    if (!text) return false;
    const lines = text.split(/\r?\n/);
    let hits = 0;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // ATX heading: # ~ ###### + space
        if (/^#{1,6}\s+\S/.test(line)) { hits += 2; continue; }
        // blockquote
        if (/^>\s+\S/.test(line)) { hits += 2; continue; }
        // unordered list
        if (/^[-*+]\s+\S/.test(line)) { hits += 1; continue; }
        // ordered list
        if (/^\d+\.\s+\S/.test(line)) { hits += 1; continue; }
        // fenced code
        if (/^```/.test(line)) { hits += 2; continue; }
        // horizontal rule
        if (/^(---|\*\*\*|___)\s*$/.test(line)) { hits += 1; continue; }
        // inline code: `xxx`
        if (/(^|[^`])`[^`\n]+`(?!`)/.test(line)) { hits += 1; continue; }
        // bold/italic with markers
        if (/\*\*[^*\n]+\*\*/.test(line) || /__[^_\n]+__/.test(line)) { hits += 1; continue; }
        // link [text](url)
        if (/\[[^\]\n]+\]\([^)\n]+\)/.test(line)) { hits += 1; continue; }
    }
    // 최소 2점 이상이어야 markdown 으로 간주 (단일 약한 신호는 무시)
    return hits >= 2;
};

// Paste 시 plain text 가 markdown 으로 보이면 markdown 파서를 거쳐 삽입.
// rich text(text/html) 가 같이 들어오면 손대지 않음 — 브라우저/외부 에디터의 서식을 보존.
const markdownPasteKey = new PluginKey('markdownPaste');
export const MarkdownPaste = Extension.create({
    name: 'markdownPaste',
    addProseMirrorPlugins() {
        const editor = this.editor;
        return [
            new Plugin({
                key: markdownPasteKey,
                props: {
                    handlePaste(view, event) {
                        const cd = event.clipboardData;
                        if (!cd) return false;
                        const html = cd.getData('text/html');
                        if (html && html.trim().length > 0) return false;
                        const text = cd.getData('text/plain');
                        if (!text) return false;
                        if (!looksLikeMarkdown(text)) return false;
                        // markdown manager 가 없으면 기본 동작 유지
                        const manager = editor.storage.markdown?.manager;
                        if (!manager || typeof manager.parse !== 'function') return false;
                        try {
                            const json = manager.parse(text);
                            if (!json) return false;
                            editor
                                .chain()
                                .focus()
                                .insertContent(json)
                                .run();
                            event.preventDefault();
                            return true;
                        } catch {
                            return false;
                        }
                    },
                },
            }),
        ];
    },
});

export const editorExtensions = [
    StarterKit.configure({ codeBlock: false, link: false, underline: false, trailingNode: false, paragraph: false, heading: false }),
    ParagraphWithAlign,
    HeadingWithAlign,
    CodeBlockLowlight.configure({ lowlight }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    // ImageResize(드래그 크기조절) 를 기존 'image' 노드에 적용 — name 을 image 로 맞춰 호환.
    ImageResize.extend({ name: "image" }),
    Typography,
    SuperscriptWithMarkdown,
    SubscriptWithMarkdown,
    Selection,
    TrailingNode,
    Link.configure({ openOnClick: false }),
    InlineMath.configure({ katexOptions: { throwOnError: false } }),
    BlockMath.configure({ katexOptions: { throwOnError: false } }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Markdown,
    MarkdownPaste,
];
