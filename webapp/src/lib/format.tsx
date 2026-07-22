  export function formatNumber(num: number) {
    if (num < 1000) return num.toString();
    if (num < 10000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    if (num < 1_000_000) return Math.floor(num / 1000) + 'k';
    if (num < 1_000_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'b';
  }

  /** 천단위 쉼표 삽입 — ICU/로케일 비의존(서버·클라 동일). 음수·소수 대응. */
  function withCommas(s: string): string {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 금액을 천단위 쉼표 + 통화로 포맷. 서버·클라 공용(순수).
   *  kr → 정수 반올림 + `원` 접미(6,956,825원 · 128,000원). us → 소수 2자리 + `$` 접두($128,000.36).
   *  음수는 부호를 앞에(-1,234원 · -$12.34). */
  export function formatMoney(value: number, market: 'kr' | 'us'): string {
    const neg = value < 0;
    const abs = Math.abs(value);
    if (market === 'us') return (neg ? '-' : '') + '$' + withCommas(abs.toFixed(2));
    return (neg ? '-' : '') + withCommas(Math.round(abs).toString()) + '원';
  }
