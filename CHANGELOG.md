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

## 2026-08-25 — The night the game stopped being idle *(no code shipped)*

**A design-only session that started as "one balancing thing" and redefined the game.** Everything
below is consensus swept into `design.md` and queued in `todo.md`; code follows in later entries.

- **The genre, named** — a pausable real-time competitive 4X against simple adversaries; the scarce
  resource is attention, and *no order ever gets better by being issued faster*.
- **The caps come back, flat and free** — storage buildings die, eras set automatic per-resource
  caps, gold is never capped (*cap what accrues while you are not playing*).
- **The era clock** — adversaries advance through eras on hidden tick countdowns, one speedster
  guaranteed, telegraphed by the Chronicle, era gaps read as unit *kind* early. The no-sim rule
  amended to exactly one variable. Closes "advancing is a formality".
- **Armies take the field** *(direction only)* — positioned groups, stances, interception,
  army-v-army dice, raids as inbound campaigns; the "no units on the board" ban overturned in the
  same manner the map ban fell.
- **Found in play:** the 4b economy levers are miscalibrated for Bronze (constants tuned at Iron
  scale) — the correction is queued first, because the clock only punishes falling behind.
- **Refined later the same night:** the law reworded to faster-*hands* after the owner caught it
  banning legitimate timing judgment; min group size dropped for the steamroll rule; and **units
  persist across eras** — mixed nonsense armies, rebuild-as-sink, equipment tiers era-scoped (each
  era sells its own, skippable — a bet on your own pace; gone at zero units of that era), no
  disband verb.
- **The night closed with the docs squared:** *What This Game Is* written at the front of
  `design.md` as the one-screen summary, and a contradiction sweep across every doc — the Premise's
  units clause, the static-adversary "ruling stands" in the economy section, the units bans in
  `map.md` and `interface.md`, the README's genre and pivot history, and a design-forward note at
  `tech.md`'s era indirection. Performance is retired as a stated rationale anywhere it stood in
  for the real constraints: simulation is bounded by explainability, animation by the board-game
  register.

## 2026-08-25 — A refusal always says why

**Third silent failure found in play, and the third is the one that made the pattern obvious.**
Pressing **March** with an empty muster did nothing at all — the modal even printed *"Muster at least
one fighter"*, in ordinary text, beside a live button. The owner nearly filed it as a missing muster
ground, which is exactly the wrong diagnosis a silent refusal invites.

`campaignRefusal(ref, muster)` now answers **why a column cannot march, in words**, mirroring every
guard `launchCampaign()` has: no muster ground, a campaign already out, the dominion at scope, an
empty muster, fighters you do not have, and provisions you cannot cover. It lives beside those guards
so the two cannot drift, and the modal disables March and prints the reason in semantic red.

**The CSS fix is the real lesson, because I got it wrong twice in one day.** `.short` — the channel
for *you cannot pay this* — was written `.building .b-cost .short`, so the convention existed **only
on buy cards**. Every surface that later grew an action reimplemented the verb without the refusal:
Settle printed a plain price, then March printed a plain reason. When I fixed Settle this morning I
added `.map-noworks .short` — **scoped again** — so the modal was still grey an hour later.

It is one unscoped rule now. The next surface inherits the convention instead of forgetting it.

**Seven checks pin the contract**, including the two that matter most: when the refusal is `null` the
column really does march, and when it is not, the launch refuses too. A modal that enables a button
the sim will ignore is the original bug wearing a different coat.

748 -> 755 checks, 0 flakes in 20 runs.

---

## 2026-08-25 — The march-hold was an Escher figure

**Reported from play: the wall rendered as disconnected panels that did not line up, and the pieces
moved independently as the camera turned.** It looked like a modelling mistake and was a normals
mistake — I emitted the wall's triangles by hand and the **winding was inconsistent between faces**,
so backface culling dropped a different subset at every angle. Nothing was missing from the geometry;
different parts of it were being discarded as the view moved.

**Rebuilt as an extruded hex ring**, which is the owner's own suggestion — reuse the shape the
selection ring already proves, smaller, taller and grey. A `THREE.Shape` outline with a reversed
inner `Path` as its hole, extruded and laid flat: THREE handles winding, capping and triangulation,
and none of it can be got wrong by hand. The outline still comes from the game's own `corner()`, so
alignment with the tile stays structural rather than depending on where a primitive starts its
segments.

One detail that is easy to get wrong and silently wrong: **the hole must run the opposite way round
to its shape.** An inner path with the same winding is not a hole, it is a coincidence, and
triangulates to nonsense.

Also thicker and taller — 0.80/0.63 radii at 0.58 high, from 0.74/0.62 at 0.42 — because the first
one read as a fence rather than a wall. It still sits inside the selection ring (0.94/0.82), so the
two never fight.

Verified through a 90-degree orbit: solid and closed from every angle, which is the exact test the
old one failed.

---

## 2026-08-25 — A price you can never meet says so

**Both balance flags came back approved, and one of them exposed a gap in the fix that approved it.**

The owner liked the farm costing 55 wood against Bronze's 50 cap — *"I like making you engage"* — and
said the red price should make him think *"OH I'm capped, better build a thing first."* It would not
have. **Red says "not enough wood"; it does not say "your stores cannot hold that much wood",** and
those are different problems with different answers: one you solve by waiting, the other only by
building. A player reading red alone waits for wood that will never arrive.

Prices now name that case outright — *"Your stores cannot hold this much wood (holds 50) — raise
storage first."* Storage caps retire at Iron, so this is a Stone and Bronze problem, which is exactly
when a player is least equipped to diagnose it.

**And the pause ruling is now canon** (`design.md`). Told that an unattended settlement had shrunk to
its seat, the owner said: *"If you are not paying attention, pause the game. This is the polar
opposite of what I would have said ages ago, but the game is a completely different beast now."* The
old contract was *the game never needs you*; the new one is *the game never punishes you for leaving*
— and leaving means pausing. A world you left **running** is a world you chose to leave running.
Losing ground while inattentive is the design working, not failing.

---

## 2026-08-25 — Two bugs from play: a silent refusal, and hay that did not rise

**1. Settle printed a price it never marked, then did nothing when clicked.** The buy cards have shown
unaffordable components in semantic red since Bureau (`.short`), and the map's Selected Tile panel
never learned it — the CSS rule was scoped to `.building .b-cost .short` and nothing else. So a
settle you could not afford looked identical to one you could, and clicking it failed **silently**,
which is the one failure mode `interface.md`'s laws forbid outright: a refusal always says why.

Prices in the map panel now mark the parts you cannot pay, and the button disables. The card stays
fully readable either way — opacity is never used for state, because reading what a thing costs is
how you plan for it. Structure prices use the same helper, so Build and Settle now speak the same way.

**2. A completed farm snapped into existence instead of rising.** The cause is more interesting than
the symptom: **nothing fired the transition on completion.** `changedHexes()` had exactly one caller —
the demolish handler — because demolish was the one path that remembered to ask. A farm finishing set
its use inside `completeConstruction()` and the stage simply rebuilt.

Fixed by inverting who is responsible: `renderMapStage()` now **diffs what is built where** against
the last draw and animates whatever moved. That makes it automatic for every cause — a build
finishing, a demolition, a hex lost to a raid, an era re-dress — and no future caller can forget. It
also cannot fire on an ordinary work change (food → wood), which moves no props and should not
animate. Both manual `changedHexes()` calls were deleted; there are now zero.

**Order matters and is commented:** the diff asks for the transition *before* handing over the new
world, so the new paint and props are applied at the bottom of the descent and rise together. Reversed,
the hex would change in full view and then politely animate.

**Found while testing this, and left for the owner to rule on:** a farm costs **55 wood** while
Bronze's base wood cap is **50** — so the first farm is unaffordable until a Woodshed is built. That
may be a good gate or an accident of two numbers chosen a day apart; it is a balance call, not a bug.

748 checks, unchanged — both fixes are in render and DOM paths the harness deliberately does not
import.

---

## 2026-08-25 — Copper and tin get their letters

**Found in play by the owner: a hex turned to copper or tin drew nothing.** `WORK_GLYPH` had entries
for food, wood, stone and iron — the four resources that existed when the table was written — and
Bronze put the alloy economy on the hills on 2026-08-24 without anyone re-reading it. `WORK_GLYPH[w]
|| ""` renders an empty string, so a working hex looked like a resting one.

