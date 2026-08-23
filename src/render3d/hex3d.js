// Pointy-top axial hex math on the XZ world plane.
//
// The game's `map/model.js` is the authority on hex convention (pointy-top,
// LOCKED) and owns the 2D pixel projection the SVG stage uses. This module is
// its 3D sibling and nothing more: the same axial coordinates projected onto
// the ground plane, where +Z plays the role of the SVG renderer's +Y. Keeping
// it separate means the simulation never gains a dependency on the renderer,
// which is the one architectural rule the whole 3D adoption rests on.

export const HEX_SIZE = 1.0;
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

// Deterministic [0,1) from a string. Elevation jitter, tonal variation and
// prop placement all draw from this rather than from rng(): they are PAINT,
// and paint must never touch the simulation's dice. It also means the look of
// a tile is stable across re-meshes without storing anything.
export function hash01(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return (h >>> 0) / 4294967296;
}
