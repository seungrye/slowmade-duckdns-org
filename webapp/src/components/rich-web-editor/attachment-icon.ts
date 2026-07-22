// 첨부 파일 MIME → 작은 SVG 배지(색 + 확장자 라벨). 인라인 첨부 칩·툴바 등에서 공용.
// 순수 함수 — 테스트 가능. 아이콘 폰트 비의존(어디서나 동일 렌더).

export type AttachmentIconSpec = { label: string; color: string };

/** 업로드된 첨부 메타 — 폼 제출·프록시 해석용. key 는 MinIO 오브젝트 키(공개 URL 아님). */
export type AttachmentMeta = { id: string; name: string; key: string; size: number; mimeType: string };

/** MIME 문자열 → 배지 라벨·색. 미지 타입은 FILE. */
export function attachmentIconSpec(mime: string | undefined | null): AttachmentIconSpec {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return { label: "PDF", color: "#e11d48" };
  if (m.includes("hwp")) return { label: "HWP", color: "#0891b2" };
  if (m.includes("wordprocessingml") || m === "application/msword") return { label: "DOC", color: "#2563eb" };
  if (m.includes("spreadsheetml") || m.includes("ms-excel")) return { label: "XLS", color: "#16a34a" };
  if (m.includes("presentationml") || m.includes("ms-powerpoint")) return { label: "PPT", color: "#ea580c" };
  if (m.includes("zip") || m.includes("7z") || m.includes("compressed") || m.includes("x-rar")) return { label: "ZIP", color: "#a16207" };
  if (m.startsWith("image/")) return { label: "IMG", color: "#7c3aed" };
  if (m === "text/csv") return { label: "CSV", color: "#0d9488" };
  if (m.startsWith("text/") || m === "application/json") return { label: "TXT", color: "#475569" };
  return { label: "FILE", color: "#64748b" };
}

/** MIME → 작은 라운드 배지 SVG 마크업(30×16). */
export function attachmentIconSvg(mime: string | undefined | null): string {
  const { label, color } = attachmentIconSpec(mime);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="16" viewBox="0 0 30 16">`
    + `<rect width="30" height="16" rx="3" fill="${color}"/>`
    + `<text x="15" y="12" text-anchor="middle" font-size="9" font-weight="700" font-family="sans-serif" fill="#ffffff">${label}</text>`
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
