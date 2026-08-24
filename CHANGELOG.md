# Idle Civ — Changelog

> **The shipped record.** Everything below actually landed in the build — what changed, what broke
> on the way, and why it mattered. Newest first. Entries that shipped no code are marked as such.
>
> This file is history, not canon. `todo.md` carries the forward plan — what's next, what's
> deferred, what's a known rough edge. `design.md` holds the reasoning about the game, `tech.md`
> the reasoning about the code, `map.md` the map arc, `interface.md` the interface system. Where an
> entry here disagrees with those, they win: this is a record of what was true at the time, and
> several things below have since been reversed on purpose.

---

## 2026-08-24 — Engine rework E4: the frontier starves first

**Starvation is geography now.** An empty larder no longer ends the run in one tick. Unpaid upkeep
accumulates, and every five food of it kills one person at the peopled hex *furthest from the seat*
by administrative distance — the second of `map.md` §2.7's two distances, the same Dijkstra as
`routeCost` but seeded from the seat alone. Each death shrinks the deficit, so a famine converges
on what the land can actually feed instead of annihilating: the empire is pruned from the rim
inward to its sustainable size. Distance governs exposure, never efficiency — a far hex is not
less productive, it is the first to die.

**Land is never lost.** An emptied holding is a ghost — still yours, still ringed — and it
**rekindles from a fifth of a soul** once the larder is full again, growing back on the same
logistic curve as everything else. No one is born during a famine. And the run ends only when the
**seat itself empties**: the capital falling is the ending, not a number crossing zero.

**Escalating claim costs rode along**, per the playtest disposition: each claim beyond the starting
trio multiplies the era's base cost by 1.18 — the game's own per-copy idiom — so the tenth hex
costs about three times its era base, with the route still multiplying on top.

The harness earned its keep twice more. The old "starvation still ends the game" regression went
flaky because famine's long tail repriced what a lucky windfall buys (real time now, not a delayed
instant); its dice are pinned, because it tests the mechanism, not the weather. And the escalation
check could be masked on rare maps by its own fixture capturing a neighbour of the target —
cheapening the route faster than escalation raised the price, which is incidentally a nice proof
that supply lines work. 522 checks, fifteen consecutive green runs.

---

## 2026-08-23 — Engine rework E3: expansion is the growth verb

**The free real estate is over.** The E2 bridge's runaway was live-confirmed by the owner — huts
handed out provinces as workers until the whole world was his before Bronze — and E3 tears the
scaffolding down: the hut and housing die wholesale, the settler timer dies, and the pop↔tiles
lockstep dies with them. Dominion now changes only by claim, capture and fealty.

**The 3-hex start ships explicitly.** A fresh run opens with the seat plus two adjacent land hexes
— the owner-ratified trio, one hex per resource possible from the first minute — granted at first
chart rather than emerging from the dead lockstep. No terrain-variety guarantee, deliberately:
wanting the forest you didn't get is the claim verb's first motivation.

**Claims are era-priced, and the price is an era-fact.** `map.claim` is validator-required on every
mapped era: Stone pays 25 food and 30 seconds — food and time only, because the first claim must be
affordable before wood exists — Bronze adds timber, Iron keeps its 6d pricing, and the route scales
everything. The settle line in the tile detail now prints the plan's actual costs (it printed
"undefined wood" on a food-only claim for about a minute) and stakes its ground in the era's own
noun.

**`S.pop` is a mirror now**: the floored hex sum plus the standing army, refreshed wherever
population moves. Every legacy reader — reveal gates, the levy cap, event scaling, `civilians()` —
sees the real population until E5 retires the number outright. The reveal spine moved from the hut
to the claim: the building tree opens as the dominion grows past its trio, and the capstones
re-priced against real people (bronzeAge at 25 souls, ironAge at 50 — usually unreachable without
claiming, which is the point). The Chronicle keeps its pulse, narrating arrivals in the era's own
words while the settlement is small and going quiet past 25 souls.

Verified live: trio start, two sim-minutes passing without a single unpaid hex, a hills claim
priced at 17 food (route-scaled down from 25) entering the Underway queue and burning down.
Claim completion, the mirror, era pricing and the runaway's absence are all pinned by the new E3
tombstone block; 513 checks green.

---

## 2026-08-23 — Engine rework E2: production flips, steppers die

**One economy, from the first minute to the last.** Production is now
`output = hex population × per-capita rate × terrain` in every era, and upkeep charges the people
who actually exist — the hex sum — plus the levied bands. Verified live to the second decimal: a
fresh board reads food −0.28/s (seven people, all resting), and turning the seat to food flips it
to +0.32/s (3 × 0.2 × 1.0 − 0.28).

**Deleted whole:** the jobs system and both manifests' job arrays, `assign()`, `idle()`,
`jobsUsed()`, `releaseOrder()`, `reconcileWorkforce()`, the Your People steppers, the "N idle"
ledger note, and the `allocation` and `outputMult` era-facts (allocation is universal; outputMult
existed to make tile-count impersonate population, and population is real now). The Your People
panel is a roster; a standing sentence says where the verb went, in the era's own noun: *"Your
people work the land they live on — click a clearing on the map to direct it."*

**The seat opens RESTING, against the plan's own suggestion.** Auto-assigning it to food would have
deleted the forage-or-die opening lesson — the first click of the game IS the lesson. The Chronicle
line now teaches the new verb: *"Turn your clearing to food, or they will starve."*

**The works table arrives at Stone** (the Iron table minus iron — the permanent shape, learned on
day one), and **Bronze redeclares the map to put the ores on the ground**: hills carry copper and
tin, tin at the scarce half-rate it always had, with a whisper of both on plains so a hills-poor
start is slow rather than dead. The era-transition modal now announces new WORK as the works table
widening, and a new validator refuses a works entry naming a resource that era lacks.

**Two things came forward from E5 because the harness caught them, which is the whole reason it
exists.** First: `consolidate` left every manifest — the bronze→iron fixture proved the pop-cut is
instantly undone by the dominion lockstep under dominion-never-shrinks, and cutting a number that
mirrors hexes changes nothing anyone can see. Borders are pure re-denomination, effective now, not
E5. Second: deleting `reconcileWorkforce` briefly reintroduced a shipped bug — deaths no longer
abandoned queued unit orders, so orders could complete for people who no longer existed and drive
`civilians()` negative. `reconcileReservations()` now carries that one duty, which was never about
jobs: newest orders abandoned first, refunded, narrated.

**The E2 bridge, dying in E3:** the settler timer still grants `S.pop`, and the lockstep converts
each arrival into a hex — the hut is temporarily the claim verb, which is at least funny. Roughly
520 checks green after the deepest harness rewrite this project has had; the stepper fixtures are
hex fixtures now, and a block of tombstone checks asserts the dead exports STAY dead.

---

## 2026-08-23 — Engine rework E1: population exists

**People live on hexes now.** Every owned hex carries a population that grows logistically toward a
carrying capacity its terrain sets — 8 on plains, 10 on river bottomland, 5 in forest, 3 in the
hills at Stone scale; three times that at Iron, because caps ARE the era production curve. The
header's POP is the sum of the hexes — the odometer, real at last — and every owned tile's hover
and detail print "People: N of CAP this ground supports."

**Nothing reads it yet, on purpose.** E1 is pure state: steppers still run the economy, so the
growth curve can be watched and tuned live before production flips onto it in E2. One knob
(`popGrowthRate`, r = 0.015/s), one formula (dP/dt = r·P·(1−P/cap)), fractional storage floored by
every reader, a snap for the logistic's asymptotic last hundredth so a full hex eventually reads
"8 of 8" rather than hovering at 7 forever.

Ten new checks (521): seeding, caps, growth, clamping, the odometer-is-the-sum, bit-identical
determinism, save round-trip, capture seeding, and the era cap curve. Getting them green found two
real traps worth recording: a mountain of test food is silently clamped to the 50-cap on the first
tick (so the "immortal" test settlement starved at t=417s exactly), and `save()` rightly refuses a
dead state — so a dead test run silently loads an EARLIER section's save. The fix was to keep the
observation settlement alive the way a player would: someone forages.

Live-verified precisely on the curve: at t471 the logistic predicts 5.4 people; the page showed
5 of 8 with the header matching.

---

## 2026-08-22 — Phase 10, slice 3a: you can see your own world again

**Zoom fix.** Framing the camera on the charted country had also *capped the
zoom* to the charted country, so a Stone player looking at seven known hexes
could not pull back far enough to see the board those hexes sit in. One number
was doing two different jobs. They are now separate questions: where the camera
**opens** comes from what the player knows, and how far it may pull **back**
comes from the whole board, fog included. Being able to look at the unpainted
world is the entire point of drawing it — *the world is wider than this* has to
be something you can go and look at. Max zoom distance roughly doubles (13.8 to
30.8 world units on a radius-4 board), which clears the far corner with margin.

Three things rode along, all found in the same few lines:

- **Atmospheric fog was going to eat the far edge** once the camera could pull
  back that far. Its near and far planes are now derived from the board size
  rather than fixed at 30 and 78.
- **Panning was unclamped**, so the focus point could be dragged off into empty
  space and the world lost entirely. It is now held over the board plus a
  margin — a port omission from the spike, which had this.
