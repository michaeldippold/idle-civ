# Idle Civ — Design Document

## Premise

Take a civilization-building game — the Age of Empires / city-builder shape, an economy of workers, resources, and buildings — and strip out everything that requires graphical fidelity. No map. No rendered units. No pathing, no animation, no art budget. What's left is the part of that genre that was always actually a numbers game: assign people to jobs, manage what they produce, spend it on growth. Idle mechanics fill the gap where the graphics used to be — the game plays itself while you're not looking, the way *A Dark Room* or *Melvor Idle* do, but the content it's simulating is a settlement, not a text-adventure or a RuneScape skill grind.

The pitch in one line: **you start by feeding a fire (or foraging for food), and by the end you're managing something like intergalactic trade — and the interface never stops looking like a page of ruled boxes in pencil.**

## Touchstones

- **A Dark Room** — start with almost nothing on screen. One button. The interface itself unravels as the simulation grows, so complexity is *earned*, never dumped on the player up front.
- **Age of Empires / RTS economy** — the actual systems being modeled: villagers assigned to gather, food as the gate on population, buildings that convert resources into more capability. Idle Civ borrows the economic shape, not the real-time unit control.
- **Melvor Idle** — proof that a beloved graphical game (RuneScape) can be rebuilt as numbers-and-menus and still be genuinely engaging. Same bet, different source material.

## Design Philosophy

