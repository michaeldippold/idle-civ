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
star systems — a civilization board game, played on a living digital tabletop.**

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

### "If you are not paying attention, pause the game" *(owner ruling, 2026-08-25)*

Told that an unattended Bronze settlement had shrunk to its seat — two of three starting hexes lost
to raids while nobody was watching — the owner's answer was the whole pivot in one line:

> *"If you are not paying attention, pause the game. This is the polar opposite of what I would have
> said ages ago, but the game is a completely different beast now."*

**This is the new contract stated at its sharpest.** The old one was *the game never needs you*, which
banned every interesting decision. The new one is *the game never punishes you for leaving* — and
leaving means **pausing**, not walking away from a running clock. Nothing expires, nothing is missed,
and the world holds still the moment you stop looking; but a world you left RUNNING is a world you
chose to leave running.

That is why losing ground while inattentive is not a failure of the design — it is the design
working. Pause is not a convenience feature bolted onto an idle game. It is the thing that makes
consequences fair.

### What this game actually is *(owner ruling, 2026-08-25)*

> *"There's nothing idle left about the shape of the game I am proposing now. It's competitive 4X
> against very simple adversaries. That is why it sits cleanly between real time and turn based.
> It's a real time game you can pause or speed up."*

The ruling closes a question the project had been answering by drift. The honest lineage, in the
owner's words: *idle Age of Empires → Age-of-Empires-inspired → tabletop-inspired competitive 4X
where the only playstyle is against a few bots.* The repo is still named `idle-civ`; Open Question 1
(the name) already records that the name is wrong now, and this is one more reason.

**The framing that settles it** (from outside research the owner brought in): Civ's scarce resource
is *judgment* — the game waits, and none of the difficulty comes from being slow. AoE's scarce
resource is *execution* — a large fraction of skill is doing a known-correct plan fast enough. This
game is neither pole and is not a compromise between them: its scarce resource is **attention** —
*when* you look and what you spend the look on. The position moves without you, but pause and speed
controls mean every real-time moment is optional.

The same research names the debt a real-time civ game owes: *if time passes without you, you owe the
player automation for everything they're not watching, and you owe the design some source of
pressure that also runs while they're gone.* The era clock (below) is the payment — with one
correction now that pause is load-bearing: the clock's pressure is **per tick spent**, not per
absent second. You can be present the whole time and still be too slow, because you spent your ticks
on the wrong things.

**Prior art, for every problem this shape will hit:** Paradox — Stellaris most exactly. Pausable
real-time 4X, speed controls, adversaries on their own tech clocks, armies as pieces over territory,
and no one has ever accused it of demanding APM. They solved the reaction-pressure question with
pause and never looked back.

**The standing law that guards the identity** *(sharpened 2026-08-25 after the owner caught the
first wording banning too much — a late interception IS worse, and should be)*:

> **No order ever gets better by being issued with faster hands. Every order may get better by
> being issued at the right tick — that judgment is the game.** Corollary, which is what makes it
> enforceable: **anything time-critical must be issuable from pause.** If a situation can only be
> answered well by a player who didn't stop the clock, the feature is broken, not the player.

Waiting too long to intercept a war party is a decision made late *in ticks* — judgment failing,
priced honestly. What can never exist is two players making the same decision and getting different
outcomes because one clicked quicker. If something catches you off guard, you pause and inspect all
available information freely, like a Civ game — the owner's line for why 4X is the perfect bridge
between the two poles. The APM ceiling stays a few orders per minute, all optional — TI4, not AoE.

## Design Philosophy

**Unravel the contents, not the board.** The board is **whole from the first frame**: every panel the
current era can fill is on screen, named by its header, empty and waiting. What unravels is what goes
*inside* them — resource rows, building options, upgrades, trainable units appear only once they're
relevant, and once shown they stay. Era transitions are the one sanctioned moment for panels
themselves to arrive or retire.

*Historical note:* this previously hid whole panels until earned. That rule was calibrated for a
pen-on-paper wireframe in which an empty panel and a full one were the same hairline box, so showing
them all read as clutter. Bureau's ink header plates and per-column paper stock removed the premise —
an empty panel reads as a defined region waiting to fill — and against defined content areas a slow
reveal reads as broken rather than as discovery. The rule outlives the skin that fixed it.

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

**Restraint and legibility.** Nothing decorative that carries no information; legibility outranks
texture; and **color reserved entirely for meaning** — green is genuinely new good information, red
is danger, amber is a rare milestone. Color is never ambience. *(These laws were first derived from
a founding-era test — "the whole game could be drawn in black pen on ruled paper" — which retired
with the paper identity on 2026-08-22. The laws did not, and they bind the 3D board exactly as they
bound panels: light and depth may carry atmosphere; color still carries meaning.)* Everything more
specific — palette, materials, texture — is presentation, and the identity it serves is settled:
**the digital tabletop** (Open Question 3; `interface.md`; `map.md` §8).

**Small numbers, slow start.** Displayed counts stay in roughly the 3–50 range forever; scale is
carried by re-denominating what a unit *means*. The opening minutes are deliberately unhurried.
Standing rule: **when unsure, tune toward too-hard and walk it back**, never the reverse.

**And the reason, sharpened by the owner on 2026-08-25, because it is stronger than the rule it
justifies:** *"I would rather tune hard, and then when I fail talk about whether it was a structural
issue or whether I just played badly. Instead we keep coming back to whether it's even theoretically
losable."*

**A too-hard game produces a diagnosable failure. An unlosable one produces nothing to diagnose.**
Every session spent asking *can this even be lost* is a session that learns nothing about the design,
because the answer is arithmetic rather than play. Numbers that feel harsh on arrival are the cheap
half of this: they can be walked back in an afternoon once there is a real failure to reason about.
Numbers that cannot fail cost you the whole feedback loop.

**The world filling in is part of the fun.** *(Mechanism re-based 2026-08-22 with the flip.)* The
pillar's intent — visible, earned growth as the progression display — survives; its surface is now
the map first and the panels second. One hex becomes a ring becomes a country becomes a dominion
spreading tile by tile; panels still fill (cards, rows, tiles) inside their floating homes. An
empty *selection* is the one sanctioned nothing.

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

### Population Lives Somewhere — the one economy

*(Settled 2026-08-23, in conversation, replacing the two-phase economy below. This is the largest
change to the simulation since offline was deleted, and it was taken deliberately: the map arc was
paused mid-build to make it, because everything still unbuilt depends on what a hex is worth.)*

**Why it happened.** By 2026-08-22 the hex had become the anchor noun *and* was on screen from the
Stone Age. That left the game teaching a whole economy — steppers, jobs, housing, a global
population pool — and then retiring it about fifteen minutes in, at a border that changed seven
systems at once and had already starved a live playtest. Two economies, one of them disposable.
The fix is to run the hex economy from the first minute instead of the fortieth.

#### The rules

**1. Population lives on hexes.** Every hex in your dominion carries its own population. Your total
is their sum. There is no global pool and no pool of unassigned people.

**2. Terrain sets carrying capacity.** A river valley holds many people; a mountain holds few.
Population grows toward the cap on its own. Tech and buildings raise the cap.

**3. People are immobile. There is no migration, ever.** They grow in place, work in place, and die
in place. This is the load-bearing rule and it is not a balance knob — see *the fungibility trap*
below.

**4. One assignment per hex.** A hex works one resource. Terrain sets the rate through the works
table that already ships; every ground works everything, at a price. There is **no splitting a
hex's people across resources** — that would be a stepper per hex, and a hundred and twenty
steppers is worse than the three we started with.

**5. Output = population × per-capita rate.** One formula, from the first minute to the last.

**6. Population is a VARIABLE, not a control.** The player never sets it. The world writes to it —
growth, plague, raids, starvation — and the player reads it and lives with it. It is the same
category as a food stockpile or an adversary's wall damage. *This distinction is the whole design:
a stepper is a control; this is a number other systems change.*

**7. Rates are per-capita, and this is a law rather than a detail.** Population is the one number in
this game permitted to explore — it is the odometer, and big numbers are the point. **Per-capita
rates are the firewall that stops every OTHER number exploding with it.** If a rate were per-hex
instead, a hex growing from 20 people to 60 would triple output with no design decision behind it,
and every cost, cap and curve in the game would have to chase it. Per-capita, the same growth is
legible, gradual, and priced. Anything that scales with population must be expressed per person.

**8. Starvation drains the frontier first.** One food pool, not per-hex food. When the empire cannot
feed itself, people die at the hexes furthest from your seat and inward from there. Overextension is
punished *spatially*, which makes a compact empire genuinely cheaper to hold than a sprawling one —
strategy out of pure geometry, with no new resource and no new UI.

**9. ~~Land stays yours when a hex empties.~~ REVERSED 2026-08-25 — an empty hex is LOST.** Ground
reverts to unsettled resource ground the moment nobody is left on it, and getting it back means
claiming it again. The reversal is on new information, not a change of heart: `dominionCap` shipped
two days after this rule, and under a cap a ghost occupies a slot while producing nothing — punished
twice, unable to re-plan. It punishes stretching yourself thin, or not watching a threat. The seat
is still the exception; its fall is still the ending. *Original reasoning follows.*

