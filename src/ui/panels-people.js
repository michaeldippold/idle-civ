import { active } from "../content/compile.js";
import { capWord, civilians, isRevealed } from "../core/derived.js";
import { dominionCap, holdsUsed } from "../map/map.js";
import { S, me } from "../core/state.js";
import { renderTile } from "./dom.js";
import { PERSON_ICONS } from "./icons.js";
import { unitHit, unitRole } from "../sim/battle.js";

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
    // Same contract as the army card and the muster: a unit is never drawn
    // without the number it fights on.
    const how = unitRole(def) === "ranged" ? "The only ones who can shoot from inside a fortification."
      : unitRole(def) === "siege" ? "Little use against people; the answer to a wall."
      : "Behind a wall they wait for the breach.";
    renderTile(tiles, "ptile-", def.id, PERSON_ICONS[def.id] || "", def.name, me().units[def.id] || 0, "people",
      `${def.desc} Hits on ${unitHit(def)}+. ${how}`);
  }

  // (The settler-timer countdown died in E3: growth is visible on the hexes
  // themselves -- "People: 5 of 8" is a better countdown than a number. Its
  // element was hidden-and-emptied on every render until 2026-08-25, when the
  // div, this code and the .growthline rule were removed together.)

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
  const cap = dominionCap();
  const holds = Number.isFinite(cap) ? ` You hold ${holdsUsed()} of the ${cap} ${tn.plural} this age can govern.` : "";
  tilesNote.textContent = `Your people work whatever ground they live on — click a ${tn.singular || "hex"} to see what could be built there.${holds}`;
  tilesNote.classList.remove("hidden");
}
