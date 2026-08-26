import * as THREE from "three";
import { axialToWorld, hash01, PIECE_SOCKETS } from "./hex3d.js";

// ---------- PIECES: the army discs ------------------------------------------
// The board carries two vocabularies of 3D object with different visual laws
// (architecture review, 2026-08-25): SCENERY belongs to the tile -- muted, low,
// sunk-and-risen by the set dressing. PIECES belong to PLAYERS -- saturated
// player colour, deliberately oversized against the scenery height cap, and
// the only saturated vertical objects on the board.
//
// A piece is a DISC (owner, 2026-08-26; the full canon is design.md -> How an
// Army Is Depicted). Rotationally symmetric, so there is no heading to get
// wrong; a silhouette nothing else on the board uses, so it reads as a token
// and reads as nothing else; the COUNT is printed on the top face, which the
// camera's 25-66 degree pitch clamp guarantees is never edge-on. It will read
// upside-down at some azimuths, and that is fine -- it is a poker chip.
//
// THREE THICKNESS TIERS, not a gradient: war party / column / host, the same
// vocabulary launchCampaign has banded army size with all along. A gradient
// cannot be read (7 vs 9 needs a reference); a category sorts every disc on
// the board at a glance, and crossing a threshold is an event. Spaced
// non-linearly on purpose -- the host tier reads as a different CLASS of
// object, which is the "oh no" it is for.
//
// TRAVEL IS PICK-UP-AND-PLOP (review ruling): the piece stays on its hex until
// the sim's step completes, then HOPS -- the invisible hand moving a piece,
// the same design language as the sink-and-rise. It never slides along the
// road, because a piece is on a space or it is on another space. While an
// order is standing the disc BOBS gently: the one visible difference between
// "holding this ground" and "about to move", and the answer to a dispatch
// otherwise looking like nothing happened for twelve seconds.

export const DISC_RADIUS = 0.30;
// Tier heights, 1.0 / ~1.35 / ~2.1. The smallest must clear the scenery
// height cap (props3d shrank the trees under ~0.39) -- no army ever sinks
// into the forest it is marching through.
export const TIER_HEIGHTS = [0.42, 0.56, 0.88];

const HOP_MS = 420;
const HOP_LIFT = 0.45;

let group = null;
const meshes = new Map();     // key -> { mesh, hex, socket, baseY, hop }

// The count, printed ON the top face -- a texture, not a floating badge. The
// badge was designed and rejected: a detached number in the label layer sits
// among the work letters and house glyphs, which ARE hex properties, and
// re-opens exactly the "is this the hex's or the army's?" ambiguity the disc
// exists to close. White with a dark stroke reads on all seven player colours,
// black included.
const topTextures = new Map(); // "color|count" -> CanvasTexture
function topTexture(color, count) {
  const key = color + "|" + count;
  let t = topTextures.get(key);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.font = "700 72px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(10,12,16,0.85)";
    g.strokeText(String(count), 64, 68);
    g.fillStyle = "#ffffff";
    g.fillText(String(count), 64, 68);
    t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    topTextures.set(key, t);
  }
  return t;
}

// One shared unit cylinder; every disc is a scale of it. 24 segments: round
// enough to read as a token, cheap enough to never matter at a dozen pieces.
let discGeo = null;

function makeDisc(color, count, height, selected) {
  if (!discGeo) discGeo = new THREE.CylinderGeometry(1, 1, 1, 24);
  const side = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const top = new THREE.MeshStandardMaterial({ map: topTexture(color, count), roughness: 0.55 });
  const bottom = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  if (selected) {
    side.emissive = new THREE.Color(color); side.emissiveIntensity = 0.35;
    top.emissive = new THREE.Color("#ffffff"); top.emissiveIntensity = 0.12;
  }
  const m = new THREE.Mesh(discGeo, [side, top, bottom]);
  m.scale.set(DISC_RADIUS, height, DISC_RADIUS);
  m.castShadow = true;
  return m;
}

export function initPieces(scene) {
  group = new THREE.Group();
  group.name = "pieces";
  scene.add(group);
  meshes.clear();
  return group;
}

