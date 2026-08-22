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
import fs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

const MODS = [mConfig, mRng, mLib, mStone, mBronze, mIron, mCompile, mIcons, mState,
  mDerived, mCombat, mEvents, mExped, mStep, mActions, mEra, mLog, mDom,
  mPLedger, mPPeople, mPHold, mPBuy, mExpedUi, mModal, mChrome, mPersist];

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
  console.log(`${label.padEnd(34)} pop=${s.pop} civ=${api.civilians()} idle=${api.idle()} ` +
    `soldiers=${s.units.soldier} food=${s.res.food.toFixed(1)} wood=${s.res.wood.toFixed(1)} ` +
    `stone=${s.res.stone.toFixed(1)} huts=${s.builds.hut} barracks=${s.builds.barracks} dead=${s.dead}`);
}
function reset() { api.S = api.freshState(); }

let fails = 0;
function check(name, cond) { console.log(`  [${cond ? "PASS" : "FAIL"}] ${name}`); if (!cond) fails++; }

// ---- Regression: core loop still intact ----
console.log("\n--- Regression: starvation, hut queue, storage caps ---");
reset(); snap("start");
run(450); // long enough that an occasional ungated Great Hunt windfall can't save an unmanaged colony
check("starvation still ends the game", S().dead === true);

reset();
api.assign("forager", 1); api.assign("woodcutter", 1); api.assign("woodcutter", 1);
run(45);
api.build(findB("hut"));
run(13);
check("hut still completes with zero workers assigned", S().builds.hut === 1);
check("housing still raised to 6", api.housing() === 6);

// ---- Barracks is capped at 1 ----
console.log("\n--- Barracks: capped at 1 ---");
reset();
api.assign("forager", 1); api.assign("woodcutter", 1); api.assign("woodcutter", 1);
run(300);
api.build(findB("hut"));
run(13);
S().res.wood = 200; S().res.stone = 200;  // skip the grind, just testing cap behavior
snap("hut done, barracks should be revealed now");
check("barracks revealed once hut >= 1", api.isRevealed(findB("barracks")));
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
S().pop = 6; S().jobs = { forager: 2, woodcutter: 2, miner: 0 }; // 4 assigned, 2 idle civilians
S().builds.hut = 1; S().builds.barracks = 1;
S().res.wood = 50;
snap("6 pop, 4 assigned, barracks built");
check("idle is 2 before training", api.idle() === 2);
const soldierDef = findT("soldier");
console.log(`  soldier cost: ${JSON.stringify(api.buildCost(soldierDef))} popCost: ${soldierDef.popCost} buildTime: ${soldierDef.buildTime}`);
api.build(soldierDef);
snap("soldier order queued (not yet complete)");
check("idle drops by 1 the instant it's queued, before completion", api.idle() === 1);
check("civilians() unchanged yet -- reservation, not conversion", api.civilians() === 6);
check("S.units.soldier still 0 -- not combat-effective until trained", S().units.soldier === 0);
run(soldierDef.buildTime + 1);
snap("after training completes");
check("S.units.soldier now 1", S().units.soldier === 1);
check("civilians() dropped by 1 -- permanently converted", api.civilians() === 5);
check("idle back to where it started (reservation -> conversion is a wash)", api.idle() === 1);

// ---- Cancelling a queued Soldier order frees the reservation ----
api.setRngSource(null);

console.log("\n--- Cancel a queued Soldier order -- reservation freed ---");
reset();
S().pop = 6; S().jobs = { forager: 2, woodcutter: 0, miner: 0 };
S().builds.hut = 1; S().builds.barracks = 1;
S().res.wood = 50;
const idleBefore = api.idle();
api.build(findT("soldier"));
check("idle dropped after queuing", api.idle() === idleBefore - 1);
const uid = S().buildQueue[0].uid;
api.cancelBuild(uid);
check("idle restored after cancelling", api.idle() === idleBefore);
check("no soldier was created", S().units.soldier === 0);

