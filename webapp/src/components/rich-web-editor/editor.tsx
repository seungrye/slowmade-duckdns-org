"use client"

// Note. copy from @/components/tiptap-templates/simple/simple-editor.tsx

import * as React from "react"
import { EditorContent, EditorContext, HTMLContent, JSONContent, useEditor } from "@tiptap/react"

// --- Extensions ---
import "katex/dist/katex.min.css"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
    Toolbar,
    ToolbarGroup,
    ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { NodeButton } from "@/components/tiptap-ui/node-button"
import {
    HighlightPopover,
    HighlightContent,
    HighlighterButton,
} from "@/components/tiptap-ui/highlight-popover"
import {
    LinkPopover,
    LinkContent,
    LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"
import { MathPopover, MathButton, MathContent } from "@/components/tiptap-ui/math-popover"
import { TableButton } from "@/components/tiptap-ui/table-button"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { EyeIcon } from "@/components/tiptap-icons/eye-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"
import { SigmaIcon } from "@/components/tiptap-icons/sigma-icon"
import { FaPenToSquare } from "react-icons/fa6"

// --- Hooks ---
import { useMobile } from "@/hooks/use-mobile"
import { useWindowSize } from "@/hooks/use-window-size"

// --- Lib ---
import { MAX_FILE_SIZE } from "@/lib/tiptap-utils"
import { uploadImage } from "./editor.upload"

// --- Styles ---
import "./editor.scss"
import { ImageUrlType } from "@/models/post"
import { editorExtensions } from "./editor.extensions"

export { editorExtensions }

const MainToolbarContent = ({
    onHighlighterClick,
    onLinkClick,
    onMathClick,
    isMobile,
    isMarkdownMode,
    onToggleMarkdown,
}: {
    onHighlighterClick: () => void
    onLinkClick: () => void
    onMathClick: () => void
    isMobile: boolean
    isMarkdownMode: boolean
    onToggleMarkdown: () => void
}) => {
    return (
        <>
            <Spacer />

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'nowrap',
                    ...(isMarkdownMode ? { opacity: 0.35, pointerEvents: 'none' } : {}),
                }}
                aria-hidden={isMarkdownMode || undefined}
            >
                <ToolbarGroup>
                    <UndoRedoButton action="undo" aria-label="Undo" />
                    <UndoRedoButton action="redo" aria-label="Redo" />
                </ToolbarGroup>

                <ToolbarSeparator />

                <ToolbarGroup>
                    <HeadingDropdownMenu levels={[1, 2, 3, 4]} />
                    <ListDropdownMenu types={["bulletList", "orderedList", "taskList"]} />
                    <NodeButton type="codeBlock" aria-label="Code Block" />
                    <NodeButton type="blockquote" aria-label="Blockquote" />
                </ToolbarGroup>

                <ToolbarSeparator />

                <ToolbarGroup>
                    <MarkButton type="bold" aria-label="Bold" />
                    <MarkButton type="italic" aria-label="Italic" />
                    <MarkButton type="strike" aria-label="Strike" />
                    <MarkButton type="code" aria-label="Code" />
                    <MarkButton type="underline" aria-label="Underline" />
                    {!isMobile ? (
                        <HighlightPopover />
                    ) : (
                        <HighlighterButton onClick={onHighlighterClick} aria-label="Highlighter" />
                    )}
                    {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} aria-label="Link" />}
                </ToolbarGroup>

                <ToolbarSeparator />

                <ToolbarGroup>
                    <MarkButton type="superscript" aria-label="Superscript" />
                    <MarkButton type="subscript" aira-label="Subscript" />
                </ToolbarGroup>

                <ToolbarSeparator />

                <ToolbarGroup>
                    <TextAlignButton align="left" aria-label="Align Left" />
                    <TextAlignButton align="center" aria-label="Align Center" />
                    <TextAlignButton align="right" aria-label="Align Right" />
                    <TextAlignButton align="justify" aria-label="Align Justify" />
                </ToolbarGroup>

                <ToolbarSeparator />

                <ToolbarGroup>
                    <ImageUploadButton text="Add" aria-label="Add Image" />
                    {!isMobile ? (
                        <MathPopover />
                    ) : (
                        <MathButton onClick={onMathClick} aria-label="수식 삽입" />
                    )}
                    <TableButton aria-label="표" />
                </ToolbarGroup>

                <ToolbarSeparator />
            </div>

            <ToolbarGroup>
                <Button
                    data-style="ghost"
                    onClick={onToggleMarkdown}
                    aria-label={isMarkdownMode ? "Switch to Visual editor" : "Switch to Markdown source"}
                    title={isMarkdownMode ? "Visual 모드로 전환" : "Markdown 소스 편집"}
                >
                    {isMarkdownMode
                        ? <FaPenToSquare className="tiptap-button-icon" />
                        : <EyeIcon className="tiptap-button-icon" />
                    }
                </Button>
            </ToolbarGroup>

            <Spacer />
        </>
    )
}

