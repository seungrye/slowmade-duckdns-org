'use client';

// A안의 클라이언트 진입점 (#419).
//
// 규칙 모듈은 함수 묶음이라 서버 컴포넌트에서 prop 으로 넘길 수 없다(직렬화 불가).
// 그래서 각 라우트가 이런 얇은 클라이언트 파일에서 자기 규칙을 고른다 — 여전히
// **두 판의 차이는 이 import 한 줄**이다.

import * as ownRules from '@/lib/eternia-refine/stigma';
import { GameClient } from './GameClient';

export function OwnGame() {
  return <GameClient rules={ownRules} variant="A안 별도" variantNote="침식 규칙 자체 구현" />;
}
