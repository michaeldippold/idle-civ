# Idle Civ — Technical Design

How the game is actually built. See `design.md` for why any of this exists; this doc is purely the how.

## Stack

Plain HTML/CSS/JS. No build step, no bundler, no dependencies, no framework. Three files:

- `index.html` — structure/markup only
- `styles.css` — all styling
- `game.js` — all logic and rendering

Open `index.html` directly in a browser; nothing needs to be served or compiled. (A local static server is used during development purely so the in-tool browser preview can execute JS — see the note on `file://` limitations below — but it is not required to play the game.)

## Simulation Model: Continuous Delta-Time, Not Discrete Ticks

The game loop is a `setInterval` at `CONFIG.tickMs` (200ms) that computes real elapsed time (`dt`, in fractional seconds) since the last frame and calls `step(dt)`. All production, upkeep, and event probabilities are expressed as **rates per second**, not per discrete tick — `S.res.food += rate * dt`, `chancePerSecond` converted to a per-`dt` roll via `1 - (1 - chancePerSecond) ** dt`.

This was a deliberate choice (discussed and confirmed against an alternative): a discrete fixed-tick model — like the one used in a sibling project, `dispatch`, where a `state.tick` integer counter drives everything and cooldowns/story-beats are expressed as tick counts — is a better fit for a scripted, time-of-day-driven simulation. Idle Civ's genre is the opposite: long unattended stretches and offline catch-up are core to how the game is played, which is exactly what continuous delta-time simulation is built for (it degrades gracefully to "however much time passed," rather than needing to replay potentially tens of thousands of discrete ticks). If a need for tick-counted bookkeeping (cooldowns, scripted beats at a specific moment) shows up later, the plan is to add a lightweight monotonic `S.tick` counter *alongside* the existing continuous economy, not replace it.

## Persistence

`localStorage`, under a single versioned key (`CONFIG.saveKey`, currently `"idleCiv.v3"`). Load uses a defensive merge pattern so the schema can grow additively without a migration step:

```js
S = Object.assign(freshState(), data);       // fresh defaults, then override with saved data
S.builds = Object.assign(freshState().builds, data.builds);  // same pattern, nested
```

Any field present in `freshState()` but absent from an old save (e.g. `era`, or a newly added building like `infirmary`) silently defaults correctly — this has already been exercised in practice across schema changes and needed no version bump.

