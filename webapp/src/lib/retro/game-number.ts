// netplay 용 게임 번호 (#186).
//
// EmulatorJS 는 `EJS_gameID` 가 **숫자**일 때만 netplay 를 켠다 — 소스에서
// `typeof this.config.gameId !== "number"` 면 그대로 꺼진다. 우리 게임 키는
// `rom:<ObjectId>` · `builtin:<슬러그>` 형태의 문자열이라 숫자로 옮겨야 한다.
//
// 계약은 하나다 — **두 PC 가 같은 게임에서 같은 수를 뽑아야 한다.** 그래야 같은 방에
// 들어간다. 시각·난수·환경에 기대는 순간 두 사람이 영영 못 만난다.
//
// 그래서 FNV-1a 를 쓴다. 짧고, 의존성이 없고, 같은 입력에 언제나 같은 값이 나온다.
// 암호학적 용도가 아니다 — 방 번호를 가르는 것뿐이라 충돌 위험은 32비트로 충분하다.

/** FNV-1a 32비트. 코드포인트 단위라 유니코드 키도 브라우저·런타임과 무관하게 같은 값이 나온다. */
export function gameNumberOf(key: string): number {
  let hash = 0x811c9dc5;
  for (const ch of String(key)) {
    hash ^= ch.codePointAt(0)!;
    // FNV 소수 곱셈. `Math.imul` 로 32비트 오버플로를 정확히 재현한다.
    hash = Math.imul(hash, 0x01000193);
  }
  // 부호를 떼고 0 을 피한다 — EmulatorJS 가 `gameId || 1` 로 0 을 떨어뜨리는 자리가 있어,
  // 0 이 나오면 서로 다른 게임이 같은 방으로 묶일 수 있다.
  return (hash >>> 0) + 1;
}
