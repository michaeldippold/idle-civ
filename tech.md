# Idle Civ — Technical Design

How the game is actually built. **Docs map:** `design.md` is why any of this exists; this file is the how; `map.md` is the map arc; `interface.md` is the interface system; `todo.md` is the running phase log. When two files disagree about *what is built*, this one and `todo.md` win.

## How to read this file

**Every section carries a status line directly under its heading.** This is not decoration. As of 2026-08-22 the documents describe a game that does not fully exist: the time pivot (`design.md`, *Time, Presence & Pause*) retired offline progress and made the clock presence-bound, and none of that is in the code yet. A session that reads "the sim auto-pauses on a hidden tab", goes looking, finds `simulateOffline()`, and starts reconciling the two will do something bad. The status line tells you which world a paragraph is describing.

- **Status: shipped.** — running in `game.js` today. Claims here are verified against the file.
- **Status: pending — phase N.** — settled design, no code. Nothing in the section is true yet.
- **Status: shipped; changes pending — phase N.** — the section describes live code that a named phase will alter or delete. Both halves are marked inline.

**Historical notes** appear only where the reasoning behind a reversal is still load-bearing — a trap you would otherwise re-enter, or a rationale whose *shape* still teaches. This file used to be a running record of every decision ever taken; it isn't any more, and reintroducing that is a regression.

## The phase plan

**Status: authoritative order. Phase 0 (docs) is this pass.**

| # | Phase | State | Where it's specced |
|---|---|---|---|
| 0 | Docs | in progress | — |
| 1 | Module structure (file split) | **shipped 2026-08-22** | *Module Structure*, below |
| 2 | Seeded RNG | **shipped 2026-08-22** | *Determinism & the Seeded RNG* |
| 3 | Kill offline | pending | *Time, Presence & Pause (implementation)* |
| 4 | Fixed ticks | pending | *Simulation Model* |
| 5 | Player controls (pause/speed, modal pause flag) | pending | *Time, Presence & Pause (implementation)* |
| 6 | Conquest Growth G1–G3 | pending | *Conquest Growth — implementation contract* |
| 7 | Decision queue (interactive events) | pending | *The Decision Queue* |
| 8 | Map | pending | `map.md` |
| 9 | Interface re-architecture around the map | open | `design.md`, Open Questions |

**The harness stays green at every boundary from 1 through 5.** That rail is the whole difference between a refactor and a rewrite: phase 1 is mechanical with zero behaviour change, phase 2 changes which numbers come out but not which code paths run, phase 3 deletes code, phase 4 changes the unit of time under an unchanged economy. Any phase that cannot leave the harness green needs its own decomposition before it starts.

## Stack

**Status: shipped (phase 1 landed 2026-08-22).**

Plain HTML/CSS/JS as ES modules. No build step, no bundler, no dependencies, no framework — the served file is the authored file. The layout:

- `index.html` — structure/markup only (one `<script type="module" src="src/main.js">` at the end of `<body>`)
- `styles.css` — all styling
- `src/` — 26 modules, ~3,570 lines; see *Module Structure*
- `harness.js` — the headless Node test harness, 420 checks, importing the same modules
- `package.json` — `{"type": "module"}` plus `npm test`; exists so Node parses `.js` as ESM (the browser never needed it), deliberately dependency-free

**The `file://` double-click era is over** — ES modules only load over http. This was already true in practice (development runs `npx http-server` via `.claude/launch.json` on port 8123; the game ships to GitHub Pages), and the promise's only remaining effect had been forcing everything into one 3,409-line `game.js`. Run it locally with any static server:

```bash
npx http-server . -p 8123 -c-1
```

### Why this stack, and why it is not negotiable

**Status: standing constraint.**

Recorded here because it is a real architectural constraint that looks like a preference, and a session that mistakes it for one will helpfully suggest a game engine.

This project is written almost entirely by LLM agents. The binding requirement is therefore not "what renders fastest" or "what is most expressive" — it is **which stack lets the agent verify its own work.** The DOM does: an agent can read the accessibility tree and assert on real text, real structure, real state. `harness.js` does: it boots the entire simulation headlessly with no browser and no framework, and 420 assertions run in under a second. A canvas does not — it is a bag of pixels, and an agent that renders into one has no way to check what it drew short of asking a human to look.

The instructive counter-example is **Forge of Empires**, the nearest commercial relative to this game. It runs on Haxe + OpenFL, automatically transpiled in 2018 from ~500,000 lines of AS3 across ~4,000 Flash classes, and it renders — interface included — into a WebGL canvas that hard-fails without hardware acceleration. That architecture is a *migration artifact*, not a greenfield choice: the only evidence it offers is that you can transpile a 2012 Flash game. Nothing about it is what a project starting today would pick, and for an agent-authored project it is close to a worst case — a custom compiler, a thinly-represented language, no DOM, and a UI with no inspectable surface. (The tell: the large community extension for that game reads the JSON on the wire rather than the page, because there is no page worth reading.)

The consequences that follow, and that should survive any future redesign:

- **The interactive layer stays DOM and SVG.** This is why `map.md` specifies SVG geometry with a DOM overlay and explicitly rules canvas out — the map peaks in the low hundreds of elements, so performance was never the argument; inspectability was.
- **A canvas layer is permitted only for non-interactive paint** (texture, terrain wash) beneath an SVG interaction layer that carries the geometry and the hit targets.
- **Nothing goes behind a compile step that an agent cannot read through.** No build step is a convenience; a *legible* build output is the actual requirement, and ES modules satisfy it because the served file is the authored file.
- Godot and equivalent engines are ruled out for the same reason plus two more: GDScript is thinly represented in training data, and scene files are GUI-mediated rather than comfortably agent-authorable.

## Module Structure

**Status: shipped (phase 1, 2026-08-22).**

`game.js` split along its own section banners into 26 modules — pure slicing, no logic changed. The shipped tree (line counts as of the split):

```
index.html
package.json                {"type": "module"} — Node-only; no dependencies
src/
  main.js            84     boot, page wiring, the interval loop; the ONLY module nothing imports
  core/
    config.js        49     CONFIG
    state.js         53     S, SIM flags, loopId/saveId, freshState, and the cross-module setters
    derived.js      183     rates/mults/caps, civilians/reserved/idle, defById, isRevealed
    step.js          91     step(), die()
    actions.js      112     assign, build, cancelBuild, completeConstruction, onComplete
    persist.js       86     save, load, initAdversaries, simulateOffline (dies in phase 3)
  content/
    lib.js          199     EVENT_LIB + HINT_LIB
    stone.js        168     STONE (base manifest)
    bronze.js       128     BRONZE_DELTA
    iron.js         175     IRON_DELTA
    compile.js      240     ERA_ORDER, compiler, MANIFESTS, DEF_INDEX, active(), validator, manifestDiff
  sim/
    combat.js       207     raid rolls, strengths, casualty draw, removeSettler, reconcileWorkforce
    events.js        65     resolveEvents, runConverters
    expeditions.js  256     launch/resolve campaign + caravan, standing, walls
    era.js          113     advanceEra, migrations, applyConsolidation, purgeDom
  ui/
    icons.js         56     BUILDING_ICONS, PERSON_ICONS, QUEUE_ICONS, BUILDING_CATS
    log.js           43     log(), checkReveals()
    dom.js           97     fmt/fmtRate, tooltip machinery, shortfallLine, renderTile
    panels-ledger.js 105    renderPopRow, renderResources
    panels-people.js  93    renderPeople
    panels-holdings.js 120  renderQueue, renderHoldings
    panels-buy.js   288     card skeleton + renderBuildings/renderUpgrades/renderTraining, upgradeTab
    expeditions.js  245     muster/escort modals, renderExpeditions
    modal.js        210     modal shell, Info, era transition, reset confirm, game over
    chrome.js       105     clock/speed/pause controls, renderEraChrome, renderAll, updateSpans
harness.js                  imports all of the above except main.js
```

