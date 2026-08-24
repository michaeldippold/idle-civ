import { active } from "../content/compile.js";
import { S } from "../core/state.js";
import { CONFIG } from "../core/config.js";
import { rng } from "../core/rng.js";
import { log } from "../ui/log.js";
import { generateMap, GEN_VERSION } from "./generate.js";
import { hexDistance } from "./model.js";
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
// load, era entry. **The map is generated once and NEVER regenerates**
// (map.md 2.6, One board, forever). It used to recut whenever the tile noun
// changed; that is retired. Eras re-denominate what a tile IS and change what
// you can see and do on it -- they never rebuild the ground, because ground
// you rebuild is ground you cannot re-dress, and the per-era re-dress is the
// whole visual arc. Only a GEN_VERSION bump regenerates now: a deliberate,
// visible dev-time reshape.
export function ensureMap() {
  const spec = active().map;
  if (!spec) { world = null; return; }   // an era without a map (Stone)

  const noun = spec.tileNoun.singular;
  if (!S.map || S.map.gen !== GEN_VERSION) {
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
      S.seen.needsStartingTrio = true;   // granted below, once the world exists
    }
    if (firstChart && !S.seen.mapCharted) {
      S.seen.mapCharted = true;
      log("Your people mark the ground they stand on. The world is wider than this.", "good");
    }
  }
  world = generateMap(S.map.seed, spec);
  // THE 3-HEX START (owner ruling, 2026-08-23, ratifying the E2 bridge's
  // accident): a fresh run opens with the seat plus two adjacent land hexes,
  // so one hex per resource is possible from the first minute -- the stepper
  // trade-off reborn at hex scale. Deliberately NO terrain-variety guarantee:
  // wanting the forest you didn't get is the claim verb's first motivation.
  if (S.seen.needsStartingTrio) {
    delete S.seen.needsStartingTrio;
    const neighbours = world.places[world.home].adj
      .map((id) => world.places[id])
      .filter((p) => p.terrain !== "water" && !p.adversary && !p.minor)
      .sort((a, b) => (a.r - b.r) || (a.q - b.q));
    for (const p of neighbours.slice(0, 2)) {
      if (!S.map.owned.includes(p.id)) S.map.owned.push(p.id);
    }
  }
  if (!S.map.work) S.map.work = {};     // 6a saves predate assignments
  if (!S.map.minors) S.map.minors = {}; // the minors' living remnants
  // Reconcile the minor remnants, initAdversaries-style: a seat without
  // state gets one seeded from the world def; a CAPTURED seat (owned) needs
  // none -- ownership trumps the minor def on every read.
  for (const id in world.places) {
    const p = world.places[id];
    if (p.minor && !S.map.owned.includes(id) && !S.map.minors[id]) {
      S.map.minors[id] = { walls: p.minor.wallsMax, stock: Object.assign({}, p.minor.stock) };
    }
  }
  syncDominion();
  ensurePop();
  syncCharted();
  if (S.seen.needsDefaultWork) {
    delete S.seen.needsDefaultWork;
    defaultAssignments();
  }
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
  const owned = S.map.owned;
  if (!owned.includes(world.home)) owned.unshift(world.home);
  for (const tid in S.map.work) if (!owned.includes(tid)) delete S.map.work[tid];
  ensurePop();
  syncPopMirror();
}

// S.pop is a MIRROR now (E3): the floored hex sum plus the standing army.
// Everything legacy that still reads S.pop -- reveal gates, the levy cap,
// event scaling, civilians() -- sees the real population, until E5 re-homes
// the army and S.pop can retire outright.
export function syncPopMirror() {
  if (!S.map || !S.map.pop) return;
  let units = 0;
  for (const k in S.units) units += S.units[k] || 0;
  S.pop = hexPopSum() + units;
}

