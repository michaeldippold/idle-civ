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
import { axialToWorld, hash01, worldToAxialRounded } from "./hex3d.js";
import { disposePieces, initPieces, pickPiece, setPieces as setPieceMeshes, tickPieces } from "./pieces3d.js";
import { buildProps, setPropPhase } from "./props3d.js";
import { buildRing, buildTerrain, RIM_Y } from "./terrain3d.js";

const VOID = new THREE.Color(0x11161f);

let renderer = null, scene = null, camera = null, controls = null, composer = null;
let stageEl = null, labelLayer = null, canvasEl = null;
// Held so dispose() can actually undo what initStage() wired up. Without
// these, a disposed stage left an observer alive and its canvas in the DOM,
// and re-initialising appended a SECOND canvas on top of the first.
let resizeObs = null, resizeListener = null;
let hoverRing = null, selectRing = null;
let worldGroup = null;          // terrain + props for the current build
let hooks = {};
let places = [];                // the filtered list currently drawn
let byId = {};
let elev = {};
let selectedId = null;
let hoveredId = null;
let lastRevealed = -1;          // re-frame only when the KNOWN world changes size
let isVisible = () => true;     // drawn at all: charted, or seen across water
let isCharted = () => true;     // KNOWN: props, marks and interaction
let lastEra = null;
let userMoved = false;          // once the player takes the camera, it is theirs
let panBounds = null;
let rafId = 0;
let started = false;

export function isReady() { return started; }

// ---------- The sink-and-rise transition ----------
// Motion happens only at the moment of a change, and only to the thing that
// changed (design.md, Explicitly Out of Scope). This is the only thing on the
// board that ever moves; nothing here runs on its own.
//
// Three phases, and the middle one is why this lives in the stage rather than
// in props3d: the board REBUILDS between sinking and rising, and that rebuild
// is the whole-map one. A rebuild landing mid-animation would replace the
// meshes being animated, so `pendingWorld` holds the change until the ground
// has closed over the old props.
// PACING IS THE CONTENT HERE (owner, 2026-08-25, after seeing it): the
// re-dress is not a UI transition, it is a picture of PEOPLE DOING WORK --
// raising a building, turning a forest into a farm. At 260/320 it was
// "blink and you miss it". Roughly tripled, and the rise is much longer than
// the sink because tearing down is quicker than building up.
const SINK_MS = 620, RISE_MS = 980;

// And slowing it exposed something the speed was hiding: twelve hexes moving in
// perfect lockstep read as one MECHANISM, not as twelve crews. Each tile gets a
// deterministic offset up to this much, hashed off its id -- so the country
// works at its own pace and nothing is synchronised. Set to 0 to disable; the
// motion is correct either way, just duller.
const STAGGER_MS = 420;

let fx = null;              // { tiles:Set, t0, phase:"sink"|"rise" }
let pendingWorld = null;    // a setWorld() that arrived mid-sink

// Deterministic per-tile delay. Paint only -- hashed, never rng(), same rule
// every other visual jitter on this board follows.
function fxOffset(tile) { return STAGGER_MS * hash01(tile + ":fx"); }

// Smoothstep, both directions. The old easing was quadratic in and out, which
// made props DROP and then POP -- physical, and wrong for the reading: labour
// starts deliberately and ends deliberately. This eases at both ends.
function smooth(k) { return k * k * (3 - 2 * k); }

// Ask for a transition on specific hexes. Ids the board does not currently
// draw are harmless: they simply match no instances.
export function changeHexes(ids) {
  if (!started || !ids || !ids.length) return false;
  fx = { tiles: new Set(ids), t0: performance.now(), phase: "sink" };
  return true;
}

