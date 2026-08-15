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

**The Chronicle tells the story for free.** The single best thing to come out of early builds wasn't a system — it was flavor text. Lines like *"With shelter secured, your people turn to better tools"* cost nothing mechanically; they just narrate a state change that was already happening. This became a deliberate principle: every meaningful event in the simulation — a birth, a building completed, a hazard survived or not — should produce a line in the Chronicle. The log isn't a debug console, it's the settlement's memory. No extra rules overhead, just flavor riding on top of state that already exists. And since nothing in this game ever waits for the player (see *A living world, never a waiting one*, under Events), the Chronicle is also load-bearing: it's the surface that makes an AFK stretch legible after the fact, which is why completeness there is a rule and not a nicety.

**Spartan, monochrome, paper-and-pen.** No shadows, no gradients, no color as decoration. Off-white background, near-black ink, hairline borders. Color is reserved entirely for *meaning*: green means genuinely new good information (a birth, a hazard averted), red means danger (starvation, spoilage, a hazard that landed), amber is saved for rare milestones. Buildings you own aren't just a number in a buy menu — they get a small line-art icon and sit in a "Settlement" panel you can actually look at, the compromise between "no map" and "nothing to see." The whole thing should look like something you could rule out on paper with a black pen and, occasionally, a red one.

**Small numbers, slow start, on purpose.** The opening minutes are deliberately unhurried — gather rates, build times, and the pace of new arrivals all err slow. This is being tuned by feel as we go, not locked to a formula, but the standing rule is: if a mechanic makes the game solvable in minutes, that's a bug, not a feature.

**New panels appearing is part of the fun.** The interface doesn't just unravel once at the start and then hold still — it keeps growing as the settlement does. Discovering that a new building unlocks a whole new panel (Barracks unlocking Training, say) should feel like an event in itself, not just a new button in an existing list. The screen scaling up *is* the sense of progress through the eras, which matters a lot given nothing is ever rendered on a map to show that progress visually any other way.

**Active early, idle late.** The engagement curve is supposed to invert as the settlement grows, not stay flat. Stone Age should grab you the way the first twenty minutes of Cookie Clicker do — every choice close, every resource worth watching, hard to look away. (This is confirmed, not just hoped for: an actual bystander playtest — someone handed the game with zero context — couldn't tear himself away during Stone Age. That's the era doing exactly its job.) By the time you're eras removed from that, the same panels, the same queue, the same buttons should be running something that takes real hours to finish, and that's not a failure state — it's the design working as intended. Training a Stone Age Soldier costs roughly 10 seconds of real time; building a Starship, many eras later, should cost something like 6 hours. Same interface, wildly different pace, entirely on purpose.

This is the literal mechanical proof of the founding pitch (see Premise): the game is supposed to explode in scope while the interface never changes shape. If it doesn't actually get all the way to space, it's just a worse Age of Empires with the graphics removed. Reaching that endgame isn't a stretch goal tacked on later — it's the bet the entire premise is riding on.

## The Core Loop

Forage → grow → hit the housing cap → build a hut → grow again. That's the entire loop at minute one, and it stays recognizable even as more resources, buildings, and hazards layer on top. Food is the survival resource (upkeep scales with every mouth, and running dry is death); **housing is what gates population** — people arrive on their own while there's room; wood and stone are investment resources (they gate buildings); population is both the goal and the constraint (more settlers means more production *and* more mouths to feed).

## Systems

### Settlers & Jobs
Settlers are assigned to gather jobs (forage / chop / mine) with a simple stepper — no pathing, no individual identity, just a headcount per job. Every settler eats, whether working or idle, which is what makes population growth a real trade-off rather than a pure win.

Population isn't one undifferentiated number — it's a small roster of **person-types**, each shown as its own icon-and-count tile (visually similar to how Settlement shows owned buildings, but living in the Your People panel instead, since "who your people are" and "what you've built" are different questions). The roster today: **Settler** (the default, freely assignable to any gather job) plus the trained military types — **Soldier**, **Archer**, **Horseman** (see Military, below). The tile format is deliberately built to scale to more person-types later without a redesign.

### Resources & Storage
Resources accumulate passively based on job assignment. Every resource has a storage cap before its storage building is built — go over it and the surplus is lost, not just stalled. For Food and Wood this is literal rot; Stone doesn't rot, and the design conversation that added its storage cap said so explicitly — the justification is purely "unorganized stone piles are hard to make use of," gameplay symmetry over strict realism. It's the soft, thematic version of a hard cap either way: it doesn't block you, but it punishes ignoring the problem, and it's what makes the storage buildings (Granary, Woodshed, Stone Yard, Ore Yard) feel necessary rather than optional.

### Construction
Buildings are bought with an immediate resource cost (payment happens at the moment you click) and then sit in a **queue**. Only the item at the front of the queue actively progresses — the rest wait their turn, which is the game's stand-in for the "one thing gets built at a time" pacing of a real settlement, without asking the player to manage workers on a construction site. (An earlier version required manually assigning idle settlers as builders, AoE-style; it was cut as too much micromanagement for an idle game — the queue itself now *is* the scarcity.) Costs escalate per building type the more of that type you own *or have queued*, so stacking up five huts at once doesn't undercut the intended cost curve.

