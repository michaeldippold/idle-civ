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

*(Accurate to the shipped game as of 2026-08-25. The engine rework and the map arc both landed;
what follows is what actually runs.)*

- **Your people live on the ground they work.** You begin holding three hexes — your seat and two
  beside it — on a board whose edges you cannot see. Population is not a pool you spend; it is a
  number that lives *on a hex*, grows toward what that terrain can carry, and cannot move.
- **Turn each hex to one thing.** Every ground works every resource, at rates the terrain sets:
  plains favour food, forest timber, hills stone and ore. Output is people x per-capita rate, so a
  hex matters in proportion to how many live there. Choosing the suboptimal route on purpose is a
  real option and sometimes the right one.
- **Everyone eats.** Empty the larder and a **famine** drains your dominion from the frontier
  inward, hex by hex, toward the seat. The land stays yours and rekindles when food returns; the run
  ends only if the seat itself empties.
- **Expansion is a claim you pay for.** Settling adjacent land costs food, timber, stone and — from
  Bronze on — the age's signature metal, escalating with every claim and scaling with distance from
  the ground you already hold. Each age also caps how much land it can govern at all.
- **Building takes time.** Costs are paid when you click, then the item sits in a **queue** where
  only the front one progresses. Costs escalate per building type, including ones still queued.
- **Storage is capped** until Iron retires the granaries. Surplus past the cap is *lost*.
- **The world acts on you, and it acts somewhere.** Sickness and raids strike a *specific hex* and
  take people from it; the **Chronicle** is the settlement's memory of all of it.
- **You are not alone, from the first minute.** Neighbouring camps and peoples sit on the board from
  the Stone Age — visible once you have charted their ground, impossible to settle, and impossible to
  touch, because nobody in a stone age can raise a column. They are the same peoples in every age;
  what changes is what they have grown into.
- **From Bronze the loop turns outward.** The age that hands you bronze spears lets you carry them
  somewhere. March on a steading and win, and it swears fealty — one more holdfast under your banner.
  An army eats in proportion to its size and the distance it walks, so *how many go* is the
  decision, not a cap.
- **From Iron it turns outward fully:** campaigns against major powers, sieges against real walls,
  caravans and trade, and conquest as a way to grow.
- **Ages turn.** Stone -> Bronze -> Iron, each adding resources, buildings and mechanics — and each
  re-dressing the same board and the same neighbours rather than replacing them.

## The interface

The identity is **the digital tabletop** (`design.md`, Open Question 3 — resolved): the world is
a lit 3D hex diorama — a board game come to life, bright and warm, that you can spin, pitch and
zoom like a plate — with the game's panels floating over it. **This is shipped, not planned:**
the live map runs on three.js with real lighting, ambient occlusion and per-terrain props, on an
authored continent generated fresh each run. The SVG stage survives only as `?map=2d`, a debug
surface. Comparisons to a physical board game are invited on purpose.

*(The 4x2 panel grid described in older docs is gone: the flip on 2026-08-22 made the map a
full-bleed stage with floating panels over it, and the Expeditions panel was deleted outright — every
outward verb now lives on the selected tile.)*

The board is **whole from the first frame** — every panel the current age can fill is on screen,
named, empty and waiting; what unravels is what goes *inside* them. The panels currently wear
**Bureau**, the interim skin from the panel-game era; the tabletop reskin is queued (`todo.md`). Two of its laws
are permanent regardless of skin: **opacity is never used to convey state** (a card you can't
afford stays fully readable, because reading it is how you plan), and **descriptions live on
hover**, along with the reason a purchase is refused.

## Where this is going

The project pivoted on 2026-08-22 from *idle game* to *real-time-with-pause management game*. The
old contract was **the game never needs you**, which banned every interesting decision. The new one
is **the game never punishes you for leaving** — nothing expires, nothing is missed, and you can
stop any time; but the game is meant to be watched.

**The mechanical half of that pivot is shipped.** Offline progress is gone and the clock runs only
while you're looking at it; pause and fast-forward are real player controls on real keys; the
simulation is seeded, so a run is exactly reproducible from its number; and the **hex map** — places
you can hold, take, or win over, generated per run from hand-authored continents and a hand-authored
pool of neighbours — is live on the 3D board.

**What the pivot unlocked and has not spent yet is the decision queue** (`todo.md`, phase 7): events
that present a choice, wait patiently, never expire, and always carry a designed default. It is held
deliberately rather than blocked — a choice can only wait for free once the clock stops when you look
away, so the feature had to come second.

`todo.md` has the working order; its START HERE block is the authority on what happens next.

## Tuning

Balance lives in two places, and which one you want depends on whether the number is a **law** or a
**price**.

- **`src/core/config.js`** holds the game-long laws — the ones with no era and no owner: the
  per-capita gather rate and food upkeep, growth pacing (`popGrowthRate`), the famine's exchange rate
  (`starveCost`), army capacity per hex, claim-cost escalation (`claimScale`), global build pace,
  and the conflict and campaign dials.
- **The era manifests in `src/content/`** (`stone.js` plus the `bronze.js`/`iron.js` deltas) hold
  everything that is priced *per age*: each building's own cost and `scale` factor, its `buildTime`,
  per-resource storage caps, the per-terrain works table and `popCaps`, `dominionCap`, and the claim
  price. A cost that should differ between ages lives here, never in `CONFIG`.

Change a number, refresh the page.

## Tests

```bash
node harness.js
```

A headless Node harness (639 checks) that imports the game's modules directly — no browser, no
framework, no dependencies — and exercises the simulation through its real exports.

## Docs

| File | What's in it |
|---|---|
| `design.md` | Game design canon: pillars, systems, the age list, settled questions |
| `tech.md` | Architecture: simulation model, manifests, rendering, what's shipped vs pending |
| `map.md` | The map arc: place-graph model, hexes, procedural generation, art strategy |
| `interface.md` | The interface system: layout, components, presentation rules, the interim Bureau skin |
| `todo.md` | **Start here.** THE WORKING ORDER says what happens next; the rest is the spec for each item |
| `CHANGELOG.md` | The shipped-feature record, newest first |
| `redesign/` | The design pass that produced Bureau — prototype and reasoning |
