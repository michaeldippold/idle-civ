// Merged, vertex-colored terrain meshes built from the game's world model.
//
// Elevation does not exist in the simulation and never will: it is derived
// here, as paint only -- a per-terrain base height plus a small deterministic
// per-tile jitter keyed off the tile id. Nothing in this file may be read back
// by the sim, and nothing here may consult rng().
//
// Two merged meshes rather than one per tile: matte land and glossier water,
// so the environment map can put speculars on wet tiles while fields stay dry.
// Both are non-indexed triangle soups with vertex colors; computeVertexNormals
// then gives the flat-shaded facets that make the board read as carved pieces.

import * as THREE from "three";
import { DIRS } from "../map/model.js";
import { axialToWorld, corner, edgeCorners, hash01, HEX_SIZE } from "./hex3d.js";

const ELEV = { hills: 0.55, forest: 0.25, plains: 0.12, river: 0.04, water: -0.12 };
const EDGE_BASE = -0.5;   // the board's slab bottom, shown at the map rim

const COLORS = {
  plains: new THREE.Color(0x8aa64e),
  forest: new THREE.Color(0x3c703a),
  hills:  new THREE.Color(0xa6aca6),   // tin-grey (owner request: high country reads as bare rock)
  river:  new THREE.Color(0x4d89c4),
  water:  new THREE.Color(0x2d5f8f),
};
const WALL_TINT = new THREE.Color(0x5c4a36);
const WET = new Set(["water", "river"]);

// The unknown world is NOT DRAWN (owner ruling, 2026-08-24, after a live
// three-way look test: tan unpainted-board, dark shroud, invisible --
// "invisible is the winner and it's not close"). The board simply ends at the
// knowledge frontier, cut-edge walls falling to the slab there, and every
// discovery makes the world visibly ACCRETE out of the void -- the reveal is
// the reward. The 2D debug view still shows fogged tiles, because a debug
// surface should see everything.

// Ring colors. State is carried by ring presence and COLOR, never by fading a
// tile out -- `interface.md`'s first law follows the renderer unchanged.
//
// All three now come from the PLAYER'S colour (core/palette.js) rather than
// being authored here: owned country wears it quieted, and hover and selection
// wear it at full strength. They used to be a fixed green plus two golds, and
// those golds were spending YELLOW on the most frequent thing on screen --
// yellow is reserved for status now, so the rings moved into the one colour
// that was always really theirs. The colour is fixed for the run, so reading
// it at build time is enough; nothing has to repaint.
// Passed in, never imported -- same rule as `isOwnedFn` below, and for the
// same reason: this module draws, it does not know whose board it is drawing.
// `pal` is a core/palette.js entry; the fallback keeps a bare call working.
const FALLBACK = { ring: "#6fbf47", focus: "#a6ec72" };
function ringColor(pal, key) { return new THREE.Color((pal || FALLBACK)[key] || FALLBACK[key]); }

export function elevationOf(place) {
  const base = ELEV[place.terrain] != null ? ELEV[place.terrain] : 0.1;
  const j = place.terrain === "water" ? 0
    : place.terrain === "river" ? (hash01(place.id + ":e") - 0.5) * 0.02
    : (hash01(place.id + ":e") - 0.5) * 0.08;
  return base + j;
}