- **The camera no longer lurches mid-play.** Auto-framing is a courtesy, not a
  policy: the moment the player drags, zooms or pans, the camera is theirs and
  the stage stops moving it. Newly charted country still becomes reachable,
  because the *limits* keep refreshing even when the framing does not. An era
  turn is a ceremony and gets to reframe.

---

## 2026-08-22 — Design pause point *(DOCS ONLY — the hold)*

The day ends where it should: **feature development holds here, deliberately**, until the next UI
conversation resolves how the flipped board juggles its panels (the user has taken that question to
the Claude Design thread). `todo.md`'s STATUS block is the checkpoint: the day's full arc (identity
pivot specced and built same-day — engine rail, the map, the flip, Conquest Growth through the
growth verbs, 490 checks), the playtest brief the user verifies during the hold, the judgment flags
awaiting verdicts (the pulse, border pressure, growth pacing, subdue-vs-settle, boost-building
pruning, route feel, minor flavor), and the held queue in intended order (design verdict → balance
pass → 6e priests & envoy → phase 7 decision queue).

---

## 2026-08-22 — Phase 10, slice 3: one board, forever

**The world stopped being rebuilt.** Era view radii and the regenerate-on-tile-noun branch are both
gone, and every era now generates the same radius-4 disk. The real culprit was not the noun check at
all: Stone and Bronze declared `radius: 3` and Iron `radius: 4`, so the board a player learned was
thrown away at the border regardless. One board, forever — eras re-denominate what a tile *is* and
change what you can see and do on it, never what the world is. `map.view` is retired hard: a
manifest still carrying one now fails validation, because a silently ignored era-fact is exactly the
wrongness the validator exists to refuse.

**Fog is unpainted board.** Unrevealed tiles render flat, neutral, propless and markless, and cannot
be hovered or clicked — blank pieces waiting to be painted, not a military blackout, which would
fight the warm palette and read as the wrong genre. They are deliberately *flat*: real elevation
would let you read the mountain ranges straight through the fog. You always see the country adjacent
to what you hold, so Stone now opens on your own hex plus its ring inside a full 61-tile board, with
the rest falling away unpainted at the edges. Charting is sticky and additive, the interface's
reveals-never-flicker law applied to geography. The 2D debug view fogs identically — a debug surface
that leaks what the real one hides is worse than useless.

**The camera frames what is known, not a per-era number.** The view opens tight on your ground and
pulls back on its own as the fog retreats, so the era zoom-out arc falls out of discovery itself
rather than needing authored camera heights per age.

**Dominion never shrinks** *(owner ruling)*: a border may change what a tile means, never how many
you hold or which. Capture a hex in the Iron Age and you keep it through Enlightenment, where it is
worth an Enlightenment tile. Consolidation still fires at the **first** levy border — the moment
population stops being people and becomes places — and never again; `syncDominion` no longer trims
holdings to a shrinking population, and population follows the land upward instead. The harness
caught an ordering consequence: consolidation must run *before* `ensureMap()`, or the dominion is
granted at the old population's size and cannot be given back.

That one ruling dissolves the scale problem outright. Every scheme `map.md` once weighed for
carrying a dominion across a rescale existed to answer what happens to your land when the world
changes size — and the world does not change size.

Ten new checks (511), including that the ground is bit-identical across an era border, that
consolidation takes neither the count nor the specific tiles, and that unpainted board carries no
mark at all. *Flagged for the balance pass:* `removeSettler` is now inert in tile eras, so sickness
and raids need a designed tile-scale effect rather than a population number.

---

## 2026-08-22 — Phase 10, slice 2: the map becomes a lit board

**The SVG stage is no longer the game's surface.** `src/render3d/` renders the world as a lit 3D
diorama — merged vertex-coloured terrain with derived elevation, instanced props, ACES tonemapping,
HDRI environment lighting, sun shadows, SMAA and ambient occlusion — with an orbit rig you can
spin, pitch and zoom, clamped so the board is never seen edge-on. A board is a thing on a table,
and a table is looked down at.

**The port changed nothing downstream of selection, exactly as the seam survey predicted.** The
Selected Tile panel, its stats, its flavor, and its March / Caravan / Settle buttons are plain DOM
that never knew which renderer was upstream. About ninety lines moved: `mapSVG()` became scene
building, the stage click's `dataset.id` became plane-picking plus cube-rounding, and `attachTip`
became raycast hover driving the game's existing tooltip through a holder object — so the
positioning and viewport-flip logic stayed identical rather than being reimplemented for a canvas.
`signature()` survives untouched as the rebuild trigger.

**Marks are projected DOM text, not meshes.** The home glyph, seat names and work letters are HTML
positioned over the canvas each frame. Legibility outranks texture is a Bureau law that outlived
Bureau, and 3D text is unreadable at exactly the grazing angles this camera lives at. It also keeps
the map in the accessibility tree, which is most of what the old "why no canvas" argument was
really defending. Both renderers now read one shared `markFor` ladder, pinned by seven new checks
(501): the house glyph, a seat's diamond *and* name, a minor's dot and deliberate lack of a label,
each work letter distinct, and no mark at all on empty or unassigned ground.

**Three independent graceful degradations**, because a black board is a worse failure than a plain
one: no WebGL keeps the SVG stage, no HDRI falls back to a hemisphere rig, no postprocessing
renders straight through. `?map=2d` forces the 2D stage, which survives as the debug view and the
assertable surface. Libraries are vendored and pinned — no CDN at runtime — including a
non-obvious one: n8ao imports `Pass` from both three's addons and postprocessing, so that addon
had to come along too.

**`?glcheck=1`** sets `preserveDrawingBuffer` so an automated check can read the canvas after
compositing. Off by default; it costs real performance. This is the flip's zero-height lesson
carried into the renderer — DOM assertions pass happily against a page that draws nothing.

Verified against a real Iron world: nineteen marks placed (five minors, all four work letters,
three named seats), ten distinct tiles picked across a sweep of the canvas, and the River Kingdom's
March opening its muster modal. Not verified: how it looks — this environment does not composite
frames, so that is owner-eye QA by the revised `tech.md` contract.

---

## 2026-08-22 — Phase 10, slice 1: the run waits for a person

**The game no longer starts itself.** Boot now lands on a start screen — title, the one-line pitch,
Continue or New Game, and the world seed — and the clock does not tick until somebody says so.
Landing straight into a live clock read as sudden; a board you start is a board you sat down at.

