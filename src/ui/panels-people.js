import { active } from "../content/compile.js";
import { capWord, civilians, isRevealed } from "../core/derived.js";
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

  // The settler-timer countdown died in E3: growth is visible on the hexes
  // themselves ("People: 5 of 8"), which is a better countdown than a number.
  const gl = document.getElementById("growthLine");
  if (gl) { gl.classList.add("hidden"); gl.innerHTML = ""; }

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
