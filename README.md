# Idle Civ

**[Play it in your browser →](https://michaeldippold.github.io/idle-civ/)**

> **The name is wrong and is being changed.** As of 2026-08-22 this stopped being an idle game —
> see *Where this is going*, below, and `design.md` → *Time, Presence & Pause*. Renaming waits
> until the pivot is playable.

A civilization game as a **digital tabletop**: a lit 3D hex board in the browser — depth,
shadows, pieces on a board, bright warm colors — with a numbers-and-choices game underneath and no
rendered units marching around. Inspired by *Civilization* (decisions with real opportunity cost), *Crusader
Kings* (a real-time clock you pause, and a world of neighbours you fight, trade with, or win over),
and *A Dark Room* (start with almost nothing; complexity is earned, never dumped on you).

The pitch in one line: **you start by foraging for food, and by the end you're deciding the fate of
star systems — a civilization board game, played on a living digital tabletop.**

## Run it

Nothing to build or install — but the code is ES modules now, which browsers only load over http,
so play the link above or serve a clone with any static server (`npx http-server . -p 8123 -c-1`)
and open <http://localhost:8123>. Progress auto-saves to your browser's local storage.

## The loop

> **This describes what currently RUNS, and the first half of it is being replaced.** As of
> 2026-08-23 the economy is being reworked so that production runs on hexes from the Stone Age and
> population lives on the map rather than in a global pool — steppers, jobs and housing all retire.
> See `design.md` → *Population Lives Somewhere*. Kept accurate to the shipped game until that
> lands, because a README that describes an intention is worse than one that is merely out of date.

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

The identity is **the digital tabletop** (`design.md`, Open Question 3 — resolved): the world is
a lit 3D hex diorama — a board game come to life, bright and warm, that you can spin, pitch and
zoom like a plate — with the game's panels floating over it. A working spike of the renderer is
merged (`spike3d/`); porting the live map onto it is the next build phase. Comparisons to a
physical board game are invited on purpose.

The board is **whole from the first frame** — every panel the current age can fill is on screen,
named, empty and waiting; what unravels is what goes *inside* them. The panels currently wear
**Bureau**, the interim skin from the panel-game era, until the tabletop reskin. Two of its laws
are permanent regardless of skin: **opacity is never used to convey state** (a card you can't
afford stays fully readable, because reading it is how you plan), and **descriptions live on
hover**, along with the reason a purchase is refused.

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
  hand-authored pool of neighbours — shipped, and being ported from its SVG stage onto the 3D
  diorama (`todo.md`, Phase 10).

`todo.md` has the phase plan.

## Tuning

Balance lives in **`src/core/config.js`** (`CONFIG`: gather rates, food upkeep, growth pacing,
storage caps, cost curves, build times) and the era manifests in **`src/content/`** (`stone.js`
plus the `bronze.js`/`iron.js` deltas). Change a number, refresh the page.

## Tests

```bash
node harness.js
```

A headless Node harness (490 checks) that imports the game's modules directly — no browser, no
framework, no dependencies — and exercises the simulation through its real exports.

## Docs

| File | What's in it |
|---|---|
| `design.md` | Game design canon: pillars, systems, the age list, settled questions |
| `tech.md` | Architecture: simulation model, manifests, rendering, what's shipped vs pending |
| `map.md` | The map arc: place-graph model, hexes, procedural generation, art strategy |
| `interface.md` | The interface system: layout, components, presentation rules, the interim Bureau skin |
| `todo.md` | **Start here.** Status, the phase plan, and what is actually built |
| `CHANGELOG.md` | The shipped-feature record, newest first |
| `redesign/` | The design pass that produced Bureau — prototype and reasoning |
