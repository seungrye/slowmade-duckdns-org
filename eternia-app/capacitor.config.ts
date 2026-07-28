import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.slowmade.eternia",
  appName: "에테르니아의 추락",
  webDir: "dist",
  // 첫 마일스톤: 목업 정적 번들만. 오디오/세이브/햅틱 플러그인은 다음 반복.
};

export default config;
