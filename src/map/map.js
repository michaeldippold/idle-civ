import { active } from "../content/compile.js";
import { S, me } from "../core/state.js";
import { chronicle } from "../core/bus.js";
import { CONTINENTS } from "./continents.js";
import { generateMap, GEN_VERSION, pickContinent } from "./generate.js";
import { hashStr } from "./model.js";
import { world, setWorld, pickedContinent } from "./world.js";
import { claimTile, holdCount, holdings, isOwned, ownerOf, releaseTile } from "./ownership.js";
import { setHexBuild, structureDef, terrainYield } from "./structures.js";
import { ensurePop, fillStartingGround, hexPop, syncPopMirror } from "./population.js";
import { syncCharted } from "./fog.js";

// ---------- The map package, and what this file is now ----------
// SPLIT 2026-08-26 (review Part VII). This file was 917 lines and a third of
// the simulation wearing a map module's name: fog, population growth, famine,
// upkeep pricing, pathfinding, combat targeting, structures and capture all
// lived here, every one of them per-player logic a bot must run.
//
// It is the LIFECYCLE and the HUB now -- it builds the world, keeps the
// dominion honest, and re-exports the package so nothing outside had to learn
// the new shape. The seams the split follows are the ones the sections already
// named:
//
//   world.js       the runtime geometry binding -- the leaf everything reads
//   ownership.js   who holds what, keyed by tile
//   fog.js         charted vs sighted, per civ
//   structures.js  what a hex IS and what it yields
//   population.js  people on the land, growth, famine, and who a blow lands on
//   routes.js      the two distances, and never the same one
//
// Import order below IS the dependency order, and it is acyclic on purpose:
// world.js imports nothing of ours, and nothing imports this file back.

// Re-exported so every existing `from "../map/map.js"` keeps working. The
// package is the unit; which file a function sits in is an implementation
// detail of the package, not of its callers.
export { world, setPickedContinent } from "./world.js";
export { claimTile, holdCount, holdings, isOwned, ownerMap, ownerOf, releaseTile } from "./ownership.js";
export { chartGround, isCharted, isSighted, isVisible, revealAll, setRevealAll, syncCharted, syncSighted } from "./fog.js";
export {
  builtCount, healersNear, hexProduces, hexResource, hexUse, hexYield,
  setHexBuild, structureCount, structureDef, terrainYield, workStamp,
} from "./structures.js";
export {
  capOf, endFamine, ensurePop, fillStartingGround, growPopulation, growthSpendOf,
  hexPop, hexPopSum, killAt, loseHexIfEmpty, starveTick, strikeHex, syncPopMirror,
  upkeepMouths,
} from "./population.js";
export { adminDistance, marchFactor, pathBetween, routeCost } from "./routes.js";

// Idempotent, like initAdversaries(), and called from the same places: boot,
// load, era entry. **The map is generated once and NEVER regenerates**
// (map.md 2.6, One board, forever). It used to recut whenever the tile noun
// changed; that is retired. Eras re-denominate what a tile IS and change what
// you can see and do on it -- they never rebuild the ground, because ground
// you rebuild is ground you cannot re-dress, and the per-era re-dress is the
// whole visual arc. Only a GEN_VERSION bump regenerates now: a deliberate,
// visible dev-time reshape.
// `?continent=broadwater` forces a continent, the QA affordance standing in
// for slice 5's picker: testing a shape should not mean rolling New Game
// until the seed happens to offer it. Sits beside ?map=2d, ?glcheck=1.
function forcedContinent() {
  try {
    const want = new URLSearchParams(location.search).get("continent");
    return want && CONTINENTS.some((c) => c.id === want) ? want : null;
  } catch (e) { return null; }
}

