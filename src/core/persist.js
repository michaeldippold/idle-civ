import { active } from "../content/compile.js";
import { CONFIG } from "./config.js";
import { S, SIM_STOP, SIM_STOP_CAUSE, freshState, setS, setSIM, setSimStop } from "./state.js";
import { step } from "./step.js";
import { log } from "../ui/log.js";

// ---------- Save / load / offline ---------------------------
export function save() {
  if (S.dead) return;
  S.lastSeed = Date.now();
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

export function simulateOffline() {
  const elapsed = (Date.now() - (S.lastSeed || Date.now())) / 1000;
  const capped = Math.min(elapsed, CONFIG.offlineCapHours * 3600);
  if (capped < 5) return;

  const before = { ...S.res, pop: S.pop };
  const eraBefore = S.era;
  setSIM(true); setSimStop(false, null);
  let t = capped;
  while (t > 0 && !SIM_STOP) { const dt = Math.min(1, t); step(dt); t -= dt; }
  setSIM(false);

  const g = {
    food: Math.floor(S.res.food - before.food),
    wood: Math.floor(S.res.wood - before.wood),
    stone: Math.floor(S.res.stone - before.stone),
    pop: S.pop - before.pop,
  };
  const parts = [];
  if (g.food > 0) parts.push(`${g.food} food`);
  if (g.wood > 0) parts.push(`${g.wood} wood`);
  if (g.stone > 0) parts.push(`${g.stone} stone`);
  if (g.pop > 0) parts.push(`${g.pop} new ${g.pop > 1 ? active().popNoun.plural : active().popNoun.singular}`);
  else if (g.pop < 0) parts.push(`${-g.pop} lost while you were away`);
  const mins = Math.floor(capped / 60);
  if (SIM_STOP) {
    const msg = SIM_STOP_CAUSE === "conflict"
      ? "You return to find the settlement overrun — there was nothing left to defend."
      : "You return to find the stores emptied — your people barely hung on.";
    log(msg, "bad");
  } else if (parts.length) {
    log(`While you were away (${mins}m): ${parts.join(", ")}.`, "good");
  }
  // An era can flip mid-catch-up; advanceEra() stays silent under SIM, so the
  // milestone gets announced here instead of passing without comment.
  if (S.era !== eraBefore) {
    log(`You return to a changed people — the ${active().name} began in your absence.`, "big");
  }
}
