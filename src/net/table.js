import { S, freshPlayer, freshState, me, setS } from "../core/state.js";
import { applyPlayerColor, freeColor } from "../core/palette.js";
import { initAdversaries } from "../core/persist.js";
import { ensureMap, seatFor, setPickedContinent, world } from "../map/map.js";
import { guestSession, hostSession, SNAPSHOT_HZ, tableSpeed } from "./session.js";
import { joinTable as relayJoin, onPaired, openTable as relayOpen } from "./transport.js";

// ---------- THE TABLE, in the browser (M1c) ---------------------------------
// Everything the page needs to know about there being a second person, in one
// module, so main.js stays a boot script and the sim stays ignorant. The rule
// that keeps this honest: the SIMULATION never imports this file. A guest is
// not a special kind of player -- it is an ordinary seat whose orders happen
// to arrive by socket, exactly as the design brief always said.
//
// WHERE THE RELAY LIVES. One line to change when it is deployed, overridable
// per-run with ?relay=ws://... so a local server can be tested against the
// hosted page and vice versa. No build step, no config file, no secret.
//
// THE RELAY IS WHEREVER THIS PAGE CAME FROM, on port 8787. Deriving it from
// the page's own host rather than hardcoding "localhost" is what makes LAN
// play zero-configuration: you serve the game from your machine, your brother
// opens http://192.168.x.x:8123, and his page looks for the relay at
// 192.168.x.x too -- because that is where the page came from, which is where
// the relay is. Hardcoding localhost would have sent him to his OWN machine,
// where nothing is running.
//
// AND IT IS STILL THE SAFETY PROPERTY (2026-08-28). On the publicly hosted
// page this resolves to the static host, which runs no relay -- and a browser
// refuses ws:// from an https:// page anyway -- so a stranger who clicks "Open
// a table" fails, exactly as before. Multiplayer stays inert for the public
// until somebody deliberately points it somewhere with ?relay=. Do not ship a
// real public relay until the hardening pass is done (todo.md → SECURITY: THE
// HARDENING PASS): the host trusts the shape of every message a guest sends,
// and the relay's buffers are unbounded.
const RELAY_PORT = 8787;

function derivedRelay() {
  try {
    const host = location.hostname || "localhost";
    // wss from https, ws from http: a browser blocks the insecure one on a
    // secure page, and getting this wrong looks like the relay being down.
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${host}:${RELAY_PORT}`;
  } catch (e) {
    return `ws://localhost:${RELAY_PORT}`;
  }
}

export function relayUrl() {
  try {
    const q = new URLSearchParams(location.search).get("relay");
    if (q) return q;
    const saved = localStorage.getItem("idleciv.relay");
    if (saved) return saved;
  } catch (e) {}
  return derivedRelay();
}
export function setRelayUrl(url) {
  try { localStorage.setItem("idleciv.relay", url); } catch (e) {}
}

// ---- What this client currently is -----------------------------------------
const table = {
  mode: "solo",        // "solo" | "host" | "guest"
  session: null,
  wire: null,
  code: null,
  peerHere: false,     // is the other seat connected?
  peerReady: false,    // ...and have they chosen a colour and a name?
  started: false,
  myThrottle: 1,       // this client's own speed cap (0 = pause)
  onChange: null,      // the lobby's redraw hook
  onEnterGame: null,   // fired when the world starts, on either side
};

export function tableState() { return table; }
export function isNetworked() { return table.mode !== "solo"; }
export function isHost() { return table.mode === "host"; }
export function isGuest() { return table.mode === "guest"; }
export function tableCode() { return table.code; }

function changed() { if (table.onChange) table.onChange(table); }

// ---- Opening a table (the host) --------------------------------------------
// The host keeps playing its own game while it waits; nothing about the world
// changes until Begin, because worldgen must happen AFTER the guest is seated
// (M0: seats are placed during generation).
export async function hostTable(hooks = {}) {
  const { wire, code } = await relayOpen(relayUrl());
  table.mode = "host";
  table.wire = wire;
  table.code = code;
  table.onChange = hooks.onChange || null;
  table.onEnterGame = hooks.onEnterGame || null;
  table.session = hostSession(wire, {
    onGuestSeat: () => { table.peerReady = true; changed(); },
    onGuestLeft: () => { table.peerHere = false; table.peerReady = false; changed(); },
    onThrottle: () => changed(),
  });
  onPaired(wire, () => { table.peerHere = true; changed(); table.session.sendLobby(); });
  changed();
  return code;
}

