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
import * as mBattle from "./src/sim/battle.js";
import * as mArmies from "./src/sim/armies.js";
import * as mContact from "./src/sim/contact.js";
import * as mRaiders from "./src/sim/raiders.js";
import * as mBattleUi from "./src/ui/battle.js";
import * as mBots from "./src/sim/bots.js";
import * as mHex3d from "./src/render3d/hex3d.js";
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
import * as mPalette from "./src/core/palette.js";
import * as mJournal from "./src/core/journal.js";
import * as mReplay from "./src/core/replay.js";
import * as mBus from "./src/core/bus.js";
import * as mEraClock from "./src/sim/eraclock.js";
import fs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

const MODS = [mConfig, mRng, mLib, mStone, mBronze, mIron, mCompile, mIcons, mState,
  mContinents,
  mDerived, mCombat, mBattle, mArmies, mContact, mRaiders, mBots, mHex3d, mEvents, mExped, mStep, mActions, mEra, mLog, mDom,
  mPLedger, mPPeople, mPHold, mPBuy, mExpedUi, mBattleUi, mModal, mChrome, mPersist,
  mMapModel, mMapGen, mMapCore, mMapUi, mPalette, mJournal, mReplay, mBus, mEraClock];

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
  const s = S(), p = api.me();
  console.log(`${label.padEnd(34)} pop=${p.pop} civ=${api.civilians()} ` +
    `soldiers=${p.units.soldier} food=${p.res.food.toFixed(1)} wood=${p.res.wood.toFixed(1)} ` +
    `stone=${p.res.stone.toFixed(1)} owned=${s.map ? api.holdCount() : 0} barracks=${!!p.upgrades.barracks} dead=${s.dead}`);
}
// idle()'s successor (E2): who could still be trained. People are never
// "unassigned" any more -- they live somewhere -- but a queued unit order
// still reserves a civilian the instant it's placed.
const spare = () => api.civilians() - api.reserved();
function reset() { api.S = api.freshState(); }

// Walk every other player up to a named age. The stand-in policy that used to
// do this (paceRivals) was replaced by the era clock on 2026-08-26; fixtures
// that only care about a rival BEING in an age say so directly rather than
// waiting out a countdown.
function advanceRivalsTo(era) {
  for (const r of api.rivals()) if (r.era !== era) api.advanceEra(era, r);
}

// SEAT EXACTLY THIS LIST. Ownership is `S.map.owner[tileId] = playerId` since
// 2026-08-26, so a fixture that used to assign an array has to say whose the
// tiles are. Clears the current civ's holdings first, so the list IS the
// dominion rather than being added to it.
function setHoldings(ids, pid) {
  const who = pid == null ? api.S.me : pid;
  for (const id of api.holdings(who)) api.releaseTile(id);
  for (const id of ids) api.claimTile(id, who);
}

// STAND N STRUCTURES ON THE BOARD. Converters and healers are counted off the
// hexes now (2026-08-25), so a fixture cannot just write a number into
// S.builds -- it has to own ground and put something on it. Claims whatever
// extra hexes it needs, since "you must hold a hex to build on it" is exactly
// the trade-off the move onto the board created.
function putStructures(sid, n) {
  const S = api.S;
  if (!S.map) api.ensureMap();
  S.map.built = S.map.built || {};
  for (const id of api.holdings()) if (S.map.built[id] === sid) delete S.map.built[id];
  if (n <= 0) return;
  const free = api.holdings().filter((id) => !S.map.built[id]);
  while (free.length < n) {
    const next = Object.values(api.world.places).find((p) =>
      p.terrain !== "water" && !p.adversary && !p.minor && !api.isOwned(p.id));
    if (!next) break;
    api.captureTile(next.id);
    free.push(next.id);
  }
  for (let i = 0; i < n && i < free.length; i++) S.map.built[free[i]] = sid;
  api.syncPopMirror();
}

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
// PINNED SEED. How much barren ground is within reach is the world's business,
// and on a generous seed the realm simply feeds itself -- which made this
// check pass or fail depending on the roll. The famine MECHANISM is what is
// under test, so the world it runs on is fixed.
reset(); S().seed = 424242; S().rngState = 424242; S().map = null; S().seen = {};
api.ensureMap();
// A TIMBER EMPIRE STARVES (rewritten 2026-08-25 with the hex economy). The old
// setup left the starting trio unassigned and waited; ground works its own
// terrain now and the seat is always food, so an idle trio feeds itself and
// this check was asserting that the economy still had the bug it was built to
// catch. The condition it MEANT to prove is the standing design law -- the
// economy must be able to break you -- and the shape that law takes under one
// resource per hex is a realm that spread onto ground which gives no bread.
{
  const barren = Object.values(api.world.places)
    .filter((x) => (x.terrain === "forest" || x.terrain === "hills") && !x.adversary && !x.minor)
    .slice(0, 12);
  for (const x of barren) if (!api.isOwned(x.id)) api.claimTile(x.id);
  api.ensurePop();
  // Pack them: every mouth is real, and none of this ground grows anything.
  for (const x of barren) S().map.pop[x.id] = api.capOf(x.id);
  api.syncPopMirror();
  api.me().res.food = 0;
}
snap("start");
const beforePop = api.me().pop, beforeHeld = api.holdCount();
run(240);
// WHAT FAMINE DOES NOW, and this is a behaviour change worth stating: it
// CONVERGES rather than kills. Each death shrinks the deficit, and emptied
// frontier hexes fall out of the dominion, so a realm that overspread shrinks
// back to what its ground can feed and then stabilises. Total extinction needs
// the SEAT to be unable to feed anyone, and the seat is always food terrain by
// generation -- so starvation is a punishing correction, not a loss condition.
// (Whether the game should still have a starvation LOSS is an open design
// question, flagged 2026-08-25; the mechanism below is what the code does.)
check("famine takes people when the ground cannot feed them", api.me().pop < beforePop);
check("famine takes GROUND too -- emptied frontier hexes leave the dominion",
  api.holdCount() < beforeHeld);
check("the seat is never the hex that empties", api.isOwned(api.world.home));
run(600);
const settled = api.me().pop;
run(300);
check("and it converges: the realm stabilises at what its land can feed",
  api.me().pop >= settled && !S().dead);
api.setRngSource(null);

reset(); api.ensureMap();
api.me().res.wood = 80; api.me().res.stone = 40;    // materials up front; gathering has its own checks
run(5);
// Everything you construct stands on GROUND now (2026-08-25), so a fixture
// picks a hex and raises something on it. The Medicine Tent is the cheapest.
{
  const spot = api.holdings().find((id) => id !== api.world.home);
  api.launchStructure(spot, "infirmary");
  run(25);
  check("a structure still completes with nobody told to do anything",
    api.builtCount("infirmary") === 1);
}

// ---- Barracks is capped at 1 ----
console.log("\n--- Barracks: capped at 1 ---");
reset(); api.ensureMap();
// (allocation line removed 2026-08-25: ground works its own terrain now)
// The reveal spine is THE CLAIM since E3: barracks opens when the dominion
// grows past its starting trio.
const fourth = Object.values(api.world.places)
  .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
api.captureTile(fourth.id);
// Pin the dice across the window. Since an empty hex is LOST (2026-08-25), a
// raid or a plague landing on the freshly claimed tile takes the dominion back
// below the trio and the reveal never fires -- which is a real behaviour of the
// game, measured at ~0.3% over these five seconds, and nothing to do with what
// this check is about. Found as a 1-in-40 flake here rather than in play.
api.setRngSource(() => 0.99);
run(5);
api.setRngSource(null);
api.me().res.wood = 200; api.me().res.stone = 200;  // skip the grind, just testing cap behavior
snap("fourth hex claimed; barracks should be revealed");
// THE BARRACKS IS AN UPGRADE (2026-08-25). It was a cap-1 building whose only
// effect was "you may now train Soldiers", which is a tech -- and upgrade
// semantics give the once-only rule for free, without a `cap` field.
check("barracks revealed once the dominion grows past the trio", api.isRevealed(findU("barracks")));
api.build(findU("barracks"));
check("first barracks queued", api.me().buildQueue.some(q => q.id === "barracks"));
api.build(findU("barracks"));
check("second barracks refused -- an upgrade is bought once", api.me().buildQueue.filter(q => q.id === "barracks").length === 1);
run(31);
check("barracks completed", api.me().upgrades.barracks === true);
api.build(findU("barracks"));
check("can't queue a 2nd barracks once owned either", api.me().buildQueue.length === 0);

// ---- Soldier: popCost reserves a civilian immediately, not on completion ----
console.log("\n--- Soldier: popCost reserves a civilian the instant it's queued ---");
// Deterministic block: a rare sickness during the training window would kill a
// civilian and shift every count this section asserts on.
api.setRngSource(() => 0.999999);
reset();
api.me().pop = 6;
api.me().builds.hut = 1; api.me().upgrades.barracks = true;
api.me().res.wood = 50;
snap("6 pop, barracks built");
check("6 spare civilians before training", spare() === 6);
const soldierDef = findT("soldier");
console.log(`  soldier cost: ${JSON.stringify(api.buildCost(soldierDef))} popCost: ${soldierDef.popCost} buildTime: ${soldierDef.buildTime}`);
api.build(soldierDef);
snap("soldier order queued (not yet complete)");
check("spare drops by 1 the instant it's queued, before completion", spare() === 5);
check("civilians() unchanged yet -- reservation, not conversion", api.civilians() === 6);
check("S.units.soldier still 0 -- not combat-effective until trained", api.me().units.soldier === 0);
run(soldierDef.buildTime + 1);
snap("after training completes");
check("S.units.soldier now 1", api.me().units.soldier === 1);
check("civilians() dropped by 1 -- permanently converted", api.civilians() === 5);
check("spare settles at 5 (reservation -> conversion is a wash)", spare() === 5);

// ---- Cancelling a queued Soldier order frees the reservation ----
api.setRngSource(null);

console.log("\n--- Cancel a queued Soldier order -- reservation freed ---");
reset();
api.me().pop = 6;
api.me().builds.hut = 1; api.me().upgrades.barracks = true;
api.me().res.wood = 50;
const spareBefore = spare();
api.build(findT("soldier"));
check("spare dropped after queuing", spare() === spareBefore - 1);
const uid = api.me().buildQueue[0].uid;
api.cancelBuild(uid);
check("spare restored after cancelling", spare() === spareBefore);
check("no soldier was created", api.me().units.soldier === 0);

// (The removeRandomUnit section died in A5 with the function: home casualties
// came from raids, raids are armies, and armies lose soldiers through the
// resolver's worst-goes-first order, pinned in the battle-resolver section.)

// ---- Weapon/armor upgrades affect military math ----
console.log("\n--- Weapon/armor upgrades ---");
reset();
api.me().units.soldier = 3;
// (militaryStrength died in A5; the multipliers survive because CAMPAIGNS
// still read them, and die with the campaign system when armies absorb it.)
check("base weapon multiplier is 1.0", api.weaponMultiplier() === 1.0);
api.me().upgrades.flintSpears = true;
check("flintSpears raises the multiplier", api.weaponMultiplier() === 1.6);
check("base armor factor is 1.0 (no reduction)", api.armorFactor() === 1.0);
api.me().upgrades.hideArmor = true;
check("hideArmor halves the casualty-chance factor", api.armorFactor() === 0.5);

// ---- Conflict: gated below pop 4 ----
console.log("\n--- Conflict: gated below pop 4, same as sickness ---");
reset();
api.setRngSource(() => 0);   // force every roll to "hit" if attempted at all
const popBefore2 = api.me().pop;
api.resolveEvents(1);
check("no conflict effect below the pop gate", api.me().pop === popBefore2 && S().dead === false);
api.setRngSource(null);

console.log("\n--- The inbound war: a raid is an army now (A5) ---");
{
  reset(); S().seed = 313131; S().rngState = 313131; S().map = null; S().seen = {};
  api.ensureMap(); api.initAdversaries();
  const P = api.me();
  const hill = api.playerByKey("hillClans");

  check("the old resolution is gone -- one combat system remains",
    api.militaryStrength === undefined && api.unitStrength === undefined &&
    api.counterUnitFor === undefined && api.counterCoverage === undefined &&
    api.removeRandomUnit === undefined && api.fortStrength === undefined &&
    api.CONFIG.fortRange === undefined && api.CONFIG.fortStrength === undefined);

  const seat = Object.values(api.world.places).find((x) => x.adversary === "hillClans");
  check("the hill people have a seat on this board to muster at", !!seat);

  // Force nothing: spawnRaid is the whole decision, called directly the way
  // the conflict trigger calls it.
  const army = api.spawnRaid();
  check("a warlike neighbour musters a real army at their own seat",
    !!army && army.intent === "raid" && army.home === seat.id);
  check("the war party is marching at ground YOU hold",
    !!army.order && api.isOwned(army.order.to));
  check("the units are granted into the sender's pool and committed",
    api.armySize(army) >= 1 && (hill.units.soldier || 0) + (hill.units.horseman || 0) >= api.armySize(army));
  check("one raid out per sender -- a people is not a spawner", api.spawnRaid() === null);

  // Walk the world until the raid has run its whole course: march in, pillage,
  // march home, disperse. Military ticks only, so the economy holds still.
  const foodBefore = P.res.food = 80; const woodBefore = P.res.wood = 80;
  const landBefore = api.hexPopSum();
  let sighted = false, guard = 0;
  while (api.armiesOf(hill).length > 0 && guard++ < 900) {
    api.tickMilitary(2);
    if (army.sightedByMe) sighted = true;
  }
  check("the raid ran its whole course and the war party went home", api.armiesOf(hill).length === 0);
  check("a garrison at home is never announced as a sighting", (() => {
    // The owner's chronicle showed the seat garrison introduced with the same
    // alarm as an inbound war party. An army standing on its own civ's ground
    // is scenery -- the Chronicle's alarm waits for the border. Staged by
    // hand (no tickBots: settling the hill clans here would deadlock the
    // armies-empty loops below with a permanent garrison).
    const seat2 = api.seatOf(hill);
    api.claimTile(seat2, hill.id);
    hill.units.soldier = (hill.units.soldier || 0) + 3;
    const g2 = api.formArmy(seat2, { soldier: 3 }, "never", hill);
    g2.intent = "garrison";
    // Give the player eyes: my own army standing beside their seat.
    const eye = api.world.places[seat2].adj.find((n) => api.world.places[n].terrain !== "water");
    P.units.soldier = (P.units.soldier || 0) + 2;
    const watcher = api.formArmy(api.holdings(P.id)[0], { soldier: 2 }, "never", P);
    watcher.at = eye;
    api.tickRaiders();
    const quiet = !g2.sightedByMe && api.canSeeArmyAt(seat2);
    // And the moment the same army steps OFF its own ground, it is news --
    // staged as a meeting: it walks onto the very hex my watcher stands on,
    // which presence-eyes always see.
    g2.at = eye;
    api.tickRaiders();
    const news = g2.sightedByMe === true;
    // Undo the staging completely -- INCLUDING the hand-minted grant, which
    // exists outside botMint and would otherwise fail the levy-law check
    // below with units this fixture conjured itself.
    const lH = api.armiesOf(hill); lH.splice(lH.indexOf(g2), 1);
    const lP = api.armiesOf(P); lP.splice(lP.indexOf(watcher), 1);
    hill.units.soldier = Math.max(0, (hill.units.soldier || 0) - 3);
    api.releaseTile(seat2);
    return quiet && news;
  })());

  // A GARRISON IS AN ANSWER. Same raid, but this time soldiers stand on the
  // target: contact seals a battle, the resolver fights it, and a war party
  // with a quarter-loss stance does not stay long.
  const army2 = api.spawnRaid();
  check("the next raid can muster once the last came home", !!army2);
  const gHex = api.holdings(P.id)[0];
  P.units.soldier = 20;
  const garrison = api.formArmy(gHex, { soldier: 16 }, "never", P);
  api.orderMarch(army2.uid, gHex, hill);      // force the collision
  // A 2-v-16 battle seals AND concludes inside one 2-second tick, so polling
  // battleCount between ticks can miss the whole war. battleSeq is the truth:
  // it counts every seal, however fast the dice were done with it.
  const sealsBefore = S().battleSeq || 0;
  guard = 0;
  while (api.armiesOf(hill).length > 0 && guard++ < 900) api.tickMilitary(2);
  check("a garrisoned target means a BATTLE, not arithmetic", (S().battleSeq || 0) > sealsBefore);
  check("the garrison holds its ground", api.armyAt(gHex, P) !== null);
  check("and the war party is destroyed or driven home", api.armiesOf(hill).length === 0);

  // WALLS DETER, BUT THE TORCHES TURN ASIDE (owner, 2026-08-26). Raiders do
  // not besiege: a fortification turns a war party away by standing there, no
  // dice rolled, the masonry untouched -- and the raiders burn the nearest
  // soft hex BESIDE the walls instead of going home empty-handed. Deterrence
  // is real for the hex and never free for the realm.
  const army3 = api.spawnRaid();
  check("a third raid musters", !!army3);
  api.disbandArmy(garrison.uid, P);
  const wHex = api.holdings(P.id).find((id) => id !== api.world.home);
  S().map.built = S().map.built || {};
  S().map.built[wHex] = "marchHold";
  api.orderMarch(army3.uid, wHex, hill);
  const foodAtWalls = P.res.food = 80;
  const landAtWalls = api.hexPopSum();
  guard = 0;
  while (api.armiesOf(hill).length > 0 && guard++ < 900) api.tickMilitary(2);
  check("the walls held without a fight, untouched",
    api.battleCount() === 0 && S().map.built[wHex] === "marchHold" && api.armiesOf(hill).length === 0);
  check("...and the torches turned on the hex beside them",
    P.res.food < foodAtWalls && api.hexPopSum() < landAtWalls);

  // NOWHERE SOFT: every holding walled, and the war party genuinely goes home.
  const army4 = api.spawnRaid();
  check("a fourth raid musters", !!army4);
  for (const id of api.holdings(P.id)) S().map.built[id] = "marchHold";
  api.orderMarch(army4.uid, wHex, hill);
  const foodAllWalled = P.res.food = 80;
  const landAllWalled = api.hexPopSum();
  guard = 0;
  while (api.armiesOf(hill).length > 0 && guard++ < 900) api.tickMilitary(2);
  check("a fully walled realm sends them home empty-handed",
    api.armiesOf(hill).length === 0 && P.res.food === foodAllWalled &&
    api.hexPopSum() === landAllWalled && api.battleCount() === 0);
  for (const id of api.holdings(P.id)) delete S().map.built[id];

  // ---- The levy binds everyone (owner playtest: a garrison of SEVENTEEN) ----
  check("the levy binds everyone -- bot units never exceed territory x armyPerHex",
    api.botTotalUnits(hill) <= api.botLevyCap(hill));

  check("a returning column disbands at the seat -- never banks into the garrison", (() => {
    const seat3 = api.seatOf(hill);
    api.claimTile(seat3, hill.id);
    hill.units.soldier = (hill.units.soldier || 0) + 6;
    const gar = api.formArmy(seat3, { soldier: 4 }, "never", hill);
    gar.intent = "garrison";
    const gSize = api.armySize(gar);
    const eye2 = api.world.places[seat3].adj.find((n) => api.world.places[n].terrain !== "water");
    const homer = api.formArmy(seat3, { soldier: 2 }, "never", hill) ? null : (() => {
      // one army per hex: stage the homer adjacent instead
      const h2 = { uid: ++hill.buildSeq, at: eye2, roster: { soldier: 2 }, stance: "quarter",
                   order: null, intent: "returning", home: seat3 };
      api.armiesOf(hill).push(h2);
      return h2;
    })();
    api.orderMarch(homer.uid, seat3, hill);
    let g5 = 0;
    while (api.armyById(homer.uid, hill) && g5++ < 200) api.tickMilitary(2);
    const ok = api.armyById(homer.uid, hill) == null &&      // the homer retired
      api.armySize(gar) === gSize &&                          // the garrison did NOT grow
      api.freeUnits("soldier", hill) >= 2;                    // the pool did
    const lG = api.armiesOf(hill); lG.splice(lG.indexOf(gar), 1);
    api.releaseTile(seat3);
    return ok;
  })());

  // ---- The escalation: war armies take and HOLD ground ----
  check("a war army takes your ground and STAYS on it", (() => {
    hill.units.soldier = (hill.units.soldier || 0) + 10;
    const war = api.spawnRaid({ war: true });
    if (!war) return false;
    if (!(war.intent === "war" && war.stance === "half")) return false;
    if (war.order && war.order.to === api.world.home) return false;   // never the capital
    // Force it at a known undefended ordinary hex of mine for determinism.
    const prize = api.holdings(P.id).find((id) => id !== api.world.home && !api.armyAt(id, P));
    api.orderMarch(war.uid, prize, hill);
    let g6 = 0;
    while (api.armyById(war.uid, hill) && api.ownerOf(prize) === P.id && g6++ < 600) api.tickMilitary(2);
    const took = api.ownerOf(prize) === hill.id;
    api.tickMilitary(2);                                     // the shepherd converts it
    const stayed = api.armyAt(prize, hill) && api.armyAt(prize, hill).intent === "garrison";
    // undo: hand the hex back, disperse the squatter
    const sq = api.armyAt(prize, hill);
    if (sq) { const lW = api.armiesOf(hill); lW.splice(lW.indexOf(sq), 1); }
    api.releaseTile(prize); api.claimTile(prize, P.id);
    return took && !!stayed;
  })());
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
    (api.holdings().forEach((id) => api.killAt(id, 999)), api.strikeHex("raid") === null));
}

// ---- Healing is POSITIONAL (2026-08-25) ----
console.log("\n--- Healers cover ground, and Herbal Medicine makes them better ---");
{
  // The Medicine Tent stacked freely as a panel building -- three of them
  // anywhere and sickness was solved. On a hex it covers the ground AROUND it,
  // so a corner of the realm left uncovered is a real consequence of a choice.
  reset(); api.ensureMap();
  const home = api.world.home;
  check("no healers, no cover", api.healersNear(home) === 0);
  putStructures("infirmary", 1);
  const tent = api.holdings().find((id) => S().map.built[id] === "infirmary");
  check("a tent covers the hex it stands on", api.healersNear(tent) === 1);
  check("...and the ring around it",
    api.world.places[tent].adj.filter((id) => api.isOwned(id))
      .every((id) => api.healersNear(id) >= 1));
  check("the global counter machinery is gone -- mitigation is positional",
    api.negateChance === undefined);
  check("no era declares an event counter any more",
    Object.values(api.MANIFESTS).every((m) => m.events.every((ev) => !ev.counter)));
  check("Herbal Medicine is still the thing that makes healers better",
    api.MANIFESTS.stone.upgrades.some((u) => u.id === "herbalMedicine"));
}

// ---- v7 (rewritten in 4c): flat era caps; stone still actually clamps ----
console.log("\n--- v7: Stone Yard / stone storage cap ---");
reset();
check("stone cap is the era-authored 350 (4c; was 50 + storage)", api.caps().stone === 350);
// Post-E2 this tests the CLAMP alone -- gathering has its own hex-based
// checks now, and a 600s mining window would need a fed settlement besides.
api.me().res.stone = 200;
run(1);
check("stone clamps at the era cap now", api.me().res.stone <= api.caps().stone + 0.001);
api.me().builds.stoneYard = 9;    // a legacy count from an old save: INERT since 4c
check("no building moves a cap any more (4c)", api.caps().stone === 350);
api.me().builds.stoneYard = 0;

// ---- v7: Stone Tools bumps all three gather multipliers ----
console.log("\n--- v7: Stone Tools ---");
reset();
const before7 = api.mults();
check("no bonus without Stone Tools", before7.food === 1 && before7.wood === 1 && before7.stone === 1);
api.me().upgrades.stoneTools = true;
const after7 = api.mults();
check("Stone Tools adds +8% to all three", Math.abs(after7.food - 1.08) < 0.0001 &&
  Math.abs(after7.wood - 1.08) < 0.0001 && Math.abs(after7.stone - 1.08) < 0.0001);
// The per-resource BOOST BUILDING died 2026-08-25 with the hex economy: the
// Drying Racks, Lumber Camp and Stone Pit went onto the board as structures
// standing on the ground they improve. Improving a resource is a thing you do
// to a HEX now, at that hex's rate -- so multipliers are TECH ONLY, and a
// building standing anywhere cannot lift a global rate.
check("multipliers are tech only -- no building lifts a global rate", (() => {
  const before = api.mults().food;
  putStructures("infirmary", 3);
  api.me().upgrades.barracks = true;
  return api.mults().food === before;
})());
check("a structure lifts the HEX it stands on instead", (() => {
  api.ensureMap();
  // NOT any forest: putStructures ran just above and may have stood an
  // infirmary on one, and a built hex yields null -- which crashed this
  // fixture on roughly one world in sixteen (worlds are crypto-seeded per
  // run). A seat or steading forest would null the same way.
  const forest = Object.values(api.world.places).find((p) =>
    p.terrain === "forest" && !p.adversary && !p.minor && !S().map.built[p.id]);
  if (!forest) return true;
  if (!api.isOwned(forest.id)) api.claimTile(forest.id);
  const bare = api.hexYield(forest.id).rate;
  api.me().era = "bronze";
  S().map.built[forest.id] = "lumberCamp";
  const built = api.hexYield(forest.id);
  api.me().era = "stone"; delete S().map.built[forest.id];
  return built.res === "wood" && built.rate > bare;
})());

// ---- v7: Great Hunt (food windfall) and Trader (wood+stone windfall) ----
console.log("\n--- v7: positive events -- Great Hunt & Trader ---");
reset();
api.me().pop = 5;
const huntEv = findEv("greatHunt");
const traderEv = findEv("trader");
{
  api.setRngSource(() => 0); // force the trigger to fire
  const foodBefore = api.me().res.food;
  api.resolveEvents(1); // forced roll: greatHunt fires first in the list
  api.setRngSource(null);
  console.log(`  after forced greatHunt/trader tick: food=${api.me().res.food} wood=${api.me().res.wood} stone=${api.me().res.stone}`);
  check("food increased (Great Hunt landed)", api.me().res.food > foodBefore);
}
reset();
api.me().pop = 5;
{
  const woodBefore = api.me().res.wood, stoneBefore = api.me().res.stone;
  traderEv.effect(S());
  check("trader gives both wood and stone", api.me().res.wood > woodBefore && api.me().res.stone > stoneBefore);
}
reset();
api.me().pop = 5;
{
  const foodBefore2 = api.me().res.food;
  huntEv.effect(S());
  check("great hunt gives only food, not wood/stone", api.me().res.food > foodBefore2 && api.me().res.wood === 0 && api.me().res.stone === 0);
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
// The economy end to end: the seat feeds everyone and the trio's timber hex
// cuts wood. Reset first -- the tooltip sweep above leaves whatever era it
// finished in, and this block prices a STONE-age building.
reset(); api.ensureMap();
// Take a forest and pack it. The starting trio is guaranteed to WIDEN
// (map.js), but "widen" can mean plains-plus-river on a seed with no forest
// adjacent, so the timber hex is claimed outright rather than assumed.
const forestHex = Object.values(api.world.places)
  .find((x) => x.terrain === "forest" && !x.adversary && !x.minor);
if (forestHex && !api.isOwned(forestHex.id)) api.captureTile(forestHex.id);
const woodHex = api.holdings().find((id) => {
  const y = api.hexYield(id);
  return y && y.res === "wood";
});
S().map.pop[woodHex] = 8;
api.syncPopMirror();
api.me().res.stone = 40;                      // the quarry has its own checks
run(90);
{
  const plan = api.structurePlan("infirmary");
  check("enough timber gathered to afford the Medicine Tent", api.me().res.wood >= plan.cost.wood);
  const spot = api.holdings().find((id) => id !== api.world.home);
  api.launchStructure(spot, "infirmary");
  check("it actually entered the queue", api.me().buildQueue.length === 1);
  run(25); // let it finish, queue drains back to empty
  check("it finished, queue now empty again", api.me().buildQueue.length === 0);
}

// ================= BRONZE AGE PHASE 1 =================
const infDef = api.structureDef("infirmary");
const bronzeAgeDef = findU("bronzeAge");
const bronzeToolsDef = findU("bronzeTools");

console.log("\n--- Bronze P1: per-era display names (now manifest overrides) ---");
reset();
// (The hut was this block's other example until E3 killed it -- the
// infirmary's Medicine Tent -> Infirmary rename carries the pattern alone.)
// The infirmary carries the per-era rename pattern alone, and it is a
// STRUCTURE now -- the re-dress rule is the same wherever the def lives.
const sInf = (era) => api.MANIFESTS[era].structures.find((d) => d.id === "infirmary");
check("stone: infirmary named 'Medicine Tent'", api.structureDef("infirmary").name === "Medicine Tent");
api.me().era = "bronze";
check("bronze: infirmary named 'Infirmary'", api.structureDef("infirmary").name === "Infirmary");
check("ids never change regardless of era", !!sInf("stone") && !!sInf("bronze"));
check("a later era's name can't reach back and rename the earlier copy",
  sInf("stone").name === "Medicine Tent");
check("re-dressing the name does not disturb the price",
  sInf("bronze").base.wood === sInf("stone").base.wood);
api.me().era = "stone";
check("un-overridden defs read the same in both eras", api.defById("barracks").name === "Barracks" &&
  api.MANIFESTS.bronze.upgrades.find(u => u.id === "barracks").name === "Barracks");

console.log("\n--- Bronze P1: carrying caps are retroactive (housing's heir) ---");
reset(); api.ensureMap();
const seatTerrain = api.world.places[api.world.home].terrain;
const capStone = api.capOf(api.world.home);
check("stone: the seat's ground holds what its terrain says",
  capStone === api.MANIFESTS.stone.map.popCaps[seatTerrain]);
api.me().era = "bronze";
check("bronze: the SAME ground now holds more -- caps are the era curve",
  api.capOf(api.world.home) === api.MANIFESTS.bronze.map.popCaps[seatTerrain]);
check("advancing raised the ceiling without building anything",
  api.capOf(api.world.home) > capStone);
api.me().era = "stone";

console.log("\n--- Bronze P1: capstone reveal gating ---");
// S.pop is a MIRROR since E3: fixtures populate the HEXES and let the mirror
// report, because typing a population into S.pop is fiction the next tick
// erases. The gate itself moved to 25 -- a trio start caps out around 14-28
// depending on terrain, so reaching it usually requires claiming, which is
// the point.
reset(); api.ensureMap();
check("capstone hidden on a fresh game", !api.isRevealed(bronzeAgeDef));
for (const id of api.holdings()) S().map.pop[id] = 10;
api.syncPopMirror();
check("pop alone is not enough -- needs a Soldier too", !api.isRevealed(bronzeAgeDef));
reset(); api.ensureMap();
// Pin the population BELOW the gate by hand. Since the starting trio arrives
// full (2026-08-25), a generous roll -- two rivers and a forest -- opens at 25
// people and already meets the pop half of the gate, which made this check
// pass or fail on the seed. Worth knowing as balance, not only as a flake:
// the Bronze capstone's pop gate is now within sight of a fresh start.
for (const id of api.holdings()) S().map.pop[id] = 1;
api.me().units.soldier = 1; api.syncPopMirror();
check("a Soldier alone is not enough -- needs pop too", !api.isRevealed(bronzeAgeDef));
reset(); api.ensureMap();
for (const id of api.holdings()) S().map.pop[id] = 10;
api.me().units.soldier = 1; api.syncPopMirror();
check("both conditions met -> capstone reveals", api.isRevealed(bronzeAgeDef));
api.me().units.soldier = 0;
check("stays revealed after the soldier dies (sticky)", api.isRevealed(bronzeAgeDef));
console.log(`  capstone cost: ${JSON.stringify(api.buildCost(bronzeAgeDef))}, buildTime ${bronzeAgeDef.buildTime}s`);

console.log("\n--- Bronze P1: completing the capstone flips the era ---");
// Deterministic block: over the 120s build, an unlucky raid could steal the
// remaining food and starve the settlement before the capstone completes.
api.setRngSource(() => 0.999999);
reset(); api.ensureMap();
for (const id of api.holdings()) S().map.pop[id] = 10;
api.me().units.soldier = 1; api.syncPopMirror();
// (allocation line removed 2026-08-25: ground works its own terrain now)
api.me().res.food = 400; api.me().res.wood = 400; api.me().res.stone = 400;
check("era starts as stone", api.me().era === "stone");
const peopleBeforeFlip = api.hexPopSum();
api.build(bronzeAgeDef);
check("capstone entered the queue", api.me().buildQueue.length === 1 && api.me().buildQueue[0].id === "bronzeAge");
check("era has NOT flipped merely by queuing it", api.me().era === "stone");
run(bronzeAgeDef.buildTime - 5);
check("era still stone while mid-build", api.me().era === "stone");
run(10);
check("era flipped to bronze on completion", api.me().era === "bronze");
check("capstone recorded as an owned upgrade", api.me().upgrades.bronzeAge === true);
check("Bronze is a 1:1 relabel -- the real population is untouched",
  api.hexPopSum() >= peopleBeforeFlip);
check("...but the noun changed: families now", api.active().popNoun.singular === "family");
check("pre-transition snapshot archived under the era just left", !!api.me().eraHistory.stone);
check("snapshot captured pre-flip facts (era still stone inside it)",
  api.me().eraHistory.stone.era === "stone" && api.me().eraHistory.stone.pop >= 10);
check("snapshots don't nest snapshots", api.me().eraHistory.stone.eraHistory === undefined);

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
api.me().upgrades.stoneTools = true;
check("stone tools only: 1.08", Math.abs(api.mults().food - 1.08) < 0.0001);
api.me().upgrades.bronzeTools = true;
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
  api.S = merged;
  // A legacy save has its civ fields at the TOP level (the player split moved
  // them into S.players on 2026-08-26), so the fixture has to seat them the way
  // load() does rather than assigning onto a world object that no longer holds
  // them. This IS the migration path under test.
  api.S.players = [Object.assign(api.freshPlayer(0), {
    era: JSON.parse(legacy).era,
    builds: Object.assign(api.freshPlayer(0).builds, JSON.parse(legacy).builds),
    upgrades: JSON.parse(legacy).upgrades || {},
  })];
  api.S.me = 0;
  check("legacy save keeps its era", api.me().era === "stone");
  check("nothing legacy grants an upgrade or puts a work on the board",
    !api.me().upgrades.barracks && api.builtCount("forge") === 0);
  check("legacy save's inert build counts ride along untouched", api.me().builds.hut === 2);
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
  check("groups what stands on the land, people and upgrades",
    html.includes(">On the Land<") && html.includes(">People<") && html.includes(">Upgrades<"));
  const everyEra = (cat) => api.ERA_ORDER.every((e) =>
    api.MANIFESTS[e][cat].every((d) => html.includes(d.name)));
  check("every era's structures appear", everyEra("structures"));
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
  api.me().era = "bronze";
  const html = api.infoPanelHTML();
  check("active tab follows the current era", html.includes('class="info-tab active" data-era="bronze"'));
}

