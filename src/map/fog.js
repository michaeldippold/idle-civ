import { S, me } from "../core/state.js";
import { SIGHT_RANGE } from "./continents.js";
import { log } from "../ui/log.js";
import { world } from "./world.js";
import { holdings } from "./ownership.js";

// What the player has SEEN. Sticky and additive, never removed -- the
// interface's reveals-are-sticky law applied to geography. You always see the
// country adjacent to what you hold; reaching beyond that is what the scouting
// verb is for (slice 6). Fog hides the BOARD, never the pieces: an unrevealed
// tile shows as unpainted board, and what it turns out to be is honest ground
// that was always there.
// Charting new ground can put new sea -- and new shores -- in view.
export function syncCharted() {
  if (!world || !S.map) return;
  if (!me().revealed) me().revealed = [];
  const seen = new Set(me().revealed);
  for (const id of holdings()) {
    seen.add(id);
    const p = world.places[id];
    if (p) for (const n of p.adj) seen.add(n);
  }
  me().revealed = Array.from(seen);
  const sightedLand = syncSighted();
  if (sightedLand > 0 && S.seen.mapCharted) {
    log(sightedLand === 1
      ? "From the shore, your people make out land across the water."
      : "From the shore, your people make out land across the water — more of it than they expected.",
      "good");
  }
}

// QA ONLY (owner request, 2026-08-24): show the whole board, on demand, so a
// continent's shape can be judged without playing out to it. Deliberately NOT
// in the save and NOT in the signature -- it is a lens on the world, like
// pause and speed, and the button invalidates the stage by hand when it
// flips. The charted set underneath is untouched, so flipping it back leaves
// the run exactly as honest as it was.
export let revealAll = false;
export function setRevealAll(v) { revealAll = v; }

export function isCharted(id) {
  if (revealAll) return true;
  return !!S.map && !!me().revealed && me().revealed.includes(id);
}

// ---------- Sight across water (map.md 2.6, slice 4b) ----------
// Standing on a charted coast you can see out to sea, and you can see THAT
// there is land across it -- never what is on that land. A ray leaves every
// charted coastal hex, travels through WATER ONLY up to SIGHT_RANGE steps,
// and is STOPPED by the first land it touches: you see an island's near
// shore, never behind it, so even a sighted island keeps its size secret.
//
// Sight reveals the BOARD, never the PIECES -- the charted honesty rule,
// inverted. Sighted ground draws its true terrain (if you can genuinely see
// it, showing anything else would be a lie) and carries no props, no marks
// and no interaction. Charted-versus-sighted reads as inhabited-versus-
// silhouette, which is also just true: you cannot make out dwellings at that
// distance.
//
// Sticky and additive, like charting. Returns how many new LAND hexes came
// into view, so the Chronicle can mark the moment.
export function syncSighted() {
  if (!world || !S.map) return 0;
  if (!me().sighted) me().sighted = [];
  const wet = (p) => !p || p.ocean || p.terrain === "water";
  const seen = new Set(me().sighted);
  let newLand = 0;

  // RAYS LEAVE FROM GROUND YOU STAND ON, not from ground you have merely
  // glimpsed. This read `me().revealed` until 2026-08-24, and charted
  // includes every NEIGHBOUR of every owned hex -- so a fresh game cast rays
  // from about twelve hexes instead of three, from shorelines nobody had ever
  // walked to. It compounded as you settled, since each new claim charted a
  // new ring of vantage points it did not own.
  //
  // Measured on the old rule: 34 hexes visible from a 3-hex dominion, with
  // land showing FIVE steps from the nearest owned tile (a charted hex one
  // step out, plus three of open water, plus the far shore). Owner caught it
  // in play: "my starting revealed slices keep getting bigger and bigger."
  for (const id of holdings()) {
    const from = world.places[id];
    if (!from || wet(from)) continue;          // rays leave dry, OWNED ground
    const dist = {};
    let frontier = [];
    for (const n of from.adj) {
      if (!wet(world.places[n]) || dist[n] !== undefined) continue;
      dist[n] = 1; frontier.push(n);
    }
    while (frontier.length) {
      const next = [];
      for (const w of frontier) {
        seen.add(w);                            // the sea itself is seen
        for (const n of world.places[w].adj) {
          const q = world.places[n];
          if (!wet(q)) {                        // land stops the ray
            if (!seen.has(n) && !isCharted(n)) newLand += 1;
            seen.add(n);
            continue;
          }
          if (dist[n] !== undefined) continue;
          if (dist[w] >= SIGHT_RANGE) continue; // no further open water
          dist[n] = dist[w] + 1;
          next.push(n);
        }
      }
      frontier = next;
    }
  }

  me().sighted = Array.from(seen);
  return newLand;
}

// Seen from afar but not charted: drawn, never touched.
export function isSighted(id) {
  if (revealAll) return false;                  // the lens charts everything
  return !!S.map && !!me().sighted && me().sighted.includes(id) && !isCharted(id);
}

// Drawn at all: charted ground, or ground the eye can reach.
export function isVisible(id) {
  return isCharted(id) || isSighted(id);
}