**Unravel, don't dump.** The screen starts almost bare — three settlers, three empty jobs, no visible resources. Every panel, every resource row, every building option appears only once it's actually relevant (you have wood, you have shelter, you're past your first hut). The interface is a readout of what the settlement has *discovered how to do*, not a menu of everything the game could ever do.

**Friction is the game.** Early testing surfaced a real risk: an idle game with escalating production and no counter-pressure gets "solved" and beaten in minutes. Every friction mechanic added since has been in direct service of that problem — food upkeep that can starve you, storage caps that make surplus rot instead of stockpile forever, construction costs that escalate per building (even ones sitting unbuilt in the queue), a build queue that serializes progress instead of letting resources alone dictate pace. None of these exist to be punishing for their own sake; they exist so growth has to be *managed*, not just accumulated.

**The Chronicle tells the story for free.** The single best thing to come out of early builds wasn't a system — it was flavor text. Lines like *"With shelter secured, your people turn to better tools"* cost nothing mechanically; they just narrate a state change that was already happening. This became a deliberate principle: every meaningful event in the simulation — a birth, a building completed, a hazard survived or not — should produce a line in the Chronicle. The log isn't a debug console, it's the settlement's memory. No extra rules overhead, just flavor riding on top of state that already exists.

**Spartan, monochrome, paper-and-pen.** No shadows, no gradients, no color as decoration. Off-white background, near-black ink, hairline borders. Color is reserved entirely for *meaning*: green means genuinely new good information (a birth, a hazard averted), red means danger (starvation, spoilage, a hazard that landed), amber is saved for rare milestones. Buildings you own aren't just a number in a buy menu — they get a small line-art icon and sit in a "Settlement" panel you can actually look at, the compromise between "no map" and "nothing to see." The whole thing should look like something you could rule out on paper with a black pen and, occasionally, a red one.

**Small numbers, slow start, on purpose.** The opening minutes are deliberately unhurried — gather rates, build times, and growth costs all err slow. This is being tuned by feel as we go, not locked to a formula, but the standing rule is: if a mechanic makes the game solvable in minutes, that's a bug, not a feature.

**New panels appearing is part of the fun.** The interface doesn't just unravel once at the start and then hold still — it keeps growing as the settlement does. Discovering that a new building unlocks a whole new panel (Barracks unlocking Training, say) should feel like an event in itself, not just a new button in an existing list. The screen scaling up *is* the sense of progress through the eras, which matters a lot given nothing is ever rendered on a map to show that progress visually any other way.

**Active early, idle late.** The engagement curve is supposed to invert as the settlement grows, not stay flat. Stone Age should grab you the way the first twenty minutes of Cookie Clicker do — every choice close, every resource worth watching, hard to look away. (This is confirmed, not just hoped for: an actual bystander playtest — someone handed the game with zero context — couldn't tear himself away during Stone Age. That's the era doing exactly its job.) By the time you're eras removed from that, the same panels, the same queue, the same buttons should be running something that takes real hours to finish, and that's not a failure state — it's the design working as intended. Training a Stone Age Soldier costs roughly 10 seconds of real time; building a Starship, many eras later, should cost something like 6 hours. Same interface, wildly different pace, entirely on purpose.

This is the literal mechanical proof of the founding pitch (see Premise): the game is supposed to explode in scope while the interface never changes shape. If it doesn't actually get all the way to space, it's just a worse Age of Empires with the graphics removed. Reaching that endgame isn't a stretch goal tacked on later — it's the bet the entire premise is riding on.

## The Core Loop

Forage → grow → hit the housing cap → build a hut → grow again. That's the entire loop at minute one, and it stays recognizable even as more resources, buildings, and hazards layer on top. Food is the pacing resource (it gates population and can kill you); wood and stone are investment resources (they gate buildings); population is both the goal and the constraint (more settlers means more production *and* more mouths to feed).

## Systems

### Settlers & Jobs
Settlers are assigned to gather jobs (forage / chop / mine) with a simple stepper — no pathing, no individual identity, just a headcount per job. Every settler eats, whether working or idle, which is what makes population growth a real trade-off rather than a pure win.

Population isn't one undifferentiated number — it's a small roster of **person-types**, each shown as its own icon-and-count tile (visually similar to how Settlement shows owned buildings, but living in the Your People panel instead, since "who your people are" and "what you've built" are different questions). Right now that's just **Settler** (the default, freely assignable to any gather job) and **Soldier** (see Military, below); the tile format is deliberately built to scale to several more person-types later without needing a redesign.

### Resources & Storage
Resources accumulate passively based on job assignment. All three now have a storage cap before their storage building is built — go over it and the surplus is lost, not just stalled. For Food and Wood this is literal rot; Stone doesn't rot, and the design conversation that added its storage cap said so explicitly — the justification is purely "unorganized stone piles are hard to make use of," gameplay symmetry over strict realism. It's the soft, thematic version of a hard cap either way: it doesn't block you, but it punishes ignoring the problem, and it's what makes Granaries, Woodsheds, and Stone Yards feel necessary rather than optional.

### Construction
Buildings are bought with an immediate resource cost (payment happens at the moment you click) and then sit in a **queue**. Only the item at the front of the queue actively progresses — the rest wait their turn, which is the game's stand-in for the "one thing gets built at a time" pacing of a real settlement, without asking the player to manage workers on a construction site. (An earlier version required manually assigning idle settlers as builders, AoE-style; it was cut as too much micromanagement for an idle game — the queue itself now *is* the scarcity.) Costs escalate per building type the more of that type you own *or have queued*, so stacking up five huts at once doesn't undercut the intended cost curve.

### Buildings
Three families so far: **storage** (Granary, Woodshed, Stone Yard — raise how much you can hold before loss), **production boosts** (Drying Racks, Lumber Camp, Stone Pit — a flat percentage bonus to one job's output), and **hazard defense** (Infirmary, Barracks — reduce or unlock mitigation for a specific Event). More families are the obvious way this game grows — the intent is that later eras introduce entirely new building categories, not just bigger numbers on the old ones.

Most buildings scale freely (own as many Huts as you can afford). A few are **capped** — Barracks is the first: you only ever need one, since it's a permission to train Soldiers, not a stacking bonus. A capped building's buy-card greys out at "Maxed" once you've hit the limit, same visual treatment as an Upgrade you already own. This is a real third category — not quite the uncapped stacking model, not quite a one-time Upgrade either — and it's expected more buildings will fall into it as the game grows (some future facility that unlocks a capability without itself needing five copies).

**Stone Tools** is meant to be the first of a recurring pattern, not a one-off: one broad, cheap, early, flat-percent Upgrade to *all* gathering per era (a Bronze Age equivalent should exist once that era is real). Deliberately available almost immediately — it competes directly with your very first Hut for early wood, which is intentional tension, not an oversight — and deliberately small (8%), on the standing principle that new numbers should start conservative and get walked back up rather than the reverse. That principle applies everywhere in this game, not just here: when unsure, tune toward too-hard and loosen later, not the other way around.

### Events
The mechanism for anything that *happens to* the settlement rather than something the player *does*. Every event has the same four-part anatomy:

1. **Trigger** — either a steady random chance per second (a hazard, a windfall), or a condition that fires deterministically whenever it's true (population growth: whenever there's room and enough food).
2. **Effect** — what actually changes in the settlement.
3. **Negate potential** — an optional counter: a specific building that, the more you've built, reduces the odds the event's downside actually lands. Enough Infirmaries and sickness stops being a threat at all.
4. **Flavor** — Chronicle text, varied across a few options, split between "it happened" and "it was averted."

"A wanderer joins your settlement" — population growth — is technically the first and most common event under this system. **Sickness**, mitigated by the **Infirmary**, is the first real hazard built on it: unmitigated it's rare but real, an ever-present low hum of risk once your population passes a threshold, and it's the proof that the system generalizes to bad news, not just good news. **Conflict**, mitigated by a standing **Military**, is the second — see below.

For a while, every *probabilistic* event was bad news — Sickness and Conflict were both downside rolls, and the only good news (population growth) was deterministic, never a surprise. **Great Hunt** and **Trader** fixed that: small, ungated resource windfalls (Great Hunt gives food; Trader gives wood and stone) using the exact same trigger/effect/flavor shape as the hazards, just without a downside. There's no fairness reason to gate good news behind a population threshold the way the hazards are, so they aren't. The Chronicle now builds suspense in both directions, not just one.

An Infirmary's mitigation strength itself turned out to be upgradeable, not just its count — **Herbal Medicine** raises how much *each* Infirmary reduces Sickness's odds, rather than adding a new counter-building. That's a genuinely different lever than "own more of the building," and worth remembering as a pattern for other counters later (Barracks/Soldier-style scaling isn't the only option).

