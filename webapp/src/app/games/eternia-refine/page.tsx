// A안 — 별도 구현 (#419).
//
// 침식 규칙을 자체 구현한 것으로 굴린다. web-adventure 를 참조하지 않는다
// (엔딩 id 만 타입으로 빌린다). B안은 `./shared`.

import type { Metadata } from 'next';
import { OwnGame } from './_components/OwnGame';

export const metadata: Metadata = {
  title: '에테르니아: 정제 — 별도 구현',
  description: '침식 규칙을 자체 구현한 판. 엔진 공유 판(/shared)과 나란히 비교한다.',
};

export default function Page() {
  return <OwnGame />;
}