// `places` is the already-filtered list the stage wants drawn; `isOwnedFn` is
// passed in rather than imported so this module stays ignorant of game state.
export function buildTerrain(places, isOwnedFn, isRevealedFn, pal) {
  const land = new SoupBuilder();
  const wet = new SoupBuilder();
  const rings = new SoupBuilder();
  const elev = {};
  const shown = isRevealedFn || (() => true);
  for (const p of places) { if (shown(p.id)) elev[p.id] = elevationOf(p); }   // unknown ground does not exist yet

  const topColor = new THREE.Color();
  const wallColor = new THREE.Color();

  for (const p of places) {
    if (!shown(p.id)) continue;   // the unknown world is not drawn
    const soup = WET.has(p.terrain) ? wet : land;
    const { x: cx, z: cz } = axialToWorld(p.q, p.r);
    const e = elev[p.id];

    // Per-tile tonal variation, so a field of plains does not read as one
    // flat sheet of paint.
    topColor.copy(COLORS[p.terrain] || COLORS.plains);
    topColor.offsetHSL(0, 0, (hash01(p.id + ":c") - 0.5) * 0.07);

    const cs = [];
    for (let k = 0; k < 6; k++) {
      const c = corner(k);
      cs.push([cx + c.x, e, cz + c.z]);
    }
    for (let k = 0; k < 6; k++) {
      soup.tri([cx, e, cz], cs[(k + 1) % 6], cs[k], topColor);
    }

    // Side walls wherever the neighbour sits lower, or is absent entirely --
    // the absent case is what gives the board its cut edge at the rim.
    wallColor.copy(topColor).lerp(WALL_TINT, 0.55).multiplyScalar(0.8);
    for (const [dq, dr] of DIRS) {
      const nid = (p.q + dq) + "," + (p.r + dr);
      const nElev = nid in elev ? elev[nid] : EDGE_BASE;
      if (nElev >= e) continue;
      const [m0, m1] = edgeCorners(dq, dr);
      const a = cs[m0], b = cs[m1];
      const a2 = [a[0], nElev, a[2]], b2 = [b[0], nElev, b[2]];
      soup.tri(a, b, b2, wallColor);
      soup.tri(a, b2, a2, wallColor);
    }

    // Owned country wears a rim. One merged mesh for all of them, so dominion
    // costs one draw call however far it spreads.
    if (isOwnedFn(p.id)) ringInto(rings, cx, e + 0.03, cz, ringColor(pal, "ring"), 0.94, 0.82);
  }

  const landMesh = new THREE.Mesh(land.build(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.55,
  }));
  landMesh.castShadow = true;
  landMesh.receiveShadow = true;

  const wetMesh = new THREE.Mesh(wet.build(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.16, metalness: 0.0, envMapIntensity: 1.1,
  }));
  wetMesh.receiveShadow = true;

  const ringMesh = new THREE.Mesh(rings.build(), new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  ringMesh.renderOrder = 4;

  return { landMesh, wetMesh, ringMesh, elev };
}

// A free-floating ring used for hover and selection, repositioned rather than
// rebuilt. Two instances exist for the life of the stage.
export function buildRing(kind, pal) {
  const soup = new SoupBuilder();
  // Hover and selection are the player's colour at FULL strength while owned
  // country wears it quieted -- the tile under the cursor should come forward,
  // and a darker ring reads as recessive on a board this bright.
  const col = ringColor(pal, "focus");
  const [outer, inner] = kind === "select" ? [1.0, 0.84] : [0.97, 0.87];
  ringInto(soup, 0, 0, 0, col, outer, inner);
  const mesh = new THREE.Mesh(soup.build(), new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: kind === "select" ? 1 : 0.85,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.visible = false;
  mesh.renderOrder = kind === "select" ? 6 : 5;
  return mesh;
}

function ringInto(soup, cx, cy, cz, color, outer, inner) {
  for (let k = 0; k < 6; k++) {
    const o1 = corner(k, outer * HEX_SIZE), o2 = corner((k + 1) % 6, outer * HEX_SIZE);
    const i1 = corner(k, inner * HEX_SIZE), i2 = corner((k + 1) % 6, inner * HEX_SIZE);
    soup.tri([cx + o1.x, cy, cz + o1.z], [cx + o2.x, cy, cz + o2.z], [cx + i2.x, cy, cz + i2.z], color);
    soup.tri([cx + o1.x, cy, cz + o1.z], [cx + i2.x, cy, cz + i2.z], [cx + i1.x, cy, cz + i1.z], color);
  }
}

class SoupBuilder {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, color) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
