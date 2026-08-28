// Pointy-top axial hex math on the XZ world plane.
//
// The game's `map/model.js` is the authority on hex convention (pointy-top,
// LOCKED) and owns the 2D pixel projection the SVG stage uses. This module is
// its 3D sibling and nothing more: the same axial coordinates projected onto
// the ground plane, where +Z plays the role of the SVG renderer's +Y. Keeping
// it separate means the simulation never gains a dependency on the renderer,
// which is the one architectural rule the whole 3D adoption rests on.

// THE BOARD GEOMETRY PASS (owner, 2026-08-28; the spec is todo.md -> The
// Board Geometry Pass). Circumradius 1.5, up from 1.0 -- not taste but
// arithmetic: two independent constraints (the march-hold's courtyard must
// hold one disc; a chunky wall spoke must not eat the N/S sockets) both
// land at sockets-at-0.90, which needs inradius >= 1.26. Size is
// load-bearing NOWHERE in the sim -- march time is flat per hex and the
// game moves in axial coordinates -- so this whole family of numbers is
// renderer-local and moves together. The harness checks the budget below
// as arithmetic, which is why the disc radius lives here and not with the
// mesh that uses it: this module is pure math and node can import it.
export const HEX_SIZE = 1.5;

// The piece budget, every number derived from its neighbours:
//   sockets at 0.90       -- as far out as the hub cap allows (see HUB_CAP)
//   disc radius 0.27      -- 0.30 until the owner saw the new board ("they
//                            already read as quite big"); the shrink also
//                            fixed the one overlap the first budget missed:
//                            the HOVER SILHOUETTE is the disc scaled 1.14,
//                            and at 0.30 its edge (1.242) crossed the
//                            ownership rim's inner edge (1.23). At 0.27 the
//                            silhouette lands at 1.208, clear.
//   socket + disc = 1.17  -- inside the inradius (1.299) AND the ownership
//                            rim's inner edge (0.82 * 1.5 = 1.23), which the
//                            old board failed: discs overlapped the rim
//   clearance 0.55        -- disc radius + the FATTEST PROP HULL (hut roof,
//                            0.21 * 1.1 jitter = 0.23) + margin. The old 0.34
//                            was disc radius + margin and measured scatter to
//                            a prop's CENTRE, so a legal tree reached 0.09
//                            inside the disc -- the bug behind "the hexes
//                            feel too small".
export const DISC_RADIUS = 0.27;
const SOCKET_DIST = 0.90;

// THE HUB CAP: no building footprint may exceed this, or it eats the ring
// sockets. It is also exactly where the march-hold's outer wall stands --
// "sized to run up against the edges of its slot" (owner) -- so the wall
// spokes to come know where to stop without asking the model.
export const HUB_CAP = SOCKET_DIST - DISC_RADIUS;   // 0.63

// The march-hold's wall thickness, here rather than with its mesh because
// the COURTYARD is a budget line: (HUB_CAP - HUB_WALL) * cos30 must hold a
// disc with visible air, and the harness checks it. 0.12, down from a first
// 0.20 the owner called cramped on sight -- the disc filled 87% of the
// courtyard's flat-to-flat. Proportionally 0.12 is the honest number
// anyway: ~11% of the hold's width, a curtain wall rather than a donut.
export const HUB_WALL = 0.12;

// PIECE SOCKETS (review ruling, amended 2026-08-26 and 2026-08-28): fixed
// anchor points on every hex that the prop scatter never fills and the army
// discs stand on. The CENTRE stays the structure's -- and on a fortified hex
// it is the COURTYARD, where the garrison stands (pieces3d). Four on a
// cross, N/E/S/W (owner ruling, a three-corner layout was proposed and
// lost): a wall crossing the hex can veto the slots it runs through and
// still leave an OPPOSITE pair -- only the horizontal wall costs anything
// (E and W), both diagonals pass 0.45 clear of N/S -- and four leaves room
// for a four-player game without redesign. A player's socket is pid % 4,
// which keeps any two players' discs apart on a shared hex
// deterministically. Spaced so the clearance circles NEVER overlap
// (adjacent sockets sit 0.90*sqrt(2) = 1.273 apart against a 2x0.55 = 1.10
// requirement): a scatter point pushed out of one circle cannot be pushed
// into another, which is what lets the avoidance stay a simple radial shove
// instead of a solver. A first draft used an uneven ring and the harness
// sweep caught the overlap.
export const PIECE_SOCKETS = [
  { dx: 0,            dz: -SOCKET_DIST },
  { dx: 0,            dz:  SOCKET_DIST },
  { dx:  SOCKET_DIST, dz:  0 },
  { dx: -SOCKET_DIST, dz:  0 },
];
export const SOCKET_CLEARANCE = 0.55;   // scenery keeps this far off a socket
const SQRT3 = Math.sqrt(3);

export function axialToWorld(q, r) {
  return {
    x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r),
    z: HEX_SIZE * (1.5 * r),
  };
}

// Inverse of the above: world XZ -> fractional axial -> cube-rounded axial.
// This is the whole of picking. Raycasting the terrain mesh would also work
// and would be slower, fussier and wrong at the edges where a tall tile's
// wall occludes the tile behind it -- the plane is the honest surface to ask.
export function worldToAxialRounded(x, z) {
  const qf = ((SQRT3 / 3) * x - (1 / 3) * z) / HEX_SIZE;
  const rf = ((2 / 3) * z) / HEX_SIZE;
  return cubeRound(qf, rf);
}

function cubeRound(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

// The six corners of a pointy-top hex as XZ offsets from its centre.
// Corner k sits at 60k - 30 degrees, so points face up and down the Z axis.
export function corner(k, size = HEX_SIZE) {
  const a = (Math.PI / 180) * (60 * k - 30);
  return { x: size * Math.cos(a), z: size * Math.sin(a) };
}

// For a neighbour direction (dq, dr), the shared edge spans corners m and m+1.
export function edgeCorners(dq, dr) {
  const w = axialToWorld(dq, dr);
  const deg = (Math.atan2(w.z, w.x) * 180) / Math.PI;
  const m = ((Math.round(deg / 60) % 6) + 6) % 6;
  return [m, (m + 1) % 6];
}

// Elevation jitter, tonal variation and prop placement all draw from this
// rather than from rng(): they are PAINT, and paint must never touch the
// simulation's dice. It also means a tile's look is stable across re-meshes
// without storing anything.
//
// Re-exported from map/model.js rather than reimplemented -- this file
// carried its own biased copy until 2026-08-24, which meant prop angles and
// tonal variation were drawing from a narrow band without anyone noticing.
export { hash01 } from "../map/model.js";
