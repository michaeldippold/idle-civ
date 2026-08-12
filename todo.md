# Idle Civ — TODO

> Provisional. Reorganize freely as work happens — this isn't a changelog, it's a working list.
> The "What's Working" log below the todo is the closest thing to a changelog; keep it updated
> as features land so this file stays a true picture of the project, not stale aspiration.

---

## Todo

### In progress: Bronze Age
Full design consensus reached; recorded in `design.md` (Eras → Bronze Age) and `tech.md`
(Eras → Bronze Age architecture). Shipping in three phases, each independently playable and
tested before the next starts — Phase 1 alone is a complete, satisfying age transition.

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

**Bronze Age is complete.** All three phases shipped; the age is ready for a real playthrough.

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
- [ ] **Retiring/consolidating buildings** — Bronze deliberately consolidates nothing, so it never
      needs this. But `isRevealed()` stickiness means nothing can currently *un*-reveal, so the
      first age that genuinely retires a building will need a real mechanism plus a one-time save
      migration (folding several old building counts into one new one) — the first thing in this
      project that the additive defensive-merge pattern won't handle for free.
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

**Playtest milestone:** reached the Bronze Age in ~35 minutes of real play, on the *old* (harsher,
pre-fix) settler cost curve. Transition verified end to end in a real session: housing jumped to 23,
buildings reflavored correctly, Bronze Tools unlocked and purchased.
