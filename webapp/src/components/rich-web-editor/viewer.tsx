"use client"

// Note. copy from @/components/tiptap-templates/simple/simple-editor.tsx

import * as React from "react"
import { EditorContent, EditorContext, JSONContent, useEditor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
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
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableCell } from "@tiptap/extension-table-cell"
import "katex/dist/katex.min.css"

// --- Custom Extensions ---
import { Link } from "@/components/tiptap-extension/link-extension"
import { Selection } from "@/components/tiptap-extension/selection-extension"
import { TrailingNode } from "@/components/tiptap-extension/trailing-node-extension"

// --- UI Primitives ---

// --- Tiptap Node ---
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---

// --- Icons ---

// --- Hooks ---
import { useMobile } from "@/hooks/use-mobile"

// --- Lib ---
import { lowlight } from "@/lib/lowlight"

// --- Styles ---
import "./editor.scss"

// The image render for the viewer (editable:false) alone. ImageResize's NodeView drops the wrapper (display:flex) when read-only
// and renders the container alone, which voids the container's margin:auto alignment (a block at width 100%). Here
// renderHTML reproduces the wrapper+container structure so the alignment (centre/left/right) and size (width) carry over.
// Drag resizing is editor-only, so the viewer needs no NodeView.
const ViewerImage = Image.extend({
    name: "image",
    addAttributes() {
        return {
            ...this.parent?.(),
            width: { default: null },
            height: { default: null },
            containerStyle: { default: null },
            wrapperStyle: { default: null },
        }
    },
    renderHTML({ node }) {
        const { src, alt, title, width, containerStyle, wrapperStyle } = node.attrs
        const imgAttrs: Record<string, unknown> = { src: sanitizeSrc(src), alt, title }
        if (width) imgAttrs.width = width
        const img: ["img", Record<string, unknown>] = ["img", imgAttrs]
        const ws = sanitizeStyle(wrapperStyle), cs = sanitizeStyle(containerStyle)
        if (cs || ws) {
            return ["div", { style: ws }, ["div", { style: cs }, img]]
        }
        return img
    },
})

