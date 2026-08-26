import { S, me } from "../core/state.js";

// ---------- WHO HOLDS WHAT (the ownership seam) ----------
// OWNERSHIP IS A PROPERTY OF THE TILE (2026-08-26, review Part I.2). It used to
// be an array on the player -- `S.map.owned` -- which is the same defect the
// player split fixed one layer up: it encodes "there is one civ and this is
// their list". The world model already did it right for everyone else
// (`place.adversary` is an id); the player was the one holder whose ownership
// was not.
//
// `S.map.owner[tileId] = playerId`. One field answers "whose is this?" for any
// tile and any civ, which is what a second civ needs and what a rival's rim
// colour reads. The per-player LIST is derived from it, never stored, so the
// two can never disagree.
export function ownerMap() {
  if (!S.map.owner) S.map.owner = {};
  return S.map.owner;
}
export function ownerOf(id) {
  const o = S.map && S.map.owner ? S.map.owner[id] : undefined;
  return o === undefined ? null : o;
}
export function isOwned(id, pid) {
  return ownerOf(id) === (pid == null ? S.me : pid);
}
// Every tile a civ holds. Derived on demand: the board is ~120 tiles, and a
// stored list is a second copy of a fact that can drift from the first.
export function holdings(pid) {
  const who = pid == null ? S.me : pid;
  const out = [];
  const owner = (S.map && S.map.owner) || {};
  for (const id in owner) if (owner[id] === who) out.push(id);
  return out;
}
export function holdCount(pid) {
  const who = pid == null ? S.me : pid;
  const owner = (S.map && S.map.owner) || {};
  let n = 0;
  for (const id in owner) if (owner[id] === who) n++;
  return n;
}
export function claimTile(id, pid) {
  ownerMap()[id] = pid == null ? S.me : pid;
}
export function releaseTile(id) {
  if (S.map && S.map.owner) delete S.map.owner[id];
}