**The bug is one line. The check that missed it is the story.** It read:

```
const letters = ["food", "wood", "stone", "iron"].map(...)
check("every work letter is distinct", new Set(letters).size === 4);
```

It restated the very list it was checking, so it could only ever confirm what its author already
remembered — and it stayed green through the exact change that broke the thing it was for. It derives
the set from every era's `map.works` now, and asserts two things instead of one: that every workable
resource draws a **non-empty** letter, and that the letters are distinct. Reintroducing the bug fails
both.

**That is the third time today a green check turned out not to be testing its subject** — after the
route-cost assertion that compared one route to a constant, and the march-hold check that a mutation
walked straight through. The shared tell: a check that hardcodes what it should derive.

746 -> 748 checks.

---

## 2026-08-25 — The march-hold, and raids resolve where they land

**Iron learns Fortification; a holding can then become a March-hold** — walls, a gate, and people who
watch the road. It **yields nothing at all**, which is both the point and the price: you are trading
a hex's entire output for defence.

**The conflict resolver was reordered, and that is the real change.** The struck hex used to be
chosen *last*, inside the failure branch, so the place was a consequence of the outcome. Now:

- **SELECTION** — that a raid happens, who sends it, **and where it lands**
- **RESOLUTION** — what it costs, and the only phase anything you build may touch

That is the owner's ruling made structural, and it is what lets raid-roads (5c) change selection later
without ever colliding with fortifications.

**Defence is now the army PLUS the walls covering the hex that was actually struck.** Flat addition,
not a multiplier, and deliberately: a multiplier on an army of zero is still zero, and walls have to
fight for a player who has no soldiers. `CONFIG.fortStrength` (9) and `CONFIG.fortRange` (1) are the
dials; a march-hold covers itself and the ring around it.

**The seat cannot be built on** (owner ruling), and the reason names a line the docs had never drawn:
**the Construction panel raises things in your SEAT**, while **building on a hex is you instructing a
HOLDING**. Letting the capital be farmed would collapse two verbs into one. It also protects a
landmark — the three-house cluster is how the board says *you are here*.

**Visually** the hex keeps its terrain colour (unlike the farm) and raises a grey hexagonal wall
inside the ownership rim, built from the game's own `corner()` rather than a six-sided cylinder —
which would have been shorter and *misaligned*, since THREE starts its radial segments on a different
axis than this board's pointy-top hexes. Alignment is structural instead of a magic rotation constant.

**A check that looked right and was vacuous, caught by mutation.** "A march-hold does not change where
raids land" passed against a deliberate mutation that made forts steer raids. The reason is worth
keeping: **the starting trio is mutually adjacent, so one march-hold covers all three equally — and a
uniform factor cancels out of a weighted pick.** The check now takes distant ground first, so the
fort covers some hexes and not others and the weights can actually diverge. It fails against the
mutation now.

733 -> 746 checks, 0 flakes in 25 runs.

---

## 2026-08-25 — The farm: a hex can be something other than its ground

**5b, first structure, and the proof of the whole build-on-hex pipeline.** Bronze learns **Farming**;
any owned hex can then be turned into a **Farm**, which feeds at a flat **x1.7** — better than any
bare ground in the game, plains included — and gives up everything else it could have produced. The
resource buttons vanish, because the hex's one use is taken.

**It corrected a rule one day old, and the correction is the interesting part.** The use seam said a
structure never produces. The very first structure produces. A structure occupies a hex *instead of
working it*, which is not the same as yielding nothing — so structures may declare a `yield`, and
`hexYield(id)` now answers `{res, rate}` for worked ground *and* built ground. `rates()` got shorter
rather than longer: it no longer knows that terrain has a rate table at all.

**Flat, not terrain-scaled, and the consequence is deliberate:** a farm is worth most where food was
*worst*, so farming is how poor country starts feeding you. The real cost is the specialty given up —
a forest that becomes a farm stops cutting timber entirely.

**The validator earned its keep twice.** Farming was first priced with bronze in it; upgrades inherit,
Iron retires the alloy economy, and the compiler refused the manifest outright — "costs bronze, not a
resource this era". A new check also refuses a structure whose unlocking upgrade does not exist in any
era, because an unreachable structure is invisible until a playthrough that never offers it.

**Visually:** the hex's TOP turns hay (walls keep the terrain's colour, so a farm reads as worked
ground standing on the country it was cut from), the terrain props are shed — no trees in the middle
of the field you cleared — and three tipped hay bales stand on it. The bale is one baked
`rotateZ` on the geometry rather than a per-instance rotation, so a whole country of farms is still
two draw calls.

**Pulling it down** returns the hex to plain resting ground with **no refund**, plays the sink-and-rise
through the same `changedHexes()` every other content change uses, and is the reversal design.md
already specced.

Eighteen checks over the pipeline — upgrade gate, up-front payment, per-copy escalation, one build per
hex, one use per hex, demolition without refund, and the case that would have become a save bug:
**a queued build on ground you lose to a raid** resolves as wasted labour rather than raising a farm
on somebody else's land. 713 -> 733 checks, 0 flakes in 25 runs.

---

## 2026-08-25 — The re-dress slows down to look like work

**Owner verdict from the desk: exactly right, but "blink and you miss it."** The framing that came
with it is the spec — *"this is a visual representation of real work happening by the people in the
hex. Raising new buildings over time, setting up a farm in a forest hex."* So the pacing is not
polish, it is the content.

**620ms down, 980ms up** (from 260/320), the rise much longer than the sink because tearing down is
quicker than building up. **Easing changed too:** it was quadratic in and quadratic out, so props
*dropped* and *popped* — physical, and wrong for the reading. Smoothstep both ways now: deliberate at
the start, deliberate at the end.

**And slowing it down exposed something the speed had been hiding.** At 580ms nobody notices that
twelve hexes move in perfect lockstep; at two seconds it reads as one *mechanism* rather than twelve
crews. Each tile now takes a deterministic offset of up to 420ms, hashed off its id — never `rng()`,
the same rule every other visual jitter on this board follows. `setPropPhase` takes a `phaseOf(tile)`
function rather than one number for the whole set.

A full-board re-dress is now about **2.4 seconds**; a single hex about 1.6.

*Measured in flight:* at 302ms one hex is already 0.24 down while another has not started, all three
bottom out around 935ms, and every one returns to exactly its rest height. **Three constants if the
feel is still off** — `SINK_MS`, `RISE_MS`, `STAGGER_MS`, all in `stage.js`, and `STAGGER_MS = 0`
turns the stagger off without touching anything else.

---

## 2026-08-25 — Regrowth survived, and the harness found the sharp edge

**Owner question: did deleting ghosts also delete population growing back after a hit?** No. Only
revival from *exactly zero* went; a hex knocked 8 -> 6 still climbs its logistic back toward 8, and
nothing refills population at an era border either. Pinned by a check now, since the owner said he
likes the behaviour and it sits next to code that changed.

**At current tuning, strikes cannot overpower regrowth by attrition** — a person returns in ~33-44s
at Stone and ~11s at Iron, while sickness runs ~11min and conflict ~6-7min apart. The danger is not
attrition; it is the instant loss the reversion rule introduced.

**And the harness demonstrated it by accident, which is the useful part.** A pre-existing check —
"barracks revealed once the dominion grows past the trio" — started failing about 1 run in 40. The
cause was not the check: a raid or plague landing on the *freshly claimed* fourth hex now takes the
dominion back below the trio, so the reveal never fires. Measured directly at **0.3% within five
seconds of claiming**, because a new hex enters at 2 people and a raid takes 1-2. Raids pick
exposure-weighted by population x administrative distance, so a new frontier hex is simultaneously
the likeliest target and the most fragile.

That is either exactly the punishment for over-extension the rule was written for, or it is
arbitrary. It is a play judgement, so it is recorded rather than tuned. Two dials if it reads wrong:
new hexes entering at 3 instead of 2, or a grace period before an empty hex reverts.

**Two flakes fixed, and one of them was mine.** The new regrowth check set population to a hardcoded
6 — fine on plains (cap 8), *above the cap* on hills (cap 3), where growth correctly refuses to run,
so it failed about one run in eight. The starting trio's terrain is rolled per world. Same tell as
the route-cost flake earlier today: **a value assumed about generated geometry rather than read from
it.** Every number in that check is derived from the hex now. 0 failures in 50 runs.

