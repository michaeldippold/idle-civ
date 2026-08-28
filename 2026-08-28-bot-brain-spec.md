# The Bot Brain — Spec (2026-08-28)

> **Status: direction approved by the owner in conversation, 2026-08-28. No code written —
> deliberately, per the standing rule: consensus, document, commit, then code.** This file is the
> spec for the item `todo.md` has carried as *"bots that WAGE WAR (conquest intent, not just
> raids)"*. It is written to be picked up cold by a session that has read
> [`2026-08-25-design-brief.md`](2026-08-25-design-brief.md) first.
>
> The owner's framing, which is the whole brief: *"Ignore what bots do right now, and only look at
> the tools they have access to since the big refactor that made them functionally identical to
> players, minus the brain… I am not expecting a SC2 bot, but more engagement with the mechanics
> would go a long way."* And the three frustrations to cure, in his words: **their lack of
> buildings; that they only do drive-by sackings; and a game you functionally cannot lose.**

---

## 1. The audit — what a bot is today, and why it is not an opponent

A full read of the bot code (2026-08-28) found **four independent clockwork loops and zero
decisions**. Nothing a bot does reads the board and chooses; every behavior is a timer or a dice
roll against constants.

| Behavior | Where | Trigger |
|---|---|---|
| Settle seat + `botHomeRing: 3`, keep an authored garrison, regarrison after 240s bare | `sim/bots.js → settle()` | every tick, lazy |
| Claim one **random** unowned frontier hex per `botClaimSeconds: 75`, to their era's dominion cap | `sim/bots.js → expand()` | timer |
| Advance eras on a hidden seeded countdown, capped at the last implemented era | `sim/eraclock.js` | timer |
| Raid (or 30% war if 8+ free units), pillage or take one hex, go home / garrison it forever | `sim/raiders.js → spawnRaid()` | **the human's** `conflict` event roll |
| Rebirth after being broken | `sim/bots.js → tickRebirth()` | timer |

The structural findings, ranked:

1. **Bots cannot win.** The only loss condition is the capital sacked; no bot code path ever sets
   `intent: "sack"`, war armies explicitly exclude the home hex, raiders pillage rather than
   conquer. The game is unlosable to bots by construction (a deliberate v1 fence, now expired).
2. **Two of three rivals never attack, ever.** `raidSender()` hard-skips non-warlike civs, and
   disposition is authored per era — River Kingdom and Salt Nomads are peaceful in all three ages.
   Grudges change raid *frequency* and caravan ambushes, never *whether*.
3. **Bot aggression is a function of the HUMAN's population.** The trigger lives in the human's
   event slate (`conflictBaseChance × (1 + yourPop × 0.03)`). Nothing a bot does responds to its
   own opportunity, strength, era lead, or proximity.
4. **Bots have no economy and build nothing.** Stocks are authored constants restocked per era;
   units are minted from nothing up to the levy (`botMint`); `S.map.built` never gains a bot
   structure. A bot at minute 90 is identical to that bot at minute 20.
5. **Bots defend only the seat and never respond to war.** Ordinary bot hexes fall with no dice;
   losing ground, losing battles, being besieged — none of it changes anything they do. They never
   re-take ground, never relieve their own capital, never retaliate.
6. **Bots do not interact with each other.** "Pressed" (4d design item 5) was never built; the
   word does not appear in `src/`.

**The toolbox is already symmetric.** `claimTile`/ownership, the dominion cap, `formArmy` /
`orderMarch` / `setStance` / `disbandArmy` (all take a civ), contact, battles, sieges, walls
(`wallsAt` reads any structure on any hex — a bot-built palisade works in the resolver *today*),
`beginSack(army, who)`, per-civ `res`/`units`/`upgrades`/era, the levy law, rebirth. What is
missing is only: bots don't **produce**, don't **build**, don't **buy**, and don't **decide**.
The brain has a full keyboard in front of it.

---

## 2. The laws this design answers to

- **Symmetric players is the North Star** (design brief, pillar 1): every improvement moves bots
  *toward the player's mechanics*, never toward a parallel cheat-sim. No resource cheats for
  difficulty; difficulty is authored pace, weights, and thresholds.
- **The arithmetic never does anything the Chronicle could not narrate** (design.md). Every bot
  decision must be a sentence. This is why the brain is a priority list, not a planner.
- **Attention is the scarce resource; warning time is the fairness mechanism.** Anything that can
  end the run must be telegraphed loudly enough to answer from pause. No order gets better by
  faster hands.
- **Never print the odds.** The brain may compare strengths internally (inputs the player can
  also inspect); no surface ever shows a computed probability.
- **Tune toward too-hard and walk back on evidence.** A too-hard brain produces a diagnosable
  failure; a toothless one produces nothing to diagnose.
