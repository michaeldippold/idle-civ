# 8/25/26 Architecture Review — Suggestions Only, Nothing Changed

*Produced by a full-repo review (every file in `src/`, `harness.js`, `sim-4b.mjs`, all docs)
judged against the settled direction in [2026-08-25-design-brief.md](2026-08-25-design-brief.md):
competitive 4X, symmetric players, per-player eras, dispatch armies, someday-multiplayer-by-
subtraction. This is a planning document. No code or doc was modified. Line numbers are as of
commit `a26881a`.*

---

## Verdict

The codebase is in better shape than a thrice-pivoted prototype has any right to be. The
**determinism substrate is ahead of schedule** for the symmetric-players goal: one seeded RNG
stream in save state, named sub-streams for generation, paint-by-hash never paint-by-draw, a
fixed-tick metronome where speed = N steps, no wall-clock in the sim, and a harness that
literally source-scans for `Math.random`. The manifest compiler with its load-time validators
is a real content pipeline. The sim→render seam on the map is genuinely one-way and
closure-shaped.

The **state shape is behind schedule**. The single organizing defect, showing up in every layer
under different names, is: **`S` is the human's civilization, and everyone else is a flavor
skin.** Ownership is a list on the player instead of a property of the tile. Fog belongs to
nobody in particular. The era is the world's. Adversaries have no economy — raids are a
probability dial that assigns blame after the fact. None of this is wrong for the game that
existed two pivots ago; all of it is debt against the game you've now settled on, and the debt
compounds with every system built on top of it.

**The one sequencing recommendation that matters: do the per-player state refactor (Part I)
before armies-on-hexes lands.** Army groups are the next big state object. If they're born
inside today's singleton shape, the eventual `players[]` refactor grows by exactly the size of
the military system.

---

## Part I — The big one: from "S is the player" to `players[]`

These five findings are one refactor. They should land together, and first.

### I.1 Introduce a player entity

**Where:** `src/core/state.js:13-60`, and the ~25 files that `import { S }`.
**What:** `freshState()` returns one civ — `res`, `builds`, `units`, `upgrades`, `buildQueue`,
`pop`, `era`, `S.map.owned/work/pop/revealed/sighted`. There is no player entity anywhere.
Adversaries live as `S.adversaries[id] = { stock, standing, walls, era }` — a sub-record *of
the player's state* with no economy (stocks refill by fiat at era flip, `persist.js:88-92`),
no territory, no build queue, no actions.
**Why:** a second symmetric player currently has nowhere to exist. The refactor is mechanical
but large: thread a `civ` parameter through `rates()`, `caps()`, `mults()`, `step()`,
`build()`, `resolveEvents()`, etc., with the human becoming `players[0]`. Every new system
written against the global `S` binding adds to this bill — which is why it goes first.
**Suggested shape:** `S.players[pid] = { res, builds, units, upgrades, buildQueue, era,
owned, work, pop, revealed, sighted, color, seatId, standing... }`. Today's adversary records
migrate into (initially mostly-empty) player records — that *is* the "merge adversaries with
player mechanics" roadmap, expressed as state.

### I.2 Ownership becomes a property of the tile, not a list on the player

**Where:** `src/map/map.js:69` (`owned: ["0,0"]`), `map.js:509` (`isOwned` boolean), plus all
consumers: `ui/map.js:137,185,192,472-479`, `panels-ledger.js:64-92`, `captureTile`
(`map.js:735`), `loseHexIfEmpty` (`map.js:631`), `strikeHex` (`map.js:517`),
`dominionCap`/`holdsUsed` (`map.js:497-506`), `derived.js:154`.
**What:** player territory is an id array with `includes()` checks; meanwhile the world model
already does it right for NPCs (`place.adversary` is an id, `generate.js:59`). Two
representations for one concept, and the player's is the wrong one.
**Why:** `tile.owner` (or a `Map` of tileId→pid) is the natural multiplayer shape, unifies
"my hex / their seat / captured minor" into one field, and kills the O(owned) scans inside
per-tile loops as a side effect. `isOwned(id)` becomes `ownerOf(id) === pid`.

### I.3 The home-at-origin assumption dies

**Where:** `src/map/generate.js:134-150` — the world frame is *translated* so the player's
start sits at `"0,0"`, with a comment admitting everything downstream assumes it. Consumers:
`adminDistance` Dijkstras from `world.home` (`map.js:594`), seat-distance filters use
`hexDist(p, 0, 0)` (`generate.js:173,206`), `syncDominion` unshifts `world.home`
(`map.js:137`), `upkeepMouths` prices distance from the one seat.
**What/Why:** N players need N seats and only one can be the origin. Stop translating; store
`world.homes = {pid: placeId}` — or better, seat the human exactly the way adversaries are
already seated (`generate.js:154-183`). Symmetry says the human's seat should not be special
in the generator at all. `adminDistance` becomes `adminDistance(pid, targetId)`.