**9. Land stays yours when a hex empties.** *Dominion never shrinks* (the 2026-08-22 ruling) holds
here too: a starved hex drops to zero people and remains your holding, repopulating if you can feed
it again. A ghost town you can bring back is more interesting than a hex that vanishes. **Death
comes when your seat empties** — the capital falling is a better ending than an arithmetic one.

**10. Every problem the world creates must have a STRUCTURAL answer, never a micromanagement one.**
Frontier hexes starving is solved by founding a second seat, taking better ground, keeping the
empire compact, or researching supply — things you *build*, *choose* or *research*. Never by
fiddling. This rule is what keeps the game from drifting back toward Age of Empires by accident,
and it follows directly from rule 3.

#### The fungibility trap (why steppers actually failed)

Worth stating precisely, because the wrong lesson is easy to draw. Steppers were not bad because
*assignment* is bad. They were bad because the pool was **fungible and global**: any person could go
anywhere, so moving one person changed the correct answer for every other slider, and the system was
implicitly asking the player to re-solve a global optimisation every time anything changed. That is
what made it minmaxy, and what made it easy to forget and then resent.

Per-hex population is not that. The people in a hex cannot leave, so each decision is *local* —
changing what one hex works has no effect on any other hex's best answer. Cost grows linearly with
hexes rather than combinatorially, and each individual decision stays correct until the player
changes their mind. The shipped Iron map already proved this: one assignment per hex, and the
owner's verdict on playing it was "allocating based on hex feels fine."

**The rule that falls out: fungibility is the enemy, not assignment.**

#### One number, five jobs

The elegance to protect. A hex's population is simultaneously:

1. its **capacity** (what the land supports),
2. its **production** (output = population × rate),
3. what **plague** kills,
4. what **starvation** drains, frontier-first,
5. what a **raid** takes.

Five systems pushing on one number the player can see. That is the opposite of an unholdable
balance surface — every consequence lands in the same place, so all five are predictable at once.
This is also why *slots* died: it was a second capacity number sitting beside population, and two
numbers meaning "how much this place can do" is what made per-hex simulation start to look like a
hundred and fifty little economies. Capacity simply *is* population now.

#### Loss events, and the two mitigation tracks

Sickness finally works, and the reason it was broken is instructive: with a global pool, a plague
had to kill someone *nowhere in particular*. **Where did they die?** Now a plague strikes a hex and
kills people there — and because population regrows toward its cap, the shape is disaster, dip,
recovery rather than a permanent scar. That makes infirmaries obviously worth building.

Two deliberately separate mitigation tracks, which give the tech tree two real branches:

- **Plague** — medicine, infirmaries, sanitation.
- **Raids** — terrain, walls, military tech.

Raids follow the same shape: a hex is attacked, it rolls, people there die. **No garrisons and no
army-per-hex** — you have one army, you send it out to war or trade, and it comes home. Defence is
passive, from terrain and tech.

#### What this retires

Steppers and the jobs system; `reconcileWorkforce`; housing and free timer growth; consolidation and
its keep ratios; the levy and `levyMigrated`; the pop↔dominion lockstep in `syncDominion`; and
**the Bronze→Iron cliff itself**, which stops being a genre change and becomes a re-denomination.
That is most of the remaining complexity in the simulation, replaced by one rule that runs the whole
game.

*(Progress note, 2026-08-24 final: ALL SIX SLICES SHIPPED — the rework is complete. Original
running note kept below.)*

*(Progress note, 2026-08-24: E2, E3 and E4 shipped — steppers, jobs, `outputMult`,
consolidation, the hut, housing, the settler timer, the lockstep and instant starvation are all
gone. Growth is local, expansion is a paid claim with escalating costs, and famine drains the
frontier inward until the seat falls — rules 8 and 9 above are live code. `S.pop` survives only as
a mirror until E5 re-homes the army and events.)*

*(And E5–E6 did: the army answers to the land (`levyCap` = owned hexes × `armyPerHex`) and recruits
draw a real person from the seat; `removeSettler` is gone entirely, replaced by `strikeHex` /
`killAt` so sickness and raids land on the ground where those people actually lived. **Owner played
a full run to Iron on 2026-08-25** — the loop holds end to end, a minor was subdued in Bronze and
swore fealty, and the finding worth keeping is that the dominion cap never bit: demand ran out
before the ceiling did.)*

#### The four re-homings (the actual work)

Population was load-bearing in four places. Each needs a new home on the hex:

| What pop carried | New home |
|---|---|
| **Food upkeep** (everyone eats — the failure state) | Per-capita upkeep against one pool; starvation drains frontier-first (rule 8) |
| **Levy cap** (army size) | Hexes. *"Make it serve the hex"* — owner. Each holding supports so many soldiers |
| **Loss events** (sickness, raids) | Per-hex and real (above) |
| **Growth pacing** | Population growing toward its cap, plus territorial expansion. **The ceiling only rises by taking land or researching** — which keeps the shipped Iron line true: *"No one arrives unbidden. Your people grow by conquest and fealty."* Local repopulation is healing, not growth |

#### Numbers to decide before code

*(Resolved to v1 values 2026-08-23 — the table and reasoning live in `todo.md` → *The engine
rework — phase plan*. Headline: `baseRate`/`upkeep` were already per-capita so they carry
unchanged; carrying caps are small at Stone (3–10) and grow by era; growth is logistic at
r ≈ 0.015/s. The items below remain the list of what those values answer.)*

- **The scale of per-hex population.** Owner's instinct is people-sized (tens — "a mountain starts at
  20"), not token-sized. That is what makes the odometer real.
- **The per-capita rate constants.** A one-time global rebalance: today's rates are effectively
  per-hex, so they must be divided down by roughly the population scale or food arrives forty times
  too fast. Do this deliberately, once.
- **Starting caps per terrain**, and **how fast population grows toward its cap.**
- **Food upkeep per person**, which sets how hard the failure state bites.

#### Flagged for the balance pass

**Tech raises the cap, so it does not pay out immediately** — people have to grow into the new
ceiling. That is good (tech becomes an investment that matures, the same shape as building a
granary) but a tech that does nothing visible for two minutes can read as broken. Signal it clearly
in the interface; allow it.

**The frontier is punished twice** — starvation eats it first and raids hit the perimeter. Each is
good alone; together they may make expansion feel strictly bad. This will present much later as
"expansion feels bad" and the cause will not be obvious, so it is written down here.

#### The dominion cap: what one age can hold

