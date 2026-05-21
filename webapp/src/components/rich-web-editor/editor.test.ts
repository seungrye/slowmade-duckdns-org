import { describe, it, expect } from 'vitest';
import { editorExtensions } from './editor.extensions';

// editorExtensions 배열 — Markdown 포함, 중복 없음 검증
describe('editorExtensions', () => {
    it('Markdown 익스텐션이 포함되어 있다', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).toContain('markdown');
    });

    it('ImageUploadNode 는 포함되지 않는다 (업로드 핸들러가 필요해 컴포넌트에서 주입)', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).not.toContain('imageUploadNode');
    });

    it('익스텐션 이름에 중복이 없다', () => {
        const names = editorExtensions.map(e => e.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });
});
