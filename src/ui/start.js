import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { playtime } from "../core/derived.js";
import { suppressSaves } from "../core/persist.js";
import { S, me } from "../core/state.js";
import { CONTINENTS } from "../map/continents.js";
import { DEFAULT_COLOR, PLAYER_COLORS } from "../core/palette.js";
import { fmtTime, renderAll, setPreGame } from "./chrome.js";
import {
  beginHostedRun, chooseSeat, hostTable, isGuest, isHost, joinTable,
  leaveTable, mySeatHex, relayConfigured, relayUrl, tableState,
} from "../net/table.js";
import { selectTile } from "./map.js";


// The pre-game screen (phase 10, slice 1). Two jobs, both small and both
// deliberately separated from everything else that is about to change:
//
//   1. The run does not begin until the player says so. Landing straight into
//      a live clock reads as sudden; a board you start is a board you sat down
//      at. This is the same instinct as the pause-modal seam -- the game may
//      wait for a person.
//   2. It gives the continent picker (slice 5) a room to move into. The picker
//      is content for this screen, not a new surface, so the boot-flow state
//      machine gets built and verified once, now, while the map is still
//      stable.
//
// Deliberately NOT in the save, matching `paused` and `speed`: which screen you
// are looking at is not a property of the settlement, so a reload always lands
// back here with Continue waiting rather than resuming mid-stride.

// A new run reloads the page rather than rebuilding state in place. That is the
// deliberate choice: `setS(freshState())` would leave every module-level render
// cache holding the dead run -- the map's `world`, `selectedId` and
// `lastSignature`, the Chronicle's DOM and its seen-reveals set, each panel's
// `last*` diff string. Reloading cannot leave any of them stale, costs a flash
// on a local page, and is the same path `hardReset` already trusts. The flag
// survives the reload in sessionStorage so the fresh run skips this screen
// instead of asking a player who just answered.
const AUTOSTART = "idleciv.autostart";
// The three choices a new run is started with, stashed across freshRun()'s
// reload in the same breath as AUTOSTART. They cannot simply be written to S:
// the reload throws that S away, which is the entire point of reloading.
const CHOICES = "idleciv.newrun";

// What the screen is currently offering. Null continent means Random, which is
// the DEFAULT and is not a special case anywhere downstream -- Random is the
// absence of a pick, so the continent falls to the run seed, which is what lets
// a bare seed number reproduce a random run exactly.
// `bots: null` means every rival the era authors, which is the default and
// what the game has always done. A number caps them, and 0 is an EMPTY WORLD --
// no rival peoples, no minor steadings, just the players and the ground.
let choice = { continent: null, color: DEFAULT_COLOR, name: "", bots: null };

export function stashChoices() {
  try { sessionStorage.setItem(CHOICES, JSON.stringify(choice)); } catch (e) {}
}

// Read once and clear, exactly like pendingAutostart(): a choice is consumed by
// the run it starts, and must never leak into the next one.
export function pendingChoices() {
  try {
    const raw = sessionStorage.getItem(CHOICES);
    if (!raw) return null;
    sessionStorage.removeItem(CHOICES);
    const c = JSON.parse(raw);
    return c && typeof c === "object" ? c : null;
  } catch (e) { return null; }
}

export function pendingAutostart() {
  try {
    if (sessionStorage.getItem(AUTOSTART)) {
      sessionStorage.removeItem(AUTOSTART);
      return true;
    }
  } catch (e) {}
  return false;
}

function resumeLine() {
  const m = active();
  const noun = me().pop === 1 ? m.popNoun.singular : m.popNoun.plural;
  return `${m.name} · ${fmtTime(playtime())} · ${me().pop} ${noun}`;
}

function beginRun() {
  const screen = document.getElementById("startScreen");
  if (screen) screen.classList.add("hidden");
  setPreGame(false);
  // THE FOCUS OPENS ON YOUR OWN SEAT, whichever seat that is. Boot does this
  // for a solo run using the world origin, which is player 0's capital -- a
  // guest arriving at a table has to be pointed at THEIRS instead, or the
  // game opens looking at somebody else's country.
  const mine = mySeatHex();
  if (mine) selectTile(mine);
  renderAll();
}

// EVERY new run goes through the reload, including the very first one on a
// machine with no save. It used to branch -- "Begin" started in place, "New
// Game" reloaded -- and the picker makes that branch wrong: the world is
// generated during boot, well before this screen is shown, so a continent
// chosen here can only take effect on the next boot. Rebuilding in place is
// the alternative and it is the thing this file already warns against, since
// every module-level render cache would still be holding the dead run.
function freshRun() {
  suppressSaves();
  stashChoices();
  try {
    localStorage.removeItem(CONFIG.saveKey);
    sessionStorage.setItem(AUTOSTART, "1");
  } catch (e) {}
  location.reload();
}

