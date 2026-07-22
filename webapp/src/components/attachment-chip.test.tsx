// AttachmentChip — 전용 첨부 영역 칩(뷰 다운로드 / 작성 삭제).
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentChip } from "./attachment-chip";

const att = { id: "a1", name: "report.pdf", size: 2 * 1024 * 1024, mimeType: "application/pdf" };

describe("AttachmentChip", () => {
  it("파일명·아이콘 표시", () => {
    render(<AttachmentChip att={att} />);
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    // FA 파일 아이콘(data-uri img)
    expect(document.querySelector("img")).toBeInTheDocument();
  });

  it("downloadHref 있으면 <a href download>(뷰)", () => {
    render(<AttachmentChip att={att} downloadHref="/api/attachment/id/a1" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/api/attachment/id/a1");
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

  it("파일 크기 툴팁(title)에 표기", () => {
    render(<AttachmentChip att={att} downloadHref="/x" />);
    expect(screen.getByRole("link")).toHaveAttribute("title", "report.pdf (2.0 MB)");
  });
});
