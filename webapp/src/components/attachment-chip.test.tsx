// AttachmentChip — 전용 첨부 영역 칩(뷰 다운로드 / 작성 삭제). 아이콘만 표시, 파일명은 호버 툴팁.
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentChip } from "./attachment-chip";

const att = { id: "a1", name: "report.pdf", size: 2 * 1024 * 1024, mimeType: "application/pdf" };

describe("AttachmentChip", () => {
  it("파일 아이콘(img) 표시", () => {
    render(<AttachmentChip att={att} />);
    expect(document.querySelector("img")).toBeInTheDocument();
  });

  it("파일명은 툴팁(role=tooltip) 텍스트로 존재", () => {
    render(<AttachmentChip att={att} />);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("report.pdf");
  });

  it("네이티브 title(호버 툴팁) 없음, 대신 aria-label 에 파일명+크기", () => {
    render(<AttachmentChip att={att} downloadHref="/x" />);
    const link = screen.getByRole("link");
    expect(link).not.toHaveAttribute("title");
    expect(link.getAttribute("aria-label")).toContain("report.pdf");
    expect(link.getAttribute("aria-label")).toContain("2.0 MB");
  });

  it("downloadHref 있으면 <a href download>(뷰)", () => {
    render(<AttachmentChip att={att} downloadHref="/api/attachment/id/a1" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/api/attachment/id/a1");
  });

  it("onRemove 있으면 X 버튼 클릭 시 콜백(작성)", () => {
    const onRemove = vi.fn();
    render(<AttachmentChip att={att} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /삭제/ }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("onRemove 없으면 X 버튼 없음(뷰)", () => {
    render(<AttachmentChip att={att} downloadHref="/x" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
