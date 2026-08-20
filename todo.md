# Idle Civ — TODO

> Provisional. Reorganize freely as work happens — this isn't a changelog, it's a working list.
> The "What's Working" log below the todo is the closest thing to a changelog; keep it updated
> as features land so this file stays a true picture of the project, not stale aspiration.

---

## STATUS — session handoff (2026-08-20)

### The design pass came back. This is the next project.

`interface-brief.md` went out, and a full interface redesign came back with it. It now lives in
the repo at **`redesign/`** (imported whole, exactly as delivered — `HANDOFF.md` describes the
contents, `DESIGN-NOTES.md` is the reasoning, and `Idle Civ Bureau.dc.html` is a running
prototype you can double-click). Nothing has been integrated. Nothing in `game.js`,
`styles.css`, or `index.html` has been touched. The next session is a **planning** session.

**The rough shape of what arrived.** The direction is called **Bureau**: the game is a
spreadsheet, so the interface stops apologising for it and becomes dense administrative paper —
ledger sheets, ink-plate panel headers, monospace numerals, hard 1px borders, no rounded
corners, no shadows. Three rival directions (an airy "Field Notes", a dark "Basalt", a pastel
chalkboard) were explored and rejected, and the losers are preserved in
`Idle Civ Redesign.dc.html` as history rather than as options. Bureau is a *decided* thing, not
a menu — the work ahead is adoption and gap-filling, not selection.

**It is a real design system, not a palette.** Four things in it have consequences well beyond
styling, and they're the reason this is a project and not an afternoon:

- **Opacity is retired outright.** The current build leans on dimming to mean unaffordable,
  queued, and owned all at once — three different facts wearing the same clothes. Bureau
  replaces all of it with border weight, border colour, glyph colour, and status words. That
  reaches every buy card, every stepper, every disabled control in the game.
- **Descriptions move to hover.** Card descriptions come off the board entirely and into a
  tooltip that also carries the refusal reason ("Short 24 wood."). That's a structural answer to
  the eight-panel clutter problem, and it's a real behavioural change, not a restyle.
- **Population becomes a ledger row.** `POP 3/3 +0.02/s` with idle appended in red. It's a
  resource with a cap and a rate, so it joins the others — and the growth/housing status
  sentences it makes redundant get deleted.
- **The board acquires materials.** Panel paper is ruled differently per column (plain / graph /
  dot grid / legal pad), the era badge becomes a filled plate, and the desk behind the grid
  changes colour per era. Progress starts being something you can *see*, which matters a lot in
  a game that renders nothing.

Type is three faces (Space Grotesk / Space Mono / Newsreader), the icon set is redrawn, and the
whole thing ships with a stated minimum-size pass. Semantic colour survives intact as the
three-value channel it always was — that law was respected, not bent.

**What it does not cover, and we should go in knowing.** The prototype stops at the Stone Age
board: **no Expeditions panel, no era-transition modal, no game-over modal, no campaign or
caravan muster modal** — and the Info modal it does style is explicitly called a one-off, not a
general modal treatment. **Mobile and tablet got a concept sketch and no build.** And the
question that prompted the un-fixing in the first place — what this interface becomes past eight
panels — is listed in its own open threads as *not solved*. So the design pass answered the
visual question comprehensively and left the structural one roughly where it found it. (One
contributing detail worth knowing: the copy of the brief the design pass worked from,
`redesign/uploads/interface-brief.md`, carries the *revised* §6 invitation to innovate but two
older paragraphs elsewhere — §1.6 still says mobile "is not the designed experience". Mixed
signal, plausibly why mobile stayed a sketch.)

**The integration problem in one paragraph.** The prototype is not portable code and doesn't
pretend to be: it's a class in a prototyping runtime with `{{ }}` holes and `<sc-for>` loops,
and every style is inline on the element that uses it. What transfers cleanly is the *appearance*
(copy the markup for a panel and you have it exactly), the icon object, the span/unravel logic,
and the state-colour rules. What doesn't transfer is the rendering model — ours is create-once,
update-in-place at 5Hz against a stylesheet, and that difference is the whole substance of the
port. There's a real decision to make about whether Bureau's literal inline values get lifted
as-is or reconstituted as tokens in `styles.css`, and it wants deciding before any code moves.
Also worth holding onto: the prototype's numbers are placeholders, ours win every disagreement.

**Where to start tomorrow.** Sequencing, scope, and the two questions the design pass left open —
navigation past eight panels, and how far mobile goes. Everything below this line is the state of
the *game*, which is unchanged and still true.

### Game status (unchanged since 2026-08-15)

Everything through **v17** is implemented, machine-verified (harness: **422 checks, 20/20
consecutive runs** — now checked into the repo as `harness.js`, run with `node harness.js`), and
live-verified in the browser by Claude. **But nothing since the ideation sprint has been
human-playtested.** Awaiting first human contact:

- ⚠️ **v15.4** queue-card type icons (hammer / sword / coins)
- ⚠️ **v16** Siege & Fortifications — walls, persistent damage, Siege Workshop + Engine, fort flavor
- ⚠️ **v17** Unit re-denomination — settler→family relabel at Bronze, family→holdfast
  consolidation (keep 0.7) at Iron, all noun surfaces manifest-driven

**Playtest notes:** an existing save already *in* the Iron Age gets walls patched in on load, but
consolidation only fires at the border — it will keep its family-scale count under holdfast names;
a fresh run-through feels the full arc. **Tuning dials** if pacing feels off: `consolidate.keep`
(iron delta), each adversary's `walls`, `CONFIG.siegeWallBonus`, `CONFIG.wallRetreatLoss`.

**Open design threads** (`deleteme.md`): §2 siege and §4 scale are resolved AND implemented;
§1 religion/morale is **in progress** (framework gisted; proposed monk-attaché skeleton judged
unsatisfying — revisit fresh); §3 Enlightenment is **undiscussed**. Delete the file when emptied.

**Interface intentionally un-fixed (2026-08-15):** the user revised `interface-brief.md` §6 —
the visual treatment AND the interface's structure (flat grid vs. menus/tabs/navigation as eras
accumulate; phone/tablet consideration, desktop primary) are handed to the design pass as
choices, not constraints. design.md and tech.md have been softened to match; the surviving laws
are restraint/legibility, semantic-only color, text-as-mechanic, the unravel, and no-urgency UI.

---

## Todo

### Bronze Age — ✅ complete
Shipped in three phases, each independently playable and tested. Checklists preserved below for
the record; see What's Working (v8–v10) for the full account.

