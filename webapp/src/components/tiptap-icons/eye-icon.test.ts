import { describe, it, expect } from 'vitest';
import { EyeIcon } from './eye-icon';

// EyeIcon — React.memo SVG 컴포넌트
describe('EyeIcon', () => {
    it('함수(컴포넌트)로 export 된다', () => {
        expect(typeof EyeIcon).toBe('object'); // React.memo returns object
        expect(EyeIcon).toBeTruthy();
    });

    it('displayName 이 EyeIcon 이다', () => {
        expect(EyeIcon.displayName).toBe('EyeIcon');
    });
});
