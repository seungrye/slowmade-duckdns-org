import { StarterKit } from "@tiptap/starter-kit"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Heading } from "@tiptap/extension-heading"
import { Image } from "@tiptap/extension-image"
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
import { Markdown } from "@tiptap/markdown"
import { Link } from "@/components/tiptap-extension/link-extension"
import { Selection } from "@/components/tiptap-extension/selection-extension"
import { TrailingNode } from "@/components/tiptap-extension/trailing-node-extension"
import { lowlight } from "@/lib/lowlight"

type JSONContent = { type?: string; attrs?: Record<string, unknown>; content?: JSONContent[]; text?: string }
type RenderHelpers = { renderChildren: (nodes: JSONContent | JSONContent[]) => string }
type RenderContext = { previousNode?: JSONContent }

// Paragraph — textAlign 속성이 있으면 <p style="text-align: ..."> 로 직렬화
const ParagraphWithAlign = Paragraph.extend({
    renderMarkdown(node: JSONContent, h: RenderHelpers, ctx: RenderContext) {
        const content = Array.isArray(node.content) ? node.content : [];
        const align: string | undefined = node.attrs?.textAlign;
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
        const align: string | undefined = node.attrs?.textAlign;
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
    Image,
    Typography,
    SuperscriptWithMarkdown,
    SubscriptWithMarkdown,
    Selection,
    TrailingNode,
    Link.configure({ openOnClick: false }),
    InlineMath.configure({ katexOptions: { throwOnError: false } }),
    BlockMath.configure({ katexOptions: { throwOnError: false } }),
    Markdown,
];
