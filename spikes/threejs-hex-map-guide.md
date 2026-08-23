# Building a Civ-Style Hex Map with Three.js

Implementation guidance for a browser-based, Civ-style hex map using plain HTML/CSS/JS
plus Three.js. No build step, no engine, no compile-to-WASM.

Written to be consumed by a coding agent. Directives are normative; rationale is included
where it changes implementation decisions.

> **Spike addendum (2026-08-22, after building this for real — see `/spike3d/`):** two paths in
> this guide were stale as written. (1) `postprocessing@6.35.3`'s module entry is
> `build/index.js`, not `build/postprocessing.esm.js`. (2) `N8AOPostPass` is NOT part of
> `postprocessing` — it lives in the separate `n8ao` package (pinned 2.0.1 works), which also
> needs a `three/examples/jsm/` alias in the import map. Everything else held up; the lighting
> thesis (§0, §2–3, §6) was confirmed with primitive-geometry props alone.

---

## 0. What we're actually replicating

The reference look (Civ VI / Humankind style) is **not** 2D art faking depth. It is:

- A flat, horizontal hex grid in world space
- A **perspective** camera pitched down ~45–60°
- Real geometry with depth-sorted occlusion and cast shadows
- A world-curvature vertex shader that bows distant terrain downward, producing the
  "board sitting on a table" read

The *simulation* stays 2D — an axial hex grid with elevation as a per-tile attribute.
Only the *rendering* is 3D. Keep this separation; see §8.

**Do not** attempt this in Canvas2D. Everything that reads as "expensive" in the
reference is a lighting and post-processing property. Those do not exist in 2D, so you
would pay for them in hand-authored art instead. WebGL costs engineering; Canvas2D costs
art hours. Engineering is the cheaper currency for a small team.

---

## 1. Project setup — no build tooling

Use ES modules with an import map. Static file, refresh to iterate.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #0b0d10; }
    #app { position: fixed; inset: 0; }
    canvas { display: block; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/",
      "postprocessing": "https://unpkg.com/postprocessing@6.35.3/build/postprocessing.esm.js"
    }
  }
  </script>
</head>
<body>
  <div id="app"><canvas id="gl"></canvas></div>
  <div id="ui"></div>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

Pin exact versions. `postprocessing` is version-sensitive against Three's internals —
if effects render black or throw on construction, that's a version mismatch, not a
usage error.

Serve over HTTP (`python3 -m http.server`), not `file://`. Module loading and texture
CORS both require it.

---

## 2. Renderer and tonemapping — do this first

This is the highest quality-per-line-of-code change available. Untonemapped WebGL output
has a flat, blown-out quality that reads as "someone's demo." ACES immediately reads as
film.

```js
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('gl'),
  antialias: false,          // post-processing stack supplies AA; see §6
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap at 2, always
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

Never let `pixelRatio` exceed 2. On a 3x phone display uncapped, fragment cost goes up
~2.25x for no perceptible gain.

---

## 3. Lighting — HDRI environment, not ambient light

An environment map gives sky-colored light on upward faces and warm bounce underneath.
That directional color variation is most of what the eye reads as "real lighting."
Cranking `AmbientLight` cannot reproduce it and will look muddy.

```js
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

