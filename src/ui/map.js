import { active } from "../content/compile.js";
import { S } from "../core/state.js";
import { capWord } from "../core/derived.js";
import { save } from "../core/persist.js";
import { world, isOwned } from "../map/map.js";
import { hexDistance, hexPoints, toPixel } from "../map/model.js";
import { expeditionOut, standingWord } from "../sim/expeditions.js";
import { attachTip } from "./dom.js";
import { openCampaignModal, openCaravanModal, stockLine } from "./expeditions.js";

// ---------- The map stage (the flip, 2026-08-22) ------------
// The map is the game's main surface now -- not a modal, the CANVAS, with
// every panel floating over it. One layout for the whole game: Stone shows
// a single hex (the ground you happen to be standing on), Bronze widens to
// the ring around it, Iron recuts a country. The interaction pattern is the
// permanent one: HOVER previews a tile; CLICK opens the Selected Tile panel,
// where every stat, every line of flavor and every action lives.
//
// Render discipline: the SVG rebuilds only when its SIGNATURE changes (era,
// view, ownership, assignments, selection) -- never on the 5Hz tick, so a
// click can never land on a node the renderer just destroyed (the
// click-eater rule). The tile detail re-renders only when its content
// string changes.

const HEX = 30;
const WORK_GLYPH = { food: "F", wood: "W", stone: "S", iron: "I" };

const TERRAIN_FLAVOR = {
  plains: "Open ground. Workable, unremarkable, waiting.",
  forest: "Standing timber as far as the eye goes.",
  hills:  "Broken high country — stone near the surface, and iron under it.",
  river:  "Bottomland along running water. The soil is black and generous.",
  water:  "Open water. Nothing to hold here.",
};

let selectedId = null;
let lastSignature = "";
let lastDetail = "";

function advName(adv) { return adv.name.charAt(0).toUpperCase() + adv.name.slice(1); }
function spec() { return active().map; }
function tilesEra() { return active().allocation === "tiles"; }
function worksFor(terrain) { return (spec().works && spec().works[terrain]) || {}; }
function fmtRate(x) { return "×" + (Math.round(x * 10) / 10); }
function specialties(terrain) {
  const w = worksFor(terrain);
  return Object.keys(w).filter((r) => w[r] >= 1);
}
function visiblePlaces() {
  const view = spec().view != null ? spec().view : Infinity;
  return Object.values(world.places).filter((p) => hexDistance(p.q, p.r, 0, 0) <= view);
}

function mapSVG() {
  const pts = visiblePlaces();
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
    cells += `<polygon class="tile t-${p.terrain}${owned ? " tile-owned" : ""}${p.adversary ? " tile-seat" : ""}${p.id === selectedId ? " selected" : ""}"
      points="${hexPoints(c.x, c.y, HEX - 1)}" data-id="${p.id}"></polygon>`;
    if (p.id === world.home) {
      marks += `<text class="tile-mark" x="${c.x}" y="${c.y + 5}" text-anchor="middle">⌂</text>`;
    } else if (p.adversary) {
      const adv = active().adversaries.find((a) => a.id === p.adversary);
      marks += `<text class="tile-mark seat" x="${c.x}" y="${c.y + 5}" text-anchor="middle">◆</text>` +
        `<text class="tile-label" x="${c.x}" y="${c.y + HEX * 0.95}" text-anchor="middle">${adv ? advName(adv) : p.adversary}</text>`;
    } else if (owned) {
      const w = (S.map.work || {})[p.id];
      marks += `<text class="tile-work" data-work-for="${p.id}" x="${c.x}" y="${c.y + 5}" text-anchor="middle">${w ? WORK_GLYPH[w] || "" : ""}</text>`;
    }
  }
  return `<svg id="mapSvg" viewBox="${vb}" role="img" aria-label="Map of the known world">${cells}${marks}</svg>`;
}

// ---------- Hover: the preview ------------------------------
function tipFor(p) {
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
    return { title: "Your seat", body: `The ${spec().tileNoun.singular} everything else is measured from.`,
      why: tilesEra() ? "Click to set what it works." : null };
  }
  if (isOwned(p.id)) {
    const w = (S.map.work || {})[p.id];
    return {
      title: `Your ${spec().tileNoun.singular} · ${p.terrain}`,
      body: w ? `Turned to ${w}.` : "Resting — producing nothing.",
      why: tilesEra() ? "Click to direct it." : null,
    };
  }
  const best = specialties(p.terrain);
  return {
    title: `${capWord(p.terrain)}`,
    body: TERRAIN_FLAVOR[p.terrain] || "",
    why: best.length && tilesEra() ? `Best worked for ${best.join(" or ")} — if it were yours.` : null,
  };
}

