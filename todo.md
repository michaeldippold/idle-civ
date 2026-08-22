# Idle Civ — Working Plan

> **This file is the authority on what is actually built and what happens next.** `design.md`
> holds game-design canon, `tech.md` the architecture, `map.md` the map arc, `interface.md` the
> interface system, `CHANGELOG.md` the shipped-feature record. Those documents describe a game
> that is partly *intended* rather than *implemented* — when they disagree with reality, this
> file and the code win.

---

## STATUS — the pivot (2026-08-22)

**The game stopped being an idle game today.** This is a deliberate, discussed, settled change of
identity, not a drift. Read `design.md` → *Time, Presence & Pause* first; everything below assumes
it.

**What changed, in one paragraph.** Idle Civ was built on the contract *the game never needs you*,
which banned every interesting decision — because a decision the player might not be present for is
a decision the game needs them for. That contract is replaced by *the game never punishes you for
leaving*, which bans only loss. Offline progress is gone; the simulation runs only while the tab is
visible; pause and fast-forward become player controls; events may present choices that wait
patiently for you; and the save becomes a correctness requirement rather than a convenience. The
game is now civ-adjacent real-time-with-pause: decisions, opportunity cost, and an outside world you
fight, trade with, or absorb.

**The evidence that decided it** was the project's own telemetry. After the first full playthrough
(34h37m simulated, three eras, Iron exhausted), every resource sat pegged at its storage cap except
gold — and gold was the only number still moving, because it is fed by expeditions, the one active
verb. Offline progress delivered exactly one thing: filling caps that ten minutes of watching would
have filled anyway.

**What the code currently is.** Everything through v18.1 is shipped, harness-green (422 checks,
20/20 runs), and human-playtested end to end through all three eras. **None of the pivot is
implemented.** The code today still has `simulateOffline()`, continuous delta-time, unseeded
`Math.random()`, a dev-only speed control, and a single 3,409-line `game.js`. Phases 1–5 below are
what close that gap.

**Where the docs are ahead of the code.** `design.md`, `tech.md`, `map.md`, and `interface.md` were
all rewritten today and describe the *target*. They mark shipped vs pending; trust those markers,
and trust this file over all of them.

---

## The phase plan

Sequenced. Each phase is a commit or a small run of them. **The harness stays green at every
boundary through phase 5** — that rail is what makes this a refactor rather than a rewrite.

### Phase 0 — Docs ✅ *(this session)*
- [x] `design.md` rewritten: idle pillars removed, *Time, Presence & Pause* added as the new
      premise, mechanic-retirement canonized, map promoted out of Out of Scope.
- [x] `tech.md` rewritten: shipped-vs-pending marking throughout, tick model, seeded RNG, module
      structure, decision queue.
- [x] `map.md` created: place-graph model, pointy-top hexes, procedural generation, hand-authored
      adversary pool with generated slates, art strategy.
- [x] `interface.md` created from the retired `interface-brief.md`: Bureau documented as shipped,
      presence constraint replaced, modal register revised.
- [x] `CHANGELOG.md` split out of this file.
- [x] `deleteme.md` retired — its live questions promoted into `design.md`.

### Phase 1 — File split
Mechanical, zero behaviour change. First, because every later diff becomes readable.
- [ ] Break `game.js` into ES modules per the tree in `tech.md` → *Module structure*. Target
      100–300 lines per file; the ~1,175-line UI layer needs the most subdivision.
- [ ] Retire the `file://` double-click promise in the docs and the README. It was already broken in
      practice (`.claude/launch.json` runs http-server; the game ships to GitHub Pages) and it is the
      only reason `game.js` is one file.
- [ ] Rewrite the harness *bootstrap*: it currently boots via `vm.createContext` with stubbed
      `document`/`localStorage`; under modules it imports directly. The ~420 assertions are
      unaffected. **This is the only real work in this phase** — the split itself is moving text.
- [ ] Harness green, game plays identically. Verify in a browser, not just headlessly.

### Phase 2 — Seeded RNG
- [ ] One `rng()` backed by a small seedable PRNG (mulberry32 or equivalent); state in `S`.
- [ ] Route all 16 `Math.random()` call sites in `game.js` through it. Sweep `harness.js` too — it
      has 62, most of which are test scaffolding and should keep using real randomness, but the
      forced-RNG paths should move to seeding instead of monkey-patching.
- [ ] `Math.random()` becomes forbidden in `src/`. A grep in the harness is enough enforcement.
- [ ] Surface the seed somewhere a player can read it (game-over screen at minimum). It is how a
      bug report becomes reproducible.
- [ ] Note: the *full* determinism payoff needs phase 4 as well. With variable `dt`, a seed alone
      does not give bit-identical replay.