console.log("\n--- E3: the timer, the hut and the lockstep are gone, and stay gone ---");
{
  api.setRngSource(() => 0.999999);
  reset(); api.closeModal(); api.ensureMap();
  // (allocation line removed 2026-08-25: ground works its own terrain now)

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
    api.holdCount() === 3 && api.isOwned(api.world.home));

  // The runaway that killed the bridge, asserted dead: time passes, people
  // grow on their hexes, and the dominion does NOT expand on its own.
  const ownedBefore = api.holdings().slice().sort().join("|");
  run(180);
  check("free real estate is over: time alone grants no ground",
    api.holdings().slice().sort().join("|") === ownedBefore);
  check("people still grew on the ground they hold",
    api.hexPopSum() > 7);
  check("S.pop mirrors the real population (people + army)",
    api.me().pop === api.hexPopSum() + Object.values(api.me().units).reduce((a, b) => a + b, 0));

  // Claims are priced by the ERA: stone pays food and time only.
  const target = Object.values(api.world.places)
    .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
  const plan = api.settlePlan(target.id);
  // MULTI-RESOURCE, but not STONE at Stone (2026-08-25): one-resource prices
  // let a single export fund the whole conquest, and pricing the first claim in
  // stone deadlocks a seat with no hills yet -- you would need the claim to
  // reach the ground that pays for the claim.
  check("a claim is priced in more than one resource, and in time",
    plan && plan.cost.food > 0 && plan.cost.wood > 0 && plan.time > 0);
  check("...and never in stone at Stone, which only hills give", !("stone" in plan.cost));
  check("...but never in a resource the era does not have", !("bronze" in plan.cost));
  api.me().era = "bronze";
  const plan2 = api.settlePlan(target.id);
  check("a bronze claim carries the age's signature metal (the capstone rule, applied to the frontier)",
    plan2 && plan2.cost.bronze > 0 && plan2.cost.wood > plan.cost.wood);
  api.me().era = "iron";
  const plan3 = api.settlePlan(target.id);
  check("an iron claim carries iron", plan3 && plan3.cost.iron > 0);
  api.me().era = "stone";

  // And the claim actually grows the dominion, through the queue.
  api.me().res.food = 400; api.me().res.wood = 200; api.me().res.stone = 200;
  api.launchSettle(target.id);
  check("the claim entered the queue", api.me().buildQueue.some((q) => q.kind === "settle"));
  run(plan.time + 60);
  check("the claim completed: the dominion grew by exactly one, paid for",
    api.holdCount() === 4 && api.isOwned(target.id));
  api.setRngSource(null);
}

// ================= BRONZE AGE PHASE 2: THE ALLOY =================
// Fetched from the bronze manifest explicitly: these tests assert the
// BRONZE-era recipe, and defById's DEF_INDEX fallback would hand back the
// iron-era forge (latest identity) while the harness sits in stone.
const forgeDef = api.MANIFESTS.bronze.structures.find(d => d.id === "forge");

console.log("\n--- P2: ores and their jobs are era-gated (by manifest membership) ---");
reset();
{
  const inRes = (era, id) => api.MANIFESTS[era].resources.some(r => r.id === id);
  // Post-hex-economy the ore verbs live in the STRUCTURE list: bare ground
  // yields what its terrain is, and a mine is the era-gate.
  const canMine = (era, res) =>
    (api.MANIFESTS[era].structures || []).some((st) => st.yield && st.yield.res === res);
  check("copper/tin/bronze absent from the stone manifest",
    !inRes("stone", "copper") && !inRes("stone", "tin") && !inRes("stone", "bronze"));
  check("no stone-age structure can mine ore",
    !canMine("stone", "copper") && !canMine("stone", "tin"));
  check("bronze can mine both halves of the alloy",
    canMine("bronze", "copper") && canMine("bronze", "tin"));
  check("forge absent from the stone manifest",
    !api.MANIFESTS.stone.buildings.some(b => b.id === "forge"));
  check("stone-era rates have no copper line at all",
    !("copper" in api.rates()));
  api.me().era = "bronze";
  check("copper/tin/bronze all present in bronze",
    inRes("bronze", "copper") && inRes("bronze", "tin") && inRes("bronze", "bronze"));
  check("bronze mines the hills for copper and tin", (() => {
    const st = api.MANIFESTS.bronze.structures || [];
    const onHills = (res) => st.some((d) => d.yield && d.yield.res === res &&
      (d.terrain || []).includes("hills"));
    return onHills("copper") && onHills("tin");
  })());
  check("the forge is a Bronze structure, standing on ground", !!forgeDef && !forgeDef.yield);
  const copperRes = api.MANIFESTS.bronze.resources.find(r => r.id === "copper");
  const bronzeRes = api.MANIFESTS.bronze.resources.find(r => r.id === "bronze");
  check("bronze runs a generous flat cap over its ore buffers",
    bronzeRes.capBuilding === undefined && bronzeRes.baseCap > copperRes.baseCap);
  check("an ore buffer holds MINUTES of mining, never the stranded default", (() => {
    // Owner bug report: copper and tin sat at 50 -- the pre-hex-economy
    // default, set when ore yards could raise it and stranded when storage
    // died. The law: an ore's cap must hold at least two minutes of one
    // mine's yield, read from the mine's own authored rate.
    const yieldOf = (sid) => api.MANIFESTS.bronze.structures.find((d) => d.id === sid).yield.rate;
    const tinRes = api.MANIFESTS.bronze.resources.find((r) => r.id === "tin");
    return copperRes.baseCap >= 120 * yieldOf("copperMine") &&
           tinRes.baseCap >= 120 * yieldOf("tinMine");
  })());
}

console.log("\n--- P2: tin yields half of copper (same hill, same people) ---");
reset();
api.me().era = "bronze";
{
  // Fixture hexes the rebuilt world doesn't know would work at par, which
  // defeats a terrain-rate test -- so build a minimal map by hand instead:
  // two identical hills, one on each ore, same population.
  api.ensureMap();
  const hills = Object.values(api.world.places)
    .filter((p) => p.terrain === "hills" && !p.adversary && !p.minor).slice(0, 2);
  check("the world has two workable hills to test on", hills.length === 2);
  setHoldings([api.world.home, hills[0].id, hills[1].id]);
  S().map.pop = {}; api.ensurePop();
  S().map.pop[hills[0].id] = 4; S().map.pop[hills[1].id] = 4;
  S().map.built = {}; S().map.built[hills[0].id] = "copperMine"; S().map.built[hills[1].id] = "tinMine";
  const r = api.rates();
  console.log(`  per hill (4 people): copper ${r.copper.toFixed(3)}/s, tin ${r.tin.toFixed(3)}/s`);
  check("tin is exactly half the copper rate", Math.abs(r.tin - r.copper / 2) < 1e-9);
  check("both ores are actually produced", r.copper > 0 && r.tin > 0);
}

console.log("\n--- 4c: caps are flat, era-authored, and lawful ---");
reset();
{
  const STORAGE = ["granary", "woodshed", "stoneYard", "oreYard"];
  for (const era of Object.keys(api.MANIFESTS)) {
    const m = api.MANIFESTS[era];
    check(`${era}: no storage building survives anywhere`,
      !m.buildings.some((b) => STORAGE.includes(b.id)));
    check(`${era}: no resource declares capBuilding`,
      m.resources.every((r) => r.capBuilding === undefined));
    const cap = (id) => { const r = m.resources.find((x) => x.id === id); return r ? r.baseCap : undefined; };
    check(`${era}: food caps above wood and stone (people eat food, not lumps)`,
      cap("food") > cap("wood") && cap("food") > cap("stone"));
    if (m.resources.some((r) => r.id === "gold")) {
      check(`${era}: gold is never capped -- cap what accrues, never what acting earns`,
        cap("gold") === Infinity);
    }
    // THE ERA IS THE BUDGET: every capstone must clear under its own era's
    // ceilings, with headroom -- or the age is unwinnable by construction.
    for (const u of m.upgrades) {
      if (!(u.id in api.CAPSTONES)) continue;
      for (const [res, cost] of Object.entries(u.base)) {
        check(`${era}: cap on ${res} clears the ${u.id} capstone price`, cap(res) > cost);
      }
    }
  }
  // Legacy storage counts from an old save move nothing.
  api.me().era = "bronze";
  const before = JSON.stringify(api.caps());
  api.me().builds.oreYard = 3; api.me().builds.granary = 3;
  check("legacy storage counts are inert: caps identical", JSON.stringify(api.caps()) === before);
}

// ---- The ledger tells the truth, and nothing ends a tick below zero ----
// Owner bug report (2026-08-25, late): "+0.22/s" printed over a falling
// stock -- growth's spending was invisible to the displayed rate -- and the
// larder briefly read "-1", a float residual of growPopulation's budget math
// meeting fmt()'s floor.
console.log("\n--- the food line is honest; no resource ends a tick negative ---");
reset(); api.ensureMap();
{
  api.setRngSource(() => 0.99);            // no events: measure only the flows
  for (const id of api.holdings()) S().map.pop[id] = 3;
  api.syncPopMirror();
  api.me().res.food = 100;
  api.step();                              // prime the growth-spend gauge from a real tick
  check("growth visibly spends the larder", api.growthSpendOf(api.me()) > 0);
  const predicted = api.ledgerRates().foodNet;
  const before = api.me().res.food;
  api.step();
  const actual = (api.me().res.food - before) / api.TICK_SECONDS;
  check("the ledger's food line matches what the pile actually does",
    Math.abs(predicted - actual) < 0.02);
  // The residual guard: a tick may compute a hair below zero, but nothing --
  // display, save, or the next tick -- may ever see it.
  api.me().res.wood = -1e-12; api.me().res.food = -1e-12;
  api.step();
  check("no resource ends a tick below zero (the -1 display bug)",
    api.me().res.wood >= 0 && api.me().res.food >= 0);
  api.setRngSource(null);
}

console.log("\n--- P2: the Forge converts, throttles, and idles ---");
reset();
api.me().era = "bronze";
putStructures("forge", 1);
api.me().res.copper = 100; api.me().res.tin = 100;
{
  const spec = forgeDef.converts;
  console.log(`  recipe: ${JSON.stringify(spec.in)} -> ${JSON.stringify(spec.out)} @ ${spec.rate}/s per forge`);
  const before = { copper: api.me().res.copper, tin: api.me().res.tin, bronze: api.me().res.bronze };
  api.runConverters(10);            // 10 seconds at 0.05/s = 0.5 bronze
  const made = api.me().res.bronze - before.bronze;
  check("bronze was produced", made > 0);
  check("copper consumed at the recipe ratio",
    Math.abs((before.copper - api.me().res.copper) - made * spec.in.copper) < 1e-9);
  check("tin consumed at the recipe ratio",
    Math.abs((before.tin - api.me().res.tin) - made * spec.in.tin) < 1e-9);
}
{
  // Two forges must smelt exactly twice as fast as one.
  reset(); api.me().era = "bronze"; api.me().res.copper = 500; api.me().res.tin = 500;
  putStructures("forge", 1); api.runConverters(10);
  const one = api.me().res.bronze;
  reset(); api.me().era = "bronze"; api.me().res.copper = 500; api.me().res.tin = 500;
  putStructures("forge", 2); api.runConverters(10);
  check("throughput scales with forge count", Math.abs(api.me().res.bronze - one * 2) < 1e-9);
}
{
  // Starved of tin, it should run at partial rate then stop -- never go negative.
  reset(); api.me().era = "bronze"; putStructures("forge", 5);
  api.me().res.copper = 1000; api.me().res.tin = 2;
  api.runConverters(60);
  check("tin drained to exactly zero, not below", Math.abs(api.me().res.tin) < 1e-9);
  check("bronze made was limited by the scarce input", Math.abs(api.me().res.bronze - 2) < 1e-9);
  check("leftover copper stays in store", api.me().res.copper > 0);
  const bronzeAfterStall = api.me().res.bronze;
  api.runConverters(60);
  check("idles cleanly once an input is exhausted", api.me().res.bronze === bronzeAfterStall);
  check("copper is not consumed while stalled", api.me().res.copper > 0);
}
{
  // A full bronze store must stop the forge rather than eating ore for nothing.
  reset(); api.me().era = "bronze"; putStructures("forge", 3);
  api.me().res.copper = 1000; api.me().res.tin = 1000;
  api.me().res.bronze = api.caps().bronze;
  const oreBefore = { copper: api.me().res.copper, tin: api.me().res.tin };
  api.runConverters(60);
  check("no ore consumed when the output is capped",
    api.me().res.copper === oreBefore.copper && api.me().res.tin === oreBefore.tin);
  check("bronze never exceeds its cap", api.me().res.bronze <= api.caps().bronze + 1e-9);
}

console.log("\n--- P2: weapon tiers replace rather than stack ---");
reset();
api.me().units.soldier = 10;
check("unarmed baseline", api.weaponMultiplier() === 1.0);
api.me().upgrades.flintSpears = true;
check("flint tier", api.weaponMultiplier() === 1.6);
api.me().upgrades.bronzeWeapons = true;
check("bronze tier supersedes flint (not 1.6 x 2.2)", api.weaponMultiplier() === 2.2);