// What the player has SEEN. Sticky and additive, never removed -- the
// interface's reveals-are-sticky law applied to geography. You always see the
// country adjacent to what you hold; reaching beyond that is what the scouting
// verb is for (slice 6). Fog hides the BOARD, never the pieces: an unrevealed
// tile shows as unpainted board, and what it turns out to be is honest ground
// that was always there.
export function syncCharted() {
  if (!world || !S.map) return;
  if (!S.map.revealed) S.map.revealed = [];
  const seen = new Set(S.map.revealed);
  for (const id of S.map.owned) {
    seen.add(id);
    const p = world.places[id];
    if (p) for (const n of p.adj) seen.add(n);
  }
  S.map.revealed = Array.from(seen);
}

export function isCharted(id) {
  return !!S.map && !!S.map.revealed && S.map.revealed.includes(id);
}

// The designed default for the allocation choice (design.md: any choice
// ships with a default). A fresh tile-era dominion arrives with every
// holding turned to FOOD -- every land works it at some rate, and bread is
// the one thing a settlement cannot wait on (the first border crossing at
// 12x starved a live playtest before this existed). The player re-directs
// at leisure; nothing is locked in.
export function defaultAssignments() {
  if (!S.map || !S.map.work) return;
  let assigned = 0;
  for (const tid of S.map.owned) {
    if (!S.map.work[tid]) { S.map.work[tid] = "food"; assigned += 1; }
  }
  return assigned;
}

// ---------- Population lives on hexes (engine rework E1) ----------
// design.md, "Population Lives Somewhere". In E1 this is pure state: it
// grows, saves, and displays, and NOTHING reads it yet -- steppers still run
// the economy, so the curve can be watched and tuned live before anything
// depends on it. Population is a VARIABLE, not a control: no setter is
// exported to the UI, only to the world (growth here; plague/raids/starvation
// write to it in later slices).

// Carrying capacity of a hex: terrain x era. Missing terrain (water) is 0.
export function capOf(id) {
  const spec = active().map;
  if (!spec || !spec.popCaps || !world || !world.places[id]) return 0;
  return spec.popCaps[world.places[id].terrain] || 0;
}

export function hexPop(id) {
  return S.map && S.map.pop ? Math.floor(S.map.pop[id] || 0) : 0;
}

// The odometer: total population is the SUM of real per-hex numbers.
export function hexPopSum() {
  if (!S.map || !S.map.pop) return 0;
  let sum = 0;
  for (const id of S.map.owned) sum += Math.floor(S.map.pop[id] || 0);
  return sum;
}

// Seed population for owned hexes that have none, prune entries for hexes no
// longer owned. Idempotent, like everything else at this layer. The seat
// starts at startPop (the three survivors); any other hex enters the books at
// 2 -- the party that claimed it.
export function ensurePop() {
  if (!S.map || !world) return;
  if (!S.map.pop) S.map.pop = {};
  for (const id of S.map.owned) {
    if (!(id in S.map.pop)) S.map.pop[id] = id === world.home ? CONFIG.startPop : 2;
  }
  for (const id in S.map.pop) if (!S.map.owned.includes(id)) delete S.map.pop[id];
}

// Logistic growth toward each hex's cap: dP/dt = r * P * (1 - P/cap).
// Fractional population is stored; every reader floors for display. Growth
// only -- this function never lowers a number (loss belongs to the world's
// events, in later slices), so a hex above a shrunken cap simply holds.
export function growPopulation(dt) {
  if (!S.map || !S.map.pop || !world) return;
  // No one is born during a famine: growth waits for the larder.
  if (S.res.food <= 0) return;
  const r = CONFIG.popGrowthRate;
  const before = hexPopSum();
  for (const id of S.map.owned) {
    const cap = capOf(id);
    if (cap <= 0) continue;
    let p = S.map.pop[id] || 0;
    // A ghost hex rekindles once the settlement is fed again: land is never
    // lost to famine, only emptied (rule 9), and healing is not migration.
    if (p <= 0) { p = S.map.pop[id] = 0.2; }
    if (p >= cap) continue;
    const next = p + r * p * (1 - p / cap) * dt;
    // The logistic APPROACHES its cap and never attains it; snap the last
    // hundredth so a full hex eventually reads "8 of 8" instead of hovering
    // at 7 forever. (~7 minutes from the far side of the curve at r=0.015.)
    S.map.pop[id] = cap - next < 0.01 ? cap : next;
  }
  const after = hexPopSum();
  if (after !== before) {
    syncPopMirror();
    // The Chronicle keeps its pulse: each whole arrival is told in the era's
    // own words -- but only while the settlement is SMALL. A hundred-soul
    // dominion gaining a person a second would drown the Chronicle in birth
    // announcements.
    if (after > before && after <= 25) log(active().arrivalLine, "good");
  }
}

