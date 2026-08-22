# Idle Civ — The Map

> **Status: designed, not built. Phase 8.** Nothing in this document exists in `game.js`. The arc
> is gated behind the engine work in `todo.md`'s phase plan — hard-gated on **phase 2 (seeded
> RNG)**, which is what makes a generated world reproducible from a number, and practically gated
> on **phase 1 (the file split)**, because this arc wants three new modules and adding them to a
> 3,400-line single file is how you get a 4,600-line single file. It also wants **phase 6
> (Conquest Growth G2, the minor tier)** to have landed, because the minor tier is what the map is
> *for*.
>
> Read this as a scoping document. `design.md` is the canon it serves; `tech.md` is the
> architecture it must fit into. Where this file says "proposed," it means proposed — the open
> questions in §10 are real and several of them are load-bearing.

---

## 1. Why a map, and why now

**The Chronicle is an event log. It says what *happened*; it is structurally incapable of saying
what *is*.** That's not a defect — it's the correct job for a log, and `design.md` already assigns
it exactly that job ("the record of what *happened*, as distinct from what *is*"). But it means
the game currently has no surface that answers *what does my world look like right now*. You
learn that the Hill Clans' walls came down by reading a line that scrolled past four minutes ago,
and you learn your dominion has grown by watching a number labelled "holdfasts" increment. The
Chronicle reports the world at the resolution of one sentence per event, in chronological order,
which is the worst possible ordering for answering a spatial question.

**A map answers it at a glance, and it answers it continuously.** That is the whole pitch.

**Second argument: the panel grid is full, and the map is the one surface that absorbs unbounded
content without adding panels.** `interface.md` states the anxiety plainly — eight panels
at the Iron maximum, "the grid is full, and its author doubts it scales," with roughly nine more
eras of systems queued (laws, morale, religion, science are already on the ideation board). Every
new *system* wants a panel. A map does not: places, occupants, states, borders, adjacency and
routes all land on the same surface, and a map with forty things on it is not more cluttered than
a map with twelve — it's more interesting. This is a genuinely different scaling curve from
"another block in the grid," and it is the strongest structural argument for building it.

**Third argument, the one design.md concedes outright: the game has no way to *show* progress,
because nothing is rendered.** Holdings tiles show counts. The ledger shows rates. Progress is
communicated by numbers going up and by panels filling — which is real (`design.md` makes "panels
filling up is part of the fun" a pillar) but it is the only channel there is. Dominion spreading
across a board is a second channel, and it is the one that costs nothing per era, because the
same renderer draws it forever.

**And the convergence, which is the reason this stopped feeling speculative.** Conquest Growth's
minor tier — *numerous weak freeholds, individually cheap, each worth one sworn holdfast, the
era's capturable units forming a designed population budget* — **is already a description of
capturable tiles.** It was written as a population-pacing device with no map in mind. Read it
again with a map in mind and it is a map specification: a bounded set of small places, authored
per era, that you take one at a time and that visibly become yours. The map was designed before
anyone called it a map. Building it is mostly a matter of rendering a thing the design already
committed to.

**What this arc is not.** No rendered units, no pathing, no movement animation, no tile-by-tile
micromanagement. `design.md`'s Explicitly Out of Scope is unamended by this document. The map is
a **readout and a target picker** — it shows you the world and it is where you click to act on
it. Everything it displays is state the simulation already keeps or would keep anyway.

---

## 2. The data model: a place-graph, not a hex grid

**The model is a graph of places. Each place has an id, a position, and an adjacency list. That
is the entire abstraction, and it is deliberately not called a grid.**

A hex grid is a place-graph whose adjacency is six fixed offsets on a lattice. A node network is a
place-graph with arbitrary adjacency and hand-placed positions. A square grid is one with four (or
eight) offsets. These are not three data models; they are one data model with three generators.

**Model the graph. Render the grid.** This is the same trick the manifests play — the engine
consults `active()` and never `S.era`, so swapping the world is one assignment — pointed at
geography instead of content. When the Space border retires hexes for a node network (§9), what
changes is a generator and a renderer. What does not change is: campaign targeting, distance
math, provision cost, dominion accounting, standing, capture, the save schema, or a single line
of the expedition engine. They never learn that the world stopped being a lattice.

### The seam is two functions

Everything above the map layer reads the world through exactly two calls:

```js
neighbors(placeId) -> [placeId, ...]
distance(fromId, toId) -> integer
```

`neighbors()` returns the adjacency list. `distance()` is hex distance under the hex generator
and a BFS hop count under a node network — different implementations, identical contract, integer
either way. **Nothing outside the map module may branch on `S.map.kind`.** If a fourth thing ever
needs to know the shape of the world, that's the signal the seam was drawn in the wrong place.

### Proposed state shape

```js
S.map = {
  seed: 0,            // the world's number; geometry derives entirely from this
  gen: 1,             // generator version — see "regenerated, not saved" below
  kind: "hex",        // "hex" | "network"; only the generator and renderer read this
  era: "iron",        // the era this world was generated for
  home: "0,0",        // the seat; distance is measured from here
  places: {
    "3,-1": {
      id: "3,-1",
      pos: { q: 3, r: -1 },  // axial for hex; { x, y } for a node network
      adj: ["4,-1", "3,0", "2,0", "2,-1", "3,-2", "4,-2"],
      terrain: "hills",      // a manifest-declared id; paint, and possibly nothing else (§10.6)
      owner: null,           // null | "player" | adversaryId
      adversary: null,       // adversaryId if this is a seat; null if plain or empty
    },
    // ...
  },
};
```

Place ids are strings derived from coordinates (`"q,r"`) rather than array indices, for the same
reason every other id in this project is a permanent string: an index is a position in a list, and
lists get regenerated. `pos` is generator-owned and the renderer's business alone. `adj` is stored
explicitly even though a hex generator could derive it from six offsets — storing it is what makes
the model kind-agnostic, and a few hundred short arrays is not a size anyone will ever notice next
to `S.eraHistory`'s per-era deep snapshots.

### Regenerated, not saved

**The save carries the seed and the mutable per-place state. The geometry is regenerated at load.**
Same seed plus the same generator version yields the same world, bit-identical — which is exactly
the property phase 2 buys, and exactly the property `tech.md`'s tick rework is chasing for the
simulation. A world is a number; the number is what's precious.

Concretely, `S.map` above is the *runtime* object. What's persisted is smaller: `{ seed, gen,
kind, era, home, owned: [placeIds], captured: [placeIds] }` — everything else rebuilds. This has a
real cost worth stating plainly: **changing the generator reshapes an existing save's world.**
During development that is acceptable and even useful. Before any release it is not, which is what
`gen` is for — bump it and keep the old generator, or accept the reshape as a deliberate,
announced, one-time event. Do not discover this at release time.

The composition here is neat and worth noticing: **adversary slate selection is also seeded (§5),
so regenerating the world reselects the same adversaries, and `S.adversaries` — which is keyed by
adversary id and holds the depleting stock, the standing, and the persistent wall damage — matches
back up without any migration.** The living remnants survive a geometry rebuild because they were
never stored against geometry in the first place.

### Merging into `S`

Additive and defensive, matching the pattern `S.adversaries` already uses at load (`game.js`
~3277–3292): fresh defaults, override with saved data, then a reconcile pass that fills anything
missing.

```js
S.map = data.map || null;
// ...after the manifest is active:
ensureMap();   // generates if absent, or if S.map.era !== S.era (see §10.3),
               // or if S.map.gen !== CURRENT_GEN