- **Structural answers, not micromanagement** — for the *player's* counterplay. Everything the
  brain does must be answerable by things you build, take, or research.

## 3. Prior art (what each reference contributes)

- **AoE2**: priority-ordered rules + attack waves on timers produce 90% of the felt "opponent"
  at 5% of the complexity. Difficulty via cheats — rejected here, everything else adopted.
- **Civ V/VI**: personality is a *weight table*; **agendas** — legible behavioral rules the
  player can learn — are what make bots read as characters. `disposition` is our seed for this.
- **Paradox (Stellaris/CK)**: the **budget** (income allocated into buckets so the economy
  visibly goes somewhere) and **power-ratio gating** (only pick fights that clear a threshold).
- **Board-game Automas (Scythe, Wingspan, Root's clockwork)**: the bot is a **priority card** —
  "do the first legal thing on this list." Deterministic, zero look-ahead, and *readable enough
  to play around*. This is the fit for the digital tabletop identity, and the architecture below
  is an Automa with a posture.

None of these search, plan, or learn. Shipped AAA 4X AI is timers, weights, and priority lists.

---

## 4. The architecture — four layers, each buildable and testable alone

### Layer 0 — the honest-enough ledger *(prerequisite; the keystone)*

Bots need income, because every interesting decision downstream is a **purchase**.

- **Income runs the player's own formula over their territory**: for each held hex, its terrain's
  one resource accrues at `proxyPop × baseRate × terrainRate` into the civ's existing `res` —
  the same arithmetic as the human, with a **flat per-era population proxy** standing in for real
  per-hex population. Owner-approved starting point: proxy over real pop; upgrade path in §8.
  - Provisional `botHexPopProxy`: stone 4, bronze 8, iron 12 (authored per era beside
    `dominionCap`). Deliberately below human hex caps — their ledger has no player optimizing it.
  - A bot **mine/farm on a hex changes its yield** exactly as it would for the human (the hex
    economy's rules, unmodified). Food upkeep, growth cost, and famine are **skipped in v1** —
    the proxy is income, not mouths. Flagged as the known asymmetry.
- **`botMint` dies.** Units are **trained**: paid from the civ's `res` at the def's authored cost,
  through **one training slot per civ** with the def's authored time (a one-deep build queue —
  the same pacing instrument the human answers to, simplified). `popCost` is waived for bots in
  v1 (no real pop to draw from); this dies when the proxy does.
- **Structures are built the same way**: paid from `res`, one **build slot** per civ with the
  def's time, landing in `S.map.built[hexId]` like any human structure. Terrain gates and
  one-use-per-hex hold unmodified (`hexUse` seam).
- **What this buys**: minting-from-nothing dies; **economic warfare becomes bidirectional** —
  sacking their mine hurts them, taking their hills shrinks both their levy and their income;
  their board position becomes readable intel ("four hills and two mines" is a sentence about
  the army they can field).
- **Authored `stock` becomes the STARTING larder only.** `initAdversaries` seeds `res` at
  worldgen and on rebirth; the per-era restock on advance is **retired** (income replaces it —
  a people that lost its ground no longer gets a free refill for surviving to a birthday).
  Standing survives restocks as before: grudges outlive granaries.

### Layer 1 — the posture machine *(one word of state per civ)*

Each living civ holds `civ.posture ∈ { build, fortify, press, war }`, re-evaluated on a
**decision tick**: `botDecideSeconds: 45`, jittered per civ, accrued in sim time (pause-safe,
like every bot clock). Decisions roll on the game dice (`rng()`), like `expand()` always has —
they are part of the simulation and belong in the seed.

Transitions read only **legible facts** — things the Chronicle could say out loud:

| To | Enter when (any, weighted by disposition) | Leave when |
|---|---|---|
| **build** | default; goal achieved; threat passed | — |
| **fortify** | lost a hex/battle recently; era deficit ≥ 1; hostile border with a stronger neighbour | threat passed (timer) |
| **press** | era lead ≥ 1; levy headroom ≥ ~50%; victim visibly weak on the shared border | lead gone; bloodied (lost a war army) |
| **war** | grudge ≤ −4; era lead ≥ 2; PRESS succeeded repeatedly (took ≥ 2 hexes and held them) | war goal met or army broken |

**Disposition becomes the weight table over transitions**, not a permanent fence: warlike civs
reach PRESS easily and WAR readily; peaceful civs live in BUILD/FORTIFY and cross into WAR only
at the extreme thresholds. **"Peaceful" is a high threshold, not a constant** — this is what
fixes finding 2, and it is the Empire Earth fantasy: the River Kingdom that traded with you for
an hour declares war because you fell two ages behind. A reborn civ re-enters at BUILD.

The **`conflict` event's trigger dies** with this layer (finding 3): raid cadence moves onto the
sender's own decision tick (PRESS raids on a per-posture cadence), so aggression finally reads
the aggressor's situation. Remove the event from the era slates when the posture raids ship;
`hostilityMultiplier`/`riskAdversary` survive only for caravan ambush until caravans are
reworked. The era-clock wire (`rollRaidSize`, `rollRaidType`, the era-gap ramp) **survives
intact** — it still decides what force an age can field; the posture decides *when and why*.

### Layer 2 — the priority cards *(the Automa proper)*

Per posture, a short ordered list; each decision tick, the civ does the **first affordable,
legal** item and stops. Target ~15 rules total across all four cards. Provisional cards:

- **BUILD**: garrison below spec → train toward it · best unmined hills held → build mine ·
  food income below unit-upkeep line → build farm on best food hex · below dominion cap →
  claim the **best-scored** frontier hex (see below) · era capstone affordable → advance ·
  else train toward levy headroom.
- **FORTIFY**: border hex facing the threat unfortified → build palisade (bronze+) /
  watchtower for eyes · garrison below 1.5× spec → train · then fall through to BUILD's card.
- **PRESS**: no raid out → raid the victim's soft ground (existing `strikeHex` draw, existing
  cowardice) · flush muster → **war army at a scored border hex** (holds what it takes, then
  FORTIFY behavior on the new ground) · reprisal pending → target the remembered hex.
