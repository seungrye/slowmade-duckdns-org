"use client"

import * as React from "react"
import { type Editor } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"
import katex from "katex"

import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { Button, type ButtonProps } from "@/components/tiptap-ui-primitive/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/tiptap-ui-primitive/popover"
import { Separator } from "@/components/tiptap-ui-primitive/separator"
import { SigmaIcon } from "@/components/tiptap-icons/sigma-icon"
import { CornerDownLeftIcon } from "@/components/tiptap-icons/corner-down-left-icon"
import { TrashIcon } from "@/components/tiptap-icons/trash-icon"

import "./math-popover.scss"

export interface MathPopoverProps extends Omit<ButtonProps, "type"> {
  editor?: Editor | null
}

function getInlineMathLatex(editor: Editor | null): string | null {
  if (!editor) return null
  const { selection } = editor.state
  if (selection instanceof NodeSelection && selection.node.type.name === "inlineMath") {
    return selection.node.attrs.latex ?? ""
  }
  return null
}

function getInitialLatex(editor: Editor | null): string {
  if (!editor) return ""
  const existingLatex = getInlineMathLatex(editor)
  if (existingLatex !== null) return existingLatex
  const { selection } = editor.state
  if (!selection.empty) {
    return editor.state.doc.textBetween(selection.from, selection.to)
  }
  return ""
}

export function MathPopover({ editor: providedEditor, ...props }: MathPopoverProps) {
  const editor = useTiptapEditor(providedEditor)
  const [isOpen, setIsOpen] = React.useState(false)
  const [latex, setLatex] = React.useState("")
  const isActive = getInlineMathLatex(editor) !== null

  // 기존 인라인 수식 선택 시 자동으로 팝오버 열기
  React.useEffect(() => {
    if (!editor) return
    const handleSelectionUpdate = () => {
      if (getInlineMathLatex(editor) !== null) {
        setLatex(getInlineMathLatex(editor) ?? "")
        setIsOpen(true)
      }
    }
    editor.on("selectionUpdate", handleSelectionUpdate)
    return () => { editor.off("selectionUpdate", handleSelectionUpdate) }
  }, [editor])

  const handleOpenChange = React.useCallback((open: boolean) => {
    if (open) {
      setLatex(getInitialLatex(editor))
    }
    setIsOpen(open)
  }, [editor])

  const preview = React.useMemo(() => {
    if (!latex.trim()) return ""
    try {
      return katex.renderToString(latex, { throwOnError: false, displayMode: false })
    } catch {
      return ""
    }
  }, [latex])

  const handleApply = React.useCallback(() => {
    if (!editor || !latex.trim()) return

    const { selection } = editor.state

    if (selection instanceof NodeSelection && selection.node.type.name === "inlineMath") {
      editor.chain().focus().command(({ tr, dispatch }) => {
        tr.setNodeMarkup(selection.from, undefined, { latex })
        dispatch?.(tr)
        return true
      }).run()
    } else {
      const { from, to, empty } = selection
      editor.chain().focus().command(({ state, tr, dispatch }) => {
        const node = state.schema.nodes.inlineMath?.create({ latex })
        if (!node) return false
        tr.replaceWith(from, empty ? from : to, node)
        dispatch?.(tr)
        return true
      }).run()
    }

    setIsOpen(false)
  }, [editor, latex])

  const handleDelete = React.useCallback(() => {
    if (!editor) return
    editor.chain().focus().deleteSelection().run()
    setIsOpen(false)
  }, [editor])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleApply()
    }
  }

  if (!editor || !editor.isEditable) return null

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          data-style="ghost"
          role="button"
          tabIndex={-1}
          aria-label="수식 삽입"
          tooltip="수식"
          data-active-state={isActive ? "on" : "off"}
          {...props}
        >
          <SigmaIcon className="tiptap-button-icon" />
        </Button>
      </PopoverTrigger>

      <PopoverContent>
        <div className="math-popover-content">
          <div className="tiptap-button-group" data-orientation="horizontal">
            <input
              autoFocus
              type="text"
              className="math-popover-input"
              placeholder="LaTeX 수식 입력 (예: E=mc^2)"
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="button"
              data-style="ghost"
              onClick={handleApply}
              disabled={!latex.trim()}
              title={isActive ? "수정" : "삽입"}
            >
              <CornerDownLeftIcon className="tiptap-button-icon" />
            </Button>
            {isActive && (
              <Button
                type="button"
                data-style="ghost"
                onClick={handleDelete}
                title="수식 삭제"
              >
                <TrashIcon className="tiptap-button-icon" />
              </Button>
            )}
          </div>

          {preview && (
            <div
              className="math-popover-preview"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
