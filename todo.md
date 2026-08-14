# Idle Civ — TODO

> Provisional. Reorganize freely as work happens — this isn't a changelog, it's a working list.
> The "What's Working" log below the todo is the closest thing to a changelog; keep it updated
> as features land so this file stays a true picture of the project, not stale aspiration.

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

**Phase A — parity refactor** *(content reorganization only; zero state-schema change)*
- [ ] Re-author Stone + Bronze as deltas compiled to full manifests; `active()` indirection
      replaces every direct read of the global content tables.
- [ ] Dissolve into manifest data: `names`/`descs` maps, `era`/`untilEra`, `eras` tags on events,
      `HOUSING_PER_HUT`, `PANEL_TITLES`, `ERA_NAMES`, era checks inside `reveal()` predicates.
- [ ] Parity suite in the harness: identical visible content, costs, caps, rates, and reveal
      behavior per era, before vs. after; a pre-refactor save loads and plays identically.

**Phase B — transition machinery**
- [ ] Boot-time validator (full checklist enumerated in `tech.md` — cost keys, converts keys,
      capBuilding/boost refs, job.res, unit counters, event counters, delta-level target checks).
- [ ] Migration runner: frozen pre-transition snapshot, `vanish`/`convertTo`/`fn` primitives,
      `narrate` lines, `S.eraHistory` archive, removed-job workers released via
      `reconcileWorkforce()`.
- [ ] DOM purge on era flip (the resolution to "nothing can un-reveal").
- [ ] Era modal derives added/removed/changed from the manifest diff; retire `ERA_TRANSITIONS`
      as a hand-maintained change list.

**Phase C — Iron Age** *(first real consumer; full content design happens when we get here)*
- [ ] Authored as a delta: remove copper/tin/bronze economy (resources, jobs, Ore Yard); add iron
      + gold; retarget Forge to iron → steel; Iron Weapons upgrade.
- [ ] **Adversaries & Expeditions** — the era's deepening mechanic and the game's first
      outward-facing verbs (campaigns: allocate troops / pick target / army absent weakens home
      defense; directed trade against a counterparty's depletable stock). Shape and guardrails
      settled in `design.md`; system design happens here.
- [ ] The era's actual content pass (buildings, events, flavor) designed at the time, per the
      one-age-at-a-time rule.

### Next up
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
