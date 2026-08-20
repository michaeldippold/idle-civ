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

## Modals

One modal at a time, centered over a 30%-black fixed overlay. Deliberately minimal: **no dragging, resizing, or minimizing** — the panel sizes to its content up to a `max-height`, past which its `.block-body` scrolls internally like any other panel. It reuses the `.block` shell so it matches the board visually for free. Dismiss via the header ×, a click on the dim backdrop, or Escape; clicks *inside* the panel are checked against `e.target.id === "modalOverlay"` so they don't bubble up and close it.

`openModal(title, bodyHTML, actions, onMount)` is the whole API. `actions` renders a button row along the bottom edge; `onMount` runs after `innerHTML` is set, which is how the Info panel attaches its tab listeners (they can't be bound before the markup exists). Opening a modal never pauses the game — the only apparent exception is game over, and that's incidental: death already stops the loop on its own.

**Gotcha, found in live play:** `body.dead .block { opacity: .7 }` was intended to dim the board on death, but the modal panel is also a `.block`, so the game-over modal — which by definition only ever appears while dead — rendered semi-transparent. The rule is now scoped to `body.dead #mainArea .block`. Anything else styling `.block` broadly needs the same consideration.

**Era advancement** announces itself in a modal too (no action buttons — dismiss normally). `ERA_TRANSITIONS[era]` hand-authors the flavor lead and a "What changed" list; `changes` may be a function receiving a snapshot taken *before* the flip, which is how the housing line quotes real before/after numbers. The "Now available" list underneath is **derived** from defs whose `defEra` matches the new era, so it can't go stale as content is added. A single milestone line still goes to the Chronicle. `advanceEra()` stays silent under `SIM`, so an era crossed during offline catch-up is reported by `simulateOffline()`'s summary rather than firing a modal the instant the page loads.

**Reset** confirms through the same modal rather than a native `confirm()` — consistent styling, and native dialogs are outright suppressed in some environments (they were being swallowed in the dev browser pane, which is how this surfaced). Its destructive button carries a `danger: true` flag that renders it in the warning red, and the copy quotes the run's playtime so the consequence is concrete. Cancel, Escape, and a backdrop click are all equivalent and all provably non-destructive. Both this and the game-over "Try Again" call a shared `hardReset()`, which was previously duplicated inline in two places — it must unregister the `beforeunload` handler *before* clearing, or the reload it triggers fires `save()` and immediately rewrites the save being deleted.

**Game over** moved out of the Chronicle and into a modal: a cause-specific narrative line, run stats (time survived, age reached, buildings raised, settlers grown — the playtime clock is what made this worth showing), and a **Try Again** button that clears the save and reloads. A single terse line still goes to the Chronicle so the settlement's own record ends with its ending.

**The Info panel** is a reference of every building, unit, and upgrade, grouped by era behind tabs. It deliberately shows *all* content regardless of what the player has revealed — it's a reference, and hiding things would defeat its purpose. That's a real tension with the "unravel, don't dump" principle and a deliberate exception to it, not an oversight.

Two things the Info panel forced into existence, both generally useful:
- `displayName(def, era)` / `displayDesc(def, era)` take an optional era, so the Bronze tab reads with Bronze names even while you're still in the Stone Age.
- **`availableInEra(def, era)`** — a def's `era` field marks where it's *introduced*, and availability runs from there forward, because most things persist once introduced (a Hut is still there in Bronze, just displayed as "Stone House"). Filtering on `defEra(def) === era` instead was the first implementation and was wrong: it left the Bronze tab nearly empty, since a reference should answer "what exists in this era," not "what debuted in it." An optional `untilEra` retires a def after a given age — currently only used by age capstones (the Bronze Age upgrade is meaningless once you're in Bronze). *Both `era` and `untilEra` dissolve under the planned manifest architecture — "what exists in era E" becomes a direct manifest lookup.*

## Pause & the Playtime Clock

**Pause** is a module-level `let paused`, deliberately *not* part of `S`. It's UI state, not game state — keeping it out of the save means no schema change and no loading into a frozen game wondering why nothing is happening. The tick loop skips `step()` while paused but still runs its `last = now` bookkeeping. That last detail is the whole trick: if `last` froze along with the simulation, `dt` would accumulate across the entire pause and then be handed back (clamped to 2s) the instant you resumed, silently gifting production for time that was supposed to be frozen. Verified in a live browser test — a 9-second pause produces zero `step()` calls and resumes on a normal 0.202s tick.

Interactions stay enabled while paused (reassigning jobs, queuing builds). There's no exploit available — nothing progresses and nothing accrues — and being able to plan while frozen is most of the point. Autosave also deliberately keeps running: it refreshes `lastSeed`, so time spent paused is never later mistaken for offline time. Pausing is intentionally *not* logged to the Chronicle; that log is the settlement's memory, not a record of the player's UI actions, and the paused state is already unmissable on screen.

**The playtime clock** (`S.playtime`, seconds) is incremented inside `step()` rather than in the tick loop, so it measures exactly one thing: how far the world actually moved. That placement gets three behaviors for free — it freezes when paused (no `step()` calls), it counts the hours that offline catch-up simulates (which repeatedly calls `step()`), and it stops at death (`step()`'s early return). `die()` ends with a final `renderAll()` so the run's total time stays on screen after the loop stops.

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
- `reveal()` conditions based on a resource *threshold* (Woodshed, Granary, and by extension anything gated only by `hut > 0` before the hut actually completes) were re-evaluated fresh every render with no memory — a resource dipping back below its threshold (e.g. spending wood on the very building that revealed the panel) could make the *entire panel* disappear mid-game, including panels with an actively-building queue item behind them. Fixed with `isRevealed(def)`, which caches the first true result in `S.seen["rev:" + id]` — reveals are now permanently sticky, consistent with how every other reveal in the game already behaves (resource rows, Chronicle hints).

## State Shape

The entire simulation lives in one module-level object, `S` (see `freshState()` for the authoritative shape):

| Field | Type | Purpose |
|---|---|---|
| `res` | one key per resource id (all eras) | Current resource stockpiles |
| `jobs` | one key per job id (all eras) | Civilians assigned per gather job |
| `builds` | one key per building id (all eras) | Completed building counts (repeatable, unless `cap`ped) |
| `units` | `{soldier, archer, horseman}` | Trained person-types owned. Separate from `builds` specifically so it renders in Your People, not Settlement |
| `upgrades` | `{[upgradeId]: true}` | One-time upgrades owned; key presence = owned |
| `buildQueue` | `[{id, kind, uid, total, remaining, cost}]` | FIFO queue shared by buildings, upgrades, and units; only index `[0]` progresses. `cost` is the exact price paid, stored for cancel-refunds |
| `buildSeq` | `number` | Monotonic counter for queue item `uid`s (DOM diffing key) |
| `pop` | `number` | Total population, **including** trained units — they still eat and occupy housing |
| `growth` | `number` | Seconds accrued toward the next free settler; freezes (not resets) while housing is full |
| `bought` | `number` | Lifetime settlers grown — a stat for the game-over screen only (it once drove the settler cost curve; that role is gone) |
| `era` | `string` | `"stone"` or `"bronze"` — the key into `MANIFESTS`; the whole era system is this one string |
| `eraHistory` | `{[era]: snapshot}` | Frozen pre-transition snapshot of `S` (minus itself), archived by `advanceEra()`; migration formulas read it, humans debug with it |
| `playtime` | `number` | Seconds the simulation has actually advanced (frozen while paused) |
| `seen` | `{[revealId]: true}` | One-time UI reveal hints already shown |
| `dead` | `boolean` | Game-over flag |
| `lastSeed` | `number` | `Date.now()` at last save, used for offline catch-up |

Population is **not** `S.jobs` summed plus idle — a person can now be in one of three states: assigned to a civilian job, idle (civilian, unassigned), or converted to a unit (`S.units.soldier`, permanently outside the job-assignable pool). See Military & Units, below, for the derived-value math that keeps these consistent.

## `step(dt)` — Order of Operations

1. Bail immediately if `S.dead`.
2. Advance `S.playtime` by `dt` (see Pause & the Playtime Clock).
3. Compute `rates()` (production, upkeep, net food).
4. Apply production/upkeep to every resource in `active().resources` (scaled by `dt`).
5. Run `runConverters(dt)` — the Forge and anything else with a `converts` spec.
6. Clamp every resource to its storage cap (`caps()`) — silent; a one-time Chronicle hint covers it.
7. Starvation check: if `food <= 0` and net food rate is negative, either halt (`SIM_STOP`, offline) or call `die("starvation")` (live).
8. Advance the front of `buildQueue` by `CONFIG.buildSpeed * dt`; on completion, `shift()` it and call `completeConstruction()`.
9. Call `accrueGrowth(dt)` — a free settler every `CONFIG.settlerIntervalSeconds` while housing has room. Progress **freezes** (not resets) while housing is full, so a partially-waited arrival lands soon after a new hut. Settlers cost nothing; growth is a background process, deliberately not an event (see `design.md`). Placement inside `step()` means offline catch-up grows population with no extra code.
10. Call `resolveEvents(dt)` — sickness, conflict, windfalls: whatever the active manifest's events slate holds.
11. Wipe-out check: if `S.pop <= 0`, call `die("conflict")`. Unlike starvation this can only happen via Conflict (Sickness floors at 1 survivor by design — see Military & Units), but the check itself is generic rather than attributed to a specific event, since in principle anything could tip population to zero.

## Resource System

All three iterate the active manifest's `resources` / `jobs` lists (`active().resources`, `active().jobs`) rather than naming resources individually — see "Table-driven resources and jobs" below.

- `rates()` returns gross per-second production for every resource plus `upkeep` (`pop * CONFIG.upkeep`) and `foodNet` (production minus upkeep — food is the only resource with an upkeep drain). Converter consumption is *not* netted in here.
- `mults()` returns each resource's production multiplier: `1 + (boost building count) * CONFIG.buildingBonus + tool bonuses`. Tool upgrades (Stone Tools, Bronze Tools) are flat additive terms applied to every resource and stack with each other and with the per-resource boost buildings.
- `caps()` returns current storage ceilings from each resource's `baseCap` plus `(its capBuilding count) * CONFIG.storageAdd`. Every resource is capped; bronze simply has no `capBuilding`, so it sits at its (generous) base forever.

## Construction Queue

Buildings are **not** modeled as in-place worker-assignable sites (an earlier version was, and was deliberately simplified away — see `design.md`). One shared FIFO queue (`S.buildQueue`) serves both `BUILDINGS` (repeatable, scaling cost) and `UPGRADES` (one-time, flat cost) — `build(def)`:

1. Computes cost via `buildCost(def)`. For a `kind: "building"` def this scales by `(S.builds[id] + pendingCount(id))` — cost escalates against *owned + already-queued* count, so queuing several of the same building back-to-back doesn't undercut the intended cost curve. For a `kind: "upgrade"` def this is always the flat `base` cost.
2. For upgrades only: refuses if already owned (`S.upgrades[id]`) or already queued (`pendingCount(id) > 0`) — one-time means one-time.
3. Deducts the cost immediately (payment happens at click time, not completion).
4. Pushes `{id, kind, uid, total: buildTime, remaining: buildTime, cost}` onto `S.buildQueue` — `cost` is stored on the item itself (not recomputed later) specifically so `cancelBuild(uid)` can refund exactly what was paid, even though a later-queued item of the same building type may have cost more than an earlier one.

`step()` only ever decrements `S.buildQueue[0].remaining`; everything behind it sits at full `remaining` (and therefore renders at 0% progress) until it becomes the front. `pendingCount(id)` — used for cost escalation, the "already queued" upgrade check, and the buy-menu's "(+N queued)" label — counts matches anywhere in the queue, not just the front. `cancelBuild(uid)` finds the item by `uid`, refunds `item.cost` back into `S.res`, and splices it out — this works identically whether the item is mid-construction (index `0`) or still waiting, since cancelling index `0` simply promotes index `1` to the front on the next tick with no special-casing needed.

## Buildings & Upgrades

The active manifest's `buildings` is a flat data array; each entry has `id`, `name`, `kind: "building"`, `desc`, `base` cost, `scale` (per-owned-unit cost multiplier), `buildTime` (seconds once at the front of the queue), and `reveal()` — a predicate deciding whether the buy-card exists yet (see `isRevealed()` below for how this is made sticky). This is the mechanism behind "the interface unravels": a card is created in the DOM the first time it reveals and never removed.

`upgrades` is the same shape minus `scale` (flat cost, never repeats) and tagged `kind: "upgrade"`. `units` (see Units & Military, below) is a third list, `kind: "unit"`, also flat-cost. `defById(id)` searches all three lists of the **active manifest** first — that's what gives a log line or queue card its era-correct name — falling back to `DEF_INDEX` (latest-era def per id, built at compile) for ids that can outlive their era, like the capstone finishing at the very moment it retires itself. The rest of the engine (`completeConstruction`, `renderQueue`, `cancelBuild`) never needs to know or care which list a queued item came from — it branches on `def.kind` only where they genuinely differ: `buildCost()` scales only for `kind: "building"` (everything else is flat), and completion writes to a different bucket per kind (`S.builds[id]++` / `S.upgrades[id] = true` / `S.units[id]++`).

Buildings may also carry an optional `cap` (e.g. Barracks: `cap: 1`). Once `(S.builds[id] || 0) + pendingCount(id) >= cap`, the card is disabled and shows "Maxed" in place of a cost — same visual slot Upgrades already use for "owned". `build()` itself also refuses a capped purchase (not just the UI), so this is enforced at the data layer, not just rendering.

`BUILDING_ICONS` maps each building id to a small inline `<svg>` line-art doodle (stroke-only, `currentColor`, no fill except two intentional dot accents on Stone Pit) — used in the Settlement/holdings panel so owned buildings are visually distinct tiles, not just numbers in the buy menu. Upgrades don't currently appear in that panel — they're a different kind of thing (a permanent trait, not a countable holding) and have no icon. `PERSON_ICONS` is the equivalent map for person-types (Settler, Soldier), used by Your People's tiles the same way.

## Eras: The Manifest Model (Phase A — implemented)

Design rationale in `design.md` (*The Era Manifest Model*); the settled contract's Phase B/C remainder is under Settled But Not Yet Built. What runs today:

**Authoring.** `STONE` is a full base manifest: `name`, `housingPerHut`, `panelTitles`, `raidTypes`, the five def categories (`resources`, `jobs`, `buildings`, `upgrades`, `units`), and two slates (`events`, `hints`) naming entries in the id-keyed `EVENT_LIB` / `HINT_LIB` libraries. `BRONZE_DELTA` is authored as a **delta**: `remove` (the capstone), `override` (hut → Stone House, infirmary → Infirmary, herbalMedicine desc), `add` (per-category lists of new defs), fresh slates, and any era-scoped scalars it changes. Reading the delta *is* reading the era's design.

**Compilation.** `compileBase(STONE)` + `extendEra(parent, delta)` run at load into `MANIFESTS = { stone, bronze }`. Every def is shallow-copied, so an override can never mutate the parent era's copy. The compiler **throws** on: remove/override targets missing from the parent, duplicate `add` ids, a missing `events`/`hints` slate, and unknown slate ids — at load, before a frame renders. Silent wrongness from a dangling id is this game's signature bug class; the compiler converts it into a loud one. (Phase B adds the full cross-reference validator on top.)

**The indirection.** `active()` returns `MANIFESTS[S.era]`; every engine and render read of content goes through it — rates, caps, converters, events, hints, combat math, all seven render functions. Nothing outside the active manifest renders, produces, fires, or can be purchased. The engine never consults `S.era` for content decisions; `S.era` is nothing more than the key into `MANIFESTS`, so `advanceEra()` swaps the entire world in one assignment. `DEF_INDEX` (latest-era def per buildable id) backs `defById()` for ids referenced across an era boundary.

**What dissolved.** The old per-era scatter — `names`/`descs` maps, `era`/`untilEra` tags, `eras` allowlists on events, `ERA_NAMES`, `HOUSING_PER_HUT`, `PANEL_TITLES`, `RELEASE_ORDER`, `displayName()`/`displayDesc()`/`defEra()`/`availableInEra()`, and every `S.era === "bronze"` check inside `reveal()` predicates — is gone. Defs carry their era-correct `name`/`desc` directly; renderers read `def.name`. Era-gating a def now means *membership*: bronze content isn't hidden in stone, it doesn't exist there. In-era immediate reveals are `reveal: () => true`.

**Slates never inherit.** Each era declares its complete `events` and `hints` lists even in delta form — a forgotten event is a loud authoring decision, not a silent omission. (The old `eras`-allowlist model once silently stopped events firing after a flip; the harness now asserts slate membership per era instead.) Hints that used to carry `S.era` checks (`rotOre`, `bronzeAvailable`) are gated purely by slate membership.

**Era-varying values.** `housingPerHut()`, panel titles, and the age-badge name read `active()`. The Info panel iterates `ERA_ORDER` and reads each era's compiled manifest directly, so the Bronze tab shows Bronze names while you're still in Stone. The era modal is **fully diff-derived** (see The Era Transition, below): only the flavor lead is hand-authored in `ERA_TRANSITIONS`.

Two rendering gotchas that predate manifests and still apply:
- **Anything era-dependent must be re-rendered, not written once at creation.** `renderTile()` once baked the name in at tile creation, leaving "Medicine Tent" on the Settlement tile after the flip. Name spans get rewritten every render.
- **Prose that names a building goes stale too.** Herbal Medicine's desc is overridden in the bronze delta; Sickness's flavor was reworded era-neutral ("your healers") instead, since era-keying flavor arrays is more machinery than the problem deserves.

**The capstone Upgrade.** Advancing is an ordinary upgrade (`id: "bronzeAge"`) in the stone manifest, inheriting the queue, cost check, build timer, cancel-and-refund, and "owned" state for free — and the bronze delta **removes** it: a capstone exists only in the era it ends. `reveal: () => S.pop >= 10 && (S.units.soldier || 0) >= 1` reads *current* soldier count rather than an "ever trained" flag, because sticky reveals already handle the case where every soldier later dies. Completing it calls `advanceEra("bronze")`, the only place `S.era` is ever assigned. Because it sits in the normal queue, Sickness and Conflict keep resolving throughout its long build — the design's intended source of "and some luck." `advanceEra()` captures its `before` snapshot (for the modal's housing line) while the old manifest is still active, and is silent under `SIM`; if an era flips during offline catch-up, `simulateOffline()` announces it separately so the milestone isn't swallowed.

**Semantics sharpened by `active()`** (all unreachable in normal play, now uniform by construction): stone-era `stealResources()` only touches stone-era resources; `releaseOrder()`/`jobsUsed()` cover exactly the era's jobs; combat iterates the era's units. A unit type with a nonzero count but no manifest entry neither fights nor dies — inert state, per the settled invariant that state is never implicitly destroyed.

**The validator (Phase B).** `validateManifests(MANIFESTS)` runs at load, immediately after compilation, and throws with a full problem list on any within-era dangling reference: cost keys, `converts.in`/`out` keys and `job.res` against that era's resources; `capBuilding` and `BOOST_BUILDING` targets and event `counter.building` against that era's buildings; unit `counters` against that era's raid types; plus def-shape checks (`id`/`name`/`kind`/`reveal()`) and migration-instruction sanity (known bucket, at least one primitive). This is what makes *removal* safe to author: retire a resource, and everything still mentioning it becomes a load-time error instead of NaN production or a converter that silently never runs. Honest limit, unchanged: `reveal()` predicates are arbitrary code — a stale reference there yields a card that never appears, but cannot break the economy.

**The Era Transition (Phase B).** `advanceEra(era)` is the whole machine, in deliberate order: capture `before` values and a frozen deep-copy **snapshot** while the old manifest is still active → archive it in `S.eraHistory[fromEra]` (kept for every era, forever — a few hundred bytes each, and the raw material for diagnosing or recovering a bad migration, the project's first genuinely destructive state change; snapshots exclude `eraHistory` itself so they never nest) → flip `S.era` → `runEraMigrations()` → `purgeDom()` → `reconcileWorkforce()` → announce (modal live, summary line under `SIM`).

`runEraMigrations(fromM, toM, snapshot)` applies one built-in default — workers assigned to a job that left the manifest return to idle, with a Chronicle line — then the entering era's `migrations` list (authored on the delta, never inherited): `{bucket, id, vanish}` zeroes state (deletes for `upgrades`), `{bucket, id, convertTo, ratio?}` moves it within the bucket (floored), `{bucket, id, fn}` computes a fresh value. **Formulas read only the frozen snapshot and write only live state**, so instruction order cannot matter by construction — the harness proves it with an `fn` that reads a value an earlier instruction already vanished. Everything else carries implicitly; state under departed ids stays inert, never deleted. Narrate lines log even under `SIM` — an era transition is rare enough that its story belongs in the Chronicle even when it happened while you were away. (Stone→bronze declares zero migrations; the machinery's first real consumer is the Iron Age.)

`purgeDom(fromM, toM)` removes the DOM nodes (`bcard-`, `hold-`, `ptile-`, `job-`, `res-` prefixed) of every id that didn't survive the hop — the one place content ever leaves the screen; "nothing can un-reveal" holds everywhere except an era boundary. Runs under `SIM` too, since the page's DOM exists during offline catch-up. Renderers only create nodes for manifest members, so a purged id stays gone. Today its only live effect is removing the completed capstone's card.

`manifestDiff(fromM, toM)` computes `{added, removed, renamed}` across buildings/units/upgrades — one diff, two consumers: the purge logic mirrors it, and the era modal derives **everything but the flavor lead** from it: "What changed" (renames as "The Hut is now the Stone House.", the housing rise, panel-title shifts, plus new-resource and new-job summary lines, since those have no buy-card to announce themselves), "Now available" (added defs with descs), and "No longer needed" (removed defs). `ERA_TRANSITIONS` now holds only each era's `lead` sentence — the hand-maintained change list is gone and cannot go stale.

### Table-driven resources and jobs

Adding three resources once forced a refactor: `rates()`, `mults()`, `caps()`, `step()`'s clamp loop, `jobsUsed()`, `removeSettler()` and the resource-bar markup each hardcoded exactly three resources by name. All of them now iterate the active manifest's lists:

- **`resources`** — `{ id, name, baseCap, capBuilding, reveal? }`. `capBuilding: null` means no storage building exists for it (bronze). Ledger rows are *generated* from this at render time rather than written into `index.html`, so a new resource needs no markup change. In-era resources that should show immediately at zero carry `reveal: () => true`.
- **`jobs`** — may carry `rateMult` (tin yields ×0.5) and an optional `reveal`; a job in the manifest with no `reveal` simply shows.

`BOOST_BUILDING` maps a resource to the building that boosts it (kept global — era-neutral identity data, like icons; it graduates into the manifests if an era ever remaps a boost). Tool upgrades apply to *all* gather rates including the ores. `releaseOrder()` is derived from the active manifest's jobs (reversed, with `forager` forced last) and drives `removeSettler()` — previously that unassigned from a hardcoded three-job list, which with five jobs could have left `jobsUsed() > civilians()` and driven `idle()` negative.

### Converters

The Forge is a new building archetype: it *transforms* resources rather than producing or boosting them. An optional `converts: { in: {...}, out: {...}, rate }` field on a building def, processed by `runConverters()` in `step()` after production and before the storage clamp. Throughput is clamped three ways so it degrades smoothly rather than erroring or destroying inputs:

1. by `owned × rate × dt`,
2. by the inputs actually in store — partial rate when short, idle at zero,
3. **by headroom under the output's cap**, so a full bronze store stops the Forge instead of quietly eating copper and tin for nothing.

No worker assignment (see `design.md`), so it needs no `popCost` or job wiring. `rates()` reports *gross* production (the simulation applies converters separately in `step()`), but the **ledger displays `ledgerRates()`**: gross plus live converter flows — outputs positive, inputs negative — computed with the same three clamps as `runConverters`, so a starved or output-capped Forge honestly displays as stopped rather than advertising its theoretical speed. The input clamp counts incoming production alongside stock, so a Forge fed at exactly its consumption rate (the designed equilibrium) reads steady instead of flickering. Negative flows pick up the ledger's existing red styling — a draining pile scans as a problem at a glance. Folding flows into `rates()` itself would double-convert; the split is deliberate.

**The intended equilibrium**, which falls out of the numbers rather than being special-cased: copper mines at 0.20/s and tin at half that, so **2 copper miners : 1 tin miner** produce ore in exactly the 4:1 ratio the recipe consumes — no wasted ore — and **2 Forges** (0.05 bronze/s each) consume precisely that output. Verified live.

Storage asymmetry is deliberate: one **Ore Yard** raises the copper *and* tin caps together rather than two near-identical buildings, and bronze gets a generous base cap with no storage building, since it's spent rather than stockpiled.

### Raid types & composition

The active manifest's `raidTypes` (declared in stone, inherited unchanged by bronze) rolls independently of `RAID_SIZES`. `militaryStrength(raid)` sums `unitStrength()` across the era's unit types, each contributing `count × strength × weaponMultiplier() × (matched ? CONFIG.counterBonus : 1)`. The critical property is enforced by that formula's shape rather than a special case: the non-matching multiplier is **1, never below** — units are never penalized for being the wrong type, only un-bonused, so any army always beats no army (see `design.md`).

**The counter relationship is stored in exactly one place**: a unit def's `counters` field naming a raid id (`archer` counters `"massed"`). An earlier pass *also* put the reverse mapping on the raid type (`counter: "archer"`), and `unitStrength()` compared `def.counters === raid.counter` — a raid id against a unit id, always false, silently disabling every counter bonus in the game with no error. The redundant field is gone; `counterUnitFor(raid)` searches `active().units` instead. A `warband` is simply a raid no unit names, so nothing counters it, with no null-handling needed.

Composition mismatch feeds a second, softer dial rather than `repelChance`: `counterCoverage(raid)` returns the share of your defense coming from the countering unit, and the costly-repel probability is multiplied by `1 - CONFIG.counterCasualtyRelief × coverage`. Fielding the right unit therefore both wins more fights *and* buries fewer of your own.

`removeRandomUnit()` replaces the old soldier-specific helper: it drops one unit, decrements `S.pop` alongside, and returns the lost unit's display name for flavor. `stealResources()` now loops every resource including the ores and bronze.

**Casualty exposure.** The draw is weighted by headcount × the unit's `casualtyWeight` (Soldier 1.0, Horseman 0.6, Archer 0.35), so the front line absorbs most losses and archers read as the backline unit they're meant to be. Every weight is deliberately **greater than zero**, which is what makes this bend the odds rather than grant immunity: an archer can always be the one who falls, and an all-archer army degenerates to "the archer dies" with no protection whatsoever. Measured over 30,000 draws from an even 10/10/10 army: soldier 50.9%, horseman 31.1%, archer 17.9%. A trailing fallback loop covers the floating-point case where accumulated subtraction walks the roll past the end of the list — without it, a rounding error would return `null` and silently skip a casualty.

**Scouting** is gated on the *upgrade*, not the Stables that reveals it — building the Stables alone doesn't hand you the event category, you have to invest in it. Its two events are ordinary `chancePerSecond` entries; one is deliberately pure flavor with an empty `effect`, since the value of a warning is the knowing.

## Units & Military

The manifest's `units` (Soldier; plus Archer and Horseman in bronze) is a third buildable-defs list. Unlike buildings/upgrades, a unit def carries `popCost` — the number of civilians it permanently consumes. This changes the derived-value math for population:

```js
function civilians()   { return S.pop - Object.values(S.units).reduce((a, b) => a + b, 0); }
function reserved()    { return S.buildQueue.reduce((sum, q) => sum + (defById(q.id).popCost || 0), 0); }
function jobsUsed()    { return active().jobs.reduce((sum, j) => sum + (S.jobs[j.id] || 0), 0); }
function idle()        { return civilians() - jobsUsed() - reserved(); }
```

`civilians()` excludes anyone already converted to a unit. `reserved()` sums `popCost` across the **entire queue**, front and waiting alike — a civilian is pulled out of the available pool the instant a unit order is queued (matching "it takes one civ out, runs a progress bar, then you get a soldier"), not when it completes. `build()` checks `idle() >= (def.popCost || 0)` alongside the normal resource-affordability check, so recruiting competes directly with job assignment for the same pool. On completion, `completeConstruction()` writes to `S.units[id]` rather than `S.builds[id]` — the civilian was already subtracted via `reserved()` while queued, and now permanently exits `civilians()` via `S.units` instead of returning to the idle pool.

A unit's ongoing food upkeep needs no new code — `S.pop` already includes units, and `rates()`'s upkeep line is just `S.pop * CONFIG.upkeep`.

Unit deaths go through `removeRandomUnit()` — see Raid types & composition for the exposure-weighted draw. (Its predecessor, a soldier-specific `removeSoldier()`, is gone.)

### Conflict

Conflict doesn't fit the generic `chancePerSecond` + single `counter` shape Sickness uses — it needs its own population-scaled trigger chance, a variable raid size, a two-stage outcome (repel check, then a consequence roll), and outcome-dependent flavor text. Rather than contort the generic shape, `EVENTS` entries may define `resolve(S, dt)` instead of `canFire`/`chancePerSecond` — a full escape hatch that owns its own trigger roll and effect application; `resolveEvents()` just calls it every tick if present. This is a generic engine change (any future event with this much internal complexity can use the same escape hatch), not a Conflict-specific special case.

Conflict's `resolve()`:

1. **Trigger** — `chance = CONFIG.conflictBaseChance * (1 + S.pop * CONFIG.conflictPopScale)`, converted to a per-`dt` roll the same way Sickness's flat chance is. Frequency scales continuously with population (a bigger settlement is a bigger target), rather than Sickness's one-time threshold gate. Also gated behind `S.pop >= 4`, matching Sickness's early grace period.
2. **Raid size and type** — independent weighted picks from `RAID_SIZES` (small/common, large/rare) and `RAID_TYPES` (warband / massed charge / band of riders). Size is "sometimes 2 scouts, sometimes 10"; type is what military composition plays against.
3. **Defense** — `militaryStrength(raid)`, the composition-aware sum described under Raid types & composition: every unit type contributes `count × strength × weaponMultiplier()`, with the counter bonus for the type that excels against this raid. `weaponMultiplier()` is tiered, highest owned wins: Bronze Weapons 2.2 > Flint-Tipped Spears 1.6 > unarmed 1.0. Zero units means zero defense, full stop.
4. **Repel check** — `repelChance = defense / (defense + raidSize)`. A ratio, not a threshold: always some chance either way, more investment always shifts the odds, nothing ever reaches exactly 0% or 100%.
5. **Consequences**, banded by outcome:
   - **Repelled, clean** — no losses.
   - **Repelled, costly** — rolled separately (`raidSize / (defense + raidSize)`, softened by Hide Armor and by `counterCoverage()`); if it lands, one unit is lost via the exposure-weighted `removeRandomUnit()`.
   - **Raid succeeds** — `1 + floor(raidSize / 5)` units lost (capped at however many exist, drawn by exposure weight), a fraction of every resource stolen (`stealResources()`, fraction scales with raid size, capped at 50%), and — only if defense was especially thin relative to the raid (roughly `defense < raidSize / 2`, including the `defense === 0` case) — one civilian lost via `removeSettler(true)`.

`removeSettler()` takes an optional `allowZero` param (default `false`, used by Sickness, which floors at 1 survivor by design) — Conflict passes `true`, since it's the one hazard allowed to end a run outright (see `design.md`, Failure). The generic `S.pop <= 0` check in `step()` is what actually ends the game in that case, not Conflict itself — keeping "what happens when population hits zero" in one place regardless of cause.

## Events Engine

`EVENT_LIB` (id-keyed) holds every event that exists in any era; the active manifest's `events` slate decides which are live — there are no era tags on events. Each entry:

```js
{
  sev: "good" | "bad",
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

`resolveEvents(dt)`, called once per `step()`, iterates `active().events`:

1. Skips events whose `condition` fails. (Era eligibility needs no check — an event absent from the slate doesn't exist right now.)
2. **`resolve`-based events** (Conflict, currently the only one): called directly with `(S, dt)` and left entirely to their own devices — no generic trigger roll, negation, or flavor logging happens around them. See Units & Military for Conflict's specific algorithm.
3. **Deterministic events** (`canFire`): loop-fires the effect repeatedly (guarded at 50 iterations) while the condition holds. Currently has no users — population growth was its only occupant before moving out to `accrueGrowth()` — but the archetype stays as the generic deterministic shape.
4. **Probabilistic events** (`chancePerSecond`): one roll per `step()` at the dt-adjusted probability. If it lands, `negateChance(ev)` (`min(1, counterBuildingCount * reducePerUnit)`) gets a second roll; negated events log the `negated` flavor line (always styled `"good"` — averting bad news is good news) and skip the effect entirely, otherwise the effect applies and the `hit` flavor line logs at the event's own `sev`.

`removeSettler(allowZero = false)` (used by Sickness's effect, and by Conflict's civilian-casualty case with `allowZero: true`) is the shared "a civilian dies" helper. It no-ops when `civilians() <= 0` — a settlement of nothing but trained units has no one for it to take, and without that guard `S.pop` could be pushed below `totalUnits()`, making `civilians()` negative. Otherwise it decrements `pop` (floored at 1 unless `allowZero`) and calls `reconcileWorkforce()`. Contrast with `removeRandomUnit()` (Units & Military), which drops a unit and `pop` together so `civilians()` is unchanged and no reconciliation is needed.

**`reconcileWorkforce()` — and the bug that produced it.** A civilian can be spoken for in *two* ways: assigned to a job, or reserved by a queued unit order. The original code balanced deaths against `jobsUsed()` alone, so a death while a Soldier sat in the queue left the books short by exactly the reserved worker and `idle()` displayed **-1**. Reported from real play; the visible symptom was that clicking a job's minus button then "absorbed" the deficit, which read as a worker vanishing. The reconciler now balances against `jobsUsed() + reserved() - civilians()` and resolves the shortfall in two stages:

1. Release people from jobs, following `RELEASE_ORDER` (derived from `JOBS`, reversed, foraging last).
2. If emptying every job still isn't enough — possible when more unit orders are queued than there are survivors — abandon the newest unit orders, refunding materials exactly as a manual cancel would, until the books balance. `dropQueueItem()` is shared with `cancelBuild()` so the refund path can't diverge.

The harness fuzzes this: 400 random settlements with random armies, queues and death sequences, asserting `idle()` and `civilians()` never go negative.

Flavor lines are picked at random from each pool (`pick()`) for light variety across repeat occurrences.

**Great Hunt** and **Trader** are the first positive-only entries using the plain `chancePerSecond` + `effect` shape (no `counter`, no `condition`, no `resolve`) — proof the generic shape was never inherently hazard-specific, it just happened to only have hazards using it until now. Both just add resources in `effect()` and log a `"good"`-severity `flavor.hit` line; the negation branch in `resolveEvents()` is skipped automatically since `negateChance()` returns `0` when `ev.counter` is absent.

## Progressive Reveal Hints

Distinct from events: `HINT_LIB` (id-keyed) holds one-time Chronicle hints (`{when, msg}`); the active manifest's `hints` slate decides which are live, and `checkReveals()` iterates that slate every tick. These aren't stateful occurrences — they're narration for "you've discovered a new mechanic" (first wood gathered, storage cap first hit, sickness becoming possible at `pop >= 4`). Each fires exactly once, tracked in `S.seen`. Era-specific hints (`rotOre`, `bronzeAvailable`) are gated purely by slate membership, not by `S.era` checks inside `when()`.

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

No test framework; verification is a headless Node harness — **checked into the repo as `harness.js`** (run `node harness.js` from the repo root; originally session-scratchpad-only, promoted once it accumulated 400+ checks worth preserving) — built around `vm.createContext` — it stubs just enough of `document`/`localStorage`/`window` for `game.js` to boot outside a browser, then exercises `step()`, `build()`, `assign()`, `resolveEvents()`, etc. directly, with an exported `__api` object for inspection. This has been the primary correctness check throughout the build (starvation timing, queue escalation math, storage-cap clamping, event negation odds, job-reassignment-on-death safety), with live browser checks reserved for visual/layout verification and DOM-level bugs the headless harness can't see (the beforeunload/save race was actually found via live testing, not the harness).

## Settled But Not Yet Built

Everything above documents the game **as it currently runs** — free timed growth, the Phase A manifest parity refactor, and the Phase B transition machinery have all shipped. The manifest architecture is complete and waiting for its first real consumer.

### The settled invariants (all in force)

Recorded here as the standing contract every future era must honor — rationale in `design.md` (*The Era Manifest Model*), mechanics under *Eras: The Manifest Model*, above:

1. **Ids are permanent and global.** The same id in two eras' manifests is *the same entity*; an id, once shipped, is never reused to mean something else.
2. **The compiled manifest is the complete truth of its era.** Nothing outside it renders, produces, converts, fires, or can be purchased.
3. **Content absence = removal; carrying is the default.**
4. **State is never implicitly destroyed.** State under departed ids is inert, not deleted; only explicit, narrated migration instructions transform it. (One default policy on top: workers on a removed job return to idle.)
5. **Migration formulas read a frozen pre-transition snapshot**; writes apply to live state. Instruction order cannot matter by construction.
6. **The snapshot is archived** in `S.eraHistory[fromEra]`, one per era left, kept forever.

**Explicit non-goals, still:** no ECS, no event-sourcing, no reactive state framework. The simulation is small; the pain was content lifecycle, and manifests solve exactly that with plain data.

### Phase C — the Iron Age (designed; C1 shipped, C2 next)

Content decisions and rationale in `design.md` (Iron Age / Adversaries & Expeditions). The technical contract:

**C1 — the economy flip.** ✅ **Shipped** exactly as specified below, plus: `CAPSTONES` (id → era map) replaced the hardcoded capstone check in `onComplete()`; armor tiers got the same lowest-wins structure weapons already had; iron-era hints (`rotIron`, `firstSteel`, `firstGold`) and the `ironAvailable` bronze hint landed with it. Verified live: the full bronze→iron transition with a running economy — all three narrated migrations, ore-job workers released, every retired card/row/tile purged, gold seeded from the heirloom sale, the Forge smelting steel on the far side. Harness at 318 checks, 20/20 runs.
- Bronze manifest gains the `ironAge` capstone (reveal `pop >= 16 && (archer || horseman) >= 1`; cost 400 food / 400 wood / 400 stone / 50 bronze; 180s) and an `ironAvailable` hint. `onComplete` maps it to `advanceEra("iron")`. `ERA_ORDER` gains `"iron"`; `ERA_TRANSITIONS.iron` gets its lead sentence.
- `IRON_DELTA`, the first delta with a real `remove` list: copper, tin, bronze; copperMiner, tinMiner; oreYard; bronzeTools, bronzeWeapons, scouting, flintSpears (first two and scouting are priced in a dead resource — the validator forces this removal, which is it working as designed; flintSpears is superseded). Overrides: hut → **Longhouse** (housing 7), Forge `converts` → `{in: {iron: 3, wood: 2}, out: {steel: 1}, rate: 0.05}` with a new desc; panel title → **Town**; archer/horseman costs re-priced out of bronze into iron.
- Adds: resources iron (job-mined, full rate), steel (converted; cap 200, no storage building), gold (**no job produces it** — enters only via migration, plunder, trade); job ironMiner; buildings **Iron Yard** (+100 iron) and **Treasury** (+100 gold); upgrades **Iron Tools** (+0.22 additive), **Iron Weapons** (weapon tier 3.0), **Steel Armor** (armor tier 0.3). New `scoutFindIron` event in `EVENT_LIB` (the bronze `scoutFind` pays copper, which would be inert writes in iron); iron's slates redeclared wholesale as always.
- Migrations, the runner's first real load: `copper` vanish, `tin` vanish, `bronze` **convertTo gold at ratio 0.25**, each narrated. Ore-job workers released by the built-in default. Owned bronze-era upgrades stay owned and functional (multiplier reads state); `weaponMultiplier()` gains the ironWeapons tier and `armorFactor()` the steelArmor tier — the only two engine functions C1 touches.
- No capstone out of iron (next era undesigned). When it exists, **it costs gold** (canonical rule 3 in `design.md`) — the exit from Iron is denominated in the expedition economy.

**C2.1 — expedition legibility pass** (first playtest feedback). ✅ **Shipped**: one campaign AND one caravan may be out concurrently (per-type guards via `expeditionOut(type)`; never two of a kind); expeditions render as cancel-less progress cards at the top of the queue panel, typed by tiny `QUEUE_ICONS` (hammer/sword/coins — playtest revision: subtle icons beat a dashed border) (retitled **Underway** in iron via the existing `panelTitles` machinery; expedition uids prefixed `x` in the card DOM to share the panel with build uids); campaigns launch through a muster **modal** (description + live estimate + steppers; muster is modal-scoped UI state); caravans stay one-click on safe roads but open an **escort modal** when a warlike neighbor is Hostile — escorts don't reduce ambush chance, they contest the ambush (`escortStr/(escortStr+raiders.strength)` to fight through and complete the trade; casualties via `removeDeployedUnit` either way; `riskAdversary()` = strongest Hostile warlike neighbor). Trading at Wary standing gets a cold narrated line — the rep system hinted, never printed. Harness at 389 checks, 20/20.

**C2 — Adversaries & Expeditions.** ✅ **Shipped** as specified below, plus: pacing telemetry (`[pacing]` console lines stamping the playtime clock when capstone research starts, finishes, or is cancelled — a playtest aid, per user request); adversaries listed as a "Neighbors" group in the Info panel's era tabs; the muster allocator is module-level UI state like `paused` (what the *next* campaign would take; resets on launch). Live-verified end-to-end through the real UI, during which the living world helpfully demonstrated itself: while a test caravan was on the road, the now-Hostile Hill Clans raided the thinned settlement and killed two of the units meant for the next muster. Harness at 365 checks, 20/20 runs.
- New manifest category `adversaries`, declared **wholesale per era like the slates, never inherited** (stone/bronze: `[]`). Shape: `{id, name, disposition: "peaceful"|"warlike", strength, fightsAs: raidTypeId, stock: {resId: n}, buys?: {res, amount, pays}, campaignTime, caravanTime?, desc}`. Validator additions: `fightsAs` ∈ era raid types; `stock` keys and `buys.res` ∈ era resources; `buys` only on peaceful adversaries.
- State (additive, defensively merged): `S.adversaries = {[id]: {stock, standing}}` — initialized from the manifest for any adversary not yet in state, at load and on era entry (an adversary's *manifest* entry is the template; the *state* entry is the living remnant that depletes). `S.expeditions = []` (at most one entry): `{uid, type: "campaign"|"caravan", adversary, units?, cargo?, total, remaining}`.
- **Deployment thins home defense**: `deployedCount(unitId)` sums over active expeditions; `unitStrength()` counts `S.units[id] - deployed(id)`, and home-side `removeRandomUnit()` draws only from undeployed units. Campaign casualties draw from the deployed set (same exposure weights) and decrement `S.units` + `S.pop` on resolution.
- `resolveExpeditions(dt)` runs in `step()` (after events, before the wipe-out check): tick `remaining`; at 0, resolve — **campaign**: `attack = Σ deployed × strength × weaponMultiplier() × counterBonus-vs-fightsAs`, `winChance = attack/(attack + adv.strength)`; win → plunder 40% (floored) of each stock resource + possible 1 casualty (armor/coverage-softened); lose → no loot, `1 + floor(adv.strength/8)` casualties capped at deployed; standing −1 either way. **Caravan**: gold = `min(pays, their remaining gold)` (× 1.25 if Friendly), their gold stock −= paid, the sold goods **join their stock**, standing +1; if any warlike adversary is Hostile, 25% the caravan is raided en route (cargo lost, nothing paid). Resolution lines log unconditionally (rare, story-critical — same rule as migration narrates); offline catch-up resolves expeditions for free since this lives in `step()`.
- Standing words: ≤−2 Hostile, −1 Wary, 0–1 Neutral, ≥2 Friendly. Consequences (all V1 has): each Hostile **warlike** adversary multiplies the home conflict trigger ×1.5; a Hostile **peaceful** one refuses caravans; Friendly pays ×1.25.
- **Muster Ground** (building, cap 1) gates the panel; one expedition at a time, enforced in the action layer like every other refusal. Campaigns cost a flat food provision at launch (paid like a build cost; no refund mid-flight — there is no mid-flight, per no-catch-windows).
- **Layout**: new `#panel-expeditions` block in `index.html`, grid row 2 / column 4. The Chronicle's `grid-row: 1 / 3` becomes conditional: `updateSpans()` drops it to row 1 once the Muster Ground is revealed (same sticky-span machinery the roster panels use, pointed the other way). Each adversary renders as a create-once card: name, disposition, standing word, known stock line, campaign allocator (job-style steppers per unit type) and caravan button with the posted exchange.

The capstone-into-iron plus a delta, three narrated migrations, two tier bumps, one new panel, and one new content category — everything else is the machinery Phases A/B already built. That's the bet the refactor made, and C is where it pays out or doesn't.

## Known Limitations

- Conflict's numbers (`conflictBaseChance`, `conflictPopScale`, raid-size weights, the `repelChance` ratio, casualty/theft fractions) are first-guess, same as the rest of `CONFIG` — expect these to move once the system is actually played against.
- Holdings tiles show a flat count with no compaction (`1234` renders as literally `1234`) — fine at current scale, flagged in `design.md` as a concern for later, much-larger numbers.
- Upgrades don't appear anywhere once owned except the buy-card itself (relabeled "owned", permanently disabled) and the Chronicle completion line — there's no dedicated "traits you have" surface the way Settlement is for buildings.
- The migration runner and DOM purge are fully built but lightly exercised: stone→bronze removes only the capstone and declares zero migrations, so their first real workout is the Iron Age. The harness covers them synthetically (every primitive, snapshot-order immunity, removed-job release), but synthetic coverage is not a real era transition.
- `Math.random()` is used directly and unseeded — fine for a prototype, would need revisiting for reproducible testing of rare-event balance.
