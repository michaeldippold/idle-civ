# Idle Civ — Interface

**What this file is.** The reference for the game's interface *as a system*: the constraints it has
to express, the shipped visual language (**Bureau**), the layout, the reusable components, the
presentation rules and the reasons behind them. It is not a brief — the design pass it descends from
happened, came back, and shipped. `design.md` is the canon this serves; `tech.md` covers the render
architecture; `map.md` covers the map arc that will eventually reopen the layout question.

**How to read the markers.** The pivot of 2026-08-22 (see `design.md`, *Time, Presence & Pause*)
changed what the interface is for, and the code has not caught up. So:

- **Shipped.** — on screen today, in `index.html` / `styles.css` / the render layer of `game.js`.
- **Pending — phase N.** — settled design, not built. N is the phase number in `todo.md`.

Everything unmarked is shipped and stable. Historical notes appear only where the reasoning behind a
reversal is still load-bearing; this is not a record of every decision ever taken.

---

## 1. Identity constraints

Game-design facts the interface must express, not stylistic preferences.

1. **This is a numbers-and-menus game.** No rendered units, no animation, no twitch input; the
   interface is panels of numbers, labels, form controls and prose. The founding identity test is
   that *the whole game could be drawn in black pen on ruled paper* — read that as restraint and
   legibility (boxes, rules, text, small glyphs), not as literal art direction. **The one amendment:**
   a map is now in scope (`map.md`). A map of *places* is still not a rendered unit; the ban on
   drawing armies stands unchanged.

2. **Text is a game mechanic.** Flavor is load-bearing by design law: an adversary's description is
   how the player reads its strength, standing and wall damage are narrated in words and never
   metered, and Chronicle lines are the actual record of play. Type, measure, rhythm and emphasis are
   a first-class design surface, not decoration around one.

3. **The contents unravel; the board does not.** Every panel the current era can fill is present from
   the first frame, named by its header, empty and waiting. Your People and the Chronicle start with
   content; the rest start as blank forms. Rows, tiles and cards appear the first time their content
   becomes relevant and then stay forever — reveals are sticky, nothing flickers away when a
   threshold dips. Panels *filling* is the progression display. The single sanctioned moment for the
   board's own shape to change is an era transition, when panels may arrive or retire and retired
   content is purged in one pass.

   *Historical note, kept because the reversal explains the current rule.* This previously hid whole
   panels until earned. That was calibrated for a wireframe in which an empty panel and a full one
   were the same hairline box on white — showing them all read as clutter. Bureau's ink header plates
   and per-column paper stock removed the premise: an empty panel now reads as a *blank form*, which
   suits a game about administration, and against defined content areas a slow reveal reads as broken
   rather than as discovery.

4. **The game never punishes you for leaving — but it is meant to be watched.** *(Replaces the old
   constraint "the UI never demands presence", which is dead. It banned every interesting decision,
   because a decision the player might not be present for is a decision the game "needs" them for.)*
   The new contract bans **loss**, not attention: nothing expires, nothing decays, no reward is
   forfeited by being away. The clock runs while you are looking at it and stops when you are not.
   Consequences for the interface:

   - **Nothing may read as "act now or lose."** No countdowns on choices, no claim buttons, no
     decaying meters, no alarm states. That rule is unchanged and is now the *only* thing left of the
     old constraint.
   - **Interrupting the player is legal.** The interface may stage a decision, pause the world, and
     wait. It could not before.
   - **Pause and speed are player verbs**, not developer affordances — see §3.
   - **Any choice ships with a designed default**, so it degrades gracefully when the player
     fast-forwards past it or simply doesn't care.

5. **Numbers stay small forever.** Population re-denominates (settler → family → holdfast → … → star
   system) rather than inflating; resources cap in the hundreds. Layouts never need 1.2M-style
   compaction, and steppers stay viable to the end of the game.

6. **Widescreen desktop is the only format.** Not "primary" — the only one. The stacked-column
   `@media (max-width: 700px)` fallback exists so a phone gets a readable page instead of a broken
   one; it is not a design surface. Fixed viewport, page never scrolls, every panel scrolls
   internally under a fixed header.

