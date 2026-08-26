import { active } from "../content/compile.js";
import { S, me, playerByKey } from "../core/state.js";
import { availableUnits, canAfford, caps, capWord, seatIsNamed, seatName } from "../core/derived.js";
import { save } from "../core/persist.js";
import { canBuildOn, demolishStructure, hasMarket, launchSettle, launchStructure, pendingBuild, pendingSettle, settlePlan, structureFits, structurePlan, structureUnlocked, trade, tradeRate } from "../core/actions.js";
import { atDominionCap, capOf, dominionCap, hexPop, hexResource, hexUse, hexYield, holdings, holdsUsed, isCharted, isOwned, isSighted, isVisible, structureDef, terrainYield, workStamp, world } from "../map/map.js";
import { armyAt, armyBand, armyById, armyRoster, armySize, disbandArmy, disbandRefusal, haltArmy, marchRefusal, marchingTo, orderMarch, setStance } from "../sim/armies.js";
import { STANCES, stanceById, unitHit, unitRole } from "../sim/battle.js";
import { battleAt } from "../sim/contact.js";
import { colorById, FOREIGN, FOREIGN_MINOR, playerColor } from "../core/palette.js";
import { hexDistance, hexPoints, toPixel } from "../map/model.js";
import { campaignPlan, expeditionOut, musterBuilt, standingWord } from "../sim/expeditions.js";
import { attachTip, esc, tipHide, tipMove, tipShow } from "./dom.js";
import { openCampaignModal, openCaravanModal, openRaiseModal, stockLine } from "./expeditions.js";

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
// One letter per WORKABLE resource -- every resource any era's `map.works`
// offers, or a hex turned to it shows nothing at all and reads as resting.
// Copper and tin were missing from 2026-08-24 (when Bronze put the alloy
// economy on the hills) until 2026-08-25, because this table was written for
// the four resources that existed when it was written and nobody re-read it
// when two more arrived. The harness now derives the requirement from the
// manifests instead of restating this list.
const WORK_GLYPH = {
  food: "F", wood: "W", stone: "S", iron: "I",
  copper: "C", tin: "T",
};
// The mark a BUILT hex wears. Empty until structures exist as content; the
// fallback is a filled block, so an unmapped structure reads as "something is
// here" rather than as a missing glyph. See design.md, Building on a Hex.
const STRUCTURE_GLYPH = {};

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

// Which army is waiting for you to point at a hex. UI state, not game state:
// it is what the NEXT click means, and it survives nothing.
let sending = null;

// THE SELECTED PIECE, as "pid:uid", or null. Selection is TYPED now (canon:
// an army is an object AT a hex, not a property OF one): nothing, a hex, or
// an army. Clicking a disc selects the army and the panel becomes the army's
// own; clicking ground selects the hex, which only POINTS at whoever stands
// there. selectedId still carries the ring's hex either way.
let selectedArmy = null;

function selectedArmyObj() {
  if (!selectedArmy) return null;
  const parts = selectedArmy.split(":");
  const pl = S.players[Number(parts[0])];
  const a = pl && (pl.armies || []).find((x) => x.uid === Number(parts[1]));
  if (!a) { selectedArmy = null; return null; }   // died or dispersed under us
  return { pl, a };
}

function advName(adv) { return adv.name.charAt(0).toUpperCase() + adv.name.slice(1); }

// A PRICE, WITH THE PART YOU CANNOT PAY MARKED. The buy cards have done this
// since Bureau (`.short`, semantic red), and the map panel never learned it --
// so Settle printed a plain price and then silently did nothing when clicked,
// which is the one failure mode the interface laws exist to forbid: state is
// carried by colour and words, and a refusal always says why.
//
// The card stays fully readable either way (opacity is never used for state):
// you can read what a thing costs while you cannot afford it, because reading
// it is how you plan for it.
function costLine(cost) {
  return Object.keys(cost).map((k) =>
    `<span class="${(me().res[k] || 0) < cost[k] ? "short" : ""}">${cost[k]} ${k}</span>`).join(", ");
}

// A PRICE YOU CANNOT EVER MEET, as opposed to one you have not met YET.
//
// Red says "not enough wood". It does not say "your stores cannot hold that
// much wood", and those are different problems with different answers: one you
// solve by waiting, the other you solve by building. A Bronze farm costs 55
// wood against a base cap of 50, so a player reading only red waits for wood
// that will never arrive. Storage caps retire at Iron, so this is a Stone and
// Bronze problem and it is exactly when a player is least equipped to diagnose
// it.
function cappedOut(cost) {
  const c = caps();
  return Object.keys(cost).filter((k) => c[k] != null && cost[k] > c[k]);
}

