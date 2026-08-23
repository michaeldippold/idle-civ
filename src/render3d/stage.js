// The 3D map stage: the game's main surface, rendered as a lit board.
//
// This module owns a WebGL scene and NOTHING about the game. Everything it
// needs to know about state arrives through hooks supplied by `ui/map.js`
// (which tile is owned, what mark a tile wears, what a hover tooltip says),
// so the simulation keeps its standing property of never being able to reach
// the renderer. All harness checks stay renderer-independent by construction.
//
// Three independent graceful degradations, because a black board is a far
// worse failure than a plain one:
//   1. No WebGL / no three  -> initStage returns false, and `ui/map.js` keeps
//      the SVG stage, which survives as the 2D debug view (`?map=2d`).
//   2. No HDRI              -> a hemisphere rig stands in. Dimmer, still lit.
//   3. No postprocessing    -> straight renderer.render. No AO or SMAA, and
//      ACES tonemapping plus the environment still do most of the work.
//
// Text is DOM, deliberately. Tile marks -- the home glyph, seat names, work
// letters -- are projected HTML positioned over the canvas each frame rather
// than meshes in the scene. Legibility outranks texture is a Bureau law that
// outlived Bureau, and 3D text is illegible at exactly the grazing angles this
// camera lives at. Civ VI does the same thing with its city banners.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { axialToWorld, worldToAxialRounded } from "./hex3d.js";
import { buildProps } from "./props3d.js";
import { buildRing, buildTerrain } from "./terrain3d.js";

const VOID = new THREE.Color(0x11161f);

let renderer = null, scene = null, camera = null, controls = null, composer = null;
let stageEl = null, labelLayer = null;
let hoverRing = null, selectRing = null;
let worldGroup = null;          // terrain + props for the current build
let hooks = {};
let places = [];                // the filtered list currently drawn
let byId = {};
let elev = {};
let selectedId = null;
let hoveredId = null;
let lastRevealed = -1;          // re-frame only when the KNOWN world changes size
let isRevealed = () => true;
let rafId = 0;
let started = false;

export function isReady() { return started; }

// ---------- Setup ----------------------------------------------------------

export async function initStage(el, h) {
  if (started) return true;
  hooks = h || {};
  stageEl = el;

  const canvas = document.createElement("canvas");
  canvas.id = "mapGl";
  el.appendChild(canvas);

  // `?glcheck=1` keeps the drawing buffer readable after compositing, which is
  // the only way an automated check can prove the board is actually being
  // DRAWN rather than merely existing in the DOM. Without it, reading the
  // canvas always returns an empty buffer and every such check is a false
  // negative. It costs real performance, so it is opt-in: the layout lesson
  // from the flip was that DOM assertions pass happily against a page that
  // renders nothing, and this is that lesson carried into the renderer.
  let glcheck = false;
  try { glcheck = new URLSearchParams(location.search).get("glcheck") === "1"; } catch (e) {}

  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: "high-performance",
      preserveDrawingBuffer: glcheck,
    });
  } catch (e) {
    console.warn("[map3d] WebGL unavailable; keeping the 2D stage:", e);
    canvas.remove();
    return false;
  }

  labelLayer = document.createElement("div");
  labelLayer.id = "mapLabels";
  el.appendChild(labelLayer);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = VOID;
  scene.fog = new THREE.Fog(VOID, 30, 78);

  camera = new THREE.PerspectiveCamera(38, 1, 0.5, 300);
  camera.position.set(0, 11, 10);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  // Pitch clamped 40-65 degrees from horizontal. The board must never be seen
  // edge-on: it is a thing on a table, and a table is looked down at.
  controls.minPolarAngle = THREE.MathUtils.degToRad(25);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(50);
  controls.minDistance = 4;
  controls.maxDistance = 40;
  controls.screenSpacePanning = false;

  await setupLighting();
  await setupPost();

  hoverRing = buildRing("hover");
  selectRing = buildRing("select");
  scene.add(hoverRing, selectRing);

  wirePointer(canvas);
  resize();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(el);
  else window.addEventListener("resize", resize);

  started = true;
  loop();
  return true;
}

