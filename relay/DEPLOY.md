# Putting Idle Civ online

> **Status, 2026-09-03:** step 1 is done — `main` carries the table and Pages serves it, with
> single player only on offer. Steps 2 and 3 are **paused on purpose** behind feature design,
> together with the hardening pass they depend on, until the owner has a window to live-test
> (`todo.md` → THE 9/3 RULING). Nothing below has changed; it is simply not next.

Two pieces, deployed separately, because they are different kinds of thing:

| piece | what it is | where it goes |
|---|---|---|
| **the game** | static files (HTML/JS/CSS) | GitHub Pages — already live |
| **the relay** | a tiny always-on node process | anywhere that runs node and terminates TLS |

The game works **fully single-player with no relay at all**. The relay is only
needed for two people at one table. So these can be done in either order, and
step 1 is safe to do today.

---

## 1. The game: publish to GitHub Pages

Pages is already serving <https://michaeldippold.github.io/idle-civ/> from
`main`. Publishing is therefore just merging:

```bash
git checkout main
git merge substrate
git push
```

Pages rebuilds in a minute or two. That URL is the address to share.

**With no relay configured, the start screen says so** and offers single player
only — which is the correct state until step 2 is done. Nothing is broken and
nothing is exposed.

> **A note on `.nojekyll`:** not needed here (no files or folders begin with an
> underscore), but if a build step ever adds one, an empty `.nojekyll` file at
> the repo root stops Pages from hiding it.

---

## 2. The relay: deploy the socket server

### Before you do this — read the security note

`todo.md` → **SECURITY: THE HARDENING PASS** lists what is owed *before* a
relay is public. The two that matter most:

1. **The host trusts the shape of every message a guest sends.** A malformed
   entry can wedge the host's tab.
2. **The relay's buffers are unbounded.** One client can grow them without
   limit — a trivial denial of service on an unsupervised box.

Neither is exploitable while the relay only runs on your own machine. Both
become live the moment it has a public address. **Do the hardening pass
first.** It is small, and it is the whole reason that section exists.

### What the relay needs from a host

- runs **node** (no dependencies, no build step, no database)
- reads the **`PORT`** environment variable — `relay/server.js` already does
- terminates **TLS**, so browsers can reach it at `wss://`
- allows **WebSocket upgrades** (most platforms do; a few need a toggle)

TLS is not optional: the game is served over `https://`, and a browser refuses
to open an insecure `ws://` socket from a secure page. Any platform that gives
you an `https://` URL gives you `wss://` on the same host for free.

### Option A — Fly.io (recommended)

```bash
cd relay
fly launch --name idle-civ-relay --no-deploy   # detects node; say no to a database
fly deploy
```

Fly gives you `https://idle-civ-relay.fly.dev`, so the relay is at
`wss://idle-civ-relay.fly.dev`. It terminates TLS and proxies WebSockets
without configuration. The free allowance is far more than a two-person game
needs — a snapshot is ~4KB and a table pushes four a second only while two
people are actually playing.

If `fly launch` asks for a start command: `node server.js`.

### Option B — Render

New → **Web Service** → point at this repo:

- **Root directory:** `relay`
- **Build command:** *(leave empty)*
- **Start command:** `node server.js`

Render supplies `PORT` and TLS. The URL it gives you as `https://…` is your
`wss://…`.

### Verify it

```bash
curl https://your-relay-url/health      # -> {"ok":true,"rooms":0}
```

Visiting the relay in a browser prints *"This is the Idle Civ relay. Connect
over WebSocket."* — that is the relay working, not an error. It is not a
website.

---

## 3. Point the game at the relay

One line, in [`src/net/table.js`](../src/net/table.js):

```js
const PRODUCTION_RELAY = "wss://idle-civ-relay.fly.dev";
```

Commit and push; Pages picks it up. Now the shared URL works for two people
with nothing to type and no query strings.

**Local and LAN play ignore this constant entirely** — a page served from
`localhost` or a `192.168.x.x` address still looks for a relay on the machine
it came from, so `npm run relay` keeps working exactly as it does now.

### Overriding, for testing

`?relay=` beats everything, and the choice is remembered:

```
https://michaeldippold.github.io/idle-civ/?relay=wss://some-other-relay
```

Useful for testing a staging relay against the live page, or the live relay
against a local page.

---

## What it costs to run

Effectively nothing. The relay holds a `Map` of room codes and forwards bytes
between two sockets; it stores no game state, has no database, and idles at
zero traffic. Rooms nobody joins are forgotten after an hour.

## If something does not work

| symptom | cause |
|---|---|
| "No relay at … — is it running?" | the relay is down, or `PRODUCTION_RELAY` is wrong |
| works on localhost, fails on the hosted page | `ws://` where it needs `wss://` |
| "This is the Idle Civ relay…" in the browser | you loaded the relay's URL, not the game's |
| the guest sees the lobby but never begins | the host has not pressed **Begin together** |
| two people, and the world will not move | the host's tab is hidden — the sim pauses there by design |
