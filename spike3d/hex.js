// Pointy-top axial hex math for the spike renderer, matching the game's
// convention (src/map/model.js: pointy-top, LOCKED). World plane is XZ,
// +Z playing the role of the SVG renderer's +Y.

export const HEX_SIZE = 1.0;
export const SQRT3 = Math.sqrt(3);

export function axialToWorld(q, r) {
  return {
    x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r),
    z: HEX_SIZE * (1.5 * r),
  };
}

// Inverse: world XZ -> fractional axial -> cube-rounded axial (Red Blob).
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

// The six corners of a pointy-top hex, as XZ offsets from the centre.
// Corner k sits at angle 60k - 30 degrees (so points face up/down the Z axis).
export function corner(k, size = HEX_SIZE) {
  const a = (Math.PI / 180) * (60 * k - 30);
  return { x: size * Math.cos(a), z: size * Math.sin(a) };
}

// For a neighbour direction (dq, dr), the shared edge spans corners m and m+1
// where m = angle/60 of the direction vector in world space.
export function edgeCorners(dq, dr) {
  const w = axialToWorld(dq, dr);
  const deg = (Math.atan2(w.z, w.x) * 180) / Math.PI;
  const m = ((Math.round(deg / 60) % 6) + 6) % 6;
  return [m, (m + 1) % 6];
}

// Deterministic string hash (djb2, same recipe as src/map/model.js hashStr).
export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Deterministic [0,1) from a string — the spike's stand-in for randomness so
// the look is stable per seed (no Math.random anywhere in the spike).
export function hash01(s) {
  return hashStr(s) / 4294967296;
}
