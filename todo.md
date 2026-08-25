# Idle Civ — Working Plan

> **This file is the authority on what is actually built and what happens next.** `design.md`
> holds game-design canon, `tech.md` the architecture, `map.md` the map arc, `interface.md` the
> interface system, `CHANGELOG.md` the shipped-feature record. Those documents describe a game
> that is partly *intended* rather than *implemented* — when they disagree with reality, this
> file and the code win.

---

## THE WORKING ORDER — read this first on a cold start *(owner priority, 2026-08-25)*

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
stock) and no resource ever ends a tick below zero (the "-1 food" float-residual display). **Next
session starts at 4d, the era clock, on a feature branch** — the civs refactor spans sessions, and
the branch ruling (2026-08-25) is: one-session work lands on main; multi-session work branches.

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
- **Scouting** *(map arc, slice 6)*. **PROMOTED (2026-08-25): no longer back seat** — it is the
  prerequisite for armies taking the field (6c), and its meaning changed: scouting buys **warning
  time**, a standing and directional value, not one-shot map knowledge. Scouting is done by army
  groups in the scouting stance (horsemen faster), so it lands with or just before 6c rather than as
  its own verb. The live constraint stands — it must not delete the settle-blind gamble.

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
        **NOTE: adversaries still only exist at IRON.** Stone and Bronze declare no seats and no
        minor tier, which is why early play is unopposed — see the stone-age-minors item above.
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

**Flagged, not scheduled:** `applyConsolidation` reducing `S.pop` is correct for Bronze→Iron and
wrong for every later border under a fixed board, where the board is already the cap. Post-Iron
consolidation should re-denominate the tile noun and raise per-tile output while dominion stays
put. Belongs to the balance pass, after the pop ladder past Iron is designed.

**The original port work follows.**
Port the map stage from SVG to the spike's renderer, for real:
- [ ] Move `spike3d/`'s pipeline into `src/render3d/` behind the existing stage seam: `renderMapStage`
      swaps implementations; the SVG stage survives as the 2D debug/fallback view (`?map=2d`).
- [ ] Re-wire the shipped interaction pattern: plane-picking → `selectTile` (same Selected Tile
      panel), hover ring + DOM tooltip, work-glyph equivalents (3D markers or projected DOM labels),
      owned/selected state via materials — **never opacity**, the law follows the renderer.
- [ ] Era-fact hooks: palette + light mood + prop-set keys in the `map` manifest spec.
- [ ] View radii / fog, dominion growth, captures, settle — all state-driven re-mesh triggers
      (chunk-dirty on the same signature the SVG stage already watches).
- [ ] The §7 curvature shader (tabletop signature), WITH its depth-material and culling gotchas.
- [ ] Vendor three/postprocessing/n8ao into the repo (pinned builds; no CDN at runtime).
- [ ] Verification: keep readPixels smoke checks + the 2D debug view as the assertable surface;
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
      *Known dials, if pacing feels off:* `consolidate.keep` (iron delta) is THE population dial;
      each adversary's `walls`, `CONFIG.siegeWallBonus` and `CONFIG.wallRetreatLoss` govern siege
      feel; `CONFIG.popGrowthRate` governs early growth (it replaced `settlerIntervalSeconds`, which
      was deleted 2026-08-25).
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

## Known rough edges

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