### Military & Defense
The answer to "what is a soldier": a **permanent conscription**, not a reassignable job. Training a Soldier goes through the same build queue as everything else (pay resources, wait a build time, get the unit) with one addition — it also permanently consumes one idle civilian, reserved the moment you queue the order (not when it completes), and that person never returns to the gatherable labor pool by player choice. The only way a Soldier count goes down is combat losses. This is deliberate: a freely reassignable defense stat is a costless toggle you'd flip up before trouble and down right after, which defeats the point. Soldiers still eat (ordinary population upkeep already covers this — no new formula needed) and still occupy housing; they just don't produce anything but the safety they provide. That's the commitment.

Equipment tiers are one-time **Upgrades** (reusing that system exactly as built for Fire Mastery): a weapon tier (Spear → Sword → …) raises the odds a raid gets repelled at all, an armor tier (hide → leather → …) raises the odds your Soldiers survive an engagement even when it doesn't go cleanly. Two different jobs — weapons help you *win*, armor helps you *not die even when you do* — deliberately kept separate so both matter.

**Conflict** (the Event) resolves in stages, so it's never fully predictable and never fully safe no matter how invested you are:
1. **Raid size** rolls first — usually a small scouting party, rarely something much larger. Not knowing which is coming is the point.
2. **Success check**: your defense (Soldier count × weapon tier) is weighed against the raid's size as a ratio, not a hard threshold — more investment always shifts the odds in your favor, but there is no number that makes you mathematically safe, and no number that makes you mathematically doomed.
3. **Consequences**, banded by how the check went: a clean repel costs nothing; a costly repel still costs some Soldiers (armor tier softens this); a raid that succeeds costs Soldiers, steals or destroys stockpiled resources, and — if your defense was especially thin — can cost civilian lives too.

Raid frequency scales with settlement size (a bigger settlement is a bigger target), the same way Sickness's *possibility* is gated by a population threshold — except Conflict's frequency is a continuous dial, not a one-time gate.

**Population itself becomes a buffer.** A settlement with people to spare can absorb a bad roll from Sickness or a raid; a settlement running lean with neither an Infirmary nor a Barracks is one unlucky event from real trouble. Growing your population is protective in that sense — but it's not a free win either, since more people also means more upkeep *and* a juicier raid target. Nothing in this system is supposed to feel purely additive.

**This is designed to scale by flavor, not by new mechanics.** Barracks/Soldier/Spear-Sword/Armor and, many eras later, Starport/Fleet/photon-weapons/shields are meant to be *the same underlying system* — population converted into a standing defense, gated by one-time equipment tiers, costing ongoing upkeep for passive protection — with only names, numbers, and Chronicle flavor changing per era. If that stops being true for some future era's version of this, that's a sign the era needs its own mechanic, not a forced fit.

### Failure
Two ways to lose now, not one. Starvation remains a hard stop (game ends, save clears, you start over). **Conflict is allowed to be lethal in the worst case** — unlike Sickness, which is deliberately floored at 1 survivor, an unmitigated or especially large raid can end a settlement outright. This is a deliberate asymmetry: Sickness is attrition, Conflict is a real threat, and the difference is what gives a Barracks and a healthy population genuine stakes rather than just being another number to grow.

## Eras (forward-looking)

Right now there is exactly one era: Stone Age. The long-term shape of the game is that era progression is what carries you from "feed the fire" to "manage intergalactic trade" — new resources, new buildings, new events, even new *vocabulary* (a wanderer doesn't "join your settlement" once you're off-world). Critically, **the interface itself should not need to change shape** as eras advance — no map ever gets rendered, no unit ever gets drawn, no matter how far the tech tree goes. Events are already tagged by era so the engine is ready for this.

