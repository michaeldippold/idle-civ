import { makeRng } from "../core/rng.js";
import { CONTINENTS, SIGHT_RANGE, continentById, parseFrame } from "./continents.js";
import { DIRS, hash01, hashStr, pid } from "./model.js";

// ---------- The hex generator (map.md §3-§4, §2.6) ----------
// Geometry is regenerated from the seed, never saved: a world is a number
// plus a continent name. The generator draws from its OWN rng streams
// (makeRng), never the game's -- rebuilding the map at load must not advance
// the dice the simulation rolls.
//
// NAMED SUB-STREAMS, not one sequential stream (tech.md). Each stage seeds
// from the run seed plus a stable label, so inserting a new stage later
// cannot shift every downstream draw and silently invalidate every seed ever
// recorded. Adding a river pass must not move the mountains.
//
// Bump GEN_VERSION whenever generation changes shape: ensureMap() regenerates
// on a version mismatch, which during development is a deliberate, visible
// reshape of existing worlds rather than a silent one.
export const GEN_VERSION = 3;   // bumped 2026-08-25: the seat floor guarantee reshapes starts

// Target share of the LAND per terrain. Plains is the background; the rest
// grow as blobs onto it, in this order, claiming only unclaimed plains -- so
// every terrain is GUARANTEED its share on every seed. That guarantee is
// load-bearing, not cosmetic: terrain IS the economy, and a seed that rolled
// two hills would strangle a run. (The first cut used noise + majority
// smoothing; smoothing collapses minorities, and a live map came out 44
// plains / 2 hills / 0 river. Blobs replaced it the same day.)
//
// `water` here is INTERIOR water -- lakes and tarns inside the coastline.
// The ocean around the continent is authored by the frame, not rolled.
const BLOB_SHARE = [["water", 0.05], ["forest", 0.22], ["hills", 0.16], ["river", 0.10]];

// Which continent a run is played on. A player who picked one passes it in;
// a player who rolled Random gets it drawn FROM THE SEED, so a bare seed
// number still reproduces the whole run (map.md §2.6, the picker ruling).
export function pickContinent(seed) {
  const i = hashStr("continent:" + seed) % CONTINENTS.length;
  return CONTINENTS[i].id;
}