// CSS injection defence - jsonContent is stored by the server as an arbitrary Object (the editor can be bypassed), so at render time
// the style attribute's dangerous tokens (external resource loads through url(), @import, expression, javascript:) are stripped.
// Layout styles such as display/flex/margin are kept as they are.
export function sanitizeStyle(style: unknown): string {
    if (typeof style !== "string") return ""
    return style
        .replace(/url\s*\(/gi, "")
        .replace(/@import/gi, "")
        .replace(/expression\s*\(/gi, "")
        .replace(/javascript:/gi, "")
}

// An image src is allowed only as http(s) or data:image (other schemes are blocked).
export function sanitizeSrc(src: unknown): string {
    if (typeof src !== "string") return ""
    return /^(https?:|data:image\/)/i.test(src.trim()) ? src : ""
}

// The Tiptap extensions are defined outside the component so they are not recreated on a re-render.
export const tiptapExtensions = [
    StarterKit.configure({ codeBlock: false, link: false, underline: false, trailingNode: false }),
    CodeBlockLowlight.configure({ lowlight }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    ViewerImage,
    Typography,
    Superscript,
    Subscript,
    Selection,
    TrailingNode,
    Link.configure({ openOnClick: true }),
    InlineMath.configure({ katexOptions: { throwOnError: false } }),
    BlockMath.configure({ katexOptions: { throwOnError: false } }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
];

export interface RichContentViewerProps {
    content: JSONContent;
    waitRenderComplete?: boolean; // Whether to wait for the render-complete event
}

export const RichContentViewer = (props: RichContentViewerProps) => {
    // The ref to the viewer's root DOM element. Used to attach the MutationObserver.
    const viewerRef = React.useRef<HTMLDivElement>(null);
    // The ref holding the debounce timer id. It prevents frequent events.
    const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    const isMobile = useMobile()
    const [mobileView, setMobileView] = React.useState<
        "main" | "highlighter" | "link"
    >("main")

    const editor = useEditor({
        immediatelyRender: false,
        editable: false,
        extensions: tiptapExtensions,
        content: props.content,
    })


    React.useEffect(() => {
        if (!isMobile && mobileView !== "main") {
            setMobileView("main")
        }
    }, [isMobile, mobileView])

    // This useEffect is the core logic detecting when the Tiptap viewer's render has fully settled.
    // It fires a custom event once every asynchronously loaded image and DOM change has finished.
    React.useEffect(() => {
        let observer: MutationObserver | null = null;
        
        const waitDebouncedRenderComplete = () => {
            // Does nothing while the viewer's DOM element is not yet mounted.
            const viewerElement = viewerRef.current;
            if (!viewerElement) return;

            // The function called when the render is judged to have settled.
            const dispatchRenderCompleteEvent = () => {
                // Clears any debounce timer still pending.
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                }
                // Fires the custom event on the window object announcing the render is complete.
                // Another component (comments.section.tsx, for instance) can listen for it and do follow-up work such as scrolling.
                console.log('Rich content rendering appears complete. Dispatching event.');
                window.dispatchEvent(new CustomEvent('richContentRendered'));
            };

            // The debounce function: when several changes happen in quick succession,
            // it waits until a set time (300ms) has passed since the last one and fires the event just once.
            const debouncedDispatch = () => {
                // Cancels any timer already set.
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                }
                // Sets a new timer to fire the render-complete event in 300ms.
                // With no further change in that time, the layout is taken to have settled.
                debounceTimerRef.current = setTimeout(dispatchRenderCompleteEvent, 300);
            };

            // 1. A MutationObserver detects DOM changes inside the viewer.
            // It watches child additions and removals, changes in every descendant, and attribute changes.
            observer = new MutationObserver(debouncedDispatch);
            observer.observe(viewerElement, {
                childList: true,
                subtree: true,
                attributes: true,
            });

            // 2. It detects when every image inside the viewer has finished loading.
            // Images load asynchronously, so the layout is only final once they all have.
            const images = Array.from(viewerElement.getElementsByTagName('img'));
            // With no images at all, the DOM changes alone decide the render is complete.
            if (images.length === 0) {
                debouncedDispatch();
            } else {
                // With images, it waits until every one has loaded.
                const totalImages = images.length;
                let loadedImages = 0;

                // The callback invoked when an image loads or errors.
                const onImageLoad = () => {
                    loadedImages++;
                    // Once every image is handled, the render is taken to have settled and the debounce function is called.
                    if (loadedImages >= totalImages) {
                        debouncedDispatch();
                    }
                };

                images.forEach(img => {
                    // When the image was already cached and has finished loading
                    if (img.complete) onImageLoad();
                    else {
                        // When it has not loaded yet, 'load' and 'error' listeners are added.
                        // The { once: true } option makes the event fire only once.
                        img.addEventListener('load', onImageLoad, { once: true });
                        img.addEventListener('error', onImageLoad, { once: true }); // The count increases on a failed load too, preventing an endless wait.
                    }
                });
            }
        };

        if (props.waitRenderComplete) waitDebouncedRenderComplete();

        // The cleanup function run when the component unmounts.
        return () => {
            // The MutationObserver stops watching, preventing a memory leak.
            observer?.disconnect();
            // Any timer still pending when the component disappears is cleared.
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [props.content, props.waitRenderComplete]); // This logic runs again whenever the content prop changes.


    return (
        <EditorContext.Provider value={{ editor }}>
            <div className="content-wrapper" ref={viewerRef}>
                <EditorContent
                    editor={editor}
                    role="presentation"
                    className="upload-editor-content"
                />
            </div>
        </EditorContext.Provider>
    )
};

RichContentViewer.displayName = "RichContentViewer";