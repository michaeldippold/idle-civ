import { active } from "../content/compile.js";
import { S } from "../core/state.js";
import { capWord } from "../core/derived.js";
import { save } from "../core/persist.js";
import { launchSettle, pendingSettle, settlePlan } from "../core/actions.js";
import { world, isOwned, isCharted } from "../map/map.js";
import { hexDistance, hexPoints, toPixel } from "../map/model.js";
import { campaignPlan, expeditionOut, standingWord } from "../sim/expeditions.js";
import { attachTip, tipHide, tipMove, tipShow } from "./dom.js";
import { openCampaignModal, openCaravanModal, stockLine } from "./expeditions.js";

// ---------- The map stage (the flip, 2026-08-22) ------------
// The map is the game's main surface now -- not a modal, the CANVAS, with
// every panel floating over it. One layout for the whole game: Stone shows
// a single hex (the ground you happen to be standing on), Bronze widens to
// the ring around it, Iron recuts a country. The interaction pattern is the
// permanent one: HOVER previews a tile; CLICK opens the Selected Tile panel,
// where every stat, every line of flavor and every action lives.
//
// Render discipline: the stage rebuilds only when its SIGNATURE changes (era,
// view, ownership, assignments, selection) -- never on the 5Hz tick, so a
// click can never land on a node the renderer just destroyed (the
// click-eater rule). The tile detail re-renders only when its content
// string changes.
//
// TWO renderers sit behind that one discipline (phase 10, slice 2). The 3D
// stage (`render3d/stage.js`) is the game's surface; the SVG stage below
// survives as the 2D debug view, reachable with `?map=2d` and used as the
// assertable surface when something needs to be checked without a GPU. The
// seam is deliberately narrow: BOTH renderers do nothing but draw, and both
// report a clicked tile id back through `selectTile`. Everything downstream of
// selection -- the Selected Tile panel, its stats, its flavor, its March and
// Caravan and Settle buttons -- is plain DOM that never knew which renderer
// was upstream, which is why the port could not break it.

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
// The WHOLE board, every era. Era view radii are retired (one board, forever
// -- map.md 2.6): the world is not what grows, the fog is what retreats. What
// each tile shows is decided per tile by `isCharted`.
function visiblePlaces() {
  return Object.values(world.places);
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
    const lit = isCharted(p.id);
    const owned = lit && isOwned(p.id);
    // Fogged tiles keep their geometry and lose everything else, including
    // their terrain class -- the 2D view is the debug surface, and a debug
    // surface that leaks what the real one hides is worse than useless.
    cells += `<polygon class="tile ${lit ? "t-" + p.terrain : "tile-fog"}${owned ? " tile-owned" : ""}${lit && p.adversary ? " tile-seat" : ""}${p.id === selectedId ? " selected" : ""}"
      points="${hexPoints(c.x, c.y, HEX - 1)}"${lit ? ` data-id="${p.id}"` : ""}></polygon>`;
    if (!lit) {
      // nothing else to draw: unpainted board
    } else if (p.id === world.home) {
      marks += `<text class="tile-mark" x="${c.x}" y="${c.y + 5}" text-anchor="middle">⌂</text>`;
    } else if (p.adversary) {
      const adv = active().adversaries.find((a) => a.id === p.adversary);
      marks += `<text class="tile-mark seat" x="${c.x}" y="${c.y + 5}" text-anchor="middle">◆</text>` +
        `<text class="tile-label" x="${c.x}" y="${c.y + HEX * 0.95}" text-anchor="middle">${adv ? advName(adv) : p.adversary}</text>`;
    } else if (owned) {
      const w = (S.map.work || {})[p.id];
      marks += `<text class="tile-work" data-work-for="${p.id}" x="${c.x}" y="${c.y + 5}" text-anchor="middle">${w ? WORK_GLYPH[w] || "" : ""}</text>`;
    } else if (p.minor) {
      // A small mark, no label: minors are numerous, and their names live on
      // hover -- the map stays a map, not a directory.
      marks += `<text class="tile-mark minor" x="${c.x}" y="${c.y + 5}" text-anchor="middle">▪</text>`;
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
        why: `${stockLine(st)} Click for actions.`,
      };
    }
  }
  if (p.id === world.home) {
    return { title: "Your seat", body: `The ${spec().tileNoun.singular} everything else is measured from.`,
      why: tilesEra() ? "Click to set what it works." : null };
  }
  if (!isOwned(p.id) && p.minor && S.map.minors && S.map.minors[p.id]) {
    return {
      title: capWord(p.minor.name),
      body: `${minorBand(p.minor.strength)} ${minorWalls(p)}`,
      why: "Click for actions.",
    };
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
      parts.push(`<b>${advName(adv)}</b> — ${adv.disposition} · ${standingWord(st.standing)}<br>${adv.desc}<br>${stockLine(st)}`);
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
  if (!isOwned(p.id) && p.minor && S.map.minors && S.map.minors[p.id]) {
    const st = S.map.minors[p.id];
    parts.push(`<b>${capWord(p.minor.name)}</b><br>${minorBand(p.minor.strength)} ${minorWalls(p)}`);
    const plan = campaignPlan("tile:" + p.id);
    const noGround = (S.builds.musterGround || 0) < 1;
    const marchOut = expeditionOut("campaign");
    parts.push(`<div class="map-actions"><button class="map-act" data-act="march" data-adv="tile:${p.id}"${noGround || marchOut ? " disabled" : ""}>March</button></div>`);
    if (plan && plan.tilesOff != null) parts.push(`<span class="map-noworks">${plan.tilesOff} tiles off · ${plan.provisions} food · ${plan.time}s there and back. Win, and it swears fealty — one more holdfast.</span>`);
    if (noGround) parts.push(`<span class="map-noworks">A Muster Ground must stand first.</span>`);
    else if (marchOut) parts.push(`<span class="map-noworks">A campaign is already in the field.</span>`);
    return parts.join("");
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
    const plan = settlePlan(p.id);
    if (plan) {
      // The settle verb: wilderness is claimable, as queued and priced work.
      const queued = pendingSettle(p.id);
      parts.push(`<div class="map-actions"><button class="map-act" data-act="settle" data-tile="${p.id}"${queued ? " disabled" : ""}>Settle</button></div>`);
      parts.push(`<span class="map-noworks">${queued
        ? "A party is already on its way."
        : `${plan.cost.food} food, ${plan.cost.wood} wood · ${plan.time}s${plan.tilesOff != null ? ` · ${plan.tilesOff} tiles off` : ""}${best.length ? ` · best worked for ${best.join(" or ")}` : ""}. Raise a hall, install a lord — one more holdfast.`}</span>`);
    } else {
      parts.push(`<span class="map-noworks">Not yours${best.length ? ` — best worked for ${best.join(" or ")}` : ""}. Growth is conquest and fealty.</span>`);
    }
  }
  return parts.join("");
}