**Offline catch-up**: on load, if a previous save exists, elapsed real time since `lastSeed` is computed and capped at `CONFIG.offlineCapHours` (4h), then simulated in ≤1-second chunks via repeated `step(dt)` calls with a module-level `SIM = true` flag. `SIM` suppresses per-event Chronicle spam (you don't want 200 individual "a wanderer joins" lines from an afternoon away) while still applying real state changes; a single summary line is logged afterward instead. If food would hit zero during offline simulation, `SIM_STOP` halts the catch-up early rather than actually killing the settlement while you were away — you return to a stores-emptied warning, not a game over screen you didn't get to see happen.

**Known fixed bugs**:
- The Reset button used to call `localStorage.removeItem(key)` then `location.reload()`. `location.reload()` fires `beforeunload`, which was still wired to `save()` — and since the in-memory `S` object was untouched, that `save()` call silently re-wrote the very save being cleared, making Reset a no-op in some cases. Fixed by calling `window.removeEventListener("beforeunload", save)` before clearing.
- `reveal()` conditions based on a resource *threshold* (Woodshed, Granary, and by extension anything gated only by `hut > 0` before the hut actually completes) were re-evaluated fresh every render with no memory — a resource dipping back below its threshold (e.g. spending wood on the very building that revealed the panel) could make the *entire panel* disappear mid-game, including panels with an actively-building queue item behind them. Fixed with `isRevealed(def)`, which caches the first true result in `S.seen["rev:" + id]` — reveals are now permanently sticky, consistent with how every other reveal in the game already behaves (resource rows, `REVEALS` hints).

## State Shape

The entire simulation lives in one module-level object, `S` (see `freshState()` for the authoritative shape):

| Field | Type | Purpose |
|---|---|---|
| `res` | `{food, wood, stone}` | Current resource stockpiles |
| `jobs` | `{forager, woodcutter, miner}` | Settlers assigned per gather job |
| `builds` | `{hut, woodshed, granary, dryingRack, lumberCamp, stonePit, infirmary}` | Completed building counts (repeatable) |
| `upgrades` | `{[upgradeId]: true}` | One-time upgrades owned; key presence = owned |
| `buildQueue` | `[{id, kind, uid, total, remaining, cost}]` | FIFO queue shared by buildings and upgrades; only index `[0]` progresses. `cost` is the exact price paid, stored for cancel-refunds |
| `buildSeq` | `number` | Monotonic counter for queue item `uid`s (DOM diffing key) |
| `pop` | `number` | Current population |
| `bought` | `number` | Total settlers grown via the wanderer event; drives escalating growth cost |
| `era` | `string` | Currently always `"stone"`; gates which `EVENTS` are eligible |
| `seen` | `{[revealId]: true}` | One-time UI reveal hints already shown |
| `dead` | `boolean` | Game-over flag |
| `lastSeed` | `number` | `Date.now()` at last save, used for offline catch-up |

## `step(dt)` — Order of Operations

1. Bail immediately if `S.dead`.
2. Compute `rates()` (production, upkeep, net food).
3. Apply production/upkeep to `res` (scaled by `dt`).
4. Clamp `food`/`wood` to their storage caps (`caps()`) — silent; a one-time Chronicle hint covers it via `REVEALS`.
5. Starvation check: if `food <= 0` and net food rate is negative, either halt (`SIM_STOP`, offline) or call `die()` (live).
6. Advance the front of `buildQueue` by `CONFIG.buildSpeed * dt`; on completion, `shift()` it and call `completeConstruction()`.
7. Call `resolveEvents(dt)` — population growth, sickness, and anything else on the `EVENTS` list.

## Resource System

- `rates()` returns per-second production for each resource plus `upkeep` (`pop * CONFIG.upkeep`) and `foodNet` (production minus upkeep — the only resource with an upkeep drain).
- `mults()` returns each job's production multiplier: `1 + (boost building count) * CONFIG.buildingBonus`.
- `caps()` returns current storage ceilings: `CONFIG.baseFoodCap/baseWoodCap + (storage building count) * CONFIG.storageAdd`. Stone is uncapped (`Infinity`) — no storage building exists for it yet.

## Construction Queue

Buildings are **not** modeled as in-place worker-assignable sites (an earlier version was, and was deliberately simplified away — see `design.md`). One shared FIFO queue (`S.buildQueue`) serves both `BUILDINGS` (repeatable, scaling cost) and `UPGRADES` (one-time, flat cost) — `build(def)`:

1. Computes cost via `buildCost(def)`. For a `kind: "building"` def this scales by `(S.builds[id] + pendingCount(id))` — cost escalates against *owned + already-queued* count, so queuing several of the same building back-to-back doesn't undercut the intended cost curve. For a `kind: "upgrade"` def this is always the flat `base` cost.
2. For upgrades only: refuses if already owned (`S.upgrades[id]`) or already queued (`pendingCount(id) > 0`) — one-time means one-time.
3. Deducts the cost immediately (payment happens at click time, not completion).
4. Pushes `{id, kind, uid, total: buildTime, remaining: buildTime, cost}` onto `S.buildQueue` — `cost` is stored on the item itself (not recomputed later) specifically so `cancelBuild(uid)` can refund exactly what was paid, even though a later-queued item of the same building type may have cost more than an earlier one.

`step()` only ever decrements `S.buildQueue[0].remaining`; everything behind it sits at full `remaining` (and therefore renders at 0% progress) until it becomes the front. `pendingCount(id)` — used for cost escalation, the "already queued" upgrade check, and the buy-menu's "(+N queued)" label — counts matches anywhere in the queue, not just the front. `cancelBuild(uid)` finds the item by `uid`, refunds `item.cost` back into `S.res`, and splices it out — this works identically whether the item is mid-construction (index `0`) or still waiting, since cancelling index `0` simply promotes index `1` to the front on the next tick with no special-casing needed.

## Buildings & Upgrades

`BUILDINGS` is a flat data array; each entry has `id`, `name`, `kind: "building"`, `desc`, `base` cost, `scale` (per-owned-unit cost multiplier), `buildTime` (seconds once at the front of the queue), and `reveal()` — a predicate deciding whether the buy-card exists yet (see `isRevealed()` below for how this is made sticky). This is the mechanism behind "the interface unravels": a card is created in the DOM the first time it reveals and never removed.

`UPGRADES` is the same shape minus `scale` (flat cost, never repeats) and tagged `kind: "upgrade"`. `defById(id)` searches both arrays, so the rest of the engine (`completeConstruction`, `renderQueue`, `cancelBuild`) never needs to know or care which list a queued item came from — it branches on `def.kind` only where the two genuinely differ (state update on completion: `S.builds[id]++` vs `S.upgrades[id] = true`).

`BUILDING_ICONS` maps each building id to a small inline `<svg>` line-art doodle (stroke-only, `currentColor`, no fill except two intentional dot accents on Stone Pit) — used in the Settlement/holdings panel so owned buildings are visually distinct tiles, not just numbers in the buy menu. Upgrades don't currently appear in that panel — they're a different kind of thing (a permanent trait, not a countable holding) and have no icon.

## Events Engine

`EVENTS` is the generic occurrence system described in `design.md`. Each entry:

```js
{
  id, eras: ["stone"], sev: "good" | "bad",
  // exactly one of:
  canFire: (S) => boolean,        // deterministic, re-checked & fired repeatedly per tick
  chancePerSecond: number,        // probabilistic, converted to a per-dt roll
  condition: (S) => boolean,      // optional extra gate (e.g. sickness needs pop >= 4)
  counter: { building, reducePerUnit },  // optional negation source
  effect: (S) => { /* mutate state */ },
  flavor: { hit: [...strings], negated: [...strings] },  // negated only used if `counter` present
}
```

`resolveEvents(dt)`, called once per `step()`:

1. Skips events whose `eras` doesn't include `S.era`, or whose `condition` fails.
2. **Deterministic events** (`canFire`): loop-fires the effect repeatedly (guarded at 50 iterations) while the condition holds — this is how population growth can produce several births in one large `dt` (e.g. after offline catch-up).
3. **Probabilistic events** (`chancePerSecond`): one roll per `step()` at the dt-adjusted probability. If it lands, `negateChance(ev)` (`min(1, counterBuildingCount * reducePerUnit)`) gets a second roll; negated events log the `negated` flavor line (always styled `"good"` — averting bad news is good news) and skip the effect entirely, otherwise the effect applies and the `hit` flavor line logs at the event's own `sev`.

`removeSettler()` (used by sickness's effect) is the shared "a person dies" helper: decrements `pop` (floored at 1), then — if that leaves more workers assigned than people alive — pulls the excess back to idle, wood/stone jobs first, food last, so a death never leaves `jobsUsed() > pop` (which would otherwise make `idle()` go negative).

Flavor lines are picked at random from each pool (`pick()`) for light variety across repeat occurrences.

## Progressive Reveal Hints

Distinct from `EVENTS`: `REVEALS` is a list of one-time Chronicle hints (`{id, when, msg}`) checked every tick via `checkReveals()`. These aren't stateful occurrences — they're narration for "you've discovered a new mechanic" (first wood gathered, storage cap first hit, sickness becoming possible at `pop >= 4`). Each fires exactly once, tracked in `S.seen`.

## Rendering

No framework — direct DOM manipulation, with one consistent pattern used everywhere something repeats (job rows, building buy-cards, holdings tiles, queue cards): **create the element once, on first appearance, and update its contents in place on every subsequent render** rather than tearing down and rebuilding. This matters because `renderAll()` runs on every tick (5×/second) — rebuilding via `innerHTML` every tick would both be wasteful and would silently drop event listeners attached to child elements (this was an actual bug caught and fixed earlier in the build, on the construction-progress panel).

Visibility is reveal-driven: panels/rows carry a `hidden` class toggled based on the same reveal logic that gates their existence, so the DOM structure mirrors "what the player has discovered" at all times. Buy-list visibility goes through `isRevealed(def)` rather than calling `def.reveal()` directly — see the sticky-reveal fix under Persistence's "Known fixed bugs."

The Build Queue panel is the one deliberate exception to reveal-gating: it's always present from the very first frame (empty-state message when `S.buildQueue.length === 0`), per design intent — a stable, always-visible anchor rather than something that unravels in.

## Layout & Visual System

`styles.css` implements a fixed-viewport flex grid — `body` is `overflow: hidden` (the page itself never scrolls), and each panel (`.block`) is a flex column with a fixed-position header (`h2`) and a separately-scrolling `.block-body` (`overflow-y: auto`). Panel proportions are set via flex-grow ratios (not percentages, to avoid rounding/gap math): column 1 splits "Your People" / "Construction" 1:2; column 2 currently splits "Settlement" / "Build Queue" / "Upgrades" evenly (1:1:1). Column 2 previously ended in a bare `.spacer` div reserving deliberate blank space for panels that didn't exist yet — removed now that real panels filled it, per `design.md`'s "more boxes will go later."

Color is a small semantic system, not a decorative palette: `--good` (green, genuinely new positive information), `--danger` (red, anything requiring attention), `--milestone` (amber, rare achievement lines), and otherwise everything is a shade of `--ink` on `--bg`. This mapping is enforced at the call site — `log(text, cls)` takes an explicit severity class, never inferred from content.

## Testing Approach

No test framework; verification is a headless Node harness (in the session scratchpad, not checked into the repo) built around `vm.createContext` — it stubs just enough of `document`/`localStorage`/`window` for `game.js` to boot outside a browser, then exercises `step()`, `build()`, `assign()`, `resolveEvents()`, etc. directly, with an exported `__api` object for inspection. This has been the primary correctness check throughout the build (starvation timing, queue escalation math, storage-cap clamping, event negation odds, job-reassignment-on-death safety), with live browser checks reserved for visual/layout verification and DOM-level bugs the headless harness can't see (the beforeunload/save race was actually found via live testing, not the harness).

## Known Limitations

- Holdings tiles show a flat count with no compaction (`1234` renders as literally `1234`) — fine at current scale, flagged in `design.md` as a concern for later, much-larger numbers.
- Upgrades don't appear anywhere once owned except the buy-card itself (relabeled "owned", permanently disabled) and the Chronicle completion line — there's no dedicated "traits you have" surface the way Settlement is for buildings.
- `era` exists on state and is read by the events engine, but nothing ever sets it to anything other than `"stone"` — there is no era-transition system yet.
- `Math.random()` is used directly and unseeded — fine for a prototype, would need revisiting for reproducible testing of rare-event balance.
