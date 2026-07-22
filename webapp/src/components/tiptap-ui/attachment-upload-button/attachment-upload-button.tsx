"use client"

import * as React from "react"
import { Button, ButtonProps } from "@/components/tiptap-ui-primitive/button"

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
)

export interface AttachmentUploadButtonProps extends Omit<ButtonProps, "onClick"> {
  onPick: (files: File[]) => void | Promise<void>
  text?: string
}

/** 본문 툴바의 '파일 첨부' 버튼 — 파일 선택 시 onPick(files) 호출(다중 선택 지원, 업로드는 상위가 처리). */
export const AttachmentUploadButton = React.forwardRef<HTMLButtonElement, AttachmentUploadButtonProps>(
  ({ onPick, text, className = "", ...buttonProps }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null)
    return (
      <>
        <Button
          ref={ref}
          type="button"
          className={className.trim()}
          data-style="ghost"
          role="button"
          tabIndex={-1}
          aria-label="파일 첨부"
          tooltip="파일 첨부"
          onClick={() => inputRef.current?.click()}
          {...buttonProps}
        >
          <PaperclipIcon className="tiptap-button-icon" />
          {text && <span className="tiptap-button-text">{text}</span>}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = "" // 같은 파일 재선택 허용
            if (files.length) onPick(files)
          }}
        />
      </>
    )
  }
)

AttachmentUploadButton.displayName = "AttachmentUploadButton"

export default AttachmentUploadButton