*(Owner ruling, 2026-08-24 — proposed, rejected, re-argued with playtest data, adopted.)* Each era
declares how many holdings the age can govern — the `dominionCap` era-fact: **stone 7, bronze 12,
iron 20**, rising toward board scale as the ages pass. No cost curve can brake expansion, because
claims buy production and compounding production outruns any price — the cap shuts the door
outright, and the claim costs underneath it (escalating, era-signed) become friction *within* the
scope rather than the failed brake. This is the tile ladder enforced, not housing revived: scope
per era is what an era advance *is*. Consequences that arrived with it: development is the mid-era
sink (once the land is held, buildings are what's left to buy), and expansion becomes **selection**
— with seven slots, *which* seven is the age's defining decision, and empire shape (snake vs blob)
is already priced by frontier famine and raid exposure. The tech tree may later sell
administrative capacity against the cap.

#### Buildings are your capital (the Luthadel rule)

*(Settled in passing, 2026-08-23 — owner and Claude reached it independently, which is usually the
sign a position is stable.)* People are located; **buildings are not, and the silence is
load-bearing.** The fiction: your buildings all stand at your seat — you manage all the dominances,
but everything you build is in Luthadel *(Mistborn, era 1)*. This costs nothing, contradicts
nothing, and matches the seat-death rule: the capital is the run.

Mechanically placeless, deliberately: "which hex do I build this on" is a decision that must not
exist until placement *means* something (adjacency, defense — the Civ-districts direction), per the
structural-answers rule. **Revisit trigger:** when playtesters start assuming placement matters —
the same trigger as terrain-aware routes. Expect the slice-7 re-dress and E5's hex raids to make
the question louder: props will draw buildings ON hexes, and burned hexes will invite "did they
burn anything?" Both are the fiction running ahead of the mechanics, which is the good direction.

#### Ideation, explicitly NOT canon

Recorded so it is not lost, not because it is decided: **rest as fallow** (owner, 2026-08-23:
"the rest button is interesting if it has other implications" — a resting hex could grow its
population faster, or restore ground a future fertility/exhaustion mechanic depletes; historically
real, and it would turn Rest from an absence into a decision); **contagion** (plague spreading through
`adj`, which would look extraordinary on the diorama); **density attracts plague** (your richest
province is your most fragile — historically true, and real counter-pressure against loading up your
best land); **second seats** (provincial capitals that shorten administrative distance — a growth
verb that answers overextension with a reward rather than a tax); **terrain-aware `routeCost`**; and
**scouting as intelligence** rather than map reveal (see `map.md`).

---

### Allocation — the permanent verb

> **Half superseded 2026-08-23 by *Population Lives Somewhere*, above.** The verb is unchanged and
> the section's central argument — that allocation re-denominates rather than retiring — is not
> only intact but strengthened: it now runs from the FIRST minute rather than arriving at Iron.
> What is dead is the two-phase split below. There is no "Stone and Bronze — people, allocated with
> steppers" phase any more; hexes are allocated from the Stone Age, and the stepper is gone as a
> control entirely rather than surviving to Iron. Kept whole because the reasoning trail — including
> the corrected "retirement" ruling — is why the current model is trusted.


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

**The stepper retires as a control at Iron; it does not retire as an idea.** *(Shipped 2026-08-22:
Iron declares `allocation: "tiles"`; owned hexes carry the allocation buttons in the map's detail
pane, terrain constrains the menu, and hills — stone or iron — are the one multi-choice and
therefore the tile worth fighting over.)* Assigning a holding on a
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

### Building on a Hex — the design space, and its one law

*(Owner direction, 2026-08-25; **first two structures shipped the same day**. The shape below is the
law; the content is a separate and much cheaper question, which is why it was written first.)*

**Shipped:** the **Farm** (Bronze, via the *Farming* upgrade) feeds at a flat rate better than any
bare ground and forfeits everything else the hex could produce; the **March-hold** (Iron, via
*Fortification*) yields nothing at all and adds defensive strength to itself and the ring around it.
Both follow every rule below without exception, which is the useful thing about having written them
down first.

**A hex is exactly one thing, and that is not a new rule.** `S.map.work[id]` already holds a single
value: a hex is turned to food *or* wood *or* stone, never several, with mutually-exclusive controls
and a `rest` state. Building on a hex widens that same slot rather than adding a second one — a
hex's use is a **resource or a structure**, never both, and never a parallel town alongside its
fields. *"You are not building a parallel town there, it's either a resource hex or a farm or a
fortification. Never mixed."*

Worked examples, illustrative rather than committed: **Build Fortifications** turns a producing hex
into a fortified one that lowers strike chance on its neighbours; **Build Farm** turns the ground
golden and stands a haybale on it. In both cases the resource props sink and the structure rises —
see the animation ruling in *Explicitly Out of Scope*.

**The rulings, settled:**

- **A built hex still holds its people.** The fiction is that the people are doing the new thing
  rather than having left: build a farm and they are all farming, build a fortification and they are
  manning the walls. Population, terrain caps and the famine drain are untouched — only what the
  hex PRODUCES changes.
- **It shares the build queue.** Not for realism but for pacing: the queue is one of the strongest
  anti-speedrun instruments the game has, and a structure competing with a Forge for the front of it
  is friction worth keeping.
- **It re-dresses like everything else, when it makes sense** — not on a schedule. A farm is a farm
  and can hold that word to the end of Earth; a fortification cannot, because *"a mechanized total
  warfare society can't have stone palisades."* Same rule as every other noun (see *The Noun Table*).
- **It is reversible, and the reversal costs.** A built hex carries a control that destroys the
  structure and returns the hex to being a resource hex. **No refund** — so converting is a real
  trade rather than a free toggle you flip per situation.

**YOUR SEAT CANNOT BE BUILT ON** *(owner ruling, 2026-08-25)*, and the reason names the line between
the game's two build systems — which nothing had said out loud until now:

- **The Construction panel raises things in your SEAT.** Granaries, forges, barracks: the capital you
  personally rule from, and the small empire you build inside it.
- **Building on a hex is you instructing a HOLDING** what to become. You are not there; you are
  telling a dominance what to do with its ground.

Letting the seat be farmed or fortified would collapse those two verbs into one confusing thing. It
also protects a landmark: the three-house cluster on your seat is how the board says *you are here*,
and a board where that can be replaced by a wall is a board where you can lose your own capital in
the fog.

**The neighbours' seats are not an exception either** — they stay RESOURCE hexes that merely *show*
buildings; their houses are decoration, not a use.

**Why this is specced before it is built.** The owner's instruction is to prepare the ground rather
than the content: *"the most important thing to me right now is not that we build specifically a farm
and a fortification, but rather that we prep the infrastructure for it, since this will be a big
design space going forward — like we did when we preemptively separated the visual layer from the map
logic layer. It made doing 3D very easy."* That separation is the precedent and the standard: the
right preparation is a seam, not a feature.

### The Economy Must Be Able To Break You

*(Diagnosis and rulings, 2026-08-25, from a two-hour unattended run: 228 souls, 11 holdings, **zero
army**, food climbing at +24/s, and the population never dropping below 226 before fully recovering.
The game could not be lost by inattention, and that had stopped being a tuning question.)*

#### The root is arithmetic, not a missing sink

Upkeep already exists and is already charged — `mouths × 0.04/s` across hex population and army
alike. At 228 souls that is 9.12 food/s being eaten every second. **The sink was never missing.**

The problem is its *shape*. Production is linear in population (`people × baseRate × terrain`).
Upkeep is linear in population. The margin between them is a **fixed ratio** — `tech.md` states it as
a feature: *"one working person feeds themselves plus four, at any population, in any era."*

**A flat per-capita sink can never catch a per-capita source.** Every person added carries their own
positive margin, so surplus grows without bound and there is no size at which the empire strains.
Bigger is always better because the per-head economics never change, at any scale, forever.

**So adding another sink of the same shape cannot work. The sink has to scale faster than the
source.** That is the single load-bearing sentence in this section.

#### The antagonist is your own weight

The genre's answer to a wide, rich player is a rival racing you on the same clock — and this game has
ruled that out on purpose: adversaries are static stocks, *"explicitly not simulated civilizations"*,
and that ruling stands. It is also why time-farming is safe here in a way it is not in Civ or AoE.

The resolution is not to make the world age. **It is to make size itself the difficulty.** If cost
grows superlinearly with the empire, then succeeding generates its own opposition, and a hundred-hex
realm is hard to hold *because it is a hundred hexes* — not because something out there levelled up.
That preserves the static-adversary ruling, costs no new systems, and is what this game's own
documents keep circling: a stretched dominion should starve and burn first.

#### The five changes

1. **Upkeep scales with administrative distance.** The one change that bends the curve. `adminDistance()`
   already exists — a Dijkstra from your seat that governs the famine drain — so a hex far from the
   capital costs more to hold than one beside it. A compact dominion stays cheap; a stretched one
   bleeds. This makes the **shape** of an empire matter, not merely its size, and it is thematically
   exact: supply lines, not granaries.

2. **Raid damage is a share of the struck hex, not a flat count.** `1 + raidSize/8` takes one or two
   people — 0.4% of a 228-soul realm, and less every hour. A percentage stays meaningful at every
   scale. **Interaction to design deliberately:** with hex-loss live, a large enough share *takes the
   hex*, so raids stop being a tax and become a territorial threat.

3. **Walls supplement an army; they never replace one.** `fortStrength` at 9, stacking in range, let a
   player with **no soldiers at all** turn back 64–90% of raids. That is a march-hold doing the
   army's job. Roughly halve it: a naked settlement should still lose, while a defended one that
   *has* fighters should notice the difference.

4. **Sickness scales with population, and infirmaries soften rather than prevent.** The infirmary
   reduces the *trigger chance*, so enough of them drive frequency toward zero and the threat is
   permanently retired — a solved problem rather than a standing cost. Conflict already gets this
   right (`conflictPopScale`); sickness should scale the same way, and its counter should reduce
   severity or bottom out at a floor.

5. **The throughput limiters are load-bearing and must not be "optimised".** The Underway queue —
   only the front item advances — and the era gates are what stop a stockpile becoming an instant
   army. This is the genre's real answer (*cap the spend, not the store*), it is already built, and it
   is recorded here so that nobody later mistakes it for friction to be removed.

#### A standing constraint on the tech tree

Not work to do now — the tree is deliberately gated — but a fact it must be designed **with**, because
retrofitting it means designing the tree twice.

> **Tech node prices are authored per node and multiplied by dominion size at purchase. Completed
> nodes cost nothing, forever.**

Deep techs are expensive because they are deep; *your* techs are expensive because you are wide. This
is Civ's actual wide-play tax — more cities raise the cost of the **next** discovery, never of the
ones you hold. Paying rent on knowledge you already have would be absurd, and is not proposed.

**Depth is authored; dominion is multiplied.** The multiplier represents your empire's cost of
coordination, not the tech's difficulty. Difficulty is a fact about a node and belongs printed on it.

**And explicitly rejected: the Nth tech costing more because it is the Nth.** It would make the tree
unplannable (a price that depends on unrelated purchases cannot be read off a card and planned
toward), it would tax exploring the tree, prerequisites already encode depth structurally, and the
per-copy escalation buildings use exists to stop *spamming one repeatable thing* — which a unique,
once-bought tech cannot be.

**One consequence, chosen deliberately:** because the multiplier reads current dominion size, losing
hexes makes the next tech cheaper. That matches claim costs, which already read `owned.length`, and it
means setbacks bend a run rather than snapping it.

#### What the simulations found, which changed the plan twice

**The five changes were written before any of them were measured, and measuring moved two of them.**
Recorded because the errors are the same shape as the original bug, and that shape will recur.

**Distance-weighted upkeep alone was far too weak.** `adminDistance()` charges half a step through
your own country, so a contiguous realm of twenty hexes averages barely 1.0 — a 30% surcharge against
a 5:1 margin. It bends the curve only once the player *diversifies*: at a realistic third-on-food mix
net food now rises to +9 at fourteen hexes and falls to +6 at twenty, which is an equilibrium
forming. An all-food empire still runs away, and that is accepted: it wins the food number while
producing no wood, stone or iron, which is a degenerate configuration rather than a strategy.

**Percentage raid damage did not scale either, and the reason is the original bug again.** Raid
FREQUENCY scaled with population; raid SIZE never did — 2/5/10 forever. So damage per raid was
O(one hex) while the realm was O(hexes), and *the share you lose shrinks as you grow.* Raid size now
scales with the settlement, which does a second job worth having: `repelChance` is
`defense / (defense + raidSize)`, so bigger hosts make an army **necessary** at scale rather than
optional.

**And the real culprit was neither: recovery was free.** Isolated from regrowth, 83 raids took a
realm from 360 people to 77. In the live run the same hour moved it by 25. Logistic regrowth refilled
every hex in minutes **at no cost at all** — so nothing could hurt the settlement faster than it
healed, and surplus food had no consumer, which is why it piled up forever.

**Food's natural sink is growth**, and growth was not using it. Raising a person now costs food, and
that cost rises with the realm — a flat price is trivial late and unpayable early. This is the loop
the economy was missing: surplus becomes people, people become upkeep, and a raided realm *pays* to
recover.

#### Where it now sits, honestly

At a third-on-food, an unattended hour at fourteen hexes with no army runs the larder to **zero** and
the population down. But **neglect does not kill you — it shrinks you.** Food hits zero, growth
stops, famine trims the frontier, upkeep falls with the population, and the realm settles at a size
the land can feed. That is E4's documented behaviour working as designed (*famine converges on what
the land can actually feed*), and it is self-correcting by construction.

