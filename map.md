# Idle Civ — The Map

> **Status: M1 shipped 2026-08-22 (inside phase 6, per the sequencing decision); the rest designed,
> not built.** What exists: the place-graph model, the seeded blob-growth hex generator (own rng
> stream), `S.map` persistence with seed-rebuilt geometry, tile-noun-keyed regeneration, the Bronze
> inert chart, Iron's seated majors, and the wide map modal with its click-to-read detail pane.
> **6d (same day):** the growth verbs landed — the minor tier seated and named, capture-as-fealty,
> the settle verb through the queue, and supply lines (`routeCost`/`marchFactor`: owned country
> marches at half a step; water at three, never impassable). Dominion spreads for real.
> **The flip (same day):** the map left its modal and became the game's main surface — full-bleed
> stage, floating panels, the Expeditions panel dissolved into the Selected Tile panel. Era-scoped
> view radii rode with it (Stone one hex, Bronze the ring, Iron the country) — **since retired in
> design by §2.6, *One board, forever*: one world at full size from frame one, fog instead of
> radii, a camera that pulls back per era. The code still does the old thing until Phase 10.**
> **6c.1 (same day):** works are rate tables — every land works every resource, terrain sets the
> rate, specialties at par-plus and the rest overpay routes. And the chart exists from the first
> frame: the map spec lives in the STONE manifest, Bronze inherits the identical world.
> **Yield and dominion shipped 2026-08-22 (6c):** owned hexes produce by assignment against terrain
> menus, pop is tiles (`syncDominion()`), and the interaction pattern is locked — hover previews,
> click opens details, and the details are where every stat and action lives (allocation on owned
> tiles, March/Caravan on seats). The pattern survives the node network unchanged. Distance,
> capture/settle, generation polish and art are still ahead (`todo.md` 6d–6e, phases 8/9).
>
> Read the unshipped parts as a scoping document. `design.md` is the canon it serves; `tech.md` is
> the architecture it must fit into. Where this file says "proposed," it means proposed — the open
> questions in §10 are real and several of them are load-bearing. Where the shipped code diverged
> from a proposal here (it does in small ways — the state shape is leaner, ownership is a list
> rather than per-place `owner` fields), the code and `todo.md` win, per the standing rule.

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

### 2.5 The tile noun decides everything

*(Settled 2026-08-22, and the resolution to §10.3.)*

> **Partly superseded the same evening — see §2.6, *One board, forever*.** Rules 1 and 2 below
> (regenerate on tile-noun change; dominion carried across a rescale as a summary) are **dead**:
> the world is now generated once at full size and never regenerates. Rule 3 stands, and the
> section's central claim — the tile is the anchor noun, and the two ladders were one — is
> untouched and load-bearing. The rest is kept because the reasoning trail matters.

**The tile is the game's anchor noun**, and `design.md` → *Scale: The Tile Ladder* is its home. This
document had proposed a tile ladder while `design.md` carried a population ladder; they were the same
ladder, and they collided at Iron where both wanted the word *holdfast*. From Iron onward every rung
of the population ladder was already a place — a holdfast, a city, a colony, a nation, a world, a
system. The ladders merged; *holdfast* was promoted, not renamed.

Three rules follow, and they close most of what §10 was holding open:

**1. ~~The map regenerates when the tile noun changes — and only then.~~ RETIRED (§2.6): the map
never regenerates.** Kept for the trail; the test below was a good answer to a question that no
longer exists. The tile *noun* still changes on these borders — it just re-dresses the same ground
instead of rebuilding it. That is the entire test.
Bronze inherits Stone's clearing unchanged, so Stone→Bronze keeps its geometry and swaps only the
tileset. Bronze→Iron rescales, because a clearing becomes a holdfast. Declared as an era-fact on the
delta, in the same shape as `consolidate`:

```js
// on the iron delta
tileNoun: "holdfast",     // changed from "clearing" -> rescale fires
mapScale: { regenerate: true, narrate: "..." },
```

Rescale borders will usually coincide with consolidation borders, because they are the same event —
the scope zooming out. Keep them separate facts anyway so they *can* diverge.

The important property: **this is cheaper than regenerating every era, not more expensive.** "Does
not rescale" means "do nothing to the map," and doing nothing needs no code. The only new machinery
is one comparison at era entry, which `ensureMap()` already performs.

**2. ~~On a rescaling border, dominion carries as a summary.~~ RETIRED (§2.6): dominion never
moves, because the world never does.** Your holdings stay on the exact hexes you took them on,
forever. Original text: a new world, with your holdings arriving as a pre-owned block sized from
*post-consolidation* holdings, narrated through `runEraMigrations` like any other state
transformation. This was candidate (c) from §10.3; §2.6 adds the candidate (d) nobody listed.

**3. Terrain carries the economy from Iron.** Once population *is* tiles, production derives from
tiles, and terrain is the only thing that makes one tile worth more than another. See §10.6.

