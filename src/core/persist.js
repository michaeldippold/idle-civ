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
  if (active().levy && !S.seen.levyMigrated) {
    S.seen.levyMigrated = true;
    const units = Object.values(S.units).reduce((a, b) => a + b, 0);
    if (units > 0) {
      S.pop = Math.max(1, S.pop - units);
      log("The muster rolls are redrawn — the fighting bands stand apart from the holdfasts that raise them.");
    }
  }
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
export function initAdversaries() {
  for (const adv of active().adversaries) {
    if (!S.adversaries[adv.id]) {
      S.adversaries[adv.id] = { stock: Object.assign({}, adv.stock), standing: 0, walls: adv.walls || 0 };
    } else if (S.adversaries[adv.id].walls === undefined) {
      // Saves from before fortifications existed get their walls raised once.
      S.adversaries[adv.id].walls = adv.walls || 0;
    }
  }
}
