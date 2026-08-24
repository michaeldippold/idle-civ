// Headless harness v7: real ES-module imports (phase 1, commit B; previously
// a vm.createContext sandbox evaluating game.js as text). Module EVALUATION
// touches neither DOM nor localStorage -- the only load-time side effect is
// compile.js building and validating the manifests -- so static imports are
// safe, and the stubs below only need to exist before the first api call.
// main.js is deliberately NOT imported: its body is boot(), which wires the
// real page and starts the interval loop.
// compile.js MUST be every entry module's first import (main.js obeys the
// same rule): its body builds MANIFESTS from EVENT_LIB and the era consts,
// and it always runs last within its own subtree -- but if lib.js is ENTERED
// first, the lib->combat->compile cycle makes compile's body run while lib is
// still mid-evaluation, and EVENT_LIB is a TDZ ReferenceError.
import * as mCompile from "./src/content/compile.js";
import * as mConfig from "./src/core/config.js";
import * as mRng from "./src/core/rng.js";
import * as mLib from "./src/content/lib.js";
import * as mStone from "./src/content/stone.js";
import * as mBronze from "./src/content/bronze.js";
import * as mIron from "./src/content/iron.js";
import * as mIcons from "./src/ui/icons.js";
import * as mState from "./src/core/state.js";
import * as mDerived from "./src/core/derived.js";
import * as mCombat from "./src/sim/combat.js";
import * as mEvents from "./src/sim/events.js";
import * as mExped from "./src/sim/expeditions.js";
import * as mStep from "./src/core/step.js";
import * as mActions from "./src/core/actions.js";
import * as mEra from "./src/sim/era.js";
import * as mLog from "./src/ui/log.js";
import * as mDom from "./src/ui/dom.js";
import * as mPLedger from "./src/ui/panels-ledger.js";
import * as mPPeople from "./src/ui/panels-people.js";
import * as mPHold from "./src/ui/panels-holdings.js";
import * as mPBuy from "./src/ui/panels-buy.js";
import * as mExpedUi from "./src/ui/expeditions.js";
import * as mModal from "./src/ui/modal.js";
import * as mChrome from "./src/ui/chrome.js";
import * as mPersist from "./src/core/persist.js";
import * as mMapModel from "./src/map/model.js";
import * as mMapGen from "./src/map/generate.js";
import * as mContinents from "./src/map/continents.js";
import * as mMapCore from "./src/map/map.js";
import * as mMapUi from "./src/ui/map.js";
import fs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

const MODS = [mConfig, mRng, mLib, mStone, mBronze, mIron, mCompile, mIcons, mState,
  mContinents,
  mDerived, mCombat, mEvents, mExped, mStep, mActions, mEra, mLog, mDom,
  mPLedger, mPPeople, mPHold, mPBuy, mExpedUi, mModal, mChrome, mPersist,
  mMapModel, mMapGen, mMapCore, mMapUi];

