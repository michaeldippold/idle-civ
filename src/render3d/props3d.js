// Instanced props: the things standing ON the board.
//
// These are dev-art primitives -- cone-and-cylinder trees, box-and-pyramid
// huts, icosahedron rocks -- with the lighting stack doing the visual work.
// The owner's ruling is that dev-art is livable indefinitely (`map.md` §8),
// and the seam that makes that true is this file: when purchased model packs
// arrive, only the geometry constructors below change. Placement, rotation and
// scale jitter are deterministic, hashed from the tile id -- never rng(),
// because props are paint and paint must not touch the simulation's dice.
//
// One InstancedMesh per PART, not per prop: the whole map's trees cost two
// draw calls however many there are. This is the headroom that makes a
// several-hundred-tile board free.

import * as THREE from "three";
import { axialToWorld, corner, hash01, HEX_SIZE } from "./hex3d.js";

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Gather every instance transform first, then allocate exact-size
// InstancedMeshes. Each part of a compound prop (trunk+canopy, wall+roof)
// is its own instanced mesh — one draw call per part for the whole map.
class Part {
  constructor(geo, mat) { this.geo = geo; this.mat = mat; this.items = []; }
  // `tile` is recorded with every instance so a SINGLE hex's props can be moved
  // later without rebuilding the board (the sink-and-rise transition). It costs
  // one string per instance and it is the difference between an animation that
  // is a general per-hex primitive and one that is an era-ceremony special
  // case -- see design.md, Explicitly Out of Scope, the motion ruling.
  add(x, y, z, rotY, scale, color, tile) {
    this.items.push({ x, y, z, rotY, scale, color, tile });
  }
  build() {
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(this.items.length, 1));
    mesh.count = this.items.length;
    this.items.forEach((it, i) => {
      _q.setFromAxisAngle(_up, it.rotY);
      _p.set(it.x, it.y, it.z);
      const sy = it.scale.y ?? it.scale;
      _s.set(it.scale.x ?? it.scale, sy, it.scale.z ?? it.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      if (it.color) mesh.setColorAt(i, it.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = false; // guide §8: props rarely need to receive
    // The transition layer reads these back: base transforms plus the tile each
    // instance stands on. Kept on the mesh rather than in a side table so it
    // cannot outlive the geometry it describes.
    mesh.userData.items = this.items;
    return mesh;
  }
}

// DEV ART: a march-hold is a hexagonal wall standing inside the tile.
//
// Built from the game's own corner() rather than a six-sided CylinderGeometry,
// which would be one line shorter and misaligned -- THREE starts its radial
// segments on a different axis than this board's pointy-top hexes, so the wall
// would sit rotated against the tile it stands on. Using corner() makes
// alignment structural instead of a magic rotation constant.
//
// Outer and inner faces plus a capped top, so it reads as a wall with thickness
// from the low camera angles this board lives at.
function hexWallGeometry(outer, inner, height) {
  const pos = [];
  const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let k = 0; k < 6; k++) {
    const o1 = corner(k, outer), o2 = corner((k + 1) % 6, outer);
    const i1 = corner(k, inner), i2 = corner((k + 1) % 6, inner);
    const O1 = [o1.x, 0, o1.z], O2 = [o2.x, 0, o2.z];
    const I1 = [i1.x, 0, i1.z], I2 = [i2.x, 0, i2.z];
    const O1t = [o1.x, height, o1.z], O2t = [o2.x, height, o2.z];
    const I1t = [i1.x, height, i1.z], I2t = [i2.x, height, i2.z];
    tri(O1, O2, O2t); tri(O1, O2t, O1t);        // outer face
    tri(I2, I1, I1t); tri(I2, I1t, I2t);        // inner face
    tri(O1t, O2t, I2t); tri(O1t, I2t, I1t);     // the walkway on top
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Deterministic offset inside a hex: ring of precomputed anchor slots,
// nudged by the tile hash so no two clusters look alike.
// ---------- The sink-and-rise transition ----------
// A hex's contents change: what stands on it goes down into the ground, and
// what replaces it comes up. General by construction -- it takes tile ids and
// knows nothing about WHY they changed, so the era re-dress, building a
// structure, demolishing one and losing a hex to famine all use the one path.
//
// The ground hides the descent for free: a hex is a solid slab, so anything
// below its top face is inside it and occluded from every angle the camera is
// clamped to. No clipping plane, no stencil.
export const SINK_DEPTH = 0.9;

// `phaseOf(tile)` returns 0 (standing) to 1 (fully underground) FOR THAT TILE.
// Per-tile rather than one number for the whole set, so hexes can move at
// slightly different times -- a country of crews working at their own pace
// rather than one mechanism. Rewrites only the instances belonging to `tiles`,
// which is what recording the tile per instance bought.
export function setPropPhase(group, tiles, phaseOf) {
  if (!group) return;
  const depth = (tile) => SINK_DEPTH * Math.max(0, Math.min(1, phaseOf(tile)));
  const cache = new Map();
  group.traverse((mesh) => {
    const items = mesh.userData && mesh.userData.items;
    if (!items || !mesh.isInstancedMesh) return;
    let touched = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!tiles.has(it.tile)) continue;
      if (!cache.has(it.tile)) cache.set(it.tile, depth(it.tile));
      const sink = cache.get(it.tile);
      _q.setFromAxisAngle(_up, it.rotY);
      _p.set(it.x, it.y - sink, it.z);
      const sy = it.scale.y ?? it.scale;
      _s.set(it.scale.x ?? it.scale, sy, it.scale.z ?? it.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      touched = true;
    }
    if (touched) mesh.instanceMatrix.needsUpdate = true;
  });
}

function slot(id, i, spread = 0.5) {
  const a = hash01(id + ":a" + i) * Math.PI * 2;
  const d = (0.2 + 0.75 * hash01(id + ":d" + i)) * spread;
  return { dx: Math.cos(a) * d, dz: Math.sin(a) * d };
}

function jitterScale(id, tag) {
  return 0.9 + 0.2 * hash01(id + ":s" + tag); // ±10%
}

export function buildProps(places, elev, homeId, isRevealedFn, builtOn) {
  const group = new THREE.Group();

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.95 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d6a52, roughness: 0.9, flatShading: true });   // warm brown: boulders must read against tin-grey hills
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8c6a2, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7d7568, roughness: 0.88 });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xe0c766, roughness: 0.95, flatShading: true });

  const trunk = new Part(new THREE.CylinderGeometry(0.035, 0.055, 0.22, 5), trunkMat);
  const canopy = new Part(new THREE.ConeGeometry(0.2, 0.52, 6), canopyMat);
  const rock = new Part(new THREE.IcosahedronGeometry(0.13, 0), rockMat);
  // DEV ART: a hay bale is a tipped-over cylinder. Low segment count so it
  // faces up like everything else on this board, and it is a Part like any
  // other, so a whole country of farms is still two draw calls.
  // Tipped over by rotating the GEOMETRY once, not the instance: Part.add only
  // takes a Y rotation, which is exactly what a bale lying on its side wants --
  // it spins to face any direction while staying down. Baking the tilt in also
  // costs nothing per instance.
  const baleGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.24, 8);
  baleGeo.rotateZ(Math.PI / 2);
  const bale = new Part(baleGeo, hayMat);
  // Inside the ownership rim (0.94/0.82) so the two never fight, and about as
  // tall as the dev tower, which is the height the board already reads as "a
  // building" at this camera.
  const wall = new Part(
    hexWallGeometry(0.74 * HEX_SIZE, 0.62 * HEX_SIZE, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.9, flatShading: true }));
  const hutWall = new Part(new THREE.BoxGeometry(0.26, 0.16, 0.22), wallMat);
  const hutRoof = new Part(new THREE.ConeGeometry(0.21, 0.16, 4), roofMat);
  const tower = new Part(new THREE.BoxGeometry(0.2, 0.44, 0.2), stoneMat);
  const towerRoof = new Part(new THREE.ConeGeometry(0.17, 0.2, 4), roofMat);

  const canopyCol = new THREE.Color();
  const roofCol = new THREE.Color();

  const hut = (id, x, y, z, tag, scale) => {
    const rot = hash01(id + ":hr" + tag) * Math.PI * 2;
    const s = scale * jitterScale(id, "h" + tag);
    roofCol.setHex(0x9a4a32).offsetHSL(0, 0, (hash01(id + ":rc" + tag) - 0.5) * 0.1);
    hutWall.add(x, y + 0.08 * s, z, rot, s, null, id);
    hutRoof.add(x, y + (0.16 + 0.08) * s, z, rot + Math.PI / 4, s, roofCol.clone(), id);
  };

  const shown = isRevealedFn || (() => true);
  for (const p of places) {
    const id = p.id;
    // Unrevealed board carries nothing. A tree poking out of the fog would
    // announce a forest the player has not found yet.
    if (!shown(id)) continue;
    const { x: cx, z: cz } = axialToWorld(p.q, p.r);
    const y = elev[id];

    // A BUILT HEX SHEDS ITS TERRAIN PROPS. The trees do not stand in the middle
    // of the field you cleared to make it -- which is also what makes the
    // sink-and-rise read correctly: the old growth goes down, the works come up.
    const structure = builtOn ? builtOn(p.id) : null;
    if (structure) {
      if (structure === "marchHold") {
        // One wall, centred: the hex IS the building. No jitter and no slot --
        // a fortification that wobbled would read as a prop rather than as
        // works, and it is the one thing on this board that should look placed.
        wall.add(cx, y, cz, 0, 1, null, id);
      }
      if (structure === "farm") {
        // Three bales, deterministically placed like every other prop.
        for (let i = 0; i < 3; i++) {
          const { dx, dz } = slot(id, i + 3, 0.45);
          const s = jitterScale(id, "b" + i);
          bale.add(cx + dx, y + 0.115 * s, cz + dz,
            hash01(id + ":br" + i) * Math.PI * 2, s, null, id);
        }
      }
      continue;   // nothing else stands on built ground
    }

    if (p.terrain === "forest") {
      const n = 2 + Math.floor(hash01(id + ":tc") * 3); // 2..4 trees
      for (let i = 0; i < n; i++) {
        const { dx, dz } = slot(id, i, 0.55);
        const s = jitterScale(id, "t" + i);
        const rot = hash01(id + ":tr" + i) * Math.PI * 2;
        canopyCol.setHex(0x3d8a40).offsetHSL(
          (hash01(id + ":th" + i) - 0.5) * 0.04, 0, (hash01(id + ":tl" + i) - 0.5) * 0.12);
        trunk.add(cx + dx, y + 0.11 * s, cz + dz, rot, s, null, id);
        canopy.add(cx + dx, y + (0.2 + 0.26) * s, cz + dz, rot, s, canopyCol.clone(), id);
      }
    }

    if (p.terrain === "hills") {
      const n = 1 + Math.floor(hash01(id + ":rn") * 2); // 1..2 rocks
      for (let i = 0; i < n; i++) {
        const { dx, dz } = slot(id, i + 7, 0.5);
        const s = jitterScale(id, "r" + i);
        rock.add(cx + dx, y + 0.07 * s, cz + dz,
          hash01(id + ":rr" + i) * Math.PI * 2,
          { x: s, y: s * (0.6 + 0.5 * hash01(id + ":ry" + i)), z: s }, null, id);
      }
    }

    if (id === homeId) {
      // The player's seat: a small settlement — three huts round a green.
      for (let i = 0; i < 3; i++) {
        const { dx, dz } = slot(id, i + 3, 0.55);
        hut(id, cx + dx, y, cz + dz, i, 1.0);
      }
    } else if (p.adversary) {
      // Adversary seats: a distinct cluster — stone towers, taller silhouette.
      for (let i = 0; i < 3; i++) {
        const { dx, dz } = slot(id, i + 11, 0.42);
        const s = (i === 0 ? 1.15 : 0.9) * jitterScale(id, "w" + i);
        const rot = hash01(id + ":wr" + i) * Math.PI * 2;
        roofCol.setHex(0x4a3f3a);
        tower.add(cx + dx, y + 0.22 * s, cz + dz, rot, s, null, id);
        towerRoof.add(cx + dx, y + (0.44 + 0.1) * s, cz + dz, rot + Math.PI / 4, s, roofCol.clone(), id);
      }
    } else if (p.minor) {
      // Minor steadings: a single small hut.
      const { dx, dz } = slot(id, 17, 0.3);
      hut(id, cx + dx, y, cz + dz, "m", 0.8);
    }
  }

  for (const part of [trunk, canopy, rock, bale, wall, hutWall, hutRoof, tower, towerRoof]) {
    group.add(part.build());
  }
  return group;
}