```

`ensureMap()` is the map's equivalent of the loop that initializes `S.adversaries[adv.id]` for any
adversary not yet in state — called at load *and* on era entry, idempotent, silent when there's
nothing to do. An old save with no `S.map` generates one on first load and nothing else changes.
This is the same "schema grows additively, no migration step" property `tech.md` documents under
Persistence, and there is no reason for the map to be the first thing that breaks it.

---

## 3. Hexes: pointy-top, and why hexes win here

**Pointy-top hexagons — points at top and bottom, flat sides left and right. LOCKED.** This is the
one geometry decision that must be made before any art is commissioned, and it is made.

Why hexes at all, in descending order of how much each one matters to this project:

**Six true neighbours.** Every adjacency is symmetric and equally weighted. A square grid forces
a choice between four neighbours (no diagonals, which makes distance feel wrong) and eight
(diagonals that are √2 as long but count as 1, which makes distance *be* wrong). Hexes have no
diagonal problem because they have no diagonals. For a game where distance is about to become a
cost multiplier on campaigns and caravans, "distance is an integer and it means what it says" is
not a nicety.

**Generation is two nested loops.** An irregular-polygon map — the beautiful kind, Voronoi cells
from scattered points — needs point scattering, Lloyd relaxation, Delaunay triangulation, the dual
graph, polygon clipping at the boundary, and centroid math to place anything inside a cell. That
is a named, real pain point from a sibling project, not a theoretical concern: the centroid math
in particular is where irregular maps go to die, because "where does the label go" and "where does
the token sit" stop being free. On a hex lattice both are the tile centre, which you already have,
because you computed it to draw the tile. Adjacency is a constant array of six offsets. Distance
is three subtractions and a max. Rendering a tile is six points from one function.

**Uniform tile shape is what makes commissioned art economical.** This is the argument that
actually decides it. An artist draws N tiles once — one grassland, one hills, one forest, one
water, a few variants each — and they compose forever, in every era, at every map size, in
combinations nobody drew. Irregular polygons cannot be pre-drawn; every cell is a different shape,
so the art is either procedurally synthesized (a different and much larger problem) or the map is
hand-illustrated, which caps map count at however many maps someone is willing to paint.
**Tile art is the only art model that survives procedural generation.** See §8.

**Era scaling is free.** The generator takes a radius. A Stone valley is ~20 tiles, an Iron
continent ~150, a Galactic starfield a few hundred nodes. Same code, one parameter. (Those numbers
are sketches, not decided — see §10.10.)

**Recommended coordinates: axial (`q`, `r`).** Two integers per tile, trivially convertible to
cube coordinates (`x = q`, `z = r`, `y = -x-z`) when you need the elegant distance formula
(`(|dq| + |dq+dr| + |dr|) / 2`), and to pixel space for rendering (pointy-top:
`x = size * √3 * (q + r/2)`, `y = size * 3/2 * r`). Do not invent this math.
**Red Blob Games' hex grid guide (redblobgames.com/grids/hexagons/) is the canonical reference**
— it covers coordinate systems, neighbours, distance, line drawing, ranges, rotation, rings,
field-of-view, pixel conversion, and rounding, with every formula given for pointy-top and
flat-top separately. Implement against it and cite it in the module header. Every hour spent
deriving hex math by hand is an hour spent reproducing that page badly.

---

## 4. Procedural generation

**Seeded, per phase 2.** One `rng()` backed by a small PRNG with its state in the save; the map
generator draws from a *derived* stream (e.g. seeded from `hash(S.map.seed)`) rather than the
simulation's stream, so generating a world does not advance the dice that decide whether you get
sick. A world is reproducible from its number, which means bugs are reproducible, balance is
comparable across runs, and a good map can be pinned.

**Be honest about the difficulty gradient here, because it is steep and it is not where you'd
guess.** Generating a *grid* is trivial — two loops, a radius check, done in twenty lines.
Generating a grid that looks *good* is not trivial, and this is the single largest unknown in the
whole arc.

The failure mode is specific and immediate: **naive per-tile randomness looks like confetti.**
Roll terrain independently per tile and you get static — a green tile, a blue tile, a grey tile, no
coastlines, no mountain ranges, single-tile lakes everywhere, no sense that the world has any
structure. It reads as noise because it *is* noise, and no amount of good tile art rescues it.

What it actually takes:

1. **Coherent noise, not per-tile rolls.** Value or simplex noise sampled at each tile's pixel
   position, with a couple of octaves, thresholded into terrain bands. Neighbouring tiles sample
   nearby points and therefore agree, which is the entire point. This alone takes the output from
   static to something map-shaped.
2. **Post-processing passes, which are where the quality is.** Fill single-tile lakes (a water
   tile with no water neighbour becomes land). Remove single-tile islands. Guarantee the landmass
   is connected — flood-fill from the home tile and reclaim or drop anything unreachable, because
   an unreachable freehold is a bug wearing a hat. Enforce a land/water ratio band and regenerate
   or adjust the threshold if the roll falls outside it. Smooth ragged coasts by majority vote over
   neighbours. Each pass is short; the *list* of passes is the work.
3. **Features placed with intent, not sampled.** Adversary seats, the home tile, and any
   special terrain are *placed* by a second pass that reads the terrain map and picks positions
   satisfying constraints (distance bands from home, minimum separation from each other, terrain
   type appropriate to the occupant). Sprinkling them by rolling per tile produces two seats
   adjacent to each other and a third one on the wrong side of an ocean.
4. **A rejection loop with a budget.** If constraints can't be satisfied, reroll the whole world
   from `seed + 1`, up to some bounded number of attempts, then fail loudly. Do not "fix" a world
   by relaxing constraints silently — this project's entire bug history is silent wrongness.

**The seed is what makes all of this tunable rather than a research project.** Generate a hundred
worlds, flip through them, find the ones that look right, and **write down the good one's number.**
That single workflow converts "make the generator good" from an open-ended aesthetics problem into
a sampling problem with a visible pass/fail, and it is the reason seeded generation is a hard
prerequisite rather than a nice-to-have. It also gives the harness something to bite on: assert
that N generated worlds all satisfy the invariants (connected, ratio in band, every seat reachable,
no orphan tiles, home not adjacent to the strongest seat) without asserting anything about beauty.

---

## 5. Adversaries: a hand-authored pool, procedurally placed

**This is the section that matters most, and the rule at the top of it is not negotiable.**

### Adversaries are hand-written. They are never generated.

Not their stats, not their names, not their descriptions, not their trade offers. The pool is
authored. Some are strong, some are weak, some are middling. Some are rich, some are poor. And
crucially some are **inexplicable** — the one that is heavily, strangely religious; the one that
is somehow still living in the previous age; the gullible king whose disposition makes no sense
given his strength. Those are the ones players remember, and no generator produces them, because
a generator produces *distributions* and the memorable ones are outliers with a reason.

**What is procedural is which adversaries appear, and where they sit.** The pool per era is
**larger than the number used per run** — not fifty, but comfortably more than the slate needs —
so which neighbours you get varies between runs while every neighbour you get is one somebody
wrote. Placement scatters the chosen ones across the generated world; **some tiles are simply
empty**, and emptiness is a feature, not an absence: it's what makes distance real and what gives
capture somewhere to go.

**This is what keeps the flavor-is-load-bearing law enforceable.** `design.md` makes adversary
descriptions *mechanics-bearing text* — "a fortified state, rich beyond counting" is how the
player learns not to raid the River Kingdom in week one, and playtest confirmed the read lands.
A generated adversary cannot honour that law. No generator writes "rich beyond counting" and has
it be *true* relative to the numbers it just rolled; you'd get either template prose keyed to stat
bands (which players decode in ten minutes and then stop reading) or prose that lies, which is a
bug of the same class as a wrong cost label and which no validator can catch. **Every pool entry
is hand-written against its own numbers, once, forever.** The procedural layer never touches
prose.

### Generate the slate, not the adversary

A naive picker — three at random from the pool — is actively bad, and the failure is easy to
predict: some seeded runs hand you three warlike bruisers with nothing to sell, and the era's
central question, *whom do I act against and how*, evaporates. There's nobody to trade with, one
target you can't beat, and no decision anywhere. That run is broken, and it's broken by dice, which
is the worst way for a run to be broken.

**The fix: the era manifest declares the ROLES the slate must fill, and the generator satisfies
them.** Proposed manifest shape, sitting alongside the existing per-era `adversaries` declaration
(which becomes `adversaryPool`):

```js
adversaryPool: [ /* 8–12 hand-written entries, each the exact shape adversaries use today,
                    plus picker tags: { tier: "major"|"minor", roles: ["tradePartner", ...] } */ ],

