import { describe, expect, it } from 'vitest';
import { htmlToText, isFromRadioDisabled, isToRadioDisabled } from '../revision-utils';

/**
 * htmlToText: HTML 콘텐츠를 diff 비교용 plain text로 변환한다.
 * 단락 구조(\n\n)는 보존하고, HTML 태그와 엔티티를 제거한다.
 */
describe('htmlToText', () => {
    it('HTML 태그를 제거한다', () => {
        expect(htmlToText('<p>Hello</p>')).toBe('Hello');
        expect(htmlToText('<strong>bold</strong>')).toBe('bold');
    });

    it('</p> 를 빈 줄(\\n\\n)로 변환해 단락 구분을 유지한다', () => {
        expect(htmlToText('<p>First</p><p>Second</p>')).toBe('First\n\nSecond');
    });

    it('<br> 계열 태그를 줄바꿈(\\n)으로 변환한다', () => {
        expect(htmlToText('line1<br>line2')).toBe('line1\nline2');
        expect(htmlToText('line1<br/>line2')).toBe('line1\nline2');
        expect(htmlToText('line1<br />line2')).toBe('line1\nline2');
    });

    it('HTML 엔티티(&amp; &lt; &gt; &nbsp;)를 원래 문자로 디코딩한다', () => {
        expect(htmlToText('a &amp; b')).toBe('a & b');
        expect(htmlToText('&lt;tag&gt;')).toBe('<tag>');
        expect(htmlToText('a&nbsp;b')).toBe('a b');
    });

    it('빈 단락 등으로 생긴 3개 이상 연속 줄바꿈을 2개로 줄인다', () => {
        expect(htmlToText('<p>a</p><p></p><p>b</p>')).toBe('a\n\nb');
    });

    it('앞뒤 공백을 제거한다', () => {
        expect(htmlToText('  <p>hello</p>  ')).toBe('hello');
    });

    it('빈 문자열 입력에 빈 문자열을 반환한다', () => {
        expect(htmlToText('')).toBe('');
    });

    it('중첩 태그를 처리한다', () => {
        expect(htmlToText('<p><strong>bold</strong> and <em>italic</em></p>')).toBe('bold and italic');
    });
});

/**
 * isFromRadioDisabled: "이전" 라디오 버튼 비활성화 여부를 반환한다.
 * "이전"으로 선택한 버전은 반드시 "이후" 버전보다 낮아야 한다.
 */
describe('isFromRadioDisabled', () => {
    it('"이후" 버전이 선택되지 않은 경우 비활성화하지 않는다', () => {
        expect(isFromRadioDisabled(3, null)).toBe(false);
    });

    it('"이후"와 동일한 버전은 비활성화한다', () => {
        expect(isFromRadioDisabled(3, 3)).toBe(true);
    });

    it('"이후"보다 높은 버전(더 최신)은 비활성화한다', () => {
        expect(isFromRadioDisabled(4, 3)).toBe(true);
    });

    it('"이후"보다 낮은 버전(더 과거)은 활성화한다', () => {
        expect(isFromRadioDisabled(2, 3)).toBe(false);
    });
});

/**
 * isToRadioDisabled: "이후" 라디오 버튼 비활성화 여부를 반환한다.
 * "이후"로 선택한 버전은 반드시 "이전" 버전보다 높아야 한다.
 */
describe('isToRadioDisabled', () => {
    it('"이전" 버전이 선택되지 않은 경우 비활성화하지 않는다', () => {
        expect(isToRadioDisabled(2, null)).toBe(false);
    });

    it('"이전"과 동일한 버전은 비활성화한다', () => {
        expect(isToRadioDisabled(2, 2)).toBe(true);
    });

    it('"이전"보다 낮은 버전(더 과거)은 비활성화한다', () => {
        expect(isToRadioDisabled(1, 2)).toBe(true);
    });

    it('"이전"보다 높은 버전(더 최신)은 활성화한다', () => {
        expect(isToRadioDisabled(3, 2)).toBe(false);
    });
});
