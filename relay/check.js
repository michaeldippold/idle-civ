// ---------- THE RELAY'S OWN CHECK (M1b) -------------------------------------
// The main harness is synchronous and server-free on purpose: the whole game
// protocol is proven over a loopback transport, so `npm test` never opens a
// socket. What is left unproven by that is the RELAY itself -- the framing,
// the pairing, the forwarding -- and this is where that gets tested, against
// the real server, over real WebSockets, in one process.
//
//   node relay/check.js        (or: npm run test:relay)
//
// Kept out of the main harness deliberately: a check that binds a port is a
// check that fails for reasons that have nothing to do with the game.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const PORT = 8791;
const URL_ = `ws://127.0.0.1:${PORT}`;

let fails = 0;
const check = (name, ok) => { console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// One socket, with a queue of what it has received -- enough to ask "did that
// arrive?" without inventing a framework.
function client() {
  const sock = new WebSocket(URL_);
  const got = [];
  sock.addEventListener("message", (ev) => {
    try { got.push(JSON.parse(ev.data)); } catch (e) { got.push({ raw: ev.data }); }
  });
  const ready = new Promise((res, rej) => {
    sock.addEventListener("open", res);
    sock.addEventListener("error", rej);
  });
  return {
    sock, got, ready,
    send: (o) => sock.send(JSON.stringify(o)),
    // Wait until a message satisfying `pred` shows up, or give up.
    async until(pred, ms = 2000) {
      const stop = Date.now() + ms;
      while (Date.now() < stop) {
        const hit = got.find(pred);
        if (hit) return hit;
        await wait(10);
      }
      return null;
    },
    close: () => sock.close(),
  };
}

const server = spawn(process.execPath, [nodePath.join(here, "server.js")], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => process.stdout.write(`  [relay] ${d}`));
server.stderr.on("data", (d) => process.stderr.write(`  [relay!] ${d}`));

console.log("\n--- M1b: the relay moves messages and stores nothing ---");
try {
  await wait(400);   // let it bind

  // Health, so "is the relay up?" is answerable without a game.
  const health = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json());
  check("the relay answers /health", health.ok === true);

  const host = client();
  await host.ready;
  host.send({ t: "open" });
  const opened = await host.until((m) => m.t === "opened");
  check("a host opens a table and gets a code", !!opened && typeof opened.code === "string");
  check("...the code is readable aloud (no I, L, O, 0 or 1)",
    !!opened && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(opened.code));

  const guest = client();
  await guest.ready;
  guest.send({ t: "join", code: opened.code.toLowerCase() });   // case and spacing forgiven
  const pairedGuest = await guest.until((m) => m.t === "paired");
  const pairedHost = await host.until((m) => m.t === "paired");
  check("a guest joins by code, and BOTH ends are told", !!pairedGuest && !!pairedHost);

  // THE FORWARDING, which is the whole job. The relay never parses this.
  guest.send({ t: "hello" });
  const heard = await host.until((m) => m.t === "hello");
  check("a game message crosses from guest to host, unread", !!heard);

  host.send({ t: "lobby", taken: ["purple", "teal"], started: false });
  const lobby = await guest.until((m) => m.t === "lobby");
  check("...and from host to guest", !!lobby && lobby.taken.length === 2);

  // A SNAPSHOT-SIZED PAYLOAD, which is where naive framing breaks: anything
  // over 125 bytes needs an extended length, and over 64KB needs the 64-bit
  // form. A real snapshot is a few KB; this proves the big path too.
  const big = { t: "snap", snap: { pad: "x".repeat(200000) } };
  host.send(big);
  const gotBig = await guest.until((m) => m.t === "snap", 4000);
  check("a 200KB payload arrives whole (extended frame lengths)",
    !!gotBig && gotBig.snap.pad.length === 200000);

  // Wrong codes are refused rather than silently hanging.
  const stray = client();
  await stray.ready;
  stray.send({ t: "join", code: "ZZZZZ" });
  const nosuch = await stray.until((m) => m.t === "nosuch");
  check("an unknown code is refused, not left hanging", !!nosuch);

  // A room holds two seats; a third is turned away.
  const third = client();
  await third.ready;
  third.send({ t: "join", code: opened.code });
  const full = await third.until((m) => m.t === "full");
  check("a table seats two, and says so to a third", !!full);

  // A SEAT LEAVING is announced in the game's own vocabulary, so a client
  // learns it even if it never sees a socket event.
  guest.close();
  const bye = await host.until((m) => m.t === "bye", 3000);
  check("when a seat's socket dies, the other end hears 'bye'", !!bye);

  // ...and the freed seat can be retaken with the same code, which is the
  // whole reconnect story: rejoin, and the next snapshot is your state.
  const back = client();
  await back.ready;
  back.send({ t: "join", code: opened.code });
  const rejoined = await back.until((m) => m.t === "paired");
  check("a guest can rejoin the same table after dropping", !!rejoined);

  host.close(); back.close(); stray.close(); third.close();
} catch (e) {
  console.log("  [FAIL] the relay check threw:", e && e.message);
  fails += 1;
} finally {
  server.kill();
}

console.log(`\n${fails === 0 ? "RELAY OK" : fails + " RELAY CHECK(S) FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