**The transition mechanism is settled**, even though no era past Stone exists yet: advancing is a hidden, one-time capstone Upgrade (e.g. "Bronze Age") that reveals once its prerequisites are quietly met, and otherwise behaves exactly like every other Upgrade — it sits in the same build queue, costs real resources, takes real time, and completing it flips `S.era`. Nothing new needed there. Critically, **Sickness and Conflict keep rolling the entire time it's under construction** — that's deliberately where "and some luck" comes from (see below), not a separate mechanic bolted on for the purpose.

**Two rules that apply to every future age, canonical:**

1. **Every age must add a few new things, at a bare minimum.** The moment a capstone build completes, the interface changing should be a "whoa, look at this" moment, not a quiet reskin. If an age doesn't make the player want to poke around and see what's new, there's no reason for it to be an age.
2. **Ages come in two flavors, and knowing which is which shapes what "a few new things" means.** **Deepening** ages introduce a genuinely new mechanic or system (Bronze's weapon/armor tiers, presumably Silicon's automation). **Widening** ages mostly consolidate and reflavor what already exists onto a bigger stage (Enlightenment, Global, Kardashev in the list below) — but per rule 1, even a widening age still needs a *few* real new things, just fewer/smaller ones than a deepening age gets. Neither flavor is a "total restart" — that's the entire point of the distinction: most of what you've built carries forward, just reframed or folded together, so progress is never erased, only recontextualized.

**This game is meant to actually end.** Not a Cookie Clicker-style endless ascension with no finish line — Heat Death of the Universe (see the list below) is meant to be a real conclusion, one way or another. Very few civ-style games let you play until the universe itself runs out, which is exactly why it's the target.

### The Age List (flavor guide — not canon, expect it to move)

A loose north star, not an implementation backlog. Ages get built and played one at a time, each proven fun before the next is even scoped — this list exists so later decisions stay consistent with where the game is ultimately headed, not as a commitment to build all of it. Currently under active refinement (a mid-1900s "mechanized warfare" age covering tanks/bombers is being discussed as of this writing, which may reshape Industrial Age's scope rather than require cutting anything):

1. **Stone Age** (neolithic) — current, only implemented era
2. **Bronze Age**
3. **Iron Age** — medieval, knights and siege engines
4. **Enlightenment Age** — *widening*; cathedrals, monks, science
5. **Gunpowder Age** — revolutionary war to old west
6. **Industrial Age** — early-mid 1900s, lightly steampunk
7. **Global Age** — *widening*; expands Industrial to a whole-world flavor
8. **Silicon Age** — 2000 AD+, computers and robotics
9. **Space Age** — *The Expanse*-ish, same solar system
10. **Galactic Age** — starships, alien races
11. **Kardashev Age** — *widening*; solar-system/galaxy scale, Dyson spheres
12. **Heat Death of the Universe** — the game ends, one way or another

## Interactive Events (captured idea, not started)

A future direction, deliberately parked — not being designed or built yet, just written down so it isn't lost. Every event today resolves itself with nobody in the room: the player is never required to be present for Sickness, Conflict, or a windfall to play out, which is exactly what makes the game idle-friendly. The idea is a genuinely different category of event that *requires* a real decision in the moment. Example given during design discussion: a rival king demands tribute (some amount of food, some amount of gold) — pay it and the event resolves cleanly, refuse and roll for consequences.

The explicit note attached to this idea: **it's worth pursuing even if it means compromising how "idle" the game can be.** That's a real tension with the "Active early, idle late" principle above, not a minor implementation detail — an interactive event firing while the player is away raises real open questions (does it just wait for a response, indefinitely? auto-resolve to some default after a timeout? block other progress while pending?) that don't have an answer yet and shouldn't be guessed at until this is actually being designed.

## Explicitly Out of Scope

- Any rendered map, grid, or spatial representation of the settlement.
- Individual unit rendering, animation, or pathing.
- Real-time reflex or twitch mechanics — this is a numbers game, not an RTS.
- Multiplayer.
- Mobile as a first-class target — it should not actively break, but desktop is the designed-for experience.

## Open Design Questions

Things flagged during the build that need a real decision before they're implemented, not just a default:

- **Does the cost of the next settler ever come back down** after a population loss, or is the escalating growth-cost curve permanently cumulative regardless of deaths? Currently the latter, untested for feel.
- **How do eras actually transition** — a resource threshold, a building, a deliberate player action, a tech tree? Not designed yet; the player has ideas here not yet captured in writing.

Resolved this session: whether hazards can zero out population (yes, for Conflict specifically — see Military & Defense / Failure), and what a "soldier" is (a permanent conscription via the build queue, not a reassignable job).