function minorBand(str) {
  if (str <= 4) return "A hedge lord and a handful of spears.";
  if (str <= 7) return "A steady freehold that has turned back raiders before.";   // no "walled": walls have their own honest line
  return "A hard old freehold, proud and well-armed.";
}
function minorWalls(p) {
  const st = S.map.minors && S.map.minors[p.id];
  if (!p.minor.wallsMax) return "No walls to speak of.";
  if (st && st.walls < p.minor.wallsMax) return st.walls <= 0 ? "Its walls lie in ruin." : "Its walls are battered.";
  return "A timber palisade rings it.";
}

function titleFor(p) {
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    if (adv) return advName(adv);
  }
  if (p.id === world.home) return "Your Seat";
  if (isOwned(p.id)) return `Your ${capWord(spec().tileNoun.singular)}`;
  if (p.minor && S.map.minors && S.map.minors[p.id]) return capWord(p.minor.name);
  return capWord(p.terrain);
}

// ---------- Stage rendering ---------------------------------
function signature() {
  if (!world) return "none";
  return [S.era, ((S.map && S.map.owned) || []).join("|"),
    ((S.map && S.map.revealed) || []).length,
    JSON.stringify((S.map && S.map.work) || {}), selectedId].join("~");
}

// The mark a tile wears, in priority order -- home, then a named seat, then
// the work letter on owned country, then a minor's dot. This is the SAME
// ladder the SVG renderer draws, lifted out so both renderers read from one
// definition rather than drifting apart.
export function markFor(p) {
  // Unpainted board says nothing about itself. Fog hides the BOARD; what is
  // on it is a separate layer that simply is not known yet.
  if (!isCharted(p.id)) return null;
  if (p.id === world.home) return { glyph: "\u2302", cls: "home" };
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    return { glyph: "\u25c6", cls: "seat", label: adv ? advName(adv) : p.adversary };
  }
  if (isOwned(p.id)) {
    const w = (S.map.work || {})[p.id];
    return w ? { glyph: WORK_GLYPH[w] || "", cls: "work" } : null;
  }
  // Minors get a mark and no label: they are numerous, and their names live on
  // hover. The map stays a map rather than becoming a directory.
  if (p.minor) return { glyph: "\u25aa", cls: "minor" };
  return null;
}

