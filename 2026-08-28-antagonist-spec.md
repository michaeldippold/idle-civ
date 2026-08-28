# The Antagonist Spec — Bots and the Second Human (2026-08-28)

> **Status: direction approved by the owner in conversation, 2026-08-28. No code written —
> consensus, document, commit, then code.** This file supersedes the bot-brain spec written
> earlier the same day (this file's own previous revision — see git history); it merges that
> spec with the multiplayer feasibility analysis done hours later, **because the two were about
> to fight each other and are, in the owner's words, the same thing:**
>
> *"They both are kinda the same thing — the primary player needs antagonists, either run by a
> bot or by another player."*
>
> The specific fight the merge resolved: the bot spec's Layer 0 recommended a **proxy** economy
> for bots, while a second human needs the **real** per-player economy — making the proxy
> throwaway work. **Ruling: the honest version wins.** One substrate serves both.
>
> **RE-SORTED the same night (owner ruling): THE SECOND HUMAN COMES BEFORE THE BOT BRAIN.**
> Human-vs-human is the best design instrument this project can own — *"player vs player is by
> far the best feedback I will get, and it can tell me things that no bot can no matter how
> good they are. Things like, 'is the game fun?'"* — and the bot brain is then **authored from
> observed play** rather than from intuition. The full reasoning is in Part II's preamble; the
> build order in §7 reflects it. The owner's underlying realization, stated once here because
> it governs everything: **in a competitive 4X against bots, the bots are the content** —
> *"gameplay feel is highly dependent on how good the bot sim is."*
>
> Written to be picked up cold by a session that has read
> [`2026-08-25-design-brief.md`](2026-08-25-design-brief.md) first. The design brief's pillar 1
> is the sentence this whole file implements: *"a 'player' is a data structure plus a
> decision-maker, and the human is just the player whose decision-maker is a mouse."* A remote
> human is a player whose decision-maker is a socket. A bot is a player whose decision-maker is
> a priority card. Everything below is one substrate and two decision-makers — built in that
> order.

---

## 1. The audits — where things stand today

### 1a. The bots are four clockwork loops and zero decisions *(audit 2026-08-28)*

| Behavior | Where | Trigger |
|---|---|---|
| Settle seat + `botHomeRing: 3`, keep an authored garrison, regarrison after 240s bare | `sim/bots.js → settle()` | every tick, lazy |
| Claim one **random** unowned frontier hex per `botClaimSeconds: 75`, to their era's cap | `sim/bots.js → expand()` | timer |
| Advance eras on a hidden seeded countdown, capped at the last implemented era | `sim/eraclock.js` | timer |
| Raid (or 30% war if 8+ free units), pillage or take one hex, go home / garrison it forever | `sim/raiders.js → spawnRaid()` | **the human's** `conflict` event roll |
| Rebirth after being broken | `sim/bots.js → tickRebirth()` | timer |

Findings, ranked: **(1) bots cannot win** — no code path reaches the loss condition; war armies
exclude the home hex, raiders pillage, `intent: "sack"` is player-only. **(2) Two of three
rivals never attack in any era** — `raidSender()` hard-skips non-warlike civs and disposition is
authored constant. **(3) Bot aggression is a function of the HUMAN's population** — the trigger
lives in the human's event slate. **(4) No economy, no buildings** — stocks are authored
constants, units mint from nothing (`botMint`), `S.map.built` never gains a bot structure.
**(5) No defense beyond the seat, no reaction to war** — no relief, no reprisal, no retaking.
**(6) No bot-bot interaction** — "pressed" (4d item 5) was never built.

Owner: *"a game you functionally cannot lose is super not fun."* The three frustrations to
cure: **their lack of buildings; that they only do drive-by sackings; the unlosable game.**

### 1b. Two humans could fight today, but only one of them exists economically *(audit 2026-08-28)*

**The military half is genuinely done and symmetric.** `tickMilitary` loops all players with no
special cases: armies under the levy, marches, meeting engagements, sieges, sealed dice
battles, fortifications that work in the resolver regardless of builder, relief racing the sack
timer, `breakNation`. Two humans could wage a real war with today's verbs, and one could lose it.

**The economic half runs for `me()` only.** [`step.js`](src/core/step.js) computes gather/eat,
caps, starvation, the build queue, growth, and events for the one human; `rates()`/`caps()`
read `me()`'s holdings; the verb layer (`actions.js`, 36 `me()` call sites) acts on `me()`
implicitly. A second human would have starting stock, no income, no ticking queue — and no way
to even issue a build. **You could fight one another today; only one of you would have an
economy to fight with.**

**The seams for multiplayer were bought deliberately and are real.** Fixed-tick deterministic
sim ((seed + tick count + actions) fully determines state), seeded RNG with named sub-streams,
save/load exactness as a standing correctness requirement, and
[`journal.js`](src/core/journal.js), which records every verb as `{tick, pid, verb, args}` and
names its own purpose: *"a bot player is a thing that CALLS VERBS, indistinguishable at this
seam from a human clicking; lockstep multiplayer is this journal, exchanged."* The game's shape
is maximally forgiving: 5 ticks/s, ~120 hexes, no APM — bandwidth and latency are non-problems.

---

## 2. The laws this design answers to

- **Symmetric players is the North Star** (design brief, pillar 1). Every improvement moves
  antagonists *toward the player's mechanics*, never toward a parallel cheat-sim. No resource
  cheats for difficulty; difficulty is authored pace, weights, and thresholds.
- **The arithmetic never does anything the Chronicle could not narrate.** Every bot decision
  must be a sentence. This is why the brain is a priority list, not a planner.
- **Attention is the scarce resource; warning time is the fairness mechanism.** Anything that
  can end the run must be telegraphed loudly enough to answer from pause.
- **Never print the odds.** The brain may compare strengths internally (from inputs the player
  can also inspect); no surface ever shows a computed probability.
- **Tune toward too-hard and walk back on evidence.** A too-hard brain produces a diagnosable
  failure; a toothless one produces nothing to diagnose.
- **Structural answers, not micromanagement** — for the player's counterplay against everything
  the brain does.
- **1.0 is single-human; the second human is an INSTRUMENT, not a feature.** The design brief's
  fence stands. Multiplayer is promoted in this spec's build order because it is the best
  playtest apparatus the project can own — it exists to make the single-human 1.0 good, which
  is also why promoting it does not violate the no-features-before-the-core-settles rule: it IS
  the instrument that settles the core.

## 3. Prior art (one line each — plus the one that settles the ordering)

**AoE2**: priority rules + attack waves on timers produce 90% of the felt opponent at 5% of the
complexity (difficulty-via-cheats rejected, everything else adopted). **Civ V/VI**: personality
is a weight table; legible *agendas* make bots read as characters — `disposition` is our seed.
**Paradox**: the budget (income visibly allocated) and power-ratio gating (only pick fights that
clear a threshold). **Board-game Automas** (Scythe, Wingspan, Root's clockwork): the bot is a
**priority card** — "do the first legal thing on this list" — deterministic, zero look-ahead,
readable enough to play around. None of these search, plan, or learn.

**And the methodology precedent that settles human-before-bot:** board games are playtested
**human-vs-human first**, and the Automa is authored **afterward, to imitate observed human
play** — Scythe's and Wingspan's Automas were designed after their games were finished, by
watching what human opponents actually do and writing cards that fake it. A solo bot for a game
nobody has played against a human is an imitation of an opponent nobody has ever seen. For a
digital tabletop, human-first is not a detour from the methodology; it IS the methodology.

---

## PART I — THE SUBSTRATE (shared; built first)

Three campaigns. Each is independently valuable, each is prerequisite to both Part II and
Part III, and together they are most of the total cost. **This is the shared spine that keeps
the two halves from fighting: everything here is built once and used by both decision-makers.**

### S1 — the `me()` sweep: the sim stops knowing who "the" player is

The census: **~77 `me()` call sites** in the four core files (actions.js 36, derived.js 25,
population.js 11, map.js 5), plus scattered viewer-branches inside the sim. The military half
already follows the right idiom — `armiesOf(p)`, `active(civ)`, `holdings(pid)`,
`marchArmies(dt, p)` all take the acting player and default to `me()`. **The sweep is finishing
that existing pattern across the economy half, not inventing a new one.**

- **Not a `host()` global.** (Owner asked; answered here so the question stays answered.) A
  global "who is acting" accessor is exactly what breaks when two players act in the same tick —
  it is `me()` with a different name. The generalization is the **parameter**, threaded through:
  `rates(p)`, `caps(p)`, `settle(tileId, p)`, `buildStructure(tileId, sid, p)`. `me()` survives
  as **the interface's accessor** — "the player whose screen this is" — legitimate in ui/,
  forbidden in the sim.
- **The rule, harness-enforced** (the acyclic-by-check precedent): **no file in `src/sim/`,
  `src/map/`, or the sim half of `src/core/` may read `S.me` or call `me()`**; rendering and
  ui/ may. A grep-shaped harness check pins it so it cannot regress.
- **Known viewer-branches-in-sim, found in the audit** (the list to start from, not the whole
  list): `breakNation` calls `runEnded` only when the victim is `S.me` (under any two-human
  model this diverges — generalize to "a broken HUMAN ends that human's run"); the dominion cap
  in `conquer` is checked only for `S.me` (cap everyone — bots answer to the same scope law by
  design); `chartGround` in `marchArmies` gated on `S.me` (chart for the marching civ; per-civ
  fog already exists); every `chronicle(...)` branch on `atkP.id === S.me` (becomes "is this
  the viewer" — presentation, correctly viewer-keyed, but must move OUT of sim decisions).
- **Precedent says this is a week, not a landmine field**: the per-player refactor (2026-08-26)
  was exactly this shape — seven commits, each with its own harness section, 902 checks green,
  two real bugs caught that the review had predicted. Same campaign structure here.

### S2 — the economy becomes per-player (the honest ledger)

`step.js`'s economy loop runs for **every living civ**: gather by held hexes (people ×
per-capita rate × terrain, the one formula), caps, growth toward terrain caps, famine draining
frontier-first, the build queue ticking, upkeep. Bot hexes carry **real `S.map.pop`** — the
substrate is already per-hex and owner-agnostic.

- **What this deletes from the old bot spec**: the per-era income proxy (`botHexPopProxy`),
  the special training slot, the special build slot, and the popCost waiver — all dead. Bots
  train units at the defs' authored costs and times through **their own build queue** (the
  civ record already carries `buildSeq`; the queue field generalizes with it), pay `popCost`
  from their own hexes, and build structures through the same verb the human uses.
  **`botMint` dies — AT B1, not S2** *(sequencing corrected at build time, 2026-08-28)*: the
  first draft killed it here, but nothing QUEUES bot training until the brain exists, and the
  re-sort put the whole socket campaign between S and B — killing it in S2 would have left the
  bots armyless for the entire playtest era. S2 builds the economy underneath it; B1 replaces
  it with real training the moment something can decide to train.
- **What it buys the multiplayer half**: player 2 exists. This is the single largest work item
  on the second-human path, and it is shared work.
- **What it buys the bot half**: economic warfare becomes bidirectional — sacking their mine
  slows their army, taking their hills shrinks their levy *and* their income, raiding their
  hexes kills real people. Their board position becomes readable intel: "four hills and two
  mines" is a sentence about the army they can field.
- **Authored `stock` becomes the STARTING larder only.** `initAdversaries` seeds `res` at
  worldgen and rebirth; the per-era restock on advance is retired — income replaces it, and a
  people that lost its ground no longer gets a free refill for surviving to a birthday.
  Standing survives as before: grudges outlive granaries.
- **Safety valves, flagged loudly** (per-civ toggles, never a parallel formula — the proxy is
  dead and stays dead):
  - `botFamineExempt: true` at first — a bot brain that starves its own people to death is a
    bug generator while the cards are young. The BUILD card carries food self-care rules (see
    Part III); the exemption is removed the session the cards prove they keep a realm fed.
  - **Bots skip the narrative event slate v1** (sickness, windfalls) — events are authored as
    the watched seat's story. Whether rivals share the hazards is an open question (§6); the
    seam is a per-civ flag, so turning it on later is authoring.

### S3 — one action API: every decision-maker calls verbs

Every verb takes the acting player and journals with its real `pid`. **The bot brain does not
call `formArmy` and `claimTile` directly — it calls the same verbs the human's buttons call**,
through the same refusal guards (refusal *strings* stay a UI concern; the guard logic is
shared). A remote human is a socket that delivers verbs into the same funnel.

What this buys, in the journal's own words: a bot is *"indistinguishable at this seam from a
human clicking"* — so a bot's whole game is replayable from seed + journal, a bug in bot
behavior is a bug report you can re-run, and the harness can drive a bot through the same API
the netcode uses. This is the design brief's "one action API that all players (human, bot,
someday remote human) issue commands through," made literal.

