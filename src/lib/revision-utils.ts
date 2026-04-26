/**
 * HTML 콘텐츠를 diff 비교에 적합한 plain text로 변환한다.
 * 단락 경계(\n\n)는 보존해 prose 구조를 유지한다.
 */
export function htmlToText(html: string): string {
    return html
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * "이전" 라디오 버튼이 비활성화 되어야 하는지 여부를 반환한다.
 * "이전"은 반드시 "이후"보다 낮은 버전이어야 한다.
 */
export function isFromRadioDisabled(revisionVersion: number, toVersion: number | null): boolean {
    if (toVersion === null) return false;
    return revisionVersion >= toVersion;
}

/**
 * "이후" 라디오 버튼이 비활성화 되어야 하는지 여부를 반환한다.
 * "이후"는 반드시 "이전"보다 높은 버전이어야 한다.
 */
export function isToRadioDisabled(revisionVersion: number, fromVersion: number | null): boolean {
    if (fromVersion === null) return false;
    return revisionVersion <= fromVersion;
}
