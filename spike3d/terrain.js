// Merged terrain meshes from the game's generator output (guide §5).
// Elevation does NOT exist in the sim — it is derived here, as paint only:
// a per-terrain base height plus a small deterministic per-tile jitter.
//
// Two merged meshes: matte land, glossier water (water + river tiles), so the
// HDRI can put speculars on the wet tiles. Both are non-indexed triangle
// soups with vertex colors; computeVertexNormals gives flat-shaded facets.

import * as THREE from "three";
import { DIRS } from "../src/map/model.js";
import { axialToWorld, corner, edgeCorners, hash01, HEX_SIZE } from "./hex.js";

const ELEV = { hills: 0.55, forest: 0.25, plains: 0.12, river: 0.04, water: -0.12 };
const EDGE_BASE = -0.5; // the board's slab bottom at the map rim

const COLORS = {
  plains: new THREE.Color(0x8aa64e),
  forest: new THREE.Color(0x3c703a),
  hills:  new THREE.Color(0x9a8058),
  river:  new THREE.Color(0x4d89c4),
  water:  new THREE.Color(0x2d5f8f),
};
const WALL_TINT = new THREE.Color(0x5c4a36);

const WET = new Set(["water", "river"]);

export function elevationOf(place) {
  const base = ELEV[place.terrain] ?? 0.1;
  const j = place.terrain === "water" ? 0
    : place.terrain === "river" ? (hash01(place.id + ":e") - 0.5) * 0.02
    : (hash01(place.id + ":e") - 0.5) * 0.08;
  return base + j;
}

export function buildTerrain(world) {
  const land = new SoupBuilder();
  const wet = new SoupBuilder();
  const elev = {};
  for (const id in world.places) elev[id] = elevationOf(world.places[id]);

  const topColor = new THREE.Color();
  const wallColor = new THREE.Color();

  for (const id in world.places) {
    const p = world.places[id];
    const soup = WET.has(p.terrain) ? wet : land;
    const { x: cx, z: cz } = axialToWorld(p.q, p.r);
    const e = elev[id];

    // Per-tile tonal variation so fields do not read as one flat sheet.
    topColor.copy(COLORS[p.terrain]);
    const v = (hash01(id + ":c") - 0.5) * 0.14;
    topColor.offsetHSL(0, 0, v * 0.5);

    // Top fan: centre + 6 corners, 6 triangles, wound to face +Y.
    const cs = [];
    for (let k = 0; k < 6; k++) {
      const c = corner(k);
      cs.push([cx + c.x, e, cz + c.z]);
    }
    for (let k = 0; k < 6; k++) {
      const a = cs[k], b = cs[(k + 1) % 6];
      soup.tri([cx, e, cz], b, a, topColor);
    }

    // Side walls where the neighbour is lower — or absent (map rim skirt).
    wallColor.copy(topColor).lerp(WALL_TINT, 0.55).multiplyScalar(0.8);
    for (const [dq, dr] of DIRS) {
      const nid = (p.q + dq) + "," + (p.r + dr);
      const nElev = nid in elev ? elev[nid] : EDGE_BASE;
      if (nElev >= e) continue;
      const [m0, m1] = edgeCorners(dq, dr);
      const a = cs[m0], b = cs[m1];
      const a2 = [a[0], nElev, a[2]], b2 = [b[0], nElev, b[2]];
      // Outward-facing quad (two triangles).
      soup.tri(a, b, b2, wallColor);
      soup.tri(a, b2, a2, wallColor);
    }
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

  return { landMesh, wetMesh, elev };
}

// A subtle emissive hover highlight: a flat hex ring floated just above the
// hovered tile's top (guide §5.3's companion; picking itself is plane-based).
export function buildHighlight() {
  const outer = 0.97, inner = 0.8;
  const soup = new SoupBuilder();
  const col = new THREE.Color(0xffe9a8);
  for (let k = 0; k < 6; k++) {
    const o1 = corner(k, outer * HEX_SIZE), o2 = corner((k + 1) % 6, outer * HEX_SIZE);
    const i1 = corner(k, inner * HEX_SIZE), i2 = corner((k + 1) % 6, inner * HEX_SIZE);
    soup.tri([o1.x, 0, o1.z], [o2.x, 0, o2.z], [i2.x, 0, i2.z], col);
    soup.tri([o1.x, 0, o1.z], [i2.x, 0, i2.z], [i1.x, 0, i1.z], col);
  }
  const mesh = new THREE.Mesh(soup.build(), new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
    side: THREE.DoubleSide,
  }));
  mesh.visible = false;
  mesh.renderOrder = 5;
  return mesh;
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