(The `content/validate.js` file the original proposal sketched was folded into `compile.js` — 240 lines is in range, and separating them would have manufactured a cycle around the validator's `BOOST_BUILDING` read for no gain.)

**Two invariants the split created, both enforced by comment at the relevant sites:**

1. **`content/compile.js` must be every entry module's first import.** Its body builds `MANIFESTS` from `EVENT_LIB` and the era consts, and a module's body always runs *last* within its own import subtree — so entered via compile, the `lib → combat → compile` function-level cycle is harmless. But an entry that touches `lib.js` first sends the cycle the other way: compile's body runs while lib is still mid-evaluation, and `EVENT_LIB` is a TDZ `ReferenceError` before a single frame renders. `main.js` opens with a side-effect import of compile; `harness.js` imports it first; any future entry (a worker, a tools page) must do the same.
2. **Cross-module reassignment goes through setters in `core/state.js`.** ES-module live bindings are readable everywhere but writable only from their home module. The five mutables this bites — `S`, the SIM flags, the interval handles, `upgradeTab` — got `setS`/`setSIM`/`setSimStop`/`setLoops`/`setUpgradeTab`, and those are the only code deltas the split made. Corollary: `loopId`/`saveId` live in `state.js`, not `main.js`, because `die()` clears them and **no core module may import `main.js`** — main's body is `boot()`, and an import edge into it would start the game mid-link, before the manifests exist.

`main.js` is the one module nothing imports, and that is load-bearing, not incidental.

**All DOM access sits inside functions, never at module top level.** That is what makes the split clean — no import-order-dependent side effects, no "this module must load after the document is ready." The one top-level side effect is `validateManifests(MANIFESTS)` at line 918, which is deliberate and should stay: a broken manifest must throw before a frame renders.

**Circular imports are the real risk**, not line counts. `derived.js` needs `active()`; `events.js` needs `derived`; `combat.js` needs both; `era.js` needs nearly everything. Keep the dependency graph pointing one way — content → core → sim → ui — and put anything genuinely shared (the `S` reference, `active()`) at the bottom of the stack where everyone may import it and it imports nothing.

**The harness bootstrap is a real rewrite, and it should be honest about that.** `harness.js` currently reads `game.js` as text, appends an `exportHook` string that captures ~60 internals into `globalThis.__api`, and runs the whole thing through `vm.createContext` against a stubbed `document`/`localStorage`/`window`. Under modules that entire mechanism can be replaced by ordinary `import`s — cleaner, no string concatenation, no sandbox — but the stubs still have to exist somewhere (the UI modules touch `document` the moment they're called), and the `__api` surface becomes a set of real exports. **The ~420 assertions themselves are unaffected**; only the first 60 lines of the file change. Do the bootstrap rewrite as the *last* commit of phase 1, after the split is proven green through the old `vm` path, so a harness failure can only mean one thing.

## Simulation Model

**Status: shipped is continuous delta-time; fixed ticks pending — phase 4.**

### What runs today (delta-time)

A `setInterval` at `CONFIG.tickMs` (200ms) computes real elapsed seconds since the last frame (`dt`) and calls `step(dt)`. All production, upkeep, and event probability is authored as **rates per second**: `S.res.food += rate * dt`, and `chancePerSecond` becomes a per-`dt` roll via `1 - (1 - chancePerSecond) ** dt`. `dt` is clamped at 2s before use. Speed multiplies by running `speed` ordinary `step(dt)` calls per tick rather than one oversized one.

### What replaces it (fixed ticks — phase 4)

**`S.tick` becomes the master clock.** An integer, incremented once per simulation step, part of the save. `S.playtime` stops being accumulated separately and *derives* from it (`S.tick * secondsPerTick`) — one clock, not two that can disagree.

- **Authoring stays per-second.** `CONFIG` and the manifests keep reading `0.20/s`, `45 seconds`, `chancePerSecond: 0.0018`, because those are the numbers a designer reasons about. **The manifest compiler converts them to per-tick at compile time**, alongside everything else it already normalizes. Nothing in the content files changes; `compileBase`/`extendEra` grow one pass.
- **Speed is N ticks per frame.** The loop already does exactly this (`for (let i = 0; i < speed; i++) step(dt)`), so phase 4 mostly deletes the `dt` plumbing rather than restructuring the loop.
- **Pause is zero ticks per frame.** Not a skipped `step()` guarded by a flag — literally a loop that runs zero times. The pause bookkeeping that currently keeps `last = now` advancing so `dt` doesn't bank up disappears entirely, because there is no `dt` to bank.
- **The frame rate stops being observable.** Today a browser that fires the interval late produces a bigger `dt` and slightly different rounding; after phase 4 a slow frame produces exactly the same number of ticks, just later on the wall clock.

**The payoff is determinism**, and it is why this phase exists at all: *same seed + same tick count + same player actions = bit-identical state*. That property is worth more than anything delta-time bought, and it is unreachable with a variable `dt` no matter how good the RNG is — a seeded `rng()` under floating-point `dt` gives you the same *rolls* against different *thresholds*. Ticks and the seed are one feature delivered in two phases; neither is finished without the other. See *Testing Approach* for what this turns the harness into.

**Historical note, kept because the reasoning was correct and is instructive about how requirements move.** Delta-time was chosen deliberately, over an explicit alternative (the discrete `state.tick` model used in the sibling project `dispatch`), on the grounds that Idle Civ's genre was long unattended stretches and offline catch-up — and continuous simulation degrades gracefully to "however much time passed" instead of replaying tens of thousands of discrete ticks. That argument was sound. It is also entirely contingent on offline catch-up existing. Once the pivot deleted offline progress (`design.md`, *Time, Presence & Pause*), the sole justification evaporated and the cost — non-determinism — became the only remaining term. Nothing about the original analysis was wrong; the requirement it served was.

## Determinism & the Seeded RNG

**Status: shipped (phase 2, 2026-08-22) — full replay still needs phase 4.**

**One `rng()`, module-level, seeded, state in the save. `Math.random()` becomes forbidden.**

The PRNG should be small, fast, seedable from a single 32-bit integer, and well-distributed — **mulberry32** is the reference choice (a dozen lines, no dependencies, passes the tests that matter at this scale). Any equivalent is fine; what matters is that its entire state is one integer that serializes into the save and restores exactly.

```js
// core/rng.js
let rngState = 0;
export function seed(n) { rngState = n >>> 0; }
export function rng() { /* mulberry32 step over rngState */ }
export function rngState_() { return rngState; }   // for save()
```

`S.seed` (the run's founding seed, never changes) and `S.rngState` (the current position, saved every autosave) both live in state. A fresh run seeds from `Date.now()`; the harness seeds explicitly.

**All 16 `Math.random()` call sites in `game.js` route through it.** They are, by area: Conflict's `resolve()` (trigger roll, repel check, costly-repel check — 3), `rollRaidSize`/`rollRaidType` weighted picks (2), `pick()` for flavor lines (1), `removeRandomUnit`'s exposure-weighted draw (1), `resolveEvents`'s probability roll and negation roll (2), `removeDeployedUnit`'s draw (1), `resolveCampaign`'s wall-retreat loss, win check, and victory-casualty check (3), `resolveCaravan`'s ambush, fight-through, and escort-casualty checks (3). After phase 2 a lint-grade grep for `Math.random` in the repo must return zero hits; that grep is the enforcement mechanism, and it is worth putting in the harness.

**Three jobs, all of which need the same one number:**

1. **Deterministic test replay.** A rare-event balance question ("how often does a well-defended settlement actually lose a fighter?") is currently answerable only by Monte Carlo over unseeded noise. With a seed it becomes a fixture: the same run every time, and a *diff* when the balance changes.
2. **Reproducible procedural maps** (`map.md`). A map generated from `S.seed` regenerates identically on every load, which means the map does not have to be serialized — only the seed and whatever the player has changed since. That is a large amount of save schema that never has to exist.
3. **Reproducible adversary slates** (`map.md`). Which adversaries appear and where they sit is generated per run under role constraints; the same seed must produce the same world, or "load your save" stops meaning anything.

**Ordering discipline is now a correctness property.** Once every roll comes off one stream, the *order* in which systems draw becomes part of the observable state. Adding a roll to an event that fires early therefore shifts every later roll in the run. This is fine and expected — it just means a balance change and a "the numbers moved" harness diff are the same event, and a replay fixture pinned to an exact sequence is a fixture that will need regenerating whenever content changes. Pin fixtures to *outcomes with tolerances* where you can, exact sequences only where the sequence is the thing under test.

## Time, Presence & Pause (implementation)

**Status: pending — phases 3 and 5.** Design canon in `design.md`, *Time, Presence & Pause*. Nothing below is in `game.js` today.

### Phase 3 — kill offline

**What gets deleted, by name:**

- `simulateOffline()` (lines 3297–3335) and its call site in `boot()`.
- `SIM`, `SIM_STOP`, `SIM_STOP_CAUSE` (lines 998–1000) and every branch that reads them.
- `S.lastSeed` (state field, and the write in `save()`).
- `CONFIG.offlineCapHours`.
- The `if (dt > 2) dt = 2` clamp in the loop. Its comment says it outright — "large gaps are handled by the offline sim" — and with the tab pausing itself there are no large gaps to handle. (Phase 4 removes `dt` entirely; phase 3 removes the clamp's *reason*, which is why it goes here.)

**Removing the `SIM` branches is a genuine simplification, not just a subtraction.** Roughly a dozen places in the file currently ask *am I fast-forwarding?* and behave differently on the answer: `advanceEra()` returns early and skips the modal (1939); `step()` converts both death paths into a silent halt (1759, 1788); `resolveEvents()` suppresses three separate log lines (1441, 1450, 1453); `accrueGrowth()` suppresses the arrival line (1174); `reconcileWorkforce()` suppresses the abandoned-order line (1384); Conflict's `resolve()` wraps its entire narration in a `say()` helper that no-ops under SIM (148); `checkReveals()` suppresses hint text (2031); `purgeDom()` carries a comment explaining why it must run under SIM anyway. Every one of these is a *second* code path through logic that already had one, exercised only in a mode nobody watches, and they have been a genuine source of subtle wrongness — the era modal being suppressed and then re-announced from a different function is a two-place invariant that only holds by hand. After phase 3 there is one path: things happen, and they are narrated.

**Auto-pause on hidden tab.** `document.addEventListener("visibilitychange", …)`: hidden ⇒ pause, visible ⇒ restore the player's *chosen* state. That distinction matters — the auto-pause must not clobber a manual pause, so keep the player's intent (`paused`) separate from the effective state (`paused || document.hidden`), and let the loop read the composite. The header's pause button reads and writes intent only, so returning to the tab does not silently un-pause a game the player deliberately froze.

**Save hardening.** Save becomes a correctness requirement, so:

- **`visibilitychange` replaces `beforeunload` as the primary save trigger.** `beforeunload` is unreliable — mobile and background-killed tabs frequently never fire it — and `visibilitychange` → hidden fires in every path that matters, including the one where the tab is about to be discarded. Keep `pagehide` as a belt-and-braces second registration if it's free; do not keep `beforeunload` as the only one.
- **Save on every player action.** Assign, build, cancel, launch, decide. These are cheap (`JSON.stringify` of a few kilobytes) and they are exactly the moments where losing state is felt as a bug rather than as a rounding error. The 10s autosave interval stays as a floor for the passive case.
- **`hardReset()` must still unregister whatever the save trigger is before clearing** — see *Persistence*, below. The failure mode survives the change of event: any handler that fires on teardown and calls `save()` will rewrite the save being deleted.

### Phase 5 — controls

**Pause and speed are promoted to player controls.** They already exist as module-level `let paused` / `let speed` outside `S`, with a header button each; phase 5 changes their *status*, not primarily their implementation. Two things do change: the 2026-08-20 "speed is a dev-only tool, to be locked away before release" policy is **revoked** (it was a consequence of the idle framing), and both controls need to read as first-class chrome rather than as a debug affordance.

They stay out of `S` deliberately, and the reasons hold: pause in the save means loading into a frozen game wondering why nothing happens, and speed in the save means resuming at 12× as a nasty surprise. Auto-pause state is doubly not-saved — it's a property of the tab, not the run.

**The modal pause flag.** `openModal()` gains a `pause` option, **defaulting to true**, with `openInfoPanel()` the explicit opt-out. The ask/tell split from `design.md` maps directly: muster, escort, decision events, reset confirm and game over all ask (or are terminal) and pause; the Info reference tells and does not. Default-to-pause is right because that failure mode is harmless — the worst case is a player who paused for a second without meaning to.

Implementation: a module-level `modalPause` flag that the effective-pause composite reads alongside `paused` and `document.hidden`. `closeModal()` clears it. It must not touch `paused`, or dismissing a modal will resume a game the player had deliberately frozen.

**Interactions stay enabled while paused** (reassigning jobs, queuing builds), as they are today. There is no exploit — nothing progresses and nothing accrues — and planning while frozen is most of the point. Pausing is deliberately **not** logged to the Chronicle; that log is the settlement's memory, not a record of UI actions.

## The Decision Queue

**Status: pending — phase 7.** Design canon in `design.md`, *Events & Decisions*.

`S.pending` — an array of choices the world has put in front of the player and is waiting on. It is what makes interactive events possible now that no clock runs while you think.

```js
S.pending = [
  { uid, eventId, tick, payload?, }      // one entry per undecided choice
];
```

**Shape and rules:**

- An event with a `decide` field enqueues rather than self-applying: `resolveEvents()` pushes `{uid, eventId, tick: S.tick, payload}` and returns. The event library entry supplies the modal copy and the option list; **`S.pending` stores only the id and whatever roll-dependent payload the event already computed**, never functions or def objects. It must survive `JSON.stringify` and it must survive a content edit that renames the option labels.
- **It is part of the save**, and it is the strongest reason save is now load-bearing. A player who closes the tab with a decision open must find that decision open on return.
- **Nothing in it ever expires.** No `expiresAt`, no timer field, no sweep pass. There is no code that removes an entry except the player resolving it (or a migration retiring the event outright, which is a narrated migration like any other). If a future change wants a decision to lapse, that is a design reversal to argue in `design.md`, not an engine feature to leave lying around.
- **Every option ships with a designed default**, declared on the event, and that default is not an engine fallback — it is what the option list resolves to when the player fast-forwards past the prompt or simply doesn't care. Progressive enhancement (`design.md`) means the game must be playable by someone who never opens the queue.
- **Opening one pauses the game**, via the phase-5 modal pause flag, with no special-casing: a decision modal asks, and asking pauses.
- The UI surface is a badge/affordance that a decision is waiting, plus the modal. Where it lives is an interface question deferred to phase 9; the *engine* half is independent of that and can land first.

**Ordering:** the queue is FIFO for presentation, but resolution order is the player's — they may answer the second one first. Nothing in the engine may assume `S.pending[0]` is the one being resolved; find by `uid`, the same discipline `cancelBuild(uid)` already uses.

## Persistence

**Status: shipped; changes pending — phase 3.**

`localStorage`, under a single versioned key (`CONFIG.saveKey`, currently `"idleCiv.v6"`). Load uses a defensive merge so the schema grows additively without a migration step:

```js
S = Object.assign(freshState(), data);
S.builds = Object.assign(freshState().builds, data.builds);   // same pattern, nested
```

Any field present in `freshState()` but absent from an old save (a new resource, a new building, `eraHistory` before it existed) silently defaults correctly. This has been exercised across every schema change so far and has never needed a version bump. Arrays (`buildQueue`, `expeditions`) are `Array.isArray`-guarded rather than merged; id-keyed bags (`upgrades`, `seen`, `eraHistory`, `adversaries`) take the saved object or `{}`.

`initAdversaries()` runs at boot and on era entry: any adversary in the active manifest without a state entry gets one seeded from the manifest template. It **never re-initializes** — a half-plundered stock stays half-plundered, and a breached wall stays breached. The manifest entry is the template; the state entry is the living remnant.

**Offline catch-up** is documented under *Time, Presence & Pause (implementation)* as a deletion list. Do not extend it.

**Two fixed bugs whose lessons generalize** (the rest of the old catalogue is deleted):

- **Reset was a no-op, because teardown saved.** `localStorage.removeItem(key)` then `location.reload()` — and `location.reload()` fires `beforeunload`, which was wired to `save()`, and since in-memory `S` was untouched that call rewrote the save being cleared. Fixed by unregistering the handler before clearing. **The lesson survives the specific event**: any teardown-triggered save races any teardown-triggered wipe, and phase 3 moves the save trigger without changing that.
- **Reveals had no memory, so panels could un-reveal.** `reveal()` predicates keyed on a resource *threshold* (Woodshed, Granary) were re-evaluated fresh every render — spending wood on the very building that revealed the panel could make the panel vanish mid-game, queue item and all. Fixed with `isRevealed(def)`, which caches the first true result in `S.seen["rev:" + id]`. **Reveals are permanently sticky**, consistent with every other reveal in the game, and the only sanctioned un-reveal in the entire codebase is `purgeDom()` at an era boundary.

## State Shape

**Status: shipped.** `freshState()` is the authoritative shape; this table is the annotated version.

| Field | Type | Purpose |
|---|---|---|
| `res` | one key per resource id (all eras) | Current stockpiles |
| `jobs` | one key per job id (all eras) | Civilians assigned per gather job |
| `builds` | one key per building id (all eras) | Completed building counts (repeatable unless `cap`ped) |
| `units` | one key per unit id | Trained person-types. Separate from `builds` so it renders in Your People, not Settlement |
| `upgrades` | `{[id]: true}` | One-time upgrades; key presence = owned |
| `buildQueue` | `[{id, kind, uid, total, remaining, cost}]` | FIFO, shared by buildings/upgrades/units; only `[0]` progresses. `cost` is the exact price paid, stored for cancel-refunds |
| `buildSeq` | number | Monotonic counter for queue `uid`s (the DOM diffing key) |
| `pop` | number | Total population, **including** trained units — they eat and occupy housing |
| `growth` | number | Seconds accrued toward the next free settler; **freezes** (not resets) while housing is full |
| `bought` | number | Lifetime settlers grown — a game-over stat only |
| `era` | string | `"stone" \| "bronze" \| "iron"` — the key into `MANIFESTS`. The entire era system is this one string |
| `eraHistory` | `{[era]: snapshot}` | Frozen pre-transition snapshot, archived by `advanceEra()`; migration formulas read it, humans debug with it |
| `playtime` | number | Seconds the simulation has actually advanced (frozen while paused) |
| `seen` | `{[revealId]: true}` | One-time reveal hints already fired, plus sticky `rev:` entries |
| `dead` | boolean | Game-over flag |
| `adversaries` | `{[id]: {stock, standing, walls}}` | The living remnant per adversary (see Adversaries & Expeditions) |
| `expeditions` | `[{uid, type, adversary, units?, cargo?, total, remaining}]` | At most one campaign and one caravan |
| `lastSeed` | number | `Date.now()` at last save. **Deleted in phase 3** |

**Pending additions:** `S.tick` (phase 4), `S.seed` / `S.rngState` (phase 2), `S.pending` (phase 7).

Population is **not** `jobs` summed plus idle. A person is in one of three states: assigned to a civilian job, idle, or converted to a unit (permanently outside the assignable pool). See *Units & Military* for the derived-value math.

## `step(dt)` — Order of Operations

**Status: shipped.** Phase 4 renames the parameter and changes its unit; the order does not change.

1. Bail if `S.dead`.
2. Advance `S.playtime` — here rather than in the loop, so it measures exactly one thing: how far the world actually moved. It therefore freezes when paused and stops at death for free.
3. Compute `rates()` (production, upkeep, net food).
4. Apply production/upkeep to every resource in `active().resources`, scaled by `dt`.
5. `runConverters(dt)` — the Forge and anything else with a `converts` spec.
6. Clamp every resource to `caps()` — silently; a one-time Chronicle hint covers the concept.
7. Starvation check: `food <= 0` and net food negative ⇒ `die("starvation")`.
8. Advance `buildQueue[0]` by `CONFIG.buildSpeed * dt`; on completion `shift()` and `completeConstruction()`.
9. `accrueGrowth(dt)` — a free settler every `CONFIG.settlerIntervalSeconds` while housing has room. **Growth is a background process, deliberately not an event** (`design.md`). Progress freezes rather than resetting when housing is full, so a partly-waited arrival lands soon after a new hut.
10. `resolveEvents(dt)` — whatever the active manifest's slate holds.
11. `resolveExpeditions(dt)` — outbound columns tick and resolve.
12. Wipe-out check: `S.pop <= 0` ⇒ `die("conflict")`. Generic rather than attributed, so "what happens when population hits zero" lives in exactly one place regardless of cause. In practice only Conflict can reach it (Sickness floors at one survivor by design).

## Resource System

**Status: shipped.**

`rates()`, `mults()`, `caps()` all iterate the active manifest's lists rather than naming resources individually.

- **`rates()`** returns gross per-second production per resource plus `upkeep` (`pop * CONFIG.upkeep`) and `foodNet`. Converter consumption is deliberately *not* netted here (see Converters).
- **`mults()`** returns each resource's multiplier: `1 + (boost building count) * CONFIG.buildingBonus + tool bonuses`. Tool upgrades are flat additive terms applied to every resource and stack with each other and with per-resource boost buildings, forever (Stone 0.08 → Bronze 0.15 → Iron 0.22).
- **`caps()`** returns ceilings from each resource's `baseCap` plus `(capBuilding count) * CONFIG.storageAdd`. Every resource is capped; a resource with `capBuilding: null` simply sits at a generous base forever.

### Table-driven resources and jobs

Adding three resources once forced a refactor: `rates()`, `mults()`, `caps()`, the clamp loop, `jobsUsed()`, `removeSettler()` and the ledger markup each hardcoded exactly three resources by name. All of them now iterate:

- **`resources`** — `{id, name, baseCap, capBuilding, reveal?}`. Ledger rows are *generated* at render time rather than written into `index.html`, so a new resource needs no markup change. In-era resources that should show immediately at zero carry `reveal: () => true`.
- **`jobs`** — may carry `rateMult` (tin yields ×0.5) and an optional `reveal`.

`BOOST_BUILDING` maps a resource to the building that boosts it, kept global as era-neutral identity data like icons; it graduates into the manifests if an era ever remaps a boost. `releaseOrder()` derives from the active manifest's jobs (reversed, foraging forced last) and drives `removeSettler()` — the old hardcoded three-job list could, with five jobs, leave `jobsUsed() > civilians()` and drive `idle()` negative.

### Converters

The Forge transforms resources rather than producing or boosting them: an optional `converts: {in, out, rate}` on a building def, processed by `runConverters()` in `step()` after production and before the storage clamp. Throughput is clamped three ways so it degrades smoothly instead of erroring or destroying inputs:

1. by `owned × rate × dt`,
2. by the inputs actually in store — partial rate when short, idle at zero,
3. **by headroom under the output's cap**, so a full store stops the Forge instead of quietly eating its inputs for nothing.

No worker assignment (`design.md`), so no `popCost` or job wiring. `rates()` reports gross; the **ledger displays `ledgerRates()`** — gross plus live converter flows, outputs positive, inputs negative, computed with the same three clamps — so a starved or output-capped Forge honestly reads as stopped rather than advertising its theoretical speed. The input clamp counts incoming production alongside stock, so a Forge fed at exactly its consumption rate reads steady instead of flickering. Negative flows pick up the ledger's red styling, so a draining pile scans as a problem at a glance. Folding flows into `rates()` itself would double-convert; the split is deliberate.

**The bronze equilibrium falls out of the numbers rather than being special-cased**: copper mines at 0.20/s, tin at half that, so 2 copper miners : 1 tin miner produce ore in exactly the 4:1 ratio the recipe consumes, and 2 Forges (0.05 bronze/s each) consume precisely that output. Nothing hints at it; it is simply there. Iron retargets the same building to `{iron: 3, wood: 2} → {steel: 1}`, which finally gives wood a late-game sink.

## Construction Queue

**Status: shipped.**

One shared FIFO queue serves buildings (repeatable, scaling cost), upgrades (one-time, flat) and units (flat, plus `popCost`). `build(def)`:

1. Costs via `buildCost(def)`. For `kind: "building"` this scales by `(S.builds[id] + pendingCount(id))` — cost escalates against *owned + already-queued*, so stacking clicks doesn't undercut the curve. Everything else is flat.
2. For upgrades: refuses if already owned or already queued. One-time means one-time.
3. Deducts cost immediately — payment at click time, not completion.
4. Pushes `{id, kind, uid, total, remaining, cost}`. **`cost` is stored on the item**, not recomputed later, specifically so `cancelBuild(uid)` refunds exactly what was paid even when a later-queued copy of the same building cost more.

`step()` only ever decrements `buildQueue[0].remaining`; everything behind it sits at full `remaining` and renders at 0%. `pendingCount(id)` counts matches anywhere in the queue and backs cost escalation, the already-queued check, and the "(+N queued)" label. `cancelBuild(uid)` finds by `uid`, refunds, and splices — identical whether the item is at index 0 or waiting, since cancelling the front simply promotes index 1 next tick with no special-casing.

## Buildings, Upgrades & Units

**Status: shipped.**

The active manifest's `buildings` is a flat array; each entry has `id`, `name`, `kind`, `desc`, `base` cost, `scale`, `buildTime`, and `reveal()` — a predicate deciding whether the buy-card exists yet (made sticky by `isRevealed()`; see Persistence). This is the mechanism behind "the interface unravels": a card is created in the DOM the first time it reveals and never removed.

`upgrades` is the same shape minus `scale`; `units` is a third list carrying `popCost`, `strength`, `casualtyWeight`, an optional `counters`, and an optional `siege: true`. `defById(id)` searches all three lists of the **active manifest** first — that's what gives a log line or queue card its era-correct name — falling back to `DEF_INDEX` (latest-era def per id, built at compile) for ids that outlive their era, like a capstone completing at the moment it retires itself.

The rest of the engine never needs to know which list an item came from. It branches on `def.kind` only where the categories genuinely differ: `buildCost()` scales only for buildings, and completion writes to a different bucket per kind (`S.builds[id]++` / `S.upgrades[id] = true` / `S.units[id]++`).

Buildings may carry a `cap` (Barracks and Muster Ground: `cap: 1`). Once `(S.builds[id] || 0) + pendingCount(id) >= cap` the card disables and shows "Maxed". **`build()` itself also refuses**, so the cap is enforced at the data layer rather than only in rendering.

`BUILDING_ICONS` / `PERSON_ICONS` / `QUEUE_ICONS` map ids to small inline `<svg>` line art (1.6px stroke on a 24px grid, `currentColor`, rendered at 21px). Upgrades have no icon and appear in no holdings panel — a permanent trait is a different kind of thing from a countable holding.

## Eras: The Manifest Model

**Status: shipped (Phases A, B, C1, C2, C2.1).** Design rationale in `design.md`, *The Era Manifest Model*. This is the architecture the rest of the game hangs off, and it is the part of the codebase that has paid back the most.

**Authoring.** `STONE` is a full base manifest: `name`, `housingPerHut`, `panelTitles`, `popNoun`, `raidTypes`, the five def categories (`resources`, `jobs`, `buildings`, `upgrades`, `units`), `adversaries`, and two slates (`events`, `hints`) naming entries in the id-keyed `EVENT_LIB` / `HINT_LIB`. `BRONZE_DELTA` and `IRON_DELTA` are authored as **deltas**: `remove`, `override`, `add` (per category), fresh slates, an optional `consolidate` spec, `migrations`, and any era-scoped scalars. Reading the delta *is* reading the era's design — Iron's literally reads "remove the bronze economy; add iron and gold; the Forge now smelts steel."

**Compilation.** `compileBase(STONE)` + `extendEra(parent, delta)` run at load into `MANIFESTS`. Every def is shallow-copied, so an override can never mutate the parent era's copy. The compiler **throws** on: remove/override targets missing from the parent, duplicate `add` ids, a missing slate, and unknown slate ids — at load, before a frame renders. Silent wrongness from a dangling id is this project's signature bug class; the compiler converts it into a loud one. (Phase 4 adds per-second → per-tick conversion to this pass.)

**The indirection.** `active()` returns `MANIFESTS[S.era]`, and every engine and render read of content goes through it — rates, caps, converters, events, hints, combat math, expeditions, every render function. Nothing outside the active manifest renders, produces, fires, or can be purchased. The engine never consults `S.era` for content decisions; `S.era` is nothing more than the key, so `advanceEra()` swaps the entire world in one assignment.

**Slates never inherit.** Each era declares its complete `events`, `hints` and `adversaries` lists even in delta form — a forgotten event is a loud authoring decision, not a silent omission. The predecessor design (per-event `eras: [...]` allowlists) once silently stopped events firing after a flip, with no error; the harness now asserts slate membership per era instead.

**Era-varying values.** `housingPerHut()`, panel titles and the age badge read `active()`. The Info panel iterates `ERA_ORDER` and reads each era's compiled manifest directly, so the Iron tab shows Iron names while you are still in Stone.

**Two rendering gotchas that predate manifests and still apply:**

- **Anything era-dependent must be re-rendered, not written once at creation.** `renderTile()` once baked the name in at tile creation, leaving "Medicine Tent" on the Settlement tile after the flip. Name spans get rewritten every render. The same trap, in a nastier form, produced the time-capsule click bug — see *Rendering*.
- **Prose that names a building goes stale too.** Herbal Medicine's desc is overridden per era; Sickness's flavor was instead reworded era-neutral ("your healers"), because era-keying flavor arrays is more machinery than the problem deserves.

**The capstone Upgrade.** Advancing is an ordinary upgrade in the outgoing era's manifest (`bronzeAge`, `ironAge`), inheriting the queue, cost check, build timer, cancel-and-refund and "owned" state for free — and the incoming delta **removes** it: a capstone exists only in the era it ends. Its `reveal` reads *current* state (`S.pop >= 16 && (archer || horseman) >= 1`) rather than an ever-trained flag, because sticky reveals already cover the case where the units later die. `CAPSTONES` (id → era) maps completion to `advanceEra()`, the only place `S.era` is ever assigned. Because it sits in the normal queue, hazards keep resolving throughout its long build — the design's intended source of "and some luck."

**The validator.** `validateManifests(MANIFESTS)` runs at load immediately after compilation and throws with a full problem list on any within-era dangling reference: cost keys, `converts.in`/`out` keys and `job.res` against that era's resources; `capBuilding`, `BOOST_BUILDING` targets and event `counter.building` against its buildings; unit `counters` and adversary `fightsAs` against its raid types; adversary `stock` keys and `buys.res` against its resources; `buys` only on peaceful adversaries; `consolidate.keep` in `(0, 1]`; plus def-shape checks and migration-instruction sanity. **This is what makes removal safe to author**: retire a resource and everything still mentioning it becomes a load-time error instead of NaN production or a converter that silently never runs. Honest limit, unchanged: `reveal()` predicates are arbitrary code, so a stale reference there yields a card that never appears — annoying, but it cannot break the economy.

**The era transition.** `advanceEra(era)` is the whole machine, in deliberate order:

capture `before` values and a frozen deep-copy **snapshot** while the old manifest is still active → archive it in `S.eraHistory[fromEra]` → flip `S.era` → `initAdversaries()` → `runEraMigrations()` → `applyConsolidation()` if the era declares one → `purgeDom()` → `reconcileWorkforce()` → announce.

Snapshots exclude `eraHistory` itself so they never nest; they are a few hundred bytes each, kept forever, and are the raw material for diagnosing or recovering a bad migration — the project's first genuinely destructive state change.

`runEraMigrations(fromM, toM, snapshot)` applies one built-in default (workers on a job that left the manifest return to idle, with a Chronicle line) then the entering era's `migrations` list, authored on the delta and never inherited:

- `{bucket, id, vanish}` — zeroes state (deletes, for `upgrades`)
- `{bucket, id, convertTo, ratio?}` — moves it within the bucket, floored
- `{bucket, id, fn}` — computes a fresh value

**Formulas read only the frozen snapshot and write only live state**, so instruction order cannot matter by construction; the harness proves it with an `fn` that reads a value an earlier instruction already vanished. Everything else carries implicitly. Every instruction carries its own Chronicle line — state silently rearranging itself is exactly the invisible-sink mistake this project already made once.

`applyConsolidation({keep, narrate})` re-denominates the population unit at a border: civilians and each job scale by `keep` (floored, pop floored at 1), units scale by `keep` but never below their deployed count, and `S.pop` is recomputed as civilians + units. Iron currently keeps 0.7. It is **THE** pacing dial for the border, and phase 6 (G1) cranks it hard and pairs it with an era output multiplier so `keep × output ≈ 1`.

**Naming consequence of the merged ladder — read before touching `popNoun`.** *(Design settled 2026-08-22; implementation pending — phases 6 and 8.)* `design.md` merged the population ladder and the map's tile ladder into one, because from Iron onward every rung of the population ladder was already a place. The shipped `popNoun` era-fact therefore changes meaning rather than going away:

- **Stone and Bronze:** `popNoun` keeps its current job. Population is individual people, it is a lever, and a tile is a clearing that holds several of them. Nothing changes.
- **Iron onward:** `popNoun` *is* the tile noun. Population is not a separate quantity — it is the count of places held, so `S.pop` past Iron should derive from the map rather than being tracked beside it. Expect `popNoun` to be renamed `tileNoun` (or for both names to point at one era-fact) when phase 8 lands; do not introduce a second, competing noun field in the meantime.
- **A third, independent string arrives with the odometer** — souls / subjects / citizens / beings. It names a mass of people rather than a place, never touches a mechanic, and therefore cannot collide with the tile noun. Keep it a separate era-fact for exactly that reason.

The odometer itself is **derived and never stored**: `souls = Σ tiles × soulsPerTile(era)`. It must never appear in a cost, cap, rate, requirement, or stepper — the moment it gates anything, the small-numbers pillar is broken. It is the one display in the game permitted number compaction.

A sequencing question this opens, and it needs answering before either phase starts: **terrain-derived production lands with phase 6 (G1), not phase 8.** Per-hex allocation replaces the job steppers at Iron (`design.md`, *Allocation — the permanent verb*), so the moment G1 ships the player needs hexes to click — but hexes live on the map. **Decided 2026-08-22: phase 8's M1 slice lands inside phase 6.** The alternative — an interim production model built and then thrown away — is the more expensive mistake, and it is the one that is hard to unwind later. If pulling M1 forward goes badly, the revert target is the commit that recorded this decision, and the interim model is still available from there.

`purgeDom(fromM, toM)` removes the DOM nodes (`bcard-`, `hold-`, `ptile-`, `job-`, `res-` prefixed) of every id that didn't survive — the one place content ever leaves the screen. "Nothing can un-reveal" holds everywhere except an era boundary. Renderers only create nodes for manifest members, so a purged id stays gone.

`manifestDiff(fromM, toM)` computes `{added, removed, renamed}` across buildings/units/upgrades — **one diff, two consumers**: the purge mirrors it, and the era modal derives everything but the flavor lead from it. `ERA_TRANSITIONS[era]` holds only a `lead` sentence; the hand-maintained change list is gone and cannot go stale.

**Semantics sharpened by `active()`** (all unreachable in normal play, now uniform by construction): `stealResources()` only touches this era's resources; `releaseOrder()`/`jobsUsed()` cover exactly this era's jobs; combat iterates this era's units. A unit type with a nonzero count but no manifest entry neither fights nor dies — inert state, per invariant 4.

### The settled invariants

**Status: in force. Every future era must honor these.** Rationale in `design.md`.

1. **Ids are permanent and global.** The same id in two eras' manifests is *the same entity*; an id, once shipped, is never reused to mean something else.
2. **The compiled manifest is the complete truth of its era.** Nothing outside it renders, produces, converts, fires, or can be purchased.
3. **Content absence = removal; carrying is the default.**
4. **State is never implicitly destroyed.** State under departed ids is inert, not deleted; only explicit, narrated migration instructions transform it. (One default policy on top: workers on a removed job return to idle.)
5. **Migration formulas read a frozen pre-transition snapshot**; writes apply to live state. Instruction order cannot matter by construction.
6. **The snapshot is archived** in `S.eraHistory[fromEra]`, one per era left, kept forever.

**Explicit non-goals, still:** no ECS, no event-sourcing, no reactive state framework. The simulation is small; the pain was content lifecycle, and manifests solve exactly that with plain data.

## Events Engine

**Status: shipped.** Phase 7 adds the `decide` shape; nothing below changes.

`EVENT_LIB` (id-keyed) holds every event that exists in any era; the active manifest's `events` slate decides which are live. There are no era tags on events.

```js
{
  sev: "good" | "bad",
  // exactly one of:
  canFire: (S) => boolean,        // deterministic, re-checked & fired repeatedly per tick
  chancePerSecond: number,        // probabilistic, converted to a per-dt roll
  resolve: (S, dt) => { ... },    // full escape hatch: owns its trigger + effect + flavor
  condition: (S) => boolean,      // optional extra gate
  counter: { building, reducePerUnit },  // optional negation source; reducePerUnit may be a
                                          // flat number or (S) => number, for counters whose own
                                          // strength is upgradeable (Herbal Medicine)
  effect: (S) => { /* mutate state */ },
  flavor: { hit: [...], negated: [...] },  // negated only used if `counter` present
}
```

`resolveEvents(dt)` iterates `active().events` once per `step()`:

1. Skip events whose `condition` fails. Era eligibility needs no check — an event absent from the slate does not exist right now.
2. **`resolve`-based events** are called with `(S, dt)` and left entirely to themselves: no generic trigger roll, negation or flavor logging happens around them.
3. **Deterministic events** (`canFire`) loop-fire while the condition holds, guarded at 50 iterations. Currently no users — population growth was the only one before it moved to `accrueGrowth()` — but the archetype stays as the generic deterministic shape.
4. **Probabilistic events** (`chancePerSecond`) roll once per step at the dt-adjusted probability. On a hit, `negateChance(ev)` (`min(1, counterBuildingCount * reducePerUnit)`) gets a second roll; negated events log the `negated` line, always styled `"good"` (averting bad news is good news) and skip the effect entirely.

**The `resolve` escape hatch is a generic engine affordance, not a Conflict special case.** Conflict needed a population-scaled trigger, a variable raid size, a two-stage outcome and outcome-dependent flavor; rather than contort the generic shape, any event with that much internal complexity may own its own resolution. Phase 7's decision events are the second archetype that will want it.

**Great Hunt** and **Trader** are positive-only entries using the plain `chancePerSecond` + `effect` shape — proof the generic shape was never inherently hazard-specific, it just happened to only have hazards using it. The negation branch is skipped automatically because `negateChance()` returns 0 when `ev.counter` is absent.

Flavor lines are picked at random from each pool (`pick()`) for variety across repeats.

### `reconcileWorkforce()` — and the bug that produced it

**Status: shipped. Kept in full because the class of bug recurs.**

A civilian can be spoken for in *two* ways: assigned to a job, or reserved by a queued unit order. The original code balanced deaths against `jobsUsed()` alone, so a death while a Soldier sat in the queue left the books short by exactly the reserved worker and `idle()` displayed **−1**. It was reported from real play, and the visible symptom was oblique: clicking a job's minus button "absorbed" the deficit, which read as a worker vanishing.

The reconciler balances against `jobsUsed() + reserved() - civilians()` and resolves the shortfall in two stages:

1. Release people from jobs, following `releaseOrder()` (derived from the era's jobs, reversed, foraging last).
2. If emptying every job still isn't enough — possible when more unit orders are queued than there are survivors — abandon the newest unit orders, refunding materials exactly as a manual cancel would. `dropQueueItem()` is shared with `cancelBuild()` so the refund path cannot diverge.

The harness fuzzes it: 400 random settlements with random armies, queues and death sequences, asserting `idle()` and `civilians()` never go negative. **The generalizable lesson: any derived quantity with more than one claimant needs a reconciler, and the reconciler needs a fuzz test, because the failure mode is a small negative number on screen rather than a crash.**

`removeSettler(allowZero = false)` is the shared "a civilian dies" helper. It no-ops when `civilians() <= 0` — a settlement of nothing but trained units has no one for it to take, and without the guard `S.pop` could be pushed below the unit total, making `civilians()` negative. Otherwise it decrements `pop` (floored at 1 unless `allowZero`) and reconciles. Contrast `removeRandomUnit()`, which drops a unit and `pop` together so `civilians()` is unchanged and no reconciliation is needed.

## Progressive Reveal Hints

**Status: shipped.**

Distinct from events: `HINT_LIB` (id-keyed) holds one-time Chronicle hints (`{when, msg}`); the active manifest's `hints` slate decides which are live, and `checkReveals()` iterates that slate every tick. These aren't stateful occurrences — they're narration for "you've discovered a new mechanic" (first wood gathered, storage cap first hit, sickness becoming possible at `pop >= 4`). Each fires exactly once, tracked in `S.seen`. Era-specific hints are gated purely by slate membership, never by `S.era` checks inside `when()`.

## Units & Military

**Status: shipped; substantially reworked in phase 6.** Read this together with *Conquest Growth*, below — G1 changes the population math described here.

A unit def carries `popCost` — civilians it permanently consumes. That drives the population math:

```js
function civilians()   { return S.pop - Object.values(S.units).reduce((a, b) => a + b, 0); }
function reserved()    { return S.buildQueue.reduce((sum, q) => sum + (defById(q.id).popCost || 0), 0); }
function jobsUsed()    { return active().jobs.reduce((sum, j) => sum + (S.jobs[j.id] || 0), 0); }
function idle()        { return civilians() - jobsUsed() - reserved(); }
```

`reserved()` sums `popCost` across the **entire queue**, front and waiting alike — a civilian leaves the available pool the instant an order is queued, matching "it takes one civ out, runs a progress bar, then you get a soldier." `build()` checks `idle() >= (def.popCost || 0)` alongside resource affordability, so recruiting competes directly with job assignment for the same pool. On completion the civilian permanently exits `civilians()` via `S.units` rather than returning to idle.

Ongoing food upkeep needs no new code: `S.pop` already includes units, and the upkeep line is just `S.pop * CONFIG.upkeep`.

### Raid types & composition

`raidTypes` (declared in stone, inherited unchanged since) rolls independently of `RAID_SIZES`. `militaryStrength(raid)` sums `unitStrength()` across the era's unit types, each contributing `count × strength × weaponMultiplier() × (matched ? CONFIG.counterBonus : 1)`.

**The critical property is enforced by the formula's shape, not by a special case:** the non-matching multiplier is **1, never below**. Units are never penalized for being the wrong type, only un-bonused, so any army always beats no army.

**The counter relationship is stored in exactly one place**: a unit def's `counters` field naming a raid id. An earlier pass *also* put the reverse mapping on the raid type and compared `def.counters === raid.counter` — a raid id against a unit id, always false, silently disabling every counter bonus in the game with no error. The redundant field is gone; `counterUnitFor(raid)` searches `active().units`. A `warband` is simply a raid no unit names, so nothing counters it, with no null-handling needed. **This is the archetype of the bug class the validator exists to catch, and the reason duplicate representations of one relationship are treated as a defect here.**

Composition mismatch feeds a second, softer dial rather than `repelChance`: `counterCoverage(raid)` returns the share of your defense coming from the countering unit, and the costly-repel probability is multiplied by `1 - CONFIG.counterCasualtyRelief × coverage`. Fielding the right unit wins more fights *and* buries fewer of your own.

**Casualty exposure.** `removeRandomUnit()` draws weighted by headcount × the unit's `casualtyWeight` (Soldier 1.0, Horseman 0.6, Siege Engine 0.5, Archer 0.35), so the front line absorbs most losses and archers read as the backline unit they're meant to be. Every weight is deliberately **greater than zero**, which is what makes this bend the odds rather than grant immunity: an archer can always be the one who falls, and an all-archer army degenerates to "the archer dies" with no protection at all. Measured over 30,000 draws from an even 10/10/10 army: soldier 50.9%, horseman 31.1%, archer 17.9%. A trailing fallback loop covers the floating-point case where accumulated subtraction walks the roll past the end of the list — without it a rounding error returns `null` and silently skips a casualty.

`stealResources()` loops every resource in the active era.

### Conflict

Conflict uses the `resolve()` escape hatch. Its algorithm:

1. **Trigger** — `chance = CONFIG.conflictBaseChance * (1 + S.pop * CONFIG.conflictPopScale)`, further multiplied by `hostilityMultiplier()` (×1.5 per Hostile warlike neighbour), converted to a per-`dt` roll. Frequency scales continuously with population — a bigger settlement is a bigger target — rather than using a threshold gate. Also gated behind `S.pop >= 4`, matching Sickness's early grace.
2. **Raid size and type** — independent weighted picks from `RAID_SIZES` (small/common, large/rare) and the era's raid types. Size is "sometimes 2 scouts, sometimes 10"; type is what composition plays against.
3. **Defense** — `militaryStrength(raid)`. `weaponMultiplier()` is tiered, highest owned wins (Iron 3.0 > Bronze 2.2 > Flint 1.6 > unarmed 1.0); `armorFactor()` has the same lowest-wins structure pointed the other way. Zero units means zero defense, full stop.
4. **Repel check** — `repelChance = defense / (defense + raidSize)`. A ratio, not a threshold: always some chance either way, more investment always shifts the odds, nothing ever reaches exactly 0% or 100%.
5. **Consequences**, banded by outcome:
   - **Repelled, clean** — no losses.
   - **Repelled, costly** — rolled separately (`raidSize / (defense + raidSize)`, softened by armor and by `counterCoverage()`); one unit lost via the exposure-weighted draw.
   - **Raid succeeds** — `1 + floor(raidSize / 5)` units lost (capped at how many exist), a fraction of every resource stolen (scaling with raid size, capped at 50%), and — only if defense was especially thin relative to the raid, including `defense === 0` — one civilian lost via `removeSettler(true)`.

Conflict is the one hazard allowed to end a run (`design.md`, *Failure*), which is why it passes `allowZero: true`. **It does not end the game itself** — the generic `S.pop <= 0` check in `step()` does.

## Adversaries & Expeditions

**Status: shipped (C2, C2.1, plus siege).** Design canon in `design.md`, *Adversaries & Expeditions* and *Siege & Fortifications*.

**`adversaries` is a manifest category declared wholesale per era, never inherited** (stone and bronze: `[]`). Shape: `{id, name, disposition: "peaceful"|"warlike", strength, walls?, fightsAs: raidTypeId, stock: {resId: n}, buys?: {res, amount, pays}, campaignTime, caravanTime?, desc}`.

**State** (additive, defensively merged): `S.adversaries = {[id]: {stock, standing, walls}}`. The manifest entry is the *template*; the state entry is the *living remnant* that depletes. `S.expeditions` holds at most one campaign and one caravan (`expeditionOut(type)` guards per type — never two of a kind).

**Deployment thins home defense, genuinely.** `deployedCount(unitId)` sums over active expeditions; `unitStrength()` counts `S.units[id] - deployed(id)`, and the home-side casualty draw only touches undeployed units. Campaign casualties draw from the deployed set with the same exposure weights and decrement `S.units` + `S.pop` on resolution. An army on campaign is not home; that is a mechanic, not flavor.

`resolveExpeditions(dt)` runs in `step()` after events and before the wipe-out check: tick `remaining`, and at zero resolve.

**Campaign resolution, in strict order:**

1. **Standing falls by 1 immediately** — plunder is not diplomacy, win, lose, or turned back at the walls.
2. **The breach phase, if the target still has walls.** `wallPower(units)` = `Σ count × strength × weaponMultiplier() × (siege ? CONFIG.siegeWallBonus : 1)`. No counter bonuses — walls have no fighting style. If power is short of the remaining wall, the column withdraws with at most one casualty (`CONFIG.wallRetreatLoss × armorFactor()`) and **the damage it did persists in `st.walls`**. Stock-not-economy extends to fortifications: the scars stay carved for the era, so a failed assault is an investment rather than a wasted reroll, and sieges against hard targets become sagas. The narration distinguishes a wall that fell in one furious assault from a battered one that finally gave way (`fresh = st.walls >= adv.walls`).
3. **The field battle**, only once the walls are down. `attack = campaignStrength(units, adv)` (the raid math pointed outward, with the counter bonus applied against `adv.fightsAs`); `winChance = attack / (attack + adv.strength)`.
4. **Win** → plunder `CONFIG.plunderFraction` (0.4, floored) of each stock resource, which leaves the target permanently poorer because a stock is not an economy; plus a possible single casualty, armor-softened. **Lose** → no loot, `1 + floor(adv.strength / 8)` casualties capped at the deployed count.

**Caravan resolution:** gold paid = `min(pays, their remaining gold)`, ×1.25 at Friendly; their gold stock decrements; **the goods you sold join their stock**, where a later campaign could take them back (nothing enforces or even mentions that arbitrage — it is simply true, because stocks are real); standing +1. While any warlike neighbour is Hostile, `riskAdversary()` names the strongest one and the caravan is ambushed at `CONFIG.caravanRaidChance`. **Escorts do not reduce the ambush chance — they contest the ambush**: `escortStr / (escortStr + raiders.strength)` to fight through and complete the trade, with casualties possible either way. Escorted guards deploy like campaigners and thin home defense, so guarding trade is a real allocation, not a checkbox.

**Standing** is one integer per adversary, moved by exactly two things, read out only as a word: ≤−2 Hostile, −1 Wary, 0–1 Neutral, ≥2 Friendly. All the consequences V1 has: each Hostile **warlike** adversary multiplies the home conflict trigger by `CONFIG.hostileConflictMult`; a Hostile **peaceful** one refuses caravans; a Friendly one pays a premium. Trading at Wary gets a cold narrated line — the system is hinted, never printed.

**Validator additions for the category:** `fightsAs` ∈ era raid types; `stock` keys and `buys.res` ∈ era resources; `buys` only on peaceful adversaries and only with a `caravanTime`; `walls >= 0` if present; `campaignTime > 0`.

**Resolution lines log unconditionally.** Rare and story-critical, same rule as migration narration.

**Layout.** `#panel-expeditions` sits at grid row 2 / column 4; the Chronicle's `grid-row: 1 / 3` becomes conditional and drops to row 1 once the Muster Ground reveals — the same sticky-span machinery the roster panels use, pointed the other way. Each adversary renders as a create-once card: name, disposition, standing word, known stock, wall state, campaign allocator (job-style steppers per unit type) and caravan button with the posted exchange. Campaigns launch through a muster **modal** (description, live estimate, steppers; the allocator is module-level UI state like `paused`, reset on launch). Caravans stay one-click on safe roads and open an **escort modal** when the roads are dangerous. Expeditions render as cancel-less progress cards at the top of the queue panel, typed by `QUEUE_ICONS`, with uids prefixed `x` so they share the panel with build uids.

**The panel is gated on era, not progress**: `expeditionsUnlocked()` is `active().adversaries.length > 0`, so it stands in any era whose manifest declares an outside world. The Muster Ground gates the *actions* on the cards (with a tooltip reason on each disabled button), not the panel — reading your neighbours before you can act on them is the point, since the cards are the recruiting poster for the building.

## Rendering

**Status: shipped.**

No framework — direct DOM manipulation, with one law used everywhere something repeats: **create the element once, on first appearance, and update its contents in place on every subsequent render.** `renderAll()` runs 5×/second, so rebuilding via `innerHTML` is both wasteful and silently drops event listeners on child elements.

**Two bugs made that law non-negotiable. Both are still live lessons.**

**The click-eater.** The oldest bug in the project: buys sometimes took two or three clicks. The three buy-card renderers rewrote `card.innerHTML` on every 200ms tick — and a click is not instantaneous. Mousedown landed on a child span, the next tick destroyed it, mouseup landed on its replacement, and the browser dropped the click because the pressed element no longer existed. Roughly half of all presses straddle a tick. The steppers never suffered, because they update stable nodes — which was already the stated rendering law; the card renderers had violated it since v1. Cards now build a skeleton once (`cardSkeleton`) and update via `textContent`/`classList`; cost spans rebuild only when the *part count* changes (era re-pricing, capped flips). Verified live: child nodes survive 20 render ticks identically. **The generalizable rule: a node the player can press must not be replaced on a timer.**

**The time-capsule click.** Different cause, same neighbourhood. Archers and Horsemen wouldn't train in Iron while Soldiers and Siege Engines would. A buy card's click listener had captured the **def object of the era the card was created in** — cards born in Bronze still called `build()` with the bronze-era def, whose cost names a resource that no longer exists. The *display* path reads the active manifest, so the card showed iron prices and looked perfectly buyable; only the click was stale. Soldier never broke (identical cost in every era) and Siege Engine never broke (born in Iron), which is exactly the symptom pattern. Fix: **resolve the def by id at click time via `defById()`**, which answers with the active era's version. **The generalizable rule: a closure created once and invoked later must capture ids, never era-scoped objects.** This is the same trap as "re-render era-dependent text," in the one place where re-rendering doesn't help you.

**Panels no longer hide themselves.** Every panel the active manifest can fill is in the DOM and visible from the first frame; only its *contents* are reveal-gated. Rows and cards carry a `hidden` class toggled by `isRevealed(def)` (never `def.reveal()` directly — see Persistence), and the buy-list renderers toggle an empty-state sentence instead of the panel's own visibility. The only era-gated panel is Expeditions.

*Historical note, kept because the reversal reversed a reversal and the reasoning is the interesting part.* The board *was* whole from frame 1 originally; that changed once live play showed empty panels reading as clutter; and it is now back, because the premise of that complaint was the flat pen-on-paper wireframe in which an empty panel and a full one looked identical. Bureau gives every panel an ink header plate and its own paper stock, so an empty one reads as a blank form. Two pieces of machinery went with the reversal: `S.seen.queueUsed` was removed (it had become write-only state persisted into every save), and `updateSpans()` shrank to the Chronicle's double-height span alone.

**Your People** renders person-type tiles the same create-once way Settlement renders building tiles — reusing the `.holding` visual style, but living in a different panel and a different state bucket, since "who your people are" and "what you've built" are deliberately separate questions. Settler count shown is `civilians()`, not `S.pop`.

**Dynamic row-span.** A top-row panel expands to fill its whole grid column when its paired bottom-row panel has nothing revealed yet, rather than leaving an unexplained blank cell — driven by the same reveal check as `hidden`, applied to a `.span-both` class. In practice only Your People/Training shows it for a real stretch (Barracks is a mid-game unlock); applying the rule uniformly rather than special-casing the one panel where it matters is what makes it cheap insurance instead of one-off code.

**Descriptions live only in the tooltip.** `attachTip(el, getter)` stashes a *getter* on the element rather than a snapshot, because cards update in place and a snapshot taken at creation goes stale immediately — the same class of mistake as the time-capsule click, caught early. The tooltip carries a title, a body that can afford to be verbose, and the refusal reason (`shortfallLine()` → "Short 24 wood."), so there is exactly one place to look when something won't buy.

`log()` prepends rather than appends, so the newest Chronicle line is always the first child and `el.scrollTop = 0` keeps it in view; the 60-entry trim accordingly removes from `lastChild`. Each entry is a 28px row: a mark in a 32px gutter (`+` good, `!` danger, `★` milestone, `·` neutral) whose right edge *is* the legal pad's red margin rule, then the text. The mark repeats what colour already says, deliberately — it survives skimming and it survives colour blindness. Severity is passed explicitly at the call site, never inferred from the text.

## Modals

**Status: shipped; the pause flag is pending — phase 5.**

One modal at a time, centered over a 30%-black fixed overlay. Deliberately minimal: **no dragging, resizing, or minimizing** — the panel sizes to its content up to a `max-height`, past which its `.block-body` scrolls internally like any other panel. It reuses the `.block` shell so it matches the board visually for free. Dismiss via the header ×, a backdrop click, or Escape; clicks *inside* the panel are checked against `e.target.id === "modalOverlay"` so they don't close it.

`openModal(title, bodyHTML, actions, onMount)` is the whole API. `actions` renders a button row along the bottom edge (`danger: true` renders in the warning red); `onMount` runs after `innerHTML` is set, which is how the Info panel attaches its tab listeners and the muster modal wires its steppers.

Under Bureau the modal is the **ceremony register** and looks the part: legal-pad stock, a hard 6px offset shadow (the only shadow in the game), a Newsreader lead in a box. The game interrupts the player rarely, so the few moments staged here land with disproportionate weight — **new features should earn a modal rather than default to one.**

**Gotcha, found in live play, still live:** a `body.dead .block` rule intended to dim the board on death also matched the modal panel, so the game-over modal — which by definition only appears while dead — got dimmed too. Now scoped to `body.dead #mainArea .block`. Anything else styling `.block` broadly needs the same consideration.

**Era advancement** announces in a modal with no action buttons. `ERA_TRANSITIONS[era]` hand-authors only the flavor lead; every list beneath it is derived from `manifestDiff()`, so none of it can go stale as content moves. The `before` snapshot is captured pre-flip, which is how the housing line quotes real before/after numbers. A single milestone line still goes to the Chronicle.

**Reset** confirms through the same modal rather than a native `confirm()` — consistent styling, and native dialogs are outright suppressed in some environments (they were being swallowed in the dev browser pane, which is how this surfaced). The copy quotes the run's playtime so the consequence is concrete. Cancel, Escape and a backdrop click are equivalent and all provably non-destructive.

**Game over** is a modal: a cause-specific narrative line, boxed run stats, and a **Try Again** button. Both it and Reset call the shared `hardReset()` — see Persistence for the teardown-save race it must avoid.

**The Info panel** is a reference of every building, unit, upgrade and neighbour, grouped by era behind tabs, reading each era's compiled manifest directly. It deliberately shows *all* content regardless of what the player has revealed — it's a reference, and hiding things defeats its purpose. It is the one sanctioned exception to the unravel, and the one modal that will **not** pause under phase 5.

## Layout & Visual System

**Status: shipped.** Full treatment in `interface.md`; what follows is the load-bearing summary.

`styles.css` implements **Bureau**: the game is a spreadsheet, so the presentation stops disguising that and becomes dense administrative paper — ledger sheets, ink tab headers, monospace numerals, hard 1px borders, no rounded corners, no shadow anywhere except the modal's hard offset.

**Tokens, not literals.** `:root` holds surfaces, the three-value semantic channel, border weights, the rulings and the three type registers. A palette that can be re-pointed in one place is the only version that survives nine more eras of content.

**Two laws run through the whole sheet, both load-bearing rather than stylistic:**

1. **Opacity is never used, for anything.** It previously did double duty for *unaffordable*, *queued* and *already owned*, and all three read to players as "you can't have this." State is carried by border weight, border colour, glyph colour and status words instead. Concretely: an unaffordable buy-card is a lighter border and nothing else — its text stays at full contrast, because most cards spend most of their life unaffordable and *reading* them is how players plan. Death drains the board's saturation rather than fading it.
2. **Legibility outranks texture.** Each column gets its own stock — cork, graph 16px, dot grid 14px, legal pad — which is what makes the columns distinguishable without spending colour on it. Anything carrying words sits in an opaque box on top. One exception: loose text on *cork* sits straight on the speckle (nothing crosses a letterform) with a darker ink; on ruled stocks it needs a paper patch, because a ruling is geometric lines cutting through letters.

**Layout.** `body` is `overflow: hidden` — the page itself never scrolls. `#mainArea` is a CSS Grid, `0.86fr 1fr 1fr 1.24fr` × `1fr 1.7fr`: People narrowest (mostly steppers), Chronicle widest (prose). Eight `.block` panels placed explicitly, each a flex column with a fixed ink header plate and a separately-scrolling `.block-body`.

**Era chrome.** `renderEraChrome()` writes `S.era` to `body[data-era]` and CSS does the rest: desk colour, era badge, and a wholesale inversion of the header chrome for dark desks. Header chrome is authored as three layers — border, fill, text — so it never assumes a light background, which is what lets later eras go as dark as they like.

**Colour is a small semantic system**, enforced at the call site: `--danger` (blocked, negative, at-cap), `--good` (working, gained, owned), `--queued` (in progress), otherwise ink on paper. Text wraps and never truncates; a live check of the maximal 8-panel Iron board finds zero clipped elements and zero page overflow in either axis.

## Testing Approach

**Status: shipped at 420 checks, 0 failures; the replay superpower is pending — phases 2 and 4.**

No test framework. Verification is `harness.js`, checked into the repo, run with `node harness.js` (or `npm test`) from the repo root. Since phase 1 it **imports the same 25 modules the game runs** (everything except `main.js`, whose body is `boot()`), stubs `document`/`localStorage`/`window` on `globalThis` — module evaluation touches neither, so static imports are safe — and exposes every export through one Proxy (`api`), whose single legal write is `api.S`, routed through `setS()`. The vm sandbox and the appended-text export hook that preceded it are gone; what `boot()` did for the harness's purposes is now two lines: `setS(freshState()); initAdversaries()`.

This has been the primary correctness check throughout: starvation timing, queue escalation math, storage-cap clamping, event negation odds, converter equilibrium, migration order-immunity, the workforce fuzz. Live browser checks stay reserved for visual/layout verification and DOM-level bugs the headless harness cannot see — the beforeunload/save race and both click bugs were all found in live play, not by the harness. That division is stable and worth keeping in mind when deciding where to look for a bug.

**What ticks + the seed turn this into.** Today a harness run is a *statistical* argument: run the sim 20 times, assert nothing crashes and nothing goes negative. After phases 2 and 4, a recorded run becomes a value:

```js
{ seed: 12345, actions: [ {tick: 40, fn: "assign", args: ["forager", 1]}, … ] }
```

Replay it and you get **bit-identical state**, every time. That converts the regression suite from *does it still work* into *does it still balance*: a fixture can assert "at tick 12,000 of this exact run, pop is 14, the Bronze capstone is 60% built, and the player has survived two raids" — and a content change that moves any of those numbers shows up as a precise diff instead of a vibe. It also makes rare-event balance questions answerable: sweep 200 seeds through the same action script and read the distribution.

Two consequences to plan for: the replay format must record actions **by tick number**, not by wall time; and fixtures pinned to exact roll sequences will need regenerating whenever content changes the draw order (see *Determinism*). Prefer outcome assertions with tolerances; reserve exact-sequence fixtures for cases where the sequence is the thing under test.

## Conquest Growth & the Peace Path — implementation contract

**Status: pending — phase 6.** Design settled in `design.md` (*Conquest Growth & the Peace Path*, the Border policy, progressive enhancement). **Implement from the documents, not from memory.** Each slice is playable, harness-verified, and committed on its own.

**G1 — the engine rework (population & levy).**

- Era-scoped **growth mode** in the manifest (`growth: "timer" | "conquest"`): `accrueGrowth` runs only under `timer`. Stone/Bronze unchanged; Iron and later are conquest-only.
- **Deep consolidation + output multiplier.** Crank `IRON_DELTA.consolidate.keep` hard (it is 0.7 today) and add an era-fact `outputMult` applied in `rates()`/`mults()`, targeting `keep × output ≈ 1` so every existing cost stays valid and no re-tuning cascade fires. Both are single manifest values — **THE** tuning pair.
- **Pop/units separation.** Units stop being part of `S.pop` (levied, not consumed). `popCost` dies at Iron, era-scoped or removed via unit overrides. `civilians()`/`reserved()`/`reconcileWorkforce()` simplify accordingly; upkeep charges pop + units explicitly.
- **Levy cap.** Max total units = holdfasts × levy rate (an era fact). Training refuses beyond it, with the tooltip carrying the reason, enforced in `build()` like every other refusal.
- **Housing retired at Iron.** The iron delta removes `hut`; a narrated migration handles existing longhouses; `housing()` becomes era-aware with no cap under conquest mode. **The validator must pass with a founding building absent** — this is the removal the manifest architecture was built for, and the first time a base-manifest building leaves.
- Back-compat: existing iron saves get a narrated one-time adjustment.

**G2 — the minor tier & capture.**

- Adversary slates gain minor entries (freeholds, petty lords): weak stat-stacks, each worth one sworn holdfast plus a modest stock. The era's capturable units become a **designed population budget** — growth is finite, authored, and paced per age.
- Campaign resolution gains the **capture** outcome: +1 pop, a small windfall, and a Chronicle line that names the place for the last time (absorbed is generic; the Chronicle keeps the name).
- Wholesale annexation of majors: scoped here or deferred — decide at build time.

**G3 — priests & the envoy.**

- Religious building + priest unit, on the Barracks pattern. **Envoy** as a third adversary action: slow expedition, costs gifts plus the caravan-or-own slot (decide), no casualties, standing +, target delivered intact.
- **Per-target affinity**: disposition modulates envoy odds the way walls modulate assaults, hinted through flavor so reading the target is choosing the tool. Failure costs something real.
- The **annexation/conversion ceremony modal** — the first ceremony built *under* progressive enhancement: modal live with a defaulted choice, full Chronicle resolution otherwise. This is where phase 7's decision queue and phase 6 meet; sequence accordingly.
- Event **state hooks**: event weights and conditions may read standing (and later morale). Observational-narration events keyed to low or high standing enter the slates.

*Open tunables, all implementation-time, tune-toward-hard as always: the keep/output pair; levy rate; minor-tier count and stats per era; envoy timer, cost and odds; capture windfall sizing; what wholesale annexation of a major is worth.*

## The Map

**Status: pending — phase 8. Full technical treatment in `map.md`** — the place-graph model, pointy-top hex geometry, the seeded generator, the hand-authored adversary pool with generated slates, SVG-plus-DOM-overlay rendering, and the geometry/paint layer separation.

Two dependencies point back here and are the reason the map is phase 8 rather than earlier: the generator needs the seeded `rng()` (phase 2) to be reproducible without serializing the whole map, and the slate constraints are authored on the era manifest, which means the map is another consumer of the same content architecture rather than a parallel one. Phase 9 — whether the map becomes the centre of the interface — is open and deliberately not designed here.

## Known Limitations

**Status: current.**

- **`Math.random()` is unseeded** at 16 call sites, so rare-event balance is only answerable statistically. Phase 2.
- **Conflict's numbers** (`conflictBaseChance`, `conflictPopScale`, raid-size weights, the `repelChance` ratio, casualty/theft fractions) are first-guess like the rest of `CONFIG`, already once retuned after playtest. Expect them to move again once Conquest Growth changes what an army is.
- **Siege tuning is untested at length**: `siegeWallBonus` (6), `wallRetreatLoss` (0.35) and each adversary's `walls` are one playtest old.
- **Holdings tiles show a flat count with no compaction** — `1234` renders as literally `1234`. Fine at current scale; a real problem when re-denomination stops holding numbers down.
- **Upgrades have no home once owned** except the relabeled buy-card and the Chronicle completion line — there is no "traits you have" surface the way Settlement is for buildings.
- **An existing save already inside Iron never sees consolidation**, because it only fires at the border. It keeps family-scale counts under holdfast names. G1's back-compat migration is the fix.
