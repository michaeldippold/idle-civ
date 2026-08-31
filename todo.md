# Idle Civ — Working Plan

> **This file is the authority on what is actually built and what happens next.** `design.md`
> holds game-design canon, `tech.md` the architecture, `map.md` the map arc, `interface.md` the
> interface system, `CHANGELOG.md` the shipped-feature record. Those documents describe a game
> that is partly *intended* rather than *implemented* — when they disagree with reality, this
> file and the code win.
>
> **Read first on a cold start:** [`2026-08-25-design-brief.md`](2026-08-25-design-brief.md) —
> what the game actually is now, and which old "laws" are dead. `map.md` and `interface.md` are
> slated for harvest-and-delete (see THE 8/25 REVIEW below); treat their back halves as history.

---

## WHERE THINGS STAND — 2026-08-31. **READ THIS FIRST ON A COLD START.**

*(This section replaces THE WORKING ORDER below as the entry point. That section's "START HERE"
still describes the night of 2026-08-25 and its 4b → 4c → 4d queue, all of which shipped days
ago; it survives as the SPEC for those items, not as a statement of what happens next.)*

**Everything lives on branch `substrate` — 25 commits, 1101 checks green, working tree clean,
pushed. NOT MERGED TO MAIN.** `main` is what GitHub Pages serves, so main is deliberately five
days behind: merging is the act of publishing (see [`relay/DEPLOY.md`](relay/DEPLOY.md)).

### What shipped in the 8/28–8/31 arc

The whole of **Part I and Part II** of [`2026-08-28-antagonist-spec.md`](2026-08-28-antagonist-spec.md):

- **S1** the `me()` sweep — the sim takes an acting civ; the **viewer ratchet** pins every file's
  remaining viewer reads so none can be added unnoticed.
- **S2** the per-player economy — every living civ keeps real books.
- **S3** verbs all the way down — and `core/replay.js` proves *(seed + tick + journal)* replays
  bit-identical.
- **M0** N human-grade seats, each with the full floor guarantee, spaced apart.
- **M1** the table: transport seam, the relay (`relay/server.js`, dependency-free), the join-code
  lobby, host-authoritative snapshots, the shared throttle.
- **Three army verbs** — March / Conquer / Sack — and **scouting resolved by ruling** (presence
  is scouting; slice 6 collapses).
- **The empty world** — `S.bots`, so a playtest can have no rivals at all.

### THE TWO THINGS NOT DONE *(owner, 2026-08-31)*

1. **It is not online.** No live URL yet. The game is publishable today (Pages already serves
   `main`); the relay is not, until the hardening pass below. `PRODUCTION_RELAY` is empty on
   purpose, so a hosted page offers single player and says so.
2. **There has been no live multiplayer playtest.** Two browser tabs on one machine, through the
   real relay, is as far as it has been proven. **The human-vs-human playtest era has not
   begun** — and it is the reason the whole campaign was sequenced this way. *"Those will come as
   I have time."*

**Nothing is half-built.** Both are gated on the owner's time and one security pass, not on
unfinished code.

### THE QUEUE, as it actually stands

**Next:** the **security hardening pass** (below) — it is the only thing between here and a
public relay, and it is about an hour. **Then:** deploy (merge + Fly/Render + one constant).
**Then:** the human-vs-human playtest era. **Then:** M2 and the brain campaign, informed by what
the playtests say. The tech tree stays gated behind all of it.

### HANGING THREADS — the complete inventory

**A. Transitional scaffolding from this arc.** Deliberate, load-bearing, and each must retire on
a named trigger. None is a bug; all four are lies-with-an-expiry-date:

| thing | where | retires when |
|---|---|---|
| `botMint` — bot units still minted, not trained | `sim/bots.js` | **B1**: nothing queues bot training until the brain exists |
| `botFamineExempt: true` | `core/config.js` | **B1**: the BUILD card's food self-care proves it feeds a realm |
| `botGoldRegen` — treasury trickle standing in for their merchants | `core/config.js`, `core/step.js` | the brain can trade |
| `PRODUCTION_RELAY = ""` | `net/table.js` | the relay is deployed |

**B. The viewer ratchet's remaining distance.** The rule is *no file in `src/sim/`, `src/map/` or
the sim half of `src/core/` reads `S.me` or calls `me()`*. Currently **12 `S.me` + ~134 `me()`**
across those files, every count pinned by the harness. Most of the `me()` are harmless parameter
defaults (`p || me()`) that retire as callers become explicit. The **twelve `S.me` are the real
list**, and they are M2's contents:

- `step.js:98` — `runConverters` runs for the viewer only, so **bots never convert** (no Forge
  output). Waiting on bots that build (B1).
- `step.js:136` — `die()` fires only for the viewer, so **a second human starving does not end
  their run**. Needs the per-viewer ending.
- `contact.js:158/192/307` — the **battle panel is emitted only to the viewer**, so a guest sees
  no dice for their own war. The most visible M2 gap.
- `contact.js:129` — `nameOf()` says "your own" from the viewer's seat.
- `armies.js:214` — watchtower vision reads structures owned by the viewer.
- `map.js:111` — the world's first claim, `owner: { "0,0": S.me }`.

**C. M2 — per-viewer presentation** *(specced, not built)*: the items above, plus per-client fog
rendering and the loser's ending. **And one it must not ship without: a remote seat's name is
sanitized only by a length cap, and `titleFor()` feeds an unescaped template — the moment M2
renders another player's name, that is a real remote XSS.** Fix at the render, before.

