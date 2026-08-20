# Idle Civ — Interface Decisions

Notes from the redesign session. Written for whoever implements this next; the reasoning matters more than the hex codes.

## Direction

**Bureau.** Dense administrative paper — ledger sheets, ink tab headers, monospace numerals, hard 1px borders, no rounded corners, no shadows except the modal's hard offset. Two directions were rejected: an airy "Field Notes" layout (read as a retail product page, too much whitespace for a spreadsheet game) and a dark "Basalt" register (handsome but the evening register fought the paper metaphor). A chalkboard/post-it variant was also built and dropped — pastel panels plus semantic red/green overloaded the color channel.

The game is a spreadsheet. The design should be proud of that rather than disguise it.

## Locked principles

1. **Opacity is never used, for anything, ever.** It was previously doing double duty for "unaffordable", "queued", and "already owned", and players read all three as "you can't have this". Faded text is also just harder to read. State is now carried by border weight, border color, glyph color, and status words in the semantic palette.
2. **Cards on patterned paper get an opaque fill.** Any panel with a graph or dot ruling must have its interior cards filled solid (white, or `#fffdf7` for job rows) so the pattern never runs behind text. This includes inactive tabs.
3. **Text wraps; it never truncates.** No ellipsis, no clipping on anything decision-critical — costs, item names, rates. Rows wrap to a second line instead. Cost text especially must never be cut: a hidden second resource means the player can't see why a purchase is refused.
4. **Hover is the only place descriptions live.** Confirmed against Cookie Clicker. Inline descriptions clog the board once eight panels are open, and hover means descriptions can be *more* verbose, not less. The hover box also carries the refusal reason ("Short 24 wood.") — one place to look when something won't buy.
5. **Anything outside a panel must coordinate with the background.** The desk changes per era (and may become a photo or texture later), so header chrome can never assume a light desk.
6. **Color stays a three-value semantic channel.** Red `#a33420` = blocked or negative. Green `#3f6d2c` = working, gained, owned. Amber `#8a6a1e` = queued/in progress. Nothing else gets to use these.

## Layout

Four columns, two rows. Column widths `0.86fr 1fr 1fr 1.24fr` — People is the narrowest (it's mostly steppers), Chronicle the widest (it's prose).

Panels unravel as thresholds are crossed, and **action panels span their full column while their state partner is still hidden**, so the early game never shows an empty cell. People spans both rows until Training appears; Construction spans both until Settlement appears; and so on.

Panel paper is the same stock with different ruling, which is what makes the columns distinguishable without color:

| Panel | Ruling |
|---|---|
| Your People, Training | plain (this is the most important panel; it gets no texture) |
| Settlement, Construction | graph paper, 16px |
| Underway, Upgrades | dot grid, 14px |
| Chronicle | legal pad — cream `#fbf7e2`, 28px rules, red margin rule |
| Info modal | graph paper, boxed items, two columns per section |

The Chronicle's legal-pad treatment was the favorite element of the redesign, which is why the ruling idea got extended to the other panels rather than kept unique.

## Specific decisions

**Population moved into the resource ledger.** `POP 3/3 +0.02/s`, with idle count appended in red when above zero. Population *is* a resource with a cap and a rate, so it belongs with the others, and the red-at-cap value already communicates the blocker — the old "Housing is full" sentence was deleted as redundant. Idle is red because idle labor is a problem the player should fix.

**Era badge.** Filled plate with a material dot, in era colors — slate, bronze, iron-blue. It's the main marker of progress and deserved more than bracketed text. Because the desk is also era-colored, the badge carries a thin bone ring on dark desks so the plate can never merge into the background.

**Desk changes per era.** Stone `#cfcec6`, Bronze `#553a20`, Iron `#24272b`. Deliberately kept materially darker or lighter than the badge of the same era. The long-term idea is that later eras can go further (blueprint, steel, whatever) — Cookie Clicker's habit of dressing up as you progress, but restrained, since this is a game about tables.

**Header chrome is one treatment on every desk:** bone border, ink fill, bone text — three layers, so it reads on light desks, dark desks, and eventually photos. Reset uses the same structure in brick. The clock is unstyled text at title color, 14px bold, no frame — it's a readout, not a control.

**Steppers are one segmented instrument.** A single bordered group, `−│count│+`, uniform 24px cells with internal dividers. Previously two loose buttons flanked a floating number and the disabled one lost its border, so the two halves looked like different kinds of control. Now borders never change; only glyph color dims when an action is unavailable.

**Job rows are two lines** — name on its own line, rate and stepper beneath. At ~180px column width there is no honest way to fit name + rate + stepper on one line, and the name is the primary label of the control.

**Upgrades have Available / Owned tabs** with counts. Owned upgrades are filtered out by default; previously they sat mixed in at reduced opacity and read as unaffordable. On the Owned tab they render at full contrast with a green border.

**Unit and structure tiles** are icon + count side by side, no label. The old stacked icon/name/number arrangement read as a fraction. Names live on hover — everything except the first three settlers was built deliberately, so the player has context. Fill is a pale tint by category, all lighter than the legal pad: shelter green `#eef5ef`, storage sand `#f7f2e6`, work violet `#f2eff8`, care rose `#f9efef`, people blue `#eef3f9`.

**Icons are redrawn** as 1.6px-stroke line glyphs on a 24px grid, one per structure and unit, legible at 21px. Legibility at a glance was the brief.

**Queue items** show no "Raising:" prefix — the filled bar and "~24s left" already identify the active item, and the prefix was eating the name's space.

## Type

- **Space Grotesk** — UI, labels, names
- **Space Mono** — every number, cost, rate and clock; all tabular
- **Newsreader** — Chronicle prose and modal lead only

Minimums after the legibility pass: card names 13px, costs and rates 11px, ledger values 14.5px, tile counts 16px, Chronicle 13/14px, tooltip body 13px, panel headers 11px at .15em. The grey `#9a917c` was retired for `#6a6354` / `#7a7362` on anything carrying meaning — it only survives on the `/50` cap denominators.

## Palette

```
ink            #191710   borders, text, header plates
paper          #f7f4ea   panel fill
card           #ffffff   cards on patterned panels
job row        #fffdf7
legal pad      #fbf7e2   Chronicle sheet
ink light      #ece7d9   text on ink
text secondary #5f584a
text tertiary  #6a6354
danger         #a33420   blocked, negative, at-cap
danger deep    #7d2718   Reset plate
good           #3f6d2c   positive rate, owned
queued         #8a6a1e
```

## Open threads

- **Mobile** was scoped to a concept sketch and not built. The 4-column grid should probably become a single column with the ledger pinned and panels as a tab strip; Chronicle likely wants to be a drawer.
- **Corkboard** has no home yet. If a future Expeditions panel exists — cards about other peoples, pinned notes — that's where it belongs.
- **Later-era consolidation.** Beyond eight panels the grid needs menus, tabs, or drawers. Not solved.
- **Info modal styling is deliberately specific to Info** and not a general modal style. Era transition and game over still need their own treatment.
