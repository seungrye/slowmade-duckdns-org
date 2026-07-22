import { describe, it, expect } from "vitest";
import { attachmentIconSpec, attachmentIconSvg, attachmentIconDataUri, lockIconSvg } from "./attachment-icon";

describe("attachmentIconSpec — MIME → 배지 라벨/색", () => {
  it("주요 타입 매핑", () => {
    expect(attachmentIconSpec("application/pdf").label).toBe("PDF");
    expect(attachmentIconSpec("application/vnd.openxmlformats-officedocument.wordprocessingml.document").label).toBe("DOC");
    expect(attachmentIconSpec("application/msword").label).toBe("DOC");
    expect(attachmentIconSpec("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").label).toBe("XLS");
    expect(attachmentIconSpec("application/vnd.openxmlformats-officedocument.presentationml.presentation").label).toBe("PPT");
    expect(attachmentIconSpec("application/zip").label).toBe("ZIP");
    expect(attachmentIconSpec("image/png").label).toBe("IMG");
    expect(attachmentIconSpec("text/plain").label).toBe("TXT");
    expect(attachmentIconSpec("text/csv").label).toBe("CSV");
    expect(attachmentIconSpec("application/x-hwp").label).toBe("HWP");
  });
  it("미지/빈 타입 → FILE", () => {
    expect(attachmentIconSpec("application/octet-stream").label).toBe("FILE");
    expect(attachmentIconSpec("").label).toBe("FILE");
    expect(attachmentIconSpec(null).label).toBe("FILE");
    expect(attachmentIconSpec(undefined).label).toBe("FILE");
  });
  it("색은 유효한 hex", () => {
    expect(attachmentIconSpec("application/pdf").color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("attachmentIconSvg / dataUri", () => {
  it("SVG 에 라벨 텍스트 포함", () => {
    expect(attachmentIconSvg("application/pdf")).toContain(">PDF<");
    expect(attachmentIconSvg("application/pdf")).toContain("<svg");
  });
  it("dataUri 는 svg+xml", () => {
    expect(attachmentIconDataUri("image/png")).toMatch(/^data:image\/svg\+xml;utf8,/);
  });
});

describe("lockIconSvg — 공개/비공개 자물쇠", () => {
  it("열림/닫힘 모두 svg 반환(서로 다름)", () => {
    const open = lockIconSvg(false);
    const closed = lockIconSvg(true);
    expect(open).toContain("<svg");
    expect(closed).toContain("<svg");
    expect(open).not.toBe(closed);
  });
});
