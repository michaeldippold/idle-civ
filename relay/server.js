// ---------- THE RELAY (M1b, the antagonist spec) ----------------------------
// The only server this game has, and it is deliberately the dumbest component
// in the repo: it pairs two sockets by a join code and forwards bytes between
// them. It does not know what a hex is, never sees game state, stores nothing,
// and has no database -- because there is nothing to store. The HOST's browser
// runs the only simulation there is (sim/../net/session.js), so the relay's
// entire job is "move messages", and that job is small enough to stay small.
//
// WHAT IT UNDERSTANDS -- two verbs, and everything else is opaque:
//   {t:"open"}          -> a room is created; the code comes back as {t:"opened", code}
//   {t:"join", code}    -> paired with that room's host; both ends hear {t:"paired"}
//   anything else       -> forwarded verbatim to the peer, unread
//
// Run it with:  node relay/server.js          (PORT env, default 8787)
// Deploy it anywhere that runs node and speaks WebSocket. The game itself
// stays on static hosting; only this moves.
//
// DEPENDENCY-FREE ON PURPOSE. It speaks enough of RFC 6455 to accept a
// connection and exchange text frames, so there is nothing to npm install,
// nothing to audit, and nothing to keep up to date on a box nobody looks at.

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no I/L/O/0/1: codes get read aloud
const CODE_LENGTH = 5;
const ROOM_IDLE_MS = 1000 * 60 * 60;      // an unclaimed room is forgotten after an hour

const rooms = new Map();                  // code -> { host, guest, made }

function newCode() {
  let code = "";
  do {
    code = "";
    const bytes = crypto.randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  } while (rooms.has(code));
  return code;
}

// ---- The smallest WebSocket that works -------------------------------------
// Text frames only, no extensions, no fragmentation beyond what a browser
// sends for large payloads (which it does not, at these sizes -- a snapshot is
// a few KB). Ping/pong is answered so proxies keep the connection alive.

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function accept(req, socket) {
  const key = req.headers["sec-websocket-key"];
  const hash = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${hash}\r\n\r\n`
  );
}

function frame(text) {
  const body = Buffer.from(text, "utf8");
  const len = body.length;
  let head;
  if (len < 126) {
    head = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 126; head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, body]);
}

// Pulls whole frames out of a rolling buffer. Returns the messages it could
// complete and keeps the remainder for next time -- a large snapshot arrives
// across several TCP reads and must not be parsed early.
function drain(state) {
  const out = [];
  for (;;) {
    const buf = state.buf;
    if (buf.length < 2) break;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    const maskLen = masked ? 4 : 0;
    if (buf.length < off + maskLen + len) break;
    const mask = masked ? buf.slice(off, off + 4) : null;
    const payload = buf.slice(off + maskLen, off + maskLen + len);
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    state.buf = buf.slice(off + maskLen + len);
    if (opcode === 0x8) { out.push({ close: true }); break; }        // client said goodbye
    if (opcode === 0x9) { out.push({ ping: true }); continue; }      // keepalive
    if (opcode === 0x1) out.push({ text: payload.toString("utf8") });
    // Anything else (binary, continuation) is not part of this protocol.
  }
  return out;
}

const server = http.createServer((req, res) => {
  // A health endpoint, so "is the relay up?" is answerable from a browser tab.
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(426);
  res.end("This is the Idle Civ relay. Connect over WebSocket.");
});

server.on("upgrade", (req, socket) => {
  accept(req, socket);
  socket.setNoDelay(true);

  const client = { socket, room: null, side: null, state: { buf: Buffer.alloc(0) } };

  const send = (obj) => {
    try { socket.write(frame(JSON.stringify(obj))); } catch (e) {}
  };
  const peerOf = () => {
    const room = client.room && rooms.get(client.room);
    if (!room) return null;
    return client.side === "host" ? room.guest : room.host;
  };
  const forward = (text) => {
    const peer = peerOf();
    if (!peer) return;
    try { peer.socket.write(frame(text)); } catch (e) {}
  };

  socket.on("data", (chunk) => {
    client.state.buf = Buffer.concat([client.state.buf, chunk]);
    for (const msg of drain(client.state)) {
      if (msg.close) { socket.end(); return; }
      if (msg.ping) continue;
      // THE ONLY TWO MESSAGES THIS SERVER READS. It parses a message just far
      // enough to answer "is this open or join?" and forwards everything else
      // as the bytes it arrived as -- the relay never learns the game's
      // protocol, so the game's protocol can change without touching it.
      let head = null;
      if (msg.text.length < 4096) {
        try { head = JSON.parse(msg.text); } catch (e) { head = null; }
      }
      if (head && head.t === "open") {
        const code = newCode();
        rooms.set(code, { host: client, guest: null, made: Date.now() });
        client.room = code; client.side = "host";
        send({ t: "opened", code });
        continue;
      }
      if (head && head.t === "join") {
        const code = String(head.code || "").toUpperCase().trim();
        const room = rooms.get(code);
        if (!room || !room.host) { send({ t: "nosuch", code }); continue; }
        if (room.guest) { send({ t: "full", code }); continue; }
        room.guest = client;
        client.room = code; client.side = "guest";
        send({ t: "paired", code });
        try { room.host.socket.write(frame(JSON.stringify({ t: "paired", code }))); } catch (e) {}
        continue;
      }
      forward(msg.text);
    }
  });

  const drop = () => {
    const room = client.room && rooms.get(client.room);
    if (!room) return;
    const peer = peerOf();
    // The peer is told the wire died, in the game's own vocabulary, so a
    // client that never sees a socket event still learns the seat is gone.
    if (peer) { try { peer.socket.write(frame(JSON.stringify({ t: "bye" }))); } catch (e) {} }
    // A host leaving closes the room; a guest leaving frees the seat, so they
    // can rejoin the same code (the reconnect path is "load the snapshot").
    if (client.side === "host") rooms.delete(client.room);
    else room.guest = null;
  };
  socket.on("close", drop);
  socket.on("error", drop);
});

// Rooms nobody claimed do not accumulate. Cheap sweep, since a friendly game
// creates a handful of rooms a day and this is not a matchmaking service.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.guest && now - room.made > ROOM_IDLE_MS) rooms.delete(code);
  }
}, 60000).unref();

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT} -- it moves messages and stores nothing`);
});