slate: {
  count: 3,
  roles: [
    { id: "tutorialTarget", require: { tier: "major", maxStrength: 12, disposition: "warlike" } },
    { id: "tradePartner",   require: { buys: true } },
    { id: "wall",           require: { minStrength: 28 } },
  ],
  constraints: [
    "atLeastOnePeaceful",
    "notAllSameFightsAs",
    "strengthSpread >= 20",
    "wallTierDoesNotTrackStrengthTier",
  ],
  minors: { count: [4, 7] },   // the capturable population budget, drawn from tier: "minor"
},
```

The picker: fill each declared role first from the pool entries that satisfy it (seeded choice
among the eligible), then fill remaining slots from what's left subject to the constraints, then
place. One pool entry can satisfy two roles simultaneously — and *should* sometimes, see below.

**Pool satisfiability is a load-time validator concern, not a runtime surprise.** `tech.md`'s
`validateManifests()` already throws on dangling references at load, before a frame renders,
because this project's signature bug class is silent wrongness. Add to it: every declared role must
have at least one matching pool entry, and the full role set must be *simultaneously* satisfiable
(a bipartite match, which at these sizes is a nested loop). An era whose pool went thin because
somebody edited an entry's strength should be a named error at load, not a run that quietly
generates a bad world one time in nine.

### The Iron slate is the worked example — this is the target shape

The three adversaries shipped in `IRON_DELTA` are a good slate, and describing *why* is the spec
for every future one:

| | strength | walls | disposition | trade |
|---|---|---|---|---|
| **Hill Clans** | 9 | 5 | warlike | none |
| **Salt Nomads** | 13 | 2 | peaceful | iron → gold |
| **River Kingdom** | 32 | 26 | peaceful | food → gold |

- **The Hill Clans are the tutorial target.** Weak, hostile by nature, nothing to sell you, and a
  palisade thin enough that your first column can knock it down. Their description says so
  ("weak alone, bold when your walls look thin"). They exist to teach you that the campaign verb
  works.
- **The River Kingdom is the wall and the best partner in one entity**, which is the single
  smartest thing about this slate. The richest prize in the era is the one you cannot take yet,
  and trading with it is how you get strong enough to take it. That's not two facts, it's one
  tension, and it's the era's central question rendered as a card.
- **The Salt Nomads are the live decision.** Middling strength, almost no walls, a real trade
  offer, and genuinely takeable if you're willing to burn the relationship and the standing that
  goes with it. Everything else on the slate tells you what to do; this one asks.

And note how it satisfies the authoring rule that the strength ladder is a **floor, not a
template**: strength ascends 9 / 13 / 32, but disposition goes warlike / peaceful / peaceful and
walls go 5 / 2 / 26. The middling neighbour has the *weakest* fortification in the era. Nothing
lines up into a stamped menu, which is precisely why reading the descriptions is worth doing.

**A generated slate must reproduce that shape or it isn't done.** The roles above are a first
attempt at encoding it; the constraint list is where the cross-cutting lives, and it will need
more entries than the four sketched. The acceptance test is blunt and human: generate twenty
slates, read them as a player would, and check that every one of them poses a question.

### Identity lives in the popup, not on the tile

**A tile shows generic art for its terrain type plus a small occupant marker. Clicking it opens
the adversary.** The popup is where identity lives: ruler portrait (commissionable, one per pool
entry), the hand-written flavor prose, the stats, the known stock, the wall state, and the
available actions — which is very close to the adversary card the Expeditions panel already
renders, moved.

This is what keeps the art budget bounded, and the arithmetic is worth stating: bespoke tile art
per adversary means the art bill scales with **pool size × eras**, which is exactly the number you
want to grow freely for variety. Generic terrain tiles plus one portrait per pool entry means the
tile art bill is **fixed per era** (a handful of terrains) and the portrait bill scales with the
pool *linearly and cheaply*, one head-and-shoulders each. Pool size becomes a content decision
with a small art cost attached rather than a content decision gated on a large one.

---

## 6. What the map makes possible

**Most of this list is not new mechanics. It is new *readouts* of state the game already keeps** —
which is the honest reason this arc is cheaper than it looks, and the honest reason nobody should
promise it's cheap overall (§4 and §8 are where the cost actually is).

### New readouts (state exists today; the map draws it)

- **Standing as border colour.** `S.adversaries[id].standing` is already a small integer read out
  as one of four words. As a border treatment it becomes ambient — you glance at the map and see
  who you've been poisoning. No new state, no new rule, and it respects the colour law
  (`design.md`: colour is reserved entirely for meaning) because standing *is* meaning.
- **Wall state on the tile.** `wallsState()` already computes exactly three states — intact,
  battered, in ruin — from `st.walls` against `adv.walls`. That's a three-state glyph on a tile
  edge. The persistent-damage design ("sieges against hard targets become sagas rather than
  rerolls") becomes visible instead of narrated.
- **Depletion.** A stock that has been traded dry or plundered is already tracked. A tile that
  visibly thins as you strip it makes "a stock is not an economy" a thing you can see.
- **Dominion spreading.** Captured places set `owner: "player"`, and the map fills in. This is the
  emotional payload of the entire arc and it requires exactly one new field.
- **Expeditions in flight.** `S.expeditions` already carries type, target and remaining time. A
  token on the route, moving or not, turns the Underway panel's progress card into a thing
  happening *somewhere*.

### New mechanics (real engine work, small but real)

- **Distance as a design lever.** Today `campaignTime` and `caravanTime` are flat per-adversary
  constants and `CONFIG.campaignFoodCost` is a single number. With a map, both derive from hex
  distance from home. This is a strict authoring improvement — the far kingdom is expensive
  *because it is far*, not because someone typed 120 — and it gives placement a real job:
  the generator can put the tutorial target in a near distance band and the wall in a far one, and
  difficulty is dialled by geography for free. It also means an authored `campaignTime` becomes a
  *multiplier* rather than an absolute, which is one manifest field changing meaning.
- **Routes through hostile territory.** Today `riskAdversary()` picks the strongest Hostile
  warlike neighbour *globally* — the ambush risk is narrated as if the roads mattered, but the
  roads don't exist. With a map, the route is the path of places between home and the partner, and
  the risk comes from who actually sits on it. That is a small diff (walk the path, check owners)
  and a large gain in coherence: it makes "the roads are dangerous" true rather than atmospheric,
  and it makes escorting a decision about a specific stretch of road.
- **Capture writes to the world.** The G2 capture outcome (+1 holdfast, small windfall, a
  Chronicle line naming the place for the last time) gains a fourth effect: the tile turns.

### Deliberately not on this list

Terrain yield modifiers, per-tile buildings, tile-level unit stationing, movement. Each is a
plausible idea and each is a different game. See §10.6 for the one that's genuinely open.

---

## 7. Rendering architecture

**SVG for geometry and interaction; a DOM overlay for labels, tokens and popups. No canvas.**

### Why no canvas

The performance argument is the boring one and it's already settled: SVG handles thousands of
elements comfortably, and this map peaks in the low hundreds — ~20 tiles in Stone, ~150 in Iron, a
few hundred nodes at Galactic. Canvas would be solving a problem that does not occur.

The argument that actually matters is what SVG *keeps*:

- **Hit-testable for free.** A click handler on a `<polygon>` is a click handler on a polygon.
  Canvas means maintaining a parallel geometry model purely to answer "what did they click,"
  which is a second source of truth for the shape of the world — and a second source of truth is
  how you get a map where the highlight and the click target disagree by two pixels.
- **CSS-animatable.** State changes are property transitions, not a render loop.
- **Inspectable through the accessibility tree.** Every tile can carry `role` and `aria-label`
  ("the Hill Clans — hostile, walls battered, three hexes distant"), which means the map is
  *readable as text*. That matters here beyond accessibility, and it's worth being explicit about
  why: **this project is built and verified largely by agents**, and an agent verifies its work
  through `read_page` — a structured tree — far more reliably and cheaply than through screenshots
  and vision. A canvas is a bag of pixels. An agent cannot assert that the Salt Nomads' tile turned
  green without looking at a picture and guessing. With SVG, the harness-adjacent browser check is
  a text assertion like every other one in this project.

### Structure

Three stacked layers in one positioned container:

1. **Geometry (SVG).** One `<g>` for tiles, one for borders/edges, one for routes. A `<polygon>`
   or `<path>` per place, carrying `data-place`, a terrain class, and an owner/standing class.
   Nothing in this layer encodes appearance beyond class names and CSS custom properties.
2. **Paint (SVG).** Empty today. Later: a `<use>`/`<image>` per tile referencing a sprite, or
   `<pattern>` fills. See §8 — the reason this is its own layer is that swapping it in must not
   touch layer 1.
3. **Overlay (DOM).** Absolutely positioned over the SVG: place labels, occupant tokens, standing
   chips, the click-through popup. Labels live here rather than in `<text>` because **SVG text does
   not wrap**, and `interface.md` locks the rule that text wraps and never truncates — the
   prototype already violated its own principle once with `text-overflow: ellipsis` on card names
   and it was resolved toward wrapping. The overlay also gets Bureau's type registers, tokens and
   tooltip machinery for free.

### Rendering rules, inherited from `tech.md`

- **Create once, update in place.** Same law as job rows, buy-cards, holdings tiles and queue
  cards. Never `innerHTML` a re-render — it drops listeners, and that was an actual shipped bug.
- **The map does not render on the tick.** `renderAll()` runs 5×/second; the map changes on
  *events* — a capture, a standing shift, an expedition launching or resolving. Give it a dirty
  flag and render on change. This is a deliberate departure from the rest of the render layer and
  it's the right one: redrawing 150 polygons five times a second to show that nothing happened is
  the only place in this game where performance could plausibly become a topic, and it's trivially
  avoidable.
- **Tooltips take a getter, not a snapshot.** `attachTip(el, getter)` exists precisely because
  elements update in place and a value captured at creation goes stale immediately. Tiles are the
  most update-in-place thing in the game; this trap is already documented, so don't fall into it
  again.

### Specific CSS the map should use

- **Transitions on `fill` and `stroke`** for state changes — a captured tile bleeding into your
  colour, a border warming as standing rises. Both are animatable properties; a 400ms ease is the
  difference between "the number changed" and "the world changed."
- **`opacity` is available as a transition medium for things that appear or disappear** (a token
  fading in), **but never as a state channel.** Bureau's first law is that opacity is never used to
  encode state — it previously did triple duty for unaffordable/queued/owned and all three read to
  players as "you can't have this." A dimmed tile would read as disabled. Tile state is carried by
  fill, stroke weight, stroke colour and glyphs, exactly as card state is.
- **`transform: perspective(1200px) rotateX(18deg)`** on the geometry container gives a tilted
  quasi-3D board for one line, if wanted. Hit-testing stays correct — the browser transforms
  pointer coordinates too. The catch is legibility: tilted text is bad text. Either tilt only the
  geometry layers and keep the DOM overlay flat, or counter-rotate the labels. Worth prototyping
  before committing, and worth being willing to drop; a flat board is not a worse board.
- **`offset-path` / `offset-distance`** animate an element along an arbitrary path in pure CSS.
  **Not needed — no unit movement is planned, and rendered units stay out of scope.** It's noted
  so the door stays open: if a caravan token should ever creep along its route as its timer runs,
  the mechanism is one path string and one animated property, not a physics layer.

### Module split (post phase 1)

Three modules, matching the seam: `map.js` (the model — `neighbors`, `distance`, `ensureMap`,
capture, the state shape), `mapgen.js` (the generator — seeded, kind-specific, replaceable),
`mapview.js` (the renderer — SVG + overlay, also kind-specific). The rest of the game imports only
`map.js`.

---

## 8. Art strategy

**Geometry and paint are separate layers. This is the one thing that must be locked now**, because
it is nearly free up front and expensive to retrofit. Art is coming later; it has to drop in
without a rewrite.

**Design as if the budget exists, because it will.** The owner will pay for art when the game
earns it. The job of this section is not to avoid spending money — it is to make sure the money
buys the right thing, which means deciding the *shape* of the purchase before the purchase.

### What gets commissioned is a kit, not an illustration

- **Terrain tiles.** Uniform pointy-top hex, transparent corners, fixed pixel dimensions, drawn to
  a shared lighting and horizon convention so any tile sits next to any other tile. A handful of
  terrains per era, two or three variants each to break repetition.
- **Edge and border treatments.** Dominion borders, coastlines, the three wall states, route
  strokes. These are what make a field of tiles read as a *territory* rather than a mosaic, and
  they are usually underspecified in briefs.
- **Tokens.** Adversary seat, your seat, a column in the field, a caravan on the road.
- **Icons.** The map's icons join the family `BUILDING_ICONS` / `PERSON_ICONS` / `QUEUE_ICONS`
  already established — stroke-only inline SVG, `currentColor`. Consistency here is already law.
- **Chrome.** Legend, compass, scale, the frame the board sits in.
- **Ruler portraits.** One per pool entry. The largest single line item, and the one that scales
  with pool size — which makes pool size an art-budget decision, and worth deciding with that in
  view (§5).

### Decide before commissioning

- **Pointy-top.** LOCKED (§3). Nothing about the kit works if this moves.
- **Tile pixel dimensions.** OPEN. Decide the on-screen hex width from the actual layout first,
  then commission at 2× for high-DPI. Note that the whole grid renders inside one `viewBox`, so
  this is a question about art resolution, not about layout — the layout scales regardless.
- **Whether art bleeds across tile edges or is strictly confined.** OPEN, and **deliberately
  deferred.** Confined tiles compose perfectly and read as a game board; bleeding art (a mountain
  overhanging its southern neighbour, a forest canopy crossing an edge) reads far more like a
  painted map and much less like a lattice, at the cost of draw-order rules and a shape contract
  that's harder for an artist to hit. This is genuinely cheap to decide *once art exists* and
  genuinely impossible to decide well in the abstract, so it stays open on purpose. What the
  architecture owes it: the paint layer must be a separate `<g>` with its own z-ordering, so
  "bleeding" is a rendering-order change and not a rewrite.

### The placeholder is free, and it is good enough to ship the whole arc on

SVG filters and patterns give an evocative map with **zero assets**:

- **`feTurbulence` + `feDisplacementMap`** on tile outlines produces hand-inked wobble — the
  difference between a mathematical hexagon and a hexagon someone drew. Two elements in a `<defs>`
  block, applied by CSS class.
- **Gradients** for elevation and water depth.
- **`<pattern>` fills** for terrain hatching — and this is the same trick `styles.css` already runs
  for the per-column paper stocks (cork, 16px graph, 14px dot grid, legal pad). The map's
  placeholder vocabulary is Bureau's existing vocabulary pointed at hexes.

That last point has a consequence worth flagging: **if the hatched placeholder map looks right,
that is evidence toward "commission in the style of Bureau" rather than "replace Bureau,"** which
is one of the two live briefs in `design.md`'s Open Question 3. Build the placeholder before
answering it.

**The whole arc can be built, played, tuned and judged before a dollar is spent.** That is the
point of the layer separation, and it's also the right sequencing: you should not commission art
for a map until you know the map is fun.

---

## 9. Map style retirement

Per `design.md`'s rule that **every mechanic gets a designed retirement age, or an explicit reason
it is permanent** — applied here to the map itself, because a map that silently becomes wrong for
nine eras is exactly the palimpsest that rule exists to prevent.

**Hexes run from Stone through the last Earth age.** Every era on Earth has a surface, and
territory on a surface is what a hex grid is for.

**A node network takes over at the Space border.** The wrinkle is the actual reason for the
switch, and it is not aesthetic: **a hex grid in space wastes most of its tiles on emptiness.** The
lattice's central virtue is that every tile is a place and adjacency is dense and uniform — which
is precisely wrong when the interesting places are sparse points separated by void. You'd render
four hundred hexes to show eleven planets, and the other three hundred and eighty-nine would be
"space," which is not a place you can hold, take, or win over. The abstraction stops matching the
fiction, so it retires.

**The sketch beyond, and it is a sketch, not a decision:** Space Age gets planet and moon nodes
within one system, edges as transfer routes. Galactic gets system nodes, edges as jump lanes.
Kardashev gets whatever the objects are at that scale — galaxies, megastructures — and the edges
probably stop being physical at all. None of that is designed. It doesn't need to be, and that's
the point of §2.

**What is decided is that the switch is cheap.** `S.map.kind` flips, a new generator runs, a new
renderer draws. `neighbors()` and `distance()` keep their signatures. Campaigns, provision costs,
routes, dominion, standing and capture never find out. That is the same bet the manifest
architecture made about content, made again about geography, and it is the entire reason §2 insists
on modelling a graph when the first four eras only ever need a lattice.

**One secondary retirement to flag now:** if terrain ever grants economic modifiers (§10.6), that
mechanic needs its own retirement age at authoring time, because "which tile am I standing on"
stops being an interesting question long before the Space border. Preferring terrain-as-paint in
the first build keeps that door shut until someone deliberately opens it.

---

## 10. Open questions

Honest list. Several of these are not decidable from a desk and should not be forced.

1. **Does the map become the interface's centre?** Panels to the periphery, map in the middle.
   Likely eventually; **explicitly gated on having a map good enough to deserve it**, and that is
   phase 9, not phase 8. Until then Bureau's 4×2 grid stands and is not in question. Phase 8 must
   therefore be buildable *without* answering this — see (9).
2. **Does Bureau survive the map?** Unchanged from `design.md`'s Open Question 3, with one new
   input: the SVG-filter placeholder (§8) is itself a test of whether paper-and-ink extends to
   geography. Build the placeholder, then look at it, then decide.
3. **Is the map regenerated per era, or does it persist and extend?** **This is the big one.**
   It has large consequences for generation, for the save, and for how an era transition *feels*,
   and it is genuinely undecided. Three candidates:
   - **(a) Regenerate wholesale.** Matches existing law exactly — adversaries are already declared
     "wholesale per era, never inherited," and the code comment says each age's world arrives
     fresh. Cheapest to build, and every era gets a world sized to its own scale. **Cost: the
     dominion you spent an entire age taking evaporates at the border.** That is the invisible-sink
     mistake this project already made once and wrote a rule against.
   - **(b) Persist and extend.** The old map becomes the interior of a larger one; your holdings
     are a bright core with new territory ringing them. Emotionally the strongest, and it is
     arguably the visual argument for the whole arc. **Cost:** it fights the wholesale-adversary
     law, it needs a generator that grows a world outward without reshaping its interior (much
     harder than generating one), and by the Space border you'd be carefully extending a lattice
     you are about to retire. **And it collides head-on with consolidation:** twelve holdfasts
     becoming three cities means twelve owned tiles must become three, so the map has to *shrink*
     its owned region at exactly the moment it grows the world. There is no graceful version of
     that.
   - **(c) Regenerate, but carry a summary.** A new world, with your dominion arriving as a
     pre-owned block whose size derives from what you held, narrated as a migration — the
     machinery already exists (`runEraMigrations` plus its narrate lines, which are exactly for
     "state rearranged itself and here's why"). Handles consolidation naturally, since the block is
     sized from post-consolidation holdings. **Probably the answer. Not decided.**
4. **Tile art bleed** (§8). Deliberately deferred until art exists.
5. **Tile pixel dimensions** (§8). Decidable once the map has a real home in the layout.
6. **Do captured tiles have an ongoing economic identity, or are they +1 to a generic pool?**
   `design.md`'s "absorbed is generic" rule says the latter, unambiguously, and its reasoning is
   good: flavor spends its budget while an entity is *outside and hostile*, and the empire is a
   machine while the Chronicle is the memory. **But a map makes the question live again**, because
   a rendered tile *invites* the player to expect it to do something — you can see it, so surely it
   is a place. Options: purely generic (current canon; the map shows extent, never yield);
   terrain-tinted yield (a captured hills tile nudges iron a little); per-tile named holdings
   (**rejected** — that is unit micro under another name, and it breaks the small-numbers law).
   Apply the retirement-age test before adopting the middle option: if terrain grants yield, when
   does that stop, and why?
7. **Must you border a place to campaign against it?** Ungated preserves today's behaviour exactly
   and costs nothing. Gated turns the map into a real strategy layer — you must take the freehold
   to reach the kingdom — but it is a genuine new constraint that could deadlock a run if the
   generator places a wall between you and everything else. **Ungated is the safe first build**;
   revisit once distance-scaled costs are in and it's clear whether geography is already doing
   enough work.
8. **Fog of war?** Probably not. It fights the reading-your-neighbours-is-the-point rule and the
   Info panel's deliberate show-everything stance. But *terrain visible, occupant unknown* until
   scouted is cheap, and it would give the Scouting upgrade a job again. Open, low priority.
9. **Where does the map live in phase 8 — a modal, one panel, or the whole board?** This needs an
   answer to build, and it must not be "the whole board," because that makes phase 8 depend on
   phase 9. **Proposed: a modal**, opened from the Expeditions panel, which costs no grid real
   estate and is the largest surface the interface can currently hand out for free. Whether the
   Expeditions panel then survives as a separate surface, or becomes a list view of the same data,
   is a phase-9 question.
10. **Map size per era.** ~20 / ~150 / a few hundred are sketches. They interact directly with the
    minor-tier count, which `design.md` already lists as an open implementation-time tunable, and
    with generation quality (a 20-tile world has no room for coherent noise to look like anything).
    Tune together, not separately.

---

## Build order sketch

Not a commitment; a scoping aid. Each slice playable and harness-verified on its own, per the
project's standing rule.

- **M1 — model and readout.** `map.js` + `mapgen.js` + `mapview.js`. Place-graph, hex generator
  (unstyled polygons, flat colours), the Iron slate placed on it, tiles clickable into a popup
  carrying today's adversary card content. **Zero new mechanics.** Harness covers `distance()`,
  `neighbors()`, generation invariants, and the save round-trip.
- **M2 — distance as a lever.** Campaign time and provision cost derive from hex distance; caravan
  risk derives from the actual route. Placement gains distance-band constraints.
- **M3 — dominion.** Capture writes `owner`; the minor tier lives on the map; dominion renders and
  spreads. This is the slice that pays for the arc.
- **M4 — generation quality and placeholder art.** Coherent noise, the post-processing passes, the
  rejection loop, SVG filters and patterns. The seed-flipping workflow.
- **Art commission** slots in after M4, whenever the game has earned it.

Gates: M1 requires phase 2 (seeded RNG) and wants phase 1 (file split). M3 requires phase 6
(Conquest Growth G2). Nothing here requires phase 9, by design.
