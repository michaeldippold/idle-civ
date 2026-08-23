// Idle Civ — 3D map rendering spike (guide: spikes/threejs-hex-map-guide.md).
//
// Renders a world produced by the game's REAL generator (src/map/generate.js)
// with the guide's stack: ACES tonemapping, HDRI environment lighting, merged
// vertex-colored terrain with derived elevation, fitted sun shadows,
// instanced props, and a postprocessing chain (SMAA + N8AO + subtle bloom).
// The sim knows nothing of any of this — elevation and all prop placement are
// paint, derived deterministically from tile ids.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer, RenderPass, EffectPass, SMAAEffect, BloomEffect }
  from "postprocessing";
import { generateMap } from "../src/map/generate.js";
import { axialToWorld, worldToAxialRounded } from "./hex.js";
import { buildTerrain, buildHighlight } from "./terrain.js";
import { buildProps } from "./props.js";

// ---------- The world: the game's generator, a spike-local spec ------------
const seed = Number(new URLSearchParams(location.search).get("seed")) || 12345;
const spec = {
  radius: 4,
  tileNoun: { singular: "holdfast", plural: "holdfasts" },
  terrains: ["plains", "forest", "hills", "river", "water"],
  seats: ["hillClans", "riverKingdom", "saltNomads"],
  minors: {
    count: 5, strength: [3, 9], walls: [0, 4],
    stock: { food: [20, 60] },
    names: ["a", "b", "c", "d", "e"],
  },
};
const world = generateMap(seed, spec);
const tileCount = Object.keys(world.places).length;

// ---------- Renderer (§2) --------------------------------------------------
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// A pleasant void, not the HDRI: deep blue-grey with a matching fog falloff.
const VOID = new THREE.Color(0x11161f);
scene.background = VOID;
scene.fog = new THREE.Fog(VOID, 28, 70);

// ---------- Camera rig (§4) ------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  38, window.innerWidth / window.innerHeight, 0.5, 300);
camera.position.set(0, 11, 10);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);
// Pitch clamped 40–65° from horizontal => polar 25–50° from vertical.
controls.minPolarAngle = THREE.MathUtils.degToRad(25);
controls.maxPolarAngle = THREE.MathUtils.degToRad(50);
controls.minDistance = 5;      // zoom moves along the view vector
controls.maxDistance = 32;
controls.screenSpacePanning = false;

// Pan clamp: keep the focus point on the board plus a margin.
const bounds = new THREE.Box2(
  new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
for (const id in world.places) {
  const p = world.places[id];
  const w = axialToWorld(p.q, p.r);
  bounds.expandByPoint(new THREE.Vector2(w.x, w.z));
}
bounds.expandByScalar(1.5);
function clampPan() {
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, bounds.min.x, bounds.max.x);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, bounds.min.y, bounds.max.y);
  controls.target.y = 0;
}

// ---------- Lighting: HDRI environment + one sun (§3) ----------------------
let envStatus = "loading";
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
new RGBELoader().load(
  "./assets/kloofendal_48d_partly_cloudy_puresky_1k.hdr",
  (hdr) => {
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
    envStatus = "hdri";
    updateHud();
  },
  undefined,
  () => {
    // Fallback rig if the HDRI fails to load: hemisphere + fill.
    scene.add(new THREE.HemisphereLight(0xbfd6f0, 0x6b5a40, 1.1));
    envStatus = "fallback-hemi";
    updateHud();
    console.warn("[spike3d] HDRI failed to load; using hemisphere fallback rig");
  });

const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

// Shadow frustum fitting (§3). Deviation from the guide: the map is a
// radius-4 disk (~16 world units across), so one static fit around the origin
// covers every camera position — no per-settle refits needed at this scale.
function fitShadowCamera(focus, radius) {
  const cam = sun.shadow.camera;
  sun.target.position.copy(focus);
  sun.target.updateMatrixWorld();
  sun.position.copy(focus).add(new THREE.Vector3(-60, 90, 40).normalize().multiplyScalar(radius * 3));
  cam.left = -radius; cam.right = radius;
  cam.top = radius; cam.bottom = -radius;
  cam.near = 1; cam.far = radius * 8;
  cam.updateProjectionMatrix();
  sun.shadow.needsUpdate = true;
}
fitShadowCamera(new THREE.Vector3(0, 0, 0), 11);

