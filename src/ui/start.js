import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { playtime } from "../core/derived.js";
import { suppressSaves } from "../core/persist.js";
import { S, me } from "../core/state.js";
import { CONTINENTS } from "../map/continents.js";
import { DEFAULT_COLOR, PLAYER_COLORS } from "../core/palette.js";
import { fmtTime, renderAll, setPreGame } from "./chrome.js";


// The pre-game screen (phase 10, slice 1). Two jobs, both small and both
// deliberately separated from everything else that is about to change:
//
//   1. The run does not begin until the player says so. Landing straight into
//      a live clock reads as sudden; a board you start is a board you sat down
//      at. This is the same instinct as the pause-modal seam -- the game may
//      wait for a person.
//   2. It gives the continent picker (slice 5) a room to move into. The picker
//      is content for this screen, not a new surface, so the boot-flow state
//      machine gets built and verified once, now, while the map is still
//      stable.
//
// Deliberately NOT in the save, matching `paused` and `speed`: which screen you
// are looking at is not a property of the settlement, so a reload always lands
// back here with Continue waiting rather than resuming mid-stride.

// A new run reloads the page rather than rebuilding state in place. That is the
// deliberate choice: `setS(freshState())` would leave every module-level render
// cache holding the dead run -- the map's `world`, `selectedId` and
// `lastSignature`, the Chronicle's DOM and its seen-reveals set, each panel's
// `last*` diff string. Reloading cannot leave any of them stale, costs a flash
// on a local page, and is the same path `hardReset` already trusts. The flag
// survives the reload in sessionStorage so the fresh run skips this screen
// instead of asking a player who just answered.
const AUTOSTART = "idleciv.autostart";
// The three choices a new run is started with, stashed across freshRun()'s
// reload in the same breath as AUTOSTART. They cannot simply be written to S:
// the reload throws that S away, which is the entire point of reloading.
const CHOICES = "idleciv.newrun";

// What the screen is currently offering. Null continent means Random, which is
// the DEFAULT and is not a special case anywhere downstream -- Random is the
// absence of a pick, so the continent falls to the run seed, which is what lets
// a bare seed number reproduce a random run exactly.
let choice = { continent: null, color: DEFAULT_COLOR, name: "" };

export function stashChoices() {
  try { sessionStorage.setItem(CHOICES, JSON.stringify(choice)); } catch (e) {}
}

// Read once and clear, exactly like pendingAutostart(): a choice is consumed by
// the run it starts, and must never leak into the next one.
export function pendingChoices() {
  try {
    const raw = sessionStorage.getItem(CHOICES);
    if (!raw) return null;
    sessionStorage.removeItem(CHOICES);
    const c = JSON.parse(raw);
    return c && typeof c === "object" ? c : null;
  } catch (e) { return null; }
}

export function pendingAutostart() {
  try {
    if (sessionStorage.getItem(AUTOSTART)) {
      sessionStorage.removeItem(AUTOSTART);
      return true;
    }
  } catch (e) {}
  return false;
}

function resumeLine() {
  const m = active();
  const noun = me().pop === 1 ? m.popNoun.singular : m.popNoun.plural;
  return `${m.name} · ${fmtTime(playtime())} · ${me().pop} ${noun}`;
}

function beginRun() {
  const screen = document.getElementById("startScreen");
  if (screen) screen.classList.add("hidden");
  setPreGame(false);
  renderAll();
}

// EVERY new run goes through the reload, including the very first one on a
// machine with no save. It used to branch -- "Begin" started in place, "New
// Game" reloaded -- and the picker makes that branch wrong: the world is
// generated during boot, well before this screen is shown, so a continent
// chosen here can only take effect on the next boot. Rebuilding in place is
// the alternative and it is the thing this file already warns against, since
// every module-level render cache would still be holding the dead run.
function freshRun() {
  suppressSaves();
  stashChoices();
  try {
    localStorage.removeItem(CONFIG.saveKey);
    sessionStorage.setItem(AUTOSTART, "1");
  } catch (e) {}
  location.reload();
}

