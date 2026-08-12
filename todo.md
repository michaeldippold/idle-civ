# Idle Civ — TODO

> Provisional. Reorganize freely as work happens — this isn't a changelog, it's a working list.
> The "What's Working" log below the todo is the closest thing to a changelog; keep it updated
> as features land so this file stays a true picture of the project, not stale aspiration.

---

## Todo

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
- [ ] A third person-type beyond Settler/Soldier — explicitly deferred until era advancement (see
      Deferred, below); "1-2 more types" was the stated plan for whenever the next era lands.
- [ ] Balance pass on `CONFIG` now that there's more to balance around (upkeep vs. sickness/conflict
      odds vs. build times vs. growth cost vs. the new windfall/upgrade numbers) — most of these
      numbers are still first-guess.

### Deferred on purpose
- [ ] **Eras/ages system** — `S.era` exists and the events engine already filters on it, but there
      is no transition logic, UI, or content beyond Stone Age. Player has design ideas for this not
      yet written down. Do not start implementing until that design pass happens. Bronze Age itself
      is the obvious first entry on `UPGRADES` once this lands — the one-time-upgrade infrastructure
      is ready for it, deliberately not wired to do anything era-related yet. Concrete pacing target
      now exists too (see `design.md`, "Active early, idle late"): a Stone Age Soldier trains in
      ~10s, a Starship many eras later should cost something like 6h -- same interface, wildly
      different pace. Remember when building that: `CONFIG.offlineCapHours` (currently 4) caps how
      much offline time a single catch-up simulates, so a 6h build literally cannot finish in one
      away-session under the current value -- it'll need to scale alongside build times, or very
      long late-game orders will require multiple check-ins instead of one, undercutting the "walk
      away for hours" fantasy the pacing target is going for.
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