710 -> 713 checks.

---

## 2026-08-25 — Ground you can lose, and props that sink into it

**Two halves of the same infrastructure, built together because they are the same event: a hex's
contents changed.**

### An empty hex is lost

**Reverses `design.md` rule 9 and the never-shrinks ruling**, on new information rather than a change
of heart. Ground used to stay yours when it emptied — a ghost that rekindled from 0.2 souls — because
*"a ghost town you can bring back is more interesting than a hex that vanishes."* `dominionCap`
shipped **two days after** that ruling and changed its arithmetic: under a cap a ghost occupies one
of your seven slots while producing nothing, so you were punished twice and could not re-plan.

What actually changed is narrower than it sounds: a ghost and a lost hex both yield nothing, so the
difference is **free recovery versus paying the claim again**. Famine now costs the investment, not
only the people. It self-corrects rather than spiralling, because claim escalation reads
`owned.length` — losing ground makes the next claim *cheaper*.

`loseHexIfEmpty()` is called from **every** path that can empty a hex — famine, sickness, a raid —
because losing ground is a property of the hex being empty, not of what emptied it. The seat is the
one exception and always was: it ends the run instead. A structure on a lost hex is destroyed with
it, no refund, matching the deliberate-demolish rule.

Ghosts and the 0.2-soul rekindle are **deleted**, not orphaned, with a tombstone block in the harness
— the `housingPerHut` lesson applied on the way in rather than a fortnight later.

### The sink-and-rise

The first and only moving thing on the board, under the motion ruling: props go down into the ground,
the world changes underneath, new props come up. `props3d.js` now records the **tile each instance
stands on**, which is what lets one hex's props move without rebuilding the board — the difference
between a general primitive and an era-ceremony special case.

**The rebuild is the hard part, and it lives in the stage.** A `setWorld()` arriving mid-sink would
swap the meshes being animated, so it is held in `pendingWorld` and applied at the bottom of the
descent, unseen, before the rise begins. The ground hides everything for free: a hex is a solid slab,
so anything below its top face is occluded from every angle the camera is clamped to — no clipping
plane, no stencil.

`changedHexes(ids)` is the one call, and all four futures route through it: the era re-dress,
building a structure, demolishing one, and losing a hex.

**Verified in flight rather than watched.** `?perf=1` now also hands out the live prop group, because
the one moving thing on the board is the one thing a screenshot cannot check. Sampling an instance's
Y across a transition: 0.348 at rest, −0.400 underground at 250ms, and back to **exactly** 0.348 at
626ms. Landing on the precise original value is the motion law made checkable — when it settles, the
board reads as if you had blinked and missed it.

705 -> 710 checks.

---

## 2026-08-25 — One hex, one use: the seam before the content

**Infrastructure for building on hexes, built deliberately ahead of any structure to build.** The
owner's brief was the standard set by an earlier decision: *"prep the infrastructure for it ... like
we did when we preemptively separated the visual layer from the map logic layer. It made doing 3D
very easy."*

**The law already existed; what was missing was a name for it.** `S.map.work[id]` has always held a
single value, so "a hex is exactly one thing" was true — but every reader poked the raw string and
inferred what it meant, which is the same shape of drift the mark ladder taught us about: N places
deciding one question is N places to disagree. There is one accessor now — `hexUse(id)` answers
`rest`, `resource` or `structure`, with `hexProduces()` and `hexResource()` beside it, and the
producers, glyphs and panels all ask it instead of the slot.

**Structures live in the same slot, behind a prefix, and that is the point.** `build:farm` rather
than a second field, so a second simultaneous use is *unrepresentable* rather than merely forbidden —
there is nowhere to put one. The prefixed-ref idiom is already house style (campaign targets are
`tile:q,r`).

**One behaviour was right only by accident and is now right on purpose.** `rates()` skipped unknown
work values because they failed an `in prod` test and fell through. A structure now answers `null`
from `hexResource()` and is skipped by rule. Same outcome today, a stated reason for it, and no
chance of a future refactor "fixing" the fallthrough into a bug.

**The checks pin a use the game does not have.** Fourteen of them exercise `build:farm` and
`build:fortification` — classification, zero yield, no resource leaking to a producer, replacement
rather than coexistence, and that no era's resource id could impersonate a structure. That a
nonexistent feature behaves correctly is the only way to know a seam is real rather than
aspirational. Mutation-tested: making the seam stop recognising the prefix fails four of them.

691 -> 705 checks.

---

## 2026-08-25 — SUBJECTS 5,800

**The odometer ships, and it replaces the topline population count rather than joining it.** Iron now
reads **SUBJECTS 5,800** where it read 29 people, because a holdfast is a community and counting it
as one person was the sim showing its working.

**The whole change is a display and one era-fact.** `soulsPerPerson` (Stone 1, Bronze 1, Iron 200)
inherits like `popNoun`; `souls()` multiplies; `fmtSouls()` prints. Rule 1 holds **by construction,
not by convention**: nothing in the engine reads `souls()`, so deleting it would change no outcome —
which is the real test of whether an odometer is still an odometer. Every gate, cost, cap and stepper
still reads real `S.pop`. A check round-trips the entire state across repeated `souls()` calls to
prove it is derived and never stored.

**Iron's population noun was broken, and the fix is a validator rather than a value.** `popNoun` at
Iron was *holdfast* — the same word as its tile noun — so the game counted PEOPLE and called them
PLACES, and the POP tooltip rendered *"every holdfast counted here stands on one of your 20 hexes."*
Correct while population *was* tiles; wrong from the moment the engine rework made it a real per-hex
variable. `design.md` had already refereed this exact fight once for the tile ladder — *"a name you
have to defend is a name two concepts are fighting over"* — so `validateManifests` now **rejects any
era whose `popNoun` matches its `tileNoun`**, and the collision fails at load with a readable message
instead of shipping. Iron's people are **subjects**.

**Two scales, reconciled exactly once, on hover.** The tile keeps true units because the tile is a
lever and rule 1 bars the odometer from a cap; the topline is souls. The POP tooltip is the single
place the relationship is stated — *"27 communities, each about 200 subjects, because a holdfast is
far more than one household now"* — which is what the descriptions-live-on-hover law is for. The
tooltip's WHY line stays in true units deliberately: it is about a ceiling.

**The ledger label re-denominates too.** SETTLERS -> FAMILIES -> SUBJECTS. It was a hardcoded "Pop",
the one part of that row that never climbed while the noun beside it did.

**The formatter is the one deliberate suspension of the small-numbers pillar** — grouped digits while
a number can still be read as a quantity, compact past that, always three significant figures so it
still *moves*. 1.23M ticking to 1.24M reads as growth; 1M sitting at 1M does not, and the jumps are
the point.

Not built, on the owner's own ruling: the other nine rungs. *"When we add a new era, we'll find new
nouns if needed."*

675 -> 691 checks. Mutation-tested: reinstating the noun collision fails manifest validation
outright, and making `souls()` stop multiplying fails both the Iron scale check and the one that says
losing a person moves the topline by a whole community.

---

## 2026-08-25 — Purple by default

Owner ruling, and the reasoning is the whole entry: *"it is my game and I am the only player right
now."* A default colour is a preference until there is somebody to negotiate with.

Four places had green baked in as the fallback -- `DEFAULT_COLOR`, `freshState()`, the renderer's
pre-hook fallback, and two CSS `var()` defaults. The check pinning `freshState().playerColor` against
`DEFAULT_COLOR` is what guarantees the first two can never drift apart again, and it was written for
exactly this case: one fact living in two files, because `palette.js` reads `S` and importing the
constant into `state.js` would make the two a cycle.

---

## 2026-08-25 — One rim, one width, one colour at a time

**Caught by the owner in play, and it was three bugs wearing one coat.** Rims changed width as the
cursor crossed them, and a selected hex still showed the colour of the ring underneath leaking out
through the middle.

The rims had never agreed on anything. Three bands — owned `0.82-0.94`, hover `0.87-0.97`, selection
`0.84-1.00` — at three heights, at three opacities. The owned rim reached further *inward* than the
selection ring did, which is precisely the sliver that was showing; and selection's `1.00` outer edge
reached the hex's very corner, where neighbouring tiles touch, which is why it also looked like it
spilled onto the ground next door. Three bands can never stack cleanly. One always can.