// ---------- The three choices ----------------------------------------------
// Rendered as buttons rather than <select>s on purpose: this is the moment you
// pick your piece off the box lid, and a dropdown hides two of the three worlds
// behind a click. It also keeps the screen readable as ONE screen with one
// decision on it, which is the standing constraint (todo.md) -- three short
// rows, a word of label each, no headings.
function buildChoiceButtons(host, items, get, set) {
  host.innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "start-choice" + (it.swatch ? " swatch" : "");
    b.dataset.value = it.value === null ? "" : it.value;
    if (it.swatch) {
      b.style.setProperty("--sw", it.swatch);
      b.setAttribute("aria-label", it.label);
      b.title = it.label;
    } else {
      b.textContent = it.label;
      if (it.title) b.title = it.title;
    }
    b.addEventListener("click", () => { set(it.value); paint(); });
    host.appendChild(b);
  }
  // Selection is a border-weight and a check, never opacity -- Bureau's first
  // law outlives Bureau and applies to this screen too.
  function paint() {
    for (const b of host.children) {
      const v = b.dataset.value === "" ? null : b.dataset.value;
      b.classList.toggle("on", v === get());
    }
  }
  paint();
}

function initChoices() {
  const worlds = document.getElementById("startContinents");
  const colors = document.getElementById("startColors");
  const name = document.getElementById("startName");

  if (worlds) {
    // Random leads, and is the default: a veteran rolls it for the where-am-I
    // drama, and a new player is not asked to choose between three proper
    // nouns that mean nothing to them yet (map.md 2.6, know-then-not-know).
    buildChoiceButtons(worlds, [
      { value: null, label: "Random", title: "Drawn from the run's seed." },
      ...CONTINENTS.map((c) => ({ value: c.id, label: c.name, title: c.blurb })),
    ], () => choice.continent, (v) => { choice.continent = v; });
  }
  if (colors) {
    buildChoiceButtons(colors, PLAYER_COLORS.map((c) => ({
      value: c.id, label: c.name, swatch: c.ring,
    })), () => choice.color, (v) => { choice.color = v; pushSeatChoice(); });
  }
  if (name) {
    name.value = "";
    name.addEventListener("input", () => { choice.name = name.value; pushSeatChoice(); });
  }
  const bots = document.getElementById("startBots");
  if (bots) {
    // A COUNT, not a switch (owner, 2026-08-28). None is what a
    // human-vs-human playtest wants -- a baseline needs one variable, and
    // three rival peoples on their own clocks answer "is this fun?" before
    // the players get to -- but the same control is the world-density dial
    // afterwards, so it is authored as one from the start. The values are
    // strings because the buttons carry them in a dataset.
    buildChoiceButtons(bots, [
      { value: "all", label: "All", title: "Every people this age knows — the full world." },
      { value: "1", label: "1", title: "One rival people, and the warlike one at that." },
      { value: "2", label: "2", title: "Two rival peoples." },
      { value: "0", label: "None", title: "An empty world: no rival peoples, no steadings. Just the players and the ground." },
    ], () => (choice.bots == null ? "all" : String(choice.bots)),
       (v) => { choice.bots = v === "all" ? null : Number(v); });
  }
}

// ---------- The table (M1c) -------------------------------------------------
// The lobby IS this screen, and that is a constraint rather than a layout
// choice: seats are placed during worldgen (M0), so the guest has to be at the
// table before the world exists. Everything here is therefore pre-run by
// construction -- there is no "invite someone into a game already underway",
// and the design is better for it.
//
// The colour and seat-name rows above are reused rather than duplicated: a
// guest picks its piece from the same three rows the host does, and the host
// simply refuses a colour already worn.

let enterGame = null;   // set by initStartScreen; how a run actually begins

function tableEls() {
  return {
    idle: document.getElementById("startTableIdle"),
    lobby: document.getElementById("startTableLobby"),
    code: document.getElementById("startTableCode"),
    who: document.getElementById("startTableWho"),
    begin: document.getElementById("startBegin"),
    note: document.getElementById("startTableNote"),
    actions: document.getElementById("startActions"),
    setupFor: document.getElementById("startSetupFor"),
  };
}

function paintTable() {
  const t = tableState();
  const el = tableEls();
  if (!el.idle || !el.lobby) return;
  const live = t.mode !== "solo";
  el.idle.classList.toggle("hidden", live);
  el.lobby.classList.toggle("hidden", !live);
  // The solo buttons step aside while a table is open: "New Game" mid-lobby
  // would silently strand the other person.
  if (el.actions) el.actions.classList.toggle("hidden", live);
  if (!live) { if (el.note) el.note.textContent = ""; return; }

  if (el.code) {
    el.code.textContent = isHost()
      ? `Your table: ${t.code}`
      : `At table ${t.code}`;
  }
  if (el.who) {
    el.who.textContent = isHost()
      ? (t.peerReady ? "They have taken their seat." :
         t.peerHere ? "Someone is here, choosing their colour…" :
         "Waiting for someone to join with the code.")
      : (t.started ? "The world is being handed over…" :
         "Seated. Waiting for the host to begin.");
  }
  if (el.begin) {
    // Only the host begins, and only once the other seat is chosen -- the
    // world cannot be cut for two until it knows there are two.
    el.begin.classList.toggle("hidden", !isHost() || !t.peerReady);
  }
  if (el.note) {
    el.note.textContent = isGuest()
      ? "Your colour and seat name above are yours; the world is the host's."
      : "Share the code. The world is cut once you both sit down.";
  }
}