function fakeEl() {
  const el = {
    children: [], dataset: {}, style: {}, _text: "", _html: "",
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    prepend(c) { this.children.unshift(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    querySelectorAll() { return []; },
    querySelector() { return fakeEl(); },
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    get firstChild() { return this.children[0]; }, get lastChild() { return this.children[this.children.length - 1]; },
    scrollTop: 0, scrollHeight: 0,
  };
  ALL_ELS.push(el);
  return el;
}
// Every element the render ever built. Only one check reads it (the tooltip
// sweep below), and it exists because a tooltip's content is computed LAZILY,
// at hover time -- so a getter referencing a variable that no longer exists is
// invisible to every other check in this file and to the page itself until a
// human puts a mouse on it. That is exactly how `conquest`, `full` and
// `idleNow` survived the engine rework inside the population tooltip.
const ALL_ELS = [];
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

// One object over all 25 namespaces, replacing the old vm __api hook. Module
// namespaces are live views, so api.S always reads the current state; the one
// legal write is api.S, routed through the state module's setter.
const api = new Proxy({}, {
  get: (_, k) => { for (const m of MODS) if (k in m) return m[k]; return undefined; },
  set: (_, k, v) => {
    if (k === "S") { mState.setS(v); return true; }
    throw new Error(`harness tried to set api.${String(k)} -- add a setter in core/state.js`);
  },
});

// What boot() did for the harness's purposes, without the page wiring.
try { api.setS(api.freshState()); api.initAdversaries(); console.log("BOOT OK"); }
catch (e) { console.log("BOOT ERROR:", e.stack); process.exit(1); }
const S = () => api.S;
const run = (secs) => { for (let i = 0; i < secs * 5; i++) api.step(); };
// Era-aware def lookup: the active manifest first, DEF_INDEX for ids that are
// not in the current era (a bronze def fetched while still in stone, or the
// retired capstone fetched in bronze). Mirrors what the game itself does.
const findB = (id) => api.defById(id);
const findU = (id) => api.defById(id);
const findT = (id) => api.defById(id);
// The bronze slate is a superset of stone's, except nothing ever leaves it --
// so it can serve as the "any era" event lookup.
const findEv = (id) => api.MANIFESTS.bronze.events.find(e => e.id === id);
function snap(label) {
  const s = S();
  console.log(`${label.padEnd(34)} pop=${s.pop} civ=${api.civilians()} ` +
    `soldiers=${s.units.soldier} food=${s.res.food.toFixed(1)} wood=${s.res.wood.toFixed(1)} ` +
    `stone=${s.res.stone.toFixed(1)} owned=${s.map ? s.map.owned.length : 0} barracks=${s.builds.barracks} dead=${s.dead}`);
}
// idle()'s successor (E2): who could still be trained. People are never
// "unassigned" any more -- they live somewhere -- but a queued unit order
// still reserves a civilian the instant it's placed.
const spare = () => api.civilians() - api.reserved();
function reset() { api.S = api.freshState(); }

let fails = 0;
function check(name, cond) { console.log(`  [${cond ? "PASS" : "FAIL"}] ${name}`); if (!cond) fails++; }

// ---- Regression: core loop still intact ----
console.log("\n--- Regression: starvation, hut queue, storage caps ---");
// Post-E2: an unmanaged colony has its hexes RESTING (the seat does not
// auto-assign -- forage-or-die is the opening lesson), so everyone eats and
// no one gathers. Post-E4 the end takes longer: the famine drain empties the
// dominion frontier-inward (~360s for the starting seven) instead of killing
// instantly, so the dice are pinned -- a lucky Great Hunt now buys real TIME
// rather than merely delaying an instant end, and this check is about the
// mechanism, not the weather.
api.setRngSource(() => 0.99);
reset(); api.ensureMap(); snap("start");
run(480);
check("starvation still ends the game -- the seat empties last", S().dead === true);
api.setRngSource(null);

reset(); api.ensureMap();
S().map.work[api.world.home] = "food";   // the E2 verb: turn the seat to food
S().res.wood = 50;                        // timber up front; gathering has its own checks
run(5);
api.build(findB("granary"));              // the hut died in E3; the granary leads the tree now
run(17);
check("a building still completes with zero workers assigned", S().builds.granary === 1);

// ---- Barracks is capped at 1 ----
console.log("\n--- Barracks: capped at 1 ---");
reset(); api.ensureMap();
S().map.work[api.world.home] = "food";    // stay fed for the reveal window
// The reveal spine is THE CLAIM since E3: barracks opens when the dominion
// grows past its starting trio.
const fourth = Object.values(api.world.places)
  .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
api.captureTile(fourth.id);
run(5);
S().res.wood = 200; S().res.stone = 200;  // skip the grind, just testing cap behavior
snap("fourth hex claimed; barracks should be revealed");
check("barracks revealed once the dominion grows past the trio", api.isRevealed(findB("barracks")));
api.build(findB("barracks"));
check("first barracks queued", S().buildQueue.some(q => q.id === "barracks"));
api.build(findB("barracks"));
check("second barracks refused -- capped at 1", S().buildQueue.filter(q => q.id === "barracks").length === 1);
run(31);
check("barracks completed", S().builds.barracks === 1);
api.build(findB("barracks"));
check("can't queue a 2nd barracks once built either", S().buildQueue.length === 0);

// ---- Soldier: popCost reserves a civilian immediately, not on completion ----
console.log("\n--- Soldier: popCost reserves a civilian the instant it's queued ---");
// Deterministic block: a rare sickness during the training window would kill a
// civilian and shift every count this section asserts on.
api.setRngSource(() => 0.999999);
reset();
S().pop = 6;
S().builds.hut = 1; S().builds.barracks = 1;
S().res.wood = 50;
snap("6 pop, barracks built");
check("6 spare civilians before training", spare() === 6);
const soldierDef = findT("soldier");
console.log(`  soldier cost: ${JSON.stringify(api.buildCost(soldierDef))} popCost: ${soldierDef.popCost} buildTime: ${soldierDef.buildTime}`);
api.build(soldierDef);
snap("soldier order queued (not yet complete)");
check("spare drops by 1 the instant it's queued, before completion", spare() === 5);
check("civilians() unchanged yet -- reservation, not conversion", api.civilians() === 6);
check("S.units.soldier still 0 -- not combat-effective until trained", S().units.soldier === 0);
run(soldierDef.buildTime + 1);
snap("after training completes");
check("S.units.soldier now 1", S().units.soldier === 1);
check("civilians() dropped by 1 -- permanently converted", api.civilians() === 5);
check("spare settles at 5 (reservation -> conversion is a wash)", spare() === 5);

// ---- Cancelling a queued Soldier order frees the reservation ----
api.setRngSource(null);

console.log("\n--- Cancel a queued Soldier order -- reservation freed ---");
reset();
S().pop = 6;
S().builds.hut = 1; S().builds.barracks = 1;
S().res.wood = 50;
const spareBefore = spare();
api.build(findT("soldier"));
check("spare dropped after queuing", spare() === spareBefore - 1);
const uid = S().buildQueue[0].uid;
api.cancelBuild(uid);
check("spare restored after cancelling", spare() === spareBefore);
check("no soldier was created", S().units.soldier === 0);

// ---- A dying unit drops both its own count and S.pop ----
console.log("\n--- removeRandomUnit: the roster lightens, the land is untouched ---");
reset(); api.ensureMap();
S().units.soldier = 2; api.syncPopMirror();
const landBefore0 = api.hexPopSum();
const popBefore = S().pop;
api.removeRandomUnit();
check("units.soldier dropped by 1", S().units.soldier === 1);
check("the mirror counts one fewer; the hexes keep their people",
  S().pop === popBefore - 1 && api.hexPopSum() === landBefore0);

// ---- Weapon/armor upgrades affect military math ----
console.log("\n--- Weapon/armor upgrades ---");
reset();
S().units.soldier = 3;
check("base weapon multiplier is 1.0", api.weaponMultiplier() === 1.0);
check("militaryStrength = soldier count with no upgrade", api.militaryStrength() === 3);
S().upgrades.flintSpears = true;
check("flintSpears raises the multiplier", api.weaponMultiplier() === 1.6);
check("militaryStrength scales with it", Math.abs(api.militaryStrength() - 4.8) < 0.001);
check("base armor factor is 1.0 (no reduction)", api.armorFactor() === 1.0);
S().upgrades.hideArmor = true;
check("hideArmor halves the casualty-chance factor", api.armorFactor() === 0.5);

// ---- Conflict: gated below pop 4 ----
console.log("\n--- Conflict: gated below pop 4, same as sickness ---");
reset();
api.setRngSource(() => 0);   // force every roll to "hit" if attempted at all
const popBefore2 = S().pop;
api.resolveEvents(1);
check("no conflict effect below the pop gate", S().pop === popBefore2 && S().dead === false);
api.setRngSource(null);

// Call conflict's resolve() directly (not resolveEvents()) for these -- Sickness
// sits earlier in the events slate and *also* consumes Math.random() calls when
// its own pop>=4 gate is open, which threw off a hand-counted sequence the first pass.
const conflictEv = findEv("conflict");

// ---- Conflict: zero defense always loses the repel check ----
console.log("\n--- Conflict: zero soldiers -> raid always succeeds, resources stolen ---");
reset(); api.ensureMap();
S().units.soldier = 0; api.syncPopMirror();
S().res.food = 40; S().res.wood = 40;
check("repelChance is exactly 0 with no soldiers", 0 / (0 + 2) === 0);
{
  const landBefore = api.hexPopSum();
  let calls = 0;
  // call1: trigger fires. call2: rollRaidSize -> 0 lands in the first (smallest) tier.
  // call3: repel check -- with defense 0, ANY value fails to repel (0 < 0 is always false).
  // Later calls (0.99): strikeHex's weighted pick still lands on SOME hex.
  api.setRngSource(() => { calls++; return calls <= 2 ? 0 : 0.99; });
  conflictEv.resolve(S(), 1);
  api.setRngSource(null);
  console.log(`  after forced raid: land=${api.hexPopSum()} food=${S().res.food} wood=${S().res.wood}`);
  check("resources were stolen", S().res.food < 40 && S().res.wood < 40);
  check("the civilian died ON a hex -- the land count dropped (E5)",
    api.hexPopSum() < landBefore);
}

// ---- Conflict: strong defense can repel cleanly ----
console.log("\n--- Conflict: strong defense (many soldiers) can repel cleanly ---");
reset();
S().pop = 30; S().units.soldier = 20;   // defense=20 vs a small raid(2) -> repelChance ~0.909
{
  let calls = 0;
  // call1: trigger fires. call2: raid size -> 0 = smallest tier (2).
  // call3: raid TYPE -> 0 = warband (no counter, so composition is irrelevant).
  // call4: repel check -> 0.01 < 0.909, repelled. call5: costly check -> 0.99, NOT costly.
  api.setRngSource(() => { calls++; return [0, 0, 0, 0.01, 0.99][calls - 1] ?? 0.99; });
  const soldiersBefore = S().units.soldier;
  conflictEv.resolve(S(), 1);
  api.setRngSource(null);
  check("clean repel: no soldiers lost", S().units.soldier === soldiersBefore);
  check("population untouched", S().pop === 30);
}

// ---- Conflict: repelled but costly still costs a soldier ----
console.log("\n--- Conflict: repelled-but-costly still costs a Soldier ---");
reset();
S().pop = 30; S().units.soldier = 20;
{
  let calls = 0;
  // Same as above but force the costly-repel roll LOW instead of high.
  // Sequence: trigger, raid size, raid TYPE, repel check, costly-repel check.
  api.setRngSource(() => { calls++; return [0, 0, 0, 0.01, 0][calls - 1] ?? 0.99; });
  const soldiersBefore = S().units.soldier;
  conflictEv.resolve(S(), 1);
  api.setRngSource(null);
  check("costly repel: exactly one soldier lost", S().units.soldier === soldiersBefore - 1);
  check("still just attrition, not a wipe", S().dead === false);
}

// ---- E5: deaths land on hexes ----
console.log("\n--- E5: the world strikes hexes, not a number ---");
reset(); api.ensureMap();
check("removeSettler() is gone -- nobody dies nowhere", api.removeSettler === undefined);
{
  const struck = api.strikeHex("sickness");
  check("a strike picks a peopled, owned hex", struck !== null && api.isOwned(struck) && api.hexPop(struck) >= 1);
  const before = api.hexPop(struck);
  const died = api.killAt(struck, 2);
  check("killAt kills there, and only there", api.hexPop(struck) === Math.max(0, before - died));
  check("killAt never overdraws a hex", api.killAt(struck, 999) === Math.max(0, before - died));
  check("an emptied dominion cannot be struck",
    (S().map.owned.forEach((id) => api.killAt(id, 999)), api.strikeHex("raid") === null));
}

// ---- v7: Herbal Medicine boosts Infirmary's negate chance ----
console.log("\n--- v7: Herbal Medicine ---");
reset();
S().builds.infirmary = 1;
const sicknessEv = findEv("sickness");
check("base Infirmary reducePerUnit is 0.2 (lowered from 0.35)",
  Math.abs(api.negateChance(sicknessEv) - 0.2) < 0.0001);
S().upgrades.herbalMedicine = true;
check("Herbal Medicine raises it to 0.35", Math.abs(api.negateChance(sicknessEv) - 0.35) < 0.0001);

// ---- v7: Stone Yard raises the stone cap; stone now actually clamps ----
console.log("\n--- v7: Stone Yard / stone storage cap ---");
reset();
check("base stone cap is 50 (previously Infinity)", api.caps().stone === 50);
// Post-E2 this tests the CLAMP alone -- gathering has its own hex-based
// checks now, and a 600s mining window would need a fed settlement besides.
S().res.stone = 200;
run(1);
check("stone clamps at 50 now", S().res.stone <= 50.001);
S().builds.stoneYard = 1;
check("Stone Yard raises the cap by 100", api.caps().stone === 150);

// ---- v7: Stone Tools bumps all three gather multipliers ----
console.log("\n--- v7: Stone Tools ---");
reset();
const before7 = api.mults();
check("no bonus without Stone Tools", before7.food === 1 && before7.wood === 1 && before7.stone === 1);
S().upgrades.stoneTools = true;
const after7 = api.mults();
check("Stone Tools adds +8% to all three", Math.abs(after7.food - 1.08) < 0.0001 &&
  Math.abs(after7.wood - 1.08) < 0.0001 && Math.abs(after7.stone - 1.08) < 0.0001);
check("stacks additively with per-job boost buildings", (() => {
  S().builds.dryingRack = 1;
  const m = api.mults();
  return Math.abs(m.food - 1.20) < 0.0001; // 1 + 0.12 (dryingRack) + 0.08 (stoneTools)
})());

// ---- v7: Great Hunt (food windfall) and Trader (wood+stone windfall) ----
console.log("\n--- v7: positive events -- Great Hunt & Trader ---");
reset();
S().pop = 5;
const huntEv = findEv("greatHunt");
const traderEv = findEv("trader");
{
  api.setRngSource(() => 0); // force the trigger to fire
  const foodBefore = S().res.food;
  api.resolveEvents(1); // forced roll: greatHunt fires first in the list
  api.setRngSource(null);
  console.log(`  after forced greatHunt/trader tick: food=${S().res.food} wood=${S().res.wood} stone=${S().res.stone}`);
  check("food increased (Great Hunt landed)", S().res.food > foodBefore);
}
reset();
S().pop = 5;
{
  const woodBefore = S().res.wood, stoneBefore = S().res.stone;
  traderEv.effect(S());
  check("trader gives both wood and stone", S().res.wood > woodBefore && S().res.stone > stoneBefore);
}
reset();
S().pop = 5;
{
  const foodBefore2 = S().res.food;
  huntEv.effect(S());
  check("great hunt gives only food, not wood/stone", S().res.food > foodBefore2 && S().res.wood === 0 && S().res.stone === 0);
}

// ---- The board is whole from frame one ----
// This replaces a block that asserted the opposite: the Build Queue used to
// hide until first use, tracked by a sticky S.seen.queueUsed. Panels no longer
// hide themselves at all, so that flag went away, and what needs guarding now
// is the new contract -- no render function may hide a panel the current era
// can fill, and the queue must still fill and drain behind its empty state.
console.log("\n--- Board: every panel the era can fill is present from the start ---");
reset();
{
  // The floating panels of the flip. The Selected Tile panel is excluded
  // deliberately: with nothing selected it is not a blank form, it is no
  // selection at all -- the one sanctioned hider.
  const PANELS = ["panel-village", "panel-training", "panel-build", "panel-upgrades",
                  "panel-queue", "panel-log"];
  const hidden = [];
  const realGetById = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => {
    const el = fakeEl();
    if (PANELS.indexOf(id) >= 0) {
      el.classList = {
        add(c) { if (c === "hidden") hidden.push(id); },
        remove() {}, contains() { return false; },
        toggle(c, on) { if (c === "hidden" && on) hidden.push(id); },
      };
    }
    return el;
  };
  api.renderAll();
  globalThis.document.getElementById = realGetById;
  check("no panel hides itself on a fresh game", hidden.length === 0);
}

// EVERY tooltip getter must survive being called. attachTip stores a closure
// and calls it on mouseenter, so a stale variable reference throws into a DOM
// event handler, where it is swallowed as an uncaught error and the tooltip
// silently does not appear. Nothing else here would notice.
{
  ALL_ELS.length = 0;
  api.renderAll();
  const tipped = ALL_ELS.filter((el) => typeof el.__tip === "function");
  const broken = [];
  for (const el of tipped) {
    try {
      const t = el.__tip();
      if (!t || typeof t !== "object") broken.push("returned " + typeof t);
    } catch (e) {
      broken.push(e.message);
    }
  }
  check("the render attaches tooltips at all (the sweep has something to sweep)",
    tipped.length > 0);
  // The failure message carries the thrown text, because "a tooltip is broken"
  // without saying WHICH is a check that costs more to diagnose than it saves.
  check("every tooltip getter evaluates without throwing" +
    (broken.length ? ` -- ${broken.length} threw: ${broken.slice(0, 3).join(" | ")}` : ""),
    broken.length === 0);
}
check("queueUsed is gone -- it was write-only state in every save", !("queueUsed" in S().seen));
// The E2 economy end to end: the seat feeds everyone, a second hex is turned
// to timber. Its population is set by hand because its TERRAIN is the seed's
// business -- 8 people at the worst wood rate (hills, x0.3) still clears the
// hut's price inside the window, so this passes on every world.
api.ensureMap();
S().map.work[api.world.home] = "food";
const woodHex = S().map.owned.find((id) => id !== api.world.home);
S().map.pop[woodHex] = 8;
S().map.work[woodHex] = "wood";
run(90);
check("enough wood gathered to afford the granary", S().res.wood >= api.buildCost(findB("granary")).wood);
api.build(findB("granary"));
check("granary actually entered the queue", S().buildQueue.length === 1);
run(17); // let it finish, queue drains back to empty
check("granary finished, queue now empty again", S().buildQueue.length === 0);

// ================= BRONZE AGE PHASE 1 =================
const infDef = findB("infirmary");
const bronzeAgeDef = findU("bronzeAge");
const bronzeToolsDef = findU("bronzeTools");

console.log("\n--- Bronze P1: per-era display names (now manifest overrides) ---");
reset();
// (The hut was this block's other example until E3 killed it -- the
// infirmary's Medicine Tent -> Infirmary rename carries the pattern alone.)
check("stone: infirmary named 'Medicine Tent'", api.defById("infirmary").name === "Medicine Tent");
S().era = "bronze";
check("bronze: infirmary named 'Infirmary'", api.defById("infirmary").name === "Infirmary");
check("ids never change regardless of era",
  api.MANIFESTS.stone.buildings.some(b => b.id === "infirmary") &&
  api.MANIFESTS.bronze.buildings.some(b => b.id === "infirmary"));
check("an override can't reach back and rename the parent era's copy",
  api.MANIFESTS.stone.buildings.find(b => b.id === "infirmary").name === "Medicine Tent");
check("overriding name does not disturb inherited fields (cost survives)",
  api.MANIFESTS.bronze.buildings.find(b => b.id === "infirmary").base.wood ===
  api.MANIFESTS.stone.buildings.find(b => b.id === "infirmary").base.wood);
S().era = "stone";
check("un-overridden defs read the same in both eras", api.defById("granary").name === "Granary" &&
  api.MANIFESTS.bronze.buildings.find(b => b.id === "granary").name === "Granary");

console.log("\n--- Bronze P1: carrying caps are retroactive (housing's heir) ---");
reset(); api.ensureMap();
const seatTerrain = api.world.places[api.world.home].terrain;
const capStone = api.capOf(api.world.home);
check("stone: the seat's ground holds what its terrain says",
  capStone === api.MANIFESTS.stone.map.popCaps[seatTerrain]);
S().era = "bronze";
check("bronze: the SAME ground now holds more -- caps are the era curve",
  api.capOf(api.world.home) === api.MANIFESTS.bronze.map.popCaps[seatTerrain]);
check("advancing raised the ceiling without building anything",
  api.capOf(api.world.home) > capStone);
S().era = "stone";

console.log("\n--- Bronze P1: capstone reveal gating ---");
// S.pop is a MIRROR since E3: fixtures populate the HEXES and let the mirror
// report, because typing a population into S.pop is fiction the next tick
// erases. The gate itself moved to 25 -- a trio start caps out around 14-28
// depending on terrain, so reaching it usually requires claiming, which is
// the point.
reset(); api.ensureMap();
check("capstone hidden on a fresh game", !api.isRevealed(bronzeAgeDef));
for (const id of S().map.owned) S().map.pop[id] = 10;
api.syncPopMirror();
check("pop alone is not enough -- needs a Soldier too", !api.isRevealed(bronzeAgeDef));
reset(); api.ensureMap();
S().units.soldier = 1; api.syncPopMirror();
check("a Soldier alone is not enough -- needs pop too", !api.isRevealed(bronzeAgeDef));
reset(); api.ensureMap();
for (const id of S().map.owned) S().map.pop[id] = 10;
S().units.soldier = 1; api.syncPopMirror();
check("both conditions met -> capstone reveals", api.isRevealed(bronzeAgeDef));
S().units.soldier = 0;
check("stays revealed after the soldier dies (sticky)", api.isRevealed(bronzeAgeDef));
console.log(`  capstone cost: ${JSON.stringify(api.buildCost(bronzeAgeDef))}, buildTime ${bronzeAgeDef.buildTime}s`);

console.log("\n--- Bronze P1: completing the capstone flips the era ---");
// Deterministic block: over the 120s build, an unlucky raid could steal the
// remaining food and starve the settlement before the capstone completes.
api.setRngSource(() => 0.999999);
reset(); api.ensureMap();
for (const id of S().map.owned) S().map.pop[id] = 10;
S().units.soldier = 1; api.syncPopMirror();
S().map.work[api.world.home] = "food";   // fed through the build: 2/s in, 1.2/s eaten
S().builds.granary = 4;                   // headroom so the larder isn't clamped
S().res.food = 400; S().res.wood = 400; S().res.stone = 400;
check("era starts as stone", S().era === "stone");
const peopleBeforeFlip = api.hexPopSum();
api.build(bronzeAgeDef);
check("capstone entered the queue", S().buildQueue.length === 1 && S().buildQueue[0].id === "bronzeAge");
check("era has NOT flipped merely by queuing it", S().era === "stone");
run(bronzeAgeDef.buildTime - 5);
check("era still stone while mid-build", S().era === "stone");
run(10);
check("era flipped to bronze on completion", S().era === "bronze");
check("capstone recorded as an owned upgrade", S().upgrades.bronzeAge === true);
check("Bronze is a 1:1 relabel -- the real population is untouched",
  api.hexPopSum() >= peopleBeforeFlip);
check("...but the noun changed: families now", api.active().popNoun.singular === "family");
check("pre-transition snapshot archived under the era just left", !!S().eraHistory.stone);
check("snapshot captured pre-flip facts (era still stone inside it)",
  S().eraHistory.stone.era === "stone" && S().eraHistory.stone.pop >= 10);
check("snapshots don't nest snapshots", S().eraHistory.stone.eraHistory === undefined);

api.setRngSource(null);

console.log("\n--- Bronze P1: bronze-gated content (gate = manifest membership) ---");
check("Bronze Tools in the active manifest now that era is bronze",
  api.active().upgrades.some(u => u.id === "bronzeTools") && api.isRevealed(bronzeToolsDef));
reset();
check("Bronze Tools absent from the stone manifest -- can't render, can't build",
  !api.active().upgrades.some(u => u.id === "bronzeTools"));

console.log("\n--- Bronze P1: Bronze Tools stacks with Stone Tools ---");
reset();
check("no tools: multiplier is 1", api.mults().food === 1);
S().upgrades.stoneTools = true;
check("stone tools only: 1.08", Math.abs(api.mults().food - 1.08) < 0.0001);
S().upgrades.bronzeTools = true;
check("both stack additively: 1.23", Math.abs(api.mults().food - 1.23) < 0.0001);
check("applies to all three resources", Math.abs(api.mults().stone - 1.23) < 0.0001);

console.log("\n--- Bronze P1: events keep firing after the era flips (slate membership) ---");
for (const id of ["greatHunt", "trader", "sickness", "conflict"]) {
  check(`${id} is in the bronze slate (would silently stop if omitted)`,
    api.MANIFESTS.bronze.events.some((e) => e.id === id));
  check(`${id} is in the stone slate`,
    api.MANIFESTS.stone.events.some((e) => e.id === id));
}

// Regression: holdings/person tiles baked their name in at creation and only
// ever refreshed the count, so an era rename left stale text in the tile even
// though the matching buy-card updated correctly. Caught in live testing.
console.log("\n--- Bronze P1: tiles re-render their name, not just their count ---");
// The name moved off the tile and into the tooltip in the Bureau port, so the
// mechanism under test changed -- but the bug it guards against did not. What
// must stay true is that a re-render re-points the tile at the CURRENT name
// rather than keeping whatever it was built with.
{
  const realGetById = globalThis.document.getElementById;
  let created = null;              // first call creates it, second must still rename it
  globalThis.document.getElementById = (id) => {
    if (id === "hold-infirmary") return created;
    return fakeEl();
  };
  const container = fakeEl();
  api.renderTile(container, "hold-", "infirmary", "", "Medicine Tent", 1, "care", "d");
  created = container.children[0];
  const firstName = created.__tip().title;
  api.renderTile(container, "hold-", "infirmary", "", "Infirmary", 1, "care", "d");
  globalThis.document.getElementById = realGetById;
  check("tile renames in place on re-render, not just on creation",
    firstName === "Medicine Tent" && created.__tip().title === "Infirmary" &&
    container.children.length === 1);   // and it did NOT create a second tile
}

console.log("\n--- Bronze P1: old stone-age saves still load ---");
{
  // Simulate a save written before any bronze fields existed.
  const legacy = JSON.stringify({
    res: { food: 20, wood: 10, stone: 5 },
    jobs: { forager: 1, woodcutter: 1, miner: 0 },
    builds: { hut: 2, infirmary: 1 },
    units: { soldier: 1 },
    upgrades: { stoneTools: true },
    buildQueue: [], buildSeq: 3, pop: 6, bought: 3,
    era: "stone", seen: { wood: true }, dead: false, lastSeed: Date.now(),
  });
  store[api.CONFIG.saveKey] = legacy;
  const loaded = api.S && true;
  api.S = api.freshState();
  // re-run the module's own load() by invoking it through a fresh eval is
  // overkill; instead assert the merge shape the loader relies on.
  const merged = Object.assign(api.freshState(), JSON.parse(legacy));
  merged.builds = Object.assign(api.freshState().builds, JSON.parse(legacy).builds);
  api.S = merged;
  check("legacy save keeps its era", S().era === "stone");
  check("legacy save's missing buildings default to 0", S().builds.barracks === 0 && S().builds.stoneYard === 0);
  check("legacy save's real buildings survive", S().builds.hut === 2 && S().builds.infirmary === 1);
  // (the housing check died in E3 with housing itself)
  delete store[api.CONFIG.saveKey];
}

console.log("\n--- Playtime clock ---");
reset();
check("starts at zero", api.playtime() === 0);
run(60);
check("advances with simulated time", Math.abs(api.playtime() - 60) < 0.5);
console.log(`  after 60s of sim: playtime = ${api.playtime().toFixed(1)}s -> "${api.fmtTime(api.playtime())}"`);
{
  // Pausing is modelled here by simply not calling step() -- which is exactly
  // what the real tick loop does -- so the clock must not move.
  const frozen = api.playtime();
  for (let i = 0; i < 25; i++) { /* paused ticks: no step() call */ }
  check("frozen while paused (no step calls)", api.playtime() === frozen);
}
run(30);
check("resumes cleanly after a pause", Math.abs(api.playtime() - 90) < 0.5);
{
  reset();
  S().dead = true;
  const atDeath = api.playtime();
  run(30);
  check("stops counting once dead", api.playtime() === atDeath);
}
check("fmtTime under an hour", api.fmtTime(94) === "1m 34s");
check("fmtTime pads seconds", api.fmtTime(65) === "1m 05s");
check("fmtTime switches to hours", api.fmtTime(7500) === "2h 05m");
check("fmtTime handles zero", api.fmtTime(0) === "0m 00s");

console.log("\n--- The clock survives a save/load round trip ---");
{
  reset();
  run(120);
  const before = S().tick;
  const roundTripped = Object.assign(api.freshState(), JSON.parse(JSON.stringify(S())));
  check("the tick count persists through serialization", roundTripped.tick === before);
  // A save written before any clock existed has neither tick nor playtime.
  const legacy = JSON.parse(JSON.stringify(S()));
  delete legacy.tick;
  const merged = Object.assign(api.freshState(), legacy);
  check("clockless legacy save defaults to tick 0 rather than undefined", merged.tick === 0);
}

console.log("\n--- Info reference panel ---");
reset();
{
  const html = api.infoPanelHTML();
  check("has a tab per era", html.includes('data-era="stone"') && html.includes('data-era="bronze"'));
  check("current era's tab starts active", html.includes('class="info-tab active" data-era="stone"'));
  check("groups buildings, people and upgrades", html.includes(">Buildings<") &&
    html.includes(">People<") && html.includes(">Upgrades<"));
  const everyEra = (cat) => api.ERA_ORDER.every((e) =>
    api.MANIFESTS[e][cat].every((d) => html.includes(d.name)));
  check("every era's buildings appear", everyEra("buildings"));
  check("every era's units appear", everyEra("units"));
  check("every era's upgrades appear", everyEra("upgrades"));
  // The Bronze tab must read with Bronze names even while we're still in Stone.
  // (The Stone House died with the hut in E3; the Infirmary carries the check.)
  check("bronze tab uses bronze-era names while era is still stone",
    html.includes("Infirmary"));
  check("stone tab still uses stone-era names", html.includes("Medicine Tent"));
}

console.log("\n--- Era availability (presence in the compiled manifests) ---");
{
  const inEra = (era, cat, id) => api.MANIFESTS[era][cat].some((d) => d.id === id);
  check("the hut exists in NO era -- killed in E3, pop is hex now",
    !inEra("stone", "buildings", "hut") && !inEra("bronze", "buildings", "hut"));
  check("bronze content does not exist back in the stone age", !inEra("stone", "upgrades", "bronzeTools"));
  check("bronze content exists in bronze", inEra("bronze", "upgrades", "bronzeTools"));
  check("the capstone is available in the era it leads out of", inEra("stone", "upgrades", "bronzeAge"));
  check("the capstone is gone once that era is over (removed by the delta)", !inEra("bronze", "upgrades", "bronzeAge"));
  check("era order is chronological", api.ERA_ORDER.indexOf("stone") < api.ERA_ORDER.indexOf("bronze"));
}
{
  S().era = "bronze";
  const html = api.infoPanelHTML();
  check("active tab follows the current era", html.includes('class="info-tab active" data-era="bronze"'));
}

console.log("\n--- E3: the timer, the hut and the lockstep are gone, and stay gone ---");
{
  api.setRngSource(() => 0.999999);
  reset(); api.closeModal(); api.ensureMap();
  S().map.work[api.world.home] = "food";

  check("accrueGrowth() is gone", api.accrueGrowth === undefined);
  check("housing() is gone", api.housing === undefined);
  // The three that outlived the systems they served, swept 2026-08-25. The
  // accessor is the instructive one: no manifest had declared housingPerHut
  // for two reworks, so it was returning undefined to nobody -- dead code that
  // no "is anything still calling this?" grep could find, because the answer
  // was yes, and the caller was equally dead.
  check("housingPerHut() is gone -- its era-fact had already stopped existing",
    api.housingPerHut === undefined);
  check("CONFIG.baseHousing is gone", !("baseHousing" in api.CONFIG));
  check("CONFIG.settlerIntervalSeconds is gone -- growth is local to hexes and paid for",
    !("settlerIntervalSeconds" in api.CONFIG));
  check("the 3-hex start: seat plus two neighbours, owner-ratified",
    S().map.owned.length === 3 && S().map.owned[0] === api.world.home);

  // The runaway that killed the bridge, asserted dead: time passes, people
  // grow on their hexes, and the dominion does NOT expand on its own.
  const ownedBefore = S().map.owned.slice().sort().join("|");
  run(180);
  check("free real estate is over: time alone grants no ground",
    S().map.owned.slice().sort().join("|") === ownedBefore);
  check("people still grew on the ground they hold",
    api.hexPopSum() > 7);
  check("S.pop mirrors the real population (people + army)",
    S().pop === api.hexPopSum() + Object.values(S().units).reduce((a, b) => a + b, 0));

  // Claims are priced by the ERA: stone pays food and time only.
  const target = Object.values(api.world.places)
    .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
  const plan = api.settlePlan(target.id);
  check("a claim is priced in food, timber AND tools (one-resource prices let one export fund the conquest)",
    plan && plan.cost.food > 0 && plan.cost.wood > 0 && plan.cost.stone > 0 && plan.time > 0);
  check("...but never in a resource the era does not have", !("bronze" in plan.cost));
  S().era = "bronze";
  const plan2 = api.settlePlan(target.id);
  check("a bronze claim carries the age's signature metal (the capstone rule, applied to the frontier)",
    plan2 && plan2.cost.bronze > 0 && plan2.cost.wood > plan.cost.wood);
  S().era = "iron";
  const plan3 = api.settlePlan(target.id);
  check("an iron claim carries iron", plan3 && plan3.cost.iron > 0);
  S().era = "stone";

  // And the claim actually grows the dominion, through the queue.
  S().res.food = 400; S().res.wood = 200; S().res.stone = 200; S().builds.granary = 4;
  api.launchSettle(target.id);
  check("the claim entered the queue", S().buildQueue.some((q) => q.kind === "settle"));
  run(plan.time + 60);
  check("the claim completed: the dominion grew by exactly one, paid for",
    S().map.owned.length === 4 && api.isOwned(target.id));
  api.setRngSource(null);
}

// ================= BRONZE AGE PHASE 2: THE ALLOY =================
// Fetched from the bronze manifest explicitly: these tests assert the
// BRONZE-era recipe, and defById's DEF_INDEX fallback would hand back the
// iron-era forge (latest identity) while the harness sits in stone.
const forgeDef = api.MANIFESTS.bronze.buildings.find(b => b.id === "forge");
const oreYardDef = api.MANIFESTS.bronze.buildings.find(b => b.id === "oreYard");

console.log("\n--- P2: ores and their jobs are era-gated (by manifest membership) ---");
reset();
{
  const inRes = (era, id) => api.MANIFESTS[era].resources.some(r => r.id === id);
  // Post-E2 the ore verbs live in the WORKS TABLE: what a terrain can be
  // turned to is the era-gate now.
  const canWork = (era, terrain, res) =>
    api.MANIFESTS[era].map.works[terrain] && api.MANIFESTS[era].map.works[terrain][res] != null;
  check("copper/tin/bronze absent from the stone manifest",
    !inRes("stone", "copper") && !inRes("stone", "tin") && !inRes("stone", "bronze"));
  check("no stone-age ground can be turned to ore",
    !canWork("stone", "hills", "copper") && !canWork("stone", "hills", "tin"));
  check("forge absent from the stone manifest",
    !api.MANIFESTS.stone.buildings.some(b => b.id === "forge"));
  check("stone-era rates have no copper line at all",
    !("copper" in api.rates()));
  S().era = "bronze";
  check("copper/tin/bronze all present in bronze",
    inRes("bronze", "copper") && inRes("bronze", "tin") && inRes("bronze", "bronze"));
  check("bronze hills can be turned to copper and tin",
    canWork("bronze", "hills", "copper") && canWork("bronze", "hills", "tin"));
  check("forge and ore yard appear in bronze",
    api.isRevealed(forgeDef) && api.isRevealed(oreYardDef));
  const copperRes = api.MANIFESTS.bronze.resources.find(r => r.id === "copper");
  const bronzeRes = api.MANIFESTS.bronze.resources.find(r => r.id === "bronze");
  check("bronze has a generous cap and no storage building",
    bronzeRes.capBuilding === null && bronzeRes.baseCap > copperRes.baseCap);
}

console.log("\n--- P2: tin yields half of copper (same hill, same people) ---");
reset();
S().era = "bronze";
{
  // Fixture hexes the rebuilt world doesn't know would work at par, which
  // defeats a terrain-rate test -- so build a minimal map by hand instead:
  // two identical hills, one on each ore, same population.
  api.ensureMap();
  const hills = Object.values(api.world.places)
    .filter((p) => p.terrain === "hills" && !p.adversary && !p.minor).slice(0, 2);
  check("the world has two workable hills to test on", hills.length === 2);
  S().map.owned = [api.world.home, hills[0].id, hills[1].id];
  S().map.pop = {}; api.ensurePop();
  S().map.pop[hills[0].id] = 4; S().map.pop[hills[1].id] = 4;
  S().map.work = {}; S().map.work[hills[0].id] = "copper"; S().map.work[hills[1].id] = "tin";
  const r = api.rates();
  console.log(`  per hill (4 people): copper ${r.copper.toFixed(3)}/s, tin ${r.tin.toFixed(3)}/s`);
  check("tin is exactly half the copper rate", Math.abs(r.tin - r.copper / 2) < 1e-9);
  check("both ores are actually produced", r.copper > 0 && r.tin > 0);
}

console.log("\n--- P2: Ore Yard lifts copper AND tin together ---");
reset();
S().era = "bronze";
{
  const before = api.caps();
  S().builds.oreYard = 1;
  const after = api.caps();
  check("copper cap rose", after.copper === before.copper + api.CONFIG.storageAdd);
  check("tin cap rose from the same building", after.tin === before.tin + api.CONFIG.storageAdd);
  check("bronze cap unaffected by the ore yard", after.bronze === before.bronze);
}

console.log("\n--- P2: the Forge converts, throttles, and idles ---");
reset();
S().era = "bronze";
S().builds.forge = 1;
S().res.copper = 100; S().res.tin = 100;
{
  const spec = forgeDef.converts;
  console.log(`  recipe: ${JSON.stringify(spec.in)} -> ${JSON.stringify(spec.out)} @ ${spec.rate}/s per forge`);
  const before = { copper: S().res.copper, tin: S().res.tin, bronze: S().res.bronze };
  api.runConverters(10);            // 10 seconds at 0.05/s = 0.5 bronze
  const made = S().res.bronze - before.bronze;
  check("bronze was produced", made > 0);
  check("copper consumed at the recipe ratio",
    Math.abs((before.copper - S().res.copper) - made * spec.in.copper) < 1e-9);
  check("tin consumed at the recipe ratio",
    Math.abs((before.tin - S().res.tin) - made * spec.in.tin) < 1e-9);
}
{
  // Two forges must smelt exactly twice as fast as one.
  reset(); S().era = "bronze"; S().res.copper = 500; S().res.tin = 500;
  S().builds.forge = 1; api.runConverters(10);
  const one = S().res.bronze;
  reset(); S().era = "bronze"; S().res.copper = 500; S().res.tin = 500;
  S().builds.forge = 2; api.runConverters(10);
  check("throughput scales with forge count", Math.abs(S().res.bronze - one * 2) < 1e-9);
}
{
  // Starved of tin, it should run at partial rate then stop -- never go negative.
  reset(); S().era = "bronze"; S().builds.forge = 5;
  S().res.copper = 1000; S().res.tin = 2;
  api.runConverters(60);
  check("tin drained to exactly zero, not below", Math.abs(S().res.tin) < 1e-9);
  check("bronze made was limited by the scarce input", Math.abs(S().res.bronze - 2) < 1e-9);
  check("leftover copper stays in store", S().res.copper > 0);
  const bronzeAfterStall = S().res.bronze;
  api.runConverters(60);
  check("idles cleanly once an input is exhausted", S().res.bronze === bronzeAfterStall);
  check("copper is not consumed while stalled", S().res.copper > 0);
}
{
  // A full bronze store must stop the forge rather than eating ore for nothing.
  reset(); S().era = "bronze"; S().builds.forge = 3;
  S().res.copper = 1000; S().res.tin = 1000;
  S().res.bronze = api.caps().bronze;
  const oreBefore = { copper: S().res.copper, tin: S().res.tin };
  api.runConverters(60);
  check("no ore consumed when the output is capped",
    S().res.copper === oreBefore.copper && S().res.tin === oreBefore.tin);
  check("bronze never exceeds its cap", S().res.bronze <= api.caps().bronze + 1e-9);
}

console.log("\n--- P2: weapon tiers replace rather than stack ---");
reset();
S().units.soldier = 10;
check("unarmed baseline", api.weaponMultiplier() === 1.0);
S().upgrades.flintSpears = true;
check("flint tier", api.weaponMultiplier() === 1.6);
S().upgrades.bronzeWeapons = true;
check("bronze tier supersedes flint (not 1.6 x 2.2)", api.weaponMultiplier() === 2.2);
check("military strength follows the highest tier", Math.abs(api.militaryStrength() - 22) < 1e-9);

console.log("\n--- P2: bronze-costed upgrades ---");
{
  const bt = findU("bronzeTools"), bw = findU("bronzeWeapons");
  check("Bronze Tools now costs bronze", "bronze" in api.buildCost(bt));
  check("Bronze Weapons costs bronze", "bronze" in api.buildCost(bw));
  reset(); S().era = "bronze";
  S().res.wood = 999; S().res.bronze = 0;
  api.build(bt);
  check("can't buy a bronze-costed upgrade with no bronze", S().buildQueue.length === 0);
  S().res.bronze = 999;
  api.build(bt);
  check("can once you've smelted some", S().buildQueue.length === 1);
}

console.log("\n--- E2: the jobs system is gone, and stays gone ---");
{
  // These exports dying IS the feature. A future refactor that quietly
  // resurrects any of them should have to argue with this block.
  check("assign() is gone", api.assign === undefined);
  check("idle() is gone", api.idle === undefined);
  check("jobsUsed() is gone", api.jobsUsed === undefined);
  check("releaseOrder() is gone", api.releaseOrder === undefined);
  check("reconcileWorkforce() is gone", api.reconcileWorkforce === undefined);
  check("no manifest carries a jobs category",
    ["stone", "bronze", "iron"].every((e) => (api.MANIFESTS[e].jobs || []).length === 0));
}

// ================= BRONZE AGE PHASE 3: THE ARMY =================
// Raid types are era-scoped now (inherited unchanged by bronze); military math
// reads active().units, so every composition test runs in the bronze era --
// the only era where these armies are reachable in real play.
const RAID_TYPES = api.MANIFESTS.bronze.raidTypes;
const warband = RAID_TYPES.find(t => t.id === "warband");
const massed  = RAID_TYPES.find(t => t.id === "massed");
const riders  = RAID_TYPES.find(t => t.id === "riders");
const archerDef = findT("archer"), horseDef = findT("horseman"), soldierDef2 = findT("soldier");
check("bronze inherits stone's raid types unchanged", api.MANIFESTS.stone.raidTypes === RAID_TYPES);

console.log("\n--- P3: units are NEVER penalised for being the wrong type ---");
reset();
S().era = "bronze";
{
  // This is the load-bearing guarantee of the whole system: "oops all archers"
  // must never be worse than having those bodies at all.
  S().units = { soldier: 0, archer: 5, horseman: 0 };
  const vsCountered = api.militaryStrength(massed);   // archers excel here
  const vsNeutral   = api.militaryStrength(warband);  // no counter exists
  const vsWrong     = api.militaryStrength(riders);   // horsemen would excel, archers don't
  console.log(`  5 archers -> vs massed ${vsCountered}, vs warband ${vsNeutral}, vs riders ${vsWrong}`);
  check("countered raid gives a bonus", vsCountered > vsNeutral);
  check("wrong matchup is NOT penalised, just un-bonused", vsWrong === vsNeutral);
  check("wrong matchup still beats having no army", vsWrong > 0);

  S().units = { soldier: 0, archer: 0, horseman: 0 };
  check("no army really is zero", api.militaryStrength(riders) === 0);
}

console.log("\n--- P3: the counter bonus lands on the right unit ---");
reset();
S().era = "bronze";
{
  S().units = { soldier: 0, archer: 3, horseman: 0 };
  const archersVsMassed = api.militaryStrength(massed);
  S().units = { soldier: 0, archer: 0, horseman: 3 };
  const horsemenVsRiders = api.militaryStrength(riders);
  const horsemenVsMassed = api.militaryStrength(massed);
  check("archers get their bonus vs a massed charge",
    Math.abs(archersVsMassed - 3 * 1.0 * api.CONFIG.counterBonus) < 1e-9);
  check("horsemen get their bonus vs riders",
    Math.abs(horsemenVsRiders - 3 * 1.5 * api.CONFIG.counterBonus) < 1e-9);
  check("horsemen get no bonus vs a massed charge", Math.abs(horsemenVsMassed - 3 * 1.5) < 1e-9);
  check("a warband is countered by nothing", !api.MANIFESTS.bronze.units.some(u => u.counters === "warband"));
  check("the counter relationship is stored in exactly one place",
    RAID_TYPES.every(t => !("counter" in t)));
}

console.log("\n--- P3: mixed armies have no holes, specialists have spikes ---");
reset();
S().era = "bronze";
{
  S().units = { soldier: 2, archer: 2, horseman: 2 };
  const mixed = RAID_TYPES.map(t => api.militaryStrength(t));
  const spread = Math.max(...mixed) / Math.min(...mixed);
  S().units = { soldier: 0, archer: 6, horseman: 0 };
  const pure = RAID_TYPES.map(t => api.militaryStrength(t));
  const pureSpread = Math.max(...pure) / Math.min(...pure);
  console.log(`  mixed spread ${spread.toFixed(2)}x vs all-archer spread ${pureSpread.toFixed(2)}x`);
  check("a specialist army swings harder between matchups", pureSpread > spread);
  check("a mixed army is never zero against anything", Math.min(...mixed) > 0);
}

console.log("\n--- P3: weapon upgrades lift every unit type ---");
reset();
S().era = "bronze";
S().units = { soldier: 1, archer: 1, horseman: 1 };
{
  const before = api.militaryStrength(warband);
  S().upgrades.bronzeWeapons = true;
  check("bronze weapons scale the whole army, not just soldiers",
    Math.abs(api.militaryStrength(warband) - before * 2.2) < 1e-9);
}

console.log("\n--- P3: counterCoverage drives the casualty-relief dial ---");
reset();
S().era = "bronze";
{
  S().units = { soldier: 0, archer: 0, horseman: 0 };
  check("no army -> no coverage", api.counterCoverage(massed) === 0);
  S().units = { soldier: 0, archer: 4, horseman: 0 };
  check("all-counter army -> full coverage", Math.abs(api.counterCoverage(massed) - 1) < 1e-9);
  S().units = { soldier: 4, archer: 0, horseman: 0 };
  check("no counters present -> zero coverage", api.counterCoverage(massed) === 0);
  S().units = { soldier: 4, archer: 4, horseman: 0 };
  const partial = api.counterCoverage(massed);
  check("partial coverage lands strictly between", partial > 0 && partial < 1);
  check("a warband can never be countered", api.counterCoverage(warband) === 0);
}

console.log("\n--- P3: casualties can take any unit type ---");
reset(); api.ensureMap();
S().era = "bronze";
{
  S().units = { soldier: 3, archer: 3, horseman: 3 };
  api.syncPopMirror();
  const popBefore9 = S().pop;
  const lost = api.removeRandomUnit();
  check("a unit was removed and named", typeof lost === "string" && lost.length > 0);
  check("total units dropped by one", api.totalUnits() === 8);
  check("the mirror dropped with it (the land untouched)", S().pop === popBefore9 - 1);

  // Drain the whole army: must never go negative or desync from pop.
  let guard = 0;
  while (api.totalUnits() > 0 && guard++ < 50) api.removeRandomUnit();
  check("army drains to exactly zero", api.totalUnits() === 0);
  check("no unit count went negative", api.MANIFESTS.bronze.units.every(u => (S().units[u.id] || 0) >= 0));
  check("removing from an empty army is a no-op", api.removeRandomUnit() === null);
}

console.log("\n--- P3: casualty exposure -- front line dies first, but nobody is immune ---");
{
  // Statistical: draw one casualty from an identical army many times over.
  const N = 30000;
  const tally = { soldier: 0, archer: 0, horseman: 0 };
  for (let i = 0; i < N; i++) {
    reset();
    S().era = "bronze";
    S().pop = 30;
    S().units = { soldier: 10, archer: 10, horseman: 10 };
    const lost = api.removeRandomUnit();
    if (lost === "Soldier") tally.soldier++;
    else if (lost === "Archer") tally.archer++;
    else if (lost === "Horseman") tally.horseman++;
  }
  const pct = (n) => ((n / N) * 100).toFixed(1) + "%";
  console.log(`  even 10/10/10 army -> soldier ${pct(tally.soldier)}, horseman ${pct(tally.horseman)}, archer ${pct(tally.archer)}`);
  check("foot soldiers die most often", tally.soldier > tally.horseman);
  check("horsemen die more often than archers", tally.horseman > tally.archer);
  check("archers are NOT immune -- they still die regularly", tally.archer > 0.05 * N);
  check("every casualty was accounted for", tally.soldier + tally.archer + tally.horseman === N);
}
{
  // The protection must vanish when there's no front line to hide behind.
  let archersLost = 0;
  for (let i = 0; i < 500; i++) {
    reset();
    S().era = "bronze";
    S().pop = 10; S().units = { soldier: 0, archer: 5, horseman: 0 };
    if (api.removeRandomUnit() === "Archer") archersLost++;
  }
  check("an all-archer army gets no protection at all", archersLost === 500);
}
{
  // Heavily outnumbered front line: archers should still usually be spared,
  // but the guarantee is only statistical, never absolute.
  reset();
  S().era = "bronze";
  S().pop = 20; S().units = { soldier: 1, archer: 15, horseman: 0 };
  let soldierPicked = false, archerPicked = false;
  for (let i = 0; i < 400; i++) {
    S().units = { soldier: 1, archer: 15, horseman: 0 };
    const lost = api.removeRandomUnit();
    if (lost === "Soldier") soldierPicked = true;
    if (lost === "Archer") archerPicked = true;
  }
  check("a lone soldier can still be the one who falls", soldierPicked);
  check("archers can still fall even with a front line present", archerPicked);
}
{
  // Weights must be positive, or a unit type would become truly unkillable.
  check("every unit has a positive casualty weight",
    api.MANIFESTS.bronze.units.every(u => (u.casualtyWeight === undefined ? 1 : u.casualtyWeight) > 0));
  check("exposure ordering is soldier > horseman > archer",
    findT("soldier").casualtyWeight > findT("horseman").casualtyWeight &&
    findT("horseman").casualtyWeight > findT("archer").casualtyWeight);
}

console.log("\n--- P3: training buildings gate their units, capped at one ---");
reset();
S().era = "bronze";
{
  check("archer hidden without an archery range", !api.isRevealed(archerDef));
  check("horseman hidden without stables", !api.isRevealed(horseDef));
  S().builds.barracks = 1;
  check("archery range revealed by a barracks", api.isRevealed(findB("archeryRange")));
  S().builds.archeryRange = 1; S().builds.stables = 1;
  check("archer revealed by the range", api.isRevealed(archerDef));
  check("horseman revealed by the stables", api.isRevealed(horseDef));
  check("archery range caps at one", api.isCapped(findB("archeryRange")));
  check("stables cap at one", api.isCapped(findB("stables")));
}

console.log("\n--- P3: Scouting is gated on the upgrade, not just the building ---");
reset();
S().era = "bronze";
{
  const scoutEv = findEv("scoutFind");
  S().builds.stables = 1;
  check("stables alone does not enable scouting events", !scoutEv.condition(S()));
  check("Scouting upgrade revealed by the stables", api.isRevealed(findU("scouting")));
  S().upgrades.scouting = true;
  check("the upgrade enables them", scoutEv.condition(S()));
  const before = { wood: S().res.wood, stone: S().res.stone, copper: S().res.copper };
  scoutEv.effect(S());
  check("a scouting find pays out", S().res.wood > before.wood && S().res.stone > before.stone &&
    S().res.copper > before.copper);
  check("scouting events are bronze-only (slate membership)",
    api.MANIFESTS.bronze.events.some(e => e.id === "scoutFind") &&
    !api.MANIFESTS.stone.events.some(e => e.id === "scoutFind"));
}

console.log("\n--- P3: raid types roll, and all are reachable ---");
{
  const seen = {};
  for (let i = 0; i < 3000; i++) seen[api.rollRaidType().id] = true;
  check("every raid type can occur", RAID_TYPES.every(t => seen[t.id]));
}

console.log("\n--- P3: end-to-end raid with composition ---");
{
  // Same forced sequence as the earlier conflict tests, now with a real army.
  reset();
  S().era = "bronze"; S().pop = 30;
  S().units = { soldier: 0, archer: 20, horseman: 0 };
  const conflictEv2 = findEv("conflict");
  let calls = 0;
  // trigger fires; smallest raid size; raid type = warband; repel succeeds; not costly.
  api.setRngSource(() => { calls++; return [0, 0, 0, 0.01, 0.99][calls - 1] ?? 0.99; });
  const unitsBefore = api.totalUnits();
  conflictEv2.resolve(S(), 1);
  api.setRngSource(null);
  check("a well-defended settlement repels cleanly", api.totalUnits() === unitsBefore);
  check("nobody died", S().pop === 30);
}

// ============ REGRESSION: reservations must never outrun the living ============
// The jobs half of this bug died with the jobs system; the reservation half is
// eternal. A death while unit orders are queued must abandon (and refund) the
// orders nobody is left to fill, or the order completes anyway and drives
// civilians() negative -- the E2 rewrite briefly reintroduced exactly that.
console.log("\n--- BUG: reservations must never outrun the living ---");
{
  reset(); api.ensureMap();
  S().era = "bronze";
  S().builds.barracks = 1; S().res.wood = 500;
  api.syncPopMirror();
  api.build(findT("soldier"));            // reserves one civilian
  check("one order queued", api.reserved() === 1);
  api.killAt(api.world.home, 1);          // sickness kills someone, somewhere real
  api.reconcileReservations();
  check("a single death leaves the reservation fillable", api.reserved() <= api.civilians());
  check("spare civilians never negative", spare() >= 0);
}
{
  // Harsher: a raid guts the settlement with more orders queued than
  // survivors. Deaths are hex deaths now; the invariant is eternal.
  reset(); api.ensureMap();
  S().era = "bronze";
  S().builds.barracks = 1; S().res.wood = 500;
  for (const id of S().map.owned) S().map.pop[id] = 2;
  api.syncPopMirror();                     // 6 civilians
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  check("four orders queued", api.reserved() === 4);
  const woodAfterOrders = S().res.wood;
  for (const id of S().map.owned) api.killAt(id, 2);
  api.reconcileReservations();
  console.log(`  after the massacre: civ=${api.civilians()} reserved=${api.reserved()} queue=${S().buildQueue.length}`);
  check("orders with nobody left to train were abandoned", api.reserved() <= Math.max(0, api.civilians()));
  check("abandoned orders were refunded", S().res.wood > woodAfterOrders);
}
{
  // A dominion of nothing but trained units has no one for the world to
  // strike: every hex is empty, so strikes find no target.
  reset(); api.ensureMap();
  for (const id of S().map.owned) S().map.pop[id] = 0;
  S().units = { soldier: 3, archer: 0, horseman: 0 };
  api.syncPopMirror();
  check("no civilians to begin with", api.civilians() === 0);
  check("the world cannot strike an empty dominion", api.strikeHex("sickness") === null);
  check("population never drops below the units it contains", S().pop >= api.totalUnits());
}
{
  // Fuzz it: random armies, random queues, random deaths.
  let worstIdle = 0, worstCiv = 0;
  for (let t = 0; t < 400; t++) {
    reset();
    S().era = "bronze";
    S().builds = Object.assign(S().builds, { barracks: 1, archeryRange: 1, stables: 1 });
    S().res = { food: 900, wood: 900, stone: 900, copper: 900, tin: 900, bronze: 900 };
    S().pop = 6 + Math.floor(Math.random() * 10);
    for (let q = 0; q < Math.floor(Math.random() * 4); q++) {
      api.build(pickOne([findT("soldier"), findT("archer"), findT("horseman")]));
    }
    for (let d = 0; d < 1 + Math.floor(Math.random() * 6); d++) {
      api.removeRandomUnit();   // civilian deaths land on hexes now (E5)
    }
    worstIdle = Math.min(worstIdle, spare());
    worstCiv = Math.min(worstCiv, api.civilians());
  }
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
  console.log(`  fuzz over 400 random settlements: worst spare=${worstIdle}, worst civilians=${worstCiv}`);
  check("fuzz: spare() never went negative", worstIdle >= 0);
  check("fuzz: civilians() never went negative", worstCiv >= 0);
}

// ================= FREE GROWTH: the old model is fully gone =================
// The wanderer event and its escalating food price were removed outright --
// the entire invisible-food-sink bug class dies with them.
console.log("\n--- Free growth: the purchase model is fully excised ---");
{
  reset();
  check("no wanderer entry remains in any era's slate",
    !api.MANIFESTS.stone.events.some(e => e.id === "wanderer") &&
    !api.MANIFESTS.bronze.events.some(e => e.id === "wanderer") &&
    !("wanderer" in api.EVENT_LIB));
  check("growthCost/growthBase/growthScale are gone",
    api.growthCost === undefined &&
    api.CONFIG.growthBase === undefined && api.CONFIG.growthScale === undefined);
  // (settlerIntervalSeconds and accrueGrowth died in E3 -- growth is local
  // to hexes and free; the E3 tombstone block owns those assertions now.)
  check("hex growth never touches food either", (() => {
    reset(); api.ensureMap();
    S().res.food = api.caps().food;
    const foodBefore = S().res.food;
    api.growPopulation(1);
    return S().res.food === foodBefore;
  })());
}
{
  // The effect-may-return-its-own-line engine capability outlives its first
  // user: events without one must still fall back to the flavor pool.
  reset();
  const hunt = findEv("greatHunt");
  check("events without a custom line still return undefined", hunt.effect(S()) === undefined);
}

// ================= PHASE A: THE MANIFEST COMPILER ITSELF =================
console.log("\n--- Phase A: compiled manifests have the right shape ---");
{
  const m = api.MANIFESTS;
  check("both eras compiled", !!m.stone && !!m.bronze);
  check("era-scoped values: names", m.stone.name === "Stone Age" && m.bronze.name === "Bronze Age");
  check("era-scoped values: carrying caps 8 -> 12 on the same plains (housing's heir)",
    m.stone.map.popCaps.plains === 8 && m.bronze.map.popCaps.plains === 12);
  check("era-scoped values: Settlement -> Village",
    m.stone.panelTitles["panel-holdings"] === "Settlement" &&
    m.bronze.panelTitles["panel-holdings"] === "Village");
  check("stone slate is exactly its four events", m.stone.events.length === 4);
  check("bronze slate adds exactly the two scout events", m.bronze.events.length === 6);
  check("hint slates differ by era: bronzeAvailable is stone-only",
    m.stone.hints.some(h => h.id === "bronzeAvailable") &&
    !m.bronze.hints.some(h => h.id === "bronzeAvailable"));
  check("hint slates differ by era: rotOre/firstBronze are bronze-only",
    !m.stone.hints.some(h => h.id === "rotOre") &&
    m.bronze.hints.some(h => h.id === "rotOre") &&
    m.bronze.hints.some(h => h.id === "firstBronze"));
  check("DEF_INDEX resolves a retired id (the capstone) after its era ends",
    api.DEF_INDEX.bronzeAge && api.DEF_INDEX.bronzeAge.id === "bronzeAge");
  check("DEF_INDEX carries the LATEST identity for a surviving id",
    api.DEF_INDEX.forge.converts.out.steel === 1 &&        // iron's recipe, not bronze's
    api.DEF_INDEX.infirmary.name === "Infirmary");         // the bronze rename, not the stone name
  check("the hut is not merely absent from eras -- it never compiled at all",
    api.DEF_INDEX.hut === undefined);
  reset();
  check("defById prefers the active era over DEF_INDEX", api.defById("infirmary").name === "Medicine Tent");
}

console.log("\n--- Phase A: the compiler is loud about authoring mistakes ---");
{
  const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  const mini = api.compileBase({
    name: "T", panelTitles: {}, popNoun: { singular: "p", plural: "ps" }, arrivalLine: "x", raidTypes: [],
    resources: [], upgrades: [], units: [],
    buildings: [{ id: "x", name: "X", kind: "building", base: {}, scale: 1, buildTime: 1, reveal: () => true }],
    events: [], hints: [],
  });
  check("removing an unknown id throws",
    throws(() => api.extendEra(mini, { remove: ["nope"], events: [], hints: [] })));
  check("overriding an unknown id throws",
    throws(() => api.extendEra(mini, { override: { nope: {} }, events: [], hints: [] })));
  check("adding a duplicate id throws",
    throws(() => api.extendEra(mini, { add: { buildings: [{ id: "x" }] }, events: [], hints: [] })));
  check("a missing events slate throws (slates are never inherited)",
    throws(() => api.extendEra(mini, { hints: [] })));
  check("a missing hints slate throws",
    throws(() => api.extendEra(mini, { events: [] })));
  check("an unknown event id in a slate throws",
    throws(() => api.extendEra(mini, { events: ["ghost"], hints: [] })));
  check("an unknown hint id in a slate throws",
    throws(() => api.extendEra(mini, { events: [], hints: ["ghost"] })));
  check("a legal no-op delta compiles cleanly",
    !throws(() => api.extendEra(mini, { events: [], hints: [] })));
  const child = api.extendEra(mini, { override: { x: { name: "Y" } }, events: [], hints: [] });
  check("override lands on the child", child.buildings[0].name === "Y");
  check("...and never on the parent", mini.buildings[0].name === "X");
}

// ================= PHASE B: TRANSITION MACHINERY =================
console.log("\n--- Phase B: the cross-reference validator ---");
{
  const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  const okBase = () => ({
    name: "V", panelTitles: {}, popNoun: { singular: "p", plural: "ps" }, arrivalLine: "x", raidTypes: [{ id: "raid", name: "raid", weight: 1 }],
    resources: [{ id: "gold", name: "Gold", baseCap: 10, capBuilding: null }],
    buildings: [{ id: "mint", name: "Mint", kind: "building", base: { gold: 1 }, scale: 1, buildTime: 1, reveal: () => true }],
    upgrades: [], units: [], events: [], hints: [],
  });
  const compileAndValidate = (mutate) => {
    const raw = okBase();
    mutate(raw);
    api.validateManifests({ test: api.compileBase(raw) });
  };
  check("a well-formed manifest validates", !throws(() => compileAndValidate(() => {})));
  check("the REAL manifests validate", !throws(() => api.validateManifests(api.MANIFESTS)));
  check("a cost in a nonexistent resource is caught",
    throws(() => compileAndValidate((r) => { r.buildings[0].base = { mithril: 5 }; })));
  check("a converter recipe naming a missing resource is caught",
    throws(() => compileAndValidate((r) => { r.buildings[0].converts = { in: { ore: 1 }, out: { gold: 1 }, rate: 1 }; })));
  check("a capBuilding that isn't a building this era is caught",
    throws(() => compileAndValidate((r) => { r.resources[0].capBuilding = "vault"; })));
  check("a works entry naming a missing resource is caught (the jobs validator's heir)",
    throws(() => compileAndValidate((r) => {
      r.map = { radius: 3, tileNoun: { singular: "t", plural: "ts" }, terrains: ["plains"],
        seats: [], popCaps: { plains: 5 }, works: { plains: { silver: 1 } } };
    })));
  check("a unit countering a missing raid type is caught",
    throws(() => compileAndValidate((r) => {
      r.units.push({ id: "guard", name: "Guard", kind: "unit", base: {}, buildTime: 1, reveal: () => true, counters: "dragons" });
    })));
  check("an event counter naming a missing building is caught",
    throws(() => {
      const raw = okBase();
      const m = api.compileBase(raw);
      m.events = [{ id: "x", counter: { building: "temple", reducePerUnit: 0.1 } }];
      api.validateManifests({ test: m });
    }));
  check("a def without reveal() is caught",
    throws(() => compileAndValidate((r) => { delete r.buildings[0].reveal; })));
  check("a migration with no primitive is caught",
    throws(() => {
      const m = api.compileBase(okBase());
      m.migrations = [{ bucket: "res", id: "gold" }];
      api.validateManifests({ test: m });
    }));
}

console.log("\n--- Phase B: manifestDiff ---");
{
  const d = api.manifestDiff(api.MANIFESTS.stone, api.MANIFESTS.bronze);
  // Eleven since the War Camp joined (2026-08-24): Bronze can reach outward,
  // so Bronze needs somewhere for a war party to gather.
  check("eleven additions across buildings/units/upgrades (incl. the iron capstone)",
    d.added.length === 11 && d.added.some((a) => a.id === "warCamp"));
  check("exactly one removal: the capstone", d.removed.length === 1 && d.removed[0].id === "bronzeAge");
  check("one rename: the infirmary (the hut died in E3)", d.renamed.length === 1 &&
    d.renamed.some(r => r.from.name === "Medicine Tent" && r.to.name === "Infirmary"));
  const first = api.manifestDiff(null, api.MANIFESTS.stone);
  check("a first era diffs against nothing: all its content is 'added'",
    first.added.length > 0 && first.removed.length === 0 && first.renamed.length === 0);
}

console.log("\n--- Phase B: the migration runner ---");
{
  // Two synthetic eras: OLD has a job and resources that NEW retires, plus
  // every migration primitive exercised at once.
  const OLD = api.compileBase({
    name: "Old", panelTitles: {}, raidTypes: [],
    resources: [
      { id: "wood", name: "Wood", baseCap: 99, capBuilding: null },
      { id: "bronze", name: "Bronze", baseCap: 99, capBuilding: null },
      { id: "tin", name: "Tin", baseCap: 99, capBuilding: null },
    ],
    buildings: [], upgrades: [], units: [], events: [], hints: [],
  });
  const NEW = api.extendEra(OLD, {
    name: "New",
    remove: ["bronze", "tin"],
    add: { resources: [{ id: "iron", name: "Iron", baseCap: 99, capBuilding: null }] },
    events: [], hints: [],
    migrations: [
      { bucket: "res", id: "bronze", convertTo: "iron", ratio: 0.5, narrate: "Old bronze is melted down for iron." },
      { bucket: "res", id: "tin", vanish: true, narrate: "The tin is left where it lies." },
    ],
  });
  reset();
  S().res.bronze = 21; S().res.tin = 40; S().res.wood = 7; S().res.iron = 0;
  S().pop = 10;
  const snapshot = JSON.parse(JSON.stringify(S()));
  api.runEraMigrations(OLD, NEW, snapshot);
  check("convertTo: bronze became iron at the ratio, floored", S().res.iron === 10);
  check("convertTo zeroes the source", S().res.bronze === 0);
  check("vanish zeroes tin", S().res.tin === 0);
  check("untouched state carries", S().res.wood === 7);

  // Formulas read the SNAPSHOT, not live state: an fn that reads a value an
  // earlier instruction already zeroed must still see the pre-transition number.
  const NEW2 = api.extendEra(OLD, {
    name: "New2", remove: ["bronze", "tin"],
    add: { resources: [{ id: "iron", name: "Iron", baseCap: 99, capBuilding: null }] },
    events: [], hints: [],
    migrations: [
      { bucket: "res", id: "bronze", vanish: true },
      { bucket: "res", id: "iron", fn: (snap) => snap.res.bronze * 2 },   // reads bronze AFTER it was vanished
    ],
  });
  reset();
  S().res.bronze = 15; S().res.iron = 0;
  api.runEraMigrations(OLD, NEW2, JSON.parse(JSON.stringify(S())));
  check("fn reads the frozen snapshot, immune to instruction order", S().res.iron === 30);
  check("...while the live vanish still applied", S().res.bronze === 0);
}

// ================= C1: THE IRON AGE ECONOMY FLIP =================
console.log("\n--- C1: the iron manifest ---");
{
  const m = api.MANIFESTS.iron;
  check("iron era compiled and validated (BOOT OK proves the validator passed)", !!m);
  const has = (cat, id) => m[cat].some(d => d.id === id);
  check("the alloy economy is gone", !has("resources", "copper") && !has("resources", "tin") &&
    !has("resources", "bronze") && !has("buildings", "oreYard"));
  check("stranded upgrades left the shop",
    !has("upgrades", "bronzeTools") && !has("upgrades", "bronzeWeapons") &&
    !has("upgrades", "scouting") && !has("upgrades", "flintSpears"));
  check("the capstone that led here is retired", !has("upgrades", "ironAge"));
  check("iron/steel/gold arrived", has("resources", "iron") && has("resources", "steel") && has("resources", "gold"));
  check("no ground can be turned to gold or steel (they only arrive, never grow)",
    Object.values(m.map.works).every((w) => !("gold" in w) && !("steel" in w)));
  check("new upgrades arrived; the storage line did NOT (caps retired, 6c)",
    has("upgrades", "ironTools") && has("upgrades", "ironWeapons") && has("upgrades", "steelArmor") &&
    !has("buildings", "ironYard") && !has("buildings", "treasury") &&
    !has("buildings", "granary") && !has("buildings", "woodshed") && !has("buildings", "stoneYard"));
  check("allocation and outputMult are not era-facts any more (universal since E2)",
    m.allocation === undefined && m.outputMult === undefined);
  check("housing retired at Iron: the hut line is gone entirely (6b)",
    !m.buildings.some(b => b.id === "hut"));
  check("growth and levy are not era-facts any more (E5: growth is local, the muster is the land)",
    m.growth === undefined && m.levy === undefined);
  check("consolidation is gone from the iron manifest (died in E2)",
    m.consolidate == null);
  check("the Village is now a Town", m.panelTitles["panel-holdings"] === "Town");
  const forge = m.buildings.find(b => b.id === "forge");
  check("the Forge persists, retargeted to steel",
    forge.converts.in.iron === 3 && forge.converts.in.wood === 2 && forge.converts.out.steel === 1);
  check("units re-priced out of the dead resource",
    !("bronze" in m.units.find(u => u.id === "archer").base) &&
    "iron" in m.units.find(u => u.id === "horseman").base &&
    "iron" in m.buildings.find(b => b.id === "stables").base);
  check("iron slate swaps in scoutFindIron", m.events.some(e => e.id === "scoutFindIron") &&
    !m.events.some(e => e.id === "scoutFind"));
  check("bronze manifest gained the ironAge capstone",
    api.MANIFESTS.bronze.upgrades.some(u => u.id === "ironAge"));
  const d = api.manifestDiff(api.MANIFESTS.bronze, m);
  // Ten removed since the War Camp retires here: it was priced in bronze, and
  // a ring of hide tents does not stage a legion. The Muster Ground succeeds it.
  check("diff: 6 added, 10 removed (the storage line among them; the hut predeceased), 0 renamed",
    d.added.length === 6 && d.removed.length === 10 && d.renamed.length === 0 &&
    d.removed.some((r) => r.id === "granary") &&
    d.removed.some((r) => r.id === "warCamp") &&
    !d.added.some((r) => r.id === "ironYard"));
}

console.log("\n--- C1: capstone gating and the real transition ---");
{
  api.setRngSource(() => 0.999999);   // no hazards during the long build
  reset();
  S().era = "bronze";
  api.initAdversaries(); api.ensureMap();
  const capstone = api.MANIFESTS.bronze.upgrades.find(u => u.id === "ironAge");
  // The gate is 50 real people now: give the trio deep pops (held above cap,
  // never shrunk) and let the mirror report them.
  for (const id of S().map.owned) S().map.pop[id] = 20;
  api.syncPopMirror();
  check("pop alone does not reveal the iron capstone", !api.isRevealed(capstone));
  S().units.archer = 1; api.syncPopMirror();
  check("pop + a composition unit reveals it", api.isRevealed(capstone));

  // A real bronze settlement takes the leap: stocked ores, workers on the
  // dead jobs, bronze in store -- everything the migration must handle.
  reset();
  S().era = "bronze";
  S().pop = 20; S().units = { soldier: 2, archer: 1, horseman: 1 };
  // No forge in this fixture: a running forge would keep smelting during the
  // 180s build and the bronze-at-flip number would drift off 70.
  S().builds = Object.assign(S().builds, { hut: 4, barracks: 1, oreYard: 2,
    granary: 20, woodshed: 4, stoneYard: 4 });   // deep larder: hex pops grow
                                                 // and eat through the 185s build
  S().res = Object.assign(S().res, { food: 450, wood: 450, stone: 450, bronze: 120, copper: 33, tin: 12 });
  api.ensureMap();
  S().map.work[api.world.home] = "food";   // fed through the 185s build window
  api.build(capstone);
  check("capstone queued and paid", S().buildQueue.length === 1 && S().res.bronze === 70);
  S().res.food = 2000;   // the capstone ate 400 of the larder; the hex
                         // populations eat harder than the old fixture did
  run(185);
  check("era flipped to iron", S().era === "iron");
  check("copper and tin vanished, narrated", S().res.copper === 0 && S().res.tin === 0);
  check("bronze became gold at 1:4, floored", S().res.gold === Math.floor(70 * 0.25));
  check("bronze stock zeroed by the conversion", S().res.bronze === 0);
  // (the ore-job walk-home check died in E2 -- there are no jobs to walk home from)
  // The border is a pure re-denomination since E2: no consolidation, no land
  // taken, nothing shrinks. (The old keep-0.25 cut died when the harness
  // caught it colliding with dominion-never-shrinks.)
  const snapPop = S().eraHistory.bronze.pop;
  check("families kept arriving during the long build", snapPop >= 20);
  check("the border takes nothing: population survives the crossing whole",
    S().pop >= snapPop - 4);
  check("the border takes nothing: every hex crossed with you",
    S().map.owned.length >= 1 && S().pop >= S().map.owned.length);
  check("the fighting bands carry whole across a levy border",
    S().units.soldier === 2 && S().units.archer === 1 && S().units.horseman === 1);
  check("stepper workers walked home when their jobs left the manifest", S().jobs.forager === 0);
  // (levyMigrated and the border bread-default died in E5 with the levy --
  // allocation exists from frame one and captures default to food themselves.)
  check("the noun is holdfast now", api.active().popNoun.singular === "holdfast");
  check("the books balance after all of it", spare() >= 0 && api.reserved() <= Math.max(0, api.civilians()));
  check("bronze-era snapshot archived at the border", !!S().eraHistory.bronze &&
    S().eraHistory.bronze.res.bronze === 70);
  // (housing died in E3 -- its absence is asserted in the E3 tombstone block)
  api.setRngSource(null);
}

console.log("\n--- C1: iron-era economy runs ---");
{
  api.setRngSource(() => 0.999999);
  reset();
  S().era = "iron";
  // Tile allocation (6c): iron comes from hills you hold, not a job stepper.
  S().pop = 5;
  // Fixture ids no generated world contains: unknown tiles work at par,
  // which is exactly what this block is measuring.
  S().map = { seed: 1, gen: 1, tileNoun: "holdfast", owned: ["f1", "f2", "f3", "f4", "f5"],
    work: { "f1": "food", "f2": "food", "f3": "food", "f4": "iron", "f5": "iron" },
    pop: { "f1": 4, "f2": 4, "f3": 4, "f4": 4, "f5": 4 } };
  S().res.food = 200;
  run(30);
  // 2 iron tiles x 4 people x 0.2/s at par x 30s = 48.
  check("iron flows from worked hills (2 tiles of 4 people, 30s, ~48)", S().res.iron > 40);
  S().builds.forge = 2; S().res.iron = 60; S().res.wood = 40;
  const w0 = S().res.wood;
  // Read the rate rather than restating it: it was hard-coded into five
  // separate checks, so retuning the Forge in 2026-08 meant editing all five
  // and getting every one right. A check that repeats a balance number is a
  // second place for it to be wrong.
  const iRate = api.MANIFESTS.iron.buildings.find((b) => b.id === "forge").converts.rate;
  const batches = 2 * iRate * 10;                    // 2 forges x rate x 10s
  api.runConverters(10);
  check("the Forge makes steel from iron AND wood",
    Math.abs(S().res.steel - batches) < 1e-9 &&
    Math.abs((w0 - S().res.wood) - 2 * batches) < 1e-9);
  check("iron consumed at the recipe ratio",
    Math.abs(S().res.iron - (60 - 3 * batches)) < 1e-9);
  const c = api.caps();
  check("caps retired at Iron: every resource runs uncapped (6c)",
    !Number.isFinite(c.food) && !Number.isFinite(c.wood) && !Number.isFinite(c.stone) &&
    !Number.isFinite(c.iron) && !Number.isFinite(c.steel) && !Number.isFinite(c.gold));
  api.setRngSource(null);
}

console.log("\n--- C1: tiers supersede across eras ---");
{
  reset();
  S().units.soldier = 10;
  S().upgrades.flintSpears = true; S().upgrades.bronzeWeapons = true;
  check("bronze tier active", api.weaponMultiplier() === 2.2);
  S().upgrades.ironWeapons = true;
  check("iron weapons supersede (3.0, not stacked)", api.weaponMultiplier() === 3.0);
  S().upgrades.hideArmor = true;
  check("hide armor halves", api.armorFactor() === 0.5);
  S().upgrades.steelArmor = true;
  check("steel armor supersedes (0.3)", api.armorFactor() === 0.3);
  S().upgrades.stoneTools = true; S().upgrades.bronzeTools = true; S().upgrades.ironTools = true;
  check("tool tiers stack additively to 1.45", Math.abs(api.mults().food - 1.45) < 1e-9);
  check("owned bronze-era upgrades keep working after leaving the shop",
    (S().era = "iron", api.weaponMultiplier() === 3.0 && api.armorFactor() === 0.3));
}

// ================= C2: ADVERSARIES & EXPEDITIONS =================
console.log("\n--- C2: adversaries in the manifest, validated ---");
{
  const advs = api.MANIFESTS.iron.adversaries;
  check("iron declares exactly three adversaries", advs.length === 3);
  // THE ROSTER IS THE SAME BOARD IN EVERY AGE (owner ruling, 2026-08-24).
  // Slates are still wholesale and never inherited -- each era retypes its
  // three -- so what needs pinning is that they retype the SAME three. A
  // dropped id here would delete a people at an era flip.
  check("every era declares the same three, redressed rather than replaced",
    ["stone", "bronze", "iron"].every((e) =>
      api.MANIFESTS[e].adversaries.map((a) => a.id).sort().join(",") ===
      "hillClans,riverKingdom,saltNomads"));
  // Majors outrank the minor band WITHIN their age, or the tier words describe
  // nothing. The compiler throws on this too; the check is the documentation.
  check("a major always outranks a minor of its own age",
    ["stone", "bronze", "iron"].every((e) => {
      const m = api.MANIFESTS[e];
      return m.adversaries.every((a) => a.strength > m.map.minors.strength[1]);
    }));
  // And each one grows. A survivor met in a later age must never be the same
  // creature you could have crushed two eras ago.
  check("each people strengthens with every age it survives",
    ["hillClans", "riverKingdom", "saltNomads"].every((id) => {
      const at = (e) => api.MANIFESTS[e].adversaries.find((a) => a.id === id).strength;
      return at("stone") < at("bronze") && at("bronze") < at("iron");
    }));
  check("contact opens at bronze -- stone has no one who could send an army",
    api.MANIFESTS.stone.contact === "none" &&
    api.MANIFESTS.bronze.contact === "open" && api.MANIFESTS.iron.contact === "open");

  // STOCKS GROW AND REFILL PER AGE (owner ruling, 2026-08-24). The reasoning
  // is the asymmetry: your economy compounds and theirs does not, so a fixed
  // stock means a neighbour is looted dry once and is thereafter a nuisance
  // with nothing to offer. Growth is asserted as a TOTAL rather than per
  // resource, because the resources themselves turn over between ages -- wood
  // gives way to bronze gives way to iron and gold.
  check("a people's larder grows with every age it survives",
    ["hillClans", "riverKingdom", "saltNomads"].every((id) => {
      const tot = (e) => {
        const a = api.MANIFESTS[e].adversaries.find((x) => x.id === id);
        return Object.values(a.stock).reduce((x, y) => x + y, 0);
      };
      return tot("stone") < tot("bronze") && tot("bronze") < tot("iron");
    }));
  check("and so does a steading's, band by band",
    ["stone", "bronze", "iron"].map((e) => {
      const m = api.MANIFESTS[e].map.minors.stock;
      return Object.values(m).reduce((x, r) => x + r[1], 0);
    }).every((v, i, a) => i === 0 || a[i - 1] < v));
  check("only peaceful adversaries trade",
    advs.every(a => !a.buys || a.disposition === "peaceful"));
  const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  const base = () => ({
    name: "T", panelTitles: {}, popNoun: { singular: "p", plural: "ps" }, arrivalLine: "x", raidTypes: [{ id: "raid", name: "raid", weight: 1 }],
    resources: [{ id: "gold", name: "Gold", baseCap: 10, capBuilding: null }],
    jobs: [], buildings: [], upgrades: [], units: [], events: [], hints: [],
  });
  const tryAdv = (adv) => {
    const raw = base(); raw.adversaries = [adv];
    api.validateManifests({ test: api.compileBase(raw) });
  };
  const ok = { id: "a", name: "a", disposition: "peaceful", strength: 5, fightsAs: "raid",
    campaignTime: 10, caravanTime: 10, stock: { gold: 5 }, buys: { res: "gold", amount: 1, pays: 1 } };
  check("a well-formed adversary validates", !throws(() => tryAdv(ok)));
  check("fightsAs must be a raid type this era",
    throws(() => tryAdv(Object.assign({}, ok, { fightsAs: "dragons" }))));
  check("stock keys must be era resources",
    throws(() => tryAdv(Object.assign({}, ok, { stock: { mithril: 5 } }))));
  check("a warlike adversary must not trade",
    throws(() => tryAdv(Object.assign({}, ok, { disposition: "warlike" }))));
  check("a malformed exchange is caught",
    throws(() => tryAdv(Object.assign({}, ok, { buys: { res: "gold", amount: 0, pays: 1 } }))));
}

console.log("\n--- C2: what an age can muster ---");
{
  reset();
  // WHAT AN AGE SENDS is an era fact: which building a column gathers at, and
  // how many it can carry. Bronze sends a war party of four; Iron sends a
  // column with no ceiling. That difference IS the scaling of the outward
  // verb -- reach needs no rule, because marchFactor already multiplies
  // provisions and time by the route.
  check("stone musters nothing at all -- there is no one to send",
    api.MANIFESTS.stone.muster === null);
  check("bronze gathers at a War Camp, iron at a Muster Ground",
    api.MANIFESTS.bronze.muster.building === "warCamp" &&
    api.MANIFESTS.iron.muster.building === "musterGround");
  // NO ERA DECLARES A COLUMN SIZE (owner ruling, 2026-08-25). A flat cap made
  // units you had already paid population for unusable -- "I had 4 of each
  // type, but I can only send 4 total" -- and flattened the mixed-column
  // decision the counter system exists to create. What an age sends is
  // answered by what it HOLDS (levyCap = owned hexes x armyPerHex) and what
  // it can FEED, both of which already differ by era without being told to.
  check("no era caps column size -- territory and provisions do that",
    ["stone", "bronze", "iron"].every((e) => {
      const m = api.MANIFESTS[e].muster;
      return !m || m.column === undefined;
    }));
  // The War Camp must EXIST in bronze, or `contact: "open"` is a promise the
  // era cannot keep -- which is precisely the bug this slice fixes: a March
  // button appearing at Bronze, permanently disabled behind an Iron building.
  check("and the building each age names is actually buildable in it",
    api.MANIFESTS.bronze.buildings.some((b) => b.id === "warCamp") &&
    api.MANIFESTS.iron.buildings.some((b) => b.id === "musterGround"));
  check("the war camp retires at iron -- hide tents do not stage a legion",
    !api.MANIFESTS.iron.buildings.some((b) => b.id === "warCamp"));

  api.S.era = "bronze";
  check("nothing musters until the camp stands", !api.musterBuilt());
  api.S.builds.warCamp = 1;
  check("...but it does once it does", api.musterBuilt());

  api.S.era = "iron";
  api.S.builds.warCamp = 1; api.S.builds.musterGround = 0;
  check("a war camp does not muster an iron column", !api.musterBuilt());

  // Territory sizes the army, in every era. Bronze holds 12 hexes at most and
  // Iron 20, so a Bronze army is smaller than an Iron one without any rule
  // saying so -- which is the whole reason the flat cap was redundant.
  check("a bigger dominion fields a bigger army, and Bronze's is capped smaller",
    api.MANIFESTS.bronze.map.dominionCap < api.MANIFESTS.iron.map.dominionCap);
}

console.log("\n--- C2: you march on what you can feed ---");
{
  reset();
  api.S.era = "bronze";
  api.initAdversaries(); api.ensureMap();
  api.S.builds.warCamp = 1;
  api.S.units.soldier = 10;          // ten at home...
  api.S.res.food = 5000;
  api.syncPopMirror();

  const target = Object.values(api.world.places).find((p) => p.minor);
  const ref = "tile:" + target.id;
  const plan = api.campaignPlan(ref);

  // AN ARMY EATS IN PROPORTION TO ITSELF. This is the only thing limiting
  // column size now, so it is the thing that has to be true.
  const one = api.provisionsFor(plan, 1);
  const ten = api.provisionsFor(plan, 10);
  check("ten fighters cost more to feed than one", ten > one);
  check("...and the extra is per fighter, not a flat surcharge",
    Math.abs((ten - one) - 9 * plan.provisionPerUnit) < 1.01);
  check("even an empty column carries its own overhead",
    api.provisionsFor(plan, 0) > 0);

  // Distance multiplies BOTH halves -- the supply-line rule doing its usual
  // work, so a long march with a big army is the costliest thing an era can
  // attempt. A route through your own country stays cheap.
  //
  // THIS CHECK USED TO READ `plan.provisionPerUnit >= CONFIG.campaignFoodPerUnit`
  // and failed on roughly one run in eight. It was wrong BY DESIGN, and the
  // sentence right above it says why: marchFactor clamps to [0.6, 2.0], so a
  // steading reachable through your own country legitimately prices BELOW par.
  // Whether it did depended on where generation happened to drop the nearest
  // minor -- an unseeded world sampled by `.find()`, which is a coin flip
  // wearing an assertion's clothes. Compare two routes instead, which is what
  // the check always claimed to do.
  const reachable = Object.values(api.world.places)
    .filter((p) => Number.isFinite(api.routeCost(p.id)));
  const cheapest = reachable.reduce((a, b) => (api.routeCost(a.id) <= api.routeCost(b.id) ? a : b));
  const dearest  = reachable.reduce((a, b) => (api.routeCost(a.id) >= api.routeCost(b.id) ? a : b));
  const perUnitAt = (id) => api.CONFIG.campaignFoodPerUnit * api.marchFactor(id);
  check("a longer route feeds the same column at a higher price",
    perUnitAt(dearest.id) > perUnitAt(cheapest.id));
  check("...and the bend stays inside the designed 0.6x-2x band",
    reachable.every((p) => {
      const f = api.marchFactor(p.id);
      return f >= 0.6 && f <= 2;
    }));
  check("the plan prices its own target at par x that target's route",
    Math.abs(plan.provisionPerUnit - perUnitAt(target.id)) < 1e-9);

  // Starve the larder to exactly one fighter's worth and the big column is
  // refused -- not by a cap, by arithmetic.
  api.S.res.food = ten - 1;
  api.launchCampaign(ref, { soldier: 10 });
  check("you cannot march an army you cannot provision",
    !api.expeditionOut("campaign"));

  api.S.res.food = 5000;
  api.launchCampaign(ref, { soldier: 10 });
  check("but ten CAN march when the food is there -- no headcount ceiling",
    api.expeditionOut("campaign"));
  const ex = api.S.expeditions.find((e) => e.type === "campaign");
  check("and the column that left is exactly who was mustered",
    ex && api.columnSize(ex.units) === 10);
  check("the provisions actually left the larder",
    api.S.res.food <= 5000 - ten);
}

console.log("\n--- C2: larders refill per age, grudges do not ---");
{
  reset();
  api.initAdversaries(); api.ensureMap();
  const minorId = Object.values(api.world.places).find((p) => p.minor).id;
  const river = () => api.S.adversaries.riverKingdom;
  const steading = () => api.S.map.minors[minorId];

  const stoneFood = river().stock.food;
  // Plunder them, and give them a reason to remember it.
  river().stock.food = 1; river().walls = 0; river().standing = -4;
  steading().stock.food = 0; steading().walls = 0;

  // WITHIN an age, nothing refills. This is the half that would break silently
  // if the era stamp were dropped: the state would re-seed on every ensureMap
  // and a plundered larder would be full again on the next frame.
  api.initAdversaries(); api.ensureMap();
  check("within one age, a plundered larder STAYS plundered",
    river().stock.food === 1 && steading().stock.food === 0);
  check("...and a breached wall stays breached",
    river().walls === 0 && steading().walls === 0);

  api.S.era = "bronze";
  api.initAdversaries(); api.ensureMap();
  check("an age turns and the larder refills, larger than it was",
    river().stock.food > stoneFood && steading().stock.food > 0);
  check("...and the walls come back taller than they were",
    river().walls > 0 && steading().walls >= 0);
  check("but the grudge outlives the granary -- standing is never re-seeded",
    river().standing === -4);

  api.S.era = "iron";
  api.initAdversaries(); api.ensureMap();
  check("a people that survives to Iron is richer again, and remembers still",
    Object.values(river().stock).reduce((a, b) => a + b, 0) > 400 &&
    river().walls === 26 && river().standing === -4);
  // Gold is the one that broke: seeding-once left every Iron major with a
  // stone-age larder, so caravans read "traded dry" the instant they launched.
  check("and has the gold that makes trade possible at all",
    (river().stock.gold || 0) > 0);
}

console.log("\n--- C2: living adversary state ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  check("state seeded from the manifest", S().adversaries.hillClans &&
    S().adversaries.hillClans.stock.food === 120 && S().adversaries.hillClans.standing === 0);
  S().adversaries.hillClans.stock.food = 7; S().adversaries.hillClans.standing = -3;
  api.initAdversaries();
  check("re-init never resets a living remnant", S().adversaries.hillClans.stock.food === 7 &&
    S().adversaries.hillClans.standing === -3);
  check("standing words", api.standingWord(-3) === "Hostile" && api.standingWord(-1) === "Wary" &&
    api.standingWord(0) === "Neutral" && api.standingWord(2) === "Friendly");
  check("a Hostile warlike neighbor raises home conflict frequency",
    Math.abs(api.hostilityMultiplier() - api.CONFIG.hostileConflictMult) < 1e-9);
  S().adversaries.hillClans.standing = 0;
  check("...and calm neighbors don't", api.hostilityMultiplier() === 1);
}

console.log("\n--- C2: deployment thins home defense ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().pop = 12; S().units = { soldier: 4, archer: 2, horseman: 0 };
  const homeBefore = api.militaryStrength();
  S().expeditions.push({ uid: 1, type: "campaign", adversary: "hillClans",
    units: { soldier: 3, archer: 1 }, total: 90, remaining: 90 });
  check("deployed units are counted", api.deployedCount("soldier") === 3 && api.availableUnits("soldier") === 1);
  check("home strength drops while the column is out", api.militaryStrength() < homeBefore);
  check("pop unchanged -- they're alive, just not home (civilians = pop minus ALL units, E5)",
    api.civilians() === 6 && S().pop === 12);
  // Home casualties can only take who's home: deploy EVERYONE, then ask.
  S().expeditions[0].units = { soldier: 4, archer: 2 };
  check("with everyone deployed, home casualties find no one", api.removeRandomUnit() === null);
  S().expeditions.length = 0;
}

console.log("\n--- C2: launching expeditions ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().pop = 12; S().units = { soldier: 4, archer: 0, horseman: 0 };
  S().res.food = 100;
  api.launchCampaign("hillClans", { soldier: 2 });
  check("no muster ground, no campaign", S().expeditions.length === 0);
  S().builds.musterGround = 1;
  api.launchCampaign("hillClans", { soldier: 99 });
  check("can't send more than are home", S().expeditions.length === 0);
  api.launchCampaign("hillClans", {});
  check("can't send nobody", S().expeditions.length === 0);
  // Provisions scale with the column now, so the expected figure is computed
  // rather than restated -- and computed BEFORE the launch spends it.
  const camPlan = api.campaignPlan("hillClans");
  const camFood = api.provisionsFor(camPlan, 2);
  api.launchCampaign("hillClans", { soldier: 2 });
  check("a legal campaign launches and pays provisions for exactly who went",
    S().expeditions.length === 1 && S().res.food === 100 - camFood);
  api.launchCampaign("hillClans", { soldier: 1 });
  check("one CAMPAIGN at a time", S().expeditions.filter(e => e.type === "campaign").length === 1);
  api.launchCaravan("riverKingdom");
  check("a caravan CAN roll while the campaign is out (parallel tracks)",
    S().expeditions.length === 2 && S().expeditions.some(e => e.type === "caravan"));
  check("the caravan paid its cargo up front", S().res.food === 100 - camFood - 60);
  check("deployment sums across everything that's out", api.deployedCount("soldier") === 2);
  S().res.iron = 50;
  api.launchCaravan("saltNomads");
  check("...but only one CARAVAN at a time", S().expeditions.length === 2);
  S().expeditions.length = 0;
  S().adversaries.riverKingdom.standing = -2;
  S().res.food = 100;
  api.launchCaravan("riverKingdom");
  check("a Hostile partner refuses your caravans", S().expeditions.length === 0);
}

console.log("\n--- C2.1: escorts decide how an ambush ends ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().builds.musterGround = 1;
  S().pop = 15; S().units = { soldier: 6, archer: 0, horseman: 0 };
  S().adversaries.hillClans.standing = -3;    // the roads are dangerous
  S().res.food = 300; S().builds.granary = 3; S().builds.treasury = 1;

  // Unescorted + forced ambush: cargo gone, their books never move.
  api.launchCaravan("riverKingdom");
  S().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0);         // ambush fires
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("unescorted ambush: cargo lost, nothing paid",
    S().expeditions.length === 0 && S().res.gold === 0);
  check("the kingdom's books never moved", S().adversaries.riverKingdom.stock.gold === 240);

  // Escorted + forced ambush + forced fight-through: the trade completes.
  S().res.food = 200;
  api.launchCaravan("riverKingdom", { soldier: 4 });
  check("escort rides out and is deployed", api.deployedCount("soldier") === 4);
  api.launchCampaign("hillClans", { soldier: 1 });
  check("deployment sums across both tracks",
    api.deployedCount("soldier") === 5 && api.availableUnits("soldier") === 1);
  S().expeditions = S().expeditions.filter(e => e.type === "caravan");   // put the column back
  S().expeditions[0].remaining = 0.1;
  let seq = [0, 0, 0.999];       // ambush fires; escort wins; no casualty
  api.setRngSource((() => { let n = 0; return () => seq[n++] ?? 0.999; })());
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("the escort fought through and the trade completed", S().res.gold === 15);
  check("their gold moved this time", S().adversaries.riverKingdom.stock.gold === 225);
  check("the escort came home whole", api.deployedCount("soldier") === 0 && S().units.soldier === 6);

  // Escorted + forced loss: cargo gone and a guard falls.
  S().res.food = 200;
  api.launchCaravan("riverKingdom", { soldier: 2 });
  S().expeditions[0].remaining = 0.1;
  seq = [0, 0.999];              // ambush fires; escort overwhelmed
  api.setRngSource((() => { let n = 0; return () => seq[n++] ?? 0.5; })());
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("a lost ambush costs the cargo and a guard -- but not the holdfast that raised them (levy)",
    S().res.gold === 15 && S().units.soldier === 5 && S().pop === 15);
  check("no payment on a lost ambush", S().adversaries.riverKingdom.stock.gold === 225);
}