export function renderMapStage() {
  const stage = document.getElementById("mapStage");
  if (!stage) return;
  if (!world) {
    if (mode === "2d") stage.innerHTML = "";
    lastSignature = "none";
    return;
  }
  const sig = signature();
  if (sig === lastSignature) return;
  lastSignature = sig;

  if (mode === "3d") {
    stage3d.setWorld(visiblePlaces(), { isOwned, isRevealed: isCharted, homeId: world.home });
    stage3d.setSelected(selectedId);
    return;
  }

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
  // The 3D stage moves a ring rather than rebuilding, so selection costs it
  // nothing; the SVG stage bakes the ring into its markup and must redraw.
  if (mode === "3d") stage3d.setSelected(id);
  else lastSignature = "";
  renderMapStage();
  renderTileDetail();
}

// Which renderer is live. "2d" until the 3D stage reports itself up, so every
// failure path -- no WebGL, a missing vendored library, `?map=2d` -- lands on a
// working board rather than a black rectangle.
let mode = "2d";
let stage3d = null;

function wants3d() {
  try {
    return new URLSearchParams(location.search).get("map") !== "2d";
  } catch (e) { return true; }
}

// A holder object standing in for a DOM element, so 3D hover can reuse the
// game's one tooltip implementation verbatim: `tipShow` only ever reads
// `el.__tip`, and the positioning and flip-at-the-viewport-edge logic are
// worth having identical everywhere rather than reimplemented for the canvas.
const tipHolder = {};

async function init3d(stage) {
  if (!wants3d()) return false;
  try {
    stage3d = await import("../render3d/stage.js");
    const ok = await stage3d.initStage(stage, {
      markFor,
      onPick: (id) => selectTile(id),
      onHoverChange: (p, ev) => {
        if (!p || !ev) { tipHide(); return; }
        tipHolder.__tip = () => tipFor(p);
        tipShow(tipHolder, ev);
      },
      onHoverMove: (ev) => tipMove(ev),
    });
    if (!ok) { stage3d = null; return false; }
    mode = "3d";
    return true;
  } catch (e) {
    // Anything at all going wrong here keeps the 2D board, which is a whole
    // playable game. Loud in the console, silent on screen.
    console.warn("[map] 3D stage unavailable; keeping the 2D board:", e);
    stage3d = null;
    return false;
  }
}

// One-time wiring: stage clicks select; detail clicks act. Both by
// delegation, so innerHTML swaps never orphan a listener.
export function initMapStage() {
  const stage = document.getElementById("mapStage");
  if (stage) {
    // The SVG path's selector. Under 3D the canvas reports picks through
    // `onPick` instead, and this never fires -- a canvas has no dataset.id.
    stage.addEventListener("click", (e) => {
      const id = e.target && e.target.dataset && e.target.dataset.id;
      if (id && world && world.places[id]) selectTile(id);
    });
    // Deliberately not awaited: boot must not block on a GPU. The 2D board
    // draws immediately, and the 3D stage takes over a frame later when it is
    // ready -- clearing the SVG first so the two never share the element.
    init3d(stage).then((ok) => {
      if (!ok) return;
      stage.querySelectorAll("#mapSvg").forEach((el) => el.remove());
      lastSignature = "";
      renderMapStage();
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
      if (act === "settle") { launchSettle(btn.dataset.tile); lastDetail = ""; renderTileDetail(); return; }
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