**Phase 1 — The Transition** — ✅ **DONE** *(see What's Working, v8)*
- [x] `displayName`/`displayDesc` helpers + `names`/`descs` era maps; all rendering and log lines
      routed through them. Ids never change.
- [x] Retroactive: Infirmary displays as **Medicine Tent** in Stone Age.
- [x] Capstone `bronzeAge` Upgrade: reveal at `pop >= 10 && soldier >= 1`, 300 food/wood/stone, 120s.
- [x] Age badge + `PANEL_TITLES` + a milestone Chronicle moment on transition.
- [x] Bronze reflavors: Settlement → **Village**, Hut → **Stone House** (housing 3 → 5, retroactive),
      Medicine Tent → **Infirmary**.
- [x] **Bronze Tools** upgrade (+15%, stacks additively with Stone Tools).
- [x] Harness coverage incl. the `EVENTS` era-audit and a legacy-save load.
- [ ] *Carry-over:* Bronze Tools currently costs wood+stone. Once Phase 2 lands, re-cost it to
      require actual bronze — it's thematically odd for it not to.

**Phase 2 — The Alloy** — ✅ **DONE** *(see What's Working, v9)*
- [x] `RESOURCES` and `JOBS` tables; `rates`/`mults`/`caps`/clamping/`jobsUsed`/`removeSettler` and
      the ledger markup all iterate them instead of naming three resources by hand.
- [x] New resources `copper`/`tin`/`bronze`; two new gather jobs → 5 total, tin at half rate.
- [x] **Forge** converter, clamped by inputs *and* by output headroom. No workers.
- [x] **Ore Yard** (copper + tin together). Bronze: generous base cap, no storage building.
- [x] **Bronze Weapons**; **Bronze Tools** re-costed in bronze (Phase 1 carry-over, now closed).
- [x] Harness: ratio, scaling, starvation, cap interaction, weapon tiers, job-release safety.

**Phase 3 — The Army** — ✅ **DONE** *(see What's Working, v10)*
- [x] **Archery Range** → **Archer**; **Stables** → **Horseman**. Both buildings cap at 1.
- [x] Raid types (warband / massed charge / band of riders) rolling alongside raid size.
- [x] `militaryStrength(raid)` composition-aware; non-matching multiplier is **1, never below**.
- [x] Composition mismatch feeds the costly-repel dial via `counterCoverage()`, not `repelChance`.
- [x] **Scouting** upgrade (gated on the upgrade, not just the Stables) → two new events.
- [x] Harness: every composition/raid-type pairing, plus the never-penalised guarantee.

- [x] **Casualty exposure** (post-phase tweak): losses are weighted by role, so archers read as a
      backline unit — see v10 notes.

**Bronze Age is complete.** All three phases shipped; the age is ready for a real playthrough.

### In progress: growth rework + the manifest refactor
Full consensus reached; contracts recorded in `tech.md` (Settled But Not Yet Built) and rationale in
`design.md` (Settled: population growth is not an event / The Era Manifest Model). **Implement from
those documents, not from memory** — they mark exactly which details are settled and which are
flagged *to be decided during implementation*.

**Standalone — free timed growth** — ✅ **DONE** *(see What's Working, v11)*
- [x] `wanderer` removed from `EVENTS`; growth is a background accrual in `step()` via
      `accrueGrowth()` (settler every `CONFIG.settlerIntervalSeconds`, first guess 45s). The
      Chronicle line stays — births are still story — it just names no price.
- [x] `growthCost()`, `CONFIG.growthBase`, `CONFIG.growthScale` deleted; references swept.
- [x] Your People growth line is a countdown ("Next settler arrives in Ns" / "Housing is full").
- [x] Freeze-vs-reset decided: **freeze** — partial progress survives a full-housing stretch.
- [x] Harness: no food spent, cadence exact, housing-gated, freeze semantics, `bought` lifetime.

**Phase A — parity refactor** — ✅ **DONE** *(see What's Working, v12)*
- [x] Stone authored as a full base manifest, Bronze as a delta (`remove`/`override`/`add` +
      wholesale slates), compiled at load by `compileBase`/`extendEra`; `active()` indirection
      replaces every direct read of the old global content tables.
- [x] Dissolved into manifest data: `names`/`descs` maps, `era`/`untilEra`, `eras` tags on events,
      `HOUSING_PER_HUT`, `PANEL_TITLES`, `ERA_NAMES`, `RELEASE_ORDER`, `displayName`/`displayDesc`/
      `defEra`/`availableInEra`, and every `S.era` check inside `reveal()` predicates.
- [x] Compiler throws (load-time, pre-render) on unknown remove/override targets, duplicate adds,
      missing slates, unknown slate ids — the delta-level slice of the Phase B validator, early.
- [x] Parity suite in the harness: identical content, costs, caps, rates, and reveal behavior per
      era; compiler error cases; parent-isolation; DEF_INDEX semantics. Verified live end-to-end:
      fresh stone game, real capstone → era flip (diff-derived modal), forge, save/reload in bronze.

**Phase B — transition machinery** — ✅ **DONE** *(see What's Working, v13)*
- [x] Load-time validator `validateManifests()` (cost keys, converts keys, capBuilding/boost refs,
      job.res, unit counters, event counters, def shape, migration sanity) — throws with a full
      problem list before a frame renders. Delta-level target checks shipped earlier with Phase A.
- [x] Migration runner: frozen pre-transition snapshot, `vanish`/`convertTo`/`fn` primitives,
      `narrate` lines, `S.eraHistory` archive (all eras kept; snapshots never nest), removed-job
      workers released to idle. Snapshot-order immunity proven in the harness.
- [x] DOM purge on era flip (the resolution to "nothing can un-reveal") — live-verified: the
      completed capstone's card vanishes at the transition.
- [x] Era modal fully diff-derived (renames, housing, panel titles, new resources/jobs, added,
      removed); `ERA_TRANSITIONS` reduced to the hand-authored flavor lead only.

**Phase C — Iron Age** *(designed — see design.md Iron Age + A&E; tech contract in tech.md Phase C)*

*C1 — the economy flip:* — ✅ **DONE** *(see What's Working, v14)*
- [x] `ironAge` capstone in the bronze manifest (pop ≥ 16 + archer-or-horseman; 400/400/400 + 50
      bronze; 180s) + `ironAvailable` hint; `ERA_ORDER` gains iron; transition lead written.
- [x] `IRON_DELTA`: remove copper/tin/bronze, both ore jobs, Ore Yard, bronzeTools/bronzeWeapons/
      scouting/flintSpears; override hut → Longhouse (housing 7), Forge → 3 iron + 2 wood → 1
      steel, Village → Town, stables/archer/horseman re-priced into iron; add iron/steel/gold,
      ironMiner, Iron Yard, Treasury, Iron Tools/Iron Weapons/Steel Armor; `scoutFindIron` event;
      fresh slates. Compiled and validator-green on the first run.
- [x] Migrations: copper vanish, tin vanish, bronze → gold at 0.25 — all narrated. (The runner's
      first real load, live-verified with a full economy running through the flip.)
- [x] `weaponMultiplier()` iron tier 3.0; `armorFactor()` steel tier 0.3 (armor now lowest-wins
      tiers, matching weapons); `CAPSTONES` map replaces the hardcoded onComplete check.
- [x] Harness: iron manifest shape, capstone gating, the real transition (migrations, worker
      release, snapshot, retroactive housing), iron economy, cross-era tier supersession —
      318 checks, 20/20 runs.

*C2 — Adversaries & Expeditions:* — ✅ **DONE** *(see What's Working, v15)*
- [x] Manifest category `adversaries` (wholesale per era, like slates); validator: fightsAs ∈ raid
      types, stock/buys keys ∈ resources, buys only on peaceful, malformed exchanges caught.
- [x] The three adversaries: Hill Clans (warlike 9, massed), River Kingdom (peaceful 32, riders,
      buys food), Salt Nomads (peaceful 13, riders, buys iron). Listed as "Neighbors" in Info.
- [x] State: `S.adversaries` (living stock + standing; init at load/era entry, never re-seeded),
      `S.expeditions` (one at a time). Additive schema, defensively merged.
- [x] Deployment thins home defense (`deployedCount()`; home casualties never hit deployed units;
      campaign casualties draw from the deployed set, exposure-weighted).
- [x] `resolveExpeditions(dt)` in `step()`: campaign math (counter-vs-fightsAs), plunder 40% of
      remaining stock, standing −1 either way; caravan pays from their gold stock, sold goods join
      their stock, standing +1, Hostile-warlike route risk 25%. Era-flip mid-flight strands nobody.
- [x] Standing words + consequences: Hostile warlike → home conflict ×1.5; Hostile peaceful →
      refuses trade; Friendly → pays ×1.25.
- [x] Muster Ground (cap 1) gates the new **Expeditions** panel (row 2 under the Chronicle, which
      drops its double-row span — no panel cut, no toggles); adversary cards with muster steppers +
      march/caravan buttons carrying live estimates and refusal reasons in their tooltips.
- [x] Harness: campaign win/loss forced-RNG paths, stock depletion, trade-dry partner, Friendly
      premium, standing transitions, deployment/defense math, one-expedition rule, offline
      resolution, era-flip stranding — 365 checks, 20/20 runs.
- [x] *(user request)* `[pacing]` console telemetry: game-clock stamps when age research starts,
      completes, or is cancelled.

*C3 — polish + balance (with playtests):*
- [ ] Raid attribution flavor ("the Hill Clans test your defenses") once A&E is in.
- [ ] Pacing: Iron targets very roughly 30–45 min beyond Bronze. Measured baseline (2026-08-14):
      ~15 min to Bronze training, ~40 min to clear Bronze — early-age clip feels right, preserve it.

### In progress: Scale & Siege pack (settled 2026-08-15; see design.md)

**Siege & Fortifications:** — ✅ **DONE** *(see What's Working, v16)*
- [x] Adversary `walls` number (living state in `S.adversaries`, seeded at init + legacy-patched,
      damage persists); breach phase sequenced before the field battle; failed breach = retreat
      with at most one armor-softened loss.
- [x] Siege Engine unit (`siege: true`, ×6 wall-power, ordinary otherwise incl. home defense) +
      cap-1 Siege Workshop (barracks-gated).
- [x] Iron adversary fort flavor: Nomads' wagon laager (2), Clans' timber palisade (5), Kingdom's
      stone-walled castle (26 — the wall-check). One-shot vs finally-gave-way Chronicle lines.
- [x] Campaign modal shows wall-power vs walls; adversary cards narrate damage state
      (battered / in ruin) — words, not numbers. Harness 404 checks, 20/20.

**Unit re-denomination:** — ✅ **DONE** *(see What's Working, v17)*
- [x] `popNoun` + arrival line as inherited era-facts; Stone=settler(s) unchanged,
      Bronze=family/families (1:1 relabel, pure text), Iron=holdfast(s).
- [x] Consolidation at iron entry: manifest `consolidate: { keep: 0.7, narrate }` — floors
      civilians and units consistently (never below deployed), rescales jobs, reconciles;
      THE flex dial for playtesting. Never inherited; validator-checked.
- [x] Noun-driven text: growth countdown, person tile, training popCost label, offline summary,
      era-modal "You count your people in … now." derived line; game-over stat relabeled
      "Arrivals welcomed" (it spans denominations).
- [x] Harness (nouns, inheritance, consolidation math, deployed guard, validator) + full
      two-border live verify — 422 checks, 20/20 runs.

### Next up
- [ ] **Plan the Bureau integration** — the design pass is in `redesign/` and nothing is wired up
      yet. See the STATUS block at the top of this file for the shape of it; the session that
      picks this up should start by planning, not by editing `styles.css`.
- [ ] **Continue the `deleteme.md` debate** — §2 (siege) and §4 (scale) resolved and promoted;
      §1 (religion/morale) IN PROGRESS — framework gisted, monk-attaché skeleton proposed but
      unsatisfying, revisit fresh; §3 (Enlightenment) still to be discussed. Delete the file when
      empty of live questions.
- [ ] Playtest the whole build for feel now that the Stone Age content pack has landed — Herbal
      Medicine/Stone Tools/Stone Yard cost-and-effect numbers are all first-guess like everything
      else in `CONFIG`, deliberately tuned toward "too hard, walk it back" per standing principle.
      `conflictBaseChance` was already retuned once from real playtest data (tripled); expect other
      numbers to move too once actually played against.
- [ ] Consider a second weapon/armor tier once Sword-equivalent content makes sense — right now
      Flint-Tipped Spears / Hide Armor are the only tiers, both Stone-Age-flavored on purpose.
- [ ] A rare "special" event with no counter (the asteroid-style 0.5%-chance idea) — the engine
      already supports this shape (just a `chancePerSecond` event with no `counter`), it's still
      just content, same as Great Hunt/Trader were.

### Backlog
- [ ] Additional person-types beyond Settler/Soldier — partly answered by Bronze Phase 3 (Archer,
      Horseman). "Citizen" as a Settler rename is explicitly saved for a later age, not Bronze.
- [ ] Balance pass on `CONFIG` now that there's more to balance around (upkeep vs. sickness/conflict
      odds vs. build times vs. growth cost vs. the new windfall/upgrade numbers) — most of these
      numbers are still first-guess.

### Deferred on purpose
- [ ] **Ages past Bronze** — the age list in `design.md` is a flavor guide, not a backlog. One age
      at a time, each proven fun before the next is scoped. A widening age with no concrete reason
      to exist by the time it's scoped gets cut rather than forced.
- [ ] ~~**Retiring/consolidating buildings**~~ — no longer deferred: this is exactly what the
      manifest refactor (In progress, above) exists to solve. Removal becomes manifest absence,
      un-reveal becomes the era-flip DOM purge, and state transformation becomes declared
      migration instructions with an `S.eraHistory` safety net.
- [ ] **`CONFIG.offlineCapHours` will need to scale with build times** — currently 4h, so a
      hypothetical 6h late-game build literally cannot finish in a single away-session, undercutting
      the "walk away for hours" pacing target (see `design.md`, "Active early, idle late": a Stone
      Age Soldier trains in ~10s, a Starship should cost something like 6h). Not a problem at Bronze
      scale; revisit when build times get genuinely long.
- [ ] **Tick-counter for cooldowns/authored beats** — considered adopting `dispatch`'s discrete
      fixed-tick architecture wholesale; decided against a full port (wrong fit for an idle game's
      continuous/offline-progress model — see `tech.md`). A lightweight `S.tick` counter *alongside*
      the existing economy remains a cheap option if/when cooldown or scripted-beat needs show up
      (e.g. "sickness can't fire again within N ticks," era-transition milestones).

### Known rough edges (not urgent)
- [ ] Mobile layout is a basic stacked-column fallback (`@media` query), not actually designed for —
      matches the stated non-goal in `design.md`, just flagging it stays true.
- [ ] Holdings tiles show raw counts with no compaction for large numbers — fine now, won't be once
      numbers get big in later eras.

---

## What's Working

**v1 — Core loop.** Zero-build `index.html` you can double-click and play. Three settlers, three
gather jobs (forage/chop/gather stone), a Hut as the first building (raises housing), an escalating
per-building cost curve, auto-save + capped offline catch-up. Verified via a headless Node harness
before any UI existed.

**v2 — Friction pass + light theme + full redesign.** Added food upkeep (every settler eats,
whether working or idle) and a real failure state (starvation ends the game). Added storage caps
on food/wood — surplus rots without a Granary/Woodshed. Added timed construction (originally
worker-assigned, AoE-style). Full visual rewrite: dark theme → off-white "paper" theme, monochrome
ink + one red accent, no shadows/gradients. Layout rebuilt from a centered card column into a
flex-wrap "doodle board" that fills top-left outward. Added the Settlement/holdings panel (owned
buildings as icon tiles, not just numbers in the buy menu) in response to feedback that ownership
was too abstracted.

**v3 — Queue-based construction + fixed layout + restored color.** Removed the worker-assignment
requirement for construction entirely (decided it was "too Age of Empires for an idle game") in
favor of a FIFO build queue — pay on click, only the front item progresses, cost escalates against
owned+queued count so stacking clicks doesn't undercut the curve. Doubled all build times to
compensate for the new ability to effectively parallelize via queuing. Rebuilt the layout again:
fixed to the viewport (no page scroll), each panel scrolls internally, specific panel placement
(People top-left, Construction beneath it at 2/3 height, Settlement to the right at 1/3 height,
deliberate blank space reserved below it, Chronicle as a fixed quarter-width column). Restored
color semantics that an earlier monochrome pass had accidentally flattened: green for genuinely
new/positive Chronicle information, red for danger, positive/negative resource rates colored to
match. Found and fixed a real bug along the way: the Reset button's `beforeunload` handler was
silently re-writing the save it had just cleared.

**v4 — Events engine.** Built the generic four-part event system (trigger / effect / negate /
flavor) described in `design.md`. Refactored population growth ("a wanderer joins your settlement")
out of a hardcoded loop into the first entry on this system. Shipped the first real hazard as a
working proof of the pattern: **Sickness**, gated to only become possible past `pop >= 4` (with a
foreshadowing Chronicle hint the moment that threshold crosses), mitigated by a new **Infirmary**
building. Verified end-to-end: gating, kill effect, job-reassignment safety on death, negation odds
capping at 100% with enough Infirmaries, and correct Chronicle coloring for both outcomes. Conflict
and further events intentionally not built yet — see Backlog above.

**Docs.** `design.md` (player-facing vision, philosophy, systems, open questions), `tech.md`
(architecture, state shape, simulation model, known limitations), and this file created to give the
project a real record — previously all context for "what exists and why" lived only in
conversation history.

**v5 — Build Queue as its own panel + one-time Upgrades + cancel/refund.** Pulled the build queue
back out of the merged Construction panel into its own always-present box (Settlement / Build Queue
/ Upgrades now split column 2 evenly) — it shows an explicit "Nothing queued." empty state rather
than disappearing, per design intent. Added a second buy-list, `UPGRADES`: one-time purchases with a
flat cost that never scale and can't be re-bought once owned or already queued, distinct from
`BUILDINGS`' repeatable/stacking model. Both feed the same FIFO queue and respect its ordering.
Shipped **Fire Mastery** (permanent -15% food upkeep) as the first concrete upgrade — deliberately
*not* Bronze Age, since eras are still an open design question (see Deferred, above). Added
cancel-for-refund: every queue card gets a small × that removes it and refunds exactly what was
paid, even mid-construction (the queue item now stores its own paid cost so a later-queued, more
expensive copy of the same building refunds correctly). Found and fixed a real bug via live testing:
`reveal()` was re-evaluated fresh every render with no memory, so a resource dipping back below its
reveal threshold (trivially easy — e.g. spending wood on the very Hut that revealed the panel) could
make the entire Construction/Settlement/Upgrades panel vanish mid-game. Fixed with `isRevealed()`,
which makes reveals permanently sticky via the existing `S.seen` mechanism, consistent with how every
other reveal in the game already behaves.

**v6 — Military system + 4-column layout.** The big one: a full design pass (recorded in
`design.md`/`tech.md`) resolving both remaining open questions about hazards and implemented end to
end. **Barracks** (a new *capped* building — the first of a third category alongside scaling
buildings and one-time upgrades: `cap: 1`, greys out to "Maxed" once built, same visual slot as an
owned Upgrade). **Soldier** (a new *unit* kind — trainable through the same shared build queue, but
`popCost: 1` permanently reserves an idle civilian the instant the order is queued, not when it
completes, and conversion is one-way; ownership lives in `S.units`, deliberately separate from
`S.builds`, so it renders in Your People instead of Settlement). **Flint-Tipped Spears** and **Hide
Armor** (one-time Upgrades — weapon tier raises repel odds, armor tier softens casualties —
deliberately Stone-Age-named rather than "Sword," since Bronze Age itself is still a parked design
question). **Conflict**, the second hazard on the Events engine: raid size rolls independently
(small and common vs. large and rare), a ratio-based repel check (`defense / (defense + raidSize)`,
so never 0% or 100% no matter how invested), and tiered consequences (clean repel / costly repel /
raid succeeds with Soldier losses, resource theft, and — if defense was thin — a civilian death too).
Needed a new `resolve(S, dt)` escape-hatch archetype on `EVENTS` since Conflict's multi-stage
resolution didn't fit the generic `chancePerSecond`+`counter` shape Sickness uses — a generic engine
addition, not a special case. Unlike Sickness (floored at 1 survivor), **Conflict is allowed to zero
out population outright** — a deliberate second failure state, on purpose, per design discussion.

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
mid-game population from ~19min down to ~6-7min, similar cadence to Sickness rather than meaningfully
rarer than it.

**v7 — Stone Age content pack.** A design brainstorm ("what else belongs in Stone Age before we
touch eras") turned into five small, well-scoped additions, each reusing existing systems rather
than adding new ones: **Herbal Medicine** (Upgrade) raises how much *each* Infirmary reduces
Sickness's odds — the first time a counter's own strength (not just its owned count) became
upgradeable, which needed `negateChance()`'s `reducePerUnit` to accept a function as well as a flat
number. Deliberately shipped with Infirmary's *base* effectiveness lowered (0.35 → 0.2) so the
Upgrade is a real improvement rather than padding, per the standing "tune hard, walk back" principle.
**Stone Yard** closes a real asymmetry — Food and Wood both rotted past their cap, Stone never had
one — Stone is now capped and clamped exactly like the other two (flavored as "unorganized, lost"
rather than "rots," since stone doesn't decay; gameplay symmetry won out over strict realism, a
deliberate call). **Stone Tools** (Upgrade) is the first of a pattern meant to repeat every era: one
broad, cheap, early, flat-percent bump to *all* gathering, revealed almost immediately (`wood >= 5`)
so it competes directly with your very first Hut for early wood — intentional tension. **Great Hunt**
and **Trader** are the first positive-only probabilistic events (small/frequent food windfall,
larger/rarer wood+stone windfall) — until now every `chancePerSecond` event was a hazard; these
prove the shape was never hazard-specific, it just hadn't been used for good news yet. Neither is
gated behind a population threshold, unlike the hazards — no fairness reason to delay good news.
Verified via harness (including a flaky-test fix: a windfall landing on the very last tick of a
600-second test loop can be observed a tick before its cap-clamp runs, exactly as it would in real
play for one frame — not a game bug, just meant the test needed one extra flush tick before
asserting) plus live browser testing of the full chain, including watching Trader fire organically
mid-session.

**v8 — Bronze Age, Phase 1: the transition.** The first age advance, and the plumbing every future
one rides on. Advancing is a hidden **Bronze Age** capstone Upgrade (reveals at pop ≥ 10 with ≥1
Soldier trained; 300 food/wood/stone; 120s build) that sits in the ordinary build queue — so Sickness
and Conflict keep rolling the whole time it's under construction, which is exactly where "and some
luck" was supposed to come from. Completing it calls `advanceEra()`, the only place `S.era` is ever
assigned; everything the transition changes is derived from `S.era` at render time, so flipping it
*is* the whole operation.

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
age can't regress it by omission. Second, found only in live play: `renderTile()` baked a tile's name
in at creation and thereafter only updated its count, so after advancing, the Village tile still read
"Medicine Tent" while its buy-card correctly read "Infirmary" — fixed to rewrite the name every
render, with a targeted regression test. Also swept two bits of prose that hardcoded "infirmary" (one
became a `descs` override, one was reworded era-neutral).

**Pause + playtime clock.** A `[ Pause ]` button (spacebar also works) freezes the simulation so the
game state can be studied without moving, with a red `— PAUSED —` marker in the topbar. Alongside it,
a playtime clock counting how long the settlement has actually been running. The clock lives inside
`step()` rather than the tick loop, which means it freezes when paused, counts offline catch-up, and
stops at death — all for free, no special cases. The non-obvious trap, caught by design rather than
by accident: the tick loop has to keep advancing its `last` timestamp *while paused*, otherwise `dt`
accumulates across the whole pause and gets handed back (clamped to 2s) the moment you resume,
quietly gifting production for frozen time. Verified live — a 9-second pause produces zero `step()`
calls and resumes on a normal 0.202s tick. Pause is deliberately not saved (UI state, not game state)
and deliberately not logged to the Chronicle (that's the settlement's memory, not a UI action log).

**Modal system + game-over and Info panels.** A deliberately minimal overlay: one modal at a time,
centered, 30% dim backdrop, dismissed by the header ×, a backdrop click, or Escape. No dragging,
resizing, or minimizing. It reuses the `.block` shell so it matches the board for free, and opening
one never pauses the game. **Game over** moved out of the Chronicle into a proper modal — narrative
line, run stats (time survived, age reached, buildings raised, settlers grown), and a **Try Again**
button; one terse line still lands in the Chronicle so the settlement's record ends with its own
ending. **The Info panel** (`[ Info ]` in the topbar) is a full reference of every building, unit,
and upgrade, grouped by era behind tabs — it intentionally shows everything regardless of what's been
revealed, a deliberate exception to "unravel, don't dump" since a reference that hides things is
useless.

Building it surfaced a modeling error worth recording: filtering the reference by "defs whose era
equals this tab" left the Bronze tab nearly empty, because most things *persist* once introduced (a
Hut is still there in Bronze, just displayed as "Stone House"). Replaced with
`availableInEra(def, era)` — availability runs from a def's introduction era forward, with an
optional `untilEra` to retire things (used now by age capstones, and the hook a future consolidating
age will need). Also caught in live play: `body.dead .block { opacity: .7 }` was dimming the
game-over modal itself, since the modal panel is also a `.block` — now scoped to the board only.

**Settler cost un-ratcheted.** Playtest finding: `growthCost()` was priced off `S.bought`, a lifetime
counter of every settler ever grown that never decreased — so after a raid or plague you kept paying
the price for people who were already dead. A single bad roll became a permanent handicap, and
recovery was strictly harder than the original climb had been. Now priced off *current* population,
which makes the settlement self-stabilising: it grows to whatever the food economy supports, shrinks
when something goes wrong, and can climb back. `S.bought` survives purely as a lifetime stat on the
game-over screen. This resolves an open question that had been sitting in `design.md` since the
military pass. The remaining (separate) question is whether the ×1.30 curve is too *steep* — it
doubles the price roughly every 2.6 settlers, stalling growth near pop 17–18 unless you build
Granaries purely to hold enough food to afford the next person.

**Era advancement moved into the modal.** Reaching a new age now opens an announcement panel — flavor
lead, a "What changed" list quoting real before/after numbers (housing 15 → 23), and a "Now
available" list derived from the defs themselves so it can't go stale. No buttons; dismissed like any
other modal. A single milestone line still goes to the Chronicle. This is where the "every age must
land as a visible *whoa* moment" rule from `design.md` actually gets staged — previously the
transition was three Chronicle lines that scrolled past.

**Reset uses the modal instead of `confirm()`.** Native dialogs are suppressed outright in some
environments (they were being silently swallowed in the dev browser pane), and a real panel gives
consistent styling and control. Cancel / Escape / backdrop are all equivalent and verified
non-destructive; the destructive button renders in warning red via a new `danger` flag on modal
actions, and the copy quotes the run's playtime so the consequence is concrete. Also DRY'd out
`hardReset()`, which was duplicated inline between the Reset button and game-over's Try Again — the
subtle part it centralises is unregistering `beforeunload` *before* clearing, since the reload it
triggers would otherwise fire `save()` and instantly rewrite the save being deleted.

**v9 — Bronze Age, Phase 2: the alloy.** The conversion chain lands, and with it the first building
archetype that *transforms* rather than produces or boosts. Adding three resources forced a refactor
first: `rates()`, `mults()`, `caps()`, the clamp loop, `jobsUsed()`, `removeSettler()` and the ledger
markup each hardcoded exactly three resources by name. All now iterate a `RESOURCES` table (with
`baseCap`, `capBuilding`, `reveal`) and a `JOBS` table (gaining `rateMult` and `reveal`); ledger rows
are generated rather than written into HTML, so future resources need no markup change.

New content: **copper** and **tin** (tin yields half — the scarce half of the alloy, as it was
historically), **bronze**, two new mining jobs, the **Forge** (4 copper + 1 tin → 1 bronze,
continuously, no workers), the **Ore Yard** (one building lifting both ore caps), **Bronze Weapons**,
and Bronze Tools re-costed in actual bronze — closing the Phase 1 carry-over that left it
thematically odd. Weapon tiers replace rather than stack: highest owned wins.

The Forge clamps throughput three ways — by forge count, by inputs in store, and **by headroom under
the output cap**, so a full bronze store stops it rather than silently eating ore. The numbers were
picked so a clean equilibrium exists to be found: 2 copper miners : 1 tin miner produces ore at
exactly the recipe's 4:1 ratio, and 2 Forges consume exactly that. Verified live.

Caught in passing: `removeSettler()` unassigned workers from a hardcoded three-job list, so with five
jobs a dead copper miner could have left `jobsUsed() > civilians()` and driven `idle()` negative.
Now derived from `JOBS`, reversed so specialised jobs empty first and foraging is released last.

**v10 — Bronze Age, Phase 3: the army.** Completes the age. **Archery Range → Archer** and
**Stables → Horseman** (both buildings capped at 1, both units costing bronze — Soldiers stay the
cheap generalist and the only unit needing no bronze, so they're still buildable when the Forge is
starved). Raids now roll a **type** alongside their size — warband, massed charge, band of riders —
and `militaryStrength(raid)` sums each unit type's contribution with a counter bonus applied only to
the unit that excels. The load-bearing rule holds: the non-matching multiplier is **1, never below**,
so being the wrong unit costs you the bonus and never your base strength. Measured: 5 Archers are
worth 10 against a massed charge and 5 against everything else; a specialist army swings 2.00×
between matchups where a mixed one swings 1.43×.

Composition mismatch feeds a *second* dial rather than the win chance — `counterCoverage()` softens
the costly-repel roll, so the right units both win more fights and bury fewer of your own.
**Scouting** rides on the Stables (gated on the upgrade, not the building) and unlocks two new
events, one of which is deliberately pure flavor since the value of a warning is the knowing.
`removeSoldier()` became `removeRandomUnit()`, drawing casualties weighted by what's actually
fielded; `stealResources()` now raids the ores and bronze too.

One genuine bug caught by the harness, and it was the invisible kind: the counter relationship was
stored in **two** places pointing at each other — the raid held a unit id, the unit held a raid id —
and the comparison used the wrong pair, so it was always false and **every counter bonus in the game
silently did nothing**. No error, no crash, the feature just wasn't there. Fixed by deleting the
redundant field so only one direction exists, with a test asserting the duplicate can't come back.

**Casualty exposure by role.** Playtest note: archers didn't *feel* like archers — mechanically they
were a differently-priced soldier, since casualties were drawn evenly by headcount. Losses are now
weighted by role exposure (Soldier 1.0, Horseman 0.6, Archer 0.35), so the front line takes the brunt
and archers fight from behind it. Every weight is above zero on purpose: this bends the odds and
never grants immunity, so an archer can always be the one who falls and an all-archer army — having
no front line to hide behind — gets no protection at all. Measured over 30,000 draws from an even
10/10/10 army: soldier 50.9%, horseman 31.1%, archer 17.9%. A pleasant side effect: mixing your army
now buys your specialists safety, a second reason to diversify beyond matchup coverage.

**Bug fix: `idle` could go negative.** Reported from a full Bronze-age playthrough — the idle count
displayed **-1**, and clicking a job's minus button then "absorbed" the deficit, which looked like a
worker being deleted. Root cause: a civilian can be committed in two ways, assigned to a job *or*
reserved by a queued unit order, and the death handler only balanced against jobs. A death while a
Soldier sat in the queue therefore left the books short by exactly the reserved worker. Replaced with
`reconcileWorkforce()`, which balances against jobs *and* reservations, releasing workers first and
then — if more orders are queued than there are survivors to fill them — abandoning the newest orders
with a full refund. Writing the repro also surfaced a second, unreported bug: `removeSettler()` could
push population below the number of trained units, making `civilians()` negative; it now no-ops when
there are no civilians left to take. Both are covered by a 400-settlement fuzz test asserting neither
value can go negative.

**Bug fix: the invisible food sink.** Reported as "building a Granary zeroed my food — 550 down to
30, nothing in the Chronicle to explain it." No food was lost to the building. A settler costs food
(escalating 30% per person; at pop 19 that's 532), growth is automatic the instant you can afford it,
and the Chronicle line said only "A wanderer joins your settlement" — never the price. The Granary
*did* cause it, indirectly: food had been parked at a cap below the settler price with nowhere to go,
and raising the cap let food climb past the price, firing the purchase instantly. The event line now
states the cost. Also gave the events engine a small generic capability: an `effect` may return its
own log line, for events whose message needs a number only the effect knows.

This surfaced a bigger design question, now logged in `design.md`: because growth auto-spends,
**your practical food ceiling is the settler price, not your storage cap** — which means the Bronze
Age capstone's 300 food is unreachable before ~pop 17 unless you deliberately stop building huts and
let population cap out. A real strategic lever that nothing currently hints at.

**Playtest milestone:** reached the Bronze Age in ~35 minutes of real play, on the *old* (harsher,
pre-fix) settler cost curve. A later full playthrough built every unit and building in the age.
Transition verified end to end in a real session: housing jumped to 23, buildings reflavored
correctly, Bronze Tools unlocked and purchased.

**Design consensus: free growth + the Era Manifest Architecture.** Two connected decisions, both
born from the invisible-food-sink investigation. First: settlers become free and timed — the food
cost is abolished, growth leaves the events system entirely, and housing becomes the sole lever on
population. Second, and much larger: with Iron Age intending to *remove* the whole bronze economy,
the era-tags-on-global-content approach was headed for a palimpsest, so the architecture inverts —
each era declares a complete **manifest** of everything that exists while it's active, authored as
a delta against the previous era, with absence-as-removal, snapshot-based migration instructions
(the `rescale` primitive covers everything from melting bronze into iron salvage to eventually
re-denominating billions of citizens into colonies), a boot-time validator that turns this
project's signature silent-wrongness bug class into loud named errors, and an era modal whose
factual lists derive from the manifest diff so they can never lie. Full contracts in `tech.md`
(Settled But Not Yet Built); rationale in `design.md` (The Era Manifest Model). Sequenced as
parity-refactor → transition machinery → Iron Age, so engine risk and content risk never travel
together. Documentation-only milestone — no code changed.

**v17 — Unit re-denomination.** The population ladder is live: what one unit *means* now scales
while the number never does. Stone counts settlers; the Bronze transition relabels them 1:1
("You count your people in families now." — pure text, proven pacing untouched); the Iron
transition **consolidates** — `consolidate: { keep: 0.7 }` on the delta, the playtest flex dial —
floored per unit type (never below what's deployed abroad), civilians and units summed back into
pop so the books can't desync, jobs floored alongside, all narrated: "Families band together
behind shared walls — your people now count themselves in holdfasts." Every noun-bearing surface
reads from the manifest now: the person tile (Settler/Family/Holdfast), the growth countdown
("Next holdfast joins in 45s."), arrival lines ("A holdfast swears fealty to your banner."),
training costs, the offline summary, and a diff-derived era-modal line. Verified live across both
borders in one run: 10 settlers → 12 families (growth during the build) → snapshot 23 families →
14 holdfasts. 422 checks, 20/20 runs.

**v16 — Siege & Fortifications.** Adversaries carry a second number beside strength — `walls` —
and combat now sequences: the walls fall before a single defender does. Wall damage **persists**
in the living remnant (stock-not-economy, extended to stone): a failed assault is a retreat with
at most one loss, but the scars stay carved, so hard targets become sagas — live-verified as one:
wall-power 16 vs the Kingdom's castle at 26 bounced but left it at 10; the second column breached
("The battered walls of the River Kingdom finally give way."), won the field, and carried home 96
gold at the price of one Soldier. Siege Engines train behind a cap-1 Siege Workshop, hit walls at
×6, and are ordinary units everywhere else, home defense included. Fort tiers are pure flavor per
the law — the Nomads' wagon laager, the Clans' timber palisade, the Kingdom's stone-walled castle
— cross-cutting disposition so the slate doesn't template. Cards narrate damage ("Their walls are
battered" / "lie in ruin"); the campaign modal carries the numbers. 404 checks, 20/20 runs.

**v15.1 — QoL from live testing:** owned one-time upgrades sort to the bottom of the Upgrades
panel (buyable and queued stay on top, manifest order within each group), so what's still
purchasable is never buried under a pile of "Permanent." cards. DOM only reorders when ownership
actually changes, preserving the create-once card pattern.

**v15.4 — Queue-card type icons.** The dashed expedition border is gone (playtest verdict: hated
it, and the mix wasn't confusing anyway). Every Underway card now opens with a tiny line-art type
marker in the game's doodle style — hammer for builds, sword for campaigns, coins for caravans —
so the eye sorts the panel without reading. Cards share one uniform border; the missing cancel ×
remains the expeditions' only structural difference.

**v15.3 — Expedition legibility pass** (all four playtest asks, plus two design laws). One
campaign AND one caravan can now be out at once — parallel tracks, never two of a kind. Expeditions
show as cancel-less progress cards at the top of the queue panel, which the Iron Age
retitles **Underway** (one manifest line — the machinery keeps paying). Campaigns launch through a
modal: the target's description, muster steppers, and a live strength estimate — the era's biggest
decision got its ceremony, and the cramped panel steppers are gone. Caravans stay one-click on
safe roads, but when a warlike neighbor is Hostile the send opens an escort modal: escorts don't
lower ambush odds, they *decide* ambushes — fight through and the trade completes; lose and the
cargo goes with a guard. Trading at Wary now returns "...counted out in silence under armed watch.
They have not forgotten." — the rep system hinted through narration, never printed. And two laws
recorded in design.md: **flavor is load-bearing** (strength is hinted via description, not odds —
so adversary descs are mechanics-bearing text and must stay truthful), and the standing system
narrates rather than displays. 389 checks, 20/20 runs.

**v15.2 — Converter rates in the ledger.** The resource bar now shows what's *actually happening*
to each pile: `ledgerRates()` folds live converter flows into the displayed rates — outputs
positive, inputs negative — using the same three clamps as `runConverters`, so a starved or
storage-capped Forge honestly reads as stopped rather than advertising its theoretical speed
(user call: the red number should scan as "problem" — and it does, via the existing pos/neg
coloring). The input clamp counts incoming production alongside stock, so the designed 2:1-miner
equilibrium displays as it deserves: copper and tin quietly netting zero while bronze flows at
+0.10/s. The simulation itself is untouched — `rates()` stays gross and `step()` unchanged;
folding flows into the real rates would have converted everything twice. Iron era included free:
steel shows its flow and wood shows mining minus the Forge's burn. 378 checks.

**v15 — Adversaries & Expeditions (C2).** The game's first outward-facing verbs. The Iron Age
declares three named neighbors — the warlike Hill Clans (weak, fight as a massed charge), the
strong peaceful River Kingdom (deep gold, buys food), the middling Salt Nomads (buy iron) — each a
static stock + strength + disposition, wholesale-declared like the slates and validated like
everything else. Build the Muster Ground and the Expeditions panel unravels in beneath the
Chronicle (which gives up its double-row span — no panel cut, no toggles). One expedition at a
time: muster any mix of fighters and **march** (the existing combat math pointed outward,
counter-vs-fighting-style included, provisions paid up front, and the walls genuinely thinner
while they're gone — deployed units neither defend nor die at home), or send a **caravan** in
fixed lots against a partner's actual gold stock, which depletes — and the goods you sell them
join their stock, where a later campaign could steal them back; the game never mentions this, it's
simply true. Standing is one number read as a word with exactly three consequences: Hostile
warlike neighbors raid you 1.5× more, Hostile peaceful ones refuse your caravans, Friendly
partners pay 25% over. Everything resolves in `step()` on the world's schedule — no catch windows,
offline-safe, Chronicle-narrated. Live verification produced an unscripted proof: while a test
caravan was on the road, the Hostile Hill Clans raided the thinned town and killed two fighters
the next muster was counting on. The gold economy now closes: heirloom seed → trade/plunder →
Iron Tools/Weapons/Armor, with the future capstone's gold cost waiting on the far side. Also:
`[pacing]` console stamps at capstone start/finish/cancel (playtest aid). 365 checks, 20/20 runs.

**v14 — The Iron Age economy (C1).** The game has a third era, and getting there is the first
transition with teeth. The `ironAge` capstone (bronze manifest: pop ≥ 16, an Archer or Horseman
fielded, 400/400/400 + 50 bronze, 180s) flips into an era where the alloy economy is *gone*:
copper, tin, bronze, both ore jobs, the Ore Yard, and four stranded upgrades all retire — and the
machinery earned its keep. The delta compiled validator-green on the first run; the era modal
derived the whole story itself ("No longer needed: Ore Yard, Flint-Tipped Spears, Bronze Tools,
Bronze Weapons, Scouting, Iron Age"); the DOM purge swept every dead card, row, and tile; and the
Chronicle narrated the collapse: the copper road falls silent, no tin comes up the river, and your
suddenly-antique bronze sells to collectors at 1:4 — seeding **gold**, the era's genuinely new
idea, which no job can ever mine. Iron mines at full rate; the Forge persists retargeted (3 iron +
2 wood → 1 steel — wood's first late-game sink); Iron Yard and Treasury store the new stocks;
Iron Tools/Iron Weapons/Steel Armor extend the tiers (armor is now lowest-wins like weapons);
Longhouses hold 7 and the Village becomes a Town. Owned bronze-era upgrades keep working forever —
a bought trait reads from state, not the shop shelf. Iron's gold sinks currently exceed the
heirloom seed on purpose: expeditions (C2) are the era's real gold supply, landing next. Harness:
318 checks, 20/20 runs.

**v13 — Transition machinery (Phase B).** The manifest architecture is now complete and waiting on
its first real consumer. `validateManifests()` runs at load against every compiled era and throws
with a full problem list on any within-era dangling reference — cost keys, converter recipes,
storage/boost buildings, job resources, unit counters, event counters — which is what makes
*removal* safe to author: retire a resource and everything still mentioning it becomes a load-time
error instead of NaN production. `advanceEra()` grew the full transition sequence: a frozen
pre-flip snapshot archived in `S.eraHistory` (kept forever, never nested), a migration runner
whose `vanish`/`convertTo`/`fn` instructions read only the snapshot (instruction order provably
can't matter — the harness runs an `fn` against a value an earlier instruction already zeroed),
workers on removed jobs returning to idle with a Chronicle line, and a DOM purge that removes the
cards/tiles/rows of ids that didn't survive — the one sanctioned exception to "nothing can
un-reveal," live-verified by watching the capstone's card vanish at the flip. The era modal is now
fully derived from `manifestDiff()`: renames ("The Hut is now the Stone House."), the housing
rise, panel-title shifts, new resources and work, "Now available," and a new "No longer needed"
section; `ERA_TRANSITIONS` keeps only the hand-written flavor lead. Stone→bronze declares zero
migrations, so today the machinery mostly proves itself in the harness (281 checks, 20/20 runs) —
the Iron Age is where it earns its keep. Adding an age is now: write one delta, write one lead
sentence, read the compiler's and validator's complaints until they stop.

**v12 — The Era Manifest Architecture, Phase A.** The entire content layer is rewritten: the Stone
Age is a full base manifest (resources, jobs, buildings, upgrades, units, raid types, era-scoped
values, and wholesale `events`/`hints` slates), and the Bronze Age is a **delta** — remove the
capstone, override three defs, add its content, redeclare its slates. A compiler builds both into
full manifests at load and **throws before a frame renders** on any dangling id: unknown
remove/override targets, duplicate adds, missing or misspelled slates. Everything the engine or
renderer reads now goes through `active()` — flipping `S.era` swaps the whole world in one
assignment. The old era scatter (`names`/`descs` maps, `era`/`untilEra` tags, `eras` allowlists,
`ERA_NAMES`, `HOUSING_PER_HUT`, `PANEL_TITLES`, era checks inside reveals) is gone; era-gating is
now *membership* — bronze content isn't hidden in stone, it doesn't exist there. The era modal's
"Now available" list is a manifest diff, so it can never go stale. Zero state-schema change: old
saves load untouched, and the whole thing was verified live — fresh stone game, real capstone
build → era flip with all nine additions in the modal, forge smelting, and a bronze-era
save/reload (offline catch-up even ran the Forge during the gap). Harness rewritten against
manifests + a new compiler suite: 255 checks, 20/20 runs. This is the machine that makes new ages
cheap: authoring the Iron Age is now writing one delta and reading the compiler's complaints.

**v11 — Free timed population growth.** The wanderer event and its escalating food price are gone.
Settlers now arrive free, every 45 seconds (`CONFIG.settlerIntervalSeconds` — deliberately a single
dial), whenever housing has room; progress **freezes** rather than resets while housing is full, so
a partially-waited arrival lands soon after a new hut. Housing is now the sole lever on population
and food's pressure lives entirely in upkeep. The Your People line became a countdown — strictly
more informative than the old price tag. Verified live: 50 seconds at pop 3→4 cost 6.2 food (pure
upkeep; the old model would have charged a lump sum on top, up to ~500+ at high pop). The whole
invisible-food-sink bug class dies with the purchase model, and the harness asserts the excision is
total: no wanderer event, no growthCost, and a cap raise can never again trigger a hidden spend.
Hardening the new cadence tests also surfaced two *pre-existing* flaky tests (a rare raid could
starve the capstone test's settlement mid-build; a rare sickness could shift the soldier-training
counts) — both now run under forced-miss RNG, and the suite passes 20/20 runs. 229 checks. Born from a candid worry that the
game felt passive: every existing verb points inward (allocate, build, upgrade, train), leaving the
player the object of the simulation's sentences, never the subject. The answer sharpened the idle
contract into its final form — the world never interrupts the player, but the player may act *on*
the world at any time, with resolution always self-applying and landing in the Chronicle. Set in
stone: **resolution never creates a window the player must catch** (a claim button is an interactive
event wearing armor). Adversaries are manifest-declared counterparties that exist only to the extent
they can be interacted with — a static stock (not an economy), a strength, a disposition — refreshed
free at era boundaries because manifests redeclare them. Campaigns and directed trade become Iron's
deepening mechanic, reusing the existing combat math pointed outward, with "the army isn't home" as
the core passive trade-off. Interactive events were also formally killed and moved to out-of-scope
in this same arc: the settled identity is idle Age of Empires, not active Civilization.
Documentation-only milestone — no code changed.
