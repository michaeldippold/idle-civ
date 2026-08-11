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

`localStorage`, under a single versioned key (`CONFIG.saveKey`, currently `"idleCiv.v6"`). Load uses a defensive merge pattern so the schema can grow additively without a migration step:

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
| `jobs` | `{forager, woodcutter, miner}` | Civilians assigned per gather job |
| `builds` | `{hut, woodshed, granary, stoneYard, dryingRack, lumberCamp, stonePit, infirmary, barracks}` | Completed building counts (repeatable, unless `cap`ped) |
| `units` | `{soldier}` | Trained person-types owned. Separate from `builds` specifically so it renders in Your People, not Settlement |
| `upgrades` | `{[upgradeId]: true}` | One-time upgrades owned; key presence = owned |
| `buildQueue` | `[{id, kind, uid, total, remaining, cost}]` | FIFO queue shared by buildings, upgrades, and units; only index `[0]` progresses. `cost` is the exact price paid, stored for cancel-refunds |
| `buildSeq` | `number` | Monotonic counter for queue item `uid`s (DOM diffing key) |
| `pop` | `number` | Total population, **including** Soldiers — they still eat and occupy housing |
| `bought` | `number` | Total settlers grown via the wanderer event; drives escalating growth cost |
| `era` | `string` | Currently always `"stone"`; gates which `EVENTS` are eligible |
| `seen` | `{[revealId]: true}` | One-time UI reveal hints already shown |
| `dead` | `boolean` | Game-over flag |
| `lastSeed` | `number` | `Date.now()` at last save, used for offline catch-up |

Population is **not** `S.jobs` summed plus idle — a person can now be in one of three states: assigned to a civilian job, idle (civilian, unassigned), or converted to a unit (`S.units.soldier`, permanently outside the job-assignable pool). See Military & Units, below, for the derived-value math that keeps these consistent.

## `step(dt)` — Order of Operations

1. Bail immediately if `S.dead`.
2. Compute `rates()` (production, upkeep, net food).
3. Apply production/upkeep to `res` (scaled by `dt`).
4. Clamp `food`/`wood`/`stone` to their storage caps (`caps()`) — silent; a one-time Chronicle hint covers it via `REVEALS`.
5. Starvation check: if `food <= 0` and net food rate is negative, either halt (`SIM_STOP`, offline) or call `die("starvation")` (live).
6. Advance the front of `buildQueue` by `CONFIG.buildSpeed * dt`; on completion, `shift()` it and call `completeConstruction()`.
7. Call `resolveEvents(dt)` — population growth, sickness, conflict, and anything else on the `EVENTS` list.
8. Wipe-out check: if `S.pop <= 0`, call `die("conflict")`. Unlike starvation this can only happen via Conflict (Sickness floors at 1 survivor by design — see Military & Units), but the check itself is generic rather than attributed to a specific event, since in principle anything could tip population to zero.

## Resource System

- `rates()` returns per-second production for each resource plus `upkeep` (`pop * CONFIG.upkeep`) and `foodNet` (production minus upkeep — the only resource with an upkeep drain).
- `mults()` returns each job's production multiplier: `1 + (boost building count) * CONFIG.buildingBonus + (Stone Tools owned ? CONFIG.stoneToolsBonus : 0)`. Stone Tools is a flat additive term applied to all three, stacking with the per-job boost buildings rather than replacing them.
- `caps()` returns current storage ceilings: `CONFIG.baseFoodCap/baseWoodCap/baseStoneCap + (matching storage building count) * CONFIG.storageAdd`. All three resources are capped now (Stone Yard closed the gap where Stone alone had no ceiling).

## Construction Queue

Buildings are **not** modeled as in-place worker-assignable sites (an earlier version was, and was deliberately simplified away — see `design.md`). One shared FIFO queue (`S.buildQueue`) serves both `BUILDINGS` (repeatable, scaling cost) and `UPGRADES` (one-time, flat cost) — `build(def)`:

