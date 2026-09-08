// An attachment's MIME -> a Font Awesome (free-solid) file-type icon as inline SVG. No font or CSP needed -
// the FA icon's SVG path data is taken and painted in the type's colour (identical everywhere). The MIME -> type classification
// follows colemanw/9c9a…'s gist (MIME -> FontAwesome file icon).
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faFilePdf, faFileWord, faFileExcel, faFilePowerpoint, faFileZipper,
  faFileImage, faFileAudio, faFileVideo, faFileCode, faFileCsv, faFileLines, faFile,
} from "@fortawesome/free-solid-svg-icons";

export type AttachmentIconSpec = { label: string; color: string; icon: IconDefinition };

/** An uploaded attachment's metadata - for form submission and proxy resolution. key is the MinIO object key (not a public URL). */
export type AttachmentMeta = { id: string; name: string; key: string; size: number; mimeType: string };

/** MIME -> the file-type label, colour and FA icon. Specific types first, then the prefix (image/audio/video/text), unknown = generic. */
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

/** MIME -> the FA file icon as inline SVG (filled in the type's colour). Only the viewBox is set (its own ratio) - CSS sets the display size. */
export function attachmentIconSvg(mime: string | undefined | null): string {
  const { color, icon } = attachmentIconSpec(mime);
  const [w, h, , , pathRaw] = icon.icon;
  const path = Array.isArray(pathRaw) ? pathRaw.join(" ") : pathRaw;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="${color}"><path d="${path}"/></svg>`;
}

/** The SVG as a data URI - handy as an <img src> (inserted into TipTap renderHTML's DOMOutputSpec). */
export function attachmentIconDataUri(mime: string | undefined | null): string {
  return "data:image/svg+xml;utf8," + encodeURIComponent(attachmentIconSvg(mime));
}

/** The padlock SVG (for the public/private toggle). open = unlocked (public) / closed = locked (private). */
export function lockIconSvg(closed: boolean): string {
  const body = closed
    ? `<rect x="4" y="10" width="12" height="9" rx="2" fill="currentColor"/><path d="M6.5 10V7.5a3.5 3.5 0 017 0V10" fill="none" stroke="currentColor" stroke-width="1.8"/>`
    : `<rect x="4" y="10" width="12" height="9" rx="2" fill="currentColor"/><path d="M6.5 10V7.5a3.5 3.5 0 017-0.9" fill="none" stroke="currentColor" stroke-width="1.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 22">${body}</svg>`;
}
