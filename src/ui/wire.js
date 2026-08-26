import { on } from "../core/bus.js";
import { S } from "../core/state.js";
import { renderAll, setSpeed } from "./chrome.js";
import { log as writeChronicle } from "./log.js";
import { openEraModal, openGameOverModal } from "./modal.js";

// ---------- Where the two halves meet ------------------------
// THE ONLY MODULE THAT KNOWS BOTH SIDES (2026-08-26, review Part II.3). The
// simulation emits; this subscribes. Nothing in `core/`, `sim/`, `map/` or
// `content/` imports `ui/` any more, which is why a headless run needs no
// stubbed `document` -- it simply never calls wireInterface(), and the emits
// land on an empty registry.
//
// Called once from main.js, before boot.
export function wireInterface() {
  // THE CHRONICLE IS THE WATCHING SEAT'S MEMORY. A line carries whose it is,
  // and a rival's business is quietly dropped rather than written into your
  // history. This is the question the player split made unavoidable and the
  // old direct `log()` import had no way to ask.
  on("chronicle", ({ text, cls, pid }) => {
    if (pid !== S.me) return;
    writeChronicle(text, cls);
  });

  on("render", () => renderAll());

  on("speed", ({ value }) => setSpeed(value));

  // Your own border is a ceremony; somebody else's is news, and news is the
  // notifications system's job rather than a modal that seizes the world.
  on("eraAdvanced", ({ era, pid }) => {
    if (pid !== S.me) return;
    openEraModal(era);
  });

  on("runEnded", ({ cause }) => {
    const badge = document.getElementById("ageBadge");
    const badgeText = document.getElementById("ageBadgeText");
    if (badgeText) badgeText.textContent = "Fallen";
    if (badge) badge.classList.add("fallen");
    if (document.body) document.body.classList.add("dead");
    openGameOverModal(cause);
  });
}
