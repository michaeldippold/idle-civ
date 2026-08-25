// 4b calibration rig (UNTRACKED, deleted after tuning): replicates the owner's
// 2026-08-25 screenshot -- Bronze, ~10 hexes at capacity, stores at cap, ZERO
// military -- and runs it unattended to measure whether the economy can break
// an undefended realm. Harness-style stubs + real modules.
import * as mCompile from "./src/content/compile.js";
import * as mConfig from "./src/core/config.js";
import * as mRng from "./src/core/rng.js";
import * as mLib from "./src/content/lib.js";
import * as mState from "./src/core/state.js";
import * as mDerived from "./src/core/derived.js";
import * as mCombat from "./src/sim/combat.js";
import * as mEvents from "./src/sim/events.js";
import * as mStep from "./src/core/step.js";
import * as mActions from "./src/core/actions.js";
import * as mEra from "./src/sim/era.js";
import * as mLog from "./src/ui/log.js";
import * as mMapCore from "./src/map/map.js";
import * as mMapGen from "./src/map/generate.js";
import * as mPersist from "./src/core/persist.js";

function fakeEl() {
  const el = {
    children: [], dataset: {}, style: {}, _text: "", _html: "",
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, appendChild(c) { this.children.push(c); return c; },
    prepend(c) { this.children.unshift(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    querySelectorAll() { return []; }, querySelector() { return fakeEl(); },
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    get firstChild() { return this.children[0]; },
    get lastChild() { return this.children[this.children.length - 1]; },
    scrollTop: 0, scrollHeight: 0,
  };
  return el;
}
const store = {};
globalThis.document = { getElementById: () => fakeEl(), createElement: () => fakeEl(), querySelector: () => fakeEl() };
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = { addEventListener() {} };
globalThis.confirm = () => true;
globalThis.location = { reload() {} };

const MODS = [mConfig, mRng, mLib, mCompile, mState, mDerived, mCombat, mEvents,
  mStep, mActions, mEra, mLog, mMapCore, mMapGen, mPersist];
const api = new Proxy({}, {
  get: (_, k) => { for (const m of MODS) if (k in m) return m[k]; return undefined; },
  set: (_, k, v) => { if (k === "S") { mState.setS(v); return true; } throw new Error("set " + String(k)); },
});
const S = () => api.S;

// Build the screenshot realm on a fresh random world.
function buildRealm() {
  api.S = api.freshState();
  S().era = "bronze";
  api.initAdversaries();
  api.ensureMap();
  // Contact made (Bronze names its raiders); standing default.
  // Expand: claim land hexes outward from what the trio granted until 10 held.
  const world = mMapCore.world;
  let frontier = [...S().map.owned];
  while (S().map.owned.length < 10 && frontier.length) {
    const id = frontier.shift();
    const p = world.places[id];
    if (!p) continue;
    for (const n of p.adj) {
      if (S().map.owned.length >= 10) break;
      const q = world.places[n];
      if (!q || q.water || S().map.owned.includes(n)) continue;
      if (api.capOf ? false : false) continue;
      S().map.owned.push(n);
      frontier.push(n);
    }
  }
  // Everyone at capacity, working their ground's default.
  for (const id of S().map.owned) {
    const cap = api.capOf(id);
    S().map.pop[id] = cap;
    const prod = api.hexProduces ? api.hexProduces(id) : null;
    const res = prod && prod.length ? prod[0] : "food";
    S().map.work[id] = res;
  }
  api.syncDominion?.();
  api.syncCharted?.();
  api.syncPopMirror();
  // Storage rank of the screenshot: caps at 350.
  S().builds.granary = 3; S().builds.woodshed = 3; S().builds.stoneYard = 3;
  S().res.food = 300; S().res.wood = 300; S().res.stone = 300;
  S().seen.mapCharted = true;
  return S().pop;
}

const runMin = (mins) => { for (let i = 0; i < mins * 60 * 5; i++) api.step(); };

function trial(label, minutes, runs) {
  let survived = 0, popSum = 0, hexSum = 0, minPopSum = 0, minFoodSum = 0;
  for (let r = 0; r < runs; r++) {
    const startPop = buildRealm();
    let minPop = startPop, minFood = S().res.food;
    for (let m = 0; m < minutes; m++) {
      runMin(1);
      if (S().pop < minPop) minPop = S().pop;
      if (S().res.food < minFood) minFood = S().res.food;
      if (S().dead) break;
    }
    if (!S().dead) survived++;
    popSum += S().pop;
    hexSum += S().map ? S().map.owned.length : 0;
    minPopSum += minPop; minFoodSum += minFood;
  }
  console.log(
    `${label.padEnd(40)} endPop=${(popSum / runs).toFixed(1)} ` +
    `minPop=${(minPopSum / runs).toFixed(1)} minFood=${(minFoodSum / runs).toFixed(0)} ` +
    `hexes=${(hexSum / runs).toFixed(1)} alive=${survived}/${runs}`
  );
}

const startPop = buildRealm();
console.log(`realm: pop=${startPop} hexes=${S().map.owned.length} caps food=${api.caps().food} rates ~ food +${api.rates().food?.toFixed?.(2)}`);

console.log("\n--- CURRENT CONSTANTS, unattended, zero military ---");
trial("60 min as shipped", 60, 8);
trial("120 min as shipped", 120, 8);

// Candidate retunes -- mutate CONFIG in place between trials.
const C = api.CONFIG;
const base = { sizeScale: C.raidSizePopScale, toll: C.raidTollShare, freq: C.conflictBaseChance };

console.log("\n--- CANDIDATE A: raidSizePopScale 400 -> 120 ---");
C.raidSizePopScale = 120;
trial("60 min", 60, 8); trial("120 min", 120, 8);
C.raidSizePopScale = base.sizeScale;

console.log("\n--- CANDIDATE B: A + tollShare 0.05 -> 0.075 ---");
C.raidSizePopScale = 120; C.raidTollShare = 0.075;
trial("60 min", 60, 8); trial("120 min", 120, 8);
C.raidSizePopScale = base.sizeScale; C.raidTollShare = base.toll;

console.log("\n--- CANDIDATE C: B + baseChance x1.5 ---");
C.raidSizePopScale = 120; C.raidTollShare = 0.075; C.conflictBaseChance = base.freq * 1.5;
trial("60 min", 60, 8); trial("120 min", 120, 8);
C.raidSizePopScale = base.sizeScale; C.raidTollShare = base.toll; C.conflictBaseChance = base.freq;

// The larder is the shield: attack the growth budget, not just the raids.
const base2 = { gfc: C.growthFoodCost, gps: C.growthCostPopScale, max: C.raidTollMax };

console.log("");
console.log("--- CANDIDATE D: B + growthFoodCost 8 -> 14 ---");
C.raidSizePopScale = 120; C.raidTollShare = 0.075; C.growthFoodCost = 14;
trial("60 min", 60, 8); trial("120 min", 120, 8);
C.growthFoodCost = base2.gfc;

console.log("");
console.log("--- CANDIDATE E: B + growthCostPopScale 60 -> 30 ---");
C.growthCostPopScale = 30;
trial("60 min", 60, 8); trial("120 min", 120, 8);
C.growthCostPopScale = base2.gps;

console.log("");
console.log("--- CANDIDATE F: size 100, toll .075, gfc 12, max .75 ---");
C.raidSizePopScale = 100; C.raidTollShare = 0.075; C.growthFoodCost = 12; C.raidTollMax = 0.75;
trial("60 min", 60, 8); trial("120 min", 120, 8);
C.raidSizePopScale = base.sizeScale; C.raidTollShare = base.toll;
C.growthFoodCost = base2.gfc; C.raidTollMax = base2.max;