1. Computes cost via `buildCost(def)`. For a `kind: "building"` def this scales by `(S.builds[id] + pendingCount(id))` — cost escalates against *owned + already-queued* count, so queuing several of the same building back-to-back doesn't undercut the intended cost curve. For a `kind: "upgrade"` def this is always the flat `base` cost.
2. For upgrades only: refuses if already owned (`S.upgrades[id]`) or already queued (`pendingCount(id) > 0`) — one-time means one-time.
3. Deducts the cost immediately (payment happens at click time, not completion).
4. Pushes `{id, kind, uid, total: buildTime, remaining: buildTime, cost}` onto `S.buildQueue` — `cost` is stored on the item itself (not recomputed later) specifically so `cancelBuild(uid)` can refund exactly what was paid, even though a later-queued item of the same building type may have cost more than an earlier one.

`step()` only ever decrements `S.buildQueue[0].remaining`; everything behind it sits at full `remaining` (and therefore renders at 0% progress) until it becomes the front. `pendingCount(id)` — used for cost escalation, the "already queued" upgrade check, and the buy-menu's "(+N queued)" label — counts matches anywhere in the queue, not just the front. `cancelBuild(uid)` finds the item by `uid`, refunds `item.cost` back into `S.res`, and splices it out — this works identically whether the item is mid-construction (index `0`) or still waiting, since cancelling index `0` simply promotes index `1` to the front on the next tick with no special-casing needed.

## Buildings & Upgrades

`BUILDINGS` is a flat data array; each entry has `id`, `name`, `kind: "building"`, `desc`, `base` cost, `scale` (per-owned-unit cost multiplier), `buildTime` (seconds once at the front of the queue), and `reveal()` — a predicate deciding whether the buy-card exists yet (see `isRevealed()` below for how this is made sticky). This is the mechanism behind "the interface unravels": a card is created in the DOM the first time it reveals and never removed.

`UPGRADES` is the same shape minus `scale` (flat cost, never repeats) and tagged `kind: "upgrade"`. `UNITS` (see Units & Military, below) is a third array, `kind: "unit"`, also flat-cost. `defById(id)` searches all three arrays, so the rest of the engine (`completeConstruction`, `renderQueue`, `cancelBuild`) never needs to know or care which list a queued item came from — it branches on `def.kind` only where they genuinely differ: `buildCost()` scales only for `kind: "building"` (everything else is flat), and completion writes to a different bucket per kind (`S.builds[id]++` / `S.upgrades[id] = true` / `S.units[id]++`).

Buildings may also carry an optional `cap` (e.g. Barracks: `cap: 1`). Once `(S.builds[id] || 0) + pendingCount(id) >= cap`, the card is disabled and shows "Maxed" in place of a cost — same visual slot Upgrades already use for "owned". `build()` itself also refuses a capped purchase (not just the UI), so this is enforced at the data layer, not just rendering.

`BUILDING_ICONS` maps each building id to a small inline `<svg>` line-art doodle (stroke-only, `currentColor`, no fill except two intentional dot accents on Stone Pit) — used in the Settlement/holdings panel so owned buildings are visually distinct tiles, not just numbers in the buy menu. Upgrades don't currently appear in that panel — they're a different kind of thing (a permanent trait, not a countable holding) and have no icon. `PERSON_ICONS` is the equivalent map for person-types (Settler, Soldier), used by Your People's tiles the same way.

## Units & Military

`UNITS` (currently just Soldier) is a third buildable-defs array. Unlike `BUILDINGS`/`UPGRADES`, a unit def carries `popCost` — the number of civilians it permanently consumes. This changes the derived-value math for population:

```js
function civilians()   { return S.pop - Object.values(S.units).reduce((a, b) => a + b, 0); }
function reserved()    { return S.buildQueue.reduce((sum, q) => sum + (defById(q.id).popCost || 0), 0); }
function jobsUsed()    { return S.jobs.forager + S.jobs.woodcutter + S.jobs.miner; }
function idle()        { return civilians() - jobsUsed() - reserved(); }
```

`civilians()` excludes anyone already converted to a unit. `reserved()` sums `popCost` across the **entire queue**, front and waiting alike — a civilian is pulled out of the available pool the instant a unit order is queued (matching "it takes one civ out, runs a progress bar, then you get a soldier"), not when it completes. `build()` checks `idle() >= (def.popCost || 0)` alongside the normal resource-affordability check, so recruiting competes directly with job assignment for the same pool. On completion, `completeConstruction()` writes to `S.units[id]` rather than `S.builds[id]` — the civilian was already subtracted via `reserved()` while queued, and now permanently exits `civilians()` via `S.units` instead of returning to the idle pool.