new RGBELoader().load('./assets/env/kloofendal_partly_cloudy_1k.hdr', (hdr) => {
  const env = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = env;          // lighting contribution
  // scene.background = env;        // usually NOT wanted — use a gradient/void instead
  hdr.dispose();
  pmrem.dispose();
});
```

Use a **1k** HDRI. 2k+ is wasted for IBL and costs load time. Poly Haven has good CC0
options. `kloofendal_partly_cloudy` and `symmetrical_garden` both work for this look.

Add one sun for shadows and specular definition:

```js
const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
sun.position.set(-60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;   // fixes shadow acne on the hex side walls specifically
scene.add(sun);
```

### Shadow frustum fitting — required

Three's default directional shadow camera covers a large area at low effective
resolution and looks like garbage. Refit it to the visible region whenever the camera
moves:

```js
function fitShadowCamera(sun, focusPoint, radius) {
  const cam = sun.shadow.camera;
  sun.target.position.copy(focusPoint);
  sun.target.updateMatrixWorld();
  sun.position.copy(focusPoint).add(new THREE.Vector3(-60, 90, 40));
  cam.left = -radius; cam.right = radius;
  cam.top = radius;   cam.bottom = -radius;
  cam.near = 1;       cam.far = radius * 4;
  cam.updateProjectionMatrix();
  sun.shadow.needsUpdate = true;
}
```

Call on camera-settle, not every frame. `radius` should track camera zoom height —
tight when zoomed in, wider when zoomed out.

---

## 4. Camera

```js
const camera = new THREE.PerspectiveCamera(38, aspect, 1, 2000);
```

Narrow-ish FOV (35–45°). Wide FOV exaggerates the perspective gradient and breaks the
diorama read.

Constrain the rig deliberately:

- **Pitch:** clamp to ~40–65°. Below 40° the terrain silhouette falls apart; above 65°
  it flattens into a top-down map and loses all the 3D benefit.
- **Zoom:** move the camera along its view vector; do not change FOV.
- **Pan:** clamp the focus point to map bounds plus a small margin.
- **Yaw:** allow it, but snap to 60° increments on release if you want a boardgame feel.

Use `OrbitControls` with `enableDamping: true` as a starting rig, then replace it once
the interaction model firms up. It is a prototyping tool, not a shipping camera.

---

## 5. Terrain geometry

### 5.1 Chunked merged meshes — never one mesh per hex

One mesh per hex is the single most common fatal mistake. A 100×100 map is 10,000 draw
calls and will not hit frame rate on any hardware.

Build **chunks** of ~32×32 tiles into a single `BufferGeometry`:

- Each hex contributes a 6-triangle top fan (7 verts: center + 6 corners)
- Side walls (quads) only where a neighbor is lower — skip interior seams entirely
- **Vertex colors** for biome tint, uploaded as a `color` attribute
- One shared tiling detail normal map across all chunks for surface texture

Target: 20–60 draw calls for the whole terrain.

Rebuild only the affected chunk when a tile changes. Keep a `chunkDirty` set and flush
it once per frame.

### 5.2 Hex math

Use axial coordinates. Do not invent your own layout math — Red Blob Games' hex grid
reference is the canonical source and covers every case you will hit.

Pointy-top axial → world:

```js
const HEX_SIZE = 1.0;
const SQRT3 = Math.sqrt(3);

function axialToWorld(q, r) {
  return {
    x: HEX_SIZE * (SQRT3 * q + SQRT3 / 2 * r),
    z: HEX_SIZE * (1.5 * r),
  };
}
```

Pick pointy-top or flat-top **once** and write it down. Silently mixing conventions
between the mesher, the picker, and the pathfinder produces bugs that look like
rendering artifacts and cost hours.

### 5.3 Picking — do not raycast the terrain

Raycasting a merged terrain mesh is slow and gives you a triangle, not a tile. Instead
intersect the screen ray with a flat ground plane at y=0, then convert world → axial:

```js
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const hit = new THREE.Vector3();

function pickTile(ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  return worldToAxialRounded(hit.x, hit.z);   // cube-round; see Red Blob
}
```

Exact, allocation-free, and independent of terrain complexity.

**Caveat:** with elevation and world curvature, the flat-plane hit drifts from the
visual surface at high camera pitch. If that becomes noticeable, either raise the plane
to the picked tile's elevation and re-intersect once, or fall back to a GPU picking pass
that renders tile IDs to an offscreen target. Start with the flat plane; only escalate
if playtesting shows the drift.

---

## 6. Post-processing

Use [`postprocessing`](https://github.com/pmndrs/postprocessing) rather than Three's
bundled `EffectComposer`. It merges effects into fewer fullscreen passes, which matters
substantially on integrated graphics.

```js
import { EffectComposer, RenderPass, EffectPass, SMAAEffect,
         BloomEffect, DepthOfFieldEffect, N8AOPostPass } from 'postprocessing';

const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType,   // required for correct HDR + tonemapping
});
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera,
  new SMAAEffect(),
  new BloomEffect({ intensity: 0.35, luminanceThreshold: 0.85 }),
));
```

Priority order by perceived-quality-per-hour:

1. **Ambient occlusion (highest impact).** This is what makes trees and buildings look
   *seated* in the terrain rather than floating on it. Its absence is the thing users
   can never quite name. `N8AOPostPass` is a good drop-in; SSAO/GTAO also fine.
2. **SMAA.** Cheaper than MSAA and composes correctly with the rest of the stack. This
   is why `antialias: false` on the renderer.
3. **Depth of field, subtle.** Slight blur at the far edge of the map sells the diorama
   read harder than almost anything else. Keep it *restrained* — the moment it is
   noticeable it is wrong. Large focal range, small bokeh scale.
4. **Bloom, very subtle.** Threshold high. Only water speculars and UI glows should
   trigger it.

Ship a quality toggle that drops AO and DOF first. Integrated GPUs will need it.

---

## 7. The board-on-a-table curvature

The signature falloff is vertex displacement based on distance from the camera focus
point. Patch it into the standard material rather than writing a custom shader, so you
keep PBR lighting, shadows, and fog.

```js
const uCurve = { value: 0.0015 };
const uFocus = { value: new THREE.Vector2(0, 0) };