export function ensureMap() {
  const spec = active().map;
  if (!spec) { setWorld(null); return; }   // an era without a map (Stone)

  const noun = spec.tileNoun.singular;
  if (!S.map || S.map.gen !== GEN_VERSION) {
    const firstChart = !S.map;
    // The sub-seed folds the noun into the run's seed: one number per run
    // per world-scale, stable across any number of regenerations.
    S.map = {
      seed: (S.seed ^ hashStr(noun)) >>> 0,
      gen: GEN_VERSION,
      tileNoun: noun,
      // WHICH continent this run is played on. Drawn from the run seed, so a
      // bare seed number still reproduces the whole world; slice 5's picker
      // will write a chosen one here instead (map.md 2.6).
      // Order matters: the URL is a QA OVERRIDE and outranks everything, then
      // the player's pick, then the seed (which is what "Random" means).
      continent: S.map && S.map.continent ? S.map.continent
        : forcedContinent() || pickedContinent() || pickContinent(S.seed),
      // WHO HOLDS WHAT, keyed by tile. The seat is claimed here so it is the
      // first ground this civ ever held, which is also what makes the trio
      // read seat-then-neighbours. (This was `owned: ["0,0"]` -- an array on
      // the one player -- until 2026-08-26.)
      owner: { "0,0": S.me },
    };
    if (firstChart && !S.seen.mapCharted) {
      S.seen.needsStartingTrio = true;   // granted below, once the world exists
    }
    if (firstChart && !S.seen.mapCharted) {
      S.seen.mapCharted = true;
      chronicle("Your people mark the ground they stand on. The world is wider than this.", "good");
    }
  }
  setWorld(generateMap(S.map.seed, spec, S.map.continent));
  // THE 3-HEX START (owner ruling, 2026-08-23, ratifying the E2 bridge's
  // accident): a fresh run opens with the seat plus two adjacent land hexes.
  //
  // VARIETY IS NOW GUARANTEED (2026-08-25), and the note that used to stand
  // here -- "deliberately NO terrain-variety guarantee: wanting the forest you
  // didn't get is the claim verb's first motivation" -- was correct only while
  // a hex could be pointed at any resource. Under one-resource-per-terrain an
  // all-river trio yields food and nothing else, and claiming costs wood: the
  // opening deadlocks on a map that looks perfectly friendly. So the two
  // neighbours are chosen to widen what you produce, ties broken by the old
  // stable order so a seed still reproduces exactly.
  if (S.seen.needsStartingTrio) {
    delete S.seen.needsStartingTrio;
    const neighbours = world.places[world.home].adj
      .map((id) => world.places[id])
      .filter((p) => p.terrain !== "water" && !p.adversary && !p.minor)
      .sort((a, b) => (a.r - b.r) || (a.q - b.q));
    const seatRes = (terrainYield(world.home) || {}).res;
    const taken = new Set([seatRes]);
    const chosen = [];
    // First pass: anything that broadens the economy. Second: fill from what
    // is left, in the same stable order.
    for (const p of neighbours) {
      if (chosen.length >= 2) break;
      const res = (terrainYield(p.id) || {}).res;
      if (res && !taken.has(res)) { taken.add(res); chosen.push(p); }
    }
    for (const p of neighbours) {
      if (chosen.length >= 2) break;
      if (!chosen.includes(p)) chosen.push(p);
    }
    for (const p of chosen) {
      if (!isOwned(p.id)) claimTile(p.id);
    }
    S.seen.fillStartingGround = true;   // granted below, once pop exists
  }
  if (!S.map.built) S.map.built = {};   // what stands on each hex, if anything
  if (!S.map.minors) S.map.minors = {}; // the minors' living remnants
  // Reconcile the minor remnants, initAdversaries-style: a seat without state
  // gets one seeded from the world def; a CAPTURED seat (owned) needs none --
  // ownership trumps the minor def on every read. And an age that has turned
  // re-stocks it, on exactly the terms initAdversaries spells out: larders
  // refill and walls rebuild across an era, never within one.
  //
  // `p.minor` is already era-correct without any work here, because the world
  // is regenerated from the CURRENT era's spec on every ensureMap -- the roll
  // ranges climb by age, so the same steading is simply richer than it was.
  for (const id in world.places) {
    const p = world.places[id];
    if (!p.minor || isOwned(id)) continue;
    const st = S.map.minors[id];
    if (!st || st.era !== me().era) {
      S.map.minors[id] = {
        walls: p.minor.wallsMax,
        stock: Object.assign({}, p.minor.stock),
        era: me().era,
      };
    }
  }
  syncDominion();
  ensurePop();
  if (S.seen.fillStartingGround) {
    delete S.seen.fillStartingGround;
    fillStartingGround();
    syncPopMirror();
  }
  syncCharted();
  // (A `S.seen.needsDefaultWork` gate stood here reading a flag NOTHING ever
  // set -- the border bread-default that set it died in E5. Removed
  // 2026-08-25; defaultAssignments() survives as a callable verb, since new
  // ground defaults to food at capture and the sweep is still the right
  // answer if a hex is ever left unassigned.)
}

// The pop-tiles LOCKSTEP died in E3 (it was the E2 bridge, and its runaway
// was live-confirmed: huts handed out provinces until the whole world was
// free real estate). Dominion now changes ONLY by claim, capture and fealty.
// What survives here is hygiene: the seat is always owned, lost work entries
// are pruned, the books get seeded, and the pop mirror is refreshed.
// **Dominion never shrinks** (owner ruling, 2026-08-22) still stands -- there
// is simply no machinery left that could shrink it.
export function syncDominion() {
  if (!world || !S.map) return;
  if (!isOwned(world.home)) claimTile(world.home);
  // The human sits where the generator translated the frame to. Every other
  // civ will be seated at the place the generator already gave it.
  if (!me().seat) me().seat = world.home;
  for (const tid in S.map.built) if (!isOwned(tid)) setHexBuild(tid, null);
  ensurePop();
  syncPopMirror();
}

// The era's scope (owner ruling, 2026-08-24): how many lands this age can
// hold, counting parties already on the road. No cost curve can brake what
// compounding production funds; the cap shuts the door outright, and the
// tech tree may later sell administrative capacity against it.
export function dominionCap(civ) {
  return (active(civ).map && active(civ).map.dominionCap) || Infinity;
}
export function holdsUsed(civ) {
  const who = civ || me();
  if (!S.map) return 0;
  return holdCount(who.id) + who.buildQueue.filter((q) => q.kind === "settle").length;
}
export function atDominionCap(civ) {
  return holdsUsed(civ) >= dominionCap(civ);
}

export function ownedTiles() { return holdings(); }
// (The second isOwned() that lived here -- an includes() over the owner's own
// array -- was replaced by the ownership seam above on 2026-08-26.)

// Capture: the tile becomes a holdfast of yours. One place, one rule --
// campaigns (subdue) and the settle verb both end here.
export function captureTile(id, viaSettle, civ) {
  const who = civ || me();
  if (!world || !S.map || ownerOf(id) != null) return false;
  claimTile(id, who.id);
  delete S.map.minors[id];
  // New ground arrives BARE and starts working its own terrain at once --
  // no default to choose and nothing to forget to set.
  ensurePop(who.id);         // the new holding enters the books with its party
  syncPopMirror(who);        // pop is a MIRROR: recomputed here, never bumped
                             // by hand (a stray += 1 lived on this line until
                             // 2026-08-25, dead but misleading).
  syncCharted(who);           // taking ground shows you what borders it
  return true;
}

// The seat tile of an adversary, or null.
export function seatOf(advId) {
  if (!world) return null;
  for (const id in world.places) if (world.places[id].adversary === advId) return world.places[id];
  return null;
}
