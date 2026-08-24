import { BOOST_BUILDING, DEF_INDEX, active } from "../content/compile.js";
import { ensurePop, hexPopSum, syncDominion, world } from "../map/map.js";
import { CONFIG, TICK_SECONDS } from "./config.js";
import { S } from "./state.js";
import { log } from "../ui/log.js";

// ---------- Derived values ----------------------------------
// Housing per hut is era-keyed, so advancing retroactively upgrades every hut
// you already own into a Stone House -- an immediate, visible jump rather than
// a new building sitting next to an obsolete one. See design.md.
// The play clock, derived: the tick count is the master record, seconds are
// a display. Old saves that carried seconds are converted once at load().
export function playtime() { return S.tick * TICK_SECONDS; }
export function housingPerHut() { return active().housingPerHut; }
// Housing is a timer-growth concept; under conquest growth there is no cap
// on holdings, only on what you have taken. Infinity keeps every comparison
// honest without a special case.
// housing() died in E3: the land's carrying capacity is the only ceiling.
export function totalUnits() { return Object.values(S.units).reduce((a, b) => a + b, 0); }
// Under a levy (Iron onward) population SUPPORTS the army instead of
// containing it: every holdfast stays in the assignable pool, and the war
// bands stand apart. Stone/Bronze keep the old fiction -- a person who
// becomes a soldier leaves the fields for good.
export function civilians() { return S.pop - totalUnits(); }   // the levy died in E5

// Army capacity under a levy: holdfasts x rate. Queued training counts
// against it the moment it's queued, same instant-reservation rule popCost
// always had.
// The army cap (E5): each held hex supports armyPerHex standing units, in
// every era -- the levy re-homed to the land. Territory is what lets you
// fight. (No map -- harness fixtures -- means no cap.)
export function levyCap() {
  return S.map ? S.map.owned.length * CONFIG.armyPerHex : Infinity;
}
export function levyUsed() {
  return totalUnits() + S.buildQueue.filter((q) => q.kind === "unit").length;
}
// jobsUsed() and releaseOrder() died here in E2 with the jobs system they
// served: people are not assigned, they LIVE somewhere (design.md,
// Population Lives Somewhere).
// Anyone currently reserved by an in-progress (or still-waiting) unit order --
// consumed the instant it's queued, not when it completes.
export function reserved() {
  if (active().levy) return 0;   // levied units never consume a civilian
  return S.buildQueue.reduce((sum, q) => {
    const def = defById(q.id);
    return sum + (def && def.popCost ? def.popCost : 0);
  }, 0);
}
// idle() died in E2: nobody is "unassigned" when people live on the land.

// Units marching with an expedition are alive (still in S.units, still eat,
// still count toward pop) but they are NOT HOME: they don't defend, and home
// casualties can't take them. Deployment is derived from S.expeditions rather
// than tracked separately, so it can never desync.
export function deployedCount(unitId) {
  return S.expeditions.reduce((sum, ex) => sum + ((ex.units && ex.units[unitId]) || 0), 0);
}
export function availableUnits(unitId) { return (S.units[unitId] || 0) - deployedCount(unitId); }

// Tool upgrades lift every gather rate (including the ores -- better tools cut
// ore too); boost buildings lift one resource each.
export function mults() {
  const tools = (S.upgrades.stoneTools  ? CONFIG.stoneToolsBonus  : 0)
              + (S.upgrades.bronzeTools ? CONFIG.bronzeToolsBonus : 0)
              + (S.upgrades.ironTools   ? CONFIG.ironToolsBonus   : 0);
  const out = {};
  for (const r of active().resources) {
    const boost = BOOST_BUILDING[r.id];
    out[r.id] = 1 + (boost ? (S.builds[boost] || 0) * CONFIG.buildingBonus : 0) + tools;
  }
  return out;
}