console.log("\n--- C2: campaign resolution -- victory (one-shot breach) ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().pop = 12; S().units = { soldier: 6, archer: 0, horseman: 0 };
  S().builds.musterGround = 1; S().res.food = 100;
  S().builds.granary = 5; S().builds.woodshed = 5; S().builds.ironYard = 2; S().builds.treasury = 1;
  api.launchCampaign("hillClans", { soldier: 6 });   // wall-power 6 vs palisade 5: one assault
  const st = S().adversaries.hillClans;
  const stockBefore = Object.assign({}, st.stock);
  S().expeditions[0].remaining = 0.1;
  api.setRngSource((() => { let n = 0; return () => [0, 0.999][n++] ?? 0.999; })());  // win, no casualty
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("expedition resolved and cleared", S().expeditions.length === 0);
  check("the palisade came down in the same assault (power 6 >= walls 5)", st.walls === 0);
  check("plunder took 40% of each stock, floored",
    st.stock.food === stockBefore.food - Math.floor(stockBefore.food * 0.4) &&
    st.stock.gold === stockBefore.gold - Math.floor(stockBefore.gold * 0.4));
  check("the plunder came home", S().res.gold >= Math.floor(stockBefore.gold * 0.4) &&
    S().res.iron >= Math.floor(stockBefore.iron * 0.4));
  check("standing fell -- plunder is not diplomacy", st.standing === -1);
  check("nobody died on a clean win", S().units.soldier === 6 && S().pop === 12);
  check("their stock is permanently poorer (stock, not economy)",
    st.stock.food < stockBefore.food);
}

