// 피드백 노트 워커의 시간 상수.
//
// route.ts 에 두면 Next.js App Router 가 허용하는 export(POST/maxDuration 등) 밖이라
// 타입 검사에 걸린다. 테스트에서 대소 관계를 고정하려면 import 가능한 곳에 있어야 해서 분리.

// 생성 하드 타임아웃. max_tokens=4000 을 2~3 tok/s 로 뽑으면 프리필 포함 ~30분+ 걸릴 수
// 있어 넉넉히 45분(짧으면 EOS 로 훨씬 일찍 끝난다). 이보다 짧으면 긴 노트가 abort→fetch failed.
export const GEN_TIMEOUT_MS = 45 * 60 * 1000;

// stale 은 생성 타임아웃보다 **길어야** 한다. 짧으면 아직 돌고 있는 작업을 "끊겼다"고
// 판단해 다른 틱이 다시 집어가고, 중복 생성 + attempts 소진으로 failed 가 된다.
// (저사양 머신에서 생성이 30분을 넘기며 실제로 이 함정에 빠질 수 있었다.)
export const STALE_MS = GEN_TIMEOUT_MS + 15 * 60 * 1000;