**Build consequence — since revised upward by §2.6.** The plan below (ship the map early and
*inert*) was right about the disease and too timid about the cure: under §2.6 the map is
interactive from the Stone Age via scouting, so by Iron the player has been *using* it for hours
rather than merely looking at it. The reasoning stands verbatim, only stronger:

**Introduce the map an age before it becomes mechanical.** Bronze→Iron already
carries seven simultaneous changes (housing retires, free growth ends, units become levied,
population becomes tiles, the map rescales, the job steppers give way to per-hex allocation, production moves to terrain).
That is a genre change mid-game, and it is deliberately not spread across two borders because the
story — you stop being a village headman and become a lord — deserves to be one moment. The
mitigation is to ship the map *early and inert*: **Bronze gets a map you can look at and do nothing
on.** Your clearing, a few neighbouring ones, no adversaries, no yield, no actions. By the time it is
load-bearing the player has been reading it for forty minutes. That is *unravel the contents, not the
board* pointed at geography — and it makes M1 in the build order shippable content rather than
scaffolding.

---

---

### 2.6 One board, forever — the frame, the fog, and the picker

*(Settled 2026-08-22, evening, across one long design conversation. **Supersedes rules 1 and 2 of
§2.5 above, and the §10.3 ruling those rules resolved.** It also answers §10.8, §10.10's soft-edge
question and §10.11.)*

**The world is generated once, at full size, and it never regenerates.** Eras change what you can
*see* and what you can *do*; they never change what the world *is*. The law, in the owner's words:

> **The map is always there. What you can do and see changes.**

That sentence retires the entire "how does the map scale across eras" problem this document spent
three sections on. There is no scaling. There is one board, and you grow into it.

#### Why this beats the ruling it replaces

§10.3 weighed three candidates and picked (c). All three assumed the world must somehow *keep up*
with the player — regenerate wholesale, or grow outward, or recut at rescale borders. **There was a
fourth nobody listed: generate the whole world at final scale immediately, and hide most of it.**

It takes candidate (b)'s emotional payoff — the dominion you spent an age taking is still exactly
where you left it, a bright core in a wider country — and pays candidate (a)'s implementation cost,
because generating one world once is the cheapest option on the table. The objection that killed
(b) was needing "a generator that grows a world outward without reshaping its interior." Fog does
that job for free: the interior was never reshaped because it was there from the first frame.

The 3D adoption is what forced the issue, and the argument is concrete rather than aesthetic:
**you cannot re-dress board you regenerate.** Per-era prop swaps — huts becoming a castle on the
same ground — are the marquee moment of every era advance under Route B (`§8`), and they require
the ground to be the same ground. Regeneration would delete the feature.

#### The frame: a continent silhouette, filled with hexes

Generation runs in two stages instead of one. **First a coastline**, drawn as an organic closed
curve — capes, bays, peninsulas, plus a few offshore islands. **Then hexes are packed inside it**,
each hex kept only if it fits without clipping the coast. The silhouette is a generation-time
device only: **it is not rendered.** Once the hexes are placed the curve has done its job, and the
board is the tiles themselves, whose outer edge is now organically ragged instead of a circular
clump. Drawing the curve would only expose the gaps between it and the outermost hexes.

This is *fixed frame, shuffled contents* — the Catan pattern, and the most durable replayability
design tabletop has. The coastline is the board; where the rivers, mountains, rivals and your own
start land is the shuffle. It is also the pattern this project already uses for adversaries (§5):
author the frame, let procedure fill it.

#### The picker: three continents, outlines only

The run begins on a **pregame screen showing three continents as bare outlines**, each labelled
with the only two numbers that make the choice mechanical — **hex count and island count**. Size is
game length and population ceiling; islands are how much naval content the run holds. Shape matters
too, and mechanically rather than decoratively, because `routeCost` and `marchFactor` already ship:
a long-limbed continent with a narrow isthmus has chokepoints and stretched supply lines that a fat
blob does not.

**Outlines only, and this is the load-bearing constraint.** The player chooses the shape of their
world while learning nothing about its contents — no terrain, no rivals, no start position. The
picker hands out layer zero; the fog still owns everything above it. The two systems reinforce each
other instead of competing, which is not how "let the player choose" usually interacts with "let
the player discover."

**One screen, one decision.** Three continents, any click starts the game, no confirm step, a
reroll for three more. This screen must never grow into a settings panel with sliders — pregame
screens accrete options like nothing else in software, and *A Dark Room* is a touchstone precisely
because it starts instantly with nothing. Picking a world is ritual; configuring one is admin.

The choice **expires gracefully at Space**, where the hex board gives way to a node network and one
node can be a planet or a galaxy — scale stops being geometric, so the continent stops mattering.
One piece of sentiment is free there: when Earth becomes a single node, **that node can wear the
silhouette you picked at minute zero.** The first decision of the run stays visible forty hours in.

#### Seeding: one number is the whole world, coastline included

