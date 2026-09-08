// B안 — 엔진 공유 (#419).
//
// 침식 규칙을 web-adventure 에서 가져온 것으로 굴린다. CYOA 가 임계값을 바꾸면 이 판이
// 따라온다 — A안(`..`)은 따라오지 않는다.

import type { Metadata } from 'next';
import { SharedGame } from '../_components/SharedGame';

export const metadata: Metadata = {
  title: '에테르니아: 정제 — 엔진 공유',
  description: 'web-adventure 의 침식 규칙을 가져다 쓰는 판. 별도 구현 판과 나란히 비교한다.',
};

export default function Page() {
  return <SharedGame />;
}