// ---------- Terrain, water, props (§5, §8) ---------------------------------
const { landMesh, wetMesh, elev } = buildTerrain(world);
scene.add(landMesh, wetMesh);
scene.add(buildProps(world, elev));

const highlight = buildHighlight();
scene.add(highlight);

// ---------- Post stack (§6): SMAA + AO + subtle bloom ----------------------
const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType,
});
composer.addPass(new RenderPass(scene, camera));

let aoStatus = "off";
try {
  const { N8AOPostPass } = await import("n8ao");
  const ao = new N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight);
  ao.configuration.aoRadius = 0.9;
  ao.configuration.intensity = 3.0;
  ao.configuration.distanceFalloff = 0.9;
  ao.configuration.halfRes = true;
  composer.addPass(ao);
  aoStatus = "n8ao";
} catch (e) {
  aoStatus = "unavailable";
  console.warn("[spike3d] N8AO unavailable, continuing without AO:", e);
}

composer.addPass(new EffectPass(camera,
  new SMAAEffect(),
  new BloomEffect({ intensity: 0.25, luminanceThreshold: 0.9 }),
));
// DOF deliberately omitted (guide §6 lists it as optional-if-restrained;
// the small board reads fine without it and it is the twitchiest effect).

// ---------- Picking: ground plane, not raycast-the-mesh (§5.3) -------------
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

function pickTile(clientX, clientY) {
  ndc.x = (clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  const { q, r } = worldToAxialRounded(hit.x, hit.z);
  const id = q + "," + r;
  return world.places[id] || null;
}

let hovered = null;
canvas.addEventListener("pointermove", (e) => {
  const p = pickTile(e.clientX, e.clientY);
  hovered = p;
  if (p) {
    const w = axialToWorld(p.q, p.r);
    highlight.position.set(w.x, elev[p.id] + 0.02, w.z);
    highlight.visible = true;
  } else {
    highlight.visible = false;
  }
});
canvas.addEventListener("pointerleave", () => { highlight.visible = false; hovered = null; });

// Click = pointerdown/up with no meaningful drag in between.
let downAt = null;
canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 5) return;
  const p = pickTile(e.clientX, e.clientY);
  if (p) {
    console.log("[spike3d] picked tile", p.id,
      { terrain: p.terrain, adversary: p.adversary, minor: p.minor?.name ?? null,
        home: p.id === world.home });
  }
});

// ---------- HUD (§10) ------------------------------------------------------
// Function declaration + lazy DOM lookups: async load callbacks (HDRI) can
// fire while the module is still suspended at the top-level await above, so
// nothing here may live in the temporal dead zone.
function updateHud() {
  document.getElementById("hud-seed").textContent = String(seed);
  document.getElementById("hud-tiles").textContent = String(tileCount);
  document.getElementById("hud-ao").textContent = aoStatus + " · env " + envStatus;
}
updateHud();

// ---------- Resize ---------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Loop -----------------------------------------------------------
// Always-running loop: acceptable for the spike (§11 on-demand rendering is
// noted as the production path).
let fpsEma = 60, lastT = performance.now(), lastHud = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(t - lastT, 100);
  lastT = t;
  fpsEma = fpsEma * 0.95 + (1000 / Math.max(dt, 1)) * 0.05;
  if (t - lastHud > 500) {
    document.getElementById("hud-fps").textContent = fpsEma.toFixed(0);
    lastHud = t;
  }
  controls.update();
  clampPan();
  composer.render();
}
requestAnimationFrame(loop);

// Handy for console poking during review.
window.__spike = { scene, camera, renderer, composer, controls, world, seed };
console.log("[spike3d] world ready:", tileCount, "tiles, seed", seed);
