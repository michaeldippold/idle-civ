import { active } from "../content/compile.js";
import { S } from "../core/state.js";
import { capWord } from "../core/derived.js";
import { save } from "../core/persist.js";
import { world, isOwned } from "../map/map.js";
import { hexPoints, toPixel } from "../map/model.js";
import { standingWord } from "../sim/expeditions.js";
import { attachTip } from "./dom.js";
import { openCampaignModal, openCaravanModal, stockLine } from "./expeditions.js";
import { openModal } from "./modal.js";

// ---------- The map modal (6a readout; 6c interaction) ------
// THE interaction pattern for the map, ruled by the user and carried forward
// to the node network unchanged: HOVER previews a tile (name, flavor, the
// short numbers); CLICK opens its details, and the details are where every
// stat, every line of flavor and every ACTION for that place lives. Under
// tile allocation that means the allocation buttons (this is where the
// stepper verb went); on a seat it means March and Caravan, the beginning of
// the Expeditions panel's dissolution into the map.
//
// SVG geometry + DOM detail pane (map.md §7). A telling surface -- it does
// not hold the world; allocating while the sim runs is exactly as legal as
// clicking a stepper was.

const HEX = 30;
const WORK_GLYPH = { food: "F", wood: "W", stone: "S", iron: "I" };

const TERRAIN_FLAVOR = {
  plains: "Open ground. Workable, unremarkable, waiting.",
  forest: "Standing timber as far as the eye goes.",
  hills:  "Broken high country — stone near the surface, and iron under it.",
  river:  "Bottomland along running water. The soil is black and generous.",
  water:  "Open water. Nothing to hold here.",
};

function advName(adv) { return adv.name.charAt(0).toUpperCase() + adv.name.slice(1); }
function spec() { return active().map; }
function tilesEra() { return active().allocation === "tiles"; }
function worksFor(terrain) { return (spec().works && spec().works[terrain]) || []; }

function mapSVG() {
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
    } else if (owned) {
      // The work glyph: one letter for what this holdfast is turned to.
      // Present (empty) on every owned non-seat tile so allocation updates
      // never rebuild the SVG -- textContent only, per the rendering law.
      const w = (S.map.work || {})[p.id];
      marks += `<text class="tile-work" data-work-for="${p.id}" x="${c.x}" y="${c.y + 5}" text-anchor="middle">${w ? WORK_GLYPH[w] || "" : ""}</text>`;
    }
  }
  return `<svg id="mapSvg" viewBox="${vb}" role="img" aria-label="Map of the known world">${cells}${marks}</svg>`;
}

// ---------- Hover: the preview ------------------------------
function tipFor(p) {
  const noun = capWord(spec().tileNoun.singular);
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    const st = S.adversaries[p.adversary];
    if (adv && st) {
      return {
        title: advName(adv),
        body: `${adv.disposition} · ${standingWord(st.standing)}. ${adv.desc}`,
        why: `Known stock: ${stockLine(st)}. Click for actions.`,
      };
    }
  }
  if (p.id === world.home) {
    return { title: `Your seat`, body: `The ${spec().tileNoun.singular} everything else is measured from.`,
      why: tilesEra() ? "Click to set what it works." : null };
  }
  if (isOwned(p.id)) {
    const w = (S.map.work || {})[p.id];
    return {
      title: `Your ${spec().tileNoun.singular} · ${p.terrain}`,
      body: w ? `Turned to ${w}.` : `Resting — producing nothing.`,
      why: tilesEra() ? "Click to direct it." : null,
    };
  }
  const works = worksFor(p.terrain);
  return {
    title: `${capWord(p.terrain)}`,
    body: TERRAIN_FLAVOR[p.terrain] || "",
    why: works.length && tilesEra() ? `Could be worked for ${works.join(" or ")} — if it were yours.` : null,
  };
}