**So the open question is whether shrinking is punishment enough**, or whether neglect should be able
to end a run outright. Making it lethal means letting the famine drain outrun its own equilibrium, or
letting raids take hexes faster than they can be held — both are real levers and neither is obviously
right. **This is now a play question rather than an arithmetic one, which is the whole point of the
tuning rule.**

#### What this is a sink for, and what it is not

**Tech-as-flow paces; upkeep equilibrates.** A tree is finite: research everything an era offers and
surplus banks again until the next era opens more. It gives surplus a *destination*, not a *ceiling*.
Only superlinear upkeep makes the game losable. They are different jobs and neither substitutes for
the other.

### Resources & Storage

Resources accumulate from job assignment. Every resource has a storage cap; surplus past it is lost,
not stalled. That's literal rot for food and wood; for stone the justification is gameplay symmetry
over realism, stated openly. Caps are what make storage buildings necessary rather than optional.

*Retired at Iron (2026-08-22 — inside the scheduled window, moved up by user ruling: a king does
not count sacks).* From Iron every resource runs uncapped and the storage line leaves the manifest,
narrated. The friction handed off cleanly rather than being dropped: gold cannot be mined, growth is
a designed budget, and the levy caps the army. Stone and Bronze keep their caps and their storage
buildings — the early game's friction is untouched.

**SUPERSEDED (consensus 2026-08-25; not yet built): the storage buildings die, and caps become
flat, automatic, and per-era.** Owner's proposal, and the evidence was his own save: Stone's
capstone costs 300 of each resource against a base cap of 50 + 100 per storage building, so every
player builds *exactly* three granaries, three woodsheds and three stone yards to reach 350 — a
prerequisite with extra steps, not a choice. The replacement:

- **Every resource gets a cap set by its era, for free.** No buildings, no upkeep on the number.
  Sized just above the era's capstone (Stone ~350 against a 300 capstone), so **the era is the
  budget** — and the caps become the first real pull to advance sooner, which the era clock then
  turns into a push.
- **Per-resource, and food runs slightly higher in every era** — population eats food continuously;
  wood and stone are only spent in lumps.
- **Gold is never capped**, and the owner's reason generalises into the law that draws the whole
  line: **cap what accrues while you are not playing; never cap what you can only get by acting.**
  The cap exists to defeat the clock, not to punish play — anything later earned by campaigning or
  trading inherits the same protection.
- **Iron's uncapped run retires without a reversal**: *"uncapped was never a ruling so much as a
  temporary fix"* (owner) — for granary-spam being annoying across eras, and for walking away and
  returning to 20,000 of everything. Both problems die with the buildings, so caps return at Iron
  for free. This matters doubly if the planned fast-forward ships.
- **Recorded honestly: this is pacing and anti-hoarding, NOT difficulty.** The owner playtested
  pinned at 350/350/350 and was thriving — the capped world is the world he already lives in, minus
  nine buildings. The difficulty budget is carried by the economy calibration and the era clock.