*(Design owner's delegation, 2026-08-22: "I will let you handle the seeding.")*

**Each candidate continent *is* a seed.** The picker does not choose a shape and then roll a world
— it shows three seeds wearing their coastlines, and picking one makes it the run seed. Everything
downstream derives from it: hex packing, terrain, rivals, minors, start position. Reroll draws
three fresh candidate seeds.

The properties this buys, all of which the project already depends on:

- **One number reproduces the entire run**, coastline included. The seed on the death screen stays
  sufficient. Sharing a seed shares the world, not a fragment of it.
- **A typed seed skips the picker** and lands you on exactly that world — which is also how a good
  world gets pinned for balance work, per §4.
- **The save stores the seed, not the geometry.** Recipe, not cake, unchanged (§2.3). The frame
  needs no new persisted field, because the frame is not a separate choice — it is the seed.

**Generation must draw from named sub-streams, never one sequential stream.** Each stage takes its
own PRNG seeded from the run seed plus a stable label:

```js
const frameRng   = makeRng(hashStr(seed + ":frame"));
const packRng    = makeRng(hashStr(seed + ":pack"));
const terrainRng = makeRng(hashStr(seed + ":terrain"));
const seatRng    = makeRng(hashStr(seed + ":seats"));
```

The reason is durability, and it is the kind of thing that is miserable to retrofit. With one
sequential stream, inserting a new generation step later — "place rivers" before "place rivals" —
shifts every subsequent draw and silently invalidates every seed ever recorded. Named streams are
independent: adding a river pass cannot move where the mountains went. `hashStr` already exists in
`src/map/model.js`.

The existing rule stands untouched: **none of this advances the simulation's dice.** `S.rngState`
decides whether you get sick; world generation never touches it.

**Integration note:** the prototype generator was built in a separate session and will use
`Math.random`, which is banned in `src/` by a standing harness check. It gets re-plumbed onto
`makeRng` before it lands, exactly as the current generator did.

#### Fog: face-down tiles, and the honesty rule

**Re-ruled by eyes, 2026-08-24: the unknown world is INVISIBLE — not drawn at all.** A live
three-way look test (tan unpainted-board vs dark shroud vs nothing) settled it in minutes: *"an
invisible world means discovery makes the world appear out of nowhere — cool and much more
noticeable. Invisible is the winner and it's not close."* The board ends at the knowledge
frontier with proper cut edges, and every claim or scout makes the world visibly **accrete out of
the void** — the reveal is the reward. The dark shroud stayed rejected (wrong genre); the
unpainted-board idea below is superseded but kept, because its honesty rule survives unchanged.
One consequence to design around later: the continent picker's silhouette promise (§2.6) and
"visible land you cannot reach" (islands) now need the *charted* frontier to do their work — you
see what you've charted, not what exists. Scouting becomes the way the world's extent is bought.
**Resolved same day (owner discussion): the SIGHTED state.** Charting a coastal hex grants sight
a few rings seaward, and sighted land renders as blank silhouette prisms — the unpainted-board
rendering rehired for exactly this job, so all three fog looks serve: invisible for the unknown,
blank prisms for the sighted, painted terrain for the charted. An authoring law rides with it:
every island must lie within sighted range of the nearest mainland coast. The frame itself
survived the fog debate on two grounds: islands are a GLOBAL property local randomness cannot
guarantee, and a small pool of authored continents yields recognition drama across runs — knowing
the map while not knowing where on it you are.
The 2D debug view keeps fog visible: a debug surface sees everything.

*(Superseded original, kept for the trail:)* Unrevealed board renders as **unpainted board** —
blank prisms in a neutral material, like unpunched cardboard or unpainted resin — and the world
gets visibly *painted in* as it is discovered. Not a dark military shroud: that idiom fights the
bright, warm palette and reads as the wrong genre. This is the tabletop idiom, face-down tiles
flipped as you reach them, and it is available to us precisely because we went 3D.

The rule that makes fog honest, and it is short:

> **Fog hides the board. It never hides the pieces.**

Flipping a tile reveals **land** — forest, river, hills — and land is permanent, so a flip can
never be falsified later. **Who lives on the land is a separate layer** that arrives with the eras.
In the Stone Age there is no medieval kingdom in that valley; the game is not concealing one, it
genuinely does not exist yet. A town appearing on ground you scouted a thousand years earlier is
not a betrayal, it is the world living. At a table, nobody feels cheated when a new piece is placed
on a tile they flipped an hour ago.

**Revealed board stays revealed, forever. There is no re-fogging** — `interface.md`'s "reveals are
sticky, nothing flickers away" already demanded this and it applies unchanged to geography.

This reverses §10.8's "probably not," and the old objection is worth answering rather than
ignoring: fog was rejected for fighting the reading-your-neighbours rule and the Info panel's
show-everything stance. It does not, because it hides *unvisited country*, never the stats of a
place you can see. Everything you know stays fully legible; the Info panel is untouched.

#### Marks: a house means a home

The board's glyph vocabulary answers **"who lives here"** before it answers **"who are they"**,
because that is the order a player actually needs when the whole map is in view at once.

| mark | who | glyph | colour | label |
|---|---|---|---|---|
| `home` | your seat | house | white, 19px | none (it is where you are) |
| `seat` | a major power | house | **red**, 19px | its name |
| `minor` | a lesser steading | house | red, 14px | none |
| `work` | your ground, assigned | resource letter | green | none |
| `rest` | your ground, resting | dash | quiet grey | none |

**Your seat and a rival's wear the same glyph** (owner ruling, 2026-08-24), because they are the
same kind of thing: a place people live from. Only the colour differs, and size grades the two
kinds of stranger. The earlier diamond-for-adversary made a rival read as an abstraction — a
game-piece marker rather than somebody's home — and it was also invisible as a *settlement* when
scanning the board for who else is out there.

Colour lives in `styles.css`, so the harness cannot assert it; what the harness asserts instead is
that the glyph is SHARED between `home` and `seat`, which is the half a refactor would silently
break.

Marks remain gated on **charted**, never on sighted — sight reveals the board, never the pieces
(see the fog section above). Reveal forces charted, so it shows every house on the map, which is
what makes it a seed-reading tool.

#### Terrain drives settlement, which turns the one real objection into a mechanic

The obvious worry — *I scouted an empty hex, the era flipped, now there's a village on it* —
inverts if **settlement placement correlates with terrain quality**. A player who scouted a fat
river valley at Stone knows exactly where somebody will be living by Iron. Good land attracts
people, in the game as in life. Early scouting stops being information that expires and becomes
information that **matures**, which is a far better property than merely being forgivable.

#### Scouting is promoted: the Stone Age's spatial verb

Directed scouting stops being parked ideation and becomes the reason the map is interactive from
frame one, instead of inert until Iron. Shape of it:

- **Priced by distance, using `routeCost`, which already ships.** A Stone Age with three settlers
  can look at the next valley but not the far coast, with no hard range rule and a revealed radius
  that differs every run. Sending a body to look when everyone eats is a genuinely hard call — the
  friction pillar reaching a part of the game it currently does not touch.
- **Its reward is mostly the writing.** Discovery flavor through the Chronicle, which is already
  built and is the *A Dark Room* channel this game has never used. A scout may occasionally bring
  something home; keep that **rare and flavor-forward**, because reliable loot turns exploration
  into a farm.
- **Its real payoff is positional.** You are choosing where to expand at Iron while looking is
  still cheap.
- **Systems stay era-gated.** Seeing a place you cannot yet settle, subdue or trade with is the
  intended state. The risk here is real and is the one to watch in playtest: *revealed but inert*
  can read as a taunt rather than a promise.

This also softens the Bronze→Iron cliff that has already burned one live run. Arriving at Iron with
the map as familiar furniture means only the **verbs** are new, not the entire surface.

#### Islands: in the frame now, playable later

Islands are generated, packed with hexes, and revealed by fog like any other board — **and that is
all they do for now.** No seats, no settling, no minors on them until a naval unlock exists.

They are worth having early anyway, because under the fog rule an island is **visible land you
cannot reach**, and water at `routeCost` 3 says *not yet* rather than *never*. That turns boats
from an economic upgrade into a promise being kept, and hands the mid-game a carrot that has been
sitting on the table since minute one. The water-crossing guard already in `routeCost` — slow but
never impossible, so an island cannot deadlock a run — turns out to have been load-bearing for a
feature that did not exist when it was written.

Two placement guards to build with: **the start never lands on a small island or in a boxed-in
pocket**, and **minor seats avoid tiny islands**, or you get a naval campaign that pays one hex.

#### The hex budget is a balance number, not an art number

This answers §10.11, which asked for map size per era; the question dissolves, because there is one
map and it does not resize.

The landmass **is** the designed population budget (the 6d ruling), so hex count sets the population
ceiling for every hex era in the game. Constraints, which bracket it tightly from both directions:

| Pushing **down** | Pushing **up** |
|---|---|
| Props must be legible — a hex too small to carry a readable castle kills the per-era re-dress, which is the marquee era-advance moment | Islands degenerate below a certain resolution into one- and two-hex specks, which makes a naval campaign that pays a single tile |
| Every ownable hex is a point of population ceiling, and displayed counts are already bending the 3–50 pillar at Iron's 61 | Coherent terrain generation needs room; a 20-tile world has nowhere to put a mountain range |
| Per-tile work allocation across hundreds of tiles is exactly the sack-counting the king is not supposed to do | The board must outlast Iron — it carries every era through max-Earth |

That brackets roughly **100–200 land hexes**, and the owner's ruling is to start at the low end:
**target ~120 including islands**, tunable by the generator's hex-size control, revisited when the
pop ladder past Iron is designed. A 646-hex render exists and is beautiful, and it is the wrong
board — at that density hexes stop being *structure* and become *texture*, which is cartography
rather than a board. Catan is nineteen spaces.

**Curate at high density, play at low.** Judging whether a silhouette is a *good* continent is far
easier at 600 hexes, where clipping does not hide the shape being approximated. Generate and judge
candidate frames maxed out; drop the resolution for the ones that survive.

Running out of room is **correct**, incidentally, and the owner named the reason: Earth is a finite
sphere and civilizations do fill it. The board filling up is not a limitation to be engineered
around — it is the pressure that sends you to Space. Geography becomes the motivation for the
game's final act.

#### What this breaks, stated plainly: consolidation

§10.3 rejected a persistent map partly *because* of consolidation — twelve holdfasts becoming three
cities on a board you keep would mean visibly losing nine hexes of hard-won ground, which is the
invisible-sink mistake this project wrote a rule against. That objection survives the new model and
must be answered rather than quietly inherited.

**RULED and SHIPPED (owner, 2026-08-22; phase 10 slice 3).** In the owner's words: *consolidation
or expansion should never change how many tiles you have or which. If you capture it in Iron, you
get the full reward of it becoming an Enlightenment tile.* On a fixed board **the board is the cap**,
so nothing needs shrinking to keep numbers small — geography already does that job.

- A tile-era border **re-denominates what a tile is** (holdfast → city → nation) and raises per-tile
  output. It takes no land, ever.
- `applyConsolidation` still consolidates at the **first** levy border, because that is the moment
  population stops being people and becomes places. Every border after it leaves `S.pop` alone.
- `syncDominion` no longer trims holdings to fit a shrinking population. Population follows the
  land upward instead of the land following population down.
- One ordering consequence, found by the harness and worth knowing: **consolidation must run before
  `ensureMap()`**. Syncing the dominion first would grant a block sized from the pre-consolidation
  population, which a land-preserving reconciler then cannot give back.

This is the single ruling that dissolves the whole scale problem. Every elaborate scheme this
document once weighed for carrying a dominion across a rescale — summaries, pre-owned blocks,
grow-the-lattice-outward — existed only to answer *what happens to your land when the world changes
size*. The world does not change size.

**Consequence to settle in the balance pass, flagged rather than silently decided:** population loss
from sickness and raids (`removeSettler`) is now inert in tile eras, because taking a hex away for a
fever is exactly the land-loss this ruling forbids. Those events need a designed replacement effect
at tile scale — reduced output, lost units, damaged holdings — rather than a population number.

---

---

### 2.7 A hex has people on it — and distance from your seat now matters

*(Settled 2026-08-23. `design.md` → *Population Lives Somewhere* is the canon; this section records
only what is specifically the MAP's business.)*

**Every hex in your dominion carries a population**, and the map is where that becomes legible: click
a hex, see its people. Total population — the odometer — is their sum, so for the first time the big
number is a readout of real things rather than a decoration.

**Terrain sets carrying capacity, which gives terrain a second job.** Today terrain sets a production
*rate*; now it also sets how many people the ground supports. A river valley is worth taking in a way
a player can see at a glance, and a mountain is not, and nobody has to be told why.

This produces the oldest real trade-off in strategy games, for free, out of two rules that already
had to exist: **defensible terrain is defensible because it is inhospitable.** The mountains that
protect a seat are the mountains that cannot feed it. That was not designed — it fell out — and it
gives the owner's Stone-Age reading of a mountain-ringed start (*"what a defensible starting
position"*) a mechanical spine that argues back at it.

#### Two distances, and conflating them is the trap

**`routeCost` measures LOGISTICAL distance** — from your nearest owned tile, over owned/land/water,
answering *how long is the march*. Shipped, unchanged.

**Distance from your SEAT is a different number** — administrative distance, answering *how well can
you hold this*. A long tendril of hexes stays logistically close while being administratively
terrible. This is the number starvation drains against (frontier first, `design.md` rule 8), and it
is cheap to build: the same Dijkstra seeded only from `world.home` instead of from every owned tile.

#### The design rule that keeps this from becoming Civ 3 corruption

**Distance governs EXPOSURE, never EFFICIENCY.** Far hexes are not less productive. They are the
first to starve and the first to be raided. The difference is the whole thing: an efficiency falloff
is a constant *tax* that punishes playing well and invites the exact optimisation this game refuses
("what is my ideal empire radius?"), whereas exposure costs nothing while you are solvent and bites
only when you overextend. It is a **risk**, not a rent. Civ 3's corruption is the cautionary tale.

#### Empire shape becomes strategy, with no new systems

If starvation eats the far edge and raids strike the perimeter, then a compact blob and a sprawling
tendril play completely differently at identical hex counts — same production, wildly different
risk. And the player expresses that choice entirely through **which hex they take next**. No new
resource, no new UI, no numbers to tune. Perimeter versus area, which is about as board-game as this
gets, and it is why a chokepoint is valuable: a large area behind a small defensible perimeter.

#### Interaction to settle before islands ship

**Islands are far from your seat by definition.** If administrative distance bites hard, islands
become worthless the moment you can finally reach them — killing the long-horizon carrot §2.6 wants
them for. Something must give: naval tech shortening sea distance, islands permitting their own
seat, or coastal hexes projecting administration over water. Obvious now; infuriating to discover
after both features ship.

#### Scouting is promoted again: it becomes intelligence

Scouting was already the Stone Age's spatial verb (§2.6). With people on hexes it stops being *map
reveal* and becomes **reconnaissance**: how many live there, how defensible it is, what they are
sitting on. That turns "who do I attack" into an informed decision instead of a coin flip, and it
gives scouting a permanent job — you would want to re-scout a neighbour before committing, in every
era of the game.

#### Performance: measured, and a non-issue

Recorded because it was asked and because the intuition runs the wrong way. Summing population
across every hex, every tick, for a full hour of play: **28 ms at 61 hexes, 68 ms at 150, 202 ms at
400** — against a per-tick budget of 200 *milliseconds*. A 150-planet endgame would use roughly two
thousandths of one percent of it. Save growth is ~2.4 KB at 150 hexes. `routeCost` already runs a
multi-source Dijkstra over the whole board and nobody notices.

**Per-hex storage is free; per-hex SIMULATION is not expensive either — it is unholdable.** Even 150
independent food economies would compute fine; what fails is a human's ability to predict a system
with a hundred and fifty interacting parts. The cost that matters is design surface, never CPU.

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

**Revised by §2.6 (2026-08-22): generation is now two-stage — coastline first, then hexes packed
inside it.** Everything below still applies to the second stage, which is where terrain, features
and seats get decided. Two amendments: the "guarantee the landmass is connected" pass now also
owns *islands*, which are deliberately disconnected and must be recognised as intentional rather
than reclaimed as orphans; and the whole pipeline draws from **named sub-streams** rather than one
sequential stream, for the seed-durability reason given in §2.6.

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

### The roster is fixed at generation; the era only redresses it

*(Owner ruling, 2026-08-24. Shipped the same day.)*

**Generation answers *where* and *who*. Era answers *what they are now*.** Every people on the
board — three majors on their own home terrain, plus the minor tier by density — is placed once, at
world generation, and exists in every age. Nobody arrives at an era flip and nobody vanishes at
one. What an era changes is the dressing: the camp at Coldwater becomes the steading at Coldwater
becomes the freehold at Coldwater, and it is understood to be the same people throughout.

This closed the last contradiction in the fog design. Adversaries used to arrive at Iron, which
meant the world you spend most of a run looking at was uninhabited, and it meant a hex you scouted
empty could sprout a village the moment the age turned.

**Enemies that survive evolve alongside you.** Strength is a function of the ERA, never of your
power — the distinction is the whole thing. Era is a shared world clock: rush ahead and you are
genuinely ahead of your neighbours for a while; dawdle and they are ahead of you. Scale to the
*player* instead and you get the Oblivion problem, where bandits appear in glass armour and
advancement stops feeling like anything. Meeting a stone-age camp in the Iron Age makes no sense;
neither does a neighbour who never grew.

Two consequences fall out without needing rules of their own:

- **Distance and difficulty correlate only incidentally.** The far people are not statted
  stronger; you simply do not *meet* them until later, when everyone is stronger. Reach is already
  governed by `marchFactor`/`routeCost`, so a Bronze war party can bloody the camp over the hill
  and could never cross the continent.
- **A run thins as it goes.** The ones you take are gone for good, so the board starts crowded
  with small camps and ends as a handful of large powers plus your empire. Handling a neighbour
  while the handling is cheap is real pressure, with no timer needed.

**Majors always outrank minors within an age**, or the two words describe nothing. The compiler
throws at load if any major's strength falls inside its era's minor band.

#### Contact: what an age can do about its neighbours

| era | contact | what it means |
|---|---|---|
| Stone | `none` | You can see them and scout them. You cannot touch them — not because a rule forbids war, but because nobody exists who could declare one. There are no kings in the Stone Age. |
| Bronze | `open` | War parties, both directions. The age hands you bronze spears and hide armour, so it must let you carry them somewhere. Small scale: a handful of fighters, short reach. |
| Iron | `open` | Campaigns, sieges, conquest, and trade — trade arrives with coinage, since caravan payment is gold-denominated at its root. |

Stone still has DANGER, and always did: all three raid types roll and the `conflict` event fires.
That danger is simply **anonymous** — a warband out of the dark, belonging to nobody on your map.
Bronze is where it gets a name and an address.

Three numbers make the fixed roster true, and all three fail silently: the seat list, the minor
`density`, and the name pool's LENGTH (placement is a per-hex hash over that pool). Drift any of
them between eras and every neighbour relocates in every existing world, with nothing to report
it. The compiler asserts all three across eras at load.

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

**Supply routes (user ruling, 2026-08-22, lands with distance):** effective campaign/caravan
distance is computed over a path where owned hexes travel cheap — conquering or settling a line of
tiles toward a rival is building an abstracted road. Route math, not rendered movement; the
no-pathing ban is untouched.

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

### Observed: the board writes fiction before the rules do

*(Playtest note, 2026-08-22.)* Shown a fresh Stone board, the owner read a defensible position off
it instantly — three sides mountains, one side water, two adjacent approaches — and wanted to
figure out how to hold it. **No mechanic supports any of that.** Terrain has no defensive meaning;
`routeCost` counts owned country, unowned land and water, and knows nothing about hills.

Two things worth taking from it. First, it is evidence the generator is doing its job: coherent
blob terrain produces *places* that suggest stories, which is the whole reason confetti terrain was
rejected in §4. Second, it points at the most natural next rule for routes — **terrain-aware
movement cost** — because the player already assumes it exists. A rule that merely confirms an
instinct the map already created is much cheaper to learn than one that has to be taught. Not
scheduled; recorded so it is here when routes are next opened.

### Deliberately not on this list

Terrain yield modifiers, per-tile buildings, tile-level unit stationing, movement. Each is a
plausible idea and each is a different game. See §10.6 for the one that's genuinely open.

---

## 7. Rendering architecture

**SVG for geometry and interaction; a DOM overlay for labels, tokens and popups. No canvas.**

### Why no canvas *(SUPERSEDED 2026-08-22 — the map is a WebGL canvas now)*

**Read this section as the reasoning trail, not the ruling.** The 3D adoption (§8, Route B) and
its shipped port (phase 10 slice 2) overturned the conclusion, and `tech.md` carries the formal
walk-back of its central claim. What actually happened to each argument below:

- **"Hit-testable for free" — conceded, and answered.** The 3D stage does keep a second geometry
  model, but it is *pure math with no state*: plane-picking plus cube-rounding, the exact inverse
  of the projection that placed the tile. There is no second source of truth to drift, because
  nothing is stored — the same axial id comes back out that went in. The predicted failure mode
  (highlight and click target disagreeing by two pixels) cannot occur when both are derived from
  one function.
- **"CSS-animatable" — given up, and it cost nothing.** Nothing in the map was animated.
- **"A canvas is a bag of pixels" — the real claim, and it was overstated.** A Three scene graph is
  a queryable object tree, picking is testable math, and `?glcheck=1` makes the drawing buffer
  readable so an automated check can prove the board is being DRAWN rather than merely existing.
  What is genuinely lost is *semantic* pixel verification, and the mitigation is structural: the
  marks that carry a tile's meaning — the home glyph, seat names, work letters — are **projected
  DOM text, not meshes**, so they stay in the accessibility tree and stay assertable exactly as
  this section wanted. The harness pins the mark ladder itself (7 checks), and the SVG stage
  survives as `?map=2d`, a full second renderer that any check can fall back to.

*Original argument follows.*

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

**Direction re-ruled the same evening (supersedes the paragraph below): ROUTE B — the lit 3D
diorama.** The spike (`/spike3d/`) proved the guide's thesis: lighting does the heavy lifting, and
terrain costs nothing (geometry + vertex color + ACES/HDRI/AO). The art strategy becomes:

- **Buy model packs, not tile art.** One coherent family (Synty POLYGON class; CC0 Kenney/
  Quaternius as gap-fillers ONLY if they sit well beside it in the lit scene — validate before
  purchase, per the guide). A few hundred dollars covers neolithic→space; the 2D packs the owner
  surveyed were beautiful, medieval-locked, and era-priced.
- **Eras are prop-set + palette + LIGHT swaps.** Era legibility — the priority that killed paper —
  comes from swapping which props render, the terrain palette, and the sun/environment mood per
  era (warm dawn Stone, cold Iron, smog Industrial…), all era-fact data. The home tile's
  huts→metropolis evolution is the easy case: denser, taller prop clusters on one hex.
- **The identity is the digital tabletop** (design.md OQ3): bright, warm, Stardew-adjacent
  palette; the board-game read is invited. The guide's §7 board-on-a-table curvature shader —
  skipped in the spike — is promoted from optional to *wanted*: it IS the tabletop signature.
- **Splash art and premium icons** are where additional art budget goes (era-transition
  illustrations for the ceremony modal; a detailed SVG icon set) — not tiles.
- **Dev-art is livable indefinitely** (owner ruling): primitives under the lighting stack are good
  enough to build the whole game on; packs arrive when convenient, ideally via the recurring Synty
  Humble bundles.

*The paragraph below is the superseded same-day 2D ruling, kept for the reasoning trail:*

**Direction ruled (2026-08-22): evocative illustrated tile art, not paper.** The war-table/parchment
candidate is dead (see `interface.md`); the commission target is Civ-adjacent painterly richness —
as a reference *class*, not a literal — chosen for one stated reason: **the difference between ages
must be visible on the ground.** Two consequences now part of the spec:

- **Tilesets are per-era.** The same geometry re-dresses at each age; era legibility is a primary
  goal of the art, extending what the desk tint already does. (The manifest's `map` era-fact is the
  natural home for a tileset key when art lands.)
- **The home/settlement tile gets its own evolving art line** — a few huts at Stone through a
  bustling metropolis in the late game, one hex, zero mechanical change. The geometry/paint
  separation below was locked for exactly this, and it is the single most evocative expression of
  the game's premise available at any price.


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

**Refinement from play (2026-08-22, user):** the hex ladder carries a run all the way to max-Earth
— the same set of hexes re-denominates from "that hex is a lake" through "that hex is a rival
kingdom" to "that hex is a nation spanning much of a continent," each tile always one political and
economic unit you can interact with. **At the Space border the hex map is scrapped outright for the
node network, starting from a single node: Earth.** Conquer the solar system node by node, then
zoom out to galactic — still nodes. Two mapping systems, covering literally the rest of the game.


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
3. ~~**Is the map regenerated per era, or does it persist and extend?**~~ **RE-DECIDED the same
   evening — see §2.6, *One board, forever*. The answer is a candidate (d) that is not in the list
   below: generate the whole world once at full size and hide most of it behind fog.** It takes
   (b)'s payoff at (a)'s cost. The first ruling, superseded, was: **DECIDED 2026-08-22 —
   see §2.5, *The tile noun decides everything*.** The answer is candidate (c), plus a rule the
   original framing was missing: it does not happen at *every* border, only at the ones where the
   tile noun changes. The analysis below is kept because the two rejected options each fail for a
   reason worth remembering.

   Three candidates were on the table:
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
6. ~~**Do captured tiles have an ongoing economic identity?**~~ **DECIDED 2026-08-22 — yes, via
   terrain yield.** The section below leaned toward purely generic on the strength of `design.md`'s
   "absorbed is generic" rule. Merging the population and tile ladders overturned it: once
   population *is* the tiles you hold, production must derive from tiles, and if it derives from
   tiles alone (`tiles × rate`) the economy loses its allocation decision entirely. Terrain is what
   puts the decision back — *which* tiles you take becomes the question, and geography becomes
   opportunity cost. Per-tile named holdings stay **rejected**: that is unit micro under another
   name and it breaks the small-numbers law. "Absorbed is generic" survives intact in its actual
   domain, which is *flavor* — a captured place stops having a name and a personality; it does not
   stop having ground under it.

   The retirement-age test was applied and answered: **terrain yield never retires**, because from
   Iron onward it *is* the economy. Per the retirement rule, a permanent mechanic has to say so out
   loud rather than leave it assumed.
7. **Must you border a place to campaign against it?** Ungated preserves today's behaviour exactly
   and costs nothing. Gated turns the map into a real strategy layer — you must take the freehold
   to reach the kingdom — but it is a genuine new constraint that could deadlock a run if the
   generator places a wall between you and everything else. **Ungated is the safe first build**;
   revisit once distance-scaled costs are in and it's clear whether geography is already doing
   enough work.
8. ~~**Fog of war?**~~ **ANSWERED 2026-08-22 — yes, and it is now structural. See §2.6.** Fog as
   face-down tabletop tiles: unpainted board that gets painted in as you reach it, never a dark
   military shroud. The objection recorded here was answered rather than overridden — fog hides
   *unvisited country*, never the stats of a place you can see, so the reading-your-neighbours rule
   and the Info panel's show-everything stance are both untouched. And it does far more than "give
   the Scouting upgrade a job again": scouting becomes the Stone Age's spatial verb and the reason
   the map is playable two eras before it was going to be.
9. **Where does the map live in phase 8 — a modal, one panel, or the whole board?** This needs an
   answer to build, and it must not be "the whole board," because that makes phase 8 depend on
   phase 9. **Proposed: a modal**, opened from the Expeditions panel, which costs no grid real
   estate and is the largest surface the interface can currently hand out for free. Whether the
   Expeditions panel then survives as a separate surface, or becomes a list view of the same data,
   is a phase-9 question.
10. **Pan and zoom over a larger continent** *(flagged 2026-08-22, ideation only — expect it to
    come up when maps outgrow one screen)*. The honest answer: **not hard.** SVG pans and zooms by
    manipulating the `viewBox` — pan is translating its origin, zoom is scaling its width/height
    toward the cursor — with a wheel listener and a drag listener, roughly 60–100 lines, no
    library. Hover tooltips and click targets keep working untouched, because they are DOM events
    on the polygons and never cared where the viewBox sits. The real work is the fiddly 20%:
    click-vs-drag disambiguation (a small movement threshold), clamping so the player can't scroll
    the world off screen, zoom limits, and keeping the auto-fit behavior as the default framing.
    Touch stays out of scope with the rest of mobile. Performance is a non-issue until the low
    thousands of polygons. One design interaction worth deciding when it lands: the era `view`
    radius currently hard-filters what renders — under pan/zoom it could instead become a soft
    edge (unexplored country hidden under fog at the map's rim), which pairs naturally
    with directed scouting. **Both halves of that since ruled (§2.6): era view radii are retired
    entirely in favour of fog plus a camera that pulls back per era, and directed scouting is
    promoted to the Stone Age's spatial verb.** Under 3D this stops being a `viewBox` question and
    becomes an orbit-rig clamp, which is the same work in a different idiom.

11. ~~**Map size per era.**~~ **DISSOLVED 2026-08-22 (§2.6): there is one map and it does not
    resize.** The question becomes a single board budget — ~120 land hexes including islands,
    bracketed 100–200 by prop legibility and the pop ceiling from above and by island viability and
    terrain coherence from below. It still interacts with the minor-tier count exactly as noted, and
    they still tune together.

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