- **WAR**: army below levy → train and mass · goal hex reachable and force clears the gate →
  march · goal is the capital → the capital strike (§5) · goal met → garrison, post
  fortification behind it, fall to PRESS.

**Claim scoring replaces the random frontier draw** (`expand()`): weight frontier hexes by
terrain value to this civ (hills to a bronze civ wanting mines), adjacency to existing holdings,
and — deliberately — proximity to *contested* frontier, so bots race the human (and each other)
for the good ridge. This is opposition before a sword is drawn, and it costs one scoring
function.

**Cards are authorable content, not engine.** They should live beside the adversary defs (or one
shared card set weighted by disposition) so a future era or a new people is authoring, not code.
The info modal may eventually *show* a people's card, Root-style — legibility is the point, and
nothing in the card is a secret the design needs kept.

### Layer 3 — war conduct *(what fixes "drive-by sackings")*

Only shipped verbs. The rules:

- **Power gating, honestly scoped**: before any march-to-attack, compare own force to the
  **target hex's visible defense** — garrison size + wall pool of the structure standing there —
  the same read `hardened()` already does, narratable as "their scouts." Threshold
  `botAttackRatio: 1.5` provisional. No global omniscience: the bot reads the hex it is aiming
  at, nothing else. Internal arithmetic; never printed.
- **Wars hold and continue.** A WAR army that takes its goal re-evaluates on the next decision
  tick: goal met → garrison + fortify behind it; not met → next target. Ground changes color and
  *stays* changed. (The current war-army-garrisons-forever dead end — units permanently spoken
  for, reducing future pressure — dies with this; garrisoned conquest troops are the civ's to
  re-order.)
- **Relief**: seat besieged or garrison destroyed → the card's top rule becomes muster-all-free
  and march home. The sack timer becomes the race it was designed to be on both sides.
- **Reprisal**: when the human takes a bot hex or sacks a structure, record
  `civ.lastWound = { hex, tick }` and spike the grudge; PRESS/WAR target the wound first. The
  Chronicle names it: *"The Hill Clans have not forgotten the mine."* Grudges get verbs.
- **THE CAPITAL STRIKE — the loss condition arrives.** Owner-approved: **on by default**, gated
  three ways so a loss is always a story the player watched:
  1. Only from WAR posture, with a real army (host-tier or ≥ the gate ratio vs. your seat's
     visible defense).
  2. **Telegraphed twice**: at muster — *"The Hill Clans gather under one banner. This is no
     raid."* — and at sighting, like every army. The muster line fires even at Stone contact
     (anonymized voice), because warning time is the fairness mechanism and this is the one
     army that must never arrive unannounced.
  3. It uses the existing siege → sack pipeline unmodified (`sackCapitalSeconds: 150` is the
     relief window; your own double-speed home marching is the counterplay).
  Re-verdict the gates after the owner has actually lost a run to it — tune hard first, walk
  back on evidence, and the first loss is the diagnosable failure this whole spec exists to buy.

---

## 5. The Chronicle contract

Every posture change and every aggressive act must be narratable, gated by the same `contact`
fog as today (`nameGate`): named from Bronze, anonymous voice at Stone. Required lines (voice to
be written at build time, per the render-and-read lesson):