function stepFx(now) {
  if (!fx) return;
  const dur = fx.phase === "sink" ? SINK_MS : RISE_MS;
  const sinking = fx.phase === "sink";
  // Each tile runs the same curve, started at its own moment.
  const phaseOf = (tile) => {
    const k = Math.min(1, Math.max(0, (now - fx.t0 - fxOffset(tile)) / dur));
    const e = smooth(k);
    return sinking ? e : 1 - e;
  };
  setPropPhase(worldGroup, fx.tiles, phaseOf);
  // The PHASE is over only when the last-started tile has finished, or the
  // stragglers would be cut off mid-move by the swap.
  const k = Math.min(1, (now - fx.t0) / (dur + STAGGER_MS));
  if (k < 1) return;
  if (fx.phase === "sink") {
    // The ground has closed. Swap the world NOW, while nothing is visible, then
    // bring the new props up out of it.
    const tiles = fx.tiles;
    fx = null;
    if (pendingWorld) { const w = pendingWorld; pendingWorld = null; applyWorld(w.list, w.o); }
    setPropPhase(worldGroup, tiles, () => 1);   // the new props start underground
    fx = { tiles, t0: performance.now(), phase: "rise" };
  } else {
    setPropPhase(worldGroup, fx.tiles, () => 0);  // land exactly at rest, never near it
    fx = null;
  }
}

// ---------- Setup ----------------------------------------------------------