---

## PART II — THE SECOND HUMAN (decision-maker: a socket; built SECOND, on purpose)

**Why this part was promoted ahead of the brain** *(owner ruling, 2026-08-28, the night the
spec was written)*: human-vs-human is the highest-grade design instrument this project can own,
and it answers the questions no bot can at any quality level — **"is the game fun?"** first
among them. Two human brains on the identical game state, every observed behavior with a mind
behind it (no more "is this boring, or is the bot just dumb?" confound), and a debrief after
each game. The findings feed the game's tuning directly, and they feed Part III structurally:
*"My opponent did something wacky but it worked — can we open that strategy up for the bots?"*
is exactly how Automa cards get authored (see §3's methodology precedent). The brain becomes
**transcription of observed play** rather than speculative design.

Honest cautions that come with the promotion: human-vs-human sessions need two synchronous
humans, so they are the **milestone** instrument while solo-vs-bots stays the daily one — plan
the debrief as part of each session, since that is where the card material comes from. The
first game will indict the pacing hard (two humans at peace, at literal 1×, cannot fast-forward
the lull — that is the strictest test of the re-pacing work, and running it early is the
point). And **discount 1v1 balance findings**: zero-sum duels reward rush and all-in harder
than the 1.0 vs-bots game will; findings about *verbs and feel* transfer cleanly, findings
about *numbers* need a haircut.

**Scope fence, restated: 1.0 is single-human.** This part is an instrument. Not matchmaking,
not accounts, not anti-cheat (both clients hold full state; a friendly game does not care), not
reconnect-hardening beyond what save/load already gives.

### The table — how two humans end up in one game

The flow rides the existing start screen (World / Colour / Seat name, fixed for the run) and
the existing every-new-run-reboots rule. **The ordering constraint that shapes everything: the
guest must join BEFORE worldgen**, because seats are placed during generation — so the lobby
happens on the start screen, not in a running world.

1. **Host opens a table**: picks World and their own colour/seat-name as today, hits "Open a
   table" instead of Begin, and gets a **join code** (a short room id on the relay; shareable
   as a link). The start screen becomes the lobby: host's picks shown, one empty seat waiting.
