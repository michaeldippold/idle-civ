// ---------- The place-graph (map.md §2) ---------------------
// The model is a graph of places: id, position, adjacency. A hex grid is a
// place-graph whose adjacency is six fixed offsets on a lattice; a node
// network (the Space border's future) is one with arbitrary adjacency. These
// are one data model with two generators, and NOTHING outside src/map/ may
// branch on the world's kind -- the seam is neighbors() and distance(), and
// if a third thing ever needs the world's shape, the seam is drawn wrong.
//
// Axial coordinates, pointy-top (points up and down, flat sides -- LOCKED,
// map.md §3). Place ids are "q,r" strings: permanent, like every id in this
// project. This file is pure math; it imports nothing.

export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function pid(q, r) { return q + "," + r; }
export function parseId(id) { const [q, r] = id.split(",").map(Number); return { q, r }; }

export function neighbors(world, id) { return world.places[id] ? world.places[id].adj : []; }

// Integer distance between two places. Hex distance under the hex generator;
// a BFS hop count when a node network arrives. Same contract either way.
export function distance(world, aId, bId) {
  if (world.kind === "hex") {
    const a = parseId(aId), b = parseId(bId);
    return hexDistance(a.q, a.r, b.q, b.r);
  }
  return bfsDistance(world, aId, bId);
}

export function hexDistance(aq, ar, bq, br) {
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function bfsDistance(world, aId, bId) {
  if (aId === bId) return 0;
  const seen = new Set([aId]);
  let frontier = [aId], hops = 0;
  while (frontier.length) {
    hops += 1;
    const next = [];
    for (const id of frontier) {
      for (const n of world.places[id].adj) {
        if (n === bId) return hops;
        if (!seen.has(n)) { seen.add(n); next.push(n); }
      }
    }
    frontier = next;
  }
  return Infinity;
}

// ---------- Rendering math (pointy-top) ---------------------
// Pixel centre of a hex: pointy-top axial -> cartesian.
export function toPixel(q, r, size) {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

// The six corners of a pointy-top hex around a centre, as an SVG points list.
export function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push((cx + size * Math.cos(angle)).toFixed(2) + "," + (cy + size * Math.sin(angle)).toFixed(2));
  }
  return pts.join(" ");
}

// Deterministic string hash (djb2) -- used to derive sub-seeds, so the same
// run regenerates the same world.
export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// A deterministic [0,1) from a string, for per-hex decisions that must not
// move when some other generation stage changes.
//
// The avalanche is NOT optional, and the harness proved it: djb2's raw output
// is badly biased in exactly the high bits that `h / 2^32` reads, so a "6%
// chance" roll fired on 0 hexes for one seed and every hex for the next --
// a 0.000 hit rate over two thousand samples. The murmur3 finalizer below
// mixes those bits down; without it, every hash01 in the project (prop
// placement, tonal jitter, elevation) was quietly drawing from a narrow band.
export function hash01(s) {
  let h = hashStr(s);
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