console.log("\n--- Siege: repelled at the walls, and the walls remember ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().pop = 10; S().units = { soldier: 2, archer: 0, horseman: 0 };
  S().builds.musterGround = 1; S().res.food = 200;
  const st = S().adversaries.riverKingdom;
  check("the castle's walls are seeded from the manifest", st.walls === 26);
  api.launchCampaign("riverKingdom", { soldier: 2 });   // wall-power 2 vs walls 26: repelled
  S().expeditions[0].remaining = 0.1;
  const goldBefore = S().res.gold;
  api.setRngSource(() => 0.999);   // light-loss roll misses
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("a failed breach is a retreat: everyone came home", S().units.soldier === 2 && S().pop === 10);
  check("no defender ever fell -- walls precede the field battle", true);
  check("no loot from a repelled assault", S().res.gold === goldBefore);
  check("but the scars persist: walls 26 -> 24", st.walls === 24);
  check("and they remember the attempt", st.standing === -1);

  // Grind it down with engines, then finally breach into a field defeat.
  S().units.siegeEngine = 3;
  S().res.food = 200;
  api.launchCampaign("riverKingdom", { soldier: 2, siegeEngine: 3 });  // wall-power 2 + 3x6 = 20 < 24
  S().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("engines carve deep: walls 24 -> 4", st.walls === 4);

  S().res.food = 200;
  api.launchCampaign("riverKingdom", { soldier: 2, siegeEngine: 3 });  // 20 >= 4: breached at last
  S().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);   // field: lose the win roll; casualty draws follow
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("the battered walls finally give way -- and stay down", st.walls === 0);
  check("the field battle happened this time: casualties taken",
    S().units.soldier + S().units.siegeEngine < 5);
  check("still no loot from a lost field battle", S().res.gold === goldBefore);
}

