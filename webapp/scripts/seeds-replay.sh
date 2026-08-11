#!/usr/bin/env bash
# scripts/seeds-replay.sh — #289 시드 순서 보장 재실행 (재해 복구).
#
# 각 시드는 *순서 의존* — act1 적치 → patch (NPC/침식/분기/부메랑) 누적.
# 잘못된 순서로 재실행하면 *후속 patch 가 덮어쓰기 됨* (act1 시드가 본문 reset).
#
# 사용 (mongo 초기화 후 또는 전체 재구축 시):
#   MONGO_URI=mongodb://127.0.0.1:27017/handmade-site \
#     ./scripts/seeds-replay.sh
#
# DRY_RUN — 실 mongo 변경 없이 스크립트 순서/이름만 출력:
#   DRY_RUN=1 ./scripts/seeds-replay.sh

set -euo pipefail

if [ -z "${MONGO_URI:-}" ]; then
  echo "✗ MONGO_URI 필요" >&2
  exit 2
fi

cd "$(dirname "$0")/.."

# 1단계 — act1/act23 *초기 적치* (씬 upsert, body / choices 정의).
INITIAL=(
  scripts/seed-kael-act1.mjs
  scripts/seed-rin-act1.mjs
  scripts/seed-solwen-act1.mjs
  scripts/seed-act23-omphalos.mjs
)

# 2단계 — 콘텐츠 patch (body / 분기 추가, onEnter 갱신).
#   순서: 시스템 → 콘텐츠 → 부메랑 → UI 균형
PATCHES=(
  scripts/seed-station-restructure.mjs   # #262 분기 3 제한
  scripts/seed-stigma-items.mjs          # #261 정제수/파편 획득 위치
  scripts/seed-magic-failure-stigma.mjs  # #263 마법 실패 침식
  scripts/seed-env-stigma.mjs            # #264 환경 침식
  scripts/seed-harmony-expand.mjs        # #265 sawOtherProtagonist
  scripts/seed-npc-dialogue.mjs          # #260 act1 NPC 대사 (#258-260 phase)
  scripts/seed-npc-flavor.mjs            # #267 약한 씬 NPC 대사 보강
  scripts/seed-omphalos-cameo.mjs        # #274 omphalos_cameo
  scripts/seed-ending-aftermath.mjs      # #275 ending 본문 후일담
  scripts/seed-world-flag-branches.mjs   # #272 echo_of_harmony / ashen_informant
  scripts/seed-world-flag-matrix.mjs     # #276 4 신규 world flag 매트릭스
  scripts/seed-act1-boomerang.mjs        # #283 act1 부메랑 3 분기
  scripts/seed-npc-names.mjs             # #278 NPC 이름 부여
  scripts/seed-story-flow-balance.mjs    # #284 act1 본문 균형 + Kael 환경 침식
  scripts/seed-failure-bypass.mjs        # #318 RNG 실패 → 우회 씬 (HP/침식 패널티)
  scripts/seed-stat-balance.mjs         # #319 6 스탯 균형 + hasItem 활성화
  scripts/seed-wis-activation.mjs       # #320 wis 활용 + 1
  scripts/seed-ability-branches.mjs     # #321 4 성흔 차별화 분기
  scripts/seed-feather-use.mjs          # #322 인벤 활용 — spirit_beast_feather
  scripts/seed-falling-lunar.mjs        # #323 kael_falling lunar 분기
  scripts/seed-solwen-wis-minstat.mjs   # #324 Solwen wis 7+ minStat
  scripts/seed-selene-branch.mjs        # #325 selene 분기 (solwen_combat_hard)
  scripts/seed-str-climb.mjs            # #326 str 활용 (kael_cargo_container)
  scripts/seed-final-resort.mjs         # #327 orphan 4 씬 정리 (재이용 + 삭제)
  scripts/seed-345-branch-divergence.mjs # #345 6 씬 probability 분기별 다른 흐름 분리
  scripts/seed-349-narrative-strengthening.mjs # #349 시나리오 개연성 보강 (사제단 의식 정체 + 침투 씬)
  scripts/seed-350-narrative-fix.mjs # #350 P0 derail 라벨 + P1 omphalos_caught_at_gate
  scripts/seed-351-callback-partial.mjs # #351 콜백 부분 반영
  scripts/seed-352-body-min-3lines.mjs # #352 비엔딩 body 최소 3문단 보강
  scripts/seed-353-kael-deduction.mjs # #353 카엘 추리 분기
  scripts/seed-354-reroll-boost.mjs # #354 리롤 보상 조정
  # seed-355-enrich-bodies.mjs 제외 — Gemini LLM 보강 "도구"(GEMINI_API_KEY·비결정적).
  # 변환 결과는 mongo 원본에만 존재. 재구축 시 보강 전 본문으로 남는 한계(백업이 원본).
  scripts/seed-356-omphalos-hub.mjs # #356 옴팔로스 허브 확장
  scripts/seed-357-omphalos-flag-propagation.mjs # #357 옴팔로스 flag 전파
  # seed-358-playscript.mjs 제외 — Gemini LLM 희곡체 변환 "도구"(--all/--only 인자 필수).
  # 위와 동일 사유. 재구축 후 필요 시 수동 실행: node scripts/seed-358-playscript.mjs --all
  scripts/seed-360-kael-awakening.mjs # #360 카엘 각성 루트 + 신규 엔딩
  scripts/seed-361-rin-awakening.mjs # #361 린 각성 루트 + 신규 엔딩
  scripts/seed-362-dialogue-format.mjs # #362 서식 일원화 정정 (FORMAT.md)
  scripts/seed-363-classic-tales.mjs # #363 고전 삽화 이벤트 4편 12씬
  # 트리트먼트(집필용 정본) + 문체 변형. 본문(body)을 건드리는 위 patch 들이 모두 끝난
  # 뒤에 얹는다 — 서로 다른 필드라 충돌하지는 않지만, 정본을 마지막에 두는 편이 읽기 쉽다.
  # 확장 씬 10 개 + 그리로 가는 부모 선택지. treatment/variants 를 얹는 seed-354 보다
  # **먼저** 돌아야 한다 — 씬이 없으면 그쪽이 건너뛴다.
  scripts/seed-365-expansion-scenes.mjs # 씬 확장분(성흔 분기 4·회상 2·유대 2·설화 2)
  scripts/seed-366-body-snapshot.mjs # 본문 정본 고정(드리프트 해소 — #91 정정 포함)
  scripts/seed-367-voices.mjs # #73/#87 treatment + variants(tolkien/eco)
)

run_one() {
  local script="$1"
  if [ ! -f "$script" ]; then
    echo "✗ $script 없음" >&2
    return 1
  fi
  echo "── ▶ $script"
  if [ "${DRY_RUN:-}" = "1" ] || [ "${DRY_RUN:-}" = "true" ]; then
    echo "  (DRY_RUN — 실 실행 안 함)"
    return 0
  fi
  node "$script"
}

echo "═════ 1단계: 초기 적치 (${#INITIAL[@]} 씬 정의) ═════"
for s in "${INITIAL[@]}"; do
  run_one "$s"
done

echo
echo "═════ 2단계: 콘텐츠 patch (${#PATCHES[@]} 누적) ═════"
for s in "${PATCHES[@]}"; do
  run_one "$s"
done

echo
echo "═════ ✓ 시드 재실행 완료 — 총 $((${#INITIAL[@]} + ${#PATCHES[@]})) 스크립트 ═════"
echo "검증: pnpm lint:web-adventure:structure"