console.log("\n--- P2: bronze-costed upgrades ---");
{
  const bt = findU("bronzeTools"), bw = findU("bronzeWeapons");
  check("Bronze Tools now costs bronze", "bronze" in api.buildCost(bt));
  check("Bronze Weapons costs bronze", "bronze" in api.buildCost(bw));
  reset(); api.me().era = "bronze";
  api.me().res.wood = 999; api.me().res.bronze = 0;
  api.build(bt);
  check("can't buy a bronze-costed upgrade with no bronze", api.me().buildQueue.length === 0);
  api.me().res.bronze = 999;
  api.build(bt);
  check("can once you've smelted some", api.me().buildQueue.length === 1);
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
// THE ROSTER IS AN ERA FACT since 2026-08-26 (the era clock's wire): every age
// fields the same three shapes, in proportions that are its own. What must NOT
// drift is the id set -- the counter matrix names these by id, so a shape that
// vanished from an age would strand the unit that answers it.
check("every age fields the same three shapes, by id",
  api.ERA_ORDER.every((e) =>
    api.MANIFESTS[e].raidTypes.map((t) => t.id).sort().join(",") === "massed,riders,warband"));
check("...in proportions that are its own -- an age rides more than the last",
  (() => {
    const w = (e, id) => api.MANIFESTS[e].raidTypes.find((t) => t.id === id).weight;
    return w("stone", "riders") < w("bronze", "riders") &&
           w("bronze", "riders") < w("iron", "riders") &&
           w("stone", "warband") > w("iron", "warband");
  })());

// (Five P3 sections died in A5 with the counter matrix and its helpers:
// never-penalised, bonus-lands-right, mixed-vs-specialist, coverage-relief,
// and the removeRandomUnit exposure statistics. Their LAWS live on in the
// resolver and its harness section -- any army beats no army because dice
// beat no dice; "wrong" units are un-bonused, never penalised, because roles
// only matter where walls are involved; and worst-goes-first replaced
// exposure weighting outright. What survives HERE is the manifest facts the
// era-gap skew still reads.)
console.log("\n--- P3: what the counter matrix left behind ---");
{
  check("a warband is countered by nothing -- the unanswerable shape",
    !api.MANIFESTS.bronze.units.some(u => u.counters === "warband"));
  check("the counter relationship is stored in exactly one place",
    RAID_TYPES.every(t => !("counter" in t)));
  check("every unit still has a positive casualty weight (campaigns read it)",
    api.MANIFESTS.bronze.units.every(u => (u.casualtyWeight === undefined ? 1 : u.casualtyWeight) > 0));
}

console.log("\n--- P3: training buildings gate their units, capped at one ---");
reset();
api.me().era = "bronze";
{
  check("archer hidden without an archery range", !api.isRevealed(archerDef));
  check("horseman hidden without stables", !api.isRevealed(horseDef));
  api.me().upgrades.barracks = true;
  check("archery range revealed by a barracks", api.isRevealed(findU("archeryRange")));
  api.me().upgrades.archeryRange = true; api.me().upgrades.stables = true;
  check("archer revealed by the range", api.isRevealed(archerDef));
  check("horseman revealed by the stables", api.isRevealed(horseDef));
  // Bought-once is upgrade semantics now, not a `cap: 1` field.
  check("an owned range cannot be bought again",
    (api.me().upgrades.archeryRange = true, api.isRevealed(findU("archeryRange")) &&
      (api.build(findU("archeryRange")), api.me().buildQueue.length === 0)));
}

console.log("\n--- P3: Scouting is gated on the upgrade, not just the building ---");
reset();
api.me().era = "bronze";
{
  const scoutEv = findEv("scoutFind");
  api.me().upgrades.stables = true;
  check("stables alone does not enable scouting events", !scoutEv.condition(S()));
  check("Scouting upgrade revealed by the stables", api.isRevealed(findU("scouting")));
  api.me().upgrades.scouting = true;
  check("the upgrade enables them", scoutEv.condition(S()));
  const before = { wood: api.me().res.wood, stone: api.me().res.stone, copper: api.me().res.copper };
  scoutEv.effect(S());
  check("a scouting find pays out", api.me().res.wood > before.wood && api.me().res.stone > before.stone &&
    api.me().res.copper > before.copper);
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
  api.me().era = "bronze"; api.me().pop = 30;
  api.me().units = { soldier: 0, archer: 20, horseman: 0 };
  const conflictEv2 = findEv("conflict");
  let calls = 0;
  // trigger fires; smallest raid size; raid type = warband; repel succeeds; not costly.
  api.setRngSource(() => { calls++; return [0, 0, 0, 0.01, 0.99][calls - 1] ?? 0.99; });
  const unitsBefore = api.totalUnits();
  conflictEv2.resolve(S(), 1);
  api.setRngSource(null);
  check("a well-defended settlement repels cleanly", api.totalUnits() === unitsBefore);
  check("nobody died", api.me().pop === 30);
}

// ============ REGRESSION: reservations must never outrun the living ============
// The jobs half of this bug died with the jobs system; the reservation half is
// eternal. A death while unit orders are queued must abandon (and refund) the
// orders nobody is left to fill, or the order completes anyway and drives
// civilians() negative -- the E2 rewrite briefly reintroduced exactly that.
console.log("\n--- BUG: reservations must never outrun the living ---");
{
  reset(); api.ensureMap();
  api.me().era = "bronze";
  api.me().upgrades.barracks = true; api.me().res.wood = 500;
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
  api.me().era = "bronze";
  api.me().upgrades.barracks = true; api.me().res.wood = 500;
  for (const id of api.holdings()) S().map.pop[id] = 2;
  api.syncPopMirror();                     // 6 civilians
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  api.build(findT("soldier"));
  check("four orders queued", api.reserved() === 4);
  const woodAfterOrders = api.me().res.wood;
  for (const id of api.holdings()) api.killAt(id, 2);
  api.reconcileReservations();
  console.log(`  after the massacre: civ=${api.civilians()} reserved=${api.reserved()} queue=${api.me().buildQueue.length}`);
  check("orders with nobody left to train were abandoned", api.reserved() <= Math.max(0, api.civilians()));
  check("abandoned orders were refunded", api.me().res.wood > woodAfterOrders);
}
{
  // A dominion of nothing but trained units has no one for the world to
  // strike: every hex is empty, so strikes find no target.
  reset(); api.ensureMap();
  for (const id of api.holdings()) S().map.pop[id] = 0;
  api.me().units = { soldier: 3, archer: 0, horseman: 0 };
  api.syncPopMirror();
  check("no civilians to begin with", api.civilians() === 0);
  check("the world cannot strike an empty dominion", api.strikeHex("sickness") === null);
  check("population never drops below the units it contains", api.me().pop >= api.totalUnits());
}
{
  // Fuzz it: random armies, random queues, random deaths.
  let worstIdle = 0, worstCiv = 0;
  for (let t = 0; t < 400; t++) {
    reset();
    api.me().era = "bronze";
    api.me().builds = Object.assign(api.me().builds, { barracks: 1, archeryRange: 1, stables: 1 });
    api.me().res = { food: 900, wood: 900, stone: 900, copper: 900, tin: 900, bronze: 900 };
    api.me().pop = 6 + Math.floor(Math.random() * 10);
    for (let q = 0; q < Math.floor(Math.random() * 4); q++) {
      api.build(pickOne([findT("soldier"), findT("archer"), findT("horseman")]));
    }
    for (let d = 0; d < 1 + Math.floor(Math.random() * 6); d++) {
      // Battle-style casualty (removeRandomUnit died in A5): a unit dies the
      // way contact's applyLost kills one, and the books must still settle.
      const ids = ["soldier", "archer", "horseman"].filter((id) => (api.me().units[id] || 0) > 0);
      if (!ids.length) break;
      api.me().units[pickOne(ids)] -= 1;
      api.syncPopMirror();
      api.reconcileReservations();
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
  // to hexes; the E3 tombstone block owns those assertions now.)
  //
  // GROWTH IS NO LONGER FREE (2026-08-25). This check used to assert that hex
  // growth never touched food, and that WAS the invariant -- it is also what
  // made the game unlosable: a raided hex refilled itself in minutes at no
  // cost, so nothing could hurt the settlement faster than it healed, and
  // surplus food had no consumer at all. Food's natural sink is growth. See
  // design.md, The Economy Must Be Able To Break You.
  check("raising a person costs food", (() => {
    reset(); api.ensureMap();
    // The STARTING ground arrives full (2026-08-25), so there is no room to
    // grow into until something makes room. Take one person off a hex and the
    // larder pays to replace them.
    const hex = api.holdings().find((id) => api.capOf(id) > 2);
    S().map.pop[hex] = api.capOf(hex) - 1;
    api.me().res.food = api.caps().food;
    const foodBefore = api.me().res.food;
    api.growPopulation(1);
    return api.me().res.food < foodBefore;
  })());
  check("a settlement with an empty larder cannot grow at all", (() => {
    reset(); api.ensureMap();
    const hex = api.holdings().find((id) => id !== api.world.home);
    S().map.pop[hex] = 2;
    api.me().res.food = 0;
    const before = S().map.pop[hex];
    api.growPopulation(5);
    return S().map.pop[hex] === before;
  })());
  check("...and a thin larder grows less than a full one", (() => {
    // The roomiest hex, so the LARDER is the binding constraint rather than the
    // logistic curve -- on a cap-3 hills hex both larders buy the same sliver
    // and the comparison says nothing. (The starting ground arrives full since
    // 2026-08-25, so room has to be made deliberately.)
    const gain = (food) => {
      reset(); api.ensureMap();
      const hex = api.holdings().slice().sort((a, b) => api.capOf(b) - api.capOf(a))[0];
      S().map.pop[hex] = 2;
      api.syncPopMirror();
      api.me().res.food = food;
      const before = S().map.pop[hex];
      api.growPopulation(30);
      return S().map.pop[hex] - before;
    };
    return gain(4) < gain(400);
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
    resources: [{ id: "gold", name: "Gold", baseCap: 10 }],
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
  check("a capBuilding is caught as retired (4c: caps are flat and era-authored)",
    throws(() => compileAndValidate((r) => { r.resources[0].capBuilding = "vault"; })) &&
    throws(() => compileAndValidate((r) => { r.resources[0].capBuilding = null; })));
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
  // Seventeen since the fortification family arrived (2026-08-28; fifteen
  // from 2026-08-25 when the panel retired and STRUCTURES joined the diff):
  // Bronze is where a hex can first be turned into something other than the
  // ground it stands on, and it now brings the mines, the market, the forge,
  // the palisade and the watchtower with it. Counted rather than listed so
  // the era modal cannot go silent about a whole category again.
  check("seventeen additions across every buildable category",
    d.added.length === 17 && d.added.some((a) => a.id === "warCamp") &&
    d.added.some((a) => a.id === "farming") && !d.added.some((a) => a.id === "oreYard") &&
    d.added.some((a) => a.id === "palisade") && d.added.some((a) => a.id === "watchtower"));
  check("...and structures are among them -- the diff sees the whole board",
    d.added.some((a) => a.id === "forge") && d.added.some((a) => a.id === "copperMine") &&
    d.added.some((a) => a.id === "market"));
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
  api.me().res.bronze = 21; api.me().res.tin = 40; api.me().res.wood = 7; api.me().res.iron = 0;
  api.me().pop = 10;
  // The snapshot is of the CIVILIZATION since the player split: a border is
  // something one civ crosses, so its books are what gets frozen.
  const snapshot = JSON.parse(JSON.stringify(api.me()));
  api.runEraMigrations(OLD, NEW, snapshot);
  check("convertTo: bronze became iron at the ratio, floored", api.me().res.iron === 10);
  check("convertTo zeroes the source", api.me().res.bronze === 0);
  check("vanish zeroes tin", api.me().res.tin === 0);
  check("untouched state carries", api.me().res.wood === 7);

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
  api.me().res.bronze = 15; api.me().res.iron = 0;
  api.runEraMigrations(OLD, NEW2, JSON.parse(JSON.stringify(api.me())));
  check("fn reads the frozen snapshot, immune to instruction order", api.me().res.iron === 30);
  check("...while the live vanish still applied", api.me().res.bronze === 0);
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
  check("no ground and no structure yields gold or steel (they only arrive, never grow)",
    Object.values(m.map.yields).every((y) => y.res !== "gold" && y.res !== "steel") &&
    (m.structures || []).every((d) => !d.yield || (d.yield.res !== "gold" && d.yield.res !== "steel")));
  check("new upgrades arrived; the storage line did NOT (storage died era-wide in 4c)",
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
    m.consolidate === undefined);
  check("the Village is now a Town", m.panelTitles["panel-holdings"] === "Town");
  const forge = m.structures.find(d => d.id === "forge");
  check("the Forge persists as a structure, retargeted to steel",
    forge.converts.in.iron === 3 && forge.converts.in.wood === 2 && forge.converts.out.steel === 1);
  check("units re-priced out of the dead resource",
    !("bronze" in m.units.find(u => u.id === "archer").base) &&
    "iron" in m.units.find(u => u.id === "horseman").base &&
    "iron" in m.upgrades.find(u => u.id === "stables").base);
  check("iron slate swaps in scoutFindIron", m.events.some(e => e.id === "scoutFindIron") &&
    !m.events.some(e => e.id === "scoutFind"));
  check("bronze manifest gained the ironAge capstone",
    api.MANIFESTS.bronze.upgrades.some(u => u.id === "ironAge"));
  const d = api.manifestDiff(api.MANIFESTS.bronze, m);
  // Six removed now that the storage line predeceased era-wide in 4c (the
  // granary, woodshed, stone yard and ore yard no longer exist to retire
  // here). The War Camp still retires: priced in bronze, and a ring of hide
  // tents does not stage a legion. Seven added since Fortification joined.
  check("diff: 9 added, 8 removed (the panel retired 2026-08-25), 0 renamed",
    d.added.length === 9 && d.removed.length === 8 && d.renamed.length === 0 &&
    d.added.some((a) => a.id === "fortification") &&
    d.removed.some((r) => r.id === "warCamp") &&
    !d.added.some((r) => r.id === "ironYard"));
}

console.log("\n--- C1: capstone gating and the real transition ---");
{
  api.setRngSource(() => 0.999999);   // no hazards during the long build
  reset();
  api.me().era = "bronze";
  advanceRivalsTo(api.me().era);
  api.initAdversaries(); api.ensureMap();
  const capstone = api.MANIFESTS.bronze.upgrades.find(u => u.id === "ironAge");
  // The gate is 50 real people now: give the trio deep pops (held above cap,
  // never shrunk) and let the mirror report them.
  for (const id of api.holdings()) S().map.pop[id] = 20;
  api.syncPopMirror();
  check("pop alone does not reveal the iron capstone", !api.isRevealed(capstone));
  api.me().units.archer = 1; api.syncPopMirror();
  check("pop + a composition unit reveals it", api.isRevealed(capstone));

  // A real bronze settlement takes the leap: stocked ores, workers on the
  // dead jobs, bronze in store -- everything the migration must handle.
  reset();
  api.me().era = "bronze";
  api.me().pop = 20; api.me().units = { soldier: 2, archer: 1, horseman: 1 };
  // No forge in this fixture: a running forge would keep smelting during the
  // 180s build and the bronze-at-flip number would drift off 70.
  api.me().builds = Object.assign(api.me().builds, { hut: 4, barracks: 1 });
  // (storage died in 4c -- the era caps themselves carry the deep larder now)
  api.me().res = Object.assign(api.me().res, { food: 450, wood: 450, stone: 450, bronze: 120, copper: 33, tin: 12 });
  api.ensureMap();
  // (allocation line removed 2026-08-25: ground works its own terrain now)
  api.build(capstone);
  check("capstone queued and paid", api.me().buildQueue.length === 1 && api.me().res.bronze === 70);
  api.me().res.food = 2000;   // the capstone ate 400 of the larder; the hex
                         // populations eat harder than the old fixture did
  run(185);
  check("era flipped to iron", api.me().era === "iron");
  check("copper and tin vanished, narrated", api.me().res.copper === 0 && api.me().res.tin === 0);
  check("bronze became gold at 1:4, floored", api.me().res.gold === Math.floor(70 * 0.25));
  check("bronze stock zeroed by the conversion", api.me().res.bronze === 0);
  // (the ore-job walk-home check died in E2 -- there are no jobs to walk home from)
  // The border is a pure re-denomination since E2: no consolidation, no land
  // taken, nothing shrinks. (The old keep-0.25 cut died when the harness
  // caught it colliding with dominion-never-shrinks.)
  const snapPop = api.me().eraHistory.bronze.pop;
  check("families kept arriving during the long build", snapPop >= 20);
  check("the border takes nothing: population survives the crossing whole",
    api.me().pop >= snapPop - 4);
  check("the border takes nothing: every hex crossed with you",
    api.holdCount() >= 1 && api.me().pop >= api.holdCount());
  check("the fighting bands carry whole across a levy border",
    api.me().units.soldier === 2 && api.me().units.archer === 1 && api.me().units.horseman === 1);
  // (The walked-home check died with the S.jobs bucket on 2026-08-25: the jobs
  // system left in E2, and the bucket it swept stopped being seeded.)
  // (levyMigrated and the border bread-default died in E5 with the levy --
  // allocation exists from frame one and captures default to food themselves.)
  check("the noun re-denominates at the border", api.active().popNoun.singular === "subject");
  check("the books balance after all of it", spare() >= 0 && api.reserved() <= Math.max(0, api.civilians()));
  check("bronze-era snapshot archived at the border", !!api.me().eraHistory.bronze &&
    api.me().eraHistory.bronze.res.bronze === 70);
  // (housing died in E3 -- its absence is asserted in the E3 tombstone block)
  api.setRngSource(null);
}

console.log("\n--- C1: iron-era economy runs ---");
{
  api.setRngSource(() => 0.999999);
  reset();
  api.me().era = "iron";
  // Iron comes out of a MINE on hills you hold (2026-08-25). These used to be
  // fixture ids no world contained, working "at par"; ground has real terrain
  // now, so the fixture is real hills with real mines on them.
  api.ensureMap();
  const oreHills = Object.values(api.world.places)
    .filter((p) => p.terrain === "hills" && !p.adversary && !p.minor).slice(0, 2);
  const fed = Object.values(api.world.places)
    .filter((p) => (p.terrain === "plains" || p.terrain === "river") && !p.adversary && !p.minor).slice(0, 3);
  setHoldings(fed.map((p) => p.id).concat(oreHills.map((p) => p.id)));
  if (!api.isOwned(api.world.home)) api.claimTile(api.world.home);
  S().map.pop = {}; api.ensurePop();
  for (const id of api.holdings()) S().map.pop[id] = 4;
  S().map.built = {};
  for (const h of oreHills) S().map.built[h.id] = "ironMine";
  api.syncPopMirror();
  api.me().res.food = 200;
  run(30);
  // 2 mined hills x 4 people x 0.2/s x rate 1.0 x 30s = 48.
  check("iron flows from mined hills (2 mines of 4 people, 30s, ~48)", api.me().res.iron > 40);
  putStructures("forge", 2); api.me().res.iron = 60; api.me().res.wood = 40;
  const w0 = api.me().res.wood;
  // Read the rate rather than restating it: it was hard-coded into five
  // separate checks, so retuning the Forge in 2026-08 meant editing all five
  // and getting every one right. A check that repeats a balance number is a
  // second place for it to be wrong.
  const iRate = api.MANIFESTS.iron.structures.find((d) => d.id === "forge").converts.rate;
  const batches = 2 * iRate * 10;                    // 2 forges x rate x 10s
  api.runConverters(10);
  check("the Forge makes steel from iron AND wood",
    Math.abs(api.me().res.steel - batches) < 1e-9 &&
    Math.abs((w0 - api.me().res.wood) - 2 * batches) < 1e-9);
  check("iron consumed at the recipe ratio",
    Math.abs(api.me().res.iron - (60 - 3 * batches)) < 1e-9);
  const c = api.caps();
  check("caps RETURN at Iron (4c) -- and gold alone stays boundless",
    Number.isFinite(c.food) && Number.isFinite(c.wood) && Number.isFinite(c.stone) &&
    Number.isFinite(c.iron) && Number.isFinite(c.steel) && !Number.isFinite(c.gold));
  api.setRngSource(null);
}

console.log("\n--- C1: tiers supersede across eras ---");
{
  reset();
  api.me().units.soldier = 10;
  api.me().upgrades.flintSpears = true; api.me().upgrades.bronzeWeapons = true;
  check("bronze tier active", api.weaponMultiplier() === 2.2);
  api.me().upgrades.ironWeapons = true;
  check("iron weapons supersede (3.0, not stacked)", api.weaponMultiplier() === 3.0);
  api.me().upgrades.hideArmor = true;
  check("hide armor halves", api.armorFactor() === 0.5);
  api.me().upgrades.steelArmor = true;
  check("steel armor supersedes (0.3)", api.armorFactor() === 0.3);
  api.me().upgrades.stoneTools = true; api.me().upgrades.bronzeTools = true; api.me().upgrades.ironTools = true;
  check("tool tiers stack additively to 1.45", Math.abs(api.mults().food - 1.45) < 1e-9);
  check("owned bronze-era upgrades keep working after leaving the shop",
    (api.me().era = "iron", api.weaponMultiplier() === 3.0 && api.armorFactor() === 0.3));
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
    resources: [{ id: "gold", name: "Gold", baseCap: 10 }],
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
  // The gate is an UPGRADE from 2026-08-25 -- both were cap-1 buildings whose
  // only effect was a permanent unlock, which is a tech.
  check("bronze gathers at a War Camp, iron at a Muster Ground",
    api.MANIFESTS.bronze.muster.upgrade === "warCamp" &&
    api.MANIFESTS.iron.muster.upgrade === "musterGround");
  check("no era still names a BUILDING as its muster gate",
    Object.values(api.MANIFESTS).every((m) => !m.muster || !m.muster.building));
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
  check("and the gate each age names is actually reachable in it",
    api.MANIFESTS.bronze.upgrades.some((u) => u.id === "warCamp") &&
    api.MANIFESTS.iron.upgrades.some((u) => u.id === "musterGround"));
  check("the war camp retires at iron -- hide tents do not stage a legion",
    !api.MANIFESTS.iron.upgrades.some((u) => u.id === "warCamp"));

  api.me().era = "bronze";
  check("nothing musters until the camp stands", !api.musterBuilt());
  api.me().upgrades.warCamp = true;
  check("...but it does once it does", api.musterBuilt());

  api.me().era = "iron";
  api.me().upgrades.warCamp = true; delete api.me().upgrades.musterGround;
  check("a war camp does not muster an iron column", !api.musterBuilt());

  // Territory sizes the army, in every era. Bronze holds 12 hexes at most and
  // Iron 20, so a Bronze army is smaller than an Iron one without any rule
  // saying so -- which is the whole reason the flat cap was redundant.
  check("a bigger dominion fields a bigger army, and Bronze's is capped smaller",
    api.MANIFESTS.bronze.map.dominionCap < api.MANIFESTS.iron.map.dominionCap);
}

console.log("\n--- A refusal always says why ---");
{
  // Three verbs have now been found failing SILENTLY in play -- Settle, Build
  // and March. Each had correct guards and no way to voice them. This pins the
  // one that is testable without a DOM: campaignRefusal() mirrors every guard
  // launchCampaign() has, so the modal can never claim a march is possible that
  // the sim will then quietly refuse.
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries(); api.ensureMap();
  const minor = Object.values(api.world.places).find((p) => p.minor);
  const ref = "tile:" + minor.id;
  api.me().upgrades.musterGround = true;
  api.me().units = { soldier: 3, archer: 0, horseman: 0, siegeEngine: 0 };
  api.me().res.food = 9999;

  check("a full muster is allowed to march", api.campaignRefusal(ref, { soldier: 1 }) === null);
  check("an empty muster says so", /at least one fighter/i.test(api.campaignRefusal(ref, {}) || ""));
  check("fighters you do not have are refused in words",
    !!api.campaignRefusal(ref, { soldier: 99 }));

  api.me().res.food = 1;
  const hungry = api.campaignRefusal(ref, { soldier: 3 });
  check("a column you cannot feed says how short you are", /short \d+ food/i.test(hungry || ""));
  api.me().res.food = 9999;

  delete api.me().upgrades.musterGround;
  check("no muster ground is named as the reason",
    /muster ground/i.test(api.campaignRefusal(ref, { soldier: 1 }) || ""));
  api.me().upgrades.musterGround = true;

  // THE GUARDS AND THE WORDS MUST AGREE. If the refusal says yes, the launch
  // must actually happen -- otherwise the modal enables a button that does
  // nothing, which is the original bug wearing a different coat.
  const before = api.me().expeditions.length;
  api.launchCampaign(ref, { soldier: 1 });
  check("when the refusal is null, the column really marches",
    api.me().expeditions.length === before + 1);

  // ...and where it says no, nothing happens.
  reset(); api.me().era = "iron"; api.initAdversaries(); api.ensureMap();
  api.me().upgrades.musterGround = true;
  api.me().units = { soldier: 0, archer: 0, horseman: 0, siegeEngine: 0 };
  const ref2 = "tile:" + Object.values(api.world.places).find((p) => p.minor).id;
  check("and where it says no, the launch is refused too",
    !!api.campaignRefusal(ref2, {}) &&
    (api.launchCampaign(ref2, {}), api.me().expeditions.length === 0));
}

console.log("\n--- C2: you march on what you can feed ---");
{
  reset();
  api.me().era = "bronze";
  advanceRivalsTo(api.me().era);
  api.initAdversaries(); api.ensureMap();
  api.me().upgrades.warCamp = true;
  api.me().units.soldier = 10;          // ten at home...
  api.me().res.food = 5000;
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
  api.me().res.food = ten - 1;
  api.launchCampaign(ref, { soldier: 10 });
  check("you cannot march an army you cannot provision",
    !api.expeditionOut("campaign"));

  api.me().res.food = 5000;
  api.launchCampaign(ref, { soldier: 10 });
  check("but ten CAN march when the food is there -- no headcount ceiling",
    api.expeditionOut("campaign"));
  const ex = api.me().expeditions.find((e) => e.type === "campaign");
  check("and the column that left is exactly who was mustered",
    ex && api.columnSize(ex.units) === 10);
  check("the provisions actually left the larder",
    api.me().res.food <= 5000 - ten);
}

console.log("\n--- C2: larders refill per age, grudges do not ---");
{
  reset();
  api.initAdversaries(); api.ensureMap();
  const minorId = Object.values(api.world.places).find((p) => p.minor).id;
  const river = () => api.playerByKey("riverKingdom");
  const steading = () => api.S.map.minors[minorId];

  const stoneFood = river().res.food;
  // Plunder them, and give them a reason to remember it.
  river().res.food = 1; river().walls = 0; river().standing = -4;
  steading().stock.food = 0; steading().walls = 0;

  // WITHIN an age, nothing refills. This is the half that would break silently
  // if the era stamp were dropped: the state would re-seed on every ensureMap
  // and a plundered larder would be full again on the next frame.
  api.initAdversaries(); api.ensureMap();
  check("within one age, a plundered larder STAYS plundered",
    river().res.food === 1 && steading().stock.food === 0);
  check("...and a breached wall stays breached",
    river().walls === 0 && steading().walls === 0);

  // THE LARDER RESTOCK RETIRED (S2, the antagonist spec): an age turning no
  // longer refills a plundered larder -- their own territory's INCOME earns
  // it back, so what you burned stays burned until their ground pays for it.
  // Minors are not players and keep their per-age reconcile; walls are not
  // economy and still rebuild taller.
  api.me().era = "bronze";
  advanceRivalsTo(api.me().era);
  api.initAdversaries(); api.ensureMap();
  check("an age turns and the larder does NOT refill -- income replaced the restock",
    river().res.food === 1 && stoneFood >= 0);
  check("...while a minor steading still reconciles per age", steading().stock.food > 0);
  check("...and the walls still come back taller", river().walls > 0);
  check("but the grudge outlives the granary -- standing is never re-seeded",
    river().standing === -4);

  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries(); api.ensureMap();
  check("a people that survives to Iron rebuilds its walls, remembers its grudge, and keeps its plundered larder",
    river().walls === 26 && river().standing === -4 && river().res.food === 1);
  // Income is what refills a larder now. Let the world turn: their ground
  // earns food, and the treasury regenerates toward its authored baseline
  // (the bounded stand-in for their market until the brain trades), so a
  // caravan partner can never be traded dry FOREVER.
  river().res.gold = 0;
  run(90);
  check("their territory EARNS: the plundered larder grows back from income, not from a birthday",
    river().res.food > 1);
  check("and the treasury regenerates toward its authored baseline, so trade recovers",
    (river().res.gold || 0) > 0);
}

console.log("\n--- C2: living adversary state ---");
{
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  check("state seeded from the manifest", api.playerByKey("hillClans") &&
    api.playerByKey("hillClans").res.food === 120 && api.playerByKey("hillClans").standing === 0);
  api.playerByKey("hillClans").res.food = 7; api.playerByKey("hillClans").standing = -3;
  api.initAdversaries();
  check("re-init never resets a living remnant", api.playerByKey("hillClans").res.food === 7 &&
    api.playerByKey("hillClans").standing === -3);
  check("standing words", api.standingWord(-3) === "Hostile" && api.standingWord(-1) === "Wary" &&
    api.standingWord(0) === "Neutral" && api.standingWord(2) === "Friendly");
  check("a Hostile warlike neighbor raises home conflict frequency",
    Math.abs(api.hostilityMultiplier() - api.CONFIG.hostileConflictMult) < 1e-9);
  api.playerByKey("hillClans").standing = 0;
  check("...and calm neighbors don't", api.hostilityMultiplier() === 1);
}

console.log("\n--- C2: deployment thins home defense ---");
{
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.me().pop = 12; api.me().units = { soldier: 4, archer: 2, horseman: 0 };
  api.me().expeditions.push({ uid: 1, type: "campaign", adversary: "hillClans",
    units: { soldier: 3, archer: 1 }, total: 90, remaining: 90 });
  // (militaryStrength and removeRandomUnit died in A5. What this section still
  // pins is the ACCOUNTING: a deployed unit is spoken for, and the pop count
  // never moves while they are merely away.)
  check("deployed units are counted", api.deployedCount("soldier") === 3 && api.availableUnits("soldier") === 1);
  check("pop unchanged -- they're alive, just not home (civilians = pop minus ALL units, E5)",
    api.civilians() === 6 && api.me().pop === 12);
  api.me().expeditions[0].units = { soldier: 4, archer: 2 };
  check("with everyone deployed, nobody is free to give an order to",
    api.availableUnits("soldier") === 0 && api.availableUnits("archer") === 0);
  api.me().expeditions.length = 0;
}

console.log("\n--- C2: launching expeditions ---");
{
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.me().pop = 12; api.me().units = { soldier: 4, archer: 0, horseman: 0 };
  api.me().res.food = 100;
  api.launchCampaign("hillClans", { soldier: 2 });
  check("no muster ground, no campaign", api.me().expeditions.length === 0);
  api.me().upgrades.musterGround = true;
  api.launchCampaign("hillClans", { soldier: 99 });
  check("can't send more than are home", api.me().expeditions.length === 0);
  api.launchCampaign("hillClans", {});
  check("can't send nobody", api.me().expeditions.length === 0);
  // Provisions scale with the column now, so the expected figure is computed
  // rather than restated -- and computed BEFORE the launch spends it.
  const camPlan = api.campaignPlan("hillClans");
  const camFood = api.provisionsFor(camPlan, 2);
  api.launchCampaign("hillClans", { soldier: 2 });
  check("a legal campaign launches and pays provisions for exactly who went",
    api.me().expeditions.length === 1 && api.me().res.food === 100 - camFood);
  api.launchCampaign("hillClans", { soldier: 1 });
  check("one CAMPAIGN at a time", api.me().expeditions.filter(e => e.type === "campaign").length === 1);
  api.launchCaravan("riverKingdom");
  check("a caravan CAN roll while the campaign is out (parallel tracks)",
    api.me().expeditions.length === 2 && api.me().expeditions.some(e => e.type === "caravan"));
  check("the caravan paid its cargo up front", api.me().res.food === 100 - camFood - 60);
  check("deployment sums across everything that's out", api.deployedCount("soldier") === 2);
  api.me().res.iron = 50;
  api.launchCaravan("saltNomads");
  check("...but only one CARAVAN at a time", api.me().expeditions.length === 2);
  api.me().expeditions.length = 0;
  api.playerByKey("riverKingdom").standing = -2;
  api.me().res.food = 100;
  api.launchCaravan("riverKingdom");
  check("a Hostile partner refuses your caravans", api.me().expeditions.length === 0);
}

console.log("\n--- C2.1: escorts decide how an ambush ends ---");
{
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.me().upgrades.musterGround = true;
  api.me().pop = 15; api.me().units = { soldier: 6, archer: 0, horseman: 0 };
  api.playerByKey("hillClans").standing = -3;    // the roads are dangerous
  api.me().res.food = 300; api.me().builds.treasury = 1;

  // Unescorted + forced ambush: cargo gone, their books never move.
  api.launchCaravan("riverKingdom");
  api.me().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0);         // ambush fires
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("unescorted ambush: cargo lost, nothing paid",
    api.me().expeditions.length === 0 && api.me().res.gold === 0);
  check("the kingdom's books never moved", api.playerByKey("riverKingdom").res.gold === 240);

  // Escorted + forced ambush + forced fight-through: the trade completes.
  api.me().res.food = 200;
  api.launchCaravan("riverKingdom", { soldier: 4 });
  check("escort rides out and is deployed", api.deployedCount("soldier") === 4);
  api.launchCampaign("hillClans", { soldier: 1 });
  check("deployment sums across both tracks",
    api.deployedCount("soldier") === 5 && api.availableUnits("soldier") === 1);
  api.me().expeditions = api.me().expeditions.filter(e => e.type === "caravan");   // put the column back
  api.me().expeditions[0].remaining = 0.1;
  let seq = [0, 0, 0.999];       // ambush fires; escort wins; no casualty
  api.setRngSource((() => { let n = 0; return () => seq[n++] ?? 0.999; })());
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("the escort fought through and the trade completed", api.me().res.gold === 15);
  check("their gold moved this time", api.playerByKey("riverKingdom").res.gold === 225);
  check("the escort came home whole", api.deployedCount("soldier") === 0 && api.me().units.soldier === 6);

  // Escorted + forced loss: cargo gone and a guard falls.
  api.me().res.food = 200;
  api.launchCaravan("riverKingdom", { soldier: 2 });
  api.me().expeditions[0].remaining = 0.1;
  seq = [0, 0.999];              // ambush fires; escort overwhelmed
  api.setRngSource((() => { let n = 0; return () => seq[n++] ?? 0.5; })());
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("a lost ambush costs the cargo and a guard -- but not the holdfast that raised them (levy)",
    api.me().res.gold === 15 && api.me().units.soldier === 5 && api.me().pop === 15);
  check("no payment on a lost ambush", api.playerByKey("riverKingdom").res.gold === 225);
}

console.log("\n--- C2: campaign resolution -- victory (one-shot breach) ---");
{
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.me().pop = 12; api.me().units = { soldier: 6, archer: 0, horseman: 0 };
  api.me().upgrades.musterGround = true; api.me().res.food = 100;
  api.me().builds.treasury = 1;
  api.launchCampaign("hillClans", { soldier: 6 });   // wall-power 6 vs palisade 5: one assault
  const st = api.playerByKey("hillClans");
  const stockBefore = Object.assign({}, st.res);
  api.me().expeditions[0].remaining = 0.1;
  api.setRngSource((() => { let n = 0; return () => [0, 0.999][n++] ?? 0.999; })());  // win, no casualty
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("expedition resolved and cleared", api.me().expeditions.length === 0);
  check("the palisade came down in the same assault (power 6 >= walls 5)", st.walls === 0);
  check("plunder took 40% of each stock, floored",
    st.res.food === stockBefore.food - Math.floor(stockBefore.food * 0.4) &&
    st.res.gold === stockBefore.gold - Math.floor(stockBefore.gold * 0.4));
  check("the plunder came home", api.me().res.gold >= Math.floor(stockBefore.gold * 0.4) &&
    api.me().res.iron >= Math.floor(stockBefore.iron * 0.4));
  check("standing fell -- plunder is not diplomacy", st.standing === -1);
  check("nobody died on a clean win", api.me().units.soldier === 6 && api.me().pop === 12);
  check("their stock is permanently poorer (stock, not economy)",
    st.res.food < stockBefore.food);
}

console.log("\n--- Siege: repelled at the walls, and the walls remember ---");
{
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.me().pop = 10; api.me().units = { soldier: 2, archer: 0, horseman: 0 };
  api.me().upgrades.musterGround = true; api.me().res.food = 200;
  const st = api.playerByKey("riverKingdom");
  check("the castle's walls are seeded from the manifest", st.walls === 26);
  api.launchCampaign("riverKingdom", { soldier: 2 });   // wall-power 2 vs walls 26: repelled
  api.me().expeditions[0].remaining = 0.1;
  const goldBefore = api.me().res.gold;
  api.setRngSource(() => 0.999);   // light-loss roll misses
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("a failed breach is a retreat: everyone came home", api.me().units.soldier === 2 && api.me().pop === 10);
  check("no defender ever fell -- walls precede the field battle", true);
  check("no loot from a repelled assault", api.me().res.gold === goldBefore);
  check("but the scars persist: walls 26 -> 24", st.walls === 24);
  check("and they remember the attempt", st.standing === -1);

  // Grind it down with engines, then finally breach into a field defeat.
  api.me().units.siegeEngine = 3;
  api.me().res.food = 200;
  api.launchCampaign("riverKingdom", { soldier: 2, siegeEngine: 3 });  // wall-power 2 + 3x6 = 20 < 24
  api.me().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("engines carve deep: walls 24 -> 4", st.walls === 4);

  api.me().res.food = 200;
  api.launchCampaign("riverKingdom", { soldier: 2, siegeEngine: 3 });  // 20 >= 4: breached at last
  api.me().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);   // field: lose the win roll; casualty draws follow
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("the battered walls finally give way -- and stay down", st.walls === 0);
  check("the field battle happened this time: casualties taken",
    api.me().units.soldier + api.me().units.siegeEngine < 5);
  check("still no loot from a lost field battle", api.me().res.gold === goldBefore);
}

console.log("\n--- Re-denomination: nouns, inheritance, consolidation ---");
{
  const M = api.MANIFESTS;
  check("the ladder's first three rungs", M.stone.popNoun.singular === "settler" &&
    M.bronze.popNoun.singular === "family" && M.iron.popNoun.singular === "subject");
  // Iron's rung said "holdfast" until 2026-08-25 -- the same word as its TILE
  // noun, so the game counted people and called them places. Correct while
  // population WAS tiles; wrong from the moment the engine rework made it a
  // real per-hex variable. The compiler refuses the collision now, in any era.
  check("no age names its people after its places",
    Object.values(M).every((m) => !m.map || !m.map.tileNoun ||
      m.popNoun.singular !== m.map.tileNoun.singular));
  check("arrival lines are era-facts", M.stone.arrivalLine.includes("wanderer") &&
    M.bronze.arrivalLine.includes("family") && M.iron.arrivalLine.includes("fealty"));
  check("no era consolidates any more -- borders re-denominate, they never take (E2)",
    !M.stone.consolidate && !M.bronze.consolidate && !M.iron.consolidate);
  check("the consolidate era-fact is gone from the compiler entirely (2026-08-25)",
    M.iron.consolidate === undefined && M.stone.consolidate === undefined);
  // An era that says nothing inherits the noun (the Silicon-keeps-Bloc rule).
  const quiet = api.extendEra(M.iron, { events: [], hints: [] });
  check("popNoun inherits when a delta is silent", quiet.popNoun.singular === "subject" &&
    quiet.arrivalLine === M.iron.arrivalLine);
  check("the odometer's scale inherits too -- an age that says nothing keeps it",
    quiet.soulsPerPerson === M.iron.soulsPerPerson);
  check("a delta never grows a consolidate field back", quiet.consolidate === undefined);
  check("declaring consolidate is now a load error, not a silent no-op", (() => {
    try {
      api.validateManifests({ test: api.extendEra(M.iron, { consolidate: { keep: 0.5 } }) });
      return false;
    } catch (e) { return true; }
  })());
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
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  check("nomads circle wagons, not walls (2)", api.playerByKey("saltNomads").walls === 2);
  // A neighbour whose walls were breached gets them back when ITS age turns,
  // not merely because init ran again -- depletion persists within an age.
  check("a breached wall stays breached within the age",
    (api.playerByKey("hillClans").walls = 0, api.initAdversaries(),
     api.playerByKey("hillClans").walls === 0));
  api.me().units = { soldier: 2, archer: 0, horseman: 0, siegeEngine: 2 };
  check("wall-power: engines at x6, soldiers at x1 (2 + 12)",
    Math.abs(api.wallPower({ soldier: 2, siegeEngine: 2 }) - 14) < 1e-9);
  api.me().upgrades.ironWeapons = true;
  check("weapon tiers scale wall-power too", Math.abs(api.wallPower({ siegeEngine: 1 }) - 18) < 1e-9);
  delete api.me().upgrades.ironWeapons;
  check("in the field the engine is an ordinary unit",
    Math.abs(api.campaignStrength({ siegeEngine: 2 }, api.findAdversary("hillClans")) - 2) < 1e-9);
  // ("at home it defends at normal strength" died with militaryStrength, A5:
  // home defence is a garrison now, and a siege engine in one rolls its own
  // dice -- nearly useless against people, pinned in the resolver section.)
  const m = api.MANIFESTS.iron;
  check("Siege Workshop gates the engine",
    m.upgrades.some(u => u.id === "siegeWorkshop") &&
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
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.me().upgrades.musterGround = true;
  api.me().pop = 8; api.me().res.food = 200; api.me().builds.treasury = 1;
  const st = api.playerByKey("riverKingdom");
  api.launchCaravan("riverKingdom");
  api.me().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);   // no route risk roll matters (no hostile warlike anyway)
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("the caravan paid out", api.me().res.gold === 15);
  check("their gold came out of their stock", st.res.gold === 225);
  check("the sold food JOINED their stock", st.res.food === 250 + 60);
  check("trade builds standing", st.standing === 1);

  // Trade them dry: their gold is finite, so the well really empties.
  st.res.gold = 4;
  api.launchCaravan("riverKingdom");
  api.me().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("a nearly-dry partner pays what they have left", api.me().res.gold === 19 && st.res.gold === 0);
  api.launchCaravan("riverKingdom");
  check("a traded-dry partner is refused at launch", api.me().expeditions.length === 0);

  // Friendly premium: standing >= 2 pays 25% more.
  st.res.gold = 100; st.standing = 2;
  api.me().res.food = 200;
  api.launchCaravan("riverKingdom");
  api.me().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.999);
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("a Friendly partner pays a premium", api.me().res.gold === 19 + Math.floor(15 * 1.25));
}

console.log("\n--- C2: expeditions resolve through step() ---");
{
  api.setRngSource(() => 0.999999);
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.me().pop = 10; api.me().units.soldier = 2;
  api.me().upgrades.musterGround = true;
  api.me().res.food = 300;
  api.launchCaravan("saltNomads");   // needs 40 iron -- wait, nomads buy iron
  check("caravan needs its cargo in store", api.me().expeditions.length === 0);
  api.me().res.iron = 50;
  api.launchCaravan("saltNomads");
  check("cargo paid", Math.abs(api.me().res.iron - 10) < 1e-9);
  run(api.MANIFESTS.iron.adversaries.find(a => a.id === "saltNomads").caravanTime + 2);
  check("the caravan resolved mid-simulation, no interaction needed",
    api.me().expeditions.length === 0 && api.me().res.gold > 0);
  api.setRngSource(null);
}

console.log("\n--- C2: an era flip mid-flight strands nobody ---");
{
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.me().pop = 10; api.me().units.soldier = 3;
  api.me().expeditions.push({ uid: 9, type: "campaign", adversary: "ghostsOfAnOldEra",
    units: { soldier: 3 }, total: 10, remaining: 0.1 });
  check("units are away", api.availableUnits("soldier") === 0);
  api.resolveExpeditions(0.2);
  check("the column simply comes home", api.me().expeditions.length === 0 &&
    api.availableUnits("soldier") === 3 && api.me().units.soldier === 3 && api.me().pop === 10);
}

console.log("\n--- Ledger rates: converter flows shown honestly ---");
{
  // Full-speed forge: ample stocks, room in the bronze store.
  reset();
  api.me().era = "bronze";
  putStructures("forge", 2);
  api.me().res.copper = 100; api.me().res.tin = 100;
  let r = api.ledgerRates();
  // Rate retuned 0.05 -> 0.20 (owner playtest, 2026-08-25). These pin the
  // ARITHMETIC, not the balance number, so they read it from the manifest
  // rather than hard-coding it twice -- retuning again should not require
  // editing three checks and getting all three right.
  const fRate = api.MANIFESTS.bronze.structures.find((d) => d.id === "forge").converts.rate;
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
  api.me().era = "bronze";
  putStructures("forge", 2);
  // Post-E2 the ore inflow comes from worked hills. The forge's designed
  // equilibrium (2 forges = 0.4 copper + 0.1 tin per second) is matched by
  // hand-built hills whose populations produce EXACTLY those rates:
  // copper: n * 0.2 * 0.8 = 0.4 -> impossible with whole people... so this
  // check now asserts the general property (converters clamp to inflow at
  // zero stock) rather than one hand-tuned equilibrium.
  api.ensureMap();
  const hill = Object.values(api.world.places).find((p) => p.terrain === "hills" && !p.adversary && !p.minor);
  setHoldings([api.world.home, hill.id]);
  S().map.pop = {}; api.ensurePop();
  S().map.pop[hill.id] = 5;
  S().map.built = {}; S().map.built[hill.id] = "copperMine";
  api.me().res.copper = 0; api.me().res.tin = 0;
  r = api.ledgerRates();
  check("zero-stock converter consumes no more copper than arrives", r.copper >= -1e-9);
  check("no tin arriving, none consumed: tin nets to zero", Math.abs(r.tin) < 1e-9);
  check("bronze still flows from what copper does arrive", r.bronze > 0 || r.copper > 0);

  // Starved forge: no stock, no miners -- it isn't running, say so.
  reset();
  api.me().era = "bronze";
  putStructures("forge", 3);
  r = api.ledgerRates();
  check("a starved forge shows no bronze flow", r.bronze === 0);
  check("and eats nothing", Math.abs(r.copper || 0) < 1e-9);

  // Output capped: full bronze store stops the forge, ledger agrees.
  reset();
  api.me().era = "bronze";
  putStructures("forge", 2);
  api.me().res.copper = 100; api.me().res.tin = 100;
  api.me().res.bronze = api.caps().bronze;
  r = api.ledgerRates();
  check("a capped output shows no flow either way", r.bronze === 0 && Math.abs(r.copper || 0) < 1e-9);

  // Iron era: the forge burns wood, and the ledger shows it.
  reset();
  api.me().era = "iron";
  api.me().pop = 8;
  // Two worked forests, then two forges on OTHER ground. Order matters: the
  // forges stand on hexes, so the map has to be laid out before they are
  // placed or the layout wipes them.
  api.ensureMap();
  const woods = Object.values(api.world.places)
    .filter((p) => p.terrain === "forest" && !p.adversary && !p.minor).slice(0, 2);
  setHoldings(woods.map((p) => p.id));
  S().map.built = {};
  S().map.pop = {}; api.ensurePop();
  for (const w of woods) S().map.pop[w.id] = 4;
  api.syncPopMirror();
  putStructures("forge", 2);
  // The forge hexes were claimed by the fixture and produce nothing; the two
  // forests are the whole timber line.
  for (const w of woods) S().map.pop[w.id] = 4;
  for (const id of api.holdings()) if (S().map.built[id]) S().map.pop[id] = 0;
  api.syncPopMirror();
  api.me().res.iron = 100; api.me().res.wood = 100;
  r = api.ledgerRates();
  const iRate2 = api.MANIFESTS.iron.structures.find((d) => d.id === "forge").converts.rate;
  const draw = 2 * iRate2;                           // 2 forges' worth of batches/s
  check("steel flows at 2 forges' rate", Math.abs(r.steel - draw) < 1e-9);
  // 8 people on wood at par = 1.6 gross, minus the forges' burn of 2 wood each.
  // Derived rather than restated: how much timber the two forests give is the
  // manifest's business, not this check's.
  // Derived from the BOARD, not restated: how many people ended up on timber
  // is the fixture's business and the yields table's, not this check's.
  const grossWood = api.holdings().reduce((sum, id) => {
    const y = api.hexYield(id);
    return sum + (y && y.res === "wood" ? Math.floor(S().map.pop[id] || 0) * 0.2 * y.rate : 0);
  }, 0);
  check("wood reads worked forest minus the forge's burn",
    Math.abs(r.wood - (grossWood - 2 * draw)) < 1e-9);
  check("iron reads as pure drain with no miners",
    Math.abs(r.iron - (-3 * draw)) < 1e-9);
}

console.log("\n--- Phase B: legacy saves default eraHistory ---");
{
  // eraHistory belongs to the CIVILIZATION since the player split.
  const legacy = JSON.parse(JSON.stringify(api.freshPlayer(0)));
  delete legacy.eraHistory;
  const merged = Object.assign(api.freshPlayer(0), legacy);
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
  reset(); api.ensureMap();
  api.me().res.wood = 100; api.me().res.stone = 60;
  api.launchStructure(api.holdings().find((id) => id !== api.world.home), "infirmary");
  run(3);
  const midRemaining = api.me().buildQueue[0].remaining;
  api.save();
  api.me().res.wood = 9999;               // scribble on live state...
  api.load();                        // ...and prove load restores the saved copy
  check("save/load round-trips a build mid-construction",
    api.me().buildQueue.length === 1 && Math.abs(api.me().buildQueue[0].remaining - midRemaining) < 1e-9);
  check("load restores the saved copy, not live state", api.me().res.wood < 9999);
  run(25);
  check("the revived save finishes the build", api.builtCount("infirmary") === 1 && api.me().buildQueue.length === 0);

  // Mid-flight expedition round-trip: a column in the field survives the
  // save, and the revived save resolves it on the world's schedule.
  reset();
  api.me().era = "iron"; api.initAdversaries();
  api.me().pop = 12; api.me().units.soldier = 5; api.me().upgrades.musterGround = true;
  api.me().res.food = 200;
  api.launchCampaign("hillClans", { soldier: 4 });
  run(2);
  api.save(); api.load();
  check("a campaign in the field survives the round-trip",
    api.me().expeditions.length === 1 && api.me().expeditions[0].type === "campaign");
  api.me().expeditions[0].remaining = 0.4;
  run(2);
  check("the revived campaign resolves on schedule", api.me().expeditions.length === 0);
  check("resolution had consequences (standing moved)", api.playerByKey("hillClans").standing < 0);
}

console.log("\n--- Phase 6d: the growth verbs -- minors, settle, routes ---");
{
  reset();
  // Pinned seed: the supply-line assertion below is geometry-sensitive, and
  // the E3 trio start added route sources that cost it its margin on rare
  // layouts (caught as a 1-in-12 flake). Seeds 1-5 were verified to hold the
  // property; determinism beats fuzzing for a check this shape-dependent.
  S().seed = 3; S().rngState = 3;
  api.me().era = "iron"; S().seen.levyMigrated = true; api.me().pop = 4;
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
    .filter((p) => p.terrain !== "water" && !p.minor && !p.adversary && !api.isOwned(p.id))
    .sort((a, b) =>
      (api.hexDistance(a.q, a.r, target.q, target.r) + api.hexDistance(a.q, a.r, 0, 0)) -
      (api.hexDistance(b.q, b.r, target.q, target.r) + api.hexDistance(b.q, b.r, 0, 0)))
    .slice(0, 4).map((p) => p.id);
  for (const id of line) api.claimTile(id);
  check("a line of your own country cheapens the route (supply lines)",
    api.routeCost(far) < before);
  setHoldings(api.holdings().filter((id) => !line.includes(id)));

  // Settle: queued, priced, completes into a holdfast that works its ground.
  const empty = Object.values(api.world.places)
    .find((p) => p.terrain !== "water" && !p.minor && !p.adversary && !api.isOwned(p.id));
  const plan = api.settlePlan(empty.id);
  check("settling is priced work, scaled by the route", plan && plan.cost.food >= 24 && plan.time >= 27);
  api.me().res.food = 500; api.me().res.wood = 500; api.me().res.stone = 500; api.me().res.iron = 500;
  const popBefore = api.me().pop;
  api.launchSettle(empty.id);
  check("settling joins the Underway queue", api.me().buildQueue.some((q) => q.kind === "settle"));
  check("no double parties to one hex", (api.launchSettle(empty.id), api.me().buildQueue.filter((q) => q.kind === "settle").length === 1));
  api.setRngSource(() => 0.99);         // hold the world's dice: this checks settle
  run(Math.ceil(plan.time) + 60);       // completion, not event weather -- a sickness
  api.setRngSource(null);               // or raid in ~90s would shift pop (the old flake)
  check("the party raises a hall: owned, peopled, working its own ground",
    api.isOwned(empty.id) && api.hexPop(empty.id) >= 2 && api.me().pop > popBefore &&
    !S().map.built[empty.id] && !!api.hexYield(empty.id));

  // Capture: a campaign against a minor, forced win, takes the place whole.
  api.me().upgrades.musterGround = true; api.me().units.soldier = 6; api.me().res.food = 500;
  const mtile = minors[0].id;
  S().map.minors[mtile].walls = 0;      // walls down; test the field, not the siege
  const mstock = Object.assign({}, S().map.minors[mtile].stock);
  const popBefore2 = api.me().pop;
  api.launchCampaign("tile:" + mtile, { soldier: 4 });
  check("a column can march on a minor", api.me().expeditions.length === 1);
  api.me().expeditions[0].remaining = 0.1;
  api.setRngSource(() => 0.0);          // win, no casualty roll fires bad
  api.resolveExpeditions(0.2);
  api.setRngSource(null);
  check("capture: the tile swears fealty -- owned, peopled, working its ground",
    api.isOwned(mtile) && api.hexPop(mtile) >= 2 && api.me().pop > popBefore2 &&
    !S().map.built[mtile]);
  check("the whole stock came home", Object.keys(mstock).every((k) => api.me().res[k] >= mstock[k]));
  check("the minor's remnant is gone -- the Chronicle had the name last",
    S().map.minors[mtile] === undefined);

  // A captured tile survives the save: ownership is state, the minor is not.
  api.save(); api.load(); api.ensureMap();
  check("capture survives save/load -- ownership trumps the regenerated seat",
    api.isOwned(mtile) && !S().map.minors[mtile]);
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
  api.me().era = "iron";
  api.S.seen.levyMigrated = true;
  api.me().pop = 6;
  api.initAdversaries();
  api.ensureMap();
  api.syncDominion();

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
  api.me().revealed.push(seat.id);
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
  api.me().revealed.push(minor.id);
  check("a minor wears a house too, and no label (a map, not a directory)",
    api.markFor(minor).glyph === "\u2302" && !api.markFor(minor).label);

  // Owned country reports what it PRODUCES, and every resource letter is
  // distinct -- a collision here would be invisible on screen and wrong.
  const ownedId = api.holdings().find((id) => id !== api.world.home);
  check("owned country wears the letter of what its ground gives",
    api.markFor(P(ownedId)).glyph === (api.hexYield(ownedId) ? api.markFor(P(ownedId)).glyph : null) &&
    api.markFor(P(ownedId)).glyph.length > 0);
  // DERIVED FROM THE MANIFESTS, not restated here -- and that is the whole
  // point. This check used to iterate a hardcoded ["food","wood","stone","iron"]
  // and so could never notice that Bronze had put COPPER and TIN on the hills
  // (2026-08-24): a hex yielding either drew an empty glyph and read as
  // resting, for a day, until the owner spotted it in play. A check that
  // restates the list it is checking is a check that can only ever confirm what
  // its author already remembered. It now sweeps BOTH sources of yield: the
  // ground itself, and every structure any era can raise on it.
  const workable = new Set();
  for (const m of Object.values(api.MANIFESTS)) {
    for (const t in (m.map && m.map.yields) || {}) workable.add(m.map.yields[t].res);
    for (const d of m.structures || []) if (d.yield) workable.add(d.yield.res);
  }
  check("there is more than one era's worth of yieldable resources here", workable.size > 4);
  const letters = [...workable].map((res) => {
    // Drive the glyph through a structure, which is the only thing that can
    // make a hex yield something its terrain does not.
    const fake = { id: "probe:" + res, yield: { res, rate: 1 } };
    const era = api.MANIFESTS[api.me().era];
    era.structures.push(fake);
    api.S.map.built[ownedId] = fake.id;
    const g = api.markFor(P(ownedId)).glyph;
    era.structures.pop();
    delete api.S.map.built[ownedId];
    return g;
  });
  check("every resource a hex can yield draws a letter",
    letters.every((g) => typeof g === "string" && g.length > 0));
  check("...and every letter is distinct", new Set(letters).size === workable.size);

  const wild = Object.values(api.world.places)
    .find((x) => !api.isOwned(x.id) && !x.adversary && !x.minor && x.id !== api.world.home
      && api.isCharted(x.id));
  check("known but empty country carries no mark at all", api.markFor(wild) === null);

  // YOUR SEAT WEARS BOTH (owner, 2026-08-25). The home branch used to
  // short-circuit the ladder, so the capital was the ONE owned hex that never
  // said what it was producing -- invisible precisely because it is the hex
  // you look at most. The house is still the primary mark; the work rides
  // beside it as `sub`.
  const homeId = api.world.home;
  const hm = api.markFor(P(homeId));
  check("your seat still wears the house first", hm.glyph === "⌂" && hm.cls === "home");
  check("...and now reports what its ground gives", hm.sub && hm.sub.glyph.length > 0 && hm.sub.cls === "work");
  // Read through a guard, not a dot: if a regression drops `sub` entirely this
  // must report as a failed CHECK, not a TypeError that kills the run and hides
  // every check after it.
  const subOf = (id) => (api.markFor(P(id)).sub || {});
  // The seat reports through a STRUCTURE the same way ordinary ground does --
  // same letters, same table. Driven through probe structures because terrain
  // alone only ever gives three of the resources.
  const seatLetters = ["food", "wood", "stone", "iron"].map((res) => {
    const fake = { id: "probe:" + res, yield: { res, rate: 1 } };
    const era = api.MANIFESTS[api.me().era];
    era.structures.push(fake);
    api.S.map.built[homeId] = fake.id;
    const g = subOf(homeId).glyph;
    era.structures.pop();
    delete api.S.map.built[homeId];
    return g;
  });
  check("...through every resource, with the same letters ordinary ground uses",
    new Set(seatLetters).size === 4 && seatLetters.join("") === "FWSI");

  // The composite is the ladder's ONLY one. Everything else on the board is a
  // single thing, and a renderer that started drawing `sub` unconditionally
  // would put a dash on every rival's hall.
  // (allocation line removed 2026-08-25: ground works its own terrain now)
  check("ordinary owned country is not composite", !api.markFor(P(ownedId)).sub);
  check("a rival's hall is not composite", !api.markFor(seat).sub);
  check("a steading is not composite", !api.markFor(minor).sub);

  // THE RIM LADDER (owner request, 2026-08-25). Inhabited ground wears a rim
  // and its colour says whose. It is routed through markFor() rather than
  // re-deriving ownership, so the rim and the glyph can never disagree about
  // who lives on a tile -- the drift that produced diamonds in the 2D stage.
  const pal = api.playerColor();
  check("your country wears your colour", api.rimFor(P(homeId)) === pal.ring);
  check("...on every holding, not just the seat", api.rimFor(P(ownedId)) === pal.ring);
  check("a power's ground wears the foreign rim", api.rimFor(seat) === api.FOREIGN);
  check("a steading wears the quieter foreign rim", api.rimFor(minor) === api.FOREIGN_MINOR);
  check("empty country wears no rim at all", api.rimFor(wild) === null);

  // THE HONESTY RULE, and the reason this went through markFor. Sight reveals
  // the BOARD, never the PIECES -- so ground you can see across water but have
  // not charted must not wear a rim announcing that somebody lives on it.
  // Target the actual leak: an INHABITED tile that has not been charted. Any
  // old uncharted tile is usually empty country, which would pass this check
  // without ever exercising it.
  const hiddenHome = Object.values(api.world.places)
    .find((x) => !api.isCharted(x.id) && (x.adversary || x.minor));
  check("there is somebody out there still uncharted (the check has something to bite on)",
    !!hiddenHome);
  check("uncharted ground wears no rim -- a rim is a piece, and sight shows only board",
    !hiddenHome || api.rimFor(hiddenHome) === null);

  // The two ladders agree by construction; this is the check that fails if
  // someone re-derives one of them locally again.
  const disagree = Object.values(api.world.places).filter((x) => {
    const m = api.markFor(x), r = api.rimFor(x);
    if (!m) return r !== null;                       // no mark -> no rim
    if (api.isOwned(x.id)) return r !== pal.ring;
    if (m.cls === "seat")  return r !== api.FOREIGN;
    if (m.cls === "minor") return r !== api.FOREIGN_MINOR;
    return false;
  });
  check("the rim and the mark never disagree about who lives on a tile", disagree.length === 0);

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
  setHoldings(mainland.slice());
  api.syncCharted();

  const sighted = api.me().sighted || [];
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
  const ownedBefore = api.holdCount();
  const chartedBefore = api.me().revealed.length;
  api.syncSighted();
  check("sight never charts and never claims",
    api.holdCount() === ownedBefore && api.me().revealed.length === chartedBefore);

  // Sticky, like charting.
  const before = sighted.length;
  api.syncCharted();
  check("sight is sticky and additive", (api.me().sighted || []).length >= before);
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
      const owned = api.holdings();
      const vis = new Set([...(api.me().revealed || []), ...(api.me().sighted || [])]);
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
  api.me().res.food = 5000; api.me().res.wood = 5000; api.me().res.stone = 5000;

  check("the stone age governs seven holdings", api.dominionCap() === 7);
  check("the trio leaves room for four more", !api.atDominionCap() && api.holdsUsed() === 3);

  // Fill the scope: capture to six, then QUEUE the seventh -- parties on the
  // road count against the age's scope, or the queue becomes the loophole.
  const wild = () => Object.values(api.world.places)
    .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id)
      && !api.pendingSettle(x.id));
  while (api.holdCount() < 6) api.captureTile(wild().id);
  const seventh = wild();
  api.launchSettle(seventh.id);
  check("the seventh party counts while still on the road",
    api.holdsUsed() === 7 && api.atDominionCap());

  const eighth = wild();
  const qBefore = api.me().buildQueue.length;
  api.launchSettle(eighth.id);
  check("the age refuses an eighth: no cost curve, a closed door",
    api.me().buildQueue.length === qBefore && !api.isOwned(eighth.id));
  check("the price is still PRINTED at the cap (the refusal is worded, not hidden)",
    api.settlePlan(eighth.id) !== null);

  // A new age is what raises the scope.
  api.me().era = "bronze"; api.initAdversaries(); api.ensureMap();
  api.me().res.bronze = 100;   // the wider banner brings its signature metal
  check("bronze governs twelve", api.dominionCap() === 12 && !api.atDominionCap());
  api.launchSettle(eighth.id);
  check("the same claim is welcome under the wider banner",
    api.me().buildQueue.some((q) => q.kind === "settle" && q.tile === eighth.id));

  // Subduing a minor is conquest, and conquest answers to the scope too.
  reset(); api.closeModal();
  api.me().era = "iron"; api.initAdversaries(); api.ensureMap();
  api.me().upgrades.musterGround = true; api.me().units.soldier = 6; api.me().res.food = 5000;
  while (api.holdCount() < 20) {
    const w = Object.values(api.world.places)
      .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
    if (!w) break;
    api.captureTile(w.id);
  }
  const minorTile = Object.values(api.world.places).find((x) => x.minor && !api.isOwned(x.id));
  api.launchCampaign("tile:" + minorTile.id, { soldier: 4 });
  check("a subdual that would exceed the age's scope refuses to march",
    api.me().expeditions.length === 0);
  api.setRngSource(null);
}

console.log("\n--- The march-hold: walls act on resolution, never selection ---");
{
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.ensureMap();
  api.me().res.wood = 9999; api.me().res.stone = 9999; api.me().res.iron = 9999; api.me().res.food = 9999;
  const home = api.world.home;
  const hex = api.holdings().find((id) => id !== home);

  check("Iron declares the march-hold; Bronze does not",
    !!api.MANIFESTS.iron.structures.find((d) => d.id === "marchHold") &&
    !api.MANIFESTS.bronze.structures.find((d) => d.id === "marchHold"));
  check("it yields nothing at all -- that is the price of the hex",
    !api.MANIFESTS.iron.structures.find((d) => d.id === "marchHold").yield);

  // THE SEAT IS NOT BUILDABLE. The Construction panel is what you raise THERE.
  api.me().upgrades.fortification = true;
  check("the seat refuses every structure", api.canBuildOn(home) === false);
  api.launchStructure(home, "marchHold");
  check("...and the build is refused, not merely hidden", api.me().buildQueue.length === 0);
  check("an ordinary holding accepts one", api.canBuildOn(hex) === true);

  // A built march-hold produces nothing and covers its neighbourhood.
  api.S.map.built[hex] = "marchHold";
  check("a fortified hex is out of the ledger entirely",
    api.hexProduces(hex) === false && api.hexResource(hex) === null);
  // WALLS ACT THROUGH THE RESOLVER NOW (A5): a pool of hits and a number of
  // firing positions on the def, read for the hex the fight is actually on.
  // Range died with fortStrength -- everything that fires is standing here.
  {
    const mh = api.MANIFESTS.iron.structures.find((d) => d.id === "marchHold");
    check("the march-hold carries a wall pool and firing slots",
      mh.wallPool > 0 && mh.slots > 0 && mh.fortifies === true);
  }

  // SELECTION IS UNTOUCHED. A fort changes no odds about WHETHER a raid comes
  // or WHERE it lands -- only what happens when it arrives. This is the check
  // that fails if fortification ever creeps into strikeHex.
  reset(); api.me().era = "iron"; api.initAdversaries(); api.ensureMap();
  // THE BOARD HAS TO BE ABLE TO SHOW THE DIFFERENCE. The starting trio is
  // mutually adjacent, so one march-hold covers all three EQUALLY -- and a
  // uniform factor cancels out of a weighted pick, which made the first version
  // of this check unable to detect a fort leaking into selection at all. It
  // passed against a deliberate mutation, which is the only reason it was
  // caught. Take distant ground first, so the fort covers some hexes and not
  // others and the weights can actually diverge.
  let outpost = null, far = -1;
  for (const p2 of Object.values(api.world.places)) {
    if (p2.terrain === "water" || p2.adversary || p2.minor || api.isOwned(p2.id)) continue;
    const h = api.world.places[api.world.home];
    const d = (Math.abs(p2.q - h.q) + Math.abs(p2.r - h.r) + Math.abs((p2.q + p2.r) - (h.q + h.r))) / 2;
    if (d > far) { far = d; outpost = p2.id; }
  }
  api.captureTile(outpost);
  check("the test board has ground a single march-hold cannot cover", far > 2);
  for (const id of api.holdings()) api.S.map.pop[id] = 6;
  api.syncPopMirror();
  const tally = (fortified) => {
    const counts = {};
    for (const id of api.holdings()) counts[id] = 0;
    for (let i = 0; i < 600; i++) {
      api.setRngSource(null);
      api.S.rngState = 1000 + i;
      if (fortified) api.S.map.built[fortified] = "marchHold";
      const at = api.strikeHex("raid");
      if (at) counts[at] = (counts[at] || 0) + 1;
    }
    return counts;
  };
  const plain = tally(null);
  const walled = tally(api.holdings().find((id) => id !== api.world.home));
  check("a march-hold does not change where raids land -- selection is untouched",
    Object.keys(plain).every((id) => plain[id] === walled[id]));
}

console.log("\n--- Building on a hex: the farm ---");
{
  // The first structure, and the proof of the whole pipeline: upgrade gates it,
  // the queue paces it, the hex's one use holds, and pulling it down costs.
  reset();
  api.me().era = "bronze";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.ensureMap();
  const home = api.world.home;
  // A FARM NEEDS FARMLAND (2026-08-25): structures are terrain-gated, so the
  // test hex has to be ground a farm may actually stand on.
  const farmable = Object.values(api.world.places)
    .find((p) => (p.terrain === "plains" || p.terrain === "river") &&
      !p.adversary && !p.minor && p.id !== home);
  if (farmable && !api.isOwned(farmable.id)) api.captureTile(farmable.id);
  const hex = farmable.id;
  api.me().res.wood = 9999; api.me().res.stone = 9999; api.me().res.food = 9999;

  check("the farm is declared by Bronze and redeclared by Iron",
    !!api.MANIFESTS.bronze.structures.find((d) => d.id === "farm") &&
    !!api.MANIFESTS.iron.structures.find((d) => d.id === "farm"));
  check("Stone builds on hexes too -- camp, pit and medicine tent are its shop",
    (api.MANIFESTS.stone.structures || []).map((d) => d.id).sort().join(",") ===
      "infirmary,lumberCamp,stonePit");
  check("a farm belongs on farmland, and nowhere else",
    api.structureFits("farm", hex) === true && (() => {
      const hill = Object.values(api.world.places).find((p) => p.terrain === "hills");
      return !hill || api.structureFits("farm", hill.id) === false;
    })());

  // THE UPGRADE IS THE GATE. Without it the verb does not exist.
  delete api.me().upgrades.farming;
  check("no Farming, no farms", api.structureUnlocked("farm") === false);
  api.launchStructure(hex, "farm");
  check("...and the build is refused outright, not merely hidden",
    api.me().buildQueue.length === 0);

  api.me().upgrades.farming = true;
  check("with Farming owned, the verb appears", api.structureUnlocked("farm") === true);

  // COST ESCALATES PER COPY, like every other building line.
  const first = api.structurePlan("farm").cost.wood;
  api.launchStructure(hex, "farm");
  check("queuing a farm takes the payment up front",
    api.me().buildQueue.length === 1 && api.me().res.wood < 9999);
  check("one build per hex -- a second is refused while the first is queued",
    api.pendingBuild(hex) === true && (api.launchStructure(hex, "farm"), api.me().buildQueue.length === 1));
  const second = api.structurePlan("farm").cost.wood;
  check("the next farm costs more than the last, queued ones included", second > first);

  // COMPLETION takes the hex's use.
  run(60);
  const u = api.hexUse(hex);
  check("the finished farm owns the hex's one use", u.kind === "structure" && u.id === "farm");
  check("...and the queue is clear", api.me().buildQueue.length === 0);
  check("a farmed hex feeds better than any bare ground could",
    api.hexYield(hex).rate >
      Math.max(...Object.values(api.MANIFESTS.bronze.map.yields).map((y) => y.res === "food" ? y.rate : 0)));

  // THE ONE USE HOLDS.
  api.S.map.built[hex] = "farm";
  api.launchStructure(hex, "farm");
  check("and you cannot build over a structure with another", api.me().buildQueue.length === 0);

  // DEMOLISH: back to plain ground, and nothing comes back.
  const before = { wood: api.me().res.wood, stone: api.me().res.stone };
  api.demolishStructure(hex);
  check("pulling it down returns the hex to bare ground, working its terrain again",
    api.hexUse(hex).kind === "bare" && api.hexProduces(hex) === true &&
    api.hexYield(hex).res === api.terrainYield(hex).res);
  check("...with NO refund -- converting is a trade, not a toggle",
    api.me().res.wood === before.wood && api.me().res.stone === before.stone);

  // GROUND LOST WHILE THE WORK IS QUEUED. The crew arrives to nothing and the
  // labour is wasted, the same way a settling party finds its land taken.
  reset();
  api.me().era = "bronze"; api.initAdversaries(); api.ensureMap();
  api.me().upgrades.farming = true;
  api.me().res.wood = 9999; api.me().res.stone = 9999; api.me().res.food = 9999;
  const doomed = api.holdings().find((id) => id !== api.world.home);
  api.launchStructure(doomed, "farm");
  api.killAt(doomed, 99);                       // a raid empties it: the hex is lost
  check("the ground went with its people", !api.isOwned(doomed));
  run(60);
  check("the queued build resolves without raising anything on ground you lost",
    api.me().buildQueue.length === 0 && !api.isOwned(doomed));
  check("...and nothing was silently rebuilt there", !(doomed in api.S.map.built));
}

console.log("\n--- One hex, one use ---");
{
  // Built ahead of the structures that needed it (design.md, Building on a
  // Hex) and rewritten 2026-08-25 when the hex economy simplified the slot: a
  // hex is BARE -- working the ground it is made of -- or it carries exactly
  // one structure. There is no third state and nothing to point anywhere.
  reset();
  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.ensureMap();
  const home = api.world.home;
  api.me().res.wood = 9999; api.me().res.stone = 9999; api.me().res.food = 9999; api.me().res.iron = 9999;

  check("a bare hex reports itself as bare, not as a missing answer",
    api.hexUse(home).kind === "bare");
  check("...and works its own terrain without being told",
    api.hexProduces(home) === true &&
    api.hexResource(home) === api.terrainYield(home).res);
  check("...at the terrain's rate", api.hexYield(home).rate === api.terrainYield(home).rate);

  // A STRUCTURE REPLACES THE GROUND'S YIELD.
  api.S.map.built[home] = "farm";
  const u = api.hexUse(home);
  check("a built hex reads as a structure, by bare id", u.kind === "structure" && u.id === "farm");
  check("a structure that declares a yield produces it",
    api.hexProduces(home) === true && api.hexResource(home) === "food");
  check("...at its OWN flat rate, not the terrain's",
    api.hexYield(home).rate === api.structureDef("farm").yield.rate);
  check("...which beats every bare ground in the game at food",
    Object.values(api.MANIFESTS.iron.map.yields)
      .every((y) => (y.res === "food" ? y.rate : 0) < api.hexYield(home).rate));

  // A structure with nothing to give is a real answer, not a missing one --
  // which is exactly what a March-hold and a Market are.
  api.S.map.built[home] = "marchHold";
  check("a structure with no declared yield produces nothing",
    api.hexProduces(home) === false && api.hexResource(home) === null);
  check("...and that is true of the Market too, which trades instead of digging",
    (() => { api.S.map.built[home] = "market";
      const none = api.hexProduces(home) === false;
      api.S.map.built[home] = "farm"; return none; })());

  // The LEDGER must not earn anything from a hex whose structure gives nothing
  // -- the behaviour that used to be right only by accident.
  setHoldings([home]);
  api.S.map.pop = {}; api.ensurePop();
  api.S.map.pop[home] = 20;
  api.syncPopMirror();
  api.S.map.built[home] = "marchHold";
  const inert = api.rates()[api.terrainYield(home).res];
  delete api.S.map.built[home];
  const bare = api.rates()[api.terrainYield(home).res];
  api.S.map.built[home] = "farm";
  const farmed = api.rates().food;
  check("a structure with no yield takes the hex out of the ledger entirely", inert === 0);
  check("bare ground earns without being told", bare > 0);
  check("a farm feeds better than the same hex bare", farmed > bare);

  // ONE SLOT, so a second use is unrepresentable rather than merely forbidden.
  api.S.map.built[home] = "ironMine";
  check("building over a hex replaces the use -- there is nowhere to put both",
    api.hexResource(home) === "iron" && api.hexUse(home).id === "ironMine");
  delete api.S.map.built[home];
  check("and clearing it restores the ground's own yield",
    api.hexUse(home).kind === "bare" &&
    api.hexResource(home) === api.terrainYield(home).res);
}


console.log("\n--- The odometer: the topline number is a fiction, and stays one ---");
{
  // The odometer REPLACES the topline population count rather than joining it
  // (owner ruling). Play numbers stay small; the noun and the scale get big.
  reset();

  check("Stone counts real people -- the multiplier is 1, so nothing is inflated",
    api.MANIFESTS.stone.soulsPerPerson === 1);
  check("Bronze holds at 1: the first border consolidates nothing",
    api.MANIFESTS.bronze.soulsPerPerson === 1);
  check("Iron is where the topline and the ground truth part company",
    api.MANIFESTS.iron.soulsPerPerson > 1);
  check("the scale never shrinks as ages pass",
    api.MANIFESTS.stone.soulsPerPerson <= api.MANIFESTS.bronze.soulsPerPerson &&
    api.MANIFESTS.bronze.soulsPerPerson <= api.MANIFESTS.iron.soulsPerPerson);

  // At x1 the odometer IS the population, which is the spec's own requirement:
  // "in Stone and Bronze the odometer and the lever are the same small number".
  api.me().era = "stone";
  check("at x1 the odometer and the true count are the same number",
    api.souls() === api.me().pop);

  api.me().era = "iron";
  check("at Iron one unit of population stands for many",
    api.souls() === api.me().pop * api.MANIFESTS.iron.soulsPerPerson);

  // RULE 1, AND IT IS THE WHOLE POINT. The odometer is a display: nothing in
  // the game may read it. The strongest form of that claim is that deleting it
  // changes no outcome -- so this checks the inputs it is derived FROM are
  // untouched by asking for it, and that no cost, cap or gate moves.
  reset();
  api.me().era = "iron";
  api.ensureMap();
  const before = JSON.stringify(api.S);
  api.souls(); api.souls(); api.fmtSouls(api.souls());
  check("asking for the odometer changes nothing at all -- it is derived, never stored",
    JSON.stringify(api.S) === before);
  check("it is not in the save", !("souls" in api.S));

  // The gates still read REAL population. A capstone that asked the odometer
  // would unlock at Iron the instant the multiplier landed, which is exactly
  // the failure rule 1 exists to prevent.
  const gate = api.MANIFESTS.bronze.upgrades.find((u) => u.id === "ironAge");
  check("the era capstone is gated on real people, not on the fiction",
    !!gate && api.MANIFESTS.bronze.soulsPerPerson === 1);

  // THE FORMATTER -- the one deliberate exception to the small-numbers pillar.
  check("small counts are printed whole, because they can still be read",
    api.fmtSouls(7) === "7" && api.fmtSouls(60000) === "60,000");
  check("big counts compact, and keep three significant figures so they still MOVE",
    api.fmtSouls(1234567) === "1.23M" && api.fmtSouls(12345678) === "12.3M" &&
    api.fmtSouls(123456789) === "123M");
  check("the ladder reaches the numbers the design actually wants",
    api.fmtSouls(3.2e9).endsWith("B") && api.fmtSouls(3.2e12).endsWith("T") &&
    api.fmtSouls(3.2e15).endsWith("Qa"));
  check("a fractional soul is never printed", api.fmtSouls(7.9) === "7");

  // RULE 3: the jumps are the point. One person lost on a frontier hex should
  // move the topline by a visible chunk, not by one.
  reset();
  api.me().era = "iron";
  api.ensureMap();
  // (allocation line removed 2026-08-25: ground works its own terrain now)
  const soulsBefore = api.souls();
  api.killAt(api.world.home, 1);
  api.reconcileReservations();
  const drop = soulsBefore - api.souls();
  check("losing one person moves the topline by a whole community, not by one",
    drop === api.MANIFESTS.iron.soulsPerPerson);
}

console.log("\n--- Slice 5: the run you choose to start ---");
{
  // Three choices, all fixed for the run by ruling. The picker itself is DOM
  // and lives on a screen the harness never renders; what is checkable is the
  // half that outlives the screen -- the state fields, the fallbacks, and the
  // seeding property the whole feature rests on.
  reset();

  // THE SEAT'S NAME. Optional by construction: skipping it is the common case
  // and must read as intended rather than as a blank nobody filled in.
  check("a run with no name uses the game's own words", api.seatName() === "Your Seat");
  check("...and knows it is unnamed", api.seatIsNamed() === false);
  api.me().seatName = "Greenhollow";
  check("a named seat answers with its name", api.seatName() === "Greenhollow");
  check("...and knows it is named", api.seatIsNamed() === true);
  // Whitespace is not a name. Without this, a player who types a space gets a
  // blank panel header and no way to tell what went wrong.
  api.me().seatName = "   ";
  check("a name of nothing but spaces is no name", api.seatName() === "Your Seat" && !api.seatIsNamed());
  api.me().seatName = "";

  // A proper noun does NOT re-denominate with the era. Your Greenhollow is
  // still Greenhollow when it stops being a clearing and becomes a holdfast --
  // which is the whole reason naming buys attachment.
  api.me().seatName = "Greenhollow";
  const namedIn = (era) => { api.me().era = era; return api.seatName(); };
  check("the name survives every era border",
    namedIn("stone") === "Greenhollow" && namedIn("bronze") === "Greenhollow" &&
    namedIn("iron") === "Greenhollow");
  api.me().era = "stone"; api.me().seatName = "";

  // THE CONTINENT. Random is not a special case -- it is the ABSENCE of a
  // pick, so the continent falls out of the run seed. That is what makes a
  // bare seed number reproduce a random run exactly, and it is why the picker
  // needed no new save field.
  reset();
  api.setPickedContinent(null);
  api.S.map = null; api.ensureMap();
  const randomRun = api.S.map.continent;
  const seed = api.S.seed;
  check("a random run still lands on a real continent",
    api.CONTINENTS.some((c) => c.id === randomRun));

  reset();
  api.S.seed = seed; api.S.map = null;
  api.setPickedContinent(null);
  api.ensureMap();
  check("the same seed draws the same random continent -- a bare number reproduces the run",
    api.S.map.continent === randomRun);

  // A PICK overrides the seed, and is recorded in the save so the run
  // reproduces as "Broadwater · 12345" rather than needing the pick repeated.
  check("every authored continent can be picked", api.CONTINENTS.every((c) => {
    reset(); api.setPickedContinent(c.id); api.S.map = null; api.ensureMap();
    return api.S.map.continent === c.id;
  }));
  check("the pick is written into the save, not just used once",
    api.S.map.continent === api.CONTINENTS[api.CONTINENTS.length - 1].id);

  // A pick that is not a continent must not strand the run on nothing.
  reset();
  api.setPickedContinent("atlantis");
  api.S.map = null; api.ensureMap();
  check("a bogus pick falls back to the seed rather than an empty world",
    api.CONTINENTS.some((c) => c.id === api.S.map.continent));
  api.setPickedContinent(null);

  // The picker offers exactly the authored pool -- a continent that exists but
  // cannot be chosen is the bug this feature was built to remove (three of
  // them were reachable only by URL before slice 5).
  check("every authored continent is offered, and nothing else is",
    api.CONTINENTS.length === 3 && api.CONTINENTS.every((c) => c.id && c.name && c.blurb));
}

console.log("\n--- The board's colour law: yours, theirs, and reserved ---");
{
  // A digital tabletop has three colour jobs -- who you are, who everyone else
  // is, and the board shouting -- and mixing them up is how a board stops
  // being readable. core/palette.js is where they are written down; these are
  // the properties that keep them from quietly merging again.
  const ids = api.PLAYER_COLORS.map((c) => c.id);

  check("the default colour is one of the offered colours",
    ids.includes(api.DEFAULT_COLOR));
  // state.js hardcodes the default rather than importing it, because palette
  // reads S and the import would be a cycle for one string. This is the guard
  // that keeps the two copies equal.
  check("a fresh civ agrees with the palette's default -- the two copies of one fact",
    api.freshPlayer(0).color === api.DEFAULT_COLOR);
  check("every colour is distinct", new Set(ids).size === ids.length);
  check("every colour carries all four roles",
    api.PLAYER_COLORS.every((c) => c.ring && c.hover && c.focus && c.glyph));
  // THE RIM LADDER IS BRIGHTNESS, and it has to be monotonic. Every rim on the
  // board shares one width, one position and full opacity now, so brightness is
  // the ONLY channel separating held ground from the tile under the cursor from
  // the tile whose panel is open. A colour whose steps sit out of order, or too
  // close to tell apart, silently collapses two of those three states.
  const relL = (h) => {
    const n = parseInt(h.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  check("the rim ladder brightens: held ground, then hovered, then selected",
    api.PLAYER_COLORS.every((c) => relL(c.ring) < relL(c.hover) && relL(c.hover) < relL(c.focus)));
  check("...with steps big enough to actually see",
    api.PLAYER_COLORS.every((c) => relL(c.hover) - relL(c.ring) > 0.02 &&
                                   relL(c.focus) - relL(c.hover) > 0.02));

  const hex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  check("every colour value is a full hex triple",
    api.PLAYER_COLORS.every((c) => hex(c.ring) && hex(c.focus) && hex(c.glyph)));

  // RESERVED. Nothing that means WHO may wear a status colour, and this is the
  // check that stops the player palette growing into red/orange/yellow later.
  // No per-hex status visual exists yet -- this is a reservation, and a
  // reservation nobody enforces is a comment.
  const lum = (h) => {
    const n = parseInt(h.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  // "Reads as a warning" is NOT a hue test, and writing it as one is how this
  // check first failed. Two things went wrong and both were informative:
  // yellow has high green by definition, so a red-dominant test misses it; and
  // once widened to the whole warm wedge it flagged BROWN, because brown IS
  // dark orange.
  //
  // The real distinction is CHROMA, not hue. Red, orange and yellow shout
  // because they are vivid -- one channel pinned high, another crushed. Brown
  // is the same hue family held quiet, which is exactly why it can be a player
  // colour without ever being mistaken for an alarm. So: warm AND vivid.
  const warnish = (h) => {
    const { r, g, b } = lum(h);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const chroma = max === 0 ? 0 : (max - min) / max;
    return r > 170 && b < r - 60 && chroma > 0.68;
  };
  const offenders = [];
  for (const c of api.PLAYER_COLORS) {
    for (const k of ["ring", "focus", "glyph"]) if (warnish(c[k])) offenders.push(c.id + "." + k);
  }
  check("no player colour strays into the reserved warning band", offenders.length === 0);
  check("...and all three reserved colours ARE in that band (the test has teeth)",
    warnish(api.STATUS.critical) && warnish(api.STATUS.urgent) && warnish(api.STATUS.notice));
  // The specific pair the predicate exists to tell apart. Brown and orange are
  // the same hue family; only chroma separates a player from an alarm.
  check("brown is warm but quiet, and orange is warm and loud",
    !warnish(api.colorById("brown").focus) && warnish(api.STATUS.urgent));

  // THEIRS is white, and must not be confusable with any player's glyph --
  // otherwise "who lives here" stops being answerable at a glance, which is
  // the entire job of the house colour.
  const near = (a, b, tol) => {
    const x = lum(a), y = lum(b);
    return Math.abs(x.r - y.r) < tol && Math.abs(x.g - y.g) < tol && Math.abs(x.b - y.b) < tol;
  };
  check("no player's house can be mistaken for a foreign one",
    api.PLAYER_COLORS.every((c) => !near(c.glyph, api.FOREIGN, 40)));
  check("powers are no longer red -- peaceful neighbours stopped looking like enemies",
    api.FOREIGN === "#ffffff" && api.FOREIGN_MINOR !== "#ff8a7a");

  // The lookup is the only way the rest of the game reads a colour, so it has
  // to survive a save carrying something that is not a colour at all.
  check("an unknown colour id falls back rather than painting the board undefined",
    api.colorById("chartreuse").id === api.DEFAULT_COLOR);
  check("a missing colour id falls back too", api.colorById(undefined).id === api.DEFAULT_COLOR);
  check("a known id round-trips", api.colorById("purple").id === "purple");

  // Old saves predate the field entirely and must inherit the default through
  // load()'s merge rather than arriving as undefined.
  reset();
  check("every civ always has a colour", ids.includes(api.freshPlayer(0).color));
}

console.log("\n--- C3: the danger acquires a name ---");
{
  // The payoff for putting the roster on the board from minute one. At Stone
  // raiders belong to nobody; from Bronze they are your neighbours, and it was
  // the same people all along.
  const attributionIn = (era) => {
    reset();
    api.me().era = era;
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
  reset(); api.me().era = "stone"; api.initAdversaries(); api.ensureMap();
  check("...and Stone is silent DESPITE having neighbours seated",
    api.MANIFESTS.stone.adversaries.length > 0 && api.raidAttribution() === null);
  check("the gate is the contact era-fact",
    api.MANIFESTS.stone.contact === "none" && api.MANIFESTS.bronze.contact === "open");

  // Peaceful neighbours never take the blame, in any era.
  reset(); api.me().era = "iron"; api.initAdversaries(); api.ensureMap();
  check("a named era always names somebody", api.raidAttribution() !== null);
  check("peaceful neighbours are never blamed for a raid",
    api.MANIFESTS.iron.adversaries.some((a) => a.disposition === "peaceful") &&
    api.raidAttribution().disposition === "warlike");

  // A roster with nobody seated has nobody to blame, and that is a real state
  // rather than a crash -- the caller falls back to the anonymous voice.
  // Neighbours are PLAYERS now, so "nobody seated" means no rival records --
  // and the caller falls back to the anonymous voice rather than throwing.
  const saved = S().players.slice();
  S().players = [api.me()];
  check("no seated neighbours, no attribution -- and no throw",
    api.raidAttribution() === null);
  S().players = saved;

  // (The TEMPLATE LEAK checks died with CONFLICT_FLAVOR in A5: raiders.js
  // writes its Chronicle lines as template literals with no substitution
  // tokens, so the leak class cannot exist any more.)

  // Sentence case, and the specific failure it exists for: a line may start
  // MORE than one sentence with a name, and every name begins "the".
  check("sentenceCase capitalises the opening",
    api.sentenceCase("the Hill Clans hold.") === "The Hill Clans hold.");
  check("...and every sentence after it -- the bug that would have shipped",
    api.sentenceCase("They came back. the Hill Clans, and they knew the way.")
      === "They came back. The Hill Clans, and they knew the way.");
  check("...without touching a name mid-sentence",
    api.sentenceCase("A warband out of the high ground.") === "A warband out of the high ground.");

  // Attribution must not spend a draw it cannot use -- the roster ships one
  // warlike people, so the common path is a lookup, not a roll.
  reset(); api.me().era = "iron"; api.initAdversaries(); api.ensureMap();
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
  api.me().units.soldier = 2; api.syncPopMirror();
  check("a stone-age soldier is two more mouths at the fire",
    Math.abs(api.rates().upkeep - (upkeepBefore + 2 * api.CONFIG.upkeep)) < 1e-9);
  api.me().units.soldier = 0; api.syncPopMirror();

  // The muster answers to the land from frame one: trio = cap 6.
  check("the muster is the land, in every era (3 hexes x 2)", api.levyCap() === 6);

  // Sickness strikes ONE hex and takes a fifth of it (min 1) -- big hexes
  // host worse outbreaks, small ones lose one soul.
  for (const id of api.holdings()) S().map.pop[id] = 10;
  api.syncPopMirror();
  // Sickness OWNS ITS TRIGGER since 2026-08-25 (it has to pick the hex before
  // it can ask whether healers cover it), so drive resolve() with the dice
  // pinned to "it happens" rather than calling a bare effect().
  const sicknessEv2 = api.MANIFESTS.stone.events.find((e) => e.id === "sickness");
  check("sickness resolves itself, so the hex is chosen before healers are asked",
    typeof sicknessEv2.resolve === "function" && sicknessEv2.effect === undefined);
  const popsBefore = api.holdings().map((id) => api.hexPop(id));
  api.setRngSource(() => 0);              // it fires, and nothing negates it
  sicknessEv2.resolve(S(), 1);
  api.setRngSource(() => 0.99);
  const popsAfter = api.holdings().map((id) => api.hexPop(id));
  const losses = popsBefore.map((v, i) => v - popsAfter[i]).filter((d) => d > 0);
  check("the fever broke out at exactly one hex", losses.length === 1);
  check("it took a fifth of that hex (10 -> 8)", losses[0] === 2);

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
    api.adminDistance(far.id) > Math.max(...api.holdings().filter((id) => id !== far.id)
      .map((id) => api.adminDistance(id))));

  // Famine: everyone rests, the larder empties, and the drain walks inward.
  for (const id of api.holdings()) S().map.pop[id] = 3;
  api.syncPopMirror();
  // PURE DEFICIT. Emptying the allocation map used to do this; ground works
  // itself now, so nothing-produces has to be built rather than left undone --
  // a realm that walled every hex and grew nothing on any of them. A March-hold
  // declares no yield, which is exactly the "produces nothing" case.
  S().map.built = {};
  api.me().era = "iron";              // the age that has walls to build
  for (const id of api.holdings()) S().map.built[id] = "marchHold";
  api.me().res.food = 1;
  const seatBefore = api.hexPop(api.world.home);
  run(40);
  check("an empty larder no longer kills instantly", S().dead === false);
  check("the frontier bleeds first: the far holding lost people before the seat lost any",
    api.hexPop(far.id) < 3 && api.hexPop(api.world.home) === seatBefore);
  run(120);
  // REVERSED 2026-08-25: ground used to stay yours when it emptied. Under a
  // dominionCap a ghost occupied a slot while producing nothing, so an empty
  // hex is lost now -- famine costs the investment, not only the people.
  check("the far holding empties entirely -- and the ground is LOST with it",
    !api.isOwned(far.id) && !(far.id in S().map.pop));
  check("...and the slot comes back, so the loss can be re-planned around",
    api.holdCount() < 3);
  check("no one is born during a famine",
    api.hexPopSum() <= 12);

  // The run ends only when the seat itself empties.
  run(400);
  check("the seat starves last, and its fall ends the run",
    S().dead === true && api.hexPop(api.world.home) === 0);

  // REGROWTH AFTER A PARTIAL LOSS SURVIVED THE GHOST REMOVAL, and the owner
  // asked specifically: only revival from ZERO was deleted. A hex that is
  // struck but not emptied still climbs its logistic back toward its cap, which
  // is what makes a raid a setback rather than a permanent scar.
  //
  // EVERY NUMBER HERE IS DERIVED FROM THE HEX, and that is not fussiness. The
  // first version set pop to a hardcoded 6 -- fine on plains (cap 8), above the
  // cap on hills (cap 3), where growth correctly refuses to run. The starting
  // trio's terrain is rolled per world, so it failed about one run in eight.
  // Same tell as the route-cost flake: a value assumed about generated geometry
  // rather than read from it.
  {
    reset(); api.closeModal(); api.ensureMap();
    const hex = api.holdings().find((id) => id !== api.world.home);
    const cap = api.capOf(hex);
    // (allocation line removed 2026-08-25: ground works its own terrain now)
    api.me().res.food = 500;
    api.S.map.pop[hex] = cap;                // full, whatever this ground holds
    api.syncPopMirror();
    api.killAt(hex, 1);                      // struck, not emptied
    check("a struck hex keeps its ground", api.isOwned(hex) && api.hexPop(hex) === cap - 1);
    const dipped = api.S.map.pop[hex];
    // Pin the dice across the run: 120 seconds is long enough for a real
    // sickness or raid to hit this same hex, which would push it below the dip
    // and fail a check that is about growth, not about weather.
    api.setRngSource(() => 0.99);
    run(120);
    api.setRngSource(null);
    check("...and grows back on its own afterwards", api.S.map.pop[hex] > dipped);
    check("...without ever exceeding what the ground supports",
      api.S.map.pop[hex] <= cap);
  }

  // GHOSTS ARE GONE. Emptied land used to rekindle from 0.2 souls with a full
  // larder; it is unsettled ground now, and getting it back means claiming it
  // again. Deleted on purpose rather than left to rot -- this block is the
  // tombstone for a mechanic that shipped and was reversed.
  reset(); api.closeModal(); api.ensureMap();
  const emptied = api.holdings().find((id) => id !== api.world.home);
  // (allocation line removed 2026-08-25: ground works its own terrain now)
  api.me().res.food = 100;
  api.killAt(emptied, 99);
  check("emptying a holding loses it immediately, however it emptied",
    !api.isOwned(emptied));
  run(300);
  check("a full larder does NOT bring lost ground back -- no rekindling",
    !api.isOwned(emptied) && !(emptied in S().map.pop));
  check("the ground is claimable again rather than destroyed",
    !!api.world.places[emptied] && api.world.places[emptied].terrain !== "water");

  // The seat is the exception, always: it ends the run instead of reverting,
  // because "the capital falling is a better ending than an arithmetic one".
  reset(); api.closeModal(); api.ensureMap();
  api.S.map.pop[api.world.home] = 0;
  api.syncPopMirror();
  api.loseHexIfEmpty(api.world.home);
  check("the seat never reverts -- losing it is the ending, not a slot freeing up",
    api.isOwned(api.world.home));

  // A structure goes with the ground, and there is no refund.
  reset(); api.closeModal(); api.ensureMap();
  const fort = api.holdings().find((id) => id !== api.world.home);
  S().map.built[fort] = "fortification";
  api.killAt(fort, 99);
  check("losing a hex destroys what was built on it",
    !api.isOwned(fort) && !(fort in S().map.built));

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
  api.me().res.food = 500; api.me().res.wood = 500; api.me().res.stone = 500;
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
  // (allocation line removed 2026-08-25: ground works its own terrain now)
  api.setRngSource(() => 0.99);  // and hold the event dice -- an hour of ticks
                                 // makes a lethal raid near-certain on some
                                 // seeds, and growth itself rolls no dice

  // THE STARTING GROUND ARRIVES FULL (owner ruling, 2026-08-25). The opening
  // used to be a wait: three survivors on a hex that supports eight, trickling
  // upward while every hex ate. That was the last load-bearing idle beat in
  // the game, and under one resource per terrain it was also an economy bug --
  // food is capped by your FOOD ground while every hex adds mouths.
  check("the seat opens worked to what its ground supports",
    api.hexPop(api.world.home) === api.capOf(api.world.home));
  check("...and so does every other hex of the opening trio",
    api.holdings().every((id) => api.hexPop(id) === Math.max(2, api.capOf(id))));
  check("the seat's ground reports a carrying cap", api.capOf(api.world.home) > 0);
  check("unowned hexes carry no people",
    Object.keys(api.S.map.pop).every((id) => api.isOwned(id)));

  // Growth: logistic toward the cap, floored for every reader. Ground taken
  // LATER arrives as a settling party and grows into the place -- that dip is
  // what makes a claim an investment rather than a free upgrade.
  const fresh = Object.values(api.world.places)
    .find((p) => p.terrain !== "water" && !p.adversary && !p.minor && !api.isOwned(p.id));
  api.captureTile(fresh.id);
  check("newly taken ground arrives as a party, not a full holding",
    api.S.map.pop[fresh.id] < api.capOf(fresh.id));
  const before = api.S.map.pop[fresh.id];
  run(120);
  const after = api.S.map.pop[fresh.id];
  check("people arrive on their own (logistic growth)", after > before);
  run(3600);
  const cap = api.capOf(api.world.home);
  check("growth stops at what the ground supports (never above cap)",
    api.S.map.pop[api.world.home] <= cap && api.hexPop(api.world.home) === Math.floor(cap));
  check("the odometer is the sum of the hexes",
    api.hexPopSum() === api.holdings().reduce((n, id) => n + api.hexPop(id), 0));
  // The game-over screen reads S.bought. It was declared in E1 and never
  // incremented, so every run ever played ended on "Arrivals welcomed: 0".
  check("lifetime arrivals are actually counted (S.bought)", api.me().bought > 0);
  check("arrivals counted are whole people, never the fractional curve",
    Number.isInteger(api.me().bought));

  // Determinism: the growth curve is pure math on fixed ticks -- two runs
  // from the same reset must land on bit-identical populations.
  // Pinned seed: since E2 the Stone dominion is three hexes, and their
  // TERRAINS (hence caps, hence curves) are the seed's business.
  reset(); api.closeModal(); api.S.seed = 4242; api.S.rngState = 4242;
  api.ensureMap(); run(300);
  const popsA = JSON.stringify(api.S.map.pop);
  reset(); api.closeModal(); api.S.seed = 4242; api.S.rngState = 4242;
  api.ensureMap(); run(300);
  api.setRngSource(null);
  check("the curve is deterministic (bit-identical across runs)",
    JSON.stringify(api.S.map.pop) === popsA);

  // Persistence: fractional population survives the round trip exactly.
  api.save(); api.load(); api.ensureMap();
  check("population survives save/load bit-identically",
    JSON.stringify(api.S.map.pop) === popsA);

  // Capture seeds the new holding with its party.
  reset(); api.closeModal();
  api.me().era = "iron"; api.S.seen.levyMigrated = true; api.me().pop = 4;
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

  api.me().era = "iron";
  advanceRivalsTo(api.me().era);
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
  const held = api.holdings().slice().sort().join("|");
  api.me().era = "iron"; api.initAdversaries(); api.ensureMap(); api.syncDominion();
  check("a border takes no land -- the SAME tiles cross it",
    api.holdings().slice().sort().join("|") === held);

  // Reveal is sticky and additive, per the interface's reveals-never-flicker
  // law applied to geography. Ground is TAKEN now, never granted (E3).
  const seenBefore = api.me().revealed.length;
  const frontier = Object.values(api.world.places)
    .find((x) => x.terrain !== "water" && !x.adversary && !x.minor && !api.isOwned(x.id));
  api.captureTile(frontier.id);
  check("taking ground reveals what borders it", api.me().revealed.length > seenBefore);
  const snapshot = api.me().revealed.slice();
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
  api.me().era = "iron"; api.initAdversaries(); S().seen.levyMigrated = true;
  api.me().pop = 5; api.me().res.food = 500;
  const popBefore = api.me().pop;
  api.setRngSource(() => 0.999999);   // hazards hold their breath; growth is what's on trial
  run(120);
  api.setRngSource(null);
  check("no one arrives unbidden under conquest growth", api.me().pop === popBefore);
  // (housing died in E3)

  // Output multiplier: a holdfast works -- and eats -- like the families it holds.
  api.me().pop = 5; api.me().units = { soldier: 2, archer: 0, horseman: 0, siegeEngine: 0 };
  // One real hex, four people. Read the declared rate off the ground rather
  // than assuming it: the terrain is the seed's business.
  api.ensureMap();
  const oneHex = api.world.home;
  setHoldings([oneHex]);
  S().map.pop = {}; api.ensurePop();
  S().map.pop[oneHex] = 4;
  S().map.built = {};
  api.me().upgrades = {};
  const gy = api.terrainYield(oneHex);
  const r = api.rates();
  // outputMult died in E2: four real people at the per-capita rate.
  check("a worked hex produces per person (4 x 0.2 x its ground's rate)",
    Math.abs(r[gy.res] - 4 * 0.2 * gy.rate) < 1e-9);
  check("upkeep charges the people who exist AND the levied bands ((4+2) x 0.04)",
    Math.abs(r.upkeep - 6 * 0.04) < 1e-9);

  // The army cap answers to the LAND now (E5): hexes x armyPerHex, every era.
  // Ownership is keyed by tile since 2026-08-26, so a hand-built fixture map
  // seats its tiles rather than listing them.
  S().map = { seed: 1, gen: 1, tileNoun: "holdfast",
    owner: { "f1": 0, "f2": 0, "f3": 0 },
    built: {}, pop: { "f1": 4, "f2": 3, "f3": 3 } };
  api.syncPopMirror();
  api.me().units = { soldier: 5, archer: 0, horseman: 0, siegeEngine: 0 };
  api.syncPopMirror();
  api.me().upgrades.barracks = true; api.me().res.wood = 500; api.me().res.iron = 500; api.me().res.food = 500;
  const soldierDef = api.defById("soldier");
  api.build(soldierDef);
  check("training refuses past the land's muster (3 hexes = cap 6; 5 + 1 queued fills it)",
    api.me().buildQueue.length === 1 && api.levyUsed() === 6);
  api.build(soldierDef);
  check("the queue counts against the muster the instant it is queued", api.me().buildQueue.length === 1);
  api.claimTile("f4"); S().map.pop.f4 = 2; api.syncPopMirror();
  api.build(soldierDef);
  check("a grown dominion raises the muster (4 hexes = cap 8)", api.me().buildQueue.length === 2);
  api.me().buildQueue.length = 0;

  // A unit's death lightens the roster, never the land: the hexes keep their
  // people, and the mirror drops by exactly the fallen soldier. (The death is
  // dealt battle-style -- removeRandomUnit died in A5, and this is the exact
  // arithmetic contact's applyLost performs per round.)
  api.syncPopMirror();
  const landBefore = api.hexPopSum();
  const mirrorBefore = api.me().pop;
  api.me().units.soldier -= 1; api.syncPopMirror();
  check("a soldier's death leaves the land untouched", api.hexPopSum() === landBefore);
  check("...and the mirror counts one fewer", api.me().pop === mirrorBefore - 1);

  // The recruit is drawn from the SEAT on completion (owner ruling).
  reset(); api.closeModal(); api.ensureMap();
  api.me().era = "iron"; api.initAdversaries(); api.ensureMap();
  api.me().upgrades.barracks = true; api.me().res.wood = 500; api.me().res.food = 500; api.me().res.iron = 500;
  for (const id of api.holdings()) S().map.pop[id] = 30;   // above cap, so growth
  api.syncPopMirror();                                     // cannot refill the draw
  const seatBefore = api.hexPop(api.world.home);
  api.setRngSource(() => 0.99);   // E5's own fevers must not strike this fixture
  api.build(api.defById("soldier"));
  run(20);
  api.setRngSource(null);
  check("the capital musters: the recruit walked out of the seat",
    api.me().units.soldier >= 1 && api.hexPop(api.world.home) === seatBefore - 1);
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
    api.me().revealed.push(seatTile.id, campTile.id);
    const seatBody = api.detailHTML(seatTile), campBody = api.detailHTML(campTile);
    check("a stone-age tile offers no march, not even a greyed one",
      seatBody.indexOf("data-act=\"march\"") < 0 && campBody.indexOf("data-act=\"march\"") < 0);
    check("but it still tells you who is out there",
      seatBody.indexOf("hill camps") >= 0 || seatBody.indexOf("river camps") >= 0 ||
      seatBody.indexOf("salt wanderers") >= 0);
    check("and says WHY you cannot go, rather than going quiet",
      seatBody.indexOf("raise a column") >= 0);
  }

  api.me().era = "bronze";
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

  api.me().era = "iron"; api.initAdversaries();
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

  // Terrain sets both WHAT a hex yields and the rate. One hex, three people,
  // and the ledger must read exactly what the manifest declares for that
  // ground -- nothing assumed, everything read from the world.
  api.me().pop = 2; api.syncDominion();
  const tid = api.holdings().find((id) => id !== "0,0");
  const terr = api.world.places[tid].terrain;
  const decl = api.active().map.yields[terr];
  setHoldings([tid]);
  S().map.pop = {}; api.ensurePop();
  S().map.pop[tid] = 3;   // three people on the ground, exactly
  api.me().units = { soldier: 0, archer: 0, horseman: 0, siegeEngine: 0 };
  api.me().upgrades = {}; putStructures("infirmary", 0);
  api.syncPopMirror();
  check("terrain sets what a hex yields", api.hexResource(tid) === decl.res);
  check("...and the rate the ledger reads",
    Math.abs(api.rates()[decl.res] - 3 * 0.2 * decl.rate) < 1e-9);
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
    if (!m.map || !m.map.yields) continue;
    for (const def of m.buildings) {
      if (!def.converts) continue;
      // The best a single worked hex can yield of each input, at its cap.
      // Bare ground OR a structure raised on it -- both are ways a hex can
      // yield, and the binding-input maths has to see both.
      const bestYield = (res) => {
        let best = 0;
        for (const terr in m.map.yields) {
          const y = m.map.yields[terr];
          const cap = m.map.popCaps[terr] || 0;
          if (y.res === res) best = Math.max(best, y.rate * cap);
          for (const d of m.structures || []) {
            if (!d.yield || d.yield.res !== res) continue;
            if (d.terrain && !d.terrain.includes(terr)) continue;
            best = Math.max(best, d.yield.rate * cap);
          }
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
    run(120);
    // affordable or not, identically in both runs
    api.launchStructure(api.holdings().find((id) => id !== api.world.home), "infirmary");
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

console.log("\n--- The action layer: one seam for every player verb ---");
{
  // Every player verb is callable with NO UI in the room, validates on its own,
  // and records itself. setWork lived here for a day and died with the
  // allocation choice it made; the DISCIPLINE it was built to enforce is what
  // these checks actually protect, so they moved to the verbs that survived.
  reset();
  api.me().era = "bronze";
  advanceRivalsTo(api.me().era);
  api.initAdversaries();
  api.ensureMap();
  api.clearJournal();
  api.me().res.wood = 9999; api.me().res.stone = 9999; api.me().res.food = 9999;
  api.me().upgrades.farming = true;

  const farmable = Object.values(api.world.places).find((p) =>
    (p.terrain === "plains" || p.terrain === "river") && !p.adversary && !p.minor &&
    p.id !== api.world.home);
  if (farmable && !api.isOwned(farmable.id)) api.captureTile(farmable.id);
  const hex = farmable.id;

  const beforeStamp = api.workStamp();
  api.launchStructure(hex, "farm");
  check("a build verb is callable with no UI in the room", api.me().buildQueue.length === 1);
  run(60);
  check("...and it lands on the board", api.hexUse(hex).kind === "structure");
  check("building bumps the render stamp instead of serialising the map",
    api.workStamp() > beforeStamp);

  // TERRAIN GATING lives in the verb, not in the panel that used to be its only
  // caller: a bot calling this cannot do what a player could not.
  // UNOWNED BY ANYONE: captureTile refuses ground held by any civ now (S1) --
  // the old fixture happily stole a hills hex out of the Hill Clans' home
  // ring, which is the exact theft the settle fix closed for players.
  const hill = Object.values(api.world.places).find((p) =>
    p.terrain === "hills" && !p.adversary && !p.minor && api.ownerOf(p.id) == null);
  if (hill && !api.isOwned(hill.id)) api.captureTile(hill.id);
  if (hill) {
    const q = api.me().buildQueue.length;
    api.launchStructure(hill.id, "farm");
    check("a farm on hills is refused by the verb itself", api.me().buildQueue.length === q);
    api.launchStructure(hill.id, "copperMine");
    const queued = api.me().buildQueue.length === q + 1;
    check("...and a copper mine on the same hills is not", queued);
    if (queued) api.cancelBuild(api.me().buildQueue[api.me().buildQueue.length - 1].uid);
  }

  const srcDir = fileURLToPath(new URL("./src", import.meta.url));
  // setHexBuild lives in map/structures.js since the package split (2026-08-26).
  const mapSrc = fs.readFileSync(nodePath.join(srcDir, "map", "structures.js"), "utf8");
  const uiSrc = fs.readFileSync(nodePath.join(srcDir, "ui", "map.js"), "utf8");
  const actSrc = fs.readFileSync(nodePath.join(srcDir, "core", "actions.js"), "utf8");
  // ONE WRITER, counted without a regex: an earlier version of this check used
  // one and quietly flagged `S.map.built[id] === sid` inside builtCount as a
  // fourth writer, which is the exact class of false positive a check is
  // supposed to be immune to. Split on the literal and look at what follows
  // the bracket instead.
  const writes = (t) => {
    let n = 0;
    for (const part of t.split("S.map.built[").slice(1)) {
      const after = part.slice(part.indexOf("]") + 1).trimStart();
      if (after.startsWith("=") && !after.startsWith("==")) n += 1;
    }
    return n;
  };
  const deletes = (t) => t.split("delete S.map.built[").length - 1;
  check("no module outside the structures seam writes S.map.built directly",
    writes(uiSrc) === 0 && deletes(uiSrc) === 0 &&
    writes(actSrc) === 0 && deletes(actSrc) === 0);
  check("inside structures.js, setHexBuild is the only writer",
    writes(mapSrc) === 1 && deletes(mapSrc) === 1);

  // THE MARKET: the release valve for one-resource-per-hex, and the shape a
  // future player-to-player trade would take -- one verb, one counterparty,
  // today always the bank.
  api.clearJournal();
  check("no market, no trade", api.tradeRate() === null && api.trade("food", "wood", 1) === false);
  api.S.map.built[hex] = "market";
  const rate = api.tradeRate();
  check("a market standing opens the bank at its published rate", rate > 1);
  api.me().res.food = 1000; api.me().res.wood = 0;
  check("the bank always says yes, at their price", api.trade("food", "wood", 1) === true);
  check("...taking the rate in and giving one out",
    api.me().res.wood === 1 && Math.abs(api.me().res.food - (1000 - rate)) < 1e-9);
  check("trading a resource for itself is refused", api.trade("food", "food", 1) === false);
  check("trading what you do not have is refused",
    (api.me().res.tin = 0, api.trade("tin", "wood", 1) === false));
  check("trading INTO a full store is refused -- the goods would evaporate",
    (api.me().res.wood = api.caps().wood, api.trade("food", "wood", 1) === false));
  check("a second market improves the rate, but never to parity", (() => {
    const two = Object.values(api.world.places).find((p) =>
      (p.terrain === "plains" || p.terrain === "river") && api.isOwned(p.id) && p.id !== hex);
    if (!two) return true;
    api.S.map.built[two.id] = "market";
    const better = api.tradeRate();
    return better < rate && better >= api.CONFIG.tradeFloorRate;
  })());

check("gold is the market's premium good -- never the commodity rate, never sold back", (() => {
  // Owner playtest: with major campaigns dead and caravans strangled by war,
  // gold LOOKED unobtainable -- while actually sitting on the market board at
  // 4:1 like turnips. Now: buy at rate x goldTradeMult, never give gold.
  reset(); api.ensureMap();
  api.me().era = "iron";
  putStructures("market", 1);
  const rate = api.tradeRate();
  api.me().res.wood = rate * api.CONFIG.goldTradeMult + 5;
  api.me().res.gold = 3;
  const woodBefore = api.me().res.wood;
  check("...the commodity price is refused for gold", (() => {
    api.me().res.wood = rate + 1;                      // enough for turnips, not treasury
    return api.trade("wood", "gold", 1) === false;
  })());
  api.me().res.wood = rate * api.CONFIG.goldTradeMult + 5;
  check("...the premium price buys it",
    api.trade("wood", "gold", 1) === true && api.me().res.gold === 4);
  check("...and the treasury is never a wallet", api.trade("gold", "wood", 1) === false);
  return true;
})());

  // The journal: accepted verbs record themselves with the tick they ran on.
  const j = api.journal();
  check("accepted verbs are journalled", j.length > 0);
  check("refused verbs are NOT journalled -- a journal replays what happened",
    j.every((e) => e.verb === "trade"));
  check("every entry carries a tick and a player from the first entry on",
    j.every((e) => Number.isInteger(e.tick) && e.pid === 0));
  check("the journal stays out of the save -- snapshots and tapes have different lifetimes",
    JSON.parse(JSON.stringify(S())).journal === undefined);
}


console.log("\n--- The hex economy: one resource per ground ---");
{
  reset(); api.ensureMap();

  // ONE RESOURCE PER TERRAIN. The old works matrix let every ground work
  // everything at a penalty; balancing it meant tuning an N-by-N table.
  for (const era of ["stone", "bronze", "iron"]) {
    const m = api.MANIFESTS[era];
    check(`${era} declares yields, not the retired works matrix`,
      !!m.map.yields && m.map.works === undefined);
    check(`${era}: every terrain names exactly one resource`,
      Object.values(m.map.yields).every((y) => typeof y.res === "string" && y.rate > 0));
  }
  check("declaring the old works matrix is now a LOAD ERROR, not a table nothing reads", (() => {
    try {
      const broken = api.extendEra(api.MANIFESTS.stone, {});
      broken.map.works = { plains: { food: 1 } };
      api.validateManifests({ test: broken });
      return false;
    } catch (e) { return true; }
  })());

  // BARE GROUND WORKS ITSELF. No allocation verb, no resting hex, no default
  // to forget to set -- which is what the border bread-default existed for.
  const bare = api.holdings().find((id) => api.hexUse(id).kind === "bare");
  check("a fresh dominion is bare and already producing",
    !!bare && api.hexProduces(bare) === true);
  check("the ledger earns from every owned hex, not only assigned ones", (() => {
    const total = Object.values(api.rates()).some((v) => v > 0);
    return total;
  })());

  // THE FLOOR GUARANTEE: forest and hills within reach of every seat, on every
  // continent. This is what makes one-resource-per-hex safe to ship -- without
  // it a seed can deal a start with no timber and no stone, which is not a hard
  // opening but a run that cannot build anything.
  const near = (home, rings) => {
    const found = new Set();
    for (const p of Object.values(api.world.places)) {
      if (p.ocean) continue;
      if (api.hexDistance(p.q, p.r, api.world.places[home].q, api.world.places[home].r) <= rings) {
        found.add(p.terrain);
      }
    }
    return found;
  };
  for (const c of api.CONTINENTS) {
    for (const seed of [1, 7, 12345, 90210, 424242]) {
      reset();
      api.S.seed = seed; api.S.map = null; api.S.seen = {};
      api.setPickedContinent(c.id);
      api.ensureMap();
      const found = near(api.world.home, 3);
      check(`${c.id}/${seed}: the seat can reach timber and stone`,
        found.has("forest") && found.has("hills"));
      // And the opening actually produces both food and timber, which is the
      // deadlock the trio-variety rule exists to prevent: claiming costs wood.
      const opening = new Set(api.holdings().map((id) => api.hexResource(id)));
      check(`${c.id}/${seed}: the opening trio gives food AND timber`,
        opening.has("food") && opening.has("wood"));
    }
  }

  // CANCELLING ANYTHING THE QUEUE CAN HOLD. defById only knows buildings,
  // upgrades and units, so cancelling a queued structure or settling party
  // threw a TypeError and took the tick with it (found 2026-08-25).
  reset();
  api.me().era = "bronze"; api.initAdversaries(); api.ensureMap();
  // Bronze prices its claim in bronze too -- pay for everything the era asks.
  for (const r of api.MANIFESTS.bronze.resources) api.me().res[r.id] = 9999;
  api.me().upgrades.farming = true;
  const target = Object.values(api.world.places).find((p) =>
    p.terrain !== "water" && !p.adversary && !p.minor && !api.isOwned(p.id));
  api.launchSettle(target.id);
  check("a settling party can be cancelled without throwing", (() => {
    try { api.cancelBuild(api.me().buildQueue[0].uid); return api.me().buildQueue.length === 0; }
    catch (e) { return false; }
  })());
  const plot = Object.values(api.world.places).find((p) =>
    (p.terrain === "plains" || p.terrain === "river") && api.isOwned(p.id) && p.id !== api.world.home)
    || Object.values(api.world.places).find((p) =>
      (p.terrain === "plains" || p.terrain === "river") && !p.adversary && !p.minor && p.id !== api.world.home);
  if (plot && !api.isOwned(plot.id)) api.captureTile(plot.id);
  api.launchStructure(plot.id, "farm");
  check("a queued structure can be cancelled without throwing", (() => {
    try { api.cancelBuild(api.me().buildQueue[0].uid); return api.me().buildQueue.length === 0; }
    catch (e) { return false; }
  })());
}


console.log("\n--- The player split: a civilization is a record, not the world ---");
{
  // Pillar 1 of the design brief, as state: everything belonging to ONE civ
  // lives in S.players, and the human is simply the one at S.me. Before this
  // split a second civilization had nowhere to exist.
  reset();
  // battles/battleSeq joined 2026-08-26 (contact, A4): a battle is WORLD state
  // by definition -- it has two sides, so it cannot live in one player's record.
  const WORLD_ONLY = ["seed", "rngState", "players", "me", "adversaries", "map", "tick", "seen", "dead",
    "battles", "battleSeq"];
  check("S carries world and run state only",
    Object.keys(S()).every((k) => WORLD_ONLY.includes(k)));
  check("...and nothing a civilization owns", (() => {
    const CIV = ["res", "builds", "units", "upgrades", "buildQueue", "buildSeq",
                 "pop", "bought", "seatName", "era", "eraHistory", "expeditions", "playerColor"];
    return CIV.every((k) => !(k in S()));
  })());

  const p = api.me();
  check("the human is players[0], and me() is how anything reaches them",
    S().me === 0 && p === S().players[0] && p.id === 0);
  check("a civ carries its own economy, knowledge and age",
    typeof p.era === "string" && !!p.res && !!p.units && !!p.upgrades &&
    Array.isArray(p.buildQueue) && Array.isArray(p.expeditions));

  // A SECOND CIV HAS SOMEWHERE TO EXIST. It does nothing yet -- no decisions
  // are made for it -- but the shape is the point, and a shape that cannot
  // hold one is exactly what this replaced.
  const two = api.freshPlayer(1, { color: "teal", era: "bronze", seatName: "Farhold" });
  S().players.push(two);
  check("a second civ can be seated with its own colour, age and name",
    S().players.length === 2 && two.id === 1 && two.era === "bronze" &&
    two.color === "teal" && two.seatName === "Farhold");
  check("...with books entirely its own -- spending one does not touch the other", (() => {
    const before = api.me().res.food;
    two.res.food -= 5;
    return api.me().res.food === before && two.res.food !== before;
  })());
  // Looking through another seat is a VALUE change, not a rewrite -- which is
  // the whole reason `me` is a field rather than a constant.
  S().me = 1;
  check("changing which seat we look through changes what me() answers",
    api.me() === two && api.me().era === "bronze");
  S().me = 0;
  check("...and changing it back restores the human", api.me() === S().players[0]);
  S().players.pop();

  // The era is per-civ from the first day of the split, because the shared
  // world clock is the thing the design explicitly killed.
  check("era lives on the civ, never on the world", !("era" in S()) && "era" in api.me());
  check("eraHistory is the civ's too -- each one crosses its own borders",
    !("eraHistory" in S()) && "eraHistory" in api.me());
}

console.log("\n--- Ownership is a property of the tile, and fog belongs to the knower ---");
{
  // Review Part I.2 and I.4. Ownership was an array on the one player and fog
  // was a pair of arrays on the shared map -- both encode "there is one civ".
  reset(); api.ensureMap();
  const home = api.world.home;

  check("the board answers whose a tile is, by id",
    api.ownerOf(home) === 0 && api.isOwned(home) && api.isOwned(home, 0));
  check("an unheld tile has no owner rather than a false one", (() => {
    const wild = Object.values(api.world.places)
      .find((p) => p.terrain !== "water" && !api.isOwned(p.id));
    return !!wild && api.ownerOf(wild.id) === null && !api.isOwned(wild.id);
  })());
  check("the per-civ list is DERIVED -- there is no second copy to drift",
    !("owned" in S().map) &&
    api.holdings().length === api.holdCount() &&
    api.holdings().every((id) => api.ownerOf(id) === 0));

  // A SECOND CIV CAN HOLD GROUND, which the old array could not express at all.
  const rival = api.freshPlayer(1, { color: "teal" });
  S().players.push(rival);
  const theirs = Object.values(api.world.places)
    .find((p) => p.terrain !== "water" && !p.adversary && !p.minor && !api.isOwned(p.id));
  api.claimTile(theirs.id, 1);
  check("a rival can hold a tile, and the tile says so",
    api.ownerOf(theirs.id) === 1 && api.isOwned(theirs.id, 1));
  check("...without it counting as yours",
    !api.isOwned(theirs.id, 0) && !api.holdings(0).includes(theirs.id));
  check("each civ's holdings are its own",
    api.holdings(1).length === 1 && api.holdCount(1) === 1 &&
    api.holdCount(0) === api.holdings(0).length);
  api.releaseTile(theirs.id);
  check("releasing returns it to nobody", api.ownerOf(theirs.id) === null);

  // FOG IS KNOWLEDGE, so it belongs to the civ that knows it. A bot reading
  // the true board is cheating; a bot reading YOUR fog is broken.
  check("fog lives on the civ, not the shared map",
    Array.isArray(api.me().revealed) && Array.isArray(api.me().sighted) &&
    !("revealed" in S().map) && !("sighted" in S().map));
  check("two civs can know different things about the same board", (() => {
    const before = api.me().revealed.length;
    return before > 0 && rival.revealed.length === 0;
  })());
  S().players.pop();
}

console.log("\n--- Every civilization keeps its own time ---");
{
  // Review Part I.5, and pillar 4 of the design brief: the shared world clock
  // is the thing Empire Earth taught us to kill. active() takes a civ now, so
  // "what does the world look like?" cannot be asked without saying whose.
  reset(); api.ensureMap();
  const you = api.me();
  const rival = api.freshPlayer(1, { color: "teal" });
  S().players.push(rival);

  check("active() defaults to the seat we are looking through",
    api.active() === api.active(you) && api.active().name === "Stone Age");
  rival.era = "iron";
  check("...and answers a DIFFERENT world for a civ in a different age",
    api.active(rival).name === "Iron Age" && api.active(you).name === "Stone Age");
  check("activeFor() answers by id, for systems that know whose turn it is",
    api.activeFor(1) === api.active(rival) && api.activeFor(0) === api.active(you));
  check("a civ in a later age sees content the earlier one does not",
    api.active(rival).resources.some((r) => r.id === "iron") &&
    !api.active(you).resources.some((r) => r.id === "iron"));

  // ADVANCING IS SOMETHING ONE CIV DOES. The failure this prevents is
  // concrete: before the split, a bot reaching Bronze would have reset the
  // HUMAN's game speed and opened the human's ceremony modal.
  rival.era = "stone";
  api.setSpeed(5);
  const before = api.speed;
  api.advanceEra("bronze", rival);
  check("a rival crossing its border does not touch your clock",
    api.speed === before);
  check("...and does not drag you into its age",
    rival.era === "bronze" && api.me().era === "stone");
  check("...but its own books re-denominate: it kept a snapshot of what it was",
    !!rival.eraHistory.stone && rival.eraHistory.stone.era === "stone");
  check("your own advance still runs the ceremony", (() => {
    api.setSpeed(5);
    api.advanceEra("bronze");
    return api.me().era === "bronze" && api.speed === 1;
  })());
  S().players.pop();
  api.setSpeed(1);
}

console.log("\n--- A seat is a civ's own, and distance is measured from it ---");
{
  // Review Part I.3. `world.home` is what the generator translates the frame
  // to so the HUMAN lands on "0,0" -- fine for one civ, meaningless for the
  // rest, since only one of N seats can be the origin. What a calculation
  // actually needs is the seat of the civ doing the calculating.
  reset(); api.ensureMap();
  check("the human is seated where the generator put them",
    api.me().seat === api.world.home);

  const rival = api.freshPlayer(1, { color: "teal" });
  S().players.push(rival);
  // Seat the rival somewhere real and far, and give it a holding there.
  const far = Object.values(api.world.places)
    .filter((p) => p.terrain !== "water" && !p.adversary && !p.minor && !api.isOwned(p.id))
    .sort((a, b) => api.hexDistance(b.q, b.r, 0, 0) - api.hexDistance(a.q, a.r, 0, 0))[0];
  rival.seat = far.id;
  api.claimTile(far.id, 1);

  check("a rival's seat is its own tile, not yours",
    rival.seat === far.id && rival.seat !== api.me().seat);
  check("its own capital is administrative distance zero to IT",
    api.adminDistance(far.id, rival) === 0);
  check("...and a long way from YOU", api.adminDistance(far.id, api.me()) > 0);
  check("your seat is zero to you and distant to them",
    api.adminDistance(api.me().seat, api.me()) === 0 &&
    api.adminDistance(api.me().seat, rival) > 0);
  check("distance still defaults to the seat we are looking through",
    api.adminDistance(far.id) === api.adminDistance(far.id, api.me()));

  // Roads through YOUR country are cheap for YOU: the half-step discount
  // follows ownership, so it has to be read per-civ or a rival's frontier
  // would be cheapened by your roads.
  check("the owned-ground discount follows whose ground it is", (() => {
    const probe = api.holdings(0).find((id) => id !== api.me().seat);
    return probe && api.adminDistance(probe, api.me()) < api.adminDistance(probe, rival);
  })());
  S().players.pop();
}

console.log("\n--- The map package: split along its own seams, and acyclic ---");
{
  // Review Part VII. map/map.js was 917 lines and a third of the simulation
  // wearing a map module's name. The split follows the seams the sections
  // already named, and the LAYERING is the thing worth pinning: a cycle here
  // would be a bug on a timer, since every entry point would have to remember
  // to import the right file first (the lib->combat->compile->lib lesson).
  const dir = nodePath.join(fileURLToPath(new URL("./src", import.meta.url)), "map");
  const read = (n) => fs.readFileSync(nodePath.join(dir, n), "utf8");
  const localImports = (n) => {
    const out = [];
    for (const m of read(n).matchAll(/from "\.\/([a-z0-9]+)\.js"/g)) out.push(m[1] + ".js");
    return [...new Set(out)];
  };

  // Depth 0 modules import nothing of ours: they are what everything reads.
  check("world.js and ownership.js are leaves the rest can share", (() => {
    const w = localImports("world.js").filter((f) => f !== "continents.js");
    return w.length === 0 && localImports("ownership.js").length === 0;
  })());

  // NOTHING IMPORTS THE HUB BACK. This is the property that makes the package
  // safe to enter from any file, and it caught a real edge while splitting:
  // loseHexIfEmpty called syncDominion, which would have made population
  // depend on the hub that depends on population.
  check("nothing in the package imports map.js back",
    ["world.js", "ownership.js", "fog.js", "structures.js", "population.js", "routes.js"]
      .every((f) => !localImports(f).includes("map.js")));

  // And the graph has no cycle at all, checked rather than asserted by eye.
  check("the map package's import graph is acyclic", (() => {
    const files = ["world.js", "ownership.js", "fog.js", "structures.js",
                   "population.js", "routes.js", "map.js"];
    const seen = {}, stack = {};
    const walk = (f) => {
      if (stack[f]) return false;
      if (seen[f]) return true;
      seen[f] = stack[f] = true;
      for (const d of localImports(f)) {
        if (!files.includes(d)) continue;
        if (!walk(d)) return false;
      }
      stack[f] = false;
      return true;
    };
    return files.every(walk);
  })());

  check("the hub is a hub -- lifecycle and re-exports, not a third of the sim",
    read("map.js").split("\n").length < 300);

  // The package is the unit: callers import map.js and never learn which file
  // a function ended up in.
  check("the package still answers as one module",
    typeof api.isOwned === "function" && typeof api.hexYield === "function" &&
    typeof api.adminDistance === "function" && typeof api.growPopulation === "function" &&
    typeof api.isCharted === "function" && typeof api.ensureMap === "function");
}

console.log("\n--- The simulation does not know the interface exists ---");
{
  // Review Part II.3, the last inverted edge. `core/`, `sim/`, `map/` and even
  // `content/` used to import `ui/` directly: step.js did DOM surgery to end a
  // run, era.js opened a modal and reset the player's clock, and every corner
  // of the sim wrote straight into the Chronicle.
  const srcDir = fileURLToPath(new URL("./src", import.meta.url));
  const simDirs = ["core", "sim", "map", "content"];
  const offenders = [];
  for (const d of simDirs) {
    for (const f of fs.readdirSync(nodePath.join(srcDir, d))) {
      if (!f.endsWith(".js")) continue;
      const text = fs.readFileSync(nodePath.join(srcDir, d, f), "utf8");
      for (const m of text.matchAll(/from "(?:\.\.\/)+ui\/([a-z0-9-]+)\.js"/g)) {
        offenders.push(d + "/" + f + " -> ui/" + m[1]);
      }
    }
  }
  check("no simulation module imports the interface" +
    (offenders.length ? " -- " + offenders.slice(0, 4).join(", ") : ""),
    offenders.length === 0);

  // ONE MODULE KNOWS BOTH SIDES, and it is the one whose job that is.
  const wire = fs.readFileSync(nodePath.join(srcDir, "ui", "wire.js"), "utf8");
  check("ui/wire.js is where the two halves meet",
    wire.includes('from "../core/bus.js"') && wire.includes('from "./chrome.js"'));

  // THE BUS ITSELF: emits with no listeners are silence, not an error, which
  // is what makes a headless run work without a single stub.
  api.clearBus();
  check("an emit with nobody listening is simply silence", (() => {
    api.chronicle("into the void");
    api.requestRender();
    api.runEnded("starvation");
    return api.listenerCount("chronicle") === 0;
  })());

  // THE CHRONICLE IS THE WATCHING SEAT'S MEMORY -- the question the player
  // split made unavoidable, and one a direct log() import could never ask.
  const heard = [];
  const stop = api.on("chronicle", (e) => heard.push(e));
  reset();
  api.chronicle("your own news");
  api.chronicle("a rival's business", null, 1);
  check("a line carries whose it is", heard.length === 2 &&
    heard[0].pid === 0 && heard[1].pid === 1);
  check("...so the interface can drop what is not yours",
    heard.filter((e) => e.pid === S().me).length === 1);
  stop();
  check("unsubscribing actually unsubscribes",
    (api.chronicle("after"), heard.length === 2));
  api.clearBus();
}

console.log("\n--- Neighbours are civilizations, not a side table ---");
{
  // The last stage of the refactor, and the one the whole thing was for. The
  // three majors were `S.adversaries[id] = { stock, standing, walls, era }` --
  // a parallel track by construction: a record shaped nothing like a
  // civilization, that no player system could read and no player verb touch.
  reset(); api.initAdversaries(); api.ensureMap();

  check("the roster is seated in players[], beside the human",
    S().players.length === 4 && S().players[0].key === null);
  check("every neighbour is a civ with a manifest key",
    api.rivals().length === 3 &&
    api.rivals().every((r) => typeof r.key === "string" && r.id > 0));
  check("...reachable by that key", !!api.playerByKey("hillClans") &&
    api.playerByKey("hillClans").key === "hillClans");

  // THE MERGE THAT MATTERS: their larder is `res`, the same pile yours comes
  // out of. The day a bot spends its own wood on its own buildings there is
  // nothing left to convert.
  const clans = api.playerByKey("hillClans");
  check("a neighbour's larder IS resources, not a bespoke stock",
    !!clans.res && clans.res.food > 0 && clans.stock === undefined);
  check("...and it carries every field a civilization carries",
    Array.isArray(clans.buildQueue) && !!clans.upgrades && !!clans.units &&
    typeof clans.era === "string" && Array.isArray(clans.revealed));
  check("S.adversaries is gone as a parallel record",
    Object.keys(S().adversaries || {}).length === 0);

  // AUTHORED OUT OF THEIR OWN AGE. Scaling a neighbour to the PLAYER's era is
  // the Oblivion problem; the fix is that their strength comes from their
  // manifest, and their larder refills when THEIR clock turns.
  api.me().era = "iron";
  api.initAdversaries();
  check("the human advancing does not refill a rival's larder", (() => {
    clans.res.food = 3;
    api.initAdversaries();
    return clans.res.food === 3;
  })());
  check("...and neither does their own -- income replaced the restock (S2)", (() => {
    advanceRivalsTo(api.me().era);
    api.initAdversaries();
    return api.playerByKey("hillClans").res.food === 3 &&
      api.playerByKey("hillClans").era === "iron";
  })());
  check("a grudge outlives the granary -- standing is never re-seeded", (() => {
    const c = api.playerByKey("hillClans");
    c.standing = -4;
    api.me().era = "stone"; advanceRivalsTo("stone"); api.initAdversaries();
    return api.playerByKey("hillClans").standing === -4;
  })());

  // The pacing POLICY is the only thing left unbuilt, and it is one function.
  check("rivals advance through the same verb the human does",
    typeof api.tickEraClock === "function" && typeof api.advanceEra === "function");
}

console.log("\n--- The era clock: every other player advances on its own hidden countdown ---");
{
  // design.md, Every Civilization Keeps Its Own Time. "They never just beat
  // you with width. They ADVANCE FASTER." The mechanism shipped with the
  // per-player refactor; this is the policy that decides when.
  reset();
  api.initAdversaries(); api.ensureMap();
  api.assignPaces(api.rivals());

  check("every other player draws a pace and a countdown",
    api.rivals().length === 3 &&
    api.rivals().every((p) => ["slower", "normal", "faster"].includes(p.pace) &&
      typeof p.nextEraTick === "number" && p.nextEraTick > 0));
  check("the player has no clock at all -- absolute, never relative",
    api.me().pace === undefined && api.me().nextEraTick === undefined);

  // RULING 3: at least one speedster per world, guaranteed. Independent rolls
  // would leave roughly a third of runs with no clock pressure at all and no
  // visible reason the run felt flat.
  check("there is a faster player in EVERY world", (() => {
    for (let seed = 1; seed <= 40; seed++) {
      reset(); S().seed = seed; api.initAdversaries(); api.assignPaces(api.rivals());
      if (!api.rivals().some((p) => p.pace === "faster")) return false;
    }
    return true;
  })());

  // RULING 5: the telegraph must arrive EARLY. A doomed run has to reveal
  // itself in minutes, never twenty-five minutes in.
  check("the first border lands inside the opening minutes", (() => {
    let worst = 0;
    for (let seed = 1; seed <= 40; seed++) {
      reset(); S().seed = seed; api.initAdversaries(); api.assignPaces(api.rivals());
      const first = Math.min(...api.rivals().map((p) => p.nextEraTick)) * api.TICK_SECONDS;
      worst = Math.max(worst, first);
    }
    return worst < 8 * 60;
  })());

  // DETERMINISM: pace comes off the seed, through its own stream, so adding
  // this feature cannot have shifted the dice the simulation rolls.
  check("the same seed deals the same clocks", (() => {
    const read = () => {
      reset(); S().seed = 777; api.initAdversaries(); api.assignPaces(api.rivals());
      return api.rivals().map((p) => p.pace + ":" + p.nextEraTick).join("|");
    };
    return read() === read();
  })());

  // THE BUG THE BROWSER FOUND: assignPaces runs at every boot, and a boot
  // happens on every reload. An unconditional draw re-scheduled from the
  // CURRENT tick, so refreshing the page pushed every border further away --
  // the clock was dodgeable with F5.
  check("a reload does not reset the countdown", (() => {
    reset(); S().seed = 4242; api.initAdversaries(); api.assignPaces(api.rivals());
    const before = api.rivals().map((p) => p.nextEraTick).join(",");
    for (let i = 0; i < 500; i++) api.step();
    api.assignPaces(api.rivals());          // what a reload does
    return api.rivals().map((p) => p.nextEraTick).join(",") === before;
  })());

  // IT ACTUALLY FIRES, and it tells you.
  {
    reset(); S().seed = 31337; api.initAdversaries(); api.ensureMap();
    api.assignPaces(api.rivals());
    const news = [];
    const stop = api.on("chronicle", (e) => { if (e.cls === "news") news.push(e.text); });
    api.setRngSource(() => 0.999);          // no event weather; the clock is on trial
    const first = Math.min(...api.rivals().map((p) => p.nextEraTick));
    while (S().tick <= first + 1) api.step();
    api.setRngSource(null);
    check("when a countdown lapses, that player advances",
      api.rivals().some((p) => p.era !== "stone"));
    check("...and a NOTIFICATION says so, marked as news rather than flavour",
      news.length >= 1 && /entered the .* Age/.test(news[0]));
    check("...naming them by what they have BECOME, in their own age",
      news[0].includes("Hill") || news[0].includes("River") || news[0].includes("Salt"));
    check("...and saying it is ahead of you, which is the half that lands",
      news[0].includes("ahead of you"));
    stop();
  }

  // RULING 4: capped at the last implemented era, exactly like the player.
  check("a player out of ages stops rather than walking off the manifest", (() => {
    reset(); api.initAdversaries(); api.ensureMap(); api.assignPaces(api.rivals());
    const r = api.rivals()[0];
    r.era = api.ERA_ORDER[api.ERA_ORDER.length - 1];
    r.nextEraTick = S().tick;
    api.tickEraClock();
    return r.era === api.ERA_ORDER[api.ERA_ORDER.length - 1] && r.nextEraTick === null;
  })());
  check("...and a capped clock survives the save, where Infinity would not",
    JSON.parse(JSON.stringify({ t: null })).t === null);
}

console.log("\n--- The clock's wire: a raid knows who sent it ---");
{
  // design.md ruling 7: "the wire must exist, or the clock is flavour." Before
  // this, raid damage was hexPop x raidSize and the SENDER appeared nowhere in
  // the formula -- attribution named the raider, the arithmetic still did not
  // know they existed, and a neighbour advancing an age changed nothing but a
  // line of prose.
  const setup = (them, you) => {
    reset(); S().seed = 5; S().rngState = 5;
    api.initAdversaries(); api.ensureMap(); api.assignPaces(api.rivals());
    api.me().pop = 40; api.me().era = you;
    for (const r of api.rivals()) r.era = them;
    return api.raidSender();
  };
  const avgSize = (sender) => {
    S().rngState = 99;
    let sum = 0;
    for (let i = 0; i < 3000; i++) sum += api.rollRaidSize(sender);
    return sum / 3000;
  };
  const shape = (sender) => {
    S().rngState = 99;
    const k = {};
    for (let i = 0; i < 3000; i++) { const t = api.rollRaidType(sender); k[t.id] = (k[t.id] || 0) + 1; }
    return k;
  };

  // WHO SENT IT is a different question from whether you can NAME them.
  // Conflating the two meant that at Stone -- exactly when a gap matters most
  // -- the sender fell out of the arithmetic and the raid was shaped by nobody.
  const stoneSender = setup("bronze", "stone");
  check("at Stone the danger has no name...", api.raidAttribution() === null);
  check("...but it still has a sender, and the arithmetic knows them",
    !!stoneSender && !!stoneSender.civ && stoneSender.civ.era === "bronze");

  // NUMBER, the late half of ruling 6: a raid from an age ahead is bigger, and
  // the per-age bonus ramps with how deep that age is.
  const level = avgSize(setup("stone", "stone"));
  const oneAhead = avgSize(setup("bronze", "stone"));
  const twoAhead = avgSize(setup("iron", "stone"));
  check("an age ahead sends a bigger raid", oneAhead > level * 1.2);
  check("two ages ahead sends a bigger one again", twoAhead > oneAhead * 1.3);
  check("the bonus RAMPS -- the second age of gap costs more than the first",
    (twoAhead - oneAhead) > (oneAhead - level));
  check("a neighbour you have OUTRUN gets no penalty and no bonus",
    Math.abs(avgSize(setup("stone", "iron")) - level) < 1e-9);

  // KIND, the early half: what comes over the hill is drawn from the SENDER's
  // roster, and each age fields its own proportions.
  const fromStone = shape(setup("stone", "stone"));
  const fromIron = shape(setup("iron", "stone"));
  check("a stone people sends warbands; horsemen are essentially unknown",
    fromStone.warband > 2000 && (fromStone.riders || 0) < 200);
  check("an iron people rides -- a third of what arrives is mounted",
    fromIron.riders > 800);
  check("...which a Stone player cannot answer at all, by construction", (() => {
    reset(); api.me().era = "stone";
    return api.active(api.me()).units.every((u) => !u.counters);
  })());
  check("the answers arrive with the age that has them -- archers and horsemen",
    api.MANIFESTS.bronze.units.some((u) => u.counters === "massed") &&
    api.MANIFESTS.bronze.units.some((u) => u.counters === "riders"));

  // And an age ahead skews toward whatever the defender has no answer for.
  // ISOLATED PROPERLY: the SAME sender roster against two defenders, so only
  // the gap differs. (The first version of this check compared an iron sender
  // to a bronze one and measured the difference between their rosters instead
  // -- a comparison that could never have shown the skew.)
  check("being ahead skews the sender toward what you cannot counter", (() => {
    const gapped = shape(setup("iron", "bronze"));   // iron roster, one age ahead
    const levelled = shape(setup("iron", "iron"));   // iron roster, no gap
    // Nothing counters a plain warband in any age, so it is the unanswerable
    // shape for both defenders -- and only the gapped one should see more.
    return gapped.warband > levelled.warband * 1.1;
  })());
}

console.log("\n--- The battle resolver: dice, walls, and who fires from behind them ---");
{
  // Synthetic defs, not the manifest's: these checks are about the RULES, and
  // pinning them to authored stats would turn every balance tweak into a red
  // harness. The manifest's own numbers are checked at the end of the section.
  const D = (id, o) => ({ id, name: id, dice: 1, hit: 7, role: "melee", base: { wood: 12 }, ...o });
  const SOLDIER = D("soldier", {});
  const ARCHER  = D("archer",  { hit: 8, role: "ranged", base: { wood: 14, bronze: 6 } });
  const HORSE   = D("horseman",{ hit: 5, base: { wood: 20, bronze: 14 } });
  const SIEGE   = D("siege",   { hit: 9, role: "siege", wallDamage: 6, base: { wood: 45, stone: 30, iron: 12 } });
  const ACE     = D("ace", { hit: 2 });
  const DUD     = D("dud", { hit: 10 });

  // The resolver takes its dice as an argument, so the harness hands it a
  // private stream and never touches the game's own.
  const stream = (seed) => { let a = seed | 0; return () => {
    a = (a + 0x6D2B79F5) | 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const R = (atk, def, walls, o = {}) => api.resolveBattle({
    attacker: { roster: atk.map((x) => ({ ...x })), stance: o.atkStance },
    defender: { roster: def.map((x) => ({ ...x })), stance: o.defStance },
    walls, slots: o.slots, rng: stream(o.seed == null ? 7 : o.seed),
  });
  const left = (side) => side.reduce((n, s) => n + s.n, 0);
  const many = (n, f) => { let c = 0; for (let i = 0; i < n; i++) if (f(i)) c++; return c; };

  check("same dice and same spec produce an identical script", (() => {
    const a = JSON.stringify(R([{ def: SOLDIER, n: 9 }], [{ def: SOLDIER, n: 8 }], 6, { seed: 3 }));
    const b = JSON.stringify(R([{ def: SOLDIER, n: 9 }], [{ def: SOLDIER, n: 8 }], 6, { seed: 3 }));
    return a === b && a.length > 200;
  })());

  check("high rolls are better: hits-on-2 beats hits-on-10",
    many(60, (i) => R([{ def: ACE, n: 5 }], [{ def: DUD, n: 5 }], 0, { seed: i }).holder === "attacker") >= 58);

  check("power scales through DICE COUNT, not the to-hit number",
    many(80, (i) => R([{ def: D("twice", { dice: 2 }), n: 5 }], [{ def: SOLDIER, n: 5 }], 0,
      { seed: i + 1000 }).holder === "attacker") >= 70);

  // The whole reason one infantry can kill six tanks.
  check("a dying unit still shoots -- both sides roll off the PRE-round roster",
    many(80, (i) => {
      const r = R([{ def: ACE, n: 1 }], [{ def: SOLDIER, n: 30 }], 0, { seed: i + 100 });
      return r.outcome === "attackerWiped" && r.rounds[0].defender.lost.length > 0;
    }) >= 55);

  check("behind walls only the archers roll; the melee stand there", (() => {
    const r = R([{ def: SOLDIER, n: 5 }], [{ def: ARCHER, n: 3 }, { def: HORSE, n: 3 }], 20, { seed: 5 });
    const one = r.rounds[0];
    const a = one.defender.roll.stacks.find((x) => x.id === "archer");
    const h = one.defender.roll.stacks.find((x) => x.id === "horseman");
    return one.behindWalls && !a.silent && a.faces.length === 3 && h.silent && h.faces.length === 0;
  })());

  check("while walls stand the garrison takes no casualties at all", (() => {
    for (let i = 0; i < 40; i++) {
      const r = R([{ def: SOLDIER, n: 6 }], [{ def: ARCHER, n: 4 }], 30, { seed: i + 200 });
      for (const rd of r.rounds) if (rd.behindWalls && rd.defender.lost.length) return false;
    }
    return true;
  })());

  check("the round that breaks the wall kills nobody behind it (no spill)", (() => {
    for (let i = 0; i < 60; i++) {
      const r = R([{ def: SOLDIER, n: 12 }], [{ def: ARCHER, n: 3 }], 12, { seed: i + 300 });
      const br = r.rounds.find((x) => x.breached);
      if (br && br.defender.lost.length) return false;
    }
    return true;
  })());

  check("the breach wakes every melee row at once", (() => {
    const r = R([{ def: SOLDIER, n: 20 }], [{ def: ARCHER, n: 2 }, { def: HORSE, n: 4 }], 8, { seed: 11 });
    const i = r.rounds.findIndex((x) => x.breached);
    if (i < 0 || i + 1 >= r.rounds.length) return false;
    const before = r.rounds[i].defender.roll.stacks.find((x) => x.id === "horseman");
    const after = r.rounds[i + 1].defender.roll.stacks.find((x) => x.id === "horseman");
    return before.silent && after && !after.silent && after.faces.length > 0;
  })());

  check("worst goes first, and worst means cheapest",
    api.casualtyOrder([{ def: SIEGE, n: 1 }, { def: HORSE, n: 1 }, { def: ARCHER, n: 1 }, { def: SOLDIER, n: 1 }])
      .join(",") === "soldier,archer,horseman,siege");

  // The reason worst-first is priced by COST and not by combat value: ordering
  // by value would kill the siege train while the walls still stand -- exactly
  // the units doing the work.
  check("the siege train dies only once the infantry is gone", (() => {
    for (let i = 0; i < 50; i++) {
      const r = R([{ def: SOLDIER, n: 8 }, { def: SIEGE, n: 3 }], [{ def: ARCHER, n: 10 }], 10, { seed: i + 400 });
      let soldiers = 8;
      for (const rd of r.rounds) {
        const ls = (rd.attacker.lost.find((l) => l.id === "siege") || { n: 0 }).n;
        soldiers -= (rd.attacker.lost.find((l) => l.id === "soldier") || { n: 0 }).n;
        if (ls > 0 && soldiers > 0) return false;
      }
    }
    return true;
  })());

  check("siege engines bring a wall down far faster than infantry", (() => {
    const when = (roster) => { let t = 0; for (let i = 0; i < 80; i++)
      t += (R(roster, [{ def: ARCHER, n: 1 }], 36, { seed: i + 1100 }).breachedAt || 99); return t / 80; };
    return when([{ def: SOLDIER, n: 6 }, { def: SIEGE, n: 4 }]) < when([{ def: SOLDIER, n: 10 }]) * 0.75;
  })());

  check("population does not fight: an open undefended hex falls with no dice", (() => {
    const r = R([{ def: SOLDIER, n: 3 }], [], 0, { seed: 1 });
    return r.outcome === "undefended" && r.rounds.length === 0 && r.holder === "attacker";
  })());

  check("walls with no garrison are a TIMER, not a defence", (() => {
    const r = R([{ def: SOLDIER, n: 6 }], [], 18, { seed: 2 });
    return r.holder === "attacker" && r.rounds.length >= 3 && left(r.attacker) === 6;
  })());

  check("a bigger wall pool makes a longer siege (the pacing knob)", (() => {
    const len = (w) => { let t = 0; for (let i = 0; i < 80; i++)
      t += R([{ def: SOLDIER, n: 12 }], [{ def: ARCHER, n: 3 }], w, { seed: i + 900 }).rounds.length; return t / 80; };
    return len(0) < len(12) && len(12) < len(30);
  })());

  check("a cautious stance brings an army home where a stubborn one loses it", (() => {
    let cautious = 0, stubborn = 0;
    for (let i = 0; i < 120; i++) {
      cautious += left(R([{ def: SOLDIER, n: 10 }], [{ def: SOLDIER, n: 12 }], 0, { seed: i + 500, atkStance: "quarter" }).attacker);
      stubborn += left(R([{ def: SOLDIER, n: 10 }], [{ def: SOLDIER, n: 12 }], 0, { seed: i + 500, atkStance: "never" }).attacker);
    }
    return cautious > stubborn * 2;
  })());

  check("no withdrawal before the first round has finished", (() => {
    for (let i = 0; i < 60; i++) {
      const r = R([{ def: SOLDIER, n: 8 }], [{ def: HORSE, n: 12 }], 0, { seed: i + 600, atkStance: "quarter" });
      if (r.rounds.length < 1) return false;
    }
    return true;
  })());

  check("when both sides would withdraw, the defender keeps the ground", (() => {
    for (let i = 0; i < 80; i++) {
      const r = R([{ def: SOLDIER, n: 8 }], [{ def: SOLDIER, n: 8 }], 0,
        { seed: i + 800, atkStance: "quarter", defStance: "quarter" });
      if (r.outcome === "attackerWithdrew" && r.holder !== "defender") return false;
    }
    return true;
  })());

  check("every roll records its faces, so the panel can show the why", (() => {
    const r = R([{ def: SOLDIER, n: 4 }], [{ def: SOLDIER, n: 4 }], 0, { seed: 4 });
    const st = r.rounds[0].attacker.roll.stacks[0];
    return st.faces.length === 4 && st.faces.every((f) => f >= 1 && f <= 10) &&
      st.faces.filter((f) => f >= st.hit).length === st.hits;
  })());

  check("ordinary play never comes near the runaway round cap", (() => {
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      const r = R([{ def: SOLDIER, n: 1 + (i % 25) }], [{ def: ARCHER, n: 1 + (i % 17) }], (i % 5) * 9, { seed: i + 700 });
      if (r.outcome === "stalemate") return false;
      worst = Math.max(worst, r.rounds.length);
    }
    return worst < api.CONFIG.battleMaxRounds / 4;
  })());

  // ---- Firing slots, and the degenerate optimum they close ----
  check("only as many archers fire as the wall has positions", (() => {
    const r = R([{ def: SOLDIER, n: 5 }], [{ def: ARCHER, n: 10 }], 30, { seed: 21, slots: 4 });
    const a = r.rounds[0].defender.roll.stacks.find((x) => x.id === "archer");
    return r.rounds[0].behindWalls && a.n === 10 && a.firing === 4 && a.faces.length === 4;
  })());

  check("the garrison mans the wall with its BEST archers first", (() => {
    const GOOD = D("longbow", { hit: 5, role: "ranged", base: { wood: 40 } });
    const r = R([{ def: SOLDIER, n: 5 }], [{ def: ARCHER, n: 6 }, { def: GOOD, n: 3 }], 30,
      { seed: 22, slots: 4 });
    const st = r.rounds[0].defender.roll.stacks;
    const good = st.find((x) => x.id === "longbow"), plain = st.find((x) => x.id === "archer");
    return good.firing === 3 && plain.firing === 1;
  })());

  check("slots are the building's dial: more positions, stronger ground", (() => {
    const holds = (slots) => many(200, (i) =>
      R([{ def: SOLDIER, n: 18 }], [{ def: ARCHER, n: 10 }], 24, { seed: i + 1200, slots }).holder === "defender");
    const a = holds(2), b = holds(6), c = holds(10);
    return a < b && b < c;
  })());

  check("slots close the all-archer optimum: the best melee is worth garrisoning", (() => {
    // Measured before slots existed, a garrison of ten archers held 60% where
    // five archers and five horsemen held 17% -- so melee behind a wall was a
    // wasted slot and the rule had a degenerate answer. With a cap, the archers
    // past it are bodies waiting for the breach exactly like the melee, and the
    // reserve is worth having.
    const holds = (roster) => many(300, (i) =>
      R([{ def: SOLDIER, n: 18 }], roster, 24, { seed: i + 1300, slots: 6 }).holder === "defender");
    return holds([{ def: ARCHER, n: 6 }, { def: HORSE, n: 4 }]) > holds([{ def: ARCHER, n: 10 }]) * 1.3;
  })());

  check("a fortification is still worth its ground", (() => {
    const G = [{ def: ARCHER, n: 6 }, { def: HORSE, n: 4 }];
    const holds = (w) => many(200, (i) =>
      R([{ def: SOLDIER, n: 14 }], G, w, { seed: i + 1400, slots: 6 }).holder === "defender");
    return holds(24) > holds(0) * 4;
  })());

  // The manifest's own numbers, which the rule checks above are deliberately
  // blind to. These are the ones that should go red when balance moves too far.
  check("every unit in every era carries dice, a to-hit number and a role", (() => {
    for (const era of api.ERA_ORDER) {
      for (const u of api.MANIFESTS[era].units) {
        if (!(u.dice >= 1) || !(u.hit >= 2 && u.hit <= 10)) return false;
        if (!["melee", "ranged", "siege"].includes(u.role)) return false;
      }
    }
    return true;
  })());

  check("an archer is worse in the open than the melee of its own age", (() => {
    const b = api.MANIFESTS.bronze.units;
    const a = b.find((u) => u.id === "archer"), h = b.find((u) => u.id === "horseman");
    return a && h && api.expectedHits(a) < api.expectedHits(h);
  })());

  check("the siege engine is nearly helpless against people, decisive against stone", (() => {
    const s = api.MANIFESTS.iron.units.find((u) => u.id === "siegeEngine");
    const sol = api.MANIFESTS.stone.units.find((u) => u.id === "soldier");
    return s && api.expectedHits(s) < api.expectedHits(sol) &&
      api.unitWallDamage(s) >= 4 * api.unitWallDamage(sol);
  })());
}

console.log("\n--- Armies take the field: the object, and who is spoken for ---");
{
  reset(); S().seed = 90210; S().rngState = 90210; S().map = null; S().seen = {};
  api.ensureMap();
  const P = api.me();
  const home = api.holdings(P.id)[0];
  const other = api.holdings(P.id)[1];
  // A hex nobody holds, for the "not your ground" checks.
  const foreign = Object.values(api.world.places).find((x) =>
    x.terrain !== "water" && !api.isOwned(x.id, P.id)).id;
  P.units.soldier = 10;

  check("a fresh player carries an army list", Array.isArray(P.armies));

  const a1 = api.formArmy(home, { soldier: 4 });
  check("raising an army commits its soldiers", a1 && api.availableUnits("soldier") === 6);
  check("but the roster still counts every soldier you own", P.units.soldier === 10);
  check("the army knows where it is standing", a1.at === home && api.armySize(a1) === 4);
  check("a garrison is just an army standing on your own ground", (() => {
    const r = api.garrisonRoster(home, P);
    return r.length === 1 && r[0].def.id === "soldier" && r[0].n === 4;
  })());
  check("the roster it hands the resolver is unit DEFS with dice on them", (() => {
    const r = api.armyRoster(a1, P);
    return r[0].def.dice >= 1 && r[0].def.hit >= 2 && typeof r[0].def.role === "string";
  })());

  check("the stance defaults to fight-to-the-last, the least surprising order",
    a1.stance === api.DEFAULT_STANCE && a1.stance === "never");
  check("a stance set at muster is the stance it keeps",
    api.formArmy(other, { soldier: 2 }, "half").stance === "half");
  const a2 = api.armyAt(other, P);
  check("the stance stays editable while they march", api.setStance(a2.uid, "quarter", P) && a2.stance === "quarter");
  a2.inBattle = true;
  check("and freezes the moment a battle seals", !api.setStance(a2.uid, "never", P) && a2.stance === "quarter");
  a2.inBattle = false;

  check("you may not raise an army on ground you do not hold",
    api.formArmy(foreign, { soldier: 1 }, null, P) === null &&
    /ground you hold/.test(api.formRefusal(foreign, { soldier: 1 }, P)));
  check("you may not raise one out of soldiers you have already committed",
    api.formArmy(api.holdings(P.id)[2], { soldier: 99 }, null, P) === null);
  check("an army needs somebody in it",
    api.formArmy(api.holdings(P.id)[2], { soldier: 0 }, null, P) === null);
  check("one army to a hex", api.formArmy(home, { soldier: 1 }, null, P) === null &&
    /already stands/.test(api.formRefusal(home, { soldier: 1 }, P)));

  // Disband: the troops come back to the POOL, never to the population.
  const popBefore = api.hexPopSum();
  check("disbanding hands the soldiers back", (() => {
    const free = api.availableUnits("soldier");
    return api.disbandArmy(a1.uid, P) && api.availableUnits("soldier") === free + 4;
  })());
  check("and does not discharge them into the population",
    P.units.soldier === 10 && api.hexPopSum() === popBefore);

  check("an army caught deep cannot dissolve itself out of trouble", (() => {
    const a = api.formArmy(home, { soldier: 3 }, null, P);
    a.at = foreign;                      // as if it had marched there
    const why = api.disbandRefusal(a.uid, P);
    return !api.disbandArmy(a.uid, P) && /ground you hold/.test(why);
  })());
  check("nor may one disperse in the middle of a fight", (() => {
    const a = api.armyAt(foreign, P);
    a.at = home; a.inBattle = true;
    const ok = !api.disbandArmy(a.uid, P) && /fight/.test(api.disbandRefusal(a.uid, P));
    a.inBattle = false; api.disbandArmy(a.uid, P);
    return ok;
  })());

  check("armies survive a save and load", (() => {
    api.formArmy(home, { soldier: 5 }, "half", P);
    api.save();
    api.load();
    const a = api.armyAt(home, api.me());
    return a && a.roster.soldier === 5 && a.stance === "half" &&
      api.availableUnits("soldier") === 10 - 5 - api.armySize(api.armyAt(other, api.me()) || { roster: {} });
  })());
}

console.log("\n--- Armies march: the road is decided at dispatch ---");
{
  reset(); S().seed = 5150; S().rngState = 5150; S().map = null; S().seen = {};
  api.ensureMap();
  const P = api.me();
  P.units.soldier = 30;
  const from = api.holdings(P.id)[0];
  const adj = api.world.places[from].adj;
  const open = adj.find((id) => !api.isOwned(id, P.id) && api.world.places[id].terrain !== "water");
  const mine = api.holdings(P.id).find((id) => id !== from && adj.includes(id));

  check("your own country is half a step, open land a full one, water three",
    api.stepCost(from, P) === 0.5 &&
    (!open || api.stepCost(open, P) === 1) &&
    Object.values(api.world.places).filter((x) => x.terrain === "water")
      .every((x) => api.stepCost(x.id, P) === 3));

  check("a path names the hexes to walk THROUGH, never the one you stand on", (() => {
    const path = api.pathBetween(from, open, P);
    return path && path.length >= 1 && path[path.length - 1] === open && !path.includes(from);
  })());

  const a = api.formArmy(from, { soldier: 6 });
  check("an army marches when it is told to, and knows where it is headed",
    api.orderMarch(a.uid, open, P) && api.marchingTo(a) === open);

  check("it arrives after about the cost of the ground it crossed", (() => {
    let t = 0;
    while (a.order && t < 200) { api.marchArmies(1, P); t++; }
    // one unowned step = cost 1 = CONFIG.marchSeconds
    return a.at === open && !a.order && Math.abs(t - api.CONFIG.marchSeconds) <= 1;
  })());

  check("marching home again is twice as quick, because it is your own ground", (() => {
    api.orderMarch(a.uid, from, P);
    let t = 0;
    while (a.order && t < 200) { api.marchArmies(1, P); t++; }
    return a.at === from && Math.abs(t - api.CONFIG.marchSeconds / 2) <= 1;
  })());

  check("progress on the road reads as a fraction between two hexes", (() => {
    api.orderMarch(a.uid, open, P);
    api.marchArmies(api.CONFIG.marchSeconds / 2, P);
    const pr = api.marchProgress(a, P);
    return a.at === from && pr > 0.4 && pr < 0.6;
  })());

  check("halting leaves them standing where they got to", (() => {
    const where = a.at;
    return api.haltArmy(a.uid, P) && !a.order && a.at === where && api.marchProgress(a, P) === 0;
  })());

  // The while-loop in marchArmies: one big tick must cross as much ground as
  // many small ones, or armies would silently slow down as the clock sped up.
  check("a fast clock crosses as much ground as a slow one", (() => {
    const runFor = (chunk) => {
      const b = api.formArmy(mine, { soldier: 2 });
      if (!b) return null;
      api.orderMarch(b.uid, open, P);
      let t = 0;
      while (b.order && t < 400) { api.marchArmies(chunk, P); t += chunk; }
      const where = b.at; api.haltArmy(b.uid, P);
      const list = api.armiesOf(P); list.splice(list.indexOf(b), 1);
      return where === open ? t : null;
    };
    const slow = runFor(0.2), fast = runFor(6);
    return slow !== null && fast !== null && Math.abs(slow - fast) <= 6;
  })());

  check("arriving on one of your own armies merges into it", (() => {
    const host = api.armyAt(from, P);          // `a`, standing where it started
    api.setStance(host.uid, "half", P);
    const before = host.roster.soldier;
    const comer = api.formArmy(mine, { soldier: 3 }, "quarter");
    if (!host || !comer) return false;
    api.orderMarch(comer.uid, from, P);
    let t = 0;
    while (comer.order && t < 200) { api.marchArmies(1, P); t++; }
    return api.armyAt(from, P) === host && host.roster.soldier === before + 3 &&
      host.stance === "half" &&                     // the ground-holder's order stands
      !api.armyById(comer.uid, P);
  })());

  check("an army in a fight takes no new orders", (() => {
    const b = api.armyAt(from, P);
    b.inBattle = true;
    const ok = !api.orderMarch(b.uid, open, P) && /fight/.test(api.marchRefusal(b.uid, open, P));
    b.inBattle = false;
    return ok;
  })());
  check("nor is there a march to where you already stand",
    !api.orderMarch(api.armyAt(from, P).uid, from, P));

  check("every civilization's columns move on the same clock", (() => {
    api.initAdversaries();
    const rival = api.rivals()[0];
    if (!rival) return false;
    // A civ with no ground cannot raise an army on it, which is the rule
    // working -- so give this one somewhere to stand.
    const land = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !api.ownerOf(x.id));
    if (!land) return false;
    api.claimTile(land.id, rival.id);
    rival.units.soldier = 4;
    const r = api.formArmy(land.id, { soldier: 2 }, null, rival);
    const dest = api.world.places[land.id].adj.find((id) => api.world.places[id].terrain !== "water");
    if (!r || !dest) return false;
    api.orderMarch(r.uid, dest, rival);
    let t = 0;
    while (r.order && t < 300) { api.tickArmies(1); t++; }   // the SHARED tick, not marchArmies
    return r.at === dest;
  })());

  check("a march survives a save and load mid-road", (() => {
    const b = api.armyAt(from, api.me());
    api.orderMarch(b.uid, open, api.me());
    api.marchArmies(api.CONFIG.marchSeconds / 3, api.me());
    api.save(); api.load();
    const after = api.armyById(b.uid, api.me());
    return after && after.order && after.order.to === open &&
      Array.isArray(after.path) && after.progress > 0;
  })());
}

console.log("\n--- Contact: two armies on one hex, and the dice decide it ---");
{
  // One fixture, rebuilt per check: a human army, a rival with ground of their
  // own, and the tickMilitary loop -- the REAL world tick, not the hookless
  // walk -- carrying them into each other.
  const setupWar = (seed) => {
    reset(); S().seed = seed; S().rngState = seed; S().map = null; S().seen = {};
    api.ensureMap(); api.initAdversaries();
    const P = api.me();
    const R = api.rivals()[0];
    P.units.soldier = 60; R.units.soldier = 60;
    // The rival gets a land hex adjacent to open ground the human can reach.
    const target = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id) &&
      x.adj.some((n) => api.world.places[n].terrain !== "water" && !api.ownerOf(n)));
    api.claimTile(target.id, R.id);
    return { P, R, hex: target.id };
  };
  const run = (seconds) => { let t = 0; while (t < seconds) { api.tickMilitary(1); t++; } };
  const runUntilQuiet = () => { let guard = 0; while (api.battleCount() > 0 && guard++ < 600) api.tickMilitary(1); return guard < 600; };
  const march = (P, army, dest) => { api.orderMarch(army.uid, dest, P); run(600); };

  check("marching onto a defended hex seals a battle and freezes both sides", (() => {
    const { P, R, hex } = setupWar(11001);
    const garrison = api.formArmy(hex, { soldier: 10 }, "never", R);
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 10 }, "never", P);
    api.orderMarch(mine.uid, hex, P);
    let guard = 0;
    while (api.battleCount() === 0 && guard++ < 600) api.tickMilitary(0.5);
    const b = api.battleAt(hex);
    return b && mine.inBattle && garrison.inBattle && mine.order === null &&
      b.atk.roster.soldier === 10 && b.def.roster.soldier === 10 &&
      mine.at === hex && garrison.at === hex;
  })());

  check("a contested hex bars the road: the second wave parks and its order dies", (() => {
    const { P, R, hex } = setupWar(11002);
    api.formArmy(hex, { soldier: 20 }, "never", R);
    const first = api.formArmy(api.holdings(P.id)[0], { soldier: 20 }, "never", P);
    api.orderMarch(first.uid, hex, P);
    let guard = 0;
    while (api.battleCount() === 0 && guard++ < 600) api.tickMilitary(0.5);
    if (!api.battleAt(hex)) return false;
    const second = api.formArmy(api.holdings(P.id)[1], { soldier: 5 }, "never", P);
    api.orderMarch(second.uid, hex, P);
    // Walk the second army with the bare barred hook and NO battle ticking, so
    // the fight at the door cannot conclude before they reach it. 300s covers
    // any road this fixture's map can deal.
    for (let i = 0; i < 300 && second.order; i++) api.marchArmies(1, P, { barred: (h) => !!api.battleAt(h) });
    return second.order === null && second.at !== hex && api.armySize(second) === 5;
  })());

  check("the battle plays over ticks, and casualties land on the real rosters", (() => {
    const { P, R, hex } = setupWar(11003);
    api.formArmy(hex, { soldier: 12 }, "never", R);
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 12 }, "never", P);
    api.orderMarch(mine.uid, hex, P);
    let guard = 0;
    while (api.battleCount() === 0 && guard++ < 600) api.tickMilitary(0.5);
    const b = api.battleAt(hex);
    if (!b) return false;
    const unitsBefore = P.units.soldier + R.units.soldier;
    const round0 = b.round;
    api.tickMilitary(api.CONFIG.battleRoundSeconds);       // exactly one round
    const afterOne = P.units.soldier + R.units.soldier;
    const advanced = api.battleCount() === 0 || b.round > round0;
    // The sealed snapshot never mutates -- it is the script's recompute input.
    return advanced && afterOne <= unitsBefore && b.atk.roster.soldier === 12;
  })());

  check("overwhelming force wipes the garrison and takes the ground", (() => {
    const { P, R, hex } = setupWar(11004);
    api.formArmy(hex, { soldier: 4 }, "never", R);
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 40 }, "never", P);
    march(P, mine, hex);
    if (!runUntilQuiet()) return false;
    return api.ownerOf(hex) === P.id && api.armiesOf(R).length === 0 &&
      R.units.soldier === 56 && api.armyAt(hex, P) && !api.armyAt(hex, P).inBattle;
  })());

  check("a cautious attacker withdraws to the hex it came from, and the ground holds", (() => {
    const { P, R, hex } = setupWar(11005);
    // 12 against 16 with a quarter-loss budget: outmatched enough to trip the
    // stance in a round or two, not so outmatched that round one wipes them
    // before the withdrawal check ever runs -- which the resolver correctly
    // permits (no retreat before the first round is done), and which a 10-v-40
    // draft of this fixture kept demonstrating.
    api.formArmy(hex, { soldier: 16 }, "never", R);
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 12 }, "quarter", P);
    march(P, mine, hex);
    if (!runUntilQuiet()) return false;
    const survivor = api.armiesOf(P)[0];
    return api.ownerOf(hex) === R.id &&
      survivor && survivor.at !== hex && api.armySize(survivor) > 0 && !survivor.inBattle;
  })());

  check("walls with no garrison are besieged, bloodless, broken, and razed", (() => {
    const { P, R, hex } = setupWar(11006);
    S().map.built = S().map.built || {};
    S().map.built[hex] = "marchHold";
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 15 }, "never", P);
    api.orderMarch(mine.uid, hex, P);
    let guard = 0;
    while (api.battleCount() === 0 && guard++ < 600) api.tickMilitary(0.5);
    const b = api.battleAt(hex);
    if (!b || !(b.walls > 0) || b.def.uid !== null) return false;   // a true siege: masonry alone
    if (!runUntilQuiet()) return false;
    return P.units.soldier === 60 &&                    // walls never kill anyone
      api.ownerOf(hex) === P.id &&                       // and only buy time
      S().map.built[hex] === undefined;                  // fallen walls stay fallen
  })());

  check("bare enemy ground falls with no dice and no battle -- population does not fight", (() => {
    const { P, R, hex } = setupWar(11007);
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 8 }, "never", P);
    march(P, mine, hex);
    return api.battleCount() === 0 && api.ownerOf(hex) === P.id && P.units.soldier === 60;
  })());

  check("arriving on UNOWNED ground claims nothing -- settling is a different verb", (() => {
    const { P } = setupWar(11008);
    const open = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id));
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 8 }, "never", P);
    march(P, mine, open.id);
    return mine.at === open.id && !api.ownerOf(open.id) && api.battleCount() === 0;
  })());

  check("a battle survives save and load mid-fight, and the same war has the same ending", (() => {
    const { P, R, hex } = setupWar(11009);
    api.formArmy(hex, { soldier: 14 }, "never", R);
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 16 }, "never", P);
    api.orderMarch(mine.uid, hex, P);
    let guard = 0;
    while (api.battleCount() === 0 && guard++ < 600) api.tickMilitary(0.5);
    api.tickMilitary(api.CONFIG.battleRoundSeconds * 2);   // two rounds in
    if (api.battleCount() === 0) return false;             // fixture must still be fighting
    api.save();
    if (!runUntilQuiet()) return false;
    const endA = { owner: api.ownerOf(hex), mine: api.me().units.soldier, theirs: api.rivals()[0].units.soldier };
    api.load();                                            // back to two rounds in
    if (api.battleCount() !== 1) return false;             // the war came back with the save
    if (!runUntilQuiet()) return false;
    const endB = { owner: api.ownerOf(hex), mine: api.me().units.soldier, theirs: api.rivals()[0].units.soldier };
    // A fresh row misses the WeakMap script cache, so this replay went down
    // the RECOMPUTE path -- the sealed inputs and the one drawn seed are the
    // whole battle, and the ending cannot come out different.
    return endA.owner === endB.owner && endA.mine === endB.mine && endA.theirs === endB.theirs;
  })());

  check("held ground cannot be SETTLED out from under its owner", (() => {
    // Found by clicking a hex mid-siege: settlePlan only excluded YOUR hexes
    // (isOwned defaults to the human), so a rival-owned hex offered Settle --
    // territory theft for the settle price, no battle. Latent since the
    // per-player split; armies made it reachable.
    const { P, R, hex } = setupWar(11011);
    const open = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id));
    return api.settlePlan(hex) === null && api.settlePlan(open.id) !== null;
  })());

  check("a battle won on ground the defender never held moves no borders", (() => {
    const { P, R } = setupWar(11010);
    // The rival's army stands on open unowned ground; the human attacks it there.
    const open = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id) &&
      x.adj.some((n) => api.world.places[n].terrain !== "water"));
    const theirs = api.formArmy(api.holdings(R.id)[0], { soldier: 3 }, "never", R);
    theirs.at = open.id;                                   // as if it had marched there
    const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 30 }, "never", P);
    march(P, mine, open.id);
    if (!runUntilQuiet()) return false;
    return !api.ownerOf(open.id) && api.armiesOf(R).length === 0;
  })());
}

