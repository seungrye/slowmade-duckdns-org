// 첨부 파일 MIME → 파일타입 문서 아이콘(작은 인라인 SVG 글리프). 인라인 첨부 칩 등에서 공용.
// 순수 함수 — 테스트 가능. 아이콘 폰트 비의존(어디서나 동일 렌더). MIME→타입 분류는
// colemanw/9c9a12aae16a4bfe2678de86b661d922 gist(MIME→FontAwesome 파일아이콘)의 분류를 참고하되,
// 폰트 대신 원본 문서 글리프 SVG 로 그린다.

export type AttachmentIconSpec = { label: string; color: string };

/** 업로드된 첨부 메타 — 폼 제출·프록시 해석용. key 는 MinIO 오브젝트 키(공개 URL 아님). */
export type AttachmentMeta = { id: string; name: string; key: string; size: number; mimeType: string };

/** MIME 문자열 → 파일타입 라벨·색. 구체 타입 우선, 그다음 prefix(image/audio/video/text), 미지=FILE. */
export function attachmentIconSpec(mime: string | undefined | null): AttachmentIconSpec {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return { label: "PDF", color: "#e11d48" };
  if (m.includes("hwp")) return { label: "HWP", color: "#0891b2" };
  if (m.includes("wordprocessingml") || m === "application/msword" || m.includes("ms-word") || m.includes("opendocument.text")) return { label: "DOC", color: "#2563eb" };
  if (m.includes("spreadsheetml") || m.includes("ms-excel") || m.includes("opendocument.spreadsheet")) return { label: "XLS", color: "#16a34a" };
  if (m.includes("presentationml") || m.includes("ms-powerpoint") || m.includes("opendocument.presentation")) return { label: "PPT", color: "#ea580c" };
  if (m.includes("zip") || m.includes("gzip") || m.includes("7z") || m.includes("x-rar") || m.includes("compressed") || m.includes("tar")) return { label: "ZIP", color: "#a16207" };
  if (m === "text/csv") return { label: "CSV", color: "#0d9488" };
  if (m === "text/html" || m === "application/json" || m.includes("xml") || m.includes("javascript") || m === "text/css") return { label: "<>", color: "#7c3aed" };
  if (m.startsWith("image/")) return { label: "IMG", color: "#db2777" };
  if (m.startsWith("audio/")) return { label: "AUD", color: "#c026d3" };
  if (m.startsWith("video/")) return { label: "VID", color: "#4f46e5" };
  if (m.startsWith("text/")) return { label: "TXT", color: "#475569" };
  return { label: "FILE", color: "#64748b" };
}

/** MIME → 문서형 파일 아이콘 SVG(세로 페이지 + 접힌 모서리 + 타입 색 라벨 밴드). 28×34 viewBox. */
export function attachmentIconSvg(mime: string | undefined | null): string {
  const { label, color } = attachmentIconSpec(mime);
  const fontSize = label.length >= 4 ? 6.5 : 8; // FILE 등 긴 라벨은 작게
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 28 34">`
    + `<path d="M6 2 H17 L23 8 V30 A2 2 0 0 1 21 32 H6 A2 2 0 0 1 4 30 V4 A2 2 0 0 1 6 2 Z" fill="#ffffff" stroke="${color}" stroke-width="1.6"/>`
    + `<path d="M17 2 V8 H23" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<rect x="4" y="20.5" width="19" height="9" rx="1.6" fill="${color}"/>`
    + `<text x="13.5" y="27.3" text-anchor="middle" font-size="${fontSize}" font-weight="700" font-family="sans-serif" fill="#ffffff">${label}</text>`
    + `</svg>`;
}

/** SVG 를 data-URI 로 — <img src> 로 쓰기 좋게(TipTap renderHTML 의 DOMOutputSpec 안에 삽입). */
export function attachmentIconDataUri(mime: string | undefined | null): string {
  return "data:image/svg+xml;utf8," + encodeURIComponent(attachmentIconSvg(mime));
}

/** 자물쇠 SVG(공개/비공개 토글용). open=열린(공개) / closed=닫힌(비공개). */
export function lockIconSvg(closed: boolean): string {
  const body = closed
    // 닫힌 자물쇠
    ? `<rect x="4" y="10" width="12" height="9" rx="2" fill="currentColor"/><path d="M6.5 10V7.5a3.5 3.5 0 017 0V10" fill="none" stroke="currentColor" stroke-width="1.8"/>`
    // 열린 자물쇠 (걸쇠가 열림)
    : `<rect x="4" y="10" width="12" height="9" rx="2" fill="currentColor"/><path d="M6.5 10V7.5a3.5 3.5 0 017-0.9" fill="none" stroke="currentColor" stroke-width="1.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 22">${body}</svg>`;
}
