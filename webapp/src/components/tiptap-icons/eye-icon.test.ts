import { describe, it, expect } from 'vitest';
import { EyeIcon } from './eye-icon';

// EyeIcon - a React.memo SVG component
describe('EyeIcon', () => {
    it('함수(컴포넌트)로 export 된다', () => {
        expect(typeof EyeIcon).toBe('object'); // React.memo returns object
        expect(EyeIcon).toBeTruthy();
    });

    it('displayName 이 EyeIcon 이다', () => {
        expect(EyeIcon.displayName).toBe('EyeIcon');
    });
});
