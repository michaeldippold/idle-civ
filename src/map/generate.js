import { makeRng } from "../core/rng.js";
import { DIRS, pid, hexDistance } from "./model.js";

// ---------- The hex generator (map.md §3-§4) ----------------
// Geometry is regenerated from the seed, never saved: a world is a number.
// The generator draws from its OWN rng stream (makeRng), never the game's --
// rebuilding the map at load must not advance the dice the simulation rolls.
//
// Bump GEN_VERSION whenever generation changes shape: ensureMap() regenerates
// on a version mismatch, which during development is a deliberate, visible
// reshape of existing worlds rather than a silent one. Before any release
// this becomes a compatibility question -- do not discover that then.
export const GEN_VERSION = 1;

// Target share of the map per terrain. Plains is the background; the rest
// grow as blobs onto it, in this order, claiming only unclaimed plains -- so
// every terrain is GUARANTEED its share on every seed. That guarantee is
// load-bearing, not cosmetic: terrain becomes the economy in 6c (hills are
// where iron lives), and a seed that happened to roll two hills tiles would
// strangle a run. (The first cut of this generator used noise + majority
// smoothing; smoothing collapses minorities, and a live map came out 44
// plains / 2 hills / 0 river. Blobs replaced it the same day.)
const BLOB_SHARE = [["water", 0.12], ["forest", 0.22], ["hills", 0.16], ["river", 0.10]];

export function generateMap(seed, spec) {
  const rng = makeRng(seed);
  const R = spec.radius;
  const world = { kind: "hex", tileNoun: spec.tileNoun.singular, home: pid(0, 0), places: {} };

  // The disk, in a fixed order (r, then q) so every rng draw lands on the
  // same tile in every regeneration.
  const order = [];
  for (let r = -R; r <= R; r++) {
    for (let q = -R; q <= R; q++) {
      if (Math.abs(q + r) > R) continue;
      order.push([q, r]);
      world.places[pid(q, r)] = { id: pid(q, r), q, r, adj: [], terrain: null, adversary: null };
    }
  }
  for (const [q, r] of order) {
    const p = world.places[pid(q, r)];
    for (const [dq, dr] of DIRS) {
      const n = pid(q + dq, r + dr);
      if (world.places[n]) p.adj.push(n);
    }
  }

  // Terrain: plains everywhere, then blobs grown onto it. A blob starts on a
  // random unclaimed plains tile (never your seat) and spreads through a
  // shuffled frontier of unclaimed plains neighbours -- coherent country, not
  // confetti (map.md §4 names the failure mode), with every terrain's share
  // structurally guaranteed on every seed.
  for (const [q, r] of order) world.places[pid(q, r)].terrain = "plains";
  const area = order.length;
  const unclaimed = (p) => p.terrain === "plains" && p.id !== world.home;
  for (const [terrain, share] of BLOB_SHARE) {
    let budget = Math.max(3, Math.round(area * share));
    const blobSize = () => 3 + Math.floor(rng() * 4);   // 3..6 tiles per blob
    let guard = 40;
    while (budget > 0 && guard-- > 0) {
      const starts = order.map(([q, r]) => world.places[pid(q, r)]).filter(unclaimed);
      if (!starts.length) break;
      const seed0 = starts[Math.floor(rng() * starts.length)];
      let want = Math.min(blobSize(), budget);
      const frontier = [seed0];
      while (want > 0 && frontier.length) {
        const i = Math.floor(rng() * frontier.length);
        const tile = frontier.splice(i, 1)[0];
        if (!unclaimed(tile)) continue;
        tile.terrain = terrain;
        budget -= 1; want -= 1;
        for (const n of tile.adj) if (unclaimed(world.places[n])) frontier.push(world.places[n]);
      }
    }
  }

  // Your seat is always workable ground (guaranteed above, restated for intent).
  world.places[world.home].terrain = "plains";

  // Adversary seats: land, off your doorstep, spread apart. Constraints relax
  // in steps rather than failing -- a cramped map seats everyone somewhere.
  const seats = spec.seats || [];
  const placed = [];
  for (const advId of seats) {
    let candidates = [];
    for (let minPair = 3; minPair >= 1 && !candidates.length; minPair--) {
      for (let minHome = 2; minHome >= 1 && !candidates.length; minHome--) {
        candidates = order
          .map(([q, r]) => world.places[pid(q, r)])
          .filter((p) => p.terrain !== "water" && !p.adversary && p.id !== world.home)
          .filter((p) => hexDistance(p.q, p.r, 0, 0) >= minHome)
          .filter((p) => placed.every((s) => hexDistance(p.q, p.r, s.q, s.r) >= minPair));
      }
    }
    const seat = candidates[Math.floor(rng() * candidates.length)];
    seat.adversary = advId;
    placed.push(seat);
  }

  return world;
}