// THE HOST BEGINS, AND A TABLE IS A NEW RUN (fixed 2026-08-28, found in the
// first real two-machine game: the table inherited the host's Bronze Age save,
// so the guest was dropped into somebody else's half-played empire with a
// stone-age seat).
//
// Recutting the world was never enough -- the WORLD was fresh but the
// CIVILIZATIONS were not, still carrying the host's era, stores, upgrades and
// army. Sitting down at a table starts a game; what survives from the lobby is
// only what was chosen there: each seat's colour and name, and how many rivals
// the world holds.
// `setup` is the start screen's own picks -- {continent, color, name, bots}.
// They have to be passed IN rather than read from S, because the solo path
// applies them across a page reload (that is what `pendingChoices` is for) and
// hosting deliberately does not reload -- the socket would die with the page.
// Without this the host's world ignored its own Rivals and Seat choices, which
// is how a table asked for "no rivals" and got three.
export function beginHostedRun(setup = {}) {
  if (!isHost() || !table.session) return false;
  const hostP = me();
  const guestP = S.players[table.session.guestSeat] || null;
  const keep = {
    host: {
      color: setup.color || hostP.color,
      seatName: typeof setup.name === "string" ? setup.name.trim().slice(0, 24) : hostP.seatName,
    },
    // The colour they ASKED for, re-tried against this run's roster: a table
    // cut with fewer rivals frees colours the lobby had to substitute.
    guest: guestP ? { wanted: guestP.colorWanted || guestP.color, seatName: guestP.seatName } : null,
    bots: setup.bots === null || typeof setup.bots === "number" ? setup.bots : S.bots,
  };
  setPickedContinent(setup.continent);
  setS(freshState());
  S.bots = keep.bots;
  S.players[0].color = keep.host.color;
  S.players[0].seatName = keep.host.seatName;
  initAdversaries();            // this run's rivals, however many were asked for
  if (keep.guest) {
    const taken = S.players.map((x) => x.color);
    const g = freshPlayer(S.players.length, {
      color: freeColor(keep.guest.wanted, taken),
      seatName: keep.guest.seatName,
    });
    g.colorWanted = keep.guest.wanted;
    g.remote = true;            // still never written into the host's own save
    S.players.push(g);
    table.session.guestSeat = g.id;
  }
  ensureMap();                  // cut for two guaranteed seats (M0)
  table.session.begin();
  table.started = true;
  applyPlayerColor();
  if (table.onEnterGame) table.onEnterGame();
  changed();
  return true;
}

// ---- Joining a table (the guest) -------------------------------------------
export async function joinTable(code, hooks = {}) {
  const { wire } = await relayJoin(relayUrl(), code);
  table.mode = "guest";
  table.wire = wire;
  table.code = String(code || "").toUpperCase().trim();
  table.onChange = hooks.onChange || null;
  table.onEnterGame = hooks.onEnterGame || null;
  table.peerHere = true;
  table.session = guestSession(wire, {
    onLobby: () => changed(),
    onBegin: () => {
      table.started = true;
      // The snapshot replaced S wholesale, so everything the page caches about
      // the old world is stale by definition: colour, board, panels.
      applyPlayerColor();
      if (table.onEnterGame) table.onEnterGame();
      changed();
    },
    onSnapshot: () => { if (hooks.onSnapshot) hooks.onSnapshot(); },
    onHostLeft: () => { table.peerHere = false; changed(); },
  });
  table.session.hello();
  changed();
  return true;
}

export function chooseSeat(color, name) {
  if (isGuest() && table.session) table.session.choose(color, name);
}

// ---- The shared clock ------------------------------------------------------
// Every player has a throttle; the world runs at the minimum (design.md → The
// speed cap). Versus a human the legal set is {0, 1}: speed in adversarial
// hands is an attention weapon.
export function setMyThrottle(v) {
  table.myThrottle = v;
  if (table.session && table.session.transport) {
    try { table.session.transport.send({ t: "throttle", value: v }); } catch (e) {}
  }
}
export function effectiveSpeed(localSpeed) {
  if (!isNetworked() || !table.started) return localSpeed;
  // A table of one is not throttled by an absent seat -- but an ABSENT GUEST
  // pauses the world by ruling (the world holding still for a missing player
  // is this game's own contract, applied to multiplayer).
  if (!table.peerHere) return 0;
  const theirs = table.session ? table.session.peerThrottle : null;
  return tableSpeed(Math.min(localSpeed, 1), theirs);
}

// ---- The host's snapshot pump ----------------------------------------------
// Called from the game loop. Wall-clock paced rather than tick-paced on
// purpose: a paused world still needs to tell the guest that it is paused.
let lastPush = 0;
export function pumpNetwork(nowMs) {
  if (!isHost() || !table.started || !table.session) return;
  if (!table.peerHere) return;
  if (nowMs - lastPush < 1000 / SNAPSHOT_HZ) return;
  lastPush = nowMs;
  table.session.pushSnapshot();
}

// Where this client's own seat sits, for the opening camera.
export function mySeatHex() {
  return (me() && seatFor(me())) || (world && world.home) || null;
}

export function leaveTable() {
  if (table.session) table.session.close();
  // THE REMOTE SEAT LEAVES WITH THE TABLE. Their ground returns to the wild
  // rather than sitting under a player nobody is driving; the record is
  // trailing, so dropping it moves nobody else's id (which is their index,
  // and keys the ownership table).
  if (isHost()) {
    while (S.players.length > 1 && S.players[S.players.length - 1].remote) {
      const gone = S.players.pop();
      if (S.map && S.map.owner) {
        for (const id in S.map.owner) if (S.map.owner[id] === gone.id) delete S.map.owner[id];
      }
    }
  }
  table.mode = "solo";
  table.session = null; table.wire = null; table.code = null;
  table.peerHere = false; table.peerReady = false; table.started = false;
  changed();
}