export function caps() {
  const out = {};
  for (const r of active().resources) {
    out[r.id] = r.baseCap + (r.capBuilding ? (S.builds[r.capBuilding] || 0) * CONFIG.storageAdd : 0);
  }
  return out;
}

// Gross production per second, per resource, plus the food upkeep line. Upkeep
// is charged on total population (S.pop), which already includes Soldiers --
// no separate formula needed for "units eat too." This reports what workers
// dig up, EXCLUDING converters -- step() applies those separately via
// runConverters. The ledger displays ledgerRates() (below), which folds the
// converter flows back in for an honest what's-happening-to-the-pile view.
export function rates() {
  const m = mults();
  const prod = {};
  for (const r of active().resources) prod[r.id] = 0;
  // ONE formula, from the first minute to the last (engine rework E2):
  // output = people x per-capita rate x terrain. The hex's FLOORED population
  // works the land -- the same whole people the tile detail shows -- so what
  // you read is what you earn. A tile the rebuilt world doesn't know (a
  // harness fixture, a mid-migration save) works at par rather than silently
  // at zero.
  const work = (S.map && S.map.work) || {};
  const owned = (S.map && S.map.owned) || [];
  const pops = (S.map && S.map.pop) || {};
  const works = (active().map && active().map.works) || {};
  for (const tid in work) {
    if (!owned.includes(tid)) continue;
    const resId = work[tid];
    if (!(resId in prod)) continue;
    const people = Math.floor(pops[tid] || 0);
    if (people <= 0) continue;
    const terrain = world && world.places[tid] ? world.places[tid].terrain : null;
    const rate = terrain && works[terrain] && works[terrain][resId] != null ? works[terrain][resId] : 1;
    prod[resId] += people * CONFIG.baseRate * rate * (m[resId] || 1);
  }
  // Upkeep is charged on the people who actually exist -- the hex sum -- plus
  // the war bands, who live outside the population under a levy. Per-capita
  // on both sides, so the feed ratio survives any scale.
  // Armies eat in EVERY era now: units live outside the hex populations, so
  // they are always extra mouths. (They were free at Stone/Bronze during the
  // E2-E4 window, which was a known quirk, not a design.)
  const mouths = hexPopSum() + totalUnits();
  const upkeep = mouths * CONFIG.upkeep * (S.upgrades.fireMastery ? 0.85 : 1);
  return Object.assign(prod, { upkeep, foodNet: prod.food - upkeep });
}

// What each converter is actually running at RIGHT NOW, as net per-second
// flows (+output, -input). Mirrors runConverters' three clamps. The input
// clamp counts this second's incoming production alongside the stock, so a
// Forge fed at exactly its consumption rate -- the designed equilibrium --
// reads as running steadily instead of flickering with the stock's float
// remainder.
export function converterFlows(prod) {
  const c = caps();
  const flows = {};
  for (const def of active().buildings) {
    if (!def.converts) continue;
    const owned = S.builds[def.id] || 0;
    if (owned <= 0) continue;
    const spec = def.converts;
    let batches = owned * spec.rate;
    for (const k in spec.in)  batches = Math.min(batches, ((S.res[k] || 0) + (prod[k] || 0)) / spec.in[k]);
    for (const k in spec.out) batches = Math.min(batches, ((c[k] || 0) - (S.res[k] || 0)) / spec.out[k]);
    if (!(batches > 0)) continue;
    for (const k in spec.in)  flows[k] = (flows[k] || 0) - spec.in[k] * batches;
    for (const k in spec.out) flows[k] = (flows[k] || 0) + spec.out[k] * batches;
  }
  return flows;
}

// The LEDGER's view of rates: gross production plus converter flows -- what
// is actually happening to each pile, same spirit as food's net line. The
// simulation deliberately does NOT use this: step() applies production and
// runConverters separately, and folding flows into rates() would convert
// everything twice.
export function ledgerRates() {
  const r = rates();
  const flows = converterFlows(r);
  for (const k in flows) r[k] += flows[k];
  r.foodNet = r.food - r.upkeep;
  return r;
}

