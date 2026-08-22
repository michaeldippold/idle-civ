# Idle Civ

**[Play it in your browser →](https://michaeldippold.github.io/idle-civ/)**

> **The name is wrong and is being changed.** As of 2026-08-22 this stopped being an idle game —
> see *Where this is going*, below, and `design.md` → *Time, Presence & Pause*. Renaming waits
> until the pivot is playable.

A civilization game with the graphics stripped out. No map, no rendered units — just resources,
people, and choices. Inspired by *Civilization* (decisions with real opportunity cost), *Crusader
Kings* (a real-time clock you pause, and a world of neighbours you fight, trade with, or win over),
and *A Dark Room* (start with almost nothing; complexity is earned, never dumped on you).

The pitch in one line: **you start by foraging for food, and by the end you're deciding the fate of
star systems — and the interface never stops looking like paperwork.**

## Run it

Nothing to build or install. Open the link above, or clone and double-click **`index.html`** — it
runs straight from the filesystem with no server. Progress auto-saves to your browser's local
storage.

*(The no-server property is being retired: the codebase is moving to ES modules, which browsers
only load over http. A one-line static server or the GitHub Pages link covers it. See `todo.md`
phase 1.)*

## The loop

- You begin with **3 settlers** and a nearly empty board. Everyone **eats food** every second, so
  your first job is to forage — **run out and the settlement dies.**
- Assign settlers to gather **food**, **wood**, and **stone** with the steppers in Your People.
  Everyone eats whether they're working or not, so growth is a trade-off rather than a pure win.
- **Housing gates population** in the early ages. Settlers arrive free on a timer while there's
  room, so the rhythm is: forage → grow → hit the cap → build → grow.
- **Building takes time.** Costs are paid when you click, then the item sits in a **queue** — only
  the front one progresses. Costs escalate per building type, including ones still queued.
- **Storage is capped.** Surplus past the cap is *lost*, not stalled.
- **The world acts on you.** Sickness, raids, windfalls and traders resolve on their own schedule,
  and the **Chronicle** is the settlement's memory of it.
- **From the Iron Age the loop turns outward.** Housing and free growth retire; you grow by
  **conquest or conversion**. Neighbouring peoples become real counterparties you can campaign
  against, trade with, or eventually win over — and expeditions are where the game's best decisions
  live.
- **Ages turn.** Stone → Bronze → Iron, each adding new resources, buildings and mechanics: bronze
  smelting, unit composition, sieges, and expeditions.

## The interface

The board is **whole from the first frame** — every panel the current age can fill is on screen,
named, empty and waiting. What unravels is what goes *inside* them. The visual direction is
**Bureau**: dense administrative paper, because the game is a spreadsheet and would rather be proud
of that than disguise it. Each column gets its own stock — cork for people, graph paper for
construction, dot grid for progress, a legal pad for the Chronicle.

Two rules run through all of it: **opacity is never used to convey state** (a card you can't afford
stays fully readable, because reading it is how you plan), and **descriptions live on hover**, along
with the reason a purchase is refused.

## Where this is going

The project pivoted on 2026-08-22 from *idle game* to *real-time-with-pause management game*. The
old contract was **the game never needs you**, which banned every interesting decision. The new one
is **the game never punishes you for leaving** — nothing expires, nothing is missed, and you can
stop any time; but the game is meant to be watched.

Concretely, in progress:

- Offline progress removed; the clock runs only while you're looking at it.
- **Pause and fast-forward promoted to real player controls.**
- **Events that present a choice** — which wait patiently, never expire, and always carry a designed
  default.
- A seeded simulation, so any run is exactly reproducible from its number.
- A **hex map** of places you can hold, take, or win over, procedurally generated per run from a
  hand-authored pool of neighbours.

`todo.md` has the phase plan.

## Tuning

Balance lives in the `CONFIG` block and the era manifests at the top of **`game.js`** — gather rates,
food upkeep, growth pacing, storage caps, cost curves, build times. Change a number, refresh the
page.

## Tests

```bash
node harness.js
```

A headless Node harness (422 checks) that boots `game.js` outside a browser and exercises the
simulation directly. No framework, no dependencies.

## Docs

| File | What's in it |
|---|---|
| `design.md` | Game design canon: pillars, systems, the age list, settled questions |
| `tech.md` | Architecture: simulation model, manifests, rendering, what's shipped vs pending |
| `map.md` | The map arc: place-graph model, hexes, procedural generation, art strategy |
| `interface.md` | The interface system: layout, components, presentation rules, Bureau |
| `todo.md` | **Start here.** Status, the phase plan, and what is actually built |
| `CHANGELOG.md` | The shipped-feature record, newest first |
| `redesign/` | The design pass that produced Bureau — prototype and reasoning |