### I.4 Fog becomes per-player

**Where:** `src/map/map.js:161-271` — `S.map.revealed`, `S.map.sighted`, `isCharted`,
`isSighted`, `isVisible` all answer for one unnamed observer; `syncSighted` casts rays only
from `S.map.owned`.
**What/Why:** symmetric bots need their own charted sets to make honest decisions — a bot
reading the true world is cheating; a bot reading *your* fog is broken. Key the sets per
player and make the predicates `isChartedBy(pid, id)`. The good news: the renderer already
takes fog as closures (`stage.setWorld(list, {isVisible, isCharted})`, `stage.js:298-299`),
so "render from player 2's perspective" becomes a one-line change at the call site once state
is per-player. The `revealAll` QA lens (`map.js:186`) is module-global; fold it into the
viewing-player binding.

### I.5 Era becomes per-player

**Where:** `src/core/state.js:47` (`S.era`, one string per run), `compile.js:251` (`active()`
reads it globally, ~30 call sites), `persist.js:88` (adversaries re-stock when `st.era !==
S.era`), `map.js:110` (minors re-dress off *your* era).
**What:** the global era you already decided to kill. Adversary strength is currently keyed to
*your* progress — the exact opposite of the Empire Earth race you want.
**Why/How:** the manifest system itself is ready — per-player era is just a per-player
manifest pointer. Make `active(civ)` the signature from day one of the Part I refactor.
There's a real design decision embedded here: today `active().map` conflates three kinds of
facts. Split them deliberately:
- **World facts** (terrain, geometry) — belong to the board, no era.
- **Observer facts** (tile noun, visual re-dress) — belong to the *viewing* player's era.
- **Owner facts** (popCaps, work rates, dominionCap) — belong to each hex owner's era.

### I.6 Sim state hiding in module locals

**Where:** `src/map/map.js:658` (`famineAnnounced`), `map.js:446` (`growthSpendRate`, read by
`derived.js:218` — a sim side-channel feeding the UI), `map.js:19` (`world.home`).
**What/Why:** module-local mutable state breaks save fidelity today (mid-famine reload
re-announces) and breaks "N civs, one process" tomorrow (two players can't have independent
famines). Rule: anything a second player would need its own copy of belongs on the player
object; anything transient gets labeled presentation-only.

---

## Part II — The action layer: 90% real, two gaps

The discipline here is nearly there: `build`, `cancelBuild`, `launchSettle`,
`launchStructure`, `demolishStructure`, `launchCampaign`, `launchCaravan` all flow through
`core/actions.js` / `sim/expeditions.js`. That's the seam bot players and future remote
players need. Two leaks:

### II.1 The most-used verb in the game bypasses the layer

**Where:** `src/ui/map.js:708-717`.
**What:** hex work assignment — the core allocation verb of the entire economy — is an inline
DOM-handler mutation: `S.map.work[tid] = btn.dataset.res; ... delete S.map.work[tid]; save();`
**Why:** it's the one verb a bot cannot call and an action journal would miss.
**Fix:** add `setWork(pid, tileId, resOrNull)` to `core/actions.js` (validate ownership, bump
a `workVersion` counter — see Part V.3), have the handler call it. Ten minutes now, a
grep-hunt later. Audit for new handler-resident mutations as content grows.

### II.2 No action journal — the replay claim is aspirational

**Where:** `src/core/rng.js:11-13`, `src/core/step.js:14-18`.
**What:** the comments claim "(seed + tick count + actions) fully determine the state" — true,
but actions execute immediately on click and are never recorded with their tick.
**Why:** lockstep multiplayer *is* an action journal plus deterministic ticks. You already
have the ticks. Replay debugging ("send me the journal that crashed") comes free.
**Fix:** once II.1 closes, have every action-layer verb append `{tick, pid, verb, args}` to a
log. Nothing needs to consume it yet — writing it hardens the seam and keeps it honest.

### II.3 The sim imports the UI (inverted dependency)

**Where:** `core/step.js:9-11` → `renderAll`, `log`, `openGameOverModal` (plus `die()` doing
DOM surgery at `step.js:98-102`); `core/actions.js:8` and `sim/expeditions.js:9` →
`renderAll`, `fmtTime`; `sim/era.js:7-9` → `setSpeed`, `openEraModal`; `log()` called from
`map/map.js`, `sim/combat.js`, `sim/events.js`, `content/lib.js`. Also `map/map.js:5`
imports `../ui/log.js`. The cost is visible: `harness.js:55-90` and `sim-4b.mjs:21-46` must
stub `document`, `localStorage`, `window`, `confirm` just to *import* the sim.
**Why this bites soon, not just someday:** when a *bot* advances era, `advanceEra`
(`era.js:44-48`) will open a modal and reset the human's game speed. And every `log()` call in
the sim has no answer to "whose Chronicle does this line land in?"
**Fix:** invert with a small event bus. Sim emits `{type, severity, pid, data}`; `ui/log`
subscribes and renders lines addressed to the viewing player; modal/speed side effects hang
off "the viewing player advanced," not "someone advanced." The scattered `renderAll()`/`save()`
calls collapse into a single post-action hook.

