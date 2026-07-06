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

// 뷰어(editable:false) 전용 이미지 렌더. ImageResize 의 NodeView 는 읽기전용에서 wrapper(display:flex)
// 를 버리고 container 만 렌더해 container 의 margin:auto 정렬이 무효화된다(block width 100%). 여기선
// renderHTML 로 wrapper+container 구조를 재현해 정렬(중앙/좌/우)·크기(width)를 그대로 반영한다.
// 드래그 리사이즈는 에디터 전용이라 뷰어엔 NodeView 가 불필요.
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
        const imgAttrs: Record<string, unknown> = { src, alt, title }
        if (width) imgAttrs.width = width
        const img: ["img", Record<string, unknown>] = ["img", imgAttrs]
        if (containerStyle || wrapperStyle) {
            return ["div", { style: wrapperStyle || "" }, ["div", { style: containerStyle || "" }, img]]
        }
        return img
    },
})

// Tiptap 확장 기능은 컴포넌트 외부에서 정의하여 리렌더링 시 재생성되지 않도록 합니다.
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
    waitRenderComplete?: boolean; // 렌더링 완료 이벤트를 기다릴지 여부
}

export const RichContentViewer = (props: RichContentViewerProps) => {
    // 뷰어의 최상위 DOM 요소를 참조하기 위한 ref. MutationObserver를 연결하는 데 사용됩니다.
    const viewerRef = React.useRef<HTMLDivElement>(null);
    // 디바운싱을 위한 타이머 ID를 저장하는 ref. 잦은 이벤트 발생을 방지합니다.
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

    // 이 useEffect는 Tiptap 뷰어의 렌더링이 완전히 안정화되는 시점을 감지하는 핵심 로직입니다.
    // 비동기적으로 로드되는 이미지나 DOM 변경이 모두 완료된 후 커스텀 이벤트를 발생시킵니다.
    React.useEffect(() => {
        let observer: MutationObserver | null = null;
        
        const waitDebouncedRenderComplete = () => {
            // 뷰어의 DOM 요소가 아직 마운트되지 않았으면 아무것도 하지 않습니다.
            const viewerElement = viewerRef.current;
            if (!viewerElement) return;

            // 렌더링이 안정화되었다고 판단될 때 호출되는 함수입니다.
            const dispatchRenderCompleteEvent = () => {
                // 혹시라도 남아있는 디바운스 타이머를 제거합니다.
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                }
                // 렌더링이 완료되었음을 알리는 커스텀 이벤트를 window 객체에 발생시킵니다.
                // 다른 컴포넌트(예: comments.section.tsx)에서 이 이벤트를 수신하여 스크롤과 같은 후속 작업을 수행할 수 있습니다.
                console.log('Rich content rendering appears complete. Dispatching event.');
                window.dispatchEvent(new CustomEvent('richContentRendered'));
            };

            // 여러 변경 사항이 짧은 시간 내에 연속적으로 발생할 경우,
            // 마지막 변경 후 일정 시간(300ms)이 지날 때까지 기다렸다가 이벤트를 한 번만 발생시키는 디바운스 함수입니다.
            const debouncedDispatch = () => {
                // 기존에 설정된 타이머가 있다면 취소합니다.
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                }
                // 300ms 후에 렌더링 완료 이벤트를 발생시키도록 새로운 타이머를 설정합니다.
                // 이 시간 동안 추가 변경이 없으면, 레이아웃이 안정된 것으로 간주합니다.
                debounceTimerRef.current = setTimeout(dispatchRenderCompleteEvent, 300);
            };

            // 1. MutationObserver를 사용하여 뷰어 내부의 DOM 변경을 감지합니다.
            // 자식 노드 추가/제거, 하위 모든 노드의 변경, 속성 변경을 모두 감시합니다.
            observer = new MutationObserver(debouncedDispatch);
            observer.observe(viewerElement, {
                childList: true,
                subtree: true,
                attributes: true,
            });

            // 2. 뷰어 내부에 포함된 모든 이미지의 로딩 완료 시점을 감지합니다.
            // 이미지는 비동기적으로 로드되므로, 모든 이미지가 로드되어야 레이아웃이 최종적으로 확정됩니다.
            const images = Array.from(viewerElement.getElementsByTagName('img'));
            // 이미지가 하나도 없다면, DOM 변경만으로 렌더링 완료를 판단할 수 있습니다.
            if (images.length === 0) {
                debouncedDispatch();
            } else {
                // 이미지가 있다면, 모든 이미지가 로드될 때까지 기다립니다.
                const totalImages = images.length;
                let loadedImages = 0;

                // 이미지가 로드되거나 에러가 발생했을 때 호출되는 콜백 함수입니다.
                const onImageLoad = () => {
                    loadedImages++;
                    // 모든 이미지가 처리되었으면, 렌더링이 안정화된 것으로 간주하고 디바운스 함수를 호출합니다.
                    if (loadedImages >= totalImages) {
                        debouncedDispatch();
                    }
                };

                images.forEach(img => {
                    // 이미지가 이미 캐시되어 로드가 완료된 경우
                    if (img.complete) onImageLoad();
                    else {
                        // 아직 로드되지 않은 경우, 'load'와 'error' 이벤트 리스너를 추가합니다.
                        // { once: true } 옵션으로 이벤트가 한 번만 실행되도록 합니다.
                        img.addEventListener('load', onImageLoad, { once: true });
                        img.addEventListener('error', onImageLoad, { once: true }); // 로드 실패 시에도 카운트를 증가시켜 무한 대기를 방지합니다.
                    }
                });
            }
        };

        if (props.waitRenderComplete) waitDebouncedRenderComplete();

        // 컴포넌트가 언마운트될 때 실행되는 정리(cleanup) 함수입니다.
        return () => {
            // MutationObserver의 감시를 중단하여 메모리 누수를 방지합니다.
            observer?.disconnect();
            // 만약 컴포넌트가 사라질 때 아직 실행되지 않은 타이머가 있다면 제거합니다.
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [props.content, props.waitRenderComplete]); // content prop이 변경될 때마다 이 로직을 다시 실행합니다.


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