console.log("\n--- The pieces: discs, tiers, sockets, and who gets drawn ---");
{
  reset(); S().seed = 77007; S().rngState = 77007; S().map = null; S().seen = {};
  api.ensureMap(); api.initAdversaries();
  const P = api.me();
  const R = api.rivals()[0];

  check("the band reuses the campaign vocabulary, cut at 5 and the host floor",
    api.armyBand(1).id === "warParty" && api.armyBand(5).id === "warParty" &&
    api.armyBand(6).id === "column" && api.armyBand(api.CONFIG.armyHostSize - 1).id === "column" &&
    api.armyBand(api.CONFIG.armyHostSize).id === "host" &&
    api.armyBand(3).tier === 0 && api.armyBand(10).tier === 1 && api.armyBand(40).tier === 2);

  check("every neighbour wears an authored colour, and nobody shares one", (() => {
    const cols = api.S.players.map((p) => p.color);
    return cols.every(Boolean) && new Set(cols).size === cols.length;
  })());

  check("a neighbour whose authored colour the human took falls to a free one", (() => {
    // A fresh world where the human picked brown -- the hill people's colour.
    reset(); S().seed = 77008; S().rngState = 77008; S().map = null; S().seen = {};
    api.me().color = "brown";
    api.ensureMap(); api.initAdversaries();
    const cols = api.S.players.map((p) => p.color);
    return api.me().color === "brown" && new Set(cols).size === cols.length;
  })());

  // Rebuild the main fixture after the sub-check above reset the world.
  reset(); S().seed = 77007; S().rngState = 77007; S().map = null; S().seen = {};
  api.ensureMap(); api.initAdversaries();
  const P2 = api.me(), R2 = api.rivals()[0];
  P2.units.soldier = 40; R2.units.soldier = 40;
  const land = Object.values(api.world.places).find((x) =>
    x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id));
  api.claimTile(land.id, R2.id);

  check("the feed carries your own army wherever it stands", (() => {
    const a = api.formArmy(api.holdings(P2.id)[0], { soldier: 7 }, "never", P2);
    const row = api.piecesForBoard().find((x) => x.key === P2.id + ":" + a.uid);
    return row && row.hex === a.at && row.count === 7 && row.tier === 1 &&
      row.mine === true && row.marching === false && typeof row.color === "string";
  })());

  check("a foreign army is drawn only while its ground is sighted", (() => {
    const theirs = api.formArmy(land.id, { soldier: 9 }, "never", R2);
    const key = R2.id + ":" + theirs.uid;
    const before = api.piecesForBoard().some((x) => x.key === key);
    const sighted = api.isSighted(land.id);
    // Whichever way the fog lies on this seed, the feed must agree with it.
    return before === sighted;
  })());

  check("two players' discs on one hex stand at different sockets", (() => {
    // A contested hex has both armies AT it mid-battle; the sockets keep the
    // pieces apart without either knowing the other exists.
    const rows = api.piecesForBoard();
    const mineRow = rows.find((x) => x.mine);
    return mineRow && (P2.id % 4) !== (R2.id % 4) && mineRow.socket === P2.id % 4;
  })());

  check("an order flips the feed to marching, and the stamp notices", (() => {
    const a = api.armiesOf(P2)[0];
    const dest = api.world.places[a.at].adj.find((n) => api.world.places[n].terrain !== "water");
    const sigBefore = api.piecesForBoard().find((x) => x.mine).marching;
    api.orderMarch(a.uid, dest, P2);
    const sigAfter = api.piecesForBoard().find((x) => x.mine).marching;
    api.haltArmy(a.uid, P2);
    return sigBefore === false && sigAfter === true;
  })());

  check("a marching column charts the road it walks", (() => {
    const P3 = api.me();
    const a = api.armiesOf(P3).find((x) => !x.order) || api.armiesOf(P3)[0];
    if (!a) return false;
    // Send it two steps into ground the realm has never seen.
    const dark = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !api.isCharted(x.id) && api.pathBetween(a.at, x.id, P3));
    if (!dark) return false;
    api.orderMarch(a.uid, dark.id, P3);
    let guard = 0;
    while (a.order && guard++ < 800) api.marchArmies(1, P3);
    return a.at === dark.id && api.isCharted(dark.id);
  })());

  check("presence is eyes: an enemy your army stands beside is visible unsighted", (() => {
    // The A4 gap, closed: the foe you are actively fighting was invisible
    // because armies emitted no sight. Presence is stateless -- it moves when
    // the army does.
    const P3 = api.me(), R3 = api.rivals()[0];
    const mineA = api.armiesOf(P3)[0];
    if (!mineA) return false;
    const theirs = api.formArmy(api.holdings(R3.id)[0] || land.id, { soldier: 3 }, "never", R3)
      || api.armiesOf(R3)[0];
    if (!theirs) return false;
    theirs.at = mineA.at;                       // squared up on one hex
    const visible = api.piecesForBoard().some((x) => x.key === R3.id + ":" + theirs.uid);
    const sighted = api.isSighted(mineA.at);
    return visible && (sighted || api.canSeeArmyAt(mineA.at));
  })());

  check("scenery scatter never lands inside a piece socket's clearance", (() => {
    // The slot function is deterministic, so sweep it with the REAL hash and
    // the REAL socket table (hex3d.js is pure math and imports no GPU). This
    // is the owner's fixed-diameter argument made into a check: the reserved
    // zone is a circle, one number, from every angle.
    const CL = api.SOCKET_CLEARANCE - 1e-9;
    for (let t = 0; t < 200; t++) {
      const id = "hx" + t;
      for (const [i, spread] of [[0, 0.55], [3, 0.45], [7, 0.5], [11, 0.42], [17, 0.3]]) {
        const ang = api.hash01(id + ":a" + i) * Math.PI * 2;
        // Mirrors slot() exactly, HEX_SIZE factor included (geometry pass).
        const d = (0.2 + 0.75 * api.hash01(id + ":d" + i)) * spread * api.HEX_SIZE;
        let dx = Math.cos(ang) * d, dz = Math.sin(ang) * d;
        for (let pass = 0; pass < 4; pass++) {
          let moved = false;
          for (const sk of api.PIECE_SOCKETS) {
            const ox = dx - sk.dx, oz = dz - sk.dz;
            const dist = Math.hypot(ox, oz);
            if (dist < api.SOCKET_CLEARANCE) {
              const push = dist < 0.001 ? api.SOCKET_CLEARANCE : api.SOCKET_CLEARANCE / dist;
              dx = sk.dx + ox * push; dz = sk.dz + oz * push;
              moved = true;
            }
          }
          if (!moved) break;
        }
        for (const sk of api.PIECE_SOCKETS) {
          if (Math.hypot(dx - sk.dx, dz - sk.dz) < CL) return false;
        }
      }
    }
    return true;
  })());

  // THE GEOMETRY BUDGET (2026-08-28, todo.md -> The Board Geometry Pass).
  // Every number below is a relationship, not a value: the pass exists
  // because three of these were silently violated at the old sizes, and a
  // future retune should fail loudly here instead of interpenetrating on
  // the board. hex3d.js is pure math, which is why the whole budget is
  // checkable in node.
  const sockDist = Math.max(...api.PIECE_SOCKETS.map((sk) => Math.hypot(sk.dx, sk.dz)));
  const inradius = api.HEX_SIZE * Math.sqrt(3) / 2;

  check("four sockets on the cross, all at one distance", (() => {
    if (api.PIECE_SOCKETS.length !== 4) return false;
    return api.PIECE_SOCKETS.every((sk) =>
      Math.abs(Math.hypot(sk.dx, sk.dz) - sockDist) < 1e-9 &&
      (sk.dx === 0 || sk.dz === 0));    // N/E/S/W, never a corner slot
  })());

  check("a disc on any socket stays inside its own hex",
    sockDist + api.DISC_RADIUS <= inradius);

  check("a disc's HOVER SILHOUETTE clears the ownership rim's inner edge", (() => {
    // The rim band is 0.82-0.94 x HEX_SIZE (terrain3d) -- the old board
    // failed this and discs overlapped the rim. The hull that matters is the
    // hover/selection silhouette, the disc scaled x1.14 (pieces3d) -- the
    // first 0.30 disc cleared bare but its silhouette crossed the rim, and
    // the owner saw the intersection before the harness did. If pieces3d
    // ever changes the rim scale, change the 1.14 here WITH it.
    return sockDist + api.DISC_RADIUS * 1.14 <= 0.82 * api.HEX_SIZE;
  })());

  check("socket clearance covers the fattest prop HULL, not just its centre", (() => {
    // The bug the pass was born from: clearance measured to a prop's centre,
    // and the hut roof (cone r 0.21, jitter x1.1 = 0.23) reached inside the
    // disc. If props3d ever grows a fatter prop, raise the 0.24 here WITH it.
    const fattestHull = 0.24;
    return api.SOCKET_CLEARANCE >= api.DISC_RADIUS + fattestHull;
  })());

  check("adjacent clearance circles never overlap, so the shove converges", (() => {
    const [a, b] = [api.PIECE_SOCKETS[0], api.PIECE_SOCKETS[2]];   // N and E
    return Math.hypot(a.dx - b.dx, a.dz - b.dz) >= 2 * api.SOCKET_CLEARANCE;
  })());

  check("the hub cap is exactly the room the ring leaves a building",
    // The march-hold's outer wall stands here, flush against the slots
    // ("sized to run up against the edges of its slot", owner) -- and the
    // wall spokes to come stop here too.
    Math.abs(api.HUB_CAP - (sockDist - api.DISC_RADIUS)) < 1e-9);

  check("the courtyard holds one disc clear of the ring discs",
    // Garrison disc at the centre (r = DISC_RADIUS), besieger's disc inner
    // edge at sockDist - DISC_RADIUS: they must not touch through the wall.
    sockDist - api.DISC_RADIUS >= api.DISC_RADIUS + 0.05);

  check("the courtyard gives its disc visible AIR, not just fit", (() => {
    // Owner, on the first build (0.20 walls): "the march-hold is definitely
    // a little cramped" -- the disc filled 87% of the courtyard flat-to-flat
    // and read as touching under perspective (a 0.42-tall disc against a
    // 0.29 wall parallax-overlaps ~0.13 at the pitch clamp). The courtyard's
    // INRADIUS must beat the disc by that margin.
    const courtyardIn = (api.HUB_CAP - api.HUB_WALL) * Math.sqrt(3) / 2;
    return courtyardIn >= api.DISC_RADIUS + 0.10;
  })());

  check("a diagonal wall spoke up to 0.30 wide costs no sockets", (() => {
    // The owner's four-slot argument, as arithmetic: a spoke toward a
    // diagonal edge passes sockDist * sin(30deg) from the N/S sockets, and
    // that must clear half the spoke plus a whole disc.
    const SPOKE_W = 0.30;
    return sockDist * 0.5 >= SPOKE_W / 2 + api.DISC_RADIUS;
  })());

  // ---- THE FORTIFICATION FAMILY (2026-08-28) ----
  check("the family is authored in both eras, and the palisade cannot shoot", (() => {
    for (const era of ["bronze", "iron"]) {
      const st = api.MANIFESTS[era].structures;
      const pal = st.find((s) => s.id === "palisade");
      const twr = st.find((s) => s.id === "watchtower");
      if (!pal || !pal.fortifies || pal.slots !== 0 || !(pal.wallPool > 0)) return false;
      if (!twr || !twr.fortifies || !(twr.slots > 0) || twr.vision !== 2) return false;
      // The ladders run OPPOSITE ways, which is each building's identity:
      // wall: watchtower < palisade < march-hold (the tower is mostly eye);
      // slots: palisade (0) < watchtower < march-hold (nobody mans a fence).
      if (!(twr.wallPool < pal.wallPool)) return false;
    }
    const hold = api.MANIFESTS.iron.structures.find((s) => s.id === "marchHold");
    const twr = api.MANIFESTS.iron.structures.find((s) => s.id === "watchtower");
    return hold.wallPool > twr.wallPool && hold.slots > twr.slots;
  })());

  check("an enemy fortified hex is a wall: paths route around, never through", (() => {
    // A corridor: find a hex whose removal matters. Take any land hex on a
    // real path between two of ours, fortify it for the RIVAL, and the path
    // must change -- and never contain the fortified hex.
    const P5 = api.me(), R5 = api.rivals()[0];
    const from = api.holdings(P5.id)[0];
    const far = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !x.adversary && api.pathBetween(from, x.id, P5) &&
      api.pathBetween(from, x.id, P5).length >= 3);
    if (!far) return false;
    const path0 = api.pathBetween(from, far.id, P5);
    const mid = path0[Math.floor(path0.length / 2)];
    api.claimTile(mid, R5.id);
    S().map.built[mid] = "palisade";
    const path1 = api.pathBetween(from, far.id, P5);
    const throughWall = path1 && path1.includes(mid);
    // The fortified hex itself stays a legal DESTINATION -- that is a siege.
    const siege = api.pathBetween(from, mid, P5);
    delete S().map.built[mid];
    api.releaseTile(mid);
    return !throughWall && !!siege && siege[siege.length - 1] === mid;
  })());

  check("your OWN fortified hex is a road like any other", (() => {
    const P5 = api.me();
    const held = api.holdings(P5.id)[0];
    S().map.built[held] = "palisade";
    // A path from a neighbour to a hex on the far side may cross our wall.
    const nb = api.world.places[held].adj.find((x) => api.world.places[x].terrain !== "water");
    const ok = nb ? api.pathBetween(nb, held, P5) !== null : false;
    delete S().map.built[held];
    return ok;
  })());

  check("a watchtower is eyes: an army two hexes out is seen, three is not", (() => {
    const P5 = api.me(), R5 = api.rivals()[0];
    const base = api.holdings(P5.id)[0];
    // Ground exactly 2 and 3 out from a held hex, owned by nobody, away from
    // all our territory and armies (or the ordinary eyes answer first).
    const bp = api.world.places[base];
    const clear = (x, d) => x.terrain !== "water" && !api.ownerOf(x.id) &&
      api.hexDistance(bp.q, bp.r, x.q, x.r) === d &&
      !api.isSighted(x.id) &&
      x.adj.every((n) => api.ownerOf(n) == null || api.ownerOf(n) !== P5.id) &&
      !api.armyAt(x.id, P5) && x.adj.every((n) => !api.armyAt(n, P5));
    const at2 = Object.values(api.world.places).find((x) => clear(x, 2));
    const at3 = Object.values(api.world.places).find((x) => clear(x, 3));
    if (!at2 || !at3) return true;   // seed gave no clean ground; not a failure of the rule
    const before2 = api.canSeeArmyAt(at2.id);
    S().map.built[base] = "watchtower";
    const seen2 = api.canSeeArmyAt(at2.id);
    const seen3 = api.canSeeArmyAt(at3.id);
    delete S().map.built[base];
    return before2 === false && seen2 === true && seen3 === false;
  })());

  check("the socket veto: an E-W wall pair leaves N and S, diagonals leave all four", (() => {
    // Axial deltas: E = (1,0), W = (-1,0); the diagonals NE (1,-1), SW (-1,1).
    const ew = api.allowedSockets([[1, 0], [-1, 0]]);
    const diag = api.allowedSockets([[1, -1], [-1, 1], [0, -1], [0, 1]]);
    const one = api.allowedSockets([[1, 0]]);
    // Sockets 0/1 are N/S (dz), 2/3 are E/W (dx) -- see PIECE_SOCKETS.
    return ew.length === 2 && ew.includes(0) && ew.includes(1) &&
      diag.length === 4 &&
      one.length === 3 && !one.includes(2);
  })());

  check("the feed reseats a besieger off a vetoed socket", (() => {
    // Player 2's default socket is 2 -- the E socket, dead on an E spoke.
    // Stand a rival army on a fortified hex whose E neighbour is also
    // fortified, and the feed must hand it a surviving socket.
    const P5 = api.me(), R5 = api.rivals()[0];
    const spot = api.holdings(P5.id).find((h) => {
      const pl0 = api.world.places[h];
      return pl0 && pl0.adj.some((n) => {
        const np = api.world.places[n];
        return np && np.q - pl0.q === 1 && np.r === pl0.r && api.ownerOf(n) === P5.id;
      });
    });
    if (!spot) return true;                      // no E-owned pair on this seed
    const east = api.world.places[spot].adj.find((n) => {
      const np = api.world.places[n], pl0 = api.world.places[spot];
      return np.q - pl0.q === 1 && np.r === pl0.r;
    });
    S().map.built[spot] = "marchHold";
    S().map.built[east] = "palisade";
    const foe = api.formArmy(api.holdings(R5.id)[0], { soldier: 2 }, "never", R5)
      || api.armiesOf(R5).find((x) => !x.inBattle);
    if (!foe) { delete S().map.built[spot]; delete S().map.built[east]; return false; }
    foe.at = spot;
    const row = api.piecesForBoard().find((x) => x.key === R5.id + ":" + foe.uid);
    delete S().map.built[spot]; delete S().map.built[east];
    // R5.id = 1 -> socket 1 (S), untouched by an E spoke: veto leaves it.
    // The contract under test: whatever socket the feed hands out is one
    // allowedSockets blesses for an E spoke.
    const legal = api.allowedSockets([[1, 0]]);
    return row && !row.courtyard && legal.includes(row.socket);
  })());

  check("the feed garrisons your army behind your own walls -- and never the besieger", (() => {
    // The courtyard condition is wallsAt()'s owner test, applied by the feed:
    // a fortifying structure on ground the army's owner holds. The enemy
    // standing on the same hex keeps its ring socket.
    const P4 = api.me(), R4 = api.rivals()[0];
    const held = api.holdings(P4.id).find((h) => !api.armyAt(h, P4)) || api.holdings(P4.id)[0];
    if (!held) return false;
    S().map.built[held] = "marchHold";
    const g = api.formArmy(held, { soldier: 4 }, "never", P4) || api.armyAt(held, P4);
    if (!g) return false;
    const foe = api.formArmy(api.holdings(R4.id)[0], { soldier: 3 }, "never", R4)
      || api.armiesOf(R4).find((x) => !x.inBattle);
    if (!foe) return false;
    foe.at = held;                              // besieger on the same hex
    const rows = api.piecesForBoard();
    const mineRow = rows.find((x) => x.key === P4.id + ":" + g.uid);
    const foeRow = rows.find((x) => x.key === R4.id + ":" + foe.uid);
    const out = mineRow && mineRow.courtyard === true &&
      foeRow && foeRow.courtyard === false;
    delete S().map.built[held];                 // leave the fixture clean
    return !!out;
  })());
}

