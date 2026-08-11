# Idle Civ — TODO

> Provisional. Reorganize freely as work happens — this isn't a changelog, it's a working list.
> The "What's Working" log below the todo is the closest thing to a changelog; keep it updated
> as features land so this file stays a true picture of the project, not stale aspiration.

---

## Todo

### Next up
- [ ] Playtest the current build for feel — pacing, whether sickness lands at a fair frequency,
      whether the queue/no-worker construction model feels right now that it's been played more.
- [ ] Decide the open design questions in `design.md` before building further on top of them
      (can hazards zero out population? what is a "soldier"? does growth cost ever come back down?).

### Backlog
- [ ] **Conflict event** — an attack that costs people and/or resources, mitigated by some kind
      of defensive counter. Blocked on deciding what a "soldier" is (job vs. building vs. population
      cost) — see `design.md` open questions.
- [ ] **More events** — positive windfalls (a trader passes through, extra food/wood), rare
      "special" events with no counter (the asteroid-style 0.5%-chance idea). The engine already
      supports both shapes; this is just content.
- [ ] **A second production/storage tier** — right now Stone is the only uncapped, unboosted
      resource; consider whether it needs its own storage building and production boost to match
      Food/Wood, or whether that's intentionally asymmetric.
- [ ] Balance pass on `CONFIG` now that there's more to balance around (upkeep vs. sickness odds
      vs. build times vs. growth cost) — most of these numbers are still first-guess.

### Deferred on purpose
- [ ] **Eras/ages system** — `S.era` exists and the events engine already filters on it, but there
      is no transition logic, UI, or content beyond Stone Age. Player has design ideas for this not
      yet written down. Do not start implementing until that design pass happens. Bronze Age itself
      is the obvious first entry on `UPGRADES` once this lands — the one-time-upgrade infrastructure
      is ready for it, deliberately not wired to do anything era-related yet.
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