### II.4 Render paths mutate saved state

**Where:** `src/core/derived.js:301-306` (`isRevealed()` writes `S.seen["rev:"+id]` from
renderers), `src/ui/panels-ledger.js:114` (writes `S.seen["res:"+id]` during render).
**Why:** a headless run and a rendered run of the same seed+actions produce different saves —
cosmetic today, but it means the harness exercises different `seen` behavior than the
browser, and it violates the one-way flow everywhere else honored.
**Fix:** move reveal-latching into `step()` — `ui/log.js:7-15` (`checkReveals`) already does
this pattern correctly; finish the job.

---

## Part III — Fix-now bugs (small, real, all found in passing)

1. **`applyConsolidation` ReferenceError landmine** — `src/sim/era.js:30` calls a function
   deleted in E5 and imported from nowhere (harness asserts it's undefined,
   `harness.js:2192`). Dormant only because no manifest declares `consolidate`; the compiler
   still accepts the field (`compile.js:140-144, 415-416`), so the first era delta that sets
   it crashes every border crossing. Delete the call, the era-fact, and the validator branch
   together.
2. **Undefined variable in `onComplete`'s hut branch** — `src/core/actions.js:243-245`
   references `n` which doesn't exist in scope; reaching it throws. Unreachable today (no
   manifest has a hut). Delete the branch.
3. **Self-XSS via seat name** — `src/ui/map.js:277-279`: `detailHTML` interpolates
   `seatName()` (raw input from `#startName`; `main.js:46` trims but doesn't escape) into an
   `innerHTML` string (`map.js:568`). Low stakes single-player; the same habit meets *other
   players' names* in multiplayer. Escape at the seam.
4. **`captureTile` dead pop bump** — `src/map/map.js:739`: `S.pop += 1` immediately before
   `syncPopMirror()` recomputes `S.pop` from scratch. Dead at best, misleading always.
5. **Stale player-facing hints instruct building removed buildings** —
   `src/content/lib.js:280-281` (`rotOre`: "Build an Ore Yard" — live in the Bronze slate,
   building died in 4c), `lib.js:288-289` (`rotIron`: "Build an Iron Yard", dormant),
   `lib.js:260` ("Raise a hut" — hut died in E3, slated in every era). Reword to era-budget
   language like the already-fixed `rotFood/rotWood/rotStone`.
6. **Stale refusal string** — `src/ui/panels-buy.js:277`: "A settler must be idle first" —
   there is no idle pool; recruits draw from the seat. User-visible dead fiction.
7. **Ghost levy flag** — `src/core/derived.js:92`: `if (active().levy) return 0` — no manifest
   sets `.levy`; comments in `iron.js:33-35` still describe levied Iron units that the code
   doesn't do. Delete the flag or make it real; don't leave both stories standing.
8. **Unit trains without population deduction** — `src/core/actions.js:219-229`: if every hex
   has pop 0, `from` stays null and the unit completes with no person drawn. Books-desync
   edge case.
9. **`stage.dispose()` doesn't** — `src/render3d/stage.js:598-603`: cancels RAF and disposes
   GL, but never disconnects the `ResizeObserver` (`stage.js:204`), never removes the resize
   listener, never calls `controls.dispose()`, leaves canvas/labelLayer in the DOM, and a
   re-init would append a second canvas. Make it dispose or delete it so nobody trusts it.

---

## Part IV — Vestigial code sweep

- **`spike3d/` — delete or archive.** Referenced by nothing. `spike3d/hex.js` is a spiritual
  byte-copy of `render3d/hex3d.js`; `spike3d/main.js` imports the *real* generator, so
  generator refactors can silently break a dead spike — or someone greps and edits the spike
  copy. It's in git history. (`spikes/threejs-hex-map-guide.md` stays — it's the live render
  bible, cited by props3d comments.)
- **`sim-4b.mjs` — delete.** Line 1 says "UNTRACKED, deleted after tuning," yet it's tracked.
  It models the dead storage-building world (`sim-4b.mjs:91-92`), so its measurements no
  longer reproduce; its verdict is already immortalized in `config.js:121-129`.
- **`harness.js` — keep; it's the test suite** (`package.json:5`), and one of the repo's best
  assets. Its 4,182 lines will eventually want splitting by subsystem — hygiene, not rot.
