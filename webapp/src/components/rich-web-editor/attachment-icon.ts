// 첨부 파일 MIME → Font Awesome(free-solid) 파일타입 아이콘을 인라인 SVG 로. 폰트·CSP 불필요 —
// FA 아이콘의 SVG path 데이터를 가져다 타입 색으로 칠해 렌더한다(어디서나 동일). MIME→타입 분류는
// colemanw/9c9a…gist(MIME→FontAwesome 파일아이콘) 분류를 참고.
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faFilePdf, faFileWord, faFileExcel, faFilePowerpoint, faFileZipper,
  faFileImage, faFileAudio, faFileVideo, faFileCode, faFileCsv, faFileLines, faFile,
} from "@fortawesome/free-solid-svg-icons";

export type AttachmentIconSpec = { label: string; color: string; icon: IconDefinition };

/** 업로드된 첨부 메타 — 폼 제출·프록시 해석용. key 는 MinIO 오브젝트 키(공개 URL 아님). */
export type AttachmentMeta = { id: string; name: string; key: string; size: number; mimeType: string };

/** MIME → 파일타입 라벨·색·FA 아이콘. 구체 타입 우선, prefix(image/audio/video/text), 미지=generic. */
export function attachmentIconSpec(mime: string | undefined | null): AttachmentIconSpec {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return { label: "PDF", color: "#e11d48", icon: faFilePdf };
  if (m.includes("hwp")) return { label: "HWP", color: "#0891b2", icon: faFileLines };
  if (m.includes("wordprocessingml") || m === "application/msword" || m.includes("ms-word") || m.includes("opendocument.text")) return { label: "DOC", color: "#2563eb", icon: faFileWord };
  if (m.includes("spreadsheetml") || m.includes("ms-excel") || m.includes("opendocument.spreadsheet")) return { label: "XLS", color: "#16a34a", icon: faFileExcel };
  if (m.includes("presentationml") || m.includes("ms-powerpoint") || m.includes("opendocument.presentation")) return { label: "PPT", color: "#ea580c", icon: faFilePowerpoint };
  if (m.includes("zip") || m.includes("gzip") || m.includes("7z") || m.includes("x-rar") || m.includes("compressed") || m.includes("tar")) return { label: "ZIP", color: "#a16207", icon: faFileZipper };
  if (m === "text/csv") return { label: "CSV", color: "#0d9488", icon: faFileCsv };
  if (m === "text/html" || m === "application/json" || m.includes("xml") || m.includes("javascript") || m === "text/css") return { label: "CODE", color: "#7c3aed", icon: faFileCode };
  if (m.startsWith("image/")) return { label: "IMG", color: "#db2777", icon: faFileImage };
  if (m.startsWith("audio/")) return { label: "AUD", color: "#c026d3", icon: faFileAudio };
  if (m.startsWith("video/")) return { label: "VID", color: "#4f46e5", icon: faFileVideo };
  if (m.startsWith("text/")) return { label: "TXT", color: "#475569", icon: faFileLines };
  return { label: "FILE", color: "#64748b", icon: faFile };
}

/** MIME → FA 파일 아이콘 인라인 SVG(타입 색 채움). viewBox 만 지정(고유 비율) — 표시 크기는 CSS. */
export function attachmentIconSvg(mime: string | undefined | null): string {
  const { color, icon } = attachmentIconSpec(mime);
  const [w, h, , , pathRaw] = icon.icon;
  const path = Array.isArray(pathRaw) ? pathRaw.join(" ") : pathRaw;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="${color}"><path d="${path}"/></svg>`;
}

/** SVG 를 data-URI 로 — <img src> 로 쓰기 좋게(TipTap renderHTML 의 DOMOutputSpec 안에 삽입). */
export function attachmentIconDataUri(mime: string | undefined | null): string {
  return "data:image/svg+xml;utf8," + encodeURIComponent(attachmentIconSvg(mime));
}

/** 자물쇠 SVG(공개/비공개 토글용). open=열린(공개) / closed=닫힌(비공개). */
export function lockIconSvg(closed: boolean): string {
  const body = closed
    ? `<rect x="4" y="10" width="12" height="9" rx="2" fill="currentColor"/><path d="M6.5 10V7.5a3.5 3.5 0 017 0V10" fill="none" stroke="currentColor" stroke-width="1.8"/>`
    : `<rect x="4" y="10" width="12" height="9" rx="2" fill="currentColor"/><path d="M6.5 10V7.5a3.5 3.5 0 017-0.9" fill="none" stroke="currentColor" stroke-width="1.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 22">${body}</svg>`;
}