export function generateMap(seed, spec, continentId) {
  const cont = continentById(continentId || pickContinent(seed));
  const frame = parseFrame(cont.rows);
  const world = {
    kind: "hex",
    tileNoun: spec.tileNoun.singular,
    continent: cont.id,
    continentName: cont.name,
    home: null,
    places: {},
  };

  // ---- The frame: land and ocean, in frame-local coordinates -------------
  // Ocean is a real place (sight rays travel through it, routes cross it at
  // a price) and is simply never settleable, like any water.
  const localOrder = [];
  const add = (q, r, ocean) => {
    const id = pid(q, r);
    world.places[id] = { id, q, r, adj: [], terrain: ocean ? "water" : null, ocean, adversary: null };
    localOrder.push([q, r]);
  };
  for (const [q, r] of frame.land) add(q, r, false);
  for (const [q, r] of frame.ocean) add(q, r, true);
  linkNeighbours(world, localOrder);

  const landIds = frame.land.map(([q, r]) => pid(q, r));

  // The AUTHORED mainland: the largest run of frame land, computed before a
  // grain of terrain exists. Two things depend on it, and the authoring check
  // found both the hard way -- lakes belong on a continent, not on a two-hex
  // islet (a lake there is nonsense, and worse, it can erase the islet and
  // silently break an island CHAIN), and the seat belongs on the continent
  // rather than marooned offshore.
  const mainIds = new Set(largestFrameLandmass(world, landIds));

  // ---- Terrain: blobs grown onto the land only (own stream) --------------
  const tRng = makeRng(hashStr(seed + ":terrain"));
  for (const id of landIds) world.places[id].terrain = "plains";
  const area = landIds.length;
  const unclaimed = (p) => p && !p.ocean && p.terrain === "plains";
  for (const [terrain, share] of BLOB_SHARE) {
    if (!spec.terrains.includes(terrain)) continue;
    // Interior water is LAKES: mainland only.
    const eligible = terrain === "water" ? landIds.filter((id) => mainIds.has(id)) : landIds;
    let budget = Math.max(3, Math.round(area * share));
    const blobSize = () => 3 + Math.floor(tRng() * 4);   // 3..6 tiles per blob
    let guard = 60;
    while (budget > 0 && guard-- > 0) {
      const starts = eligible.map((id) => world.places[id]).filter(unclaimed);
      if (!starts.length) break;
      const seed0 = starts[Math.floor(tRng() * starts.length)];
      let want = Math.min(blobSize(), budget);
      const frontier = [seed0];
      while (want > 0 && frontier.length) {
        const i = Math.floor(tRng() * frontier.length);
        const tile = frontier.splice(i, 1)[0];
        if (!unclaimed(tile)) continue;
        tile.terrain = terrain;
        budget -= 1; want -= 1;
        for (const n of tile.adj) {
          if (terrain === "water" && !mainIds.has(n)) continue;   // lakes stay ashore
          if (unclaimed(world.places[n])) frontier.push(world.places[n]);
        }
      }
    }
  }

  // ---- The start: workable ground with room around it (own stream) -------
  // Chosen AFTER terrain, so the seat's ground is honest rather than forced,
  // and required to be a food terrain: the opening lesson is forage-or-die,
  // and a hills start would make it forage-and-die-anyway.
  const sRng = makeRng(hashStr(seed + ":start"));
  // The seat belongs on the MAINLAND -- the largest connected landmass. A
  // start marooned on a two-hex islet would make the continent itself an
  // unreachable island, which the authoring check duly reported as an
  // eighty-hex orphan.
  const workable = (id) => {
    const p = world.places[id];
    return p && !p.ocean && mainIds.has(id) &&
      (p.terrain === "plains" || p.terrain === "river");
  };
  const roomy = landIds.filter((id) => {
    if (!workable(id)) return false;
    const room = world.places[id].adj.filter((n) => {
      const q = world.places[n];
      return q && !q.ocean && q.terrain !== "water";
    }).length;
    return room >= 3;   // the trio needs two neighbours, with one to spare
  });

  // THE FLOOR GUARANTEE (2026-08-25, with the hex economy). One resource per
  // terrain makes the map decisive, and a decisive map can strand a seat.
  // Magic calls it mana screw, and it is only unfixable there because the deck
  // is shuffled blind. This dealer is not blind.
  //
  // Two different guarantees, and the harness caught the difference the hard
  // way. HILLS need only be in REACH, because stone is what you claim toward.
  // TIMBER has to be ADJACENT, because the opening trio is drawn from the
  // seat's neighbours and claiming costs wood -- a seat with forest three
  // rings away and none beside it produces no timber at all, can never afford
  // a claim, and deadlocks on a map that looks perfectly friendly.
  //
  // A FLOOR, not equality: one seat gets a single forest at the edge of its
  // ring and another sits in a timber empire, and that difference is the map
  // being interesting. Civ seeds start bias the same way and nobody reads it
  // as rigged. Relaxes rather than fails -- the requirement loosens tier by
  // tier, and a seat somewhere always beats no seat.
  const terrainsWithin = (p, rings) => {
    const found = new Set();
    for (const [q, r] of localOrder) {
      const o = world.places[pid(q, r)];
      if (!o || o.ocean) continue;
      if (hexDist(o, p.q, p.r) <= rings) found.add(o.terrain);
    }
    return found;
  };
  const adjacentTerrains = (p) => {
    const found = new Set();
    for (const n of p.adj) {
      const o = world.places[n];
      if (o && !o.ocean) found.add(o.terrain);
    }
    return found;
  };
  // [timber must be adjacent?, rings the hills may sit within]
  const TIERS = [[true, 2], [true, 3], [false, 2], [false, 3], [false, 99]];
  let candidates = [];
  for (const [timberAdjacent, hillRings] of TIERS) {
    candidates = roomy.filter((id) => {
      const p = world.places[id];
      const woodOK = timberAdjacent
        ? adjacentTerrains(p).has("forest")
        : terrainsWithin(p, hillRings).has("forest");
      return woodOK && terrainsWithin(p, hillRings).has("hills");
    });
    if (candidates.length) break;
  }
  if (!candidates.length) candidates = roomy;
  const startId = candidates.length
    ? candidates[Math.floor(sRng() * candidates.length)]
    : landIds[0];

  // ---- Translate so the start sits at the origin -------------------------
  // Everything downstream (the owner map, adminDistance, the camera) already
  // assumes home is "0,0"; moving the FRAME is cheaper than teaching them all
  // that home moved.
  const origin = world.places[startId];
  const shifted = {};
  const shiftOrder = [];
  for (const [q, r] of localOrder) {
    const src = world.places[pid(q, r)];
    const nq = q - origin.q, nr = r - origin.r;
    const id = pid(nq, nr);
    shifted[id] = { id, q: nq, r: nr, adj: [], terrain: src.terrain, ocean: src.ocean, adversary: null };
    shiftOrder.push([nq, nr]);
  }
  world.places = shifted;
  world.home = pid(0, 0);
  linkNeighbours(world, shiftOrder);

  const order = shiftOrder.filter(([q, r]) => !world.places[pid(q, r)].ocean);

  // ---- Adversary seats: land, off your doorstep, spread apart ------------
  // Seats prefer their OWN GROUND -- the Hill Clans in the high passes, the
  // River Kingdom on the bluffs, the Nomads on the flats -- because every one
  // of them says so in its own description. Preference, not demand: the
  // constraint relaxes to any land rather than leaving a people homeless.
  const aRng = makeRng(hashStr(seed + ":seats"));
  const seats = spec.seats || [];
  const placed = [];
  const seatTerrain = spec.seatTerrain || {};
  for (const advId of seats) {
    const want = seatTerrain[advId];
    let cands = [];
    for (const onHomeGround of want ? [true, false] : [false]) {
      for (let minPair = 4; minPair >= 1 && !cands.length; minPair--) {
        for (let minHome = 3; minHome >= 1 && !cands.length; minHome--) {
          cands = order
            .map(([q, r]) => world.places[pid(q, r)])
            .filter((p) => p.terrain !== "water" && !p.adversary && p.id !== world.home)
            .filter((p) => !onHomeGround || p.terrain === want)
            .filter((p) => hexDist(p, 0, 0) >= minHome)
            .filter((p) => placed.every((s) => hexDist(p, s.q, s.r) >= minPair));
        }
      }
      if (cands.length) break;
    }
    if (!cands.length) continue;
    const seat = cands[Math.floor(aRng() * cands.length)];
    seat.adversary = advId;
    placed.push(seat);
  }

  // ---- The minor tier (own stream) ---------------------------------------
  // The minor tier by DENSITY: every eligible hex rolls for a steading, so a
  // wider country has more neighbours rather than the same five. The roll is
  // a per-hex hash, not a stream draw -- inserting a future generation stage
  // must not change who exists -- while NAMES and stats still come from the
  // hand-authored pool, drawn without replacement. Identity is authored;
  // placement is procedural, exactly as the adversary law has always said.
  if (spec.minors) {
    const mRng = makeRng(hashStr(seed + ":minors"));
    const mn = spec.minors;
    const pool = mn.names.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(mRng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const rollInt = ([lo, hi]) => lo + Math.floor(mRng() * (hi - lo + 1));
    let seated = 0;
    for (const [q, r] of order) {
      if (seated >= pool.length) break;          // never seat a nameless people
      const p = world.places[pid(q, r)];
      if (p.terrain === "water" || p.adversary || p.minor) continue;
      if (p.id === world.home || hexDist(p, 0, 0) < 2) continue;
      // Two steadings never share a border: they read as one settlement.
      if (p.adj.some((n) => world.places[n] && world.places[n].minor)) continue;
      if (hash01(seed + ":minor:" + p.id) >= mn.density) continue;
      const stock = {};
      for (const res in mn.stock) stock[res] = rollInt(mn.stock[res]);
      p.minor = {
        // The era supplies the settlement noun; the pool supplies the place.
        // Same site, same people, different age -- this is the whole re-dress.
        name: (mn.form || "%s").replace("%s", pool[seated]),
        place: pool[seated],
        strength: rollInt(mn.strength),
        wallsMax: rollInt(mn.walls),
        stock,
      };
      seated += 1;
    }
  }

  return world;
}

// The biggest connected run of FRAME land -- the continent proper, judged
// before terrain exists, so lakes and the seat can both be kept on it.
function largestFrameLandmass(world, landIds) {
  const isLand = (id) => {
    const p = world.places[id];
    return p && !p.ocean;
  };
  const seen = new Set();
  let best = [];
  for (const id of landIds) {
    if (!isLand(id) || seen.has(id)) continue;
    const comp = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      for (const n of world.places[cur].adj) {
        if (!seen.has(n) && isLand(n)) { seen.add(n); stack.push(n); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return best;
}

function linkNeighbours(world, order) {
  for (const [q, r] of order) {
    const p = world.places[pid(q, r)];
    p.adj.length = 0;
    for (const [dq, dr] of DIRS) {
      const n = pid(q + dq, r + dr);
      if (world.places[n]) p.adj.push(n);
    }
  }
}

function hexDist(p, q, r) {
  const dq = p.q - q, dr = p.r - r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// ---------- Frame diagnostics: THE ISLAND LAW ----------------------------
// "No land is unreachable by the eye": every island must be within sight
// range of SOME other land -- the mainland, or another island already in the
// chain. An island nobody can ever see is not a promise, it is a secret.
//
// CHAIN-connectivity rather than mainland-adjacency, and the authoring check
// is what found the reason: an archipelago cannot exist under the stricter
// rule, because scattered islands are by definition far from the mainland
// and near EACH OTHER. Chains are also the better fiction -- you stand on the
// shore you just took and see the next one.
//
// This is an AUTHORING check, run by the harness against every continent,
// never a runtime guard: a generator that threw mid-run would turn a content
// mistake into a crash.
export function frameDiagnostics(world) {
  const places = world.places;
  const isLand = (p) => p && !p.ocean && p.terrain !== "water";

  // Land components, flooded through land only.
  const seen = new Set();
  const components = [];
  for (const id in places) {
    if (!isLand(places[id]) || seen.has(id)) continue;
    const comp = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      for (const n of places[cur].adj) {
        if (!seen.has(n) && isLand(places[n])) { seen.add(n); stack.push(n); }
      }
    }
    components.push(comp);
  }

  const mainIdx = components.findIndex((c) => c.includes(world.home));
  const compOf = {};
  components.forEach((c, i) => c.forEach((id) => { compOf[id] = i; }));

  // What each component can SEE: a water-only ray, SIGHT_RANGE steps, stopped
  // by the first land it touches. Exactly the rule the renderer will use.
  const sightEdges = components.map(() => new Set());
  components.forEach((comp, i) => {
    const wdist = {};
    let frontier = [];
    for (const id of comp) {
      for (const n of places[id].adj) {
        if (isLand(places[n])) continue;
        if (wdist[n] === undefined) { wdist[n] = 1; frontier.push(n); }
      }
    }
    while (frontier.length) {
      const next = [];
      for (const id of frontier) {
        for (const n of places[id].adj) {
          if (isLand(places[n])) {
            // Land is seen from ANY water the ray reached, including the
            // last one -- the range limits how far the water carries the
            // ray, not whether its final cell has eyes.
            const j = compOf[n];
            if (j !== undefined && j !== i) sightEdges[i].add(j);
            continue;                              // and land stops the ray
          }
          if (wdist[n] !== undefined) continue;
          if (wdist[id] >= SIGHT_RANGE) continue;  // no further open water
          wdist[n] = wdist[id] + 1;
          next.push(n);
        }
      }
      frontier = next;
    }
  });

  // Can every component be reached from the mainland by chained sight?
  const reached = new Set([mainIdx]);
  const queue = [mainIdx];
  while (queue.length) {
    const i = queue.pop();
    for (const j of sightEdges[i]) if (!reached.has(j)) { reached.add(j); queue.push(j); }
  }

  const islands = components
    .map((comp, i) => ({
      index: i,
      size: comp.length,
      sees: [...sightEdges[i]],
      reachable: reached.has(i),
      tiles: comp,
    }))
    .filter((c) => c.index !== mainIdx);

  return {
    continent: world.continent,
    land: Object.values(places).filter(isLand).length,
    ocean: Object.values(places).filter((p) => !isLand(p)).length,
    mainland: components[mainIdx] ? components[mainIdx].length : 0,
    islands,
    unsightable: islands.filter((c) => !c.reachable),
  };
}
