import { active } from "../content/compile.js";
import { S, me, playerById } from "../core/state.js";
import { colorById } from "../core/palette.js";
import { scriptOf } from "../sim/contact.js";
import { armyBand } from "../sim/armies.js";
import { world } from "../map/map.js";
import { PERSON_ICONS } from "./icons.js";

// ---------- THE BATTLE PANEL ------------------------------------------------
// The dice on the table. The owner's ruling, whole: "throw up a BATTLE panel in
// front of each player, line up units on top and bottom of the screen (player's
// perspective is theirs always bottom) and visibly show the dice rolling, or at
// least show the dice results. We could hide this, but let's lean into the
// board game aspect. That would give the player an exact reason why they lost,
// and occasionally an unlikely win on a must-win battle is a story to tell
// people."
//
// WHAT THIS PANEL IS: a live view of the script the sim is already playing.
// The resolver decided everything at the seal; contact.js plays one round per
// battleRoundSeconds and emits each round over the bus; this module draws
// whatever round just played. It is NOT an independent replay with its own
// clock -- which is precisely why it can never desync from the world, why
// pause freezes it (the sim stops emitting), why fast-forward speeds it, and
// why reopening mid-fight lands on the LIVE round with no machinery: there is
// no other round to land on.
//
// THE PANEL ALWAYS OPENS (owner): never withheld for being a small fight,
// because that would hide something the player wanted to know. The close
// button is the player's answer -- the roll-off finishes in the background and
// the Chronicle logs the outcome. Closing is per-battle and never remembered:
// the game must not infer a preference from a dismissal.
//
// NEVER THE ODDS. The panel shows inputs and events -- dice, faces, hits,
// casualties, the wall coming down -- and lets the player do the judging.

let built = false;
let currentId = null;
const dismissed = new Set();   // battle ids closed by hand; session-local
let hideTimer = null;

// ---- The skeleton, built once (create-once law) ----------------------------

function mount() {
  const host = document.getElementById("battleMount");
  return host || document.body || null;
}

function ensure() {
  if (built) return true;
  const host = mount();
  if (!host || !host.appendChild) return false;
  const el = document.createElement("div");
  el.id = "battlePanel";
  el.className = "hidden";
  el.innerHTML =
    `<div class="bp-head">` +
      `<span class="bp-title" id="bpTitle">Battle</span>` +
      `<span class="bp-round" id="bpRound"></span>` +
      `<button id="bpClose" class="map-act">Just tell me how it ends</button>` +
    `</div>` +
    `<div class="bp-side foe" id="bpFoe"></div>` +
    `<div class="bp-wall hidden" id="bpWall"><div class="bp-wall-fill" id="bpWallFill"></div><span class="bp-wall-label" id="bpWallLabel"></span></div>` +
    `<div class="bp-flash hidden" id="bpFlash"></div>` +
    `<div class="bp-side mine" id="bpMine"></div>` +
    `<div class="bp-outcome hidden" id="bpOutcome"></div>`;
  host.appendChild(el);
  const close = document.getElementById("bpClose");
  if (close && close.addEventListener) {
    close.addEventListener("click", () => {
      // A close DURING the fight is a real dismissal -- do not reopen this
      // battle. A close after the outcome is just tidying up.
      const out = document.getElementById("bpOutcome");
      const stillFighting = out && out.classList.contains("hidden");
      if (currentId != null && stillFighting) dismissed.add(currentId);
      hide();
      openNextLive();
    });
  }
  built = true;
  return true;
}