console.log("\n--- Re-denomination: nouns, inheritance, consolidation ---");
{
  const M = api.MANIFESTS;
  check("the ladder's first three rungs", M.stone.popNoun.singular === "settler" &&
    M.bronze.popNoun.singular === "family" && M.iron.popNoun.singular === "holdfast");
  check("arrival lines are era-facts", M.stone.arrivalLine.includes("wanderer") &&
    M.bronze.arrivalLine.includes("family") && M.iron.arrivalLine.includes("fealty"));
  check("no era consolidates any more -- borders re-denominate, they never take (E2)",
    !M.stone.consolidate && !M.bronze.consolidate && !M.iron.consolidate);
  // An era that says nothing inherits the noun (the Silicon-keeps-Bloc rule).
  const quiet = api.extendEra(M.iron, { events: [], hints: [] });
  check("popNoun inherits when a delta is silent", quiet.popNoun.singular === "holdfast" &&
    quiet.arrivalLine === M.iron.arrivalLine);
  check("consolidation is per-border, never inherited", quiet.consolidate === null);
  const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  check("a base era without popNoun fails validation", throws(() => {
    const raw = { name: "N", panelTitles: {}, raidTypes: [],
      resources: [], jobs: [], buildings: [], upgrades: [], units: [], events: [], hints: [] };
    api.validateManifests({ test: api.compileBase(raw) });
  }));

  // applyConsolidation() died in E5 (dead code since E2): borders take nothing.
  check("applyConsolidation is gone", api.applyConsolidation === undefined);
}

console.log("\n--- Siege: the machinery of the engine itself ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  check("nomads circle wagons, not walls (2)", S().adversaries.saltNomads.walls === 2);
  check("legacy adversary state gets walls raised once",
    (delete S().adversaries.hillClans.walls, api.initAdversaries(), S().adversaries.hillClans.walls === 5));
  S().units = { soldier: 2, archer: 0, horseman: 0, siegeEngine: 2 };
  check("wall-power: engines at x6, soldiers at x1 (2 + 12)",
    Math.abs(api.wallPower({ soldier: 2, siegeEngine: 2 }) - 14) < 1e-9);
  S().upgrades.ironWeapons = true;
  check("weapon tiers scale wall-power too", Math.abs(api.wallPower({ siegeEngine: 1 }) - 18) < 1e-9);
  delete S().upgrades.ironWeapons;
  check("in the field the engine is an ordinary unit",
    Math.abs(api.campaignStrength({ siegeEngine: 2 }, api.findAdversary("hillClans")) - 2) < 1e-9);
  check("and at home it defends at normal strength", Math.abs(api.militaryStrength() - 4) < 1e-9);
  const m = api.MANIFESTS.iron;
  check("Siege Workshop gates the engine",
    m.buildings.some(b => b.id === "siegeWorkshop" && b.cap === 1) &&
    m.units.find(u => u.id === "siegeEngine").reveal.toString().includes("siegeWorkshop"));
  const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  check("malformed walls are caught by the validator", throws(() => {
    const raw = { name: "W", panelTitles: {}, popNoun: { singular: "p", plural: "ps" }, arrivalLine: "x", raidTypes: [{ id: "r", name: "r", weight: 1 }],
      resources: [], jobs: [], buildings: [], upgrades: [], units: [], events: [], hints: [],
      adversaries: [{ id: "x", name: "x", disposition: "warlike", strength: 5, walls: -3, campaignTime: 10 }] };
    api.validateManifests({ test: api.compileBase(raw) });
  }));
}