**D. Security** — [SECURITY: THE HARDENING PASS](#security-the-hardening-pass--owed-before-the-relay-is-public-logged-2026-08-28), seven ranked
items. Owed **before** a public relay, not after.

**E. Older threads, all still recorded and none lost to this pivot** — the fortification family's
open items (bots never build forts; walled bot seats are still passable as waypoints), real models
per building (the debt cubes are the ledger), scenery on built hexes, bigger glyphs, the
selected-tile panel's TLC, the interface redesign (item 6), the era re-dress (5a, parked), the map
frame editor, armies walking on the ocean (held for boats), losability and replayability (6b), and
the tech tree (item 8, gated).

---

## THE WORKING ORDER — *superseded as an entry point; kept as the spec for its items* *(owner priority, 2026-08-25)*

**This is the queue. Everything else in this file is the SPEC for one of these items.**

The work had accumulated as a mix of *phases*, *slices* and *named changes* — three numbering schemes
from three different plans, interleaved — and the owner correctly called it unreadable as a list of
what happens next. The old labels survive below because they are how each item is specced and
discussed; this section is the only place that says **when**.

### START HERE — the design night; next is **the 4b recalibration, then the caps (4c), then the era clock (4d)**

**Where things stand *(end of the design night, 2026-08-25, late)*:** **no code was written — on
purpose**, under the standing rule: consensus, document, commit, then code. The session started as
"one balancing thing" and redefined the game. Four consensuses, all swept into `design.md`:

1. **The genre, named** *(design.md → What this game actually is)*. Nothing idle is left: this is a
   **pausable real-time competitive 4X against simple adversaries** — between Civ (judgment) and AoE
   (execution), the scarce resource here is *attention*. Standing law: **no order ever gets better
   by being issued faster.** Prior art for everything: Stellaris.
2. **The caps come back, flat and free** *(design.md → Resources & Storage)*. Storage buildings die;
   every era sets automatic per-resource caps just above its capstone; food runs higher; **gold is
   never capped** — *cap what accrues while you are not playing, never what you can only get by
   acting.* Pacing and anti-hoarding, explicitly NOT difficulty.
3. **The era clock** *(design.md → Every Civilization Keeps Its Own Time)* — the headline.
   Adversaries advance through eras on hidden tick countdowns; one speedster guaranteed; the
   Chronicle telegraphs; era gaps read as unit KIND early, numbers late; adversaries get "pressed"
   by each other, narrated not simulated. Closes "advancing is a formality" from the open thread.
   The rule amendment: an adversary has exactly ONE mutable state variable — an era.
4. **Armies take the field** *(design.md → Armies Take the Field; direction only, wants its own
   session)*. Army groups with positions, stances (marching/scouting), interception, army-v-army
   dice, raids become inbound campaigns. Overturned the "no units on the board" scope ban. Slice 6
   scouting is promoted to prerequisite — scouting buys **warning time** now, not just map
   knowledge.

**The night closed with the docs squared to the new shape:** *What This Game Is* now leads
`design.md` as the one-screen summary of the settled design, and every doc was swept for language
still claiming rules tonight overturned (the Premise's units clause, the static-adversary ruling in
the economy section, the units bans in `map.md` and `interface.md`, the README's genre). Ideating
is closed; building starts at the queue below.

**Also found in play: the 4b constants are miscalibrated** — dormant at Bronze scale. See the
correction under 4b. That fix comes FIRST, because the clock only punishes falling behind; on-pace
friction is the economy's job and it currently isn't doing it.

**The queue: ~~4b correction~~ → ~~4c caps~~ → 4d era clock → slice 6 scouting → 6c armies.**
**4b and 4c SHIPPED the same night** (see their sections and the CHANGELOG), plus two live-playtest
bug fixes: the ledger's food rate now subtracts growth spending (it printed accrual over a falling
stock) and no resource ever ends a tick below zero (the "-1 food" float-residual display).

---

## THE BOARD GEOMETRY PASS — ruled 2026-08-28; **GEOMETRY HALF BUILT AND TUNED same day**

**What shipped** (live-playtested by the owner, two rounds of feedback folded in): `HEX_SIZE` 1.5,
sockets at 0.90, clearance 0.55 sized to prop HULLS, the courtyard placement (a garrisoned disc
stands at the hex centre; the besieger keeps its ring socket), the structure glyph YIELDING to a
drawn courtyard disc (same grammar as "an army outranks the ground it stands on"; an empty hold
keeps its square), the march-hold as a hub flush against the slots, the camera cash-in
(`near * 1.4 + 5`, max 57), the shadow frustum at 32, and the whole budget as harness arithmetic
in `hex3d.js` (which now owns `DISC_RADIUS`, `HUB_CAP`, `HUB_WALL` so node can check it).

**Two numbers moved in playtest, and the spec below carries the originals:**
- **March-hold wall 0.20 → 0.12** — owner: *"definitely a little cramped"*; the disc filled 87%
  of the courtyard flat-to-flat. At 0.12 (proportionally a curtain wall, ~11% of the hold’s
  width) the fill is comfortable and the harness holds an AIR line: courtyard inradius ≥ disc
  + 0.10, the parallax margin a 0.42-tall disc needs at the pitch clamp.
- **Disc radius 0.30 → 0.27** — owner: *"they already read as quite big"*, and the shrink fixed
  the one overlap the first budget missed: the HOVER SILHOUETTE is the disc scaled 1.14, and at
  0.30 its edge (1.242) crossed the ownership rim’s inner edge (1.23). The budget derives, so
  the hub cap grew to 0.63 for free. The harness rim check now measures the silhouette, not the
  bare disc — the owner saw the intersection before the harness did.

**Also shipped same day — THE DEBT CUBE** *(owner ruling)*: *"I insist every building have a
model, and if they do not currently have one they get a big player color cube. Big enough to say
'you owe me a real model here' but not gigantic."* Every built structure without a real model — all
of them except the march-hold — now renders a 0.55 × 0.45 player-colour cube at the hex centre
(axis-aligned, no jitter, under the hills' relief, inside the hub footprint). Three jobs at once:
buildings stop being invisible TODAY, the art debt nags until paid, and the silhouette split holds —
cylinder = army, cube = building, which is the discs' own cube-reads-as-building rejection used
forwards. It knowingly bends the two-vocabularies law (saturated player colour was pieces-only);
deliberate, transitional, loud on purpose. The farm keeps its bales as dressing around the cube —
the owner does not count them as a model; the barn is still owed. Cubes sink and rise with redress
like every prop, verified live. And **the march trail out of a march-hold starts under the
garrison** — the courtyard test now picks the trail's origin too, so the road and the disc can
never disagree.

**THE FORTIFICATION FAMILY v1 SHIPPED same day (2026-08-28, evening):**
- **Palisade** (Bronze + Iron): `fortifies`, wallPool 9, **slots 0** — nobody fights from a fence;
  wood-only cost. **Watchtower** (Bronze + Iron): wallPool 6, slots 2, **vision 2** — the first
  sight-emitting structure. Completion charts its ring-2 (sticky); `canSeeArmyAt` reads
  `def.vision` live, which is the earlier raid warning. The ladders run opposite ways and the
  harness pins them: wall twr < pal < hold, slots pal < twr < hold.
- **FORTIFICATIONS ARE IMPASSABLE, built**: `pathBetween` skips enemy-owned fortified hexes as
  waypoints entirely (never merely priced — an Infinity cost still produced a "path"); the
  destination stays legal, which is the siege. A walled-off region paths null → march honestly
  refused.
- **HUB AND SPOKE, built**: each fortified hex draws a bar from the edge midpoint inward to its
  `FORT_SPOKE_STOP` (hex3d's table — march-hold stops at the courtyard ring, tower and palisade
  run to centre and let the model occlude). **Timber spokes for the palisade, stone for the rest**,
  each hex drawing its own half — so a timber wall meets a stone keep with the material changing
  exactly at the shared edge. The palisade's model IS the stub hub (hex prism, parent orientation
  per the law); a keep–wall–tower chain reads as one continuous wall from adjacency alone,
  verified on the live board.
- **THE SOCKET VETO, built**: `allowedSockets(deltas)` in hex3d — an E/W spoke passes dead through
  the E/W sockets, so the feed reseats a besieger onto a surviving socket (the garrisoned owner is
  in the courtyard and never needs it). Feed and renderer share the one geometry, so they cannot
  disagree about where the walls are.

**Still open on the family:** bots never build fortifications (spoke linking skips the owner check
until they do — noted in props3d); walled bot SEATS are still passable as waypoints (the
impassability rule reads structures only — decide whether an Iron seat's authored walls should
block); the defensive tech lane awaits the tech tree; watchtower/palisade dev-art is serviceable
but unpolished.

**Still to build from the geometry spec:** REAL models per building (the cubes are the debt
ledger), scenery on built hexes, bigger glyphs.

*(The spec as ruled, kept for the reasoning — numbers above supersede where they differ:)*

**Owner's priority call:** *"Since this makes walls, watchtowers, disc-in-garrison, model-per-building,
etc etc possible it's pretty fundamental to how the game looks and IMO should come sooner rather than
later."* Arrived at over one investigation and three rounds of the owner's drawings. It began as a
question about hex size and ended as the architecture for every building and wall the game will draw.

### Why: the hex is measurably too small, and three things already overlap

The opening question: *"I think the hexes are a bit too small. Or the discs are too big… But I do not
know if this is like trying to swap building materials on the house when you are finishing the
plumbing. Size should not be load bearing I don't think, since travel time has nothing to do with hex
size."*

**Confirmed: size is NOT load-bearing.** `marchSeconds: 12` is flat per hex; the sim moves in axial
`q,r` and never sees world units; the 2D SVG takes `size` as a parameter (`map/model.js → toPixel`);
nothing in `src/` outside `render3d/` imports `hex3d.js` (only the harness does, for its socket sweep).
It is a renderer-local constant. The instinct was right on both counts.

**But `HEX_SIZE` is only half a knob.** Scales with it today: hex geometry, the ownership rim, the
march-hold footprint, and — via `spanOf()` — camera framing, zoom limits and fog. Does NOT scale:
`PIECE_SOCKETS`, `SOCKET_CLEARANCE`, `DISC_RADIUS`, every prop model, `SINK_DEPTH`, the shadow
frustum, and the camera's additive constants. So raising it alone widens the one gap that was never
tight, and this is a layout pass rather than a one-constant bump.

**Measured, at circumradius 1.0 / sockets 0.5 / disc 0.30:**

| Pinch | Today |
| --- | --- |
| disc ↔ adjacent disc | **0.107** — 18% of a disc's diameter |
| disc ↔ ownership rim | **0.02** at the corner sockets; *overlapping* at the edge sockets |
| disc ↔ march-hold wall | **overlapping** — all four sockets put the disc through the wall band |
| disc ↔ trees, huts | **overlapping** — see below |

**The scenery overlap is a budgeting slip, not a taste call.** `SOCKET_CLEARANCE` (0.34) measures to a
prop's **centre, not its hull**. A canopy is radius 0.13, a hut roof 0.21. A legally-placed tree at
exactly 0.34 reaches to 0.21 from the socket centre — 0.09 *inside* the 0.30 disc. So discs and
scenery interpenetrate today on every forest hex and on your own seat, and a garrison disc stands
inside the march-hold's wall. The clearance was sized against the disc radius and forgot that the prop
has a radius of its own. **This is the actual bug behind "the hexes feel too small."**

### The target: circumradius **1.5**, and why that exact number

Two unrelated constraints converge on it, which is the main reason to trust it.

1. **The march-hold's courtyard must hold a disc** (below). One disc plus margin needs a courtyard of
   ~0.40; real wall thickness ~0.20 puts the ring's outer radius at **0.60**. A building footprint is
   capped by `slot distance − disc radius`, so slots must sit at **0.90**, which needs an inradius of
   ≥1.26 → **R ≈ 1.5**.
2. **A chunky spoke must not cost slots.** A diagonal wall passes `0.5 × slot distance` from the N/S
   slots, clean only while that exceeds `wall half-width + disc radius`. For a 0.30-wide wall (matching
   the owner's drawings) that needs slots at 0.90 → **R ≈ 1.46**.

**At R = 1.5, nothing is compromised:**

| | Value |
| --- | --- |
| slot distance / disc radius | 0.90 / 0.30 *(built: 0.27)* |
| opposite-pair disc gap | **1.20** (today: n/a) |
| adjacent-pair disc gap | **0.673** (today: 0.107) |
| E/W slot outer edge vs inradius | 1.20 vs 1.299 — 0.10 margin |
| building footprint cap | **0.60** |
| march-hold | courtyard 0.40, walls 0.20 thick, ring outer 0.60 *(built: walls 0.12, outer 0.63)* |
| spoke width that still leaves 4 slots on a diagonal | up to **0.30** |
| hex area left free for scenery after 4 reserved zones | ~45% |

So the honest figure is **50% wider, not the ~35% first estimated** — the extra 15% is what the
courtyard costs, and it buys the whole fortification family.

### Piece slots: **four, on the cross** *(owner ruling — a proposal for three was put up and lost)*

Slots stay at N / E / S / W. A three-slot arrangement at alternating corners was proposed on the
grounds that corners are 30° off every possible spoke and so are never hit head-on. **The owner
rejected it and was right**, on four counts:

- **It optimised the wrong failure.** "Never head-on" is not "safe": a corner slot sits `0.5s` from two
  of the six edge directions, which is inside the graze threshold at realistic wall widths. Three
  corners trade a *rare head-on kill* for a *constant double-graze* — every wall orientation leaves
  exactly **one** clean slot of three, where the cross leaves **two**.
- *"With 4 placed as I suggested, there is only 1 wall orientation that intersects a slot, with yours
  two."* Correct: only the horizontal wall head-on-kills anything (E and W); the two diagonals kill
  nothing.
- *"With your 3 circles, they are also not directly across from one another, they sit at an odd
  angle."* Correct and it matters: three slots 120° apart can never yield an **opposite** pair, which
  is the roomiest separation there is. The cross's survivors are always the opposite pair.
- **"4 slots allows for a 4 player game down the line without us having to redesign this system."**
  Decisive on its own. Hex locking caps occupancy at 2 *today*; that is a current rule, not a permanent
  one, and four slots is free future-proofing.

**Consequence to keep in mind:** wall thickness quietly spends slots. Under ~0.30 wide (at slots 0.90)
a diagonal costs nothing; thicker, and diagonals start eating N and S, leaving the E/W pair. It
degrades gracefully — you never drop below two — so it is a look decision, not a functional one.

### Walls are **hub and spoke** *(owner's model, supersedes the edge-walk spec below)*

The earlier spec drew wall segments *along* hex edges, as the territory-rim algorithm in 3D. **That is
retired.** The owner's model:

> *"When a side can tell its neighbor is fortified, it raises the wall from the outer edge of the hex to
> the edge of the building model. The building model itself then is tasked with providing the extra wall
> if needed… The hex provides from edge to building edge, building provides from building edge to the
> edge of the model. A building knows what hex it's on, so it should know which of its neighbors are
> fortifications."*

- **The hex owns edge→hub.** For each of six edges whose neighbour is fortified, draw a bar from the
  edge midpoint inward to the building's hub radius. Nothing else.
- **The building owns hub→centre**, and mostly does nothing: a solid model's interior is not viewable
  space, so a spoke can simply run through it (*"it can probably just run right through it"*).
- **`hubRadius` is one number per structure** and it is the only thing that varies across the family.
  It is also the number the spoke renderer needs to know where to stop — the same number the slot
  budget already caps at 0.60. One parameter, two jobs.
- **The exception that earns the parameter: the march-hold's open courtyard.** A spoke run to the centre
  there would be visible across the courtyard *and* collide with the garrison disc standing in it. So
  the spoke stops at the ring's outer radius. Without `hubRadius` an open courtyard would be impossible
  to render, which would have quietly ruled out the best building on the board.

**One shape, one parameter, the whole family:**

| | Hub | Reads as |
| --- | --- | --- |
| Palisade | tiny, wall-height | a wall, continuous |
| Watchtower | small, tall | a tower with walls meeting it |
| March-hold | large, hollow | a keep with a courtyard |

**This also retires the cliff problem that killed the merged border.** A spoke lives entirely within one
hex, on that hex's own flat top; it never straddles a shared edge, so it never has to choose between
stopping dead and crawling down a cliff face. Two adjacent fortified hexes at different elevations meet
at the boundary with a **step**, which is what a real wall does on a hill. *To settle at build time:* a
spoke's outer end should extend down to the lower of the two hex heights so the join reads as a
buttress rather than a floating gap.

### The garrison disc stands **in the courtyard** *(owner ruling)*

> *"In my ideal world, for a march-hold specifically, if an army is garrisoned there their disc should go
> in the middle. Right now, as your troops approach a march-hold, there is no way to tell if there is an
> army in there. And no way to know how many. It could be 4 or 40."*

- **It makes the word "garrison" visible.** The term already means *behind walls only* (ruled 2026-08-26,
  below). Disc in the courtyard = garrisoned; disc on a ring slot = standing outside. The distinction
  the rules already draw becomes something you can see.
- **It gives the siege picture for free**: defender inside, besieger on the ring. Who is in and who is
  out, readable at a glance, no label.
- **The courtyard holds exactly ONE.** The only way two armies share a fortified hex is as enemies, and
  the second is by definition outside. That is what keeps the courtyard at 0.40 instead of the ~0.66 two
  discs would need.
- **The count problem solves itself**, because the count is already printed on the disc's top face. A
  garrison is read the same way, in the same place, as any field army. No new vocabulary.
- **No conflict with the never-print-the-odds law:** a visible garrison count is an *input*, and inputs
  are what the game owes you. Odds remain forbidden.
- *Note:* a `host`-tier disc (0.88 tall) inside a 0.29-tall wall will visibly overflow its fort. That
  reads correctly and should be kept.

### A lone wall gets a **stub hub** *(owner ruling, AoE's solution)*

> *"The way AoE solves this is if you build a single lone wall, you get a spoke in the middle waiting to
> be connected. It'll look silly but who ever only builds one wall. It can be wall height, color, and
> width, probably in a hex shape since it can take 6 neighbors."*

Hex-shaped is right, and for the stated reason: six neighbours means six flat faces for spokes to butt
into. **It is not an edge case, and should not look like a joke:** every wall line has two ends, so a
five-hex wall shows the hub at both termini. The stub is permanent, common vocabulary — visible on every
wall ever built — so it wants to read as *deliberate and unfinished*, not as a mistake.

### LAW: hexagonal models inherit the hex's orientation *(owner, 2026-08-28)*

> *"If you have a natural looking building, orientation can vary. If a model is hexagonal, it MUST share
> orientation with the hex it sits on. No exceptions. That leaves rotation as a possibility, but the
> sides and corners must always align."*

Free to follow, obviously broken the moment it is violated. The immediate consequence: the hub hex is
**pointy-top like its parent**, never rotated 30°, or every spoke butts into a corner instead of a face.
Naturalistic models (huts, towers, barns) keep their random Y-jitter; hexagonal ones lose it. Canon also
lives in `map.md` §3 beside the pointy-top lock.

### One central model per building

- **Nothing has a central footprint today.** March-hold is a hex ring at 0.63–0.80 (the whole hex), farm
  is three scattered bales, your seat is three scattered huts. Every structure is a *scatter*, not a
  building. "A structure occupies the hex centre within `hubRadius`" is a **new law** that tidies all
  three at once.
- **Footprint is per-structure, under the 0.60 cap.** A shared single number was proposed; the owner's
  drawings settled it — the tower's hub is small and the march-hold's is big, and that difference *is*
  the family. The cap is what keeps the slot geometry from being re-derived every time a building is
  added.
- **Placeholders are safe because the floating square stays the primary identifier.** The model is
  redundancy, not signal, so a brown box costs nothing in readability and buys coverage across every
  structure in one pass instead of stalling on art. *(Owner: "I want to get models for every building
  soon as well, even if the currently unspecified ones are just a brown box or something.")*
- **Home hex, first pass: move the three huts to the middle.** *"For your home hex, it can be as simple
  as moving those 3 buildings into the middle lol. But we will eventually want one per age for just your
  home hex."* The seats already differentiate by silhouette (your huts vs the adversaries' stone
  towers), so the per-age models have an axis to grow along.

### Also settled in the same pass

- **Scenery on built hexes, restrained** (owner: *"I do think I want this. It can be restrained, but I do
  think it's a good idea"*). Today `props3d` does `continue` on any built hex — nothing else stands on
  built ground — so built hexes read bald beside their neighbours. Scatter returns, dodging the reserved
  slots and the hub.
- **Bigger floating square and home icon** (owner: *"Since everything underneath them is just a model,
  it's basically decoration"*). These are DOM at fixed px: home/seat 22, minor 16, army 20, work 15.
  Two constraints — they were already bumped once (19→22) on 2026-08-25 for the same reason, so this is a
  second pass on a known-tight number; and **home/seat parity is deliberate** (your hall and a rival's
  are the same kind of thing, told apart by colour), so those two move together.
- **Intersections lose to walls, deliberately.** *"I am okay with a hex like the right side example in my
  drawing, where every single neighbor is fortified, my owner hex intersects with the wall, and that is
  perfectly fine. I want the walls more than I want zero intersections. But also no one is going to do it
  this way, you would be much better off making them march-holds."* Do not spend geometry solving the
  six-spoke case.

### Chores that come with the bigger number

- **Camera additive constants** don't scale: `near * 2.1 + 5`, clamps 6–38 and 14–120, fog `+20`/`+60`.
  They need a pass or the framing drifts.
- **The shadow frustum is a fixed half-extent of 14** (`stage.js`), against a board half-span of ~21
  today — so **shadows are already dropping off at the board's edges before any change**, and 1.5× makes
  it worse. Goes to ~32.
- **Framing must be retightened to cash the change in.** `frameBoard()` derives distance from `spanOf()`,
  so a 1.5× board pulls the camera back 1.5× and lands on an identical picture — same hexes, smaller
  discs. Showing ~33% fewer hexes at rest is the actual cost. The owner's zoom check says it is
  affordable: *"with the new interface, you can zoom out far enough to fit the ENTIRE MAP into your
  screen, so we may not need to zoom out much further with a size increase."*

### Sequencing

**Two passes, not one.** Geometry first — hex size, slots, clearance sized to prop hulls, camera,
shadows — so the board can be looked at and the proportions signed off. Then the fortification family and
the building models on top of a size already agreed. Doing it in one pass risks discovering at the end
that 1.5 was 10% too much, after everything has been built against it.

---

## SECURITY: THE HARDENING PASS — owed BEFORE the relay is public *(logged 2026-08-28)*

**The trigger (owner):** the site is public, it now does browser-to-browser communication, and
it has a text input. This is the note that says a dedicated session is owed, and what it must
cover. **Nothing here is known-exploited today** — see *what is safe right now* — but every item
becomes live the moment a public relay exists, so the pass comes BEFORE that deployment.

**What is safe right now, and why (do not lose these properties by accident):**
- The static site has no server, no database, no accounts, no secrets, and no user data. A
  stranger who loads it plays a game in their own browser and touches nothing of yours.
- **`DEFAULT_RELAY` points at `ws://localhost:8787`** (`src/net/table.js`). A stranger clicking
  "Open a table" tries to reach *their own* machine, fails, and is told so. **Multiplayer is
  therefore inert for the public today** — that is currently an accident of the default, and the
  hardening pass should make it a deliberate, commented decision.
- A guest may only act as its own seat (`e.pid !== session.guestSeat` is refused), and the host
  is authoritative: a guest that edits its local larder is simply refused — verified live.

**The ranked list for the session:**

1. **The host trusts the guest's message SHAPE.** `issueEntry()` dispatches network-supplied
   `verb`/`args` straight into game verbs, so a malformed entry can throw inside the socket
   handler (e.g. `build(defById("nonsense"))` → `def.kind` on undefined). A hostile or buggy
   guest can crash or wedge the host's tab. **Validate at the boundary**: known verb, arg types,
   id exists, tile exists. This is the highest-value item.
2. **A remote party now sets a string that renders in your page.** The guest's `seatName` is
   sanitized only by `.slice(0, 24)`. It reaches no innerHTML path *today* (nothing renders
   another player's name yet), but `titleFor()` feeds an unescaped template at
   `ui/map.js:598` — **so this becomes a real remote XSS the moment M2 renders "Brotherhold"
   anywhere.** Fix before M2 ships, not after: escape at every render, and consider a
   character allowlist at intake.
3. **The relay's memory is unbounded.** `state.buf = Buffer.concat(...)` grows without limit, and
   rooms are created without rate limiting — either is a trivial DoS on a box with no
   supervision. Cap frame size, cap rooms per IP, cap total rooms, drop clients that exceed.
4. **Join codes are guessable at scale.** 31⁵ ≈ 28.6M is fine against a human and weak against a
   script with no rate limit; the prize is joining a stranger's game (low harm, real annoyance).
   Rate-limit joins per connection, and expire rooms faster once paired.
5. **No origin check on the relay.** Any page anywhere can open a socket to it. Check `Origin`
   against an allowlist once the deploy URL is known.
6. **The guest applies a host-supplied snapshot wholesale** (`setS(snap)`). A malicious *host*
   is mostly attacking a consenting guest, so this is lower priority — but the snapshot should
   still be shape-checked rather than trusted, and `__proto__`-shaped keys rejected.
7. **`wss://`, not `ws://`,** once deployed: a page served over HTTPS cannot open an insecure
   socket anyway, so this is forced — note it so the deploy does not surprise anyone.

**On password-protecting the site (owner's question, answered 2026-08-28): recommended NO, for
security reasons — it is the wrong lever.** GitHub Pages has no native password support, so it
means moving hosting or fronting with Cloudflare Access; and it would protect the part that is
already safe (a static game with no data) while doing nothing about the part that is not (the
relay and the message handling). **The cheap, correct mitigation is already in place: do not
deploy a public relay until items 1–5 are done.** A gate is still perfectly reasonable for a
*different* reason — "I do not want people seeing unfinished work" is a product judgement, not a
security one, and if that is the motivation a password is fine.

---

## THE ANTAGONIST SPEC — 2026-08-28; **PART I (THE SUBSTRATE) SHIPPED on branch `substrate`**

**S1 + S2 + S3 + M0 + M1 are BUILT** — see the spec's build order for the shipped records and
the CHANGELOG. The sim no longer reads the viewer (ratchet-enforced), every living civ runs the
real economy, (seed + tick + journal) provably replays bit-identical, the world can seat two
humans on guaranteed ground, and **the brother game runs end to end through a real relay.**

**To play together:** `npm run relay` (or deploy `relay/server.js` anywhere that runs node —
it stores nothing and needs no database), then Open a table on the start screen and share the
code. The relay URL is one constant in `src/net/table.js`, overridable with `?relay=`.

Next on the branch: **M2, per-viewer presentation** (viewer-keyed Chronicle, per-client fog
render, the loser's ending) — then the HUMAN-VS-HUMAN PLAYTEST ERA, whose first deliverable is
a pacing verdict at literal 1×. The branch holds until then; merge ruling is the owner's.

**The spec is [`2026-08-28-antagonist-spec.md`](2026-08-28-antagonist-spec.md) — read it whole
before touching bot code OR multiplayer; it contains both audits, the merged architecture, and
the build order.** It supersedes the bot-brain spec written earlier the same day (same file,
see git history): the owner merged the two on the observation that *"the primary player needs
antagonists, either run by a bot or by another player"* — and because the bot spec's proxy
economy and multiplayer's need for the real one were about to fight. **The honest version won.**

The shape: one substrate, two decision-makers — **built in a deliberate order, RE-SORTED
2026-08-28 (owner ruling): the second human comes BEFORE the bot brain.** *"Player vs player is
by far the best feedback I will get, and it can tell me things that no bot can no matter how
good they are. Things like, 'is the game fun?'"* Board-game methodology backs it: Automas are
authored AFTER human playtesting, to imitate observed play — so the bot cards become
transcription of real strategies, not speculation.

**Part I, the substrate** (shared, first): **S1** the `me()` sweep — ~77 call sites; the sim
may never read `S.me`, harness-enforced; the fix is the military half's existing
take-a-civ-parameter idiom, not a new global. **S2** the economy goes per-player — real hex pop
for bots, `botMint` and the era restock die, everything is paid for. **S3** every
decision-maker calls the same journaled verbs (the journal's own promise, finally consumed).
**Part II, the second human** (promoted — the INSTRUMENT; 1.0 stays single-human): M0 N
human-grade seats in the generator (the one item with real design risk), M1 the join-code
lobby + relay + host-authoritative snapshots + the 1×-or-pause clock (see design.md → The
speed cap), M2 per-viewer presentation — then the HUMAN-VS-HUMAN PLAYTEST ERA, whose first
deliverable is a pacing verdict at literal 1×. **Part III, the brain** (authored from observed
play): a board-game Automa — postures (build / fortify / press / war; disposition is a weight
table, so "peaceful" is a high threshold, not a constant), priority cards, power-gated wars
that HOLD ground, relief, reprisals with memory, and the capital strike — the loss condition,
on by default, telegraphed twice. B1 (bots BUILD) may pull forward any time after S3 if bare
bot boards grate. All of it BEFORE the tech tree: a tree balanced against toothless
antagonists is balanced against nothing.

---

## THE 8/25 REVIEW AND ITS QUEUE *(added 2026-08-25, evening)*

A full-repo architecture review ran against the settled direction, and the design conversation
after it closed four more questions. Two new documents are now canon and should be read on a
cold start **before** this file's older sections:

- **[`2026-08-25-design-brief.md`](2026-08-25-design-brief.md)** — the story of the three games
  built in place, the six settled pillars, and a **graveyard table of struck-down laws**. When an
  older doc contradicts it, the brief wins.
- **[`2026-08-25-architecture-review.md`](2026-08-25-architecture-review.md)** — the findings,
  ranked, plus **Part X**, the design decisions from that evening (hex economy, the construction
  panel's death, trade at 1.0, caravans, army banners and sockets, stacking laws).

**The review's sequencing, with what has landed:**

1. ~~**Priority-1 doc poison**~~ **DONE.** `map.md`'s "era is a shared world clock" (the worst
   line in the repo — the exact opposite of 4d, which is next), the units bans, the reversed
   Closed Question on map regeneration, three `todo.md` items, and the un-bannered `redesign/`
   briefs. The pre-pivot interface brief was deleted outright.
2. ~~**Fix-now bugs + the vestigial sweep**~~ **DONE.** Two ReferenceError landmines (a call to
   the deleted `applyConsolidation`, and an undefined `n`), a self-XSS on the seat name, a
   soldier mintable from nobody, stale player-facing strings, `stage.dispose()` not disposing,
   and `S.bought` never counting. `spike3d/` and `sim-4b.mjs` deleted; dead state fields, CSS
   and DOM swept.
3. ~~**Close the action layer + the journal**~~ **DONE.** `setWork` is a verb; `setHexWork` is
   the only writer of `S.map.work`; `core/journal.js` records every accepted verb as
   `{tick, pid, verb, args}`.
4. **The hex economy (Part X.1)** — ~~one resource per hex, generator floor, market/bank trade~~
   **SHIPPED 2026-08-25 on branch `hex-economy`** (canon in `design.md` → *The Hex Economy*).
   Play-verified: "the closest the balance has been since before we added the map." The three
   per-resource boost buildings left the Construction panel and became terrain-gated structures;
   the alloy economy became mines you build. The starting trio now arrives full, which killed the
   last load-bearing idle beat in the game.
   ~~**X.2 — the construction panel's death**~~ **SHIPPED 2026-08-25** (canon in `design.md` →
   *The Construction Panel Is Retired*). The owner's call resolved the fork: the cap-1 unlock
   gates became **upgrades** (a building that costs once and permanently unlocks a unit is a tech;
   pricing them in hexes would have crippled a seven-clearing Stone realm — knowledge is not
   land), while the **Infirmary and Forge became hex structures**. Healing is positional now, the
   Forge can be demolished, and structures joined `DEF_INDEX`/`defById`/`manifestDiff` so there is
   one rule set instead of parallel tracks. The panel, its cards, its holdings grid and their CSS
   are deleted; Upgrades took the left column.
   **Still open from X.2:** the **capital tier** (Camp → Village → Town → City) as the home for
   dominion cap, army capacity and possibly era prerequisites. `panelTitles["panel-holdings"]`
   still re-denominates Settlement → Village → Town and now has no header to sit in.
   - *Live tuning notes, none blocking:* storage caps fill quickly once camps and pits are up
     (accepted — the era is the budget). A realm that spreads hard onto barren ground can still
     go food-negative in the extreme case; real play paces claims by cost and travel time, so it
     did not bite, but the ratio is the thing to watch if it ever does. And **the Bronze
     capstone's population gate (25) is now within sight of a fresh start** — a generous trio
     (two rivers and a forest) opens at 25 people, since the starting ground arrives full. The
     Soldier half of the gate still holds it shut, but the pop half has stopped meaning much.
     *(Owner ruling 2026-08-25: leave it. The gate may want replacing with something else
     entirely, but that is a balance question and most of the game model it would be balanced
     against — armies, per-player eras, the capital — is not built yet. Not worth tearing out
     now to re-derive later.)*
5. ~~**The per-player refactor (review Part I), as one campaign**~~ **SHIPPED 2026-08-26**
   (branch `per-player`, merged; canon in `tech.md` → *State Shape*, *Module Structure*,
   *The Event Bus*, *Adversaries & Expeditions*). Play-verified through to Bronze.
   Seven commits, each with its own harness section, 902 checks green:
   - **A civilization is a record.** Everything a civ owns moved off `S` into `S.players`;
     the human is `S.players[S.me]`, reached through `me()`.
   - **Ownership is a property of the tile** (`S.map.owner[tileId] = playerId`), with the
     per-civ list derived so there is no second copy to drift.
   - **Fog belongs to the knower** — `revealed`/`sighted` are the civ's, not the map's.
   - **Every civ keeps its own time** — `active(civ)`, and `advanceEra(era, civ)` sorted its
     side effects into "this civ's books" and "the human's screen".
   - **A seat is a civ's own** — `player.seat`, and `adminDistance` measures from the asking
     civ's capital.
   - **The map module became a package** — 917 lines to 236, acyclic *by check*.
   - **The sim stopped knowing the interface exists** — `core/bus.js` + `ui/wire.js`; the
     whole simulation now imports and runs headless with no DOM in scope.
   - **Neighbours became civilizations** — their `stock` became `res`, and they are authored
     out of their own age rather than yours.
   *Two real bugs it surfaced, both predicted by the review:* a bot reaching Bronze would have
   reset the human's game speed and opened the human's ceremony modal; and the owned-ground
   discount in pathfinding would have let your roads cheapen a rival's frontier.
6. ~~**The era clock (4d)**~~ **SHIPPED 2026-08-26** — `sim/eraclock.js`. Pace drawn per player
   off its own seeded stream at the world's birth (so it cannot perturb the simulation's dice),
   a hidden tick countdown per civ, advancement through the same `advanceEra` verb the human
   uses, and a **notification** on every crossing. One "faster" player guaranteed in every world;
   the first border lands around five to six minutes on every seed tested; capped at the last
   implemented era. `paceRivals()` is retired.
   *The browser caught a real bug:* `assignPaces` ran at every boot and re-scheduled from the
   CURRENT tick, so refreshing the page pushed every border further away — the clock was
   dodgeable with F5. It is idempotent now, with a check pinning it.
   **Ruling 7, the wire — SHIPPED the same day.** A raid reads its sender now: attribution is
   drawn during SELECTION, before the raid is rolled, and the sender's manifest supplies the
   roster while their era supplies the size. Each age has its own raid roster (a stone people
   essentially never fields horsemen; an iron people rides a third of the time), and being ahead
   skews further toward shapes the defender cannot answer — which the counter matrix already
   expressed, since both answering units are Bronze. Measured against a Stone player: a Bronze
   neighbour raids ~45% larger, an Iron one ~120%, and the per-age bonus ramps with depth so
   falling behind gets worse the longer a run goes.
   *A conflation surfaced while building it:* **who sent a raid** and **whether you can name
   them** were one function. `contact` gates the name — at Stone the danger comes out of the dark
   — but it never gated who was really out there. While they were one, a Stone player's raids
   were shaped by nobody, which is exactly the case the clock exists for.
   **Also started here: the Chronicle's turn toward notifications.** `notify()` on the bus and a
   `news` severity in the log are the first thread — facts arriving from the world, marked and
   styled apart from settlement flavour so the two can be separated when the rest of the
   Chronicle's idle-era prose is retired.
**DIRECTION, NOT CANON — the combat model gets torn up** *(owner, 2026-08-26)*. Recorded here
rather than in `design.md` because it is how the owner first imagined it resolving, not a settled
ruling — but it should stop anyone investing further in the current model.

`strength` was an IDLE-GAME simplification: one number per unit, and a fight resolved as
`repelChance = defense / (defense + raidSize)`. The intended replacement is the Axis & Allies /
Twilight Imperium family, which share a system: **each unit has a number it must roll to hit and
contributes dice; dice needing the same number are rolled together; both sides roll SIMULTANEOUSLY
and casualties are removed after, so a unit that dies still got to shoot; repeat rounds until one
side is gone.**

Two properties the owner is buying deliberately: what you bring to the roll-off is the skill and
the dice are the variance, and **fight length solves itself** — fewer units means fewer dice means
a quicker battle, with genuine tail risk when both sides whiff several rounds running.

*What this means for the existing code:* `repelChance` is the thing that dies — it was always the
idle abstraction. `casualtyWeight` survives as casualty ordering, `armorFactor` and
`weaponMultiplier` become to-hit modifiers cleanly, and `fortStrength` wants to become pre-round
fire (an AA gun in A&A, PDS in TI4) rather than a flat addend. **What the era clock's wire built
also survives** — raid size and shape decide *what force arrives*, which is the input to a roll-off
rather than part of its resolution.

*Owner rulings, 2026-08-26:*
- **It is an AUTOBATTLER.** No input once the fight joins — that is what keeps it a strategy game
  rather than a military-micro one. *"Your strategy put you into that battle; the dice gods decide
  if you win it."*
- **Casualties: your worst go first**, both sides, automatically. No per-battle choosing.
- **It plays out over ticks**, not instantly — it is fully scripted, so the pacing is free.
- **High rolls are better.** Dice size is open; d10 recommended (see below).
- **A BATTLE PANEL shows it happening** — both sides lined up, the viewer's own units always on
  the bottom, dice visible. Leaning into the board game. Two things this buys: the player gets an
  exact reason they lost, and an improbable win becomes a story worth telling. *"My one infantry
  killed six German tanks"* is a thing that actually happens in Axis & Allies.

*Owner rulings, 2026-08-26 (second pass):*
- **NEVER print the odds.** Not "you win this 70% of the time", not ever. Two reasons, and the
  second is the load-bearing one: no board game does this, and a printed number collapses the
  decision into a threshold check — the player stops reading the board and starts reading the
  number, and the skill the game is about evaporates. *"I forbid you to ever tell them the exact
  odds."*
- **Legibility is inspectable INPUTS, not computed outputs.** Armies are drawn on the board,
  clicking one shows its composition, and there is a pause button. That is enough. *"I really do
  not think players have an excuse for being blindsided besides 'I am bad at the game'. We are
  building this game for players who constantly check unit strengths when they can see them."*
  Consequence: the to-hit number must be printed on the unit **everywhere a unit appears**. "6
  Spearmen" supports no estimate; "6 Spearmen · hits on 7+" is the whole estimate.
- **The panel always opens** — it is never withheld for being a small fight, because that would
  hide something the player wanted. It gets a prominent close / "just tell me the result" button;
  closing it lets the roll-off finish in the background and the Chronicle logs the outcome. The
  frequency worry answers itself: fanning out into many small battles is a losing strategy, so
  there will not be many. Default always-show; an option may turn it off, but the game never
  *infers* the preference from a close.
- **Past 1–2× speed the animation degrades**, stepping down from rolling dice to faces appearing
  to a round summary. The battle is computed at once and *presented* as replay, so the panel can
  never desync from the result and can be closed, reopened (jumping to live), or re-watched.
- **Withdrawal is a GROUP STANCE**, set once and persistent, not a per-battle or per-dispatch
  choice — a standing order, which is strategy rather than micro. It must cost something or
  "withdraw at half" is strictly optimal: pull back to the hex you came from and forfeit the
  round, so the enemy fires and you do not.
- **Extra dice per unit is a tech-tree lever.** Power scales through dice count as much as through
  the to-hit number, which keeps every number on screen legible across twelve eras instead of
  inflating toward "hits on 2+".

**FORTIFICATIONS, AND THE COUNTER MATRIX'S REPLACEMENT.** The open fork above is closed, and the
answer is better than either branch: *the counters come from WHERE the fight is happening, not from
a unit-vs-unit lookup table.*

- **A battle is sealed when it joins.** The roster is fixed at the start — a reinforcement arriving
  mid-fight cannot join it. This matches the board games, keeps the panel honest (who you see lined
  up is who is fighting), and forbids drip-feeding units in, which is micro in disguise.
- **A battle runs to annihilation or retreat.** There is no between-rounds, because a between-
  rounds is a door micro walks back in through. An earlier draft here proposed "engagements repeat
  while the hex is contested, and a relief force joins the next one" — that is drip-feeding with a
  board-game costume on, it hands back exactly what sealing took away, and no reference game
  permits it. Struck. If one side retreats the battle is over; otherwise it ends when a side is
  gone.
- **Relief does not join a siege — it fights the winner.** You cannot slip an army inside a fight
  already underway. You muster a second one and attack whoever is standing on the hex when the
  first battle ends. The walls still buy the time (that is what the wall pool is *for*), and the
  garrison that died still bled the attacker, so the relief force meets a weakened enemy. "I could
  not save them, but I retook it" is the better beat anyway.
- **While walls stand, the attacker's hits go to the WALLS, not the garrison** — and the garrison
  answers with its archers *only* (see below), never at full strength. When the walls break it
  becomes an ordinary fight in the same battle: the roster is sealed, the wall state is not, and
  that turn is the drama the panel exists to show.
- **The wall pool is a PACING knob as much as a strength one.** Battle length is measured in
  rounds, rounds play over ticks, and the wall pool sets the round count. A siege is simply a long
  battle; it does not need a separate structure to be one.
- **Only ARCHERS fire from inside a fortification.** Melee units stand there and hope the walls
  hold (owner's idea, 2026-08-26). They are not free hit points — hits go to the walls, so melee
  in a fort does *nothing at all* until the breach, at which point every one of them wakes up at
  once. They are the reserve, and they are why storming a breach is terrifying.
- **FIRING SLOTS** (owner, 2026-08-26). A fortification has a fixed number of positions on its
  wall, and only archers may use them. This closes a degenerate optimum the archers-only rule has
  on its own: measured against twenty attackers behind a 24 pool, ten archers held **60%** where
  five archers and five horsemen held **17%** — an all-archer garrison simply outshoots the assault
  before the wall ever falls, so its melee never collect their post-breach value and garrisoning
  them is a wasted slot. With a cap, archers past it are bodies waiting for the breach exactly like
  the melee, and the reserve is worth having again. Measured after: at eighteen attackers, six
  archers and four horsemen hold **61%** where ten archers hold **37%**.
  - Slots are the **building's dial**, and a good one: 2 slots holds 0%, 4 holds 8%, 6 holds 35%,
    8 holds 65%, 10 holds 87%. Three things that had no number to move now have one — the
    fortification itself, the **capital tier**, and any structure that wants to trade wall for
    positions. The owner's example is a **watchtower**: fewer walls, two to four slots, and it sees
    one hex further in every direction. *"Once slots are in, this doesn't really add any new rules."*
  - The garrison mans the wall with its **best** archers first.
  - The filler decision has real texture: your *best* melee behind the wall is clearly right, and
    *cheap* melee is roughly a wash against surplus archers. Bodies are bodies; what matters is
    what they are worth once the wall is down.
- Therefore archers must be **worse than melee in the open**, or they are strictly better and the
  choice is fake. A garrison wants archers, a field army wants melee, and a mixed force is a
  compromise — which is the decision we want to force.
- **Walls without archers are a TIMER, not a defence.** They absorb hits and buy time for a relief
  force; they never kill anyone. Garrisoning stays mandatory, and an empty fortification is still
  strategically worth having.
- This opens a third slot: a **siege engine**, the only thing that efficiently reduces walls and
  nearly helpless in an open field. Melee / archer / siege is a rock-paper-scissors the *board*
  explains, with no matrix to look up.
- **Population does not fight.** It is the prize, not a participant. An undefended hex falls with
  no dice and no panel — one Chronicle line. If population fought, every hex would be a battle and
  armies would be pointless. Spreading wide therefore leaves you genuinely exposed, the same
  self-correction the food economy already has.
- The exception is the capital, and walls are its mechanism — which finally gives the **capital
  tier** (Camp → Village → Town → City) a mechanical job: each tier is a larger wall pool. Growing
  your capital stops being cosmetic.
- **No building ever rolls a die.** An earlier draft imported the A&A / TI4 idiom of a static
  defence firing a pre-battle volley (AA guns, PDS). Struck: this game has no referent for it —
  there are units in the field and units behind walls, and that is all. The garrison IS the
  defence. Whatever bunkers turn out to be later, they will not work by shooting.
- **Leave the baseline thin enough that upgrades have somewhere to go.** This is the strongest
  argument for archers-only, and it generalises: if a whole garrison fired at full strength the
  defence would already be overwhelming and there would be no room for thicker walls, watchtowers
  granting extra defending dice, longbows improving the archers' number, or any of the rest. A
  mechanic that is complete at tier one has no tech tree in it.

**A CONTESTED HEX IS LOCKED, AND THE SECOND WAVE IS A NEW ORDER.** (Owner, 2026-08-26.) While a
battle runs, no new force may enter that hex. An army dispatched there parks on an adjacent hex and
stops. When the battle ends it does *not* roll in on its own — you must affirmatively re-dispatch
it against whatever walls and whoever is left. Dispatching is a real order aimed at a board you
looked at, not a queue you fill and walk away from while the next fights resolve.

- This lands the first-attack-buys-information pattern for free. The second wave is dispatched by
  someone who *watched the panel* — they know the remaining garrison, the wall state, and how
  badly it went. The opening assault is a scouting expense as much as an attack, which is exactly
  what a real siege is.
- It is symmetric: a relief force parks adjacent the same way and is re-dispatched the same way.
- **The risk is an attention tax**, and it is the only thing that can make this bad. A parked army
  that nobody notices is a game punishing a player for looking away — the failure mode an
  idle-descended game must be most careful about. The mitigation is that a battle ending with
  friendly forces adjacent **must** raise a notification. This is a good job for the Chronicle in
  its new notification role: *"Your twelve spearmen wait at the Ashen Ridge."*
- Open edge case: an army retreating into a hex that has since been locked. Retreat is flight, not
  an attack, so it should still arrive — as a parked force, never as a joiner. If no legal
  destination exists, the army is lost, which is a fair price for overextending.

**STANCE IS SET AT DISPATCH, IN NAMED STEPS, AND IS EDITABLE UNTIL THE BATTLE SEALS.** (Owner,
2026-08-26.) The stance belongs on the dispatch screen where the group is created, stated loudly
enough that it is an actively made choice rather than a default nobody read.

- **Named steps, never a number the player types.** Withdraw at a quarter lost / at half / at three
  quarters / never. Round as needed. A quarter lost — three quarters intact — is the cautious one;
  half is already rough, and the owner is right that half a force lost can still be a battle you
  would win if you felt adventurous.
- **It is a RISK BUDGET, not a tactical brain.** The threshold reads only your own losses, and it
  deliberately does not know whether you are winning: "I will spend up to half this army on this"
  is a strategic sentence. Anything cleverer — retreat-if-outnumbered, retreat-if-losing — is the
  game playing itself, and the player did not ask for a second opinion.
- The known flaw is that you can withdraw at half with the enemy one round from breaking. **Do not
  patch it.** That is the same coin as the improbable win: pre-commitment costs something, and both
  faces of it are stories. Possible small guard: no retreat check before the end of round one, so a
  freak opening round cannot rout an army instantly.
- **Default to fight-to-the-death**, because it is the least surprising — it does what the word
  "attack" means. An army that quietly withdrew from a battle the player thought they were winning
  is *confusing*, and confusing is worse than bad.
- Editable while marching, frozen the moment the battle seals. Same line as everything else: it is
  a standing order right up until it becomes a battle input.

**ARMIES ARE DISBANDABLE, NEVER DURING A BATTLE.** (Owner, 2026-08-26.) Disbanding returns the
troops to the global pool. The cost is real but indirect: you have to assemble a new army and
dispatch it again, and that is the whole price — no attrition on top.

- **It returns them to the UNIT pool, not to the population.** Units carry `popCost: 1`, so a
  soldier is a person already spent out of the workforce. Disbanding a *formation* does not
  discharge its soldiers: the `me().units[id]` counts go back up, the popCost stays paid. Turning
  soldiers back into population is a different action with a different problem (hexes have terrain
  caps and may have no room), and it is not this one. A future session must not conflate them.
- **Disband only on your own territory.** Otherwise disband is strictly better than marching home
  — an army deep in enemy land could evaporate and reappear at the capital instantly, which makes
  retreat pointless and teleports units for free. Your soldiers disperse because they are already
  home. An army caught deep is genuinely caught, and territory gets another job.
- That one rule also covers the parked case for free: a force parked next to an enemy hex is
  usually standing on ground that is not yours, so it cannot dissolve itself out of trouble, while
  a defender reorganising inside their own borders can. The asymmetry is correct.
- **No partial disband, and no splitting armies.** An army is one object. Splitting is a fiddle,
  and disband-and-reform *is* the split mechanic — priced in travel time, which is the right price
  for reorganising. The group's stance dies with the group.
- Never during a battle, on the same line as everything else: the moment a battle seals, an army
  stops being something you can give orders to.

**THE PANEL CONSTRAINS THE RULES.** Everything that fires in a battle is standing on the hex. No
adjacency bonuses, no off-board modifiers, no tower two hexes away covering this one. The panel
must show the player exactly why they lost, and it can only show what it can line up on screen —
so anything that cannot be drawn as a row of dice cannot be in the combat system. This will kill
several tempting ideas later, and it should.

7. **Armies, combat, per-player era content** — built on the new shape, so bots and the human
   share the systems from birth. **THE WHOLE ARC SHIPPED 2026-08-26 on branch `combat-dice`, MERGED TO `main` 2026-08-28** —
   in order: the resolver (`f0998c4`), firing slots (`0447b69`), **A1** armies exist (`cbf2667`),
   **A2** they march (`c771973`), **A3** discs on the board (`86f949e` and the depiction commits),
   **A4** contact (`d5e0f0a`) — battles seal, play over ticks, survive save/load on one drawn seed
   — **A5** raids are armies and `repelChance` is deleted (`a63d364`, torch-aside `7a63065`),
   **the battle panel** (`819071d`), and **B** the neighbours become countries (`662bf40`).
   Detailed records for each below; the paragraphs that follow preserve the reasoning as it
   unfolded, including the A4-era note about where repelChance would die (it died exactly there).

   **A5 SHIPPED 2026-08-26.** The bots field real armies: the conflict event kept its cadence and
   lost its arithmetic — `spawnRaid()` (sim/raiders.js) musters a war party at the sender's seat
   out of the era-clock wire's rolls, marches it at a frontier-weighted soft target, and the
   Chronicle warns when it is first sighted. Garrisons mean battles; walls turn raiders away
   unfought — **and the torches turn aside** (owner, same day): a repelled war party burns the
   nearest unwalled hex beside the walls rather than going home, so fortification placement is a
   decision about what you are choosing NOT to protect; pillage is the old steal-and-toll on new
   legs; survivors walk home as veterans, one raid out per sender. *Validated in play the hour it
   shipped — owner: "I just watched a brown player war party wander over, fuck up my shit, and
   then peace out... this feels like another player hassling me. A very good signal going
   forward." Every other enemy before this was an abstraction.* **Deleted, not deprecated:** `repelChance`, `militaryStrength`,
   `unitStrength`, `counterUnitFor`, `counterCoverage`, `removeRandomUnit`, `CONFLICT_FLAVOR`,
   `fortStrength`, `CONFIG.fortRange/fortStrength/counterCasualtyRelief`. There is one combat
   system. Still on the old math: **campaigns** (`campaignStrength`, `wallPower`,
   `weaponMultiplier`, `armorFactor`) — they die when armies absorb the campaign/minor-fealty verb.
   **THE BATTLE PANEL SHIPPED the same day** (`ui/battle.js`): the sim narrates every round over
   the bus (seal / round / ended, human battles only) and the panel draws whatever round just
   played — a live view of the script, not a second clock, so it can never desync, pause freezes
   it, fast-forward speeds it, and reopening (the Watch button on any battle card) lands on the
   live round because there is no other round to land on. Viewer always bottom in their colour;
   die faces drawn with hits lit; walls as a draining masonry bar with melee greyed "behind the
   walls — waiting for the breach" and THE WALL COMES DOWN as the flash; casualties as red −n;
   the outcome banner lingers seven seconds and tidies itself away. "Just tell me how it ends"
   closes it per-battle, never remembered. Never the odds. Verified live: a 14-v-12 attack LOST
   on screen — final round, their two survivors rolled 8 and 10, mine rolled 4 and 4 — which is
   the exact-reason-you-lost the panel exists for. **THE B SLICE SHIPPED the same day** (`sim/bots.js`): the neighbours are COUNTRIES. Every
   power settles its seat and a home ring in the real ownership table, keeps a standing garrison
   sized by its own era's authoring (5 at Stone, a host of 32 for an Iron kingdom — the arc was
   already authored), and expands one frontier hex at a time on a slow clock toward its own era's
   dominion cap — the same scope law the human answers to. Their territory rims in their colour,
   their seat house wears it, and marching onto their capital seals a real SIEGE with their
   authored walls in the pool (`seatWallScale`; Stone seats are open camps, Iron seats are
   fortresses). A fallen capital stays fallen; a beaten-but-unconquered people regarrisons after
   `botRegarrisonSeconds` — a takeable window as the reward for beating the last garrison. The
   major March button DIED: armies are the verb against powers now, campaigns survive only for
   minors (fealty is a different prize) and die when armies absorb that too. Two real bugs came
   out in the digging: a null-key trap in wallsAt matched every human hex to the seat branch and
   silently deleted every march-hold from the resolver (ordinary hexes carry adversary: null, the
   human's key is null — caught by the fully-walled-realm check); and initAdversaries restocked a
   rival's walls from the VIEWER's manifest, so a bronze kingdom rebuilt stone walls — the same
   defect its own header said raidSender had already fixed. Left for "two players can engage": bots
   that WAGE WAR (conquest intent, not just raids), minors absorbed into armies — which is also where
   two seams the owner hit in play get closed: **marching onto a major's SEAT does nothing today**
   (the seat is an adversary hex, not owned ground, so contact's arrived hook has no owner to
   fight — campaigns are still the verb against majors until armies absorb them and the seat
   becomes a real capital siege), and **white-means-foreign dies entirely** (the discs, the battle
   panel stripe and the army links now wear real player colours; the seat HOUSES and territory
   rims go per-player when bots hold ground the board must paint).

   *(The original next-session note follows, kept for the reasoning.)* A5's shape as planned at
   the pause: The pieces, the resolver, contact, and the depiction are all live
   and validated in play — what remains is making the OTHER side use them. The shape of the work:
   the bots raise real armies out of their own rosters and march them at real hexes (the era-clock
   wire already decides what force an age can field — it feeds `formArmy` + `orderMarch` now instead
   of a dice table); the raid EVENTS die as a system, and `repelChance`, `militaryStrength`,
   `counterCoverage` and the counter-matrix remnants go with them; a raid becomes a brown disc
   walking out of the hills toward your border, visible under the same fog rules as everything else.
   After that, showing the players the DICE — the battle panel — is what makes it fully the board
   game ("when we start showing players dice, we'll be fully there").

   **MARCH LEGIBILITY AND THE DEATHBALL — DIRECTION, NOT BUILT (owner, 2026-08-26, at a
   stopping point).** Three connected observations from play, recorded for the next session:

   - **When will the bobbing disc move?** "It all reads as a bit unknowable right now." The sim
     knows exactly: remaining path cost × marchSeconds is a precise ETA. **The owner's chosen
     depiction (sketched): a small radial DIAL floating above each queued-to-move army**, a pie
     sweeping down from the centre as the next step approaches — per-disc, glanceable, no
     selection needed, the idiom every RTS player already reads. Nearly free to build:
     `marchProgress()` (A2) already computes exactly the 0→1 fraction "for drawing them on the
     road" and has never yet been drawn, and the label layer already floats DOM over board
     positions, so a conic-gradient circle does it without touching three.js. Fill in the owner's
     colour for their own armies (a foe's dial is intel —
     **RULED: shown, but only in sight**, the same fog tier as the disc itself). The selected army's panel adds the exact words on top: *"next
     hex in Ns · arrives in ~Ms"* — the player's own order, printed back.
   - **Armies march at identical speed regardless of size, and marching is FREE.** Confirmed in
     code: `progress += dt / marchSeconds`, size nowhere in it, and no provisioning — the old
     campaign system's "you march on what you can feed" (`provisionsFor`, still in
     expeditions.js) was never carried over to armies. Two candidate levers, probably both:
     - **Abroad upkeep — RULED (owner, 2026-08-26)**: units eat a multiplier (~2×) while their
       army stands off its own territory. Chosen OVER distance-priced provisioning, with the
       owner's reasoning on the record: *"all it costs to do a series of short cheap marches is
       attention/micro. So the cost can't scale with distance."* Cost scales with STATE (standing
       abroad), never with order length — the anti-micro law applied to logistics. Continuous,
       survives re-orders, taxes a deathball in proportion to its size for every second abroad.
     - **Band speed**: marginal slowdown by the existing tiers — a war party at base pace, a
       column a touch slower, a host slower still (owner: "marginally, not substantially").
       Legible because it rides the disc tiers the player already reads: *"a host marches slower
       than a war party"* is a sentence; a per-soldier gradient is not.
   - **The chase problem**: at equal speeds a fleeing army can never be caught, only cut off or
     met. Band speeds mostly resolve it — small-and-fast catches big-and-slow, so the answer to a
     deathball is harassment it cannot run down, while equal-band chases stay a matter of
     position (which is the meeting-engagement game working as intended).
   - **Why the deathball is checked economically, not by combat math**: the resolver's
     concentration advantage (Lanchester square, worst-first casualties shielding the good units)
     is deliberate — walls and firing slots are the combat-side equalizer. The deathball's
     counters should be logistics: it is slow (band speed), expensive abroad (upkeep), and it can
     only be in one place while raiders scout for soft ground and, later, bot armies press
     multiple fronts.

   **THE SELECTED-TILE PANEL NEEDS TLC — "the biggest UX issue right now by far" (owner,
   2026-08-26, iron-age playtest).** Two problems, one of them a real bug:

   - **It is far too small for what it has become.** `#panel-tile { max-height: 40% }` was sized
     when the panel held a terrain blurb and a Settle button. It now carries the army card
     (roster, dice numbers, band, orders), the four-option stance picker, March / Sack / Disperse /
     Halt, the sack progress line, army pointer rows, battle cards with Watch, the build list, the
     market board, and the settle blurb — inside a 40% box that scrolls. The panel became the
     game's primary control surface without ever being re-laid-out for the job.
   - **The buttons are white-on-white, and it is a THEME BUG, not a taste call.** The
     `--btn-*` tokens invert per era: light desks paint dark-on-light, and `body[data-era]`
     bronze/iron flips to `--btn-bg: #f4f1e6` (near-white) with dark text. But the tile panel's
     own surface is ALSO pale in those eras, so the inverted plate lands white-on-white and only
     the letter-spacing saves it. Whatever the redesign does, buttons must contrast against the
     PANEL they sit on, not against the era's chrome.
   **~~MERGED TERRITORY BORDERS~~ — BUILT, THEN REVERTED (2026-08-26/28). DO NOT RETRY AS
   SPECIFIED.** It works perfectly on flat ground and cannot work on this board, for a reason
   that is geometry rather than polish: **hex elevation.** Terrain heights spread ~0.4 units
   (measured: hills 0.528, plains 0.123) and cliff faces are drawn in the vertical plane AT the
   shared edge. So a flush perimeter is buried in the neighbour's cliff wherever the owned hex is
   the lower of a pair; pulled inside the cliff plane it survives, but then at every height step
   the border either **stops dead at the edge** or would have to **crawl down the wall**, and the
   owner's verdict on seeing both: *"there is no way to get a clean flat hex border on multilevel
   terrain… both look weird as hell."* The per-hex inset ring works precisely BECAUSE it never
   goes near an edge. Reverted whole (`29719f5`).
   - **What was learned and is worth keeping:** `edgeCorners(dq, dr)` in `hex3d.js` does the
     neighbour-edge lookup with no corner-ordering assumptions, and the perimeter walk itself is
     cheap and correct — the failure was entirely the collision with terrain height, not the
     algorithm. **This mattered for the WALL art**, which was specced on the same edge-walk and
     would have hit the identical cliff — **resolved 2026-08-28**: hub-and-spoke walls never touch a
     shared edge, so the problem does not arise. The prediction that walls "want to follow terrain
     height as real geometry, which walls unlike a flat rim can plausibly do" was right, and the
     owner's model gets there by a better route: adjacent fortified hexes at different heights simply
     meet in a step, the way a wall climbing a hill does.
   - The original proposal, for the record: Replace the per-hex
   ownership ring with ONE perimeter around each realm: walk every owned hex's six edges and draw
   a segment only where the neighbour has a different owner, skipping shared interior edges. When
   you settle, the border MOVES OUT to encompass the new ground instead of adding another outline.
   - **The same primitive as the connecting-wall art** above — build the edge-walk once and both
     fall out of it. Walls become "the perimeter, but built".
   - **Cheaper than what exists.** `terrain3d.ringInto()` emits a full hexagonal ring per owned
     hex today, merged into one mesh; a perimeter emits only outward-facing edges, so a twelve-hex
     blob drops from the equivalent of ~72 edge segments to ~14, and interior hexes cost nothing.
     Still one draw call.
   - **Flush-to-the-edge becomes CORRECT here**, and the code history says why: the rim band was
     pulled inward (0.82–0.94) partly because a ring reaching the hex's full 1.0 extent "reached
     the hex's very corner, where neighbouring tiles touch… which is why it read as spilling onto
     the ground next door". That failure is per-hex-specific — rings bleeding onto your OWN
     neighbours — and a perimeter deletes it by construction, since the only edges drawn face
     ground that is not yours.
   - **What it buys:** the realm reads as a country with a silhouette rather than a list of claimed
     tiles — shape, frontier, chokepoints. Detached holdings read as islands, which is real
     strategic information (far from the seat, hard to relieve). Two adjacent realms show two
     parallel borders along a shared edge, which is what a contested frontier should look like.
     And hover/selection become the only per-hex rings, so they read more clearly.
   - **To decide when built:** interior hexes lose any per-hex ownership marker. Enclosure is
     probably sufficient (that is how every map works), and the work letters already sit on them.

   **THE FIRST-PASS LAYOUT (owner's sketch, 2026-08-26) — a nav rail and three full-height
   panels.** Deliberately not a whole redesign; a re-parenting that gives every surface the room
   it now needs:
   - **Left: a vertical icon rail** hugging the ledger, with ONE panel beside it showing whatever
     the rail last selected — full height, the whole left column. Three icons:
     1. **Population** — today's People roster and Training cards merged into one panel.
     2. **Tech Tree** — for now literally the Upgrades panel interior, unchanged. (The name is the
        point: this is the seat the real tree will grow into.)
     3. **Inspector** — the selected-hex / selected-army panel (today's cramped `#panel-tile`).
   - **Right: the Chronicle, full height.** Well-timed — it is a notification feed now, not
     flavour prose.
   - **Bottom: the build queue, permanently docked** (today it floats center-bottom). It will not
     collide with the battle panel, which mounts center-top.
   - **THE LOAD-BEARING RULE: clicking the board auto-switches the rail to Inspector.** Otherwise
     you click a hex while Tech is up and nothing visibly happens — the map silently stops
     answering its primary interaction. Same for clicking a disc. Inspector's close should return
     to the previously-open panel, so dismissing a hex never dumps you on a blank surface.
   - **TWO PANELS, NOT THREE — and no close button.** Corrected by the owner: the Chronicle is
     always the right panel, ONE of the three is always the left panel, and neither can be
     closed. The rail swaps *which*, it never adds a column, so the layout is exactly today's
     two-column shape and the map is not squeezed. **Inspector is the default.** (A "collapse to
     rail" idea was proposed and scrapped — it solved a crowding problem that does not exist.
     Always-one-open is the stronger rule anyway: it deletes the closed state rather than
     handling it.)
   - **CUT THE SCREEN GUTTERS.** Panels dock to the screen edges: the era-coloured padding around
     the board is reclaimed. Concretely — `#floatLeft`/`#floatRight` carry `top/bottom: 10px`
     plus `left: 10px` / `right: 10px`, and `#panel-queue` sits at `bottom: 10px`; left, right and
     bottom go to zero. Net effect: the same panel count as today with more room, which is where
     the extra space comes from rather than from squeezing the map.
     - *Consequence to decide deliberately, not discover:* these are `.float-panel`s carrying a
       hard offset shadow from the 2026-08-22 flip, when the map became the canvas and panels
       floated OVER it. Docked, the outer shadow has nothing to fall on — the inner edge facing
       the map still does real work. That is a small intentional move from "floating" toward
       "framing", and should read as a decision rather than a bug.
   - **SELECTION IS STICKY — a focus, not a mode (ruled).** The game opens focused on your home
     hex; after that you never have *nothing* selected, you only ever move the focus. *"There is
     no gameplay benefit to unselecting, when next time you want to select something you just
     redirect."* Consequences: the panel's × disappears, `selectTile(null)` loses its only caller,
     and the "nothing selected" render path stops existing — the empty line ("click a holdfast or
     an army") survives only as the pre-first-click state the home default already covers. The
     board always carries a selection ring, which is a feature: you can always see where your
     attention is parked.
   - **When the focus DIES, fall back to the ground.** Hexes are permanent; armies are not. If a
     selected army is destroyed (or disperses, or merges away), the focus should land on **the hex
     it was standing on** — you were already looking at that place and something just happened
     there. Falling back to the seat would yank the view across the map at exactly the moment the
     player wants the aftermath. (`selectedArmyObj()` already detects the vanished case and nulls
     out; it needs to hand off instead of clearing.)
     - **And the fallback is itself a signal** (owner): *"it kinda hints what happened if you
       weren't watching — there was an army on that hex, now an empty hex selected where the army
       was."* It pairs with the Chronicle rather than repeating it — the Chronicle says WHAT
       happened, the selection says WHERE — so the panel should add no words to it; the emptiness
       is already legible.
     - **Death and absorption are different endings.** A selected army that MERGES into another of
       yours loses its uid the same way, but nothing was lost — the soldiers are standing there
       under a different id, and falling to the ground would read as "where did they go?". Merged
       → follow the host army; destroyed → fall to the ground.
   - **Keep the verbs split**: *training a soldier* (Archer/Horseman cards) belongs in Population;
     **Raise an army** is hex-contextual and stays in Inspector, where the hex is. Population
     produces soldiers; Inspector commits them to a formation on specific ground. That split is
     what stops "raise" from needing a hex-picker of its own.
   - Structure favours it: every panel is already an independent `<section class="block
     float-panel">` with its own id, so this is re-parenting + a rail + show/hide, plus retiring
     the `#panel-tile { max-height: 40% }` and column-percentage rules in styles.css.

   - Worth folding into the same pass: the panel is where the wide-modal idea was always headed
     (the tech tree wants that shape too), and the battle panel's own design polish is queued
     right beside it — one interface session could take both, since they share the army-roster
     component and the dice presentation.

   **FORTIFICATION FAMILY + WALL VISUALS — LOGGED, NOT BUILT (owner, 2026-08-26, mid-playtest):**

   - **Palisade** (probably Bronze): `fortifies: true, slots: 0`, small pool (~8–10), wood-heavy,
     produces nothing. Zero new mechanics — the resolver already handles a garrison-less bare wall
     ("walls are a TIMER") and a garrisoned one (everyone silent until the breach, which is the
     owner's exact ask: "forces an engagement against the wall strength" with nobody shooting).
     Fills the Bronze gap: fortification is Iron-only today while raids bite hardest in Bronze,
     and it gives the march-hold a clean identity as the upgrade — thicker walls, and finally,
     positions to shoot from.
   - **Watchtower** (owner): `fortifies: true`, LESS wall, FEWER slots (2–4), **more VISION** —
     the first sight-emitting structure. The fog canon already lists structures among the sight
     emitters; the watchtower is where that clause gets real (radius ~2 sighted, feeding
     `canSeeArmyAt` → earlier raid warnings, which is what warning time is for).
   - **FORTIFICATIONS ARE IMPASSABLE (ruled)**: an enemy-owned fortified hex cannot be marched
     through — to cross it, you attack it. One rule, and walls actually wall: lines channel
     movement, chokepoints exist, valleys can be shut. "It quietly makes all fortifications walls
     — strolling through a march-hold should definitely not be possible anyways." The strategic
     frame, owner's words: *"It gives you more lines of play: fight hard, or turtle hard at the
     beginning. Walls are great, unless they get to siege engines first"* — turtling is a real
     opening and the siege engine is its clock, the era race as the counterweight rather than a
     tuning nerf. Build notes: pathBetween treats enemy-fortified hexes as blocked (orders route
     around; a walled-off region paths null → march honestly refused); ordering directly AT one is
     the existing siege; raiders already turn aside; war armies besiege.
   - **ORIENTATION IS DERIVED, NEVER CHOSEN (ruled)**: no rotation input at placement. A lone wall
     gets a standalone look; the moment a fortified neighbour exists, the art reaches out and
     meets it at the shared edge — walls meet march-holds, towers link too, so keep–wall–tower
     chains simply happen from adjacency. Placement stays one click; the owner's "3 orientations"
     resolve themselves from the map. (buildProps is already per-hex with neighbours readable.)
     **The geometry that derivation produces is hub-and-spoke** — see *The Board Geometry Pass*.
   - **The defensive TECH LANE (owner)**: the fortification family gives deep defensive upgrades a
     home — thicker pools, more firing slots, tower vision range — a whole tech-tree vector.
   - ~~**Wall VISUALS**: edge-segment walls drawn along hex edges, the territory-rim algorithm as 3D
     geometry~~ — **SUPERSEDED 2026-08-28 by HUB AND SPOKE.** See *The Board Geometry Pass* above.
     Walls no longer run along edges at all: they run from an edge midpoint INWARD to the building's
     hub, so they live inside one hex and never straddle a boundary. What the retired spec got right
     and the new one keeps: mechanics stay omnidirectional per hex while only the geometry is
     directional, adjacency alone makes keep–wall–tower chains, and *"a long line of hex circles reads
     as a line of march-holds, not a wall."* What it got wrong: drawing on the shared edge walks
     straight into the terrain-height problem that killed the merged border, and it had no answer for
     the garrison disc — which the courtyard now solves outright.

   **GARRISON, THE TERM (ruled, corrected same day):** "garrison" applies ONLY to units behind
   literal fortifications — walls, march-holds, towers. An army standing in a field is a **parked
   army**, not a garrison ("garrison traditionally means defending fortifications, not standing in
   a field" — owner). The word now tracks the actual rules boundary: garrisoned troops are the
   ones the fortification mechanics apply to (silent melee, firing slots, the breach). Still a
   STATE, never an order — standing on a fortified hex is enough. UI should follow suit: the army
   panel says "Garrisoned" only behind walls. The bots' `intent: "garrison"` field wants renaming
   to `"hold"` when next touched, since their seat may be an open camp.

   *Found in browser verification of A4, both open:*
   - ~~Armies do not emit sight~~ — **closed 2026-08-26, the day the owner watched his own disc
     march off the edge of the drawn world.** Two halves, per the fog canon ("sight is emitted by
     your units..."): a marching column **charts the road it walks** (`chartGround`, fog.js —
     sticky, like all charting), and **presence is eyes** (`canSeeArmyAt`, ui/map.js — a foreign
     army is visible when your own stands on or beside its hex, stateless so it moves when the army
     does). The scouting slice still owns ranges, stances, and anything cleverer.
   - ~~Held ground could be SETTLED out from under its owner~~ — **fixed same day**: `settlePlan`
     only excluded *your* hexes (`isOwned` defaults to the human), latent since the per-player split
     because rivals could not own ordinary hexes before armies. Harness-pinned.

   **HOW AN ARMY IS DEPICTED — SETTLED AND BUILT 2026-08-26.** Full canon and reasoning in
   `design.md` → *How an Army Is Depicted* / *The Army Detail Panel* / *The ERA Dot*. The build list
   below SHIPPED the same day (`render3d/pieces3d.js`, piece sockets in `hex3d.js`, the scenery
   shrink in `props3d.js`, typed selection and the army panel in `ui/map.js`): discs with tier
   heights and the count textured on the top face, socket clearance enforced by a harness sweep
   (which caught overlapping clearance circles in the first socket layout before they ever hit a
   screen), piece-first picking, the hex panel demoted to pointer rows, and dispatch feedback —
   path dots on the road ahead while your marching army is selected, a gentle bob while an order
   stands, and a hop when the piece crosses a hex, since travel is pick-up-and-plop by ruling. The
   neighbours got authored colours (hill people brown, river folk blue, salt wanderers teal) with a
   boot-time heal for older saves and a collision guard against the human's pick. The ⚑ label
   survives only on the 2D debug board, which has no piece layer. Still open from the canon: the
   ERA dot and dice-boxes panel (wants the wide-panel work), and the era-scoped unit ids it
   depends on.

   - A **player-coloured disc**, a real 3D object with its own picking — not the banner-on-a-pole
     that was drawn and discarded, and not today's DOM label. **Three thickness tiers** by headcount
     (war party / column / host, absolute cutoffs, non-linearly spaced), fixed diameter so socket
     spacing never moves, smallest tier clearing the scenery cap.
   - **Scenery shrinks and gets a height cap**, so pieces are always the tallest thing on a hex.
   - **The count is printed on the disc's top face.** The camera's 25–66° pitch clamp already
     guarantees the top is never edge-on. Upside-down at some azimuths is fine — it is a poker chip.
   - **Selection becomes typed** (nothing / hex / army) and picking raycasts pieces before ground.
     The tile panel keeps a **pointer** to each army standing there, never an embedded card.
   - **The army detail panel** — ERA · # · Type · Role · Dice, with dice **drawn as boxes**, no
     army-wide total, casualty order by default, identical layout for yours and theirs, and the same
     component as the battle panel's rosters.

   *The sockets ruling in `2026-08-25-architecture-review.md` is superseded in its particulars* — a
   ring of 3–4 for banners angled to face each other — but its principle stands: anchor points the
   prop scatter never fills, a garrison merging into the structure, and position (not flag heading)
   carrying the confrontation. The hex-locking rule also caps real occupancy at the structure plus
   two pieces, since a contested hex bars new entrants and a battle is two-sided, so the ring never
   needed to be sized to the seven player colours. **Amended 2026-08-28:** the ring settled at FOUR
   anyway — not for simultaneous occupancy, but so a wall crossing the hex can veto the slots it runs
   through and still leave a clean pair, and because *"4 slots allows for a 4 player game down the line
   without us having to redesign this system."* Two-at-a-time is a current rule, not a permanent one.

   **The scouting prerequisite is DROPPED, and the dependency is
   inverted** (owner, 2026-08-26): we do not yet know how scouting works, and scouts can be caught
   by armies — so combat wants to exist *first*, and scouting is built against it. The older note
   ("without reach-beyond-the-border an inbound army is invisible until adjacent") described a
   world where raids arrived from nowhere; armies on the board are visible by standing on it.
8. **The docs collapse, ten → four** (review IX.0): harvest `map.md` and `interface.md` into
   `design.md`/`tech.md`, then delete them; prune `todo.md`'s archive. Best done at a hold near
   the refactor, since the refactor obsoletes more passages and `tech.md`'s rewrite should
   describe the new state shape.
9. **Performance (review Part V)** — set-based fog, one cached seat Dijkstra. Measure first.

**The branch ruling (2026-08-25) still stands:** one-session work lands on main; multi-session
work branches. Steps 1–3 were one session and landed on main.

---

**The previous session's record, kept while its playtest brief is live *(2026-08-25, day)*:** harness green at **755 checks**, working tree
clean, everything pushed. A long session: the three queued items shipped, then five more things that
were not on any list. **Nothing is half-done and no decision is pending on code that exists.**

**What shipped, in order** *(one long day; the list grew three times)*:

1. **The vestigial code** — three dead fields, not two.
2. **Raid attribution (C3)** — gated on `contact`, so Bronze names the danger.
3. **The map picker** — plus the owner's two additions, so the start screen asks World, Colour, Seat.
4. **The board's colour law** — powers off red, hover/selection off yellow, seven player colours,
   red/orange/yellow reserved for status. Then foreign rims, then one rim width for everything.
5. **The odometer** — re-specced by the owner to REPLACE the topline population count. Iron reads
   SUBJECTS 5,800. Iron's `popNoun` stopped colliding with its tile noun, and the compiler refuses
   that collision now.
6. **The infrastructure for a living board** — the use seam, losing ground when a hex empties, and
   the sink-and-rise transition.
7. **Building on hexes (5b), with content** — the **Farm** (Bronze) and the **March-hold** (Iron),
   plus the SELECTION / RESOLUTION split in the conflict resolver, which was the larger half.

**Also fixed on the way:** the 2D-flash on boot, a 12%-flaky harness check that had been passing for
the wrong reason, and a `.tile-pop` class that had never had a CSS rule.

**Six bugs the owner found in play**, all fixed: copper and tin drew no work glyph; Settle refused in
silence; hay appeared instead of rising; the march-hold rendered as an Escher figure (inconsistent
winding, so culling dropped a different subset at every angle); the wall out-topped the mountains;
and March did nothing at all with an empty muster. **Three of those were the same bug** — a verb that
refuses without saying why — and `interface.md` now carries that as a law.

**Standing lessons live in their own section below — see LESSONS THAT KEEP COSTING TIME.**

---

### THE SEAMS — built first, and now carrying content

**All three were built before anything needed them**, at the owner's instruction, to the standard set
by the geometry/paint split that made 3D cheap. Two now have content on top and the third is proven
by a dev button. That ordering is the reason 5b took an afternoon rather than a week.

- **The use seam.** `hexUse(id)` answers `rest` / `resource` / `structure`; `hexProduces()` and
  `hexResource()` beside it. Structures live in the same slot behind a `build:` prefix, so a second
  simultaneous use is unrepresentable rather than merely forbidden. 14 checks already exercise
  `build:farm` and `build:fortification`.
- **Losing ground.** `loseHexIfEmpty()`, called from every path that can empty a hex. Reverses rule 9
  on new information (the `dominionCap` postdated it). Ghosts and the rekindle are deleted with a
  tombstone.
- **The sink-and-rise.** `changedHexes(ids)` — props sink, the world changes underneath, new props
  rise. General by construction: the re-dress, a build, a demolish and a hex loss all route through
  the one call. Verified in flight (Y returns to exactly its rest value, not near it).

**The one balance flag from all of this, for play rather than argument:** a fresh hex enters at 2
people and a raid takes 1–2, so a newly claimed hex can be lost within seconds — measured at 0.3%
inside five seconds. Either the over-extension punishment the rule was written for, or arbitrary.
Dials if it reads wrong: new hexes at 3, or a grace period before reversion.

---

---

### 4b — THE ECONOMY MUST BE ABLE TO BREAK YOU ✅ *(shipped 2026-08-25 — but see the correction below)*

**Diagnosed and ruled 2026-08-25 after a two-hour unattended run** — 228 souls, 11 holdings, zero
army, food climbing at +24/s, population never below 226. The game could not be lost by inattention.
The full reasoning is `design.md` → *The Economy Must Be Able To Break You*; this is the work list.

**The root: production and upkeep are BOTH linear in population, with a fixed margin.** A flat
per-capita sink can never catch a per-capita source. The sink has to scale faster than the source.

1. **Upkeep scales with administrative distance** — the one change that bends the curve. Reuses
   `adminDistance()`.
2. **Raid damage becomes a share of the struck hex**, not `1 + raidSize/8`.
3. **Halve `fortStrength`** — walls currently let a player with NO army repel 64–90% of raids.
4. **Sickness scales with population; the infirmary softens rather than prevents.**
5. **Record the queue and era gates as throughput limiters**, so they are never "optimised" away.

**Standing constraint on the tech tree** (not work now): node prices authored per node, multiplied by
dominion size at purchase, completed nodes free forever. Explicitly rejected: cost rising with the
NUMBER of techs owned.

**Expect these to feel harsh.** That is the point — see the sharpened tuning rule in `design.md`:
a too-hard game produces a diagnosable failure, an unlosable one produces nothing to diagnose.

**THE CALIBRATION CORRECTION *(found in play, 2026-08-25 evening — this is the live work)*.** The
pillars shipped and the game is still not hard enough: owner playtest at Bronze — 98 families, zero
military, no fortifications, 20+ minutes unattended, thriving, every resource pinned at cap. The
reason is arithmetic and the error is Claude's: **both scaling levers were calibrated at Iron
scale.** `raidSizePopScale: 400` yields ×1.25 at 98 pop; distance upkeep on a compact ten-hex realm
averages ~×1.2 (mean adminDistance ≈ 0.7). Two ~20% nudges where multiples were intended — Bronze
tops out near 100 pop, so a scale constant of 400 leaves Bronze effectively unscaled. **The fix is
constants (or per-era scaling of them), not a new mechanism** — and it stays necessary after the era
clock ships, because the clock only punishes falling behind; on-pace friction lives here. A raid
today costs ~40 seconds of food income; that number is the target to tune against.

**MEASURED AND PARTLY DISSOLVED (2026-08-25, late — `sim-4b.mjs`, the headless replica of the
owner's screenshot realm: Bronze, 10 hexes at capacity, zero military, unattended).** Shipped:
`raidSizePopScale` 400 → 120 (Bronze now sees ×1.8, Iron ×4+) and `raidTollShare` 0.05 → 0.075.
But the sweep's real finding is structural: **no raid dial at any sane setting makes the unattended
realm decline.** Six candidates, 8 runs × 2 hours each — every one equilibrates at 75–95 souls, no
hex ever lost, food never below 214/350. The realm is **homeostatic**: raid frequency and growth
cost both scale DOWN as it shrinks, and the food engine rebuys 15–60 souls/min against raids' ~1.5.
Recovery is free at equilibrium, and only gutting the food engine (global pacing) could change
that. **The resolution is the era clock: raid damage is tempo damage, and tempo only hurts when
there is a race.** Souls lost = capstone delayed = a rival advances first. The shipped constants
make the hit legible at Bronze; 4d makes it matter. Unattended shrink-not-die is canon anyway
(*A Game That Cannot Be Lost*, problem 1). **Do not spend more sessions tuning raid dials before
4d ships; re-verdict difficulty after.**

### 4c — THE CAPS COME BACK, FLAT AND FREE ✅ *(shipped 2026-08-25, the same night as the consensus)*

Full ruling and the shipped numbers: `design.md` → *Resources & Storage*. Granary, Woodshed, Stone
Yard and the Ore Yard are gone from every manifest; caps are era-authored (Stone 400/350/350,
Bronze 600/550/550, Iron 800/700/700 + iron 400, steel 300); gold uncapped by law; the rot hints
rewritten (they used to instruct building the dead granary — caught in this pass) and returned to
Iron's slate along with the caps. **Saves: legacy counts are inert** (state is never implicitly
destroyed) and a one-time `oldStores` hint narrates the quiet storehouses in every era's slate.
**The law sheet is harness-enforced and mutation-tested**: capped gold fails two checks, a
sub-capstone cap fails the era-is-the-budget check, and a revived capBuilding refuses to compile.

### 4d — EVERY CIVILIZATION KEEPS ITS OWN TIME *(consensus 2026-08-25; the headline feature)*

Full design: `design.md` → *Every Civilization Keeps Its Own Time*. The work list, in order:

1. **The `civs` structure** — player entry 0, adversaries after, era per civ. This is the load-bearing
   refactor: `S.era` becomes `civs[0].era`, and 21 files read `active()`. Wants a deliberate seam
   (`manifestFor(era)`), not a special case.
2. **The clock** — pace drawn at worldgen (slower/normal/faster), one "faster" guaranteed, hidden
   tick countdowns, capped at the last implemented era. Seeded, in the signature.
3. **The telegraph** — Chronicle lines on every adversary advance, and early warning of the
   speedster within the first minutes of a run (the Project Zomboid ruling: brutal is fine, slow
   verdicts are not).
4. **The wire** — raids read the sender's era: roster (unit KIND is the early-era gap), size,
   strength. Without this the clock is a Chronicle line and nothing else.
5. **Pressed** — adversaries occasionally busy with each other, narrated; no campaigns while
   pressed; never targeting one another mechanically.

### 5 — THE BOARD COMES ALIVE *(the next real work — three features, one thesis)*

**Regrouped 2026-08-25**, because the owner named the goal that unites them: *"all aimed at livening
up the board. If it's just a few home hexes and a bunch of resource hexes, it really constrains what
we can do late game to make it feel alive — without animating movement."* The thesis and its test
live in `map.md` → *The thesis behind set-dressing, hex builds and raid paths*: **every one of them
makes a hex say more about itself**, and a feature here that adds motion without adding information
is off-thesis.

They share the infrastructure above, so they can ship in any order. All three need **content and
taste**, which is why none of them was built today.

- **5a — The era re-dress** — ⏸ **PARKED DELIBERATELY 2026-08-25, as a finished proof of concept.**
  The mechanism works and the owner has seen it across a full board: *"seeing new stuff rise out of
  the slab of hexes feels like a more expensive animation done on the cheap."* It is parked for two
  reasons, both his: **re-dress only what actually needs to change** (a hex gets a new model, not
  every hex on a schedule), and **the rest of set dressing is a shopping trip** — which asset packs
  to buy, which to use, and when — which is a session of its own and not gameplay. Unpark it when
  the models are chosen.

  *Not wired to the era border on purpose.* `changedHexes()` has no caller at an era advance, and
  should not get one until there is something different to come back up.

  **A `Redress` button sits in the header** (dashed
  border, DEV TOOL): it replays the sink-and-rise across every charted hex while changing nothing,
  so the MOTION can be judged before any content exists. **Delete it and its three companions when
  the re-dress is real** — `index.html` carries the removal list. Prop-sets, palette, light, camera pull-back. The
  owner has ideas and has not given them yet; **ask first.** Needs playtesting, so it wants a session
  at the desk.
- **5b — Building on hexes** — ✅ **SHIPPED AND PLAYTESTED 2026-08-25.** Upgrade gates it, the queue
  paces it, one use per hex holds, price escalates per copy, demolition refunds nothing, and the
  sink-and-rise plays on every change. **Two structures:** the **Farm** (Bronze) at a flat food rate
  better than any bare ground, and the **March-hold** (Iron), which yields nothing and adds flat
  defensive strength to itself and the ring around it. **Adding a third is authoring, not engine
  work.**

  *Open, from the owner's own testing:* **the march-hold's effect is hard to read.** `fortStrength` is
  a number nobody can see — the panel says "it is here to hold" without saying how much, or that a
  neighbour is covered. Showing the covered ring on hover, or printing the strength it adds, would
  make it legible without touching the mechanics.
**SEQUENCING, ASKED AND ANSWERED (owner, 2026-08-25): does building fortifications now conflict with
5c?** In the FORMULA, yes; in the system, no — so 5c does not have to come first.

Ring-protection is direction-agnostic, and 5c makes raids **directional**: a raid arrives from a
specific neighbour along a specific route, so a fort should protect what is *behind* it on the
approach rather than a symmetric ring. Those are different designs, not the same rule retuned. And
`strikeHex("raid")` weights by distance from YOUR seat, which is precisely the half 5c inverts.

**The seam that survives it:** `exposureOf(hexId)` — one function for "how likely is this hex to be
struck". Today `pop × (1 + adminDistance)` modified by nearby forts; under 5c `pop × f(route from the
raider's seat)` with forts in the route cost. Name the question, and the answer can change — the same
move `hexUse()` made.

**But the cost code cannot fix, and it decides the design:** ring-protection *teaches* the player that
forts protect a radius, and directional raids then contradict that lesson. Re-teaching is worse than
teaching once. **So the fortification's v1 effect should be DAMAGE REDUCTION, not targeting
reduction** — raids that reach nearby hexes take fewer people, because the garrison fights them off.
Direction-agnostic, so it stays true verbatim once raids become directional, and 5c then *adds*
routing on top rather than replacing it. Two effects that compose.

- **5c — Raid roads.** Intent logged (`design.md` → *Adversaries & Expeditions*). Three known
  prerequisites: raids should weight exposure from the RAIDER's seat rather than yours; `routeCost()`
  returns a cost and would need to retain predecessors to yield a path; and **the Chronicle is pure
  text**, so clickable events mean log entries become records with data attached. That last one is
  the cheap-now/annoying-later piece. *Wetland and mountain do not exist as terrains.*

---

#### The three that shipped this session *(records, not queue)*

#### 1. Clear the vestigial code — ✅ **SHIPPED 2026-08-25**

`housingPerHut()`, `CONFIG.baseHousing` and `CONFIG.settlerIntervalSeconds` are gone, along with the
stale hut-upgrade comment above the accessor and a dangling cross-reference in `popGrowthRate`'s
comment to "the settler cadence above." Six harness fixtures dropped their inert `housingPerHut: 1`,
and the E3 tombstone block now pins all three deaths beside `accrueGrowth()` and `housing()`.
611 → 616 checks (a 12%-flaky check was found and fixed on the way). See `CHANGELOG.md`.

**Worth keeping from it, because the pattern will recur.** The two failures were opposite and both
invisible to a grep. `housingPerHut()` had a live caller chain and a dead *era-fact* — it ran,
returned `undefined`, and handed it to nobody, so "is anything calling this?" answered yes and moved
on. `CONFIG.baseHousing` was referenced by nothing whatsoever, so every search came back empty and
read as a clean bill of health. Neither is findable by asking about callers; both are findable by
reading. *(`arrivalLine` was checked and is genuinely live — validator-required, printed at
`map/map.js:346` when a hex grows. Leave it alone.)*

#### 2. Raid attribution — ✅ **SHIPPED 2026-08-25** *(carry-over C3)*

*"The Hill Clans test your defenses."* Gated on **`contact`** exactly as this section predicted, so
it cost no new era-fact: Stone stays anonymous, Bronze and Iron name the people. `raidAttribution()`
lives beside `riskAdversary()` in `sim/expeditions.js` and is deliberately distinct from it — a
grudge decides **who, never whether**. Peaceful neighbours are never blamed. The same attribution
rides the hex-strike line, so a burned tile names who burned it. 616 → 632 checks. See `CHANGELOG.md`;
canon in `design.md` → *Adversaries & Expeditions*, mechanism in `tech.md` → *Conflict*.

**Worth keeping: reading the output caught two bugs the harness never would.** Rendering all six
named lines showed `"...hold them back. the Hill Clans, and they knew the way."` — names begin with a
lowercase article, and a line can start more than one sentence with a substitution. There is now a
`sentenceCase()` and a template-leak check, but the general lesson is that **flavor is not verifiable
by assertion alone; it has to be read.** Budget a render-and-read pass for any content that
substitutes into prose.

#### 3. The map picker — ✅ **SHIPPED 2026-08-25**, with the owner's additions

The owner's additions arrived and were built with it, so the start screen grew **three** choices
rather than one:

- **World** — Random (the default) plus the three authored continents. Random is not a special case:
  it is the *absence* of a pick, so the continent falls to the run seed, which is what makes a bare
  seed number reproduce a random run and needed no new save field. Before this, three authored
  continents were reachable only by `?continent=`.
- **Colour** — the seven from `core/palette.js`. See *the board's colour law* in `interface.md`.
- **Seat name** — optional, falling back to "Your Seat". A proper noun, so it does **not**
  re-denominate at an era border: your Greenhollow is still Greenhollow when it stops being a
  clearing and becomes a holdfast.

All three are **fixed for the run** (owner ruling) and shown for a new run only, captioned "FOR A NEW
RUN" when a save exists so they can never read as applying to Continue.

**The one structural change:** every new run now goes through the reload, including the first one on
a fresh machine. "Begin" used to start in place while "New Game" reloaded, and the picker makes that
branch wrong — the world is generated during boot, well before the start screen is shown, so a
continent chosen there can only take effect on the next boot. Rebuilding in place is the alternative
and it is the thing `start.js` already warns against.

*Still open, and cheap if wanted:* **a seed input.** The spec's "a bare seed number fully reproduces
a random run" is now true mechanically, but there is no way for a player to type one in. The death
screen prints the seed; nothing reads one back.

---

### 4 — the odometer — ✅ **SHIPPED 2026-08-25**

Iron reads **SUBJECTS 5,800** where it read 29 people. `soulsPerPerson` (Stone 1, Bronze 1, Iron
200) inherits like `popNoun`; `souls()` multiplies; `fmtSouls()` prints. Rule 1 holds by
construction — nothing in the engine reads it, so deleting it would change no outcome. Iron's
`popNoun` is **subject** now, and the compiler **refuses any era whose `popNoun` matches its
`tileNoun`** rather than trusting the next author to remember. See `CHANGELOG.md`; the sheet is
`design.md` → *The Noun Table*.

**One seam left open on purpose, for the owner's eye in play:** the **Your People** panel still shows
the TRUE count (29) while the ledger shows 5,800. That is defensible — the panel is the roster, and
its number is load-bearing for training — but it is the one place two scales sit side by side without
a hover to reconcile them. Worth a verdict once it has been looked at rather than guessed about.

**Not built, on the owner's ruling:** the other nine rungs of the ladder, and the unit nouns
(Horseman → Cavalry). The units are a pure noun swap whenever wanted — the arithmetic already works,
since a unit costs one hex-person and therefore already IS one person's worth of souls.

### 5a spec — the era re-dress *(map arc, slice 7; queued under THE BOARD COMES ALIVE above)*

Prop-sets, palette, light and the camera pull-back — the revealed board changing clothes while the
player watches. **The owner has ideas here too.** Wants it sooner rather than later, but behind
everything above.

### 6 — THE INTERFACE REDESIGN *(owner, 2026-08-25)*

**Go back to Claude Design, because the game it was last designed for no longer exists.** This is
the promotion of the item that has been sitting at the top of *Held until the UI conversation* since
before the 3D board shipped — it is no longer waiting on a decision, it is waiting on a turn.

**What changed under the panels since that thread was written:**

- **The board is 3D and full-bleed.** The 4x2 grid died in the flip; panels float over a lit
  diorama now. Every legibility question the old thread deferred is live: contrast over a bright
  board, over dark water, over both at once as the camera moves.
- **The theme moved with it.** The identity is settled as the **digital tabletop**, and the owner is
  leaning further into the board-game read. The panels have not followed.
- **The Chronicle changes purpose (owner, 2026-08-25): from flavor record to NOTIFICATIONS.**
  Still a text scroll, but every line must be news of an action by the player or a rival (or its
  direct consequence) — rival era advances in, ambient narration out. Ruling recorded in
  `design.md` → Design Philosophy → the Chronicle block; the `HINT_LIB` question is decided here,
  when this tier runs.
- **The engine rework changed what a panel must SAY.** No steppers, no jobs, no housing. Population
  is per-hex and the interesting numbers moved onto the tile panel. Some panels are now showing the
  residue of a game that is gone.
- **The panels are still wearing Bureau,** described in `interface.md` as the interim skin from the
  panel-game era, "until the tabletop reskin". That reskin is this item.

**Why it should not slide behind the tech tree** *(owner's reasoning, and it is the deciding one)*:
the tech tree **replaces the Upgrades panel** and wants to be a window rather than a floating card.
Designing a tree against Bureau means designing it twice — once for the skin it will not keep, and
again for the one it will. The panel system is the surface the tree is built ON.

**Sequenced after the era re-dress on purpose.** Panels want designing against the board's finished
look, not its current one, and the re-dress changes palette and light in every era.

**Practical note:** Claude Design reads the repo from GitHub, so push before that session and make
sure `interface.md` and `design.md` are current — they are, as of the 2026-08-25 docs pass.

### 6b — THE OPEN THREAD: a game that cannot be lost *(not scheduled; the biggest one)*

**`design.md` → *A Game That Cannot Be Lost* is the write-up.** Three problems currently held as one:
**losability** (partly solved 2026-08-25 — neglect shrinks a realm but does not end it),
**replayability** (unsolved: varied starts do not produce varied play while there is only one
strategy), and **an ending in either direction** (there is no win condition either; the era advance
already IS one, but advancing is a formality rather than a race).

**The principle behind it is identity, not difficulty** (owner): this game is a *digital tabletop*,
board games can be lost, and a board game that cannot be is the thing he calls pointless. That makes
losability structural rather than a tuning target.

**The upstream cause is that every resource node is infinite** — a hex is a permanent annuity, so the
first minute's optimal move stays optimal forever. The proposal on the table is **renewable versus
extractive**: food and timber renew, ore does not. Hills are the ore terrain and the Hill Clans live
in the hills, so a mined-out realm must take occupied ground — map pressure becoming conflict
pressure through geography that already exists.

**Not scheduled and deliberately so:** it wants a session of its own, and it interacts with the tech
tree, the capstones and the storage-cap question all at once.

**UPDATE (2026-08-25, the design night):** problem (3) — no ending in either direction — is
**answered in design by the era clock** (4d): the capstone becomes a race against neighbours'
hidden countdowns. Problems (1) losability and (2) replayability remain open, though armies on the
field (6c) and speedster-adjacent spawns bear on both.

### 6c — ARMIES TAKE THE FIELD *(direction ruled 2026-08-25; scoped, NOT scheduled — wants its own session)*

Full design: `design.md` → *Armies Take the Field*. The largest structural change ever proposed —
armies stop being four global integers and become positioned groups with stances (marching min ~4 /
scouting any size), terrain movement via `routeCost()`, interception, army-v-army board-game dice,
and raids becoming inbound campaigns (which absorbs 5c's intent). Prerequisite: **slice 6
scouting**, because without reach-beyond-the-border an inbound army is invisible until adjacent.
Rendering is one marker per group moving by sink-and-rise — already built. Do not let this ride
along inside other work; the scope is real.

**Refined later the same night:** the faster-hands/right-tick law rewording; **no minimum group
size** (the steamroll rule guards chaff-pinning instead: lopsided fights resolve near-instantly);
the bounded-pieces guarantee (units never inflate, so micro has no substrate at any era); and
**units persist across eras** — manifests only add, armies rebuild each era (a recurring sink),
equipment tiers become **era-scoped upgrades** (Bronze Weapons boosts Bronze-era units only; each
era sells its own, skippable — a bet on your own pace; purchasable only while units of that era
stand, gone at zero), no disband verb (a soldier is a commitment — spend them). All in `design.md` → *Armies Take the Field*.

### 7 — HELD, DELIBERATELY, AND NOT TO BE LOST

- **The decision queue** *(phase 7)*. Held until wanted; the spec is complete and the pause-on-ask
  seam is already built. Confirmed 2026-08-25 that this is exactly what it sounds like — the world
  presents a choice and the player picks — and that it is the headline feature the time pivot
  unlocked, because a choice can only wait for free once the clock stops when you look away.
- ~~**Scouting** *(map arc, slice 6)*~~ **RESOLVED BY RULING (owner, 2026-08-28): scouting is
  presence, not a verb.** *"Send army, extends view, now you have scouted."* Armies chart the
  road they walk and emit presence sight, and with the three-verbs ruling (March never annexes
  — see `design.md` → *The Three Army Verbs*) parking a small army on foreign soil to watch a
  border is safe and already works. The slice collapses to future tuning at most (vision radius
  by band or stance). The scouting-stance and scout-unit concepts are dead. The settle-blind
  gamble survives untouched.

### 8 — THE BIG ONE, GATED ON PURPOSE: the tech tree

**What the owner is most excited about, and deliberately not next.** It is a major change, and the
gate is that the open threads above should close first. Also the reason not to touch the dominion
cap yet: a tree is a large new resource sink by design, and whether expansion self-limits is exactly
what a new sink changes.

### 9 — THE BACK SEAT, EXPLICITLY

- **Priests and the envoy** *(6e)*, and anything else Enlightenment-shaped.
- **STANDING RULE (owner, 2026-08-25): no more eras, and no more era-scale features, until the core
  game is settled.** The tech tree comes before any of this. An age is not a thing to add to a game
  whose fundamentals are still moving.

---

## LESSONS THAT KEEP COSTING TIME

**Standing, not session notes.** Each of these was learned by losing an hour or shipping a bug, and
each has already recurred at least once. **This section is deliberately outside THE WORKING ORDER**:
an earlier version lived inside START HERE and was silently dropped when that block was rewritten
wholesale — by me, in a commit called *"the working order catches up"*. Notes that live inside a
section that gets rewritten are notes with an expiry date.

- **Dead code is not findable by asking about callers.** `housingPerHut()` had a live caller and a
  dead era-fact — it ran, returned `undefined`, and handed it to nobody. `CONFIG.baseHousing` had no
  references at all, so every search came back clean. Both were only findable by *reading*.

- **A check that hardcodes what it should derive can only confirm what its author remembered.** Three
  green checks turned out not to test their subject in a single day: a route comparison that measured
  one route against a constant; a fortification check that a deliberate mutation walked straight
  through (the starting trio is mutually adjacent, so a uniform factor cancels out of a weighted
  pick); and a work-glyph check that restated the four resources it was checking while two others had
  no glyph at all. **Mutate a new check before trusting it** — and if the mutation passes, the check
  is the bug.

- **Flavor is not verifiable by assertion alone; it has to be read.** Rendering every named raid line
  caught two grammar bugs no check would have. Budget a render-and-read pass for anything that
  substitutes into prose.

- **A claim in a comment is not a mechanism.** `markFor()` said both renderers read one ladder for
  weeks while the 2D stage quietly drew diamonds. If a comment asserts an invariant, something should
  enforce it — a validator, a check, or a shape that makes the alternative unrepresentable.

- **A convention that is scoped is a convention that will be forgotten.** `.short` lived on
  `.building .b-cost .short`, so every surface that later grew an action reimplemented the verb
  without the refusal. Fixing it per-surface produced the same silent failure twice in one day.

- **A scale constant calibrated at the endgame is a no-op at the start.** `raidSizePopScale: 400`
  was tuned against Iron's ~400 population and delivered ×1.25 at Bronze's ~100 — a multiplier
  designed as "multiples" that shipped as a rounding nudge, found only by the owner playing. When a
  dial scales by population, check it at BOTH ends of the era span before calling it tuned.

- **A truncated grep is not a search.** Claude grepped for fog with `head -5`, got five comment
  hits, and declared fog unbuilt — while `syncCharted()`, `isCharted()` and a two-tier reveal system
  sat live in the same file. The owner caught it from a screenshot. A grep that got cut off has
  answered "does the word appear", never "does the thing exist" — the reading lesson above, lost to
  a pipe.

- **A rewrite is a deletion unless you diff it.** This section exists because of one.

---

### What the engine rework was, in one paragraph *(shipped; kept for cold starts)*

Population lives on hexes and is a variable the world writes to; production is people x per-capita
rate x terrain from the first minute; expansion is a paid, escalating claim; famine drains the
frontier inward toward the seat; sickness and raids strike hexes; the army answers to the land and
recruits from the capital. Deleted whole: steppers, jobs, housing, the hut, the settler timer, the
lockstep, consolidation, the levy, `outputMult`, `allocation`, `growth`, instant starvation, and
`removeSettler`. `S.pop` survives only as a mirror (hex sum + army). Canon: `design.md` —
*Population Lives Somewhere*; spatial half in `map.md` 2.7; numbers in the phase plan below.
**Tested through Iron by the owner on 2026-08-25** — see the playtest notes below.

### Standing notes

**Saves are disposable** until the fundamentals stop moving — and with the rework complete, they
are now close to stopping. **The pane cannot screenshot and background tabs throttle the sim**;
verify via harness and DOM, owner-eye QA for aesthetics. **Long owner messages land on their later
position** (see memory). The two arcs interleaved on purpose; the owner's verdict on interrupting
the map for the engine: *"it's clear it was right to do this first."*


### The playtest brief (what the user verifies during the hold)

> **STALE 2026-08-25 — do not walk this script.** It was written for the pre-rework game and
> verifies mechanics that no longer exist: steppers, the growth countdown, era view radii
> ("the world widens to the ring"), consolidation at the Bronze→Iron border, and the dominion
> block. Rewrite this brief the next time a playtest hold is called; keep it only as a model of
> the *shape* a brief should take (correctness arc, then feel, then failure ladders).

**Correctness — walk the whole arc on a fresh run:**
1. *Stone:* one large hex; steppers work; growth countdown; hover/click the hex; all floating
   panels present; pause (Space), speed keys 1–5, tab-hide freezes the clock (t-counter stops).
2. *Stone→Bronze:* the world widens to the ring — same terrain, nothing regenerates; pure relabel
   (families), era modal holds the world and hands it back at 1×.
3. *Bronze→Iron (the big border):* consolidation to a handful of holdfasts, narrated; army
   carried whole; dominion block granted **already turned to food**, narrated; steppers replaced
   by the standing sentence; ledger rows demote (POP and resources bare); the world recuts to 61
   with three labeled majors and five ▪ minors.
4. *The Iron loop:* re-direct tiles from the Selected Tile panel (rates move live, glyphs
   update); hills offer stone-or-iron; every ground offers everything at printed rates.
5. *Settle:* price/time/route printed on empty land; joins Underway behind builds; completes into
   an owned bread tile (+1 pop, levy cap rises); cancel refunds; try settling two parties to one
   hex (refused).
6. *Subdue:* march on a minor (Muster Ground gating with printed reason first); walls hold →
   damage persists across a second attempt; win → fealty line names the place, whole stock
   arrives, tile owned.
7. *Majors:* march/caravan still work; provisions and march time differ by distance; the muster
   sheet prints the route.
8. *Persistence:* save/load mid-settle, mid-campaign, with captures held — everything resumes
   exactly; seed identical across reloads; death screen shows the seed.

**Judgment — the open design flags (bring verdicts to the next session):**
- **The pulse.** Steppers touched every 30s; hex allocation is minutes-scale. Does Iron feel
  alive between map visits, or dead? (*Density never falls* is the at-risk pillar.)
- **Border pressure.** Carried-army upkeep at holdfast appetite (units × 0.04 × 4) against a
  fresh handful-of-tiles economy — right kind of hard, or a trap?
- **Growth pacing.** Settle cost + queue seriality + levy: is growth triple-charged?
- **Subdue vs settle.** Fast-bloody-with-loot vs safe-slow-ground-only — a real per-tile
  decision, or a solved one?
- **Boost buildings.** With the king-doesn't-count-sacks hat on: do Drying Racks / Lumber Camp /
  Stone Pit survive Iron, or retire with the granaries?
- **Route numbers.** marchFactor 0.6–2.0, water at 3 — do distances *feel* like geography?
- **Minor flavor.** Do the strength bands and wall words read honestly against the fights they
  predict? (Descriptions are mechanics-bearing text.)

### Next up, decided (2026-08-22, evening): the 3D map spike

> **Superseded as an ORDERING by THE WORKING ORDER at the top of this file (2026-08-25).**
> Kept for the reasoning; it no longer says what happens next.


**The fork:** the evocative-art ruling opened two routes for the map's paint layer. Route A (in
`map.md` §8 today): 2D SVG + commissioned painterly tilesets — art cost scales linearly with 12
eras. Route B (proposed via `spikes/threejs-hex-map-guide.md`, a technically sound external guide):
Three.js 3D where LIGHTING does the heavy lifting — tonemapping/HDRI/AO one-time engineering, era
difference via instanced prop/palette swaps from cheap stylized kits, pan/zoom/tilt free from the
camera rig. The fork is confined to the paint layer by construction (geometry/paint separation);
the sim, generator, harness, panels and interaction pattern are route-independent.

**SPIKE RUN AND MERGED (same evening): see `/spike3d/` on the dev server.** All guide steps 1–9
landed against the real generator (curvature and DOF skipped by design); primitives instead of
GLBs (downloads 404'd) — and the lighting carried them anyway, which was the thesis. 61 tiles,
~10 draw calls, 60fps; verified by readPixels through the post chain AND by the owner live, who
spun the board and called it awesome. Two stale-path guide corrections recorded as an addendum in
`spikes/`. **Decision-relevant finding from the owner's parallel asset hunt:** purchasable HEX-TILE
packs are 2D and stop at medieval (the 12-era problem returns), while the 3D route buys MODEL
packs instead — and that ecosystem (Synty POLYGON line, Kenney) covers eras neolithic→space in one
coherent house style. **VERDICT CALLED (same evening): ROUTE B — 3D.** The owner's words: the coolest thing any of
these browser games has produced; premium before a single purchased asset; happy to look at
dev-art "for a long time if there was a fun game around it"; and the tabletop read (depth,
shadows, bright board-game colors) is *invited* — "you could translate this to the tabletop" is
a compliment to court. Willing to spend a few hundred on model packs — cheaper than the 2D
commissioning it replaces — with extra art budget aimed at era-advance splash illustrations and a
premium SVG icon set instead. Docs revised: `design.md` OQ3 (the digital tabletop identity),
`tech.md` stack revision (the honest walk-back), `map.md` §8 (the 3D art strategy).

**The original decision method: a time-boxed spike, on a branch** — build the guide's steps 1–7 against OUR
generator output (same seed as the live game), drop in 3–4 free kit assets, and put it beside the
shipped SVG stage for an eyes-on verdict. The SVG map survives either way (it becomes the 2D debug
view the guide itself prescribes, and the agent's testing surface). If Route B wins, revise
`tech.md`'s stack section honestly (vendor three.module.js — no CDN at runtime, no build step via
import maps; "a canvas is a bag of pixels" was overstated: the scene graph is queryable, only
semantic pixel-checks fall to human review) and `map.md` §8. If it loses, delete the branch;
nothing else was touched.

### Phase 10 — 3D map integration *(slices 1-4 shipped; 5, 6 and 7 are queued in THE WORKING ORDER)*

**The build order (owner: "organizing implementation entirely to you", 2026-08-22).** One thing
changes per slice, every slice ends playable, and the riskiest work happens in a slice where
nothing else is moving — so a failure is diagnosable instead of a hunt. Each slice ends with a
verified stop and a test brief.

- [x] **1 — The start screen shell** *(shipped 2026-08-22)*. New Game / Continue, press-to-start,
      no picker yet. Deliberately first: it is cheap, it is the "less sudden" opening the owner
      asked for, and it isolates a boot-flow state-machine change while the map is still stable.
      It also builds the room slice 5's picker moves into.
- [x] **2 — The renderer port** *(shipped 2026-08-22)*. 3D replaces SVG; same world, same rules.
      The acceptance test passed verbatim: a click on the canvas over the River Kingdom opened its
      popup with standing, flavor and known stock, and March opened the muster modal. The seam
      survey held — nothing downstream of `selectTile` changed at all. Marks are projected DOM text
      rather than meshes (legibility outranks texture, and 3D text fails at this camera's grazing
      angles), so the map stays readable and assertable; the shared mark ladder is pinned by 7 new
      harness checks (501). `?map=2d` keeps the SVG stage, `?glcheck=1` makes the buffer readable.
      *Not verified by me:* how it LOOKS. The browser pane in this environment does not composite,
      so `requestAnimationFrame` never fires and screenshots time out — owner-eye QA, exactly as
      the revised `tech.md` contract says.
      *(Seam survey done: [ui/map.js](src/ui/map.js) already splits cleanly — `detailHTML`,
      `titleFor`, `renderTileDetail` and the whole `tileBody` action handler are pure DOM with zero
      SVG knowledge, and `selectTile` is already the seam. About 90 lines move: `mapSVG()` becomes
      scene-building, the stage click's `dataset.id` becomes raycast-and-round, `attachTip` becomes
      raycast hover. `signature()` survives as the chunk-dirty trigger.)*
- [x] **3 — Fog, the camera, and one board** *(shipped 2026-08-22)*. Era view radii and the
      regenerate-on-tile-noun branch are both deleted; every era generates the same radius-4 disk
      (Stone and Bronze used to build a radius-3 world that Iron threw away — that, not the noun
      check, was the real reason the board was recut). Fog renders as unpainted board: flat,
      neutral, no props, no marks, not pickable. You always see the country adjacent to what you
      hold, so Stone opens on your hex plus its ring inside a 61-tile board. **The camera frames
      what is KNOWN rather than a per-era number**, so the era zoom-out arc falls out of discovery
      itself and needs no authored camera heights. Dominion never shrinks (owner ruling — see
      `map.md` §2.6). 10 new checks (511).
      *~~Flagged for the balance pass:~~ CLOSED by the engine rework (E5). `removeSettler` is gone
      entirely; `strikeHex`/`killAt` give sickness and raids a real tile-scale effect, so deaths land
      on the ground where those people actually lived.*
- [ ] **4 — The frame generator** *(RE-SPECCED 2026-08-24 after the invisible-fog ruling forced a
      re-examination; owner discussion, landed)*. The frame SURVIVES, on three grounds the debate
      sharpened: islands are a GLOBAL property local randomness cannot guarantee (enclosure is
      intent, not luck — and 150 unframed tiles is just a shape-dead disk); a small pool of
      authored continents gives Zomboid-style recognition drama across runs ("am I on the narrow
      stretch?") that pure randomization can never produce; and the frame's job divides cleanly —
      the frame decides where land ENDS (ocean, islands), the dice decide what land IS (terrain
      blobs, lakes, rivers, start, adversaries). Deliverables:
      - [x] **4a — the authored frames** *(shipped 2026-08-24)*. `src/map/continents.js` holds the
        pool as ASCII art (`#` land, `~` ocean, odd-r rows) so the shapes are legible to whoever
        edits them: **Broadwater** (155 workable land, a deep bay, islands off the east), **The
        Long Reach** (137, a narrow diagonal country with an island chain), **The Scatter** (141,
        a 110-hex mainland in a four-island archipelago). Ocean is a real, unsettleable place that
        rays and routes cross; interior lakes stay rolled — and are now kept **ashore on the
        mainland**, because a lake on a two-hex islet is nonsense and can silently erase a link in
        an island chain. The seat is chosen AFTER terrain, on the mainland, on food-bearing ground
        (plains or river — a hills start would make forage-or-die into forage-and-die-anyway), and
        the frame is translated so home stays `"0,0"` for every system that already assumed it.
        Named sub-streams throughout (`:terrain`, `:start`, `:seats`, `:minors`). `radius` retires
        as an era-fact — the frame decides extent. 20 new checks (545), including the island law
        run over 75 continent-seeds.
      - [x] **4b — sight across water** *(shipped 2026-08-24)*. `syncSighted()` casts a ray from
        every charted coastal hex through WATER ONLY, up to `SIGHT_RANGE` (3) steps, stopped by
        the first land it touches. Sighted ground draws its TRUE terrain and carries no props, no
        marks, no hover and no selection — the honesty rule inverted: **sight reveals the board,
        never the pieces**. Charted-vs-sighted reads as inhabited-vs-silhouette. Sticky like
        charting; the Chronicle marks the moment ("From the shore, your people make out land
        across the water"). Three predicates now: `isCharted` (props, marks, interaction),
        `isSighted`, `isVisible` (drawn at all). 8 new checks (554). Verified live: a trio start
        on The Scatter sights 5 sea hexes and 13 hexes of far land, unprompted, in the first
        seconds. *Original spec follows.*
      - **The SIGHTED fog state** *(refined by owner, 2026-08-24)*: LINE OF SIGHT, not radius —
        sight propagates from a charted coastal hex through WATER only, up to 3 steps, and the
        first land it touches becomes sighted and stops the ray. You see the island's near shore,
        never behind it; even a sighted island keeps its true size secret. **Sighted renders TRUE
        terrain** (if you can genuinely see it, show what's genuinely there) but carries no
        props, no marks, no interaction — the honesty rule inverted: sight reveals the BOARD,
        never the PIECES. Charted-vs-sighted reads as inhabited-vs-silhouette. The tan
        unpainted-board rendering retires completely. Coastlines stay intrinsically worth
        reaching — vision is a resource.
      - **Authoring law, validator-enforced: every island lies within sighted range of the
        nearest mainland coast.** No island may exist that cannot be yearned for.
      - [x] **4c — neighbours by density, seated on their own ground** *(shipped 2026-08-24)*.
        The minor tier is seeded by DENSITY (0.06 per eligible hex, per-hex hash so a later
        generation stage cannot shift who exists): 3–13 steadings per world, averaging ~7, scaling
        with the country instead of a fixed five, never outrunning the hand-authored name pool,
        and never bordering one another. And **adversaries are seated on the ground their own
        descriptions name** (owner catch): the Hill Clans in the high passes, the River Kingdom on
        the bluffs, the Salt Nomads on the flats — a `homeTerrain` preference that relaxes to any
        land rather than leaving a people homeless. 6 new checks (559).
        *Still open from this slice:* spawn-on-charting (chart a region at Iron, find walled
        steadings rather than camps) — the populate-on-discovery idea, unbuilt.
        ~~**NOTE: adversaries still only exist at IRON.** Stone and Bronze declare no seats and no
        minor tier, which is why early play is unopposed.~~ **Reversed 2026-08-24:** all three eras
        seat the same three peoples, placed once at world generation and re-dressed per era. Early
        play is opposed.
- [x] **5 — The picker: BOTH, with Random** *(shipped 2026-08-25)*. **(owner ruling, 2026-08-24.)** Named continents you can
      choose, plus a Random option — know-then-not-know: new players learn the maps by choosing
      them, veterans roll Random for the where-am-I drama. Seeding survives intact: the save
      stores {continent, seed}; picking Random draws the continent FROM the seed, so a bare seed
      number fully reproduces a random run, and a picked run reproduces as "Broadwater · 12345"
      (the death screen prints both). Built after slice 4's frames exist to look at.
- [ ] **6 — Scouting**, priced through `routeCost`; Chronicle flavor as the reward, systems still
      era-gated behind it. **Design constraint found in play (2026-08-24): scouting must not
      delete the settle-blind gamble.** The owner reported genuine tension from settling toward
      hoped-for mountains and drawing plains — the invisible world, terrain stakes and the cap
      compounding. If scouting is cheap, every player scouts first and that moment dies. Price it
      so LOOKING FIRST vs SETTLING BLIND is itself the decision: the scout costs time and food the
      gambler saves, and the gambler risks a cap slot the scout protects.
- [ ] **7 — Re-dress and the ceremony.** Era prop-sets, palette, light, and the camera pull-back —
      the whole revealed board changing clothes while the player watches.

**Not in the owner's list and easy to lose, so named here:** the camera is a *system*, not a
setting (it replaces view radii and carries half the era-advance moment); the deletions are real
work; fog reveal state is a new persisted field; and the small stuff that makes a port drag —
work glyphs (3D markers or projected DOM labels, a real decision), hover tooltips, vendoring
three/postprocessing/n8ao off the CDN, the era-fact schema for palette/light/prop-sets across all
three manifests plus its validator, and keeping `?map=2d` alive as the assertable surface.

**Saves are explicitly disposable** until the fundamentals stop moving (owner, 2026-08-22): assume
every slice breaks the running save, and replay at 12× rather than writing migrations.


**Scope grew deliberately on 2026-08-22** — see `map.md` §2.6, *One board, forever*, which settled
the map's whole era model in one conversation. Phase 10 is no longer "port the renderer"; it is the
renderer plus the world model that renderer made possible. The additions, in dependency order:

- [ ] **The two-stage generator.** Coastline first (organic closed curve, plus islands), hexes
      packed inside it, silhouette discarded after packing — it is a generation device, never
      rendered. A prototype exists from a separate session and must be re-plumbed onto `makeRng`
      before it enters `src/` (the `Math.random` ban is a harness check).
- [ ] **Named sub-streams** for every generation stage (`:frame`, `:pack`, `:terrain`, `:seats`),
      so later stages can be inserted without invalidating recorded seeds.
- [ ] **The pregame picker.** Three continents as bare outlines, labelled with hex count and island
      count only; any click starts the run; a reroll draws three more. Each candidate *is* a seed,
      so picking adopts it as the run seed and no new save field appears. One screen, one decision
      — it must never become a settings panel.
- [ ] **Retire era view radii and map regeneration.** `ensureMap()` loses its regenerate-on-
      `tileNoun`-change branch; the era `view` radius is deleted in favour of fog plus a camera
      that pulls back per era. Both are shipped behaviours being removed, not new work.
- [x] **Fog** *(shipped in E-slices + re-ruled 2026-08-24)*: the unknown world is INVISIBLE —
      not drawn — after a live three-way look test (tan / dark / nothing; "invisible is the winner
      and it's not close"). The world accretes out of the void as you chart. Revealed is permanent;
      the 2D debug view keeps fog visible.
- [ ] **Scouting, the Stone Age's spatial verb.** Distance-priced through `routeCost`; reward is
      primarily Chronicle flavor, with any material payoff kept rare so exploration does not become
      a farm; systems stay era-gated behind it.
- [ ] **Per-era re-dress.** Prop-set/palette/light swaps on unchanged ground — the whole revealed
      board changes clothes during the era ceremony, which is the moment the splash-art budget
      exists for.
- [ ] **Terrain-correlated settlement**, so scouted land predicts where rivals appear rather than
      being falsified by them.
- [ ] **Islands: frame-only for now.** Generated, packed, fogged like any board; no seats, no
      settling, no minors until a naval unlock exists. Start placement avoids small islands and
      boxed-in pockets.
- [ ] Board budget **~120 land hexes** including islands (bracket 100–200 — see §2.6's table);
      curate candidate frames at high density, ship them at low.

~~**Flagged, not scheduled:** `applyConsolidation` reducing `S.pop`…~~ **Moot 2026-08-25:**
`applyConsolidation` was deleted in E5, its last (unreachable) caller removed, and the
`consolidate` era-fact is now a load error. Borders re-denominate; they never take.

**The original port work — ALL SHIPPED** *(phase 10 slices 1–5; boxes closed 2026-08-25)*.
The spike's pipeline lives in `src/render3d/` and `spike3d/` was deleted the same day — it had
become a silent duplicate of the real renderer that still imported the live generator.
- [x] Move the spike's pipeline into `src/render3d/` behind the stage seam: `renderMapStage`
      swaps implementations; the SVG stage survives as the 2D debug/fallback view (`?map=2d`).
- [x] Re-wire the shipped interaction pattern: plane-picking → `selectTile` (same Selected Tile
      panel), hover ring + DOM tooltip, work-glyph equivalents (3D markers or projected DOM labels),
      owned/selected state via materials — **never opacity**, the law follows the renderer.
- [x] Era-fact hooks: palette + light mood + prop-set keys in the `map` manifest spec.
- [x] Fog, dominion growth, captures, settle — all state-driven re-mesh triggers
      (chunk-dirty on the same signature the SVG stage already watches). *(Era view radii were
      retired rather than ported — one board, fog and camera do the work.)*
- [x] The §7 curvature shader (tabletop signature), WITH its depth-material and culling gotchas.
      *(Later dropped with the tabletop aesthetic itself — the world grows as it is scouted.)*
- [x] Vendor three/postprocessing/n8ao into the repo (pinned builds; no CDN at runtime).
- [x] Verification: keep readPixels smoke checks + the 2D debug view as the assertable surface;
      owner-eye QA for aesthetics, per the revised tech.md contract.

### Held until the UI conversation

> **Superseded as an ORDERING by THE WORKING ORDER at the top of this file (2026-08-25).**
> Kept for the reasoning; it no longer says what happens next.

1. **The design-thread verdict** — **PROMOTED 2026-08-25 to tier 6 of THE WORKING ORDER as
   the interface redesign; see the top of this file.** The context below still stands. — panel juggling/legibility against the diorama. The identity
   itself is no longer on the table: paper is out (war-table candidate killed same-day; see
   `interface.md`) and the successor is ruled — **the digital tabletop**, the lit 3D board
   (`design.md` OQ3, `map.md` §8 Route B). Structure is settled; the thread designs how the
   floating panels read over the 3D world.
2. **The balance pass** the judgment flags feed (upkeep, pacing, routes, pruning).
3. **6e — priests & the envoy** (the peace path; the annexation ceremony under the modal-hold).
4. **Phase 7 — the decision queue** (the pause-modal seam is built and waiting).
5. Parked ideation, logged where it lives: pan/zoom (`map.md` §10 — now an orbit-rig clamp
   rather than a `viewBox` question), the odometer build, the name. *(Directed scouting left this
   list on 2026-08-22: it is promoted to the Stone Age's spatial verb and specced into Phase 10.)*

## The engine rework — phase plan (drafted 2026-08-23)

**Canon: `design.md` → *Population Lives Somewhere*. This section is HOW, in what order, and with
what numbers.** Same discipline as phase 10: one thing changes per slice, every slice ends playable
and harness-green, a pause and a test brief at each stop.

### The numbers (v1 — the anchoring insight first)

**The rebalance predicted in `tech.md` mostly dissolves, and the reason is worth recording.**
`CONFIG.baseRate` (0.20/s) and `CONFIG.upkeep` (0.04/s) are *already per-capita* — the Stone
stepper game always was per-person, and the shipped Iron tile branch deliberately produces "at the
same per-worker rate the steppers used." So the per-capita law is not a conversion, it is a
promotion of the existing constants. Better: since output and upkeep are both per-person, the
**feed ratio is scale-invariant** — one working person feeds themselves plus four, at any
population, in any era. Starvation math carries across the entire game automatically.

What actually keeps the economy sane is that **carrying caps are small in early eras and grow by
era and tech**. That is the era production curve — not a rate change, a ceiling change — and it
keeps Stone's totals close to today's shipped balance without touching a single cost:

| | food | wood | stone | iron | **cap: Stone** | **cap: Iron** |
|---|---|---|---|---|---|---|
| **plains** | ×1.0 | ×0.4 | ×0.3 | ×0.2 | **8** | **24** |
| **river** | ×1.2 | ×0.3 | ×0.2 | ×0.2 | **10** | **30** |
| **forest** | ×0.5 | ×1.0 | ×0.2 | ×0.2 | **5** | **15** |
| **hills** | ×0.3 | ×0.3 | ×1.0 | ×1.0 | **3** | **9** |

*(Rate columns are the shipped Iron works table, unchanged — it becomes the game-long table, with a
Stone/Bronze copy that simply omits iron. Caps are first guesses; the Stone column is tuned so a
2–3 hex Stone endgame carries ~15–25 people, matching today's late-Stone settlement. The
owner's "a mountain starts at 20" instinct is an Iron-scale number. Later eras multiply caps
per era-fact — the odometer comes from the ceiling rising, never from the rates.)*

- **Start:** the seat hex opens at pop 3 (today's `startPop`), assigned to food.
- **Growth:** logistic — `dP/dt = r × P × (1 − P/cap)`, r ≈ 0.015/s, integer pop with a fractional
  accumulator per hex. At 3-of-8 that is a first arrival in ~35s, close to today's 45s settler
  cadence; growth visibly slows as a hex fills. One knob (`r`), self-limiting, no timers.
- **Per-capita rate:** `baseRate` 0.20/s × terrain × tool mults, as today. **Upkeep:** 0.04/s per
  person, as today.
- **Later-era pricing has a natural home:** era manifests already re-declare every cost. Each era's
  manifest prices against that era's expected total population — authored per era, not one global
  pass.

### The slices

- [x] **E1 — population exists** *(shipped 2026-08-23; additive, nothing reads it yet)*.
      `S.map.pop` (fractional, floored by every reader) keyed by tile id; `popCaps` per terrain on
      the Stone (8/10/5/3) and Iron (24/30/15/9) manifests, validator-enforced; logistic growth in
      `growPopulation()` with a snap-to-cap for the asymptote's last hundredth; the header POP is
      now `hexPopSum()` — the odometer, real at last — shown bare (the housing cap would be a lie
      beside it); tile detail and hover print "People: N of CAP". The seat opens at 3, a captured
      hex enters the books at 2. 10 new checks (521), including bit-identical determinism and save
      round-trip. Live-verified on the curve: t471 predicted 5.4 people, page showed 5 of 8.
      *During the E1 window the old economy still runs on `S.pop` underneath (upkeep, steppers,
      levy), so the header and the old machinery can diverge — expected, temporary, retired in E2.*
- [x] **E2 — production flips, steppers die** *(shipped 2026-08-23)*. One formula from frame
      one: output = floored hex population × per-capita rate × terrain, and upkeep charges the
      people who actually exist (`hexPopSum`) plus levied bands. Deleted whole: the jobs system and
      its manifests' arrays, `assign()`, `idle()`, `jobsUsed()`, `releaseOrder()`,
      `reconcileWorkforce()`, the Your People steppers, and the `allocation`/`outputMult`
      era-facts. The works table lives on the Stone manifest (the Iron table minus iron); Bronze
      redeclares the map to put copper and tin on the hills (tin at the scarce half-rate).
      **The seat opens RESTING, deliberately** — plan said assigned-to-food, but auto-feeding would
      delete the forage-or-die opening lesson; a fresh board shows food at −0.28/s until the player
      turns their clearing to food, verified live at exactly +0.32/s after the click.
      **Two things came forward from E5 because the harness caught them colliding with newer laws:**
      `consolidate` left every manifest (the lockstep instantly undid its pop-cut under
      dominion-never-shrinks — borders are pure re-denomination now), and
      `reconcileReservations()` was born (deaths must still abandon unit orders nobody can fill, or
      civilians() goes negative — the one duty of reconcileWorkforce that was never about jobs).
      **E2 bridge, dies in E3:** the settler timer still grants `S.pop`, and the lockstep converts
      each arrival into a hex — the hut is temporarily the claim verb. Bronze units are unfed until
      the levy (they are not on hexes); a window quirk, resolved by E5's army rework. 520 checks.
- [x] **E3 — expansion is the growth verb, from frame one** *(shipped 2026-08-23)*. The free
      real estate is over (live-confirmed runaway: huts handed out provinces until the owner had
      the whole world before Bronze). Deleted: the hut and housing wholesale, `housing()`,
      `accrueGrowth()` and the settler timer, `housingPerHut`, and the pop↔tiles lockstep.
      `S.pop` is now a MIRROR — floored hex sum plus the standing army — so every legacy reader
      (reveal gates, levy cap, event scaling, `civilians()`) sees real people until E5 retires it.
      **The 3-hex start ships explicitly** (seat + two adjacent land hexes at first chart, no
      terrain-variety guarantee). **Claims are era-priced** via the `map.claim` era-fact,
      validator-required: Stone pays food+time only (25 food/30s), Bronze adds timber, Iron keeps
      its 6d pricing; all route-scaled. **The reveal spine moved from the hut to the claim**
      (buildings open as the dominion grows past its trio) and the capstone gates re-priced
      against real people (bronzeAge ≥ 25, ironAge ≥ 50 — usually unreachable without claiming,
      which is the point). The Chronicle keeps its pulse: arrivals are narrated in the era's own
      words while the settlement is under 25 souls, then go quiet. 513 checks.
**E3 playtest — first findings (owner, night of 2026-08-23, testing still in progress):**
- **Settling is "smooth as butter"** mechanically; its interface needs a glow-up later (logged for
  the Claude Design pass — the settle flow deserves better than a sentence in a detail panel).
- **Terrain rates make the WHICH-hex choice interesting** — working as designed.
- **The economy works.** Per-second numbers (4+/s) the old versions never reached; the per-capita
  law scaling with real people. "I was initially worried you could not build an economy on this."
- **Settling is too easy.** Dispositions agreed in conversation, in order:
  1. **Escalating claim costs** (each claim dearer than the last — the game's native cost idiom):
     the immediate fix, cheap, next code window.
  2. **Remember the missing brakes:** E4 (frontier starves first) and E5 (raids strike exposed
     hexes) ARE the systemic costs of sprawl — judge overall difficulty only after they land.
  3. **Stone-age adversaries** (the minor tier extending DOWN: weak steadings, no kingdoms yet) —
     the real long-term answer; contested land is the honest cost of expansion. After E5.
  4. **Per-age hex caps: REVERSED and ADOPTED 2026-08-24** — the owner re-argued it after the
     second 5-minute test (20 hexes at 10 minutes, 10/s income, a bare-minimum settlement) and
     the re-argument won: no cost curve can brake what compounding production funds, and endless
     expansion-cost tuning would couple into the whole economy. The original objection was aimed
     at caps-as-housing; this is **caps-as-era-scope**, which is the tile ladder enforced — a
     stone chief holds seven clearings, and holding more IS what an era advance means. Shipped as
     the `dominionCap` era-fact (stone 7 / bronze 12 / iron 20): the settle verb and tile
     campaigns refuse at scope with worded reasons, queued parties count, prices stay printed,
     the era ceremony announces the scope rising, and the People panel counts holds. Cost
     escalation and era-signature claims stay AS friction within the cap. The tech tree may later
     sell administrative capacity against it. **Two bonuses found on arrival:** development
     becomes the mid-era sink (buildings stop competing with hexes and start being the thing to
     buy), and expansion becomes SELECTION — with seven slots, which seven is the age's defining
     decision, snake-through-the-valley boards look and play differently than blobs, and E4/E5
     already price the shape (a stretched dominion starves and burns first).
  5. **Do not flatten the 1.0-vs-0.3 terrain gap yet:** it powers the which-terrain decision, and
     escalating claim costs make overpay routes relatively more attractive on their own.

- [x] **E4 — the frontier starves first** *(shipped 2026-08-24)*. `adminDistance()` — the same
      Dijkstra seeded from the seat alone (the second distance from `map.md` §2.7). An empty
      larder no longer ends the run: unpaid upkeep accrues, and every `starveCost` (5 food) of it
      kills one person at the peopled hex FURTHEST from the seat — deficit-proportional, so famine
      converges on what the land can actually feed. Land is never lost: an emptied holding is a
      ghost, still yours, that **rekindles from 0.2 souls** once the larder is full again. No one
      is born during a famine. Death comes when the SEAT empties — the capital falling, not
      arithmetic. Narrated at famine onset and per hex emptied.
      **Escalating claim costs rode along** (the playtest disposition): each claim beyond the trio
      multiplies the era base by `claimScale` 1.18 — the 10th hex costs ~3× — with distance still
      multiplying on top. Two flaky checks were caught and fixed on the way (the famine's long
      tail unpriced an old regression; a captured neighbour could mask escalation by cheapening
      the route). 522 checks, 15/15 consecutive green.
- [x] **E5 — the world strikes hexes** *(shipped 2026-08-24)*. `strikeHex(kind)`: sickness picks
      its hex person-weighted (dense hexes host more fevers) and takes a fifth of it, min one;
      raids pick exposure-weighted (population × administrative distance — the frontier burns
      first) and take 1 + raidSize/8. Both narrate the terrain they struck. `removeSettler` is
      gone — nobody dies nowhere. **The levy is gone**: the army cap is `hexes × armyPerHex` (2)
      in every era — the muster is the land, from frame one — and every recruit costs a real
      person **drawn from the seat** on completion (the capital musters; the largest holding
      stands in if the seat is empty). Armies eat in every era. `applyConsolidation`,
      `levyMigrated`, the levy back-compat, the border bread-default and the `growth` era-fact all
      deleted. *Iron re-pricing deliberately deferred to the balance pass — the owner tunes
      against play, not against my guesses.* 520 checks, 10/10 green.
- [x] **E6 — the harness settles** *(closed inline, 2026-08-24)*. Exactly as the plan predicted:
      E2–E5 each rewrote their checks as they landed, so the closing pass had nothing left to do.
      The stepper fixtures are hex fixtures, the tombstone blocks pin every dead export, the
      determinism and save round-trips cover the new economy, and the count re-baselined at 520.

**Then the map arc resumes at slice 4** (the frame generator), now able to choose a hex budget with
the economy known. Slice 6 (scouting) inherits only its *intelligence* half — the claiming half
shipped in E3.

### Owner decisions embedded above (defaults chosen, veto at any pause)

1. **Stone caps small** (3–10 per hex) so early balance carries; "20 on a mountain" lands at Iron.
2. **Army cap = held hexes × 2**; recruits drawn from the seat's population.
3. **First-claim pricing** in food/time only, so the opening cannot deadlock.
4. Cap-raising lives on **era-facts and tech**, not on a revived housing building line.

---

## Parked, specced: the tech tree replaces the Upgrades panel

*(Proposed and logged 2026-08-23. Deliberately NOT scheduled — it is independent of the production
rework and must not ride along with it, so that an economy which feels wrong can only have one
cause.)*

**The Upgrades panel retires from the board and becomes a window you open.** One tree, opened on
demand, with sections by purpose (military, production, diplomacy). It is a three-for-one:

- **It removes a panel** from a board that is already fighting for room.
- **It kills the available/owned tabs.** Owned techs are simply the nodes you have taken, visible
  in place, the way every tree in the genre already works. The tab pair exists today only because
  a flat list has nowhere to show history.
- **It gives the late game somewhere to look.** Watching a Dyson sphere crawl is more bearable with
  a tree to plan against, and a window can be big in a way a floating panel cannot.

**Nodes cost RESOURCES, not tech points** *(owner ruling, same day, reversing his own opening
proposal within the same message)*. A points currency would decouple tech from the economy and
delete a resource sink — and sinks are what keep production meaningful, especially late, when
buildings and units alone stop absorbing income. If a points economy is ever wanted, add it once
the gap can be felt rather than predicted. A late node priced at *500 iridium* is the intended
flavour of the thing.

**Sim speed lives in this tree** *(owner ruling, 2026-08-24, from the all-food dominance run)*:
fast-forward is functionally a resource multiplier — 12× at Stone is the power to take the
continent in the first age — so speed notches become tech-tree unlocks, earned with time invested.
An era-gated version was briefly implemented and deliberately reverted the same hour: the free
toggle stays until the tree exists, as the QA tool, and the owner test-plays locked at 1× by hand
to match the eventual player experience.

**Migration looks cheap:** the existing upgrades import fairly cleanly into two or three small
trees. The one real design question is how tree nodes interact with the era manifest model, since
upgrades are currently declared per era and revealed by predicate, while a tree spans eras by
nature.

---

## The phase plan

Sequenced. Each phase is a commit or a small run of them. **The harness stays green at every
boundary through phase 5** — that rail is what makes this a refactor rather than a rewrite.

### Phase 0 — Docs ✅ *(this session)*
- [x] `design.md` rewritten: idle pillars removed, *Time, Presence & Pause* added as the new
      premise, mechanic-retirement canonized, map promoted out of Out of Scope.
- [x] `tech.md` rewritten: shipped-vs-pending marking throughout, tick model, seeded RNG, module
      structure, decision queue.
- [x] `map.md` created: place-graph model, pointy-top hexes, procedural generation, hand-authored
      adversary pool with generated slates, art strategy.
- [x] `interface.md` created from the retired `interface-brief.md`: Bureau documented as shipped,
      presence constraint replaced, modal register revised.
- [x] `CHANGELOG.md` split out of this file.
- [x] `deleteme.md` retired — its live questions promoted into `design.md`.

### Phase 1 — File split ✅ *(shipped 2026-08-22)*
- [x] `game.js` → 26 ES modules under `src/{core,content,sim,ui}/` + `main.js`, per `tech.md` →
      *Module Structure* (which now records the shipped tree and the two invariants the split
      created: compile-first entry imports, and cross-module reassignment through `core/state.js`
      setters).
- [x] `file://` double-click retired; `index.html` loads `src/main.js` as a module; README updated.
- [x] Harness bootstrap rewritten: real ESM imports behind one Proxy, vm sandbox and export-hook
      deleted, `package.json` (`type: module`, zero dependencies) added. The split itself was
      proven first through an interim concat loader before the bootstrap moved — two commits, so a
      failure could only mean one thing.
- [x] 420 checks green; browser-verified live (boot from existing save, steppers, modals, pause).

### Phase 2 — Seeded RNG ✅ *(shipped 2026-08-22)*
- [x] `src/core/rng.js`: mulberry32 behind one `rng()`. `S.seed` is the run's permanent identity
      (crypto-minted at freshState); `S.rngState` is the stream position, advanced per draw and
      carried in the save so a reload resumes the dice mid-sequence. Old saves inherit a fresh seed
      through the defensive merge — no migration.
- [x] All 16 draw sites routed through `rng()`; `Math.random` appears nowhere in `src/`, and the
      harness *enforces* that with a source-scan check.
- [x] The harness's 44 `Math.random = …` monkey-patches became `setRngSource()` calls — a designed
      test seam in rng.js rather than global mutation. (The todo had said "move to seeding"; hunting
      seeds that force 44 specific outcomes would have been madness, and the seam is honest test
      infrastructure with the same no-global-patching property.)
- [x] Seed surfaced: `[seed]` console line at boot, World Seed stat on the game-over screen.
- [x] Five new checks (425 total): bit-identical state from same seed + same actions (already true
      at harness scale — the harness steps constant dt), stream determinism, range, save round-trip,
      and the src/ ban. Browser gets bit-identical replay when phase 4 lands.

**Live evidence for this phase, observed 2026-08-22.** During the docs pass the harness failed
**one check in 38 consecutive runs** and could not be reproduced in the 37 runs that followed — the
failing assertion was not captured before the output was overwritten, so we do not know which check
it was. That is the exact failure mode the seed exists to eliminate: a real, rare, randomness-driven
failure that cannot be re-run, cannot be bisected, and cannot be reported as anything more useful
than "it happened once." The project's own status notes have been quoting "20/20 consecutive runs"
for months, which is a statement about flake *rate*, not about correctness. Until phase 2 lands, any
harness failure that doesn't reproduce should be recorded verbatim rather than re-run away.
*(A SECOND instance, 2026-08-25: "a longer route feeds the same column at a higher price" failed 5
runs in 40 — and 4 in 25 against the commit before it, so it was not new. It asserted
`provisionPerUnit >= campaignFoodPerUnit` when `marchFactor` clamps to 0.6x–2x, so a nearby steading
legitimately priced below par; the harness mints a fresh world per run and the check sampled it with
`.find()`. **The generalisable tell: `.find()` or `[0]` over generated geometry inside an
assertion.** That is polling the dice, not testing a rule. Fixed by comparing the cheapest and
dearest reachable tiles, which is what the check's own name always claimed.)*

*(Solved later the same day: it reproduced during the identity-purge docs pass and was captured —
"the party raises a hall", the 6d settle-completion check. The ~90 sim-seconds it runs left the
world's event dice live, and a rare sickness/raid shifted `pop` out from under `popBefore + 1`.
Fixed by pinning `setRngSource(() => 0.99)` around that run — the check tests settle completion,
not event weather. Exactly the class of bug the seed work predicted, caught by its own advice.)*

### Phase 3 — Kill offline ✅ *(shipped 2026-08-22)*
- [x] Deleted whole: `simulateOffline()`, the `SIM`/`SIM_STOP`/`SIM_STOP_CAUSE` flags and setters,
      `lastSeed`, `CONFIG.offlineCapHours`, the `dt > 2` clamp, and all twelve `if (SIM)` branches.
      The Chronicle always logs; `advanceEra` always opens its modal; `die()` always fires.
- [x] `visibilitychange`: hidden stops the sim outright and saves; return resumes automatically,
      with a manual pause surviving the round trip untouched (separate flags). `last` re-anchors on
      return — throttled background intervals would otherwise hand back one oversized dt.
- [x] Save hardening: `pagehide` replaces `beforeunload`; assign/build/cancel/launch each commit
      immediately; `hardReset`'s listener juggling became `suppressSaves()` (the reload's own
      pagehide would re-write the save being wiped — v3's bug, new event).
- [x] Ten new checks (435 total): the deletions asserted, a build round-tripped mid-construction
      through the real save/load path, a campaign round-tripped mid-flight and resolved with
      consequences. *One deviation from the spec:* "no state advances while hidden" is not
      machine-checked — the hidden gate lives in `main.js`, which the harness deliberately never
      imports. Verified by a human watching the clock freeze instead.
- [x] Old saves: inert `lastSeed` fields ride along per the state-is-never-implicitly-destroyed
      invariant; fresh runs never mint one.

### Phase 4 — Ticks ✅ *(shipped 2026-08-22)*
- [x] `S.tick` is the master clock; `step()` takes no argument and advances exactly `TICK_SECONDS`.
      `playtime()` derives from the count; legacy saves convert their seconds once at `load()`.
- [x] Authoring stays per-second. *Deviation from the spec's mechanism:* rather than converting
      rates per-tick in the manifest compiler, the engine passes a constant `dt = TICK_SECONDS` to
      the unchanged subsystems — identical property (authors think in seconds), far less churn.
- [x] The loop is a metronome: `speed` ticks per fire, wall time never measured. `Date.now()`,
      `last`, and the visibility re-anchor all deleted. Throttling bends pace, never math —
      verified live in the throttled embedded pane (1Hz fires produced exactly one tick each).
- [x] Header clock shows elapsed time *and* tick count (`4h 26m · t79,831`) — debugging readout by
      request; `[pacing]` lines carry the tick too.
- [x] Harness: 440 checks. The phase-2 determinism check now describes the browser too — seed +
      tick count + actions = bit-identical state everywhere.

### Phase 5 — Controls ✅ *(shipped 2026-08-22)*
- [x] `openModal()` grows an `opts` bag (extensible by design — the phase-7 decision queue adds its
      keys without another signature change). `pause` defaults **true**; closing releases. The hold
      is a third independent flag beside `paused` and the hidden stop, composed in the loop.
- [x] Ask/tell ruled, with one extension now canon: the **ceremony register holds too** (era
      transition, game over) — stillness is part of the weight. Info is the one telling modal and
      opts out. Recorded in `design.md` rule 3 and `interface.md`.
- [x] Header re-weighted: Pause + speed as a grouped transport instrument (2px borders vs the
      utilities' 1px — weight, never opacity), Reset pushed off alone. Keys: 1–5 set speed notches,
      Space pauses. The dev-only-speed policy is fully dead.
- [x] Seven new checks (447); live-verified ticks frozen under an ask, running under Info.
- [x] Confirmed still right: `paused`/`speed`/`upgradeTab` stay excluded from the save.

### Phase 6 — Conquest Growth + the map's arrival
Specced in `tech.md` (*Conquest Growth — implementation contract*) and `design.md`; the map's M1
slice rides inside this phase by the standing sequencing decision (per-hex allocation needs hexes).
Sub-phased so each slice is playable and pausable:

- [x] **6a — the map exists** *(shipped 2026-08-22)*. Place-graph model, seeded blob-growth
      generator on its own rng stream (never the game's dice — harness-asserted), `S.map` persisted
      tiny with geometry rebuilt from the seed, regeneration keyed on the tile noun changing. Bronze
      gets an inert clearing-scale chart with no seats (early-and-inert); Iron recuts at holdfast
      scale with the three majors seated. Map chrome button (era-gated), wide telling modal, SVG
      hexes, click-to-read detail pane. Terrain share is structurally guaranteed per seed — the
      noise+smoothing first cut starved hills/river on a live map and was replaced same-day.
      14 new checks (461 total), five-seed sweep green.
- [x] **6b — G1 engine rework** *(shipped 2026-08-22)*. Three inheriting era-facts (`growth`,
      `levy`, `outputMult`) with validator teeth; Iron is conquest-grown (accrueGrowth never runs),
      levied (civilians = pop, cap = holdfasts × 2, tooltip reason, live `levy 3/8` cost line),
      deep-consolidated (keep 0.25 × output 4 ≈ 1; the border separates units out of pop exactly
      once — `levyMigrated` marks it), and housing-free (hut removed from the manifest, stocks
      vanish narrated, `housing()` = Infinity under conquest). Unit deaths stop erasing population
      under a levy. POP ledger row demotes to a bare count under conquest (user ruling). Old iron
      saves separate units at load, narrated. **Design ruling made in-build: units are NOT
      consolidated at a levy border — the fighting bands carry whole**, since they are no longer
      population; an overflowing levy just refuses training until the dominion grows into it.
      475 checks; live-verified.
- [x] **6c — terrain yield + per-hex allocation** *(shipped 2026-08-22)*. Iron declares
      `allocation: "tiles"` and zero jobs; owned hexes produce by assignment against terrain menus
      (`map.works` — hills are the stone-or-iron multi-choice); pop **is** tiles, enforced by
      `syncDominion()` (border grants a dominion block; a lost holdfast drops its newest hex).
      **Caps retired at Iron** (user ruling, in the scheduled window): all resources uncapped, the
      storage line leaves the manifest narrated, the ledger demotes to bare values; friction hands
      off to the conquest economy. **The map interaction pattern locked** (user ruling): hover
      previews; click opens details, where ALL stats/flavor/actions live — allocation buttons on
      owned tiles, March/Caravan on seats (the Expeditions panel's dissolution begins). Survives
      the node swap unchanged. 475 checks; live-verified end to end.
      *Still open from this slice:* the pulse question — steppers touched every 30s, hex allocation
      is minutes-scale — playtest verdict pending; and whether the boost buildings (drying racks
      etc.) are also "granary-class" and retire in the 6d/6e pruning pass.
      **6c.1 follow-ups (same day, from live play):** works became RATE TABLES — every ground works
      everything, specialties at par-plus, the rest overpay routes (user ruling); the map's seat
      actions now carry the panel's refusal reasons (found broken in play: silent no-op without a
      Muster Ground); and **the chart walks back to frame one** — the map spec lives in STONE,
      Bronze inherits the identical world, one layout forever, no era-gated UI machinery.
- [x] **6d — G2 growth verbs: subdue, settle, capture, supply lines** *(shipped 2026-08-22)*.
      The minor tier: 5 seats per iron world, hand-authored 14-name pool (pool > seats, runs
      differ), procedural placement and stats-in-range, remnants in `S.map.minors`, ownership
      trumping the regenerated seat (capture survives the save). Campaigns take a unified target
      ref — major id or `tile:q,r` — one resolver, one muster modal; victory over a minor is
      fealty: whole stock home, +1 holdfast on bread, the Chronicle names the place for the last
      time. Settle: empty land, priced in food+wood and time, through the Underway queue (the
      anti-speedrun governor as ruled); wasted honestly if the ground is taken first. Supply
      lines: `routeCost()` multi-source Dijkstra (owned ½, land 1, water 3 — never impossible),
      `marchFactor()` bending time and provisions for majors, minors and settling alike; routes
      printed on tile details and the muster sheet. 13 new checks (490); live-verified.
      *Open from this slice:* growth-pacing triple-charge watch (settle cost + levy + budget), the
      carried-army upkeep flag from 6b, and the boost-building pruning question — all land in the
      6e/balance pause.
- [ ] **6e — G3 priests & the envoy.** Religious building + priest unit; envoy as the third
      adversary action; per-target affinity; the annexation ceremony modal (the first ceremony built
      under the pause-modal seam); standing hooks into event weights.

### Phase 7 — Decision queue
The payoff of the whole pivot.
- [ ] `S.pending` — events may enqueue a choice rather than self-applying. Part of the save.
- [ ] No expiry, ever. No timer, no claim window, no urgency affordance.
- [ ] Every choice ships with a designed default so it rolls off gracefully.
- [ ] The decision card/tray component — see `interface.md`.
- [ ] First content: two or three real decisions in the Iron slate, to find out whether this is as
      good as it sounds before building more.

### Phase 8 — Map
Designed in `map.md`. Gated behind the engine work because phases 1–4 make it dramatically cheaper.
- [ ] Place-graph data model (places + position + adjacency), independent of hexes.
- [ ] Pointy-top hex renderer in SVG; DOM overlay for labels, tokens, popups.
- [ ] Seeded procedural generation: coherent noise, landmass post-processing, feature placement.
- [ ] Hand-authored adversary pool per era, larger than the slate; role-constrained slate
      generation.
- [ ] Distance as a design lever (campaign time, provisions, caravan routes).
- [ ] **Ship the map early and inert, in Bronze** — visible, readable, no adversaries, no yield, no
      actions (`map.md` §2.5). Bronze→Iron already carries seven simultaneous changes; this is the
      mitigation that stops the map being an eighth. It also makes the M1 slice shippable content
      rather than scaffolding.
- [x] **Sequencing between phases 6 and 8: decided 2026-08-22.** Per-hex allocation replaces the job
      steppers at Iron, so hexes must exist the moment G1 ships. **M1 (map model + readout) lands
      inside phase 6** rather than G1 carrying a throwaway interim production model. Revert target if
      it goes badly is commit `fff278c`+1.
- [ ] **The odometer** — derived `souls = Σ tiles × soulsPerTile(era)`, never stored, never a lever.
      Cheap, and worth doing early because it is the thing that makes scale *felt*.

### Phase 9 — Interface re-architecture around the map
**Structural half SHIPPED 2026-08-22 ("the flip"), ahead of 6d by user ruling (option A: the growth
verbs land straight into their real home).** The 4×2 grid is gone: full-bleed map stage, floating
panels (People + tabbed Train/Build/Upgrade left; Selected Tile + Chronicle right; Underway docked
bottom, cards horizontal), the Expeditions panel dissolved into the Selected Tile panel, the Map
button gone — the map is not a place you go, it is where you are. Rode with it: **era-scoped view
radii** (Stone shows one hex, Bronze the ring, Iron the country — the world literally grows with
the ages) and the frame-one chart. *(The radii were retired in design that evening — `map.md` §2.6
keeps the growing-world effect but delivers it with fog and a camera over one permanent board.)* Bureau remains as the **interim skin**: structure was adopted
from the Claude Design sketch, palette explicitly was not.

**What remains of phase 9:** executing the reskin, not choosing it. The identity question opened
here **resolved the same day** — paper retired (the war table weighed and killed), and the 3D
spike settled the successor: **the digital tabletop** (`design.md` OQ3, `map.md` §8, Phase 10
above). Bureau stays as the interim panel skin; its lessons (no opacity for state, semantic color,
legibility over texture) survive the reskin as law. The Claude Design pass still runs — its brief
is panel legibility with the flipped structure over the diorama. *(As originally written this
paragraph put Bureau formally under review with the war table as one candidate to weigh — campaign
maps historically ARE paper, so Bureau could evolve, parchment map and paper panels, rather than
die. Both halves were ruled within hours.)*
Original text follows for the record:
*(pulled forward 2026-08-22)* The user returned to the Claude Design thread and came back with a
structural sketch: the map as the main canvas, everything else as floating panels over it — Orders
left, Selected Tile right (stats + flavor + all actions, incl. March/Caravan/Scout with costs),
Chronicle docked right, Underway docked bottom, ledger in the header. All current systems map 1:1
onto it. Rulings so far: **the pattern is structure, not palette** (the sketch's dark slate is not
decided; whether Bureau's paper survives is still the open identity question, to be resolved in the
design thread); and **one layout for the whole game** — the chart now exists from Stone, so
map-primary needs no era gating and the "neat map → main surface" shift is continuity.
Sequencing decision pending at the next pause: flip the layout before 6d (less rework — the growth
verbs land straight into their real home) or after (6d proves the content first).

---

## Carry-over todos

These survive the pivot unchanged.

- [x] **C3 — Iron polish** *(shipped 2026-08-25)*. Raid attribution flavor ("the Hill Clans test your
      defenses" rather than an anonymous warband), so the world's proper nouns appear in both
      directions. Landed a age earlier than "Iron polish" implies: the gate is `contact`, so it turns
      on at BRONZE.
- [ ] **Balance pass on `CONFIG`.** Most numbers are still first guesses, deliberately tuned toward
      too-hard per the standing rule. `conflictBaseChance` has been retuned once from real playtest
      data (tripled); expect others to move. The pivot changes the pacing target — everything must
      now fit a sitting — so this is due a fresh look after phase 5.
      *Known dials, if pacing feels off:* `CONFIG.popGrowthRate` governs early growth (it replaced
      `settlerIntervalSeconds`, which was deleted 2026-08-25); each adversary's `walls`,
      `CONFIG.siegeWallBonus` and `CONFIG.wallRetreatLoss` govern siege feel.
      *(Corrected 2026-08-25: this used to name `consolidate.keep` as THE population dial.
      Consolidation was deleted in E5 — the dial does not exist. Don't reach for it.)*
- [ ] **A rare "special" event with no counter** (the asteroid-style 0.5%-chance idea). The engine
      already supports the shape; it's content. Now also a candidate for the first *decision* event.
- [ ] **Additional person-types.** Priests arrive with G3. "Citizen" as a Settler rename is saved for
      a later age.
- [ ] **Holding-tile tints: locked as aesthetic, open as semantics.** The `BUILDING_CATS` category
      mapping (shelter / store / work / care / people) is a first guess; which colors exist and how
      strictly they gate by content type is still a design decision.

---

## Deferred on purpose

- **Ages past Iron.** The age list in `design.md` is a flavor guide, not a backlog. One age at a
  time, each proven fun before the next is scoped. The Enlightenment gets scoped when the Iron
  rework has shipped and played; its scoping notes are in `design.md`.
- **The name.** "Idle Civ" is wrong now. Deferred until the pivoted game is playable — see
  `design.md` → Open Questions.
- **Whether Bureau survives the map.** Same gate.
- **Tick-counter for authored beats.** Phase 4 delivers `S.tick`, which makes "sickness can't fire
  again within N ticks" and scripted era milestones trivial. Not needed yet; the capability just
  arrives for free.

---

## Vestigial code, found by the docs and README passes — ✅ all cleared 2026-08-25

All three are exported or declared, referenced by nothing in `src/`, and outlived the system they
belonged to. None breaks anything; each will mislead the next person who greps for it, which is
exactly what the docs pass was for — and the third is proof the sweep was worth repeating.

- [x] **`housingPerHut()`** in `core/derived.js` *(done 2026-08-25)*. Housing died in the engine rework; the accessor
      did not. The `housingPerHut` era-fact is still declared in the manifests and still passed by
      six harness fixtures, so removing it is a small three-file change (manifest field, accessor,
      fixtures) rather than a one-liner.
- [x] **`CONFIG.settlerIntervalSeconds`** *(done 2026-08-25)*. Dead since E3, when `accrueGrowth` was replaced by
      `growPopulation` and people started being born where they will live. The harness already
      carries a comment saying so. This one IS a one-liner.
- [x] **`CONFIG.baseHousing`** *(added and done 2026-08-25)*. The third of the set, and the docs
      pass missed it because it is referenced by literally nothing — not `src/`, not the harness, not
      a manifest, so no grep for a live caller turns it up. Housing died in E3. One line.
      **Also in this pass:** the stale comment block above `housingPerHut()` in `derived.js`, which
      documents huts upgrading into Stone Houses at an era border. Deleting an accessor while leaving
      the paragraph that explains its mechanic is how vestigial code grows back.

---

## The map frame editor — wished for 2026-08-28, not built; ~an hour when wanted

**The ask (owner, end of the fortification night):** *"I would like to make more hexes land on
each fixed rectangular map. And instead of having you do this... a map frame editor? A new map
could load the whole rectangular map as just a grey frame and I could click on hexes to designate
them as 'put land here' and anything else gets ocean."*

**Why it is small:** a continent is already ASCII art — `continents.js` frames are rows of `#`
(land) and `~` (ocean) in odd-r offset, parsed by `parseFrame(rows)`. The editor is a TEXT-ART
PAINTER, not a map tool: draw the W×H grid as flat SVG (`map/model.js` → `toPixel` is the pointy-
top math, already written), click to toggle, drag to paint, and the entire output is the
`rows: [...]` block in a textarea to paste back into `continents.js`. Load any existing continent
as a starting point. Standalone dev page, no sim involvement, ~200 lines.

**Two data-shaped gotchas the tool must surface:**
1. **The generator has guarantees to feed** — seat placement (human + adversaries + minors, the
   seat-floor guarantee) needs enough usable land. Show a live land-hex count; a starved frame
   fails placement or degrades starts.
2. **Editing an EXISTING continent's rows reshapes every save that used it** — geometry
   regenerates from the seed at load, so a mid-run save wakes up on different ground. New frames
   get new ids; edits to shipped frames are save-breaking and must be done knowingly.

(The immediate want — MORE LAND per fixed rectangle — is then the owner's own five minutes in the
tool, which is the whole point of building it.)

## Known rough edges

- [ ] **Armies walk on the ocean** *(owner, 2026-08-28, from the night's last screenshot — a march
      path dashed straight across open sea to the Hill Clans' island)*. DELIBERATE at the time it
      was written: `routes.js` prices a water step at 3 with the stated reason *"slow crossings,
      never impossible, so an island seat cannot deadlock a run."* Wrong the moment boats exist —
      an army is not a fleet, and open water should be impassable to men on foot. **Do not fix
      before the naval rules arrive** (owner: *"I am not even sure I want to fix this right now
      because we don't have boats yet"*), and when the fix lands it MUST keep the original
      guarantee some other way: an island seat (or an island Hill Clans) still needs to be
      reachable — embarkation, a ferry verb, whatever the boat rules provide — or a water-locked
      start deadlocks the run again, which is the exact bug the walk-on-water pricing was built to
      prevent. Sighting note: the fog's sight-across-water rules (`SIGHT_RANGE` rays) already treat
      water as *look but don't touch*; movement is the only system still treating it as ground.
- [ ] **Mobile layout** is a basic stacked-column `@media` fallback, not designed for. Matches the
      stated non-goal; flagged only so it stays true.
- [ ] **Holdings tiles show raw counts with no compaction.** Fine at current scale. The
      re-denomination design means playable numbers should never get big enough to need it — if they
      do, that's a design bug, not a display bug.
      **One deliberate exception**, added 2026-08-22: the **odometer** (`design.md` → *Scale: The
      Tile Ladder*) is a purely-flavor count of individual beings under your control, and it is meant
      to reach the trillions. That is one formatter for one display, not the small-numbers pillar
      being abandoned. Do not let it grow into a general compaction system.
- [ ] **Conflict's numbers are first-guess** (`conflictBaseChance`, `conflictPopScale`, raid-size
      weights, the `repelChance` ratio, casualty and theft fractions).
- [ ] **The migration runner and DOM purge are lightly exercised** relative to their importance. The
      bronze→iron flip is their only real workout; the harness covers the primitives synthetically.

---

## Open threads from play

The first full playthrough (2026-08-21) validated everything previously flagged awaiting human
contact — v15.4 queue icons, v16 siege, v17 re-denomination, the Bureau board, and both click bugs
(v18/v18.1, found *during* that playtest and fixed). What it surfaced instead:

- **The fun concentrates where the verbs are.** Expeditions were by far the most engaging part of
  Iron, because they were the only outward-facing action. That observation is now load-bearing
  design canon and is what produced both Conquest Growth and this pivot.
- **Flavor friction is a gameplay smell.** "My longhouse holds 3 holdfasts" was the fiction
  correctly reporting that the mechanics beneath it hadn't re-denominated. Trust that signal.
- **The campaign muster modal is the best moment in the game and deserves more.** It is currently
  the only place the interface stages a real decision. Phases 5 and 7 are about making that the
  norm rather than the exception.
- **The Iron Age ends signal-less by design** — the terminal signal *is* the next capstone, which
  doesn't exist yet. That end-state is exactly what "done, awaiting an exit" looks like.
