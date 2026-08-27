import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { rng } from "../core/rng.js";
import { S, me, rivals } from "../core/state.js";
import { armiesOf, armyAt, formArmy } from "./armies.js";
import { claimTile, holdings, ownerOf, world } from "../map/map.js";

// ---------- BOTS: a neighbour becomes a country -----------------------------
// Until this module, a rival was a spawn point with a name: a seat marker on
// the map, a player record with an era clock, and raids that mustered out of
// nowhere. Now they HOLD GROUND -- their seat and a ring around it, claimed in
// the same ownership table the human uses -- they GARRISON their capital with
// a standing army sized by their own era's authoring, and they EXPAND on their
// own slow clock toward their era's dominion cap, exactly the ceiling the
// human answers to.
//
// Symmetry is still the law: their territory is `S.map.owner` entries like
// yours, their garrison is an army like yours, and marching onto their seat
// seals a battle through the same contact rules that defend your ground --
// with their capital's WALLS in the pool, so taking a bronze seat is a siege
// and taking an iron one is a war. What is deliberately NOT simulated: their
// economy. Ground and armies are what the board can show; the ledger behind
// them stays abstract until it can earn its keep.

export function seatOf(civ) {
  if (!world) return null;
  for (const id in world.places) {
    if (world.places[id].adversary === civ.key) return id;
  }
  return null;
}

// The standing garrison a seat deserves, read from the civ's OWN era: the
// adversary def's `strength` is the headcount (5 at Stone, 32 for an Iron
// kingdom -- the scaling is already authored), split toward archers where the
// age can field them, because archers are the ones who shoot from walls.
function garrisonCounts(civ) {
  const def = (active(civ).adversaries || []).find((a) => a.id === civ.key);
  const n = Math.max(2, (def && def.strength) || 4);
  const hasArchers = active(civ).units.some((u) => u.id === "archer");
  if (!hasArchers) return { soldier: n };
  const archers = Math.max(1, Math.floor(n / 3));
  return { soldier: n - archers, archer: archers };
}

// Claim one hex for a civ, respecting everything the human respects: land
// only, unowned only, never a minor's steading and never another power's seat.
function claimable(id, civ) {
  const p = world.places[id];
  if (!p || p.terrain === "water" || p.minor) return false;
  if (p.adversary && p.adversary !== civ.key) return false;
  return ownerOf(id) == null;
}

// ---- Settlement: the country exists ----------------------------------------
// Idempotent and lazy: called every tick from tickBots, it does work only for
// a civ that has not been seated yet (fresh world) or whose garrison has been
// destroyed long enough to muster again. Lazy-on-tick covers boot, load and
// era entry without persist.js ever importing the sim.
function settle(civ) {
  const seat = seatOf(civ);
  if (!seat) return;
  if (ownerOf(seat) == null) {
    claimTile(seat, civ.id);
    civ.seat = seat;
    // The ring: a modest home country, so the border you eventually meet is a
    // border and not a single tile. Land only, and never at anyone's expense.
    let taken = 0;
    for (const n of world.places[seat].adj) {
      if (taken >= CONFIG.botHomeRing) break;
      if (claimable(n, civ)) { claimTile(n, civ.id); taken++; }
    }
  }
  // THE GARRISON. A capital with nobody home is an invitation, so the seat
  // keeps a standing army -- fight-to-the-last, because it is the capital.
  // If it dies in a war, a new one musters after a decent interval: a people
  // recovers, and a window where their seat is takeable is the reward for
  // having beaten the last garrison.
  if (armyAt(seat, civ)) {
    civ.regarrisonT = 0;   // the clock below measures how long the seat has been BARE
  } else {
    if (civ.everGarrisoned && (civ.regarrisonT || 0) < CONFIG.botRegarrisonSeconds) return;
    const counts = garrisonCounts(civ);
    for (const uid in counts) civ.units[uid] = (civ.units[uid] || 0) + counts[uid];
    const army = formArmy(seat, counts, "never", civ);
    if (army) {
      army.intent = "garrison";
      civ.everGarrisoned = true;
      civ.regarrisonT = 0;
    }
  }
}

// ---- Expansion: the country grows ------------------------------------------
// One hex at a time, on a slow clock, up to the civ's OWN era's dominion cap
// -- the same scope law that limits the human. The frontier hex is drawn with
// the game dice from every claimable neighbour of their holdings, so two runs
// of one seed grow the same empire.
function expand(civ, dt) {
  civ.claimT = (civ.claimT || 0) + dt;
  if (civ.claimT < CONFIG.botClaimSeconds) return;
  const cap = (active(civ).map && active(civ).map.dominionCap) || Infinity;
  const held = holdings(civ.id);
  if (held.length >= cap) { civ.claimT = 0; return; }
  const frontier = [];
  for (const id of held) {
    for (const n of world.places[id].adj) {
      if (claimable(n, civ) && !frontier.includes(n)) frontier.push(n);
    }
  }
  if (!frontier.length) { civ.claimT = 0; return; }
  civ.claimT -= CONFIG.botClaimSeconds;
  claimTile(frontier[Math.floor(rng() * frontier.length)], civ.id);
}

// The world tick (core/step.js). Settlement is lazy and idempotent; expansion
// and re-garrisoning accrue real time, so pause holds a country still the way
// it holds everything else.
export function tickBots(dt) {
  if (!world || !S.map) return;
  for (const civ of rivals()) {
    civ.regarrisonT = (civ.regarrisonT || 0) + dt;
    settle(civ);
    expand(civ, dt);
  }
}