- **`redesign/support.js` — leave.** Generated dc-runtime for the two Claude Design canvas
  files; correctly quarantined, nothing in `src/` touches it.
- **Dead state fields written into every fresh save** — `state.js:22` `jobs` bucket (system
  died E2; dead migration bucket in `compile.js:376`), `state.js:32` `growth` (settler timer
  died E3), `state.js:33` `bought` (never incremented — game-over screen permanently shows
  "Arrivals welcomed: 0", `ui/modal.js:235`; wire it or drop the stat), `state.js:23-25`
  `builds` seeding `hut`/`ironYard`/`treasury` which no manifest defines (only
  `ui/icons.js:16-17,31` remembers them). Sweep when the save schema next moves.
- **Never-set flag** — `S.seen.needsDefaultWork` is read-and-deleted (`map.js:121-124`) but
  set nowhere; `defaultAssignments()` is consequently near-dead and `era.js:3` imports it
  without calling it.
- **Unused imports (drift indicators)** — `era.js:2` (`civilians`, `deployedCount`,
  `totalUnits`), `derived.js:2` (`syncDominion`, `ensurePop`), `combat.js:2` (`syncDominion`),
  `stone.js:1` (`caps`), three dead `const panel =` locals in `panels-buy.js:69,138,227`, and
  `era.js:14`'s always-empty `before` passed to `openEraModal`. An ESLint `no-unused-vars`
  pass would hold this line for free — worth adding to the harness.