- Posture tells: fortifying a border (*"…raise a palisade on the ridge facing your country"*),
  pressing (probes, watchtower eyes), the WAR muster (mandatory, twice — see above).
- Reprisal attribution (the wound remembered).
- Peaceful-civ threshold crossings (*the heart-sink line*: a friend turning).
- Everything already required survives: era crossings, sightings, battle seals, the sack.

The board itself is the first surface: postures should be **diagnosable from the table alone** —
structures rising on their ground, walls facing you, discs massing — before the Chronicle says a
word. That is the Automa promise and the reason this fits the tabletop.

## 6. What dies, what survives

| Dies | Replaced by |
|---|---|
| `botMint` (units from nothing) | training slot + costs (Layer 0) |
| `expand()`'s uniform-random claim | scored claim (Layer 2) |
| The `conflict` event trigger + slates entry | posture-tick raid cadence (Layer 1) |
| `botWarChance` / `botWarMinFree` escalation roll | PRESS/WAR postures |
| Per-era stock restock in `initAdversaries` | income; stock = starting larder only |
| War-army-garrisons-forever dead end | re-orderable conquest garrisons (Layer 3) |
| The stale comment at `era.js:33` (claims restock reads the human's era) | delete on touch |

Survives unmodified: the era clock and its wire (`rollRaidSize`/`rollRaidType`), raider
cowardice and pillage/turn-home behavior (as PRESS's raid), `strikeHex` soft-target selection,
the levy law (`botLevyCap` keeps its floor), regarrison and rebirth clocks, one-raid-out
(generalizing toward "one army order per decision tick"), all contact/battle/sack machinery.

## 7. New config, provisional

```
botDecideSeconds: 45      // decision tick, jittered per civ
botHexPopProxy: per era   // stone 4, bronze 8, iron 12 — beside dominionCap
botAttackRatio: 1.5       // force vs visible defense gate for any attack march
botWarGrudge: -4          // grudge threshold for WAR (peaceful civs)
botWarEraLead: 2          // era-lead threshold for WAR (peaceful civs)
botPressEraLead: 1        // era-lead threshold for PRESS (warlike weighted lower)
botFortifyAfterLossSeconds: 180   // how long a wound keeps a civ in FORTIFY
```

Disposition weight tables live with the adversary defs (authoring, not CONFIG).

## 8. Open questions, with recommended defaults

1. **Bot-vs-bot warfare** — deferred (recommended). Contested *claims* ship immediately via
   claim scoring; armies fighting armies between bots waits until the world can narrate it
   ("pressed" finally becomes real here, as fact instead of flavor).
2. **Real per-hex population for bots** — the upgrade path off the proxy: bot hexes run the same
   logistic growth, famine, and `popCost` as the human. Do it when their economy needs to be
   raidable at the hex grain; the proxy is shaped so this swap changes income arithmetic only.
3. **Fog for bots** — v1 reads only the target hex's visible defense (scout-narratable). Full
   per-civ fog honesty is a someday, priced when scouting (slice 6) settles what fog even is.
4. **Difficulty presets** — pace + weights + thresholds are already per-civ numbers; a
   world-level difficulty picker is a start-screen question for after the brain proves out.
5. **Capital strike default** — approved ON with the §4 gates; confirm after the first real
   loss, per the tuning law.

## 9. Build order

Each slice lands with harness checks (mutation-tested, per LESSONS: mutate a new check before
trusting it) and a live playtest gate before the next begins.

1. **B1 — the ledger**: income accrual, training slot, build slot, restock retirement. Check:
   a bot's `res` grows from territory; a sacked mine measurably slows it; no unit exists that
   was not paid for.
2. **B2 — bots build**: BUILD card only, posture fixed at `build`. Check: mines/farms appear on
   correct terrain, one per hex, era-gated; board shows them (debt cubes already handle
   visuals). *This alone cures the owner's "lack of buildings" frustration and is
   independently shippable.*
3. **B3 — the posture machine + cards**: transitions, FORTIFY, claim scoring, conflict-event
   retirement. Check: a wounded civ fortifies its facing border; a threatened peaceful civ
   never enters PRESS below threshold.
4. **B4 — war conduct**: power gating, holds-and-continues, relief, reprisal. Check: a WAR army
   with an unmet goal re-targets; a besieged seat musters relief; the wound is targeted next.
5. **B5 — the capital strike**: gates + telegraphs. Check: the muster line always precedes the
   march; the strike never fires outside WAR; **the owner loses a run** (the real acceptance
   test).

Sequencing vs. the standing queue: this is the promoted form of *"bots that WAGE WAR"* and
should come **before** the tech tree (a tree balanced against toothless bots is balanced against
nothing) and can interleave with the interface redesign. It has no dependency on scouting
(slice 6); scouting later deepens the warning-time economy this spec already leans on.