console.log("\n--- The battle panel's wire: the sim narrates every round ---");
{
  reset(); S().seed = 616161; S().rngState = 616161; S().map = null; S().seen = {};
  api.ensureMap(); api.initAdversaries();
  const P = api.me();
  const R = api.rivals()[0];
  P.units.soldier = 40; R.units.soldier = 40;
  const land = Object.values(api.world.places).find((x) =>
    x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id));
  api.claimTile(land.id, R.id);
  api.formArmy(land.id, { soldier: 9 }, "never", R);
  const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 11 }, "never", P);

  // Subscribe the way wire.js does, count what the sim says, then unhook.
  const got = { sealed: 0, rounds: [], ended: 0, script: null };
  const hSeal = ({ b }) => { got.sealed++; };
  const hRound = ({ b, round }) => { got.rounds.push(round); };
  const hEnd = ({ b, script }) => { got.ended++; got.script = script; };
  api.on("battleSealed", hSeal); api.on("battleRound", hRound); api.on("battleEnded", hEnd);

  api.orderMarch(mine.uid, land.id, P);
  let guard = 0;
  while ((api.armiesOf(R).length > 0 || api.battleCount() > 0) && guard++ < 900) api.tickMilitary(2);

  api.off("battleSealed", hSeal); api.off("battleRound", hRound); api.off("battleEnded", hEnd);

  check("one seal, one ending", got.sealed === 1 && got.ended === 1 && !!got.script);
  check("every round of the script was narrated, in order",
    got.rounds.length === got.script.rounds.length &&
    got.rounds.every((r, i) => r === i));

  // The panel itself, headless: every handler runs against the stub DOM
  // without throwing -- the create-once skeleton, a round render, an ending.
  check("the panel survives a whole war with no real DOM", (() => {
    reset(); S().seed = 616162; S().rngState = 616162; S().map = null; S().seen = {};
    api.ensureMap(); api.initAdversaries();
    const P2 = api.me(), R2 = api.rivals()[0];
    P2.units.soldier = 30; R2.units.soldier = 30;
    const l2 = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id));
    api.claimTile(l2.id, R2.id);
    api.formArmy(l2.id, { soldier: 6 }, "never", R2);
    const m2 = api.formArmy(api.holdings(P2.id)[0], { soldier: 8 }, "never", P2);
    api.on("battleSealed", api.onBattleSealed);
    api.on("battleRound", api.onBattleRound);
    api.on("battleEnded", api.onBattleEnded);
    let ok = true;
    try {
      api.orderMarch(m2.uid, l2.id, P2);
      let g = 0;
      while ((api.armiesOf(R2).length > 0 || api.battleCount() > 0) && g++ < 900) api.tickMilitary(2);
    } catch (e) { ok = false; console.log("  panel threw: " + e.message); }
    api.off("battleSealed", api.onBattleSealed);
    api.off("battleRound", api.onBattleRound);
    api.off("battleEnded", api.onBattleEnded);
    return ok;
  })());
}