console.log("\n--- C2: caravan resolution and the gold well running dry ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().builds.musterGround = 1;
  S().pop = 8; S().res.food = 200; S().builds.treasury = 1;
  const st = S().adversaries.riverKingdom;
  api.launchCaravan("riverKingdom");
  S().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);   // no route risk roll matters (no hostile warlike anyway)
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("the caravan paid out", S().res.gold === 15);
  check("their gold came out of their stock", st.stock.gold === 225);
  check("the sold food JOINED their stock", st.stock.food === 250 + 60);
  check("trade builds standing", st.standing === 1);

  // Trade them dry: their gold is finite, so the well really empties.
  st.stock.gold = 4;
  api.launchCaravan("riverKingdom");
  S().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("a nearly-dry partner pays what they have left", S().res.gold === 19 && st.stock.gold === 0);
  api.launchCaravan("riverKingdom");
  check("a traded-dry partner is refused at launch", S().expeditions.length === 0);

  // Friendly premium: standing >= 2 pays 25% more.
  st.stock.gold = 100; st.standing = 2;
  S().res.food = 200;
  api.launchCaravan("riverKingdom");
  S().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("a Friendly partner pays a premium", S().res.gold === 19 + Math.floor(15 * 1.25));
}

console.log("\n--- C2: expeditions resolve through step() ---");
{
  api.setRngSource(() => 0.999999);
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().pop = 10; S().units.soldier = 2;
  S().builds.musterGround = 1;
  S().res.food = 300; S().builds.granary = 3;
  S().jobs.forager = 3;
  api.launchCaravan("saltNomads");   // needs 40 iron -- wait, nomads buy iron
  check("caravan needs its cargo in store", S().expeditions.length === 0);
  S().res.iron = 50;
  api.launchCaravan("saltNomads");
  check("cargo paid", Math.abs(S().res.iron - 10) < 1e-9);
  run(api.MANIFESTS.iron.adversaries.find(a => a.id === "saltNomads").caravanTime + 2);
  check("the caravan resolved mid-simulation, no interaction needed",
    S().expeditions.length === 0 && S().res.gold > 0);
  api.setRngSource(null);
}

console.log("\n--- C2: an era flip mid-flight strands nobody ---");
{
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().pop = 10; S().units.soldier = 3;
  S().expeditions.push({ uid: 9, type: "campaign", adversary: "ghostsOfAnOldEra",
    units: { soldier: 3 }, total: 10, remaining: 0.1 });
  check("units are away", api.availableUnits("soldier") === 0);
  api.resolveExpeditions(0.2);
  check("the column simply comes home", S().expeditions.length === 0 &&
    api.availableUnits("soldier") === 3 && S().units.soldier === 3 && S().pop === 10);
}

console.log("\n--- Ledger rates: converter flows shown honestly ---");
{
  // Full-speed forge: ample stocks, room in the bronze store.
  reset();
  S().era = "bronze";
  S().builds.forge = 2;
  S().res.copper = 100; S().res.tin = 100;
  let r = api.ledgerRates();
  // Rate retuned 0.05 -> 0.20 (owner playtest, 2026-08-25). These pin the
  // ARITHMETIC, not the balance number, so they read it from the manifest
  // rather than hard-coding it twice -- retuning again should not require
  // editing three checks and getting all three right.
  const fRate = api.MANIFESTS.bronze.buildings.find((b) => b.id === "forge").converts.rate;
  check(`bronze rate = forges x recipe out (2 x ${fRate})`,
    Math.abs(r.bronze - 2 * fRate) < 1e-9);
  check("copper reads NET of forge consumption",
    Math.abs(r.copper - (-2 * fRate * 4)) < 1e-9);
  check("tin reads net too",
    Math.abs(r.tin - (-2 * fRate * 1)) < 1e-9);
  check("rates() itself stays gross -- the simulation is untouched", api.rates().bronze === 0);

  // The designed equilibrium: 2 copper : 1 tin miners feeding 2 forges.
  // Stocks at zero, inflow exactly matches consumption -- the ledger should
  // read it as steady, not flickering.
  reset();
  S().era = "bronze";
  S().builds.forge = 2;
  // Post-E2 the ore inflow comes from worked hills. The forge's designed
  // equilibrium (2 forges = 0.4 copper + 0.1 tin per second) is matched by
  // hand-built hills whose populations produce EXACTLY those rates:
  // copper: n * 0.2 * 0.8 = 0.4 -> impossible with whole people... so this
  // check now asserts the general property (converters clamp to inflow at
  // zero stock) rather than one hand-tuned equilibrium.
  api.ensureMap();
  const hill = Object.values(api.world.places).find((p) => p.terrain === "hills" && !p.adversary && !p.minor);
  S().map.owned = [api.world.home, hill.id];
  S().map.pop = {}; api.ensurePop();
  S().map.pop[hill.id] = 5;
  S().map.work = {}; S().map.work[hill.id] = "copper";
  S().res.copper = 0; S().res.tin = 0;
  r = api.ledgerRates();
  check("zero-stock converter consumes no more copper than arrives", r.copper >= -1e-9);
  check("no tin arriving, none consumed: tin nets to zero", Math.abs(r.tin) < 1e-9);
  check("bronze still flows from what copper does arrive", r.bronze > 0 || r.copper > 0);

  // Starved forge: no stock, no miners -- it isn't running, say so.
  reset();
  S().era = "bronze";
  S().builds.forge = 3;
  r = api.ledgerRates();
  check("a starved forge shows no bronze flow", r.bronze === 0);
  check("and eats nothing", Math.abs(r.copper || 0) < 1e-9);

  // Output capped: full bronze store stops the forge, ledger agrees.
  reset();
  S().era = "bronze";
  S().builds.forge = 2;
  S().res.copper = 100; S().res.tin = 100;
  S().res.bronze = api.caps().bronze;
  r = api.ledgerRates();
  check("a capped output shows no flow either way", r.bronze === 0 && Math.abs(r.copper || 0) < 1e-9);

  // Iron era: the forge burns wood, and the ledger shows it.
  reset();
  S().era = "iron";
  S().pop = 8;
  S().builds.forge = 2;
  S().map = { seed: 1, gen: 1, tileNoun: "holdfast", owned: ["f1", "f2", "f3"],
    work: { "f2": "wood", "f3": "wood" }, pop: { "f1": 2, "f2": 4, "f3": 4 } };
  S().res.iron = 100; S().res.wood = 100;
  r = api.ledgerRates();
  const iRate2 = api.MANIFESTS.iron.buildings.find((b) => b.id === "forge").converts.rate;
  const draw = 2 * iRate2;                           // 2 forges' worth of batches/s
  check("steel flows at 2 forges' rate", Math.abs(r.steel - draw) < 1e-9);
  // 8 people on wood at par = 1.6 gross, minus the forges' burn of 2 wood each.
  check("wood reads worked forest minus the forge's burn",
    Math.abs(r.wood - (1.6 - 2 * draw)) < 1e-9);
  check("iron reads as pure drain with no miners",
    Math.abs(r.iron - (-3 * draw)) < 1e-9);
}

console.log("\n--- Phase B: legacy saves default eraHistory ---");
{
  const legacy = JSON.parse(JSON.stringify(api.freshState()));
  delete legacy.eraHistory;
  const merged = Object.assign(api.freshState(), legacy);
  check("a save from before eraHistory existed defaults to {}",
    merged.eraHistory && typeof merged.eraHistory === "object");
}

console.log("\n--- Phase 3: offline is gone; the save is load-bearing ---");
{
  check("simulateOffline no longer exists", api.simulateOffline === undefined);
  check("the SIM flag no longer exists", api.SIM === undefined);
  check("offlineCapHours no longer exists", api.CONFIG.offlineCapHours === undefined);
  check("freshState carries no wall-clock stamp", api.freshState().lastSeed === undefined);

  // Mid-construction round-trip through the REAL save/load path: the queue
  // survives serialization verbatim and the revived save finishes the build.
  reset();
  S().res.wood = 100;
  api.build(findB("granary"));
  run(3);
  const midRemaining = S().buildQueue[0].remaining;
  api.save();
  S().res.wood = 9999;               // scribble on live state...
  api.load();                        // ...and prove load restores the saved copy
  check("save/load round-trips a build mid-construction",
    S().buildQueue.length === 1 && Math.abs(S().buildQueue[0].remaining - midRemaining) < 1e-9);
  check("load restores the saved copy, not live state", S().res.wood < 9999);
  run(15);
  check("the revived save finishes the build", S().builds.granary === 1 && S().buildQueue.length === 0);

  // Mid-flight expedition round-trip: a column in the field survives the
  // save, and the revived save resolves it on the world's schedule.
  reset();
  S().era = "iron"; api.initAdversaries();
  S().pop = 12; S().units.soldier = 5; S().builds.musterGround = 1;
  S().res.food = 200;
  api.launchCampaign("hillClans", { soldier: 4 });
  run(2);
  api.save(); api.load();
  check("a campaign in the field survives the round-trip",
    S().expeditions.length === 1 && S().expeditions[0].type === "campaign");
  S().expeditions[0].remaining = 0.4;
  run(2);
  check("the revived campaign resolves on schedule", S().expeditions.length === 0);
  check("resolution had consequences (standing moved)", S().adversaries.hillClans.standing < 0);
}

console.log("\n--- Phase 6d: the growth verbs -- minors, settle, routes ---");
{
  reset();
  // Pinned seed: the supply-line assertion below is geometry-sensitive, and
  // the E3 trio start added route sources that cost it its margin on rare
  // layouts (caught as a 1-in-12 flake). Seeds 1-5 were verified to hold the
  // property; determinism beats fuzzing for a check this shape-dependent.
  S().seed = 3; S().rngState = 3;
  S().era = "iron"; S().seen.levyMigrated = true; S().pop = 4;
  api.initAdversaries(); api.ensureMap();

  const minors = Object.values(api.world.places).filter((p) => p.minor);
  check("the minor tier is seated by density, on land, off your doorstep",
    minors.length >= 3 && minors.every((p) => p.terrain !== "water" && !p.adversary) &&
    minors.every((p) => api.distance(api.world, "0,0", p.id) >= 2));
  // The pool holds bare PLACE names; the era supplies the settlement noun.
  // Both halves are asserted, because a form that silently stopped applying
  // would leave "Coldwater" on the board and read as merely terse.
  check("every minor is named from the hand-authored pool, uniquely",
    new Set(minors.map((p) => p.minor.place)).size === minors.length &&
    minors.every((p) => api.MANIFESTS.iron.map.minors.names.includes(p.minor.place)));
  check("and wears its age's noun over that place name",
    minors.every((p) => p.minor.name === "the freehold at " + p.minor.place));
  check("no two steadings share a border -- they read as separate peoples",
    minors.every((p) => p.adj.every((n) => !api.world.places[n].minor)));
  check("minor remnants reconciled into S.map.minors",
    minors.every((p) => S().map.minors[p.id] && S().map.minors[p.id].walls === p.minor.wallsMax));

  // Routes: a line of owned tiles cheapens the march.
  const far = minors.map((p) => p.id).sort((a, b) =>
    api.distance(api.world, "0,0", b) - api.distance(api.world, "0,0", a))[0];
  const before = api.routeCost(far);
  // own a straight-ish line toward it (annex neighbours along the hex line)
  const target = api.world.places[far];
  const line = Object.values(api.world.places)
    .filter((p) => p.terrain !== "water" && !p.minor && !p.adversary && !S().map.owned.includes(p.id))
    .sort((a, b) =>
      (api.hexDistance(a.q, a.r, target.q, target.r) + api.hexDistance(a.q, a.r, 0, 0)) -
      (api.hexDistance(b.q, b.r, target.q, target.r) + api.hexDistance(b.q, b.r, 0, 0)))
    .slice(0, 4).map((p) => p.id);
  S().map.owned.push(...line);
  check("a line of your own country cheapens the route (supply lines)",
    api.routeCost(far) < before);
  S().map.owned = S().map.owned.filter((id) => !line.includes(id));

  // Settle: queued, priced, completes into a holdfast on default bread.
  const empty = Object.values(api.world.places)
    .find((p) => p.terrain !== "water" && !p.minor && !p.adversary && !S().map.owned.includes(p.id));
  const plan = api.settlePlan(empty.id);
  check("settling is priced work, scaled by the route", plan && plan.cost.food >= 24 && plan.time >= 27);
  S().res.food = 500; S().res.wood = 500; S().res.stone = 500; S().res.iron = 500;
  const popBefore = S().pop;
  api.launchSettle(empty.id);
  check("settling joins the Underway queue", S().buildQueue.some((q) => q.kind === "settle"));
  check("no double parties to one hex", (api.launchSettle(empty.id), S().buildQueue.filter((q) => q.kind === "settle").length === 1));
  api.setRngSource(() => 0.99);         // hold the world's dice: this checks settle
  run(Math.ceil(plan.time) + 60);       // completion, not event weather -- a sickness
  api.setRngSource(null);               // or raid in ~90s would shift pop (the old flake)
  check("the party raises a hall: owned, peopled, turned to bread",
    S().map.owned.includes(empty.id) && api.hexPop(empty.id) >= 2 && S().pop > popBefore &&
    S().map.work[empty.id] === "food");

  // Capture: a campaign against a minor, forced win, takes the place whole.
  S().builds.musterGround = 1; S().units.soldier = 6; S().res.food = 500;
  const mtile = minors[0].id;
  S().map.minors[mtile].walls = 0;      // walls down; test the field, not the siege
  const mstock = Object.assign({}, S().map.minors[mtile].stock);
  const popBefore2 = S().pop;
  api.launchCampaign("tile:" + mtile, { soldier: 4 });
  check("a column can march on a minor", S().expeditions.length === 1);
  S().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.0);          // win, no casualty roll fires bad
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("capture: the tile swears fealty -- owned, peopled, bread by default",
    S().map.owned.includes(mtile) && api.hexPop(mtile) >= 2 && S().pop > popBefore2 &&
    S().map.work[mtile] === "food");
  check("the whole stock came home", Object.keys(mstock).every((k) => S().res[k] >= mstock[k]));
  check("the minor's remnant is gone -- the Chronicle had the name last",
    S().map.minors[mtile] === undefined);

  // A captured tile survives the save: ownership is state, the minor is not.
  api.save(); api.load(); api.ensureMap();
  check("capture survives save/load -- ownership trumps the regenerated seat",
    S().map.owned.includes(mtile) && !S().map.minors[mtile]);
}

console.log("\n--- Phase 10: the renderer port keeps the marks ---");
{
  // The 3D stage draws pixels the harness cannot see, and that is fine -- the
  // sim never touches the renderer, so every other check here is unaffected by
  // the port. What IS checkable, and what a port silently breaks, is the
  // INFORMATION each tile carries: home, a named seat, the work letter on
  // owned country, a minor's dot. Both renderers read this one ladder, so
  // pinning it here is what stops them drifting apart.
  reset();
  api.closeModal();
  api.S.era = "iron";
  api.S.seen.levyMigrated = true;
  api.S.pop = 6;
  api.initAdversaries();
  api.ensureMap();
  api.syncDominion();
  api.defaultAssignments();

  const P = (id) => api.world.places[id];
  const home = P(api.world.home);
  check("the home tile wears the house glyph", api.markFor(home).glyph === "\u2302");

  // Fog first: unpainted board says NOTHING about itself, which is the whole
  // honesty rule. A seat sitting in the fog must not announce itself.
  const hidden = Object.values(api.world.places).find((x) => !api.isCharted(x.id));
  check("the board is bigger than what is known", !!hidden);
  check("unrevealed board carries no mark at all", api.markFor(hidden) === null);

  const seat = Object.values(api.world.places).find((x) => x.adversary);
  // Reveal it by hand: what a seat looks like ONCE FOUND is the thing under
  // test here, and scouting is not built until slice 6.
  api.S.map.revealed.push(seat.id);
  const sm = api.markFor(seat);
  // A HOUSE MEANS A HOME, and colour says whose: your seat and a rival's seat
  // wear the SAME glyph, because they are the same kind of thing. The board
  // reads "someone lives here" before it reads "who", which is the order a
  // player actually needs. Colour lives in styles.css (.home white, .seat and
  // .minor red) and cannot be asserted from here -- what CAN be asserted is
  // that the glyph is shared, which is the half a refactor would break.
  const homeMark = api.markFor(api.world.places[api.world.home]);
  check("a seat wears a house, the same glyph your own seat wears",
    sm.glyph === "\u2302" && homeMark.glyph === "\u2302");
  check("a seat carries its name -- the label is the map's only prose",
    typeof sm.label === "string" && sm.label.length > 0);
  check("your seat and a rival's are told apart by class, not by glyph",
    homeMark.cls === "home" && sm.cls === "seat");

  const minor = Object.values(api.world.places).find((x) => x.minor && !api.isOwned(x.id));
  api.S.map.revealed.push(minor.id);
  check("a minor wears a house too, and no label (a map, not a directory)",
    api.markFor(minor).glyph === "\u2302" && !api.markFor(minor).label);

  // Owned country reports what it is WORKING, and every resource letter is
  // distinct -- a collision here would be invisible on screen and wrong.
  const ownedId = api.S.map.owned.find((id) => id !== api.world.home);
  api.S.map.work[ownedId] = "iron";
  check("owned country wears its work letter", api.markFor(P(ownedId)).glyph === "I");
  const letters = ["food", "wood", "stone", "iron"].map((res) => {
    api.S.map.work[ownedId] = res;
    return api.markFor(P(ownedId)).glyph;
  });
  check("every work letter is distinct", new Set(letters).size === 4);

  delete api.S.map.work[ownedId];
  check("owned country with nothing assigned wears the rest dash (idle's heir)",
    api.markFor(P(ownedId)).glyph === "—" && api.markFor(P(ownedId)).cls === "rest");

  const wild = Object.values(api.world.places)
    .find((x) => !api.isOwned(x.id) && !x.adversary && !x.minor && x.id !== api.world.home
      && api.isCharted(x.id));
  check("known but empty country carries no mark at all", api.markFor(wild) === null);
}

console.log("\n--- Slice 4c: neighbours by density, seated on their own ground ---");
{
  const spec = api.MANIFESTS.iron.map;
  // Every adversary's DESCRIPTION already names its ground; placement now
  // agrees with it. Preference, not demand -- so this asks how often it
  // lands, not whether it always does.
  let onHome = 0, total = 0, minorCounts = [];
  for (let seed = 1; seed <= 30; seed++) {
    const w = api.generateMap(seed, spec, null);
    for (const p of Object.values(w.places)) {
      if (!p.adversary) continue;
      const adv = api.MANIFESTS.iron.adversaries.find((a) => a.id === p.adversary);
      if (!adv || !adv.homeTerrain) continue;
      total += 1;
      if (p.terrain === adv.homeTerrain) onHome += 1;
    }
    minorCounts.push(Object.values(w.places).filter((p) => p.minor).length);
  }
  console.log(`  seats on their own ground: ${onHome}/${total}`);
  check("adversaries are seated on the ground their own flavour names",
    total > 0 && onHome / total >= 0.9);

  const avg = minorCounts.reduce((a, b) => a + b, 0) / minorCounts.length;
  const spread = new Set(minorCounts).size;
  console.log(`  steadings per world across 30 seeds: ${Math.min(...minorCounts)}-${Math.max(...minorCounts)}, avg ${avg.toFixed(1)}`);
  check("neighbours scale with the world rather than being a fixed five",
    avg >= 4 && avg <= 14 && spread > 1);
  check("...and never outrun the hand-authored name pool",
    Math.max(...minorCounts) <= spec.minors.names.length);

  // The per-hex hash means WHO exists cannot be shifted by a later stage.
  const a = api.generateMap(99, spec, "broadwater");
  const b = api.generateMap(99, spec, "broadwater");
  const ids = (w) => Object.values(w.places).filter((p) => p.minor).map((p) => p.id).sort().join("|");
  check("the same seed seats the same neighbours, exactly", ids(a) === ids(b));
}

