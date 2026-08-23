import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { capWord, civilians, housing, isRevealed } from "../core/derived.js";
import { S } from "../core/state.js";
import { renderTile } from "./dom.js";
import { PERSON_ICONS } from "./icons.js";

// The steppers died in E2 (engine rework): people live on hexes and work
// where they live, so this panel is the ROSTER -- who your people are, not
// where they are sent. Allocation lives on the map.
export function renderPeople() {
  const tiles = document.getElementById("personTiles");
  const noun = active().popNoun;
  renderTile(tiles, "ptile-", "settler", PERSON_ICONS.settler, capWord(noun.singular), civilians(), "people",
    `An ordinary ${noun.singular}. Your people live on the land and work where they live.`);
  for (const def of active().units) {
    if (!isRevealed(def)) continue;
    renderTile(tiles, "ptile-", def.id, PERSON_ICONS[def.id] || "", def.name, S.units[def.id] || 0, "people", def.desc);
  }

  // When the next arrival is due (timer eras; the E3 rework replaces this
  // with growth players can read on the hexes themselves).
  const gl = document.getElementById("growthLine");
  if (active().growth !== "timer") {
    gl.classList.remove("hidden");
    gl.textContent = "No one arrives unbidden. Your people grow by conquest and fealty.";
  } else if (S.pop >= housing()) {
    gl.classList.add("hidden");
    gl.innerHTML = "";
  } else {
    gl.classList.remove("hidden");
    const remaining = Math.max(0, CONFIG.settlerIntervalSeconds - S.growth);
    gl.innerHTML = `Next ${noun.singular} joins in <span class="cost">${Math.ceil(remaining)}s</span>.`;
  }

  // The standing sentence that says where the allocation verb went -- now
  // true in every era, phrased in the era's own noun.
  const list = document.getElementById("jobList");
  let tilesNote = document.getElementById("tilesNote");
  if (!tilesNote) {
    tilesNote = document.createElement("p");
    tilesNote.id = "tilesNote";
    tilesNote.className = "holdings-empty";
    list.appendChild(tilesNote);
  }
  const tn = (active().map && active().map.tileNoun) || { plural: "lands" };
  tilesNote.textContent = `Your people work the land they live on — click a ${tn.singular || "hex"} on the map to direct it.`;
  tilesNote.classList.remove("hidden");
}