### Buildings
Three families so far: **storage** (Granary, Woodshed, Stone Yard — raise how much you can hold before loss), **production boosts** (Drying Racks, Lumber Camp, Stone Pit — a flat percentage bonus to one job's output), and **hazard defense** (Infirmary, Barracks — reduce or unlock mitigation for a specific Event). More families are the obvious way this game grows — the intent is that later eras introduce entirely new building categories, not just bigger numbers on the old ones.

Most buildings scale freely (own as many Huts as you can afford). A few are **capped** — Barracks is the first: you only ever need one, since it's a permission to train Soldiers, not a stacking bonus. A capped building's buy-card greys out at "Maxed" once you've hit the limit, same visual treatment as an Upgrade you already own. This is a real third category — not quite the uncapped stacking model, not quite a one-time Upgrade either — and it's expected more buildings will fall into it as the game grows (some future facility that unlocks a capability without itself needing five copies).

**Stone Tools** is meant to be the first of a recurring pattern, not a one-off: one broad, cheap, early, flat-percent Upgrade to *all* gathering per era (a Bronze Age equivalent should exist once that era is real). Deliberately available almost immediately — it competes directly with your very first Hut for early wood, which is intentional tension, not an oversight — and deliberately small (8%), on the standing principle that new numbers should start conservative and get walked back up rather than the reverse. That principle applies everywhere in this game, not just here: when unsure, tune toward too-hard and loosen later, not the other way around.

### Events
The mechanism for anything that *happens to* the settlement rather than something the player *does*. Every event has the same four-part anatomy:

1. **Trigger** — either a steady random chance per second (a hazard, a windfall), or a condition that fires deterministically whenever it's true. (Population growth originally lived here as the deterministic example; it has since been settled *out* of the events system entirely — see below.)
2. **Effect** — what actually changes in the settlement.
3. **Negate potential** — an optional counter: a specific building that, the more you've built, reduces the odds the event's downside actually lands. Enough Infirmaries and sickness stops being a threat at all.
4. **Flavor** — Chronicle text, varied across a few options, split between "it happened" and "it was averted."

**A living world, never a waiting one.** The settlement is surrounded by other actors — raiders today, enemy armies later, invading aliens eventually — and simulating them is what makes this feel like a real world with other agents in it rather than a spreadsheet of numbers. Their actions carry genuine success-and-failure consequences either way. The contract is strictly about *presence*: no outside actor ever stops the game to demand a decision, so everything resolves whether you're watching or AFK — and the Chronicle is the after-action record that lets you come back and skim out what the heck happened while you were gone. (This is the positive half of the "interactive events are out of scope" cut — see Explicitly Out of Scope.)

The inverse is equally canonical: **decisions happen on the player's schedule; consequences happen on the world's schedule.** The world never interrupts you with a decision — but you may act *on* the world whenever you choose (see Adversaries & Expeditions, under Eras). Once you act, resolution is the world's business: it self-applies and lands in the Chronicle like everything else. And set in stone as a guideline: **resolution never creates a window the player must catch.** No "your army has returned — claim your reward" buttons, no expiring results. A claim button is just an interactive event wearing armor.

"A wanderer joins your settlement" — population growth — *was* the first and most common event under this system, until the decision below moved it out. **Sickness**, mitigated by the **Infirmary**, is the first real hazard built on it: unmitigated it's rare but real, an ever-present low hum of risk once your population passes a threshold, and it's the proof that the system generalizes to bad news, not just good news. **Conflict**, mitigated by a standing **Military**, is the second — see below.

For a while, every *probabilistic* event was bad news — Sickness and Conflict were both downside rolls, and the only good news (population growth) was deterministic, never a surprise. **Great Hunt** and **Trader** fixed that: small, ungated resource windfalls (Great Hunt gives food; Trader gives wood and stone) using the exact same trigger/effect/flavor shape as the hazards, just without a downside. There's no fairness reason to gate good news behind a population threshold the way the hazards are, so they aren't. The Chronicle now builds suspense in both directions, not just one.

An Infirmary's mitigation strength itself turned out to be upgradeable, not just its count — **Herbal Medicine** raises how much *each* Infirmary reduces Sickness's odds, rather than adding a new counter-building. That's a genuinely different lever than "own more of the building," and worth remembering as a pattern for other counters later (Barracks/Soldier-style scaling isn't the only option).

#### Settled: population growth is not an event

**Settlers cost nothing and arrive on a timer.** While housing has room, a new person shows up every N seconds — full stop. No food price, no saving up, no stalling ten under the cap waiting to afford someone.

This replaces the original model, where a settler was *bought* with a lump of food at a price escalating 30% per person. That failed on three counts: the implication was strange (you pay a wanderer to join?), it stalled growth for long stretches, and — because the purchase fired automatically the instant it was affordable — food could never accumulate past the settler price at all. Your practical food ceiling was the price of the next person, not your storage cap, which meant the Bronze Age capstone's 300 food was unreachable before roughly pop 17 unless you deliberately stopped building housing. None of that was intended.