// ---------- The three choices ----------------------------------------------
// Rendered as buttons rather than <select>s on purpose: this is the moment you
// pick your piece off the box lid, and a dropdown hides two of the three worlds
// behind a click. It also keeps the screen readable as ONE screen with one
// decision on it, which is the standing constraint (todo.md) -- three short
// rows, a word of label each, no headings.
function buildChoiceButtons(host, items, get, set) {
  host.innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "start-choice" + (it.swatch ? " swatch" : "");
    b.dataset.value = it.value === null ? "" : it.value;
    if (it.swatch) {
      b.style.setProperty("--sw", it.swatch);
      b.setAttribute("aria-label", it.label);
      b.title = it.label;
    } else {
      b.textContent = it.label;
      if (it.title) b.title = it.title;
    }
    b.addEventListener("click", () => { set(it.value); paint(); });
    host.appendChild(b);
  }
  // Selection is a border-weight and a check, never opacity -- Bureau's first
  // law outlives Bureau and applies to this screen too.
  function paint() {
    for (const b of host.children) {
      const v = b.dataset.value === "" ? null : b.dataset.value;
      b.classList.toggle("on", v === get());
    }
  }
  paint();
}

function initChoices() {
  const worlds = document.getElementById("startContinents");
  const colors = document.getElementById("startColors");
  const name = document.getElementById("startName");

  if (worlds) {
    // Random leads, and is the default: a veteran rolls it for the where-am-I
    // drama, and a new player is not asked to choose between three proper
    // nouns that mean nothing to them yet (map.md 2.6, know-then-not-know).
    buildChoiceButtons(worlds, [
      { value: null, label: "Random", title: "Drawn from the run's seed." },
      ...CONTINENTS.map((c) => ({ value: c.id, label: c.name, title: c.blurb })),
    ], () => choice.continent, (v) => { choice.continent = v; });
  }
  if (colors) {
    buildChoiceButtons(colors, PLAYER_COLORS.map((c) => ({
      value: c.id, label: c.name, swatch: c.ring,
    })), () => choice.color, (v) => { choice.color = v; });
  }
  if (name) {
    name.value = "";
    name.addEventListener("input", () => { choice.name = name.value; });
  }
}

// `had` is load()'s answer: whether a run was actually restored.
export function initStartScreen(had) {
  const screen = document.getElementById("startScreen");
  // No screen in the DOM must never mean a game that cannot start. The hold
  // defaults to on, so this guard is the one thing standing between a missing
  // element and a frozen board.
  if (!screen) { setPreGame(false); return; }

  const resume = document.getElementById("startResume");
  const seed = document.getElementById("startSeed");
  const cont = document.getElementById("startContinue");
  const fresh = document.getElementById("startNew");

  if (seed) seed.textContent = `World seed ${S.seed}`;
  if (resume) {
    resume.textContent = had ? resumeLine() : "";
    resume.classList.toggle("hidden", !had);
  }

  // With no save there is nothing to continue and nothing to wipe, so the
  // screen asks one question with one button. The two-button form only appears
  // when the choice is real.
  if (cont) {
    cont.classList.toggle("hidden", !had);
    cont.addEventListener("click", beginRun);
  }
  if (fresh) {
    fresh.textContent = had ? "New Game" : "Begin";
    fresh.classList.toggle("primary", !had);
    fresh.addEventListener("click", freshRun);
  }

  // The setup rows belong to a NEW run and to nothing else. A run already
  // underway HAS a continent, a name and a colour, and all three are fixed for
  // its lifetime, so these controls must never read as applying to Continue.
  //
  // Hiding them outright when a save exists is the obvious fix and it is the
  // wrong one: New Game would then be unconfigurable, or would need a second
  // screen to configure it on. Instead they stay put and SAY who they are for,
  // but only when there is something to be confused with -- with no save, every
  // control on screen already belongs to the run you are about to start, and
  // the caption would be answering a question nobody asked.
  const setup = document.getElementById("startSetup");
  if (setup) {
    setup.classList.remove("hidden");
    const forNew = document.getElementById("startSetupFor");
    if (forNew) forNew.classList.toggle("hidden", !had);
    initChoices();
  }

  screen.classList.remove("hidden");
}