export function ownedTiles() { return S.map ? S.map.owned : []; }
export function isOwned(id) { return !!S.map && S.map.owned.includes(id); }

// ---------- The world strikes hexes (E5) ----------
// Sickness and raids stopped killing "someone, nowhere" -- they strike a HEX
// and kill people there. The two weightings are the two mitigation tracks:
// sickness is person-weighted (every soul equally at risk, so dense hexes
// host more fevers), raids are exposure-weighted (population x administrative
// distance -- the frontier is where the torches come).
export function strikeHex(kind) {
  if (!S.map || !S.map.pop || !world) return null;
  const weights = [];
  let total = 0;
  for (const id of S.map.owned) {
    const p = Math.floor(S.map.pop[id] || 0);
    if (p < 1) continue;
    const w = kind === "raid" ? p * (1 + adminDistance(id)) : p;
    weights.push([id, w]);
    total += w;
  }
  if (!total) return null;
  let roll = rng() * total;
  for (const [id, w] of weights) {
    if (roll < w) return id;
    roll -= w;
  }
  return weights[weights.length - 1][0];
}

// Kill n people at a hex. Returns how many actually died. Land is never
// lost; the mirror and the reservation books are settled immediately.
export function killAt(id, n) {
  if (!S.map || !S.map.pop || !(id in S.map.pop)) return 0;
  const before = Math.floor(S.map.pop[id]);
  const killed = Math.min(before, Math.max(0, Math.floor(n)));
  S.map.pop[id] = Math.max(0, S.map.pop[id] - killed);
  syncPopMirror();
  return killed;
}

// ---------- Administrative distance & the famine drain (E4) ----------
// Two distances, and conflating them is the trap (map.md 2.7): routeCost()
// below measures from your NEAREST holding (logistics -- how long is the
// march); adminDistance() measures from your SEAT (administration -- how well
// can you hold it). A tendril of hexes is logistically close and
// administratively terrible, which is exactly what the famine drain punishes.
export function adminDistance(targetId) {
  if (!world || !S.map || !world.places[targetId]) return Infinity;
  const stepInto = (id) => {
    if (S.map.owned.includes(id)) return 0.5;
    return world.places[id].terrain === "water" ? 3 : 1;
  };
  const dist = {};
  const queue = [world.home];
  dist[world.home] = 0;
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (dist[queue[i]] < dist[queue[bi]]) bi = i;
    const id = queue.splice(bi, 1)[0];
    if (id === targetId) return dist[id];
    for (const n of world.places[id].adj) {
      const d = dist[id] + stepInto(n);
      if (dist[n] === undefined || d < dist[n]) {
        if (dist[n] === undefined) queue.push(n);
        dist[n] = d;
      }
    }
  }
  return dist[targetId] !== undefined ? dist[targetId] : Infinity;
}

