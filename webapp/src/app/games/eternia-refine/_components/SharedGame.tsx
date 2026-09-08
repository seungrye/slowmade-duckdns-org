'use client';

// B안의 클라이언트 진입점 (#419).
//
// A안(`OwnGame`)과 다른 것은 아래 import 한 줄뿐이다. 이 판은 web-adventure 의 침식
// 규칙을 쓰므로, CYOA 가 임계값을 바꾸면 따라온다.

import * as sharedRules from '@/lib/eternia-refine/stigma-shared';
import { GameClient } from './GameClient';

export function SharedGame() {
  return (
    <GameClient rules={sharedRules} variant="B안 공유" variantNote="침식 규칙 = web-adventure" />
  );
}