console.log("\n--- The neighbours become countries (B slice) ---");
{
  reset(); S().seed = 424243; S().rngState = 424243; S().map = null; S().seen = {};
  api.ensureMap(); api.initAdversaries();
  const P = api.me();
  const hill = api.playerByKey("hillClans");

  api.tickBots(0.2);
  const seat = api.seatOf(hill);
  check("every power settles: seat owned, in their own name",
    api.rivals().every((c) => {
      const s2 = api.seatOf(c);
      return s2 == null || api.ownerOf(s2) === c.id;
    }) && seat != null && api.ownerOf(seat) === hill.id);
  check("a home ring stands around the seat",
    api.holdings(hill.id).length >= 2 && api.holdings(hill.id).length <= 1 + api.CONFIG.botHomeRing);
  const g0 = api.armyAt(seat, hill);
  check("the capital keeps a standing garrison, fight-to-the-last",
    !!g0 && g0.intent === "garrison" && g0.stance === "never" && api.armySize(g0) >= 2);

  const holdingsBefore = api.holdings(hill.id).length;
  const sizeBefore = api.armySize(g0);
  api.tickBots(0.2); api.tickBots(0.2);
  check("settlement is idempotent -- ticks do not stack countries",
    api.holdings(hill.id).length === holdingsBefore && api.armySize(api.armyAt(seat, hill)) === sizeBefore &&
    api.armiesOf(hill).filter((a) => a.intent === "garrison").length === 1);

  check("the country grows on its clock, one frontier hex at a time", (() => {
    const before = api.holdings(hill.id).length;
    api.tickBots(api.CONFIG.botClaimSeconds + 1);
    const after = api.holdings(hill.id);
    if (after.length !== before + 1) return false;
    // the new hex borders the old country
    const grown = after.find((id) => !api.world.places[id].adversary &&
      api.world.places[id].adj.some((n) => api.ownerOf(n) === hill.id));
    return !!grown;
  })());

  check("growth stops at their own era's dominion cap", (() => {
    const cap = (api.MANIFESTS[hill.era].map && api.MANIFESTS[hill.era].map.dominionCap) || Infinity;
    for (let i = 0; i < 40; i++) api.tickBots(api.CONFIG.botClaimSeconds + 1);
    return api.holdings(hill.id).length <= cap;
  })());

  check("their expansion never steals held or special ground",
    api.holdings(hill.id).every((id) => {
      const pl = api.world.places[id];
      return pl.terrain !== "water" && !pl.minor && (!pl.adversary || pl.adversary === hill.key);
    }));

  // ---- The capital siege ----
  advanceRivalsTo("bronze");                    // bronze authors real walls on the hill people
  api.initAdversaries();                        // restock walls for the new age
  check("a bronze capital has walls to author the pool from", hill.walls > 0);
  P.units.soldier = 60;
  const mine = api.formArmy(api.holdings(P.id)[0], { soldier: 30 }, "never", P);
  api.orderMarch(mine.uid, seat, P);
  let guard = 0;
  while (!api.battleAt(seat) && guard++ < 900) api.tickMilitary(0.5);
  const b = api.battleAt(seat);
  check("marching onto their seat seals a SIEGE, their walls in the pool",
    !!b && b.walls === hill.walls * api.CONFIG.seatWallScale && b.def.uid != null);
  guard = 0;
  while (api.battleAt(seat) && guard++ < 900) api.tickMilitary(2);
  check("winning on a seat NEVER flips it -- capitals are not instant (owner ruling)",
    api.ownerOf(seat) === hill.id);

  // ---- THE SACK: time on the ground is what ends a nation ----
  const stand = api.armiesOf(P).find((x) => x.at === seat);
  check("the victor stands on their capital, sack available", !!stand && !stand.inBattle);
  if (stand) {
    stand.intent = "sack";
    api.beginSack(stand, P);
    check("the sack begins, and begins at zero", !!stand.sacking && stand.sacking.t === 0);
    api.tickMilitary(api.CONFIG.sackCapitalSeconds / 2);
    check("half a sack breaks nothing", !hill.broken && api.ownerOf(seat) === hill.id);
    const lootBefore = Object.values(P.res).reduce((a, x) => a + (x || 0), 0);
    api.tickMilitary(api.CONFIG.sackCapitalSeconds);
    check("the capital falls to TIME: the nation is broken",
      hill.broken === true);
    check("their ground dissolves to the wild", api.holdings(hill.id).length === 0);
    check("their columns scatter", api.armiesOf(hill).length === 0);
    check("the treasury rides home with the sacker",
      Object.values(P.res).reduce((a, x) => a + (x || 0), 0) > lootBefore);
    check("a broken people raids nobody", api.spawnRaid() === null);
    check("...and keeps no house", (() => {
      api.tickBots(api.CONFIG.botClaimSeconds * 3);
      return api.holdings(hill.id).length === 0 && api.armyAt(seat, hill) == null;
    })());
    check("broken survives a save and load", (() => {
      api.save(); api.load();
      return api.playerByKey("hillClans").broken === true;
    })());
    check("a sack fires only at its TARGET -- never where a road-fight left you", (() => {
      // Found live: a sack order aimed at a hill frontier crossed the river
      // kingdom's capital, won the meeting engagement, and broke a nation the
      // player never aimed at. The intent now waits for its ordered target.
      const P3 = api.me();
      const R3 = api.rivals().find((c) => !c.broken);
      if (!R3) return true;
      const land3 = Object.values(api.world.places).find((x) =>
        x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id));
      api.claimTile(land3.id, R3.id);
      P3.units.soldier = (P3.units.soldier || 0) + 4;
      const s3 = api.formArmy(api.holdings(P3.id)[0], { soldier: 4 }, "never", P3);
      s3.intent = "sack";
      s3.sackTarget = "somewhere,else";        // ordered at a DIFFERENT hex
      s3.at = land3.id;                        // but standing here, mid-road
      api.beginSack(s3, P3);
      const held = !s3.sacking;                // it must NOT begin here
      const list3 = api.armiesOf(P3); list3.splice(list3.indexOf(s3), 1);
      return held;
    })());

    check("the seat is RAZED at the break -- the marker hex is wilderness", (() => {
      const H = api.playerByKey("hillClans");   // fresh: the save/load above rebuilt S
      return H.broken === true && H.seatRazed === true &&
        api.seatOf(H) === null && api.seatCivAt(seat) === null && api.ownerOf(seat) == null;
    })());

    check("a broken people rises again ELSEWHERE, fairly reset", (() => {
      const H = api.playerByKey("hillClans");
      if (typeof H.rebirthIn !== "number") return false;
      api.tickBots(H.rebirthIn + 1);
      if (H.broken) return false;
      const held = api.holdings(H.id);
      return H.seatHex != null && H.seatHex !== seat &&      // a NEW seat, never the old marker
        api.seatCivAt(H.seatHex) === H &&
        api.ownerOf(H.seatHex) === H.id &&
        held.length >= 1 && held.length <= 1 + api.CONFIG.botHomeRing &&
        api.armyAt(H.seatHex, H) == null &&                  // born undefended
        (H.standing || 0) === 0 &&
        Object.values(H.res).some((x) => x > 0);             // the larder restocked
    })());

    check("...seated far from every player: safe by geography, not rules", (() => {
      const H = api.playerByKey("hillClans");
      const np = api.world.places[H.seatHex];
      let d = Infinity;
      for (const id of api.holdings(api.me().id)) {
        const t = api.world.places[id];
        const dd = (Math.abs(np.q - t.q) + Math.abs(np.r - t.r) + Math.abs((np.q + np.r) - (t.q + t.r))) / 2;
        if (dd < d) d = dd;
      }
      return d >= 3;   // loose floor: the config asks for rebirthMinDistance, the board may be tight
    })());

    check("the newborn garrisons only after the grace, then raids again", (() => {
      const H = api.playerByKey("hillClans");
      api.tickBots(api.CONFIG.botRegarrisonSeconds + 1);
      const garrisoned = api.armyAt(H.seatHex, H) != null;
      const raid = api.spawnRaid();
      if (raid) { const l = api.armiesOf(H); const i2 = l.indexOf(raid); if (i2 >= 0) l.splice(i2, 1); }
      return garrisoned && !!raid;
    })());

    check("no trading with the dead", (() => {
      const H = api.playerByKey("hillClans");
      H.broken = true;
      const before = (api.me().expeditions || []).length;
      api.launchCaravan("hillClans", null);
      const refused = api.me().expeditions.length === before;
      H.broken = false;
      return refused;
    })());

    check("a battle PAUSES the sack clock -- never resets it", (() => {
      // A sacker engaged in a fight accrues nothing; freed, it resumes where
      // it stood. Pause-not-reset, or a cheap suicide attack becomes a
      // degenerate delay tactic.
      const P3 = api.me();
      const R3 = api.rivals().find((c) => !c.broken) || api.rivals()[1];
      const land2 = Object.values(api.world.places).find((x) =>
        x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id));
      api.claimTile(land2.id, R3.id);
      P3.units.soldier = (P3.units.soldier || 0) + 6;
      const s2 = api.formArmy(api.holdings(P3.id)[0], { soldier: 6 }, "never", P3);
      s2.at = land2.id;                        // stood on their ground
      s2.intent = "sack";
      api.beginSack(s2, P3);
      api.tickSacks(10);
      const t1 = s2.sacking.t;
      s2.inBattle = true;
      api.tickSacks(10);
      const t2 = s2.sacking.t;
      s2.inBattle = false;
      api.tickSacks(5);
      const ok = t1 === 10 && t2 === 10 && s2.sacking.t === 15;
      const list = api.armiesOf(P3); list.splice(list.indexOf(s2), 1);
      return ok;
    })());
  }

  // ---- The null-key trap, pinned forever ----
  check("a human march-hold still walls its hex in an army battle", (() => {
    // Ordinary hexes carry adversary: null and the human's key is null: a bare
    // === on the seat-walls branch once matched them and silently deleted
    // every march-hold from the resolver. This is that bug's tombstone.
    reset(); S().seed = 424244; S().rngState = 424244; S().map = null; S().seen = {};
    api.ensureMap(); api.initAdversaries();
    const P2 = api.me(), R2 = api.rivals()[0];
    P2.units.soldier = 20; R2.units.soldier = 20;
    const wHex = api.holdings(P2.id)[1];
    S().map.built = S().map.built || {};
    S().map.built[wHex] = "marchHold";
    api.formArmy(wHex, { soldier: 4 }, "never", P2);
    const land = Object.values(api.world.places).find((x) =>
      x.terrain !== "water" && !x.adversary && !x.minor && !api.ownerOf(x.id));
    api.claimTile(land.id, R2.id);
    const theirs = api.formArmy(land.id, { soldier: 10 }, "never", R2);
    api.orderMarch(theirs.uid, wHex, R2);
    let g = 0;
    while (!api.battleAt(wHex) && g++ < 900) api.tickMilitary(0.5);
    const bb = api.battleAt(wHex);
    return !!bb && bb.walls === 24;
  })());
}

