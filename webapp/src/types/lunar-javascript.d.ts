// The minimal type declarations for lunar-javascript (6tail) - only the parts used for the saju calculation (#390).
// The library ships no types, so they live here. Not all of it - only the methods we call.
declare module "lunar-javascript" {
  /** The BaZi (saju's four pillars) - the four pillars' heavenly stems and earthly branches. */
  interface EightChar {
    getYear(): string;  // For example "丙午"
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getDayGan(): string; // The day stem, for example "戊"
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