function applyCurvature(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCurve = uCurve;
    shader.uniforms.uFocus = uFocus;
    shader.vertexShader =
      'uniform float uCurve;\nuniform vec2 uFocus;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wp = modelMatrix * vec4(transformed, 1.0);
         float d = distance(wp.xz, uFocus);
         transformed.y -= d * d * uCurve;`
      );
  };
  material.customProgramCacheKey = () => 'curved';
}
```

Update `uFocus.value` to the camera's ground focus point each frame.

### Gotchas — these will each cost an afternoon

- **Shadows render through a separate depth material.** Unless you apply the *identical*
  displacement to `customDepthMaterial` (and `customDistanceMaterial` for point lights),
  shadows stay flat while terrain curves away and everything visually detaches.
- **Instanced props need the same displacement**, applied after `instanceMatrix`, or
  trees will float above the bent ground.
- **Curvature breaks frustum culling.** Displaced vertices leave their CPU-side bounding
  boxes and chunks pop out at screen edges. Fix by inflating chunk bounding spheres
  (`geometry.boundingSphere.radius *= 1.5`) or disabling `frustumCulled` on terrain
  chunks and culling by axial range yourself.
- **Do not displace UI-anchored objects** with this shader. Compute their screen
  position from the same curve on the CPU instead, or labels will detach from cities.

Tune `uCurve` by eye at your typical zoom. Too much reads as a fisheye bug.

---

## 8. Props and instancing

Every repeated prop — trees, rocks, resource icons, unit models — goes in an
`InstancedMesh`. One draw call for all trees on the map.

```js
const trees = new THREE.InstancedMesh(treeGeo, treeMat, MAX_TREES);
trees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
trees.castShadow = true;
trees.receiveShadow = false;   // props rarely need to receive; saves fill
```

- Set `trees.count` to the live number; do not resize the buffer per change.
- Add per-instance color/scale jitter via `InstancedBufferAttribute` so repetition is
  less obvious. Small random Y-rotation and ±10% scale does a lot.
- Group by biome so you can hide whole categories cheaply.

---

## 9. Architecture — keep simulation and rendering separate

**Non-negotiable.** Hex state, adjacency, movement, visibility, and pathfinding must not
know Three.js exists.

```
src/
  sim/          # pure JS, zero Three.js imports
    hex.js         # axial coords, neighbors, distance, rounding
    world.js       # tile store, elevation, biome, ownership
    rules.js       # movement, borders, visibility
  render/
    scene.js       # renderer, camera, lights, composer
    terrain.js     # chunk mesher
    props.js       # instanced meshes
    curvature.js   # shader patch
  render2d/
    debug.js       # Canvas2D top-down view of the same sim
  ui/            # DOM overlay
  main.js
```

Two payoffs:

1. **Prototype game logic against the Canvas2D debug view**, where iteration is instant
   and nothing is hidden behind lighting. Swap renderers to validate the boundary.
2. It is the escape hatch. If the 3D turns out to be more maintenance than wanted, the
   game still exists.

Enforce it: `sim/` importing `three` is a bug.

---

## 10. UI in HTML/CSS — the real web advantage

Overlay actual DOM on the canvas. Game UI is famously miserable in engines; here you get
a mature layout engine for free. Flexbox, `backdrop-filter: blur()`, SVG icons, real web
typography, CSS transitions.

**Lean on this hard.** Sharp type and well-spaced panels read as "expensive" faster than
anything in the 3D scene.

For world-anchored labels (city names, unit banners), project world → screen on the CPU
and position DOM nodes:

```js
const v = worldPos.clone();
v.y -= curveOffsetAt(v.x, v.z);        // match the shader's displacement
v.project(camera);
el.style.transform =
  `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
el.style.display = v.z > 1 ? 'none' : '';   // cull behind camera
```

Use `transform` only — never `left`/`top` — to stay on the compositor. Batch all label
updates into one pass per frame; interleaving reads and writes causes layout thrash.

---

## 11. On-demand rendering

Turn-based means the camera is static most of the time. Do not run an unconditional
`requestAnimationFrame` render loop.

```js
let needsRender = true;
const invalidate = () => { needsRender = true; };

function loop() {
  requestAnimationFrame(loop);
  const animating = controls.update() || tweens.active();
  if (!needsRender && !animating) return;
  composer.render();
  needsRender = false;
}
```

Call `invalidate()` on camera move, selection change, tile change, or animation start.
The laptop fans staying off is itself a quality signal.

---

## 12. The actual risk: art coherence

The rendering pipeline above is a few weekends and well-trodden. What sinks these
projects is **assets** — specifically, mixing sources with inconsistent scale, palette,
and stylization. Six free tree models from four artists will look cheap under the best
lighting anyone can write.

- Target **stylized**, not photorealistic. The reference look is stylized. Photorealism
  is unwinnable on this budget and stylized is genuinely achievable.
- Source options: Kenney and Quaternius (CC0, low-poly, internally consistent kits);
  Synty packs ($20–60, what many shipped indie games actually use).
- **Validate three or four real assets in your actual lit scene before building any
  systems around them.** Check silhouette at gameplay zoom, scale against a hex, and
  palette against terrain vertex colors.
- Prefer glTF/GLB with Draco or Meshopt compression. Use `KTX2Loader` for textures if
  the map gets large; it cuts GPU memory several-fold over PNG.

A coherent direction beats expensive assets every time.

---

## 13. Build order

Each step should be visually verifiable before moving on.

1. Import map + renderer + ACES + a single lit cube on a plane. Confirm tonemapping.
2. HDRI environment. Confirm the lighting quality delta.
3. Axial hex math + flat single-color chunked terrain, no elevation.
4. Plane-based picking with a hover highlight. Confirm coordinates are correct.
5. Elevation + side walls + vertex-color biomes.
6. Camera rig with pitch/zoom/pan clamps.
7. Sun + fitted shadow frustum.
8. Instanced props.
9. Post stack: SMAA → AO → subtle DOF → subtle bloom.
10. Curvature shader, plus the depth-material and culling fixes from §7.
11. DOM UI overlay and world-anchored labels.
12. On-demand rendering.

If a step looks wrong, fix it there. These issues compound and become much harder to
isolate once the post stack is on top.

---

## Quick reference — highest impact, least effort

| Change | Effort | Impact |
|---|---|---|
| ACES tonemapping | 1 line | Very high |
| HDRI environment map | ~10 lines | Very high |
| Ambient occlusion pass | ~5 lines | Very high |
| Fitted shadow frustum | ~15 lines | High |
| Instanced props | moderate | Perf-critical |
| Subtle DOF | ~5 lines | High |
| Polished DOM UI | ongoing | Very high |
| Curvature shader | ~30 lines + gotchas | Signature look |

---

## External references

- Red Blob Games — Hexagonal Grids: <https://www.redblobgames.com/grids/hexagons/>
- Three.js manual: <https://threejs.org/manual/>
- `postprocessing`: <https://github.com/pmndrs/postprocessing>
- Poly Haven (CC0 HDRIs): <https://polyhaven.com/hdris>
- Kenney (CC0 assets): <https://kenney.nl/assets>
- Quaternius (CC0 assets): <https://quaternius.com/>
