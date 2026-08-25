# 8/25/26 Design Brief — The Game Idle Civ Actually Became

*This document records how the game arrived at its settled shape, and what that shape is.
It exists because three games were built in-place on top of each other in this repo, and
older docs may still carry laws from games that no longer exist. Where an older document
contradicts this brief, **this brief wins.***

---

## One-sentence definition

**Idle Civ is a competitive 4X played on a 3D hex-map board in the browser — real-time
with a pause button and speed control, against bot adversaries that use the same systems
the player does.**

The name is historical. It is no longer an idle game, and it is not a Civilization clone.
The name stays (for now) but nothing about the design should be derived from it.

---

## The three games (how we got here)

### Game 1 — The idle age-of-empires (dead)

The original idea: do for Age of Empires what Melvor Idle did for RuneScape — the same
game *feel*, fully abstracted. Panels, numbers, job sliders, build queues, a chronicle
log. No map, no units, no micro — those were written down as laws.

It wasn't a bad idea. It was abandoned for an honest reason: building it revealed that
the core experience was *waiting*, and waiting wasn't the game we actually wanted to
make. **The idle identity is dead.** What survives from Game 1 is the tone (the
chronicle's narrative voice, the "your people" framing) and the economic skeleton
(gather → build → advance eras).

### Game 2 — The tabletop (dead, but it changed everything)

The map had been ruled out on purpose — idle games don't need one, and a map invites
micro. It got built anyway, because it seemed fun. Hex-based, one terrain type per hex,
rendered as a fluid 3D tabletop scene in three.js — undiscovered hexes were literally the
tan table surface the board sat on.

This was the realization that broke the original game open: the browser doesn't force a
crappy panels-and-spreadsheets aesthetic. **You can build an expensive-looking game right
in the browser.** The idle laws started falling the day the map went in.

### Game 3 — The scouted world (current)

Playing with the map produced the second realization: build the map *as it is scouted*.
Drop the table aesthetic; let the world grow at the edges as scouts push into it.
Suddenly the screen showed a big, varied landscape — and a much bigger game. That
suggested kingdom management, trade, war, diplomacy: the 4X questions.

The final piece was noticing what the screen actually looked like: **a board game.**
Catan on the coffee table, but alive. Colored hex borders for each player's holdings.
Pieces placed on hexes — farms, walls, fortifications. That aesthetic is now the
game's visual identity, and it quietly answers a dozen design questions (how do
buildings work? they sit on hexes. how does territory read? colored borders. how does
combat feel? dice on the table).

---

## The settled pillars

These are the load-bearing decisions. Changing any of these is a redesign, not a tweak.

### 1. Symmetric players — the architecture North Star

Adversaries start as the simplest possible sim, but every improvement to them should
move them **toward the mechanics the player uses**, never toward a parallel cheat-sim.
The end state: a "player" is a data structure plus a decision-maker, and the human is
just the player whose decision-maker is a mouse.

Why this matters: someday — explicitly **not** in 1.0 — multiplayer should be a
subtraction, not a rewrite. Remove the clock's player-favoritism, let other humans drive
the other players, see who wins. Every architectural decision made today should make
that pivot easier, not harder. Concretely, that means preferring:

- `players[]` over "the player" plus "the adversaries"
- per-player state (era, resources, fog, holdings, armies) over globals
- one action API that all players (human, bot, someday remote human) issue commands through
- deterministic, tick-stepped simulation kept separate from rendering and UI

### 2. Real-time with a throttle, not idle time

There is one game clock. It can be paused and it can be sped up. This is the player's
tool for making the game as contemplative or as brisk as they like — it is *not* an
idle-game mechanic, and nothing should be designed around offline accumulation or
waiting-as-content. (In the far multiplayer future, the adjustable clock is exactly the
thing that gets negotiated away.)

### 3. No unit micro — armies are dispatched, not driven

The old "no individual units" law is dead, but the fear behind it (StarCraft micro) is
answered structurally instead:

- The global army is **split into groups**.
- A group is **dispatched to a hex** and travels there with real travel time.
- Groups **stand on hexes**. They are positions, not cursors.
- Combat **auto-resolves on co-occupation**: dispatch a group to an enemy-held hex and
  it fights on arrival; stand on a hex and an enemy moving through fights you when they
  occupy it.
- Resolution is a **dice roll-off** in the family of Axis & Allies / Twilight Imperium 4
  — simultaneous rolls, casualties, rounds. Legible, board-gamey, chunky.

Travel time plus the pause button is what makes this micro-proof: decisions are
strategic (where should force stand?) and there is never a twitch reason to be watching.

### 4. Per-player eras — the Empire Earth rule

The global era was explicitly killed. **Each player advances through eras at their own
pace, and advancing first confers a real advantage.** Era race pressure is a core
competitive axis, exactly as it was in Empire Earth. Nothing in the design or code
should assume "the era" — only "*whose* era."

### 5. The board-game table is the aesthetic

The game should look like a beautiful physical board game come alive: hex tiles, player
colors, pieces on hexes, dice-flavored combat. The 3D scene is a table you look down on,
not a world you fly through. "Expensive-looking, in the browser" is the bar.

### 6. Fog and the growing world

The map is revealed by scouting and the rendered world is built as it is discovered.
Exploration is one of the four X's; the reveal is a core pleasure. (Note the symmetric-
players implication: fog is ultimately *per-player* knowledge, not a global bitmask.)

---

## The graveyard (struck-down laws)

Old docs may still state these as canon. They are all dead:

| Dead law | Killed by |
|---|---|
| "This is an idle game" | Realizing waiting wasn't the game we wanted |
| "No map" | The map being fun |
| "No military units / no micro" | Dispatch-to-hex armies with travel time (micro-proof by structure, not by absence) |
| "Global era shared by the world" | Per-player era racing (Empire Earth) |
| Tan-table aesthetic for undiscovered land | Build-the-map-as-scouted reveal |
| Panels-and-spreadsheets presentation | The 3D board-game table |

---

## Inspirations (and what each one lends)

- **Melvor Idle** — the original abstraction instinct; mostly historical now.
- **Age of Empires** — the economic fantasy: villagers, gathering, ages, armies.
- **Empire Earth** — per-player era advancement as a competitive race.
- **Axis & Allies / Twilight Imperium 4** — the dice roll-off combat family.
- **Catan and the tabletop shelf** — the visual identity: a board of hexes with pieces on it.
- **Civilization / Stellaris** — the 4X questions: territory, trade, diplomacy, rivals.
- **StarCraft** — a negative inspiration: the micro we are structurally avoiding.

---

## Scope fences

- **1.0 is single-human.** Bot adversaries only. Multiplayer is a someday-option we are
  buying cheaply with architecture, not a feature we are building.
- **Adversary intelligence starts dumb.** The simplest sim that can hold territory,
  grow, and fight — then iterate toward the player's own systems, never toward a
  separate privileged sim.
- **Diplomacy, trade, and alliances** are on the horizon the 4X framing opens, but they
  follow territory + military; they don't precede it.
