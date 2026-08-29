import { S, freshPlayer, setS } from "../core/state.js";
import { freeColor } from "../core/palette.js";
import { onRecord } from "../core/journal.js";
import { issueEntry } from "../core/replay.js";
import { ensureMap, world } from "../map/map.js";
import { active } from "../content/compile.js";

// ---------- THE TABLE (M1, the antagonist spec) -----------------------------
// Two humans, one world. The model is HOST-AUTHORITATIVE SNAPSHOTS, chosen in
// the spec over lockstep for one reason: it cannot desync. The host's browser
// runs the only simulation there is; the guest sends VERBS and receives STATE.
// Float determinism, engine differences, mid-run joins and reconnects all stop
// being problems rather than being solved.
//
// WHY IT IS AFFORDABLE HERE, when it would not be in an action game: this
// world moves at five ticks a second, a march takes twelve seconds a hex, and
// the standing law says no order is ever better for being issued faster. A
// guest's order landing 100ms later than the host's is invisible by
// construction -- there is nothing in the design for latency to spoil.
//
// WHAT CROSSES THE WIRE, and nothing else:
//   lobby / seat / begin   -- the table, before the world exists
//   verb                   -- the guest's journal entry, forwarded
//   snap                   -- the host's whole state
//   throttle               -- each side's speed cap (the min() rule)
//   bye                    -- a seat leaving
//
// The guest ALSO applies its own verb locally the moment it issues it, and is
// then corrected by the next snapshot. That is optimistic prediction with an
// authoritative fix, and it is free here: the verb layer already journals
// every order (S3), so the forward is a listener rather than a refactor.

export const SNAPSHOT_HZ = 4;   // host pushes state this often, in world-ticks-agnostic wall time

// ---- The snapshot ----------------------------------------------------------
// A snapshot is the SAVE, which is already a correctness requirement ("save is
// load-bearing": stopping and resuming exactly). Reusing it means the wire
// format cannot drift from the save format, and every field that survives a
// reload survives a join for the same reason.
export function takeSnapshot() { return JSON.parse(JSON.stringify(S)); }

// What the WORLD's geometry depends on. The map is regenerated from the seed
// rather than saved, so a guest must rebuild it -- but only when one of these
// actually changes, or a 4Hz snapshot would regenerate a continent four times
// a second.
function worldSignature(state) {
  const m = state.map;
  if (!m) return "none";
  const era = (state.players && state.players[state.me] && state.players[state.me].era) || "?";
  return [m.seed, m.gen, m.continent, m.humanSeats || 1, era].join("|");
}

let lastSignature = null;

// APPLY A SNAPSHOT as this seat. `mySeat` is which player record this client
// is looking through -- the host's snapshot carries ITS own `me`, and the
// guest must keep its own view rather than adopting the host's.
export function applySnapshot(snap, mySeat) {
  const sig = worldSignature(snap);
  setS(snap);
  if (typeof mySeat === "number") S.me = mySeat;
  if (!world || sig !== lastSignature) {
    ensureMap();          // rebuild geometry only when the world actually differs
    lastSignature = sig;
  }
}

export function resetSnapshotCache() { lastSignature = null; }