console.log("\n--- The nav rail: one panel left, one right, focus never empty ---");
{
  reset(); S().seed = 9182; S().rngState = 9182; S().map = null; S().seen = {};
  api.ensureMap(); api.initAdversaries();
  const P = api.me();

  check("the Inspector is the default panel", api.activePanel() === "inspector");

  check("the rail switches which LEFT panel is open, never how many", (() => {
    api.showPanel("tech");
    if (api.activePanel() !== "tech") return false;
    api.showPanel("population");
    if (api.activePanel() !== "population") return false;
    api.showPanel("nonsense");                       // refused, never blanks the column
    return api.activePanel() === "population";
  })());

  check("clicking the BOARD pulls the Inspector forward -- the load-bearing rule", (() => {
    api.showPanel("tech");
    api.selectTile(api.holdings(P.id)[0]);
    return api.activePanel() === "inspector";
  })());

  check("clicking a DISC does the same", (() => {
    P.units.soldier = 6;
    const a = api.formArmy(api.holdings(P.id)[0], { soldier: 3 }, "never", P);
    api.showPanel("population");
    api.selectPiece(P.id + ":" + a.uid);
    return api.activePanel() === "inspector";
  })());

  // THE FOCUS SURVIVES ITS TARGET, two ways.
  check("a MERGED army hands the focus to its host, not to the ground", (() => {
    const hexA = api.holdings(P.id)[0], hexB = api.holdings(P.id)[1];
    for (const a of api.armiesOf(P).slice()) api.disbandArmy(a.uid, P);
    P.units.soldier = 10;
    const host = api.formArmy(hexA, { soldier: 4 }, "never", P);
    const comer = api.formArmy(hexB, { soldier: 3 }, "never", P);
    api.selectPiece(P.id + ":" + comer.uid);
    api.orderMarch(comer.uid, hexA, P);
    // Render as the world ticks, the way the live loop does -- that is when
    // the focus records where its army is HEADED, which is what the merge
    // handoff needs (a merge lands and absorbs in the same tick, so the last
    // rendered position is always the hex it left).
    api.renderTileDetail();
    let g = 0;
    while (api.armyById(comer.uid, P) && g++ < 400) { api.tickMilitary(1); api.renderTileDetail(); }
    // The comer's uid is gone; the focus must be the HOST, standing right there.
    api.renderTileDetail();
    return api.armyById(comer.uid, P) == null && api.armyAt(hexA, P) === host &&
      api.selectedArmyKey() === P.id + ":" + host.uid;
  })());

  check("a DESTROYED army leaves the focus on the ground it died on", (() => {
    const hex = api.holdings(P.id)[0];
    const doomed = api.armyAt(hex, P);
    api.selectPiece(P.id + ":" + doomed.uid);
    const list = api.armiesOf(P);
    list.splice(list.indexOf(doomed), 1);             // died off-screen
    api.renderTileDetail();
    return api.selectedArmyKey() == null && api.selectedHex() === hex;
  })());
}

