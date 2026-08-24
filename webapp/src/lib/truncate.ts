export function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  const normalized = text.replace(/\r?\n/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}
