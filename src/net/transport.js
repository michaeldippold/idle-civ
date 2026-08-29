// ---------- THE TRANSPORT SEAM (M1, the antagonist spec) --------------------
// A transport is four methods: send, onMessage, onClose, close. Nothing above
// this file knows whether the bytes cross a socket or a function call.
//
// This is the same move that made 3D cheap (the geometry/paint split) and the
// same move that made the bot brain possible (the verb seam): put the seam in
// BEFORE the feature, and the feature arrives testable. The whole lobby
// handshake, the verb forwarding and the snapshot loop run over a loopback
// pair in the harness -- no server, no browser, no timing -- so what the relay
// has to be is "a thing that moves messages", which is a thing that can be
// fifty lines and stay fifty lines.
//
// Messages are plain objects. The transport owns the wire format; sessions
// never see a string.

// TWO ENDS OF ONE WIRE, in memory. Delivery is synchronous-but-queued: a
// message posted during another message's handler is delivered after it
// returns, which is the ordering a real socket gives and the ordering a
// re-entrant handler would otherwise break.
export function loopbackPair() {
  const a = makeEnd(), b = makeEnd();
  a.peer = b; b.peer = a;
  return [a, b];
}

function makeEnd() {
  const end = {
    peer: null,
    open: true,
    handlers: [],
    closers: [],
    sent: 0,
    bytes: 0,
    queue: [],
    draining: false,
    send(msg) {
      if (!this.open || !this.peer || !this.peer.open) return false;
      this.sent += 1;
      // Measured, not guessed: the harness reports what a snapshot actually
      // costs on the wire, so "is this too fat?" is a number rather than an
      // opinion.
      this.bytes += JSON.stringify(msg).length;
      // Round-trip through JSON exactly as a socket would, so a session can
      // never accidentally rely on sharing an object with its peer.
      this.peer.deliver(JSON.parse(JSON.stringify(msg)));
      return true;
    },
    deliver(msg) {
      this.queue.push(msg);
      if (this.draining) return;
      this.draining = true;
      while (this.queue.length) {
        const next = this.queue.shift();
        for (const fn of this.handlers.slice()) fn(next);
      }
      this.draining = false;
    },
    onMessage(fn) { this.handlers.push(fn); return () => {
      const i = this.handlers.indexOf(fn); if (i >= 0) this.handlers.splice(i, 1);
    }; },
    onClose(fn) { this.closers.push(fn); },
    close() {
      if (!this.open) return;
      this.open = false;
      for (const fn of this.closers.slice()) fn();
      if (this.peer && this.peer.open) {
        // The peer learns the wire went dead, which is what a real close does.
        for (const fn of this.peer.closers.slice()) fn();
      }
    },
  };
  return end;
}

// ---- The relay handshake ---------------------------------------------------
// The relay understands exactly two messages (open / join) and forwards
// everything else unread. These two helpers own that conversation, so a
// SESSION never sees it: by the time a session exists, the transport is
// already a private wire to one other person. That separation is why the
// whole protocol above could be tested with no server at all.
//
// Both resolve to a transport whose messages are the peer's, because the
// relay's own replies are consumed here and never passed along.

export function openTable(url) {
  return handshake(url, { t: "open" }, "opened");
}
export function joinTable(url, code) {
  return handshake(url, { t: "join", code: String(code || "").toUpperCase().trim() }, "paired");
}

function handshake(url, hello, wantType) {
  return new Promise((resolve, reject) => {
    const wire = wsTransport(url);
    let settled = false;
    let code = null;
    const off = wire.onMessage((msg) => {
      if (!msg || typeof msg.t !== "string") return;
      if (msg.t === "nosuch") { settled = true; off(); wire.close(); reject(new Error("no such table")); return; }
      if (msg.t === "full") { settled = true; off(); wire.close(); reject(new Error("that table is full")); return; }
      if (msg.t === "opened") {
        // The host has a code to share, but nobody is at the far end yet: the
        // wire resolves now so the lobby can show the code, and `paired` is
        // reported through the callback below.
        code = msg.code;
        if (!settled) { settled = true; off(); resolve({ wire, code, paired: false }); }
        return;
      }
      if (msg.t === wantType) {
        if (!settled) { settled = true; off(); resolve({ wire, code: msg.code || code, paired: true }); }
        return;
      }
    });
    wire.onClose(() => { if (!settled) { settled = true; reject(new Error("the relay is not answering")); } });
    wire.send(hello);
  });
}

// WAIT FOR THE OTHER SEAT. The host resolves its handshake immediately (it
// needs the code to show), so this is how it learns somebody arrived.
export function onPaired(wire, fn) {
  return wire.onMessage((msg) => { if (msg && msg.t === "paired") fn(msg); });
}

// THE REAL WIRE. A thin wrapper over WebSocket with the same four methods --
// deliberately dumb, because everything interesting is above it and therefore
// already tested. Buffers sends made before the socket opens, so a session
// never has to know about connection timing.
export function wsTransport(url) {
  const sock = new WebSocket(url);
  const pending = [];
  const end = {
    open: false,
    handlers: [],
    closers: [],
    sent: 0,
    bytes: 0,
    send(msg) {
      const text = JSON.stringify(msg);
      this.sent += 1;
      this.bytes += text.length;
      if (sock.readyState === 1) sock.send(text);
      else pending.push(text);
      return true;
    },
    onMessage(fn) { this.handlers.push(fn); return () => {
      const i = this.handlers.indexOf(fn); if (i >= 0) this.handlers.splice(i, 1);
    }; },
    onClose(fn) { this.closers.push(fn); },
    close() { try { sock.close(); } catch (e) {} },
  };
  sock.addEventListener("open", () => {
    end.open = true;
    while (pending.length) sock.send(pending.shift());
  });
  sock.addEventListener("message", (ev) => {
    let msg = null;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }   // garbage on the wire is ignored, never thrown
    for (const fn of end.handlers.slice()) fn(msg);
  });
  const die = () => {
    end.open = false;
    for (const fn of end.closers.slice()) fn();
  };
  sock.addEventListener("close", die);
  sock.addEventListener("error", die);
  return end;
}