// ---- The host --------------------------------------------------------------
// Owns the simulation, the lobby, and the truth. Everything it receives is a
// request; everything it sends is a fact.
export function hostSession(transport, opts = {}) {
  const o = Object.assign({ onGuestSeat: null, onGuestLeft: null, onThrottle: null }, opts);
  const session = {
    role: "host",
    transport,
    guestSeat: null,        // the player record id the guest is driving
    guestReady: false,      // they have chosen a colour and a name
    started: false,
    peerThrottle: null,     // their speed cap; null until they say
    // THE LOBBY, sent on connect and after every change: what the guest needs
    // to choose from. Colour exclusivity is the host's to enforce, because the
    // host is the one who knows every seat already taken (bots included).
    sendLobby() {
      transport.send({
        t: "lobby",
        continent: (S.map && S.map.continent) || null,
        taken: S.players.map((p) => p.color),
        started: this.started,
      });
    },
    // The guest picked. Their record is created HERE, on the host, because the
    // host owns the player list -- and it must exist before worldgen, since
    // the generator counts human seats.
    //
    // COLOUR EXCLUSIVITY IS ENFORCED HERE, not asked for politely. The guest's
    // screen cannot know what is taken (the bots' colours are the host's
    // business), so a requested colour already worn is REPLACED with the first
    // free one and reported back in the next lobby. Found in the first live
    // two-tab test: the guest picked teal and the Salt Nomads were already
    // wearing it -- two civs, one flag, which is exactly the collision
    // initAdversaries has always healed for the human's own pick.
    seatGuest(color, name) {
      if (this.started) return null;
      let p = this.guestSeat != null ? S.players[this.guestSeat] : null;
      const taken = S.players.filter((x) => x !== p).map((x) => x.color);
      const use = freeColor(color, taken);
      if (!p) {
        p = freshPlayer(S.players.length, { color: use, seatName: name });
        // WHAT THEY ASKED FOR, kept beside what they got. The roster they
        // collided with is the host's PRE-RUN one; a table cut with fewer
        // rivals frees colours up, and begin re-tries the original request
        // rather than leaving someone stuck with a substitute they never
        // chose. (Found live: asked for blue against three bots, got green,
        // and stayed green in a world with no bots at all.)
        p.colorWanted = color;
        // A REMOTE SEAT IS NOT PART OF THIS SAVE. A table is not resumable in
        // M1 -- the socket dies with the page and the relay forgets the room --
        // so persisting the guest would leave a PHANTOM human in the host's
        // solo game: a seat that eats one of the world's guarantees, holds
        // ground nobody drives, and appears on the board. Found in the first
        // live two-tab test, where a host reload produced three human seats
        // and two of them shared a hex.
        p.remote = true;
        S.players.push(p);
        this.guestSeat = p.id;
      } else {
        p.color = use;
        p.colorWanted = color;
        p.seatName = name;
      }
      this.guestReady = true;
      if (o.onGuestSeat) o.onGuestSeat(p);
      return p;
    },
    // BEGIN. The world is generated with both seats counted (M0), and the
    // guest's first snapshot IS their boot -- they never generate anything.
    begin() {
      this.started = true;
      transport.send({ t: "begin", seat: this.guestSeat, snap: takeSnapshot() });
    },
    pushSnapshot() {
      if (!this.started) return;
      transport.send({ t: "snap", snap: takeSnapshot() });
    },
    close() { try { transport.send({ t: "bye" }); } catch (e) {} transport.close(); },
  };

  transport.onMessage((msg) => {
    if (!msg || typeof msg.t !== "string") return;
    if (msg.t === "hello") { session.sendLobby(); return; }
    if (msg.t === "seat") {
      session.seatGuest(String(msg.color || "teal"), String(msg.name || "").slice(0, 24));
      session.sendLobby();
      return;
    }
    if (msg.t === "verb") {
      // THE GUEST'S ORDER, applied by the only simulation there is. It runs
      // through the SAME dispatcher a replay uses, which is the whole point of
      // the action layer: a remote human is a decision-maker calling verbs,
      // indistinguishable at this seam from a mouse or a card.
      const e = msg.entry;
      if (!e || e.pid !== session.guestSeat) return;   // a seat may only act as itself
      issueEntry(e);
      return;
    }
    if (msg.t === "throttle") {
      session.peerThrottle = Number(msg.value) || 0;
      if (o.onThrottle) o.onThrottle(session.peerThrottle);
      return;
    }
    if (msg.t === "bye") { if (o.onGuestLeft) o.onGuestLeft(); return; }
  });
  transport.onClose(() => { if (o.onGuestLeft) o.onGuestLeft(); });

  return session;
}

// ---- The guest -------------------------------------------------------------
// Drives a seat it does not simulate. It issues verbs locally for
// responsiveness, forwards them, and lets the host's next snapshot be the
// truth. It never ticks the world.
export function guestSession(transport, opts = {}) {
  const o = Object.assign({ onLobby: null, onBegin: null, onSnapshot: null, onHostLeft: null }, opts);
  const session = {
    role: "guest",
    transport,
    seat: null,             // which player record is mine, once the host says
    started: false,
    peerThrottle: null,
    lobby: null,
    hello() { transport.send({ t: "hello" }); },
    choose(color, name) { transport.send({ t: "seat", color, name }); },
    sendThrottle(value) { transport.send({ t: "throttle", value }); },
    close() { try { transport.send({ t: "bye" }); } catch (e) {} transport.close(); },
  };

  // EVERY VERB THIS SEAT ISSUES GOES TO THE HOST. The listener sits on the
  // journal, so it catches orders whatever surface issued them -- a panel
  // button, a keyboard shortcut, a future card -- and it forwards only this
  // seat's own, because a client may never act for anybody else.
  const stop = onRecord((entry) => {
    if (!session.started || session.seat == null) return;
    if (entry.pid !== session.seat) return;
    transport.send({ t: "verb", entry });
  });
  session.stopForwarding = stop;

  transport.onMessage((msg) => {
    if (!msg || typeof msg.t !== "string") return;
    if (msg.t === "lobby") {
      session.lobby = msg;
      if (o.onLobby) o.onLobby(msg);
      return;
    }
    if (msg.t === "begin") {
      session.seat = msg.seat;
      session.started = true;
      resetSnapshotCache();
      applySnapshot(msg.snap, msg.seat);
      if (o.onBegin) o.onBegin(msg);
      return;
    }
    if (msg.t === "snap") {
      if (!session.started) return;
      applySnapshot(msg.snap, session.seat);
      if (o.onSnapshot) o.onSnapshot();
      return;
    }
    if (msg.t === "throttle") {
      session.peerThrottle = Number(msg.value) || 0;
      return;
    }
    if (msg.t === "bye") { if (o.onHostLeft) o.onHostLeft(); return; }
  });
  transport.onClose(() => { if (o.onHostLeft) o.onHostLeft(); });

  return session;
}

// ---- The shared clock ------------------------------------------------------
// EVERY PLAYER HAS A THROTTLE; THE WORLD RUNS AT THE MINIMUM (design.md → The
// speed cap). Pause is a throttle of 0 under the same rule rather than a
// second mechanism, so "no one can force time to pass on you" holds without
// anything special -- and versus a human the legal set is {0, 1}, because
// speed in adversarial hands is an attention weapon.
export const MULTIPLAYER_SPEEDS = [0, 1];

export function tableSpeed(mine, theirs) {
  if (theirs == null) return mine;      // nobody else at the table yet
  return Math.min(mine, theirs);
}