// Population growth is a background process, not an event, and settlers are
// FREE -- no food price (the old lump-sum purchase model is gone; see
// design.md, "Settled: population growth is not an event"). Progress accrues
// only while housing has room, and FREEZES (not resets) while full, so
// building a hut lets a partially-waited arrival land soon after. Housing is
// the sole lever on population; food's pressure is entirely upkeep.
// accrueGrowth() -- the free settler timer -- died in E3. Growth is local
// (people grow toward each hex's cap) and expansion is a claim you pay for.

// What each queue card should SAY. Only the front item is under construction
// (see step()), so a queued item has two different numbers about it and they
// answer different questions:
//
//   own     -- how long it takes to build, once someone starts
//   waiting -- how long until anyone starts on it
//   done    -- waiting + own, the answer to "when will I have it"
//
// The card used to print `done` for every item with no other change, so a
// QUEUED card counted down while its progress bar sat at 0%. Both numbers were
// honest and together they told a lie: the owner watched a card in position two
// "shave off like 7 or 8 seconds" and reasonably read it as building early.
// Nothing was building early. The wait was shrinking, which is a different
// sentence and now gets said as one.
export function queueTiming(queue, buildSpeed) {
  const secs = (t) => Math.max(1, Math.ceil(t / buildSpeed));
  let ahead = 0;
  return (queue || []).map((item, i) => {
    const row = {
      uid: item.uid,
      active: i === 0,
      own: secs(item.remaining),
      waiting: i === 0 ? 0 : secs(ahead),
      done: secs(ahead + item.remaining),
    };
    ahead += item.remaining;
    return row;
  });
}

export function capWord(w) { return w.charAt(0).toUpperCase() + w.slice(1); }
// Good enough for every unit name this game will ever have ("Horseman" ->
// "Horsemen", everything else takes an s). Not a general pluralizer.
export function pluralize(name) { return name.endsWith("man") ? name.slice(0, -3) + "men" : name + "s"; }

// How many of this building/upgrade/unit are already owned or waiting in the
// queue -- keeps escalating prices (and one-time/capped limits) honest even
// when you queue several at once.
export function pendingCount(id) { return S.buildQueue.filter((q) => q.id === id).length; }

export function buildCost(def) {
  if (def.kind !== "building") return { ...def.base };  // upgrades & units: flat, never scale
  const n = (S.builds[def.id] || 0) + pendingCount(def.id);
  const out = {};
  for (const k in def.base) out[k] = Math.ceil(def.base[k] * Math.pow(def.scale, n));
  return out;
}
export function canAfford(cost) {
  for (const k in cost) if (S.res[k] < cost[k]) return false;
  return true;
}
export function isCapped(def) {
  return def.kind === "building" && def.cap != null &&
    (S.builds[def.id] || 0) + pendingCount(def.id) >= def.cap;
}
// Resolve a buildable id to its def. The active manifest wins -- that's what
// gives a log line or a queue card its era-correct name -- with DEF_INDEX as
// the fallback for ids that have left the manifest but can still be referred
// to (a capstone finishing at the very moment it retires itself).
export function defById(id) {
  const m = active();
  return m.buildings.find((b) => b.id === id) ||
         m.upgrades.find((u) => u.id === id) ||
         m.units.find((u) => u.id === id) ||
         DEF_INDEX[id];
}

// Once a building/upgrade/unit's reveal() condition has been true, it stays
// visible forever -- otherwise a threshold-based reveal (e.g. "wood >= 8")
// could flicker the whole panel back into hiding the moment that resource
// dips, which is exactly the kind of un-reveal nothing else in this game does.
export function isRevealed(def) {
  const key = "rev:" + def.id;
  if (S.seen[key]) return true;
  if (def.reveal()) { S.seen[key] = true; return true; }
  return false;
}