---

## 2. Bureau — the shipped visual system

**Shipped 2026-08-20.** Dense administrative paper: ledger sheets, ink tab headers, monospace
numerals, hard 1px borders, no rounded corners, no shadows except the modal's hard offset. The game
is a spreadsheet, and the design is proud of that rather than disguising it. Two directions were
rejected on the way: an airy "Field Notes" layout that read as a retail product page, and a dark
"Basalt" register that was handsome but fought the paper metaphor. A pastel chalkboard variant died
because panel tints plus semantic red/green overloaded the color channel.

### The two load-bearing laws

1. **Opacity is never used for state. Ever.** It previously did triple duty for *unaffordable*,
   *queued* and *already owned*, and players read all three as "you can't have this" — which for a
   queued or owned item is the opposite of true. State is carried by border weight, border color,
   glyph color and status words in the semantic palette. Faded text is also simply harder to read,
   which is the other half of the objection. *This is the one Bureau rule most likely to be violated
   by accident; check any new state treatment against it.*
2. **Legibility outranks texture.** The Chronicle's legal pad is the one place the material is
   allowed to be the point. Every other ruling is background at most, and anything carrying words
   sits in an opaque box on top of it — cards, tiles, tabs, and the loose empty-state sentences,
   which get their own patch of clean paper.

### Tokens, not literals

Bureau was authored inline and literal in the prototype; `styles.css` re-expresses it as custom
properties on `:root`. There is a desk that changes per era and nine more eras of content coming, so
a palette re-pointable in one place wins. **Never hardcode a Bureau value in new CSS** — if a needed
value has no token, add one.

```
--ink #191710   --paper #f7f4ea   --card #ffffff   --job-row #fffdf7   --legal #fbf7e2
--text-2 #5f584a   --text-3 #6a6354   --text-denom #7a7362   --text-faint (stepper glyphs only)
--danger #a33420   --danger-deep #7d2718   --good #3f6d2c   --queued #8a6a1e
--hair / --hair-soft / --rule   borders: ordinary, unaffordable-or-waiting, cell dividers
```

**The semantic channel is three values and nothing else may use them:** red = blocked, negative,
at-cap; green = working, gained, owned; amber = queued or in progress. Category tints on Settlement
tiles (shelter green, storage sand, work violet, care rose, people blue) are deliberately *outside*
this channel — they group at a glance without spending it.

### Paper stocks, one per column

The panels are the same stock with different ruling, which is what makes the columns distinguishable
without spending color on it.

| Column | Panels | Stock |
|---|---|---|
| 1 | Your People, Training | **Cork** — `--cork`, four speckle layers at coprime tile sizes |
| 2 | Settlement, Construction | **Graph** — 16px grid |
| 3 | Underway, Upgrades, Expeditions | **Dot grid** — 14px |
| 4 | Chronicle | **Legal pad** — cream, 28px rules, red margin rule |
| — | Info modal body | Graph, with boxed items in two columns per section |

**Cork is a material, not a ruling, and that is the point.** Column 1 is where you move bodies
around, and a pinboard is what that looks like in an office; everything on it is already an opaque
box, so the tiles and job rows read as cards pinned to it. Because a speckle field crosses no
letterforms, loose text may sit directly on cork — but needs a darker ink (`--text-cork`) to hold
contrast, and a white patch floating on a big cork field read as a stray label rather than a note.
The speckle tile sizes are coprime on purpose; equal or harmonic sizes beat against each other and
show an obvious repeat. No pins, no curled corners — decorative detail carrying no information is
exactly what the restraint rule forbids.

Rulings were strengthened on 2026-08-20 from a calibration that assumed text touched the pattern.
Dots need roughly double the alpha of lines to read at equal strength.

### Three type registers

- **Space Grotesk** — UI, labels, names.
- **Space Mono** — every number, cost, rate and the clock; always `tabular-nums`, so nothing jitters
  as digits change.
- **Newsreader** — Chronicle prose and modal leads only. Serif marks *narration*; it is the
  typographic signal for the ceremony register.

