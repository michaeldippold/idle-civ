import { active } from "../content/compile.js";
import { S } from "../core/state.js";
import { capWord } from "../core/derived.js";
import { world, isOwned } from "../map/map.js";
import { hexPoints, toPixel } from "../map/model.js";
import { standingWord } from "../sim/expeditions.js";
import { openModal } from "./modal.js";

// ---------- The map modal (phase 6a: readout only) ----------
// M1 of the map arc: the world exists, you can look at it, and clicking a
// tile tells you what it is. ZERO mechanics -- no yield, no allocation, no
// targeting. Those arrive with the rest of phase 6; this ships first so the
// map is familiar before it is load-bearing (map.md §2.5, "early and inert").
//
// SVG geometry + DOM detail pane, per map.md §7: everything stays
// hit-testable and inspectable. A telling surface, so it does not hold the
// world ({ pause: false }, same ruling as Info).

const HEX = 30;   // px radius of one tile at 1:1; the viewBox scales to fit

function advName(adv) { return adv.name.charAt(0).toUpperCase() + adv.name.slice(1); }

function mapSVG() {
  const spec = active().map;
  const pts = Object.values(world.places);
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  const centers = pts.map((p) => {
    const c = toPixel(p.q, p.r, HEX);
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    return { p, c };
  });
  const pad = HEX * 1.4;
  const vb = `${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + 2 * pad).toFixed(0)} ${(maxY - minY + 2 * pad).toFixed(0)}`;

  let cells = "", marks = "";
  for (const { p, c } of centers) {
    const owned = isOwned(p.id);
    cells += `<polygon class="tile t-${p.terrain}${owned ? " tile-owned" : ""}${p.adversary ? " tile-seat" : ""}"
      points="${hexPoints(c.x, c.y, HEX - 1)}" data-id="${p.id}"></polygon>`;
    if (p.id === world.home) {
      marks += `<text class="tile-mark" x="${c.x}" y="${c.y + 5}" text-anchor="middle">⌂</text>`;
    } else if (p.adversary) {
      const adv = active().adversaries.find((a) => a.id === p.adversary);
      marks += `<text class="tile-mark seat" x="${c.x}" y="${c.y + 5}" text-anchor="middle">◆</text>` +
        `<text class="tile-label" x="${c.x}" y="${c.y + HEX * 0.95}" text-anchor="middle">${adv ? advName(adv) : p.adversary}</text>`;
    }
  }
  // Marks render after every cell so no hex edge overprints a glyph.
  return `<svg id="mapSvg" viewBox="${vb}" role="img" aria-label="Map of the known world">${cells}${marks}</svg>`;
}

function tileDetailHTML(p) {
  const spec = active().map;
  const noun = capWord(spec.tileNoun.singular);
  if (p.id === world.home) {
    return `<b>Your seat.</b> The ${spec.tileNoun.singular} everything else is measured from.`;
  }
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    const st = S.adversaries[p.adversary];
    if (adv && st) {
      return `<b>${advName(adv)}</b> — ${adv.disposition} · ${standingWord(st.standing)}<br>${adv.desc}`;
    }
  }
  const flavor = {
    plains: "Open ground. Workable, unremarkable, waiting.",
    forest: "Standing timber as far as the eye goes.",
    hills:  "Broken high country — stone near the surface, and iron under it.",
    river:  "Bottomland along running water. The soil is black and generous.",
    water:  "Open water. Nothing to hold here.",
  };
  return `<b>${noun}</b> — ${p.terrain}. ${flavor[p.terrain] || ""}`;
}

export function openMapModal() {
  if (!world) return;
  const html =
    `<div id="mapWrap">${mapSVG()}</div>` +
    `<p id="mapDetail" class="map-detail">The known world. Click a tile to read it.</p>`;
  openModal(`The Known World — ${active().name}`, html, null, (body) => {
    const detail = body.querySelector("#mapDetail");
    body.querySelector("#mapSvg").addEventListener("click", (e) => {
      const id = e.target && e.target.dataset && e.target.dataset.id;
      if (!id || !world.places[id]) return;
      body.querySelectorAll(".tile.selected").forEach((t) => t.classList.remove("selected"));
      e.target.classList.add("selected");
      detail.innerHTML = tileDetailHTML(world.places[id]);
    });
  }, { pause: false, wide: true });  // a telling surface, browsed during play -- same ruling as Info
}
