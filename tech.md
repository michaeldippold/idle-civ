# Idle Civ — Technical Design

How the game is actually built. **Docs map:** `design.md` is why any of this exists; this file is the how; `map.md` is the map arc; `interface.md` is the interface system; `todo.md` is the running phase log. When two files disagree about *what is built*, this one and `todo.md` win.

## How to read this file

**Every section carries a status line directly under its heading.** This is not decoration. The 2026-08-22 pivot (`design.md`, *Time, Presence & Pause*) redefined the target game, and the code has been catching up phase by phase since — phases 1–5 (modules, the seed, the death of offline, the tick clock, controls) are in; Conquest Growth and everything after are not. A session that can't tell the target from the code will do something bad; the status line tells you which world a paragraph is describing.

- **Status: shipped.** — running in `game.js` today. Claims here are verified against the file.
- **Status: pending — phase N.** — settled design, no code. Nothing in the section is true yet.
- **Status: shipped; changes pending — phase N.** — the section describes live code that a named phase will alter or delete. Both halves are marked inline.

**Historical notes** appear only where the reasoning behind a reversal is still load-bearing — a trap you would otherwise re-enter, or a rationale whose *shape* still teaches. This file used to be a running record of every decision ever taken; it isn't any more, and reintroducing that is a regression.

## The phase plan

**Status: authoritative order.** *(Table corrected 2026-08-25 — it had said the map was pending
months after it shipped, and predated phase 10 and the engine rework entirely. `todo.md` → THE
WORKING ORDER is the queue; this is the phase index.)*

| # | Phase | State | Where it's specced |
|---|---|---|---|
| 0 | Docs | **shipped 2026-08-22**, kept current | — |
| 1 | Module structure (file split) | **shipped 2026-08-22** | *Module Structure*, below |
| 2 | Seeded RNG | **shipped 2026-08-22** | *Determinism & the Seeded RNG* |
| 3 | Kill offline | **shipped 2026-08-22** | *Time, Presence & Pause (implementation)* |
| 4 | Fixed ticks | **shipped 2026-08-22** | *Simulation Model* |
| 5 | Player controls (pause/speed, modal pause flag) | **shipped 2026-08-22** | *Time, Presence & Pause (implementation)* |
| 6 | Conquest Growth + the map | **6a–6d shipped**; 6e held | *Conquest Growth — implementation contract*, `map.md` |
| 7 | Decision queue (interactive events) | **held deliberately** — spec complete, seam built | *The Decision Queue* |
| 8 | Map | **shipped** (landed inside 6 and 10) | `map.md` |
| 9 | Interface re-architecture around the map | **structural half shipped** ("the flip"); reskin queued | `interface.md` |
| 10 | 3D map integration | **slices 1–5 shipped**; 6 (scouting) and 7 (re-dress) queued | `map.md`, `todo.md` |
| E1–E6 | The engine rework (population lives on hexes) | **shipped 2026-08-23/24** | `design.md`, *Population Lives Somewhere* |
| — | Building on a hex (the use seam, farm, march-hold) | **shipped 2026-08-25** | `design.md`, *Building on a Hex*; *What a Hex Is*, below |
| — | Losing ground when a hex empties | **shipped 2026-08-25** | `design.md` rule 9 (reversed) |
| — | The odometer (topline population) | **shipped 2026-08-25** | `design.md`, *The Noun Table* |

**The harness stays green at every boundary from 1 through 5.** That rail is the whole difference between a refactor and a rewrite: phase 1 is mechanical with zero behaviour change, phase 2 changes which numbers come out but not which code paths run, phase 3 deletes code, phase 4 changes the unit of time under an unchanged economy. Any phase that cannot leave the harness green needs its own decomposition before it starts.

## Stack

**Status: shipped (phase 1 landed 2026-08-22).**

Plain HTML/CSS/JS as ES modules. No build step, no bundler, no dependencies, no framework — the served file is the authored file. The layout:

- `index.html` — structure/markup only (one `<script type="module" src="src/main.js">` at the end of `<body>`)
- `styles.css` — all styling
- `src/` — 26 modules, ~3,570 lines; see *Module Structure*
- `harness.js` — the headless Node test harness, 791 checks, importing the same modules
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

**Revision (2026-08-22, evening — Route B adopted): the map's PAINT layer moves to Three.js.**
A time-boxed spike (`/spike3d/`, built by a subagent from `spikes/threejs-hex-map-guide.md`
against the real `generateMap` output) settled the 2D-vs-3D fork with the owner's eyes: ACES +
HDRI + AO made primitive geometry read as a premium board-game diorama at 60fps, ~10 draw calls
for 61 tiles, with headroom designed for 10,000. What this revises and what it doesn't:

- **"A canvas is a bag of pixels" was overstated, and I am walking it back.** A Three scene graph
  is a queryable object tree (mesh counts, instance counts, positions, materials — all inspectable
  at runtime), picking is pure testable math, and `readPixels` sampling through the post chain is
  a real automated check (the spike used it, honoring the black-canvas lesson). What is genuinely
  lost is *semantic* pixel verification — "does it look right" becomes owner-eye QA plus
  screenshots. Bounded, and accepted with eyes open.
- **The sim never touches the renderer** — the spike's guide calls this non-negotiable and it is
  already this codebase's architecture. All harness checks are renderer-independent, forever.
- **No build step survives** (import maps); "no dependencies" becomes "pinned, and vendored before
  release" — three.module.js, postprocessing, n8ao checked into the repo rather than trusted to a
  CDN at runtime. (The spike pins CDN URLs; vendoring is an integration-phase task.)