Minimums after the legibility pass: card names 13px, costs and rates 11px, ledger values 14.5px, tile
counts 16px, Chronicle 13/14px, tooltip body 13px, panel headers 11px at .15em tracking. Grey is
retired from anything carrying meaning; it survives only on the `/50` half of a value.

### Era chrome

The desk under the board is set by `body[data-era]` — Stone `#cfcec6`, Bronze `#553a20`, Iron
`#24272b` — with each era's badge colors defined alongside it. Cookie Clicker's habit of dressing up
as you progress, restrained, since this is a game about tables. Two rules make it safe:

- **Anything outside a panel must coordinate with the desk.** Header chrome is authored as three
  layers — bone border, ink fill, bone text — and *inverts wholesale* on dark desks rather than
  tweaking one value. It must survive a later era's blueprint, steel, or photograph.
- **The era badge carries a ring** (`--chrome-ring`) so a plate can never merge into a desk of
  similar tone, and each era's desk is deliberately darker or lighter than its own badge.

Adding an era means adding one `body[data-era="…"]` block with `--desk` and the four badge tokens,
plus a light/dark chrome assignment. Nothing else.

### Grid geometry

`#mainArea` is `grid-template-columns: 0.86fr 1fr 1fr 1.24fr` × `grid-template-rows: 1fr 1.7fr`, 12px
gap. People is narrowest (it is mostly steppers), Chronicle widest (it is prose); the roster row is
shorter than the action row. `body` is `overflow: hidden` and flex-column; `.block` is
`overflow: hidden` with a fixed `h2` and a `.block-body` that scrolls. The ledger is its own grid,
`repeat(auto-fill, minmax(190px, 1fr))` — `auto-fill` rather than `auto-fit` is load-bearing, since it
keeps empty tracks on a part-full last row instead of letting two leftover resources stretch to half
the screen each. Cell rules are drawn as box-shadows on trailing edges only, one owner per boundary.

**The fallen state** drains the board rather than fading it: `body.dead #mainArea .block` gets
`filter: saturate(.25)`. Text stays fully legible — the opacity law holds even in death.

---

## 3. The layout

**Shipped 2026-08-22 — "the flip."** The map is the game's main surface; everything else floats
over it. One layout for the whole game (the chart exists from Stone, showing one hex; Bronze widens
to the ring; Iron recuts a country), so no era-gated UI machinery exists or ever needs to.

