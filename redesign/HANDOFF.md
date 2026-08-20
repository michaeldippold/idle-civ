# Idle Civ — Interface Handoff

## What's in here

| File | What it is |
|---|---|
| `DESIGN-NOTES.md` | Decisions and reasoning. Read this first. |
| `Idle Civ Bureau.dc.html` | The prototype. Opens directly in a browser — double-click it. Contains the full interface plus a working simulation (resource ticks, job assignment, build queue, population growth, panel unravelling). |
| `Idle Civ Redesign.dc.html` | The three original directions plus the chalkboard experiment. History, not a target. |
| `support.js` | Runtime the two `.dc.html` files need. Keep it beside them. |
| `github.md` | Records the source repo association. |

## How to reuse it

The prototype is one file: an HTML template at the top, a plain JavaScript class below it. Neither needs a build step, but neither is a drop-in for your existing codebase as-is — the template uses a small render syntax (`{{ value }}` holes, `<sc-for>`, `<sc-if>`) that belongs to the prototyping runtime, not to your app.

What transfers cleanly:

**All the styling.** Every style is inline on the element that uses it, with literal values. Copy the markup for a panel and you have its exact appearance — no stylesheet to reconcile, no tokens to resolve. Search for a panel's header text to find its block.

**The icon set.** The `ICONS` object at the top of the script block is ten SVG path strings on a 24px grid, drawn at 1.6px stroke with `currentColor`. Lift the object wholesale.

**The layout logic.** The `span` object at the bottom of `renderVals()` is the panel-unravelling rule — which panels are visible and which stretch to fill their column while their partner is hidden. That logic is worth porting directly; it's what keeps the early game from showing empty cells.

**The state colors.** `card()` returns `border`, `fill`, and `statusColor` per card; `renderVals()` does the same for ledger rows, queue items, and steppers. These are the no-opacity rules in code form.

What to reimplement in your own idiom: the `{{ }}` template holes, `<sc-for>` loops, and `<sc-if>` blocks. Everything inside them is ordinary HTML and inline CSS.

## Reading the prototype

Numbers in the simulation are placeholders tuned to make the interface legible in a minute of play — costs, rates, growth timing and multipliers were not balanced. Your real values should win any disagreement.

The Tweaks panel in the prototype exposes four switches: `desk` (per-era, mahogany, ash, ink), `eraBadge` (stone/bronze/iron — also drives the desk when set to per-era), `chronicleTint`, and `speed` (up to 12× so you can watch panels unravel quickly).
