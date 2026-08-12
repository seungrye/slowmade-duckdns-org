// 아이템 사용 규칙 — 앱판 (#103).
//
// 웹 `webapp/src/lib/web-adventure/engine/reducer.ts` 의 USE_ITEM 과 **같은 규칙**이다.
// 앱은 vanilla JS 번들이라 코드를 공유하지 않는다. 규칙을 바꿀 때는 양쪽을 함께 고쳐야 한다 —
// 어긋나면 같은 아이템이 웹과 앱에서 다르게 동작한다.
//
// 카탈로그(items)는 앱에 미러하지 않고 `content/v1` 응답으로 받는다. 아이템을 늘려도 APK 를
// 다시 만들 필요가 없고, 이중 관리로 어긋나는 사고를 피할 수 있다.

import { clampStigma } from "./rules.js";

/** 쓸 수 있는 물건인가 — 소모품만 쓴다(무기·열쇠·퀘스트 아이템은 아니다). */
export function isUsableItem(item) {
  return !!item && item.kind === "consumable";
}

/** 배열에서 값 하나만 지운 새 배열. 같은 물건을 여럿 가졌으면 하나만 준다. */
function removeFirst(arr, value) {
  const i = arr.indexOf(value);
  if (i < 0) return arr;
  return arr.slice(0, i).concat(arr.slice(i + 1));
}

/**
 * 아이템을 쓴다. 쓸 수 없거나 갖고 있지 않으면 **아무것도 바꾸지 않고** 받은 캐릭터를
 * 그대로 돌려준다(참조 동일). 호출측은 `log === null` 로 "아무 일 없었음" 을 알 수 있다.
 *
 * @returns {{character: object, log: string|null}}
 */
export function applyItemUse(character, item) {
  if (!isUsableItem(item)) return { character, log: null };
  if (!character || !Array.isArray(character.inventory)) return { character, log: null };
  if (character.inventory.indexOf(item.id) < 0) return { character, log: null };

  const heal = item.heal || 0;
  const stigmaDelta = item.stigmaDelta || 0;

  const next = Object.assign({}, character, {
    hp: Math.min(character.maxHp, character.hp + heal),
    inventory: removeFirst(character.inventory, item.id),
  });
  if (stigmaDelta) next.stigmaErosion = clampStigma(character.stigmaErosion, stigmaDelta);

  const parts = [];
  if (heal > 0) parts.push("+" + heal + " HP");
  if (stigmaDelta !== 0) parts.push("침식 " + (stigmaDelta > 0 ? "+" : "") + stigmaDelta);
  const log = "사용: " + (item.displayName || item.id) + (parts.length ? " (" + parts.join(", ") + ")" : "");

  return { character: next, log };
}