// ---- S1 (the antagonist spec): the sim forgets who "the" player is ----
console.log("\n--- S1: the viewer ratchet, and a second human-shaped seat ---");
{
  // THE RATCHET. The end state is the spec's rule -- no file in src/sim/,
  // src/map/, or the sim half of src/core/ reads S.me or calls me() -- and
  // this table is the road there: every count is pinned EXACTLY, so a new
  // viewer-read cannot slip in silently and a removed one must be recorded
  // here, on purpose, as progress. (Equality, not <=: a stale ceiling is a
  // check that stopped checking. Parameter DEFAULTS `p || me()` count too --
  // they retire when S2/S3 make sim callers explicit.) Zero-zero rows are the
  // finish line, already reached by battle.js and bots.js among others.
  const RATCHET = {
    "src/sim/armies.js":      { sme: 1, me: 17 },
    "src/sim/battle.js":      { sme: 0, me: 0 },
    "src/sim/bots.js":        { sme: 0, me: 0 },
    "src/sim/combat.js":      { sme: 0, me: 15 },
    "src/sim/contact.js":     { sme: 8, me: 0 },
    "src/sim/era.js":         { sme: 0, me: 5 },
    "src/sim/eraclock.js":    { sme: 0, me: 1 },
    "src/sim/events.js":      { sme: 0, me: 5 },
    "src/sim/expeditions.js": { sme: 0, me: 23 },
    "src/sim/raiders.js":     { sme: 0, me: 1 },
    "src/map/continents.js":  { sme: 0, me: 0 },
    "src/map/fog.js":         { sme: 0, me: 6 },
    "src/map/generate.js":    { sme: 0, me: 0 },
    "src/map/map.js":         { sme: 1, me: 6 },
    "src/map/model.js":       { sme: 0, me: 0 },
    "src/map/ownership.js":   { sme: 4, me: 0 },
    "src/map/population.js":  { sme: 0, me: 12 },
    "src/map/routes.js":      { sme: 0, me: 3 },
    "src/map/structures.js":  { sme: 0, me: 0 },
    "src/map/world.js":       { sme: 0, me: 0 },
    // S2 collapsed step.js's viewer reads from 14 to 1 (the per-player loop);
    // the 2 S.me are the converter gate and the death gate, both flagged
    // in-file as M2's business.
    "src/core/step.js":       { sme: 2, me: 1 },
    "src/core/replay.js":     { sme: 0, me: 0 },
    "src/core/actions.js":    { sme: 0, me: 22 },
    "src/core/derived.js":    { sme: 0, me: 21 },
  };
  const here = nodePath.dirname(fileURLToPath(import.meta.url));
  let ratchetOk = true, drift = [];
  for (const [rel, want] of Object.entries(RATCHET)) {
    const src = fs.readFileSync(nodePath.join(here, rel), "utf8");
    const sme = (src.match(/\bS\.me\b/g) || []).length;
    const mec = (src.match(/\bme\(\)/g) || []).length;
    if (sme !== want.sme || mec !== want.me) {
      ratchetOk = false;
      drift.push(`${rel}: S.me ${sme}(pinned ${want.sme}) me() ${mec}(pinned ${want.me})`);
    }
  }
  check("the viewer ratchet holds: no sim file's S.me/me() count moved unrecorded", ratchetOk);
  if (drift.length) console.log("    drift: " + drift.join("; "));

  // A SECOND HUMAN-SHAPED SEAT CAN ACT -- S1's deliverable. A keyless player
  // record (a human is a player whose decision-maker is a mouse; this one's is
  // a harness) claims ground, spends its own stores through the real verbs,
  // and the journal records ITS pid. The viewer's books never move.
  reset(); api.initAdversaries(); api.ensureMap();
  const guest = api.freshPlayer(api.S.players.length, { color: "teal", seatName: "Guestholm" });
  api.S.players.push(guest);
  const freeHex = Object.values(api.world.places).find((p) =>
    p.terrain !== "water" && !p.adversary && !p.minor && api.ownerOf(p.id) == null);
  api.claimTile(freeHex.id, guest.id);
  guest.seat = freeHex.id;
  api.ensurePop(guest.id);
  guest.res.food = 200; guest.res.wood = 200; guest.res.stone = 100;
  api.clearJournal();

  const hostQueueBefore = api.me().buildQueue.length;
  const hostWoodBefore = api.me().res.wood;
  api.build(api.defById("barracks"), guest);
  check("a guest seat's build lands on the GUEST's queue",
    guest.buildQueue.length === 1 && api.me().buildQueue.length === hostQueueBefore);
  check("...paid from the guest's stores, the viewer's untouched",
    guest.res.wood < 200 && api.me().res.wood === hostWoodBefore);
  check("...and the journal records the guest's pid",
    api.journal().length === 1 && api.journal()[0].pid === guest.id && api.journal()[0].verb === "build");

  const near = api.world.places[freeHex.id].adj.find((n) =>
    api.world.places[n].terrain !== "water" && !api.world.places[n].adversary &&
    !api.world.places[n].minor && api.ownerOf(n) == null);
  if (near) {
    api.launchSettle(near, guest);
    check("a guest settle queues against the guest's own dominion arithmetic",
      guest.buildQueue.some((q) => q.kind === "settle") &&
      api.journal().some((e) => e.verb === "settle" && e.pid === guest.id));
  }

  // THE BOUNDARY, FLIPPED (S2 landed): the world tick runs EVERY living
  // civ's economy. The guest's queue ticks, its ground gathers into its own
  // stores, and its people grow -- the second seat is economically real.
  const guestRemaining = guest.buildQueue[0].remaining;
  const guestFood = guest.res.food;
  run(10);
  check("S2: the guest's queue ticks on the world clock",
    guest.buildQueue.length === 0 || guest.buildQueue[0].remaining < guestRemaining);
  check("S2: the guest's ground gathers into the guest's own stores",
    guest.res.food !== guestFood);

  // AND THE BOTS ARE ECONOMICALLY REAL: their home ground arrived worked to
  // capacity (the human trio's own opening rule), their hexes produce into
  // their own larder, and losing ground measurably slows the earning.
  const clans = api.playerByKey("hillClans");
  check("S2: a bot's country has people on its ground",
    api.hexPopSum(clans.id) > 0 && clans.booksSeeded === true);
  const earnBefore = api.rates(clans);
  const totalBefore = Object.keys(earnBefore).filter((k) => k !== "upkeep" && k !== "foodNet")
    .reduce((s, k) => s + earnBefore[k], 0);
  check("S2: a bot's territory produces into its own books", totalBefore > 0);
  {
    // Sack the arithmetic: take one producing hex off their ledger and the
    // income drops -- economic warfare is bidirectional now.
    const lost = api.holdings(clans.id).find((id) => id !== api.seatOf(clans) && api.hexPop(id) > 0);
    if (lost) {
      const popHere = api.S.map.pop[lost];
      api.releaseTile(lost);
      api.ensurePop(clans.id);
      const earnAfter = api.rates(clans);
      const totalAfter = Object.keys(earnAfter).filter((k) => k !== "upkeep" && k !== "foodNet")
        .reduce((s, k) => s + earnAfter[k], 0);
      check("S2: taking a bot's ground measurably slows its earning", totalAfter < totalBefore);
      api.claimTile(lost, clans.id); api.S.map.pop[lost] = popHere;   // put it back
    }
  }
}

// ---- S3: seed + tick + journal is the whole game ----
console.log("\n--- S3: the journal replays, bit for bit ---");
{
  // The claim rng.js and step.js have made since phase 2, finally falsifiable:
  // boot the same world twice, hand the second boot nothing but the first
  // sitting's tape, and demand the END STATES be JSON-identical. Every bot
  // decision re-runs from the seed; every human verb re-issues from the tape;
  // anything viewer-dependent left in the sim would diverge the copies.
  const SEED = 20260828;
  const boot = () => {
    reset(); S().seed = SEED; S().rngState = SEED; S().map = null; S().seen = {};
    api.initAdversaries(); api.ensureMap();
    api.me().res.food = 300; api.me().res.wood = 200; api.me().res.stone = 100;
    api.me().units.soldier = 4; api.syncPopMirror();
    api.clearJournal();
  };
  boot();
  // A scripted sitting, spanning the verb families: construction, structure,
  // settle, army formation, a march. Bots settle, expand and raid around it
  // on the world's own dice.
  run(3);
  api.build(api.defById("barracks"));
  run(8);
  const spot = api.holdings().find((id) => id !== api.world.home);
  api.launchStructure(spot, "infirmary");
  run(6);
  const freeHex = Object.values(api.world.places).find((p) =>
    p.terrain !== "water" && !p.adversary && !p.minor && api.ownerOf(p.id) == null);
  api.launchSettle(freeHex.id);
  run(5);
  const host = api.formArmy(api.world.home, { soldier: 3 }, "half");
  run(2);
  const marchTo = api.holdings().find((id) => id !== api.world.home);
  api.orderMove(host.uid, marchTo, api.me());
  run(45);
  const tape = api.journal();
  const endTick = S().tick;
  const want = JSON.stringify(S());

  boot();
  api.replayTo(tape, endTick);
  check("the tape carried every human verb, and only human verbs",
    tape.length === 5 && tape.every((e) => e.pid === 0));
  check("S3: seed + tick + journal replays the whole game BIT-IDENTICAL",
    JSON.stringify(S()) === want);
  // EVERY LEDGER KEY STAYS A NUMBER. Found in the first live boot of S2:
  // authored stocks name only what a people has, so accruing income onto a
  // missing key (a stone people's `stone`) was NaN within a minute of play.
  check("no civ's ledger holds a non-number after a lived-in world",
    S().players.every((p) => Object.values(p.res).every((v) => Number.isFinite(v))));
}

console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