The important structural point: **growth is a background process, not an event.** Every other entry in the events system is a *surprise* — something that happens to you, where randomness is the point. Growth is a steady tick. Folding it into a random table would make population lumpy and luck-driven, and would force it to compete with hazards for the same probability budget: making settlers common would necessarily make raids rarer. Keeping it out of the table lets "how fast do we grow" and "how dangerous is the world" stay independent dials.

Food keeps its pressure through **upkeep**, which scales with population, so the tension moves from a stock problem (can I save a lump sum?) to a flow problem (can I sustain these people?). That's the better question, and it makes housing the sole lever on population: if you don't want more mouths, don't build more housing.

#### Settled: each era declares its own slate of events

Events are **owned by eras**, not tagged with them. Each era declares the complete list of what can happen during it. An event that spans two eras appears in both slates; an era that wants a clean break just declares a different list.

This replaces per-event `eras: [...]` tags, which were error-prone in a specific and nasty way: forgetting to add a new era to an existing event's tag list would silently stop that event from ever firing again, with no error — a settlement that quietly stops having births or raids. Declaring the slate per era makes omission visible, and makes "scrap everything and start fresh" a one-line change, which later eras will want.

This decision turned out to be the seed of something much bigger. The same logic — era-owned declarations beat globally-tagged content — generalizes to *every* content type, not just events. That generalization is now the settled architecture for the whole game: see **The Era Manifest Model** under Eras, below.

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

Two eras exist today: Stone Age and Bronze Age. The long-term shape of the game is that era progression is what carries you from "feed the fire" to "manage intergalactic trade" — new resources, new buildings, new events, even new *vocabulary* (a wanderer doesn't "join your settlement" once you're off-world). Critically, **the interface itself should not need to change shape** as eras advance — no map ever gets rendered, no unit ever gets drawn, no matter how far the tech tree goes. How the *content* changes shape across eras is now settled architecture: see The Era Manifest Model, below.

**The transition mechanism is settled**, even though no era past Stone exists yet: advancing is a hidden, one-time capstone Upgrade (e.g. "Bronze Age") that reveals once its prerequisites are quietly met, and otherwise behaves exactly like every other Upgrade — it sits in the same build queue, costs real resources, takes real time, and completing it flips `S.era`. Nothing new needed there. Critically, **Sickness and Conflict keep rolling the entire time it's under construction** — that's deliberately where "and some luck" comes from (see below), not a separate mechanic bolted on for the purpose.

**Three rules that apply to every future age, canonical:**

1. **Every age must add a few new things, at a bare minimum.** The moment a capstone build completes, the interface changing should be a "whoa, look at this" moment, not a quiet reskin. If an age doesn't make the player want to poke around and see what's new, there's no reason for it to be an age.
2. **Ages come in two flavors, and knowing which is which shapes what "a few new things" means.** **Deepening** ages introduce a genuinely new mechanic or system (Bronze's weapon/armor tiers, presumably Silicon's automation). **Widening** ages mostly consolidate and reflavor what already exists onto a bigger stage (Enlightenment, Global, Kardashev in the list below) — but per rule 1, even a widening age still needs a *few* real new things, just fewer/smaller ones than a deepening age gets. Neither flavor is a "total restart" — that's the entire point of the distinction: most of what you've built carries forward, just reframed or folded together, so progress is never erased, only recontextualized. **A widening age with no concrete reason to exist by the time it's actually being scoped gets cut, not forced.** Several ages below are placeholders exactly because of this — they stay in the flavor guide as intent, but nothing obligates them to survive contact with actual design work.
3. **A capstone is priced in the signature currency of the age it ends.** The exit cost is how the game guarantees you at least minimally engaged with the age's defining mechanic before leaving it behind: the Bronze capstone's 300-of-each silently forced broad storage build-out, the Iron capstone costs bronze so the Forge had to actually run, and the capstone out of Iron will cost **gold** — which cannot be mined, only traded for or taken, so no amount of passive economy can substitute for having run expeditions. The cost sits meaningfully above anything the era hands you for free (the bronze heirloom sell-off seeds some gold; the capstone must want visibly more than that). Every future age applies the same test: whatever the age was *about*, its exit door is denominated in it.

**This game is meant to actually end.** Not a Cookie Clicker-style endless ascension with no finish line — Heat Death of the Universe (see the list below) is meant to be a real conclusion, one way or another. Very few civ-style games let you play until the universe itself runs out, which is exactly why it's the target.

**The conversion-chain mechanic lands in Bronze.** A raw-material-to-refined-good chain (nothing currently built *transforms* one resource into another — everything only produces or boosts) was long flagged as wanted-eventually. Bronze wins it because bronze is literally an alloy: copper + tin → bronze is the mechanic and the fiction in one. See the Bronze Age section below.

### The Era Manifest Model (implemented)

