# Idle Civ — Interface Design Brief

**What this document is.** An input for visual/interface design work. It describes the game's
interface as a *system* — the panels, the reusable components, the presentation rules, and the
reasoning behind them — so that design exploration can start from an accurate mental model.
It deliberately does **not** prescribe an aesthetic. Everything currently on screen should be
read as a **functional wireframe**: the layout, hierarchy, and component grammar are proven in
play; the visual treatment is entirely open. (`design.md` covers game design; `tech.md` covers
architecture; screenshots of the current wireframe live in `design-refs/`.)

---

## 1. Identity constraints (the non-negotiables)

These are game-design facts the interface must express, not stylistic preferences:

1. **This is a numbers-and-menus game.** No map, no rendered units, no real time interaction besides reaction to the interface, the interface is panels of
   numbers, labels, form fields, and prose. The founding identity test is: *the whole game
   could be drawn in black pen on ruled paper.* Treat that as a metaphor for restraint and
   legibility — boxes, rules, text, small glyphs — not as a literal art direction.  

2. **Text is a game mechanic.** By canonical design law, *flavor is load-bearing*: an
   adversary's description is how the player reads its strength; reputation and wall damage
   are narrated in words, never shown as meters; event lines in the Chronicle are the actual
   record of play. The reading experience — type, measure, rhythm, emphasis — is therefore a
   first-class design surface, not decoration around one.

3. **The interface unravels.** Nothing is shown before it is earned. Panels, rows, and cards
   appear the first time their content becomes relevant and then stay forever (reveals are
   sticky — nothing flickers away when a threshold dips). New panels appearing is part of the
   fun; the screen's growth *is* the progression display. The single sanctioned removal moment
   is an era transition, when retired content is purged in one pass.

4. **The UI never demands presence.** No catch windows: every event, expedition, and hazard
   resolves itself with nobody in the room, and the Chronicle catches the player up. Nothing
   on screen should read as "act now or lose" — no alarm states, no decaying meters, no
   urgency affordances. Decisions happen on the player's schedule.

5. **Numbers stay small forever.** Population re-denominates (settler → family → holdfast →
   … → star system) rather than inflating, and resources cap in the hundreds. Layouts never
   need to accommodate 1.2M-style compaction. Steppers (+/− one at a time) remain viable to
   the end of the game.

6. **Widescreen desktop is the primary format** — but this is a browser game, and phone and
   tablet sizes deserve real consideration in the design (see §6). The current wireframe's
   approach — fixed viewport, page never scrolls, every panel scrolls internally under a
   fixed header — is how the desktop layout works today, not a mandate for every form factor.

---

## 2. The layout