- The thinner early construction panel is accepted without worry (owner, explicitly).

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
*(Superseded in design 2026-08-25 for weapon tiers — under unit persistence they fold into per-era
unit defs; see* Armies Take the Field*. Armor's fate is an open sub-ruling there.)*

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

### Armies Take the Field *(direction ruled 2026-08-25; scoped, not scheduled — wants its own session)*

The largest structural change ever proposed for this codebase, agreed in principle and parked
deliberately. Today an army is four global integers with no position — which is *why* "zero
military, thriving" is a viable build: a number that is nowhere can have no job. The direction:

- **Armies become groups with positions.** The player partitions the army into segments and sends
  them to hexes, travel included, over terrain via `routeCost()` — terrain carrying a movement
  modifier has to matter. A group moves at its slowest member.
- **Stance, not unit type, resolves the scout question.** A group is either **marching** (fights
  and holds ground) or **scouting** (cannot fight; flees toward home or dies if an enemy army enters
  its hex). Four men sneaking through the hills are scouts because of how they behave, not what they
  are — no separate scout unit, no second movement system. Horsemen scout faster, so an all-horse
  party is a thing you assemble on purpose. A scout fails by being *caught*, not by dice —
  explainable, narratable.
- **No minimum group size — the world prices pickets honestly *(ruled 2026-08-25)*.** A floated
  min-4 rule died on inspection: a lone picket dies guaranteed to any real force, costs a scarce
  unit from a small pool, and a dead picket that bought warning did an honest job — that is what
  picket lines are. Broken lines and scrambling to re-intercept is wanted texture. The actual
  exploit was elsewhere: sacrificial chaff *pinning* an army via the both-are-busy rule. The
  guardrail lives in the fight, not the group size: **engagement duration scales with how even the
  fight is — a steamroll resolves near-instantly and the winner marches on the same tick.** Delay is
  bought with a force that could plausibly win, never with bodies. A lone soldier buys a *little*
  time — desperation play, correctly priced. (Armies aren't delayed by the men they walk over.)
- **The piece count is bounded forever, by the game's own scale philosophy.** Units never inflate;
  labels do — one soldier becomes one star cruiser, and only population runs to silly numbers, as a
  scaled label on a real number. So era 12 holds roughly as many army groups as era 3, and micro can
  never creep in at depth because the thing micro needs — a growing swarm of controllable objects —
  is unrepresentable. TI4 stays TI4 at heat death.
- **Units persist across eras; manifests only ever ADD units *(consensus 2026-08-25)*.** Today the
  era flip renames the same four unit ids in place — every unit forcibly the same age, which was
  only ever a consequence of the single global era. With era-per-civ that constraint dies: units
  keep the era they were built in, new eras mint new defs, and you field **mixed nonsense armies**
  — the last spearman, some knights, the one tank you somehow built. What falls out:
  - **Rebuilding the army every era is a real, recurring resource sink** — and the equipment-tier
    upgrades (`bronzeWeapons`, `ironWeapons`) were this feature done flat: one payment aging up the
    whole army at once. Weapon tiers fold into the unit defs — a bronze swordsman IS bronze weapons.
    *Open sub-ruling:* whether armor tiers stay global upgrades (everyone gets the new shields, old
    units included) or fold in too.
  - **No disband verb, and existing canon already rules it:** *a soldier is a commitment, never a
    reassignable stat.* You clear levy slots the way the owner already plays board games — by
    spending the men. The desperate attack that exists partly to retire obsolete units is intended
    consequence, not exploit.
  - **The strength curve balances mixed armies for free:** era gaps read as kind early and number
    late, so a mixed army is naturally viable in early ages and brutally obsolete in deep ones —
    rebuild-or-rot pressure follows the difficulty curve without tuning.
  - **Mechanically cheap:** owned units become state referencing the manifest of their birth era via
    `manifestFor(era)` — the exact seam the era clock already forces. The wholesale rule survives:
    each era still declares its *trainable* roster wholesale; legacy is state, not inheritance, and
    `manifestDiff`'s unit-rename machinery retires.
  - **One asymmetry, deliberate:** adversary armies materialize per campaign at their current era —
    nothing persistent to carry, so no legacy units. The no-sim rule doing its job.
- **Scouting buys WARNING TIME, not just map knowledge.** Fog is built and load-bearing
  (`syncCharted()`: you see what you hold plus one ring, sticky) — which today means an approaching
  army would be invisible until adjacent. A scouted ring three hexes out is three hexes of notice;
  an unscouted flank is an army at your door. This gives scouting a standing, renewing, directional
  value (you scout *toward the speedster*), and it promotes slice 6 from convenience to
  prerequisite. Constraint carried forward: **scouting must not delete the settle-blind gamble.**
- **Interception is positioning:** send a holding force to a hex because you saw a war party coming.
  When two hostile armies meet, they fight — simple board-game dice, TI4 / Axis & Allies grammar —
  and while engaged both are **busy**.
- **A raid becomes an inbound campaign.** Raids and campaigns are today two systems doing one job in
  opposite directions; the merge gives raids an origin, travel, and interceptability — the 5c raid
  roads idea arriving as a consequence rather than a feature.
- **The tradeoff is the game, named:** every group sent out is warning time bought with home defense
  sold. An army at home and an army afield are different things, which kills the zero-military build
  a second way, with no balance change.
- **Not micro, and why:** hexes are coarse, travel is slow, the game pauses. An order is a decision,
  not an execution — see the law under *What this game actually is*.
- **Rendering:** one fixed marker per group, dev-asset class. Movement is shown by the sink-and-rise
  the board already owns — the piece sinks, and rises in the next hex. Motion at the moment of a
  change, only to the thing that changed: the existing animation law covers it verbatim.

### Failure

> **Amended 2026-08-23/24 (*Population Lives Somewhere*, shipped E4+E5).** Starvation drains the
> empire from its frontier inward, hex by hex; the run ends when the **seat** empties. **Land IS
> lost** — an emptied hex reverts to unsettled ground (rule 9, reversed 2026-08-25; ghosts and the
> rekindle are deleted). The Sickness/Conflict
> asymmetry survives in per-hex form: a fever takes a fifth of ONE hex (min one) and can never
> wipe a run in a blow; conflict can still overrun outright. Sickness strikes person-weighted
> (dense hexes host more fevers), raids exposure-weighted (the frontier burns first) — the two
> weightings ARE the two mitigation tracks.

Two ways to lose. **Starvation** is a hard stop. **Conflict** is allowed to be lethal in the worst
case — unlike Sickness, which floors at one survivor by design. That asymmetry is what gives a
Barracks and a healthy population genuine stakes rather than another number to grow.

---

## A Game That Cannot Be Lost — the open thread

*(Owner, 2026-08-25, from a note that had been sitting in the ideation doc: "Idle games don't need
lose conditions but civ/4x games do. A civ game you win every time is not usually one you play
twice." The economy work of the same evening made consequences real; it did not close this.)*

### The principle is identity, not difficulty

> *"I would not play a board game you could not lose, and that is the reason (mostly) every board game
> CAN be lost. Either you lose, or it's co-op and you all lose. There are board games with no real
> loss condition and my reaction was always: what's the point?"*

**This is not a preference about difficulty. It is a consequence of a ruling already made.** The
identity is the **digital tabletop** (Open Question 3): a board game come to life, and comparisons to
a physical board game are invited *on purpose*. A board game that cannot be lost is the thing the
owner is describing as pointless — so an unlosable Idle Civ does not merely play badly, it **fails
its own identity**. That makes losability a structural requirement rather than a tuning target, and
it outranks any individual number.

### Three separate problems, currently held as one

**1. Losability.** Can this run end badly? *Partly solved (2026-08-25):* neglect now shrinks a realm —
larder to zero, growth stopped, famine trimming the frontier — but settles at a sustainable size
rather than ending. **Neglect shrinks you; it does not kill you.**

**2. Replayability.** Is the next run different, and is there a reason to play it? *Unsolved but not
worrying (owner, 2026-08-25), because the levers are already queued rather than missing:* a
**direction-exclusive tech tree** — branches you choose between rather than a checklist you finish —
and **more things to build on a hex**, both of which make one map's best line differ from another's.
Varied starts cannot produce varied play while the optimal response to every start is identical, and
right now it is: expand, assign, wait. **The game has one strategy** — but the stubs for having
several are in place. A losable game can still have exactly one line; these remain different
problems with different answers, and only the first is urgent.

**3. An ending in either direction.** There is no win condition either. Iron is terminal and
`todo.md` records that the Iron Age *"ends signal-less by design"*. The game currently resolves
neither way — it is a sandbox that runs out of content.

**ANSWERED IN DESIGN (2026-08-25): the era clock** — see *Every Civilization Keeps Its Own Time*.
Adversaries now advance on their own hidden countdowns, so the capstone becomes a race and losing it
has teeth. Problems (1) and (2) remain open, though armies-on-the-field (see *Armies Take the
Field*) bears on both. The paragraph below is kept as the diagnosis that led there.

**On (3), the structure already exists and has been treated as plumbing: the era advance IS the win
condition, repeated.** Each age is a run you win by reaching the next, and the seat falling is the
loss. Nothing needs inventing. What is missing is that **advancing is currently a formality**, so the
race has no tension. Capstone requirements are a lever that has never been used as one.

### Every resource node is infinite

**The deepest cause, and it is upstream of every number.** *"What we are simming here is basically AoE
but every resource node is infinite."*

In AoE a mine running out is not flavour, it is the **engine**: it creates map pressure (you must go
where the resources are), timing (booms end), contested ground (nodes are worth fighting for), and
idle labour as a visible failure. A hex here is a permanent annuity — it works its resource forever
at a fixed rate — so the optimal move on the first minute stays optimal forever, and time always wins.

**Blanket depletion is the wrong answer**, for two reasons this document already commits to: a hex is
a PLACE, not a node (the tile ladder makes it a city, then a nation, then a world — a depleted nation
is incoherent), and reassigning dried-up hexes is precisely the micromanagement listed under
*Explicitly Out of Scope*.

**The proposal on the table: renewable versus extractive.** Food and timber renew — fields and forests
come back. **Ore does not.** Stone, copper, tin and iron are extracted, and a mined-out hill is a real
thing that has happened everywhere on Earth.

What falls out of that, without one new system:

- **Hills are the ore terrain, and the Hill Clans live in the hills.** A realm that mines out its own
  high ground must take more — and the ground it must take is occupied. Map pressure becomes conflict
  pressure through geography that already exists.
- **A map's composition starts mattering strategically**, not just visually. An ore-poor Broadwater
  start would play differently from an ore-rich Scatter, which is replayability arriving from the
  generator rather than from added content.
- **The permanent verb survives.** Allocation still never retires; what changes is that some ground
  stops answering, which is a reason to re-decide rather than a chore.

**Open, and deliberately not decided here:** whether depleted ore returns slowly or never; whether a
mined-out hex still holds people; whether depletion is per-hex or per-resource-per-hex; and what it
does to the storage-cap question, since extractives are exactly the resources whose caps retire at
Iron.

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

> **Superseded 2026-08-23 by *Population Lives Somewhere*.** Population is never a lever, in any
> age: it lives on hexes, grows toward a terrain-set cap, and is written to by the world rather than
> set by the player. The table above and the anchor-noun ruling stand unchanged; only this
> two-phase account of population does not. The instinct below — *"there is no second number"* —
> turned out to be exactly right and simply arrived two ages late.


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

> **BOTH MECHANISMS BELOW WERE DELETED (engine rework E2–E3, and the one-board ruling). Kept because
> the PROBLEM they solved is still real and will need an answer again.** `consolidate` and
> `outputMult` are gone from the code and from every manifest; the map never regenerates at all now.

**Border policy, as designed (historical).** Stone→Bronze is a **1:1 relabel** — pure text, zero
re-balance, protecting the proven early pacing. **Consolidation begins at Bronze→Iron** and cuts
**deep**: you enter an era holding a *handful* of tiles, each weighty enough that gaining or losing
one is an event. The trick that made depth free: consolidation paired with an **era output
multiplier** so that `keep × output ≈ 1` — total throughput unchanged, every existing cost still
valid, no re-tuning cascade.

**What replaced it.** The scope of an age is now expressed by `dominionCap` (Stone 7, Bronze 12, Iron
20) and by per-terrain `popCaps` that climb per era — **caps-as-era-scope rather than
caps-as-housing**. An age gets bigger by being allowed to *hold* more and by each hex supporting
more, instead of by having your holdings folded together at the border. That is a gentler instrument
and it keeps the board continuous, which the one-board ruling requires.

**The open half, stated so it is not lost:** consolidation also answered *"how does the number of
things you manage stay small as the empire grows?"* Nothing answers that yet. At Iron you hold up to
twenty hexes and click each one. Later ages cannot keep adding rungs to that ladder, and the
delegation idea in *A Game You Watch* is where the eventual answer probably lives.

**The map never regenerates.** *(One board, forever — owner ruling, `map.md` §2.6.)* The old rule
regenerated when the tile noun changed; that is gone, because ground you rebuild is ground you cannot
re-dress, and the per-era re-dress is the whole visual arc. Only a `GEN_VERSION` bump reshapes a
world, and that is a deliberate dev-time act.

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

### The Noun Table — every ladder in one place

**This is the sheet to ponder.** Everything below re-denominates, or should. The rule is
`design.md`'s own and it is not a schedule: **a noun changes when the SCOPE changes, not when the era
does.** Bronze keeps *clearing* on purpose; Silicon keeps *Bloc* on purpose. A row that changes every
single age is a row that is probably being changed out of tidiness rather than meaning.

**Filled cells are authored and live in the manifests. Blank cells are undecided.** Nothing here is
implied by anything else — if a cell is empty, the game has no answer yet.

**STANDING RULE (owner, 2026-08-25): decide a noun at the era that exists, never in advance.** This
document used to say pick the whole ladder in one pass, and the owner retired that himself —
*"definitely also an artifact from a simpler game where I thought we'd be doing space stuff by now.
When we add a new era, we'll find new nouns if needed."* Filling twelve rows for ages whose scope is
undesigned is guessing with extra steps, and it manufactures exactly the kind of commitment the
standing no-more-eras rule exists to avoid. The blank cells below are the correct state, not a
backlog.

#### 1. The scale ladder — the three nouns that carry the whole fiction

**Two columns collapsed into one when this shipped.** The table originally had *a person is a…*
and *the odometer counts…* as separate rows to fill. They are the same noun: `popNoun` **is** the
odometer's noun, because the odometer is the topline population number. There was never a second
ladder to author.

| Age | A tile is a… | A person is a… *(and what the topline counts)* | ×souls |
|---|---|---|---|
| **Stone** | clearing | settler | ×1 |
| **Bronze** | clearing | family | ×1 |
| **Iron** | holdfast | **subject** | **×200** |
| Enlightenment | city | | |
| Gunpowder | colony | | |
| Industrial | territory | | |
| Mechanized | nation | | |
| Global | bloc | | |
| Silicon | bloc *(held)* | | |
| Space | settlement | | |
| Galactic | world | | |
| Kardashev | system | | |

> ✅ **The collision is closed, and the compiler now refuses it.** Iron's `popNoun` was **holdfast** —
> the same word as its tile noun — so the game counted PEOPLE and called them PLACES, and the POP
> tooltip read *"every holdfast counted here stands on one of your 20 hexes."* Correct while
> population *was* tiles; wrong from the moment the engine rework made it a real per-hex variable.
> This is the fight this document already refereed once (*"a name you have to defend is a name two
> concepts are fighting over"*), so rather than just fixing the value, **`validateManifests` now
> rejects any era whose `popNoun` matches its `tileNoun`.** A validator is cheaper than refereeing it
> a third time.

**The ×souls column is the topline POP number** (owner ruling, 2026-08-25, shipped same day): the
inflated, fiction-true count at the top of the screen, `people × ×souls`. The small true number never
appears there — it lives on the tile, where it is a lever. Stone and Bronze are ×1, so the two are
the same number and nothing changes until Iron, where a 20-hex realm reads as roughly **60,000
subjects** instead of 300 people.

**The ledger label re-denominates with it** — the row reads SETTLERS, then FAMILIES, then SUBJECTS.
It was a hardcoded "Pop", the one part of that row that never climbed while the noun beside it did.

#### 2. The military ladder — small counts, bigger words

**The counts stay small and true forever** (rule 1: the odometer never enters a stepper). A unit
costs exactly one hex-person, so a unit already *is* one person's worth of souls — the arithmetic
never needed fixing. **Only the nouns do:** "3 Horsemen" defending 60,000 souls reads wrong, "3
Cavalry" does not.

| Age | foot | missile | mounted | siege | where they muster |
|---|---|---|---|---|---|
| **Stone** | Soldier | — | — | — | Barracks |
| **Bronze** | Soldier | Archer | Horseman | — | War Camp |
| **Iron** | | | | Siege Engine | Muster Ground |
| Enlightenment+ | | | | | |

*Units have never been renamed per era — `name` is authored once and inherited. Making it an
era-fact is the same move `popNoun` already made.*

#### 3. The world ladder — what your neighbours are called

**Already working, and the best-proven row on this page.** The same three peoples and the same sites
in every age; only what they have grown into changes.

| Age | a minor site | the hill people | the river people | the plains people |
|---|---|---|---|---|
| **Stone** | the camp at %s | the hill camps | the river camps | the salt wanderers |
| **Bronze** | the steading at %s | the Hill People | the River Folk | the Salt Wanderers |
| **Iron** | the freehold at %s | the Hill Clans | the River Kingdom | the Salt Nomads |
| Enlightenment+ | | | | |

#### 4. What can be built on a hex

Structures are authored per era and **inherited**, so a farm learned in Bronze is still a farm in
Iron. They re-dress by the same rule as everything else — *when the scope changes, not when the age
does* — and the owner has already ruled on the two that exist: **a farm is a farm to the end of
Earth**, while **a fortification cannot be**, since a mechanised total-warfare society does not hold
a border with stone palisades.

| Age | worked fields | a fortified border |
|---|---|---|
| **Stone** | — | — |
| **Bronze** | **Farm** *(Farming)* | — |
| **Iron** | Farm *(held)* | **March-hold** *(Fortification)* |
| Enlightenment | *(held)* | |
| Gunpowder+ | | |

*The march-hold's name comes from the medieval "march" — a contested borderland — where a marcher
keep held off incursions before the kingdom's armies could move.*

#### 5. Nouns that deliberately do NOT climb

Recorded so nobody "fixes" them later:

- **Raid types** — *warband*, *massed charge*, *band of riders*. These name a SHAPE of attack, not a
  scale, and the same three shapes roll in every age. (*Warband stays available early by owner
  ruling; it is a raid type, not a unit.*)
- **Resources** — food, wood, stone, copper, tin, bronze, iron, steel, gold. A resource ladder is
  the era list itself; the words are the words.
- **The infirmary line** — Medicine Tent → Infirmary, then held. One change, at the point the scope
  actually changed.

### Conquest Growth & the Peace Path

*(Settled 2026-08-21 — the Iron rework, and the spine of every era after.)*

1. **Deep consolidation, offset by output.** Enter Iron with single-digit holdfasts. Each is a couple
   dozen people under a lord; each one matters. *(Built 2026-08-22: keep 0.25 × output 4. A ruling
   made in-build and now canon: **the fighting bands are not consolidated at a levy border** — they
   are no longer population, so the keep ratio has nothing to say about them. If they overflow the
   smaller levy cap, training refuses until the dominion grows into them; existing state is never
   destroyed by a cap.)*
2. **Units are levied, not consumed.** `popCost` dies at Iron. Army capacity = holdfasts × levy rate:
   population stops *containing* the army and starts *supporting* it. Conquest therefore also grows
   your muster.
3. **Housing retires at Iron.** The first founding building retired — exactly the removal the manifest
   architecture was built for.
4. **Growth is conquest, settlement, or conversion — always an active verb, never a tick.** No
   automatic arrivals. Stopping growth is a player choice (the housing cap's one good job, replaced
   by intent). Passive attraction is shelved for the Enlightenment — cities petitioning to join
   because morale runs high. *(Amended 2026-08-22, user ruling: **every hex has a gameplay purpose**
   — wilderness is claimable, so the growth verbs are subdue a minor, settle empty land, and (with
   priests) convert. Settling is queued, timed, resource-priced work — "Establishing a minor lord in
   [hex]" through the Underway queue — which makes the queue the standing anti-speedrun governor.
   The designed population budget becomes the landmass itself: bigger, still finite, still authored
   by the map.)*
5. **Two adversary tiers.** Named majors remain strategic entities. Each era's slate adds a **minor
   tier** — freeholds and petty lords, numerous, individually weak, each worth one sworn holdfast plus
   a modest stock. The era's capturable units are therefore a **designed population budget**: growth is
   finite, authored, and paced per age. This scales forever — you conquer a holdfast before its lord
   swears fealty for the same reason you'll one day conquer a planet before it joins your empire.
   *(Shipped 2026-08-22: five seats per iron world from a hand-authored name pool larger than the
   count, stats rolled in authored ranges, placed by the seeded generator. Alongside them, per the
   same-day ruling, the budget widened to the landmass itself: empty land is settleable — priced,
   timed, queued work. Subdue is fast and pays the whole stock; settle is safe and pays only the
   ground; and the supply-line rule makes each taken tile cheapen the next march past it.)*
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

### Every Civilization Keeps Its Own Time — the era clock

*(Consensus 2026-08-25; not yet built. The night's arc: the caps discussion → "the game is still not
hard enough" → this. The owner's framing, which is the whole idea:)*

> *"In Age of Empires and especially Empire Earth, they never just beat you with width. They ADVANCE
> FASTER. You're like alright lads, let's carefully load those muskets, and then a Panzer division
> comes through the tree line."*

**The mechanism, in full, because it is small:** at worldgen every adversary draws a pace —
*slower / normal / faster*. From the first tick, each runs a hidden countdown to its next era,
weighted by that pace. When it lapses, they advance, the Chronicle says so, and their next strike
comes with next-era units. No economy is simulated; nothing else about them changes. That is the
entire feature, and the wire that makes it real (below) is most of the work.

**Why this is the missing piece and not just another lever:** *A Game That Cannot Be Lost* records
that the era advance is already the win condition, repeated — and that advancing is a formality, so
the race has no tension. The clock is the deadline that turns the capstone from a shopping list into
a race. It is the first mechanic in the game that answers *"why now?"* rather than *"why at all?"* —
the first reason to advance instead of engine-building forever, which is the failure mode the owner
names in his own board-game play. And every adversary anywhere on the map becomes a ticking clock
you can hear but not read.

**The rulings, all settled:**

1. **Absolute, never relative.** The player has no clock — advance or don't, to your heart's
   content. *They* have clocks, hidden ones, and not knowing the exact countdown is the tension. If
   their pace tracked the player's era it would be world-levels-with-you scaling: you could never
   fall behind, so there would be no race. Falling behind must be genuinely possible; so must
   outrunning them.
2. **Tick-based, never wall-clock.** Pause stops every countdown; fast-forward (planned) speeds them
   all. Both correct for free, and the never-punishes-leaving contract survives untouched — being
   away advances nothing.
3. **At least one "faster" adversary per world, guaranteed.** Independent rolls would leave ~30% of
   runs with no clock pressure at all and no visible reason the run felt flat. There IS a speedster
   out there. Which neighbour it is, you have to find out.
4. **Capped at the last implemented era**, exactly like the player.
5. **The telegraph is mandatory.** One Chronicle line — *word arrives that the Hill People work
   bronze now* — converts an ambush into a countdown you can see. This is how AoE does it and it is
   a heart-sink moment on purpose. It must also arrive EARLY: the owner accepts brutal starts (his
   Project Zomboid framing: most extinction spawns kill you immediately, and that's fine at 5–6 runs
   an hour) **because the verdict is fast**. A doomed run must reveal itself in minutes, never
   twenty-five minutes in. Same brutality, honest clock.
6. **An era gap reads as unit KIND early and unit NUMBER late.** The strength ladder is gentle in
   the early ages (Hill Clans 5 → 7 → 9) and that is correct — bronze barely moved in two thousand
   years, while the last thousand years and the next thousand are vertical. So an era-ahead raid at
   Bronze doesn't hit *harder* so much as hit in a **shape you can't answer** — archers and horsemen
   show up while you're still mustering spears; the counter matrix already exists to express it.
   Deep eras escalate quantitatively on top. Consequence, wanted: **falling behind gets more
   dangerous the longer the game runs.** That is the difficulty curve across the twelve-era span.
7. **The wire must exist, or the clock is flavour.** Today raid damage is
   `hexPop × min(raidTollMax, raidTollShare × raidSize)` — **the sender appears nowhere in the
   formula**. Attribution (C3) named the raider; the arithmetic still doesn't know they exist. The
   clock's raids must read the sender's era — roster, size, strength — or an adversary advancing
   changes nothing but a Chronicle line.
8. **Adversaries get "pressed."** They hassle each other offscreen — narrated, never simulated: a
   pressed adversary doesn't campaign, and the Chronicle says why (*the Hill People have troubles of
   their own*). This is the relief valve for the several-versus-one problem the merge creates (every
   threat on the map otherwise points at you, and simultaneous campaigns compound rather than add),
   it makes the *other* neighbours existing matter, and it is a difficulty dial: a run where nobody
   is ever pressed is a hard run. Adversaries never actually target one another mechanically.

**The structure it forces, chosen deliberately for the future:** a `civs` list. The player is entry
0; adversaries are entries 1..n; each carries an era, and advancing is the same operation for every
entry. **The era stops being global state and becomes a property of each civilization, the player
included.** People advance at different rates in board games. This is also the first mutable state
an adversary has ever had — the cheapest moment there will ever be to put it in the right shape (see
the multiplayer note under *Explicitly Out of Scope*).

**What the clock does NOT fix, recorded so nobody expects it to:** the clock only bites a player who
falls behind. A player advancing on pace meets it never — and the owner's on-pace Bronze playtest
was thriving with zero military. On-pace friction is the economy's job (see the calibration
correction in `todo.md` 4b); the clock is escalation on top. Both, or the game is easy right up
until it is unrecoverable.

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

> **Amended (2026-08-25), by exactly one variable:** *an adversary has exactly one mutable state —
> an **era**, advancing on a fixed tick countdown set at worldgen. Nothing else about them is
> simulated, ever.* See *Every Civilization Keeps Its Own Time*. The rule's honest ground also
> shifted: the ban was framed as performance, but the board draws 68,716 prop instances at 60fps —
> hundreds of countdowns would be free. What the rule actually protects is **explainability**: a
> raid that arrives because a hidden granary filled six minutes ago cannot be narrated by the
> Chronicle; a countdown can. The old rule just said no; this one says exactly how much yes, which
> is a line that can be defended against future ideas. (If a fuller sim is ever wanted, it is a
> stress-test step on the far road to multiplayer, not a temptation for now — the project keeps
> getting stuck at three eras figuring out what the game is, not what the bots are.)

**Flavor is load-bearing (canonical).** Adversary strength is *hinted through description*, never
through printed odds — "a fortified state, rich beyond counting" is how a player learns that raiding
the Kingdom early is a mistake, and playtest confirmed the read works. Raw numbers may appear (this is
a numbers game); the *judgment* — is this a fight I take? — belongs to prose and dice. The corollary
cuts harder: **descriptions are mechanics-bearing text.** An adversary whose flavor undersells or
oversells its strength is a bug of the same class as a wrong cost label, and no validator can catch it.
See `map.md` for how the adversary pool keeps this honest as the roster grows.

**Neighbours are not painted as enemies (2026-08-25).** Powers and steadings wear **white** on the
board, not red. Most of them are not hostile — two of the three ship `disposition: "peaceful"` — and
colouring every neighbour red pre-judged standing, caravans and the envoy before the player had met
anyone. Red is reserved for status now. See `interface.md` → *The board's colour law*.

**A raid has an author, from the age that could have one (C3, shipped 2026-08-25).** The Chronicle
names who raided you — *"the Hill Clans test your defenses"* — and the gate is the **`contact`**
era-fact that already distinguishes *there is nobody who could send an army* (Stone) from *there is*
(Bronze, Iron). No new era-fact was needed; the beat fell out of one that existed. So Stone's danger
is real and **anonymous** — a warband out of the dark, belonging to no one on your map, because
nobody in a stone age can raise a column — and from Bronze the same danger has a name and an address.
**This is the payoff for seating the roster from the first minute:** the peoples you have been
watching since your first clearing turn out to be the ones who were coming.

Two rules keep it honest. **Only warlike neighbours are ever blamed** — a peaceful people raiding you
would be a disposition change with its own fiction, not a quiet exception. And **a grudge decides who,
never whether**: the trigger roll and `hostilityMultiplier()` upstream already make anger raise the
*rate*, so standing only weights which warlike neighbour gets named. Attribution adds no danger; it
adds a subject to the sentence.

**WANTED, AND DELIBERATELY NOT IN THE FIRST VERSION: the frontier should defend worse.** Once defence
is per-hex, folding `adminDistance` into the local factor makes a far-flung holding genuinely harder
to hold than the ground beside your seat — which is the rule the whole spatial economy has been
pointing at, and the owner wants it.

It is held back **only to keep a refactor and a rebalance separable.** Making defence per-hex changes
no odds at all if the local factor starts at 1.0 everywhere; adding a distance penalty in the same
change would substantially rebalance raids while the architecture underneath them was also moving,
and a bisect could not tell the two apart. Ship the seam, play it, then turn this on as its own
decision with its own number.

**SELECTION AND RESOLUTION ARE SEPARATE PHASES** *(owner ruling, 2026-08-25, and it is the rule that
keeps fortifications and raid-roads from ever colliding)*:

> *"The selected raid always goes ahead. Fortifications just push or pull on the resolution and the
> numbers that come from it."*

**SELECTION** decides that a raid happens, who sends it, and where it lands. **RESOLUTION** decides
what it costs. **Nothing the player builds may touch selection.** Fortifications, walls, garrisons —
all of them act on resolution only.

**Why redirection was rejected, and it fails on its own terms before it fails on any other.** A
fortification that steers raids away has two possible outcomes and both are bad: either the raid does
not happen, so the building is *safety* and deletes the danger rather than managing it; or the raider
marches around it, which is pathing simulation and means fortifying only ever *displaces* the problem
— you could never actually defend, only move the wound.

**The structural payoff:** raid-roads (`5c`) change SELECTION — a raid comes from a named people along
a route. Fortifications change RESOLUTION. The two operate on different phases, so they cannot
conflict by construction rather than by careful tuning.

**One architectural fact this has to live with today:** raid resolution is settlement-GLOBAL and only
the victim hex is local. `militaryStrength()` sums the whole army, `repelChance` is one roll for the
settlement, and `stealResources()` hits your stores; the single local step is `strikeHex()` choosing a
hex and `killAt()` taking people from it. So a per-hex fortification lands cleanly on the local half —
a raid striking near a fort takes fewer people. Letting a fort raise the GLOBAL repel roll is
defensible fiction but means a fort anywhere helps everywhere, which quietly undoes the geography
forts exist to create.

**Where raids are going: a name, a home, and a road** *(owner intent, 2026-08-25 — previewed, not
scheduled)*. *"Raids being fairly random is probably going to die when named adversaries arrive in
Bronze. I eventually want you to be able to see which adversary raided you, and what path they took
from their home hex to get there."*

**Half of it already shipped, the same day.** `raidAttribution()` names the raider from Bronze on, so
the Chronicle already says *the Hill Clans* rather than *a warband*. What is missing is the spatial
half, and recording the pieces now because they are not obvious:

- **It is not only a drawing — it should move where raids LAND.** `strikeHex("raid")` currently picks
  its target exposure-weighted by `population × adminDistance`, i.e. distance from *your* seat. If a
  raid comes from a named people, exposure should be measured from *their* seat instead. Raids would
  then fall on the ground nearest the raider rather than merely on your frontier, which is what makes
  geography defensive — and it is the mechanic that gives **Build Fortifications** something real to
  protect against (see *Building on a Hex*).
- **`routeCost()` returns a COST, not a route.** It is a multi-source Dijkstra from your whole
  dominion; drawing the road a raid took needs a path *from one seat to one hex*, which means
  retaining predecessors. Small, but it is a new function rather than a caller of an existing one.
- **It does not breach the pathing ban, and the reason is worth writing down once.** *Out of Scope*
  forbids rendered units and movement along routes — a raid's road is a **diagram drawn after the
  fact**, the same information the muster sheet already prints as text, with nothing travelling along
  it. The motion law governs the rest: drawing itself once as the raid lands shows a CHANGE, which is
  allowed; anything that pulses or crawls afterwards would be a STATE, which is not.

**The shape, elaborated by the owner** *(2026-08-25)*: something moves an adversary to raid; they
choose a target **and a route**, and the route has terrain costs — plains cheap, high ground dearer,
wetland dear, **a fortification dear** — so the path bends around what you have built. The player
does not watch it happen. **A raid is a thing that HAPPENED**, and afterwards you click the event and
the board shows it: the raiders' home hex, and a line of hexes to the one they struck. *"I DO want
the path to be legible because it's useful information that tells you if you need more defenses."*
**Symmetrical by intent** — your own campaigns should be able to draw the same road.

Three things that are not in that sentence and are cheap to know now:

- **The owner predicted this himself, three days earlier.** `map.md` → *Observed: the board writes
  fiction before the rules do* records him reading a defensible position off a fresh Stone board —
  three sides mountains, one side water — and wanting to hold it, when no mechanic supported any of
  it. The note concluded that this *"points at the most natural next rule for routes — **terrain-aware
  movement cost** — because the player already assumes it exists. A rule that merely confirms an
  instinct the map already created is much cheaper to learn than one that has to be taught."* That is
  this feature, arrived at from the other end.
- **Two of the named terrains do not exist.** The generator ships `plains`, `forest`, `hills`,
  `river`, `water` — there is no *wetland* and no *mountain*; `hills` is the high ground. Route costs
  can be authored per existing terrain today, but marsh and mountain are generator work, not a
  routing table entry.
- **The Chronicle is pure text, and clicking an event is the real architectural change here.** `log()`
  takes a string and a severity; entries carry no identity and no payload. "Click the raid to see its
  road" means Chronicle lines become records with data attached rather than sentences. That is the
  one part of this that is cheap to design for now and annoying to retrofit — the same shape as
  tagging each prop instance with its tile before the animation needed it.

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

**One board, forever** *(settled 2026-08-22; full treatment in `map.md` §2.6)*. The world is
generated once, at full size, and never regenerates. Eras change what you can see and what you can
do; they never change what the world is — **the map is always there, what you can do and see
changes**. Unreached country is not drawn at all — the world visibly **accretes out of the void**
as you chart it (re-ruled by a live look test 2026-08-24; the unpainted-board idea it replaced is
kept in `map.md` §2.6) — and the rule that keeps discovery honest is unchanged: **the unknown
hides the board, never the pieces**: charting reveals *land*, which is permanent and cannot be
falsified later, while *who lives there* is a separate layer that arrives with the eras. A run
opens on a pregame screen offering three continents as bare outlines — you choose the shape of your
world while learning nothing about its contents — and each continent simply *is* a seed, so one
number still reproduces an entire run, coastline included.

Two consequences reach beyond the map. **Scouting becomes the Stone Age's spatial verb**, which
makes the map interactive from the first minutes instead of inert until Iron, and softens the
Bronze→Iron cliff by making only the verbs new rather than the whole surface. And **the board is
finite on purpose**: Earth is a sphere and civilizations fill it, so running out of room is not a
limitation to engineer around — it is the pressure that sends you to Space. Geography becomes the
motivation for the final act.

---

## Explicitly Out of Scope

- **RTS unit fidelity.** No per-soldier sprites, no continuous movement, no drawn battles, no
  formation micro, nothing that rewards clicking fast.

> **SCOPE CORRECTED AGAIN (owner, 2026-08-25).** This entry read *"Rendered units and pathing.
> Never, in any age. No armies on the board, no movement along routes, no tile-by-tile marching"* —
> and it fell the same way the map ban fell, and for the same reason: it was aimed at RTS spatial
> micro and pointed at a broader noun. *Armies Take the Field* puts army GROUPS on the board as
> single fixed markers that step hex to hex via the sink-and-rise the board already owns. Owner:
> *"these set-in-stone rules are mostly suggestions at this point"* — the game changed shape under
> the rule. What the rule was really defending is kept, sharpened, above: fidelity and twitch,
> banned forever. A marker on a hex is a board-game piece, not a unit.
- **Animation as an ambient state** — swaying trees, idle pulses, drifting anything. See the scoped
  ruling below; the board is still at rest.

> **SCOPE CORRECTED (owner, 2026-08-25).** This entry read *"Rendered units, animation, or pathing.
> Never, in any age"*, and that flat ban was an over-compression of the Premise, which scopes the
> whole clause to UNITS: *"strip out everything that requires graphical fidelity of **units**. No
> rendered armies. No pathing, no animation, no unit micro."* The premise never banned motion as
> such; it banned simulating armies. The owner's ruling restores the narrower reading — *"I am sure
> I want that as an option, but it must be used LIGHTLY. Like for a re-dress, but otherwise the hex
> objects are immobile."*
>
> **The law that replaces the flat ban, in two halves:**
>
> 1. **Motion happens only at the moment of a change, and only to the thing that changed.** Nothing
>    on the board moves on its own, ever. No ambient drift, no idle motion, no attract loop.
> 2. **Motion may show a CHANGE, never a STATE.** This is the sibling of the opacity law
>    (`interface.md`): when the movement settles, the board must read exactly as it would if you had
>    blinked and missed it. Nothing may be legible only by having watched it move.
>
> The worked example is the **era re-dress**: old props sink into the ground, new ones rise in their
> place. It plays during the era ceremony, which already holds the world under a modal — so the
> simulation is stopped while the board changes clothes, which is the right register for it. Props
> sinking below a hex's top face are occluded by the slab for free; no clipping plane is involved.
- **Real-time reflex or twitch mechanics.** This is a numbers game.
- **Unit micromanagement.** Assigning a headcount to a job is the floor and the ceiling. Not because we
  couldn't, but because it isn't the game.
- **Multiplayer.** Still out — but *(owner, 2026-08-25)* adversaries are henceforth designed
  **player-shaped** wherever it costs nothing: the `civs` list, era as a property of every
  civilization, raids as inbound campaigns. The hope of one day turning this multiplayer is far
  enough away to barely be worth considering — except in this one way: symmetric structure now makes
  that transition additive instead of a rewrite. A constraint, not a plan.
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

1. **The name.** "Idle Civ" is wrong now. "Paper Civ" was floated and died with the paper identity — (3) resolved against it.
   Deferred deliberately until the pivoted game is playable — deciding a name against an imagined game
   is how you get a name you have to change twice.
2. ~~**When does the map take the centre of the interface?**~~ **DONE (2026-08-22, "the flip").**
   Structure shipped ahead of 6d; the remaining half of phase 9 is the visual identity — see (3), since
   resolved: the digital tabletop. Original text: The
   stated end-state is **map in the middle, controls on the edges of the screen**, with the Expeditions
   panel dissolving into the map rather than surviving beside it — a list of adversaries next to a map
   showing the same adversaries is the worse of the two. Only the *timing* is open, and it is gated on
   having a map good enough to deserve it. Until then Bureau's 4×2 grid stands and is not in question,
   and phase 8 must be buildable without answering this.
3. ~~**Does Bureau survive the map? / What replaces it?**~~ **RESOLVED (2026-08-22, evening): the
   identity is THE DIGITAL TABLETOP.** The same evening paper died, a time-boxed Three.js spike
   (`/spike3d/`) rendered the real generator's world as a lit 3D diorama — and the user's verdict
   was immediate: the coolest thing any of these browser games has produced, premium-feeling before
   a single purchased asset, and above all **it reads as a beautiful physical board game**. That
   read is now *invited, deliberately*: depth, shadows, pieces on a board — "you could translate
   this to the tabletop" is the compliment to court. Palette direction: **bright and warm**
   (Stardew-adjacent), never grimdark. And the fit was never accidental — a hex board, buy cards,
   one ceremony modal at a time, seeded dice, small tactile numbers, no animation: the game had
   been converging on *board game* all along; the diorama revealed it rather than changed it.
   The art economics sealed it: 2D painterly tilesets dead-end at medieval and cost linearly per
   era; the 3D route's terrain is free (geometry + lighting), eras are prop-set/palette/light
   swaps, and one coherent model-pack family covers neolithic→space for a few hundred dollars.
   Where extra art money goes instead, per the user: **era-advance splash illustrations** for the
   transition ceremony, and **a premium SVG icon set** (wanted regardless). **Bureau's laws still
   outlive Bureau** — no opacity for state, the semantic channel, legibility over texture,
   words-not-meters. The Claude Design thread now designs panel legibility against the diorama.
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