The forcing question: Iron Age intends to *remove* content for the first time — the copper/tin/bronze economy retires wholesale — and eleven more eras of adding, removing, repurposing, and rescaling follow. Sprinkling era-conditions onto globally-defined content (which is how the first two eras were built) accumulates a palimpsest: every building carrying a branch of behavior for every era it lives through. So the architecture inverts.

**Each era owns a manifest: the complete declaration of everything that can exist while it's active** — resources, jobs, buildings with *that era's* stats and recipes, units, upgrades, events, panel titles, all of it. An era is authored as a *delta* against the previous one — remove this, add that, override the other — which doubles as the era's design document: Iron Age's delta literally reads "remove the bronze economy; add iron and gold; the Forge now smelts steel." Deltas compile into full manifests, and the running game only ever consults the active era's manifest. Nothing outside it exists: not on screen, not in the economy, not for sale.

The rules that make it safe, in plain terms:

- **Identity is permanent; flavor and function are per-era.** The same `hut` has been Hut and Stone House and will someday be an Apartment Block; the same `forge` smelts bronze today and steel in Iron; the same `archer` can end up displaying as a Fighter Pilot. One identity per thing, forever — that's what lets a save file survive twelve eras untouched.
- **Absence is removal.** Nothing needs to be explicitly killed; if an era's manifest doesn't declare it, it isn't there. You can't *forget* to remove something — you'd have to forget to keep it, and that mistake is immediately visible on screen.
- **Carrying is the default.** Anything declared in consecutive eras carries its counts, stockpiles, and progress silently. The most violent transition in the game should still be a short delta, where every line is a design decision rather than plumbing.
- **Transitions can transform, with narration.** A transition may carry explicit migration instructions — melt bronze stores down to a fraction of their weight in iron, reissue Dollars as Credits at 100:1, take billions of citizens and land a few hundred thousand of them on colonies. Every such instruction carries its own Chronicle/announcement line, because state silently rearranging itself is exactly the "invisible food sink" mistake this project already made once.
- **The era announcement can't lie.** The "Now available" / "No longer needed" / "What changed" lists in the transition modal derive mechanically from the difference between the two manifests — the same data the engine runs on — so they can never go stale or drift from reality. Only the flavor lead stays hand-written.
- **A validator makes broken eras loud.** Because a manifest claims to be complete, the game can check it: an upgrade priced in a resource that era doesn't have, a job mining something that doesn't exist, a unit countering a raid type that isn't declared — all become immediate, named errors at load instead of features that silently do nothing. Given that this project's three worst bugs were all silent-wrongness bugs, this is arguably the single biggest payoff of the whole model.

This model *supersedes* the "reflavor-with-a-bump" pattern from Bronze only in mechanism, not in spirit — reflavor, bump, retarget, and retire all become ordinary manifest differences. The sequencing was deliberate and is now complete: the **parity refactor** and the **transition/migration machinery** both shipped (see `tech.md`), so Iron Age arrives as the first real consumer with engine risk and content risk never having traveled together.

### Population & Scale: Unit Re-denomination (settled)

The game reaches interstellar scale by scaling **what one population unit means**, never the number on screen. Displayed counts stay in the roughly 3–50 range forever — the small-numbers pillar, the steppers, worker assignment, exposure-weighted casualties, and the whole legibility of the interface survive to the end of the universe. The implied real population compounds through the *conversion ratios between units*, which live entirely in fiction and narration: the original "10× per age" goal is met without any number ever needing a comma.

This also resolves the absurdity flag permanently: the housing→growth verb never retires, it **re-denominates**. "A wanderer joins your settlement" → "a family seeks shelter" → "a holdfast swears fealty" → "a city petitions to join." A ruler never counted individuals past the Bronze Age, so the juxtaposition never becomes a joke.

**The ladder (settled names):**

| Age | Unit |
|---|---|
| Stone | Person |
| Bronze | Family |
| Iron | Holdfast |
| Enlightenment | City |
| Gunpowder | Colony |
| Industrial | Territory |
| Mechanized | Nation |
| Global | Bloc |
| Silicon | Bloc *(deliberately unchanged — see note)* |
| Space | Settlement |
| Galactic | World |
| Kardashev | System |

**Border policy.** Stone→Bronze is a **1:1 relabel** ("your settlers have started families") — pure text, zero re-balance, protecting the proven early pacing. **Consolidation begins at Bronze→Iron** and applies at every later border, always *generously* — for every 5 units you get 3 or 4, never a decimation — narrated as a standard migration. Consolidation earns its place twice: each era re-grows from a modest count (its own growth arc), and it acts as a **soft tithe on min-maxed stockpiling** — banking population before a transition pays deliberately diminished returns.

**Notes and corollaries:**