async function setupLighting() {
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const radius = 14;
  sun.position.copy(new THREE.Vector3(-60, 90, 40).normalize().multiplyScalar(radius * 3));
  const cam = sun.shadow.camera;
  cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
  cam.near = 1; cam.far = radius * 8;
  cam.updateProjectionMatrix();
  scene.add(sun, sun.target);

  try {
    const { RGBELoader } = await import("three/addons/loaders/RGBELoader.js");
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    await new Promise((resolve, reject) => {
      new RGBELoader().load("assets/env/sky_1k.hdr", (hdr) => {
        scene.environment = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose(); pmrem.dispose(); resolve();
      }, undefined, reject);
    });
  } catch (e) {
    // Dimmer, and entirely playable. The board still reads as lit geometry.
    scene.add(new THREE.HemisphereLight(0xbfd6f0, 0x6b5a40, 1.1));
    console.warn("[map3d] HDRI unavailable; using the hemisphere fallback rig");
  }
}

async function setupPost() {
  try {
    const { EffectComposer, RenderPass, EffectPass, SMAAEffect } = await import("postprocessing");
    composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    try {
      const { N8AOPostPass } = await import("n8ao");
      const ao = new N8AOPostPass(scene, camera, 1, 1);
      ao.configuration.aoRadius = 0.9;
      ao.configuration.intensity = 3.0;
      ao.configuration.distanceFalloff = 0.9;
      ao.configuration.halfRes = true;
      composer.addPass(ao);
    } catch (e) {
      console.warn("[map3d] N8AO unavailable; continuing without ambient occlusion");
    }
    composer.addPass(new EffectPass(camera, new SMAAEffect()));
  } catch (e) {
    composer = null;
    console.warn("[map3d] postprocessing unavailable; rendering without the post chain");
  }
}

// ---------- Building the board from state ---------------------------------

// `list` is the already-filtered set of places to draw. Rebuilds wholesale:
// at this board size a full re-mesh is a couple of milliseconds, and chunked
// invalidation is an optimisation to reach for when the board is measured to
// need it rather than assumed to.
export function setWorld(list, opts) {
  if (!started) return;
  const o = opts || {};
  places = list;
  byId = {};
  for (const p of list) byId[p.id] = p;

  if (worldGroup) {
    scene.remove(worldGroup);
    disposeTree(worldGroup);
  }
  worldGroup = new THREE.Group();

  isRevealed = o.isRevealed || (() => true);
  const built = buildTerrain(list, o.isOwned || (() => false), isRevealed);
  elev = built.elev;
  worldGroup.add(built.landMesh, built.wetMesh, built.ringMesh);
  worldGroup.add(buildProps(list, elev, o.homeId, isRevealed));
  scene.add(worldGroup);

  // The camera frames what the player KNOWS, not the whole board -- so Stone
  // opens tight on your own ground with the unpainted world falling away at
  // the edges, and the view pulls back on its own as the fog retreats. That is
  // the era zoom-out arc without a single per-era camera number: it follows
  // discovery, which is what it was always really about.
  const known = list.filter((p) => isRevealed(p.id));
  if (known.length !== lastRevealed) {
    frameBoard(known.length ? known : list);
    lastRevealed = known.length;
  }

  placeRing(selectRing, selectedId);
  placeRing(hoverRing, hoveredId);
  buildLabels();
}

export function setSelected(id) {
  selectedId = id;
  placeRing(selectRing, id);
}

function placeRing(ring, id) {
  const p = id && byId[id];
  if (!ring) return;
  if (!p) { ring.visible = false; return; }
  const w = axialToWorld(p.q, p.r);
  ring.position.set(w.x, (elev[p.id] || 0) + 0.04, w.z);
  ring.visible = true;
}

