"use client"

import * as React from "react"
import { type Editor } from "@tiptap/react"
import { FaTable } from "react-icons/fa6"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Lib ---
import { isNodeInSchema } from "@/lib/tiptap-utils"

// --- UI Primitives ---
import { Button, ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

export interface TableButtonProps extends Omit<ButtonProps, "type"> {
    editor?: Editor | null
    /**
     * 표 기능을 사용할 수 없을 때 버튼을 숨길지 여부
     * @default true
     */
    hideWhenUnavailable?: boolean
}

export function isTableInSchema(editor: Editor | null): boolean {
    return isNodeInSchema("table", editor)
}

export function isInTable(editor: Editor | null): boolean {
    if (!editor) return false
    return editor.isActive("table")
}

export const TableButton = React.forwardRef<HTMLButtonElement, TableButtonProps>(
    (
        {
            editor: providedEditor,
            hideWhenUnavailable = true,
            className = "",
            ...buttonProps
        },
        ref
    ) => {
        const editor = useTiptapEditor(providedEditor)
        const [isOpen, setIsOpen] = React.useState(false)

        const tableInSchema = isTableInSchema(editor)
        const inTable = isInTable(editor)

        if (!editor || !editor.isEditable) return null
        if (hideWhenUnavailable && !tableInSchema) return null

        const insertTable = () =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        const addColBefore = () => editor.chain().focus().addColumnBefore().run()
        const addColAfter = () => editor.chain().focus().addColumnAfter().run()
        const deleteCol = () => editor.chain().focus().deleteColumn().run()
        const addRowBefore = () => editor.chain().focus().addRowBefore().run()
        const addRowAfter = () => editor.chain().focus().addRowAfter().run()
        const deleteRow = () => editor.chain().focus().deleteRow().run()
        const toggleHeaderRow = () => editor.chain().focus().toggleHeaderRow().run()
        const deleteTable = () => editor.chain().focus().deleteTable().run()

        return (
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        ref={ref}
                        type="button"
                        data-style="ghost"
                        data-active-state={inTable ? "on" : "off"}
                        role="button"
                        tabIndex={-1}
                        aria-label="표"
                        tooltip="표 삽입 / 편집"
                        className={className.trim()}
                        {...buttonProps}
                    >
                        <FaTable className="tiptap-button-icon" />
                        <ChevronDownIcon className="tiptap-button-dropdown-small" />
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent>
                    <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={insertTable}>표 삽입 (3×3)</DropdownMenuItem>
                    </DropdownMenuGroup>
                    {inTable && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem onSelect={addColBefore}>왼쪽에 열 추가</DropdownMenuItem>
                                <DropdownMenuItem onSelect={addColAfter}>오른쪽에 열 추가</DropdownMenuItem>
                                <DropdownMenuItem onSelect={deleteCol}>열 삭제</DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem onSelect={addRowBefore}>위에 행 추가</DropdownMenuItem>
                                <DropdownMenuItem onSelect={addRowAfter}>아래에 행 추가</DropdownMenuItem>
                                <DropdownMenuItem onSelect={deleteRow}>행 삭제</DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem onSelect={toggleHeaderRow}>헤더 행 토글</DropdownMenuItem>
                                <DropdownMenuItem onSelect={deleteTable}>표 삭제</DropdownMenuItem>
                            </DropdownMenuGroup>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        )
    }
)

TableButton.displayName = "TableButton"

export default TableButton