- **The noun changes when the scope genuinely changes, not on a schedule.** Silicon keeps Bloc: it's a deepening age whose identity is its mechanic, and across Global + Silicon the story is blocs consolidating until you implicitly hold the whole planet. (Megacity survives as candidate Silicon *housing* flavor — what you build, not what you count. The housing ladder — hut → stone house → longhouse → districts/wards → … — moves independently of the pop ladder, designed per age.)
- **The Space border is deliberately non-monotonic.** A Bloc implies billions; a Settlement implies the few who leave. The game's lens narrows to the frontier — exactly the "billions become a few hundred thousand colonists" migration the primitives were designed for. Space-age seed, logged for that design pass: settlements as *economic units* — different planets hold different resources in different quantities, discoverable only by sending an expedition.
- **Naming guardrail:** unit names avoid pointing at any specific real Earth entity. Bloc is accepted as a mild tradeoff on this rule; **Compact** is the parked fallback if its Cold-War ring grates in play.
- **"Holdfast" is reserved for the population unit.** The siege system's fortification flavor ladder must use other words (palisade / keep / castle — settled in the siege design pass).
- **Implementation shape:** the pop noun and its arrival/loss/growth lines become era-facts in the manifests; consolidation is an ordinary narrated migration; the retrofit cost for shipped eras is text plus one border migration, with balance untouched at the 1:1 rung and gently re-checked where ratios apply.

### The Age List (flavor guide — not canon, expect it to move)

A loose north star, not an implementation backlog. Ages get built and played one at a time, each proven fun before the next is even scoped — this list exists so later decisions stay consistent with where the game is ultimately headed, not as a commitment to build all of it.

1. **Stone Age** (neolithic) — current, only implemented era
2. **Bronze Age**
3. **Iron Age** — the first age to *remove* content (this intended removal is what forced the Era Manifest Model above). Fully designed — see the Iron Age section below. Its **deepening mechanic is Adversaries & Expeditions**: campaigns and directed trade, the game's first outward-facing verbs.
4. **Enlightenment Age** — *widening*; cathedrals, monks, science
5. **Gunpowder Age** — revolutionary war to old west
6. **Industrial Age** — the real Industrial Revolution: Victorian, steam, rail, factories — this is properly where the steampunk flavor belongs
7. **Mechanized Age** — tanks, bombers, mid-1900s mechanized total war; carved out from what used to be a vaguer "early-mid 1900s" Industrial Age once the steampunk/date mismatch got noticed
8. **Global Age** — *widening*; expands Industrial/Mechanized to a whole-world flavor
9. **Silicon Age** — 2000 AD+, computers and robotics
10. **Space Age** — *The Expanse*-ish, same solar system
11. **Galactic Age** — starships, alien races
12. **Kardashev Age** — *widening*; solar-system/galaxy scale, Dyson spheres
13. **Heat Death of the Universe** — the game ends, one way or another

### Bronze Age (designed and shipped)

The first age transition, and therefore the one that has to prove the whole concept works. A **deepening** age: it adds a genuinely new mechanic (resource conversion) plus real military depth, and it deliberately **consolidates nothing**. That's a rule for this age specifically — the first transition's emotional job is to be pure reward. "Your stuff got better" is a far better first impression than "your stuff got taken away and replaced," and consolidation is a tool for solving interface clutter that doesn't exist yet.

**How you advance.** A hidden `Bronze Age` capstone Upgrade reveals once you have a population of ~10 *and* have trained at least one Soldier — the pop gate stops it triggering absurdly early, and the Soldier requirement ensures you haven't left an entire system (Barracks/military) unexplored. It costs 300 each of food, wood, and stone. That number was chosen partly for its knock-on effect: storage caps are 50 base +100 per storage building, so merely *holding* 300 of something requires three of its storage building — the resource cost silently forces broad economic build-out without a separate "must own X" check. It reveals well before it's affordable on purpose: seeing the requirement as a distant mountain is the point.