- **Dead CSS from dead iterations** (`styles.css`): `#mapWrap`/`.map-detail` (245, 260-264,
  modal-map era), unreachable `#modalPanel.wide` (237 — `modal.js:26` toggles it but no
  caller passes `opts.wide`), the whole `.adv-*` family (726-746, the deleted Expeditions
  panel), `#panel-log.shrunk` (417, grid layout that no longer exists — and `index.html:78`
  still cites `updateSpans() in game.js`, a file that's gone), `.job-name.idle` (500) /
  `.job-count.zero` (534), `.growthline` (472-479) styling an element `panels-people.js:23-24`
  unconditionally empties (delete element + JS + CSS together), `.res-note`/`#note-pop`
  (343) same disease. The Redress dev button documents its own four-part removal list at
  every site — good hygiene, just remember to actually do it.
- **Private duplicate hex math** — `generate.js:265` has its own `hexDist` duplicating
  `model.js:30 hexDistance` in the same package; import it instead. (The model.js/hex3d.js
  2D/3D duplication is deliberate and documented — keep.)

---

## Part V — Performance debts (measure first, per your own rule)

None of these are measured-slow today. All of them scale with exactly what the 4X pivot
grows: owned hexes, revealed area, players.

1. **Array-membership on hot paths** — `isCharted` does `revealed.includes(id)` per place per
   board rebuild (`map.js:191`); `routeCost`/`adminDistance` do `owned.includes(id)` inside
   Dijkstra relaxation (`map.js:591,700`). The `tile.owner` refactor (I.2) kills the
   ownership scans; fog wants `Set`s as the canonical structure, arrays only in the save.
2. **A full seat-Dijkstra per owned hex per tick** — `upkeepMouths` (`map.js:567-578`) calls
   `adminDistance` per hex; `starveTick` again per victim. One Dijkstra from the seat, cached
   until ownership changes, serves every query.
3. **`JSON.stringify(S.map.work)` at 5Hz** — `ui/map.js:377-383`, in the signature whose
   whole purpose is making the common case cheap. A monotonic `workVersion` bumped by the new
   `setWork` action (II.1) makes it O(1).
4. **Flagged-only per-frame churn** — `stage.js:560` fresh `window.__mapDebug` object and
   `stage.js:545` 120-entry sort every frame under `?perf=1`. Fine; just keep it flagged.

---

## Part VI — Content/engine seams

The manifest philosophy ("content is data, engine is generic, silent wrongness becomes loud
errors") is your best pipeline asset. These are the places code drifted back across the line:

1. **Combat tiers hard-code content ids** — `sim/combat.js:116-127`: `ironWeapons: 3.0`,
   `steelArmor: 0.3`, etc. A fourth era's weapons means editing engine code. Move tiers into
   manifest facts. Same disease: `CAPSTONES` era-graph as engine constant (`actions.js:238` —
   could be `manifest.capstone: {id, next}`) and `BOOST_BUILDING` (`compile.js:256`,
   self-aware about it).
2. **Renderer branches on content ids** — `render3d/props3d.js:216-231` hard-codes
   `"marchHold"`, `"farm"`; `terrain3d.js:17-36` hard-codes per-terrain tables. Every new
   structure edits two renderer files, and eras are supposed to *re-dress* the board. Move to
   a keyed `renderKit` table the manifests can extend (still paint-only).
3. **Copy-paste event** — `content/lib.js:230-249`: `scoutFindIron` duplicates `scoutFind`
   differing only in loot resource; parameterize loot by era-fact.
4. **Magic numbers outside CONFIG** — `combat.js:155` (`0.03`/`0.5` steal rates),
   `expeditions.js:177` (minor `baseTime: 60`), in a codebase that otherwise documents every
   constant admirably.
5. **The lib→combat→compile→lib import cycle** — `content/lib.js:5` → `sim/combat.js` →
   `compile.js` → `lib.js`. Works only because every entry module imports `compile.js` first
   (a convention documented at `harness.js:8-12` — i.e., a bug on a timer for the next entry
   point someone writes). Move the `conflict` event's resolve machinery into `sim/` and
   register it, or inject helpers at compile time. Softer cycle: `actions.js → ui/chrome.js →
   panels-buy.js → actions.js`.
6. **Save versioning is key-rotation, not migration** — `config.js:155` (`"idleCiv.v6"`):
   bumping silently abandons old saves. Acceptable under the saves-are-disposable ruling; add
   a `schemaVersion` field inside the save *now* while it's free, so 1.0 can migrate instead
   of abandon. Also `era.js:15-17`: `eraHistory` snapshots ~all of `S` per era including the
   fog arrays — undersold by its "few hundred bytes" comment on a large board.
7. **The stale header schema in `content/stone.js:8-11`** documents `capBuilding` (now a
   compile *error*, `compile.js:355`) and `jobs.rateMult` (category deleted in E2) as live
   manifest schema — misleading to the next content author.

---

## Part VII — File splits (along seams the refactor needs anyway)

- **`src/map/map.js` (752 lines) is a third of the simulation**, not a map module: world
  lifecycle, fog, population growth, famine, upkeep pricing, pathfinding, combat targeting,
  structures, capture — all closing over module-global `S`/`world`. Split along its own
  section comments — `map/fog.js`, `map/population.js`, `map/routes.js`, `map/structures.js`
  — keeping `map/map.js` as lifecycle + ownership. The seams for the split are the same seams
  the `pid` parameter threads through; do them as one pass.
- **`ui/map.js` (720) and `stage.js` (608)** are large but coherent; no urgent split. The
  extraction that *is* urgent from `ui/map.js` is the work verb (II.1) and the pricing logic
  duplicated into `ui/expeditions.js:164` (standing-premium math belongs in the sim).

---

## Part VIII — What's good (preserve these on purpose)

1. **Determinism discipline** — seeded stream in `S.rngState` resuming mid-stream across
   save/load; named generation sub-streams (`generate.js:10-14`); paint hashes never touching
   `rng()`; the murmur-bias fix documented at `model.js:79-92`; harness bans `Math.random`.
   Better hygiene than most shipped games. This is 80% of lockstep-multiplayer's
   prerequisites already paid for.
2. **The fixed-tick metronome** (`main.js:133-138`, `step.js:19-25`) — exactly the substrate
   symmetric simultaneous play wants; only the journal (II.2) is missing.
3. **The manifest compiler and its validators** (`compile.js`) — dangling ids become load
   errors; invariants are asserted, not hoped.
4. **Derived-not-stored as house rule** — `reserved()`, `deployedCount()`, `holdsUsed()`,
   `souls()` all recomputed; `syncPopMirror` is the one labeled mirror.
5. **The sim→render seam** — `render3d/*` imports zero game state; fog/ownership/marks arrive
   as closures. Per-player perspective rendering is nearly free because of this.
6. **The mark ladder** (`markFor`/`rimFor`, `ui/map.js:406-479`) — one definition, both
   renderers.
7. **The color law** (`core/palette.js`) — already multiplayer-shaped: authored player
   palettes, THEIRS/RESERVED separation.
8. **The harness** — headless boot of real modules, scenario checks, save round-trips, RNG
   stream stability, meta-checks. Keep feeding it; add per-player invariants as Part I lands.
9. **The comment culture** — decisions carry dates, owners, and the bug that motivated them.
   It made this review dramatically cheaper. Keep the tombstone habit.

---

## Part IX — Docs cleanup plan

### IX.0 — Consolidate first: ten docs → four

The audit found ~80 stale passages, but most of them live in files that shouldn't survive at
all. The doc sprawl is an artifact of building three games in place — `map.md` alone contains
the design argument *for* having a map (won), the SVG renderer spec (replaced), the tileset
commission plan (replaced), and the current Route B rulings, stacked like sediment. Rather
than line-editing all of it, harvest what's alive and delete the strata. Proposed end state:

| Doc | Role | How it gets there |
|---|---|---|
| `README.md` | Public face, orientation, doc map | Already healthy. Update the doc table when the collapse lands. |
| `design.md` | **The canon**: what the game is, every system's rules, the Noun Table, settled questions | Absorb the *surviving* design rulings from `map.md` (ownership, fog, capture, seats, adversaries, Route B aesthetic) and the surviving interface principles from `interface.md` (semantic color, words-not-meters, no-opacity, ask/tell pause). Fix its own Priority-1 items in the same pass. |
| `tech.md` | **The engine**: architecture, state shape, determinism laws, render stack, testing | Needs the heaviest rewrite anyway (Priorities 2-3). Absorb `map.md`'s live technical rulings (generator sub-streams, two-renderer contract, 3D stage) and `interface.md`'s render-discipline notes. The spikes guide stays separate as the three.js reference it is. |
| `todo.md` | **The working order** — declared authority when docs disagree | Keep the top block; prune the archive below it to short tombstones (the poisonous items in Priority 4 simply get deleted rather than corrected). |

Kept as-is: `CHANGELOG.md` (append-only history, header already disclaims canon) and
`spikes/threejs-hex-map-guide.md` (external reference, healthy).

Deleted outright: `map.md` and `interface.md` **after harvesting** (git history keeps them);
`redesign/uploads/interface-brief.md` (whole-file poison, superseded); `redesign/github.md`
(trivial). `redesign/DESIGN-NOTES.md` and `HANDOFF.md` either go too, or stay only as
banner-marked records alongside the `.dc.html` design artifacts they describe — they document
the Bureau pass, which is history now.

This collapse also shrinks the poison problem: everything below marked `map.md` or
`interface.md` becomes "don't carry it across during the harvest" instead of "edit it in
place." The priority lists that follow are still worth reading — they are the checklist of
what *not* to harvest, and the `design.md`/`tech.md`/`todo.md` items still need real edits.

### The poisonous passages — where a future session would take dead canon as live:

### Priority 1 — direct contradictions of settled pillars

| Where | What it says | Why it's dangerous |
|---|---|---|
| `map.md:761-766` | "**Era is a shared world clock**: rush ahead and you are genuinely ahead of your neighbours" — stated as a shipped owner ruling | The exact opposite of per-player eras, which is *next in the build queue*. Worst line in the repo. |
| `redesign/uploads/interface-brief.md` (whole file) | "Identity constraints (the non-negotiables) … **No map, no rendered units, no real time interaction**"; "The UI never demands presence"; "the whole game could be drawn in black pen on ruled paper" | The complete pre-pivot identity, presented as non-negotiable, with **no supersession banner anywhere**. Banner it (`> HISTORICAL — pre-pivot brief, superseded by interface.md`) or delete it. |
| `design.md:1160-1163` | "**no unit is ever drawn, no matter how far the tech tree goes**" (in Eras) | The units ban — corrected in *Explicitly Out of Scope* (1928-1935) but this copy was missed. Army group markers are the direction. |
| `design.md:2028-2033` | Closed Questions: "the map regenerates when the tile noun changes…" | `design.md:1329` itself says "**The map never regenerates.**" A reversed answer sitting in the one section sessions treat as settled. |
| `map.md:1110-1111` | "Deliberately not on this list: terrain yield modifiers, per-tile buildings, tile-level unit stationing, movement. **Each is a different game.**" | All four are now shipped or the settled direction. Reads as a live scope ban on the actual roadmap. |
| `map.md:1218-1220` | "Not needed — **no unit movement is planned**, rendered units stay out of scope" | Same. |

### Priority 2 — wrong status lines in `tech.md` (its own preamble makes them load-bearing)

`tech.md:9-11` instructs readers to trust status lines to tell "which world a paragraph
describes." These are wrong: `190` ("engine rework — **Not built yet**" — E1-E6 shipped;
contradicts the file's own phase table at line 34), `297` ("Time/Pause — pending… Nothing
below is in `game.js` today" — shipped, and `game.js` doesn't exist), `923`, `960` (also:
harness is at 755 checks, not 420 — stale at lines 50, 65, 188, 962), `978`, `1014` ("The
Map — pending — SVG-plus-DOM-overlay" — it's shipped and 3D), `695`.

### Priority 3 — `tech.md` sections describing deleted systems as live

State Shape table (`412-438`: jobs/housing/growth as live, `S.map.pop` missing), `caps()`
from `capBuilding` (`470` — the compiler now *refuses* capBuilding), jobs/`removeSettler`
machinery (`472-479`, `697-708`, `735`), consolidation as "THE pacing dial" (`580`, `592`),
the `popNoun` self-contradiction (`594-597` vs `617`, twenty lines apart), G1 marked "✅
Shipped" describing deleted mechanics (`982-997`), Known Limitations citing unseeded
`Math.random` (`1024` — now banned by the harness) and consolidation back-compat (`1029`).

### Priority 4 — remaining poisonous items

- `map.md`: header status block (3-14: "the rest designed, not built" — much has shipped);
  §7 SVG architecture stated as the ruling with the supersession note below the fold
  (1117-1185); the 2D tileset commission spec *after* the superseded-marker (1320-1378,
  including instructions to build a dead prototype to answer the already-closed OQ3);
  unstruck open questions Q1/Q2/Q9 (1430-1436, 1495-1500) beside correctly-struck neighbors;
  the pre-pivot Build Order (1526-1544); consolidation/levy passages stated as shipped
  rulings (543-549, 556-559).
- `design.md`: free-settlers-on-a-timer as current (919-920); Conquest Growth item 1 built on
  mechanisms the same file declares deleted at 1307 (1474-1484); "storage caps are scheduled
  to retire" + OQ4 premised on it (322-324, 2015 — caps are now permanent era furniture);
  training-consumes-idle-civilian (933-940).
- `todo.md` (below the authoritative top block): "**adversaries still only exist at IRON**"
  stated as a live NOTE (695-696 — reversed 8/24; all eras seat the same three peoples); the
  playtest brief verifying deleted mechanics (527-563); "**`consolidate.keep` is THE
  population dial**" pointing tuning sessions at a dead knob (1236-1243); seven unchecked
  `[ ]` boxes for shipped work (728-777); phase-8 SVG items (1175-1192); "Whether Bureau
  survives the map" as deferred (1259-1261 — resolved: it doesn't).
- `redesign/DESIGN-NOTES.md`: "**The game is a spreadsheet. The design should be proud of
  that**" (10) and six "Locked principles" (12-19) of which only three survive — banner it as
  the record of the Bureau pass and name the survivors.
- `interface.md`: era view radii as a layout law (320 — retired; one board from frame one);
  phase-5 items marked pending that shipped (558-570, 593-601); "the panel survives as a
  secondary surface until phase 9" contradicting §3's "the Expeditions panel is dissolved"
  (610-611).

### Cosmetic sweep (one pass, low stakes)

420→755 check counts; `game.js` references (`interface.md:19`, `index.html:78`); Expeditions-
panel and 4×2-grid references throughout; `interface.md` steppers-forever vs §4.3; stale
module-split proposal `map.md:1222-1227`; `README.md:145` "pillars" wording; src comment
residue (`config.js:2` "prototype game logic", `actions.js:46` citing deleted `idle()`,
`persist.js:44` citing `applyConsolidation`, `stone.js:8-11` stale schema header).

**Healthy files, no action:** `README.md`, `CHANGELOG.md` (header correctly disclaims canon),
`spikes/threejs-hex-map-guide.md`, `redesign/HANDOFF.md`, `redesign/github.md`. And `src/`
comments are unusually well tombstoned overall — the doc rot is concentrated in `tech.md`,
`map.md`'s back half, and the un-bannered `redesign/` briefs.

---

## Part X — Design decisions from the 8/25 discussion (addendum)

*Added after the review above, from the design conversation that followed it. These are
decisions, not findings — recorded here so they land in the docs consolidation (IX.0) as
canon in `design.md`.*

### XI.1 The hex economy refactor — do now; it's the base system funding everything else

**One resource per hex.** A forest makes wood. The fractional multi-resource yield system
(every hex producing off-resources at steep penalties) dies. Yields are modified only by
tech and by resource-specific hex builds (a lumber mill on a forest hex).

**Why:** the fractional system was a release valve for bad map luck implemented at the worst
layer — inside every hex — which made balancing an N×N penalty matrix where every hex
partially substitutes for every other. It also produced the hated 0.3-vs-0.4 juggling and
muted the map's ability to direct the player anywhere. Pure specialization is
integer-legible, board-readable, and turns terrain into strategy.

**Bad-luck ("mana screw") protection moves to three layers, each one dial:**
1. **Generator floor guarantee** — every seat (the human's and every adversary's, per the
   symmetry pillar) is guaranteed a minimum terrain spread within reach (e.g. ≥1 forest and
   ≥1 hills within two rings). A floor, not equality: variance survives, screw doesn't.
   Implemented as a seat-placement predicate in the generator (Civ start-bias / Catan
   beginner-setup precedent). The pregame seat picker already serves as the mulligan.
2. **The market** — a hex build that unlocks lossy conversion with the bank (e.g. 4:1),
   rate improved by market tier or tech. Player-agnostic: rates never depend on adversary
   standing. As a hex build it passes the board-legibility test — scoutable, capturable,
   burnable; razing a screwed rival's market closes their release valve, which is a
   competitive 4X interacting with trade correctly.
3. **Era recipes absorb the demand curve** — Stone runs almost entirely on food and wood
   (resources the floor makes universal), so any legal seed survives the opening;
   specialized demands (stone, ore, iron) arrive in later eras when reach, the market, and
   the military exist to answer scarcity. Beyond these three layers, scarcity is intentional:
   the map telling you where to expand or whom to fight.

**Architectural hedge:** exchange is a normal action-layer verb like everything else. The
bank is simply the counterparty that always says yes at a bad rate. If multiplayer ever
arrives, a player-to-player offer is the same verb with a different counterparty and a
consent step — no negotiation system exists until then, and with bots it never does.

### XI.2 The construction panel verdict

The construction panel — the last organ of the idle game — dies. Its contents sort by a
three-way test:
1. **Can an enemy capture or burn it?** → it's a **hex build** (farm, fort, watchtower,
   lumber mill, market). One hex = one build holds; the opportunity cost is territorial.
2. **Is it knowledge, impossible to lose with land?** → it's **tech tree**.
3. **Is it the seat's own central capacity?** → it's a **capital tier**: the home hex itself
   levels (Camp → Village → Town → City) as a queued construction, consolidating the old
   panel's "benefits the whole kingdom" effects — dominion cap, army capacity, possibly era
   prerequisites ("your seat must be a Town before the Bronze Age"). This keeps the
   one-great-city fiction, expressed on the board where rivals can scout it.

**Why:** in a competitive 4X the board is the shared truth and panels are private. A hex
build is scoutable, counterable power; a panel building is invisible power no opponent can
ever read or interact with. The build *menu* becomes a contextual verb on the hex detail
panel (options filtered by terrain); the build *queue* survives as the unified timeline of
everything under construction (hex builds, capital works, era advancement, musters).
Tuning note held open: the fort likely does defense *and* sight (watchtower effect) as one
build initially; split later only if it proves too efficient.

### XI.3 Trade and diplomacy at 1.0

**No player-to-player trade, no diplomacy layer, at 1.0.** Bank trade via the market only.
In two-sided competition, aiding a needier rival is a pure loss; negotiation with bots is
hollow. The one asterisk, recorded for the multiplayer future: at 3+ players trade becomes
rational (comparative advantage runs against the field; propping up a weak neighbor checks
the leader — the TI4/Catan dynamic), which is why the exchange verb stays general (XI.1)
even though nothing uses it beyond the bank now.

**Flag:** the existing adversary `standing`/grudge mechanic is civ-flavor holdover. When
this design lands, decide whether standing survives reframed (war-weariness, truce timers)
or dies with the diplomacy layer.

### XI.4 Caravans — post-1.0, parked on purpose

The caravan concept that *survives* the pivot is logistics, not diplomacy: physical wagons
on the board servicing **your own** economy — hauling between holdings and your market,
carrying the bank trades. Because they are objects on hexes, they are interceptable: raiders
can bleed an economy without storming a fort, armies standing on route hexes get a second
job, and route security makes fortifications and geography matter. It forces focus on the
texture of the map — what is the terrain, where are the armies, how far must it travel.
Parked here deliberately so the word "caravan" in the codebase reads as a surviving concept
awaiting its system, not dead civ-flavor. **Not 1.0.**

---

## Part XI — Suggested sequencing

1. **Docs Priority 1** — an hour of edits, removes the passages most likely to poison the
   next session (including any Claude Design thread reading from GitHub). If the IX.0
   consolidation happens promptly it covers most of this; if not, at minimum fix
   `map.md:761` and banner `interface-brief.md` immediately.
2. **Fix-now bugs (Part III)** + **vestigial sweep (Part IV)** — an afternoon; removes the
   two ReferenceError landmines, the grep traps, and the player-visible stale fiction.
3. **Close the action layer (II.1) and add the journal (II.2)** — small, and it fences the
   seam before more verbs appear.
4. **The hex economy refactor (X.1) + construction panel verdict (X.2)** — one resource per
   hex, the generator floor, the market, the three-bucket building sort, the capital tier.
   This is the base system that funds every other gameplay element, and doing it first
   *shrinks* the per-player refactor: `rates()`/`hexYield` get simpler before the `pid`
   threading touches them, and the dead panel means fewer call sites to convert.
5. **The per-player refactor (Part I, all of it, one campaign)** — `players[]`, `tile.owner`,
   per-player fog, seats, `active(civ)`, module-local state onto the player object — with the
   `map/map.js` split (VII) and the event-bus inversion (II.3) done as part of the same pass,
   since they touch the same lines. **Land this before armies-on-hexes.**
6. **Armies, combat, per-player era content** — built on the new shape, so bots and the
   human share the systems from birth.
7. **The IX.0 doc collapse (ten → four) + Priorities 2-4** — best done at a hold near the
   refactor, since the refactor obsoletes further passages anyway and `tech.md`'s rewrite
   should describe the new state shape, not the old one. Carry the Part X decisions into
   `design.md` as canon during the collapse (caravans marked **post-1.0** explicitly).
8. **Performance items (Part V)** — when hex counts grow; measure first, per your own rule.
