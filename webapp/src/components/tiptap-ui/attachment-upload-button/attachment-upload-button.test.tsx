// AttachmentUploadButton — 다중 파일 선택(멀티 첨부).
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AttachmentUploadButton } from "./attachment-upload-button";

describe("AttachmentUploadButton 멀티 첨부", () => {
  it("input 에 multiple 속성", () => {
    const { container } = render(<AttachmentUploadButton onPick={() => {}} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);
  });

  it("여러 파일 선택 시 onPick 이 배열로 1회 호출", () => {
    const onPick = vi.fn();
    const { container } = render(<AttachmentUploadButton onPick={onPick} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const f1 = new File(["a"], "a.zip", { type: "application/zip" });
    const f2 = new File(["b"], "b.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [f1, f2] } });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toHaveLength(2);
    expect(input.value).toBe(""); // 같은 파일 재선택 허용
  });

  it("파일 없이 change → onPick 미호출", () => {
    const onPick = vi.fn();
    const { container } = render(<AttachmentUploadButton onPick={onPick} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onPick).not.toHaveBeenCalled();
  });
});