**Live evidence for this phase, observed 2026-08-22.** During the docs pass the harness failed
**one check in 38 consecutive runs** and could not be reproduced in the 37 runs that followed — the
failing assertion was not captured before the output was overwritten, so we do not know which check
it was. That is the exact failure mode the seed exists to eliminate: a real, rare, randomness-driven
failure that cannot be re-run, cannot be bisected, and cannot be reported as anything more useful
than "it happened once." The project's own status notes have been quoting "20/20 consecutive runs"
for months, which is a statement about flake *rate*, not about correctness. Until phase 2 lands, any
harness failure that doesn't reproduce should be recorded verbatim rather than re-run away.

### Phase 3 — Kill offline
- [ ] Delete `simulateOffline()`, `SIM`, `SIM_STOP`, `SIM_STOP_CAUSE`, `lastSeed`,
      `CONFIG.offlineCapHours`, and every `if (SIM)` branch (they hide in `advanceEra()`, `log()`,
      migration narration, and expedition resolution — grep, don't guess).
- [ ] Delete the `dt > 2` clamp. Nothing can deschedule the simulation any more.
- [ ] Auto-pause on `visibilitychange` when the document is hidden. Resume is explicit or automatic
      — decide in play; automatic-on-return is the default guess.
- [ ] Save hardening: `visibilitychange` instead of `beforeunload`, plus a save on every player
      action. Save is now load-bearing (see `design.md`).
- [ ] Harness: assert no state advances while hidden; assert a save/load round-trip through every
      mid-action state (queued build, expedition in the field).

### Phase 4 — Ticks
- [ ] `S.tick` becomes the master clock. `S.playtime` derives from it rather than accumulating
      separately.
- [ ] Authoring stays per-second in `CONFIG` and the manifests; convert to per-tick at manifest
      compile time. Do not make the content author think in ticks.
- [ ] Speed = N ticks per frame (already how the speed control works); pause = zero ticks.
- [ ] Harness: same seed + same tick count + same actions = bit-identical `S`. This is the
      acceptance test for the whole phase, and the thing that makes balance regressions catchable.

### Phase 5 — Controls
- [ ] Promote pause and speed out of dev-only status. `tech.md` previously recorded speed as a
      dev/testing tool to be locked away before release; that policy is reversed.
- [ ] Modal `pause` flag with the ask/tell split: modals that ask something pause the game, modals
      that tell you something don't. Default true; Info opts out.
- [ ] Header chrome updated to read as game controls rather than debug affordances — see
      `interface.md`.

### Phase 6 — Conquest Growth (G1–G3)
Already specced in `tech.md` → *Conquest Growth & the Peace Path — implementation contract*, and in
`design.md` under the same name. Unchanged by the pivot, and strengthened by it — this design was
already moving population onto the active side of the game.
- [ ] **G1 — engine rework.** Era-scoped growth mode (`timer` | `conquest`); deep consolidation +
      output multiplier (`keep × output ≈ 1`); pop/units separation (`popCost` dies at Iron); levy
      cap; housing retired at Iron.
- [ ] **G2 — minor tier & capture.** Freeholds and petty lords in the adversary slates; capture
      outcome on campaign resolution.
- [ ] **G3 — priests & the envoy.** Religious building + priest unit; envoy as a third adversary
      action; per-target affinity; the annexation ceremony modal.

### Phase 7 — Decision queue
The payoff of the whole pivot.
- [ ] `S.pending` — events may enqueue a choice rather than self-applying. Part of the save.
- [ ] No expiry, ever. No timer, no claim window, no urgency affordance.
- [ ] Every choice ships with a designed default so it rolls off gracefully.
- [ ] The decision card/tray component — see `interface.md`.
- [ ] First content: two or three real decisions in the Iron slate, to find out whether this is as
      good as it sounds before building more.

### Phase 8 — Map
Designed in `map.md`. Gated behind the engine work because phases 1–4 make it dramatically cheaper.
- [ ] Place-graph data model (places + position + adjacency), independent of hexes.
- [ ] Pointy-top hex renderer in SVG; DOM overlay for labels, tokens, popups.
- [ ] Seeded procedural generation: coherent noise, landmass post-processing, feature placement.
- [ ] Hand-authored adversary pool per era, larger than the slate; role-constrained slate
      generation.
- [ ] Distance as a design lever (campaign time, provisions, caravan routes).
- [ ] **Ship the map early and inert, in Bronze** — visible, readable, no adversaries, no yield, no
      actions (`map.md` §2.5). Bronze→Iron already carries seven simultaneous changes; this is the
      mitigation that stops the map being an eighth. It also makes the M1 slice shippable content
      rather than scaffolding.
- [x] **Sequencing between phases 6 and 8: decided 2026-08-22.** Per-hex allocation replaces the job
      steppers at Iron, so hexes must exist the moment G1 ships. **M1 (map model + readout) lands
      inside phase 6** rather than G1 carrying a throwaway interim production model. Revert target if
      it goes badly is commit `fff278c`+1.
- [ ] **The odometer** — derived `souls = Σ tiles × soulsPerTile(era)`, never stored, never a lever.
      Cheap, and worth doing early because it is the thing that makes scale *felt*.

### Phase 9 — Interface re-architecture around the map
**Open and deferred.** Whether the map becomes the interface's centre with panels moved to the
periphery is gated on having a map good enough to deserve it. Until then Bureau's 4×2 grid stands
and is not in question. See `design.md` → Open Questions, and `map.md`.

---

## Carry-over todos

These survive the pivot unchanged.

- [ ] **C3 — Iron polish.** Raid attribution flavor ("the Hill Clans test your defenses" rather than
      an anonymous warband), so the world's proper nouns appear in both directions.
- [ ] **Balance pass on `CONFIG`.** Most numbers are still first guesses, deliberately tuned toward
      too-hard per the standing rule. `conflictBaseChance` has been retuned once from real playtest
      data (tripled); expect others to move. The pivot changes the pacing target — everything must
      now fit a sitting — so this is due a fresh look after phase 5.
      *Known dials, if pacing feels off:* `consolidate.keep` (iron delta) is THE population dial;
      each adversary's `walls`, `CONFIG.siegeWallBonus` and `CONFIG.wallRetreatLoss` govern siege
      feel; `CONFIG.settlerIntervalSeconds` governs early growth.
- [ ] **A rare "special" event with no counter** (the asteroid-style 0.5%-chance idea). The engine
      already supports the shape; it's content. Now also a candidate for the first *decision* event.
- [ ] **Additional person-types.** Priests arrive with G3. "Citizen" as a Settler rename is saved for
      a later age.
- [ ] **Holding-tile tints: locked as aesthetic, open as semantics.** The `BUILDING_CATS` category
      mapping (shelter / store / work / care / people) is a first guess; which colors exist and how
      strictly they gate by content type is still a design decision.

---

## Deferred on purpose

- **Ages past Iron.** The age list in `design.md` is a flavor guide, not a backlog. One age at a
  time, each proven fun before the next is scoped. The Enlightenment gets scoped when the Iron
  rework has shipped and played; its scoping notes are in `design.md`.
- **The name.** "Idle Civ" is wrong now. Deferred until the pivoted game is playable — see
  `design.md` → Open Questions.
- **Whether Bureau survives the map.** Same gate.
- **Tick-counter for authored beats.** Phase 4 delivers `S.tick`, which makes "sickness can't fire
  again within N ticks" and scripted era milestones trivial. Not needed yet; the capability just
  arrives for free.

---

## Known rough edges

- [ ] **Mobile layout** is a basic stacked-column `@media` fallback, not designed for. Matches the
      stated non-goal; flagged only so it stays true.
- [ ] **Holdings tiles show raw counts with no compaction.** Fine at current scale. The
      re-denomination design means playable numbers should never get big enough to need it — if they
      do, that's a design bug, not a display bug.
      **One deliberate exception**, added 2026-08-22: the **odometer** (`design.md` → *Scale: The
      Tile Ladder*) is a purely-flavor count of individual beings under your control, and it is meant
      to reach the trillions. That is one formatter for one display, not the small-numbers pillar
      being abandoned. Do not let it grow into a general compaction system.
- [ ] **Conflict's numbers are first-guess** (`conflictBaseChance`, `conflictPopScale`, raid-size
      weights, the `repelChance` ratio, casualty and theft fractions).
- [ ] **The migration runner and DOM purge are lightly exercised** relative to their importance. The
      bronze→iron flip is their only real workout; the harness covers the primitives synthetically.

---

## Open threads from play

The first full playthrough (2026-08-21) validated everything previously flagged awaiting human
contact — v15.4 queue icons, v16 siege, v17 re-denomination, the Bureau board, and both click bugs
(v18/v18.1, found *during* that playtest and fixed). What it surfaced instead:

- **The fun concentrates where the verbs are.** Expeditions were by far the most engaging part of
  Iron, because they were the only outward-facing action. That observation is now load-bearing
  design canon and is what produced both Conquest Growth and this pivot.
- **Flavor friction is a gameplay smell.** "My longhouse holds 3 holdfasts" was the fiction
  correctly reporting that the mechanics beneath it hadn't re-denominated. Trust that signal.
- **The campaign muster modal is the best moment in the game and deserves more.** It is currently
  the only place the interface stages a real decision. Phases 5 and 7 are about making that the
  norm rather than the exception.
- **The Iron Age ends signal-less by design** — the terminal signal *is* the next capstone, which
  doesn't exist yet. That end-state is exactly what "done, awaiting an exit" looks like.
