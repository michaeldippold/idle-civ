import { S, me } from "../core/state.js";
import { world } from "./world.js";
import { holdings, isOwned } from "./ownership.js";

// ---------- Routes: two distances, and never the same one -------
// ---------- Administrative distance & the famine drain (E4) ----------
// Two distances, and conflating them is the trap (map.md 2.7): routeCost()
// below measures from your NEAREST holding (logistics -- how long is the
// march); adminDistance() measures from your SEAT (administration -- how well
// can you hold it). A tendril of hexes is logistically close and
// administratively terrible, which is exactly what the famine drain punishes.
// MEASURED FROM THE ASKING CIV'S SEAT (2026-08-26). "How well can you hold
// this?" is a question about a specific capital, so a rival's frontier is far
// from THEIR seat, not from yours -- and roads through THEIR country are what
// is cheap for them.
export function adminDistance(targetId, civ) {
  if (!world || !S.map || !world.places[targetId]) return Infinity;
  const p = civ || me();
  const from = p.seat || world.home;
  if (!world.places[from]) return Infinity;
  const stepInto = (id) => {
    if (isOwned(id, p.id)) return 0.5;
    return world.places[id].terrain === "water" ? 3 : 1;
  };
  const dist = {};
  const queue = [from];
  dist[from] = 0;
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (dist[queue[i]] < dist[queue[bi]]) bi = i;
    const id = queue.splice(bi, 1)[0];
    if (id === targetId) return dist[id];
    for (const n of world.places[id].adj) {
      const d = dist[id] + stepInto(n);
      if (dist[n] === undefined || d < dist[n]) {
        if (dist[n] === undefined) queue.push(n);
        dist[n] = d;
      }
    }
  }
  return dist[targetId] !== undefined ? dist[targetId] : Infinity;
}

// Effective route cost from your dominion to a tile (the supply-route rule,
// user ruling): multi-source Dijkstra from every owned tile, where marching
// through your OWN country costs half a step, unowned land a full step, and
// water three -- slow crossings, never impossible, so an island seat can't
// deadlock a run. Conquering or settling a line toward a rival is literally
// building a road. Returns Infinity only when there is no map.
export function routeCost(targetId) {
  if (!world || !S.map || !world.places[targetId]) return Infinity;
  const stepInto = (id) => {
    if (isOwned(id)) return 0.5;
    return world.places[id].terrain === "water" ? 3 : 1;
  };
  const dist = { };
  const queue = [];
  for (const id of holdings()) { dist[id] = 0; queue.push(id); }
  while (queue.length) {
    // Small worlds: a plain scan-for-min is simpler than a heap and fast
    // enough at a few hundred places.
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (dist[queue[i]] < dist[queue[bi]]) bi = i;
    const id = queue.splice(bi, 1)[0];
    if (id === targetId) return dist[id];
    for (const n of world.places[id].adj) {
      const d = dist[id] + stepInto(n);
      if (dist[n] === undefined || d < dist[n]) {
        if (dist[n] === undefined) queue.push(n);
        dist[n] = d;
      }
    }
  }
  return dist[targetId] !== undefined ? dist[targetId] : Infinity;
}

// How route cost bends a campaign: multiplies base march time and the food
// provision. Near targets (or well-roaded ones) march cheap; far ones cost.
// First-guess curve, tuned toward too-hard as always.
// THE PATH ITSELF, not merely its length. adminDistance() and routeCost() both
// answer "how far", which is all an abstraction ever needed. An army has to know
// WHICH hexes it walks through, in order: it stands on each of them in turn, it
// can be met on any of them, and a contested hex bars the road.
//
// Same step rule as routeCost -- your own country costs half a step, unowned
// land a full one, water three. Slow crossings, never impossible, so an island
// seat cannot deadlock a run.
//
// Returns the hexes to walk THROUGH, excluding the one you start on, or null if
// there is no way there at all.
export function pathBetween(fromId, toId, civ) {
  if (!world || !S.map || !world.places[fromId] || !world.places[toId]) return null;
  if (fromId === toId) return [];
  const p = civ || me();
  const stepInto = (id) => {
    if (isOwned(id, p.id)) return 0.5;
    return world.places[id].terrain === "water" ? 3 : 1;
  };
  const dist = { [fromId]: 0 }, prev = {};
  const queue = [fromId];
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (dist[queue[i]] < dist[queue[bi]]) bi = i;
    const id = queue.splice(bi, 1)[0];
    if (id === toId) break;
    for (const n of world.places[id].adj) {
      const d = dist[id] + stepInto(n);
      if (dist[n] === undefined || d < dist[n]) {
        if (dist[n] === undefined) queue.push(n);
        dist[n] = d; prev[n] = id;
      }
    }
  }
  if (dist[toId] === undefined) return null;
  const path = [];
  for (let id = toId; id !== fromId; id = prev[id]) {
    path.unshift(id);
    if (path.length > 4096) return null;   // guard: a broken prev chain
  }
  return path;
}

export function marchFactor(targetId) {
  const r = routeCost(targetId);
  if (!Number.isFinite(r)) return 1;   // no map (harness fixtures): par
  return Math.min(2, Math.max(0.6, 0.5 + r / 6));
}