function hide() {
  const el = document.getElementById("battlePanel");
  if (el) el.classList.add("hidden");
  currentId = null;
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

// ---- Who is who ------------------------------------------------------------

function involvesMe(b) { return b.atk.pid === S.me || b.def.pid === S.me; }
function mySide(b) { return b.atk.pid === S.me ? "atk" : "def"; }
function foeName(b) {
  const foePid = b.atk.pid === S.me ? b.def.pid : b.atk.pid;
  const p = playerById(foePid);
  const adv = p && active().adversaries.find((a) => a.id === p.key);
  return adv ? adv.name.charAt(0).toUpperCase() + adv.name.slice(1) : "The enemy";
}
function placeWord(hexId) {
  const p = world && world.places[hexId];
  return p ? "the " + p.terrain : "the field";
}

// Counts on each side as of round r: the sealed roster minus everything lost
// in rounds 0..r-1. Computed from the script, never from the live armies --
// the panel shows the war at its own pace even if a fast clock has the sim a
// hair ahead, and it needs no armies to still exist when the ending shows.
function countsAt(b, script, side, r) {
  const out = Object.assign({}, b[side].roster);
  for (let i = 0; i < r && i < script.rounds.length; i++) {
    for (const l of script.rounds[i][side === "atk" ? "attacker" : "defender"].lost) {
      out[l.id] = Math.max(0, (out[l.id] || 0) - l.n);
    }
  }
  return out;
}

// ---- Rendering -------------------------------------------------------------

const MAX_DICE_SHOWN = 16;

function diceHTML(stack) {
  if (stack.silent) return `<span class="bp-waiting">behind the walls — waiting for the breach</span>`;
  if (!stack.faces.length) return "";
  const shown = stack.faces.slice(0, MAX_DICE_SHOWN);
  let html = shown.map((f) =>
    `<span class="bp-die${f >= stack.hit ? " hit" : ""}">${f}</span>`).join("");
  if (stack.faces.length > shown.length) {
    const restHits = stack.faces.slice(MAX_DICE_SHOWN).filter((f) => f >= stack.hit).length;
    html += `<span class="bp-more">+${stack.faces.length - shown.length} more · ${restHits} hit</span>`;
  }
  return html;
}

function unitName(uid, pid) {
  const p = playerById(pid);
  const def = active(p || me()).units.find((u) => u.id === uid);
  return def ? def.name : uid;
}

// One side's block for one round. `sideKey` is "atk"/"def"; `rollKey` matches
// the script's naming. Rows are unit stacks: icon, name x count, this round's
// dice, and losses flashing as they land.
function sideHTML(b, script, sideKey, r) {
  const pid = b[sideKey].pid;
  const counts = countsAt(b, script, sideKey, r);
  const round = script.rounds[Math.min(r, script.rounds.length - 1)];
  const roll = round ? round[sideKey === "atk" ? "attacker" : "defender"] : null;
  const rows = [];
  for (const uid in b[sideKey].roster) {
    const n = counts[uid] || 0;
    const stack = roll && roll.roll.stacks.find((x) => x.id === uid);
    const lost = roll && roll.lost.find((l) => l.id === uid);
    if (n <= 0 && !lost) continue;   // wiped in an earlier round: row retires
    rows.push(
      `<div class="bp-row${stack && stack.silent ? " silent" : ""}">` +
        `<span class="bp-unit">${PERSON_ICONS[uid] || ""}<b>${n}</b> ${unitName(uid, pid)}` +
          `<span class="army-stat">hits on ${stack ? stack.hit : "?"}+</span></span>` +
        `<span class="bp-dice">${stack ? diceHTML(stack) : ""}</span>` +
        (lost ? `<span class="bp-lost">−${lost.n}</span>` : "") +
      `</div>`);
  }
  return rows.join("");
}

function renderRound(b, r) {
  const script = scriptOf(b);
  const mine = mySide(b);
  const foe = mine === "atk" ? "def" : "atk";
  // THE ENEMY WEARS THEIR OWN COLOUR (owner, 2026-08-26): the discs already
  // do, and the panel's stripe matches the piece on the board -- white-means-
  // foreign is dying wherever a player colour exists to replace it.
  const foeEl0 = document.getElementById("bpFoe");
  if (foeEl0 && foeEl0.style) {
    const fp = playerById(b[foe].pid);
    foeEl0.style.borderLeftColor = (colorById(fp && fp.color) || {}).ring || "#ffffff";
  }
  const titleEl = document.getElementById("bpTitle");
  if (titleEl) {
    titleEl.textContent = `⚔ ${foeName(b)} at ${placeWord(b.hex)}` +
      ` — a ${armyBand(Object.values(b[foe].roster).reduce((a, x) => a + x, 0)).name}`;
  }
  const roundEl = document.getElementById("bpRound");
  if (roundEl) roundEl.textContent = `round ${Math.min(r + 1, script.rounds.length)}`;
  const foeEl = document.getElementById("bpFoe");
  if (foeEl) foeEl.innerHTML = sideHTML(b, script, foe, r);
  const mineEl = document.getElementById("bpMine");
  if (mineEl) mineEl.innerHTML = sideHTML(b, script, mine, r);

  // The wall strip: the pool draining round by round, and the breach flash --
  // the beat this panel exists for, every greyed melee row lighting up next
  // round.
  const wallEl = document.getElementById("bpWall");
  const round = script.rounds[Math.min(r, script.rounds.length - 1)];
  if (wallEl) {
    if (script.wallsStart > 0 && round) {
      wallEl.classList.remove("hidden");
      const fill = document.getElementById("bpWallFill");
      if (fill) fill.style.width = Math.round((round.wallsAfter / script.wallsStart) * 100) + "%";
      const label = document.getElementById("bpWallLabel");
      if (label) label.textContent = round.wallsAfter > 0 ? `walls ${round.wallsAfter}` : "the walls are down";
    } else {
      wallEl.classList.add("hidden");
    }
  }
  const flash = document.getElementById("bpFlash");
  if (flash) {
    if (round && round.breached) {
      flash.textContent = "THE WALL COMES DOWN";
      flash.classList.remove("hidden");
    } else {
      flash.classList.add("hidden");
    }
  }
}

function open(b, r) {
  if (!involvesMe(b) || dismissed.has(b.id)) return;
  if (!ensure()) return;
  currentId = b.id;
  const el = document.getElementById("battlePanel");
  if (el) el.classList.remove("hidden");
  const out = document.getElementById("bpOutcome");
  if (out) out.classList.add("hidden");
  const close = document.getElementById("bpClose");
  if (close) close.textContent = "Just tell me how it ends";
  renderRound(b, r);
}

// Another battle already live when this one closes? The always-open rule
// applies to it too.
function openNextLive() {
  const next = (S.battles || []).find((x) => involvesMe(x) && !dismissed.has(x.id));
  if (next) open(next, next.round);
}

// ---- The bus handlers (wired in ui/wire.js) --------------------------------

export function onBattleSealed({ b }) {
  if (!involvesMe(b)) return;
  // A new battle outranks a finished one still lingering, never a live one.
  if (currentId != null && currentId !== b.id) {
    const current = (S.battles || []).find((x) => x.id === currentId);
    if (current) return;   // a war is already on screen; Chronicle carries this one
  }
  open(b, 0);
}

export function onBattleRound({ b, round }) {
  if (!involvesMe(b)) return;
  if (dismissed.has(b.id)) return;
  if (currentId == null) { open(b, round); return; }
  if (currentId !== b.id) return;
  renderRound(b, round);
}

export function onBattleEnded({ b, script }) {
  if (!involvesMe(b) || currentId !== b.id) return;
  renderRound(b, Math.max(0, script.rounds.length - 1));
  const mine = mySide(b);
  const iHold = (script.holder === "attacker") === (mine === "atk");
  const o = script.outcome;
  const line =
    o === "mutual" ? "No one is left standing on either side." :
    iHold && mine === "def" ? "Your soldiers hold the ground. The attack is broken." :
    iHold ? "The ground is yours." :
    o === "attackerWithdrew" && mine === "atk" ? "Your army falls back — the standing order held them to it." :
    o === "defenderWithdrew" && mine === "def" ? "Your soldiers withdraw in good order." :
    mine === "atk" ? "Your army is destroyed. No one returns." : "The ground is lost.";
  const out = document.getElementById("bpOutcome");
  if (out) {
    out.textContent = line;
    out.className = "bp-outcome" + (iHold ? " won" : " lost");
  }
  const close = document.getElementById("bpClose");
  if (close) close.textContent = "Close";
  // The ending lingers long enough to read, then clears itself off the board.
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { hide(); openNextLive(); }, 7000);
}

// The hex panel's "watch" route back in: reopening mid-fight lands on the LIVE
// round, because there is no other round to land on.
export function watchBattle(b) {
  if (!b) return;
  dismissed.delete(b.id);
  open(b, b.round);
}