**Reflavor-with-a-bump, never obsolete-and-rebuild.** This is the age that establishes the pattern for every future one. When Hut becomes **Stone House**, it isn't a new building sitting next to an obsolete one — it's the same building, renamed, now worth 5 housing instead of 3. Every hut you already own upgrades at once, so advancing produces an immediate, visible housing jump. Your existing investment got *elevated*, which is exactly the feeling an age transition should produce. (The Settlement panel becomes **Village** on the same principle — the fiction grows, the mechanics don't churn. Village → Town → City gives later ages clean rungs to climb.) One retroactive change rides along: Infirmary is renamed **Medicine Tent** in the Stone Age so that "Infirmary" is available as the Bronze-era upgrade of the same building.

**The alloy.** Two new gather jobs (copper, tin) bring the total to five — still restrained next to a real RTS, which hands you four resources immediately. **Tin deliberately yields half what copper does**, which is both a real balance lever and historically why bronze was precious enough to build trade routes over. The **Forge** is a new building *archetype*: it consumes copper and tin from your stockpiles and produces bronze automatically, with no workers assigned. It needs none — the opportunity cost is already paid by the miners feeding it, and there's no interesting decision in "would you like to stop converting?" when the inputs have no other use. It idles if either input runs dry, and also if bronze is at its ceiling, so it can never quietly eat ore for nothing. Bronze is then the currency for this age's upgrades: Bronze Tools and Bronze Weapons both cost it, so the Forge is genuinely load-bearing rather than decorative.

The numbers were chosen so a **clean equilibrium exists to be discovered**: because tin yields half of copper, two copper miners and one tin miner produce ore in exactly the 4:1 ratio the recipe consumes, and two Forges consume exactly that. Nothing enforces this or hints at it — a player can staff it however they like and will simply see one ore pile up while the other starves. But the tidy answer is there for anyone who works it out, which is the kind of thing that makes an economy feel designed rather than arbitrary.

**Military composition.** Raids gain a *type* alongside their size: a generic warband, a massed charge (Archers excel), or a band of riders (Horsemen excel). The critical design rule is that **units are never penalized for being the wrong type** — every unit always contributes its full base strength, and the matching type simply receives a bonus on top. An all-archer army is never worse than not having those bodies at all; it just misses the upside sometimes. This keeps a naive "build only one thing" playstyle viable rather than punishing, which matters for a game where you can't see the next raid coming. A second, softer dial carries the rest of the tension: a poorly-matched army raises the odds of a *costly* repel (you win, but you bury someone) without gutting your chance of winning at all.

The result is a real, legible trade-off rather than a right answer: a specialist army swings hard between matchups (5 Archers are worth double against a massed charge and unchanged against everything else), while a mixed army has no spikes but no holes either. Soldiers stay the cheap generalist and — notably — the only unit costing no bronze, so they remain buildable when the Forge is starved. Horsemen are the strongest per head and the most expensive.

**Who dies is a second, quieter axis of role.** When a raid takes lives, casualties are drawn weighted by exposure rather than evenly: foot soldiers hold the line and take the brunt, horsemen can withdraw, and archers — shooting from behind the line — are hit least. This is what makes an Archer *feel* like an archer rather than a differently-priced soldier. Crucially it only ever bends the odds: no unit is immune, an archer can always be the one who falls, and an all-archer army has no front line to hide behind so it gets no protection at all. Mixing your army is what buys your specialists their safety, which is a nice second reason to do it beyond matchup coverage. **Scouting** rides on the Stables as a second reason to build them, unlocking a category of purely-positive discoveries; it's gated on the upgrade rather than the building, so it's an investment rather than a freebie.

### Iron Age (designed — the first removal age)

The Bronze Age was pure reward: everything you had got better. The Iron Age is the first transition with **teeth** — and the fiction hands us exactly the right teeth. Historically, bronze didn't lose to iron because iron was better; the long-range copper-and-tin trade networks *collapsed*, and iron won because it was **local** — duller, stubborner metal, but under every hillside. So the era's story is: the world your bronze depended on breaks, and in its place a *bigger, rougher, named* world appears. That's why the era that removes an economy is also the era that introduces Adversaries: the outside world takes something from you and simultaneously becomes something you can act against. A **deepening** age, and the deepening is **Adversaries & Expeditions** (below).

**How you advance.** An `Iron Age` capstone in the Bronze manifest: reveals at pop ≥ 16 with at least one Archer *or* Horseman fielded (the pop gate scales up from Bronze's 10; the unit gate ensures the composition system — Bronze's whole lesson — was actually explored). Costs 400 food, 400 wood, 400 stone, and **50 bronze**, 180s build. The 400s force a fourth storage building of each type by the same silent mechanism the Bronze capstone used; the bronze cost makes the Forge genuinely load-bearing one last time before it changes jobs. First-guess numbers, tuned toward too-hard as always.

**What's removed** (the delta's `remove` list *is* this paragraph): copper, tin, and bronze; both ore-mining jobs; the Ore Yard; and the four upgrades stranded by the collapse — Bronze Tools, Bronze Weapons, and Scouting (all priced in a resource that no longer exists) plus Flint-Tipped Spears (superseded twice over). Anything already *owned* keeps working — a bought upgrade is a permanent trait, and its multiplier reads your state, not the shop shelf. What you lose is the ability to buy what you didn't.

**The migration narrates the collapse.** Copper and tin stocks vanish ("the trade withers"). Bronze — suddenly antique — **converts to gold at 1:4**: your stockpile sells off to collectors and temple-makers, which is historically resonant (bronze retreated into ritual and prestige), seeds your first gold, and teaches the new resource in one Chronicle line. Workers on dead mining jobs walk home on their own (the default policy). Every one of these is a narrated line; nothing silently rearranges.

**The new economy.** Iron arrives as a fourth gather job — deliberately *plentiful* (full rate, no tin-style scarcity; that was bronze's story, not iron's). The **Forge persists, retargeted**: 3 iron + 2 wood → 1 steel, which quietly gives wood a real late-game sink for the first time since the Stone Age. Steel is this era's upgrade currency (generous cap, no storage building — spent, not stockpiled), backing **Iron Tools** (+22%, stacking additively with the tool tiers before it), **Iron Weapons** (the third weapon tier, 3.0, superseding bronze's 2.2), and **Steel Armor** (the second armor tier — halves again what Hide Armor left). **Gold is the era's genuinely new idea: it cannot be mined.** No job produces it. Gold enters only from *outside* — the bronze sell-off, plunder, and trade — so the era's new wealth is structurally tied to its new verbs. Storage: an **Iron Yard** for iron, a **Treasury** for gold. The Stone House becomes the **Longhouse** (housing 5 → 7, retroactive as always), and the Village becomes a **Town**.

