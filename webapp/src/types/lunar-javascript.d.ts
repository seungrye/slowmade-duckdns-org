// lunar-javascript(6tail) 최소 타입 선언 — 사주 계산에 쓰는 부분만 (#390).
// 라이브러리에 타입이 없어 직접 둔다. 전체가 아니라 우리가 부르는 메서드만.
declare module "lunar-javascript" {
  /** 八字(사주팔자) — 네 기둥의 干支. */
  interface EightChar {
    getYear(): string;  // 예: "丙午"
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getDayGan(): string; // 일간 예: "戊"
    getDayZhi(): string;
  }
  interface Lunar {
    getEightChar(): EightChar;
  }
  interface SolarInstance {
    getLunar(): Lunar;
  }
  const Solar: {
    fromYmdHms(
      year: number, month: number, day: number,
      hour: number, minute: number, second: number,
    ): SolarInstance;
  };
  export { Solar };
}
