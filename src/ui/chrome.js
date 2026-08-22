import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { playtime } from "../core/derived.js";
import { S } from "../core/state.js";
import { expeditionsUnlocked, renderExpeditions } from "./expeditions.js";
import { log } from "./log.js";
import { renderBuildings, renderTraining, renderUpgrades } from "./panels-buy.js";
import { renderHoldings, renderQueue } from "./panels-holdings.js";
import { renderResources } from "./panels-ledger.js";
import { renderPeople } from "./panels-people.js";

export function updateSpans() {
  const log = document.getElementById("panel-log");
  if (log) log.classList.toggle("shrunk", expeditionsUnlocked());
}

// The Expeditions panel belongs to any era whose manifest declares adversaries
// -- i.e. once the world has an outside at all. Era-scoped rather than global,
// since a later era without adversaries shouldn't show it. The Muster Ground
// gates the actions on the cards, not the existence of the panel.
// Deliberately NOT part of S: pause is UI state, not game state. Keeping it out
// of the save means no schema change, and no loading into a frozen game and
// wondering why nothing is happening.
export let paused = false;
// Same reasoning as `paused`, and the same deliberate exclusion from the save:
// speed is a lens on the simulation, not a property of the settlement. It also
// shouldn't survive a reload -- coming back to a game silently running at 12x
// would be a nasty surprise. Pause is really just speed 0, but it stays its own
// control because it's the one you reach for without looking.
export let speed = 1;
export function fmtTime(totalSec) {
  const t = Math.max(0, Math.floor(totalSec));
  const s = t % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
  return h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${m}m ${String(s).padStart(2, "0")}s`;
}

// Not guarded on S.dead -- how long a run lasted is worth seeing afterward.
export function renderClock() {
  const el = document.getElementById("playClock");
  // Elapsed time plus the raw tick count -- the latter a debugging readout
  // by explicit request: with a seeded, tick-counted sim, "what tick did it
  // happen on" is the coordinate a bug report wants.
  if (el) el.textContent = `${fmtTime(playtime())} · t${S.tick.toLocaleString()}`;
}

// Speed is a lens, never a cheat: the loop runs `speed` ordinary steps per
// tick rather than one oversized one, so every rate, probability roll, build
// tick and upkeep charge behaves identically to real time -- there is just
// more of it per second. Nothing needs to know it's happening.
// The simulation-hold a modal can place (phase 5). A third independent flag
// beside `paused` (the player's intent) and the hidden-tab stop, for the same
// reason those two are separate: composing independent flags lets each one
// release without clobbering the others. The loop steps only when none hold.
// This is the seam the decision queue (phase 7) builds on: any modal content
// -- steppers, choices, prose, future decision cards -- holds the world
// simply by opening without `pause: false`.
export let modalHold = false;
export function setModalHold(v) { modalHold = v; }

// Set a specific notch (the 1-5 keys); cycleSpeed remains the click path.
export function setSpeed(n) {
  if (!CONFIG.speeds.includes(n)) return;
  speed = n;
  renderSpeed();
}

export function renderSpeed() {
  const btn = document.getElementById("speedBtn");
  if (!btn) return;
  btn.textContent = `${speed}×`;
  btn.classList.toggle("fast", speed > 1);
}

export function cycleSpeed() {
  if (S.dead) return;
  const i = CONFIG.speeds.indexOf(speed);
  speed = CONFIG.speeds[(i + 1) % CONFIG.speeds.length];
  renderSpeed();
}

export function setPaused(p) {
  if (S.dead) return;
  paused = p;
  const btn = document.getElementById("pauseBtn");
  if (btn) btn.textContent = paused ? "Resume" : "Pause";
  const flag = document.getElementById("pauseFlag");
  if (flag) flag.classList.toggle("hidden", !paused);
  // Deliberately not logged: the Chronicle is the settlement's memory, not a
  // record of the player's UI actions, and pausing is already obvious on screen.
  renderAll();
}

// Era-dependent chrome: the age badge and any panel whose title is reflavored.
// Skipped once dead, since die() puts "[Fallen]" in the badge and that should
// stick rather than being overwritten by a later render.
export function renderEraChrome() {
  if (S.dead) return;
  const badgeText = document.getElementById("ageBadgeText");
  if (badgeText) badgeText.textContent = active().name;
  // The desk under the board changes per era, and the header chrome inverts
  // with it. Driving both off one attribute keeps the whole swap in CSS.
  if (document.body) document.body.dataset.era = S.era;
  const titles = active().panelTitles;
  for (const panelId in titles) {
    const h2 = document.querySelector(`#${panelId} h2`);
    if (h2) h2.textContent = titles[panelId];
  }
}

export function renderAll() {
  renderEraChrome();
  renderClock();
  renderResources();
  renderPeople();
  renderHoldings();
  renderQueue();
  renderBuildings();
  renderUpgrades();
  renderTraining();
  renderExpeditions();
  updateSpans();
}

