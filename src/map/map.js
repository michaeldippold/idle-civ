import { active } from "../content/compile.js";
import { S } from "../core/state.js";
import { log } from "../ui/log.js";
import { generateMap, GEN_VERSION } from "./generate.js";
import { hashStr } from "./model.js";

// ---------- The world, wired to state (map.md §2) -----------
// `world` is runtime geometry, rebuilt from the seed at every load and era
// entry -- never saved. What persists is S.map, and it is tiny: the sub-seed,
// the generator version, the tile noun it was cut for, and the mutable
// per-place facts (today: which tiles are yours). The living remnants that
// already survive era flips (S.adversaries -- stock, standing, walls) are
// keyed by adversary id, not geometry, so they reattach to a rebuilt world
// for free.
export let world = null;

// Idempotent, like initAdversaries(), and called from the same places: boot,
// load, era entry. **The map regenerates when the tile noun changes, and only
// then** (design.md, Scale: The Tile Ladder) -- Bronze inherits Stone's
// clearing so nothing regenerates at that border; Bronze->Iron recuts the
// world at holdfast scale. A GEN_VERSION mismatch also regenerates (dev-time
// reshape, deliberate and visible).
export function ensureMap() {
  const spec = active().map;
  if (!spec) { world = null; return; }   // an era without a map (Stone)

  const noun = spec.tileNoun.singular;
  if (!S.map || S.map.gen !== GEN_VERSION || S.map.tileNoun !== noun) {
    const firstChart = !S.map;
    // The sub-seed folds the noun into the run's seed: one number per run
    // per world-scale, stable across any number of regenerations.
    S.map = {
      seed: (S.seed ^ hashStr(noun)) >>> 0,
      gen: GEN_VERSION,
      tileNoun: noun,
      owned: ["0,0"],
    };
    if (firstChart && !S.seen.mapCharted) {
      S.seen.mapCharted = true;
      log("Your scouts chart the surrounding country. The known world has a shape now.", "good");
    }
  }
  world = generateMap(S.map.seed, spec);
}

export function ownedTiles() { return S.map ? S.map.owned : []; }
export function isOwned(id) { return !!S.map && S.map.owned.includes(id); }

// The seat tile of an adversary, or null -- a query the campaign math will
// want the moment distance becomes a cost (phase 6, M2).
export function seatOf(advId) {
  if (!world) return null;
  for (const id in world.places) if (world.places[id].adversary === advId) return world.places[id];
  return null;
}