```
┌──────────────────────────────────────────────────────────────────────┐
│ IDLE CIV [Era] [Paused]      clock·tick  [Pause|1×] [Info][Save]  [Reset]
├──────────────────────────────────────────────────────────────────────┤
│ POP · FOOD · WOOD · STONE · …                                        │  ← ledger
├──────────────────────────────────────────────────────────────────────┤
│ ┌────────────┐                                        ┌────────────┐ │
│ │ YOUR PEOPLE│         THE MAP (full-bleed stage,     │ SELECTED   │ │
│ ├────────────┤          era-tinted desk beneath,      │ TILE*      │ │
│ │ TRAIN│BUILD│          hexes auto-fitted)            ├────────────┤ │
│ │ │UPGRADE   │                                        │ CHRONICLE  │ │
│ │ (tabbed)   │        ┌──────────────────┐            │            │ │
│ └────────────┘        │ UNDERWAY (cards →)│           └────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

*The Selected Tile panel is the one panel sanctioned to hide: an empty selection is not a blank
form, it is no selection at all. Everything else is present from the first frame, per the unravel
law.*

**Column logic survives the flip in spirit:** left is what you have and how you get more (People;
Train/Build/Upgrade as one tabbed panel — the three buy surfaces share a home, per the sketch);
right is the world's state and story (Selected Tile; Chronicle); bottom is what's underway. The
holdings tiles live in the Build pane under the era's title, so the Settlement→Village→Town
machinery is intact. **The Expeditions panel is dissolved** — the Selected Tile panel carries the
adversary card and its actions; the muster and escort modals are its surviving machinery.

**Render discipline on the stage:** the SVG rebuilds only when its *signature* changes (era, view,
ownership, assignments, selection) — never on the 5Hz tick, per the click-eater rule; the tile
detail re-renders only when its content string changes; all wiring is by delegation. Floating
panels carry the modal's hard offset shadow — the on-the-board ceremony deliberately extended to
the panel layer.

**Skin status: Bureau, interim, formally under review.** The flip adopted the Claude Design
sketch's *structure* only — the user was explicit that the sketch is not a theming example. Whether
paper survives as the identity is the open question, to be resolved by a proper design pass with
the flipped structure as its brief (the same process that produced Bureau). Bureau's *laws* — no
opacity for state, the three-value semantic channel, legibility over texture — survive any answer.

*Historical note:* the previous layout was a fixed 2×4 grid of eight panels with span machinery
(the Chronicle double-height until Expeditions arrived). It, its `updateSpans`, and the Map button
all died in the flip — the map is not a place you go, it is where you are.

### The header

**Shipped (phase 5, 2026-08-22).** The header reads `clock · [Pause|1×] · Info · Save · · · Reset`:
Pause and speed are one grouped transport instrument beside the clock they govern — shared edge
like the segmented stepper, borders at 2px against the utilities' 1px, because **weight carries
the hierarchy, never opacity** — and Reset is pushed off to the far edge so the dangerous verb
stands alone. Keys: Space toggles pause, 1–5 land on the speed notches. **Pause is how you think
and speed is how you get on with it**; the header now says so.

*Historical note:* the pre-pivot header was a uniform utility strip, which was right under the old
contract — the sim needed no supervision, so its controls were housekeeping.

What is already shipped and worth keeping: the fast state is *visible* (`.chrome-btn.fast` goes
amber, the semantic value for in-progress, because running fast is a state you can forget you are
in), the `#pauseFlag` plate appears next to the era badge, and the clock is unstyled tabular text at
title color — a readout, not a control. Since phase 4 the clock reads elapsed world time *and* the
raw tick count (`4h 26m · t79,831`) — the tick a deliberate debugging readout, because with a
seeded, tick-counted sim, *what tick did it happen on* is the coordinate a bug report wants. Phase 5
decides whether the tick display survives into player-facing chrome or moves behind a dev toggle. Note that `paused`, `speed` and `upgradeTab` are deliberately
UI state excluded from the save; phase 5 should confirm that still holds once pause is a primary verb
and the world genuinely stops with it.

---

## 4. Component inventory

Everything on screen is built from about a dozen reusable pieces. Restyling these restyles the whole
game, including all future eras, which are authored as data against this same grammar.

1. **Panel shell** — ink tab header (fixed, reads as a filing label) + internally scrolling body
   carrying its column's ruling class. Titles are era data.
2. **Ledger row** — name, `value / cap`, signed rate. Rate carries the semantic coloring: negative
   red (a draining pile scans as a problem at a glance), positive green. Value goes red at cap
   (storage full = waste). **Population leads the strip** — it has a value, a cap and a rate, so it is
   a resource; idle count rides in the same cell in red, because idle labor is a problem the player
   should fix. Two sentences died for this: "Housing is full" and the standalone idle readout.
   **Era-scoped (shipped 6b):** under conquest growth the POP row is a bare count — no cap (there is
   none) and no rate (nothing ticks). The number stays load-bearing — it is the levy base and the
   workforce — but its growth is a verb now, and the row stops promising math it no longer has.
3. **Stepper row** — one *segmented instrument*, `−│count│+`, uniform 24px cells with internal
   dividers, not two loose buttons flanking a floating number. Borders never change; only glyph color
   dims when an action is unavailable — the no-opacity law in miniature. Job rows are **two lines**
   (name above, rate and stepper beneath): at ~180px column width there is no honest way to fit name +
   rate + stepper on one, and the name is the control's primary label. Used for job assignment and for
   mustering forces in the campaign/caravan modals.
   **Era-scoped (pending — phase 6/8):** job assignment retires the stepper at Iron, replaced by
   clicking a hex and setting what that holding gathers. Same mechanic, better surface — the decision
   moves to where the information already is. The stepper survives for non-spatial quantity
   allocation, principally mustering.
