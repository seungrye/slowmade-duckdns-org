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
  it("gist 확장 카테고리 — audio/video/code(prefix·구체)", () => {
    expect(attachmentIconSpec("audio/mpeg").label).toBe("AUD");
    expect(attachmentIconSpec("video/mp4").label).toBe("VID");
    expect(attachmentIconSpec("text/html").label).toBe("CODE");   // code (text/* 보다 우선)
    expect(attachmentIconSpec("application/json").label).toBe("CODE");
    expect(attachmentIconSpec("application/gzip").label).toBe("ZIP");
    expect(attachmentIconSpec("application/vnd.oasis.opendocument.text").label).toBe("DOC");
  });
  it("FA 아이콘이 타입별로 지정됨", () => {
    expect(attachmentIconSpec("application/pdf").icon.iconName).toBe("file-pdf");
    expect(attachmentIconSpec("image/png").icon.iconName).toBe("file-image");
    expect(attachmentIconSpec("application/octet-stream").icon.iconName).toBe("file");
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
  it("FA 파일 아이콘 SVG — path + 타입 색, 타입별로 다름", () => {
    const pdf = attachmentIconSvg("application/pdf");
    expect(pdf).toContain("<svg");
    expect(pdf).toContain("<path"); // FA 아이콘 path
    expect(pdf).toContain('fill="#e11d48"'); // PDF 색
    // 타입이 다르면 아이콘(path)도 다르다
    expect(attachmentIconSvg("application/zip")).not.toBe(pdf);
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