A unit's ongoing food upkeep needs no new code — `S.pop` already includes units, and `rates()`'s upkeep line is just `S.pop * CONFIG.upkeep`.

`removeSoldier()` is the "a Soldier dies" helper (used by Conflict): decrements both `S.units.soldier` and `S.pop` together (the person is gone entirely, not reassigned — contrast with `removeSettler()`, which keeps the person's death within the civilian/job-reassignment system).

### Conflict

Conflict doesn't fit the generic `chancePerSecond` + single `counter` shape Sickness uses — it needs its own population-scaled trigger chance, a variable raid size, a two-stage outcome (repel check, then a consequence roll), and outcome-dependent flavor text. Rather than contort the generic shape, `EVENTS` entries may define `resolve(S, dt)` instead of `canFire`/`chancePerSecond` — a full escape hatch that owns its own trigger roll and effect application; `resolveEvents()` just calls it every tick if present. This is a generic engine change (any future event with this much internal complexity can use the same escape hatch), not a Conflict-specific special case.

Conflict's `resolve()`:

1. **Trigger** — `chance = CONFIG.conflictBaseChance * (1 + S.pop * CONFIG.conflictPopScale)`, converted to a per-`dt` roll the same way Sickness's flat chance is. Frequency scales continuously with population (a bigger settlement is a bigger target), rather than Sickness's one-time threshold gate. Also gated behind `S.pop >= 4`, matching Sickness's early grace period.
2. **Raid size** — a weighted random pick from `RAID_SIZES` (small/common, large/rare), independent of everything else. This is what makes a raid "sometimes 2 scouts, sometimes 10."
3. **Defense** — `militaryStrength() = (S.units.soldier || 0) * weaponMultiplier()`, where `weaponMultiplier()` is `1.6` if the Flint-Tipped Spears upgrade is owned, else `1.0`. Zero Soldiers means zero defense, full stop.
4. **Repel check** — `repelChance = defense / (defense + raidSize)`. A ratio, not a threshold: always some chance either way, more investment always shifts the odds, nothing ever reaches exactly 0% or 100%.
5. **Consequences**, banded by outcome:
   - **Repelled, clean** — no losses.
   - **Repelled, costly** — rolled separately (`raidSize / (defense + raidSize)`, softened by the Hide Armor upgrade); if it lands, one Soldier is lost (`removeSoldier()`).
   - **Raid succeeds** — `1 + floor(raidSize / 5)` Soldiers lost (capped at however many exist), a fraction of current resource stockpiles stolen (`stealResources()`, fraction scales with raid size, capped at 50%), and — only if defense was especially thin relative to the raid (roughly `defense < raidSize / 2`, including the `defense === 0` case) — one civilian lost via `removeSettler(true)`.

`removeSettler()` takes an optional `allowZero` param (default `false`, used by Sickness, which floors at 1 survivor by design) — Conflict passes `true`, since it's the one hazard allowed to end a run outright (see `design.md`, Failure). The generic `S.pop <= 0` check in `step()` is what actually ends the game in that case, not Conflict itself — keeping "what happens when population hits zero" in one place regardless of cause.

## Events Engine

`EVENTS` is the generic occurrence system described in `design.md`. Each entry:

```js
{
  id, eras: ["stone"], sev: "good" | "bad",
  // exactly one of:
  canFire: (S) => boolean,        // deterministic, re-checked & fired repeatedly per tick
  chancePerSecond: number,        // probabilistic, converted to a per-dt roll
  resolve: (S, dt) => { ... },    // full escape hatch -- owns its own trigger + effect + flavor
  condition: (S) => boolean,      // optional extra gate (e.g. sickness needs pop >= 4)
  counter: { building, reducePerUnit },  // optional negation source; reducePerUnit may be
                                          // a flat number or (S) => number, for counters whose
                                          // own strength is itself upgradeable (Herbal Medicine)
  effect: (S) => { /* mutate state */ },
  flavor: { hit: [...strings], negated: [...strings] },  // negated only used if `counter` present
}
```

`resolveEvents(dt)`, called once per `step()`:

1. Skips events whose `eras` doesn't include `S.era`, or whose `condition` fails.
2. **`resolve`-based events** (Conflict, currently the only one): called directly with `(S, dt)` and left entirely to their own devices — no generic trigger roll, negation, or flavor logging happens around them. See Units & Military for Conflict's specific algorithm.
3. **Deterministic events** (`canFire`): loop-fires the effect repeatedly (guarded at 50 iterations) while the condition holds — this is how population growth can produce several births in one large `dt` (e.g. after offline catch-up).
4. **Probabilistic events** (`chancePerSecond`): one roll per `step()` at the dt-adjusted probability. If it lands, `negateChance(ev)` (`min(1, counterBuildingCount * reducePerUnit)`) gets a second roll; negated events log the `negated` flavor line (always styled `"good"` — averting bad news is good news) and skip the effect entirely, otherwise the effect applies and the `hit` flavor line logs at the event's own `sev`.

`removeSettler(allowZero = false)` (used by Sickness's effect, and by Conflict's civilian-casualty case with `allowZero: true`) is the shared "a civilian dies" helper: decrements `pop` (floored at 1 unless `allowZero`), then — if that leaves more workers assigned than people alive — pulls the excess back to idle, wood/stone jobs first, food last, so a death never leaves `jobsUsed() > civilians()` (which would otherwise make `idle()` go negative). Contrast with `removeSoldier()` (Units & Military), which removes a unit rather than a civilian and needs no job-reassignment since units were never in `S.jobs`.

Flavor lines are picked at random from each pool (`pick()`) for light variety across repeat occurrences.

**Great Hunt** and **Trader** are the first positive-only entries using the plain `chancePerSecond` + `effect` shape (no `counter`, no `condition`, no `resolve`) — proof the generic shape was never inherently hazard-specific, it just happened to only have hazards using it until now. Both just add resources in `effect()` and log a `"good"`-severity `flavor.hit` line; the negation branch in `resolveEvents()` is skipped automatically since `negateChance()` returns `0` when `ev.counter` is absent.

## Progressive Reveal Hints

Distinct from `EVENTS`: `REVEALS` is a list of one-time Chronicle hints (`{id, when, msg}`) checked every tick via `checkReveals()`. These aren't stateful occurrences — they're narration for "you've discovered a new mechanic" (first wood gathered, storage cap first hit, sickness becoming possible at `pop >= 4`). Each fires exactly once, tracked in `S.seen`.

## Rendering

No framework — direct DOM manipulation, with one consistent pattern used everywhere something repeats (job rows, building buy-cards, holdings tiles, queue cards): **create the element once, on first appearance, and update its contents in place on every subsequent render** rather than tearing down and rebuilding. This matters because `renderAll()` runs on every tick (5×/second) — rebuilding via `innerHTML` every tick would both be wasteful and would silently drop event listeners attached to child elements (this was an actual bug caught and fixed earlier in the build, on the construction-progress panel).

Visibility is reveal-driven: panels/rows carry a `hidden` class toggled based on the same reveal logic that gates their existence, so the DOM structure mirrors "what the player has discovered" at all times. Buy-list visibility goes through `isRevealed(def)` rather than calling `def.reveal()` directly — see the sticky-reveal fix under Persistence's "Known fixed bugs."

The Build Queue panel follows the same reveal-then-sticky pattern as everything else, just gated on usage rather than a resource/building threshold: hidden until `S.buildQueue.length > 0` is true for the first time (`renderQueue()` sets `S.seen.queueUsed = true` at that point), then permanently visible after — showing the empty-state message on any later stretch where the queue happens to be empty again, rather than disappearing. This was changed from an original "always present from frame 1" design (a deliberate exception to reveal-gating at the time) once live play showed an empty Build Queue and empty Settlement/Construction/Upgrades sitting there before anything had happened read as more cluttered than intentional — two clean columns (Your People, Chronicle) at the very start reads better than three mostly-empty ones.

**Your People** renders person-type tiles (Settler, Soldier) the same create-once-update-in-place way Settlement renders building tiles — reusing the `.holding` visual style, but living in a different panel and a different state bucket (`S.units`, not `S.builds`), since "who your people are" and "what you've built" are deliberately kept as separate questions (see `design.md`). Settler count shown is `civilians()`, not `S.pop` — Soldiers get their own tile instead of being folded into the total.

**Dynamic row-span**: a top-row panel can visually expand to fill its whole grid column (both rows) when its paired bottom-row panel has nothing revealed yet, rather than leaving an unexplained blank grid cell. This is driven by the same reveal-state check already used for `hidden` toggling, just applied to a `.span-both` class instead: `panel-village` gets it when no `UNITS` entry `isRevealed`, `panel-holdings` when no `BUILDINGS` entry `isRevealed`, `panel-queue` when no `UPGRADES` entry `isRevealed`. In practice Settlement/Construction rarely shows this state (Hut reveals almost immediately) and Build Queue/Upgrades essentially never does (Stone Tools reveals at `wood >= 5`, strictly before anything else in the game can possibly be queued, so Upgrades is guaranteed visible by the time Build Queue itself first appears) — but Your People/Training does for a real stretch of early play, since Barracks is a mid-game unlock. Applying the rule to all three uniformly, rather than special-casing just the one panel where it visibly matters, is what makes it cheap insurance rather than one-off code.

## Layout & Visual System

`styles.css` implements a fixed-viewport **CSS Grid** — `body` is `overflow: hidden` (the page itself never scrolls). `#mainArea` is `display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: 1fr 2fr;` (roster row smaller, action row larger, tunable) — seven `.block` panels are placed explicitly by `grid-column`/`grid-row`:

```
Your People   | Settlement  | Build Queue | Chronicle
Training      | Construction| Upgrades    | (spans both rows)
```

Each `.block` is still internally a flex column with a fixed-position header (`h2`) and a separately-scrolling `.block-body` (`overflow-y: auto`) — the grid only controls placement between panels, not what happens inside one. `panel-log` (Chronicle) sets `grid-row: 1 / 3` to span both rows in its column. The `.span-both` class (see Rendering, above) overrides a roster panel's own `grid-row` the same way, when its paired panel is empty.

This replaced an earlier nested-flex-columns layout (fixed 25%-width Chronicle + two asymmetric flex columns) that couldn't cleanly express "two independent stacked panels per column, four equal columns" without either duplicating flex-ratio logic per column or accepting mismatched proportions — real CSS Grid does this natively.

Color is a small semantic system, not a decorative palette: `--good` (green, genuinely new positive information), `--danger` (red, anything requiring attention), `--milestone` (amber, rare achievement lines), and otherwise everything is a shade of `--ink` on `--bg`. This mapping is enforced at the call site — `log(text, cls)` takes an explicit severity class, never inferred from content.

`log()` prepends rather than appends, so the newest Chronicle line is always the first child (top of the panel, no scrolling needed) and `el.scrollTop = 0` keeps it in view even if the panel was scrolled elsewhere. The 60-entry trim accordingly removes from `lastChild` (the oldest) rather than `firstChild`. Exactly one entry ever carries the `.latest` class (a few px larger, no color change) — handed off from whichever entry had it to the new one on every call, so "what just happened" is always visually obvious without reading text.

## Testing Approach

No test framework; verification is a headless Node harness (in the session scratchpad, not checked into the repo) built around `vm.createContext` — it stubs just enough of `document`/`localStorage`/`window` for `game.js` to boot outside a browser, then exercises `step()`, `build()`, `assign()`, `resolveEvents()`, etc. directly, with an exported `__api` object for inspection. This has been the primary correctness check throughout the build (starvation timing, queue escalation math, storage-cap clamping, event negation odds, job-reassignment-on-death safety), with live browser checks reserved for visual/layout verification and DOM-level bugs the headless harness can't see (the beforeunload/save race was actually found via live testing, not the harness).

## Known Limitations

- Conflict's numbers (`conflictBaseChance`, `conflictPopScale`, raid-size weights, the `repelChance` ratio, casualty/theft fractions) are first-guess, same as the rest of `CONFIG` — expect these to move once the system is actually played against.
- Holdings tiles show a flat count with no compaction (`1234` renders as literally `1234`) — fine at current scale, flagged in `design.md` as a concern for later, much-larger numbers.
- Upgrades don't appear anywhere once owned except the buy-card itself (relabeled "owned", permanently disabled) and the Chronicle completion line — there's no dedicated "traits you have" surface the way Settlement is for buildings.
- `era` exists on state and is read by the events engine, but nothing ever sets it to anything other than `"stone"` — there is no era-transition system yet.
- `Math.random()` is used directly and unseeded — fine for a prototype, would need revisiting for reproducible testing of rare-event balance.