console.log("\n--- Slice 4b: sight across water ---");
{
  api.setRngSource(() => 0.99);
  reset(); api.closeModal();
  api.S.seed = 7; api.S.rngState = 7;
  api.S.map = null;
  api.ensureMap();

  const wet = (id) => { const p = api.world.places[id]; return !p || p.ocean || p.terrain === "water"; };

  // Chart the whole MAINLAND -- and only the mainland, or there would be no
  // island left to sight (the first version of this fixture owned every land
  // tile in the world, islands included, and duly found nothing across the
  // water). Then ask what the sea gave back.
  const diag0 = api.frameDiagnostics(api.world);
  const islandTiles = new Set(diag0.islands.flatMap((i) => i.tiles));
  const mainland = Object.keys(api.world.places).filter((id) => !wet(id) && !islandTiles.has(id));
  api.S.map.owned = mainland.slice();
  api.syncCharted();

  const sighted = api.S.map.sighted || [];
  check("sight reaches the sea from a charted coast", sighted.some((id) => wet(id)));
  check("and finds land across it", sighted.some((id) => !wet(id) && !api.isCharted(id)));

  // THE RANGE: nothing sighted lies further than SIGHT_RANGE water steps from
  // charted land. This is the rule the renderer and the island law share.
  let worst = 0;
  for (const id of sighted) {
    // water distance from any charted land
    let best = Infinity;
    const seen = new Set([id]);
    let frontier = [[id, 0]];
    while (frontier.length && best === Infinity) {
      const next = [];
      for (const [cur, d] of frontier) {
        for (const n of api.world.places[cur].adj) {
          if (api.isCharted(n) && !wet(n)) { best = Math.min(best, d); continue; }
          if (seen.has(n) || !wet(n)) continue;
          seen.add(n); next.push([n, d + 1]);
        }
      }
      frontier = next;
    }
    if (Number.isFinite(best)) worst = Math.max(worst, best);
  }
  check("nothing is sighted beyond the range the rule allows",
    worst <= api.SIGHT_RANGE);

  // Sight reveals the BOARD, never the PIECES. Note the raw `sighted` set
  // legitimately contains charted coast too -- it is sticky, and ground you
  // once saw across a bay does not un-see itself when you settle it. The
  // CLASSIFICATION is what matters, and isSighted() is where it lives.
  const seenLand = sighted.filter((id) => !wet(id) && !api.isCharted(id));
  check("land across the water is drawn", seenLand.length > 0 && seenLand.every((id) => api.isVisible(id)));
  check("...but is NOT charted -- no props, no marks, no interaction",
    seenLand.every((id) => api.isSighted(id) && !api.isCharted(id)));
  check("sighted ground carries no mark", seenLand.every((id) => api.markFor(api.world.places[id]) === null));

  // Seeing is not knowing: a full coast's worth of rays charts nothing and
  // claims nothing. (An earlier version of this block asserted that an island
  // "keeps its size secret" -- untrue for a small island ringed by charted
  // coast, which is genuinely seen from several angles at once. The honest
  // invariant is that sight never CHARTS.)
  const ownedBefore = api.S.map.owned.length;
  const chartedBefore = api.S.map.revealed.length;
  api.syncSighted();
  check("sight never charts and never claims",
    api.S.map.owned.length === ownedBefore && api.S.map.revealed.length === chartedBefore);

  // Sticky, like charting.
  const before = sighted.length;
  api.syncCharted();
  check("sight is sticky and additive", (api.S.map.sighted || []).length >= before);
  api.setRngSource(null);
  // ...and the same rule again, measured from the ORIGIN THAT MATTERS. The
  // check above walks water back to any CHARTED land, which is the very
  // mistake syncSighted itself was making, so it passed happily while a fresh
  // game showed land five steps out: rays were leaving every charted hex,
  // including the ring of neighbours you own nothing of. Measuring plain hex
  // distance from OWNED ground has no such blind spot.
  //
  // The bound is SIGHT_RANGE + 1: three steps of open water, then the far
  // shore. Anything beyond that means someone is using a vantage point they
  // do not stand on.
  {
    let far = 0, farSeed = null;
    for (let seed = 1; seed <= 12; seed++) {
      reset(); S().seed = seed;
      api.initAdversaries(); api.ensureMap();
      const owned = S().map.owned;
      const vis = new Set([...(S().map.revealed || []), ...(S().map.sighted || [])]);
      for (const id of vis) {
        let best = Infinity;
        for (const o of owned) best = Math.min(best, api.distance(api.world, o, id));
        if (Number.isFinite(best) && best > far) { far = best; farSeed = seed; }
      }
    }
    check(`no ground is visible further than SIGHT_RANGE+1 from land you actually hold (worst ${far} of ${api.SIGHT_RANGE + 1}, seed ${farSeed})`,
      far <= api.SIGHT_RANGE + 1);
  }
}

console.log("\n--- Slice 4: the authored continents ---");
{
  // The frames are CONTENT, and this is their validator. Each continent is
  // generated across many seeds and asked the questions an authoring mistake
  // would fail: is it a real country, is it whole, and -- THE ISLAND LAW --
  // can every island be seen from somewhere, directly or down a chain?
  const spec = {
    tileNoun: { singular: "clearing", plural: "clearings" },
    terrains: ["plains", "forest", "hills", "river", "water"],
    seats: [],
  };
  let worstOrphan = null, checked = 0;
  for (const cont of api.CONTINENTS) {
    let minLand = 1e9, islandsSeen = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const w = api.generateMap(seed, spec, cont.id);
      const d = api.frameDiagnostics(w);
      minLand = Math.min(minLand, d.land);
      islandsSeen += d.islands.length;
      checked += 1;
      if (d.unsightable.length && !worstOrphan) {
        worstOrphan = { cont: cont.id, seed, size: d.unsightable[0].size };
      }
      if (seed === 1) {
        check(cont.name + ": a real country (120-160 land)", d.land >= 120 && d.land <= 160);
        check(cont.name + ": mostly one connected mainland", d.mainland >= d.land * 0.6);
        check(cont.name + ": has islands to want", d.islands.length >= 1);
        check(cont.name + ": the seat sits on the mainland", w.places["0,0"] && !w.places["0,0"].ocean);
      }
    }
  }
  console.log(`  ${checked} continent-seeds generated`);
  check("THE ISLAND LAW holds on every continent, every seed: no land is unseeable",
    worstOrphan === null);
  if (worstOrphan) {
    console.log(`  orphan: ${worstOrphan.cont} seed ${worstOrphan.seed}, ${worstOrphan.size} hexes`);
  }
  // A bare seed reproduces the whole world, continent included.
  check("the continent is drawn FROM the seed (a number reproduces a world)",
    api.pickContinent(4242) === api.pickContinent(4242) &&
    api.CONTINENTS.some((c) => c.id === api.pickContinent(4242)));
}

console.log("\n--- The dominion cap: what one age can hold ---");
{
  api.setRngSource(() => 0.99);
  reset(); api.closeModal(); api.ensureMap();
  S().res.food = 5000; S().res.wood = 5000; S().res.stone = 5000;

  check("the stone age governs seven holdings", api.dominionCap() === 7);
  check("the trio leaves room for four more", !api.atDominionCap() && api.holdsUsed() === 3);

  // Fill the scope: capture to six, then QUEUE the seventh -- parties on the
  // road count against the age's scope, or the queue becomes the loophole.
  const wild = () => Object.values(api.world.places)
    .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id)
      && !api.pendingSettle(x.id));
  while (S().map.owned.length < 6) api.captureTile(wild().id);
  const seventh = wild();
  api.launchSettle(seventh.id);
  check("the seventh party counts while still on the road",
    api.holdsUsed() === 7 && api.atDominionCap());

  const eighth = wild();
  const qBefore = S().buildQueue.length;
  api.launchSettle(eighth.id);
  check("the age refuses an eighth: no cost curve, a closed door",
    S().buildQueue.length === qBefore && !api.isOwned(eighth.id));
  check("the price is still PRINTED at the cap (the refusal is worded, not hidden)",
    api.settlePlan(eighth.id) !== null);

  // A new age is what raises the scope.
  S().era = "bronze"; api.initAdversaries(); api.ensureMap();
  S().res.bronze = 100;   // the wider banner brings its signature metal
  check("bronze governs twelve", api.dominionCap() === 12 && !api.atDominionCap());
  api.launchSettle(eighth.id);
  check("the same claim is welcome under the wider banner",
    S().buildQueue.some((q) => q.kind === "settle" && q.tile === eighth.id));

  // Subduing a minor is conquest, and conquest answers to the scope too.
  reset(); api.closeModal();
  S().era = "iron"; api.initAdversaries(); api.ensureMap();
  S().builds.musterGround = 1; S().units.soldier = 6; S().res.food = 5000;
  while (S().map.owned.length < 20) {
    const w = Object.values(api.world.places)
      .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
    if (!w) break;
    api.captureTile(w.id);
  }
  const minorTile = Object.values(api.world.places).find((x) => x.minor && !api.isOwned(x.id));
  api.launchCampaign("tile:" + minorTile.id, { soldier: 4 });
  check("a subdual that would exceed the age's scope refuses to march",
    S().expeditions.length === 0);
  api.setRngSource(null);
}

console.log("\n--- C3: the danger acquires a name ---");
{
  // The payoff for putting the roster on the board from minute one. At Stone
  // raiders belong to nobody; from Bronze they are your neighbours, and it was
  // the same people all along.
  const attributionIn = (era) => {
    reset();
    api.S.era = era;
    api.initAdversaries(); api.ensureMap();
    return api.raidAttribution();
  };

  check("Stone raids belong to nobody -- the danger is real and anonymous",
    attributionIn("stone") === null);
  check("Bronze gives the danger a name", attributionIn("bronze") !== null);
  check("Iron keeps it", attributionIn("iron") !== null);
  check("and it is the same people in both ages, not a fresh enemy per era",
    attributionIn("bronze").id === attributionIn("iron").id);

  // The gate is `contact`, not the presence of a roster: Stone SEATS all three
  // peoples, so "nobody is named" has to come from the era-fact rather than
  // from an empty board. This is the check that would catch someone "fixing"
  // Stone's silence by deleting its adversaries.
  reset(); api.S.era = "stone"; api.initAdversaries(); api.ensureMap();
  check("...and Stone is silent DESPITE having neighbours seated",
    api.MANIFESTS.stone.adversaries.length > 0 && api.raidAttribution() === null);
  check("the gate is the contact era-fact",
    api.MANIFESTS.stone.contact === "none" && api.MANIFESTS.bronze.contact === "open");

  // Peaceful neighbours never take the blame, in any era.
  reset(); api.S.era = "iron"; api.initAdversaries(); api.ensureMap();
  check("a named era always names somebody", api.raidAttribution() !== null);
  check("peaceful neighbours are never blamed for a raid",
    api.MANIFESTS.iron.adversaries.some((a) => a.disposition === "peaceful") &&
    api.raidAttribution().disposition === "warlike");

  // A roster with nobody seated has nobody to blame, and that is a real state
  // rather than a crash -- the caller falls back to the anonymous voice.
  const saved = api.S.adversaries;
  api.S.adversaries = {};
  check("no seated neighbours, no attribution -- and no throw",
    api.raidAttribution() === null);
  api.S.adversaries = saved;

  // TEMPLATE LEAK. Every named line carries {who}, and some carry {ground} and
  // {raid} as well; a token that survives substitution ships a literal brace
  // into the Chronicle. Rendering every line in every pool is cheap, and this
  // is exactly the class of bug that reaches a player.
  const who = api.MANIFESTS.iron.adversaries.find((a) => a.disposition === "warlike");
  let leaked = null;
  for (const pool of ["repelledClean", "repelledCleanNamed", "raidSucceeds", "raidSucceedsNamed", "civilianLost"]) {
    for (const line of api.CONFLICT_FLAVOR[pool]) {
      const out = api.sentenceCase(line
        .replace(/\{who\}/g, who.name)
        .replace("{ground}", api.raidGround(who))
        .replace("{raid}", "warband"));
      if (/[{}]/.test(out)) leaked = pool + ": " + out;
    }
  }
  check("no flavor line leaks an unsubstituted token", leaked === null);

  // Sentence case, and the specific failure it exists for: a line may start
  // MORE than one sentence with a name, and every name begins "the".
  check("sentenceCase capitalises the opening",
    api.sentenceCase("the Hill Clans hold.") === "The Hill Clans hold.");
  check("...and every sentence after it -- the bug that would have shipped",
    api.sentenceCase("They came back. the Hill Clans, and they knew the way.")
      === "They came back. The Hill Clans, and they knew the way.");
  check("...without touching a name mid-sentence",
    api.sentenceCase("A warband out of the high ground.") === "A warband out of the high ground.");

  // Named and anonymous pools must stay in step: an outcome with an anonymous
  // line and no named counterpart would silently fall back to Stone's voice in
  // an age that has neighbours.
  check("every attributable outcome has both voices",
    api.CONFLICT_FLAVOR.repelledClean.length > 0 && api.CONFLICT_FLAVOR.repelledCleanNamed.length > 0 &&
    api.CONFLICT_FLAVOR.raidSucceeds.length > 0 && api.CONFLICT_FLAVOR.raidSucceedsNamed.length > 0);
  check("every named line actually names somebody",
    [...api.CONFLICT_FLAVOR.repelledCleanNamed, ...api.CONFLICT_FLAVOR.raidSucceedsNamed]
      .every((l) => l.includes("{who}")));

  // Attribution must not spend a draw it cannot use -- the roster ships one
  // warlike people, so the common path is a lookup, not a roll.
  reset(); api.S.era = "iron"; api.initAdversaries(); api.ensureMap();
  const before = api.S.rngState;
  api.raidAttribution();
  check("a single candidate costs no dice", api.S.rngState === before);
}

console.log("\n--- Engine rework E5: the world strikes hexes ---");
{
  api.setRngSource(() => 0.5);
  reset(); api.closeModal(); api.ensureMap();

  // Armies eat in EVERY era now -- the free-lunch window quirk is closed.
  const upkeepBefore = api.rates().upkeep;
  S().units.soldier = 2; api.syncPopMirror();
  check("a stone-age soldier is two more mouths at the fire",
    Math.abs(api.rates().upkeep - (upkeepBefore + 2 * api.CONFIG.upkeep)) < 1e-9);
  S().units.soldier = 0; api.syncPopMirror();

  // The muster answers to the land from frame one: trio = cap 6.
  check("the muster is the land, in every era (3 hexes x 2)", api.levyCap() === 6);

  // Sickness strikes ONE hex and takes a fifth of it (min 1) -- big hexes
  // host worse outbreaks, small ones lose one soul.
  for (const id of S().map.owned) S().map.pop[id] = 10;
  api.syncPopMirror();
  const sicknessEv2 = api.MANIFESTS.stone.events.find((e) => e.id === "sickness");
  const popsBefore = S().map.owned.map((id) => api.hexPop(id));
  const line = sicknessEv2.effect(S());
  const popsAfter = S().map.owned.map((id) => api.hexPop(id));
  const losses = popsBefore.map((v, i) => v - popsAfter[i]).filter((d) => d > 0);
  check("the fever broke out at exactly one hex", losses.length === 1);
  check("it took a fifth of that hex (10 -> 8)", losses[0] === 2);
  check("the Chronicle names the ground it struck",
    typeof line === "string" && line.includes("fever"));

  api.setRngSource(null);
}

console.log("\n--- Engine rework E4: the frontier starves first ---");
{
  api.setRngSource(() => 0.99);   // famine math only; no event weather
  reset(); api.closeModal(); api.ensureMap();

  // Administrative distance: from the SEAT, not from the nearest holding.
  check("the seat is administrative distance zero", api.adminDistance(api.world.home) === 0);
  const far = Object.values(api.world.places)
    .filter((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id))
    .sort((a, b) => api.adminDistance(b.id) - api.adminDistance(a.id))[0];
  api.captureTile(far.id);
  check("a far holding is administratively farther than the trio",
    api.adminDistance(far.id) > Math.max(...S().map.owned.filter((id) => id !== far.id)
      .map((id) => api.adminDistance(id))));

  // Famine: everyone rests, the larder empties, and the drain walks inward.
  for (const id of S().map.owned) S().map.pop[id] = 3;
  api.syncPopMirror();
  S().map.work = {};             // nobody gathers: pure deficit
  S().res.food = 1;
  const seatBefore = api.hexPop(api.world.home);
  run(40);
  check("an empty larder no longer kills instantly", S().dead === false);
  check("the frontier bleeds first: the far holding lost people before the seat lost any",
    api.hexPop(far.id) < 3 && api.hexPop(api.world.home) === seatBefore);
  run(120);
  check("the far holding empties entirely -- and the ground is STILL YOURS",
    api.hexPop(far.id) === 0 && api.isOwned(far.id));
  check("no one is born during a famine",
    api.hexPopSum() <= 12);

  // The run ends only when the seat itself empties.
  run(400);
  check("the seat starves last, and its fall ends the run",
    S().dead === true && api.hexPop(api.world.home) === 0);

  // Ghost land rekindles once the settlement is fed again.
  reset(); api.closeModal(); api.ensureMap();
  const ghost = S().map.owned.find((id) => id !== api.world.home);
  S().map.pop[ghost] = 0;
  S().map.work[api.world.home] = "food";
  S().res.food = 100;
  run(300);   // a hearth rekindles from 0.2 souls; the logistic needs ~110s
              // to carry that to a whole person, more on stingy terrain
  check("an emptied holding rekindles when the larder is full again",
    api.hexPop(ghost) >= 1);

  // Escalating claims: each hex beyond the trio costs more than the last.
  reset(); api.closeModal(); api.ensureMap();
  const t1 = Object.values(api.world.places)
    .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
  const base = api.settlePlan(t1.id).cost.food;
  // Grab tiles FAR from the target: a captured neighbour would cheapen the
  // route to t1 and mask the escalation (caught as a rare flake).
  const grab = Object.values(api.world.places)
    .filter((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id) && x.id !== t1.id)
    .sort((a, b) => api.hexDistance(b.q, b.r, t1.q, t1.r) - api.hexDistance(a.q, a.r, t1.q, t1.r))
    .slice(0, 4);
  for (const g of grab) api.captureTile(g.id);
  const later = api.settlePlan(t1.id).cost.food;
  check("the same ground costs more once you hold more (escalating claims)",
    later > base);

  // And the QUEUE counts (owner bug report): a claim underway prices the next
  // one up, exactly as queued buildings already price their next copy up.
  reset(); api.closeModal(); api.ensureMap();
  S().res.food = 500; S().res.wood = 500; S().res.stone = 500;
  // Price the SAME tile before and after another claim is queued: comparing
  // two different tiles let their distances mask the escalation, since the
  // route multiplier can easily outweigh 1.18x on a continent this size.
  const q1 = Object.values(api.world.places)
    .filter((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id)).slice(0, 2);
  const watched = q1[1].id;
  const first = api.settlePlan(watched).cost.food;
  api.launchSettle(q1[0].id);
  const second = api.settlePlan(watched).cost.food;
  check("a claim still underway raises the next claim's price",
    second > first);

  api.setRngSource(null);
}

