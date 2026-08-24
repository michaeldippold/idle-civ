import { active } from "../content/compile.js";
import { CONFIG, TICK_SECONDS } from "./config.js";
import { S, freshState, setS } from "./state.js";
import { log } from "../ui/log.js";

// ---------- Save / load -------------------------------------
// Save is load-bearing (design.md, Time, Presence & Pause): the world stops
// when the player does, so stopping and resuming EXACTLY is a correctness
// requirement, not a convenience. It runs on a 10s interval, after every
// player action (assign, build, cancel, launch), and when the tab is hidden
// or closed. There is no offline catch-up to paper over a stale save.

// hardReset() wipes the save and reloads -- and the reload fires pagehide,
// whose save() would silently re-write the very save being cleared (S is
// still in memory). One flag instead of listener juggling; a reload resets it.
let suppressed = false;
export function suppressSaves() { suppressed = true; }

export function save() {
  if (S.dead || suppressed) return;
  try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(S)); } catch (e) {}
}

export function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(CONFIG.saveKey)); } catch (e) {}
  if (!data) { setS(freshState()); return false; }
  setS(Object.assign(freshState(), data));
  // Merged against freshState() rather than a literal, so a resource or job
  // added later defaults to 0 in old saves without touching this line again.
  S.res = Object.assign(freshState().res, data.res);
  S.jobs = Object.assign(freshState().jobs, data.jobs);
  S.builds = Object.assign(freshState().builds, data.builds);
  S.units = Object.assign(freshState().units, data.units);
  S.upgrades = data.upgrades || {};
  S.seen = data.seen || {};
  S.eraHistory = data.eraHistory || {};
  S.adversaries = data.adversaries || {};
  S.expeditions = Array.isArray(data.expeditions) ? data.expeditions : [];
  S.buildQueue = Array.isArray(data.buildQueue) ? data.buildQueue : [];
  S.map = data.map || null;
  // One-time back-compat (phase 6b): saves from before the levy carried
  // their units INSIDE S.pop. Subtract them out once, narrated. The flag is
  // also set by applyConsolidation, so fresh runs never hit this.
  // (The levy back-compat block died in E5 with the levy itself; saves are
  // disposable during the rework by standing ruling.)

  // Saves from before the tick clock counted seconds in S.playtime. One-time
  // conversion; the old field rides along inert, per the state invariant.
  if (data.tick === undefined && typeof data.playtime === "number") {
    S.tick = Math.floor(data.playtime / TICK_SECONDS);
  }
  return true;
}

// Give every adversary of the ACTIVE era its living state entry if it doesn't
// have one yet -- called at boot and on era entry. Never re-initializes: a
// half-plundered stock stays half-plundered across save/load.
// STOCKS GROW AND REFILL PER AGE, as long as their owners are alive (owner
// ruling, 2026-08-24). A fixed stock makes their economy static while YOURS
// compounds, so a neighbour is looted dry once and then has nothing left to
// offer but nuisance -- "if they only ever have 50 gold you could exhaust
// their gold stock early, and then have no reason to interact with them again
// other than fending them off." Growing-and-refilling is a fake economy that
// behaves like a real one, with no engine to run.
//
// So an era flip re-stocks. Within an age, depletion PERSISTS: plunder a
// larder and it stays plundered, breach a wall and it stays breached. Across
// an age it does not, because an age is centuries -- you burned their
// granary, then eighty years passed and their grandchildren rebuilt it.
//
// STANDING is the exception, and deliberately so: grudges outlive granaries.
// They remember what your people did, however long ago it was.
//
// This also repairs a real regression. Adversaries used to first appear at
// Iron, so their state was seeded with Iron's numbers. Since the roster moved
// to the Stone Age they are first seen there, and seeding-once meant every
// Iron major stood unwalled with a stone-age larder: no gold anywhere, every
// caravan "traded dry" the instant it launched, sieges trivial.
export function initAdversaries() {
  for (const adv of active().adversaries) {
    const st = S.adversaries[adv.id];
    if (!st) {
      S.adversaries[adv.id] = {
        stock: Object.assign({}, adv.stock), standing: 0,
        walls: adv.walls || 0, era: S.era,
      };
    } else if (st.era !== S.era) {
      st.stock = Object.assign({}, adv.stock);   // a new age, a full larder
      st.walls = adv.walls || 0;                 // and the walls rebuilt taller
      st.era = S.era;                            // standing is NOT touched
    } else if (st.walls === undefined) {
      // Saves from before fortifications existed get their walls raised once.
      st.walls = adv.walls || 0;
    }
  }
}
