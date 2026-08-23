export function relativeTime(at: Date | string, now: Date): string {
  const time = typeof at === "string" ? new Date(at) : at;
  const diffMs = now.getTime() - time.getTime();

  if (diffMs < 60_000) return "방금";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(diffMs / 86_400_000);
  if (days < 7) return `${days}일 전`;

  return time.toISOString().slice(0, 10);
}
