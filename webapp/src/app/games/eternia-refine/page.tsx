// 〈에테르니아: 정제〉 (#419 → #427).
//
// #419 는 침식 규칙을 자체 구현한 판과 web-adventure 엔진을 공유하는 판을 같은 범위로
// 만들어 나란히 비교했다. 결론이 공유로 나서 #427 에서 한 벌만 남겼고, 라우트도 이
// 하나가 됐다(옛 `/shared` 는 삭제).

import type { Metadata } from 'next';
import { GameClient } from './_components/GameClient';

export const metadata: Metadata = {
  title: '에테르니아: 정제',
  description: '침식이 오르면 몸이 결정으로 굳고, 그 결정을 정제소에 팔면 사제단의 연료가 된다.',
};

export default function Page() {
  return <GameClient />;
}