// The famine drain: distance governs EXPOSURE, never efficiency. When the
// larder is empty, unpaid upkeep accumulates, and every `starveCost` worth of
// it kills one person at the peopled hex FURTHEST from the seat -- the empire
// starves from its frontier inward, and dies only when the seat itself
// empties. Land is never lost (dominion never shrinks): an emptied holding
// stays yours, a ghost waiting to be fed again.
let famineAnnounced = false;
export function starveTick(deficit, dt) {
  if (!S.map || !S.map.pop || !world) return false;
  S.map.starve = (S.map.starve || 0) + deficit * dt;
  if (!famineAnnounced) {
    famineAnnounced = true;
    log("Famine. The stores are empty, and the frontier feels it first.", "bad");
  }
  while (S.map.starve >= CONFIG.starveCost) {
    S.map.starve -= CONFIG.starveCost;
    // The victim: the peopled hex with the greatest administrative distance,
    // ties broken by id so the order is deterministic.
    let victim = null, worst = -1;
    for (const id of S.map.owned) {
      if ((S.map.pop[id] || 0) < 1) continue;
      const d = adminDistance(id);
      if (d > worst || (d === worst && victim !== null && id > victim)) { worst = d; victim = id; }
    }
    if (!victim) return true;   // no one left anywhere: the caller ends the run
    S.map.pop[victim] = Math.max(0, S.map.pop[victim] - 1);
    if (S.map.pop[victim] < 1) {
      S.map.pop[victim] = 0;
      if (victim === world.home) { syncPopMirror(); return true; }   // the seat is empty: the caller ends the run
      log(`The ${world.places[victim].terrain} at the frontier lies empty. The ground is still yours.`, "bad");
    }
  }
  syncPopMirror();
  return false;
}

// Famine ends the moment the books balance again; the next one announces anew.
export function endFamine() { famineAnnounced = false; if (S.map) S.map.starve = 0; }

// Effective route cost from your dominion to a tile (the supply-route rule,
// user ruling): multi-source Dijkstra from every owned tile, where marching
// through your OWN country costs half a step, unowned land a full step, and
// water three -- slow crossings, never impossible, so an island seat can't
// deadlock a run. Conquering or settling a line toward a rival is literally
// building a road. Returns Infinity only when there is no map.
export function routeCost(targetId) {
  if (!world || !S.map || !world.places[targetId]) return Infinity;
  const stepInto = (id) => {
    if (S.map.owned.includes(id)) return 0.5;
    return world.places[id].terrain === "water" ? 3 : 1;
  };
  const dist = { };
  const queue = [];
  for (const id of S.map.owned) { dist[id] = 0; queue.push(id); }
  while (queue.length) {
    // Small worlds: a plain scan-for-min is simpler than a heap and fast
    // enough at a few hundred places.
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (dist[queue[i]] < dist[queue[bi]]) bi = i;
    const id = queue.splice(bi, 1)[0];
    if (id === targetId) return dist[id];
    for (const n of world.places[id].adj) {
      const d = dist[id] + stepInto(n);
      if (dist[n] === undefined || d < dist[n]) {
        if (dist[n] === undefined) queue.push(n);
        dist[n] = d;
      }
    }
  }
  return dist[targetId] !== undefined ? dist[targetId] : Infinity;
}

// How route cost bends a campaign: multiplies base march time and the food
// provision. Near targets (or well-roaded ones) march cheap; far ones cost.
// First-guess curve, tuned toward too-hard as always.
export function marchFactor(targetId) {
  const r = routeCost(targetId);
  if (!Number.isFinite(r)) return 1;   // no map (harness fixtures): par
  return Math.min(2, Math.max(0.6, 0.5 + r / 6));
}

// Capture: the tile becomes a holdfast of yours. One place, one rule --
// campaigns (subdue) and the settle verb both end here.
export function captureTile(id, viaSettle) {
  if (!world || !S.map || S.map.owned.includes(id)) return false;
  S.map.owned.push(id);
  delete S.map.minors[id];
  S.pop += 1;
  S.map.work[id] = "food";   // the designed default: bread first
  ensurePop();               // the new holding enters the books with its party
  syncPopMirror();
  syncCharted();              // taking ground shows you what borders it
  return true;
}

// The seat tile of an adversary, or null.
export function seatOf(advId) {
  if (!world) return null;
  for (const id in world.places) if (world.places[id].adversary === advId) return world.places[id];
  return null;
}