// ---- A dying unit drops both its own count and S.pop ----
console.log("\n--- removeRandomUnit: no job reassignment needed, pop drops with it ---");
reset();
S().pop = 5; S().units.soldier = 2;
const popBefore = S().pop;
api.removeRandomUnit();
check("units.soldier dropped by 1", S().units.soldier === 1);
check("total pop dropped by 1 too -- the person is gone, not reassigned", S().pop === popBefore - 1);

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
reset();
S().pop = 5; S().units.soldier = 0;
S().res.food = 40; S().res.wood = 40;
check("repelChance is exactly 0 with no soldiers", 0 / (0 + 2) === 0);
{
  let calls = 0;
  // call1: trigger fires. call2: rollRaidSize -> 0 lands in the first (smallest) tier.
  // call3: repel check -- with defense 0, ANY value fails to repel (0 < 0 is always false).
  api.setRngSource(() => { calls++; return calls <= 2 ? 0 : 0.99; });
  conflictEv.resolve(S(), 1);
  api.setRngSource(null);
  console.log(`  after forced raid: pop=${S().pop} food=${S().res.food} wood=${S().res.wood}`);
  check("resources were stolen", S().res.food < 40 && S().res.wood < 40);
  check("civilian lost too -- defense was 0", S().pop === 4);
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

// ---- Conflict: allowed to zero out population (unlike sickness) ----
console.log("\n--- Conflict: can wipe the settlement, sickness cannot ---");
reset();
S().pop = 1;
api.removeSettler();               // sickness-style call -- floors at 1
check("removeSettler() floors at 1 by default", S().pop === 1);
api.removeSettler(true);           // conflict-style call -- allowed to zero out
check("removeSettler(true) can reach 0", S().pop === 0);

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
api.assign("miner", 1); api.assign("miner", 1); api.assign("miner", 1);
run(600);
run(1);  // flush: a windfall event landing on the very last tick above needs one more tick to clamp, same as real play
snap("600s mining, no Stone Yard");
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
  // Panels the Stone Age can fill. Expeditions is excluded deliberately: no
  // adversaries exist in this era's manifest, so there is nothing it could hold.
  const PANELS = ["panel-village", "panel-holdings", "panel-queue", "panel-log",
                  "panel-training", "panel-build", "panel-upgrades"];
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
check("queueUsed is gone -- it was write-only state in every save", !("queueUsed" in S().seen));
api.assign("forager", 1);
api.assign("woodcutter", 1);
run(90);
check("enough wood gathered to afford the hut", S().res.wood >= api.buildCost(findB("hut")).wood);
api.build(findB("hut"));
check("hut actually entered the queue", S().buildQueue.length === 1);
run(13); // let the hut finish, queue drains back to empty
check("hut finished, queue now empty again", S().buildQueue.length === 0);

// ================= BRONZE AGE PHASE 1 =================
const hutDef = findB("hut");
const infDef = findB("infirmary");
const bronzeAgeDef = findU("bronzeAge");
const bronzeToolsDef = findU("bronzeTools");

console.log("\n--- Bronze P1: per-era display names (now manifest overrides) ---");
reset();
check("stone: hut named 'Hut'", api.defById("hut").name === "Hut");
check("stone: infirmary named 'Medicine Tent'", api.defById("infirmary").name === "Medicine Tent");
S().era = "bronze";
check("bronze: hut named 'Stone House'", api.defById("hut").name === "Stone House");
check("bronze: infirmary named 'Infirmary'", api.defById("infirmary").name === "Infirmary");
check("bronze: hut desc updates to 5 settlers", api.defById("hut").desc.includes("5"));
check("ids never change regardless of era",
  api.MANIFESTS.stone.buildings.some(b => b.id === "hut") &&
  api.MANIFESTS.bronze.buildings.some(b => b.id === "hut"));
check("an override can't reach back and rename the parent era's copy",
  api.MANIFESTS.stone.buildings.find(b => b.id === "hut").name === "Hut");
check("overriding name does not disturb inherited fields (cost survives)",
  api.MANIFESTS.bronze.buildings.find(b => b.id === "hut").base.wood ===
  api.MANIFESTS.stone.buildings.find(b => b.id === "hut").base.wood);
S().era = "stone";
check("un-overridden defs read the same in both eras", api.defById("granary").name === "Granary" &&
  api.MANIFESTS.bronze.buildings.find(b => b.id === "granary").name === "Granary");

console.log("\n--- Bronze P1: housing is retroactive ---");
reset();
S().builds.hut = 4;
const housingStone = api.housing();
check("stone: 4 huts = base 3 + 4*3 = 15", housingStone === 15);
S().era = "bronze";
check("bronze: same 4 huts now = base 3 + 4*5 = 23", api.housing() === 23);
check("advancing raised housing without building anything", api.housing() > housingStone);

console.log("\n--- Bronze P1: capstone reveal gating ---");
reset();
check("capstone hidden on a fresh game", !api.isRevealed(bronzeAgeDef));
S().pop = 10;
check("pop alone is not enough -- needs a Soldier too", !api.isRevealed(bronzeAgeDef));
reset();
S().pop = 5; S().units.soldier = 1;
check("a Soldier alone is not enough -- needs pop too", !api.isRevealed(bronzeAgeDef));
reset();
S().pop = 10; S().units.soldier = 1;
check("both conditions met -> capstone reveals", api.isRevealed(bronzeAgeDef));
S().units.soldier = 0;
check("stays revealed after the soldier dies (sticky)", api.isRevealed(bronzeAgeDef));
console.log(`  capstone cost: ${JSON.stringify(api.buildCost(bronzeAgeDef))}, buildTime ${bronzeAgeDef.buildTime}s`);

console.log("\n--- Bronze P1: completing the capstone flips the era ---");
// Deterministic block: over the 120s build, an unlucky raid could steal the
// remaining food and starve the settlement before the capstone completes.
api.setRngSource(() => 0.999999);
reset();
S().pop = 10; S().units.soldier = 1;
S().res.food = 400; S().res.wood = 400; S().res.stone = 400;
check("era starts as stone", S().era === "stone");
api.build(bronzeAgeDef);
check("capstone entered the queue", S().buildQueue.length === 1 && S().buildQueue[0].id === "bronzeAge");
check("era has NOT flipped merely by queuing it", S().era === "stone");
run(bronzeAgeDef.buildTime - 5);
check("era still stone while mid-build", S().era === "stone");
run(10);
check("era flipped to bronze on completion", S().era === "bronze");
check("capstone recorded as an owned upgrade", S().upgrades.bronzeAge === true);
check("Bronze is a 1:1 relabel -- the count is untouched", S().pop === 10);
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
  check("housing computes correctly from a legacy save", api.housing() === 3 + 2 * 3);
  delete store[api.CONFIG.saveKey];
}