The mechanism is a **fourth independent hold flag**, `preGame`, sitting beside `paused` (the
player's intent), `modalHold` (a modal asking something) and the hidden-tab stop, and composed the
same way: the loop steps only when none of them hold, and releasing one never clobbers another.
It defaults to *on* deliberately — a wiring mistake then shows a start screen nobody dismissed,
which is obvious, rather than running the clock behind a screen that failed to appear. Like `paused`
and `speed`, it is deliberately absent from the save: which screen you are looking at is not a
property of the settlement, so a reload always lands back here with Continue waiting.

A returning run gets a resume line in the era's own vocabulary ("Stone Age · 4h 26m · 6 settlers").
With no save there is nothing to continue and nothing to wipe, so the screen asks one question with
one button; the two-button form appears only when the choice is real. **New Game reloads rather than
rebuilding state in place** — `setS(freshState())` would leave every module-level render cache
holding the dead run (the map's `world`, `selectedId` and `lastSignature`, the Chronicle's DOM and
its reveals set, each panel's diff string), and a reload cannot leave any of them stale. A
sessionStorage flag survives that reload so the fresh run skips the screen instead of asking a
player who just answered.

Four new checks (494), asserting the composability property rather than the flag's existence:
pausing does not disturb the hold, a modal does not either, and starting the run releases that flag
and only that flag. Verified live end-to-end — held at t15 across two seconds with the tab visible
and unpaused, running again the moment Continue was pressed.

This is slice 1 of seven in the Phase 10 build order (`todo.md`), taken first because it is cheap
and because it isolates a boot-flow state-machine change while the map is still stable — and
because slice 5's continent picker is content for this screen rather than a new surface.

---

## 2026-08-22 — Phase 6d: the growth verbs

**The dominion finally spreads.** Three verbs, one destination — owned, +1 holdfast, turned to
bread by the standing default. The **minor tier**: five seats per iron world, hand-authored names
drawn from a pool that outnumbers them (Askel's Steading, the freehold at Coldwater, Thornwick…),
stats rolled in authored ranges, placed by the seeded generator; their living remnants (walls,
stock) persist in `S.map.minors`, and ownership trumps the regenerated seat — which is exactly what
lets a capture survive the save. **Capture**: campaigns take a unified target ref through one
resolver and one muster modal; against a minor the same walls-then-field sequence runs, but victory
is fealty, not plunder — the whole stock comes home and the Chronicle records the name for the last
time. **Settle**: empty land is claimable as queued, priced work ("Settling the forest" behind your
buildings in Underway — the queue's seriality as the anti-speedrun governor, exactly as ruled), and
honestly wasted if the ground is taken first. **Supply lines**: `routeCost()` walks the whole
dominion at half a step, unowned land at one, water at three (slow, never impossible — an island
seat can't deadlock a run); time and provisions bend by the route for majors, minors and settling
alike, printed on every tile detail. Conquering a line toward a rival is now literally building a
road. Thirteen new checks, 490 total, first-run green; one flavor collision fixed on sight (a
"walled steading" band over a wall-less seat — descriptions are mechanics-bearing text).

---

## 2026-08-22 — The flip: the map is the game's main surface

Phase 9's structural half, pulled forward by user ruling so the growth verbs land straight into
their real home. The 4×2 grid — the shape the game has worn since the wireframe — is gone: the map
is a full-bleed stage with the era-tinted desk as its ground, and everything else floats over it.
Left: Your People, then Train/Build/Upgrade as one tabbed panel. Right: the Selected Tile panel
(the map's click target, the one panel sanctioned to hide) above the Chronicle. Bottom: Underway,
cards running horizontally. **The Expeditions panel is dissolved**, as canon always said it would
be, and the Map button with it — the map is not a place you go, it is where you are.

Rode with it: **era-scoped view radii** — Stone shows a single hex (the ground you happen to be
standing on), Bronze widens to the ring around it on the same world, Iron recuts a country. The
world literally growing with the ages is now the scaling story told visually, from minute one.
Structure came from the Claude Design sketch; **Bureau stays as the interim skin and is formally
under review** — the identity question goes back to the design thread with the flipped structure
as its brief, with "the war table" (campaign maps are paper) logged as one candidate. 476 checks;
live-verified at both ends: one large hex at Stone, a country of 61 with allocation and muster
flowing through the floating panels at Iron.

---

## 2026-08-22 — 6c.1: soft menus, honest buttons, the chart from frame one

Three same-day rulings from live play. **Every ground works everything, at rates the terrain
sets** — works became rate tables (river bottomland ×1.2 food, hills' stone-and-iron double at par,
everything else an overpay route), restoring the board-gamer's right to take the suboptimal path on
purpose. **The map's seat actions carry the panel's refusals** — found in play as a silent no-op
without a Muster Ground; March and Caravan now disable with the reason printed beneath them. **The
chart walks back to frame one** — the map spec moved into the STONE base manifest and Bronze
inherits the identical world (same noun, same seed, bit-identical, harness-asserted), which means
one layout for the whole game, no era-gated UI machinery ever, and map-primary becomes continuity
rather than a reveal. 476 checks.

---

## 2026-08-22 — Phase 6c: the Iron economy moves onto the map

**The allocation verb re-denominates.** Iron declares `allocation: "tiles"` and zero jobs: you stop
assigning people with steppers and start assigning holdfasts on the map, each owned hex worked
against its terrain's menu (plains/river → food, forest → wood, hills → stone *or* iron — the one
multi-choice, and therefore the tile worth fighting over). Each worked tile produces at the old
per-worker rate × outputMult, so pop == tiles carries every total and cost across unchanged.
**Population is tiles now, enforced**: entering Iron grants a dominion block of nearest workable
hexes matching the consolidated count, and losing a holdfast drops its newest hex — never the seat.

**Storage caps retired at Iron** (user ruling, inside the scheduled window): every resource
uncapped, the storage line gone from the manifest with stocks vanished by narrated migration ("The
crown stops counting sacks"), rot hints out of the slate, the ledger demoted to bare values. The
friction hands off to the conquest economy itself. **The map's interaction pattern locked**: hover
previews through the game's one tooltip; click opens details, where all stats, flavor and actions
live — allocation buttons on owned tiles with ink work-glyphs on the hexes, March/Caravan on seats.
The pattern survives the node network unchanged. Two forward rulings recorded for 6d: wilderness is
claimable (settling is queued, timed, priced work — the queue as anti-speedrun governor), and owned
hexes will make campaign routes cheaper — supply lines as route math. 475 checks; live-verified.

---

## 2026-08-22 — Phase 6b: Conquest Growth G1

**Growth is a verb now.** Three inheriting era-facts — `growth`, `levy`, `outputMult` — with
validator teeth (a conquest era without a levy rate is a load error). Iron is conquest-grown: no
one arrives unbidden, the growth line becomes a standing sentence, and the POP ledger row demotes
to a bare count — no cap, because there is none; no rate, because nothing ticks (user ruling,
made mid-build). **Units are levied, not consumed**: civilians *is* pop, capacity is holdfasts × 2
with the refusal reason in the tooltip and a live `levy 3/8` line on the card, unit deaths stop
erasing population, and upkeep charges holdfasts and bands explicitly at holdfast appetite.

**Deep consolidation, offset by output**: keep 0.25 × outputMult 4 ≈ 1, so throughput and every
existing cost survive the border while the count drops to a handful of holdfasts that each
matter. Two rulings the build produced: the timer→levy border **separates units out of the
incoming pop exactly once** (the harness caught the double-count), and **the fighting bands are
not consolidated at a levy border** — they are no longer population, so the keep ratio has
nothing to say about them. **Housing retired at Iron**: the hut line — the first founding
building — removed outright, stocks vanished by narrated migration ("No one will count roofs
again"), `housing()` uncapped under conquest. The Longhouse never happens; the ladder ends at the
Stone House. Old iron saves separate their units once at load, narrated. 475 checks.

---

## 2026-08-22 — Phase 6a: the map exists

**The game has a map.** A place-graph of pointy-top hexes — model in `src/map/model.js`, consulted
only through `neighbors()` and `distance()` so the Space border's node network is someday a new
generator, not a new game. Geometry regenerates from a sub-seed at every load (*a world is a
number*); the generator draws from its own rng stream so rebuilding the map can never advance the
game's dice — the harness asserts it. Regeneration is keyed on **the tile noun changing**: Bronze
inherits Stone's clearing and gets its chart inert and early (a Map button appears in the chrome —
the capability announcing itself), while Bronze→Iron recuts the world at holdfast scale and seats
the three majors on it, on land, spread apart. Clicking a seat reads the adversary; clicking ground
reads the terrain. A telling surface — it does not hold the world.

One generator lesson paid for immediately: the first cut used noise + majority smoothing, and its
first live map came out 44 plains / 2 hills / 0 river — a starved economy, since terrain becomes
the yield system in 6c. Seeded **blob growth** replaced it the same day: every terrain's share is
structurally guaranteed on every seed, and the harness now checks the guarantee rather than the
luck. Fourteen new checks, 461 total, green across a five-seed sweep.

---

## 2026-08-22 — Phase 5: asking modals hold the world

**The modal-hold seam, built for what's coming.** `openModal()` grew an `opts` bag — deliberately
extensible, because the phase-7 decision queue adds its keys (designed defaults, dismiss-to-tray)
without another signature change. `pause` defaults true: an asking modal freezes the simulation
while open, closing releases it, and the hold composes with the player's pause and the hidden-tab
stop as three independent flags, so each releases without clobbering the others. Anything a modal
can render — steppers, choices, prose — can now ask the player to think for as long as they like
at zero cost to the world. The ask/tell rule shipped with one extension now canon: **the ceremony
register holds too** (era transition, game over) — stillness is part of the weight — while the
Info reference, browsed during play, is the one telling modal.

**The header learned its new job.** Pause and speed became a grouped transport instrument beside
the clock (2px borders against the utilities' 1px — weight, never opacity), Reset stands alone at
the far edge, and the number row 1–5 sets speed directly. The old "speed is a dev tool, lock it
before release" policy is fully dead. Seven new checks (447 total); live-verified: ticks frozen
under the reset confirm, running under Info, released on close.

**This closes the harness-green rail (phases 1–5).** Five phases, each landed with the suite
green: modules, the seed, the death of offline, the tick clock, controls. The engine the pivot
specced now exists; what remains is content — Conquest Growth, the decision queue, the map.

---

## 2026-08-22 — Phase 4: the clock is a count

**`S.tick` is the master clock.** `step()` takes no argument: one call, one tick, exactly
`TICK_SECONDS` of world time. The subsystems keep their per-second authoring — the `dt` they
receive is simply the same constant every call. The main loop became a metronome (each fire runs
`speed` ticks; wall time is never measured), which deleted `Date.now()`, the `last` bookkeeping,
and the visibility re-anchor dance in one stroke: interval jitter and background throttling now
bend the game's *pace* a hair rather than its math, because a skipped fire is a tick that never
happened. `S.playtime` died; `playtime()` derives from the count, and legacy saves convert their
seconds to ticks once at load — a 4h26m save arrived live as t79,831.

The header clock now reads both — `4h 26m · t79,831` — the raw tick count added by explicit
request as a debugging readout: with a seeded, tick-counted sim, *what tick did it happen on* is
the coordinate a bug report wants. With this, the phase 2 promise completes in the browser: **seed
+ tick count + actions = bit-identical state**, everywhere, not just in the harness. 440 checks.

---

## 2026-08-22 — Phase 3: offline dies

**The clock runs while you're looking at it.** `simulateOffline()` is gone whole — the catch-up
loop, the while-you-were-away summary, the halt-on-death machinery — along with the
`SIM`/`SIM_STOP` flags, `lastSeed`, `CONFIG.offlineCapHours`, the `dt > 2` clamp, and all twelve
`if (SIM)` branches: every place the simulation had to ask *is anyone watching?* before speaking.
The Chronicle now always logs, `advanceEra` always opens its modal, and `step()`'s death paths
always call `die()` instead of halting a phantom catch-up. Deleting the offline layer was a net
simplification, exactly as predicted when the pivot was specced.

What replaced it: hiding the tab stops the simulation outright and commits a save; returning
resumes automatically, with a manual pause kept as a separate flag that survives the round trip.
`pagehide` replaces `beforeunload`; every player action (assign, build, cancel, launch) commits
the moment it changes state — **save is load-bearing now**, because the world stops when the
player does. `hardReset`'s listener juggling became `suppressSaves()`, closing the same
rewrite-the-wiped-save bug v3 fixed once before, reborn on a new event.

Ten new checks (435 total): the deletions asserted so the machinery can't creep back, a build
round-tripped mid-construction through the real save/load path and finished by the revived save,
a campaign round-tripped mid-flight and resolved on schedule with consequences.

---

## 2026-08-22 — Phase 2: the seeded RNG

**Every die now comes from the seed.** `src/core/rng.js` puts mulberry32 behind one `rng()`
function; `S.seed` is the run's permanent identity (crypto-minted at world creation, surfaced on
the console at boot and as a World Seed stat on the game-over screen), and `S.rngState` is the
stream's position — advanced by every draw, carried in the save, so a reload resumes the dice
mid-sequence. All 16 draw sites route through it: Conflict's three rolls, the raid and casualty
draws, event triggers and negation, and the seven expedition rolls. Old saves inherit a fresh seed
through the existing defensive merge; no migration, no schema bump.

`Math.random` now appears nowhere in `src/`, and the harness *enforces* that with a source scan —
a stray global draw would be invisible wrongness: it works, it just silently breaks replay. The
harness's forty-four `Math.random = …` monkey-patches (which stopped working the moment the game
stopped listening to the global generator) became `setRngSource()` calls against a designed test
seam. Five new checks bring the suite to 425, headlined by the phase's acceptance test: **same
seed + same actions = bit-identical state** — already true at harness scale, since the harness
steps a constant dt; the browser gets the same guarantee when phase 4's tick clock lands.

---

## 2026-08-22 — Phase 1: the module split

**`game.js` is gone; 26 ES modules stand where it stood.** The 3,409-line single file — the last
artifact of the retired `file://` double-click promise — split along its own section banners into
`src/{core,content,sim,ui}/` plus `main.js`, exactly per `tech.md`'s Module Structure, in two
commits designed so a failure could only mean one thing: first the slice, proven green through an
interim loader that rebuilt the old single-scope program by concatenation (all 420 checks, plus a
live browser session — boot from an existing save, steppers, modals, pause, zero console errors);
then the harness bootstrap itself, which dropped its `vm.createContext` sandbox and appended-text
export hook for real imports of the same 25 modules the game runs, behind one Proxy whose single
legal write is `api.S`.

The only code deltas are the ones ES modules force: live bindings are read-only outside their home
module, so five cross-module reassignments became setters in `core/state.js` (`setS`, `setSIM`,
`setSimStop`, `setLoops`, `setUpgradeTab`). Two invariants came out of the work and are documented
at the sites that enforce them: **`content/compile.js` must be every entry module's first import**
(entered any other way, the `lib → combat → compile` cycle runs compile's manifest build while
`EVENT_LIB` is still in its temporal dead zone — the harness found this the honest way), and **no
core module may import `main.js`**, whose body is `boot()` and would start the game mid-link.
`package.json` (`type: module`, zero dependencies) arrived for Node's benefit; the browser never
needed it.

---

## 2026-08-22 — The docs pivot *(DOCS ONLY — no code shipped)*

**The game stopped being an idle game.** The old contract was *the game never needs you*, and it
turned out to ban every interesting decision, because a decision the player might not be present
for is a decision the game "needs" them for. The replacement bans only **loss**: nothing expires,
nothing decays, nothing is missed, no reward is forfeited by being away — and within that, the game
is meant to be *watched*. The clock now runs only while the page is visible; **offline progress,
catch-up and background running are slated for removal outright**. Pause and fast-forward are
promoted from developer affordances to first-class player chrome (pause is how you think, speed is
how you get on with it), modals that *ask* something pause while modals that *tell* you something
don't, and decisions presented by the world sit patiently until you reach them. The old law
*resolution never creates a window the player must catch* survives untouched — it was always about
expiry, never about waiting. A consequence worth stating: "Idle Civ" no longer describes the game,
and renaming is a live open question deferred until the pivot is implemented and playable.

**The documents were restructured around it.** `design.md` was rewritten with *Time, Presence &
Pause* as the section every other system now rests on, and with historical notes kept only where
the reasoning behind a reversal is still load-bearing rather than as a log of every decision ever
taken. `map.md` and `interface.md` were split out as documents in their own right — the map arc and
the interface system had both outgrown being subsections of the design doc. **`CHANGELOG.md` (this
file) was split out of `todo.md`**, which had reached 999 lines with roughly half of them a
version-by-version shipped record crowding out the working plan. `deleteme.md` and
`interface-brief.md` were retired: the live questions in them were promoted into canon, the rest is
history and the files had become a place where settled things went to look unsettled.

**Two ladders became one, in a follow-up pass the same day.** The design had carried a *population*
noun ladder (Person → Family → Holdfast → City → … → System) while `map.md` proposed a *tile* noun
ladder, and they collided at Iron where both wanted the word **holdfast** — a collision that had
already forced a defensive rule into `design.md` reserving the name for population and pushing siege
flavor elsewhere. A name you have to defend is a name two concepts are fighting over, and this fight
was unwinnable: from Iron onward *every* rung of the population ladder was already a place. The
ladders merged, **the tile became the game's anchor noun**, and *holdfast* was promoted rather than
renamed. Population stays a real, small, assignable lever for Stone and Bronze — the one stretch
where a person and a place are genuinely different scales — and from Iron it simply *is* the count of
places held, allocated per hex against terrain.

Three long-open questions closed with it — one of them wrongly at first, and corrected the same day.
The allocation verb (assign a production unit to a resource) turned out to be **permanent, not
retiring**: it re-denominates from people-with-steppers to holdings-clicked-on-hexes, and only the
noun and the widget change. Calling it a retirement would have left the Iron economy with no decision
between conquests at all. Also closed:
**the map regenerates when the tile noun changes** and only then, carrying dominion forward as a
narrated pre-owned block (persist-and-extend was rejected because consolidation would force the owned
region to *shrink* exactly as the world grew); and **captured tiles do have economic identity**, via
terrain yield, because once population is tiles, terrain is the only thing left making one tile worth
more than another.

One thing was added rather than removed: **the odometer** — a single running count of individual
beings under your control, derived (`Σ tiles × soulsPerTile`), never stored, never a lever, and
permitted to reach the trillions. It exists because every *playable* number stays between 3 and 50
and the interface never changes shape, which is the design's own stated risk of the late game feeling
samey. It is an odometer rather than a score: you cannot act on it, it gates nothing, and it moves in
jolts when you annex something — so a player who idles watches it sit perfectly still. It is also the
one display in the game permitted number compaction, which is recorded as a deliberate exception
rather than the small-numbers pillar quietly eroding.

Flagged, not solved: **Bronze→Iron now carries seven simultaneous changes** — housing retires, free
growth ends, units become levied, population becomes tiles, the map rescales, the job steppers give
way to per-hex allocation, production moves to terrain. That is a genre change mid-game. It is deliberately not spread
across two borders, because the story it tells (you stop being a village headman and become a lord)
deserves to be one moment; the mitigation is to ship the map *early and inert* in Bronze, so it is
familiar before it is load-bearing.

No code shipped in this pass. The build is exactly where **v18.1** left it.

---

## v18.1 — The time-capsule click

Second click bug from the same playtest, different cause: Archers and Horsemen wouldn't train in
Iron while Soldiers and Siege Engines would. A buy card's click listener captured the def object of
the era it was *created* in — cards born in Bronze (the player fielded archers there) still called
`build()` with the bronze-era def, whose cost names a resource that no longer exists. The display
path reads the active manifest, so the card showed iron prices and looked buyable; only the click
was stale. Soldier never broke (cost identical in every era) and Siege Engine never broke (born in
Iron) — the exact symptom pattern. Fix: resolve the def by id AT CLICK TIME via `defById`, which
answers with the active era's version. Verified live with the true repro: bronze-born cards clicked
in Iron queue both units and pay iron, not bronze. (Also covers the latent Stables case, hidden
behind its Maxed state.)

---

## v18 — The Bureau interface

**The click-eater, found and killed** — the oldest bug in the project shipped alongside the
redesign: buys sometimes took 2–3 clicks. Cause: the three buy-card renderers rewrote
`card.innerHTML` on every 200ms render tick, and a click is not instantaneous — mousedown landed on
a child span, the next tick destroyed it, mouseup landed on its replacement, and the browser dropped
the click because the pressed element no longer existed (~50% of presses straddle a tick). The
steppers never suffered because they update stable nodes — which was already the codebase's stated
rendering law; these renderers had violated it since v1. Cards now build a skeleton once and update
via `textContent`/`classList` only; cost spans rebuild only when the part-count changes (era
re-pricing, capped flips). Verified live: child nodes survive 20 render ticks identically.

**The redesign itself.** The interface commissioned in `interface-brief.md` came back and went in,
wholesale. `styles.css` rewritten around a token palette (the prototype authored every value
inline; we have a stylesheet, a per-era desk, and nine more ages coming), `index.html`
restructured, the render layer reworked. Four decisions reached past styling and account for most
of the work: **opacity retired as a state channel** — unaffordable is now a lighter border and
nothing else, because most cards spend most of their life unaffordable and *reading* them is how
players plan; **descriptions moved to hover**, carrying the refusal reason ("Short 9 wood.") and
computed at hover time rather than baked in, since cards update in place; **population moved into
the ledger** as `POP 6/6 · 2 idle`, killing two sentences that a red at-cap number says better; and
**the board acquired materials** — per-era desk, era badge plate, and a different paper stock per
column (cork / graph / dot grid / legal pad). Components: segmented steppers, icon+count tiles,
Available/Owned tabs on Upgrades, maxed buildings sinking to the bottom of Construction, and
Chronicle entries on ruled lines with a severity mark in the gutter that survives both skimming and
colour blindness.

Two structural changes rode along. **A founding pillar was rewritten**: the board is now whole from
the first frame and only its *contents* unravel — the old rule was calibrated for a pen-on-paper
wireframe where an empty panel and a full one were the same hairline box, and Bureau's named ink
headers and per-column stock removed that premise (see `design.md`). And a **speed control**
(1×–12×) landed first, deliberately, because it makes every subsequent playtest cheaper; it runs N
ordinary steps per tick rather than one oversized one, so nothing in the simulation can tell the
difference. Measured at exactly 12.0×.

Eight pieces of live human feedback were folded in afterward: cost lines that overflowed instead of
wrapping (a real bug — a hidden resource means you can't see why a purchase was refused), the
ledger becoming an aligned grid with proper rules, a doubled rule where rows met, a dot grid that
had silently never rendered (`background-image` rejects the `background` shorthand's position/size
syntax), rulings strengthened now that nothing sits on them unboxed, stronger post-it tints,
steppers centred against the whole row, and corkboard — parked earlier the same day as an idea with
no home — spent on the one column that lacked a material of its own. Shipped to GitHub Pages.

---

## v17 — Unit re-denomination

The population ladder is live: what one unit *means* now scales while the number never does. Stone
counts settlers; the Bronze transition relabels them 1:1 ("You count your people in families now."
— pure text, proven pacing untouched); the Iron transition **consolidates** — `consolidate: { keep:
0.7 }` on the delta, the playtest flex dial — floored per unit type (never below what's deployed
abroad), civilians and units summed back into pop so the books can't desync, jobs floored alongside,
all narrated: "Families band together behind shared walls — your people now count themselves in
holdfasts." Every noun-bearing surface reads from the manifest now: the person tile
(Settler/Family/Holdfast), the growth countdown ("Next holdfast joins in 45s."), arrival lines ("A
holdfast swears fealty to your banner."), training costs, the offline summary, and a diff-derived
era-modal line. Verified live across both borders in one run: 10 settlers → 12 families (growth
during the build) → snapshot 23 families → 14 holdfasts. 422 checks, 20/20 runs.

---

## v16 — Siege & Fortifications

Adversaries carry a second number beside strength — `walls` — and combat now sequences: the walls
fall before a single defender does. Wall damage **persists** in the living remnant
(stock-not-economy, extended to stone): a failed assault is a retreat with at most one loss, but the
scars stay carved, so hard targets become sagas — live-verified as one: wall-power 16 vs the
Kingdom's castle at 26 bounced but left it at 10; the second column breached ("The battered walls of
the River Kingdom finally give way."), won the field, and carried home 96 gold at the price of one
Soldier. Siege Engines train behind a cap-1 Siege Workshop, hit walls at ×6, and are ordinary units
everywhere else, home defense included. Fort tiers are pure flavor per the law — the Nomads' wagon
laager, the Clans' timber palisade, the Kingdom's stone-walled castle — cross-cutting disposition so
the slate doesn't template. Cards narrate damage ("Their walls are battered" / "lie in ruin"); the
campaign modal carries the numbers. 404 checks, 20/20 runs.

---

## v15.4 — Queue-card type icons

The dashed expedition border is gone (playtest verdict: hated it, and the mix wasn't confusing
anyway). Every Underway card now opens with a tiny line-art type marker in the game's doodle style —
hammer for builds, sword for campaigns, coins for caravans — so the eye sorts the panel without
reading. Cards share one uniform border; the missing cancel × remains the expeditions' only
structural difference.

---

## v15.3 — Expedition legibility pass

All four playtest asks, plus two design laws. One campaign AND one caravan can now be out at once —
parallel tracks, never two of a kind. Expeditions show as cancel-less progress cards at the top of
the queue panel, which the Iron Age retitles **Underway** (one manifest line — the machinery keeps
paying). Campaigns launch through a modal: the target's description, muster steppers, and a live
strength estimate — the era's biggest decision got its ceremony, and the cramped panel steppers are
gone. Caravans stay one-click on safe roads, but when a warlike neighbor is Hostile the send opens
an escort modal: escorts don't lower ambush odds, they *decide* ambushes — fight through and the
trade completes; lose and the cargo goes with a guard. Trading at Wary now returns "…counted out in
silence under armed watch. They have not forgotten." — the rep system hinted through narration,
never printed. And two laws recorded in `design.md`: **flavor is load-bearing** (strength is hinted
via description, not odds — so adversary descs are mechanics-bearing text and must stay truthful),
and the standing system narrates rather than displays. 389 checks, 20/20 runs.

---

## v15.2 — Converter rates in the ledger

The resource bar now shows what's *actually happening* to each pile: `ledgerRates()` folds live
converter flows into the displayed rates — outputs positive, inputs negative — using the same three
clamps as `runConverters`, so a starved or storage-capped Forge honestly reads as stopped rather
than advertising its theoretical speed (user call: the red number should scan as "problem" — and it
does, via the existing pos/neg coloring). The input clamp counts incoming production alongside
stock, so the designed 2:1-miner equilibrium displays as it deserves: copper and tin quietly netting
zero while bronze flows at +0.10/s. The simulation itself is untouched — `rates()` stays gross and
`step()` unchanged; folding flows into the real rates would have converted everything twice. Iron
era included free: steel shows its flow and wood shows mining minus the Forge's burn. 378 checks.

---

## v15.1 — QoL from live testing

Owned one-time upgrades sort to the bottom of the Upgrades panel (buyable and queued stay on top,
manifest order within each group), so what's still purchasable is never buried under a pile of
"Permanent." cards. DOM only reorders when ownership actually changes, preserving the create-once
card pattern.

---

## v15 — Adversaries & Expeditions (C2)

The game's first outward-facing verbs. The Iron Age declares three named neighbors — the warlike
Hill Clans (weak, fight as a massed charge), the strong peaceful River Kingdom (deep gold, buys
food), the middling Salt Nomads (buy iron) — each a static stock + strength + disposition,
wholesale-declared like the slates and validated like everything else. Build the Muster Ground and
the Expeditions panel unravels in beneath the Chronicle (which gives up its double-row span — no
panel cut, no toggles). One expedition at a time: muster any mix of fighters and **march** (the
existing combat math pointed outward, counter-vs-fighting-style included, provisions paid up front,
and the walls genuinely thinner while they're gone — deployed units neither defend nor die at home),
or send a **caravan** in fixed lots against a partner's actual gold stock, which depletes — and the
goods you sell them join their stock, where a later campaign could steal them back; the game never
mentions this, it's simply true. Standing is one number read as a word with exactly three
consequences: Hostile warlike neighbors raid you 1.5× more, Hostile peaceful ones refuse your
caravans, Friendly partners pay 25% over. Everything resolves in `step()` on the world's schedule —
no catch windows, offline-safe, Chronicle-narrated. Live verification produced an unscripted proof:
while a test caravan was on the road, the Hostile Hill Clans raided the thinned town and killed two
fighters the next muster was counting on. The gold economy now closes: heirloom seed →
trade/plunder → Iron Tools/Weapons/Armor, with the future capstone's gold cost waiting on the far
side. Also: `[pacing]` console stamps at capstone start/finish/cancel (playtest aid). 365 checks,
20/20 runs.

---

## Design consensus — Adversaries & Expeditions *(documentation only — no code changed)*

Born from a candid worry that the game felt passive: every existing verb points inward (allocate,
build, upgrade, train), leaving the player the object of the simulation's sentences, never the
subject. The answer sharpened the idle contract into what was then its final form — the world never
interrupts the player, but the player may act *on* the world at any time, with resolution always
self-applying and landing in the Chronicle. Set in stone: **resolution never creates a window the
player must catch** (a claim button is an interactive event wearing armor). Adversaries are
manifest-declared counterparties that exist only to the extent they can be interacted with — a
static stock (not an economy), a strength, a disposition — refreshed free at era boundaries because
manifests redeclare them. Campaigns and directed trade become Iron's deepening mechanic, reusing the
existing combat math pointed outward, with "the army isn't home" as the core passive trade-off.
Interactive events were also formally killed and moved to out-of-scope in this same arc: the settled
identity is idle Age of Empires, not active Civilization.

*(Both halves of that identity have since moved: the "never interrupts" contract was replaced on
2026-08-22, and "idle Age of Empires" had already drifted to lo-fi Civilization by then. The
catch-window law is the part that survived intact.)*

---

## v14 — The Iron Age economy (C1)

The game has a third era, and getting there is the first transition with teeth. The `ironAge`
capstone (bronze manifest: pop ≥ 16, an Archer or Horseman fielded, 400/400/400 + 50 bronze, 180s)
flips into an era where the alloy economy is *gone*: copper, tin, bronze, both ore jobs, the Ore
Yard, and four stranded upgrades all retire — and the machinery earned its keep. The delta compiled
validator-green on the first run; the era modal derived the whole story itself ("No longer needed:
Ore Yard, Flint-Tipped Spears, Bronze Tools, Bronze Weapons, Scouting, Iron Age"); the DOM purge
swept every dead card, row, and tile; and the Chronicle narrated the collapse: the copper road falls
silent, no tin comes up the river, and your suddenly-antique bronze sells to collectors at 1:4 —
seeding **gold**, the era's genuinely new idea, which no job can ever mine. Iron mines at full rate;
the Forge persists retargeted (3 iron + 2 wood → 1 steel — wood's first late-game sink); Iron Yard
and Treasury store the new stocks; Iron Tools/Iron Weapons/Steel Armor extend the tiers (armor is
now lowest-wins like weapons); Longhouses hold 7 and the Village becomes a Town. Owned bronze-era
upgrades keep working forever — a bought trait reads from state, not the shop shelf. Iron's gold
sinks deliberately exceed the heirloom seed: expeditions (C2) are the era's real gold supply,
landing next. Harness: 318 checks, 20/20 runs.

---

## v13 — Transition machinery (Phase B)

The manifest architecture is now complete and waiting on its first real consumer.
`validateManifests()` runs at load against every compiled era and throws with a full problem list on
any within-era dangling reference — cost keys, converter recipes, storage/boost buildings, job
resources, unit counters, event counters — which is what makes *removal* safe to author: retire a
resource and everything still mentioning it becomes a load-time error instead of NaN production.
`advanceEra()` grew the full transition sequence: a frozen pre-flip snapshot archived in
`S.eraHistory` (kept forever, never nested), a migration runner whose `vanish`/`convertTo`/`fn`
instructions read only the snapshot (instruction order provably can't matter — the harness runs an
`fn` against a value an earlier instruction already zeroed), workers on removed jobs returning to
idle with a Chronicle line, and a DOM purge that removes the cards/tiles/rows of ids that didn't
survive — the one sanctioned exception to "nothing can un-reveal," live-verified by watching the
capstone's card vanish at the flip. The era modal is now fully derived from `manifestDiff()`:
renames ("The Hut is now the Stone House."), the housing rise, panel-title shifts, new resources and
work, "Now available," and a new "No longer needed" section; `ERA_TRANSITIONS` keeps only the
hand-written flavor lead. Stone→bronze declares zero migrations, so today the machinery mostly
proves itself in the harness (281 checks, 20/20 runs) — the Iron Age is where it earns its keep.
Adding an age is now: write one delta, write one lead sentence, read the compiler's and validator's
complaints until they stop.

---

## v12 — The Era Manifest Architecture, Phase A

The entire content layer is rewritten: the Stone Age is a full base manifest (resources, jobs,
buildings, upgrades, units, raid types, era-scoped values, and wholesale `events`/`hints` slates),
and the Bronze Age is a **delta** — remove the capstone, override three defs, add its content,
redeclare its slates. A compiler builds both into full manifests at load and **throws before a frame
renders** on any dangling id: unknown remove/override targets, duplicate adds, missing or misspelled
slates. Everything the engine or renderer reads now goes through `active()` — flipping `S.era` swaps
the whole world in one assignment. The old era scatter (`names`/`descs` maps, `era`/`untilEra` tags,
`eras` allowlists, `ERA_NAMES`, `HOUSING_PER_HUT`, `PANEL_TITLES`, era checks inside reveals) is
gone; era-gating is now *membership* — bronze content isn't hidden in stone, it doesn't exist there.
The era modal's "Now available" list is a manifest diff, so it can never go stale. Zero state-schema
change: old saves load untouched, and the whole thing was verified live — fresh stone game, real
capstone build → era flip with all nine additions in the modal, forge smelting, and a bronze-era
save/reload (offline catch-up even ran the Forge during the gap). Harness rewritten against
manifests + a new compiler suite: 255 checks, 20/20 runs. This is the machine that makes new ages
cheap: authoring the Iron Age is now writing one delta and reading the compiler's complaints.

---

## v11 — Free timed population growth

The wanderer event and its escalating food price are gone. Settlers now arrive free, every 45
seconds (`CONFIG.settlerIntervalSeconds` — deliberately a single dial), whenever housing has room;
progress **freezes** rather than resets while housing is full, so a partially-waited arrival lands
soon after a new hut. Housing is now the sole lever on population and food's pressure lives entirely
in upkeep. The Your People line became a countdown — strictly more informative than the old price
tag. Verified live: 50 seconds at pop 3→4 cost 6.2 food (pure upkeep; the old model would have
charged a lump sum on top, up to ~500+ at high pop). The whole invisible-food-sink bug class dies
with the purchase model, and the harness asserts the excision is total: no wanderer event, no
`growthCost`, and a cap raise can never again trigger a hidden spend. Hardening the new cadence
tests also surfaced two *pre-existing* flaky tests (a rare raid could starve the capstone test's
settlement mid-build; a rare sickness could shift the soldier-training counts) — both now run under
forced-miss RNG, and the suite passes 20/20 runs. 229 checks.

---

## Design consensus — free growth + the Era Manifest Architecture *(documentation only — no code changed)*

Two connected decisions, both born from the invisible-food-sink investigation. First: settlers become
free and timed — the food cost is abolished, growth leaves the events system entirely, and housing
becomes the sole lever on population. Second, and much larger: with the Iron Age intending to
*remove* the whole bronze economy, the era-tags-on-global-content approach was headed for a
palimpsest, so the architecture inverts — each era declares a complete **manifest** of everything
that exists while it's active, authored as a delta against the previous era, with absence-as-removal,
snapshot-based migration instructions (the `rescale` primitive covers everything from melting bronze
into iron salvage to eventually re-denominating billions of citizens into colonies), a boot-time
validator that turns this project's signature silent-wrongness bug class into loud named errors, and
an era modal whose factual lists derive from the manifest diff so they can never lie. Full contracts
in `tech.md`; rationale in `design.md`. Sequenced as parity-refactor → transition machinery → Iron
Age, so engine risk and content risk never travel together.

---

## Post-Bronze playtest fixes

**Bug fix: `idle` could go negative.** Reported from a full Bronze-age playthrough — the idle count
displayed **-1**, and clicking a job's minus button then "absorbed" the deficit, which looked like a
worker being deleted. Root cause: a civilian can be committed in two ways, assigned to a job *or*
reserved by a queued unit order, and the death handler only balanced against jobs. A death while a
Soldier sat in the queue therefore left the books short by exactly the reserved worker. Replaced
with `reconcileWorkforce()`, which balances against jobs *and* reservations, releasing workers first
and then — if more orders are queued than there are survivors to fill them — abandoning the newest
orders with a full refund. Writing the repro also surfaced a second, unreported bug:
`removeSettler()` could push population below the number of trained units, making `civilians()`
negative; it now no-ops when there are no civilians left to take. Both are covered by a
400-settlement fuzz test asserting neither value can go negative.

**Bug fix: the invisible food sink.** Reported as "building a Granary zeroed my food — 550 down to
30, nothing in the Chronicle to explain it." No food was lost to the building. A settler cost food
(escalating 30% per person; at pop 19 that's 532), growth was automatic the instant you could afford
it, and the Chronicle line said only "A wanderer joins your settlement" — never the price. The
Granary *did* cause it, indirectly: food had been parked at a cap below the settler price with
nowhere to go, and raising the cap let food climb past the price, firing the purchase instantly. The
event line now states the cost. Also gave the events engine a small generic capability: an `effect`
may return its own log line, for events whose message needs a number only the effect knows. The
deeper finding — that because growth auto-spends, **your practical food ceiling is the settler price,
not your storage cap** — is what led directly to v11 abolishing the purchase model entirely.

**Playtest milestone:** reached the Bronze Age in ~35 minutes of real play, on the *old* (harsher,
pre-fix) settler cost curve. A later full playthrough built every unit and building in the age.
Transition verified end to end in a real session: housing jumped to 23, buildings reflavored
correctly, Bronze Tools unlocked and purchased.

---

## v10 — Bronze Age, Phase 3: the army

Completes the age. **Archery Range → Archer** and **Stables → Horseman** (both buildings capped at
1, both units costing bronze — Soldiers stay the cheap generalist and the only unit needing no
bronze, so they're still buildable when the Forge is starved). Raids now roll a **type** alongside
their size — warband, massed charge, band of riders — and `militaryStrength(raid)` sums each unit
type's contribution with a counter bonus applied only to the unit that excels. The load-bearing rule
holds: the non-matching multiplier is **1, never below**, so being the wrong unit costs you the
bonus and never your base strength. Measured: 5 Archers are worth 10 against a massed charge and 5
against everything else; a specialist army swings 2.00× between matchups where a mixed one swings
1.43×. Composition mismatch feeds a *second* dial rather than the win chance — `counterCoverage()`
softens the costly-repel roll, so the right units both win more fights and bury fewer of your own.
**Scouting** rides on the Stables (gated on the upgrade, not the building) and unlocks two new
events, one of which is deliberately pure flavor since the value of a warning is the knowing.
`removeSoldier()` became `removeRandomUnit()`, drawing casualties weighted by what's actually
fielded; `stealResources()` now raids the ores and bronze too.

One genuine bug caught by the harness, and it was the invisible kind: the counter relationship was
stored in **two** places pointing at each other — the raid held a unit id, the unit held a raid id —
and the comparison used the wrong pair, so it was always false and **every counter bonus in the game
silently did nothing**. No error, no crash, the feature just wasn't there. Fixed by deleting the
redundant field so only one direction exists, with a test asserting the duplicate can't come back.

**Casualty exposure by role** (post-phase tweak). Playtest note: archers didn't *feel* like archers
— mechanically they were a differently-priced soldier, since casualties were drawn evenly by
headcount. Losses are now weighted by role exposure (Soldier 1.0, Horseman 0.6, Archer 0.35), so the
front line takes the brunt and archers fight from behind it. Every weight is above zero on purpose:
this bends the odds and never grants immunity, so an archer can always be the one who falls and an
all-archer army — having no front line to hide behind — gets no protection at all. Measured over
30,000 draws from an even 10/10/10 army: soldier 50.9%, horseman 31.1%, archer 17.9%. A pleasant
side effect: mixing your army now buys your specialists safety, a second reason to diversify beyond
matchup coverage.

---

## v9 — Bronze Age, Phase 2: the alloy

The conversion chain lands, and with it the first building archetype that *transforms* rather than
produces or boosts. Adding three resources forced a refactor first: `rates()`, `mults()`, `caps()`,
the clamp loop, `jobsUsed()`, `removeSettler()` and the ledger markup each hardcoded exactly three
resources by name. All now iterate a `RESOURCES` table (with `baseCap`, `capBuilding`, `reveal`) and
a `JOBS` table (gaining `rateMult` and `reveal`); ledger rows are generated rather than written into
HTML, so future resources need no markup change.

New content: **copper** and **tin** (tin yields half — the scarce half of the alloy, as it was
historically), **bronze**, two new mining jobs, the **Forge** (4 copper + 1 tin → 1 bronze,
continuously, no workers), the **Ore Yard** (one building lifting both ore caps), **Bronze
Weapons**, and Bronze Tools re-costed in actual bronze — closing the Phase 1 carry-over that left it
thematically odd. Weapon tiers replace rather than stack: highest owned wins.

The Forge clamps throughput three ways — by forge count, by inputs in store, and **by headroom under
the output cap**, so a full bronze store stops it rather than silently eating ore. The numbers were
picked so a clean equilibrium exists to be found: 2 copper miners : 1 tin miner produces ore at
exactly the recipe's 4:1 ratio, and 2 Forges consume exactly that. Verified live.

Caught in passing: `removeSettler()` unassigned workers from a hardcoded three-job list, so with
five jobs a dead copper miner could have left `jobsUsed() > civilians()` and driven `idle()`
negative. Now derived from `JOBS`, reversed so specialised jobs empty first and foraging is released
last.

---

## v8 — Bronze Age, Phase 1: the transition

The first age advance, and the plumbing every future one rides on. Advancing is a hidden **Bronze
Age** capstone Upgrade (reveals at pop ≥ 10 with ≥1 Soldier trained; 300 food/wood/stone; 120s
build) that sits in the ordinary build queue — so Sickness and Conflict keep rolling the whole time
it's under construction, which is exactly where "and some luck" was supposed to come from.
Completing it calls `advanceEra()`, the only place `S.era` is ever assigned; everything the
transition changes is derived from `S.era` at render time, so flipping it *is* the whole operation.

Added a **per-era display layer**: optional `names`/`descs` maps on any def, read through
`displayName()`/`displayDesc()`, with ids permanently fixed so saves never need migrating for a
rename. On advancing: the Settlement panel becomes **Village**, Hut becomes **Stone House** worth 5
housing instead of 3 *retroactively* (every hut you already own upgrades at once — in testing,
housing jumped 12 → 18 and six wanderers immediately arrived to fill it, exactly the cascade the
design wanted), Medicine Tent becomes **Infirmary**, and **Bronze Tools** (+15%, stacking with Stone
Tools) unlocks. Infirmary was also retroactively renamed to **Medicine Tent** in the Stone Age to
free the fancier word for Bronze.

Two real bugs caught, one of which the harness structurally could not have found. First: every
existing event was tagged `eras: ["stone"]`, so the instant the era flipped, **births, sickness,
raids and both windfalls would have silently stopped forever** — no error, just a quietly dead
economy. All five are now `["stone", "bronze"]`, and the harness asserts each explicitly so a future
age can't regress it by omission. Second, found only in live play: `renderTile()` baked a tile's
name in at creation and thereafter only updated its count, so after advancing, the Village tile
still read "Medicine Tent" while its buy-card correctly read "Infirmary" — fixed to rewrite the name
every render, with a targeted regression test. Also swept two bits of prose that hardcoded
"infirmary" (one became a `descs` override, one was reworded era-neutral).

**Pause + playtime clock.** A `[ Pause ]` button (spacebar also works) freezes the simulation so the
game state can be studied without moving, with a red `— PAUSED —` marker in the topbar. Alongside
it, a playtime clock counting how long the settlement has actually been running. The clock lives
inside `step()` rather than the tick loop, which means it freezes when paused, counts offline
catch-up, and stops at death — all for free, no special cases. The non-obvious trap, caught by
design rather than by accident: the tick loop has to keep advancing its `last` timestamp *while
paused*, otherwise `dt` accumulates across the whole pause and gets handed back (clamped to 2s) the
moment you resume, quietly gifting production for frozen time. Verified live — a 9-second pause
produces zero `step()` calls and resumes on a normal 0.202s tick. Pause is deliberately not saved
(UI state, not game state) and deliberately not logged to the Chronicle (that's the settlement's
memory, not a UI action log).

**Modal system + game-over and Info panels.** A deliberately minimal overlay: one modal at a time,
centered, 30% dim backdrop, dismissed by the header ×, a backdrop click, or Escape. No dragging,
resizing, or minimizing. It reuses the `.block` shell so it matches the board for free, and opening
one never pauses the game. **Game over** moved out of the Chronicle into a proper modal — narrative
line, run stats (time survived, age reached, buildings raised, settlers grown), and a **Try Again**
button; one terse line still lands in the Chronicle so the settlement's record ends with its own
ending. **The Info panel** (`[ Info ]` in the topbar) is a full reference of every building, unit,
and upgrade, grouped by era behind tabs — it intentionally shows everything regardless of what's
been revealed, a deliberate exception to "unravel, don't dump" since a reference that hides things
is useless.

Building it surfaced a modeling error worth recording: filtering the reference by "defs whose era
equals this tab" left the Bronze tab nearly empty, because most things *persist* once introduced (a
Hut is still there in Bronze, just displayed as "Stone House"). Replaced with `availableInEra(def,
era)` — availability runs from a def's introduction era forward, with an optional `untilEra` to
retire things (used now by age capstones, and the hook a future consolidating age will need). Also
caught in live play: `body.dead .block { opacity: .7 }` was dimming the game-over modal itself,
since the modal panel is also a `.block` — now scoped to the board only.

**Settler cost un-ratcheted.** Playtest finding: `growthCost()` was priced off `S.bought`, a
lifetime counter of every settler ever grown that never decreased — so after a raid or plague you
kept paying the price for people who were already dead. A single bad roll became a permanent
handicap, and recovery was strictly harder than the original climb had been. Repriced off *current*
population, which made the settlement self-stabilising. `S.bought` survives purely as a lifetime
stat on the game-over screen. *(The whole purchase model was abolished in v11; this entry is kept
because the diagnosis — a lifetime counter used as a live price — is the kind of mistake worth
recognising again.)*

**Era advancement moved into the modal.** Reaching a new age now opens an announcement panel —
flavor lead, a "What changed" list quoting real before/after numbers (housing 15 → 23), and a "Now
available" list derived from the defs themselves so it can't go stale. No buttons; dismissed like
any other modal. A single milestone line still goes to the Chronicle. This is where the "every age
must land as a visible *whoa* moment" rule from `design.md` actually gets staged — previously the
transition was three Chronicle lines that scrolled past.

**Reset uses the modal instead of `confirm()`.** Native dialogs are suppressed outright in some
environments (they were being silently swallowed in the dev browser pane), and a real panel gives
consistent styling and control. Cancel / Escape / backdrop are all equivalent and verified
non-destructive; the destructive button renders in warning red via a new `danger` flag on modal
actions, and the copy quotes the run's playtime so the consequence is concrete. Also DRY'd out
`hardReset()`, which was duplicated inline between the Reset button and game-over's Try Again — the
subtle part it centralises is unregistering `beforeunload` *before* clearing, since the reload it
triggers would otherwise fire `save()` and instantly rewrite the save being deleted.

---

## v7 — Stone Age content pack

A design brainstorm ("what else belongs in Stone Age before we touch eras") turned into five small,
well-scoped additions, each reusing existing systems rather than adding new ones: **Herbal Medicine**
(Upgrade) raises how much *each* Infirmary reduces Sickness's odds — the first time a counter's own
strength (not just its owned count) became upgradeable, which needed `negateChance()`'s
`reducePerUnit` to accept a function as well as a flat number. Deliberately shipped with Infirmary's
*base* effectiveness lowered (0.35 → 0.2) so the Upgrade is a real improvement rather than padding,
per the standing "tune hard, walk back" principle. **Stone Yard** closes a real asymmetry — Food and
Wood both rotted past their cap, Stone never had one — Stone is now capped and clamped exactly like
the other two (flavored as "unorganized, lost" rather than "rots," since stone doesn't decay;
gameplay symmetry won out over strict realism, a deliberate call). **Stone Tools** (Upgrade) is the
first of a pattern meant to repeat every era: one broad, cheap, early, flat-percent bump to *all*
gathering, revealed almost immediately (`wood >= 5`) so it competes directly with your very first
Hut for early wood — intentional tension. **Great Hunt** and **Trader** are the first positive-only
probabilistic events (small/frequent food windfall, larger/rarer wood+stone windfall) — until now
every `chancePerSecond` event was a hazard; these prove the shape was never hazard-specific, it just
hadn't been used for good news yet. Neither is gated behind a population threshold, unlike the
hazards — no fairness reason to delay good news. Verified via harness (including a flaky-test fix: a
windfall landing on the very last tick of a 600-second test loop can be observed a tick before its
cap-clamp runs, exactly as it would in real play for one frame — not a game bug, just meant the test
needed one extra flush tick before asserting) plus live browser testing of the full chain, including
watching Trader fire organically mid-session.

---

## v6 — Military system + 4-column layout

The big one: a full design pass (recorded in `design.md`/`tech.md`) resolving both remaining open
questions about hazards and implemented end to end. **Barracks** (a new *capped* building — the
first of a third category alongside scaling buildings and one-time upgrades: `cap: 1`, greys out to
"Maxed" once built, same visual slot as an owned Upgrade). **Soldier** (a new *unit* kind —
trainable through the same shared build queue, but `popCost: 1` permanently reserves an idle
civilian the instant the order is queued, not when it completes, and conversion is one-way;
ownership lives in `S.units`, deliberately separate from `S.builds`, so it renders in Your People
instead of Settlement). **Flint-Tipped Spears** and **Hide Armor** (one-time Upgrades — weapon tier
raises repel odds, armor tier softens casualties — deliberately Stone-Age-named rather than "Sword,"
since the Bronze Age itself was still a parked design question). **Conflict**, the second hazard on
the Events engine: raid size rolls independently (small and common vs. large and rare), a
ratio-based repel check (`defense / (defense + raidSize)`, so never 0% or 100% no matter how
invested), and tiered consequences (clean repel / costly repel / raid succeeds with Soldier losses,
resource theft, and — if defense was thin — a civilian death too). Needed a new `resolve(S, dt)`
escape-hatch archetype on `EVENTS` since Conflict's multi-stage resolution didn't fit the generic
`chancePerSecond`+`counter` shape Sickness uses — a generic engine addition, not a special case.
Unlike Sickness (floored at 1 survivor), **Conflict is allowed to zero out population outright** — a
deliberate second failure state, on purpose, per design discussion.

Also shipped: **Your People now shows person-type tiles** (Settler, Soldier — icon+count, reusing
the Settlement holdings visual style but living in a different panel/state bucket, since "who your
people are" and "what you've built" are different questions) instead of a bare "settlers" number.
And the **whole layout was rebuilt as a real 2-row × 4-column CSS Grid** — Your
People/Settlement/Build Queue/Chronicle over Training/Construction/Upgrades/(Chronicle spans both
rows) — replacing the earlier nested-flex-column approach, which couldn't cleanly express "two
independent stacked panels per column, four equal columns." Roster panels (Your People, Settlement)
dynamically expand to fill their whole column while their paired action-panel has nothing revealed
yet, rather than leaving an unexplained blank grid cell — genuinely useful for a while in practice,
since Barracks is a mid-game unlock and Training stays empty until then.

Verified via an extensively rewritten headless harness (cap enforcement, popCost reservation math
including cancel-refunds freeing it, `removeSoldier` vs. `removeSettler` distinction, weapon/armor
math, every Conflict outcome branch, the Sickness-floors/Conflict-doesn't asymmetry) plus live
browser testing of the full progression (Hut → Barracks → Soldier → a forced raid, both a
thin-defense wipe-out-adjacent loss and a full population wipe-out) — including catching that a
hand-traced RNG sequence for one test was wrong because Sickness's own trigger roll, sitting earlier
in `EVENTS`, was silently consuming `Math.random()` calls before Conflict's turn; fixed by testing
Conflict's `resolve()` directly rather than through the full `resolveEvents()` iteration.

**Conflict retuned from real playtest data.** A long, attentive online session saw zero organic
raids — confirmed via forced-trigger testing that the code path itself worked correctly, ruling out
a bug, then ruled out the leading offline-invisibility theory once the player confirmed the session
was online-only. Concluded the rate itself was too rare for the intended "persistent, checkable
threat" feel. `conflictBaseChance` tripled (0.0006 → 0.0018), bringing the expected wait at a
mid-game population from ~19 min down to ~6–7 min, similar cadence to Sickness rather than
meaningfully rarer than it.

---

## v5 — Build Queue as its own panel + one-time Upgrades + cancel/refund

Pulled the build queue back out of the merged Construction panel into its own always-present box
(Settlement / Build Queue / Upgrades now split column 2 evenly) — it shows an explicit "Nothing
queued." empty state rather than disappearing, per design intent. Added a second buy-list,
`UPGRADES`: one-time purchases with a flat cost that never scale and can't be re-bought once owned
or already queued, distinct from `BUILDINGS`' repeatable/stacking model. Both feed the same FIFO
queue and respect its ordering. Shipped **Fire Mastery** (permanent −15% food upkeep) as the first
concrete upgrade — deliberately *not* Bronze Age, since eras were still an open design question.
Added cancel-for-refund: every queue card gets a small × that removes it and refunds exactly what was
paid, even mid-construction (the queue item now stores its own paid cost so a later-queued, more
expensive copy of the same building refunds correctly). Found and fixed a real bug via live testing:
`reveal()` was re-evaluated fresh every render with no memory, so a resource dipping back below its
reveal threshold (trivially easy — e.g. spending wood on the very Hut that revealed the panel) could
make the entire Construction/Settlement/Upgrades panel vanish mid-game. Fixed with `isRevealed()`,
which makes reveals permanently sticky via the existing `S.seen` mechanism, consistent with how
every other reveal in the game already behaves.

---

## Docs — the project gets a written record

`design.md` (player-facing vision, philosophy, systems, open questions), `tech.md` (architecture,
state shape, simulation model, known limitations), and `todo.md` created to give the project a real
record — previously all context for "what exists and why" lived only in conversation history.

---

## v4 — Events engine

Built the generic four-part event system (trigger / effect / negate / flavor) described in
`design.md`. Refactored population growth ("a wanderer joins your settlement") out of a hardcoded
loop into the first entry on this system. Shipped the first real hazard as a working proof of the
pattern: **Sickness**, gated to only become possible past `pop >= 4` (with a foreshadowing Chronicle
hint the moment that threshold crosses), mitigated by a new **Infirmary** building. Verified
end-to-end: gating, kill effect, job-reassignment safety on death, negation odds capping at 100%
with enough Infirmaries, and correct Chronicle coloring for both outcomes.

---

## v3 — Queue-based construction + fixed layout + restored color

Removed the worker-assignment requirement for construction entirely (decided it was "too Age of
Empires for an idle game") in favor of a FIFO build queue — pay on click, only the front item
progresses, cost escalates against owned+queued count so stacking clicks doesn't undercut the curve.
Doubled all build times to compensate for the new ability to effectively parallelize via queuing.
Rebuilt the layout again: fixed to the viewport (no page scroll), each panel scrolls internally,
specific panel placement (People top-left, Construction beneath it at 2/3 height, Settlement to the
right at 1/3 height, deliberate blank space reserved below it, Chronicle as a fixed quarter-width
column). Restored color semantics that an earlier monochrome pass had accidentally flattened: green
for genuinely new/positive Chronicle information, red for danger, positive/negative resource rates
colored to match. Found and fixed a real bug along the way: the Reset button's `beforeunload`
handler was silently re-writing the save it had just cleared.

---

## v2 — Friction pass + light theme + full redesign

Added food upkeep (every settler eats, whether working or idle) and a real failure state (starvation
ends the game). Added storage caps on food/wood — surplus rots without a Granary/Woodshed. Added
timed construction (originally worker-assigned, AoE-style; the worker requirement was removed again
in v3). Full visual rewrite: dark theme → off-white "paper" theme, monochrome ink + one red accent,
no shadows/gradients. Layout rebuilt from a centered card column into a flex-wrap "doodle board"
that fills top-left outward. Added the Settlement/holdings panel (owned buildings as icon tiles, not
just numbers in the buy menu) in response to feedback that ownership was too abstracted.

---

## v1 — Core loop

Zero-build `index.html` you can double-click and play. Three settlers, three gather jobs
(forage/chop/gather stone), a Hut as the first building (raises housing), an escalating per-building
cost curve, auto-save + capped offline catch-up. Verified via a headless Node harness before any UI
existed.
