import { active } from "../content/compile.js";
import { DEF_INDEX } from "../content/compile.js";
import { S } from "../core/state.js";
import { CONFIG } from "../core/config.js";
import { hexDistance } from "./model.js";
import { world } from "./world.js";
import { holdings } from "./ownership.js";

// ---------- What a hex IS (the use seam) ----------
// ONE HEX, ONE USE. A hex is BARE -- working the ground it is made of -- or it
// carries exactly one STRUCTURE. There is no third state and no parallel town
// beside the fields (design.md, Building on a Hex).
//
// SIMPLIFIED 2026-08-25 with the hex economy. The slot used to hold either a
// chosen RESOURCE ("wood") or a prefixed structure ref ("build:farm"), because
// a hex could be pointed at any resource its terrain would grudgingly give.
// Terrain decides that now -- a forest makes wood -- so the slot only ever
// holds a structure id, the prefix has nothing to disambiguate from, and
// `S.map.work` became `S.map.built`, which is what it always meant.
//
// A bare hex is not an idle hex: it works its ground automatically. "Rest" is
// gone with the allocation verb that needed it.

export function hexUse(id) {
  const b = (S.map && S.map.built) ? S.map.built[id] : null;
  return b ? { kind: "structure", id: b } : { kind: "bare" };
}

// THE ONLY WRITER of S.map.built. Every path that changes what stands on a hex
// -- raising, demolishing, capture, losing the ground -- comes through here, so
// the render stamp below cannot be forgotten by the next caller. Pass null to
// clear the hex back to bare ground.
//
// `buildVersion` is a render-cache stamp, not game state: it lets ui/map.js ask
// "did anything on the board change?" in O(1) instead of serialising the whole
// map five times a second. It deliberately does NOT ride in the save -- a
// reload rebuilds the stage from nothing, so starting back at zero is correct.
let buildVersion = 0;
export function workStamp() { return buildVersion; }

export function setHexBuild(id, value) {
  if (!S.map || !S.map.built) return;
  if (value == null) delete S.map.built[id];
  else S.map.built[id] = value;
  buildVersion += 1;
}

// WHAT A HEX YIELDS, and the rate it yields it at: `{res, rate}` or null.
//
// CORRECTED 2026-08-25, one day after the seam was built. It originally said a
// structure never produces -- and the very first structure, the farm, produces
// food at a better rate than any bare ground. The rule was wrong, not the farm:
// a structure occupies a hex INSTEAD OF working it, which is not the same as
// yielding nothing. A structure may declare a `yield`, and if it does this is
// where it answers.
//
// The rate lives here too, so callers never have to know that worked ground
// reads the terrain table while a structure carries its own flat number. That
// asymmetry is the whole point of the farm: it is better than the ground it
// stands on, which is why it is worth paying for.
export function hexYield(id) {
  const u = hexUse(id);
  if (u.kind === "structure") {
    const def = structureDef(u.id);
    // A structure with no declared yield produces nothing -- a March-hold and
    // a Market are both exactly that, and it is a legitimate answer rather
    // than a missing one. A structure REPLACES the ground's own yield, which
    // is why raising one costs you whatever the hex was already doing.
    return def && def.yield ? { res: def.yield.res, rate: def.yield.rate } : null;
  }
  // Bare ground works itself. One resource per terrain (2026-08-25): the hex
  // does not choose and cannot be pointed elsewhere.
  return terrainYield(id);
}

// What the GROUND under a hex gives, ignoring anything built on it. Kept
// separate from hexYield so the interface can say "this forest would give
// wood" about country you do not own, and so a structure's description can be
// honest about what it is replacing.
export function terrainYield(id) {
  const terrain = world && world.places[id] ? world.places[id].terrain : null;
  const yields = (active().map && active().map.yields) || {};
  const y = terrain ? yields[terrain] : null;
  return y ? { res: y.res, rate: y.rate } : null;
}

// The structures this era can build. Declared per manifest and inherited, so an
// age that says nothing keeps what it could already raise.
export function structureDef(id) {
  // Active era first, then the cross-era index -- exactly what defById does
  // for everything else. A queued Forge whose era turned over while it was
  // still building must still know its own name.
  return (active().structures || []).find((d) => d.id === id) || DEF_INDEX[id] || null;
}

// Does this hex yield anything into the ledger? Resting ground does not, and
// neither does a structure with nothing to give.
export function hexProduces(id) { return !!hexYield(id); }

// The resource a hex is turned to, or null. The one accessor every producer,
// glyph and panel should ask.
export function hexResource(id) {
  const y = hexYield(id);
  return y ? y.res : null;
}

// THE WALLS THAT COVER THIS HEX. Sums every march-hold within `fortRange`,
// including one standing on the hex itself. Flat strength, added to the army
// rather than scaling it -- see CONFIG.fortStrength.
//
// This is a RESOLUTION input and never a selection one (design.md: selection and
// resolution are separate phases). Nothing here may influence whether a raid
// happens or where it lands; it only changes what happens when one arrives.
export function fortStrength(hexId) {
  if (!S.map || !world || !world.places[hexId]) return 0;
  let n = 0;
  for (const id of holdings()) {
    const u = hexUse(id);
    if (u.kind !== "structure") continue;
    const def = structureDef(u.id);
    if (!def || !def.fortifies) continue;
    const a = world.places[id], b = world.places[hexId];
    if (hexDistance(a.q, a.r, b.q, b.r) <= CONFIG.fortRange) n++;
  }
  return n * CONFIG.fortStrength;
}

// HEALERS COVERING THIS HEX. Same shape as fortStrength, and deliberately so:
// range is how this board says "near", and the two systems that care about
// nearness should say it the same way.
//
// POSITIONAL FROM 2026-08-25 (owner ruling). As a panel building the infirmary
// stacked for no reason except that it could -- three was strictly better than
// one and asked nothing of you. Standing on ground, the second one exists
// because your realm got WIDER, and a corner of it left uncovered is a real
// consequence of a real choice.
//
// This is a RESOLUTION input, never a selection one: it cannot change whether
// sickness happens or where it lands, only what happens when it arrives.
export function healersNear(hexId) {
  if (!S.map || !world || !world.places[hexId]) return 0;
  let n = 0;
  for (const id of holdings()) {
    const u = hexUse(id);
    if (u.kind !== "structure") continue;
    const def = structureDef(u.id);
    if (!def || !def.heals) continue;
    const a = world.places[id], b = world.places[hexId];
    if (hexDistance(a.q, a.r, b.q, b.r) <= CONFIG.healRange) n++;
  }
  return n;
}

// Every structure of this kind standing anywhere in the dominion, with its
// def -- what a converter needs, and what a "do I own one at all?" reveal
// predicate needs. The board is the source of truth: no counter to drift.
export function builtCount(sid) {
  if (!S.map || !S.map.built) return 0;
  let n = 0;
  for (const id of holdings()) if (S.map.built[id] === sid) n++;
  return n;
}

// How many hexes already carry this structure -- the per-copy cost escalator,
// derived rather than stored so it can never drift from the board.
export function structureCount(sid) {
  if (!S.map || !S.map.built) return 0;
  let n = 0;
  for (const id of holdings()) {
    const u = hexUse(id);
    if (u.kind === "structure" && u.id === sid) n++;
  }
  return n;
}
