import { active } from "../content/compile.js";
import { completeConstruction } from "./actions.js";
import { CONFIG, TICK_SECONDS } from "./config.js";
import { caps, rates } from "./derived.js";
import { S, loopId, saveId } from "./state.js";
import { endFamine, growPopulation, starveTick } from "../map/map.js";
import { resolveEvents, runConverters } from "../sim/events.js";
import { resolveExpeditions } from "../sim/expeditions.js";
import { renderAll } from "../ui/chrome.js";
import { log } from "../ui/log.js";
import { openGameOverModal } from "../ui/modal.js";

// ---------- Core simulation ---------------------------------
// One fixed tick of the simulation: exactly TICK_SECONDS of world time,
// every time. Nothing variable enters -- the clock is a count, which is what
// makes (seed + tick count + actions) fully determine the state. The dt the
// subsystems receive below is the same constant on every call; they keep
// their per-second authoring and their signatures untouched.
export function step() {
  if (S.dead) return;
  const dt = TICK_SECONDS;
  // The tick lives here rather than in the loop so it counts exactly one
  // thing: how far the world actually moved. Pausing and hiding skip step()
  // entirely, so the clock freezes; death stops it via the guard above.
  S.tick += 1;
  const r = rates();

  // Gather + eat. Food is a net line so upkeep can drive it negative -> death.
  for (const res of active().resources) {
    S.res[res.id] += (res.id === "food" ? r.foodNet : r[res.id]) * dt;
  }

  runConverters(dt);

  // Storage caps: surplus spoils/rots/is lost (silent; a one-time hint fires via reveals).
  const c = caps();
  for (const res of active().resources) {
    if (S.res[res.id] > c[res.id]) S.res[res.id] = c[res.id];
  }

  // Starvation (E4): an empty larder no longer ends the run outright -- the
  // empire starves from its frontier inward, hex by hex, and the run ends
  // only when the SEAT empties. Each death shrinks the deficit, so a famine
  // converges on what the land can actually feed rather than annihilating.
  if (S.res.food <= 0 && r.foodNet < 0) {
    S.res.food = 0;
    if (starveTick(-r.foodNet, dt)) { die("starvation"); return; }
  } else if (S.res.food > 0) {
    endFamine();
  }
  if (S.res.food < 0) S.res.food = 0;

  // Only the item at the front of the queue is actively under construction --
  // no worker assignment needed; the queue itself is the scarcity.
  if (S.buildQueue.length) {
    const front = S.buildQueue[0];
    front.remaining -= CONFIG.buildSpeed * dt;
    if (front.remaining <= 0) {
      S.buildQueue.shift();
      completeConstruction(front);
    }
  }

  // Population grows toward its terrain caps, hex by hex -- the only growth
  // there is (the free-settler timer died in E3; expansion is a claim you
  // pay for).
  growPopulation(dt);

  // Sickness, conflict, windfalls -- whatever the active manifest's slate holds.
  resolveEvents(dt);

  // Outbound columns tick and resolve on the world's schedule.
  resolveExpeditions(dt);

  // Conflict (and in principle anything else) can zero out population --
  // checked generically here rather than attributed to a specific event.
  if (S.pop <= 0) {
    die("conflict");
  }

  // NOTHING ENDS A TICK BELOW ZERO. growPopulation's budget math can leave a
  // float residual like -1e-16 (x - (x/p)*p), and fmt() floors -- so the
  // owner watched the larder read "-1" (2026-08-25). The mid-tick food clamp
  // above runs BEFORE growth and events; this sweep is the one that guards
  // what actually gets displayed and saved.
  for (const res of active().resources) {
    if (S.res[res.id] < 0) S.res[res.id] = 0;
  }
}

export function die(cause) {
  S.dead = true;
  // One terse line so the Chronicle -- the settlement's memory -- still ends
  // with its own ending. The dramatic version and the actionable bits live in
  // the game-over modal instead.
  if (cause === "conflict") log("The last defenders fall. The settlement is overrun.", "big");
  else log("The last of your people starve. The settlement falls silent.", "big");
  const badge = document.getElementById("ageBadge");
  const badgeText = document.getElementById("ageBadgeText");
  if (badgeText) badgeText.textContent = "Fallen";
  if (badge) badge.classList.add("fallen");
  document.body && document.body.classList.add("dead");
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
  if (loopId) clearInterval(loopId);
  if (saveId) clearInterval(saveId);
  // Last render before the loop stops, so the clock shows the run's final time.
  renderAll();
  openGameOverModal(cause);
}

