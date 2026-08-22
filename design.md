# Idle Civ — Design Document

> **Working title.** "Idle Civ" no longer describes the game (see *Time, Presence & Pause*).
> Renaming is deferred until the pivot below is implemented and playable — it is a live open
> question, not an oversight. See *Open Questions*.

**How to read this file.** Everything outside a *Historical note* is current canon. Historical
notes exist only where the reasoning behind a reversal is still load-bearing; they are not a
record of every decision ever taken. `tech.md` covers implementation, `map.md` covers the map
arc, `interface.md` covers the interface system, `todo.md` carries the phase plan and is the
authority on what is actually built.

---

## Premise

Take a civilization game — the Civ shape: an economy of resources, choices with real opportunity
cost, an outside world of rivals you fight, trade with, or absorb — and strip out everything that
requires graphical fidelity of *units*. No rendered armies. No pathing, no animation, no unit
micro. What's left is the part of the genre that was always a numbers game: allocate, invest,
decide whom to act against, live with the result.

A simulation runs continuously underneath, so the world moves and resolves on its own schedule
rather than waiting turn-by-turn for permission. You can pause it, speed it up, and walk away from
it. What you cannot do is miss anything.

The pitch in one line: **you start by foraging for food, and by the end you're deciding the fate of
star systems — and the interface never stops looking like paperwork.**

## Touchstones

- **Civilization** — the real target: choices, resource allocation, opportunity cost, an outside
  world of counterparties. Borrowed wholesale as the *decision* model.
- **Crusader Kings** — the time model: a real-time clock you pause and accelerate, an engine
  simulating other actors, and decisions that arrive as events and wait for you. Also the
  acquire/subdue/ally loop, which is where this game's growth now lives.
- **A Dark Room** — start with almost nothing. Complexity is *earned*, never dumped up front. Note
  what we take and what we don't: A Dark Room grows the interface itself; we show the board whole
  and grow what's *in* it.
- **Age of Empires** — the *economic* shape only (assign workers, gather, feed, build up), and only
  in the early ages. Explicitly not the unit control.
- **Melvor Idle** — proof that a beloved graphical game can be rebuilt as numbers-and-menus and
  still be genuinely engaging. Cited for austerity, not for idling.