function frameBoard(list) {
  let maxR = 1;
  for (const p of list) {
    const w = axialToWorld(p.q, p.r);
    maxR = Math.max(maxR, Math.hypot(w.x, w.z));
  }
  const dist = THREE.MathUtils.clamp(maxR * 2.1 + 5, 6, 38);
  controls.target.set(0, 0, 0);
  camera.position.set(0, dist * 0.72, dist * 0.66);
  controls.maxDistance = Math.max(12, dist * 1.6);
  controls.update();
}

// ---------- Labels: projected DOM ------------------------------------------

function buildLabels() {
  if (!labelLayer) return;
  labelLayer.textContent = "";
  if (!hooks.markFor) return;
  for (const p of places) {
    const mark = hooks.markFor(p);
    if (!mark) continue;
    if (mark.glyph) {
      const g = document.createElement("span");
      g.className = "map3d-glyph" + (mark.cls ? " " + mark.cls : "");
      g.textContent = mark.glyph;
      g.dataset.id = p.id;
      labelLayer.appendChild(g);
    }
    if (mark.label) {
      const l = document.createElement("span");
      l.className = "map3d-label";
      l.textContent = mark.label;
      l.dataset.id = p.id;
      l.dataset.below = "1";
      labelLayer.appendChild(l);
    }
  }
}

const _v = new THREE.Vector3();
function positionLabels() {
  if (!labelLayer || !labelLayer.childElementCount) return;
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  for (const el of labelLayer.children) {
    const p = byId[el.dataset.id];
    if (!p) { el.style.display = "none"; continue; }
    const wp = axialToWorld(p.q, p.r);
    _v.set(wp.x, (elev[p.id] || 0) + (el.dataset.below ? 0.02 : 0.16), wp.z);
    _v.project(camera);
    if (_v.z > 1) { el.style.display = "none"; continue; }
    el.style.display = "";
    el.style.left = ((_v.x * 0.5 + 0.5) * w).toFixed(1) + "px";
    el.style.top = ((-_v.y * 0.5 + 0.5) * h + (el.dataset.below ? 16 : 0)).toFixed(1) + "px";
  }
}

// ---------- Picking and hover ----------------------------------------------

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

function pickAt(clientX, clientY) {
  const r = stageEl.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  const { q, r: rr } = worldToAxialRounded(hit.x, hit.z);
  const p = byId[q + "," + rr];
  // Unpainted board is not a place yet: it has no stats, no flavor and no
  // actions, so it takes no hover ring and no selection. There is nothing
  // dishonest here -- the player can see plainly that it is unknown.
  return p && isRevealed(p.id) ? p : null;
}

function wirePointer(canvas) {
  canvas.addEventListener("pointermove", (e) => {
    const p = pickAt(e.clientX, e.clientY);
    const id = p ? p.id : null;
    if (id !== hoveredId) {
      hoveredId = id;
      placeRing(hoverRing, id);
      if (hooks.onHoverChange) hooks.onHoverChange(p, e);
    } else if (p && hooks.onHoverMove) {
      hooks.onHoverMove(e);
    }
  });
  canvas.addEventListener("pointerleave", () => {
    hoveredId = null;
    if (hoverRing) hoverRing.visible = false;
    if (hooks.onHoverChange) hooks.onHoverChange(null, null);
  });

  // A click is a press and release with no meaningful drag between them --
  // otherwise every camera orbit would also select whatever it started on.
  let downAt = null;
  canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 5) return;
    const p = pickAt(e.clientX, e.clientY);
    if (hooks.onPick) hooks.onPick(p ? p.id : null);
  });
}

// ---------- Frame ----------------------------------------------------------

function resize() {
  if (!stageEl || !renderer) return;
  const w = Math.max(1, stageEl.clientWidth), h = Math.max(1, stageEl.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
}

function loop() {
  rafId = requestAnimationFrame(loop);
  controls.update();
  if (composer) composer.render();
  else renderer.render(scene, camera);
  positionLabels();
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
}

export function dispose() {
  if (rafId) cancelAnimationFrame(rafId);
  if (worldGroup) disposeTree(worldGroup);
  if (renderer) renderer.dispose();
  started = false;
}

// Console handle for review, matching the spike's affordance.
export function debugHandle() {
  return { scene, camera, renderer, controls, composer, places };
}