**No capstone out yet.** Like the Stone Age before Bronze existed, Iron ships without its exit — the Enlightenment gets designed when Iron has proven fun, per the one-age-at-a-time rule. One thing about that future exit is already settled (canonical rule 3, above): **it will cost gold**, well above the heirloom sell-off's seed, so leaving the Iron Age requires having actually run expeditions — gold can't be mined, so the exit door is denominated in the era's own verbs.

**Pacing intent.** Measured play: ~15 minutes to reach Bronze, ~40 to clear it — the early ages moving at a clip is working as intended and should stay that way. Iron should run noticeably longer (its content is a *world*, not a tech list), targeting very roughly 30–45 additional minutes to exhaust the adversaries' stocks and the upgrade list, but that's a playtest number, not a promise.

**The three adversaries of the Iron Age** (each declared wholesale in the iron manifest — see the next section for the system itself):

- **The Hill Clans** — warlike, weak (strength 9), fighting as a *massed charge* so Archers earn their keep against them. Modest stock. They are the tutorial target: the first campaign you can actually win, and the neighbor whose hostility you can afford.
- **The River Kingdom** — peaceful, *strong* (strength 32 — a fortified state; raiding it early is a mistake the dice will explain), fighting as *riders* (chariots) if you insist. The whale: a deep gold stock and the best trade partner — they buy food, the one thing an idle economy always has too much of.
- **The Salt Nomads** — peaceful, middling (strength 13), also riders. They buy **iron** (they have no mines of their own), making your new mine a trade good and not just Forge feed. A softer stock: the morally grayer target, since you *could* take by force what they'd happily pay for.

Three counterparties, three different correct answers — fight, trade, choose — which is the minimum for "whom?" to be a real decision.

### Adversaries & Expeditions (designed — lands with Iron)

Born from a real worry: with every existing verb pointing inward (allocate, build, upgrade, train), the game risked feeling passive despite its friction — the player is the *object* of the simulation's sentences, never the subject. Expeditions are the game's first **outward-facing verbs**, and they're what makes Iron a genuinely deepening age rather than bronze spearmen in plate: without them, knights and siege engines would just be new flavor on the same defense stat.

**Adversaries** are the counterparties, and they exist only to the extent that they can be interacted with — that's the whole specification. Each era's manifest declares its own **wholesale, like the event slate — never inherited** (neighboring tribe → kingdom → rival continent → alien planet), and each holds the bare minimum: a **static resource stock** (numbers you can trade against or plunder — a *stock*, not an economy; nothing grows, nothing moves on its own), a **strength** number, a **disposition** — peaceful or warlike — and a **fighting style**: each adversary names the raid type it fights as (the Hill Clans come down the slopes as a massed charge), so the composition system Bronze built points outward for free. Archers aren't just anti-raid insurance anymore; they're the right troops to *bring* against the right neighbor. Explicitly *not* simulated civilizations: no growth, no tech, no map, no evolving diplomacy. And because adversaries are manifest content, each new era's counterparties arrive with fresh stocks by construction — no replenishment logic ever needs to exist.

**The Muster Ground and the one-of-each rule.** A single capped building gates the whole system, the way the Barracks gated Training. It stages **one campaign and one caravan at a time** — soldiers and merchants are different people, so the two tracks run in parallel, but never two of a kind: the split is still the decision on each track. (Playtest revision: the original one-expedition-total rule made trade and war mutually exclusive, which read as arbitrary rather than weighty.)

**Flavor is load-bearing (canonical).** Adversary strength is *hinted through description*, never through printed odds — "a fortified state, rich beyond counting" is how a player is supposed to learn that raiding the Kingdom early is a mistake, and the playtest confirmed the read works. Raw strength numbers may appear (this is a numbers game), but the *judgment* — is this a fight I take? — belongs to prose and dice, not a win-percentage. The corollary cuts the other way and matters more: **descriptions are mechanics-bearing text.** An adversary whose flavor undersells or oversells its strength is a bug, the same class as a wrong cost label, and no validator can catch it — it's an authoring discipline. The same principle extends to the reputation system: standing shifts are *narrated* ("counted out in silence under armed watch — they have not forgotten") rather than printed as deltas, so the world reads as remembering, not as a meter filling.

**Escorts.** A caravan may carry guards when — and only when — the roads are actually dangerous (a warlike neighbor gone Hostile); on safe roads a caravan is a one-click send and the question never arises. Escorts don't lower the odds of an ambush — they decide how one *ends*: fight through and the trade completes, casualties possible either way. Escorted guards are deployed like campaigners, thinning home defense, so guarding your trade is a real allocation and not a checkbox.