**Historical note.** This project began as "idle Age of Empires" and drifted, through play, to
something much closer to lo-fi Civilization. Two diagnostics moved it, both worth keeping: *the fun
concentrates where the verbs are* (expeditions were by far the most engaging thing in the Iron Age,
because they were the only outward-facing action), and *flavor friction is a gameplay smell* ("my
longhouse holds 3 holdfasts" was the fiction correctly reporting that the mechanics beneath it
hadn't re-denominated). Both pushed the same direction: toward decisions, away from accumulation.

---

## Time, Presence & Pause

*(Settled 2026-08-22. This section replaces the game's former identity as an idle game and is the
premise every other system now rests on.)*

**The contract, in one line: the game never punishes you for leaving.**

Not *the game never needs you* — that was the old contract, and it banned every interesting
decision, because a decision the player might not be present for is a decision the game "needs"
them for. The new contract bans only **loss**: nothing expires, nothing decays, nothing is missed,
no reward is forfeited by being away. Within that, the game is meant to be watched.

**The rules that implement it:**

1. **The clock runs while you're looking at it.** The simulation advances only while the page is
   visible; hiding the tab pauses it. There is no offline progress, no catch-up, and no background
   running. Come back and the world is exactly where you left it.
2. **Pause and fast-forward are player controls**, not developer affordances. Pause is how you
   think; speed is how you get on with it. They sit in the header as first-class chrome.
3. **Modals that ask something pause the game. Modals that tell you something don't.** Campaign
   muster, caravan escort, decision events, destructive confirms — all pause. Reference material
   does not. The default is to pause, because that failure mode is harmless. *(Extended when
   built, 2026-08-22: the **ceremony register pauses too** — era transition, game over. Stillness
   is part of the weight; reading the age's obituary should not cost world-time. Info remains the
   one telling modal.)*
4. **Decisions may wait; nothing expires.** A choice presented by the world sits patiently until
   you get to it. No countdowns, no claim buttons, no "act now." *Resolution never creates a window
   the player must catch* remains canonical — that rule was always about expiry, never about
   waiting.
5. **Save is load-bearing.** Because the world stops when you do, stopping and resuming *exactly*
   is a correctness requirement rather than a convenience. Any state a player can be part-way
   through — a queued build, a column in the field, an undecided event — survives a close and
   reopen.
6. **Everything is paced to a sitting.** No single action outlasts a session. The longest builds are
   measured in minutes at 1×, with fast-forward as the escape valve.

**Idle is demoted to what it was always actually good for: delegation.** The engine runs what you
have chosen not to run by hand. Early on you do almost everything yourself, because the settlement
is small and the tactility is the point. Later you set doctrine and the simulation executes it.
That is the *good* reading of an idle layer, and it scales — a ruler of twelve holdfasts assigns
foragers; a ruler of a galaxy does not.

**The engagement curve, corrected: the altitude of decisions rises; the density never falls.** The
late game asks bigger questions, not fewer ones. Delegation is what makes room for that.

**Historical note, worth keeping because the error was subtle.** The old pillar read *"Active early,
idle late"* and promised that late-game actions would take hours — a Stone Age soldier in ten
seconds, a starship in six hours. It confused *how long one action takes* with *how often you get to
decide something*. Those are separable, and the good version of the curve raises the second while
leaving the first alone. The old pillar forced a second, larger mistake: because every system had to
self-resolve for an absent player, the entire class of "weigh something interesting" was out of
scope. That was the Civ-shaped hole.

The evidence that killed it was our own telemetry. After a 34-hour run, every resource sat pegged at
its cap except gold — and gold was the only one still moving, because it is fed by expeditions, the
active verb. Offline progress delivered exactly one thing: filling caps that ten minutes of watching
would have filled anyway.

**What survives from the idle era, unchanged in force:**

- **A living world.** The settlement is surrounded by other actors, and simulating them is what makes
  this a world rather than a spreadsheet. Their actions carry real consequences either way.
- **Decisions happen on the player's schedule; consequences happen on the world's.** You act on the
  world whenever you choose. Once you act, resolution is the world's business — it self-applies and
  lands in the Chronicle.
- **Progressive enhancement**, in its useful half: a moment worth ceremony gets a modal, and any
  choice presented must ship with a designed default so it rolls off gracefully if the player
  fast-forwards past it or simply doesn't care. The old "modal live, Chronicle when absent" branch
  is gone along with the absent player.
- **Observational narration is always legal.** Text reporting a true game state ("violence breaks out
  in a bread line" when standing is genuinely low) is the Chronicle doing its job, whether or not
  that state has yet grown a mechanical tooth. The ban is narrower than once stated: it forbids text
  implying *consequences that don't exist*, never flavor that reads honestly from state.
- **The size of the consequence sets the size of the story.** A fever taking a holdfast and a plague
  taking a planet are both −1 economic unit to the engine; the Chronicle and the modal are where the
  difference lives.

---

## Design Philosophy

**Unravel the contents, not the board.** The board is **whole from the first frame**: every panel the
current era can fill is on screen, named by its header, empty and waiting. What unravels is what goes
*inside* them — resource rows, building options, upgrades, trainable units appear only once they're
relevant, and once shown they stay. Era transitions are the one sanctioned moment for panels
themselves to arrive or retire.

*Historical note:* this previously hid whole panels until earned. That rule was calibrated for a
pen-on-paper wireframe in which an empty panel and a full one were the same hairline box, so showing
them all read as clutter. Bureau's ink header plates and per-column paper stock removed the premise —
an empty panel now reads as a *blank form*, which suits a game about administration — and against
defined content areas a slow reveal reads as broken rather than as discovery.

**Friction is the game.** A game with escalating production and no counter-pressure gets solved in
minutes. Food upkeep that can starve you, storage caps that make surplus rot, construction costs that
escalate per building, a queue that serializes progress — none of these exist to punish. They exist so
growth has to be *managed* rather than merely accumulated.

**Opportunity cost is the point.** Civ's soul is that you cannot have everything. Most purchases in
this game are still "buy it eventually," and that is the single largest remaining gap between what it
is and what it wants to be. Mutually exclusive choices — laws, doctrines, paths — are the mechanism,
and they are cheap in the engine and expensive in design, which is the right trade.

**The Chronicle tells the story for free.** Every meaningful event produces a line. The log isn't a
debug console, it's the settlement's memory. It is no longer the *only* surface that reports the
world — a map will do that better — but it remains the record of what *happened*, as distinct from
what *is*.

**Restraint and legibility.** The founding identity test is that the whole game *could* be drawn in
black pen on ruled paper: boxes, rules, text, small glyphs. What survives of that as law: restraint
(nothing decorative that carries no information), legibility, and **color reserved entirely for
meaning** — green is genuinely new good information, red is danger, amber is a rare milestone. Color
is never ambience. Everything more specific — the palette, the paper textures, the line-art doodles —
is presentation, and presentation is open (see `interface.md`).

**Small numbers, slow start.** Displayed counts stay in roughly the 3–50 range forever; scale is
carried by re-denominating what a unit *means*. The opening minutes are deliberately unhurried.
Standing rule: **when unsure, tune toward too-hard and walk it back**, never the reverse.

**Panels filling up is part of the fun.** An empty panel you can read the name of is a standing
question the game has posed; answering it is the payoff. The screen filling out *is* the sense of
progress. *(Under review: if the map is promoted to the centre of the interface, this pillar's
mechanism changes even if its intent doesn't. See `map.md` and Open Questions.)*

**Every mechanic gets a designed retirement age — or an explicit reason it is permanent.**
*(Canonical 2026-08-22.)* The manifest architecture retires *things* — a building, a resource, a job
— effortlessly. Making it doctrine that it also retires *verbs* is what keeps twelve ages from
becoming a palimpsest. Housing retires at Iron. Storage caps are scheduled to retire somewhere around
the second-to-fourth age. Individual-person assignment retires at Iron, though the allocation *verb*
it served does not — see *Allocation — the permanent verb* for the distinction, which is the one this
rule most often gets wrong. Anything that cannot answer "when does this stop, and why" is a candidate for never having
been an age-spanning mechanic in the first place.

---

## The Core Loop

**Stone and Bronze:** forage → grow → hit the housing cap → build → grow again. Food is the survival
resource (upkeep scales with every mouth; running dry is death); housing gates population; wood and
stone gate buildings.

**Iron onward:** the loop turns outward. Housing and free growth retire. Population grows only by
**conquest or conversion** — you take a neighbour, or you win one over — and each unit gained is an
event rather than a tick. Economy and army support the outward verbs rather than being the game in
themselves. See *Conquest Growth & the Peace Path*.

---

## Systems

### Allocation — the permanent verb

**You assign production units to resources. That verb never retires; it re-denominates.**
*(Settled 2026-08-22, correcting a same-day ruling that called it a retirement.)*

What a production unit *is*, and what you click to allocate it, both change. The decision does not.

- **Stone and Bronze — people, allocated with steppers.** Settlers are assigned to gather jobs with a
  stepper: no pathing, no individual identity, just a headcount per job. Everyone eats, working or
  idle, which makes population a trade-off rather than a pure win. This is the one stretch of the
  game where a person and a place are genuinely different scales, and it is why individual assignment
  works here at all.
- **Iron onward — holdings, allocated on the map.** A tile *is* the production unit, so you click a
  hex and set what it gathers. Terrain constrains the menu rather than the outcome: a hills holding
  can be turned to iron or stone but not grain; a river holding can do grain or timber. Conquest
  therefore decides what you *can* produce, and allocation decides what you *are* producing —
  reversible, every-few-minutes, with the ledger responding immediately, exactly as steppers behave
  today.

**The stepper retires as a control at Iron; it does not retire as an idea.** Assigning a holding on a
hex is the same mechanic as assigning a settler in a form field — it is simply more legible, and it
puts the decision where the information already is. Steppers survive elsewhere for quantity
allocation that isn't spatial, principally mustering a column.

*Historical note.* This was briefly recorded as "worker assignment retires at Iron." That was the
wrong diagnosis, and it left a real hole: with production deriving from terrain alone there would be
no economic decision between conquests at all, which would drop decision density to zero and break the
pillar directly above it. What retires is **assigning individual people** — the noun and the widget,
not the verb. The precedent was already on the books: when the population ladder was settled, the
ruling was that the housing→growth verb *doesn't vanish, it re-denominates*. Same shape, same answer.

**Person-types survive as a roster** — each an icon-and-count tile: Settler (freely assignable, Stone
and Bronze) plus the trained military types, which persist through every era. The format scales to
more types without a redesign.

*The pulse is the thing to watch in playtest.* Steppers give you something to touch every thirty
seconds; hex allocation is a decision every few minutes, with expeditions and waiting decisions
filling the gaps. That is probably the right rhythm for the era, but the *density never falls* pillar
is the one most at risk here, and it is measurable.

### Resources & Storage

Resources accumulate from job assignment. Every resource has a storage cap; surplus past it is lost,
not stalled. That's literal rot for food and wood; for stone the justification is gameplay symmetry
over realism, stated openly. Caps are what make storage buildings necessary rather than optional.

*Retirement age:* storage caps are a friction mechanic for the early ages, scheduled to retire around
the Enlightenment, when "how much can you physically hold" stops being an interesting question. When
they go, the friction they were carrying has to be replaced, not merely dropped.

### Construction

Buildings are bought with an immediate cost, then sit in a **queue**; only the front item progresses.
Costs escalate per building type against owned *and queued* count, so stacking clicks doesn't
undercut the curve. An earlier version required assigning idle settlers as builders, AoE-style; it was
cut as too much micromanagement — the queue itself is the scarcity.

### Buildings

Families so far: **storage**, **production boosts**, **hazard defense**, and **capability gates**
(capped buildings like the Barracks and Muster Ground, which grant a permission rather than a stacking
bonus). More families are the obvious way this grows — later ages should introduce new building
*categories*, not just bigger numbers on the old ones.

One broad, cheap, early flat-percent gathering upgrade per era is a recurring pattern (Stone Tools →
Bronze Tools → Iron Tools), deliberately available almost immediately so it competes with your first
real building.

### Events & Decisions

The mechanism for anything that *happens to* the settlement. Every event has the same anatomy:

1. **Trigger** — a chance per unit time, or a deterministic condition.
2. **Effect** — what changes.
3. **Negate potential** — an optional counter building that reduces the odds the downside lands.
4. **Flavor** — Chronicle text, varied, split between "it happened" and "it was averted."

**Events may now present a decision.** *(New with the time pivot; the headline feature it unlocks.)*
An event may enqueue a choice rather than self-applying. The choice waits — no timer, no expiry — and
the game pauses when it is opened. Every choice ships with a designed default so it can be dismissed
or fast-forwarded past without breaking. This reverses the old "interactive events are out of scope"
rule; the ban was always really about events that *wait with a clock running*, and there is no clock
running now.

Currently live: **Sickness** (countered by the Infirmary; floored at one survivor by design),
**Conflict** (countered by a standing military; the one hazard allowed to end a run), **Great Hunt**
and **Trader** (ungated positive windfalls, proof the shape was never hazard-specific), and
**Scouting** discoveries.

An Infirmary's mitigation strength is itself upgradeable via **Herbal Medicine** — a genuinely
different lever than "own more of the building," and a pattern worth reusing.

**Event weights and conditions may read state.** Standing today, morale later. The windfall dice are
allowed a worldview.

#### Settled: population growth is not an event

Growth is a **background process**, not a surprise. Every other entry in the events system is
something that happens *to* you, where randomness is the point. Folding growth into a random table
would make population lumpy and force it to compete with hazards for the same probability budget —
making settlers common would necessarily make raids rarer. Keeping it out lets "how fast do we grow"
and "how dangerous is the world" stay independent dials.

*In Stone and Bronze*, settlers arrive free on a timer while housing has room. Food keeps its pressure
through upkeep, so the tension is a flow problem (can I sustain these people?) rather than a stock
problem. *From Iron*, growth is conquest or conversion only, and the principle survives in a different
form: gaining a unit is the result of an action you took, never a die roll you watched.

#### Settled: each era declares its own slate of events

Events are **owned by eras**, not tagged with them. An event that spans two eras appears in both
slates; an era that wants a clean break declares a different list. Per-event `eras: [...]` tags were
error-prone in a nasty way — forgetting to add a new era silently stopped an event firing forever,
with no error. This was the seed of the whole manifest architecture.

### Military & Defense

A soldier is a **commitment**, never a reassignable stat — a freely-toggled defense number is a
costless switch you'd flip up before trouble and down after, which defeats the point.

*Stone/Bronze:* training permanently consumes one idle civilian, reserved the moment the order is
queued. *Iron onward:* units are **levied, not consumed** — army capacity derives from population
(holdfasts × levy rate) rather than subtracting from it, because losing an entire holdfast to gain one
soldier is thematically wrong. The no-costless-toggle principle survives both models.

Equipment tiers are one-time **Upgrades**: a weapon tier raises the odds a fight is won, an armor tier
raises the odds your people survive one that goes badly. Two different jobs, deliberately separate.

**Conflict resolves in stages**, so it is never fully predictable and never fully safe: raid size rolls
first, then a success check weighing your defense against the raid as a *ratio* (never a threshold —
more investment always shifts the odds, no number is ever safe or doomed), then consequences banded by
outcome. Raid frequency scales continuously with settlement size.

**Units are never penalized for being the wrong type.** Every unit always contributes its full base
strength; the matching type simply receives a bonus on top. An all-archer army is never worse than not
having those bodies. A second, softer dial carries the rest of the tension: a poorly-matched army
raises the odds of a *costly* win without gutting the chance of winning at all.

**Who dies is a quieter axis of role.** Casualties are drawn weighted by exposure — foot soldiers take
the brunt, horsemen can withdraw, archers are hit least. It only ever bends the odds: no unit is
immune, and an all-archer army has no front line to hide behind, so mixing is what buys your
specialists their safety.

**This scales by flavor, not by new mechanics.** Barracks/Soldier/Spear/Armor and, many ages later,
Starport/Fleet/photon-weapons/shields are the same underlying system. If that stops being true for
some future age, that's a sign the age needs its own mechanic, not a forced fit.

### Failure

Two ways to lose. **Starvation** is a hard stop. **Conflict** is allowed to be lethal in the worst
case — unlike Sickness, which floors at one survivor by design. That asymmetry is what gives a
Barracks and a healthy population genuine stakes rather than another number to grow.

---

## Eras

Era progression is what carries the game from "feed the fire" to "decide the fate of star systems":
new resources, new buildings, new events, new *vocabulary*. **The simulation never changes register** —
no unit is ever drawn, no matter how far the tech tree goes; it is numbers, labels, prose, and (in
time) a map of places.

**The transition mechanism is settled:** advancing is a hidden, one-time capstone Upgrade that reveals
once its prerequisites are quietly met and otherwise behaves like any other Upgrade — same queue, real
cost, real time. Hazards keep rolling the entire time it's under construction; that's where "and some
luck" comes from.

**Three canonical rules for every future age:**

1. **Every age must add a few new things, at a bare minimum.** A capstone completing should be a
   "whoa, look at this" moment, not a quiet reskin.
2. **Ages come in two flavors.** **Deepening** ages introduce a genuinely new mechanic (Bronze's
   composition tiers, Iron's expeditions). **Widening** ages consolidate and reflavor onto a bigger
   stage — but still owe a few real new things. Neither is a restart; most of what you've built
   carries forward, reframed. **A widening age with no concrete reason to exist by the time it's
   scoped gets cut, not forced.**
3. **A capstone is priced in the signature currency of the age it ends.** The exit cost guarantees you
   engaged with the age's defining mechanic. Bronze's 300-of-each silently forced storage build-out;
   Iron's capstone costs bronze so the Forge had to run; the exit from Iron will cost **gold**, which
   cannot be mined — only traded for or taken — so no passive economy can substitute for having run
   expeditions.

**This game is meant to actually end.** Heat Death of the Universe is a real conclusion, one way or
another. Very few civ-style games let you play until the universe runs out, which is exactly why it's
the target.

### The Era Manifest Model

**Each era owns a manifest: the complete declaration of everything that can exist while it's active** —
resources, jobs, buildings with *that era's* stats and recipes, units, upgrades, events, adversaries,
panel titles. An era is authored as a *delta* against the previous one, which doubles as the era's
design document: Iron's delta literally reads "remove the bronze economy; add iron and gold; the Forge
now smelts steel."

The rules that make it safe:

- **Identity is permanent; flavor and function are per-era.** The same `hut` has been Hut and Stone
  House and Longhouse. One identity per thing, forever — that's what lets a save survive twelve ages.
- **Absence is removal.** If an era's manifest doesn't declare it, it isn't there. You can't *forget*
  to remove something; you'd have to forget to keep it, and that mistake is immediately visible.
- **Carrying is the default.** Anything declared in consecutive eras carries its counts silently. The
  most violent transition in the game should still be a short delta where every line is a design
  decision rather than plumbing.
- **Transitions can transform, with narration.** Migration instructions may melt bronze into gold or
  consolidate families into holdfasts — and every such instruction carries its own Chronicle line,
  because state silently rearranging itself is exactly the invisible-sink mistake this project already
  made once.
- **The era announcement can't lie.** The transition modal's "Now available" / "No longer needed" /
  "What changed" lists derive mechanically from the diff between manifests. Only the flavor lead is
  hand-written.
- **A validator makes broken eras loud.** An upgrade priced in a resource the era doesn't have, a job
  mining something that doesn't exist, a unit countering a raid type that isn't declared — all become
  named errors at load rather than features that silently do nothing. Given that this project's worst
  bugs have all been silent-wrongness bugs, this is the model's biggest payoff.

### Scale: The Tile Ladder

*(Merged 2026-08-22. This section previously described a population ladder and `map.md` a separate
tile ladder. They were the same ladder.)*

**The tile is the game's anchor noun.** One place on the map is the unit the whole era's vocabulary
hangs off, and every other scale question resolves against it. Displayed counts stay roughly 3–50
forever; the game reaches interstellar scale by scaling **what one tile means**, never the number.

| Age | A tile is a… | | Age | A tile is a… |
|---|---|---|---|---|
| Stone | Clearing | | Mechanized | Nation |
| Bronze | Clearing *(unchanged)* | | Global | Bloc |
| Iron | Holdfast | | Silicon | Bloc *(unchanged)* |
| Enlightenment | City | | Space | Settlement |
| Gunpowder | Colony | | Galactic | World |
| Industrial | Territory | | Kardashev | System |

**Historical note, because the merge is instructive.** These were two ladders — one for the
population unit, one (in `map.md`) for what a map tile represented — and they collided at Iron, where
both wanted the word *holdfast*. A defensive rule was written to protect it ("holdfast is reserved for
the population unit; fortification flavor must use other words"). A name you have to defend is a name
two concepts are fighting over, and the fight was unwinnable: from Iron onward **every rung of the
population ladder was already a place.** A holdfast, a city, a colony, a territory, a nation, a bloc,
a settlement, a world, a system — all of them are locations with people in them. The population ladder
had been a tile ladder in disguise for ten of its twelve rungs. Merging deleted a ladder rather than
adding one, and *holdfast* was not renamed but promoted.

**Population is a lever for two ages, then it is the tiles.**

- **Stone and Bronze:** a tile is a clearing and population is individual people inside it. Small,
  assignable, load-bearing — the tactile early game. This is the one stretch where a person and a
  place are genuinely different scales, which is exactly why worker assignment works here.
- **Iron onward: population *is* how many places you hold.** There is no second number. Conquest
  Growth already said this without noticing — "army capacity = holdfasts × levy rate", "each worth one
  sworn holdfast", "a designed population budget" are all tile counts. Production comes from the
  holdings you hold, allocated per hex (see *Allocation — the permanent verb*).

  This was not the map's idea. The decision to move production units from people to holdfasts predates
  the map entirely — it was how the small-numbers pillar survived scale, and it is why population
  retired as a separate quantity. **A hex is simply a holdfast made visible.** The map renders a model
  already chosen rather than introducing a new one, which is most of why it costs so little.

**Terrain is what keeps the economy a decision.** If production were merely `tiles × rate` the
allocation choice would vanish. It isn't: a tile yields according to its terrain, so *which* tiles you
take is the decision, and geography becomes opportunity cost. This is the most Civ-shaped mechanic in
the game and it is **explicitly permanent** — terrain yield *is* the economy from Iron on, so it has no
retirement age, and per the retirement rule that has to be said out loud rather than assumed.

**The odometer: one big number, purely flavor.**

A single running count of individual intelligent beings under your control — souls, subjects,
citizens, beings, re-denominated per era like everything else. It exists because every playable number
in this game stays between 3 and 50 and the interface never changes shape, which is precisely the
design's own stated risk of the late game feeling samey. One number reading 3,000,000,000,000 makes
scale *felt* in a way no small number can.

It is an **odometer, not a score** — the distinction that keeps it from turning the game into Cookie
Clicker, where the big number *is* the objective. Four rules enforce that:

1. **It never appears in a cost, cap, rate, requirement, or stepper.** The moment it gates anything it
   is a lever and the small-numbers pillar is broken.
2. **It is derived, never stored** — `souls = Σ tiles × soulsPerTile(era)`. It cannot drift from truth,
   it re-denominates automatically at every border, and it needs no save state.
3. **The jumps are the point, not the ticking.** Nothing, nothing, nothing, then +3 trillion because
   you annexed something. That lumpiness *proves* the design: a player who idles watches it sit
   perfectly still, because growth is an event you caused.
4. **Its noun ladder is its own** and cannot collide with the tile ladder, because one names a place
   and one names a mass of people — and only the tile ladder touches mechanics.

In Stone and Bronze the odometer and the lever are the same small number. At Iron the lever moves to
tiles and the same display keeps counting as flavor. **It never appears or disappears; it just stops
being load-bearing** — continuity of display, discontinuity of meaning, the same re-denomination
pattern the game runs everywhere else.

Two consequences, recorded so neither reads later as drift: this is **the one place the game needs
number compaction**, which `todo.md` otherwise defers on the grounds that numbers never get big enough
to need it — one formatter for one display, not the pillar being abandoned. And the per-era
`soulsPerTile` multipliers want **choosing deliberately once**: nobody will audit 3 trillion, but if a
holdfast is forty thousand people the ladder should read as roughly plausible rather than randomly
generous. Cheap now, annoying to retrofit.

**Border policy.** Stone→Bronze is a **1:1 relabel** — pure text, zero re-balance, protecting the
proven early pacing. **Consolidation begins at Bronze→Iron** and cuts **deep**: you should enter an era
with a *handful* of tiles held, each weighty enough that gaining or losing one is an event. The trick
that makes depth free: consolidation pairs with an **era output multiplier** so that `keep × output ≈
1` — total throughput unchanged, every existing cost stays valid, no re-tuning cascade. Narrated as a
standard migration, and a soft tithe on min-maxed stockpiling.

**The map regenerates when the tile noun changes.** That is the whole test, and it is why Bronze
inherits Stone's clearing unchanged (same valley, new tileset, no regeneration) while Bronze→Iron
rescales. Declared as an era-fact, exactly like `consolidate`. Rescale borders will usually coincide
with consolidation borders because they are the same event — the scope zooming out — but they stay
separate facts so they *can* diverge. See `map.md` §2 and §10.3.

**Notes:**

- **The noun changes when the scope genuinely changes, not on a schedule.** Silicon keeps Bloc: across
  Global + Silicon the story is blocs consolidating until you implicitly hold the whole planet. Bronze
  keeps Clearing for the same reason — the first transition deliberately consolidates nothing.
- **The Space border is deliberately non-monotonic.** A Bloc implies billions; a Settlement implies the
  few who leave. The lens narrows to the frontier. It is also where hexes retire for a node network.
- **Naming guardrail:** tile names avoid pointing at any specific real Earth entity. *Compact* is the
  parked fallback if *Bloc*'s Cold-War ring grates in play.
- **Bronze→Iron now carries seven simultaneous changes** — housing retires, free growth ends, units
  become levied, population becomes tiles, the map rescales, the job steppers give way to per-hex
  allocation, production moves to terrain. That is a genre change mid-game, and the failure mode is two games with a cliff
  between them. It is deliberately *not* spread across two borders, because the story here — you stop
  being a village headman and become a lord — deserves to be one moment. The mitigation is to
  **introduce the map an age before it becomes mechanical**: Bronze gets a map you can look at and do
  nothing on, so by the time it is load-bearing the player has been reading it for forty minutes.
  That is *unravel the contents, not the board* pointed at geography.

### Conquest Growth & the Peace Path

*(Settled 2026-08-21 — the Iron rework, and the spine of every era after.)*

1. **Deep consolidation, offset by output.** Enter Iron with single-digit holdfasts. Each is a couple
   dozen people under a lord; each one matters.
2. **Units are levied, not consumed.** `popCost` dies at Iron. Army capacity = holdfasts × levy rate:
   population stops *containing* the army and starts *supporting* it. Conquest therefore also grows
   your muster.
3. **Housing retires at Iron.** The first founding building retired — exactly the removal the manifest
   architecture was built for.
4. **Growth is conquest or conversion, only.** No automatic arrivals. Growth becomes an *active* verb,
   and stopping growth becomes a player choice (the housing cap's one good job, replaced by intent).
   Passive attraction is shelved for the Enlightenment — cities petitioning to join because morale runs
   high.
5. **Two adversary tiers.** Named majors remain strategic entities. Each era's slate adds a **minor
   tier** — freeholds and petty lords, numerous, individually weak, each worth one sworn holdfast plus
   a modest stock. The era's capturable units are therefore a **designed population budget**: growth is
   finite, authored, and paced per age. This scales forever — you conquer a holdfast before its lord
   swears fealty for the same reason you'll one day conquer a planet before it joins your empire.
6. **The peace path — religion's mechanism.** Priests (a trained unit) enable the **envoy**: a third
   action on an adversary that is slow, costs gifts and the expedition slot, risks no one, *raises*
   standing, and delivers the target intact. War is fast and pays plunder immediately, at the price of
   casualties, siege investment, and standing. **No dominant path:** the two pay in different
   currencies and pay out in different currencies — **plunder is one-shot; goodwill compounds** — with
   **per-target affinity** (disposition modulates envoy odds the way walls modulate assaults, hinted
   through flavor, so *reading the target is choosing the tool*) and **shared standing as the
   self-balancing tax** (heavy war poisons your envoys' welcome).
7. **Absorbed is generic.** Flavor spends its budget while an entity is *outside and hostile* — that's
   where distinguishing character lives. A sworn holdfast is +1 to the generic pool; the Chronicle
   keeps the name it had. Empire as machine; the Chronicle as memory.
8. **Stakes scale with narration.** Big losses stay possible but rare, and the size of the loss sets
   the size of the story.
9. **Standing starts now, grows teeth forever.** Standing is minimal this age by design; when trade
   becomes an explicit verb it turns fully load-bearing. Home morale later joins the same family.
10. **Military nouns re-denominate** like everything else.

*Open tunables (implementation-time, tune-toward-hard as always): the keep/output pair; levy rate;
minor-tier count and stats per era; envoy timer, cost, and odds; capture windfall sizing; what
wholesale annexation of a major is worth.*

### Adversaries & Expeditions

The game's first **outward-facing verbs**, and what makes Iron a genuinely deepening age. Born from a
real worry: with every existing verb pointing inward (allocate, build, upgrade, train), the player was
the *object* of the simulation's sentences and never the subject.

**Adversaries** are counterparties, and they exist only to the extent that they can be interacted with
— that's the whole specification. Each era declares its own **wholesale, never inherited**. Each holds
a **static resource stock** (a stock, not an economy — nothing grows, nothing moves on its own), a
**strength**, a **disposition** (peaceful or warlike), a **fighting style** naming the raid type it
fights as, and optional **walls**. Explicitly *not* simulated civilizations: no growth, no tech, no
evolving diplomacy.

**Flavor is load-bearing (canonical).** Adversary strength is *hinted through description*, never
through printed odds — "a fortified state, rich beyond counting" is how a player learns that raiding
the Kingdom early is a mistake, and playtest confirmed the read works. Raw numbers may appear (this is
a numbers game); the *judgment* — is this a fight I take? — belongs to prose and dice. The corollary
cuts harder: **descriptions are mechanics-bearing text.** An adversary whose flavor undersells or
oversells its strength is a bug of the same class as a wrong cost label, and no validator can catch it.
See `map.md` for how the adversary pool keeps this honest as the roster grows.

**Campaigns:** pick a target, allocate units with the same steppers jobs use (send some, keep some —
the split is the decision), pay a provision, and the column marches. Resolution is the raid math
pointed outward, as a ratio. Win and you carry home a large fraction of their remaining stock; they are
permanently poorer, because a stock is not an economy. **An army on campaign isn't home** — deployed
units don't defend and can't be hit, so the settlement is genuinely thinner until they return. Standing
falls whether you win or lose; plunder is not diplomacy.

**Caravans (directed trade):** each peaceful adversary buys something specific at a posted rate, in
fixed lots. The gold they pay comes **out of their stock**, so a partner can be traded dry — and the
goods you sell them **join their stock**, where a later campaign could take them back. Nothing enforces
or even mentions that grim little arbitrage; it's simply true, because stocks are real. Trade builds
standing; good standing improves prices; a partner raided too often stops trading with you entirely.

**Escorts.** A caravan carries guards only when the roads are actually dangerous. Escorts don't lower
the odds of an ambush — they decide how one *ends*. Escorted guards deploy like campaigners, thinning
home defense, so guarding your trade is a real allocation and not a checkbox.

**Standing** is one small number per adversary, moved by exactly two things (campaigns lower it,
caravans raise it), read out only as a word — Hostile, Wary, Neutral, Friendly. Consequences are few
and legible: a Hostile warlike neighbour raids you more often; a Hostile peaceful one refuses your
caravans; a Friendly partner pays a premium. That's the entire diplomacy system, on purpose.

**The Muster Ground** gates the system. One campaign *and* one caravan may be out at once — soldiers
and merchants are different people — but never two of a kind.

### Siege & Fortifications

Adversaries may carry **walls**. Combat sequences strictly: **the walls come down before a single
defender falls.**

- **The breach check** weighs the column's siege power against the wall strength remaining. Every unit
  contributes something; **Siege Engines** do outsized damage to walls and are otherwise ordinary
  units, in the field and at home.
- **A failed breach is a retreat with light losses** — no field battle, no loot, at most one fighter.
  Walls repel; they don't massacre. Standing falls anyway; you attacked them.
- **Wall damage persists.** Stock-not-economy extends to fortifications: scars stay carved for the era.
  A failed assault is still an *investment* — sieges against hard targets become sagas rather than
  rerolls, and the flavor distinguishes the wall that fell in one furious assault from the battered one
  that finally gave way.

**The adversary tier vocabulary (authoring rule).** Every era's slate is authored on a legible
three-step strength ladder — a weak thing, a middling thing, an oh-god-be-careful thing — with stock
and trade depth scaled to tier, so the flavor read is always trustworthy. Fortification nouns join the
signal per era (Iron: a wagon laager / a timber palisade / a stone-walled castle). The ladder is a
**floor, not a template**: disposition and trade interest must cross-cut the strength axis, so eras
never read as a stamped menu.

### The Age List *(flavor guide — not canon, expect it to move)*

A north star, not a backlog. Ages get built and played one at a time, each proven fun before the next
is scoped.

1. **Stone Age** — shipped
2. **Bronze Age** — shipped
3. **Iron Age** — shipped; *deepening*, mechanic = Adversaries & Expeditions; currently being reworked
   for Conquest Growth
4. **Enlightenment Age** — *widening*; cathedrals, science, and a **law system** (see below)
5. **Gunpowder Age** — revolutionary war to old west
6. **Industrial Age** — Victorian, steam, rail, factories; the proper home of steampunk flavor
7. **Mechanized Age** — tanks, bombers, mid-1900s total war
8. **Global Age** — *widening*; whole-world flavor
9. **Silicon Age** — computers and robotics
10. **Space Age** — same solar system
11. **Galactic Age** — starships, alien peoples
12. **Kardashev Age** — *widening*; Dyson spheres
13. **Heat Death of the Universe** — the game ends

### Bronze Age *(shipped)*

The first transition, and therefore the one that had to prove the concept. A **deepening** age that
deliberately **consolidates nothing** — the first transition's emotional job is to be pure reward.
"Your stuff got better" is a far better first impression than "your stuff got replaced."

**Reflavor-with-a-bump, never obsolete-and-rebuild.** When Hut becomes **Stone House**, it isn't a new
building next to an obsolete one — it's the same building, renamed, now worth more housing. Every hut
you own upgrades at once, so advancing produces an immediate visible jump. Your existing investment got
*elevated*, which is exactly the feeling an age transition should produce.

**The alloy.** Copper and tin mining; the **Forge** as a new building archetype that *transforms*
resources rather than producing them, with no workers assigned (the opportunity cost is already paid by
the miners feeding it, and there is no interesting decision in "would you like to stop converting?").
**Tin yields half what copper does** — a real balance lever and historically why bronze was precious
enough to build trade routes over. The numbers were chosen so a **clean equilibrium exists to be
discovered**: two copper miners and one tin miner produce ore in exactly the 4:1 ratio the recipe
consumes, and two Forges consume exactly that. Nothing enforces or hints at it; the tidy answer is
simply there for anyone who works it out, which is the kind of thing that makes an economy feel
designed rather than arbitrary.

**Military composition.** Raids gain a *type* — warband, massed charge (Archers excel), riders (Horsemen
excel) — so a specialist army swings hard between matchups while a mixed army has no spikes and no
holes.

### Iron Age *(shipped; being reworked)*

The first transition with **teeth**, and the fiction hands us the right ones. Historically bronze didn't
lose to iron because iron was better — the long-range copper-and-tin trade networks *collapsed*, and
iron won because it was **local**: duller, stubborner metal, but under every hillside. So the era's
story is: the world your bronze depended on breaks, and in its place a bigger, rougher, *named* world
appears. That's why the era that removes an economy is also the era that introduces Adversaries — the
outside world takes something from you and simultaneously becomes something you can act against.

**What's removed:** copper, tin, bronze; both ore jobs; the Ore Yard; and the upgrades stranded by the
collapse. Anything already *owned* keeps working — a bought upgrade is a permanent trait, and its
multiplier reads your state, not the shop shelf. What you lose is the ability to buy what you didn't.

**The migration narrates the collapse.** Copper and tin vanish. Bronze — suddenly antique — converts to
gold at 1:4: your stockpile sells off to collectors and temple-makers, which is historically resonant
(bronze retreated into ritual and prestige), seeds your first gold, and teaches the new resource in one
Chronicle line.

**The new economy.** Iron is plentiful — full rate, no tin-style scarcity; that was bronze's story, not
iron's. The **Forge persists, retargeted**: iron + wood → steel, which finally gives wood a real
late-game sink. **Gold is the era's genuinely new idea: it cannot be mined.** No job produces it. Gold
enters only from *outside* — the sell-off, plunder, and trade — so the era's new wealth is structurally
tied to its new verbs.

**Pacing intent.** Measured play: ~15 minutes to reach Bronze, ~40 to clear it. Iron should run
noticeably longer — its content is a *world*, not a tech list.

### Enlightenment Age *(undesigned — scoping notes only)*

Not scoped until the Iron rework has shipped and played. What's on the table:

- **Science.** No mechanic yet. The bar: something that says we are taking this seriously now. Worth
  deciding what it is *not* — probably not a research-tree clone of Upgrades, or it's just Upgrades II.
- **A law system.** You *train laws* through the build queue, deciding how to rule a much larger scope
  of people. This is where **mutually exclusive upgrades** enter the game: train either, but choosing
  one permanently forgoes the other. Still set-and-forget, but it simulates the active decision-making
  of Civ. Engine-cheap (an `excludes` field, a `build()` check, a validator rule), design-expensive
  (every pair is a real fork) — the right trade, and the most Civ-ward change available to this game.
  The "benevolent leader vs iron fist" sketch belongs here as the first mutually exclusive pair; it was
  diagnosed as *laws, not morale* (input vs output).
- **Morale**, if it exists, has hard requirements: **derived, never tended** (computed from durable
  choices, no bar to feed); **narrated, never metered**; **threshold-shaped** (a few discrete
  consequences, each an event the Chronicle can narrate, never continuous multipliers); **both-edged**
  (every state offers something; no death spirals). Laws and morale probably want to be one system
  viewed from two sides, or they'll compete.
- **Passive attraction growth** is shelved here — cities petitioning to join because morale runs high,
  as one of morale's both-edged consequences.
- **Religion diminishes here**, having arrived at full power in Iron, and eventually leaves the game
  entirely — the first content designed from birth with its whole lifespan in view.
- **Panel real estate.** Laws likely need a surface, and this may be the age that first invokes
  widening-age consolidation.

---

## The Map

Promoted from out-of-scope to a designed arc. Full treatment in **`map.md`**: the place-graph model,
pointy-top hex grids, procedural generation, the hand-authored adversary pool, art strategy, and the
eventual retirement of hexes for a node network at the Space border.

The one-line summary: the world becomes a grid of places you can hold, take, or win over, and your
dominion becomes something you can *see* spreading rather than something the Chronicle reports after
the fact.

The design that made this obvious was already written before the map was: Conquest Growth's minor tier
— numerous weak freeholds, each worth one sworn holdfast, as a designed population budget — *is* a
description of capturable tiles.

---

## Explicitly Out of Scope

- **Rendered units, animation, or pathing.** Never, in any age.
- **Real-time reflex or twitch mechanics.** This is a numbers game.
- **Unit micromanagement.** Assigning a headcount to a job is the floor and the ceiling. Not because we
  couldn't, but because it isn't the game.
- **Multiplayer.**
- **Mobile and tablet.** Widescreen desktop is the format, full stop. The stacked-column `@media`
  fallback stays as a courtesy so the page doesn't break on a phone; it is not a design surface.

*No longer out of scope:* a map (see `map.md`), and interactive events (see *Time, Presence & Pause*).

**Why the map rule fell, stated carefully, because the rule itself was right.** "No rendered map,
ever" read as a ban on maps and was actually a ban on **RTS spatial micro** — pathing, drawn units,
clicking soldiers around terrain, an art budget the project doesn't have. Every one of those is still
banned, and the four entries above are what that rule was really defending. A hex you click to say
*this holding mines iron*, or to march a column at a neighbour, has none of it: no unit is drawn, no
unit moves, nothing is pathed, and the art is a finite tile kit rather than an illustrated world. The
rule was aimed at the right danger and pointed at the wrong noun.

---

## Open Questions

1. **The name.** "Idle Civ" is wrong now. "Paper Civ" was floated and is complicated by (3) below.
   Deferred deliberately until the pivoted game is playable — deciding a name against an imagined game
   is how you get a name you have to change twice.
2. **When does the map take the centre of the interface?** *(The "whether" is settled: it does.)* The
   stated end-state is **map in the middle, controls on the edges of the screen**, with the Expeditions
   panel dissolving into the map rather than surviving beside it — a list of adversaries next to a map
   showing the same adversaries is the worse of the two. Only the *timing* is open, and it is gated on
   having a map good enough to deserve it. Until then Bureau's 4×2 grid stands and is not in question,
   and phase 8 must be buildable without answering this.
3. **Does Bureau survive the map?** Bureau is pure CSS with zero assets, which is part of why it shipped
   fast and reads cohesively. If commissioned art arrives, paper is either a placeholder aesthetic to be
   replaced or the identity the art should be commissioned *in the style of*. Those are very different
   briefs. Not answerable until (2) is.
4. **What replaces storage caps' friction when they retire?**
5. **What is the Enlightenment's science mechanic?** The emptiest slot in the age list.
6. **What are the `soulsPerTile` multipliers per era?** Tuning, not design — but do it deliberately in
   one pass rather than a rung at a time. See *Scale: The Tile Ladder*.

**Closed 2026-08-22, recorded so they aren't reopened by accident:**

- *When does worker assignment retire, and into what?* — **It doesn't.** The allocation verb is
  permanent and re-denominates: people-with-steppers in Stone and Bronze, holdings-on-hexes from Iron.
  What retires at Iron is assigning individual *people*, and the stepper as the control for it. See
  *Allocation — the permanent verb*. (Recorded briefly on the same day as a retirement; that was
  wrong, and the correction is kept because the hole it would have left — zero economic decision
  between conquests — is the kind a plausible-sounding ruling can open without anyone noticing.)
- *Does the map regenerate at an era border, or persist and extend?* — It regenerates **when the tile
  noun changes**, carrying your dominion forward as a pre-owned block sized from post-consolidation
  holdings and narrated as an ordinary migration. Neither pure option worked: persist-and-extend
  collides with consolidation (twelve holdfasts becoming three cities means the owned region must
  *shrink* exactly as the world grows), and regenerate-every-era evaporates an age of conquest at the
  border — the invisible-sink mistake this project already made once and wrote a rule against.
- *Do captured tiles have an ongoing economic identity?* — Yes, via terrain yield. This reverses
  `map.md` §10.6's lean toward purely generic, because once population *is* tiles, terrain is the only
  thing left making one tile worth more than another.