const MobileToolbarContent = ({
    type,
    onBack,
}: {
    type: "highlighter" | "link" | "math"
    onBack: () => void
}) => (
    <>
        <ToolbarGroup>
            <Button data-style="ghost" onClick={onBack} aria-label="Back to main toolbar">
                <ArrowLeftIcon className="tiptap-button-icon" />
                {type === "highlighter" ? (
                    <HighlighterIcon className="tiptap-button-icon" />
                ) : type === "link" ? (
                    <LinkIcon className="tiptap-button-icon" />
                ) : (
                    <SigmaIcon className="tiptap-button-icon" />
                )}
            </Button>
        </ToolbarGroup>

        <ToolbarSeparator />

        {type === "highlighter" ? (
            <HighlightContent />
        ) : type === "link" ? (
            <LinkContent />
        ) : (
            <div className="math-popover-content" style={{ alignSelf: "flex-start" }}>
                <MathContent onApply={onBack} />
            </div>
        )}
    </>
)

export interface RichWebEditorHandle {
    getContent: () => {
        jsonContent: JSONContent | undefined,
        htmlContent: HTMLContent | undefined,
        uploadImageUrls: ImageUrlType[]
    };
    setContent: (content: HTMLContent, uploadImageUrls?: ImageUrlType[]) => void;
    focus: () => void;
}

