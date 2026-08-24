import { active } from "../content/compile.js";
import { S } from "../core/state.js";
import { capWord, seatIsNamed, seatName } from "../core/derived.js";
import { save } from "../core/persist.js";
import { launchSettle, pendingSettle, settlePlan } from "../core/actions.js";
import { world, isOwned, isCharted, isVisible, capOf, hexPop, atDominionCap, dominionCap, holdsUsed } from "../map/map.js";
import { FOREIGN, FOREIGN_MINOR, playerColor } from "../core/palette.js";
import { hexDistance, hexPoints, toPixel } from "../map/model.js";
import { campaignPlan, expeditionOut, musterBuilt, standingWord } from "../sim/expeditions.js";
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
function tilesEra() { return true; }   // every era allocates hexes since E2
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
    // The 2D view is the DEBUG surface and sees everything: uncharted ground
    // shows its true terrain behind a hairline edge, so continent shapes can
    // be judged without playing all the way out to them. The 3D board -- the
    // game -- still draws nothing it does not know.
    const lit = isCharted(p.id);
    const sighted = !lit && isVisible(p.id);
    const owned = lit && isOwned(p.id);
    // Fogged tiles keep their geometry and lose everything else, including
    // their terrain class -- the 2D view is the debug surface, and a debug
    // surface that leaks what the real one hides is worse than useless.
    cells += `<polygon class="tile t-${p.terrain}${lit ? "" : (sighted ? " tile-sighted" : " tile-uncharted")}${owned ? " tile-owned" : ""}${lit && p.adversary ? " tile-seat" : ""}${p.id === selectedId ? " selected" : ""}"
      points="${hexPoints(c.x, c.y, HEX - 1)}"${lit ? ` data-id="${p.id}"` : ""}></polygon>`;
    // THE 2D STAGE READS THE SHARED LADDER (fixed 2026-08-25). It used to
    // re-implement it inline, and it had drifted: a seat drew a diamond and a
    // minor a small square, where markFor() -- and so the 3D board the player
    // actually looks at -- gives both a house. markFor()'s own comment claimed
    // both renderers read one definition; as of now that is true.
    const mark = lit ? markFor(p) : null;
    if (mark) {
      // The work glyph keeps its own smaller type; everything else is a mark.
      const clsFor = (m) => (m.cls === "work" || m.cls === "rest" ? "tile-work " : "tile-mark ") + m.cls;
      if (mark.sub) {
        marks += `<text class="${clsFor(mark)}" x="${c.x - 9}" y="${c.y + 5}" text-anchor="middle">${mark.glyph}</text>` +
          `<text class="${clsFor(mark.sub)}" x="${c.x + 9}" y="${c.y + 5}" text-anchor="middle">${mark.sub.glyph}</text>`;
      } else {
        marks += `<text class="${clsFor(mark)}" x="${c.x}" y="${c.y + 5}" text-anchor="middle">${mark.glyph}</text>`;
      }
      if (mark.label) {
        marks += `<text class="tile-label" x="${c.x}" y="${c.y + HEX * 0.95}" text-anchor="middle">${mark.label}</text>`;
      }
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
    return { title: seatName(),
      stat: `${hexPop(p.id)} of ${capOf(p.id)} people`,
      body: `The ${spec().tileNoun.singular} everything else is measured from.`,
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
      stat: `${hexPop(p.id)} of ${capOf(p.id)} people`,
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
// Whether this age can act on its neighbours at all. Every era HAS neighbours
// now (2026-08-24) -- the camps are on the board from the first minute -- so
// mere existence stopped being the right question to ask. "none" is not a rule
// against war; it is the absence of anyone who could declare one. There are no
// kings in the Stone Age, only people with spears.
function canReachOut() { return active().contact === "open"; }

// The age's mustering building, by name, so a refusal names the thing you
// actually have to build rather than one from a different century.
function musterName() {
  const m = active().muster;
  if (!m) return "A mustering ground";
  const def = active().buildings.find((b) => b.id === m.building);
  return def ? `A ${def.name}` : "A mustering ground";
}

// What the Stone Age says instead of offering a button. A tile you cannot act
// on should still tell you something true about the world, rather than greying
// out and going quiet -- the refusal is the flavour.
function noReachLine() {
  return `<span class="map-noworks">You know they are there, and that is the whole of it. No one here could raise a column to go and see — that is not what a ${spec().tileNoun.singular} is, and not yet what you are.</span>`;
}

export function detailHTML(p) {
  const parts = [];
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    const st = S.adversaries[p.adversary];
    if (adv && st) {
      parts.push(`<b>${advName(adv)}</b> — ${adv.disposition} · ${standingWord(st.standing)}<br>${adv.desc}<br>${stockLine(st)}`);
      if (!canReachOut()) { parts.push(noReachLine()); return parts.join(""); }
      // The same refusals the Expeditions panel carried, or the buttons
      // silently no-op and read as broken (found in play).
      const noGround = !musterBuilt();
      const marchOut = expeditionOut("campaign"), caravanOut = expeditionOut("caravan");
      const acts = [`<button class="map-act" data-act="march" data-adv="${adv.id}"${noGround || marchOut ? " disabled" : ""}>March</button>`];
      if (adv.buys) acts.push(`<button class="map-act" data-act="caravan" data-adv="${adv.id}"${noGround || caravanOut ? " disabled" : ""}>Caravan</button>`);
      parts.push(`<div class="map-actions">${acts.join("")}</div>`);
      if (noGround) parts.push(`<span class="map-noworks">${musterName()} must stand before columns or caravans can leave.</span>`);
      else if (marchOut || caravanOut) parts.push(`<span class="map-noworks">${marchOut ? "A campaign is already in the field." : "A caravan is already on the road."}</span>`);
      return parts.join("");
    }
  }
  if (!isOwned(p.id) && p.minor && S.map.minors && S.map.minors[p.id]) {
    const st = S.map.minors[p.id];
    parts.push(`<b>${capWord(p.minor.name)}</b><br>${minorBand(p.minor.strength)} ${minorWalls(p)}`);
    if (!canReachOut()) { parts.push(noReachLine()); return parts.join(""); }
    const plan = campaignPlan("tile:" + p.id);
    const noGround = !musterBuilt();
    const marchOut = expeditionOut("campaign");
    const scopeFull = atDominionCap();
    parts.push(`<div class="map-actions"><button class="map-act" data-act="march" data-adv="tile:${p.id}"${noGround || marchOut || scopeFull ? " disabled" : ""}>March</button></div>`);
    if (plan && plan.tilesOff != null) parts.push(`<span class="map-noworks">${plan.tilesOff} tiles off · ${Math.round(plan.provisionPerUnit)} food per fighter · ${plan.time}s there and back. Win, and it swears fealty — one more holdfast.</span>`);
    if (noGround) parts.push(`<span class="map-noworks">${musterName()} must stand first.</span>`);
    else if (marchOut) parts.push(`<span class="map-noworks">A campaign is already in the field.</span>`);
    else if (scopeFull) parts.push(`<span class="map-noworks">Victory would win ground this age cannot govern — the dominion is at its full scope.</span>`);
    return parts.join("");
  }
  const mine = isOwned(p.id);
  const noun = spec().tileNoun.singular;
  if (p.id === world.home) {
    // A named seat says its name and then what it is; an unnamed one keeps the
    // game's original sentence exactly. The fallback is not a degraded case --
    // most runs will never name anything, and that has to read as intended
    // rather than as a blank someone forgot to fill.
    parts.push(seatIsNamed()
      ? `<b>${seatName()}.</b> Your seat — the ${noun} everything else is measured from.`
      : `<b>Your seat.</b> The ${noun} everything else is measured from.`);
  }
  else if (mine) parts.push(`<b>Your ${noun}</b> — ${p.terrain}. ${TERRAIN_FLAVOR[p.terrain] || ""}`);
  // People live here (engine rework E1): every owned hex reports its
  // population against what the ground supports. Displayed floored, so this
  // string -- and therefore the content-diffed re-render -- moves only when a
  // whole person arrives.
  if (mine) parts.push(`<span class="tile-pop">People: <b>${hexPop(p.id)}</b> of ${capOf(p.id)} this ${p.terrain === "water" ? "water" : "ground"} supports.</span>`);
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
      // The settle verb: wilderness is claimable, as queued and priced work --
      // within the age's SCOPE (dominionCap): what one era can hold is finite,
      // and holding more is what an era advance means.
      const queued = pendingSettle(p.id);
      const capped = !queued && atDominionCap();
      parts.push(`<div class="map-actions"><button class="map-act" data-act="settle" data-tile="${p.id}"${queued || capped ? " disabled" : ""}>Settle</button></div>`);
      parts.push(`<span class="map-noworks">${queued
        ? "A party is already on its way."
        : capped
        ? `Your people hold all ${dominionCap()} lands this age can govern. A new age must dawn before the banner spreads further.`
        : `${Object.entries(plan.cost).map(([k, v]) => `${v} ${k}`).join(", ")} · ${plan.time}s${plan.tilesOff != null ? ` · ${plan.tilesOff} tiles off` : ""}${best.length ? ` · best worked for ${best.join(" or ")}` : ""}. Stake the ground, raise a hearth — one more ${spec().tileNoun.singular}.`}</span>`);
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
  if (p.id === world.home) return seatName();
  if (isOwned(p.id)) return `Your ${capWord(spec().tileNoun.singular)}`;
  if (p.minor && S.map.minors && S.map.minors[p.id]) return capWord(p.minor.name);
  return capWord(p.terrain);
}

// ---------- Stage rendering ---------------------------------
function signature() {
  if (!world) return "none";
  return [S.era, ((S.map && S.map.owned) || []).join("|"),
    ((S.map && S.map.revealed) || []).length,
    ((S.map && S.map.sighted) || []).length,
    JSON.stringify((S.map && S.map.work) || {}), selectedId].join("~");
}

// What owned country REPORTS: the resource it is working, or a quiet dash if
// it is resting. Lifted out because two tiles need it now -- an ordinary
// holding, and your seat, which wears a house AND reports its work.
function workMark(id) {
  const w = (S.map.work || {})[id];
  // A resting hex says so (owner request, 2026-08-23): the old ledger's red
  // "N idle" died with the jobs system, and unworked ground was invisible
  // until clicked. The dash is quiet on purpose -- resting is sometimes a
  // choice, and the starving ledger already carries the alarm.
  return w ? { glyph: WORK_GLYPH[w] || "", cls: "work" } : { glyph: "\u2014", cls: "rest" };
}

// The mark a tile wears, in priority order -- home, then a named seat, then
// the work letter on owned country, then a minor's dot. This is the SAME
// ladder the SVG renderer draws, lifted out so both renderers read from one
// definition rather than drifting apart.
export function markFor(p) {
  // Unpainted board says nothing about itself. Fog hides the BOARD; what is
  // on it is a separate layer that simply is not known yet.
  if (!isCharted(p.id)) return null;
  // YOUR SEAT WEARS BOTH (owner, 2026-08-25). The house says whose ground this
  // is; the glyph beside it says what that ground is producing. Until now the
  // home branch short-circuited the ladder, so the seat was the one owned hex
  // that never reported its work -- invisible precisely because it is the hex
  // you look at most. `sub` is a second glyph drawn BESIDE the first, and it is
  // the ladder's only composite: everything else on the board is one thing.
  if (p.id === world.home) return { glyph: "\u2302", cls: "home", sub: workMark(p.id) };
  // A HOUSE MEANS A HOME, and the colour says whose (owner request): white
  // for your seat, red for someone else's. A power gets a house and a name;
  // a steading gets a smaller house and no name, because minors are numerous
  // and their names live on hover -- the map stays a map, not a directory.
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    return { glyph: "\u2302", cls: "seat", label: adv ? advName(adv) : p.adversary };
  }
  if (isOwned(p.id)) return workMark(p.id);
  // Minors get a mark and no label: they are numerous, and their names live on
  // hover. The map stays a map rather than becoming a directory.
  if (p.minor) return { glyph: "\u2302", cls: "minor" };
  return null;
}

