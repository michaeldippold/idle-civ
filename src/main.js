import { ERA_ORDER } from "./content/compile.js";  // side-effect first: build + validate the manifests before anything else evaluates
import { CONFIG } from "./core/config.js";
import { initAdversaries, load, save } from "./core/persist.js";
import { S, setLoops } from "./core/state.js";
import { step } from "./core/step.js";
import { cycleSpeed, modalHold, paused, preGame, renderAll, renderSpeed, setPaused, setPreGame, setSpeed, speed } from "./ui/chrome.js";
import { ensureMap, revealAll, setRevealAll } from "./map/map.js";
import { initMapStage, invalidateMapStage } from "./ui/map.js";
import { checkReveals, log } from "./ui/log.js";
import { closeModal, modalIsOpen, openInfoPanel, openResetModal } from "./ui/modal.js";
import { setUpgradeTab } from "./ui/panels-buy.js";
import { initStartScreen, pendingAutostart } from "./ui/start.js";


// `?era=iron` jumps the run's era before the world is built. It exists for one
// reason: ADVERSARIES ONLY EXIST AT IRON -- Stone and Bronze declare no seats
// and no minor tier -- so judging where a seed puts your neighbours meant
// playing two full eras to find out. This is a lens on generation, not a
// legitimate advance: it sets the era and nothing else, so unlocks, costs and
// the log will all read as though you arrived there by magic, which you did.
// Sits beside ?continent=, ?map=2d, ?glcheck=1.
function forcedEra() {
  try {
    const want = new URLSearchParams(location.search).get("era");
    return ERA_ORDER.includes(want) ? want : null;
  } catch (e) { return null; }
}

// ---------- Boot --------------------------------------------
export function boot() {
  const had = load();
  const era = forcedEra();
  if (era) {
    S.era = era;
    console.log(`[qa] era forced to ${era} -- generation preview, not a real advance`);
  }
  initAdversaries();
  ensureMap();
  // Same channel as the [pacing] telemetry: the seed is how a mid-run bug
  // report becomes reproducible, so it should be readable without dying.
  console.log(`[seed] ${S.seed}`);

  if (!had) {
    log("A handful of survivors gather where the road ends.");
    log("They are hungry. Turn your clearing to food, or they will starve.");
  }

  checkReveals();
  renderAll();

  // The run waits for a person (phase 10, slice 1). One exception: a player who
  // just chose "New Game" already answered this question, so the reload that
  // clears their save carries a flag that skips straight into the fresh run.
  if (pendingAutostart()) setPreGame(false);
  else initStartScreen(had);

  document.getElementById("saveBtn").addEventListener("click", () => {
    if (S.dead) return;
    save();
    log("Progress saved.");
  });
  // Confirms in our own modal rather than a native confirm() -- consistent
  // styling, and native dialogs are suppressed outright in some environments.
  document.getElementById("resetBtn").addEventListener("click", openResetModal);

  document.getElementById("pauseBtn").addEventListener("click", () => setPaused(!paused));
  document.getElementById("speedBtn").addEventListener("click", cycleSpeed);
  renderSpeed();
  document.getElementById("tabAvailable").addEventListener("click", () => setUpgradeTab("available"));
  document.getElementById("tabOwned").addEventListener("click", () => setUpgradeTab("owned"));
  document.getElementById("revealBtn").addEventListener("click", () => {
    setRevealAll(!revealAll);
    const btn = document.getElementById("revealBtn");
    btn.textContent = revealAll ? "Hide" : "Reveal";
    btn.classList.toggle("fast", revealAll);   // the same "a lens is on" weight speed uses
    invalidateMapStage();
    renderAll();
  });
  document.getElementById("infoBtn").addEventListener("click", openInfoPanel);
  initMapStage();
  document.getElementById("modalClose").addEventListener("click", closeModal);
  // Clicking the dimmed backdrop closes; clicks inside the panel bubble up to
  // the overlay too, so check the target is the overlay itself.
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalIsOpen()) { closeModal(); return; }
    // Space toggles pause. preventDefault stops it from re-activating whichever
    // stepper/build button happens to still hold focus from the last click.
    // The number row sets speed directly: 1..5 land on CONFIG.speeds.
    // Transport controls deserve keys now that watching the game IS playing.
    if (e.key >= "1" && e.key <= "5") {
      const notch = CONFIG.speeds[Number(e.key) - 1];
      if (notch) setSpeed(notch);
      return;
    }
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    setPaused(!paused);
  });

  let hidden = document.hidden === true;
  // The loop is a metronome, not a stopwatch (phase 4): each fire advances
  // `speed` fixed ticks, and wall time is never measured. Interval jitter
  // therefore bends the game's pace a hair rather than its math -- a slow
  // frame means the world briefly runs slightly slower than 1x, never that
  // a bigger slice of time gets simulated in one gulp.
  const newLoopId = setInterval(() => {
    if (S.dead || preGame || paused || hidden || modalHold) return;
    for (let i = 0; i < speed; i++) step();
    checkReveals();
    renderAll();
  }, CONFIG.tickMs);

  // The clock runs while you're looking at it (design.md, Time, Presence &
  // Pause): hiding the tab stops the simulation outright -- no offline
  // catch-up, no background running -- and commits a save. Returning resumes
  // automatically; a MANUAL pause is a separate flag and survives the round
  // trip untouched. (The counted loop made the old re-anchor dance for
  // throttled background intervals obsolete: a skipped fire is simply a tick
  // that never happened.)
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    if (hidden) save();
  });
  // pagehide, not beforeunload: it fires reliably on tab close and on
  // mobile page freeze, and never blocks the unload.
  window.addEventListener("pagehide", save);

  // Autosave. Keeps running while paused -- a paused game is still a game
  // you can lose to a crash.
  setLoops(newLoopId, setInterval(save, 10000));
}

boot();