function cappedNote(cost) {
  const over = cappedOut(cost);
  if (!over.length) return "";
  const list = over.map((k) => `${k} (holds ${caps()[k]})`).join(", ");
  return ` <span class="short">Your stores cannot hold this much ${list} — raise storage first.</span>`;
}
function spec() { return active().map; }
function tilesEra() { return true; }   // every era works hexes since E2
function fmtRate(x) { return "×" + (Math.round(x * 10) / 10); }
// What a terrain gives, for country you may not own -- the settle blurb wants
// to say "best worked for wood" about a forest you have only scouted.
function yieldOf(terrain) {
  const y = spec().yields && spec().yields[terrain];
  return y ? { res: y.res, rate: y.rate } : null;
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
    const st = playerByKey(p.adversary);
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
    const u = hexUse(p.id);
    return {
      title: `Your ${spec().tileNoun.singular} · ${p.terrain}`,
      stat: `${hexPop(p.id)} of ${capOf(p.id)} people`,
      body: (() => {
        if (u.kind === "structure") {
          const d = structureDef(u.id);
          const y = hexYield(p.id);
          return `${d ? d.name : u.id}${y ? ` — ${y.res} ${fmtRate(y.rate)}.` : " — produces nothing."}`;
        }
        const g = terrainYield(p.id);
        return g ? `Works its own ground: ${g.res} ${fmtRate(g.rate)}.` : "Nothing here can be worked.";
      })(),
      why: "Click to see what could be built here.",
    };
  }
  const gy = yieldOf(p.terrain);
  return {
    title: `${capWord(p.terrain)}`,
    body: TERRAIN_FLAVOR[p.terrain] || "",
    why: gy ? `Gives ${gy.res} ${fmtRate(gy.rate)} — if it were yours.` : null,
  };
}