export async function initStage(el, h) {
  if (started) return true;
  hooks = h || {};
  stageEl = el;

  const canvas = document.createElement("canvas");
  canvas.id = "mapGl";
  el.appendChild(canvas);
  canvasEl = canvas;

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
    canvasEl = null;
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
  // Set generously and re-tuned per board in frameBoard(): atmospheric fog
  // exists to soften the void at the rim, and it must never start dissolving
  // the far edge of the board itself when the camera pulls back.
  scene.fog = new THREE.Fog(VOID, 60, 140);

  camera = new THREE.PerspectiveCamera(38, 1, 0.5, 300);
  camera.position.set(0, 11, 10);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  // Pitch clamped ~24-65 degrees from horizontal (owner request 2026-08-24:
  // let the camera get low and cinematic across the board). Never edge-on --
  // it is a thing on a table -- but close enough to see the world as terrain.
  controls.minPolarAngle = THREE.MathUtils.degToRad(25);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(66);
  controls.minDistance = 4;
  controls.maxDistance = 40;   // replaced per board by frameBoard()
  controls.screenSpacePanning = false;
  // Auto-framing is a courtesy, not a policy. The moment the player drags,
  // zooms or pans, the camera belongs to them and the stage stops moving it --
  // right up until an era turns, which is a ceremony and gets to reframe.
  controls.addEventListener("start", () => { userMoved = true; });

  await setupLighting();
  await setupPost();

  hoverRing = buildRing("hover", hooks.palette);
  selectRing = buildRing("select", hooks.palette);
  // The piece layer lives OUTSIDE worldGroup on purpose: a setWorld rebuild
  // (era re-dress, fog advancing) must not destroy the army discs mid-hop.
  initPieces(scene);
  scene.add(hoverRing, selectRing);

  wirePointer(canvas);
  resize();
  if (typeof ResizeObserver !== "undefined") {
    resizeObs = new ResizeObserver(resize);
    resizeObs.observe(el);
  } else {
    resizeListener = resize;
    window.addEventListener("resize", resizeListener);
  }

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
// The seam the transition needs: a rebuild arriving while the props are on
// their way DOWN is held until the ground has closed over them, then applied
// unseen. Without this, changing a hex would swap the meshes mid-sink and the
// animation would jump.
export function setWorld(list, opts) {
  if (!started) return;
  if (fx && fx.phase === "sink") { pendingWorld = { list, o: opts || {} }; return; }
  applyWorld(list, opts);
}

function applyWorld(list, opts) {
  const o = opts || {};
  places = list;
  byId = {};
  for (const p of list) byId[p.id] = p;

  if (worldGroup) {
    scene.remove(worldGroup);
    disposeTree(worldGroup);
  }
  worldGroup = new THREE.Group();

  // Two predicates, because sight and knowledge are different things: the
  // TERRAIN is drawn for anything the eye can reach, but props, marks, rings
  // and interaction belong only to ground you have actually charted. Sight
  // reveals the board, never the pieces.
  isVisible = o.isVisible || (() => true);
  isCharted = o.isCharted || isVisible;
  const built = buildTerrain(list, hooks.rimFor || (() => null), isVisible, hooks.builtOn);
  elev = built.elev;
  worldGroup.add(built.landMesh, built.wetMesh, built.ringMesh);
  worldGroup.add(buildProps(list, elev, o.homeId, isCharted, hooks.builtOn));
  scene.add(worldGroup);

  // The camera frames what the player KNOWS, not the whole board -- so Stone
  // opens tight on your own ground with the unpainted world falling away at
  // the edges, and the view pulls back on its own as the fog retreats. That is
  // the era zoom-out arc without a single per-era camera number: it follows
  // discovery, which is what it was always really about.
  const known = list.filter((p) => isVisible(p.id));
  const eraTurned = o.era !== undefined && o.era !== lastEra;
  if (eraTurned) { lastEra = o.era; userMoved = false; }
  // Reframe while the camera is still the stage's to move, and again whenever
  // an era turns. Otherwise only the LIMITS refresh, so newly charted country
  // becomes reachable by zooming out without the view lurching mid-play.
  // Limits follow what is KNOWN, not the whole board: the unknown world is
  // not drawn (map.md 2.6), so zooming out past the charted frontier would
  // only show void. (This inverts the earlier fix that widened limits to the
  // whole board -- correct then, when unreached country still rendered.)
  const frameSet = known.length ? known : list;
  if ((known.length !== lastRevealed || eraTurned) && !userMoved) {
    frameBoard(frameSet, frameSet);
    lastRevealed = known.length;
  } else {
    applyBoardLimits(frameSet);
    lastRevealed = known.length;
  }

  placeRing(selectRing, selectedId);
  placeRing(hoverRing, hoveredId);
  buildLabels();
}

// The army discs. The UI hands the full list each time its signature moves;
// the layer diffs by key, so this is cheap at a dozen pieces. Elevation comes
// from the terrain build, which is why this lives here and not in the caller.
export function setPieces(list) {
  setPieceMeshes(list || [], elev);
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
  // Every rim shares one band now, so this stagger is the only thing keeping
  // identical rings off each other: owned lowest, then hover, then selection.
  // renderOrder already agrees, and neither ring writes depth.
  const y = ring === selectRing ? RIM_Y.select : RIM_Y.hover;
  ring.position.set(w.x, (elev[p.id] || 0) + y, w.z);
  ring.visible = true;
}

function spanOf(list) {
  let maxR = 1;
  for (const p of list) {
    const w = axialToWorld(p.q, p.r);
    maxR = Math.max(maxR, Math.hypot(w.x, w.z));
  }
  return maxR;
}

// `focus` is what the camera should OPEN on -- the country the player knows.
// `all` is the whole board, fog included, and it sets how far back the player
// may pull. These were one number until a player could not zoom out far enough
// to see their own world: framing tight on seven known hexes had also capped
// the zoom at seven hexes. Being able to look at the unpainted board is the
// entire point of drawing it -- "the world is wider than this" has to be
// something you can go and LOOK at.
function frameBoard(focus, all) {
  const near = spanOf(focus);
  const far = spanOf(all && all.length ? all : focus);

  const dist = THREE.MathUtils.clamp(near * 2.1 + 5, 6, 38);
  controls.target.set(0, 0, 0);
  camera.position.set(0, dist * 0.72, dist * 0.66);
  controls.update();

  applyBoardLimits(all && all.length ? all : focus, far);
}

// Zoom and pan limits belong to the BOARD, not to what has been discovered on
// it, so these are refreshed on every build rather than only when the camera
// is reframed.
function applyBoardLimits(all, farSpan) {
  const far = farSpan != null ? farSpan : spanOf(all);
  controls.maxDistance = THREE.MathUtils.clamp(far * 3.0 + 10, 14, 120);
  // Keep the focus point over the board plus a margin, so the player cannot
  // pan off into empty space and lose the world.
  panBounds = { r: far + 2 };
  // Push atmospheric fog out past the far corner of the board at full zoom.
  if (scene.fog) {
    scene.fog.near = far * 4 + 20;
    scene.fog.far = far * 9 + 60;
  }
}

function clampPan() {
  if (!panBounds) return;
  const t = controls.target;
  const d = Math.hypot(t.x, t.z);
  if (d > panBounds.r) {
    const k = panBounds.r / d;
    t.x *= k; t.z *= k;
  }
  t.y = 0;
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
      g.dataset.id = p.id;
      if (mark.sub) {
        // A composite mark (today: your seat, which wears a house AND reports
        // its work) is ONE positioned element with two glyphs inside it.
        // positionLabels() places exactly one node per tile id, so a second
        // top-level span would be placed at the same point and overlap it.
        g.classList.add("pair");
        for (const part of [mark, mark.sub]) {
          const el = document.createElement("span");
          el.className = "part " + part.cls;
          el.textContent = part.glyph;
          g.appendChild(el);
        }
      } else {
        g.textContent = mark.glyph;
      }
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
  // Sighted ground is not a place yet: seen across the water, but with no
  // stats, no flavor and no actions to give. It takes no hover ring and no
  // selection -- and nothing is hidden by that, because the player can see
  // exactly as much as their people can.
  return p && isCharted(p.id) ? p : null;
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
    // PIECES PICK FIRST, then the ground falls through. An army is an object
    // AT a hex, not a property OF one -- so clicking the disc selects the
    // army, and clicking the ground beside it selects the hex.
    const r2 = stageEl.getBoundingClientRect();
    ndc.x = ((e.clientX - r2.left) / r2.width) * 2 - 1;
    ndc.y = -((e.clientY - r2.top) / r2.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const pieceKey = pickPiece(raycaster);
    if (pieceKey && hooks.onPickPiece) { hooks.onPickPiece(pieceKey); return; }
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

// `?perf=1` publishes the renderer's own counters plus a rolling frame time on
// `window.__mapPerf`. It exists because "can the board afford more set
// dressing?" is a question this project will keep asking, and the honest answer
// is a measurement rather than an argument about instancing. Sits beside
// ?glcheck=1, ?map=2d, ?era=, ?continent= -- a lens, never a game surface.
let perfOn = false;
try { perfOn = new URLSearchParams(location.search).get("perf") === "1"; } catch (e) {}
const frameMs = [];
let lastFrame = 0;

function publishPerf(now) {
  if (frameMs.length > 120) frameMs.shift();
  if (lastFrame) frameMs.push(now - lastFrame);
  lastFrame = now;
  const sorted = frameMs.slice().sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  // Instance counts are the number that actually matters for set dressing:
  // draw calls stay flat as props multiply (one InstancedMesh per PART), so
  // the cost shows up in instances and triangles, never in the call count.
  let instances = 0, meshes = 0;
  if (worldGroup) {
    worldGroup.traverse((o) => {
      if (o.isInstancedMesh) { instances += o.count; meshes++; }
    });
  }
  // Under the same flag, hand out the live prop group and the transition
  // trigger. The sink-and-rise is the one moving thing on the board, so it is
  // the one thing a screenshot cannot check -- this makes it assertable
  // instead, which is the standing contract for anything the pane cannot see.
  window.__mapDebug = { group: worldGroup, changeHexes, fxActive: () => !!fx };
  window.__mapPerf = {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    instancedMeshes: meshes,
    instances,
    medianFrameMs: Math.round(med * 100) / 100,
    fps: med > 0 ? Math.round(1000 / med) : 0,
    postprocessing: !!composer,
  };
}

function loop() {
  rafId = requestAnimationFrame(loop);
  controls.update();
  clampPan();
  // renderer.info resets itself on every render CALL, and the composer makes
  // several per frame -- so reading it afterwards reports the last post pass
  // (1 call, 1 triangle) rather than the board. Accumulate across the whole
  // frame instead, and reset by hand.
  if (perfOn) { renderer.info.autoReset = false; renderer.info.reset(); }
  if (composer) composer.render();
  else renderer.render(scene, camera);
  positionLabels();
  tickPieces(performance.now());
  stepFx(performance.now());
  if (perfOn) publishPerf(performance.now());
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

// Undo initStage() completely, so a later init starts from a clean element
// rather than layering a second canvas over a live one. Everything acquired
// up there is released here, in reverse order.
export function dispose() {
  disposePieces();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
  if (resizeListener) { window.removeEventListener("resize", resizeListener); resizeListener = null; }
  if (controls && controls.dispose) controls.dispose();
  if (worldGroup) disposeTree(worldGroup);
  if (composer && composer.dispose) composer.dispose();
  if (renderer) renderer.dispose();
  if (canvasEl) canvasEl.remove();
  if (labelLayer) labelLayer.remove();
  renderer = scene = camera = controls = composer = null;
  worldGroup = null;
  canvasEl = labelLayer = stageEl = null;
  started = false;
}

// Console handle for review, matching the spike's affordance.
export function debugHandle() {
  return { scene, camera, renderer, controls, composer, places };
}
