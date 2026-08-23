# Idle Civ — Working Plan

> **This file is the authority on what is actually built and what happens next.** `design.md`
> holds game-design canon, `tech.md` the architecture, `map.md` the map arc, `interface.md` the
> interface system, `CHANGELOG.md` the shipped-feature record. Those documents describe a game
> that is partly *intended* rather than *implemented* — when they disagree with reality, this
> file and the code win.

---

## STATUS — design pause point (end of 2026-08-22)

**HOLD HERE.** Feature development is deliberately paused until the next UI conversation — the
user is taking the flipped, map-primary structure to the Claude Design thread ("how do we juggle
these panels and info and make everything legible"), and game-design work resumes after that
verdict. Nothing below this hold is blocked technically; it is waiting on purpose.

**What today was.** The single largest day in the project's history: the identity pivot was
specced in the morning and BUILT by evening. The game stopped being an idle game (contract: *the
game never punishes you for leaving*, replacing *the game never needs you* — see `design.md`,
*Time, Presence & Pause*) and became civ-adjacent real-time-with-pause. Shipped same-day, all
harness-green throughout, currently **490 checks**:

- **Engine rail (phases 1–5):** 26 ES modules; seeded RNG (every die from `rng()`, seed on the
  death screen); offline deleted whole (visibility-gated clock, save-on-action, `pagehide`);
  fixed ticks (`S.tick` master clock, header shows `4h 26m · t79,831`); pause/speed as player
  controls with the ask/tell modal-hold (ceremony holds too; Info doesn't).
- **The map (6a, 6c.1, the flip):** place-graph + seeded blob-growth hex generator on its own
  dice stream; the chart exists from frame one; era-scoped views (Stone one hex → Bronze the
  ring → Iron a recut country of 61) — *shipped behaviour, since superseded in design by `map.md`
  §2.6; Phase 10 removes it*; **the map is the game's main surface** — full-bleed stage,
  floating Bureau panels (People + Chronicle right, Train/Build/Upgrade left as fixed shares,
  Underway bottom), the Expeditions panel dissolved into the Selected Tile panel. Hover previews;
  click opens details where all stats/flavor/actions live — the permanent pattern, node-network
  proof.
- **Conquest Growth (6b–6d):** growth/levy/outputMult era-facts; Iron conquest-grown, levied
  (civilians = pop, cap = holdfasts × 2), deep-consolidated (0.25 × 4), housing retired; caps
  retired at Iron with the storage line; per-hex allocation against terrain rate-tables (soft
  menus, overpay routes); **pop is tiles** (`syncDominion`); the minor tier seated and named;
  capture-as-fealty; the settle verb through the queue; supply lines (`routeCost`/`marchFactor`).
  Borders arrive on bread at 1× (designed defaults, after a live starvation found the cliff).

**Docs are current** through all of it — this file, `design.md`, `tech.md`, `map.md`,
`interface.md`, `CHANGELOG.md` all updated per-phase. `deleteme.md` and `interface-brief.md` are
gone. Bureau is the interim panel skin; the identity itself is resolved — **the digital
tabletop** (`design.md` OQ3) — and the design thread's brief is panel legibility against the
diorama.

### The playtest brief (what the user verifies during the hold)

**Correctness — walk the whole arc on a fresh run:**
1. *Stone:* one large hex; steppers work; growth countdown; hover/click the hex; all floating
   panels present; pause (Space), speed keys 1–5, tab-hide freezes the clock (t-counter stops).
2. *Stone→Bronze:* the world widens to the ring — same terrain, nothing regenerates; pure relabel
   (families), era modal holds the world and hands it back at 1×.
3. *Bronze→Iron (the big border):* consolidation to a handful of holdfasts, narrated; army
   carried whole; dominion block granted **already turned to food**, narrated; steppers replaced
   by the standing sentence; ledger rows demote (POP and resources bare); the world recuts to 61
   with three labeled majors and five ▪ minors.
4. *The Iron loop:* re-direct tiles from the Selected Tile panel (rates move live, glyphs
   update); hills offer stone-or-iron; every ground offers everything at printed rates.
5. *Settle:* price/time/route printed on empty land; joins Underway behind builds; completes into
   an owned bread tile (+1 pop, levy cap rises); cancel refunds; try settling two parties to one
   hex (refused).
6. *Subdue:* march on a minor (Muster Ground gating with printed reason first); walls hold →
   damage persists across a second attempt; win → fealty line names the place, whole stock
   arrives, tile owned.
7. *Majors:* march/caravan still work; provisions and march time differ by distance; the muster
   sheet prints the route.
8. *Persistence:* save/load mid-settle, mid-campaign, with captures held — everything resumes
   exactly; seed identical across reloads; death screen shows the seed.

**Judgment — the open design flags (bring verdicts to the next session):**
- **The pulse.** Steppers touched every 30s; hex allocation is minutes-scale. Does Iron feel
  alive between map visits, or dead? (*Density never falls* is the at-risk pillar.)
- **Border pressure.** Carried-army upkeep at holdfast appetite (units × 0.04 × 4) against a
  fresh handful-of-tiles economy — right kind of hard, or a trap?
- **Growth pacing.** Settle cost + queue seriality + levy: is growth triple-charged?
- **Subdue vs settle.** Fast-bloody-with-loot vs safe-slow-ground-only — a real per-tile
  decision, or a solved one?
- **Boost buildings.** With the king-doesn't-count-sacks hat on: do Drying Racks / Lumber Camp /
  Stone Pit survive Iron, or retire with the granaries?
- **Route numbers.** marchFactor 0.6–2.0, water at 3 — do distances *feel* like geography?
- **Minor flavor.** Do the strength bands and wall words read honestly against the fights they
  predict? (Descriptions are mechanics-bearing text.)

### Next up, decided (2026-08-22, evening): the 3D map spike

**The fork:** the evocative-art ruling opened two routes for the map's paint layer. Route A (in
`map.md` §8 today): 2D SVG + commissioned painterly tilesets — art cost scales linearly with 12
eras. Route B (proposed via `spikes/threejs-hex-map-guide.md`, a technically sound external guide):
Three.js 3D where LIGHTING does the heavy lifting — tonemapping/HDRI/AO one-time engineering, era
difference via instanced prop/palette swaps from cheap stylized kits, pan/zoom/tilt free from the
camera rig. The fork is confined to the paint layer by construction (geometry/paint separation);
the sim, generator, harness, panels and interaction pattern are route-independent.

**SPIKE RUN AND MERGED (same evening): see `/spike3d/` on the dev server.** All guide steps 1–9
landed against the real generator (curvature and DOF skipped by design); primitives instead of
GLBs (downloads 404'd) — and the lighting carried them anyway, which was the thesis. 61 tiles,
~10 draw calls, 60fps; verified by readPixels through the post chain AND by the owner live, who
spun the board and called it awesome. Two stale-path guide corrections recorded as an addendum in
`spikes/`. **Decision-relevant finding from the owner's parallel asset hunt:** purchasable HEX-TILE
packs are 2D and stop at medieval (the 12-era problem returns), while the 3D route buys MODEL
packs instead — and that ecosystem (Synty POLYGON line, Kenney) covers eras neolithic→space in one
coherent house style. **VERDICT CALLED (same evening): ROUTE B — 3D.** The owner's words: the coolest thing any of
these browser games has produced; premium before a single purchased asset; happy to look at
dev-art "for a long time if there was a fun game around it"; and the tabletop read (depth,
shadows, bright board-game colors) is *invited* — "you could translate this to the tabletop" is
a compliment to court. Willing to spend a few hundred on model packs — cheaper than the 2D
commissioning it replaces — with extra art budget aimed at era-advance splash illustrations and a
premium SVG icon set instead. Docs revised: `design.md` OQ3 (the digital tabletop identity),
`tech.md` stack revision (the honest walk-back), `map.md` §8 (the 3D art strategy).

**The original decision method: a time-boxed spike, on a branch** — build the guide's steps 1–7 against OUR
generator output (same seed as the live game), drop in 3–4 free kit assets, and put it beside the
shipped SVG stage for an eyes-on verdict. The SVG map survives either way (it becomes the 2D debug
view the guide itself prescribes, and the agent's testing surface). If Route B wins, revise
`tech.md`'s stack section honestly (vendor three.module.js — no CDN at runtime, no build step via
import maps; "a canvas is a bag of pixels" was overstated: the scene graph is queryable, only
semantic pixel-checks fall to human review) and `map.md` §8. If it loses, delete the branch;
nothing else was touched.

### Phase 10 — 3D map integration *(next build phase; sequencing vs the UI talk is the owner's call)*

**Scope grew deliberately on 2026-08-22** — see `map.md` §2.6, *One board, forever*, which settled
the map's whole era model in one conversation. Phase 10 is no longer "port the renderer"; it is the
renderer plus the world model that renderer made possible. The additions, in dependency order:

- [ ] **The two-stage generator.** Coastline first (organic closed curve, plus islands), hexes
      packed inside it, silhouette discarded after packing — it is a generation device, never
      rendered. A prototype exists from a separate session and must be re-plumbed onto `makeRng`
      before it enters `src/` (the `Math.random` ban is a harness check).
- [ ] **Named sub-streams** for every generation stage (`:frame`, `:pack`, `:terrain`, `:seats`),
      so later stages can be inserted without invalidating recorded seeds.
- [ ] **The pregame picker.** Three continents as bare outlines, labelled with hex count and island
      count only; any click starts the run; a reroll draws three more. Each candidate *is* a seed,
      so picking adopts it as the run seed and no new save field appears. One screen, one decision
      — it must never become a settings panel.
- [ ] **Retire era view radii and map regeneration.** `ensureMap()` loses its regenerate-on-
      `tileNoun`-change branch; the era `view` radius is deleted in favour of fog plus a camera
      that pulls back per era. Both are shipped behaviours being removed, not new work.
- [ ] **Fog as face-down tiles.** Unrevealed hexes render as unpainted board (neutral material, the
      world painted in as it is reached), never a dark shroud. Revealed is permanent — no
      re-fogging, per the sticky-reveals law.
- [ ] **Scouting, the Stone Age's spatial verb.** Distance-priced through `routeCost`; reward is
      primarily Chronicle flavor, with any material payoff kept rare so exploration does not become
      a farm; systems stay era-gated behind it.
- [ ] **Per-era re-dress.** Prop-set/palette/light swaps on unchanged ground — the whole revealed
      board changes clothes during the era ceremony, which is the moment the splash-art budget
      exists for.
- [ ] **Terrain-correlated settlement**, so scouted land predicts where rivals appear rather than
      being falsified by them.
- [ ] **Islands: frame-only for now.** Generated, packed, fogged like any board; no seats, no
      settling, no minors until a naval unlock exists. Start placement avoids small islands and
      boxed-in pockets.
- [ ] Board budget **~120 land hexes** including islands (bracket 100–200 — see §2.6's table);
      curate candidate frames at high density, ship them at low.

**Flagged, not scheduled:** `applyConsolidation` reducing `S.pop` is correct for Bronze→Iron and
wrong for every later border under a fixed board, where the board is already the cap. Post-Iron
consolidation should re-denominate the tile noun and raise per-tile output while dominion stays
put. Belongs to the balance pass, after the pop ladder past Iron is designed.

**The original port work follows.**
Port the map stage from SVG to the spike's renderer, for real:
- [ ] Move `spike3d/`'s pipeline into `src/render3d/` behind the existing stage seam: `renderMapStage`
      swaps implementations; the SVG stage survives as the 2D debug/fallback view (`?map=2d`).
- [ ] Re-wire the shipped interaction pattern: plane-picking → `selectTile` (same Selected Tile
      panel), hover ring + DOM tooltip, work-glyph equivalents (3D markers or projected DOM labels),
      owned/selected state via materials — **never opacity**, the law follows the renderer.
- [ ] Era-fact hooks: palette + light mood + prop-set keys in the `map` manifest spec.
- [ ] View radii / fog, dominion growth, captures, settle — all state-driven re-mesh triggers
      (chunk-dirty on the same signature the SVG stage already watches).
- [ ] The §7 curvature shader (tabletop signature), WITH its depth-material and culling gotchas.
- [ ] Vendor three/postprocessing/n8ao into the repo (pinned builds; no CDN at runtime).
- [ ] Verification: keep readPixels smoke checks + the 2D debug view as the assertable surface;
      owner-eye QA for aesthetics, per the revised tech.md contract.

### Held until the UI conversation (in intended order)
1. **The design-thread verdict** — panel juggling/legibility against the diorama. The identity
   itself is no longer on the table: paper is out (war-table candidate killed same-day; see
   `interface.md`) and the successor is ruled — **the digital tabletop**, the lit 3D board
   (`design.md` OQ3, `map.md` §8 Route B). Structure is settled; the thread designs how the
   floating panels read over the 3D world.
2. **The balance pass** the judgment flags feed (upkeep, pacing, routes, pruning).
3. **6e — priests & the envoy** (the peace path; the annexation ceremony under the modal-hold).
4. **Phase 7 — the decision queue** (the pause-modal seam is built and waiting).
5. Parked ideation, logged where it lives: pan/zoom (`map.md` §10 — now an orbit-rig clamp
   rather than a `viewBox` question), the odometer build, the name. *(Directed scouting left this
   list on 2026-08-22: it is promoted to the Stone Age's spatial verb and specced into Phase 10.)*

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

### Phase 1 — File split ✅ *(shipped 2026-08-22)*
- [x] `game.js` → 26 ES modules under `src/{core,content,sim,ui}/` + `main.js`, per `tech.md` →
      *Module Structure* (which now records the shipped tree and the two invariants the split
      created: compile-first entry imports, and cross-module reassignment through `core/state.js`
      setters).
- [x] `file://` double-click retired; `index.html` loads `src/main.js` as a module; README updated.
- [x] Harness bootstrap rewritten: real ESM imports behind one Proxy, vm sandbox and export-hook
      deleted, `package.json` (`type: module`, zero dependencies) added. The split itself was
      proven first through an interim concat loader before the bootstrap moved — two commits, so a
      failure could only mean one thing.
- [x] 420 checks green; browser-verified live (boot from existing save, steppers, modals, pause).

### Phase 2 — Seeded RNG ✅ *(shipped 2026-08-22)*
- [x] `src/core/rng.js`: mulberry32 behind one `rng()`. `S.seed` is the run's permanent identity
      (crypto-minted at freshState); `S.rngState` is the stream position, advanced per draw and
      carried in the save so a reload resumes the dice mid-sequence. Old saves inherit a fresh seed
      through the defensive merge — no migration.
- [x] All 16 draw sites routed through `rng()`; `Math.random` appears nowhere in `src/`, and the
      harness *enforces* that with a source-scan check.
- [x] The harness's 44 `Math.random = …` monkey-patches became `setRngSource()` calls — a designed
      test seam in rng.js rather than global mutation. (The todo had said "move to seeding"; hunting
      seeds that force 44 specific outcomes would have been madness, and the seam is honest test
      infrastructure with the same no-global-patching property.)
- [x] Seed surfaced: `[seed]` console line at boot, World Seed stat on the game-over screen.
- [x] Five new checks (425 total): bit-identical state from same seed + same actions (already true
      at harness scale — the harness steps constant dt), stream determinism, range, save round-trip,
      and the src/ ban. Browser gets bit-identical replay when phase 4 lands.

**Live evidence for this phase, observed 2026-08-22.** During the docs pass the harness failed
**one check in 38 consecutive runs** and could not be reproduced in the 37 runs that followed — the
failing assertion was not captured before the output was overwritten, so we do not know which check
it was. That is the exact failure mode the seed exists to eliminate: a real, rare, randomness-driven
failure that cannot be re-run, cannot be bisected, and cannot be reported as anything more useful
than "it happened once." The project's own status notes have been quoting "20/20 consecutive runs"
for months, which is a statement about flake *rate*, not about correctness. Until phase 2 lands, any
harness failure that doesn't reproduce should be recorded verbatim rather than re-run away.
*(Solved later the same day: it reproduced during the identity-purge docs pass and was captured —
"the party raises a hall", the 6d settle-completion check. The ~90 sim-seconds it runs left the
world's event dice live, and a rare sickness/raid shifted `pop` out from under `popBefore + 1`.
Fixed by pinning `setRngSource(() => 0.99)` around that run — the check tests settle completion,
not event weather. Exactly the class of bug the seed work predicted, caught by its own advice.)*

### Phase 3 — Kill offline ✅ *(shipped 2026-08-22)*
- [x] Deleted whole: `simulateOffline()`, the `SIM`/`SIM_STOP`/`SIM_STOP_CAUSE` flags and setters,
      `lastSeed`, `CONFIG.offlineCapHours`, the `dt > 2` clamp, and all twelve `if (SIM)` branches.
      The Chronicle always logs; `advanceEra` always opens its modal; `die()` always fires.
- [x] `visibilitychange`: hidden stops the sim outright and saves; return resumes automatically,
      with a manual pause surviving the round trip untouched (separate flags). `last` re-anchors on
      return — throttled background intervals would otherwise hand back one oversized dt.
- [x] Save hardening: `pagehide` replaces `beforeunload`; assign/build/cancel/launch each commit
      immediately; `hardReset`'s listener juggling became `suppressSaves()` (the reload's own
      pagehide would re-write the save being wiped — v3's bug, new event).
- [x] Ten new checks (435 total): the deletions asserted, a build round-tripped mid-construction
      through the real save/load path, a campaign round-tripped mid-flight and resolved with
      consequences. *One deviation from the spec:* "no state advances while hidden" is not
      machine-checked — the hidden gate lives in `main.js`, which the harness deliberately never
      imports. Verified by a human watching the clock freeze instead.
- [x] Old saves: inert `lastSeed` fields ride along per the state-is-never-implicitly-destroyed
      invariant; fresh runs never mint one.

### Phase 4 — Ticks ✅ *(shipped 2026-08-22)*
- [x] `S.tick` is the master clock; `step()` takes no argument and advances exactly `TICK_SECONDS`.
      `playtime()` derives from the count; legacy saves convert their seconds once at `load()`.
- [x] Authoring stays per-second. *Deviation from the spec's mechanism:* rather than converting
      rates per-tick in the manifest compiler, the engine passes a constant `dt = TICK_SECONDS` to
      the unchanged subsystems — identical property (authors think in seconds), far less churn.
- [x] The loop is a metronome: `speed` ticks per fire, wall time never measured. `Date.now()`,
      `last`, and the visibility re-anchor all deleted. Throttling bends pace, never math —
      verified live in the throttled embedded pane (1Hz fires produced exactly one tick each).
- [x] Header clock shows elapsed time *and* tick count (`4h 26m · t79,831`) — debugging readout by
      request; `[pacing]` lines carry the tick too.
- [x] Harness: 440 checks. The phase-2 determinism check now describes the browser too — seed +
      tick count + actions = bit-identical state everywhere.

### Phase 5 — Controls ✅ *(shipped 2026-08-22)*
- [x] `openModal()` grows an `opts` bag (extensible by design — the phase-7 decision queue adds its
      keys without another signature change). `pause` defaults **true**; closing releases. The hold
      is a third independent flag beside `paused` and the hidden stop, composed in the loop.
- [x] Ask/tell ruled, with one extension now canon: the **ceremony register holds too** (era
      transition, game over) — stillness is part of the weight. Info is the one telling modal and
      opts out. Recorded in `design.md` rule 3 and `interface.md`.
- [x] Header re-weighted: Pause + speed as a grouped transport instrument (2px borders vs the
      utilities' 1px — weight, never opacity), Reset pushed off alone. Keys: 1–5 set speed notches,
      Space pauses. The dev-only-speed policy is fully dead.
- [x] Seven new checks (447); live-verified ticks frozen under an ask, running under Info.
- [x] Confirmed still right: `paused`/`speed`/`upgradeTab` stay excluded from the save.

### Phase 6 — Conquest Growth + the map's arrival
Specced in `tech.md` (*Conquest Growth — implementation contract*) and `design.md`; the map's M1
slice rides inside this phase by the standing sequencing decision (per-hex allocation needs hexes).
Sub-phased so each slice is playable and pausable:

- [x] **6a — the map exists** *(shipped 2026-08-22)*. Place-graph model, seeded blob-growth
      generator on its own rng stream (never the game's dice — harness-asserted), `S.map` persisted
      tiny with geometry rebuilt from the seed, regeneration keyed on the tile noun changing. Bronze
      gets an inert clearing-scale chart with no seats (early-and-inert); Iron recuts at holdfast
      scale with the three majors seated. Map chrome button (era-gated), wide telling modal, SVG
      hexes, click-to-read detail pane. Terrain share is structurally guaranteed per seed — the
      noise+smoothing first cut starved hills/river on a live map and was replaced same-day.
      14 new checks (461 total), five-seed sweep green.
- [x] **6b — G1 engine rework** *(shipped 2026-08-22)*. Three inheriting era-facts (`growth`,
      `levy`, `outputMult`) with validator teeth; Iron is conquest-grown (accrueGrowth never runs),
      levied (civilians = pop, cap = holdfasts × 2, tooltip reason, live `levy 3/8` cost line),
      deep-consolidated (keep 0.25 × output 4 ≈ 1; the border separates units out of pop exactly
      once — `levyMigrated` marks it), and housing-free (hut removed from the manifest, stocks
      vanish narrated, `housing()` = Infinity under conquest). Unit deaths stop erasing population
      under a levy. POP ledger row demotes to a bare count under conquest (user ruling). Old iron
      saves separate units at load, narrated. **Design ruling made in-build: units are NOT
      consolidated at a levy border — the fighting bands carry whole**, since they are no longer
      population; an overflowing levy just refuses training until the dominion grows into it.
      475 checks; live-verified.
- [x] **6c — terrain yield + per-hex allocation** *(shipped 2026-08-22)*. Iron declares
      `allocation: "tiles"` and zero jobs; owned hexes produce by assignment against terrain menus
      (`map.works` — hills are the stone-or-iron multi-choice); pop **is** tiles, enforced by
      `syncDominion()` (border grants a dominion block; a lost holdfast drops its newest hex).
      **Caps retired at Iron** (user ruling, in the scheduled window): all resources uncapped, the
      storage line leaves the manifest narrated, the ledger demotes to bare values; friction hands
      off to the conquest economy. **The map interaction pattern locked** (user ruling): hover
      previews; click opens details, where ALL stats/flavor/actions live — allocation buttons on
      owned tiles, March/Caravan on seats (the Expeditions panel's dissolution begins). Survives
      the node swap unchanged. 475 checks; live-verified end to end.
      *Still open from this slice:* the pulse question — steppers touched every 30s, hex allocation
      is minutes-scale — playtest verdict pending; and whether the boost buildings (drying racks
      etc.) are also "granary-class" and retire in the 6d/6e pruning pass.
      **6c.1 follow-ups (same day, from live play):** works became RATE TABLES — every ground works
      everything, specialties at par-plus, the rest overpay routes (user ruling); the map's seat
      actions now carry the panel's refusal reasons (found broken in play: silent no-op without a
      Muster Ground); and **the chart walks back to frame one** — the map spec lives in STONE,
      Bronze inherits the identical world, one layout forever, no era-gated UI machinery.
- [x] **6d — G2 growth verbs: subdue, settle, capture, supply lines** *(shipped 2026-08-22)*.
      The minor tier: 5 seats per iron world, hand-authored 14-name pool (pool > seats, runs
      differ), procedural placement and stats-in-range, remnants in `S.map.minors`, ownership
      trumping the regenerated seat (capture survives the save). Campaigns take a unified target
      ref — major id or `tile:q,r` — one resolver, one muster modal; victory over a minor is
      fealty: whole stock home, +1 holdfast on bread, the Chronicle names the place for the last
      time. Settle: empty land, priced in food+wood and time, through the Underway queue (the
      anti-speedrun governor as ruled); wasted honestly if the ground is taken first. Supply
      lines: `routeCost()` multi-source Dijkstra (owned ½, land 1, water 3 — never impossible),
      `marchFactor()` bending time and provisions for majors, minors and settling alike; routes
      printed on tile details and the muster sheet. 13 new checks (490); live-verified.
      *Open from this slice:* growth-pacing triple-charge watch (settle cost + levy + budget), the
      carried-army upkeep flag from 6b, and the boost-building pruning question — all land in the
      6e/balance pause.
- [ ] **6e — G3 priests & the envoy.** Religious building + priest unit; envoy as the third
      adversary action; per-target affinity; the annexation ceremony modal (the first ceremony built
      under the pause-modal seam); standing hooks into event weights.

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
**Structural half SHIPPED 2026-08-22 ("the flip"), ahead of 6d by user ruling (option A: the growth
verbs land straight into their real home).** The 4×2 grid is gone: full-bleed map stage, floating
panels (People + tabbed Train/Build/Upgrade left; Selected Tile + Chronicle right; Underway docked
bottom, cards horizontal), the Expeditions panel dissolved into the Selected Tile panel, the Map
button gone — the map is not a place you go, it is where you are. Rode with it: **era-scoped view
radii** (Stone shows one hex, Bronze the ring, Iron the country — the world literally grows with
the ages) and the frame-one chart. *(The radii were retired in design that evening — `map.md` §2.6
keeps the growing-world effect but delivers it with fog and a camera over one permanent board.)* Bureau remains as the **interim skin**: structure was adopted
from the Claude Design sketch, palette explicitly was not.

**What remains of phase 9:** executing the reskin, not choosing it. The identity question opened
here **resolved the same day** — paper retired (the war table weighed and killed), and the 3D
spike settled the successor: **the digital tabletop** (`design.md` OQ3, `map.md` §8, Phase 10
above). Bureau stays as the interim panel skin; its lessons (no opacity for state, semantic color,
legibility over texture) survive the reskin as law. The Claude Design pass still runs — its brief
is panel legibility with the flipped structure over the diorama. *(As originally written this
paragraph put Bureau formally under review with the war table as one candidate to weigh — campaign
maps historically ARE paper, so Bureau could evolve, parchment map and paper panels, rather than
die. Both halves were ruled within hours.)*
Original text follows for the record:
*(pulled forward 2026-08-22)* The user returned to the Claude Design thread and came back with a
structural sketch: the map as the main canvas, everything else as floating panels over it — Orders
left, Selected Tile right (stats + flavor + all actions, incl. March/Caravan/Scout with costs),
Chronicle docked right, Underway docked bottom, ledger in the header. All current systems map 1:1
onto it. Rulings so far: **the pattern is structure, not palette** (the sketch's dark slate is not
decided; whether Bureau's paper survives is still the open identity question, to be resolved in the
design thread); and **one layout for the whole game** — the chart now exists from Stone, so
map-primary needs no era gating and the "neat map → main surface" shift is continuity.
Sequencing decision pending at the next pause: flip the layout before 6d (less rework — the growth
verbs land straight into their real home) or after (6d proves the content first).

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
