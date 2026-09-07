  export function formatNumber(num: number) {
    if (num < 1000) return num.toString();
    if (num < 10000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    if (num < 1_000_000) return Math.floor(num / 1000) + 'k';
    if (num < 1_000_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'b';
  }

  /** Inserts thousands separators - independent of ICU and locale (identical on server and client). Handles negatives and decimals. */
  function withCommas(s: string): string {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Formats an amount with thousands separators and a currency. Shared by server and client (pure).
   *  kr rounds to an integer with a `원` suffix (6,956,825원, 128,000원). us uses 2 decimals with a `$` prefix ($128,000.36).
   *  A negative keeps the sign in front (-1,234원, -$12.34). */
  export function formatMoney(value: number, market: 'kr' | 'us'): string {
    const neg = value < 0;
    const abs = Math.abs(value);
    if (market === 'us') return (neg ? '-' : '') + '$' + withCommas(abs.toFixed(2));
    return (neg ? '-' : '') + withCommas(Math.round(abs).toString()) + '원';
  }
