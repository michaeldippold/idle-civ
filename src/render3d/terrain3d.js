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

// Fog is UNPAINTED BOARD, not a dark shroud. A military blackout would fight
// the bright, warm palette and read as the wrong genre entirely; blank pieces
// waiting to be painted read as a board game mid-setup, which is exactly what
// this is. Unrevealed tiles are also FLAT and uniform -- if they kept their
// real elevation you could read the mountain ranges straight through the fog,
// which would leak the terrain the fog exists to hide.
const FOG_COLOR = new THREE.Color(0xa79b83);
const FOG_ELEV = 0.16;

// Ring colors. State is carried by ring presence and COLOR, never by fading a
// tile out -- `interface.md`'s first law follows the renderer unchanged.
const RING_OWNED = new THREE.Color(0x6fbf47);
const RING_SELECT = new THREE.Color(0xffd76a);
const RING_HOVER = new THREE.Color(0xffe9a8);

export function elevationOf(place) {
  const base = ELEV[place.terrain] != null ? ELEV[place.terrain] : 0.1;
  const j = place.terrain === "water" ? 0
    : place.terrain === "river" ? (hash01(place.id + ":e") - 0.5) * 0.02
    : (hash01(place.id + ":e") - 0.5) * 0.08;
  return base + j;
}

// `places` is the already-filtered list the stage wants drawn; `isOwnedFn` is
// passed in rather than imported so this module stays ignorant of game state.
export function buildTerrain(places, isOwnedFn, isRevealedFn) {
  const land = new SoupBuilder();
  const wet = new SoupBuilder();
  const rings = new SoupBuilder();
  const elev = {};
  const shown = isRevealedFn || (() => true);
  for (const p of places) elev[p.id] = shown(p.id) ? elevationOf(p) : FOG_ELEV;

  const topColor = new THREE.Color();
  const wallColor = new THREE.Color();

  for (const p of places) {
    const lit = shown(p.id);
    // Unrevealed board is always matte: a fogged water tile must not give
    // itself away by catching a specular highlight.
    const soup = (lit && WET.has(p.terrain)) ? wet : land;
    const { x: cx, z: cz } = axialToWorld(p.q, p.r);
    const e = elev[p.id];

    if (lit) {
      // Per-tile tonal variation, so a field of plains does not read as one
      // flat sheet of paint.
      topColor.copy(COLORS[p.terrain] || COLORS.plains);
      topColor.offsetHSL(0, 0, (hash01(p.id + ":c") - 0.5) * 0.07);
    } else {
      // No jitter at all: variation would imply information.
      topColor.copy(FOG_COLOR);
    }

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
    if (lit && isOwnedFn(p.id)) ringInto(rings, cx, e + 0.03, cz, RING_OWNED, 0.94, 0.82);
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
export function buildRing(kind) {
  const soup = new SoupBuilder();
  const col = kind === "select" ? RING_SELECT : RING_HOVER;
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