// ---------- Click: the Selected Tile panel ------------------
function detailHTML(p) {
  const parts = [];
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    const st = S.adversaries[p.adversary];
    if (adv && st) {
      parts.push(`<b>${advName(adv)}</b> — ${adv.disposition} · ${standingWord(st.standing)}<br>${adv.desc}<br>Known stock: ${stockLine(st)}.`);
      // The same refusals the Expeditions panel carried, or the buttons
      // silently no-op and read as broken (found in play).
      const noGround = (S.builds.musterGround || 0) < 1;
      const marchOut = expeditionOut("campaign"), caravanOut = expeditionOut("caravan");
      const acts = [`<button class="map-act" data-act="march" data-adv="${adv.id}"${noGround || marchOut ? " disabled" : ""}>March</button>`];
      if (adv.buys) acts.push(`<button class="map-act" data-act="caravan" data-adv="${adv.id}"${noGround || caravanOut ? " disabled" : ""}>Caravan</button>`);
      parts.push(`<div class="map-actions">${acts.join("")}</div>`);
      if (noGround) parts.push(`<span class="map-noworks">A Muster Ground must stand before columns or caravans can leave.</span>`);
      else if (marchOut || caravanOut) parts.push(`<span class="map-noworks">${marchOut ? "A campaign is already in the field." : "A caravan is already on the road."}</span>`);
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
    const resIds = Object.keys(works);
    const current = (S.map.work || {})[p.id] || null;
    if (resIds.length) {
      // Every ground works everything; the rate is the trade-off.
      const btns = resIds.map((r) =>
        `<button class="map-act alloc${current === r ? " active" : ""}" data-act="work" data-tile="${p.id}" data-res="${r}">${capWord(r)} ${fmtRate(works[r])}</button>`);
      btns.push(`<button class="map-act alloc${current ? "" : " active"}" data-act="rest" data-tile="${p.id}">Rest</button>`);
      parts.push(`<div class="map-actions">${btns.join("")}</div>`);
    } else {
      parts.push(`<span class="map-noworks">Nothing here can be worked.</span>`);
    }
  } else if (!mine && tilesEra() && p.terrain !== "water") {
    const best = specialties(p.terrain);
    parts.push(`<span class="map-noworks">Not yours${best.length ? ` — best worked for ${best.join(" or ")}` : ""}. Growth is conquest and fealty.</span>`);
  }
  return parts.join("");
}

function titleFor(p) {
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    if (adv) return advName(adv);
  }
  if (p.id === world.home) return "Your Seat";
  if (isOwned(p.id)) return `Your ${capWord(spec().tileNoun.singular)}`;
  return capWord(p.terrain);
}

// ---------- Stage rendering ---------------------------------
function signature() {
  if (!world) return "none";
  return [S.era, spec().view, ((S.map && S.map.owned) || []).join("|"),
    JSON.stringify((S.map && S.map.work) || {}), selectedId].join("~");
}

export function renderMapStage() {
  const stage = document.getElementById("mapStage");
  if (!stage) return;
  if (!world) { stage.innerHTML = ""; lastSignature = "none"; return; }
  const sig = signature();
  if (sig === lastSignature) return;
  lastSignature = sig;
  stage.innerHTML = mapSVG();
  const svg = stage.querySelector("#mapSvg");
  if (!svg || !svg.querySelectorAll) return;
  svg.querySelectorAll(".tile").forEach((poly) => {
    const p = world.places[poly.dataset.id];
    if (p) attachTip(poly, () => tipFor(p));
  });
}

export function renderTileDetail() {
  const panel = document.getElementById("panel-tile");
  if (!panel) return;
  const p = selectedId && world ? world.places[selectedId] : null;
  panel.classList.toggle("hidden", !p);
  if (!p) { lastDetail = ""; return; }
  const html = detailHTML(p);
  if (html === lastDetail) return;
  lastDetail = html;
  const t = document.getElementById("tileTitle");
  if (t) t.textContent = titleFor(p);
  const b = document.getElementById("tileBody");
  if (b) b.innerHTML = html;
}

export function selectTile(id) {
  selectedId = id;
  lastSignature = "";   // the selection ring lives in the svg
  renderMapStage();
  renderTileDetail();
}

// One-time wiring: stage clicks select; detail clicks act. Both by
// delegation, so innerHTML swaps never orphan a listener.
export function initMapStage() {
  const stage = document.getElementById("mapStage");
  if (stage) {
    stage.addEventListener("click", (e) => {
      const id = e.target && e.target.dataset && e.target.dataset.id;
      if (id && world && world.places[id]) selectTile(id);
    });
  }
  const close = document.getElementById("tileClose");
  if (close) close.addEventListener("click", () => selectTile(null));
  const body = document.getElementById("tileBody");
  if (body) {
    body.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("button.map-act") : null;
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      if (act === "march") { openCampaignModal(btn.dataset.adv); return; }
      if (act === "caravan") { openCaravanModal(btn.dataset.adv); return; }
      if (act === "work" || act === "rest") {
        const tid = btn.dataset.tile;
        if (!isOwned(tid)) return;
        if (act === "work") S.map.work[tid] = btn.dataset.res;
        else delete S.map.work[tid];
        save();               // a player action commits, like any other
        lastSignature = "";   // the work glyph changed
        renderMapStage();
        renderTileDetail();
      }
    });
  }
}
