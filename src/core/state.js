import { CONFIG } from "./config.js";

// ---------- State -------------------------------------------
export let S;
export let SIM = false;         // true while fast-simulating (suppresses log spam)
export let SIM_STOP = false;    // offline sim halts here instead of killing you
export let SIM_STOP_CAUSE = null;

export function freshState() {
  // State buckets span every era's ids, not just the starting era's -- the
  // active manifest decides which of them the engine actually reads. The
  // schema is deliberately unchanged by the manifest refactor: old saves load
  // as-is.
  return {
    res:   { food: CONFIG.startFood, wood: 0, stone: 0, copper: 0, tin: 0, bronze: 0,
             iron: 0, steel: 0, gold: 0 },
    jobs:  { forager: 0, woodcutter: 0, miner: 0, copperMiner: 0, tinMiner: 0, ironMiner: 0 },
    builds:{ hut: 0, woodshed: 0, granary: 0, stoneYard: 0, dryingRack: 0, lumberCamp: 0, stonePit: 0,
             infirmary: 0, barracks: 0, oreYard: 0, forge: 0, archeryRange: 0, stables: 0,
             ironYard: 0, treasury: 0, musterGround: 0, siegeWorkshop: 0 },
    // Trained person-types owned; separate from builds -- renders in Your People.
    units: { soldier: 0, archer: 0, horseman: 0, siegeEngine: 0 },
    upgrades: {},     // { [upgradeId]: true } -- presence means owned, one-time
    buildQueue: [],   // FIFO: [{ id, kind, uid, total, remaining, cost }, ...] -- only [0] progresses
    buildSeq: 0,
    pop: CONFIG.startPop,
    growth: 0,        // seconds accrued toward the next free settler; freezes while housing is full
    bought: 0,        // lifetime settlers grown -- a stat for the game-over screen
    era: "stone",     // the key into MANIFESTS -- the whole era system is this one string
    eraHistory: {},   // frozen pre-transition snapshots, keyed by the era just left -- see advanceEra()
    // The living remnants of the era's adversaries: { [id]: { stock, standing } }.
    // The manifest entry is the template; this is what actually depletes.
    adversaries: {},
    expeditions: [],  // at most one: { uid, type, adversary, units?, cargo?, total, remaining }
    playtime: 0,      // seconds the simulation has actually advanced -- see step()
    seen: {},
    dead: false,
    lastSeed: Date.now(),
  };
}

// ES-module live bindings are read-only from outside their home module; every
// cross-module reassignment of the mutables above goes through these.
export function setS(v) { S = v; }
export function setSIM(v) { SIM = v; }
export function setSimStop(v, cause) { SIM_STOP = v; SIM_STOP_CAUSE = cause; }

// The two interval handles boot() starts and die() clears. They live here, not
// in main.js, so that no core module ever imports main -- main's body STARTS
// the game on evaluation, and an import edge into it from the sim would run
// boot() mid-link, before the manifests exist.
export let loopId = null, saveId = null;
export function setLoops(l, s) { loopId = l; saveId = s; }
