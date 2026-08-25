import { CONFIG } from "./config.js";
import { newSeed } from "./rng.js";

// ---------- State -------------------------------------------
export let S;

export function freshState() {
  // State buckets span every era's ids, not just the starting era's -- the
  // active manifest decides which of them the engine actually reads. The
  // schema is deliberately unchanged by the manifest refactor: old saves load
  // as-is.
  const seed = newSeed();
  return {
    // The world's number (phase 2): `seed` is the run's permanent identity,
    // shown on the game-over screen and logged at boot; `rngState` is the
    // dice stream's current position, advanced by every rng() draw and
    // carried in the save so a reload resumes the sequence mid-stream.
    seed,
    rngState: seed,
    res:   { food: CONFIG.startFood, wood: 0, stone: 0, copper: 0, tin: 0, bronze: 0,
             iron: 0, steel: 0, gold: 0 },
    // (`jobs` was removed 2026-08-25: the jobs system died in E2 and the bucket
    // rode along in every save for two months. Saves that still carry one keep
    // it -- state is inert, never deleted -- but nothing seeds or reads it.)
    // `hut` stays seeded despite no manifest defining it: Iron's migration list
    // vanishes it, so old saves need the key to land somewhere.
    builds:{ hut: 0, dryingRack: 0, lumberCamp: 0, stonePit: 0,
             infirmary: 0, barracks: 0, forge: 0, archeryRange: 0, stables: 0,
             warCamp: 0, musterGround: 0, siegeWorkshop: 0 },
    // Trained person-types owned; separate from builds -- renders in Your People.
    units: { soldier: 0, archer: 0, horseman: 0, siegeEngine: 0 },
    upgrades: {},     // { [upgradeId]: true } -- presence means owned, one-time
    buildQueue: [],   // FIFO: [{ id, kind, uid, total, remaining, cost }, ...] -- only [0] progresses
    buildSeq: 0,
    pop: CONFIG.startPop,
    // (`growth` was removed 2026-08-25 with the same sweep: the free-settler
    // timer it accrued died in E3. Growth is logistic and per-hex now.)
    bought: 0,        // lifetime arrivals -- the game-over screen's one stat
    // The player's colour on the board (core/palette.js). Chosen on the start
    // screen and fixed for the run by ruling, so nothing writes it after boot.
    // Old saves inherit the default through load()'s merge against freshState.
    //
    // The literal is deliberate: palette.js reads S, so importing DEFAULT_COLOR
    // here would make state and palette a cycle for one string. The harness
    // asserts this equals palette's DEFAULT_COLOR instead, which is the cheaper
    // of the two ways to keep one fact in two files honest.
    playerColor: "purple",
    // What the player calls their capital. Optional by design -- empty means
    // the game's own words ("Your Seat"), which is a perfectly good answer and
    // the reason naming is never a gate on starting a run.
    seatName: "",
    era: "stone",     // the key into MANIFESTS -- the whole era system is this one string
    eraHistory: {},   // frozen pre-transition snapshots, keyed by the era just left -- see advanceEra()
    // The living remnants of the era's adversaries: { [id]: { stock, standing } }.
    // The manifest entry is the template; this is what actually depletes.
    adversaries: {},
    expeditions: [],  // at most one: { uid, type, adversary, units?, cargo?, total, remaining }
    // The persisted half of the map (phase 6a): sub-seed, generator version,
    // the tile noun it was cut for, and which tiles are yours. Geometry is
    // REGENERATED from the seed at load -- a world is a number (map.md §2).
    map: null,
    tick: 0,          // the master clock: fixed TICK_SECONDS slices actually simulated -- see step()
    seen: {},
    dead: false,
  };
}

// ES-module live bindings are read-only from outside their home module; every
// cross-module reassignment of the mutables above goes through these.
export function setS(v) { S = v; }

// The two interval handles boot() starts and die() clears. They live here, not
// in main.js, so that no core module ever imports main -- main's body STARTS
// the game on evaluation, and an import edge into it from the sim would run
// boot() mid-link, before the manifests exist.
export let loopId = null, saveId = null;
export function setLoops(l, s) { loopId = l; saveId = s; }
