"use client"

// Note. copy from @/components/tiptap-templates/simple/simple-editor.tsx

import * as React from "react"
import { EditorContent, EditorContext, HTMLContent, useEditor } from "@tiptap/react"

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

// --- Styles ---
import "@/components/upload-editor.scss"

export interface ReadonlyEditorProps {
    content: HTMLContent;
}

export const ReadonlyEditor = (props: ReadonlyEditorProps) => {
    const isMobile = useMobile()
    const [mobileView, setMobileView] = React.useState<
        "main" | "highlighter" | "link"
    >("main")

    const editor = useEditor({
        immediatelyRender: false,
        editable: false,
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
            TrailingNode,
            Link.configure({ openOnClick: true }),
        ],
        content: props.content,
    })


    React.useEffect(() => {
        if (!isMobile && mobileView !== "main") {
            setMobileView("main")
        }
    }, [isMobile, mobileView])


    return (
        <EditorContext.Provider value={{ editor }}>
            <div className="content-wrapper">
                <EditorContent
                    editor={editor}
                    role="presentation"
                    className="upload-editor-content"
                />
            </div>
        </EditorContext.Provider>
    )
};

ReadonlyEditor.displayName = "ReadonlyEditor";