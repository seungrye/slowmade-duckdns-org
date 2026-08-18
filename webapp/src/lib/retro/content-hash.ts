// netplay 방을 가르는 콘텐츠 키 (#188).
//
// netplay 는 **락스텝 입력 동기화**다 — 버튼 입력에 프레임 번호를 붙여 주고받고, 양쪽이
// 각자 에뮬레이터로 같은 계산을 돌려 같은 결과에 도달한다는 전제로 굴러간다. 그 전제는
// 두 롬의 **바이트가 완전히 같을 때만** 성립한다.
//
// EmulatorJS 는 롬 일치를 전혀 검사하지 않는다(실측). `game_id` 만 같으면 서로 다른 롬으로도
// 방에 붙고, 그 뒤로 **조용히 desync** 난다 — 화면이 서로 달라지는데 오류가 안 뜬다.
// 그래서 방 번호를 **코어가 실제로 읽는 바이트**에 묶는다. 다르면 갈리고, 갈리면 안 만난다.
//
// 이 모듈은 순수하다. 해시 자체는 업로드 때 서버가 떠서 문서에 저장한다.

/** 문서에 저장하는 해시의 모양 — sha256 16진 64자. 빈 값은 "아직 모른다"는 뜻이다. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface ContentParts {
  /** 롬 파일의 sha256. */
  romHash?: string;
  /** 적용 중인 패치의 sha256. 패치를 안 쓰면 비운다. */
  patchHash?: string;
  /**
   * 패치가 걸려 있는지. `patchHash` 가 비었는데 이 값이 참이면 **모르는 상태**라 키를 못 만든다
   * (패치를 쓰는데 해시를 모르면, 안 쓰는 사람과 같은 키가 나와 버린다).
   */
  hasPatch?: boolean;
  /** 아케이드 부모 롬셋들의 sha256. 이것도 코어가 읽는 바이트다. */
  parentHashes?: string[];
}

/**
 * 방을 가르는 표준 문자열. 근거가 부족하면 **null** 을 돌려준다 — 호출측은 그때 netplay
 * 진입을 감춘다. 엉뚱한 방에 붙어 desync 나느니 안 되는 편이 낫다.
 *
 * 부모셋은 정렬해서 넣는다. 올린 순서까지 맞출 이유가 없다.
 */
export function contentKeyOf(parts: ContentParts): string | null {
  const rom = (parts.romHash ?? '').trim().toLowerCase();
  if (!SHA256_HEX.test(rom)) return null;

  const patch = (parts.patchHash ?? '').trim().toLowerCase();
  if (patch && !SHA256_HEX.test(patch)) return null;
  // 패치를 쓰는데 해시를 모르면 "안 쓰는 사람"과 구분이 안 된다 — 그게 가장 위험하다.
  if (parts.hasPatch && !patch) return null;

  const parents = (parts.parentHashes ?? []).map((h) => (h ?? '').trim().toLowerCase());
  if (parents.some((h) => !SHA256_HEX.test(h))) return null;

  // 구분자를 고정한다 — 두 사람이 같은 문자열을 만들어야 같은 방이 된다.
  return ['rom', rom, 'patch', patch, 'sets', [...parents].sort().join(',')].join('|');
}