function initTable() {
  const host = document.getElementById("startHost");
  const join = document.getElementById("startJoin");
  const code = document.getElementById("startCode");
  const begin = document.getElementById("startBegin");
  const leave = document.getElementById("startLeave");
  const note = document.getElementById("startTableNote");
  const say = (m) => { if (note) note.textContent = m; };

  // NO RELAY, NO TABLE -- said plainly rather than discovered by a timeout.
  // The hosted page has no relay configured until one is deployed, so a
  // visitor gets a straight sentence and a game they can still play alone.
  if (!relayConfigured()) {
    const idle = document.getElementById("startTableIdle");
    if (idle) idle.classList.add("hidden");
    say("Playing together needs a relay, and this copy has none configured. Single player works as it always has.");
    return;
  }

  const hooks = {
    onChange: paintTable,
    onEnterGame: () => { if (enterGame) enterGame(); },
  };

  if (host) host.addEventListener("click", async () => {
    say("Opening a table…");
    try { await hostTable(hooks); }
    catch (e) { say(`No relay at ${relayUrl()} — is it running?`); return; }
    paintTable();
  });

  if (join) join.addEventListener("click", async () => {
    const c = (code && code.value || "").trim();
    if (!c) { say("Enter the host's code."); return; }
    say("Joining…");
    try { await joinTable(c, hooks); }
    catch (e) { say(e && e.message ? e.message[0].toUpperCase() + e.message.slice(1) + "." : "Could not join."); return; }
    // The guest's colour and name are sent as chosen, and re-sent whenever
    // they change: the host is the one who knows what is already taken.
    chooseSeat(choice.color, choice.name);
    paintTable();
  });

  // The host's own picks travel with the order: hosting does not reload, so
  // nothing else would ever apply them.
  if (begin) begin.addEventListener("click", () => { beginHostedRun(choice); });
  if (leave) leave.addEventListener("click", () => { leaveTable(); paintTable(); });
  paintTable();
}

// A guest changing its colour or name after sitting down tells the host, so
// the two ends never disagree about who is wearing what.
function pushSeatChoice() {
  if (isGuest()) chooseSeat(choice.color, choice.name);
}

// `had` is load()'s answer: whether a run was actually restored.
export function initStartScreen(had) {
  const screen = document.getElementById("startScreen");
  // No screen in the DOM must never mean a game that cannot start. The hold
  // defaults to on, so this guard is the one thing standing between a missing
  // element and a frozen board.
  if (!screen) { setPreGame(false); return; }

  const resume = document.getElementById("startResume");
  const seed = document.getElementById("startSeed");
  const cont = document.getElementById("startContinue");
  const fresh = document.getElementById("startNew");

  if (seed) seed.textContent = `World seed ${S.seed}`;
  if (resume) {
    resume.textContent = had ? resumeLine() : "";
    resume.classList.toggle("hidden", !had);
  }

  // With no save there is nothing to continue and nothing to wipe, so the
  // screen asks one question with one button. The two-button form only appears
  // when the choice is real.
  if (cont) {
    cont.classList.toggle("hidden", !had);
    cont.addEventListener("click", beginRun);
  }
  if (fresh) {
    fresh.textContent = had ? "New Game" : "Begin";
    fresh.classList.toggle("primary", !had);
    fresh.addEventListener("click", freshRun);
  }

  // The setup rows belong to a NEW run and to nothing else. A run already
  // underway HAS a continent, a name and a colour, and all three are fixed for
  // its lifetime, so these controls must never read as applying to Continue.
  //
  // Hiding them outright when a save exists is the obvious fix and it is the
  // wrong one: New Game would then be unconfigurable, or would need a second
  // screen to configure it on. Instead they stay put and SAY who they are for,
  // but only when there is something to be confused with -- with no save, every
  // control on screen already belongs to the run you are about to start, and
  // the caption would be answering a question nobody asked.
  const setup = document.getElementById("startSetup");
  if (setup) {
    setup.classList.remove("hidden");
    const forNew = document.getElementById("startSetupFor");
    if (forNew) forNew.classList.toggle("hidden", !had);
    initChoices();
  }

  // THE TABLE. `beginRun` is how a run starts for either seat: the host has
  // just cut the world for two, the guest has just been handed one, and from
  // here the two clients are the same page looking through different seats.
  enterGame = beginRun;
  initTable();

  screen.classList.remove("hidden");
}
