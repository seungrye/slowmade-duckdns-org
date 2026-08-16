// 〈에테르니아의 추락〉 작성 도구 — 작성자 전용 (#179).
//
// 침투 테스트에서 이 아래 화면들(씬 편집기·그래프·리비전·피드백 노트·상태)이 **누구에게나
// 열려 있었다**. 게임 본문 자체는 어차피 공개지만(`/api/web-adventure/content/v1` 이 앱에
// 내려준다), 작성 도구는 다르다 — 리비전 이력, 아직 다듬는 중인 문장, 회차 피드백 노트처럼
// 완성본에는 없는 것들이 그대로 보인다.
//
// 레이아웃 한 곳에서 막는 이유: 화면이 일곱이라 페이지마다 넣으면 새로 만들 때 빠뜨린다.
// 여기 두면 `/scenes` 아래로 들어오는 모든 경로가 자동으로 덮인다.
//
// `notFound()` 를 쓴다 — 401 은 "그 주소는 있다"는 정보가 된다. 미들웨어도 세션 쿠키가
// 아예 없으면 여기 닿기 전에 404 로 끊는다(빠른 1차 가드).
import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';

export default async function ScenesLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  return <>{children}</>;
}