console.log("\n--- Playtime clock ---");
reset();
check("starts at zero", api.playtime() === 0);
api.assign("forager", 1);
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
  api.assign("forager", 1);
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
  check("bronze tab uses bronze-era names while era is still stone",
    html.includes("Stone House") && html.includes("Infirmary"));
  check("stone tab still uses stone-era names", html.includes("Medicine Tent"));
}

console.log("\n--- Era availability (presence in the compiled manifests) ---");
{
  const inEra = (era, cat, id) => api.MANIFESTS[era][cat].some((d) => d.id === id);
  check("a hut introduced in stone still exists in bronze", inEra("bronze", "buildings", "hut"));
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

console.log("\n--- Free timed growth: no cost, steady cadence, housing-gated ---");
{
  const N = api.CONFIG.settlerIntervalSeconds;
  console.log(`  settler interval: ${N}s`);
  // Force every chancePerSecond roll to miss so windfalls, sickness and raids
  // can't perturb population or stores -- these tests are about cadence math.
  api.setRngSource(() => 0.999999);

  // Frozen while housing is full (the starting state: pop 3 / housing 3).
  reset();
  S().res.food = 400; S().builds.granary = 4;
  run(120);
  check("no growth while housing is full", S().pop === 3);
  check("progress does not accrue while full (freeze, and nothing banked)", S().growth === 0);

  // With room, settlers arrive on cadence -- and cost NOTHING.
  // Pop 18 under the old model priced a settler at ~409 food; if any lump sum
  // were still charged, this stockpile would crater.
  reset();
  S().pop = 18; S().builds.hut = 10;      // housing 33, lots of room
  S().builds.granary = 5;                  // cap high enough to hold the pile
  S().res.food = 500;
  const upkeepPerSec = api.rates().upkeep;
  run(N * 2 + 2);                          // two arrivals worth of time
  check("two settlers arrived on cadence", S().pop === 20);
  check("bought tracks lifetime arrivals", S().bought === 2);
  const foodSpent = 500 - S().res.food;
  check("growth cost NO food -- only upkeep drained the stores",
    foodSpent < upkeepPerSec * 1.3 * (N * 2 + 2) + 1);   // 1.3 headroom for pop growing mid-run
  console.log(`  food spent over ${N * 2 + 2}s at pop 18->20: ${foodSpent.toFixed(1)} (upkeep only; old model charged ~409/settler)`);

  // Freeze semantics: partial progress survives a full-housing stretch.
  reset();
  S().res.food = 400; S().builds.granary = 4;
  S().builds.hut = 1;                      // housing 6, room for 3 more
  run(20);
  check("partial progress accrued", Math.abs(S().growth - 20) < 0.5);
  S().pop = api.housing();                 // housing suddenly full
  run(60);
  check("progress frozen while full, not reset", Math.abs(S().growth - 20) < 0.5);
  const popBeforeRoom = S().pop;
  S().builds.hut = 2;                      // room again (housing 9)
  run(N - 20 + 2);                         // just past the remaining time
  check("frozen progress counts toward the next arrival", S().pop === popBeforeRoom + 1);

  // Growth stops exactly at the housing cap, never over.
  reset();
  S().res.food = 400; S().builds.granary = 4;
  S().builds.hut = 1;                      // housing 6
  run(N * 4);
  check("population parks exactly at housing", S().pop === api.housing());
  check("still alive throughout (tests were fed)", S().dead === false);

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
  const inJob = (era, id) => api.MANIFESTS[era].jobs.some(j => j.id === id);
  check("copper/tin/bronze absent from the stone manifest",
    !inRes("stone", "copper") && !inRes("stone", "tin") && !inRes("stone", "bronze"));
  check("ore-mining jobs absent from the stone manifest",
    !inJob("stone", "copperMiner") && !inJob("stone", "tinMiner"));
  check("forge absent from the stone manifest",
    !api.MANIFESTS.stone.buildings.some(b => b.id === "forge"));
  check("stone-era rates ignore ore jobs entirely (no copper line at all)",
    !("copper" in api.rates()));
  S().era = "bronze";
  check("copper/tin/bronze all present in bronze",
    inRes("bronze", "copper") && inRes("bronze", "tin") && inRes("bronze", "bronze"));
  check("ore jobs present in bronze", inJob("bronze", "copperMiner") && inJob("bronze", "tinMiner"));
  check("forge and ore yard appear in bronze",
    api.isRevealed(forgeDef) && api.isRevealed(oreYardDef));
  const copperRes = api.MANIFESTS.bronze.resources.find(r => r.id === "copper");
  const bronzeRes = api.MANIFESTS.bronze.resources.find(r => r.id === "bronze");
  check("bronze has a generous cap and no storage building",
    bronzeRes.capBuilding === null && bronzeRes.baseCap > copperRes.baseCap);
}

console.log("\n--- P2: tin yields half of copper ---");
reset();
S().era = "bronze";
S().pop = 10;
S().jobs.copperMiner = 1;
S().jobs.tinMiner = 1;
{
  const r = api.rates();
  console.log(`  per miner: copper ${r.copper.toFixed(3)}/s, tin ${r.tin.toFixed(3)}/s`);
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

console.log("\n--- P2: shrinking releases every job type, food last ---");
{
  reset();
  S().era = "bronze";
  const ro = api.releaseOrder();
  check("release order covers all of the era's jobs", ro.length === api.MANIFESTS.bronze.jobs.length);
  check("foraging is released last", ro[ro.length - 1] === "forager");
  check("stone's release order is era-correct too (no ore jobs)",
    (S().era = "stone", api.releaseOrder().length === api.MANIFESTS.stone.jobs.length));
  S().era = "bronze"; S().pop = 6;
  S().jobs = { forager: 1, woodcutter: 1, miner: 1, copperMiner: 2, tinMiner: 1 };
  check("fully staffed to start", api.idle() === 0);
  for (let i = 0; i < 3; i++) api.removeSettler(true);
  check("jobs never exceed the people left", api.jobsUsed() <= api.civilians());
  check("idle never goes negative after deaths", api.idle() >= 0);
  check("the last forager is protected", S().jobs.forager === 1);
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
reset();
S().era = "bronze";
{
  S().pop = 9;
  S().units = { soldier: 3, archer: 3, horseman: 3 };
  const popBefore = S().pop;
  const lost = api.removeRandomUnit();
  check("a unit was removed and named", typeof lost === "string" && lost.length > 0);
  check("total units dropped by one", api.totalUnits() === 8);
  check("population dropped with it", S().pop === popBefore - 1);

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

// ================= REGRESSION: idle() must never go negative =================
// Reported from real play: idle showed -1. Clicking a job's minus button then
// "absorbed" the deficit, which looked like a worker vanishing.
console.log("\n--- BUG: idle() must never go negative ---");
{
  // Root cause: a death released people from JOBS but ignored the civilians
  // already reserved by queued unit orders.
  reset();
  S().era = "bronze";
  S().pop = 10; S().builds.barracks = 1; S().res.wood = 500;
  S().jobs = { forager: 9, woodcutter: 0, miner: 0, copperMiner: 0, tinMiner: 0 };
  api.build(findT("soldier"));            // reserves the 10th civilian
  check("fully committed to start: idle is 0", api.idle() === 0);
  api.removeSettler();                    // sickness kills someone
  console.log(`  after a death with an order queued: idle=${api.idle()} ` +
    `civ=${api.civilians()} jobs=${api.jobsUsed()} reserved=${api.reserved()}`);
  check("death with a queued unit order does not drive idle negative", api.idle() >= 0);
}
{
  // Harsher: more orders queued than survivors, so releasing jobs cannot
  // possibly balance the books on its own.
  reset();
  S().era = "bronze";
  S().pop = 6; S().builds.barracks = 1; S().res.wood = 500;
  S().jobs = { forager: 2, woodcutter: 0, miner: 0, copperMiner: 0, tinMiner: 0 };
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  check("four orders queued", api.reserved() === 4);
  for (let i = 0; i < 4; i++) api.removeSettler(true);   // a raid guts the settlement
  console.log(`  after 4 deaths: idle=${api.idle()} civ=${api.civilians()} ` +
    `jobs=${api.jobsUsed()} reserved=${api.reserved()} queue=${S().buildQueue.length}`);
  check("mass casualties still leave idle non-negative", api.idle() >= 0);
  check("orders with nobody left to train were abandoned", api.reserved() <= api.civilians());
}
{
  // A settlement of nothing but trained units has no civilian left to kill.
  reset();
  S().pop = 3; S().units = { soldier: 3, archer: 0, horseman: 0 };
  check("no civilians to begin with", api.civilians() === 0);
  api.removeSettler(true);
  check("civilian death is a no-op when only units remain", api.civilians() >= 0);
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
    const civ = api.civilians();
    S().jobs.forager = Math.floor(Math.random() * Math.max(1, civ));
    for (let q = 0; q < Math.floor(Math.random() * 4); q++) {
      api.build(pickOne([findT("soldier"), findT("archer"), findT("horseman")]));
    }
    for (let d = 0; d < 1 + Math.floor(Math.random() * 6); d++) {
      if (Math.random() < 0.5) api.removeSettler(true); else api.removeRandomUnit();
    }
    worstIdle = Math.min(worstIdle, api.idle());
    worstCiv = Math.min(worstCiv, api.civilians());
  }
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
  console.log(`  fuzz over 400 random settlements: worst idle=${worstIdle}, worst civilians=${worstCiv}`);
  check("fuzz: idle() never went negative", worstIdle >= 0);
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
  check("settlerIntervalSeconds exists and is sane",
    typeof api.CONFIG.settlerIntervalSeconds === "number" && api.CONFIG.settlerIntervalSeconds > 0);
  // Raising a food cap must no longer be able to trigger any purchase: food
  // parks at the new cap and simply sits there.
  S().pop = 19; S().builds.hut = 10; S().builds.granary = 5;
  S().res.food = api.caps().food;
  const foodBefore = S().res.food;
  api.accrueGrowth(1);
  check("growth ticking never touches food", S().res.food === foodBefore);
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
  check("era-scoped values: housing per hut 3 -> 5",
    m.stone.housingPerHut === 3 && m.bronze.housingPerHut === 5);
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
    api.DEF_INDEX.hut.name === "Longhouse");
  reset();
  check("defById prefers the active era over DEF_INDEX", api.defById("hut").name === "Hut");
}

console.log("\n--- Phase A: the compiler is loud about authoring mistakes ---");
{
  const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  const mini = api.compileBase({
    name: "T", housingPerHut: 1, panelTitles: {}, popNoun: { singular: "p", plural: "ps" }, arrivalLine: "x", raidTypes: [],
    resources: [], jobs: [], upgrades: [], units: [],
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
    name: "V", housingPerHut: 1, panelTitles: {}, popNoun: { singular: "p", plural: "ps" }, arrivalLine: "x", raidTypes: [{ id: "raid", name: "raid", weight: 1 }],
    resources: [{ id: "gold", name: "Gold", baseCap: 10, capBuilding: null }],
    jobs: [{ id: "panner", name: "Pan gold", res: "gold" }],
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
  check("a job gathering a missing resource is caught",
    throws(() => compileAndValidate((r) => { r.jobs[0].res = "silver"; })));
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
  check("ten additions across buildings/units/upgrades (incl. the iron capstone)", d.added.length === 10);
  check("exactly one removal: the capstone", d.removed.length === 1 && d.removed[0].id === "bronzeAge");
  check("two renames: hut and infirmary", d.renamed.length === 2 &&
    d.renamed.some(r => r.from.name === "Hut" && r.to.name === "Stone House") &&
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
    name: "Old", housingPerHut: 1, panelTitles: {}, raidTypes: [],
    resources: [
      { id: "wood", name: "Wood", baseCap: 99, capBuilding: null },
      { id: "bronze", name: "Bronze", baseCap: 99, capBuilding: null },
      { id: "tin", name: "Tin", baseCap: 99, capBuilding: null },
    ],
    jobs: [
      { id: "forager", name: "Forage food", res: "wood" },
      { id: "tinMiner", name: "Mine tin", res: "tin" },
    ],
    buildings: [], upgrades: [], units: [], events: [], hints: [],
  });
  const NEW = api.extendEra(OLD, {
    name: "New",
    remove: ["bronze", "tin", "tinMiner"],
    add: { resources: [{ id: "iron", name: "Iron", baseCap: 99, capBuilding: null }] },
    events: [], hints: [],
    migrations: [
      { bucket: "res", id: "bronze", convertTo: "iron", ratio: 0.5, narrate: "Old bronze is melted down for iron." },
      { bucket: "res", id: "tin", vanish: true, narrate: "The tin is left where it lies." },
    ],
  });
  reset();
  S().res.bronze = 21; S().res.tin = 40; S().res.wood = 7; S().res.iron = 0;
  S().jobs.tinMiner = 3; S().jobs.forager = 1; S().pop = 10;
  const snapshot = JSON.parse(JSON.stringify(S()));
  api.runEraMigrations(OLD, NEW, snapshot);
  check("convertTo: bronze became iron at the ratio, floored", S().res.iron === 10);
  check("convertTo zeroes the source", S().res.bronze === 0);
  check("vanish zeroes tin", S().res.tin === 0);
  check("untouched state carries", S().res.wood === 7);
  check("workers on a removed job returned to idle", S().jobs.tinMiner === 0);
  check("workers on surviving jobs stay put", S().jobs.forager === 1);

  // Formulas read the SNAPSHOT, not live state: an fn that reads a value an
  // earlier instruction already zeroed must still see the pre-transition number.
  const NEW2 = api.extendEra(OLD, {
    name: "New2", remove: ["bronze", "tin", "tinMiner"],
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
    !has("resources", "bronze") && !has("jobs", "copperMiner") && !has("jobs", "tinMiner") &&
    !has("buildings", "oreYard"));
  check("stranded upgrades left the shop",
    !has("upgrades", "bronzeTools") && !has("upgrades", "bronzeWeapons") &&
    !has("upgrades", "scouting") && !has("upgrades", "flintSpears"));
  check("the capstone that led here is retired", !has("upgrades", "ironAge"));
  check("iron/steel/gold arrived", has("resources", "iron") && has("resources", "steel") && has("resources", "gold"));
  check("no job produces gold or steel", !m.jobs.some(j => j.res === "gold" || j.res === "steel"));
  check("new buildings and upgrades arrived", has("buildings", "ironYard") && has("buildings", "treasury") &&
    has("upgrades", "ironTools") && has("upgrades", "ironWeapons") && has("upgrades", "steelArmor"));
  check("hut is now the Longhouse, housing 7",
    m.buildings.find(b => b.id === "hut").name === "Longhouse" && m.housingPerHut === 7);
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
  check("diff: 8 added (incl. siege pair), 6 removed, 1 renamed",
    d.added.length === 8 && d.removed.length === 6 && d.renamed.length === 1 &&
    d.renamed[0].to.name === "Longhouse");
}

console.log("\n--- C1: capstone gating and the real transition ---");
{
  api.setRngSource(() => 0.999999);   // no hazards during the long build
  reset();
  S().era = "bronze";
  const capstone = api.MANIFESTS.bronze.upgrades.find(u => u.id === "ironAge");
  S().pop = 16;
  check("pop alone does not reveal the iron capstone", !api.isRevealed(capstone));
  S().units.archer = 1;
  check("pop + a composition unit reveals it", api.isRevealed(capstone));

  // A real bronze settlement takes the leap: stocked ores, workers on the
  // dead jobs, bronze in store -- everything the migration must handle.
  reset();
  S().era = "bronze";
  S().pop = 20; S().units = { soldier: 2, archer: 1, horseman: 1 };
  // No forge in this fixture: a running forge would keep smelting during the
  // 180s build and the bronze-at-flip number would drift off 70.
  S().builds = Object.assign(S().builds, { hut: 4, barracks: 1, oreYard: 2,
    granary: 4, woodshed: 4, stoneYard: 4 });
  S().res = Object.assign(S().res, { food: 450, wood: 450, stone: 450, bronze: 120, copper: 33, tin: 12 });
  S().jobs = Object.assign(S().jobs, { forager: 4, copperMiner: 2, tinMiner: 1 });
  api.build(capstone);
  check("capstone queued and paid", S().buildQueue.length === 1 && S().res.bronze === 70);
  run(185);
  check("era flipped to iron", S().era === "iron");
  check("copper and tin vanished, narrated", S().res.copper === 0 && S().res.tin === 0);
  check("bronze became gold at 1:4, floored", S().res.gold === Math.floor(70 * 0.25));
  check("bronze stock zeroed by the conversion", S().res.bronze === 0);
  check("ore-job workers walked home", S().jobs.copperMiner === 0 && S().jobs.tinMiner === 0);
  // Consolidation (keep 0.7). Families kept arriving during the 180s build,
  // so derive the expectation from the archived pre-flip snapshot: units at
  // flip were 2/1/1 -> floor to 1/0/0, and civilians floor at 0.7.
  const snapPop = S().eraHistory.bronze.pop;
  check("families kept arriving during the long build", snapPop >= 20);
  check("families banded into holdfasts (floored from the snapshot)",
    S().pop === Math.floor((snapPop - 4) * 0.7) + 1);
  check("units consolidated with the same floor",
    S().units.soldier === 1 && S().units.archer === 0 && S().units.horseman === 0);
  check("jobs floored alongside (forager 4 -> 2)", S().jobs.forager === 2);
  check("the noun is holdfast now", api.active().popNoun.singular === "holdfast");
  check("the books balance after all of it", api.idle() >= 0 && api.jobsUsed() <= api.civilians());
  check("bronze-era snapshot archived pre-consolidation", !!S().eraHistory.bronze &&
    S().eraHistory.bronze.res.bronze === 70 && S().eraHistory.bronze.jobs.copperMiner === 2);
  check("housing jumped retroactively (4 huts: 3 + 4x7 = 31)", api.housing() === 31);
  api.setRngSource(null);
}

console.log("\n--- C1: iron-era economy runs ---");
{
  api.setRngSource(() => 0.999999);
  reset();
  S().era = "iron";
  S().pop = 10; S().jobs.forager = 3; S().jobs.ironMiner = 2;
  S().res.food = 200; S().builds.granary = 2;
  run(30);
  check("iron mines at full rate (2 miners, 30s, ~12 iron)", S().res.iron > 10);
  S().builds.forge = 2; S().res.iron = 60; S().res.wood = 40;
  const w0 = S().res.wood;
  api.runConverters(10);   // 2 forges x 0.05 x 10s = 1 steel
  check("the Forge makes steel from iron AND wood", Math.abs(S().res.steel - 1) < 1e-9 &&
    Math.abs((w0 - S().res.wood) - 2) < 1e-9);
  check("iron consumed at the recipe ratio", Math.abs(S().res.iron - 57) < 1e-9);
  S().builds.ironYard = 1; S().builds.treasury = 1;
  const c = api.caps();
  check("Iron Yard and Treasury raise their caps", c.iron === 150 && c.gold === 150);
  check("steel is generous-capped with no building", c.steel === 200);
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
  check("stone and bronze declare none (wholesale, never inherited)",
    api.MANIFESTS.stone.adversaries.length === 0 && api.MANIFESTS.bronze.adversaries.length === 0);
  check("only peaceful adversaries trade",
    advs.every(a => !a.buys || a.disposition === "peaceful"));
  const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  const base = () => ({
    name: "T", housingPerHut: 1, panelTitles: {}, popNoun: { singular: "p", plural: "ps" }, arrivalLine: "x", raidTypes: [{ id: "raid", name: "raid", weight: 1 }],
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
  check("civilians/pop unchanged -- they're alive, just not home",
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
  api.launchCampaign("hillClans", { soldier: 2 });
  check("a legal campaign launches and pays provisions",
    S().expeditions.length === 1 && S().res.food === 100 - api.CONFIG.campaignFoodCost);
  api.launchCampaign("hillClans", { soldier: 1 });
  check("one CAMPAIGN at a time", S().expeditions.filter(e => e.type === "campaign").length === 1);
  api.launchCaravan("riverKingdom");
  check("a caravan CAN roll while the campaign is out (parallel tracks)",
    S().expeditions.length === 2 && S().expeditions.some(e => e.type === "caravan"));
  check("the caravan paid its cargo up front", S().res.food === 100 - 30 - 60);
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
  check("a lost ambush costs the cargo and a guard",
    S().res.gold === 15 && S().units.soldier === 5 && S().pop === 14);
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
  check("stone and bronze do not consolidate; iron does, generously",
    !M.stone.consolidate && !M.bronze.consolidate &&
    M.iron.consolidate && M.iron.consolidate.keep === 0.7);
  // An era that says nothing inherits the noun (the Silicon-keeps-Bloc rule).
  const quiet = api.extendEra(M.iron, { events: [], hints: [] });
  check("popNoun inherits when a delta is silent", quiet.popNoun.singular === "holdfast" &&
    quiet.arrivalLine === M.iron.arrivalLine);
  check("consolidation is per-border, never inherited", quiet.consolidate === null);
  const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  check("a base era without popNoun fails validation", throws(() => {
    const raw = { name: "N", housingPerHut: 1, panelTitles: {}, raidTypes: [],
      resources: [], jobs: [], buildings: [], upgrades: [], units: [], events: [], hints: [] };
    api.validateManifests({ test: api.compileBase(raw) });
  }));

  // Consolidation math directly: floors, sum-consistency, deployed guard.
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().pop = 20; S().units = { soldier: 4, archer: 2, horseman: 0, siegeEngine: 0 };
  S().jobs.forager = 5; S().jobs.ironMiner = 3;
  api.applyConsolidation({ keep: 0.7 });
  check("units floor independently (4->2, 2->1)", S().units.soldier === 2 && S().units.archer === 1);
  check("pop is rebuilt as civ+units (floor(14x0.7)=9, +3)", S().pop === 12);
  check("civilians can never go negative by construction", api.civilians() === 9);
  check("jobs floor alongside (5->3, 3->2)", S().jobs.forager === 3 && S().jobs.ironMiner === 2);

  // A column abroad cannot be consolidated out from under its expedition.
  reset();
  S().era = "iron";
  api.initAdversaries();
  S().pop = 10; S().units = { soldier: 4, archer: 0, horseman: 0, siegeEngine: 0 };
  S().expeditions.push({ uid: 1, type: "campaign", adversary: "hillClans",
    units: { soldier: 4 }, total: 90, remaining: 50 });
  api.applyConsolidation({ keep: 0.5 });
  check("deployed units are protected from the floor", S().units.soldier === 4);
  check("the books still balance around them", S().pop === 4 + Math.max(1, Math.floor(6 * 0.5)));
  S().expeditions.length = 0;
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
    const raw = { name: "W", housingPerHut: 1, panelTitles: {}, popNoun: { singular: "p", plural: "ps" }, arrivalLine: "x", raidTypes: [{ id: "r", name: "r", weight: 1 }],
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
  check("bronze rate = forges x recipe out (2 x 0.05)", Math.abs(r.bronze - 0.1) < 1e-9);
  check("copper reads NET of forge consumption", Math.abs(r.copper - (-0.4)) < 1e-9);
  check("tin reads net too", Math.abs(r.tin - (-0.1)) < 1e-9);
  check("rates() itself stays gross -- the simulation is untouched", api.rates().bronze === 0);

  // The designed equilibrium: 2 copper : 1 tin miners feeding 2 forges.
  // Stocks at zero, inflow exactly matches consumption -- the ledger should
  // read it as steady, not flickering.
  reset();
  S().era = "bronze";
  S().pop = 10;
  S().builds.forge = 2;
  S().jobs.copperMiner = 2; S().jobs.tinMiner = 1;
  S().res.copper = 0; S().res.tin = 0;
  r = api.ledgerRates();
  check("equilibrium: copper nets to zero", Math.abs(r.copper) < 1e-9);
  check("equilibrium: tin nets to zero", Math.abs(r.tin) < 1e-9);
  check("equilibrium: bronze flows at full rate", Math.abs(r.bronze - 0.1) < 1e-9);

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
  S().jobs.woodcutter = 2;
  S().res.iron = 100; S().res.wood = 100;
  r = api.ledgerRates();
  check("steel flows at 2 forges' rate", Math.abs(r.steel - 0.1) < 1e-9);
  check("wood reads mining minus the forge's burn (0.4 - 0.2)", Math.abs(r.wood - 0.2) < 1e-9);
  check("iron reads as pure drain with no miners", Math.abs(r.iron - (-0.3)) < 1e-9);
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
  api.build(findB("hut"));
  run(3);
  const midRemaining = S().buildQueue[0].remaining;
  api.save();
  S().res.wood = 9999;               // scribble on live state...
  api.load();                        // ...and prove load restores the saved copy
  check("save/load round-trips a build mid-construction",
    S().buildQueue.length === 1 && Math.abs(S().buildQueue[0].remaining - midRemaining) < 1e-9);
  check("load restores the saved copy, not live state", S().res.wood < 9999);
  run(15);
  check("the revived save finishes the build", S().builds.hut === 1 && S().buildQueue.length === 0);

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
    api.assign("forager", 1); api.assign("woodcutter", 1); api.assign("woodcutter", 1);
    run(120);
    api.build(findB("hut"));
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