**Campaigns**: pick a target, allocate units with the same steppers jobs use (send some, keep some — the split is the decision), pay a food provision, and the column marches. Resolution is the raid math pointed outward: your force's strength (weapon tiers and counter bonuses included) against their static strength, as a ratio — never a threshold. Win, and you carry home a large fraction of their remaining stock; they are permanently poorer, because a stock is not an economy. Lose, and people don't come home. Either way the dice may take someone (exposure-weighted, same as home casualties), and either way they remember: standing falls whether you won or lost — plunder is not diplomacy. **An army on campaign isn't home**: deployed units don't count toward defense and can't be hit by home raids, so the settlement is genuinely thinner until they return. Outcomes self-apply and land in the Chronicle, per the no-catch-windows rule.

**Caravans (directed trade)**: each peaceful adversary *buys* something specific at a posted rate — the River Kingdom buys food, the Salt Nomads buy iron — in fixed lots (pay the goods up front, the caravan departs, the gold comes back on the timer). The gold they pay comes **out of their stock**, so a partner can be genuinely traded dry — and the goods you sell them **join their stock**, where a later campaign could take them back. Nothing enforces or even mentions that grim little arbitrage; it's simply true, because stocks are real. Trade builds standing; good standing improves prices. A partner raided too often stops trading with you entirely — they remember.

**Standing** is one small number per adversary, moved by exactly two things (campaigns lower it, caravans raise it) and read out only as a word — Hostile, Wary, Neutral, Friendly. Its consequences are few and legible: a **Hostile warlike** neighbor raids your settlement more often; a **Hostile peaceful** one refuses your caravans; a **Friendly** partner pays a premium. That's the entire diplomacy system, on purpose.

**Where it lives on screen.** One panel — **Expeditions** — not two: campaigns and caravans share an anatomy (pick counterparty, allocate, timer, Chronicle resolution), so each adversary renders as one card carrying its name, disposition, standing word, known stock, and its available actions. The grid slot comes free: the Chronicle currently spans both rows of its column as a luxury, and when the Muster Ground completes, it shrinks to the top row and Expeditions unravels in beneath it — the world crowding in on your story, using span machinery the layout already has. **No existing panel is cut and nothing hides behind a toggle** — this era doesn't need it, and when a later era finally does run out of room, the pressure valve is already settled: widening ages consolidate, and the manifest model makes retiring or merging panels an ordinary era difference rather than a redesign.

Two legibility rulings from the first playtest: **in-progress expeditions render as progress cards in the queue panel** — the established at-a-glance surface for things underway — in the builds' own visual language, differentiated by a tiny line-art type icon (hammer = build, sword = campaign, coins = caravan) and by having no cancel button (no catch windows), with the panel retitled **Underway** in the Iron Age since it now tracks more than construction. And **launching a campaign is a modal moment**: clicking March opens the game's one modal with the target's description (the strength hint — see flavor-is-load-bearing, above), the muster steppers, and a live force estimate, which both declutters the panel and gives the era's biggest decision the ceremony it deserves.

An optional flavor join, cheap and cohesive, deferred to the polish pass: inbound raids can *attribute* to warlike adversaries ("the Hill Clans test your defenses" rather than an anonymous warband), so the world's proper nouns appear in both directions.

## Explicitly Out of Scope

- Any rendered map, grid, or spatial representation of the settlement.
- Individual unit rendering, animation, or pathing.
- Real-time reflex or twitch mechanics — this is a numbers game, not an RTS.
- **Interactive events** — events that stop and demand a decision in the moment (a rival king demands tribute: pay or roll for consequences). This was previously a captured idea explicitly worth compromising idle-ness for; that stance is reversed. Requiring the player's presence pushes the game toward an *active* Civilization, which creates both design problems (what happens to a pending demand while you're away — wait forever? auto-resolve? block progress?) and technical ones, for a payoff that fights the identity. The settled identity is **idle Age of Empires**: you allocate, build, upgrade, and train as you have time, and the engine chugs along either way. Every event resolves itself with nobody in the room — that's a feature, not a limitation.
- Multiplayer.
- Mobile as a first-class target — it should not actively break, but desktop is the designed-for experience.

## Open Design Questions

Nothing is currently pending — every question flagged so far has been resolved. The log, for the record:

- **Should population growth be automatic, and should it cost food?** Resolved in stages, each driven by playtesting. First the cost was un-ratcheted (priced off *current* population rather than lifetime settlers grown, so losses no longer permanently poisoned recovery). Then the invisible spend was made legible (the Chronicle line now states the price). Finally the food cost was **abolished entirely** — settlers arrive free on a timer while housing has room (see *Settled: population growth is not an event*). That last decision also mooted the companion question about whether the ×1.30 cost curve was too steep: there is no settler cost left to tune.
- **Can hazards zero out population?** Yes, for Conflict specifically — see Military & Defense / Failure. Sickness deliberately floors at 1 survivor.
- **What is a "soldier"?** A permanent conscription via the build queue, not a reassignable job — see Military & Defense.
- **How do eras transition?** A hidden capstone Upgrade in the normal build queue — see Eras. How era *content* changes is the Era Manifest Model, also under Eras.
