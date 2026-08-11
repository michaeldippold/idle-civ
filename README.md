# Idle Civ — prototype

A rough browser demo: a civilization/city-builder with the graphics stripped out.
No map, no rendered units — just resources, people, and choices. Inspired by
*A Dark Room* (start with almost nothing; the interface unravels as you play) and
Age of Empires-style economies (assign workers, feed your people, build up).

## Run it

Double-click **`index.html`** — it opens in your default browser and runs with no
build step or server. Progress auto-saves to your browser's local storage.

## The loop right now

- You begin with **3 settlers** and an almost-empty screen. Everyone **eats food**
  every second, so your first job is to forage — **run out of food and the
  settlement dies** (a "you lost" message, and the game stops).
- Assign settlers to **forage food**, **chop wood**, or **gather stone** (slow: 0.20/sec
  each before bonuses).
- Housing starts at 3, so you can't grow until you **build a Hut** (+3 housing each).
  New settlers cost food, so the rhythm is: forage → grow → hit the housing cap →
  build → grow again.
- **Building takes workers and time (Age of Empires style):** starting a building
  spends its resources immediately, but it sits at 0% until you **assign builders**
  — which means pulling settlers off gathering. One build at a time.
- **Storage is capped.** You can only hold so much food and wood in the open before
  it spoils/rots; **Granary** and **Woodshed** raise those caps. Stone is uncapped
  for now.
- Things unravel as you go: resource rows, the Construction panel, and each new
  building type appear only when they become relevant.

## Tuning

All balance lives in the `CONFIG` block and the `BUILDINGS` / `JOBS` tables at the
top of **`game.js`** — base gather rate, food upkeep, growth cost/scaling, storage
caps, per-building cost curves, and build times. Change a number, refresh the page.

## Deliberately not built yet

Held back so we keep tuning the core loop first: Ages/tech progression, scholars &
research, and any resource sinks beyond building and population. These are the
obvious next layers once the core feels fun.
