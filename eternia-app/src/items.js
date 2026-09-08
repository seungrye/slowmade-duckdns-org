// The item-use rules - the app's copy (#103).
//
// **The same rules** as USE_ITEM in the web's `webapp/src/lib/web-adventure/engine/reducer.ts`.
// The app is a vanilla JS bundle and shares no code. Changing a rule means changing both -
// out of step, the same item behaves differently on the web and in the app.
//
// The catalogue (items) is not mirrored in the app but received in the `content/v1` response. Adding items needs no new
// APK, and it avoids the drift that double maintenance brings.

import { clampStigma } from "./rules.js";

/** Whether the thing can be used - consumables only (not weapons, keys or quest items). */
export function isUsableItem(item) {
  return !!item && item.kind === "consumable";
}

/** A new array with one value removed. Holding several of the same thing gives up just one. */
function removeFirst(arr, value) {
  const i = arr.indexOf(value);
  if (i < 0) return arr;
  return arr.slice(0, i).concat(arr.slice(i + 1));
}

/**
 * Uses an item. When it cannot be used or is not held, the character given is returned **unchanged**
 * (the same reference). The caller can tell "nothing happened" from `log === null`.
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