4. **Buy card** — the workhorse, one grammar for buildings, upgrades and units alike. Name +
   right-aligned status (owned count / "owned" / "queued" / "Maxed"), cost line with each unaffordable
   resource in red, build time. **Unaffordable is a lighter border and nothing else** — text stays at
   full contrast, because most cards spend most of their life unaffordable and *reading* them is how
   players plan. Cost text wraps and never truncates: a hidden second resource means the player cannot
   see why a purchase is refused.
5. **Holding tile** — icon + count side by side, no label; the old stacked icon/name/number
   arrangement read as a fraction. Names live in the tooltip. Pale category tint by family. Icons are
   1.6px-stroke line glyphs on a 24px grid, drawn in `currentColor`, legible at 21px; an icon belongs
   to an *id* and persists across era renames (Hut → Stone House → Longhouse).
6. **Progress card** — tiny type glyph (hammer = build, sword = campaign, coins = caravan), label,
   progress bar, ETA, and — for builds only — a cancel ×. Expeditions are deliberately cancel-less and
   that absence is meaningful. Queued items are carried by border and bar color, never by fading the
   text: a queued item is something you may still want to read and cancel. No "Raising:" prefix; the
   filled bar and "~24s left" already identify the active item.
7. **Adversary card** — name, `disposition · standing-word`, description prose, a known-stock line,
   narrated wall damage ("Their walls are battered."), and one or two action buttons whose disabled
   states carry tooltip reasons. **The one card in the game that keeps its description on the board**,
   because reading it *is* the decision (§5, flavor is load-bearing).
8. **Chronicle entry** — one line of prose sitting *on* the legal-pad rules at 28px, newest at top, no
   timestamps, gutter mark against the red margin rule. Severity is the three-value semantic system;
   exactly one entry ever carries `.latest`, slightly larger and darker, so "what just happened" stays
   findable without reading.
9. **Tooltip** — **descriptions live here and nowhere else** (adversary cards excepted). Inline
   descriptions clog the board once eight panels are open, and hover means a description can be *more*
   verbose, not less. The tooltip also carries the refusal reason in red ("Short 24 wood."), so there
   is exactly one place to look when something will not buy. Content is a getter evaluated at hover
   time — cards update in place, so anything baked in at creation goes stale.
10. **Modal** — single, centered, dimmed backdrop, closable by ×, backdrop or Esc; hard offset
    shadow, the only shadow in the game, marking it as sitting *on* the board. Legal-pad stock, a
    Newsreader lead in a box. Six uses today: era transition, campaign muster, caravan escort, Info
    reference (era-tabbed, graph-ruled, boxed two-column), reset confirm, game over. **The register is
    changing — see §5.**
