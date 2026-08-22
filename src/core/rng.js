import { S } from "./state.js";

// ---------- Seeded RNG (phase 2) ----------------------------
// Every die the simulation rolls comes from here. Mulberry32: 32 bits of
// state, one multiply-xorshift round per draw -- not cryptographic, on
// purpose. Small enough to live in the save, fast enough to never matter,
// statistically fine for game dice.
//
// The state advances through S.rngState, so a save/load round-trip resumes
// the exact dice sequence mid-stream, and same seed + same draw order means
// the same run. (Full replay -- seed + tick count + actions = bit-identical
// state -- additionally needs the fixed-tick clock, phase 4: under variable
// dt the number of draws per wall-second varies.) One consequence to know:
// all draws share one stream, so a content change that adds or removes a
// roll shifts every draw after it. Fixtures pin outcomes, not positions.
export function rng() {
  if (override) return override();
  S.rngState = (S.rngState + 0x6D2B79F5) | 0;
  let t = S.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// A fresh seed for a fresh world. crypto, so that src/ rolls no die the
// seed doesn't govern -- the harness enforces that with a source scan.
export function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Test seam, harness only: force the coming draws; null restores the PRNG.
// This replaced forty-odd global monkey-patches when the game stopped
// listening to the global generator.
let override = null;
export function setRngSource(fn) { override = fn; }
