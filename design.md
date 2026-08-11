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

## The Core Loop

Forage → grow → hit the housing cap → build a hut → grow again. That's the entire loop at minute one, and it stays recognizable even as more resources, buildings, and hazards layer on top. Food is the pacing resource (it gates population and can kill you); wood and stone are investment resources (they gate buildings); population is both the goal and the constraint (more settlers means more production *and* more mouths to feed).

## Systems

### Settlers & Jobs
Settlers are assigned to gather jobs (forage / chop / mine) with a simple stepper — no pathing, no individual identity, just a headcount per job. Every settler eats, whether working or idle, which is what makes population growth a real trade-off rather than a pure win.

Population isn't one undifferentiated number — it's a small roster of **person-types**, each shown as its own icon-and-count tile (visually similar to how Settlement shows owned buildings, but living in the Your People panel instead, since "who your people are" and "what you've built" are different questions). Right now that's just **Settler** (the default, freely assignable to any gather job) and **Soldier** (see Military, below); the tile format is deliberately built to scale to several more person-types later without needing a redesign.

### Resources & Storage
Resources accumulate passively based on job assignment. Two of the three (food, wood) have a storage cap before any storage building is built — go over it and the surplus **rots**, not just stalls. This is the soft, thematic version of a hard cap: it doesn't block you, but it punishes ignoring the problem, and it's what makes Granaries and Woodsheds feel necessary rather than optional.

### Construction
Buildings are bought with an immediate resource cost (payment happens at the moment you click) and then sit in a **queue**. Only the item at the front of the queue actively progresses — the rest wait their turn, which is the game's stand-in for the "one thing gets built at a time" pacing of a real settlement, without asking the player to manage workers on a construction site. (An earlier version required manually assigning idle settlers as builders, AoE-style; it was cut as too much micromanagement for an idle game — the queue itself now *is* the scarcity.) Costs escalate per building type the more of that type you own *or have queued*, so stacking up five huts at once doesn't undercut the intended cost curve.

### Buildings
Three families so far: **storage** (Granary, Woodshed — raise how much you can hold before rot), **production boosts** (Drying Racks, Lumber Camp, Stone Pit — a flat percentage bonus to one job's output), and **hazard defense** (Infirmary, Barracks — reduce or unlock mitigation for a specific Event). More families are the obvious way this game grows — the intent is that later eras introduce entirely new building categories, not just bigger numbers on the old ones.

Most buildings scale freely (own as many Huts as you can afford). A few are **capped** — Barracks is the first: you only ever need one, since it's a permission to train Soldiers, not a stacking bonus. A capped building's buy-card greys out at "Maxed" once you've hit the limit, same visual treatment as an Upgrade you already own. This is a real third category — not quite the uncapped stacking model, not quite a one-time Upgrade either — and it's expected more buildings will fall into it as the game grows (some future facility that unlocks a capability without itself needing five copies).

### Events
The mechanism for anything that *happens to* the settlement rather than something the player *does*. Every event has the same four-part anatomy:

1. **Trigger** — either a steady random chance per second (a hazard, a windfall), or a condition that fires deterministically whenever it's true (population growth: whenever there's room and enough food).
2. **Effect** — what actually changes in the settlement.
3. **Negate potential** — an optional counter: a specific building that, the more you've built, reduces the odds the event's downside actually lands. Enough Infirmaries and sickness stops being a threat at all.
4. **Flavor** — Chronicle text, varied across a few options, split between "it happened" and "it was averted."

"A wanderer joins your settlement" — population growth — is technically the first and most common event under this system. **Sickness**, mitigated by the **Infirmary**, is the first real hazard built on it: unmitigated it's rare but real, an ever-present low hum of risk once your population passes a threshold, and it's the proof that the system generalizes to bad news, not just good news. **Conflict**, mitigated by a standing **Military**, is the second — see below.

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

Right now there is exactly one era: Stone Age. The long-term shape of the game is that era progression is what carries you from "feed the fire" to "manage intergalactic trade" — new resources, new buildings, new events, even new *vocabulary* (a wanderer doesn't "join your settlement" once you're off-world). Critically, **the interface itself should not need to change shape** as eras advance — no map ever gets rendered, no unit ever gets drawn, no matter how far the tech tree goes. Events are already tagged by era so the engine is ready for this; the actual era-transition system (what triggers an era change, what it does to the UI, how old buildings/jobs carry forward or get replaced) is a separate design pass, intentionally not started yet.

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