// THE MARKET COUNTER. Lives on the market hex itself rather than in a panel,
// because that is where it physically is -- a rival scouting your plains sees
// the weighing floor, and burning it closes the valve. Buttons are one batch
// at a time: trading is a loss, and a loss should be felt per click.
function marketHTML() {
  const rate = tradeRate();
  if (rate == null) return "";
  const live = active().resources;
  const c = caps();
  const rows = [];
  for (const get of live) {
    const affordable = live.filter((g) => g.id !== get.id && (me().res[g.id] || 0) >= rate);
    if (!affordable.length) continue;
    const full = c[get.id] != null && (me().res[get.id] || 0) + 1 > c[get.id];
    const btns = affordable.map((g) =>
      `<button class="map-act trade" data-act="trade" data-give="${g.id}" data-get="${get.id}"${
        full ? " disabled" : ""}>${rate} ${g.id}</button>`).join("");
    rows.push(`<div class="trade-row"><span class="trade-for">1 ${capWord(get.id)} for</span>${btns}</div>`);
  }
  if (!rows.length) {
    return `<span class="map-noworks">The traders are here, but you have nothing they want yet — you need ${rate} of something to spare.</span>`;
  }
  return `<div class="trade-board">${rows.join("")}</div>` +
    `<span class="map-noworks">The bank always says yes, and always at their price: ${rate} of anything for 1 of anything else. Another Market improves the rate.</span>`;
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

// THE PIECES FEED. Everything the disc layer draws, one row per army: your
// own always (you know where your own soldiers are), a foreign one only while
// you are actually SIGHTING its ground -- the fog rule pieces inherited from
// the banner. Socket by pid, so two players' discs on one contested hex stand
// apart deterministically.
export function piecesForBoard() {
  const out = [];
  if (!world) return out;
  for (const pl of S.players || []) {
    const mine = pl.id === S.me;
    for (const a of (pl.armies || [])) {
      if (!mine && !isSighted(a.at)) continue;
      const place = world.places[a.at];
      if (!place) continue;
      const n = armySize(a);
      out.push({
        key: pl.id + ":" + a.uid, hex: a.at, q: place.q, r: place.r,
        color: (colorById(pl.color) || {}).ring || FOREIGN,
        count: n, tier: armyBand(n).tier, socket: pl.id % 4,
        marching: !!a.order, mine,
        selected: selectedArmy === pl.id + ":" + a.uid,
      });
    }
  }
  return out;
}

// THE ROAD, PREVIEWED. Dispatch feedback: travel is pick-up-and-plop by
// ruling (no sliding), so between hops the BOARD carries the promise -- while
// one of your marching armies is selected, the hexes it has still to walk
// wear dots and the destination wears a ring. Dies with the selection; it is
// a preview, not a rules object.
function pathMarkFor(id) {
  const sel = selectedArmyObj();
  if (!sel || sel.pl.id !== S.me || !sel.a.order || !sel.a.path) return null;
  if (id === sel.a.order.to) return { glyph: "\u25CE", cls: "pathdest" };
  // (The interior dots retired 2026-08-26, the day they shipped: the march
  // LINE draws the road itself now -- the dots said which hexes, the line
  // says the order they come in -- and dots on top of it were noise. The
  // destination ring stays; the line needs somewhere to be going.)
  return null;
}

// What the 3D label layer reads: the base ladder, never the army override --
// the discs carry the armies now, and a flag glyph under a disc would say the
// same thing twice. The SVG debug board keeps markFor whole, flags included,
// because it has no piece layer.
function stageMarkFor(p) {
  // The destination ring outranks the fog: it marks YOUR OWN order, and you
  // know where you sent them even when you cannot see it yet. Everything else
  // stays behind the charted line.
  const path = pathMarkFor(p.id);
  if (path) return path;
  if (!isCharted(p.id)) return null;
  return baseMarkFor(p);
}

// WHO IS STANDING HERE, AND WHAT THEY CAN DO. This panel is the whole of the
// legibility contract, and the contract is deliberately one-sided: the game
// will NEVER tell you your odds. No board game does, and a printed percentage
// collapses the decision into a threshold check -- the player stops reading the
// board and starts reading the number, and the skill the game is about
// evaporates.
//
// What it owes you instead is the INPUTS, in full, wherever a unit is drawn.
// "6 Spearmen" supports no estimate at all. "6 Spearmen — hits on 7+" IS the
// estimate. Click the army, count the dice, decide for yourself.
function civLabel(pl) {
  if (pl.id === S.me) return "Your army";
  const adv = active().adversaries.find((a) => a.id === pl.key);
  return (adv ? advName(adv) : "A rival") + "’s army";
}

function unitLine(def, n) {
  const role = unitRole(def);
  const says = role === "ranged" ? "shoots from behind walls"
    : role === "siege" ? "breaks walls, little else"
    : "waits for the breach";
  return `<div class="army-row"><b>${n}</b> ${def.name}` +
    `<span class="army-stat">hits on ${unitHit(def)}+ · ${says}</span></div>`;
}

function armyHTML(p) {
  const out = [];
  // A CONTESTED HEX SAYS SO FIRST -- the battle is the most important thing
  // happening anywhere on the board.
  const b = battleAt(p.id);
  if (b) {
    out.push(`<div class="army-card battle"><div class="army-head">\u2694 <b>A battle rages here</b> — round ${
      (b.round || 0) + 1}. No one enters, and no one is called away, until it is decided.</div></div>`);
  }
  // POINTERS, NEVER EMBEDDED CARDS (canon: the hex panel reports what is
  // around it rather than owning it, the way a folder lists filenames without
  // inlining their contents). The full card -- roster, dice, orders -- is the
  // army's OWN panel, reached by clicking its disc or one of these rows. This
  // is the seam that makes an army an object rather than a hex property.
  const standing = [];
  for (const pl of S.players || []) {
    const a = armyAt(p.id, pl);
    if (!a) continue;
    const mine = pl.id === S.me;
    if (!mine && !isSighted(p.id)) continue;
    standing.push(`<button class="map-act army-link${mine ? " mine" : ""}" data-act="viewarmy" data-key="${
      pl.id}:${a.uid}">\u2691 ${mine ? "Your army" : civLabel(pl)} — ${armySize(a)} \u2192</button>`);
  }
  if (standing.length) {
    out.push(`<div class="army-orders">Standing here:</div><div class="map-actions">${standing.join("")}</div>`);
  }
  // RAISING happens on ground you hold and nowhere else, and one army to a hex:
  // reinforcing a garrison is done by marching into it, which merges.
  if (isOwned(p.id) && !armyAt(p.id, me()) && anyUnitsFree()) {
    out.push(`<div class="map-actions"><button class="map-act" data-act="raise" data-tile="${p.id}">Raise an army</button></div>`);
  }
  return out.join("");
}

// THE ARMY'S OWN PANEL. Identical layout whoever owns it (skimming is really
// comparing; the roster block must sit in the same place at the same size),
// actions strictly BELOW the roster, and the stance editable in place -- a
// standing order, right up until a battle seals and freezes it.
function armyDetailHTML(pl, a) {
  const mine = pl.id === S.me;
  const parts = [];
  const b = battleAt(a.at);
  if (b) {
    parts.push(`<div class="army-card battle"><div class="army-head">\u2694 <b>Locked in battle</b> — round ${
      (b.round || 0) + 1}. The dice are rolling.</div></div>`);
  }
  parts.push(`<div class="army-head">\u2691 <b>${armySize(a)} under arms</b> — a ${armyBand(armySize(a)).name}</div>`);
  parts.push(armyRoster(a, pl).map((x) => unitLine(x.def, x.n)).join(""));
  const dest = marchingTo(a);
  const where = a.inBattle ? "Locked in the fighting."
    : dest && world.places[dest] ? `Marching on ${titleFor(world.places[dest])}.`
    : "Holding this ground.";
  parts.push(`<div class="army-orders">${where}</div>`);
  if (mine && !a.inBattle) {
    parts.push(`<div class="army-orders">Standing order:</div><div class="stance-pick">` +
      STANCES.map((st) => `<button class="stance-opt${st.id === a.stance ? " on" : ""}" data-act="stance" data-army="${
        a.uid}" data-stance="${st.id}">${st.name}</button>`).join("") + `</div>`);
    parts.push(`<div class="map-actions">` +
      `<button class="map-act" data-act="send" data-army="${a.uid}">${sending === a.uid ? "Pick a hex…" : "March"}</button>` +
      (dest ? `<button class="map-act" data-act="halt" data-army="${a.uid}">Halt</button>` : "") +
      `<button class="map-act warn" data-act="disband" data-army="${a.uid}"${
        disbandRefusal(a.uid) ? " disabled" : ""}>Disperse</button>` +
      `</div>`);
    if (sending === a.uid) parts.push(`<span class="map-noworks">Choose the ground they march on.</span>`);
  } else if (mine) {
    parts.push(`<div class="army-orders">Standing order: <b>${stanceById(a.stance).name}</b> — frozen until the dice are done.</div>`);
  }
  // The two objects point at each other rather than one containing the other.
  parts.push(`<div class="army-orders">Standing on: <button class="map-act" data-act="viewhex" data-tile="${
    a.at}">${titleFor(world.places[a.at])} \u2192</button></div>`);
  return parts.join("");
}

function anyUnitsFree() {
  return active().units.some((def) => availableUnits(def.id) > 0);
}

export function detailHTML(p) {
  const parts = [];
  parts.push(armyHTML(p));
  if (p.adversary) {
    const adv = active().adversaries.find((a) => a.id === p.adversary);
    const st = playerByKey(p.adversary);
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
      ? `<b>${esc(seatName())}.</b> Your seat — the ${noun} everything else is measured from.`
      : `<b>Your seat.</b> The ${noun} everything else is measured from.`);
  }
  else if (mine) parts.push(`<b>Your ${noun}</b> — ${p.terrain}. ${TERRAIN_FLAVOR[p.terrain] || ""}`);
  // People live here (engine rework E1): every owned hex reports its
  // population against what the ground supports. Displayed floored, so this
  // string -- and therefore the content-diffed re-render -- moves only when a
  // whole person arrives.
  if (mine) parts.push(`<span class="tile-pop">People: <b>${hexPop(p.id)}</b> of ${capOf(p.id)} this ${p.terrain === "water" ? "water" : "ground"} supports.</span>`);
  else parts.push(`<b>${capWord(p.terrain)}</b> — ${TERRAIN_FLAVOR[p.terrain] || ""}`);

  const built = mine ? hexUse(p.id) : null;
  if (mine && built.kind === "structure") {
    // The hex's one use is taken -- there is no parallel town beside the
    // fields. What it offers instead is the way back out, and that costs.
    const def = structureDef(built.id);
    const y = hexYield(p.id);
    const ground = terrainYield(p.id);
    parts.push(`<span class="tile-built"><b>${def ? def.name : built.id}.</b> ${
      y ? `Yields ${y.res} at ${fmtRate(y.rate)}${ground && ground.res !== y.res
            ? ` — this ground would give ${ground.res} on its own.` : "."}`
        : `It produces nothing${ground ? `, and the ${ground.res} this ground would give stops with it` : ""}.`}</span>`);
    if (def && def.trades) parts.push(marketHTML());
    parts.push(`<div class="map-actions"><button class="map-act warn" data-act="demolish" data-tile="${p.id}">Pull it down</button></div>`);
    parts.push(`<span class="map-noworks">Pulling it down returns the hex to plain ground. Nothing is refunded.</span>`);
  } else if (mine) {
    // WHAT THE GROUND GIVES. One resource per terrain, worked automatically --
    // there is nothing to point this hex at, so there is nothing to click. The
    // decision moved up: which ground you claim, and what you raise on it.
    const ground = terrainYield(p.id);
    parts.push(ground
      ? `<span class="tile-works">Works its own ground: <b>${capWord(ground.res)}</b> ${fmtRate(ground.rate)}.</span>`
      : `<span class="map-noworks">Nothing here can be worked.</span>`);
    // WHAT CAN BE RAISED HERE. Only structures this era declares, whose unlock
    // is owned, and whose terrain this is; the price is printed, and the
    // refusal reason with it, because an option you cannot afford still has to
    // be readable (interface.md). Never on the seat.
    let anyBuild = false;
    for (const def of (canBuildOn(p.id) ? (active().structures || []) : [])) {
      if (!structureUnlocked(def.id)) continue;
      if (!structureFits(def.id, p.id)) continue;
      const plan = structurePlan(def.id);
      if (!plan) continue;
      anyBuild = true;
      const queued = pendingBuild(p.id);
      const broke = !canAfford(plan.cost);
      parts.push(`<div class="map-actions"><button class="map-act" data-act="build" data-tile="${p.id}" data-struct="${def.id}"${
        queued || broke ? " disabled" : ""}>Build ${def.name}</button></div>`);
      const replaces = def.yield && ground && def.yield.res !== ground.res
        ? ` Instead of ${ground.res}.` : def.yield ? "" : ` The ${ground ? ground.res : "yield"} stops.`;
      parts.push(`<span class="map-noworks">${
        queued ? "Work is already under way on this hex."
        : `${costLine(plan.cost)} · ${plan.time}s. ${def.desc}${replaces}${cappedNote(plan.cost)}`}</span>`);
    }
    if (!anyBuild && canBuildOn(p.id)) {
      parts.push(`<span class="map-noworks">Nothing this age knows how to build belongs on ${p.terrain === "river" ? "a river" : `${p.terrain}`}.</span>`);
    }
  } else if (!mine && tilesEra() && p.terrain !== "water") {
    const gy = yieldOf(p.terrain);
    const best = gy ? [gy.res] : [];
    const plan = settlePlan(p.id);
    if (plan) {
      // The settle verb: wilderness is claimable, as queued and priced work --
      // within the age's SCOPE (dominionCap): what one era can hold is finite,
      // and holding more is what an era advance means.
      const queued = pendingSettle(p.id);
      const capped = !queued && atDominionCap();
      const broke = !queued && !capped && !canAfford(plan.cost);
      parts.push(`<div class="map-actions"><button class="map-act" data-act="settle" data-tile="${p.id}"${queued || capped || broke ? " disabled" : ""}>Settle</button></div>`);
      parts.push(`<span class="map-noworks">${queued
        ? "A party is already on its way."
        : capped
        ? `Your people hold all ${dominionCap()} lands this age can govern. A new age must dawn before the banner spreads further.`
        : `${costLine(plan.cost)} · ${plan.time}s${plan.tilesOff != null ? ` · ${plan.tilesOff} tiles off` : ""}${best.length ? ` · best worked for ${best.join(" or ")}` : ""}. Stake the ground, raise a hearth — one more ${spec().tileNoun.singular}.${cappedNote(plan.cost)}`}</span>`);
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
  // Allocation contributes a monotonic STAMP, not a serialisation of the work
  // map. This runs on every renderMapStage -- five times a second -- and it
  // used to JSON.stringify an object that grows with the dominion, in the one
  // function whose entire job is making the common case cheap. setHexWork is
  // the only writer, so a counter it bumps is exactly as sensitive and O(1).
  return [me().era, (holdings()).join("|"),
    ((S.map && me().revealed) || []).length,
    ((S.map && me().sighted) || []).length,
    workStamp(), armyStamp(), selectedId, selectedArmy].join("~");
}

// WHERE EVERY BANNER IS AND HOW BIG IT IS. Found by looking at the board rather
// than by reasoning about it (2026-08-26): without this the stage never
// rebuilt when an army moved, was raised, or lost anyone, so the board kept
// drawing a column that had marched away. Everything else in the signature is
// a standing fact about the ground; an army is the first thing on this board
// that moves on its own, and the signature is what has to notice.
//
// Cheap on purpose -- this runs five times a second. There are a handful of
// armies in a run, so walking them costs less than the JSON.stringify this
// function was written to avoid.
function armyStamp() {
  let out = "";
  for (const pl of S.players || []) {
    // Order and step ride along so the path preview redraws as the road is
    // walked, and the marching bob starts the moment an order lands.
    for (const a of pl.armies || []) {
      out += pl.id + ":" + a.at + ":" + armySize(a) + ":" + (a.order ? a.order.to : "") + ":" + (a.step || 0) + ",";
    }
  }
  return out;
}

// What owned country REPORTS: what it is producing. Lifted out because two
// tiles need it -- an ordinary holding, and your seat, which wears a house AND
// reports its work.
function workMark(id) {
  // Asks the use seam (map/map.js) rather than reading the slot, so a hex that
  // carries a structure reports the structure's mark rather than silently
  // printing a raw id as though it were a resource letter.
  // THE BOARD REPORTS WHAT A HEX PRODUCES, however it produces it. A built hex
  // used to draw one shared block, which was fine while `farm` was the only
  // structure with a yield and actively wrong the moment Bronze put a Copper
  // Mine and a Tin Mine on the same terrain -- two different economies wearing
  // the same mark. The letter follows the RESOURCE; `cls` still says whether a
  // structure stands there, so the two can be styled apart.
  const u = hexUse(id);
  const y = hexYield(id);
  if (u.kind === "structure") {
    if (y) return { glyph: WORK_GLYPH[y.res] || "\u25A0", cls: "built" };
    // A structure that yields nothing -- a March-hold, a Market -- carries its
    // own mark, because there is no resource to name it by.
    return { glyph: STRUCTURE_GLYPH[u.id] || "\u25A0", cls: "built" };
  }
  // Bare ground works its terrain, always. There is no resting hex any more,
  // so the quiet dash now means only "this ground yields nothing at all".
  return y ? { glyph: WORK_GLYPH[y.res] || "", cls: "work" } : { glyph: "\u2014", cls: "rest" };
}

// The mark a tile wears, in priority order -- home, then a named seat, then
// the work letter on owned country, then a minor's dot. This is the SAME
// ladder the SVG renderer draws, lifted out so both renderers read from one
// definition rather than drifting apart.
function baseMarkFor(p) {
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

// AN ARMY OUTRANKS THE GROUND IT STANDS ON. Everything else the ladder reports
// is a standing fact about a hex -- who holds it, what it grows. An army is a
// thing that ARRIVED, and while it is there it is the most important thing on
// the board, so it takes the mark and the hex's own work steps down to the
// second glyph. The tile panel still carries both.
//
// Pieces move HEX TO HEX rather than sliding along the road between them. That
// is the board game answer as much as the cheap one: a piece is on a space, or
// it is on a different space.
//
// FOG DECIDES WHOSE YOU SEE. Your own columns always draw -- you know where your
// own soldiers are. A foreign one appears only while you are actually sighting
// that ground, which is most of what scouting is going to be for: an army you
// cannot see is an army you cannot count.
function armyMarkFor(p) {
  for (const pl of S.players || []) {
    const a = armyAt(p.id, pl);
    if (!a) continue;
    const mine = pl.id === S.me;
    if (!mine && !isSighted(p.id)) continue;
    return {
      glyph: "\u2691", cls: "army" + (mine ? " mine" : " foe"), pid: pl.id,
      sub: { glyph: String(armySize(a)), cls: "armyn" + (mine ? " mine" : " foe") },
    };
  }
  return null;
}

export function markFor(p) {
  if (!isCharted(p.id)) return null;
  return armyMarkFor(p) || baseMarkFor(p);
}

// Ask the 3D stage to play the sink-and-rise on specific hexes. A no-op under
// `?map=2d` and before the stage is ready, which is why it is a function here
// rather than a call at each site: the CALLERS should be able to say "this hex
// changed" without knowing which renderer is listening.
//
// This is the general primitive the owner asked for rather than an era-ceremony
// special case: the re-dress, building a structure, demolishing one, and losing
// a hex to famine are all "this hex's contents changed", and all four route
// here. (2026-08-25.)
export function changedHexes(ids) {
  if (mode !== "3d" || !stage3d || !stage3d.changeHexes) return;
  stage3d.changeHexes(Array.isArray(ids) ? ids : [ids]);
}

// DEV TOOL, TEMPORARY (2026-08-25). Plays the sink-and-rise across every
// charted hex while changing nothing: the props go down, and the identical
// props come back up. It is the era re-dress with the re-dress left out, which
// is exactly what you want to look at when you are judging the MOTION rather
// than the content.
//
// Delete alongside the button in index.html, its listener in main.js, and the
// .chrome-btn.dev rule in styles.css.
export function devRedress() {
  if (!world) return 0;
  const ids = Object.values(world.places).filter((p) => isCharted(p.id)).map((p) => p.id);
  changedHexes(ids);
  return ids.length;
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
  // The GROUND's mark, deliberately: an army standing on a foreign seat must
  // not stop that seat's rim from reading as foreign.
  const m = baseMarkFor(p);
  if (!m) return null;                       // uncharted, or empty country
  if (m.cls === "seat") return FOREIGN;
  if (m.cls === "minor") return FOREIGN_MINOR;
  return null;
}

// WHAT WAS BUILT WHERE, last time we drew. The transition is driven from this
// diff rather than from the call sites that change a hex, and that is the fix
// for a real bug: a completed farm set its use inside completeConstruction()
// and the stage simply rebuilt, so the hay appeared rather than rising. Only
// DEMOLISH animated, because demolish was the one path that remembered to ask.
//
// Diffing here makes it automatic for every cause -- a build finishing, a
// demolition, a hex lost to a raid, an era re-dress -- and no future caller can
// forget. It also cannot fire on an ordinary work change (food -> wood), which
// moves no props and should not animate.
let lastBuilt = {};

function builtSnapshot() {
  const out = {};
  if (!world || !S.map) return out;
  for (const id of holdings()) {
    const u = hexUse(id);
    out[id] = u.kind === "structure" ? u.id : "";
  }
  return out;
}

// Hexes whose STRUCTURE changed since the last draw, including ground that has
// left the dominion entirely (a lost hex takes its works down with it).
function structuresChangedSince(prev, next) {
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed = [];
  for (const id of ids) if ((prev[id] || "") !== (next[id] || "")) changed.push(id);
  return changed;
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
    // ORDER MATTERS. Ask for the transition BEFORE handing over the new world:
    // a setWorld() arriving mid-sink is held until the props are underground
    // and applied unseen, so the new paint and the new props appear at the
    // bottom of the descent and rise together. Reversed, the hex would change
    // in full view and then politely animate.
    const now = builtSnapshot();
    const changed = structuresChangedSince(lastBuilt, now);
    lastBuilt = now;
    if (changed.length) changedHexes(changed);
    stage3d.setWorld(visiblePlaces(),
      { isOwned, isVisible, isCharted, homeId: world.home, era: me().era });
    stage3d.setSelected(selectedId);
    if (stage3d.setPieces) stage3d.setPieces(piecesForBoard());
    if (stage3d.setMarchPath) {
      const sel = selectedArmyObj();
      const marching = sel && sel.pl.id === S.me && sel.a.order && sel.a.path;
      stage3d.setMarchPath(
        marching ? [sel.a.at].concat(sel.a.path.slice(sel.a.step)) : null,
        playerColor().ring);
    }
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
  // Typed selection: an army outranks the ground. If a piece is selected the
  // panel is the ARMY's, and clicking a second disc swaps it in place -- if
  // comparing two armies cost a close-click each time, nobody would compare,
  // and then nobody would scout.
  const sel = selectedArmyObj();
  if (sel) {
    panel.classList.toggle("hidden", false);
    const html = armyDetailHTML(sel.pl, sel.a);
    if (html === lastDetail) return;
    lastDetail = html;
    const t = document.getElementById("tileTitle");
    if (t) t.textContent = sel.pl.id === S.me ? "Your Army" : capWord(civLabel(sel.pl));
    const bEl = document.getElementById("tileBody");
    if (bEl) bEl.innerHTML = html;
    return;
  }
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

// A disc was clicked: the army becomes the selection. In sending mode a
// click on an ENEMY disc aims the march at the ground it stands on instead --
// pointing at the army and pointing at its hex are the same gesture.
export function selectPiece(key) {
  const parts = String(key).split(":");
  const pl = S.players[Number(parts[0])];
  const a = pl && (pl.armies || []).find((x) => x.uid === Number(parts[1]));
  if (!a) return;
  if (sending != null && !(pl.id === S.me && a.uid === sending)) {
    selectTile(a.at);
    return;
  }
  selectedArmy = key;
  selectedId = a.at;                       // the ring stays on the ground they hold
  if (mode === "3d") stage3d.setSelected(a.at);
  else lastSignature = "";
  renderMapStage();
  lastDetail = "";
  renderTileDetail();
}

export function selectTile(id) {
  // A column waiting on a destination eats the next click on the board. The
  // order is given, the panel goes back to reading the hex, and the mode ends
  // -- one click, one order, no lingering mode to get stuck in. The army stays
  // selected, so the player watches their own order take effect: the panel
  // flips to "Marching on...", the road wears its dots.
  if (sending != null && id) {
    const uid = sending;
    sending = null;
    if (!marchRefusal(uid, id)) {
      orderMarch(uid, id);
      lastDetail = "";
      renderMapStage();
      renderTileDetail();
      return;
    }
  }
  selectedArmy = null;                     // ground click: back to the hex's own panel
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
      // The 3D board gets the ladder WITHOUT the army override (the discs
      // carry the armies) plus the march-path preview; the SVG debug board
      // keeps markFor whole, flags included, because it has no piece layer.
      markFor: stageMarkFor,
      // The renderer draws; it does not know whose board it is. Same rule the
      // mark ladder follows -- state arrives through hooks.
      palette: playerColor(),
      rimFor,
      // What is BUILT on a hex, as a bare id, for paint only. The renderer must
      // not learn what a farm IS -- it looks the id up in its own table of
      // colours and props, exactly as it does for terrain.
      builtOn: (id) => {
        const u = hexUse(id);
        return u.kind === "structure" && isCharted(id) ? u.id : null;
      },
      onPick: (id) => selectTile(id),
      onPickPiece: (key) => selectPiece(key),
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
      if (act === "raise") { openRaiseModal(btn.dataset.tile); return; }
      if (act === "viewarmy") { selectPiece(btn.dataset.key); return; }
      if (act === "viewhex") { sending = null; selectTile(btn.dataset.tile); return; }
      if (act === "stance") {
        setStance(Number(btn.dataset.army), btn.dataset.stance);
        lastDetail = ""; renderTileDetail();
        return;
      }
      if (act === "disband") {
        disbandArmy(Number(btn.dataset.army));
        lastSignature = ""; renderMapStage();
        lastDetail = ""; renderTileDetail();
        return;
      }
      if (act === "halt") {
        haltArmy(Number(btn.dataset.army));
        lastDetail = ""; renderTileDetail();
        return;
      }
      // MARCH IS TWO CLICKS, and the second one is on the board. An order is
      // aimed at ground you looked at, so the board is where you aim it --
      // there is no list of hex names anywhere in this game and there should
      // not be one.
      if (act === "send") {
        sending = sending === Number(btn.dataset.army) ? null : Number(btn.dataset.army);
        lastDetail = ""; renderTileDetail();
        return;
      }
      if (act === "settle") { launchSettle(btn.dataset.tile); lastDetail = ""; renderTileDetail(); return; }
      if (act === "caravan") { openCaravanModal(btn.dataset.adv); return; }
      if (act === "build") {
        launchStructure(btn.dataset.tile, btn.dataset.struct);
        lastDetail = ""; renderTileDetail();
        return;
      }
      if (act === "demolish") {
        demolishStructure(btn.dataset.tile);
        // No explicit changedHexes() here any more: renderMapStage diffs what
        // is built where and animates whatever moved, so demolition, a build
        // completing and a hex lost to a raid all behave the same way without
        // each remembering to ask.
        lastSignature = ""; renderMapStage();
        lastDetail = ""; renderTileDetail();
        return;
      }
      if (act === "trade") {
        if (!trade(btn.dataset.give, btn.dataset.get, 1)) return;
        lastDetail = ""; renderTileDetail();
        return;
      }
    });
  }
}
