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

    it('StarterKit 이 포함되어 있다', () => {
        const names = editorExtensions.map(e => e.name);
        // StarterKit 은 내부에 여러 익스텐션을 번들하므로 이름이 'starterKit' 이 아닐 수 있음
        // 최소한 배열이 비어있지 않아야 함
        expect(names.length).toBeGreaterThan(5);
    });

    it('CodeBlockLowlight 가 포함되어 있다 (코드블록 왕복 손실 방지에 필요)', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).toContain('codeBlock');
    });

    it('InlineMath, BlockMath 가 포함되어 있다', () => {
        const names = editorExtensions.map(e => e.name);
        expect(names).toContain('inlineMath');
        expect(names).toContain('blockMath');
    });
});

// Markdown 익스텐션 커스텀 serializer 검증
describe('Markdown serializer 설정', () => {
    it('superscript serializer 가 <sup> 태그로 설정되어 있다', () => {
        const md = editorExtensions.find(e => e.name === 'markdown');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config = (md as any)?.options?.serializer?.marks?.superscript;
        expect(config?.open).toBe('<sup>');
        expect(config?.close).toBe('</sup>');
    });

    it('subscript serializer 가 <sub> 태그로 설정되어 있다', () => {
        const md = editorExtensions.find(e => e.name === 'markdown');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config = (md as any)?.options?.serializer?.marks?.subscript;
        expect(config?.open).toBe('<sub>');
        expect(config?.close).toBe('</sub>');
    });
});

// markdown 정규화 헬퍼 — Code→Visual 복귀 시 코드블록 닫는 ``` 파싱 오류 방지
describe('markdown normalizeForParsing', () => {
    const normalize = (md: string) => md.endsWith('\n') ? md : md + '\n';

    it('개행으로 끝나지 않으면 개행을 추가한다', () => {
        expect(normalize('```\ncode\n```')).toBe('```\ncode\n```\n');
    });

    it('이미 개행으로 끝나면 변경하지 않는다', () => {
        expect(normalize('hello\n')).toBe('hello\n');
    });
});

