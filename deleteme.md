# deleteme.md — pre-decision ideation log

> **Status: NOT design.** Nothing in this file is settled. This is a coherence pass on a
> late-night ideation ramble (2026-08-15), logged so the intent survives sleep. The lifecycle:
> read together → debate → promote survivors into `design.md`/`tech.md` as real decisions →
> **delete this file.** If this file still exists in a month, something went wrong.

---

## 5. Conquest growth & the peace path — ✅ RESOLVED & PROMOTED (2026-08-21)

**Promoted to `design.md` → "Conquest Growth & the Peace Path (settled)"** along with the
progressive-enhancement law, the observational-narration ruling, and amendments to Border
policy, the free-growth section, the conscription model, and the housing ladder. tech.md
carries the implementation contract; todo.md carries the phase plan. Kept below for the record
until this file is deleted.

**The settled shape:**
1. **Deeper consolidation at Bronze→Iron** — crank the existing `keep` dial hard (a holdfast is
   a couple dozen people under a lord; you should enter Iron with single digits). Paired with an
   **era output multiplier** so `keep × output ≈ 1`: total throughput unchanged, every existing
   cost stays valid, zero re-tuning cascade.
2. **Units are levied, not consumed** — popCost dies at Iron ("losing a holdfast to gain one
   soldier is thematically wrong"). Army capacity = holdfasts × levy rate: population stops
   *containing* the army and starts *supporting* it. (Engine note: pop and units separate —
   this simplifies civilians()/reserved()/reconcile substantially.)
3. **Housing dies at Iron** — the iron delta removes the hut line entirely (first founding
   building retired; the manifest machinery's moment). Stone/Bronze keep huts + the growth
   timer; growth MODE becomes era-data: timer → conquest → (later) conquest + attraction.
4. **Growth = conquest or conversion, only.** No automatic arrivals, no passive trickle — and
   that's deliberate (user ruling): active growth forces engagement with the new mechanics,
   keeps growth-stopping a player choice (the housing cap's one good job, replaced), and
   moves population onto the fun side of the game. AFK growth stalling is as idle-legal as the
   build queue stalling. *Passive attraction is shelved for the Enlightenment*: cities
   petitioning to join because morale is high — one of morale's both-edged consequences.
5. **Two adversary tiers**: the named majors stay strategic entities (siege, plunder, trade,
   maybe wholesale annexation as an era-defining act); the delta adds a **minor tier** of
   freeholds/petty lords — more numerous, individually weak stat-stacks, each worth one sworn
   holdfast + a modest stock. The era's capturable holdfasts = a designed population budget.
6. **The peace path — religion's mechanism, found.** Priests (trained unit) enable the ENVOY, a
   third action on an adversary: slow, costs gifts + the expedition slot, no casualties,
   standing RISES, the holdfast arrives intact. War is fast, pays plunder immediately, costs
   casualties/siege/standing. **No-dominant-path architecture**: the paths pay in different
   currencies and out in different currencies — plunder is one-shot, goodwill COMPOUNDS —
   plus per-target affinity (disposition modulates envoy odds as walls modulate assaults;
   hinted via flavor, so reading the target IS choosing the tool) and shared standing as the
   self-balancing meter (heavy war poisons your envoys' welcome).
7. **Absorbed = generic** (user ruling): flavor spends its budget while the entity is outside
   and hostile; a sworn holdfast is just +1 pop, and the Chronicle keeps the name it had.
8. **Stakes scale with narration** (user ruling, canon-worthy): hazards keep taking troops and
   goods; big losses (a holdfast, one day a planet) stay possible but rare — and the size of
   the loss sets the size of the story. Bigger consequence, bigger Chronicle.
9. **Military nouns re-denominate too** — unit names are already era-facts (Horseman →
   cavalry-flavored successors per age).

**Identity line worth promoting to design.md with it:** *the fun concentrates where the verbs
are* — "active play, passive resolution" is the niche (you act whenever you choose; the world
resolves alone), confirmed by play: expeditions are BY FAR the most fun part of Iron. And the
diagnostic that started all this: **flavor friction is a gameplay smell** — "my longhouse holds
3 holdfasts" was the fiction correctly reporting un-re-denominated mechanics.

**Locked in follow-up debate (2026-08-21):**
- **Presence is rewarded, never required** — promoted straight to design.md (canonical): major
  events get modal ceremony live, full Chronicle resolution AFK; any modal choice ships with a
  designed default and rolls off unattended. The out-of-scope entry on interactive events is
  refined accordingly (the ban is on events that WAIT).
- **Standing/morale starts now, grows teeth later.** The no-dominant-path architecture requires
  standing implemented early even with minimal effects this age; when TRADE becomes an explicit
  verb (future), the system turns fully load-bearing. State stats may emit **observational
  narration** via the events engine ("violence breaks out in a bread line") — this is legal and
  distinct from the rejected flavor-only morale: the stat is real and the text reports it; the
  lie-of-implication ban is on text hinting at consequences that don't exist. The events system
  gains state hooks (weights/conditions keyed on standing/morale) — the windfall dice finally
  get a worldview.

**Open tunables (implementation-time, not design blockers):** the keep/output pair; levy rate;
minor-tier count/stats per era; envoy timer/cost/odds; capture windfall sizing so neither path
is strictly better; what a wholesale major-annexation is worth.

## 1. Religion & monks — ✅ mechanism RESOLVED via §5 (priests → the envoy/peace path); morale gist below still stands for the Enlightenment

**Gist of the debate so far — tentative agreements:**
- Morale framework (conditional yes, reversing the Dispatch verdict): must be **derived, never
  tended** (computed from durable choices, no bar to feed); **narrated, never metered** (a word
  and Chronicle lines, no percentage); **standing-shaped** — few discrete threshold consequences,
  each one an event the Chronicle can narrate ("a family slips away in the night"), never
  continuous multipliers; **both-edged** (every state offers something; no death spirals);
  **era-gated** (arrives when units are Cities and "the people" are an abstraction).
- ~~Flavor-only morale REJECTED by our own law~~ *(refined 2026-08-21, user: "I overstated the
  prior canonical ruling")*: **observational narration of a true stat is always legal** — the
  lie-of-implication ban only forbids text hinting at consequences that don't exist. See the
  progressive-enhancement law in design.md.
- **Religion = generation one of the feeling-of-the-people system**: faith at holdfast scale in
  Iron, secularized into public opinion in the Enlightenment, laws replacing rites as the levers.
- The "benevolent leader vs iron fist" sketch was diagnosed as *laws, not morale* (input vs
  output) — rescued as the first mutually exclusive law pair for the Enlightenment.
- Conversion check deferred to religion v2: needs a designed outcome (tributary? vassal?) and a
  real failure cost (martyrdom: monks lost, standing craters).

**Proposed but UNSATISFYING (do not implement):** the monk-as-expedition-attaché skeleton
(religious building → monk unit via barracks pattern → hinted bonuses on campaigns/trade; home
faith value narration-only in Iron). User sat with it and remains unconvinced — revisit fresh.

<details><summary>original §1 text</summary>

## 1 (original). Religion & monks — land in the IRON AGE, not Enlightenment

- Monks and religion get built into the **current** age. Mechanism deliberately unspecified
  tonight — "I have some ideas on how it could work with minimal engine impact, but we can do
  this later."
- The interesting part is the **arc across ages**: religion arrives at full power in Iron,
  persists into the Enlightenment but *diminished* — reduced in power somehow — and eventually
  leaves the game entirely.
- (Coherence note: this is exactly the content-lifecycle shape the manifest architecture was
  built for — arrive, carry with overrides, retire with narrated migrations. Religion would be
  the first content designed *from birth* with its whole lifespan in view.)

</details>

## 2. Siege engines & castle defense — ✅ RESOLVED (2026-08-15)

**Debated and promoted to `design.md` → "Siege & Fortifications (settled)."** Sequenced
combat (walls then field); failed breach = retreat with light losses; wall damage PERSISTS in
the adversary's living remnant (sieges become sagas; defeat becomes investment); Siege Engine
unit gated by a Siege Workshop, priced in wood + stone; and the tier-vocabulary generalization
(weak/mid/strong per era, stock and trade scaled to tier, disposition cross-cutting so eras
don't template) canonized as an authoring rule. Original text below until deletion.

<details><summary>original §2 text (superseded)</summary>

## 2 (original). Siege engines & castle defense — Iron Age military deepening

- **One new static number on adversaries: `castleDefense`** (name TBD — "castle defense, or
  something like that").
- **Sequenced combat, literally:** castle defense must be overcome **before any enemy units
  fall**. First the walls, then the fight. "Literally just sequence them."
- **Siege engines** are a new unit type (or similar): they do outsized damage to castle
  defense, and otherwise contribute ordinary unit strength to the field battle.
- **Flavor carries the read, hard** (per the now-canonical flavor-is-load-bearing law):
  adversaries hint their fortification through description — *"a small holdfast"* vs. *"a
  sturdy keep"* vs. *"a stone-walled castle."* The player learns to bring siege engines the
  same way they learned the River Kingdom was too strong to raid early: by reading.

</details>

## 3. The Enlightenment — two pillars (still to be scoped; NOTE: §5 pre-seeded it)

*(2026-08-21: §5 handed this age three inputs — morale now has a mechanical family to join
(standing), passive attraction-growth is shelved here as one of morale's both-edged
consequences, and the benevolent/iron-fist law pair from §1 still waits. Scope when Iron's
rework has shipped and played.)*

The age needs two things to *scream* Enlightenment:

**Pillar 1 — Science.** No mechanic yet. The bar: "something that says hey, we are taking
this shit seriously now."

**Pillar 2 — Supremacy of reason → a LAW system.**
- You **train laws** — through the build queue, on brand for this game — deciding how to rule
  a much larger scope of people.
- **Mutually exclusive upgrades** enter the game here: train either, but choosing one
  *forgoes* the other, permanently. Still set-and-forget — but it simulates the active
  decision-making of a game like Civilization without requiring presence.
- Possibly the age where a **morale/reputation system** for your own people makes sense —
  you finally rule enough of them. Hard requirement if it exists: **not a simple good/bad
  meter.** High morale and low morale must each carry both benefits and consequences. Engine
  push-and-pull unknown; the *feeling* is the point:
- The unifying goal: adding Enlightenment *values* to the game is how the scope change gets
  felt — "a real ruler, not a guy organizing some huts."
- Religion persists here, diminished (see §1), presumably in tension with the above.

## 4. Population scale rework — ✅ RESOLVED (2026-08-15)

**Debated and promoted to `design.md` → "Population & Scale: Unit Re-denomination (settled)."**
The resolution inverted the original proposal: scale what a unit *means*, not the number —
Person → Family → Holdfast → City → Colony → Territory → Nation → Bloc → Bloc → Settlement →
World → System. 1:1 relabel at Bronze; generous consolidation (5→3/4) from Iron onward, doubling
as a min-max brake. Silicon deliberately keeps Bloc. The late addendum resolved with it: the
housing→growth verb re-denominates instead of retiring. Original ramble preserved below for
the record until this file is deleted.

<details><summary>original §4 text (superseded)</summary>

## 4 (original). Population scale rework — work backwards from multiplanetary

- If the game ends among the stars, population can't grow by a dozen or two per age. Proposal:
  **roughly 10× per age** ("or something akin to this — I am sure you will tell me some
  specific formula makes more sense").
- Concrete pain point: by the THIRD age (Iron), ~30 people is wrong. **Iron should feel like a
  kingdom.**
- Everything rescales with it, attentively: housing stops being huts counted one at a time —
  Iron-age housing reads as **parts of town, districts**; by Renaissance/Enlightenment the
  scope is **regions or nations**, or something in that direction. Specifics to be talked out.
- (Coherence note: the engine anticipated pieces of this — migration primitives were designed
  with "population re-denomination" as a named use case, `popNoun`-style era-scoped vocabulary
  was floated in the original manifest sketch, and "holdings tiles show a flat count with no
  compaction" is already a known limitation waiting for big numbers.)
- **Late addendum — the loop itself may not survive the scale.** There may come a point where
  *building houses and watching population grow* stops making sense as a player activity at
  all. A king doesn't know every newcomer, and at that scale growth isn't wanderers arriving —
  it's people starting families. Flagged for discussion now because "the absurdity of the
  juxtaposition will be clear before we hit The Expanse age": clicking a hut into a queue while
  administering an interplanetary civilization is a joke the game shouldn't accidentally tell.
  So the question isn't only *how do the numbers scale* — it's *when does the housing→growth
  verb retire, and what replaces it.*

</details>

---

## Flagged for the debate (Claude's parking lot — questions, not objections)

**Siege (§2): ✅ RESOLVED — see design.md.** (Failed breach: light-loss retreat. Persistence:
yes, walls live in the remnant. Escorts/home: siege engines are ordinary strength everywhere,
wall bonus only.) Original questions kept below:
- What happens on a *failed breach* — does the column come home unbloodied (walls repel, no
  field battle, no casualties?) or bloodied at the walls? Either is designable; they feel very
  different.
- Is `castleDefense` truly **static**, or does damage to it *persist* between campaigns? The
  stock-not-economy precedent whispers that a breached wall could STAY breached — which would
  create multi-campaign siege arcs against hard targets. Deciding this early decides whether
  sieges are a check ("bring enough") or a saga ("wear them down").
- Do escorts/home defense interact with siege engines at all, or are they campaign-only?

**Religion (§1):** mechanism deferred per your call — but one early question shapes it: is
religion a *building chain*, a *person-type* (monks as units?), an *event layer*, or a
*morale precursor*? The §3 morale system might want religion to have been its Iron-age seed.

**Enlightenment (§3):**
- Mutually exclusive upgrades are engine-cheap (an `excludes` field, a build() check, a
  validator rule) and design-expensive (every pair is a real fork). Good trade.
- Laws-as-trainable-upgrades and the morale system probably want to be ONE system viewed from
  two sides (laws push morale; morale gates what laws are enforceable?) — or they'll compete.
- Panel real estate: laws likely need a surface. This may be the age that first invokes the
  settled pressure valve (widening ages consolidate panels).
- Science pillar is the emptiest slot — worth deciding what it is *not* (probably not a
  research-tree clone of upgrades, or it's just Upgrades II).

**Population scale (§4): ✅ RESOLVED — see design.md.** (Growth-timer math survives because
numbers never inflate; retrofit is text + border migrations; compaction display never needed.)
Original questions kept below for the record:
- The free-growth timer doesn't survive 10×/age as-is (a settler every 45s cannot produce
  thousands); growth likely becomes proportional (a % per interval) or era-scaled batches
  ("a family arrives", "a village swears fealty"). The *feel* of arrivals-as-events is worth
  preserving even when the numbers are abstract.
- Upkeep, storage caps, costs, raid sizes, adversary stocks all re-derive at each scale jump —
  this is the "attentively" in your note, and it's the real cost of the idea. Manifest
  `rescale`/migration machinery handles the *transitions*; the *balance* is hand work per age.
- Number display needs compaction (1.2k / 3.4M) — already a known limitation, becomes urgent.
- Sequencing question for the debate: retrofit Iron's scale now (it just shipped), or let Iron
  stand at village scale and make the jump AT the Enlightenment transition (re-denominate:
  "your 30 become 300 households"), keeping the 10× rule forward-looking only?

- ✅ RESOLVED with §4: the verb re-denominates rather than retiring — the loop survives to
  Kardashev. (Original note kept:) The late addendum names something bigger than content
  lifecycle: **mechanics have lifecycles too.** The manifest model retires *things* (a building, a resource, a job); retiring a *core
  verb* (build housing → watch arrivals) is a new class of transition the architecture hasn't
  had to express yet. Precedent exists in miniature — growth already changed shape once
  (purchase → free timer) — but sunsetting a whole loop mid-game, without it feeling like
  loss, is its own design problem. Likely wants the same treatment as everything else here:
  the verb doesn't vanish, it *re-denominates* (huts → districts → colony ships?), until the
  thing you're allocating is no longer people but something scale-appropriate. Worth deciding
  the *retirement age* of the loop early, so the ages before it can taper rather than cliff.

**Sequencing overall:** §1+§2 are Iron content packs (deltas — cheap by construction now);
§3 is the Enlightenment scoping conversation actually starting; §4 cuts across everything and
probably wants to be settled BEFORE Enlightenment content is priced, or every number gets
written twice.