A fixed header, a resource ledger strip, and a 2×4 panel grid:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Idle Civ [Era Badge]                    clock  [Info][Pause][Save][Reset]
├──────────────────────────────────────────────────────────────────────┤
│ Food 218/450 +0.24/s   Wood …   Stone …   Iron …   Steel …   Gold …  │  ← ledger
├────────────────┬────────────────┬────────────────┬───────────────────┤
│ YOUR PEOPLE    │ TOWN           │ UNDERWAY       │ CHRONICLE         │  row 1
│ person tiles,  │ building tiles │ progress cards │ newest-first      │
│ idle/housing,  │ (icon+count)   │ (builds +      │ event log,        │
│ growth line,   │                │  expeditions)  │ severity-colored  │
│ job steppers   │                │                │                   │
├────────────────┼────────────────┼────────────────┤ (spans both rows  │
│ TRAINING       │ CONSTRUCTION   │ UPGRADES       │  until Expeditions│
│ unit buy cards │ building buy   │ one-time buy   │  exists)          │
│                │ cards          │ cards, owned   ├───────────────────┤
│                │                │ sink to bottom │ EXPEDITIONS       │  row 2
│                │                │                │ adversary cards   │
└────────────────┴────────────────┴────────────────┴───────────────────┘
```

**Column logic:** each column pairs a *state* panel (top: what you have) with its *action*
panel (bottom: how you get more of it). People ↔ Training, Town ↔ Construction, Underway ↔
Upgrades (loosely: progress ↔ investments), Chronicle ↔ Expeditions (the world's story ↔ the
world's counterparties).

**Dynamic spans.** A top panel expands to fill its whole column while its partner has nothing
revealed yet — an intentional tall panel instead of an unexplained blank cell. The Chronicle
runs double-height as a luxury until the Muster Ground is built, then yields its lower half to
Expeditions ("the world crowding in on your story").

**Panels rename per era.** Settlement → Village → Town; Build Queue → Underway (once it tracks
expeditions, not just builds). Era-varying titles are data, not exceptions; future ages will
keep renaming. Design should assume any panel title is one to three words, changeable.

**Panel census** (current maximum: 8 + header + ledger): Your People, Town, Underway,
Chronicle, Training, Construction, Upgrades, Expeditions. **The grid is full, and its author
doubts it scales** — roughly nine more eras of systems are coming (laws, morale, religion,
science are already on the ideation board). Widening-age *consolidation* (merging or retiring
systems) is a real game-design lever that will help, but it is no longer assumed sufficient:
whether this interface grows navigation — menus, tabs, drawers, whatever earns its place — is
an open question Design is explicitly invited to answer (see §6; "there's a reason most civ
games have menus"). The one behavior worth protecting through any structure change is the
unravel: new capability announcing itself by *appearing*.

---

## 3. Component inventory

Everything on screen is built from about a dozen reusable pieces. A redesign that restyles
these twelve components restyles the entire game — including all future eras, which are
authored as data against this same grammar.

1. **Panel shell** — title header (fixed) + internally scrolling body. Every panel. Titles
   are era-data.
2. **Ledger row** — resource name, `value / cap`, signed rate. Rate carries the game's core
   semantic coloring: negative = red (a draining pile scans as a problem at a glance),
   positive = green. Value highlights when at cap (storage full = waste). Rows reveal-gate
   individually.
3. **Stepper row** — label · contextual readout · `− count +`. Used for job assignment (Your
   People) and for mustering forces (campaign/caravan modals). The readout differs by context
   (per-job output rate; "N home" when mustering). Small enough to click quickly many times.
4. **Buy card** — the workhorse. Name + right-aligned status (owned count / "owned" /
   "queued" / "Maxed"), one-line description, cost line (each resource highlighted if
   unaffordable), build time. Identical grammar for buildings (repeatable, escalating cost),
   upgrades (one-time; owned cards sink to the bottom of their list), and units (adds a
   population cost). Disabled state must remain readable — most cards spend most of their
   life unaffordable, and reading them is how players plan.
5. **Holding tile** — small icon + name + count. The "what you own" glance view for buildings
   (Town) and person-types (Your People). Names re-render per era (Hut → Stone House →
   Longhouse) while the tile and icon persist.
6. **Progress card** — tiny type glyph (hammer = build, sword = campaign, coins = caravan),
   label, percent, progress bar, ETA line, and — for builds only — a cancel ×. Expeditions
   are deliberately cancel-less (no catch windows) and that absence is meaningful. Lives in
   Underway; expeditions sort above builds.
7. **Adversary card** — name, `disposition · standing-word` readout, description prose (the
   load-bearing flavor: strength, fighting style, fortification tier all live here), a
   "known stock" line, narrated wall-damage state ("Their walls are battered."), and one or
   two action buttons (March / Caravan) whose disabled states carry tooltip reasons.
8. **Chronicle entry** — one line of prose, newest at top, no timestamps. Severity is a
   three-color semantic system (good / danger / milestone) on otherwise-neutral text; the
   newest entry is slightly emphasized so "what just happened" is always findable without
   reading. The Chronicle is the AFK player's catch-up mechanism and the game's memory —
   it deserves typographic care.
9. **Modal** — single, centered, dimmed backdrop, closable by ×, backdrop, or Esc; the game
   keeps running underneath (only death pauses anything). Five uses today: era transition
   (the biggest moment in the game), campaign muster, caravan escort, Info reference
   (era-tabbed), reset confirm, game over. Modal = ceremony: it marks decisions and moments
   that deserve weight, precisely because the rest of the UI never interrupts.
10. **Status line** — a single small line of prose with one emphasized value ("Next holdfast
    joins in 45s.", "A campaign is in the field."). Used for growth, expedition state, and
    empty-states. Prefer a sentence over a widget wherever a sentence works.
11. **Icon glyphs** — stroke-only line doodles, one per building/person/queue-type, drawn
    in `currentColor` so they inherit text color. They are identifiers, not illustrations:
    an icon belongs to an *id* and persists across era renames.
12. **Button row** — header verbs (Info/Pause/Save/Reset) and modal actions. One "danger"
    variant exists (destructive/irreversible: reset, march).

---

## 4. Presentation decisions and why they were made

These are the decisions a redesign should understand before changing:

- **Create-once, update-in-place.** The DOM renders at 5Hz; elements are created on first
  reveal and mutated thereafter, never rebuilt. Visually this means *nothing jumps*: cards
  keep their position, panels keep their order, and change is communicated by content, not
  by layout motion. Any design that introduces reflow-on-update fights the engine and the
  feel.
- **Reveal-then-sticky.** Anything once shown stays shown (a threshold-based reveal that
  un-revealed itself read as a bug in play, and was fixed as one). The screen only ever
  accumulates — except at era boundaries, where retirement is explicit, narrated, and
  celebrated in the era modal ("No longer needed").
- **Semantic color only.** Color is a three-value information channel (good / problem /
  milestone) plus neutral. It is never decoration. A redesign may choose any palette —
  including non-monochrome — but every color on screen should remain *meaningful*; the
  moment color becomes ambient, the red-means-drain scan (which players rely on in the
  ledger) is diluted.
- **One card grammar for everything buyable.** Players learn to read a buy card once, in the
  first minute, and that literacy carries through twelve eras of content. New mechanics reuse
  the grammar (units added a population cost line; nothing else changed). Design variation
  between buildings/upgrades/units should stay subordinate to the shared silhouette.
- **Words instead of meters for hidden values.** Standing is "Hostile / Wary / Neutral /
  Friendly"; wall damage is "battered / in ruin"; morale (future) will be narrated states.
  Printing these as numbers or bars is a design-law violation, not a styling choice. The
  interface has exactly two kinds of quantities: honest numbers (resources, strengths,
  costs — always shown plainly) and narrated states (relationships, feelings — never
  numbered).
- **The modal is the ceremony register.** The game interrupts the player exactly never, so
  the few moments staged in a modal (an age turning, a column mustering to march) land with
  disproportionate weight. Guard that scarcity: new features should earn a modal, not
  default to one.
- **Tooltips carry refusal reasons.** Disabled buttons explain themselves on hover ("They
  remember your raids. They will not trade with you."). Any redesign of disabled states
  should preserve a home for the *reason*.
- **Type glyphs beat borders for card taxonomy.** Tested in play: distinguishing expedition
  cards from build cards with a dashed border read as ugly noise; a 12px glyph read
  instantly. Prefer small, semantically-anchored marks over container-level styling changes.
- **Empty states are sentences.** "Nothing queued." / "The Muster Ground stands ready." —
  a panel with nothing in it still speaks in the game's voice, and never collapses away.

---

## 5. Text surfaces and voice

Three registers coexist and should be visually distinguishable without being different
languages:

1. **Ledger/label register** — terse nouns and numbers (resource rows, card names, costs).
2. **Description register** — one-line mechanical prose on cards ("Foragers gather +12%
   food."; adversary descriptions carrying real signal).
3. **Chronicle register** — narrative past-tense prose ("The battered walls of the River
   Kingdom finally give way."). Era-keyed vocabulary: arrival lines, population nouns, and
   panel titles all change as ages pass, so no string is safe to treat as permanent art.

---

## 6. What is fixed vs. free for a redesign

I initially wanted to keep the wireframe in place and give you all of the color choices to make, but I think since you are already proven to produce better designs than I do, I want you to consider my design decisions so far, but feel free to innovate. I am already stressed that this interface will not cleanly support future panels that could be implemented. The modal feature makes it free for a while but it may not be forever. There's a reason most civ games have menus. 

As this is a BROWSER game, I would also like a little thought into phone and tablet size interfaces. Widescreen desktop should always be the primary format though. 

---

## 7. Screenshot index (`design-refs/`)

| File | State it captures |
|---|---|
| `01-stone-opening.png` | First 30 seconds: the minimal two-panel unravel state |
| `02-stone-midgame.png` | Stone Age with jobs, construction, upgrades, and a live queue |
| `03-era-modal.png` | The Bronze Age transition modal — the game's biggest recurring moment |
| `04-iron-full-layout.png` | The maximal 8-panel Iron Age layout with expeditions underway |
| `05-campaign-modal.png` | Campaign muster modal: steppers, estimate, walls readout |
| `06-info-reference.png` | Info/Reference modal with era tabs |
| `07-game-over.png` | The game-over modal and fallen-state chrome |