export const RichWebEditor = React.forwardRef<RichWebEditorHandle, object>((props, ref) => {
    const isMobile = useMobile()
    const windowSize = useWindowSize()
    const [mobileView, setMobileView] = React.useState<
        "main" | "highlighter" | "link" | "math"
    >("main")
    const [rect, setRect] = React.useState<
        Pick<DOMRect, "x" | "y" | "width" | "height">
    >({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    })
    const toolbarRef = React.useRef<HTMLDivElement>(null)
    const uploadedImageUrlsRef = React.useRef<ImageUrlType[]>([]);

    // Markdown mode state
    const [isMarkdownMode, setIsMarkdownMode] = React.useState(false);
    const isMarkdownModeRef = React.useRef(false);
    const [markdownContent, setMarkdownContent] = React.useState('');
    const markdownContentRef = React.useRef('');
    const savedJsonRef = React.useRef<JSONContent | null>(null);
    const savedMarkdownRef = React.useRef('');
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        const updateRect = () => {
            setRect(document.body.getBoundingClientRect())
        }

        updateRect()

        const resizeObserver = new ResizeObserver(updateRect)
        resizeObserver.observe(document.body)

        window.addEventListener("scroll", updateRect)

        return () => {
            resizeObserver.disconnect()
            window.removeEventListener("scroll", updateRect)
        }
    }, [])

    const editor = useEditor({
        immediatelyRender: false,
        editorProps: {
            attributes: {
                autocomplete: "off",
                autocorrect: "off",
                autocapitalize: "off",
                spellcheck: 'false',
                "aria-label": "Main content area, start typing to enter text.",
            },
        },
        extensions: [
            ...editorExtensions,
            ImageUploadNode.configure({
                accept: "image/*",
                maxSize: MAX_FILE_SIZE,
                limit: 32,
                upload: async (file, onProgress?, abortSignal?) => {
                    const {url, thumbnailUrl} = await uploadImage(file, onProgress, abortSignal);
                    if (uploadedImageUrlsRef.current.findIndex(x => x.url === url) < 0) {
                        uploadedImageUrlsRef.current.push({url, thumbnailUrl});
                    }
                    return url;
                },
                onError: (error) => console.error("Upload failed:", error),
            }),
        ],
        content: "",
    })

    React.useEffect(() => {
        const checkCursorVisibility = () => {
            if (!editor || !toolbarRef.current) return

            const { state, view } = editor
            if (!view.hasFocus()) return

            const { from } = state.selection
            const cursorCoords = view.coordsAtPos(from)

            if (windowSize.height < rect.height) {
                if (cursorCoords && toolbarRef.current) {
                    const toolbarHeight =
                        toolbarRef.current.getBoundingClientRect().height
                    const isEnoughSpace =
                        windowSize.height - cursorCoords.top - toolbarHeight > 0

                    if (!isEnoughSpace) {
                        const scrollY =
                            cursorCoords.top - windowSize.height / 2 + toolbarHeight
                        window.scrollTo({
                            top: scrollY,
                            behavior: "smooth",
                        })
                    }
                }
            }
        }

        checkCursorVisibility()
    }, [editor, rect.height, windowSize.height])

    React.useEffect(() => {
        if (!isMobile && mobileView !== "main") {
            setMobileView("main")
        }
    }, [isMobile, mobileView])

    // textarea 를 내용 높이에 맞춰 늘린다. 데스크톱은 고정높이 content-wrapper 안에서
    // 넘치면 그 컨테이너가 내부 스크롤, 모바일은 페이지가 늘어나 페이지 스크롤(플로팅 툴바).
    const autoResizeTextarea = React.useCallback((el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, []);

    // Markdown 모드 진입 시 textarea 초기 높이 조절
    React.useEffect(() => {
        if (isMarkdownMode && textareaRef.current) {
            autoResizeTextarea(textareaRef.current);
        }
    }, [isMarkdownMode, autoResizeTextarea])

    const handleToggleMarkdown = React.useCallback(() => {
        if (!editor) return;
        if (!isMarkdownModeRef.current) {
            // Visual → Code: 원본 JSON 저장 후 Markdown 직렬화
            savedJsonRef.current = editor.getJSON();
            const md = editor.getMarkdown();
            savedMarkdownRef.current = md;
            markdownContentRef.current = md;
            setMarkdownContent(md);
            isMarkdownModeRef.current = true;
            setIsMarkdownMode(true);
        } else {
            // Code → Visual: 변경 없으면 원본 JSON 복원, 변경 있으면 Markdown 파싱
            if (markdownContentRef.current === savedMarkdownRef.current && savedJsonRef.current) {
                editor.commands.setContent(savedJsonRef.current);
            } else {
                const md = markdownContentRef.current;
                const normalized = md.endsWith('\n') ? md : md + '\n';
                editor.commands.setContent(normalized, { contentType: 'markdown' });
            }
            isMarkdownModeRef.current = false;
            setIsMarkdownMode(false);
        }
    }, [editor]);

    const handleMarkdownChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        markdownContentRef.current = e.target.value;
        setMarkdownContent(e.target.value);
        autoResizeTextarea(e.target);
    }, [autoResizeTextarea]);

    React.useImperativeHandle(ref, () => ({
        getContent: () => {
            if (isMarkdownModeRef.current && editor) {
                if (markdownContentRef.current === savedMarkdownRef.current && savedJsonRef.current) {
                    editor.commands.setContent(savedJsonRef.current);
                } else {
                    const md = markdownContentRef.current;
                    const normalized = md.endsWith('\n') ? md : md + '\n';
                    editor.commands.setContent(normalized, { contentType: 'markdown' });
                }
            }
            return {
                jsonContent: editor?.getJSON(),
                htmlContent: editor?.getHTML(),
                uploadImageUrls: uploadedImageUrlsRef.current,
            };
        },
        setContent: (content: HTMLContent, uploadImageUrls?: ImageUrlType[]) => {
            if (!editor) return console.warn("Editor is not initialized");
            uploadedImageUrlsRef.current = uploadImageUrls || [];
            editor.commands.setContent(content);
            if (isMarkdownModeRef.current) {
                const md = editor.getMarkdown();
                markdownContentRef.current = md;
                setMarkdownContent(md);
            }
        },
        focus: () => {
            if (isMarkdownModeRef.current) {
                textareaRef.current?.focus();
            } else {
                editor?.commands.focus();
            }
        },
    }), [editor])

    return (
        <EditorContext.Provider value={{ editor: editor }}>
            <Toolbar
                ref={toolbarRef}
                style={
                    isMobile
                        ? {
                            bottom: `calc(100% - ${windowSize.height - rect.y}px)`,
                        }
                        : {}
                }
            >
                {mobileView === "main" ? (
                    <MainToolbarContent
                        onHighlighterClick={() => setMobileView("highlighter")}
                        onLinkClick={() => setMobileView("link")}
                        onMathClick={() => setMobileView("math")}
                        isMobile={isMobile}
                        isMarkdownMode={isMarkdownMode}
                        onToggleMarkdown={handleToggleMarkdown}
                    />
                ) : (
                    <MobileToolbarContent
                        type={mobileView}
                        onBack={() => setMobileView("main")}
                    />
                )}
            </Toolbar>

            <div className="rich-web-content-wrapper">
                {isMarkdownMode ? (
                    <textarea
                        ref={textareaRef}
                        value={markdownContent}
                        onChange={handleMarkdownChange}
                        className="rich-web-editor-markdown"
                        spellCheck={false}
                        aria-label="Markdown source editor"
                    />
                ) : (
                    <EditorContent
                        editor={editor}
                        role="presentation"
                        className="rich-web-editor-content"
                    />
                )}
            </div>
        </EditorContext.Provider>
    )
})

RichWebEditor.displayName = "RichWebEditor";
