// Named 존 정의 — bevy-rogue 의 OpenPortal 액션이 등록하는 동적 zone 의
// webapp 측 메타 카탈로그. RON 파일 1:1 대응은 없음.

export interface ZoneDef {
  name: string;
  /** 맵 생성기 (bsp / forest / cellular_automata / bsp_indoor / organic_village 등) */
  generator: string;
  description?: string;
}

export interface ZoneDocument extends ZoneDef {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneRevisionDocument {
  _id: string;
  zoneId: string;
  version: number;
  zone: ZoneDef;
  createdAt: string;
}