Every rim now shares one band, the old owned one, since it is the most-drawn rim on the board and the
look is calibrated to it.

**Matching the geometry would not have been enough on its own**, which is the part worth recording.
The hover ring was drawn at **0.85 opacity**, so it BLENDED with whatever sat beneath it — hovering
your own country produced a mixture of two colours rather than either one, and identical geometry
would have made the mixture perfectly aligned instead of fixing it. Every rim is opaque now. The
owner put it better than the ticket did: *these are the little coloured rings you clip round the base
of a mini — they are opaque for legibility.*

**One consequence had to be designed rather than fixed.** Hover and selection had both become the
player's `focus` colour in the palette work earlier today, and they were only telling themselves
apart by width — so making the widths equal would have collapsed them into the same ring. The palette
grew a middle step, and the rim ladder is now **brightness as attention**: `ring` for ground you
merely hold, `hover` for the tile under the cursor, `focus` for the tile whose panel is open. Pinned
by a check that the three rungs are monotonic in relative luminance *and* far enough apart to see,
for every one of the seven colours — because brightness is now the only channel separating them.

Heights staggered (`0.03 / 0.045 / 0.06`) since identical rings at an identical height would z-fight;
hover and selection had shared `e+0.04`, which was harmless only while their geometry differed.

673 -> 675 checks.

---

## 2026-08-25 — The run you choose to start

**Slice 5, plus the owner's two additions, so the start screen grew three choices rather than one:
World, Colour, Seat.**

**World.** Random — the default — plus the three authored continents, which until now were reachable
only through `?continent=`. Three hand-made shapes existed that a player could not choose. **Random
is not a special case:** it is the *absence* of a pick, so the continent falls to the run seed. That
is what makes a bare seed number reproduce a random run exactly, and it is why the picker needed no
new save field at all.

**Colour.** The seven from the palette work, painting your hex rims, your seat's house, and the
hover and selection rings that derive from it.

**Seat.** Optional, falling back to "Your Seat" — and the fallback is the *common* case, not a
degraded one, so it reads as intended rather than as a blank someone forgot to fill. A name is a
**proper noun** and does not re-denominate at an era border: your Greenhollow is still Greenhollow
when it stops being a clearing and becomes a holdfast, which is the whole reason naming buys
attachment. Whitespace is not a name.

**All three are fixed for the run** (owner ruling) and shown for a new run only. Hiding them when a
save exists is the obvious reading of "Continue must not offer them" and it is the wrong one — New
Game would become unconfigurable, or need a second screen. They stay put and carry a "FOR A NEW RUN"
caption that appears *only* when there is a Continue button to be confused with.

**The one structural change: every new run now goes through the reload,** including the first one on
a fresh machine. "Begin" used to start in place while "New Game" reloaded, and the picker makes that
branch wrong — the world is generated during boot, well before this screen is shown, so a continent
chosen here can only take effect on the next boot. Rebuilding in place is the alternative, and it is
exactly what `start.js` already warns against, since every module-level render cache would still hold
the dead run.

Verified end to end in the browser rather than by unit alone: picked The Long Reach + purple +
"Greenhollow", clicked New Game, and the reload came back with `{continent: "longreach", seatName:
"Greenhollow", playerColor: "purple"}` in the save, purple rims on the board, and GREENHOLLOW in the
tile panel. Continue then preserved all three untouched.

**Found and fixed while looking at that panel:** `.tile-pop` has carried a class with **no CSS rule**
since the engine rework, so the population line rendered as an unstyled inline span butted against
the sentence before it — *"...measured from.People: 3 of 10"*. Pre-existing, and easy to miss because
the seat's sentence is the only one long enough to push the join onto the same line. One rule.

661 -> 673 checks. Mutation-tested: ignoring the pick fails the pick check, and dropping the name's
trim fails the whitespace check.

**Still open, and cheap:** there is no way to type a seed in. "A bare seed number reproduces the run"
is true mechanically now, but the death screen prints seeds and nothing reads one back.

---

## 2026-08-25 — Foreign ground wears a rim too