- **The SVG map stage survives as the 2D debug view** (`render2d` in the guide's terms) and as
  the agent-verification surface — not deleted, demoted.

**World generation, revised the same evening (`map.md` §2.6 — "one board, forever"):** the world is
generated once at full size and never regenerates, so `ensureMap()`'s regenerate-on-`tileNoun`-change
branch retires along with the era `view` radii. Two contracts follow that are cheap now and painful
later:

- **The run seed *is* the continent.** The pregame picker shows three candidate seeds wearing their
  coastlines; picking one adopts it as the run seed. No separate "which frame" field enters the
  save — recipe-not-cake is unchanged, and one number still reproduces a whole run.
- **Generation draws from named sub-streams**, `makeRng(hashStr(seed + ":frame"))` and siblings for
  `:pack`, `:terrain`, `:seats`. Never one sequential stream: inserting a generation stage later
  would shift every downstream draw and silently invalidate every recorded seed. Named streams are
  independent, so a future river pass cannot move the mountains. The simulation's own dice
  (`S.rngState`) stay untouched by all of it, as today.
- The Godot rejection and everything else in this section stands.

**Shipped 2026-08-22 (phase 10, slice 2).** The port landed and the walk-back above is now
load-bearing rather than theoretical. What exists:

- **`src/render3d/`** — `hex3d.js` (axial math on the XZ plane, the 3D sibling of `map/model.js`),
  `terrain3d.js` (merged vertex-coloured land/water soups, derived elevation, ownership rings),
  `props3d.js` (instanced dev-art props), `stage.js` (scene, camera rig, lighting, post chain,
  picking, projected labels). The module reaches game state only through hooks passed in by
  `ui/map.js`, so the sim still cannot be reached from the renderer.

  **THE BOARD GEOMETRY PASS (ruled and built 2026-08-28).** `hex3d.js` now owns the whole piece
  budget as checkable arithmetic — `HEX_SIZE` 1.5, sockets 0.90, `DISC_RADIUS` 0.27,
  `SOCKET_CLEARANCE` 0.55 (sized to prop HULLS, the bug the pass was born from), `HUB_CAP` and
  `HUB_WALL` — and the harness checks every relationship, hover silhouette included. Garrisoned
  armies stand in the march-hold’s courtyard (`pieces3d` places, `ui/map.js` decides via the same
  owner test as `wallsAt()`), and the structure glyph yields to a drawn courtyard disc. Treat these
  constants as one budget: retune them together or the harness fails loudly, which is the point.

- **`vendor/`** — three@0.160.0, postprocessing@6.35.3, n8ao@2.0.1, pinned and served from the
  repo. No CDN at runtime. One non-obvious entry: n8ao imports
  `three/examples/jsm/postprocessing/Pass.js` *and* `Pass` from `postprocessing` (it duck-types
  against whichever composer it is handed), so that addon is vendored too and the import map keeps
  both `three/addons/` and `three/examples/jsm/` pointing at the same directory.
- **Three graceful degradations**, because a black board is a worse failure than a plain one: no
  WebGL keeps the SVG stage, no HDRI falls back to a hemisphere rig, no postprocessing renders
  straight. `?map=2d` forces the SVG stage outright.
- **`?glcheck=1`** sets `preserveDrawingBuffer`, which is the only way a check can read the canvas
  after compositing. Off by default because it costs real performance. This is the flip's
  zero-height lesson carried into the renderer: DOM assertions pass happily against a page that
  draws nothing.

## Module Structure

**Status: shipped (phase 1, 2026-08-22); reshaped 2026-08-26 by the per-player refactor.**

Two structural facts now govern the tree, and both are checked by the harness
rather than trusted to the eye:

**1. The simulation does not import the interface.** Nothing under `core/`,
`sim/`, `map/` or `content/` reaches into `ui/`. The sim emits on
`core/bus.js`; `ui/wire.js` is the only module that knows both sides. The proof
is that the whole simulation imports and runs headless with no `document`, no
`localStorage` and no `window` in scope at all — which is also why the harness
no longer stubs them to load the game.

**2. `map/` is a package, not a file.** `map.js` was 917 lines and a third of
the simulation wearing a map module's name. It is split along the seams its own
section banners named, and the layering is acyclic *by check*: `world.js` and
`ownership.js` import nothing of ours, and nothing imports the hub back.

```
  map/
    world.js        the runtime geometry binding — the leaf everything reads
    ownership.js    who holds what, keyed by tile
    fog.js          charted vs sighted, per civ
    structures.js   what a hex IS and what it yields; setHexBuild is its only writer
    population.js   people on the land, growth, famine, and who a blow lands on
    routes.js       the two distances, and never the same one
    map.js          lifecycle + re-exports — the package is the unit
```

That last line is the contract: callers import `map/map.js` and never learn
which file a function ended up in.

The original split (phase 1) took `game.js` apart along its own section banners
into 26 modules — pure slicing, no logic changed. The tree below is that split,
with line counts as of the day it happened; it is kept because the REASONING
for each seam is still the reasoning, not because the counts are current.

```
index.html
package.json                {"type": "module"} — Node-only; no dependencies
src/
  main.js            84     boot, page wiring, the interval loop; the ONLY module nothing imports
  core/
    config.js               CONFIG
    state.js                S, loopId/saveId, freshState, and the cross-module setters
    derived.js      183     rates/mults/caps, civilians/reserved/idle, defById, isRevealed
    step.js          91     step(), die()
    actions.js      112     assign, build, cancelBuild, completeConstruction, onComplete
    persist.js              save, load, suppressSaves, initAdversaries
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
2. **Cross-module reassignment goes through setters in `core/state.js`.** ES-module live bindings are readable everywhere but writable only from their home module. The mutables this bites — `S`, the interval handles, `upgradeTab` — go through `setS`/`setLoops`/`setUpgradeTab`, and those setters were the only code deltas the split made. (The split also minted `setSIM`/`setSimStop` for the offline flags; phase 3 deleted flags and setters together.) Corollary: `loopId`/`saveId` live in `state.js`, not `main.js`, because `die()` clears them and **no core module may import `main.js`** — main's body is `boot()`, and an import edge into it would start the game mid-link, before the manifests exist.

`main.js` is the one module nothing imports, and that is load-bearing, not incidental.

**All DOM access sits inside functions, never at module top level.** That is what makes the split clean — no import-order-dependent side effects, no "this module must load after the document is ready." The one top-level side effect is `validateManifests(MANIFESTS)` at line 918, which is deliberate and should stay: a broken manifest must throw before a frame renders.

**Circular imports are the real risk**, not line counts. `derived.js` needs `active()`; `events.js` needs `derived`; `combat.js` needs both; `era.js` needs nearly everything. Keep the dependency graph pointing one way — content → core → sim → ui — and put anything genuinely shared (the `S` reference, `active()`) at the bottom of the stack where everyone may import it and it imports nothing.

**The harness bootstrap is a real rewrite, and it should be honest about that.** `harness.js` currently reads `game.js` as text, appends an `exportHook` string that captures ~60 internals into `globalThis.__api`, and runs the whole thing through `vm.createContext` against a stubbed `document`/`localStorage`/`window`. Under modules that entire mechanism can be replaced by ordinary `import`s — cleaner, no string concatenation, no sandbox — but the stubs still have to exist somewhere (the UI modules touch `document` the moment they're called), and the `__api` surface becomes a set of real exports. **The ~420 assertions themselves are unaffected**; only the first 60 lines of the file change. Do the bootstrap rewrite as the *last* commit of phase 1, after the split is proven green through the old `vm` path, so a harness failure can only mean one thing.

## The engine rework (planned, 2026-08-23)

**Not built yet. Canon is `design.md` → *Population Lives Somewhere*; this records only what it does
to the architecture.** The map arc was paused after phase 10 slice 3 to take this, because every
remaining slice depends on what a hex is worth.

**What is deleted outright:** the jobs/steppers system and `reconcileWorkforce`; housing and timer
growth; `applyConsolidation` and its keep ratios; the levy, `levyCap`/`levyUsed` and the
`levyMigrated` flag; and `syncDominion`'s pop↔dominion lockstep. The Bronze→Iron border stops being
a genre change — seven systems switching at once — and becomes a re-denomination of the tile noun.

**What is added:** a population number per owned hex (`S.map.pop` keyed by tile id, or a `pop` field
on the per-tile record — schema decision at build time), a terrain-derived carrying cap, growth
toward that cap, and an administrative-distance function (the existing `routeCost` Dijkstra seeded
from `world.home` alone).

**What changes shape:** `rates()` becomes `population × per-capita rate` summed over owned hexes
rather than `jobs × rate`. Food upkeep becomes per-capita against one pool. Starvation becomes an
ordered drain, frontier inward, rather than a single global stop.

**The rebalance mostly dissolves (corrected 2026-08-23, while drafting the phase plan):** the
prediction above was wrong in a useful way. `CONFIG.baseRate` and `CONFIG.upkeep` are *already
per-capita* — Stone always was per-person, and the Iron tile branch deliberately produced "at the
same per-worker rate the steppers used." Since output and upkeep are both per-person, the feed
ratio (one worker feeds five) is scale-invariant at any population in any era. What keeps totals
sane is **small early-era carrying caps that grow by era-fact** — the era production curve is a
ceiling change, not a rate change. Residual pricing work lands where pricing already lives: each
era's manifest re-prices against that era's expected population. See `todo.md` → *The engine
rework — phase plan* for the v1 numbers.

**Performance is not a consideration.** Measured: summing population across 150 hexes every tick
costs ~68 ms *per hour of play*, against a 200 ms per-tick budget. See `map.md` §2.7.

## Simulation Model

**Status: shipped — fixed ticks (phase 4, 2026-08-22).**

**`S.tick` is the master clock.** An integer, part of the save. `step()` takes no argument:
each call advances the world by exactly `TICK_SECONDS` (0.2s, exported from `config.js` as
`CONFIG.tickMs / 1000`) and increments the count. The subsystems beneath it — `rates()`,
`runConverters`, `resolveEvents`, `accrueGrowth`, `resolveExpeditions` — keep their per-second
authoring and their `dt` signatures; the `dt` they receive is simply the same constant on every
call. `chancePerSecond` still converts via `1 - (1 - p) ** dt`, now against a constant.

*(The phase spec had sketched converting rates to per-tick inside the manifest compiler. A
constant `dt` at the call sites has the identical property the spec was after — authors think in
seconds, nothing in the content files changes — with a fraction of the churn. Deviation recorded
in `todo.md`.)*

**The loop is a metronome, not a stopwatch.** Each `setInterval` fire advances `speed` fixed
ticks; wall time is never measured — `Date.now()`, `last`, the `dt` clamp, and the
visibility-re-anchor dance are all gone. Interval jitter and background throttling therefore bend
the game's *pace* a hair rather than its math: a slow or skipped fire is simply a tick that never
happened, never a bigger slice of time simulated in one gulp. Pause and hidden are a skipped
fire; death guards inside `step()`.

**`playtime()` derives from the count** (`S.tick * TICK_SECONDS`, in `derived.js`) — one clock,
not two that can disagree. `S.playtime` no longer exists in fresh state; `load()` converts a
legacy save's seconds to ticks once (floor), and the stale field rides along inert per the state
invariant. The header clock renders both readings — `4h 26m · t79,831` — the tick count by
explicit request, because with a seeded, tick-counted sim, *what tick did it happen on* is the
coordinate a bug report wants. The `[pacing]` telemetry lines carry the tick too.

**The payoff is determinism, and it is now live in the browser**: *same seed + same tick count +
same player actions = bit-identical state*. This was unreachable under variable `dt` no matter
how good the RNG was — a seeded `rng()` under floating-point `dt` gives the same *rolls* against
different *thresholds*. Ticks and the seed are one feature delivered in two phases; this is the
phase that finished both. See *Testing Approach* for what it turns the harness into.

**Historical note, kept because the reasoning was correct and is instructive about how
requirements move.** Delta-time was chosen deliberately, over an explicit alternative (the
discrete `state.tick` model used in the sibling project `dispatch`), on the grounds that Idle
Civ's genre was long unattended stretches and offline catch-up — and continuous simulation
degrades gracefully to "however much time passed" instead of replaying tens of thousands of
discrete ticks. That argument was sound. It was also entirely contingent on offline catch-up
existing; once the pivot deleted offline progress, the sole justification evaporated and the
cost — non-determinism — became the only remaining term. Nothing about the original analysis was
wrong; the requirement it served was.

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

**Status: shipped (2026-08-22).**

**Deleted whole:** `simulateOffline()` and its call in `boot()`; the `SIM` / `SIM_STOP` /
`SIM_STOP_CAUSE` flags, their setters, and all twelve branches that read them; `S.lastSeed`;
`CONFIG.offlineCapHours`; and the `if (dt > 2)` clamp, whose own comment said its reason out loud
("large gaps are handled by the offline sim" — there are no large gaps to handle when the tab
pauses itself).

**Removing the `SIM` branches was a genuine simplification, not just a subtraction.** A dozen
places used to ask *am I fast-forwarding?* and behave differently on the answer — the era modal
suppressed here and re-announced from a different function there, death paths converted into
silent halts, narration wrapped in no-op helpers. Every one was a second code path through logic
that already had one, exercised only in a mode nobody watched, and the two-place invariants only
held by hand. Now there is one path: things happen, and they are narrated. `advanceEra()` always
opens its modal, the Chronicle always logs, and `step()`'s starvation and conflict paths always
call `die()`.

**Auto-pause on hidden tab, as specced.** The player's *intent* (`paused`) and the effective
state (`paused || hidden`) are separate flags; the loop reads the composite, the header button
reads and writes intent only. Hiding the tab commits a save and stops the simulation; returning
resumes automatically without clobbering a manual pause. One subtlety the implementation added:
`last` is re-anchored on the visible transition, because a hidden tab's intervals are throttled
(eventually to once a minute) and the gap since the final throttled tick would otherwise arrive
as one oversized `dt` now that the clamp is gone. Phase 4 retires this machinery along with `dt`
itself.

**Save hardening, as specced.** `pagehide` replaced `beforeunload` (which mobile and
background-killed tabs frequently never fire); `visibilitychange` → hidden is the primary
save trigger; and every player action — assign, build, cancel, launch — commits the moment it
changes state, with the 10s autosave as the floor for passive progress. `hardReset()`'s
listener-unregistering became `suppressSaves()` in persist.js: the reload's own `pagehide` would
otherwise rewrite the save being wiped — the same teardown-save race v3 fixed on `beforeunload`,
reborn on a new event and closed with one flag instead of listener juggling.

### Phase 5 — controls

**Status: shipped (2026-08-22).**

**The modal hold.** `openModal(title, bodyHTML, actions, onMount, opts)` — `opts` is deliberately
an open bag rather than more positional flags, because the decision queue (phase 7) grows it
(designed defaults, dismiss-to-tray, whatever future asks need) without another signature change.
`opts.pause` defaults **true**: an asking modal holds the simulation while open; `closeModal()`
releases. The hold (`modalHold`, in chrome.js beside `paused`) is a third independent flag
composed in the loop — `paused || hidden || modalHold` — so each releases without clobbering the
others, the same design that made the hidden-tab behavior clean. Anything a modal can render —
steppers, choices, prose, future decision cards — can now ask the player to think for as long as
they like at zero cost to the world. **This is the seam the whole opened design space stands on;
keep it generic.**

**The ask/tell ruling, extended.** Asks hold (muster, escort, reset confirm, every future
decision). The **ceremony register holds too** — era transition, game over — because stillness is
part of the weight and reading the age's obituary should not cost world-time. The Info reference,
material browsed *during* play, is the one telling modal and passes `{ pause: false }`.

**Controls.** The header groups Pause + speed as a transport instrument (see `interface.md`);
keys 1–5 land on the `CONFIG.speeds` notches via `setSpeed()`, Space toggles pause. The old
"speed is a dev tool, lock it before release" policy is dead. `paused`, `speed` and `upgradeTab`
remain deliberately excluded from the save — confirmed still right now that pause is a primary
verb: reloading into a silently frozen (or 12×) game is a trap, and the world already stopped
with you when the tab closed.

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

**Status: shipped (phase 3 hardening included).**

The save is **load-bearing** (`design.md`, *Time, Presence & Pause*): the world stops when the
player does, so stopping and resuming exactly is a correctness requirement. Triggers: a 10s
autosave, every player action (assign, build, cancel, launch), `visibilitychange` → hidden, and
`pagehide`. `suppressSaves()` is the teardown guard — see the fixed-bugs note below.

`localStorage`, under a single versioned key (`CONFIG.saveKey`, currently `"idleCiv.v6"`). Load uses a defensive merge so the schema grows additively without a migration step:

```js
S = Object.assign(freshState(), data);
S.builds = Object.assign(freshState().builds, data.builds);   // same pattern, nested
```

Any field present in `freshState()` but absent from an old save (a new resource, a new building, `eraHistory` before it existed) silently defaults correctly. This has been exercised across every schema change so far and has never needed a version bump. Arrays (`buildQueue`, `expeditions`) are `Array.isArray`-guarded rather than merged; id-keyed bags (`upgrades`, `seen`, `eraHistory`, `adversaries`) take the saved object or `{}`.

`initAdversaries()` runs at boot and on era entry: any adversary in the active manifest without a state entry gets one seeded from the manifest template. It **never re-initializes** — a half-plundered stock stays half-plundered, and a breached wall stays breached. The manifest entry is the template; the state entry is the living remnant.

**Two fixed bugs whose lessons generalize** (the rest of the old catalogue is deleted):

- **Reset was a no-op, because teardown saved.** `localStorage.removeItem(key)` then `location.reload()` — and `location.reload()` fires `beforeunload`, which was wired to `save()`, and since in-memory `S` was untouched that call rewrote the save being cleared. Fixed by unregistering the handler before clearing. **The lesson survives the specific event**: any teardown-triggered save races any teardown-triggered wipe. Phase 3 met it again on `pagehide` and closed it for good with `suppressSaves()` — a flag save() checks, instead of listener juggling.
- **Reveals had no memory, so panels could un-reveal.** `reveal()` predicates keyed on a resource *threshold* (Woodshed, Granary) were re-evaluated fresh every render — spending wood on the very building that revealed the panel could make the panel vanish mid-game, queue item and all. Fixed with `isRevealed(def)`, which caches the first true result in `S.seen["rev:" + id]`. **Reveals are permanently sticky**, consistent with every other reveal in the game, and the only sanctioned un-reveal in the entire codebase is `purgeDom()` at an era boundary.

## State Shape

**Status: shipped; rewritten 2026-08-26 by the per-player refactor.** `freshState()`
and `freshPlayer()` are the authoritative shapes; this is the annotated version.

**The split is the point.** Before the refactor everything below hung off `S`,
which encoded "there is one player and the world is theirs" into every read in
the codebase — a second civilization had nowhere to exist. Now there are two
kinds of state, and which kind a field is answers "whose?" before anything asks.

### `S` — the world and the run

| Field | Type | Purpose |
|---|---|---|
| `seed` | number | The run's permanent identity — shown on the game-over screen, logged at boot |
| `rngState` | number | The dice stream's position, advanced by every `rng()` draw and carried in the save so a reload resumes mid-stream |
| `players` | `[civ]` | **Every civilization.** Index 0 is the human today; the three neighbours follow |
| `me` | number | Which civ the interface is looking through. A field rather than a constant precisely so "render from another seat" is a value change |
| `adversaries` | `{}` | Vestigial — the living remnants moved into `players` on 2026-08-26. Kept so old saves land somewhere |
| `map` | `{seed, gen, tileNoun, continent, owner, built, pop, minors, starve}` | The persisted half of the board. Geometry is REGENERATED from the seed at load |
| `map.owner` | `{[tileId]: playerId}` | **Ownership is a property of the tile.** One field answers "whose is this?" for any tile and any civ |
| `tick` | number | The master clock: fixed `TICK_SECONDS` slices actually simulated |
| `seen` | `{[id]: true}` | Reveal latches and one-time interface flags |
| `dead` | boolean | The RUN is over — today, when the human falls |

### A civilization — `S.players[n]`

| Field | Type | Purpose |
|---|---|---|
| `id` | number | The index, and the identity: it keys ownership on the board and stamps the journal |
| `key` | string \| null | The manifest id this civ is authored under (`"hillClans"`), or null for the human — nobody authored them |
| `color` | string | What this civ wears on the board (`core/palette.js`) |
| `seatName` | string | What it calls its capital; empty means the game's own words |
| `seat` | tileId \| null | Where it sits, and the point every administrative distance is measured from |
| `era` | string | **The age THIS civ is living in.** Per-player: the shared world clock is dead |
| `eraHistory` | `{[era]: snapshot}` | Frozen pre-transition snapshots of THIS civ's books |
| `res` | one key per resource id | Current stockpiles. A neighbour's larder is this same field — plundering takes from resources |
| `builds` | one key per building id | Inert since the Construction panel retired; kept so legacy counts land somewhere |
| `units` | one key per unit id | Trained person-types |
| `upgrades` | `{[id]: true}` | One-time upgrades; key presence = owned |
| `buildQueue` | `[{id, kind, uid, total, remaining, cost}]` | FIFO; only `[0]` progresses. `cost` is the exact price paid, for cancel-refunds |
| `buildSeq` | number | Monotonic counter for queue `uid`s (the DOM diffing key) |
| `expeditions` | `[{uid, type, adversary, units?, cargo?, total, remaining}]` | At most one campaign and one caravan |
| `revealed` / `sighted` | `[tileId]` | **What THIS civ knows of the board.** Knowledge, not board truth: a bot reading the true map is cheating, one reading yours is broken |
| `pop` | number | MIRROR of the floored hex sums plus the standing army |
| `bought` | number | Lifetime arrivals — the game-over screen's one stat |
| `standing` / `walls` | number | Adversary-shaped today; both on the road to becoming ordinary (walls want to be fortification structures) |

**Reaching a civ.** `me()` is the seat the interface is looking through and the
default everywhere; `playerById(id)`, `playerByKey(key)` and `rivals()` are how
the systems that already know whose turn it is get there. Reading player state
through `me()` rather than off `S` is what makes "whose?" a visible question at
every site instead of an assumption.

**Migration.** `load()` reads whichever schema a save carries — its own player
record if it has one, the save itself if it does not — so a pre-split save
migrates without a version branch, and keeps working when a third field moves.
The old `map.owned` array becomes owner entries; map-level fog moves onto the civ.

## `step()` — Order of Operations

**Status: shipped.** Phase 4 renames the parameter and changes its unit; the order does not change.

1. Bail if `S.dead`.
2. Advance `S.playtime` — here rather than in the loop, so it measures exactly one thing: how far the world actually moved. It therefore freezes when paused and stops at death for free.
3. Compute `rates()` (production, upkeep, net food).
4. Apply production/upkeep to every resource in `active().resources`, scaled by `dt`.
5. `runConverters(dt)` — the Forge and anything else with a `converts` spec.
6. Clamp every resource to `caps()` — silently; a one-time Chronicle hint covers the concept.
7. **Famine, not instant death** *(rewritten E4)*: `food <= 0` and net food negative runs
   `starveTick()`, which drains the peopled hex FURTHEST from the seat and returns true only when
   the seat itself empties. An empty larder used to kill in one tick, which was unsurvivable at any
   fast-forward speed. **A hex that empties is LOST** (2026-08-25): `loseHexIfEmpty()` drops it from
   the dominion, deletes its use and its people, and destroys anything built on it. Ghost hexes and
   the 0.2-soul rekindle are gone — see `design.md` rule 9, reversed.
8. Advance `buildQueue[0]` by `CONFIG.buildSpeed * dt`; on completion `shift()` and `completeConstruction()`. **Only the front item advances** — the queue itself is the scarcity.
9. `growPopulation(dt)` — every owned hex grows toward its terrain carrying cap. **Growth is a background process, deliberately not an event** (`design.md`), and since E3 it is also LOCAL: people are born where they will live. *(This was `accrueGrowth` — a free settler on a timer while housing had room — until the engine rework deleted housing, the timer and the hut together.)*
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

**Authoring.** `STONE` is a full base manifest: `name`, `panelTitles`, `popNoun`, `raidTypes`, the
def categories (`resources`, `buildings`, `upgrades`, `units`; `jobs` survives as an empty array the
compiler still threads), `adversaries`, the `map` spec, and two slates (`events`, `hints`) naming
entries in the id-keyed `EVENT_LIB` / `HINT_LIB`. `BRONZE_DELTA` and `IRON_DELTA` are authored as
**deltas**: `remove`, `override`, `add` (per category), fresh slates, `migrations`, and any
era-scoped scalars.

**Era-facts added by the adversary arc (2026-08-24/25), both inherited by value:**

- **`contact`** — `"none"` or `"open"`. What an age can do about its neighbours, in either
  direction. Stone is `"none"`, and the reason is fictional rather than mechanical: there is nobody
  in a stone age able to send an army. It gates the outward verbs on the tile panel, NOT the
  existence of neighbours — every era has neighbours now.
- **`muster: { building }`** — which building must stand before a column leaves. It was hard-coded
  to `musterGround` everywhere, which was fine while Iron was the only era with an outward verb and
  became a lie the moment Bronze had one. It briefly also carried a `column` size cap; that was the
  wrong lever and is gone (see *An army eats in proportion to itself* in `CHANGELOG.md`).

**The map spec is COPIED on inheritance, never shared by reference.** A child that redeclares no
`map` used to receive the parent's object itself, and `attachSeatTerrain()` writes onto it — so a
silent delta reached back and wiped its parent's seat terrain. The harness caught it as 30 seats on
their own ground out of 90, which is precisely chance, and that number is what made it findable. Reading the delta *is* reading the era's design — Iron's literally reads "remove the bronze economy; add iron and gold; the Forge now smelts steel."

**Compilation.** `compileBase(STONE)` + `extendEra(parent, delta)` run at load into `MANIFESTS`. Every def is shallow-copied, so an override can never mutate the parent era's copy. The compiler **throws** on: remove/override targets missing from the parent, duplicate `add` ids, a missing slate, and unknown slate ids — at load, before a frame renders. Silent wrongness from a dangling id is this project's signature bug class; the compiler converts it into a loud one. (Phase 4 adds per-second → per-tick conversion to this pass.)

**The indirection.** `active()` returns `MANIFESTS[S.era]`, and every engine and render read of content goes through it — rates, caps, converters, events, hints, combat math, expeditions, every render function. Nothing outside the active manifest renders, produces, fires, or can be purchased. The engine never consults `S.era` for content decisions; `S.era` is nothing more than the key, so `advanceEra()` swaps the entire world in one assignment. *(Design-forward, 2026-08-25: when the era clock lands — `todo.md` 4d — the era becomes a property of each civilization, player included: `S.era` becomes entry 0 of a `civs` list and `active()` gains a sibling `manifestFor(era)` for reading rivals' eras and your own legacy units. Nothing in this paragraph is wrong today; expect it to be rewritten then.)*

**Slates never inherit.** Each era declares its complete `events`, `hints` and `adversaries` lists even in delta form — a forgotten event is a loud authoring decision, not a silent omission.

**This is also how the era RE-DRESS works, and it needed no new mechanism.** Since 2026-08-24 the
same three peoples exist in every age on the same hexes: Stone declares them as camps, Bronze as
peoples, Iron as powers, all sharing ids. A wholesale slate per era is exactly the shape that wants
— generation answers *where* and *who*, the era answers *what they are now*. The validator asserts
the three ids match across eras, so redressing can never quietly delete a people at a flip. The predecessor design (per-event `eras: [...]` allowlists) once silently stopped events firing after a flip, with no error; the harness now asserts slate membership per era instead.

**Era-varying values.** Panel titles and the age badge read `active()`.
*(`housingPerHut()` still exists in `core/derived.js` and is exported, but NOTHING in `src/` calls
it — housing died in the engine rework and the accessor outlived it. `CONFIG.settlerIntervalSeconds`
is dead the same way. Both are vestigial; see todo.md.)* The Info panel iterates `ERA_ORDER` and reads each era's compiled manifest directly, so the Iron tab shows Iron names while you are still in Stone.

**Two rendering gotchas that predate manifests and still apply:**

- **Anything era-dependent must be re-rendered, not written once at creation.** `renderTile()` once baked the name in at tile creation, leaving "Medicine Tent" on the Settlement tile after the flip. Name spans get rewritten every render. The same trap, in a nastier form, produced the time-capsule click bug — see *Rendering*.
- **Prose that names a building goes stale too.** Herbal Medicine's desc is overridden per era; Sickness's flavor was instead reworded era-neutral ("your healers"), because era-keying flavor arrays is more machinery than the problem deserves.

**The capstone Upgrade.** Advancing is an ordinary upgrade in the outgoing era's manifest (`bronzeAge`, `ironAge`), inheriting the queue, cost check, build timer, cancel-and-refund and "owned" state for free — and the incoming delta **removes** it: a capstone exists only in the era it ends. Its `reveal` reads *current* state (`S.pop >= 16 && (archer || horseman) >= 1`) rather than an ever-trained flag, because sticky reveals already cover the case where the units later die. `CAPSTONES` (id → era) maps completion to `advanceEra()`, the only place `S.era` is ever assigned. Because it sits in the normal queue, hazards keep resolving throughout its long build — the design's intended source of "and some luck."

**The validator.** `validateManifests(MANIFESTS)` runs at load immediately after compilation and throws with a full problem list on any within-era dangling reference: cost keys, `converts.in`/`out` keys and `job.res` against that era's resources; `capBuilding`, `BOOST_BUILDING` targets and event `counter.building` against its buildings; unit `counters` and adversary `fightsAs` against its raid types; adversary `stock` keys and `buys.res` against its resources; `buys` only on peaceful adversaries; plus def-shape checks and migration-instruction sanity.
**Added 2026-08-24/25, and all four are placement- or tier-stability rules the roster depends on:**
every era must declare the same `map.seats`; every era's `map.minors` must share one `density` and
one name-pool LENGTH (both decide WHICH hexes get steadings, so a drift relocates every neighbour in
every existing world); `minors.form` must contain `%s`; and every major must outrank its own age's
minor band, or the words "major" and "minor" describe nothing. **This is what makes removal safe to author**: retire a resource and everything still mentioning it becomes a load-time error instead of NaN production or a converter that silently never runs. Honest limit, unchanged: `reveal()` predicates are arbitrary code, so a stale reference there yields a card that never appears — annoying, but it cannot break the economy.

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

The odometer itself is **derived and never stored**: `souls = Σ tiles × soulsPerTile(era)`.
*(Open, flagged 2026-08-25: that formula was written when tiles were the only lever at Iron. The
engine rework made per-hex population a real variable, so `Σ hexPop × soulsPerPerson(era)` is very
likely the honest version — and it satisfies the spec's own requirement that at Stone the odometer
and the lever are the same small number, since a Stone multiplier of 1 makes the display literally
be your population. Decide when the odometer is built, not before.)* It must never appear in a cost, cap, rate, requirement, or stepper — the moment it gates anything, the small-numbers pillar is broken. It is the one display in the game permitted number compaction.

A sequencing question this opens, and it needs answering before either phase starts: **terrain-derived production lands with phase 6 (G1), not phase 8.** Per-hex allocation replaces the job steppers at Iron (`design.md`, *Allocation — the permanent verb*), so the moment G1 ships the player needs hexes to click — but hexes live on the map. **Decided 2026-08-22: phase 8's M1 slice lands inside phase 6.** The alternative — an interim production model built and then thrown away — is the more expensive mistake, and it is the one that is hard to unwind later. If pulling M1 forward goes badly, the revert target is the commit that recorded this decision, and the interim model is still available from there.

`purgeDom(fromM, toM)` removes the DOM nodes (`bcard-`, `hold-`, `ptile-`, `job-`, `res-` prefixed) of every id that didn't survive — the one place content ever leaves the screen. "Nothing can un-reveal" holds everywhere except an era boundary. Renderers only create nodes for manifest members, so a purged id stays gone.

`manifestDiff(fromM, toM)` computes `{added, removed, renamed}` across buildings/units/upgrades — **one diff, two consumers**: the purge mirrors it, and the era modal derives everything but the flavor lead from it. `ERA_TRANSITIONS[era]` holds only a `lead` sentence; the hand-maintained change list is gone and cannot go stale.

**Semantics sharpened by `active()`** (all unreachable in normal play, now uniform by construction): `stealResources()` only touches this era's resources; `releaseOrder()`/`jobsUsed()` cover exactly this era's jobs; combat iterates this era's units. A unit type with a nonzero count but no manifest entry neither fights nor dies — inert state, per invariant 4.

**`soulsPerPerson` — the odometer's era-fact.** How many real beings one unit of hex population stands for in this age (Stone 1, Bronze 1, Iron 200). It inherits like `popNoun`, and it scales the **topline display only**. Rule 1 is enforced by construction rather than by convention: nothing in the engine reads `souls()`, so deleting the function would change no outcome in the game — which is the actual test of whether an odometer is still an odometer. Every gate, cost, cap and stepper still reads real `S.pop` and the hex sums. A harness check round-trips `S` across repeated `souls()` calls to prove it is derived, never stored.

**The validator refuses `popNoun === tileNoun`.** Iron shipped with both as *holdfast*, so the game counted people and called them places, and the POP tooltip read "every holdfast counted here stands on one of your 20 hexes". Correct while population *was* tiles; wrong since the engine rework. `design.md` had already refereed this exact collision once for the tile ladder, which is why the fix is a validator and not a value change.

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

**`removeSettler()` died in E5 and nothing replaced it, deliberately.** Nobody dies *nowhere* any
more: a death has to land on the ground where that person actually lived, so sickness and raids call
`strikeHex(cause)` to choose a hex and `killAt(hex, toll)` to take people from it. The old helper
decremented a global `S.pop` counter, which is exactly the fungible-pool thinking the rework
removed. `removeRandomUnit()` survives unchanged for units, which genuinely are a roster rather than
a place: it drops a unit and the pop mirror together.

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

> **EXECUTED 2026-08-26 (A5).** The algorithm below no longer exists in the code — kept here as
> the record of what died. The conflict event survives as a TRIGGER only: same cadence
> (`conflictBaseChance` scaling with population, `hostilityMultiplier` for grudges), but on a hit
> it calls `spawnRaid()` (sim/raiders.js) instead of resolving anything. A raid is an army:
> mustered at the sender's seat from `raidSender`/`rollRaidType`/`rollRaidSize` (the era-clock
> wire, intact), marched at a frontier-weighted target that redraws once off garrisoned or walled
> ground (raiders scout their targets), **sighted** with a Chronicle warning when it first enters
> your view, fought by the resolver if met, turned away by walls unfought (raiders do not
> besiege — and a repelled war party TURNS ON THE NEAREST SOFT HEX beside the walls instead of
> going home, so deterrence is real for the hex and never free for the realm; a fully walled
> realm, and only a fully walled realm, sends them home empty-handed), and pillaging on arrival — the same steal fraction and capped pop toll the old event
> used, then home to the pool as veterans. One raid out per sender at a time. Raiders never
> conquer; ground changes hands only when armies take it.

Conflict uses the `resolve()` escape hatch. Its algorithm:

1. **Trigger** — `chance = CONFIG.conflictBaseChance * (1 + S.pop * CONFIG.conflictPopScale)`, further multiplied by `hostilityMultiplier()` (×1.5 per Hostile warlike neighbour), converted to a per-`dt` roll. Frequency scales continuously with population — a bigger settlement is a bigger target — rather than using a threshold gate. Also gated behind `S.pop >= 4`, matching Sickness's early grace.
2. **Raid size and type** — independent weighted picks from `RAID_SIZES` (small/common, large/rare) and the era's raid types. Size is "sometimes 2 scouts, sometimes 10"; type is what composition plays against.
3. **Defense** — `militaryStrength(raid)`. `weaponMultiplier()` is tiered, highest owned wins (Iron 3.0 > Bronze 2.2 > Flint 1.6 > unarmed 1.0); `armorFactor()` has the same lowest-wins structure pointed the other way. Zero units means zero defense, full stop.
4. **Repel check** — `repelChance = defense / (defense + raidSize)`. A ratio, not a threshold: always some chance either way, more investment always shifts the odds, nothing ever reaches exactly 0% or 100%.
5. **Consequences**, banded by outcome:
   - **Repelled, clean** — no losses.
   - **Repelled, costly** — rolled separately (`raidSize / (defense + raidSize)`, softened by armor and by `counterCoverage()`); one unit lost via the exposure-weighted draw.
   - **Raid succeeds** — `1 + floor(raidSize / 5)` units lost (capped at how many exist), a fraction of every resource stolen (scaling with raid size, capped at 50%), and — only if defense was especially thin relative to the raid, including `defense === 0` — one civilian lost via `removeSettler(true)`.

6. **Attribution** — `raidAttribution()` (in `sim/expeditions.js`) answers *whose raid was this*, and returns `null` at any era whose `contact` fact is `"none"`. Null selects the anonymous flavor pool; a people selects the named one. It is drawn **once** per raid so the flavor line and the hex-strike line blame the same neighbours, and it is deliberately **not** `riskAdversary()`: that one asks who has a grudge worth prowling the roads over (`standing <= -2`, gates caravan escorts, null on a peaceful map), while attribution asks a question every raid has an answer to. Candidates are warlike neighbours only, weighted `1 + max(0, -standing)`; a lone candidate is returned **without a draw**, so the common path spends no entropy.

**Flavor lines are templates, and `sentenceCase()` is not cosmetic.** Every people-name in the roster begins with a lowercase article ("the Hill Clans"), which is correct mid-sentence and wrong at the start of one — and a line may begin *more than one* sentence with a substitution. Capitalising only `line[0]` catches the first and misses the rest, which is how *"...before anyone can hold them back. the Hill Clans, and they knew the way."* got written. The harness pins both cases, plus a template-leak check that renders every line in every pool and fails on a surviving `{` — the class of bug that reaches a player because no type system sees it.

Conflict is the one hazard allowed to end a run (`design.md`, *Failure*), which is why it passes `allowZero: true`. **It does not end the game itself** — the generic `S.pop <= 0` check in `step()` does.

## The battle resolver — `src/sim/battle.js`

**Status: built and harnessed 2026-08-26; not yet wired to contact.** It replaces the one line that
used to be the whole of combat, `repelChance = defense / (defense + raidSize)` — one number for an
army, one coin flip for a war.

**The shape.** Units contribute dice. A die hits on its unit's number or better, **high is good**, on
a **d10** — a d6 gives five usable tiers and there are twelve ages to cross. Both sides roll off the
**pre-round** rosters and casualties land after, so a dying unit still shoots. Rounds repeat until a
side is gone or withdraws.

**Power scales through DICE COUNT**, never through an ever-better to-hit number: a stronger unit
rolls two dice at 7+, not one die at an impossible number. That keeps every figure on screen legible
across the whole era span, and makes extra dice a tech-tree lever.

**It is a leaf module by design.** No state, no DOM, no global RNG — the caller passes the dice in.
That is what lets the harness pin them, and it means the battle panel will be a **replay of the
script the resolver returns** rather than a second implementation of the rules. There is exactly one
place a fight is decided.

Unit fields it reads, all defaulted so a def missing one still fights: `dice`, `hit`, `role`
(`melee` / `ranged` / `siege`), `wallDamage`.

**The rules, each of which is an owner ruling — see `todo.md` for the reasoning:**

- **A battle is sealed when it joins.** No reinforcement mid-fight, ever: that is drip-feeding, and
  drip-feeding is micro. A battle runs to annihilation or a pre-set withdrawal. **Relief does not
  join a siege — it fights the winner.**
- **While walls stand, the attacker's hits go to the WALLS**, not the garrison. `wallPool` is the
  pool; it is a **pacing** knob as much as a strength one, since rounds play over ticks. A siege
  needs no special machinery — it is simply a long battle.
- **Only archers fire from inside a fortification**, and only as many as there are **firing slots**.
  Melee stand there and do nothing at all until the breach, then all of them wake at once. Without
  the slot cap the rule has a degenerate optimum (measured: ten archers held 60% where five archers
  and five horsemen held 17%); with it, the best melee is worth garrisoning again (61% vs 37%).
- **No spill.** Hits that bring a wall down do not carry through to the defenders that round. The
  breach is the next round's drama.
- **Worst goes first, and worst means cheapest** — cost, not combat value. Ordering by value would
  kill an attacker's siege engines while the walls still stand, which is exactly the units doing the
  work, because their value against *units* is deliberately awful.
- **Population does not fight.** An undefended hex with no walls returns outcome `undefended`: no
  dice, no rounds, no panel. Walls with no garrison are a **timer**, not a defence.
- **The stance is a risk budget, not a tactical brain.** Named steps only, never a typed number, and
  it reads *only your own losses* — it deliberately does not know whether you are winning. Default
  is fight-to-the-last, the least surprising order.

**The panel constrains the rules.** Everything that fires is standing on the hex — no adjacency
bonuses, no off-board modifiers. The panel must show the player exactly why they lost, and it can
only show what it can line up on screen.

## Armies — `src/sim/armies.js`

**Status: A1–A3 shipped 2026-08-26.** An army is an expedition that knows where it is standing.
Before this, a unit was a number and nothing more: six soldiers existed *somewhere* and defended
whatever the sim chose to attack.

**`p.units` still counts every unit a civ owns, home or away** — the convention expeditions already
set, kept because the population mirror and `popCost` both read it. An army *lists* the subset that
is committed. `freeUnits()` is the single answer to "how many can I give an order to"; `derived.js`
delegates to it rather than keeping a second one, because two answers to that question is how a
roster starts lying.

- **A garrison is just an army standing on your own ground.** One object, one rule set.
- **One army to a hex, per player.** Arriving on one of your own **merges** into it, and the
  standing army keeps its stance because it was the one already holding the ground. Not battle
  reinforcement — there is no battle — just two of your columns becoming one. This is also why
  splitting armies does not exist: disband-and-reform *is* the split, priced in travel time.
- **Disband only on your own territory**, or disband beats marching home and teleports units for
  free. The troops return to the **unit** pool, never to the population: `popCost` is already spent,
  and disbanding a formation does not discharge its soldiers.
- **Marching** uses `pathBetween()` (`map/routes.js`), which answers what `adminDistance` and
  `routeCost` never had to — not how far, but *which hexes, in order*. Same step rule: your own
  country half a step, open land a full one, water three. Marching inside your borders is twice as
  fast as invading, which is what makes a relief force a real idea rather than a stated one.
- The road is decided **once, at dispatch**, and kept. An army walks the road it was sent down
  rather than re-deciding every tick — that is what lets it be met on the way.
- `tickArmies()` moves **every** civilization's columns through one function on one clock. Symmetry
  is the point: anything the board shows about yours is true of theirs.

### Contact, raiders, bots, and the panel — the rest of the war (pointers)

Four modules complete the arc; their full reasoning lives in their own headers and in `design.md` →
*Armies Take the Field* / *How an Army Is Depicted*:

- **`sim/contact.js`** — what happens when two armies share a hex. Battles are sim objects in
  `S.battles` playing one round per `battleRoundSeconds`; each row stores seal-time roster
  snapshots plus ONE drawn seed, and the script is *recomputed* (WeakMap-cached per row), so
  save/load resumes the same war bit-identically — the recompute path is the tested path. Hooks
  (`barred`/`parked`/`entered`/`arrived`) are the one seam into `armies.js`, pointing one way.
  `wallsAt` reads the structure ON the hex, or a capital's authored walls (`seatWallScale`) — and
  carries the null-key-trap tombstone (the human's `key` is null, ordinary hexes' `adversary` is
  null, and a bare `===` once deleted every march-hold from the resolver).
- **`sim/raiders.js`** — a raid is an army: mustered at the sender's seat from the era-clock wire's
  rolls, sighted with a warning, deterred by walls (and torching the soft hex beside them),
  pillaging with the old steal-and-toll arithmetic, homing as veterans. One out per sender.
- **`sim/bots.js`** — the neighbours as countries: lazy idempotent settlement (seat + home ring +
  era-sized garrison), slow expansion to their own era's dominion cap, regarrison after
  `botRegarrisonSeconds`. Nothing of their economy is simulated; ground and armies are what the
  board can show. **The levy binds everyone**: `botLevyCap` = territory × armyPerHex, floored at
  authored strength; `botMint` musters free units first and mints only the shortfall — the fix for
  a garrison of seventeen. Seat reads go through `seatCivAt()` (razed seats are wilderness
  everywhere at once; reborn peoples carry `seatHex` on the record because the world rebuilds from
  the seed at load). Rebirth: a broken people returns on a clock drawn at the break, at a NEW seat
  far from every holding, fairly reset.
- **The sack** (`sim/contact.js`): the war-finishing verb — an army standing UNOPPOSED on enemy
  ground tears it down over `sackSeconds` (`sackCapitalSeconds` for capitals); battles PAUSE the
  clock, never reset it; ordinary ground releases-and-skims, a capital BREAKS the nation (raze,
  scatter, treasury share, rebirth clock — and the human's capital sacked is the run's military
  loss). The sack fires only at its ordered target: meeting engagements decide where you fight,
  never what you tear down.
- **War intent** (`sim/raiders.js`): a flush warlike muster escalates the raid trigger to a WAR
  ARMY (stance half, no soft-target scouting, never the human's home in v1) that conquers and then
  converts to holding its prize. Sightings fire only for armies OFF their own civ's ground.
- **Gold** (`core/actions.js`): the market's premium good — bought at `tradeRate × goldTradeMult`,
  never accepted as payment.
- **`ui/battle.js`** — the dice on the table: a live view of the script the sim is playing (never a
  second clock, so it cannot desync; pause freezes it; reopening lands on the live round). Viewer
  always bottom; hits lit; walls drain; never the odds.

### The board has to notice things that move on their own

`ui/map.js`'s stage signature gained `armyStamp()`. Found by looking at the board rather than by
reasoning about it: without it the stage never rebuilt when an army moved, so a banner sat on the
destination hex while the army stood twelve seconds away on its start hex, becoming correct only by
accident when the army arrived. Everything else in that signature is a **standing fact about the
ground**; an army is the first thing on this board that **moves on its own**, and the signature is
what has to notice. Cheap on purpose — it runs five times a second, and there are a handful of
armies in a run.

### The legibility contract

The game will **never print your odds**. No board game does, and a printed percentage collapses the
decision into a threshold check — the player stops reading the board and starts reading the number.
What it owes instead is the **inputs**, wherever a unit is drawn: the army card, the muster screen,
the roster panel all print the to-hit number. *"6 Soldier"* supports no estimate; *"6 Soldier, hits
on 7+"* **is** the estimate.

## Adversaries & Expeditions

**Status: shipped (C2, C2.1, plus siege).** Design canon in `design.md`, *Adversaries & Expeditions* and *Siege & Fortifications*.

**`adversaries` is a manifest category declared wholesale per era, never inherited.** *(Stone and Bronze used to declare `[]`; since 2026-08-25 all three eras seat the SAME three peoples, re-dressed per age — the roster is fixed at generation and only the era changes what they have grown into. `contact` is what gates whether you can act on them, not their existence.)* Shape: `{id, name, disposition: "peaceful"|"warlike", strength, walls?, fightsAs: raidTypeId, stock: {resId: n}, buys?: {res, amount, pays}, campaignTime, caravanTime?, desc}`.

**State: neighbours ARE civilizations** *(2026-08-26, the per-player refactor)*.
They were `S.adversaries = {[id]: {stock, standing, walls, era}}` — a parallel
track by construction: a record shaped nothing like a civilization, that no
player system could read and no player verb could act on. They are entries in
`S.players` now, carrying every field you carry, found with `playerByKey(id)`
or listed with `rivals()`.

The merge that matters is one field: **their `stock` became `res`.** Plundering
a neighbour takes from their RESOURCES, the same pile yours comes out of, so
the day a bot spends its own wood on its own buildings there is nothing left to
convert. `standing` and `walls` ride on the record too, both on the road to
becoming ordinary — walls want to be fortification structures standing on their
hexes.

The manifest entry is still the *template*, and a neighbour is authored out of
**its own age**: `active(civ)` reads that civ's era, and its larder refills when
THAT clock turns. Comparing against the human's era was the "rival strength
keyed to your progress" defect — scale to the player and you get the Oblivion
problem, where bandits appear in glass armour.

**Minors are NOT players.** A steading is still a remnant on the map
(`S.map.minors[tileId].stock`), so a campaign target carries its `larder` under
one name and resolution never has to know which kind it is holding.

**`paceRivals()` is a POLICY, not a mechanism.** The mechanism is finished: any
civ can cross a border on its own clock. What decides *when* a neighbour
advances — the hidden per-civ countdowns of `design.md` → *Every Civilization
Keeps Its Own Time* — is not built, so rivals currently keep level with the
human. That is the old behaviour expressed through the new verb; replacing it
with countdowns is a change to that one function and nothing else.

Each civ's `expeditions` holds at most one campaign and one caravan
(`expeditionOut(type)` guards per type — never two of a kind).

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

> **SUPERSEDED 2026-08-22 by the flip.** There is no Expeditions panel and no 4-column grid any
> more: the map is a full-bleed stage with floating panels over it, and every outward verb lives on
> the **selected tile** instead (`detailHTML` in `ui/map.js`). Campaigns still launch through the
> muster modal described below, which survived the flip intact and is still the best-staged decision
> in the game. The paragraph is kept for the card anatomy and the uid-prefix trick, both of which
> still apply to the queue panel.

**Layout (historical).** `#panel-expeditions` sat at grid row 2 / column 4; the Chronicle's `grid-row: 1 / 3` becomes conditional and drops to row 1 once the Muster Ground reveals — the same sticky-span machinery the roster panels use, pointed the other way. Each adversary renders as a create-once card: name, disposition, standing word, known stock, wall state, campaign allocator (job-style steppers per unit type) and caravan button with the posted exchange. Campaigns launch through a muster **modal** (description, live estimate, steppers; the allocator is module-level UI state like `paused`, reset on launch). Caravans stay one-click on safe roads and open an **escort modal** when the roads are dangerous. Expeditions render as cancel-less progress cards at the top of the queue panel, typed by `QUEUE_ICONS`, with uids prefixed `x` so they share the panel with build uids.

**The panel is gated on era, not progress**: `expeditionsUnlocked()` is `active().adversaries.length > 0`, so it stands in any era whose manifest declares an outside world. The Muster Ground gates the *actions* on the cards (with a tooltip reason on each disabled button), not the panel — reading your neighbours before you can act on them is the point, since the cards are the recruiting poster for the building.

## What a Hex Is — the use seam

**Status: shipped 2026-08-25.** Design canon in `design.md`, *Building on a Hex*.

**Simplified 2026-08-25 with the hex economy.** `S.map.work[id]` used to hold either a chosen
RESOURCE (`"wood"`) or a prefixed structure ref (`"build:farm"`), because a hex could be pointed at
any resource its terrain would grudgingly give. Terrain decides that now, so the slot only ever
holds a structure id, the prefix has nothing to disambiguate from, and the field is
**`S.map.built`** — which is what it always meant. A hex is BARE (working the ground it is made of)
or it carries exactly one structure. There is no third state.

`map/map.js` owns the accessors and nothing else should read the slot:

- **`hexUse(id)`** → `{kind: "bare"}` | `{kind: "structure", id}`
- **`hexYield(id)`** → `{res, rate}` or `null` — a structure's own yield, else the terrain's
- **`terrainYield(id)`** → what the GROUND gives, ignoring anything built on it. Kept separate so
  the interface can say "this forest would give wood" about country you do not own, and so a
  structure's blurb can be honest about what it is replacing.
- **`hexProduces(id)`** / **`hexResource(id)`** → the ledger question, and the resource or `null`

**`setHexBuild(id, value)` is the ONLY writer.** Seven places poked the object directly before
2026-08-25, which made the render stamp impossible to keep honest — an eighth would simply have
forgotten it. A harness check pins the writer count at one. The stamp (`workStamp()`) is a
render-cache counter, not game state: it lets `ui/map.js` ask "did anything on the board change?"
in O(1) instead of `JSON.stringify`-ing the map five times a second, and it deliberately does not
ride in the save.

**Structures are terrain-gated** via a `terrain: [...]` list on the structure def; no list means
anywhere. `structureFits(sid, tileId)` is the check, and `launchStructure` enforces it — the UI is
not the only caller.

**One behaviour was right by accident and is now right by rule.** `rates()` skipped unknown work
values because they failed an `in prod` test and fell through; a structure answers `null` from
`hexResource()` and is skipped deliberately. Same outcome, a stated reason, and no chance of a later
refactor "fixing" the fallthrough into a bug.

**Structures declare an optional `yield`** — `{res, rate}` — and `hexYield(id)` answers it for built
ground exactly as it answers the terrain table for worked ground. *(The seam originally said a
structure never produces; the first structure built was a farm, which does. A structure occupies a
hex INSTEAD OF working it, which is not the same as yielding nothing.)* A structure with no `yield`
is out of the ledger entirely — that is the march-hold, and it is a legitimate answer rather than a
missing one.

**Two structures ship today**, both authored per era in `src/content/` and inherited: `farm` (Bronze,
`requires: "farming"`) and `marchHold` (Iron, `requires: "fortification"`, `fortifies: true`). Adding
another is authoring plus a paint entry — no engine work.

**The validator refuses:** a structure with no cost or build time, one whose unlocking upgrade exists
in no era (unreachable, and invisible until a playthrough that never offers it), and one that yields
a resource its era does not have.

**The seat is not buildable** (`canBuildOn`). The Construction panel raises things in your seat;
building on a hex is instructing a holding. See `design.md`, *Building on a Hex*.

## Losing Ground

**Status: shipped 2026-08-25.** Reverses `design.md` rule 9 — see it for the reasoning.

**`loseHexIfEmpty(id)`** drops a hex from the dominion the moment nobody is left on it: removed from
`owned`, its population and use deleted, anything built on it destroyed with no refund. It is called
from **every** path that can empty a hex — the famine drain and `killAt()` (sickness, raids) — because
losing ground is a property of the hex being empty, not of what emptied it. **The seat is the one
exception**: it ends the run instead.

Ghost hexes and the 0.2-soul rekindle are deleted. Ordinary regrowth is untouched — a hex struck but
not emptied still climbs its logistic back toward its cap.

*Known sharp edge, recorded for play rather than tuned:* a new hex enters at 2 people and a raid
takes 1–2, so a freshly claimed hex can be lost within seconds — measured at 0.3% inside five
seconds. Raids also pick exposure-weighted by population × administrative distance, so a new frontier
hex is both the likeliest target and the most fragile.

## The Event Bus — the sim/interface seam

**Status: shipped 2026-08-26** (review Part II.3).

`core/`, `sim/`, `map/` and even `content/` used to import `ui/` directly:
`step.js` did DOM surgery to end a run, `era.js` opened a modal and reset the
player's clock, and every corner of the sim wrote straight into the Chronicle.

That inverted edge cost three things. The harness had to stub `document`,
`localStorage` and `window` merely to IMPORT the simulation. A bot doing
anything at all would have seized the human's screen — the first rival to reach
Bronze would have reset your clock and held your ceremony modal open. And every
line the sim wrote had no answer to the question the player split made
unavoidable: **whose Chronicle is this?**

`core/bus.js` carries what the simulation says:

| Event | Emitted by | Payload |
|---|---|---|
| `chronicle` | anywhere in the sim, via `chronicle(text, cls, pid)` | `{text, cls, pid}` |
| `render` | actions, expeditions, `die()` | — |
| `speed` | `advanceEra` | `{value}` |
| `eraAdvanced` | `advanceEra` | `{era, pid}` |
| `runEnded` | `die()` | `{cause}` |

`ui/wire.js` is the **only** module that knows both sides, called once from
`main.js` before boot. A headless run simply never calls it, and emits land on
an empty registry — silence rather than a special case, which is what lets the
whole simulation run with no DOM at all.

**Every line says whose it is.** `chronicle()` defaults `pid` to the seat being
watched, so existing calls kept their meaning; the interface drops what is not
yours. Your own border is a ceremony, somebody else's is news — and news
belongs to the notifications system as a different sentence entirely.

`fmtTime` moved from `ui/chrome.js` to `core/derived.js` on the same pass: the
simulation's own pacing telemetry prints it, and a formatter is not a view.

## Rendering

**Status: shipped.**

No framework — direct DOM manipulation, with one law used everywhere something repeats: **create the element once, on first appearance, and update its contents in place on every subsequent render.** `renderAll()` runs 5×/second, so rebuilding via `innerHTML` is both wasteful and silently drops event listeners on child elements.

**Two bugs made that law non-negotiable. Both are still live lessons.**

**The click-eater.** The oldest bug in the project: buys sometimes took two or three clicks. The three buy-card renderers rewrote `card.innerHTML` on every 200ms tick — and a click is not instantaneous. Mousedown landed on a child span, the next tick destroyed it, mouseup landed on its replacement, and the browser dropped the click because the pressed element no longer existed. Roughly half of all presses straddle a tick. The steppers never suffered, because they update stable nodes — which was already the stated rendering law; the card renderers had violated it since v1. Cards now build a skeleton once (`cardSkeleton`) and update via `textContent`/`classList`; cost spans rebuild only when the *part count* changes (era re-pricing, capped flips). Verified live: child nodes survive 20 render ticks identically. **The generalizable rule: a node the player can press must not be replaced on a timer.**

**The time-capsule click.** Different cause, same neighbourhood. Archers and Horsemen wouldn't train in Iron while Soldiers and Siege Engines would. A buy card's click listener had captured the **def object of the era the card was created in** — cards born in Bronze still called `build()` with the bronze-era def, whose cost names a resource that no longer exists. The *display* path reads the active manifest, so the card showed iron prices and looked perfectly buyable; only the click was stale. Soldier never broke (identical cost in every era) and Siege Engine never broke (born in Iron), which is exactly the symptom pattern. Fix: **resolve the def by id at click time via `defById()`**, which answers with the active era's version. **The generalizable rule: a closure created once and invoked later must capture ids, never era-scoped objects.** This is the same trap as "re-render era-dependent text," in the one place where re-rendering doesn't help you.

**The stage holds until it knows which board it is (2026-08-25).** `init3d()` is deliberately not awaited — boot must never block on a GPU — but "the 3D stage takes over a frame later" was optimistic: the dynamic `three` import plus GPU setup runs one to two seconds on a cold load, and for that whole window the player watched the **2D SVG board**, then saw it replaced. A flash of a different game, and the first thing a new player saw.

`mode` now has three states rather than two: it starts at **`pending`** (unless `?map=2d`, which goes straight to `2d` and never waits), `renderMapStage()` draws *nothing* while pending, and the stage carries a `stage-waiting` class until `init3d()` settles. The fallback is untouched in behaviour — it simply stops being the default view and becomes what you get when 3D actually fails.

**Two things make this safe, and both are the kind of detail that turns a nicety into a black rectangle.** First, `mode` must be *decided* on every exit path from `init3d()`; it used to start at `2d` and only ever move up, so failures needed no handling, and a forgotten path now means a board that never appears. Second, the CSS is keyed **the safe way round** — the default is visible and only script can hide it (`#mapStage.stage-waiting { opacity: 0 }`), so a module that never runs leaves the board simply there. The `.then()` runs on every path and reveals unconditionally; `init3d()` returns `false` rather than rejecting, so there is no path where the reveal is skipped.

*Verified live, not by eye:* with a 2.5s delay injected into `init3d`, the stage reported `svg: false` at every sample across the whole window — the 2D board is never built, not merely hidden — and revealed at the moment `mode` became `3d`. With the 3D import deliberately broken, the stage fell back to a 2D board of 408 tiles at full opacity. With `?map=2d`, it never entered `pending` at all.

**Panels no longer hide themselves.** Every panel the active manifest can fill is in the DOM and visible from the first frame; only its *contents* are reveal-gated. Rows and cards carry a `hidden` class toggled by `isRevealed(def)` (never `def.reveal()` directly — see Persistence), and the buy-list renderers toggle an empty-state sentence instead of the panel's own visibility. The only era-gated panel is Expeditions.

*Historical note, kept because the reversal reversed a reversal and the reasoning is the interesting part.* The board *was* whole from frame 1 originally; that changed once live play showed empty panels reading as clutter; and it is now back, because the premise of that complaint was the flat pen-on-paper wireframe in which an empty panel and a full one looked identical. Bureau gives every panel an ink header plate and its own paper stock, so an empty one reads as a blank form. Two pieces of machinery went with the reversal: `S.seen.queueUsed` was removed (it had become write-only state persisted into every save), and `updateSpans()` shrank to the Chronicle's double-height span alone.

**Your People** renders person-type tiles the same create-once way Settlement renders building tiles — reusing the `.holding` visual style, but living in a different panel and a different state bucket, since "who your people are" and "what you've built" are deliberately separate questions. Settler count shown is `civilians()`, not `S.pop`.

**Dynamic row-span.** A top-row panel expands to fill its whole grid column when its paired bottom-row panel has nothing revealed yet, rather than leaving an unexplained blank cell — driven by the same reveal check as `hidden`, applied to a `.span-both` class. In practice only Your People/Training shows it for a real stretch (Barracks is a mid-game unlock); applying the rule uniformly rather than special-casing the one panel where it matters is what makes it cheap insurance instead of one-off code.

**Descriptions live only in the tooltip.** `attachTip(el, getter)` stashes a *getter* on the element rather than a snapshot, because cards update in place and a snapshot taken at creation goes stale immediately — the same class of mistake as the time-capsule click, caught early. The tooltip carries a title, a body that can afford to be verbose, and the refusal reason (`shortfallLine()` → "Short 24 wood."), so there is exactly one place to look when something won't buy.

`log()` prepends rather than appends, so the newest Chronicle line is always the first child and `el.scrollTop = 0` keeps it in view; the 60-entry trim accordingly removes from `lastChild`. Each entry is a 28px row: a mark in a 32px gutter (`+` good, `!` danger, `★` milestone, `·` neutral) whose right edge *is* the legal pad's red margin rule, then the text. The mark repeats what colour already says, deliberately — it survives skimming and it survives colour blindness. Severity is passed explicitly at the call site, never inferred from the text.

## The Sink-and-Rise, and the Stage's Three States

**Status: shipped 2026-08-25.** The motion law is in `design.md`, *Explicitly Out of Scope*: motion
happens only at the moment of a change, only to the thing that changed, and may show a CHANGE, never
a STATE.

**`changedHexes(ids)`** (`ui/map.js` → `stage.changeHexes`) is the one entry point, and it is general
by construction — the era re-dress, building a structure, demolishing one and losing a hex to famine
are all *"this hex's contents changed"*.

Three pieces make it work:

- **`props3d.js` records the TILE each instance stands on.** One string per instance, and it is the
  difference between a general per-hex primitive and an era-ceremony special case: without it, moving
  one hex's props means rebuilding the whole board.
- **Pacing is the content.** 620ms down, 980ms up, plus a per-tile stagger of up to 420ms, so a
  whole-board re-dress runs about **2.4 seconds** and a single hex about 1.6. The owner's framing is
  the spec: this is not a UI transition, it is *people doing work* — raising a building, turning a
  forest into a farm — and at the original 260/320 it was "blink and you miss it". Easing is
  smoothstep both ways; the first version dropped and popped, which read as physics rather than
  labour. **Three constants** — `SINK_MS`, `RISE_MS`, `STAGGER_MS` in `stage.js`.
- **The stagger exists because slowing it down exposed the lockstep.** At 580ms nobody notices twelve
  hexes moving as one; at 2.4s it reads as a single mechanism rather than twelve crews. Each tile
  takes a deterministic offset hashed off its id — never `rng()`, the same rule every other visual
  jitter follows. `STAGGER_MS = 0` disables it.
- **`setPropPhase(group, tiles, phaseOf)`** rewrites only the matching instance matrices. `phaseOf(tile)`
  returns that tile's own 0..1, which is what makes the stagger possible. 0 is
  standing, 1 is fully underground. The ground hides the descent for free — a hex is a solid slab, so
  anything below its top face is occluded at every angle the camera is clamped to. No clipping plane.
- **The rebuild is held, and that is the hard part.** `setWorld()` arriving mid-sink would swap the
  very meshes being animated, so it is stashed in `pendingWorld` and applied at the *bottom* of the
  descent, unseen, before the rise begins.

**The stage also has three boot states, not two.** `mode` starts at **`pending`** (unless `?map=2d`),
`renderMapStage()` draws nothing while it is undecided, and a `stage-waiting` class hides the stage
until `init3d()` settles. Before this, a hard refresh showed the 2D fallback board for one to two
seconds and then replaced it. **Two invariants keep that from becoming a blank rectangle:** every exit
from `init3d()` must *decide* `mode` (it used to start at `2d` and only move up, so failures needed
no handling), and the CSS is keyed so the default is VISIBLE and only script can hide it.

**QA lenses on the renderer:** `?glcheck=1` makes the drawing buffer readable; **`?perf=1`** publishes
`window.__mapPerf` (draw calls, triangles, instance count, median frame time) and `window.__mapDebug`
(the live prop group and the transition trigger), because the one moving thing on the board is the one
thing a screenshot cannot check. `renderer.info` accumulates across the whole frame under that flag —
it self-resets per render call, and the composer makes several, so reading it afterwards reports the
last post pass rather than the board.

**Measured prop budget** (`map.md` §7.5): 68,716 instances at 28 draw calls and a locked 60fps. Prop
*density* is not a budget worth managing; unique prop *kinds* are, because each kind is another
InstancedMesh.

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

**Status: shipped as the interim skin; the identity is resolved elsewhere.** The visual identity is **the digital tabletop** (`design.md` OQ3, `map.md` §8 — a lit 3D diorama; Phase 10 in `todo.md` ports the map onto it). `styles.css` implements **Bureau**, the interim panel skin that dresses the floating panels until that reskin. Full treatment in `interface.md`; what follows is the load-bearing summary of what is on screen today.

Bureau is dense administrative paper — ledger sheets, ink tab headers, monospace numerals, hard 1px borders, no rounded corners, no shadow anywhere except the modal's hard offset. (Its founding framing — "the game is a spreadsheet, so stop disguising it" — retired with the paper identity on 2026-08-22; the laws below did not.)

**Tokens, not literals.** `:root` holds surfaces, the three-value semantic channel, border weights, the rulings and the three type registers. A palette that can be re-pointed in one place is the only version that survives nine more eras of content.

**Two laws run through the whole sheet, both load-bearing rather than stylistic:**

1. **Opacity is never used, for anything.** It previously did double duty for *unaffordable*, *queued* and *already owned*, and all three read to players as "you can't have this." State is carried by border weight, border colour, glyph colour and status words instead. Concretely: an unaffordable buy-card is a lighter border and nothing else — its text stays at full contrast, because most cards spend most of their life unaffordable and *reading* them is how players plan. Death drains the board's saturation rather than fading it.
2. **Legibility outranks texture.** Each column gets its own stock — cork, graph 16px, dot grid 14px, legal pad — which is what makes the columns distinguishable without spending colour on it. Anything carrying words sits in an opaque box on top. One exception: loose text on *cork* sits straight on the speckle (nothing crosses a letterform) with a darker ink; on ruled stocks it needs a paper patch, because a ruling is geometric lines cutting through letters.

**Layout (post-flip).** `body` is `overflow: hidden` — the page itself never scrolls. `#mainArea` is `flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden` (every declaration load-bearing — losing `min-height: 0` once shipped a zero-height page), holding the full-bleed `#mapStage` with the panels floating over it: Train/Build/Upgrade as fixed shares down the left, People / Selected Tile / Chronicle down the right, Underway docked at the bottom. Each panel is a flex column with a fixed ink header plate and a separately-scrolling `.block-body`. (The pre-flip 2×4 Bureau grid is gone; the flip is documented in `interface.md`.)

**Era chrome.** `renderEraChrome()` writes `S.era` to `body[data-era]` and CSS does the rest: desk colour, era badge, and a wholesale inversion of the header chrome for dark desks. Header chrome is authored as three layers — border, fill, text — so it never assumes a light background, which is what lets later eras go as dark as they like.

**Colour is a small semantic system**, enforced at the call site: `--danger` (blocked, negative, at-cap), `--good` (working, gained, owned), `--queued` (in progress), otherwise ink on paper. Text wraps and never truncates; a live check of the maximal 8-panel Iron board finds zero clipped elements and zero page overflow in either axis.

## Testing Approach

**Status: shipped at 791 checks, 0 failures. Phases 2 and 4 shipped; the action journal that makes replay real landed 2026-08-25 (`src/core/journal.js`), though nothing consumes the tape yet.**

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

**G1 — the engine rework (population & levy).** ✅ **Shipped 2026-08-22** exactly as below, with
three build-time rulings recorded: units are **not** consolidated at a levy border (they are no
longer population; the fighting bands carry whole, and an overflowing levy refuses training until
the dominion grows into it); the timer→levy border **separates units out of the incoming pop
exactly once** (`S.seen.levyMigrated` marks it done, and also gates the load-time back-compat for
old iron saves); and `outputMult` applies to per-worker production **and upkeep** (a holdfast works
and eats like the families it holds — that is what keeps the food equation balanced) but never to
converters (a Forge is a building, not a population). The POP ledger row demotes to a bare count
under conquest growth, per user ruling. The spec, now description:

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