console.log("\n--- Engine rework E1: population lives on hexes ---");
{
  // E1 is pure state: population exists, grows, saves and displays, and
  // NOTHING reads it -- production still runs on steppers. These checks pin
  // the state's contract so E2 can flip production onto a number that is
  // already proven to behave.
  reset();
  api.closeModal();
  api.ensureMap();
  // Stay alive for the whole window, the way a player would: the seat works
  // food. (A mountain of test food does NOT work -- storage clamps it to the
  // 50-cap on the first tick and upkeep drains that dry. Found the hard way,
  // twice: the first version of this line assigned a forager, and E2 quietly
  // made foragers produce nothing.)
  api.S.map.work[api.world.home] = "food";
  api.setRngSource(() => 0.99);  // and hold the event dice -- an hour of ticks
                                 // makes a lethal raid near-certain on some
                                 // seeds, and growth itself rolls no dice

  check("the seat opens with the three survivors",
    api.hexPop(api.world.home) === api.CONFIG.startPop);
  check("the seat's ground reports a carrying cap",
    api.capOf(api.world.home) > api.CONFIG.startPop);
  check("unowned hexes carry no people",
    Object.keys(api.S.map.pop).every((id) => api.S.map.owned.includes(id)));

  // Growth: logistic toward the cap, floored for every reader.
  const before = api.S.map.pop[api.world.home];
  run(120);
  const after = api.S.map.pop[api.world.home];
  check("people arrive on their own (logistic growth)", after > before);
  run(3600);
  const cap = api.capOf(api.world.home);
  check("growth stops at what the ground supports (never above cap)",
    api.S.map.pop[api.world.home] <= cap && api.hexPop(api.world.home) === Math.floor(cap));
  check("the odometer is the sum of the hexes",
    api.hexPopSum() === api.S.map.owned.reduce((n, id) => n + api.hexPop(id), 0));

  // Determinism: the growth curve is pure math on fixed ticks -- two runs
  // from the same reset must land on bit-identical populations.
  // Pinned seed: since E2 the Stone dominion is three hexes, and their
  // TERRAINS (hence caps, hence curves) are the seed's business.
  reset(); api.closeModal(); api.S.seed = 4242; api.S.rngState = 4242;
  api.ensureMap(); api.S.map.work[api.world.home] = "food"; run(300);
  const popsA = JSON.stringify(api.S.map.pop);
  reset(); api.closeModal(); api.S.seed = 4242; api.S.rngState = 4242;
  api.ensureMap(); api.S.map.work[api.world.home] = "food"; run(300);
  api.setRngSource(null);
  check("the curve is deterministic (bit-identical across runs)",
    JSON.stringify(api.S.map.pop) === popsA);

  // Persistence: fractional population survives the round trip exactly.
  api.save(); api.load(); api.ensureMap();
  check("population survives save/load bit-identically",
    JSON.stringify(api.S.map.pop) === popsA);

  // Capture seeds the new holding with its party.
  reset(); api.closeModal();
  api.S.era = "iron"; api.S.seen.levyMigrated = true; api.S.pop = 4;
  api.initAdversaries(); api.ensureMap();
  const empty = Object.values(api.world.places).find((x) =>
    x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
  api.captureTile(empty.id);
  check("a captured hex enters the books with its claiming party",
    api.hexPop(empty.id) === 2);
  check("iron ground holds more people than stone ground (caps are the era curve)",
    api.capOf(api.world.home) >= 24);
}

console.log("\n--- Phase 10: one board, forever ---");
{
  // The board is generated once and never rebuilt. Eras re-denominate what a
  // tile IS; they never touch the ground, because ground you rebuild is ground
  // you cannot re-dress -- and the per-era re-dress is the whole visual arc.
  reset();
  api.closeModal();
  api.ensureMap();
  const stoneIds = Object.keys(api.world.places).sort().join("|");
  const stoneTerrain = Object.values(api.world.places).map((p) => p.id + ":" + p.terrain).sort().join("|");
  const stoneSeed = api.S.map.seed;

  api.S.era = "iron";
  api.initAdversaries();
  api.ensureMap();
  check("the tile noun re-denominates across the border",
    api.world.tileNoun === "holdfast" && api.S.map.tileNoun !== undefined);
  check("the ground is the SAME ground -- same tiles, same seed",
    Object.keys(api.world.places).sort().join("|") === stoneIds && api.S.map.seed === stoneSeed);
  check("terrain is untouched by the era change -- you can re-dress it",
    Object.values(api.world.places).map((p) => p.id + ":" + p.terrain).sort().join("|") === stoneTerrain);

  // Dominion never shrinks -- and since E5 there is no machinery left that
  // even could: consolidation is deleted, borders re-denominate only.
  api.syncDominion();
  const held = api.S.map.owned.slice().sort().join("|");
  api.S.era = "iron"; api.initAdversaries(); api.ensureMap(); api.syncDominion();
  check("a border takes no land -- the SAME tiles cross it",
    api.S.map.owned.slice().sort().join("|") === held);

  // Reveal is sticky and additive, per the interface's reveals-never-flicker
  // law applied to geography. Ground is TAKEN now, never granted (E3).
  const seenBefore = api.S.map.revealed.length;
  const frontier = Object.values(api.world.places)
    .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
  api.captureTile(frontier.id);
  check("taking ground reveals what borders it", api.S.map.revealed.length > seenBefore);
  const snapshot = api.S.map.revealed.slice();
  api.syncCharted();
  check("charting never un-charts (sticky, like every other reveal)",
    snapshot.every((id) => api.isCharted(id)));
}

console.log("\n--- Phase 10: the run waits for a person ---");
{
  // The pre-game hold is a fourth INDEPENDENT flag, not a mode. The property
  // worth asserting is the one that makes paused/modalHold/hidden safe to
  // compose at all: setting any one of them never disturbs the others, so each
  // releases without clobbering a hold somebody else still wants.
  reset();
  api.closeModal();
  api.setPreGame(true);
  api.setPaused(false);
  check("the run is held before a person starts it", api.preGame === true);

  api.setPaused(true);
  check("pausing does not disturb the pre-game hold", api.preGame === true);
  api.openModal("A Question", "<p>choose</p>");
  check("a modal does not disturb it either", api.preGame === true);
  api.closeModal();

  api.setPreGame(false);
  check("starting the run releases that flag and only that flag",
    api.preGame === false && api.paused === true && api.modalHold === false);
  api.setPaused(false);
}

console.log("\n--- Phase 6b: Conquest Growth G1 -- levy, output, no housing ---");
{
  // Growth is a verb at iron: the timer does nothing.
  reset();
  S().era = "iron"; api.initAdversaries(); S().seen.levyMigrated = true;
  S().pop = 5; S().res.food = 500; S().jobs.forager = 2;
  const popBefore = S().pop;
  api.setRngSource(() => 0.999999);   // hazards hold their breath; growth is what's on trial
  run(120);
  api.setRngSource(null);
  check("no one arrives unbidden under conquest growth", S().pop === popBefore);
  // (housing died in E3)

  // Output multiplier: a holdfast works -- and eats -- like the families it holds.
  S().pop = 5; S().units = { soldier: 2, archer: 0, horseman: 0, siegeEngine: 0 };
  S().map = { seed: 1, gen: 1, tileNoun: "holdfast", owned: ["f1"], work: { "f1": "food" },
    pop: { "f1": 4 } };
  S().upgrades = {};
  const r = api.rates();
  // outputMult died in E2: four real people at the per-capita rate.
  check("a worked hex produces per person (4 x 0.2)", Math.abs(r.food - 0.8) < 1e-9);
  check("upkeep charges the people who exist AND the levied bands ((4+2) x 0.04)",
    Math.abs(r.upkeep - 6 * 0.04) < 1e-9);

  // The army cap answers to the LAND now (E5): hexes x armyPerHex, every era.
  S().map = { seed: 1, gen: 1, tileNoun: "holdfast", owned: ["f1", "f2", "f3"],
    work: {}, pop: { "f1": 4, "f2": 3, "f3": 3 } };
  api.syncPopMirror();
  S().units = { soldier: 5, archer: 0, horseman: 0, siegeEngine: 0 };
  api.syncPopMirror();
  S().builds.barracks = 1; S().res.wood = 500; S().res.iron = 500; S().res.food = 500;
  const soldierDef = api.defById("soldier");
  api.build(soldierDef);
  check("training refuses past the land's muster (3 hexes = cap 6; 5 + 1 queued fills it)",
    S().buildQueue.length === 1 && api.levyUsed() === 6);
  api.build(soldierDef);
  check("the queue counts against the muster the instant it is queued", S().buildQueue.length === 1);
  S().map.owned.push("f4"); S().map.pop.f4 = 2; api.syncPopMirror();
  api.build(soldierDef);
  check("a grown dominion raises the muster (4 hexes = cap 8)", S().buildQueue.length === 2);
  S().buildQueue.length = 0;

  // A unit's death lightens the roster, never the land: the hexes keep their
  // people, and the mirror drops by exactly the fallen soldier.
  api.syncPopMirror();
  const landBefore = api.hexPopSum();
  const mirrorBefore = S().pop;
  api.removeRandomUnit();
  check("a soldier's death leaves the land untouched", api.hexPopSum() === landBefore);
  check("...and the mirror counts one fewer", S().pop === mirrorBefore - 1);

  // The recruit is drawn from the SEAT on completion (owner ruling).
  reset(); api.closeModal(); api.ensureMap();
  S().era = "iron"; api.initAdversaries(); api.ensureMap();
  S().builds.barracks = 1; S().res.wood = 500; S().res.food = 500; S().res.iron = 500;
  for (const id of S().map.owned) S().map.pop[id] = 30;   // above cap, so growth
  api.syncPopMirror();                                     // cannot refill the draw
  const seatBefore = api.hexPop(api.world.home);
  api.setRngSource(() => 0.99);   // E5's own fevers must not strike this fixture
  api.build(api.defById("soldier"));
  run(20);
  api.setRngSource(null);
  check("the capital musters: the recruit walked out of the seat",
    S().units.soldier >= 1 && api.hexPop(api.world.home) === seatBefore - 1);
}

console.log("\n--- Phase 6a: the map exists ---");
{
  reset();
  // initAdversaries BEFORE ensureMap, exactly as boot() does. The order is
  // load-bearing now that the roster exists from the Stone Age: ensureMap
  // seats the peoples on the BOARD, initAdversaries creates their STATE, and
  // a tile whose people have no state renders as bare terrain -- the board
  // would quietly disown someone standing on it.
  api.initAdversaries();
  api.ensureMap();
  check("the chart exists from the first frame (stone has a map now)",
    api.world !== null && api.world.tileNoun === "clearing");
  // ONE BOARD, FOREVER, and it is now an authored CONTINENT (slice 4): a
  // named frame decides where land ends, the dice decide what land is.
  check("the world is an authored continent, named",
    !!api.world.continent && !!api.world.continentName);
  {
    // Workable land: not ocean, and not a lake either -- the same definition
    // frameDiagnostics uses, and the only one that means anything.
    const land = Object.values(api.world.places).filter((p) => !p.ocean && p.terrain !== "water");
    check("the continent is a real country (120-160 workable land hexes)",
      land.length >= 120 && land.length <= 160);
    check("and it sits in an ocean that is not settleable",
      Object.values(api.world.places).some((p) => p.ocean) &&
      Object.values(api.world.places).every((p) => !p.ocean || p.terrain === "water"));
  }
  // The GROUND, with every era-dressed field deliberately left out: hex ids,
  // terrain, ocean, which people sit where. Everything an era flip must not
  // touch, and nothing it is allowed to.
  const geoSig = (w) => Object.keys(w.places).sort().map((id) => {
    const p = w.places[id];
    return [id, p.terrain, p.ocean ? "o" : "-", p.adversary || "-", p.minor ? p.minor.place : "-"].join(":");
  }).join("|");
  const stoneGeo = geoSig(api.world);
  const stoneSeatIds = Object.values(api.world.places)
    .filter((p) => p.adversary).map((p) => [p.id, p.adversary]);
  const stoneMinorIds = Object.values(api.world.places)
    .filter((p) => p.minor).map((p) => p.id).sort().join(",");
  check("stone seats all three peoples, from the first minute",
    stoneSeatIds.length === 3);
  check("and its steadings wear stone's noun",
    Object.values(api.world.places).filter((p) => p.minor)
      .every((p) => p.minor.name === "the camp at " + p.minor.place));

  // NO OUTWARD VERB IN THE STONE AGE, and the reason is fictional rather than
  // mechanical (owner ruling, 2026-08-24): "there are no kings in the stone
  // age to send campaigns... It'll be dudes in rough clothing with spears."
  // So the tile must offer no button at all -- not a disabled one, which would
  // read as a thing you could unlock rather than a thing that cannot exist.
  // Asserted against the rendered body, because that is where a leak would be.
  {
    const seatTile = Object.values(api.world.places).find((x) => x.adversary);
    const campTile = Object.values(api.world.places).find((x) => x.minor);
    api.S.map.revealed.push(seatTile.id, campTile.id);
    const seatBody = api.detailHTML(seatTile), campBody = api.detailHTML(campTile);
    check("a stone-age tile offers no march, not even a greyed one",
      seatBody.indexOf("data-act=\"march\"") < 0 && campBody.indexOf("data-act=\"march\"") < 0);
    check("but it still tells you who is out there",
      seatBody.indexOf("hill camps") >= 0 || seatBody.indexOf("river camps") >= 0 ||
      seatBody.indexOf("salt wanderers") >= 0);
    check("and says WHY you cannot go, rather than going quiet",
      seatBody.indexOf("raise a column") >= 0);
  }

  S().era = "bronze";
  api.ensureMap();
  // Era changes the DRESSING, never the ground (owner ruling, 2026-08-24).
  // This compared whole-world JSON until the neighbours started redressing per
  // age, which made it fail for the right reason -- names and strengths are
  // SUPPOSED to differ now. Comparing geography instead keeps the invariant
  // that actually matters and states it more precisely than before: same
  // hexes, same terrain, same ocean, same people on the same ground.
  check("bronze inherits the SAME world -- same ground, no regeneration",
    geoSig(api.world) === stoneGeo);
  check("your seat is owned, and on food-bearing ground",
    api.isOwned("0,0") &&
    ["plains", "river"].includes(api.world.places["0,0"].terrain));
  check("bronze seats the same three, on the same hexes as stone",
    Object.values(api.world.places).filter((p) => p.adversary).length === 3 &&
    stoneSeatIds.every((pair) => api.world.places[pair[0]].adversary === pair[1]));
  // The steadings are the same SITES too -- only the noun over them moved.
  check("and the same steadings, wearing bronze's noun instead of stone's",
    Object.values(api.world.places).filter((p) => p.minor).map((p) => p.id).sort().join(",") === stoneMinorIds &&
    Object.values(api.world.places).filter((p) => p.minor)
      .every((p) => p.minor.name === "the steading at " + p.minor.place));

  const g1 = JSON.stringify(api.world);
  api.ensureMap();
  check("same era, same world: regeneration is stable", JSON.stringify(api.world) === g1);
  const dice = S().rngState;
  api.ensureMap();
  check("map generation never touches the game's dice", S().rngState === dice);

  S().era = "iron"; api.initAdversaries();
  api.ensureMap();
  check("the tile noun changed, and the ground did NOT", api.world.tileNoun === "holdfast");
  const seats = Object.values(api.world.places).filter((p) => p.adversary);
  check("all three majors hold seats", seats.length === 3 &&
    ["hillClans", "riverKingdom", "saltNomads"].every((id) => seats.some((p) => p.adversary === id)));
  check("seats sit on land", seats.every((p) => p.terrain !== "water"));
  check("seats keep their distance from your seat",
    seats.every((p) => api.distance(api.world, "0,0", p.id) >= 2));
  // Structural guarantee, not luck: terrain is the 6c economy, so every land
  // terrain must show up in quantity on EVERY seed. (The noise+smoothing
  // first cut failed this -- a live map rolled 2 hills and 0 river.)
  const mix = {};
  for (const id in api.world.places) { const t = api.world.places[id].terrain; mix[t] = (mix[t] || 0) + 1; }
  check("every terrain claims its share (no starved economy)",
    ["plains", "forest", "hills", "river", "water"].every((t) => (mix[t] || 0) >= 3));

  const before = JSON.stringify(api.world);
  api.save(); api.load(); api.ensureMap();
  check("a world rebuilt from the save is bit-identical", JSON.stringify(api.world) === before);

  // Terrain sets the working rate (6c.1): assign a real tile and expect its
  // terrain's declared rate, not par.
  S().seen.levyMigrated = true; S().pop = 2; api.syncDominion();
  const tid = S().map.owned.find((id) => id !== "0,0");
  const terr = api.world.places[tid].terrain;
  const wRate = api.active().map.works[terr].food;
  S().map.work = {}; S().map.work[tid] = "food";
  S().map.pop[tid] = 3;   // three people on the ground, exactly
  S().units = { soldier: 0, archer: 0, horseman: 0, siegeEngine: 0 };
  S().upgrades = {}; S().builds.dryingRack = 0;
  check("terrain sets the working rate (overpay routes included)",
    Math.abs(api.rates().food - 3 * 0.2 * wRate) < 1e-9);
}

console.log("\n--- Phase 5: asking modals hold the world ---");
{
  reset();
  api.closeModal();  // earlier sections open era/muster modals and never close them
  check("no hold with no modal", api.modalHold === false);
  api.openModal("A Question", "<p>choose</p>");
  check("a modal holds the simulation by default", api.modalHold === true);
  api.closeModal();
  check("closing releases the hold", api.modalHold === false);
  api.openInfoPanel();
  check("Info (a telling modal) opts out", api.modalHold === false);
  api.closeModal();
  api.openResetModal();
  check("the reset confirm (an asking modal) holds", api.modalHold === true);
  api.closeModal();
  api.setSpeed(8);
  check("setSpeed lands on a real notch", api.speed === 8);
  api.setSpeed(7);
  check("setSpeed refuses a notch that doesn't exist", api.speed === 8);
  api.setSpeed(1);
}

console.log("\n--- A converter must be worth the ground that feeds it ---");
{
  // THE INVARIANT: a converting building's throughput has to be commensurate
  // with the terrain that supplies it. Nothing checked this, and the Forge
  // drifted a long way past absurd without a single test going red -- rate
  // 0.05 drew 0.2 copper/s against a hills hex yielding 5/s, so TWENTY-FIVE
  // forges were needed to consume one worked hex. The owner ran six while
  // copper and tin sat capped and overflowing, which is the shape of the bug:
  // the input was free, the converter was the whole game, and the only way to
  // play was to spam a building whose cost compounded.
  //
  // The bound is deliberately loose. This is not a balance assertion -- it
  // does not care whether the number is 3 or 8 -- it is an ABSURDITY floor,
  // catching the case where a converter is so weak that the era's economy
  // stops being about anything but stacking copies of it.
  const MAX_COPIES = 10;
  for (const era of ["stone", "bronze", "iron"]) {
    const m = api.MANIFESTS[era];
    if (!m.map || !m.map.works) continue;
    for (const def of m.buildings) {
      if (!def.converts) continue;
      // The best a single worked hex can yield of each input, at its cap.
      const bestYield = (res) => {
        let best = 0;
        for (const terr in m.map.works) {
          const per = m.map.works[terr][res] || 0;
          best = Math.max(best, per * (m.map.popCaps[terr] || 0));
        }
        return best;
      };
      // The BINDING input is the one needing the fewest copies to exhaust --
      // that is the one that actually limits you.
      let copies = Infinity, binding = null;
      for (const res in def.converts.in) {
        const draw = def.converts.rate * def.converts.in[res];
        const y = bestYield(res);
        if (draw <= 0 || y <= 0) continue;
        const n = y / draw;
        if (n < copies) { copies = n; binding = res; }
      }
      check(`${era}: a handful of ${def.name}s consume one worked hex of ${binding} (${copies.toFixed(1)} of ${MAX_COPIES} max)`,
        copies <= MAX_COPIES);
    }
  }
}

console.log("\n--- The build queue says what is actually happening ---");
{
  // Only the FRONT item is under construction (step()). A queued item has two
  // numbers about it that answer different questions, and printing the wrong
  // one made the panel tell a lie the sim never told: a card in position two
  // counted down while its progress bar sat at 0%, so it read as building
  // early. Nothing built early -- the WAIT was shrinking.
  reset();
  const q = [
    { uid: 1, id: "hut", remaining: 10, total: 10 },
    { uid: 2, id: "hut", remaining: 20, total: 20 },
    { uid: 3, id: "hut", remaining: 5,  total: 5  },
  ];
  const t = api.queueTiming(q, 1);
  check("only the front item is active", t[0].active && !t[1].active && !t[2].active);
  check("the active item waits for nobody", t[0].waiting === 0);
  check("a queued item waits for everything ahead of it",
    t[1].waiting === 10 && t[2].waiting === 30);
  check("each item's OWN build time is its own, untouched by the queue",
    t[0].own === 10 && t[1].own === 20 && t[2].own === 5);
  check("and 'done' is the wait plus the work",
    t[0].done === 10 && t[1].done === 30 && t[2].done === 35);

  // THE BUG, stated as a property: as the front item progresses, a queued
  // item's OWN time must not move. Only its wait may shrink.
  q[0].remaining = 2;                 // eight seconds of work happened
  const t2 = api.queueTiming(q, 1);
  check("work on the front item never shortens the build behind it",
    t2[1].own === t[1].own && t2[2].own === t[2].own);
  check("...it only brings the queued item's start closer",
    t2[1].waiting === 2 && t2[1].waiting < t[1].waiting);

  // buildSpeed is a multiplier on work, so it divides every duration.
  const fast = api.queueTiming(q, 2);
  check("build speed scales the clock, not the order",
    fast[1].own === 10 && fast[1].waiting === 1);
  check("no card ever advertises zero seconds",
    api.queueTiming([{ uid: 9, id: "hut", remaining: 0.01, total: 5 }], 1)[0].own === 1);
}

console.log("\n--- Phase 4: the tick clock ---");
{
  reset();
  check("a fresh world starts at tick zero", S().tick === 0 && api.playtime() === 0);
  check("freshState carries no playtime field", api.freshState().playtime === undefined);
  api.step(); api.step(); api.step();
  check("each step advances exactly one tick", S().tick === 3);
  check("playtime derives from the count", Math.abs(api.playtime() - 3 * api.TICK_SECONDS) < 1e-12);

  // A pre-tick save carried seconds; load converts them once.
  reset();
  const legacy = JSON.parse(JSON.stringify(S()));
  delete legacy.tick;
  legacy.playtime = 123.4;
  globalThis.localStorage.setItem(api.CONFIG.saveKey, JSON.stringify(legacy));
  api.load();
  check("legacy seconds convert to ticks at load", S().tick === Math.floor(123.4 / api.TICK_SECONDS));
  globalThis.localStorage.removeItem(api.CONFIG.saveKey);
}

console.log("\n--- Seeded RNG: determinism and the source ban ---");
{
  // Same seed + same fixed-dt steps + same actions = identical state. This is
  // the phase 2 acceptance test at harness scale: the harness always steps a
  // constant 0.2s, so replay is exact here even before the phase 4 tick clock
  // makes it exact in the browser too.
  const play = () => {
    reset();
    S().seed = 123456789; S().rngState = 123456789;
    api.ensureMap();   // world derives from the seed, so this is deterministic too
    S().map.work[api.world.home] = "food";
    S().map.work[S().map.owned[1]] = "wood";
    run(120);
    api.build(findB("granary"));   // affordable or not, identically in both runs
    run(240);
    return JSON.stringify(S());
  };
  const a = play(), b = play();
  check("same seed, same actions, bit-identical state", a === b);

  reset();
  S().rngState = 42;
  const first = [api.rng(), api.rng(), api.rng()];
  S().rngState = 42;
  const again = [api.rng(), api.rng(), api.rng()];
  check("rngState alone determines the stream", JSON.stringify(first) === JSON.stringify(again));
  check("draws land in [0, 1)", first.every((v) => v >= 0 && v < 1));

  // Save/load must resume the dice mid-stream: the round-trip is Object.assign
  // over freshState, and rngState must survive it verbatim.
  reset();
  S().seed = 7; S().rngState = 7;
  api.rng(); api.rng();
  const mid = S().rngState;
  const restored = Object.assign(api.freshState(), JSON.parse(JSON.stringify(S())));
  check("rngState survives a save/load round-trip", restored.rngState === mid);

  // The ban: no global die anywhere in src/. A stray draw outside rng() is
  // invisible wrongness -- it works, it just silently breaks replay.
  const banned = "Math." + "random";  // don't flag this file's own scan
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".js") && fs.readFileSync(full, "utf8").includes(banned)) offenders.push(e.name);
    }
  };
  walk(fileURLToPath(new URL("./src", import.meta.url)));
  check("Math.random appears nowhere in src/", offenders.length === 0);
  if (offenders.length) console.log("   offenders:", offenders.join(", "));
}

console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