**A one-line request with a good instinct behind it (owner's): give adversary hexes a white rim like
your hexes have yours, "to make the little house icon slightly less load bearing."** Exactly right —
a single 22px glyph was carrying "somebody lives here" on its own, at tile scale, over lit terrain.
The rim states it at the scale of the thing being stated, and the house becomes confirmation rather
than sole evidence.

**Built through the mark ladder rather than beside it.** `rimFor()` asks `markFor()` what a tile is
and colours the rim from the answer — your colour on your country, white on a power's, a shade below
on a steading. Deriving ownership and adversary-ness locally would have been fewer lines and exactly
the duplication that let the 2D stage drift into drawing diamonds where the 3D board drew houses. A
check now walks every tile and fails if the two ladders disagree about who lives there.

**The honesty rule comes along free, and that is the reason for the routing.** `markFor()` returns
null for uncharted ground, so a rim cannot appear on merely *sighted* land — sight reveals the board
and never the pieces, and a rim announcing "someone lives here" is a piece. Mutation-tested:
re-deriving the rim from `p.adversary` directly fails both the leak check and the agreement check.

`buildTerrain()` got simpler on the way. It took an `isOwnedFn` and a palette and decided the rim
colour itself; it now takes a rim function and draws whatever colour it is handed, which is the same
ignorance rule the rest of the module already followed. 653 -> 661 checks.

---

## 2026-08-25 — Yours, theirs, and the colours the board shouts in

**Slice A of the start-screen work: the colour plumbing, ahead of the picker that uses it.** A
digital tabletop has three colour jobs — who you are, who everyone else is, and the board shouting —
and this settles all three at once. `core/palette.js` is the law; `interface.md` carries it.

**Powers are no longer red, and the deciding argument was a design one (owner's).** Most neighbours
are not enemies: `riverKingdom` and `saltNomads` ship `disposition: "peaceful"`, and standing,
caravans and the envoy are all real. Red pre-judged the whole diplomatic half of the game before the
player had met anybody. Powers wear **white** now, steadings a shade below — the board-game
convention for pieces that are not yours.

**Hover and selection stopped owning a colour.** They were gold and pale gold, which spent
**yellow** on the most frequent thing on screen, since hover fires whenever the cursor moves. Both
derive from the player's colour now — a hover ring is your attention on the board, so it belongs in
your colour. One correction to the sketch: hover is the *light* one and owned is the *quiet* one,
because a darker ring reads as recessive and the tile under the cursor should come forward.

**Seven player colours**, authored rather than computed — no HSL transform is right for both
`#1b1f27` and `#ff8cc0`, the same reason the continents are authored ASCII. Black gets its text
shadow inverted, since it is the one colour darker than the board it sits on.

**Red, orange and yellow are now reserved — as a reservation, not a system.** No per-hex status
visual exists yet. It is declared so the player palette can never quietly grow into the colours a
warning will need, and severity is meant to ride on ring *pattern* rather than more hues.

**Brown is allowed and orange is not, and the harness had to learn why.** The reserved-band check
failed twice before it was right: a red-dominant predicate misses yellow (high green by definition),
and widening it to the warm wedge flags brown — because brown *is* dark orange. The real distinction
is **chroma**: red/orange/yellow shout because they are vivid; brown is that family held quiet. The
check encodes warm-and-vivid, and pins the brown-vs-orange pair specifically.

**The worry I raised turned out backwards, which is why it got measured.** The fear was white houses
vanishing on grey hills — where the Hill Clans are seated by `homeTerrain`. Sampled off the real
drawing buffer with `?glcheck=1`, white beat the old red on *every* tile: 5.73:1 vs 1.72:1 on high
ground, 4.40:1 vs 1.32:1 over water. **Red was the poor-contrast choice all along.** Weakest case is
a steading on bright plains at 2.49:1, carried by the dark halo every mark wears.

Also: the work letter stopped being green and is a fixed parchment neutral. It is a *readout*, not
an identity — tying it to the player would collapse ring, house and letter into one hue for anyone
picking green, and the letter is the one of the three that must be read rather than recognised.

`state.js` hardcodes the default colour rather than importing it, because palette reads `S` and the
import would be a cycle for one string; a check pins the two copies equal. 639 -> 653 checks.

---

## 2026-08-25 — The board stops showing you the wrong game first

**A hard refresh flashed the 2D SVG board for a second or two before the 3D one replaced it.** That
was a deliberate tradeoff finally coming due: `init3d()` is not awaited, because boot must never
block on a GPU, and the comment promised the 3D stage would "take over a frame later." On a cold
load the dynamic `three` import plus GPU setup is one to two seconds, and for that whole window the
player was looking at a different game — the first thing a new player saw.

**The fix is a third state, not a workaround.** `mode` used to be `2d` or `3d`, starting at `2d`, so
the fallback *was* the boot view. It starts at **`pending`** now: `renderMapStage()` draws nothing
while the renderer is undecided, and the stage carries a `stage-waiting` class until `init3d()`
settles either way. Nothing else waits — panels, the Chronicle and the clock all come up
immediately; only the stage holds, because it is the one element that would otherwise show the wrong
board. `?map=2d` never enters `pending`, so the debug surface stays instant.

**The fallback is untouched in behaviour and got safer in construction.** It stops being the default
view and becomes what you get when 3D actually fails. Two details keep that true, and both are how
this could have become a permanent black rectangle instead of a nicety:

- **Every exit from `init3d()` must now decide `mode`.** It used to start at `2d` and only move up,
  so failure paths needed no handling at all; with a `pending` start, a path that forgets to settle
  leaves a board that never appears. Each `return` sets it explicitly rather than leaning on the
  initial value.
- **The CSS is keyed the safe way round.** The default is *visible* and only script can hide it, so a
  module that never runs leaves the board simply there. The reveal also runs on every path — the old
  `if (!ok) return;` would have left the 2D fallback hidden behind the waiting class, which is
  precisely the bug this change invited.

Not opacity-as-state (`interface.md`'s law): it encodes nothing a player reads, fires once on first
paint, and is gone for the rest of the run.

**Verified live rather than by eye,** since the timing is the whole feature. With a 2.5s delay
injected into `init3d`, the stage reported `svg: false` at *every* sample across the window — the 2D
board is never built, not merely hidden — and revealed the instant `mode` became `3d`. With the 3D
import deliberately broken, it fell back to a 2D board of 408 tiles at full opacity. With `?map=2d`,
it never waited at all. No new harness checks: this is boot-order and DOM timing, which the harness
deliberately does not import `main.js` to see.

---

## 2026-08-25 — Your seat says what it is producing

**The one owned hex that never reported its work was the capital** — invisible precisely because it
is the hex you look at most. `markFor()` is a priority ladder, and the `home` branch sat above the
owned-country branch and short-circuited it: your seat wore a house and stopped there, while every
other holding showed its work letter.

Your seat now wears **both**: the house says whose ground this is, the glyph beside it says what the
ground is producing (`⌂ F`). It is the ladder's only composite — a `sub` field, drawn beside the
primary mark — and the harness pins that nothing else on the board is composite, because a renderer
that drew `sub` unconditionally would put a dash on every rival's hall. On the 3D board the pair is
**one positioned element with two glyphs inside it**, since the label layer places exactly one node
per tile and a second top-level span would land on the same point and overlap.

Houses got bigger: **19 → 22px** for your hall and a power's, **14 → 16px** for a steading. The
home/seat parity is deliberate and survives the bump — your hall and a rival's are the same kind of
thing, told apart by colour, not size.

**And the two renderers now actually read one ladder.** `markFor()`'s comment has claimed since the
port that "this is the SAME ladder the SVG renderer draws, lifted out so both renderers read from one
definition rather than drifting apart." It wasn't true. The SVG stage re-implemented the ladder inline
and had already drifted — a seat drew `◆` and a steading `▪`, where `markFor()` gives both a house.
Nobody noticed because the 2D view is the debug surface, the one nobody watches. **A claim in a
comment is not a mechanism.** The SVG stage calls `markFor()` now, so the two cannot diverge again
without someone deleting the call.

Live-verified in the DOM rather than by eye: the seat's mark is a flex pair with a 4px gap, house at
22px white, work glyph at 15px green, no console errors. 632 -> 639 checks.

*Found and left alone:* `data-work-for` on the SVG work glyph is written and read by nothing in the
repo. It went out with the inline block it lived on.

---

## 2026-08-25 — The danger acquires a name

**C3, and it is the payoff for a decision made two weeks ago.** The Chronicle now says *"The Hill
Clans test your defenses"* instead of reporting an anonymous warband. The beat is: at Stone raiders
belong to nobody, and from Bronze the danger has a name and an address — and it turns out to have
been the neighbours you have been watching since your first clearing.

**It cost no new era-fact.** `contact` already distinguishes *there is nobody who could send an army*
from *there is*, which is exactly the line attribution wanted to be drawn on. `raidAttribution()`
returns `null` at Stone and a people from Bronze; null selects the anonymous flavor pool, a people
selects the named one. Same danger, same odds, same math — only the subject of the sentence changes.

**It is deliberately not `riskAdversary()`,** and conflating them was the trap worth avoiding. That
function asks who has a grudge worth prowling the roads over (`standing <= -2`); it gates caravan
escorts and multiplies the raid trigger, and it is null on a peaceful map. Attribution asks a
question every raid has an answer to. So a grudge decides **who, never whether** — the trigger roll
and `hostilityMultiplier()` already made anger raise the rate, and standing now only weights which
warlike neighbour gets named. Peaceful peoples are never blamed; that would be a disposition change
with its own fiction, not a quiet exception.

**Reading the output caught two bugs no assertion would have.** Rendering all six named lines showed
*"...before anyone can hold them back. the Hill Clans, and they knew the way."* — every people-name
begins with a lowercase article, which is right mid-sentence and wrong at the start of one, and a
line can begin *more than one* sentence with a substitution. Capitalising `line[0]` catches the first
and misses the rest. `sentenceCase()` now capitalises wherever a sentence actually begins.

Sixteen checks, and they have teeth: removing the `contact` gate fails exactly the two Stone checks,
and reverting `sentenceCase()` to a first-character fix fails exactly the one written for it
(mutation-tested both ways). Among them a **template-leak** check that renders every line in every
pool and fails on a surviving `{`, because that bug reaches a player and nothing else would see it.
616 -> 632 checks, 0 failures in 40 consecutive runs.

The same attribution rides the line that names a *place*: an anonymous raid burns "the hills"; a
named one is your neighbours doing it, which is a different sentence entirely.

---

## 2026-08-25 — A coin flip wearing an assertion's clothes

**The harness had a check that failed one run in eight, and it had been passing for the wrong
reason.** Caught by accident: a run went red immediately after the vestigial-code sweep, and the
project's own standing rule — *record a non-reproducing failure verbatim rather than re-running it
away* — turned what looked like collateral damage into a real find. Forty runs pinned it at 5
failures; twenty-five runs against the parent commit produced 4, so it predated the sweep entirely.

**The check was wrong by design, and the comment directly above it said so.**

```
check("a longer route feeds the same column at a higher price",
  plan.provisionPerUnit >= CONFIG.campaignFoodPerUnit);
```

`marchFactor` clamps to **0.6x–2x**. A steading reachable through your own country legitimately
prices *below* par — that is the supply-line rule working, not failing. So the assertion held only
when generation happened to drop the nearest minor at least three route-steps out. The harness mints
a fresh world seed per run and the check sampled it with `.find()`, so whether it passed was decided
by the dice.

**It also never tested its own name.** "A longer route feeds the same column at a higher price" is a
comparison between two routes; the assertion compared one route against a constant. Now it finds the
cheapest and dearest reachable tiles on the actual board and compares them — deterministic on any
real map, because your seat is always at route 0 and the far shore never is. Two checks came free
alongside: the 0.6x–2x clamp asserted across every reachable tile, and the wiring that the plan
prices its own target at par times that target's route.

0 failures in 60 consecutive runs, from ~12%. 614 -> 616 checks.

**The lesson is the one phase 2 already wrote down and this is the second instance of:** a check that
samples an unseeded world is not testing the rule, it is polling it. The tell is `.find()` or `[0]`
over generated geometry.

---

## 2026-08-25 — Three fields that outlived their systems

**A sweep, not a fix — nothing here was broken, which is exactly the problem.** `housingPerHut()`,
`CONFIG.baseHousing` and `CONFIG.settlerIntervalSeconds` all died in E3 when housing and the
free-settler timer were deleted, and all three survived the funeral. They cost nothing at runtime
and misled every reader.

**The accessor is the instructive one.** `housingPerHut()` read `active().housingPerHut` — a field
no manifest has declared for two reworks. So it was not "a function with no callers"; it was a
function that ran, returned `undefined`, and handed it to nobody. A grep for live callers finds one
and moves on. The only thing that catches this is reading it.

`CONFIG.baseHousing` was the opposite failure and the reason the previous docs pass missed it: it is
referenced by *nothing at all* — not `src/`, not a manifest, not even a harness fixture — so every
search for a live use comes back empty and reads as a clean bill of health.

Went with them: the three-line comment above the accessor explaining how an era advance retroactively
upgrades every hut into a Stone House (a building that has not existed since E3), and a dangling
cross-reference in `popGrowthRate`'s comment to "the settler cadence above." Deleting a mechanic and
leaving the paragraph that explains it is how vestigial code grows back.

Six harness fixtures stopped passing an inert `housingPerHut: 1`, and the E3 tombstone block now
pins all three deaths the way it already pins `accrueGrowth()` and `housing()`. 611 -> 614 checks.

*Not vestigial, checked and left alone:* `arrivalLine` is the same vintage and looks identical from
a distance, but it is validator-required and genuinely live — printed when a hex grows.

---

## 2026-08-25 — An army eats in proportion to itself

**The flat column cap is gone after one day.** It was the wrong lever, caught in play: *"I had 4 of
each type, but I can only send 4 total."* A headcount ceiling makes units you have already paid
population for unusable, and it flattens the mixed-column decision the whole counter system exists
to create — with four slots you send four of whatever counters them and leave the rest at home
forever.

It was also redundant three times over, which I should have checked before adding it. `levyCap()`
already sizes your army by TERRITORY (`owned x armyPerHex`), so a Bronze dominion of 12 hexes fields
24 where an Iron one of 20 fields 40. The walls are thinner while a column is away, so keeping
fighters home already costs something. What was actually missing was a **price for bringing
everyone**.

**Provisions now scale per fighter, per tile** (owner's suggestion): `campaignFoodBase` for the
column plus `campaignFoodPerUnit` each, with the route multiplying both halves. It replaced a flat
30 that cost the same for one soldier as for twenty — which is precisely why an arbitrary cap was
needed to make a big army feel big. Four fighters next door cost 38 food; twelve a few tiles out
cost 141, about forty percent of a Bronze larder.

**And the era scaling now falls out of systems that already existed, with nobody picking a number.**
A full Bronze levy marched across the map wants 445 food — more than the age can physically store,
since Bronze caps food at 350 and Iron retires storage caps altogether. War party at Bronze, legions
at Iron, emergent from territory, distance and granaries rather than declared.

The modal's provisions line is live now, moving as you muster, and turns red when the larder is
short. A static cost printed above the steppers was part of why the cap seemed necessary at all. The
tile panel advertises the per-fighter rate before you open anything, so distance is legible early:
*"14 tiles off, 14 food per fighter."* The Chronicle's wording follows the column that actually left
rather than an era fact — five or fewer is a war party in any age.

Five new checks (610), replacing the ones that pinned the cap. Two more stopped restating
`campaignFoodCost` and now compute the expected figure from the plan.

---

## 2026-08-25 — The Forge was a straw in a firehose

**Reported from a 27-minute Bronze playthrough: six Forges running, copper and tin both CAPPED and
still climbing, and bronze trickling in at 0.30/s.** The seventh Forge wanted 513 wood and 342
stone. The owner's read — *"3-4 feel like a hard requirement to get anything done"* — was
generous. One Forge took **65 minutes** to fund a Bronze Age.

The arithmetic underneath: a Forge drew 0.2 copper/s while a single worked hills hex yields **5/s**.
Four percent. It would have taken **twenty-five Forges to consume one hex**, so the input was
effectively free and the converter was the entire economy — and the only way to play was to stack
copies of a building whose cost compounded at 1.5x. Meanwhile the ore you were paying real
opportunity cost to mine (hills are also your only stone, at the lowest population cap in the game)
overflowed and was thrown away.

Rate goes **0.05 to 0.20**, sized so the ore economy binds instead: three Forges now draw about what
a worked hills hex yields, which turns "how many should I build" into a question about how much hill
country you hold. Scale goes **1.5 to 1.25** — a converter is capped by its inputs, so the supply
already says when to stop and a punitive curve on top of it was friction doing no work.

**A new check found the same disease further along in Iron, unprompted.** Iron's Forge drew 0.15
iron/s against a hills hex yielding 9/s: **sixty copies to consume one hex**, and 23 minutes of
smelting for the era's two steel upgrades. The rate is an absolute number that never scaled with the
eras feeding it, while Iron's population caps are nearly double Bronze's. Iron goes to 0.40, sized
differently on purpose: steel there is a GATE, not a currency (the whole era asks for 70 of it,
against Bronze's 195), so one Forge should simply cover it and nobody should want six.

The check is deliberately a loose ABSURDITY floor, not a balance assertion: it does not care whether
the answer is three copies or eight, only that an era's economy has not quietly become about
stacking one building. Nothing had been watching this, which is how a converter drifted 25x and then
60x past sense without a single test going red.

Eight checks that hard-coded the old rates now read them from the manifest. A check that restates a
balance number is a second place for that number to be wrong — retuning meant editing five checks
and getting all five right.

Two new checks (607).

---

## 2026-08-25 — The build queue says what is actually happening

**A card in second place counted down while its progress bar sat at 0%.** Reported from play: it
*"shave[d] off like 7 or 8 seconds while sitting in position 2"*, then took the front slot and kept
going from the reduced number.

Nothing was building early. `step()` decrements `buildQueue[0]` and nothing else, so the queued
item's own work was untouched the whole time — the panel was printing *time until this finishes*,
which includes waiting for the item ahead, and that total genuinely shrinks as the front item
progresses. The number was honest. Paired with an empty progress bar it still told a lie, because
the only reading available was "this is being worked on".

A queued card now separates the two: `starts in ~16s · ~25s to raise`. The second half does not
move while it waits, which is precisely the reassurance the old card failed to give. The active
card is unchanged at `~24s left`.

The arithmetic moved out of the renderer into `queueTiming()` in `core/derived.js`. A rule living
inline in a DOM loop is a rule with no check, which is why this went unnoticed since the queue was
built. Nine new checks (605), the sharpest being the bug as a property: **work on the front item
must never shorten the build behind it.**

---

## 2026-08-24 — Sight leaves ground you stand on

**Sight rays were casting from every CHARTED hex rather than every OWNED one,** and charted includes
the whole ring of neighbours around everything you hold. So a fresh three-hex game looked out to sea
from roughly twelve vantage points, most of them shorelines nobody had ever walked to — and it
compounded with every claim, because each new hex charted a fresh ring it did not own. The owner
caught it in play: *"my starting revealed slices keep getting bigger and bigger."*

Measured before: **34 hexes visible from a 3-hex dominion**, land showing FIVE steps from the
nearest owned tile (a charted hex one step out, three of open water, then the far shore). After:
**23 visible, four at worst**, which is exactly what `SIGHT_RANGE` describes.

**The existing range check passed throughout, because it made the same mistake the code did** —
it walked water back to any *charted* land, so the extra step was invisible to it. A check that
shares its subject's blind spot is worse than no check, because it reads as coverage. The new one
measures plain hex distance from ground you actually hold; reintroducing the fault turns it red
(worst 5 of 4), which is how I know it works.

One new check (596).

---

## 2026-08-24 — Bronze musters a war party, not a column

**What an age can send is now an era fact.** `muster: { building, column }` names the building a
column gathers at and how many fighters it carries. Bronze gathers at a **War Camp** and marches
**four**; Iron gathers at a Muster Ground and has no ceiling. That single number is the whole of
how the age's outward verb scales — *"it won't be legions or platoons, but a few soldiers"*.

**Reach needed no rule at all.** `marchFactor` already multiplies provisions and march time by the
route, so four people can cross a valley and could never cross a country. The far people stay hard
because they are far, which is the same mechanism that already keeps distance honest everywhere
else on this map.

**It also closed a hole opened two commits ago.** Giving Bronze `contact: "open"` was a promise the
era could not keep: the only mustering building in the game was Iron's Muster Ground, so at Bronze
the March button appeared and sat permanently disabled behind a building three eras of content
away. That is the same incoherence the ruling was meant to fix, merely relocated. Refusals now name
the building that exists in the age you are standing in.

The cap is enforced in `launchCampaign`, not only in the modal — the stepper stopping at four is a
courtesy, the sim refusing a party of ten is the rule, and a stale UI or an edited save both route
through the rule. The Chronicle follows the fact too: an age that musters four announces *a war
party*, never *a column*.

The War Camp retires at Iron. It was priced in bronze, and a ring of hide tents does not stage a
legion.

Thirteen new checks (595), including an end-to-end Bronze march: ten refused, four accepted, and
the column that actually left carrying exactly the party mustered.

---

## 2026-08-24 — Larders that grow and refill, and grudges that do not

**An adversary's stock is a drainable larder, and a fixed one was quietly broken by an asymmetry:**
your economy compounds while theirs is frozen, so a neighbour is looted dry once and is thereafter
a nuisance with nothing left to offer. Stock now **grows with each age and refills at every era
flip**, as long as its owner is alive — a fake economy that behaves like a real one, with no engine
to run and nothing to tune but numbers on a page.

Depletion persists WITHIN an age: plunder a larder and it stays plundered, breach a wall and it
stays breached. Across an age it does not, because an age is centuries — you burned their granary,
and then eighty years passed and their grandchildren rebuilt it. **Standing is the exception, and
deliberately so: grudges outlive granaries.** A people you wronged in the Bronze Age still
remembers it at Iron, however full their storehouses are.

**This also repaired a real regression from yesterday's roster move.** `initAdversaries` only
seeded state when it was absent, which was correct while adversaries first appeared at Iron and
wrong the moment they first appeared at Stone. Every Iron major was standing unwalled behind a
stone-age larder — the River Kingdom holding 45 food and 25 wood instead of 250 food, 25 steel and
240 gold, with walls of 0 instead of 26. No gold existed anywhere in the world, so every caravan
read "traded dry" the instant it launched and the entire Iron trade economy was inert. It surfaced
from an owner question about whether per-resource stocks were needed at all, not from a check.

Nine new checks (582). The one that matters most asserts the half that would fail silently: that a
plundered larder stays plundered *within* an age. Drop the era stamp and the state re-seeds on
every `ensureMap`, so a raid would undo itself on the next frame with nothing to report it.

---

## 2026-08-24 — The world is inhabited from the first minute

**Generation answers where and who; era answers what they are now.** Every people on the board is
placed once, at world generation, and exists in every age. Three majors on the ground their own
descriptions name, plus the minor tier by density — all of them there from the opening frame. What
an era changes is the dressing: the camp at Coldwater becomes the steading at Coldwater becomes the
freehold at Coldwater, understood to be the same people throughout.

This closes the last contradiction in the fog design. Adversaries used to arrive at Iron, which
meant the world you spend most of a run looking at was uninhabited, and that a hex you scouted
empty could sprout a village the moment the age turned. It also turns out the manifest model
already had the mechanism: adversary slates are wholesale and never inherited, so redressing a
people per age is native rather than new.

**Enemies that survive evolve alongside you, and they scale to the ERA, never to the player.** The
distinction is the whole thing — era is a shared world clock, so rushing ahead genuinely puts you
ahead for a while, where scaling to the player gives you the Oblivion problem and advancement stops
feeling like anything. Two consequences fall out with no rules of their own: the far people are not
statted stronger (you simply meet them later, when everyone is stronger, and `marchFactor` already
governs reach), and a run thins as it goes, because the ones you take are gone for good.

**Contact is the new era-fact.** Stone is `none` — not a rule against war, but the absence of
anyone who could declare one. There are no kings in the Stone Age. So the camps are visible,
scoutable, unsettleable, and the tile says why you cannot go rather than greying out a button and
going quiet. Bronze opens it, because an age that hands you bronze spears and hide armour cannot
coherently forbid you from carrying them anywhere; what scales is the size of the thing you send.

Stone still has danger and always did — all three raid types roll, the `conflict` event fires.
That danger is simply anonymous. Bronze is where it gets a name and an address.

**Three things the validator now catches at load,** all of which fail silently otherwise. The seat
list, the minor density, and the name pool's LENGTH must match across eras, because placement is a
per-hex hash over that pool — drift any one of them and every neighbour relocates in every existing
world with nothing to report it. And a major's strength must fall above its era's minor band, or
the two tier words describe nothing.

**Two real problems surfaced while building.** The validator caught that Bronze adversaries were
stocking and paying gold, which does not exist until Iron — caravan payment is gold-denominated at
its root, so trade is inherently an Iron system and Bronze neighbours are people you fight, not
people you barter with. And a harness fixture was calling `ensureMap` without `initAdversaries`,
which seats people on the board without creating their state; such a tile renders as bare terrain,
the board quietly disowning someone standing on it. `boot()` has always called both in order.

The minor name pool was rebuilt as bare LANDSCAPE names with the era supplying the settlement noun.
The old pool baked nouns in, and "the Broken Tower" cannot be redressed backwards into an age with
no masonry, while a cold stretch of water and a barrow on a hill are there in every age.

Ten new checks (573), including one that pins the Stone tile offering no march at all — not a
disabled one, which would read as a thing you could unlock rather than a thing that cannot exist.

---

## 2026-08-24 — A house means a home, and Reveal can finally answer the question

**Rivals wear a red house now, the same glyph your own seat wears.** The owner asked for it
directly, and it is the better reading: your seat and a rival's are the same kind of thing, a place
people live from, so the board should say "someone lives here" before it says "who". The diamond
made an adversary read as an abstraction — a game-piece marker rather than somebody's home — and
made rival settlements hard to pick out when scanning for who else is on the map. White is yours,
red is not; size grades the two kinds of stranger, a power's hall matching your own seat and a
minor steading sitting below it.

**But the actual reason Reveal looked broken was that there was nothing to reveal.** Adversaries
only exist at Iron: Stone and Bronze declare no seats and no minor tier, so a Stone test run has an
empty board however hard the lens is pressed. The mark code was already correct and always had
been. `?era=iron` fixes the real problem — it jumps the run's era before the world is built, so a
seed can be read in one glance instead of two eras of play. It is a lens on GENERATION, not a
legitimate advance: it sets the era and nothing else, which the console says out loud.

**A crash surfaced on the way, and it had been live for the whole engine rework.** The population
row's tooltip still referenced `conquest`, `full` and `idleNow` — three variables from the housing
economy that the rework deleted — so it threw a ReferenceError on every hover, into a DOM event
handler where it was swallowed as an uncaught error and the tooltip simply never appeared. It has
been rewritten to the law that actually runs (people live on the ground they work, terrain sets the
ceiling, expansion raises it) and now reports the headroom that tells you when to expand.

That bug is a CLASS, not an incident: tooltip content is computed lazily at hover time, so a stale
reference is invisible to every other check in the harness and to the page itself until a human
puts a mouse on it. The harness now sweeps **every** attached tooltip getter after a render and
calls it, which was verified by reintroducing the fault and watching it fail. Two mark checks were
also rewritten to pin the shared glyph rather than the old diamond — the half a refactor would
silently break, since colour lives in CSS and cannot be asserted from here.

Four new checks (563).

---

## 2026-08-24 — Slice 4c: neighbours by density, seated on their own ground

**The minor tier scales with the world.** Every eligible hex now rolls for a steading (density
0.06) instead of the world getting a fixed five however big it is — 3 to 13 per world, averaging
about seven, never bordering one another, never outrunning the hand-authored name pool. The roll is
a per-hex hash rather than a draw from a stream, so inserting a future generation stage cannot
change *who exists*. Identity stays authored, placement stays procedural: the adversary law,
unchanged, now applied at the right scale.

**And adversaries are seated on the ground their own descriptions name** — the owner's catch, and a
genuine contradiction: every one of the three says where it lives. "Raiders in the high passes."
"A state downriver… on the bluffs." "They circle their wagons into a laager." Placement was
terrain-blind, so the Hill Clans could be seated in a forest. `homeTerrain` is a preference, not a
demand — it relaxes to any land rather than leaving a people homeless — and it now lands 90 seats
out of 90.

**Two real bugs surfaced on the way, both caught by measurement rather than reading.**

The first: `hash01` was badly biased. djb2's raw output concentrates in exactly the high bits that
dividing by 2³² reads, so a "6% chance" fired on *zero* hexes for one seed and *every* hex for the
next — a 0.000 hit rate over two thousand samples. A murmur3 finalizer fixes it (0.0556 measured,
deciles flat), and the fix reaches further than the minors: prop placement, tonal variation and
elevation jitter in the renderer had all been quietly drawing from a narrow band, because the
renderer carried its own copy of the same biased function. It now imports the good one.

The second: **`extendEra` shared the parent's map object by reference.** Since seat terrain is
folded onto the map spec, a silent delta — an era that redeclares no map — reached back and
overwrote its *parent's* seat terrain with its own empty one, and every adversary went back to
random placement. The harness reported it as 30 seats on their own ground out of 90, which is
precisely chance, and that number is what made it findable. Map specs are copied now, not shared;
inheritance by value reads identically and cannot do this.

Six new checks (559). One existing check was also rewritten rather than coerced: comparing two
different tiles' claim prices let their distances mask the 1.18× escalation, so it now prices the
same tile before and after.

---

## 2026-08-24 — Slice 4b: sight across water

**The islands started calling.** A ray now leaves every charted coastal hex, travels through water
only, up to three steps, and is stopped by the first land it touches. What it reaches is *sighted*:
drawn with its true terrain — if you can genuinely see it, showing anything else would be a lie —
and carrying no props, no marks, no hover and no selection. **Sight reveals the board, never the
pieces**, which is the charted honesty rule turned inside out, and it is also just true: you cannot
make out dwellings at that distance. Charted against sighted reads as inhabited against silhouette.

Three predicates where there were two: `isCharted` (props, marks, interaction), `isSighted`, and
`isVisible` (drawn at all). Sight is sticky like charting, and the Chronicle marks the moment —
*"From the shore, your people make out land across the water."*

Verified live, and it fires on its own: a starting trio on The Scatter sights five hexes of sea and
thirteen hexes of far land within seconds of the first frame, with the Chronicle announcing it
unprompted. Coastlines are now worth reaching for the vision alone, exactly as the design wanted.

Eight new checks (554), including that nothing is ever sighted beyond the range the rule allows and
that **sight never charts and never claims**. Two of them started life as bad assertions and were
rewritten rather than coerced: the raw sighted set legitimately contains charted coast (it is
sticky — ground seen across a bay does not un-see itself when you settle it), and a small island
ringed by charted coastline genuinely *is* visible in full, because rays reach it from several
angles at once. The honest invariant is not that an island keeps its size secret; it is that
seeing is never knowing.

Also fixed in passing, from a playtest screenshot: *"The plains at the frontier lies empty"* — a
grammar accident waiting on every plural-looking terrain. Famine now names the era's tile noun
instead: *"The furthest clearing lies empty. The ground is still yours."*

---

## 2026-08-24 — Slice 4a: the continents are authored

**The board is a country now.** `src/map/continents.js` holds a small pool of hand-authored
continents as ASCII art — `#` for land, `~` for ocean, odd-r offset rows — so the shape is legible
to whoever edits it next: **Broadwater** (155 workable land, a deep bay, islands off the eastern
shore), **The Long Reach** (137, narrow and diagonal, strung with islands), **The Scatter** (141,
a 110-hex mainland inside a four-island archipelago). The frame decides where land ends; the dice
still decide what land is — terrain blobs, lakes, the seat, and who lives nearby.

Ocean is a real place: unsettleable, crossable by routes at a price, and the medium sight rays will
travel in slice 4b. Interior lakes stay rolled, but are now kept **ashore on the mainland** — a
lake on a two-hex islet is nonsense, and worse, it could erase an islet and silently break an
island chain. The seat is chosen *after* terrain (so its ground is honest rather than forced), on
the mainland, on food-bearing ground; the frame is then translated so `home` remains `"0,0"` and
every system that already assumed it keeps working. `radius` retires as an era-fact.

**The island law is enforced by the harness, and it earned its keep three times over.** The rule:
every island must be within sight range of *some* other land — the mainland, or another island
already in the chain. Chain-connectivity rather than mainland-adjacency, because the first version
proved an archipelago cannot exist under the stricter rule: scattered islands are by definition far
from the mainland and near each other. The check then caught a sight ray that died one step early
(land beside the last water cell was never seen), and a start that could maroon itself on a two-hex
islet — which made the actual continent report as an eighty-hex unreachable orphan.

Twenty new checks (545), including the law run across seventy-five continent-seeds, that every
continent is a real country of 120–160 workable hexes, and that a bare seed number still draws its
own continent — so one number reproduces a whole world.

---

## 2026-08-24 — The dominion cap: what one age can hold

**The settlementmaxx door is closed.** Each era now declares its scope — `dominionCap`: stone 7,
bronze 12, iron 20 — and the expansion verbs answer to it: the settle button refuses at scope with
the reason worded ("Your people hold all 7 lands this age can govern. A new age must dawn."),
subduing a minor refuses to march when victory would win ground the age cannot govern, queued
parties count against the scope so the queue is not a loophole, and prices stay printed at the cap
because a refusal should never hide the arithmetic. The era ceremony announces the scope rising;
the People panel counts your holds.

The ruling's history is worth the record: the owner proposed a cap, Claude rejected it as housing
back from the dead, the owner re-argued it with playtest data — twenty hexes in ten minutes, ten
per second of income, a settlement built to the bare minimum — and the re-argument won on the
economics Claude had himself proven: claims buy production, so compounding production outruns any
cost curve, and tuning expansion prices forever would couple into the whole economy. The original
objection was right about caps-as-housing and wrong about caps-as-era-scope, which is the tile
ladder enforced: a stone chief holds seven clearings, and holding more is what an era advance
means.

Two gifts found on arrival. Development becomes the mid-era game: once the land is held, buildings
stop losing the argument with hexes and become the thing to buy. And expansion becomes SELECTION:
with seven slots, which seven is the age's defining decision — a snake through the valley to the
far forest and a tight ring around the seat are different civilizations, and the shape is already
priced, because the stretched dominion is the one that starves first and burns first.

Escalating, era-signed claim costs stay unchanged as friction within the scope. Seven new checks
(530), including that the cap counts parties still on the road.

---

## 2026-08-24 — Engine rework E5+E6: the world strikes hexes, and the rework is COMPLETE

**Nobody dies nowhere any more.** `strikeHex(kind)` picks the victim: sickness person-weighted, so
your dense river valley hosts more outbreaks than a hill camp, taking a fifth of the struck hex
(min one) and naming the terrain in the Chronicle; raids exposure-weighted by population ×
administrative distance, so the frontier burns first, taking 1 + raidSize/8 souls where they land.
`removeSettler` — the function that killed "someone, somewhere" — is deleted, and the old
sickness-floors-at-one asymmetry survives in per-hex form: a fever can never wipe a run in a blow;
an overrun still can.

**The levy is gone, and the muster is the land.** Army cap = held hexes × 2, in every era — the
owner's "make it serve the hex," served. Every recruit costs a real person, drawn from the SEAT on
completion (the capital musters; the largest holding stands in if the seat is empty — no source
micromanagement). Armies eat in every era: the Bronze free-lunch window quirk is closed. Deleted
with the levy: `applyConsolidation` (dead since E2), `levyMigrated` and its load-time back-compat,
the border bread-default (nothing "arrives" at a border any more — every hex was claimed or
captured), and the `growth` era-fact (growth has been local since E3).

**Iron re-pricing is deliberately deferred** to the balance pass: the owner tunes against play,
not against guesses made at midnight.

**E6 closed itself**, exactly as the plan predicted: each slice rewrote its checks as it landed, so
the closing pass found nothing left. The suite re-baselined at 520 — stepper fixtures now hex
fixtures, tombstone blocks pinning every dead export, ten consecutive green runs.

The engine rework is complete: six slices in two days, from "the game teaches an economy it
retires fifteen minutes in" to one economy that runs from the first minute to the last. The map
arc resumes at slice 4, with the board finally priceable.

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