2. **Guest joins**: enters the code (or opens the link), lands on the same start screen in
   guest shape — World is the host's choice, display-only; **colour offers only unclaimed
   colours** (the palette has seven and the collision-heal in `initAdversaries` already
   reassigns bots around human picks — the mechanism exists); seat name their own.
3. **Begin is the host's button**, enabled when the guest is seated. Worldgen runs on the host
   with both humans' picks; the first snapshot is the guest's boot. Each client sets its own
   `S.me` (host seat 0, guest's assigned pid) — which is exactly why S1 forbids the sim from
   reading it.
4. **No mid-run joining, v1.** A table is joined at the start screen or not at all; rejoining a
   run you were already in is the snapshot-reload path below.

**The real new work item this uncovers is in the GENERATOR, not the interface: N human-grade
seats.** The seat-placement floor guarantees (food-bearing ground, timber adjacent, hills in
reach — the hex economy's layer 1) apply to `world.home` alone today. Two humans need the
generator to place N such seats, each carrying the full floor, at a minimum distance from each
other (the `rebirthMinDistance` idiom: fairness by geography, not by rules). This also touches
the authored continents — a frame must be able to feed two seats' guarantees, which the frame
editor note already flags in its data gotchas. Adversary seat counts may need to give way on
small frames.

**Saves and the absent guest** (recommended default, listed as open question 7): the host owns
the save, and a two-seat table resumes **paused until the guest reconnects** — the world
holding still for a missing player is the game's own contract applied to multiplayer. A host
override ("continue without them": the guest civ stands idle — economy runs, armies hold, no
decisions) exists so a test game is never hostage, but the pause is the default.

### Transport, clock, presentation

- **Sync model, recommended: host-authoritative snapshots.** One browser runs the sim; the
  guest client sends S3 verbs over a socket and receives the save-state (small by design, exact
  by law) a few times a second. Dodges float-determinism entirely, and disconnect/rejoin is
  "load the snapshot" — machinery that already exists. A tiny WebSocket relay — or WebRTC with
  copy-paste signaling and no server at all — roughly a day of plumbing once Part I exists.
  The relay is this project's first server-side component; decide the hosting at M1, not now.
- **Lockstep is the someday-upgrade, and the journal was built for it** — exchange verbs,
  replay on both sims, verify with state checksums (cheap: the serializer exists). One recorded
  hazard: `Math.pow` in event-chance math is not guaranteed bit-identical across JS engines;
  same-browser-both-ends sidesteps it, and S2's per-civ event flag reduces the surface.
- **The clock is shared, not stripped — and PAUSE IS MANDATORY, not merely tolerated.** The
  standing law *"anything time-critical must be issuable from pause"* is the enforcement
  mechanism for no-faster-hands; strip pause from multiplayer and two humans fighting becomes
  an execution contest, betraying the identity outright. So multiplayer generalizes pause
  rather than dropping it. **The one rule for both pause and speed** *(ruled in conversation,
  2026-08-28)*: **every player has a throttle; the world runs at the minimum.** Effective
  speed = `min()` across the table; pause is a throttle at 0 under the same rule, not a second
  mechanism. This preserves the exact single-player contract, generalized: *no one can force
  time to pass on you*. **And the legal throttle set is per mode** *(owner ruling, same day —
  full reasoning in design.md → The speed cap, which also killed 8× and 12× game-wide)*:
  **`{0, 1, 2, 4}` at a bot table; `{0, 1}` versus humans — true multiplayer is 1× or pause.**
  Speed in adversarial hands is an attention weapon: oscillate — march unseen at 4×, drop to
  1× to issue precise orders, speed back up — or change the pace while the other player sits
  reading the tech tree and trick them into idling. So versus play has exactly two states:
  **the world moves at the one speed you know, or it does not move** — the "I didn't realize
  the speed changed" failure is unrepresentable. Pause stays for both seats: load-bearing
  (anything time-critical must be issuable from pause) and symmetric — nothing moves, so
  nobody can be tricked; pause-spamming to issue orders is not an exploit, it is the design
  working, identically available to both. The 1× cap also deletes the latency-amplification
  concern outright. Pausing modals pause the table (the tabletop norm: anyone can say "hold
  on"). The infinite-pause griefer is out of scope for the friendly game (social contract; the
  someday-competitive answer is pause budgets, chess-clock shaped). One real edit to today's
  code: the tab-hidden pause becomes **host-only** — the sim runs on the host, so the host's
  hidden tab stops the world (reading as pause for the whole table). A guest's hidden tab
  stops only their rendering, never the world: their throttle is what they SET, and walking
  away from a running world without turning your throttle to 0 is a choice — the 2026-08-25
  ruling ("if you are not paying attention, pause the game") applied to the guest seat
  verbatim.
- **Per-viewer presentation**: the Chronicle's `=== S.me` branches become "is this the viewer"
  (each client filters by its own `S.me` — which is precisely why the sim itself must never
  read it, per S1); fog data is already per-civ; the start screen asks seat/colour for two.
- **Ending**: `runEnded` generalizes to "this human's run is over" — the loser's client shows
  the death screen; the winner's world keeps turning.

---

## PART III — THE BOT BRAIN (decision-maker: a priority card; AUTHORED FROM OBSERVED PLAY)

Everything here rides on Part I and only issues S3 verbs — and, per the re-sort, it is written
**after the human-vs-human playtest era begins**, so the cards are transcription of strategies
two humans actually used, not speculation. The architecture below is the approved frame those
observations get written into: an **Automa with a posture** — four pieces. (One escape hatch:
**B1, bots BUILD, may land any time after S3** if the bare bot boards grate before the
playtest era arrives — it is posture-locked, card-of-one, and independently cures the
buildings frustration.)

### The posture machine *(one word of state per civ)*

`civ.posture ∈ { build, fortify, press, war }`, re-evaluated on a decision tick
(`botDecideSeconds: 45`, jittered per civ, accrued in sim time — pause-safe). Decisions roll on
the game dice (`rng()`), like `expand()` always has: they are part of the simulation and belong
to the seed.

Transitions read only **legible facts** — things the Chronicle could say out loud:

| To | Enter when (any, weighted by disposition) | Leave when |
|---|---|---|
| **build** | default; goal achieved; threat passed | — |
| **fortify** | lost a hex/battle recently; era deficit ≥ 1; hostile border with a stronger neighbour | threat passed (timer) |
| **press** | era lead ≥ 1; levy headroom ≥ ~50%; victim visibly weak on the shared border | lead gone; bloodied (lost a war army) |
| **war** | grudge ≤ −4; era lead ≥ 2; PRESS succeeded repeatedly (took ≥ 2 hexes, held them) | war goal met or army broken |

**Disposition becomes the weight table over transitions, not a permanent fence.** Warlike civs
reach PRESS easily and WAR readily; peaceful civs live in BUILD/FORTIFY and cross only at the
extreme thresholds. **"Peaceful" is a high threshold, not a constant** — this cures audit
finding 2, and is the Empire Earth fantasy: the River Kingdom that traded with you for an hour
declares war because you fell two ages behind. A reborn civ re-enters at BUILD.

**The `conflict` event's trigger dies here** (finding 3): raid cadence moves onto the sender's
own decision tick, so aggression finally reads the aggressor's situation. Remove the event from
the era slates when posture raids ship; `hostilityMultiplier`/`riskAdversary` survive only for
caravan ambush until caravans rework. **The era-clock wire survives intact**
(`rollRaidSize`/`rollRaidType`, the era-gap ramp): it still decides what force an age can
field; the posture decides when and why.

### The priority cards *(the Automa proper)*

Per posture, a short ordered list; each decision tick, the civ does the **first affordable,
legal** item and stops. Target ~15 rules total. Provisional cards — expect the playtest era to
rewrite these, which is the point:

- **BUILD**: *food income below upkeep line → build farm / claim food ground* (the self-care
  rule that lets `botFamineExempt` retire) · garrison below spec → train toward it · best
  unmined hills held → build mine · below dominion cap → claim the **best-scored** frontier hex ·
  era capstone affordable → advance · else train toward levy headroom.
- **FORTIFY**: border hex facing the threat unfortified → palisade (bronze+) / watchtower for
  eyes · garrison below 1.5× spec → train · fall through to BUILD.
- **PRESS**: no raid out → raid the victim's soft ground (existing `strikeHex` draw, existing
  cowardice) · flush muster → war army at a scored border hex (holds what it takes, then
  FORTIFY behavior on the new ground) · reprisal pending → target the remembered hex.
- **WAR**: army below levy → train and mass · goal reachable and force clears the gate → march ·
  goal is the capital → the capital strike (below) · goal met → garrison, fortify behind it,
  fall to PRESS.

**Claim scoring replaces the random frontier draw**: weight frontier hexes by terrain value to
this civ, adjacency, and — deliberately — proximity to *contested* frontier, so bots race the
human (and each other) for the good ridge. Opposition before a sword is drawn, for the cost of
one scoring function.

**Cards are authorable content, not engine** — they live beside the adversary defs (or one
shared set weighted by disposition), so a new people or era is authoring — and so a strategy
observed in Tuesday's human game becomes a card rule on Wednesday. The info modal may
eventually *show* a people's card, Root-style; nothing in a card is a secret the design needs.

### War conduct *(what fixes "drive-by sackings")*

- **Power gating, honestly scoped**: before any attack march, compare own force to the **target
  hex's visible defense** (garrison size + wall pool standing there) — the read `hardened()`
  already does, narratable as "their scouts." `botAttackRatio: 1.5` provisional. Internal
  arithmetic; never printed.
- **Wars hold and continue**: a WAR army that takes its goal re-evaluates next decision tick —
  goal met → garrison + fortify; not met → next target. Ground changes color and stays changed.
  (The current war-army-garrisons-forever dead end dies; conquest garrisons are re-orderable.)
- **Relief**: seat besieged or garrison destroyed → the card's top rule becomes
  muster-all-free-and-march-home. The sack timer becomes the race it was designed to be, on
  both sides of the wall.
- **Reprisal**: when a bot loses a hex or a structure to a player, record
  `civ.lastWound = { hex, tick }`, spike the grudge; PRESS/WAR target the wound first. The
  Chronicle names it: *"The Hill Clans have not forgotten the mine."* Grudges get verbs.
- **THE CAPITAL STRIKE — the loss condition arrives. On by default**, owner-approved, gated
  three ways so a loss is always a story the player watched: (1) only from WAR, with a real
  army (host-tier or clearing the gate ratio against the seat's visible defense); (2)
  **telegraphed twice** — at muster (*"The Hill Clans gather under one banner. This is no
  raid."* — fires even at Stone contact, anonymized: warning time is the fairness mechanism and
  this army never arrives unannounced) and at sighting; (3) the existing siege → sack pipeline
  unmodified (`sackCapitalSeconds: 150` is the relief window; double-speed home marching is the
  counterplay). Re-verdict the gates after the owner has actually lost a run to it. *(Note: the
  human-vs-human era validates the loss condition itself first — two humans can already end
  each other — so by the time this ships, only the gates are unproven, not the death.)*

### The Chronicle contract

Every posture change and aggressive act is narratable, gated by the same `contact` fog as today
(`nameGate`): named from Bronze, anonymous at Stone. Required lines (voice written at build
time, per the render-and-read lesson): posture tells (a palisade rising on the ridge facing
your country; watchtower eyes; probes), the WAR muster (mandatory, twice), reprisal
attribution, peaceful-civ threshold crossings (the heart-sink line: a friend turning). The
board itself is the first surface — postures should be **diagnosable from the table alone**
before the Chronicle says a word. That is the Automa promise.

---

## 4. What dies, what survives *(merged)*

| Dies | Replaced by |
|---|---|
| `botMint` (units from nothing) | real training through S3 verbs at authored cost/time (S2) |
| The bot income **proxy** (previous revision of this spec) | the honest per-player economy (S2) — the merge's ruling |
| `expand()`'s uniform-random claim | scored claim (Part III cards) |
| The `conflict` event trigger + its slate entries | posture-tick raid cadence (Part III) |
| `botWarChance` / `botWarMinFree` escalation roll | PRESS/WAR postures |
| Per-era stock restock in `initAdversaries` | income; stock = starting larder only (S2) |
| War-army-garrisons-forever dead end | re-orderable conquest garrisons (Part III) |
| `S.me` reads inside the sim (incl. `breakNation`'s `runEnded` branch, `conquer`'s human-only cap, `chartGround`'s gate) | acting-player parameters + viewer-keyed presentation (S1) |
| The stale comment at `era.js:33` | delete on touch |

Survives unmodified: the era clock and its wire (`rollRaidSize`/`rollRaidType`, era-gap ramp),
raider cowardice and pillage/turn-home (as PRESS's raid), `strikeHex` soft-target selection, the
levy law (`botLevyCap` keeps its authored floor), regarrison and rebirth clocks, one-raid-out
(generalizing toward "one army order per decision tick"), all contact/battle/sack machinery, the
journal (finally consumed), save exactness.

## 5. New config, provisional

```
botDecideSeconds: 45      // decision tick, jittered per civ
botAttackRatio: 1.5       // force vs visible defense gate for any attack march
botWarGrudge: -4          // grudge threshold for WAR (peaceful civs)
botWarEraLead: 2          // era-lead threshold for WAR (peaceful civs)
botPressEraLead: 1        // era-lead threshold for PRESS (warlike weighted lower)
botFamineExempt: true     // S2 safety valve; retired when the BUILD card proves it feeds a realm
botFortifyAfterLossSeconds: 180   // how long a wound keeps a civ in FORTIFY
```

Gone from the previous revision: `botHexPopProxy` (the proxy is dead). Disposition weight
tables live with the adversary defs (authoring, not CONFIG).

## 6. Open questions, with recommended defaults

1. **Bot-vs-bot warfare** — deferred (recommended). Contested *claims* ship immediately via
   claim scoring; armies fighting armies between bots waits until the world can narrate it —
   "pressed" finally becomes real there, as fact instead of flavor.
2. **Do rivals share the hazard events** (sickness etc.)? Deferred behind the per-civ event
   flag (S2). Symmetry says eventually yes; legibility says only once the Chronicle can carry
   rival news without drowning the player's own.
3. **Fog for bots** — v1 reads only the target hex's visible defense (scout-narratable). Full
   per-civ fog honesty is a someday. *(Scouting itself was settled by ruling mid-substrate,
   2026-08-28: presence IS scouting — armies chart and see; no scout verb, unit, or stance.
   See design.md → The Three Army Verbs / Scouting is presence.)*
4. **Difficulty presets** — pace + weights + thresholds are already per-civ numbers; a
   world-level picker is a start-screen question for after the brain proves out.
5. **Capital strike default** — approved ON with the Part III gates; confirm after the first
   real loss, per the tuning law.
6. **When `botFamineExempt` retires** — the session the BUILD card demonstrably keeps a realm
   fed through a raid and a bad map.
7. **The absent guest** — recommended: a two-seat save resumes paused until the guest
   reconnects, with a host override that lets the guest civ stand idle. Confirm at the first
   real test game; the alternative (guest civ handed to a bot card) is tempting and should
   wait until the cards exist and have proven manners.

## 7. Build order *(re-sorted 2026-08-28: substrate → socket → playtest era → brain; each slice lands with mutation-tested harness checks and a playtest gate)*

**The substrate campaign** *(the per-player-refactor shape: one branch, commits with their own
harness sections)*:

1. ~~**S1 — the `me()` sweep**~~ **SHIPPED 2026-08-28 (branch `substrate`, four commits).**
   The map package, derived values, and the whole verb layer take the acting civ (defaults keep
   the interface unchanged); the journal records the real pid; the four audit landmines are
   defused (breakNation keys on `victim.key`, the dominion cap binds every conqueror, columns
   chart their own fog, battle/sack/conquest narration routes by pid through the bus with the
   wire filtering by viewer). The harness gained **the viewer ratchet** — every sim file's
   `S.me`/`me()` count pinned exactly, so a new viewer-read cannot land unrecorded and removals
   are recorded as progress — plus the deliverable check: a second keyless seat builds and
   settles through the real verbs, paid from its own stores, journaled under its own pid. A
   pinned **S2 BOUNDARY check** states the honest limit (the guest's queue does not tick) and
   inverts when S2 lands. Mutation-tested both ways. 1040 checks green. *Found on the way: a
   harness fixture was capturing hills out of the Hill Clans' home ring — captureTile now
   refuses ground held by anyone.*
2. ~~**S2 — the per-player economy**~~ **SHIPPED 2026-08-28 (branch `substrate`).** `step()`
   loops every living civ: gather by held ground, upkeep, era caps, queue, logistic growth and
   the pop mirror run identically for human, guest, and bot — and draw no dice, so recorded
   seeds are untouched. Bot home ground arrives worked to capacity (the human trio's own
   opening rule); expansion seeds a settling party; **conquest inherits the standing
   population** (the tile-scoped prune makes Conquest Growth literal). The per-era larder
   restock is retired — income earns back what plunder took; walls still rebuild taller;
   rebirth keeps its one fairly-reset baseline restock. Famine went per-civ (keyed civs behind
   `botFamineExempt`). Two decisions made at build time, recorded here: **`botMint` survives
   until B1** (above), and **a bounded GOLD REGEN toward the authored baseline**
   (`botGoldRegen`) stands in for their merchants — no terrain yields gold, so a traded-dry
   treasury would otherwise never recover and the caravan loop would starve; it tops up, never
   compounds, and dies when the brain trades. Browser-verified live: three bot economies
   earning at their own terrain's rates, caps holding, bots stopping at their era's dominion
   cap, save/load round-trip clean. *One bug the harness missed and the first live boot
   caught: authored stocks name only the resources a people HAS, so income accrued NaN onto a
   stone people's missing key — fixed both ends, healed in old saves, pinned by check.*
3. ~~**S3 — verbs all the way down**~~ **SHIPPED 2026-08-28 (branch `substrate`).** The army
   orders became journaled verbs, and the sack order — which lived only inside a DOM click
   handler, the exact defect the action layer forbids — was promoted to `orderSack`/`orderMove`
   in contact.js, callable by a bot or a socket. The journaling rule is enforced where it
   lives: **human seats journal; keyed civs never do** (their acts are drawn from seed + tick
   and would double-issue on playback). `core/replay.js` consumes the tape, and the harness
   proves the codebase's oldest claim **bit-for-bit**: same seed, same boot, the sitting's tape
   re-issued at its ticks — JSON-identical end state across five verb families while bots
   settle, expand and raid on the world's own dice. 1048 checks green.

**The socket campaign** *(promoted — this is the instrument)*:

4. ~~**M0 — N human-grade seats in the generator**~~ **SHIPPED 2026-08-28 (branch
   `substrate`).** Every human seat carries the full floor guarantee (food ground, timber
   ADJACENT, hills in reach, room for a trio), drawn from the same pool the solo seat always
   was, spaced `HUMAN_SEAT_DISTANCE: 8` relaxing to a floor of 4 — **the distance relaxes
   before the guarantee does**, since a close seat is a sharper game and a stranded one is a
   broken run. Seat 0 remains the origin, and the first seat is drawn before any distance
   question, so **a one-seat world draws exactly the dice it always drew** (pinned by check —
   every recorded seed still reproduces its world). `world.homes` carries them all; adversary
   seats and minors keep off every human's doorstep; `S.map.humanSeats` persists because a
   load regenerates the world and must never move a capital. Each human opens with its own
   seat, its own economy-broadening trio, worked to capacity. **The authored frames got their
   two-seat verdict** (printed each run, not asserted — it is a content judgement): The Long
   Reach mean 13.0, Broadwater 9.5, The Scatter 8.4 with a closest pair of 4, the archipelago
   relaxing to the floor honestly. *Owner's call if The Scatter should be excluded from
   two-seat games or left as the tight map.*
5. **M1 — the table + transport + clock**: the join-code lobby on the start screen
   (guest-before-worldgen, colour exclusivity, host's Begin), the relay (hosting decided
   here), host-authoritative snapshots, the `min()` throttle at `{0, 1}`, host-only tab rule,
   the absent-guest pause.
6. **M2 — per-viewer presentation**: viewer-keyed Chronicle, per-client fog render, loser's
   ending.

**THE HUMAN-VS-HUMAN PLAYTEST ERA** *(not a code slice; the whole point)*: milestone games
against a second human, debrief after each, findings recorded — verbs-and-feel findings feed
the game directly, observed strategies feed Part III's cards, 1v1 balance numbers get the
haircut. The first game's known deliverable is a pacing verdict at literal 1×.

**The brain campaign** *(authored from the playtest era's observations; each slice
independently shippable)*:

7. **B1 — bots BUILD**: BUILD card only, posture locked. Mines, farms on correct terrain, era
   gates, board shows them (debt cubes already handle visuals). *Independently cures the
   buildings frustration — MAY be pulled forward to any point after S3 if bare bot boards
   grate.*
8. **B2 — the posture machine**: transitions, FORTIFY, claim scoring, conflict-event
   retirement. Check: a wounded civ fortifies its facing border; a peaceful civ never enters
   PRESS below threshold.
9. **B3 — war conduct**: power gating, holds-and-continues, relief, reprisal. Check: a WAR army
   with an unmet goal re-targets; a besieged seat musters relief; the wound is targeted next.
10. **B4 — the capital strike**: gates + telegraphs. Acceptance test, written honestly: **the
    owner loses a run.**

**Sequencing vs. the standing queue**: Parts I–III all come **before the tech tree** (a tree
balanced against toothless antagonists is balanced against nothing) and can interleave with the
interface redesign. No dependency on scouting (slice 6); scouting later deepens the
warning-time economy this spec leans on. The promotion of Part II does not breach the
no-new-features-before-the-core-settles rule: the second human is the instrument that settles
the core, and 1.0 remains single-human.
