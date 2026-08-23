import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { playtime } from "../core/derived.js";
import { suppressSaves } from "../core/persist.js";
import { S } from "../core/state.js";
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
  const noun = S.pop === 1 ? m.popNoun.singular : m.popNoun.plural;
  return `${m.name} · ${fmtTime(playtime())} · ${S.pop} ${noun}`;
}

function beginRun() {
  const screen = document.getElementById("startScreen");
  if (screen) screen.classList.add("hidden");
  setPreGame(false);
  renderAll();
}

function freshRun() {
  suppressSaves();
  try {
    localStorage.removeItem(CONFIG.saveKey);
    sessionStorage.setItem(AUTOSTART, "1");
  } catch (e) {}
  location.reload();
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
    fresh.addEventListener("click", had ? freshRun : beginRun);
  }

  screen.classList.remove("hidden");
}
