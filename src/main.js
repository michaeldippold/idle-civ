import "./content/compile.js";  // side-effect first: build + validate the manifests before anything else evaluates
import { CONFIG } from "./core/config.js";
import { initAdversaries, load, save, simulateOffline } from "./core/persist.js";
import { S, setLoops } from "./core/state.js";
import { step } from "./core/step.js";
import { cycleSpeed, paused, renderAll, renderSpeed, setPaused, speed } from "./ui/chrome.js";
import { checkReveals, log } from "./ui/log.js";
import { closeModal, modalIsOpen, openInfoPanel, openResetModal } from "./ui/modal.js";
import { setUpgradeTab } from "./ui/panels-buy.js";


// ---------- Boot --------------------------------------------
export function boot() {
  const had = load();
  initAdversaries();

  if (!had) {
    log("A handful of survivors gather where the road ends.");
    log("They are hungry. Put someone to forage, or they will starve.");
  } else {
    simulateOffline();
  }

  checkReveals();
  renderAll();

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
  document.getElementById("infoBtn").addEventListener("click", openInfoPanel);
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
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    setPaused(!paused);
  });

  let last = Date.now();
  const newLoopId = setInterval(() => {
    if (S.dead) return;
    const now = Date.now();
    let dt = (now - last) / 1000;
    // `last` advances even while paused -- otherwise dt would keep accruing
    // through the whole pause and hand back a free (clamped) chunk of
    // production the instant you resume.
    last = now;
    if (paused) return;
    if (dt > 2) dt = 2;            // large gaps are handled by the offline sim
    // The clamp is applied BEFORE the multiplier, deliberately: clamping is
    // about the browser having been descheduled, and speed is about how fast
    // we want to watch. Scaling the clamp would let a background tab bank time
    // and hand it back multiplied.
    for (let i = 0; i < speed; i++) step(dt);
    checkReveals();
    renderAll();
  }, CONFIG.tickMs);

  // Autosave keeps running while paused, deliberately: it refreshes lastSeed,
  // so time spent paused is never mistaken for offline time on the next load.
  setLoops(newLoopId, setInterval(save, 10000));
  window.addEventListener("beforeunload", save);
}

boot();