// ---------- Click: the details, and the actions -------------
function detailHTML(p) {
  const parts = [];
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    const st = S.adversaries[p.adversary];
    if (adv && st) {
      parts.push(`<b>${advName(adv)}</b> — ${adv.disposition} · ${standingWord(st.standing)}<br>${adv.desc}<br>Known stock: ${stockLine(st)}.`);
      const acts = [`<button class="map-act" data-act="march" data-adv="${adv.id}">March</button>`];
      if (adv.buys) acts.push(`<button class="map-act" data-act="caravan" data-adv="${adv.id}">Caravan</button>`);
      parts.push(`<div class="map-actions">${acts.join("")}</div>`);
      return parts.join("");
    }
  }
  const mine = isOwned(p.id);
  const noun = spec().tileNoun.singular;
  if (p.id === world.home) parts.push(`<b>Your seat.</b> The ${noun} everything else is measured from.`);
  else if (mine) parts.push(`<b>Your ${noun}</b> — ${p.terrain}. ${TERRAIN_FLAVOR[p.terrain] || ""}`);
  else parts.push(`<b>${capWord(p.terrain)}</b> — ${TERRAIN_FLAVOR[p.terrain] || ""}`);

  if (mine && tilesEra()) {
    const works = worksFor(p.terrain);
    const current = (S.map.work || {})[p.id] || null;
    if (works.length) {
      const btns = works.map((r) =>
        `<button class="map-act alloc${current === r ? " active" : ""}" data-act="work" data-tile="${p.id}" data-res="${r}">${capWord(r)}</button>`);
      btns.push(`<button class="map-act alloc${current ? "" : " active"}" data-act="rest" data-tile="${p.id}">Rest</button>`);
      parts.push(`<div class="map-actions">${btns.join("")}</div>`);
    } else {
      parts.push(`<span class="map-noworks">Nothing here can be worked.</span>`);
    }
  } else if (!mine && tilesEra() && p.terrain !== "water") {
    const works = worksFor(p.terrain);
    parts.push(`<span class="map-noworks">Not yours${works.length ? ` — could be worked for ${works.join(" or ")}` : ""}. Growth is conquest and fealty.</span>`);
  }
  return parts.join("");
}

export function openMapModal() {
  if (!world) return;
  const html =
    `<div id="mapWrap">${mapSVG()}</div>` +
    `<p id="mapDetail" class="map-detail">The known world. Hover to read a tile; click for its details and actions.</p>`;
  openModal(`The Known World — ${active().name}`, html, null, (body) => {
    const detail = body.querySelector("#mapDetail");
    const svg = body.querySelector("#mapSvg");
    let selectedId = null;

    // Hover previews, through the game's one tooltip (getters, never
    // snapshots -- assignments change under an open map).
    svg.querySelectorAll(".tile").forEach((poly) => {
      const p = world.places[poly.dataset.id];
      if (p) attachTip(poly, () => tipFor(p));
    });

    const renderDetail = () => {
      if (!selectedId) return;
      detail.innerHTML = detailHTML(world.places[selectedId]);
    };

    svg.addEventListener("click", (e) => {
      const id = e.target && e.target.dataset && e.target.dataset.id;
      if (!id || !world.places[id]) return;
      svg.querySelectorAll(".tile.selected").forEach((t) => t.classList.remove("selected"));
      e.target.classList.add("selected");
      selectedId = id;
      renderDetail();
    });

    // Actions live in the detail pane. Allocation commits immediately (and
    // saves -- it is a player action); March/Caravan hand off to the muster
    // and escort modals, which replace this one (single-modal law).
    detail.addEventListener("click", (e) => {
      const btn = e.target.closest ? e.target.closest("button.map-act") : null;
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "march") { openCampaignModal(btn.dataset.adv); return; }
      if (act === "caravan") { openCaravanModal(btn.dataset.adv); return; }
      if (act === "work" || act === "rest") {
        const tid = btn.dataset.tile;
        if (!isOwned(tid)) return;
        if (act === "work") S.map.work[tid] = btn.dataset.res;
        else delete S.map.work[tid];
        const glyph = svg.querySelector(`[data-work-for="${tid}"]`);
        if (glyph) glyph.textContent = act === "work" ? (WORK_GLYPH[btn.dataset.res] || "") : "";
        save();
        renderDetail();
      }
    });
  }, { pause: false, wide: true });  // a telling surface, same ruling as Info
}