11. **Status line** — a single small line of prose with one emphasized value ("Next holdfast joins in
    45s.", "A campaign is in the field."). Used for growth, expedition state and empty states. Prefer
    a sentence over a widget wherever a sentence works.
12. **Tabs** — Upgrades' Available / Owned with counts. Owned upgrades are *filtered out*, not dimmed
    in place; on the Owned tab they render at full contrast with a green border, because they are an
    achievement, not a refusal. Inactive tabs take an opaque fill so the ruling never runs behind
    their text.
13. **Button row** — header chrome and modal actions, with one `danger` variant for destructive or
    irreversible acts (Reset, March).

### 14. Decision card / tray — **Pending — phase 7**

The one genuinely new component the pivot introduces. An event may enqueue a choice (`S.pending`)
rather than self-applying; the choice sits until the player gets to it. Requirements, all from
`design.md`:

- **No timer, and no affordance that could be mistaken for one.** No countdown, no progress ring, no
  "expires in", no decay animation. Nothing in it expires, and it must not read as though anything
  might.
- **It must not read as urgent.** It is a standing question, not an alarm. Red is wrong here unless
  the *content* is genuinely bad news; a waiting decision is closer to an unopened item in an in-tray
  than to a warning. Bureau has the vocabulary for this already — a card on cork or a docketed slip
  reads as filed, not as flashing.
- **Every choice ships a designed default**, so fast-forwarding past it or dismissing it resolves
  sensibly rather than blocking.
- **It is part of the save**, like everything else a player can be part-way through.
- **Open:** whether pending decisions live as cards in an existing panel, as a tray or docket the
  board grows, or as an inbox marker that opens the modal. This is the first real test of whether the
  8-panel grid can absorb a new system without navigation, so decide it with §3's census problem in
  view.

---

## 5. Presentation decisions and why

- **Create-once, update-in-place.** The DOM renders at 5Hz; elements are created on first reveal and
  mutated thereafter, never rebuilt. Visually: *nothing jumps*. Cards keep their position, panels keep
  their order, change is communicated by content rather than by layout motion. Any treatment that
  introduces reflow-on-update fights the engine and the feel. Corollary from experience: anything
  era-dependent must be *re-rendered*, never written once at creation, or a Bronze panel keeps a Stone
  name.
- **Reveal-then-sticky.** Anything once shown stays shown; a threshold-based reveal that un-revealed
  itself read as a bug in play and was fixed as one. The screen only accumulates — except at era
  boundaries, where retirement is explicit, narrated and celebrated in the era modal's "No longer
  needed" chips (struck through, because it is a thing crossed off a list rather than a thing offered).
- **Semantic color only.** Three values plus neutral, never ambience. The moment color goes decorative,
  the red-means-drain scan players rely on in the ledger is diluted.
- **One card grammar for everything buyable.** Players learn to read a buy card once, in the first
  minute, and that literacy carries through twelve eras. Units added a population cost line; nothing
  else changed. Variation between buildings, upgrades and units stays subordinate to the shared
  silhouette.
- **Words instead of meters for hidden values.** Standing is Hostile / Wary / Neutral / Friendly; wall
  damage is battered / in ruin; morale, when it exists, will be narrated states. The interface has
  exactly two kinds of quantity: **honest numbers** (resources, strengths, costs — always shown
  plainly) and **narrated states** (relationships, feelings — never numbered). Printing a narrated
  state as a bar is a design-law violation, not a styling choice.
- **Type glyphs beat borders for card taxonomy.** Tested in play: a dashed border distinguishing
  expedition cards from build cards read as ugly noise; a 12px glyph read instantly. Prefer small,
  semantically-anchored marks over container-level styling.
- **Empty states are sentences.** "Nothing queued." / "The Muster Ground stands ready." A panel with
  nothing in it still speaks in the game's voice and never collapses away — that empty named panel is a
  standing question the game has posed.
- **Tooltips carry refusal reasons.** Disabled controls explain themselves ("They remember your raids.
  They will not trade with you."). Any redesign of a disabled state must preserve a home for the
  *reason*.

### The modal register — changed by the pivot

**Shipped today:** the modal is the ceremony register. The game interrupts the player exactly never,
so the few moments staged in a modal land with disproportionate weight, and the standing guidance was
to *guard the modal's scarcity* — new features should earn one, not default to one. The game keeps
running underneath; only death stops anything.

**What changes.** That scarcity rule was reasoned from a premise that no longer holds. The modal was
rationed precisely *because* the game never interrupted; now that presence is the default and
decisions are a designed feature, the modal becomes a **primary verb surface** — decision events,
campaign muster, envoy. The scarcity guidance is **relaxed, not abolished**: ceremony still has to
mean something, and if every interaction opens a modal then the era transition stops being the
biggest moment in the game. The test shifts from "does this deserve an interruption?" to "is this a
*decision*, or is it a *reading*?" Decisions may take the modal freely. Readings still have to earn
it.

**Pending — phase 5: the ask/tell pause rule.**

> **Modals that ask something pause the game. Modals that tell you something don't.**

Campaign muster, caravan escort, decision events and destructive confirms all pause. Reference
material does not. **The default is to pause** — that failure mode is harmless — and Info explicitly
opts out. Implementation shape: a flag on `openModal()` defaulting to pause, with the pause released
on close, and it must compose correctly with a player-initiated pause (closing an asking modal must
not resume a game the player paused by hand).

**Pending — phase 5: modal treatments still owed.** The Info modal's styling is deliberately specific
to Info and is not a general modal style. Era transition and game over still need their own
treatments, and the decision modal will need a third.

---

## 6. Text surfaces and voice

Three registers coexist and should be visually distinguishable without being different languages.
They map onto the three typefaces, which is not a coincidence.

1. **Ledger / label register** — terse nouns and numbers: resource rows, card names, costs. *Space
   Grotesk for the words, Space Mono for every figure.*
2. **Description register** — one-line mechanical prose, now living in the tooltip: "Foragers gather
   +12% food."; adversary descriptions carrying real signal. Because it moved off the board it can
   afford to be more verbose than an inline line ever could.
3. **Chronicle register** — narrative past tense: "The battered walls of the River Kingdom finally give
   way." *Newsreader*, shared with modal leads, which is what makes a modal lead read as narration
   rather than as a dialog string.

Era-keyed vocabulary runs through all three — arrival lines, population nouns, panel titles, building
names all change as ages pass. **No string is safe to treat as permanent art.**

---

## 7. Pending, at a glance

| # | Phase | Change |
|---|---|---|
| 1 | 5 | Header re-weighted: pause and speed as transport controls, not housekeeping (§3) |
| 2 | 5 | Ask/tell modal pause rule; default pause, Info opts out (§5) |
| 3 | 5 | Modal treatments for era transition, game over, decisions (§5) |
| 4 | 7 | Decision card / tray — new component, no timer, designed default (§4.14) |
| 5 | 8+ | The map arc, below |

### The map's interaction pattern (shipped 6c, permanent)

**Hover previews; click opens details; the details are where every stat, every line of flavor and
every action for that place live.** Ruled by the user as the sustainable pattern all the way to the
node network — click a node, open node details, same grammar. Today: owned tiles carry the
allocation buttons (active assignment by border weight, never opacity) and an ink work-glyph on the
hex; seats carry March and Caravan, handing off to the muster and escort modals. This is the
beginning of the Expeditions panel dissolving into the map; the panel survives as a secondary
surface until phase 9.

### The open arc: the map

**`map.md` owns this; do not redesign the interface here.** The map is promoted from out-of-scope to
a designed arc (phase 8): a place-graph of pointy-top hexes, procedurally generated and seeded,
rendered as SVG geometry with a DOM overlay so everything stays hit-testable and inspectable.

The interface question it raises, recorded in `design.md`'s Open Questions: **does the map become the
centre of the interface, with the panels moved to the periphery?** Likely eventually, and explicitly
gated on having a map good enough to deserve it. Two consequences worth flagging now:

- **Until then, Bureau's 4×2 grid stands and is not in question.** Design against it.
- If the map does take the centre, the pillar "panels filling up is part of the fun" keeps its intent
  but loses its mechanism — the growth display becomes territory rather than a filling board. That is
  a design problem to solve then, not now.
- Separately open: **does Bureau survive the map?** Bureau is pure CSS with zero assets, which is part
  of why it shipped fast and reads cohesively. If commissioned art arrives, paper is either a
  placeholder to be replaced or the identity the art should be commissioned *in the style of* — very
  different briefs, and not answerable until the question above is.

Two smaller threads left open by the design pass: **later-era consolidation** beyond eight panels
(§3), and **mobile**, which was scoped to a concept sketch and deliberately not built (§1.6).

---

## 8. Screenshot index (`design-refs/`) — historical

**These capture the pre-Bureau functional wireframe**, not the shipped interface. They are kept as the
record of what the design pass was working from; the prototype it produced lives in `redesign/`, and
its reasoning in `redesign/DESIGN-NOTES.md`. Do not treat these as current.

| File | State it captures |
|---|---|
| `01-stone-opening.png` | First 30 seconds: the minimal two-panel unravel state |
| `02-stone-midgame.png` | Stone Age with jobs, construction, upgrades, and a live queue |
| `03-era-modal.png` | The Bronze Age transition modal |
| `04-iron-full-layout.png` | The maximal 8-panel Iron Age layout with expeditions underway |
| `05-campaign-modal.png` | Campaign muster modal: steppers, estimate, walls readout |
| `06-info-reference.png` | Info/Reference modal with era tabs |
| `07-game-over.png` | The game-over modal and fallen-state chrome |