// THE RIM A TILE WEARS -- the same question the mark ladder answers, asked of
// the hex edge instead of the glyph above it (owner request, 2026-08-25: give
// foreign ground a rim so the little house stops carrying the whole job on its
// own). Deliberately routed THROUGH markFor rather than re-deriving ownership
// and adversary-ness here: that is exactly the duplication that let the 2D
// stage drift into drawing diamonds, and one ladder is the fix that stuck.
//
// Charting comes along free. markFor() returns null for anything not charted,
// so a rim can never appear on merely-SIGHTED ground -- which matters, because
// sight reveals the BOARD and never the PIECES (map.md, slice 4b), and a rim
// saying "someone lives here" is a piece.
export function rimFor(p) {
  if (isOwned(p.id)) return playerColor().ring;
  const m = markFor(p);
  if (!m) return null;                       // uncharted, or empty country
  if (m.cls === "seat") return FOREIGN;
  if (m.cls === "minor") return FOREIGN_MINOR;
  return null;
}

export function renderMapStage() {
  const stage = document.getElementById("mapStage");
  if (!stage) return;
  // Still deciding which renderer owns the stage: draw nothing, and do NOT
  // touch lastSignature -- whichever board wins needs the next call to be a
  // real render rather than a no-op.
  if (mode === "pending") return;
  if (!world) {
    if (mode === "2d") stage.innerHTML = "";
    lastSignature = "none";
    return;
  }
  const sig = signature();
  if (sig === lastSignature) return;
  lastSignature = sig;

  if (mode === "3d") {
    stage3d.setWorld(visiblePlaces(),
      { isOwned, isVisible, isCharted, homeId: world.home, era: S.era });
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

// The reveal toggle is not part of the signature (it is a lens, not state),
// so flipping it has to say so out loud.
export function invalidateMapStage() { lastSignature = ""; }

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
// THE BOARD DOES NOT DRAW UNTIL WE KNOW WHICH BOARD (owner, 2026-08-25).
// `pending` is the boot state while the 3D import and GPU setup are in flight:
// the stage draws NOTHING rather than drawing a 2D fallback that is about to be
// thrown away. Before this, a hard refresh showed the SVG board for a second or
// two and then replaced it -- a flash of a different game, and the first thing
// a new player saw.
//
// The fallback is untouched and still covers every failure path (no WebGL, a
// missing vendored library, a throw anywhere in setup). It simply stops being
// the DEFAULT view and becomes what you get when 3D actually fails. `?map=2d`
// never enters `pending` at all, so the debug surface stays instant.
let mode = wants3d() ? "pending" : "2d";
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
  // Every exit below must leave `mode` decided. It used to start at "2d" and
  // only ever move UP to "3d", so a failure needed no handling; now that it
  // starts at "pending", a path that forgets to settle it leaves a blank board
  // forever. That is the one way this change could break the fallback, so each
  // return sets it explicitly rather than relying on the initial value.
  try {
    stage3d = await import("../render3d/stage.js");
    const ok = await stage3d.initStage(stage, {
      markFor,
      // The renderer draws; it does not know whose board it is. Same rule the
      // mark ladder follows -- state arrives through hooks.
      palette: playerColor(),
      rimFor,
      onPick: (id) => selectTile(id),
      onHoverChange: (p, ev) => {
        if (!p || !ev) { tipHide(); return; }
        tipHolder.__tip = () => tipFor(p);
        tipShow(tipHolder, ev);
      },
      onHoverMove: (ev) => tipMove(ev),
    });
    if (!ok) { stage3d = null; mode = "2d"; return false; }
    mode = "3d";
    return true;
  } catch (e) {
    // Anything at all going wrong here falls back to the 2D board, which is a
    // whole playable game. Loud in the console, silent on screen.
    console.warn("[map] 3D stage unavailable; falling back to the 2D board:", e);
    stage3d = null;
    mode = "2d";
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
    // Deliberately not awaited: boot must not block on a GPU. Nothing else
    // waits -- panels, the Chronicle and the clock all come up immediately;
    // only the STAGE holds, because it is the one element that would otherwise
    // show the wrong board first.
    if (mode === "pending") stage.classList.add("stage-waiting");
    init3d(stage).then(() => {
      // Runs on EVERY path, success or fallback -- init3d never rejects, it
      // returns false. Whichever board won now draws for the first time, and
      // the stage is revealed either way. An early return here for the
      // failure case would leave the 2D fallback hidden behind the waiting
      // class, which is the exact bug this whole change could have introduced.
      stage.querySelectorAll("#mapSvg").forEach((el) => el.remove());
      lastSignature = "";
      renderMapStage();
      stage.classList.remove("stage-waiting");
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
