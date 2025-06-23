"use client"

// Note. copy from @/components/tiptap-templates/simple/simple-editor.tsx

import * as React from "react"
import { EditorContent, EditorContext, HTMLContent, JSONContent, useEditor } from "@tiptap/react"

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

// --- Custom Extensions ---
import { Link } from "@/components/tiptap-extension/link-extension"
import { Selection } from "@/components/tiptap-extension/selection-extension"
import { TrailingNode } from "@/components/tiptap-extension/trailing-node-extension"

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

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

// --- Hooks ---
import { useMobile } from "@/hooks/use-mobile"
import { useWindowSize } from "@/hooks/use-window-size"

// --- Lib ---
import { MAX_FILE_SIZE } from "@/lib/tiptap-utils"
import { uploadImageFile } from "./editor.upload-image-handler"

// --- Styles ---
import "./editor.scss"

// function ThemeToggle() {
//     const [isDarkMode, setIsDarkMode] = React.useState<boolean>(false)

//     React.useEffect(() => {
//         const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
//         const handleChange = () => setIsDarkMode(mediaQuery.matches)
//         mediaQuery.addEventListener("change", handleChange)
//         return () => mediaQuery.removeEventListener("change", handleChange)
//     }, [])

//     React.useEffect(() => {
//         const initialDarkMode =
//             !!document.querySelector('meta[name="color-scheme"][content="dark"]') ||
//             window.matchMedia("(prefers-color-scheme: dark)").matches
//         setIsDarkMode(initialDarkMode)
//     }, [])

//     React.useEffect(() => {
//         document.documentElement.classList.toggle("dark", isDarkMode)
//     }, [isDarkMode])

//     const toggleDarkMode = () => setIsDarkMode((isDark) => !isDark)

//     return (
//         <Button
//             onClick={toggleDarkMode}
//             aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
//             data-style="ghost"
//         >
//             {isDarkMode ? (
//                 <MoonStarIcon className="tiptap-button-icon" />
//             ) : (
//                 <SunIcon className="tiptap-button-icon" />
//             )}
//         </Button>
//     )
// }

const MainToolbarContent = ({
    onHighlighterClick,
    onLinkClick,
    isMobile,
}: {
    onHighlighterClick: () => void
    onLinkClick: () => void
    isMobile: boolean
}) => {
    return (
        <>
            <Spacer />

            <ToolbarGroup>
                <UndoRedoButton action="undo" />
                <UndoRedoButton action="redo" />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <HeadingDropdownMenu levels={[1, 2, 3, 4]} />
                <ListDropdownMenu types={["bulletList", "orderedList", "taskList"]} />
                <NodeButton type="codeBlock" />
                <NodeButton type="blockquote" />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <MarkButton type="bold" />
                <MarkButton type="italic" />
                <MarkButton type="strike" />
                <MarkButton type="code" />
                <MarkButton type="underline" />
                {!isMobile ? (
                    <HighlightPopover />
                ) : (
                    <HighlighterButton onClick={onHighlighterClick} />
                )}
                {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <MarkButton type="superscript" />
                <MarkButton type="subscript" />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <TextAlignButton align="left" />
                <TextAlignButton align="center" />
                <TextAlignButton align="right" />
                <TextAlignButton align="justify" />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <ImageUploadButton text="Add" />
            </ToolbarGroup>

            <Spacer />
        </>
    )
}

const MobileToolbarContent = ({
    type,
    onBack,
}: {
    type: "highlighter" | "link"
    onBack: () => void
}) => (
    <>
        <ToolbarGroup>
            <Button data-style="ghost" onClick={onBack}>
                <ArrowLeftIcon className="tiptap-button-icon" />
                {type === "highlighter" ? (
                    <HighlighterIcon className="tiptap-button-icon" />
                ) : (
                    <LinkIcon className="tiptap-button-icon" />
                )}
            </Button>
        </ToolbarGroup>

        <ToolbarSeparator />

        {type === "highlighter" ? <HighlightContent /> : <LinkContent />}
    </>
)

export interface RichWebEditorHandle {
    getContent: () => {
        jsonContent: JSONContent | undefined,
        htmlContent: HTMLContent | undefined,
        uploadImageUrls: UploadImageUrl[]
    };
    setContent: (content: HTMLContent) => void;
}

export interface UploadImageUrl {
    url: string;
    thumbnailUrl: string;
}

export const RichWebEditor = React.forwardRef<RichWebEditorHandle, object>((props, ref) => {
    const isMobile = useMobile()
    const windowSize = useWindowSize()
    const [mobileView, setMobileView] = React.useState<
        "main" | "highlighter" | "link"
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
    const uploadedImageUrlsRef = React.useRef<UploadImageUrl[]>([]);

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
            StarterKit,
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            Underline,
            TaskList,
            TaskItem.configure({ nested: true }),
            Highlight.configure({ multicolor: true }),
            Image,
            Typography,
            Superscript,
            Subscript,

            Selection,
            ImageUploadNode.configure({
                accept: "image/*",
                maxSize: MAX_FILE_SIZE,
                limit: 32,
                upload: async (file, onProgress?, abortSignal?) => {
                    const {url, thumbnailUrl} = await uploadImageFile(file, onProgress, abortSignal);

                    if (uploadedImageUrlsRef.current.findIndex(x => x.url === url) < 0) {
                        uploadedImageUrlsRef.current.push({url, thumbnailUrl}); // 중복 방지 후 저장
                    }

                    return url;
                },
                onError: (error) => console.error("Upload failed:", error),
            }),
            TrailingNode,
            Link.configure({ openOnClick: false }),
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

                    // If not enough space, scroll until the cursor is the middle of the screen
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

    React.useImperativeHandle(ref, () => ({
        getContent: () => ({
            jsonContent: editor?.getJSON(),
            htmlContent: editor?.getHTML(),
            uploadImageUrls: uploadedImageUrlsRef.current,
        }),
        setContent: (content: HTMLContent) => {
            editor?.commands.setContent(content)
        },
    }), [editor])

    return (
        <EditorContext.Provider value={{ editor }}>
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
                        isMobile={isMobile}
                    />
                ) : (
                    <MobileToolbarContent
                        type={mobileView === "highlighter" ? "highlighter" : "link"}
                        onBack={() => setMobileView("main")}
                    />
                )}
            </Toolbar>

            <div className="content-wrapper">
                <EditorContent
                    editor={editor}
                    role="presentation"
                    className="upload-editor-content"
                />
            </div>
        </EditorContext.Provider>
    )
})

RichWebEditor.displayName = "RichWebEditor";