function socketXZ(q, r, socket) {
  const w = axialToWorld(q, r);
  const s = PIECE_SOCKETS[socket % PIECE_SOCKETS.length];
  return { x: w.x + s.dx, z: w.z + s.dz };
}

// The full list, every call -- pieces are few, so diffing by key and rebuilding
// changed meshes is cheaper to reason about than clever mutation. `list` rows:
// { key, hex, q, r, color, count, tier, socket, marching, selected }.
export function setPieces(list, elev) {
  if (!group) return;
  const seen = new Set();
  for (const it of list) {
    seen.add(it.key);
    const h = TIER_HEIGHTS[Math.min(it.tier, TIER_HEIGHTS.length - 1)];
    const baseY = (elev[it.hex] || 0) + h / 2;
    const { x, z } = socketXZ(it.q, it.r, it.socket);
    let rec = meshes.get(it.key);
    const sig = [it.color, it.count, it.tier, it.selected ? 1 : 0].join("|");
    if (rec && rec.sig !== sig) {
      group.remove(rec.mesh);
      rec.mesh.material.forEach((m) => m.dispose());
      rec = null;
    }
    if (!rec) {
      const mesh = makeDisc(it.color, it.count, h, it.selected);
      mesh.position.set(x, baseY, z);
      mesh.userData.pieceKey = it.key;
      group.add(mesh);
      // Bob phase hashed off the key, never rolled -- paint-only, and the
      // harness source-scans src/ for the global dice on purpose.
      rec = { mesh, hex: it.hex, sig, baseY, hop: null, marching: it.marching, phase: hash01(it.key) };
      meshes.set(it.key, rec);
    } else if (rec.hex !== it.hex) {
      // THE PLOP. The sim moved the piece a whole hex; the board shows the
      // hand lifting it there. Position animates; the truth already moved.
      rec.hop = { fx: rec.mesh.position.x, fz: rec.mesh.position.z, fy: rec.baseY,
                  tx: x, tz: z, ty: baseY, t0: performance.now() };
      rec.hex = it.hex;
      rec.baseY = baseY;
    } else {
      rec.mesh.position.x = x; rec.mesh.position.z = z;
      rec.baseY = baseY;
    }
    rec.marching = it.marching;
  }
  for (const [key, rec] of meshes) {
    if (!seen.has(key)) {
      group.remove(rec.mesh);
      rec.mesh.material.forEach((m) => m.dispose());
      meshes.delete(key);
    }
  }
}

// Per-frame: hops finish, marching discs bob. Both are PAINT -- the sim never
// reads a mesh position, so nothing here can desync the game.
export function tickPieces(now) {
  for (const rec of meshes.values()) {
    if (rec.hop) {
      const k = Math.min(1, (now - rec.hop.t0) / HOP_MS);
      const e = k * k * (3 - 2 * k);
      rec.mesh.position.x = rec.hop.fx + (rec.hop.tx - rec.hop.fx) * e;
      rec.mesh.position.z = rec.hop.fz + (rec.hop.tz - rec.hop.fz) * e;
      rec.mesh.position.y = rec.hop.fy + (rec.hop.ty - rec.hop.fy) * e + Math.sin(k * Math.PI) * HOP_LIFT;
      if (k >= 1) { rec.hop = null; rec.mesh.position.y = rec.baseY; }
    } else if (rec.marching) {
      rec.mesh.position.y = rec.baseY + Math.abs(Math.sin(now / 320 + rec.phase * 7)) * 0.05;
    } else {
      rec.mesh.position.y = rec.baseY;
    }
  }
}

// Piece picking, ahead of the ground plane: the thing you are aiming at is the
// thing you can see, and a piece is always the tallest thing on its hex.
export function pickPiece(raycaster) {
  if (!group) return null;
  const hits = raycaster.intersectObjects(group.children, false);
  return hits.length ? hits[0].object.userData.pieceKey : null;
}

export function disposePieces() {
  if (!group) return;
  for (const rec of meshes.values()) rec.mesh.material.forEach((m) => m.dispose());
  meshes.clear();
  if (group.parent) group.parent.remove(group);
  group = null;
  for (const t of topTextures.values()) t.dispose();
  topTextures.clear();
  if (discGeo) { discGeo.dispose(); discGeo = null; }
}
