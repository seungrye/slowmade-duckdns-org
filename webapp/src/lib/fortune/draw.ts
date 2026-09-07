/**
 * The daily tarot draw - pure and deterministic (#388).
 *
 * The card and its orientation come from `hash(email + dateKey)`. **Determinism is the point**:
 *  - the same card appears whether the nightly batch failed or lazy generation ran first.
 *  - DailyFortune stores it, but today's card can be reproduced from this function alone, with nothing stored.
 *
 * That is why Math.random is not used - the same person on the same day must get the same answer however often they ask.
 */
import { DECK_SIZE, type Orientation } from "./tarot-deck";

export interface DailyDraw {
  cardId: number;
  orientation: Orientation;
}

/** FNV-1a 32-bit - a short, evenly distributed non-cryptographic hash. It reproduces a seed and is not for security. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // a 32-bit multiply (>>> 0 keeps it unsigned)
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function drawDailyCard(email: string, dateKey: string): DailyDraw {
  const seed = fnv1a(`${email.trim().toLowerCase()}|${dateKey}`);
  const cardId = seed % DECK_SIZE;
  // Different bits pick the card and the orientation - drawing both from one value would correlate them.
  const orientation: Orientation = fnv1a(`${dateKey}|${email}|rev`) % 2 === 0 ? "up" : "rev";
  return { cardId, orientation };
}
