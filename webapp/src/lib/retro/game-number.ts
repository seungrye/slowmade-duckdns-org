// The game number for netplay (#186).
//
// EmulatorJS enables netplay only when `EJS_gameID` is **a number** - in the source,
// `typeof this.config.gameId !== "number"` turns it straight off. Our game keys are strings shaped like
// `rom:<ObjectId>` and `builtin:<slug>`, so they have to be mapped to a number.
//
// There is one contract - **two PCs must derive the same number for the same game.** That is what puts them in the
// same room. The moment it relies on the clock, randomness or the environment, two people never meet.
//
// So it uses FNV-1a: short, dependency-free, and always the same value for the same input.
// It is not cryptographic - it only separates room numbers, so 32 bits is plenty against collisions.

/** FNV-1a 32-bit. It works per code point, so a Unicode key gives the same value across browsers and runtimes. */
export function gameNumberOf(key: string): number {
  let hash = 0x811c9dc5;
  for (const ch of String(key)) {
    hash ^= ch.codePointAt(0)!;
    // The FNV prime multiply. `Math.imul` reproduces 32-bit overflow exactly.
    hash = Math.imul(hash, 0x01000193);
  }
  // Drop the sign and avoid 0 - EmulatorJS has a spot where `gameId || 1` discards 0, so a 0 could bundle two
  // different games into the same room.
  return (hash >>> 0) + 1;
}
