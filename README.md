# Idle Civ

**[Play it in your browser →](https://michaeldippold.github.io/idle-civ/)**

A civilization/city-builder with the graphics stripped out. No map, no rendered
units — just resources, people, and choices. Inspired by *A Dark Room* (start
with almost nothing) and Age of Empires-style economies (assign workers, feed
your people, build up), with idle mechanics filling the gap where the graphics
used to be: it keeps running while you're not looking.

The pitch in one line: **you start by foraging for food, and by the end you're
managing something like intergalactic trade — and the interface never stops
looking like paperwork.**

## Run it

Nothing to build or install. Open the link above, or clone and double-click
**`index.html`** — it runs straight from the filesystem with no server. Progress
auto-saves to your browser's local storage, and the game keeps simulating while
you're away.

## The loop

- You begin with **3 settlers** and a nearly empty board. Everyone **eats food**
  every second, so your first job is to forage — **run out and the settlement
  dies.**
- Assign settlers to gather **food**, **wood**, and **stone** with the steppers
  in Your People. Everyone eats whether they're working or not, so growth is a
  trade-off rather than a pure win.
- **Housing gates population.** Settlers arrive free on a timer while there's
  room, so the rhythm is: forage → grow → hit the housing cap → build → grow.
- **Building takes time.** Costs are paid when you click, then the item sits in
  a **queue** — only the front one progresses. Costs escalate per building type,
  including ones still queued.
- **Storage is capped.** Surplus past the cap is *lost*, not stalled. Granary,
  Woodshed and Stone Yard raise the ceilings.
- **The world acts on you.** Sickness, raids, windfalls and traders all resolve
  on their own schedule — nothing ever waits for you to be watching, and the
  **Chronicle** is how you find out what happened while you were gone.
- **Ages turn.** Stone → Bronze → Iron, each adding new resources, buildings and
  mechanics: bronze smelting, unit composition, sieges, and expeditions against
  neighbouring peoples.

## The interface

The board is **whole from the first frame** — every panel the current age can
fill is on screen, named, empty and waiting. What unravels is what goes *inside*
them. The visual direction is **Bureau**: dense administrative paper, because the
game is a spreadsheet and would rather be proud of that than disguise it. Each
column gets its own stock — cork for people, graph paper for construction, dot
grid for progress, a legal pad for the Chronicle.

Two rules run through all of it: **opacity is never used to convey state** (a
card you can't afford stays fully readable, because reading it is how you plan),
and **descriptions live on hover**, along with the reason a purchase is refused.

There's a **speed control** in the header (1× up to 12×) — everything resolves
normally, just sooner.

## Tuning

Balance lives in the `CONFIG` block and the era manifests at the top of
**`game.js`** — gather rates, food upkeep, growth pacing, storage caps, cost
curves, build times. Change a number, refresh the page.

## Tests

```bash
node harness.js
```

A headless Node harness (420 checks) that boots `game.js` outside a browser and
exercises the simulation directly. No framework, no dependencies.

## Docs

| File | What's in it |
|---|---|
| `design.md` | Game design: pillars, systems, the age list, settled questions |
| `tech.md` | Architecture: the simulation model, manifests, rendering, layout |
| `todo.md` | Working list, session status, and a full "What's Working" changelog |
| `interface-brief.md` | The brief the interface redesign was commissioned from |
| `redesign/` | The design pass that produced Bureau — prototype and reasoning |
