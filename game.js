/* ============================================================
   Idle Civ — prototype game logic (v6)
   Deliberately small. Tune the CONFIG block to change the feel.
   ============================================================ */

"use strict";

// ---------- Tunable config ----------------------------------
const CONFIG = {
  tickMs: 200,            // simulation step
  baseRate: 0.20,         // resources/sec per assigned worker (before bonuses)
  buildingBonus: 0.12,    // additive production bonus per boost-building
  upkeep: 0.04,           // food/sec eaten by EACH settler (idle or working)
  startPop: 3,
  startFood: 12,          // small buffer so you have time to assign a forager
  baseHousing: 3,
  settlerIntervalSeconds: 45,  // a new settler arrives this often while housing has room -- free.
                               // THE growth-pacing dial; first guess, tune in play.
  // Per-resource base caps live on the RESOURCES table below, not here.
  storageAdd: 100,        // extra cap per storage building
  stoneToolsBonus: 0.08,  // flat additive bump to ALL gather multipliers from the Stone Tools upgrade
  bronzeToolsBonus: 0.15, // ditto, Bronze Tools -- stacks additively on top of Stone Tools
  buildSpeed: 1.0,        // global construction pace (seconds of progress per real second)
  conflictBaseChance: 0.0018,  // per-second base raid chance, before population scaling -- tripled
                                // after playtesting: original value averaged ~19min at pop 15, and
                                // a real session of well over an hour saw zero organic raids (a few
                                // percent likely by chance alone, but not the intended feel). This
                                // targets ~6-7min at pop 15, similar cadence to Sickness (~11min).
  conflictPopScale: 0.03,      // each point of population adds this fraction to the base chance
  counterBonus: 2.0,           // strength multiplier for the unit type that counters a raid.
                               // NOTE: non-countering units multiply by 1, never below -- units
                               // are never penalised for being the wrong type, only un-bonused.
  counterCasualtyRelief: 0.5,  // how much a fully-countered raid softens the costly-repel roll
  offlineCapHours: 4,
  saveKey: "idleCiv.v6",
};

// Every resource in the game. `capBuilding` is the storage building that
// raises its ceiling (null = no storage building, so it keeps its base cap);
// `reveal` gates whether it appears in the ledger at all. Adding a resource
// means adding a row here -- rates, caps, clamping and rendering all iterate
// this rather than naming resources individually.
const RESOURCES = [
  { id: "food",   name: "Food",   baseCap: 50,  capBuilding: "granary"  },
  { id: "wood",   name: "Wood",   baseCap: 50,  capBuilding: "woodshed" },
  { id: "stone",  name: "Stone",  baseCap: 50,  capBuilding: "stoneYard" },
  { id: "copper", name: "Copper", baseCap: 50,  capBuilding: "oreYard", reveal: () => S.era === "bronze" },
  { id: "tin",    name: "Tin",    baseCap: 50,  capBuilding: "oreYard", reveal: () => S.era === "bronze" },
  // Bronze is spent on upgrades rather than stockpiled, so it gets a generous
  // ceiling and no storage building of its own.
  { id: "bronze", name: "Bronze", baseCap: 200, capBuilding: null,      reveal: () => S.era === "bronze" },
];

// `rateMult` scales a job's yield against CONFIG.baseRate. Tin deliberately
// yields half of copper -- it's the scarce half of the alloy, which is both a
// real balance lever and why bronze was worth building trade routes over.
const JOBS = [
  { id: "forager",     name: "Forage food",  res: "food"  },
  { id: "woodcutter",  name: "Chop wood",    res: "wood"  },
  { id: "miner",       name: "Gather stone", res: "stone" },
  { id: "copperMiner", name: "Mine copper",  res: "copper", reveal: () => S.era === "bronze" },
  { id: "tinMiner",    name: "Mine tin",     res: "tin", rateMult: 0.5, reveal: () => S.era === "bronze" },
];

// Which building boosts which resource's yield (see mults()).
const BOOST_BUILDING = { food: "dryingRack", wood: "lumberCamp", stone: "stonePit" };

// Order jobs are emptied in when the population shrinks (see removeSettler).
// Foraging is released last so a shrinking settlement keeps feeding itself.
const RELEASE_ORDER = JOBS.map((j) => j.id).filter((id) => id !== "forager").reverse().concat("forager");

// ---------- Eras --------------------------------------------
// Only the display layer and a handful of tuning values vary by era. Ids never
// change (saves key off them) -- a def's `names`/`descs` maps override how it
// reads per era, falling back to its base `name`/`desc`. See tech.md.
const ERA_ORDER = ["stone", "bronze"];   // chronological; drives era comparisons
const ERA_NAMES = { stone: "Stone Age", bronze: "Bronze Age" };
const HOUSING_PER_HUT = { stone: 3, bronze: 5 };
const PANEL_TITLES = {
  "panel-holdings": { stone: "Settlement", bronze: "Village" },
};

// Buildings. `base` = cost of the first; each next costs *scale more (unless
// `cap`ped, in which case there is no "next" -- see Barracks).
// `buildTime` = seconds needed once a building reaches the front of the queue.
// `reveal` decides when it first appears (the screen "unravels").
const BUILDINGS = [
  {
    id: "hut", name: "Hut", kind: "building", desc: "Shelter for 3 more settlers.",
    names: { bronze: "Stone House" },
    descs: { bronze: "Shelter for 5 more settlers." },
    base: { wood: 15 }, scale: 1.6, buildTime: 12,
    reveal: () => S.res.wood >= 8 || S.builds.hut > 0,
  },
  {
    id: "woodshed", name: "Woodshed", kind: "building", desc: "Store +100 wood (else it rots in the rain).",
    base: { wood: 20 }, scale: 1.55, buildTime: 16,
    reveal: () => S.res.wood >= caps().wood * 0.7 || S.builds.woodshed > 0,
  },
  {
    id: "granary", name: "Granary", kind: "building", desc: "Store +100 food (else it spoils in the open).",
    base: { wood: 25 }, scale: 1.55, buildTime: 16,
    reveal: () => S.res.food >= caps().food * 0.7 || S.builds.granary > 0,
  },
  {
    id: "stoneYard", name: "Stone Yard", kind: "building", desc: "Store +100 stone (else the surplus is lost, unorganized).",
    base: { wood: 25, stone: 10 }, scale: 1.55, buildTime: 16,
    reveal: () => S.res.stone >= caps().stone * 0.7 || S.builds.stoneYard > 0,
  },
  {
    id: "dryingRack", name: "Drying Racks", kind: "building", desc: "Foragers gather +12% food.",
    base: { wood: 22 }, scale: 1.5, buildTime: 20,
    reveal: () => S.builds.hut >= 1,
  },
  {
    id: "lumberCamp", name: "Lumber Camp", kind: "building", desc: "Woodcutters gather +12% wood.",
    base: { wood: 18, stone: 10 }, scale: 1.5, buildTime: 24,
    reveal: () => S.builds.hut >= 1,
  },
  {
    id: "stonePit", name: "Stone Pit", kind: "building", desc: "Gatherers mine +12% stone.",
    base: { wood: 20, stone: 12 }, scale: 1.5, buildTime: 24,
    reveal: () => S.builds.hut >= 2,
  },
  {
    // Displays as "Medicine Tent" in the Stone Age so that "Infirmary" is
    // available as this same building's Bronze-era name. Id stays `infirmary`.
    id: "infirmary", name: "Infirmary", kind: "building", desc: "Reduces the chance sickness claims a life.",
    names: { stone: "Medicine Tent" },
    base: { wood: 24, stone: 8 }, scale: 1.5, buildTime: 20,
    reveal: () => S.builds.hut >= 1,
  },
  {
    id: "barracks", name: "Barracks", kind: "building", cap: 1,
    desc: "Lets your people train as Soldiers.",
    base: { wood: 40, stone: 15 }, scale: 1.5, buildTime: 30,
    reveal: () => S.builds.hut >= 1,
  },
  {
    id: "archeryRange", name: "Archery Range", kind: "building", era: "bronze", cap: 1,
    desc: "Lets your people train as Archers.",
    base: { wood: 50, stone: 20 }, scale: 1.5, buildTime: 28,
    reveal: () => S.era === "bronze" && S.builds.barracks >= 1,
  },
  {
    id: "stables", name: "Stables", kind: "building", era: "bronze", cap: 1,
    desc: "Lets your people train as Horsemen, and makes scouting possible.",
    base: { wood: 60, stone: 25, bronze: 10 }, scale: 1.5, buildTime: 34,
    reveal: () => S.era === "bronze" && S.builds.barracks >= 1,
  },
  {
    id: "oreYard", name: "Ore Yard", kind: "building", era: "bronze",
    desc: "Store +100 copper and +100 tin (ores pile up unusable otherwise).",
    base: { wood: 30, stone: 20 }, scale: 1.55, buildTime: 18,
    reveal: () => S.era === "bronze",
  },
  {
    // The first building that TRANSFORMS rather than produces or boosts.
    // No workers: the opportunity cost is already paid by the miners feeding
    // it, and "would you like to stop smelting?" isn't an interesting choice
    // when neither input has another use.
    id: "forge", name: "Forge", kind: "building", era: "bronze",
    desc: "Smelts 4 copper + 1 tin into 1 bronze, continuously.",
    base: { wood: 45, stone: 30 }, scale: 1.5, buildTime: 26,
    converts: { in: { copper: 4, tin: 1 }, out: { bronze: 1 }, rate: 0.05 },
    reveal: () => S.era === "bronze",
  },
];

// One-time upgrades: bought once, never scale, never repeat. Distinct from
// BUILDINGS (which you can own many of for a stacking benefit) -- this is the
// list era transitions (Bronze Age, etc.) will eventually live in.
const UPGRADES = [
  {
    id: "stoneTools", name: "Stone Tools", kind: "upgrade",
    desc: "Permanently improves all gathering by 8%.",
    base: { wood: 10 }, buildTime: 10,
    reveal: () => S.res.wood >= 5 || S.builds.hut > 0,
  },
  {
    id: "fireMastery", name: "Fire Mastery", kind: "upgrade",
    desc: "Permanently reduces food upkeep by 15%.",
    base: { wood: 30, food: 10 }, buildTime: 25,
    reveal: () => S.builds.hut >= 1,
  },
  {
    id: "herbalMedicine", name: "Herbal Medicine", kind: "upgrade",
    desc: "Increases how much each Medicine Tent reduces the chance sickness claims a life.",
    descs: { bronze: "Increases how much each Infirmary reduces the chance sickness claims a life." },
    base: { wood: 20, food: 20 }, buildTime: 20,
    reveal: () => S.builds.infirmary >= 1,
  },
  {
    id: "flintSpears", name: "Flint-Tipped Spears", kind: "upgrade",
    desc: "Sharper spearheads improve your Soldiers' odds in a fight.",
    base: { wood: 20, stone: 10 }, buildTime: 20,
    reveal: () => S.builds.barracks >= 1,
  },
  {
    id: "hideArmor", name: "Hide Armor", kind: "upgrade",
    desc: "Simple hide armor improves your Soldiers' odds of surviving a fight.",
    base: { wood: 15, food: 15 }, buildTime: 20,
    reveal: () => S.builds.barracks >= 1,
  },
  // The age capstone. An ordinary upgrade in every respect -- same queue, same
  // cancel/refund, same cost check -- so Sickness and Conflict keep rolling
  // through its long build. That's deliberately where "and some luck" lives.
  // Its completion is the ONLY place S.era is ever assigned.
  {
    id: "bronzeAge", name: "Bronze Age", kind: "upgrade", untilEra: "stone",
    desc: "Copper and tin, married in fire. Step out of the age of stone.",
    base: { food: 300, wood: 300, stone: 300 }, buildTime: 120,
    reveal: () => S.pop >= 10 && (S.units.soldier || 0) >= 1,
  },
  {
    id: "bronzeTools", name: "Bronze Tools", kind: "upgrade", era: "bronze",
    desc: "Permanently improves all gathering by 15%.",
    base: { wood: 40, bronze: 25 }, buildTime: 30,
    reveal: () => S.era === "bronze",
  },
  {
    id: "bronzeWeapons", name: "Bronze Weapons", kind: "upgrade", era: "bronze",
    desc: "Cast blades outclass flint. A further improvement to your Soldiers' odds in a fight.",
    base: { wood: 30, bronze: 40 }, buildTime: 30,
    reveal: () => S.era === "bronze" && S.builds.barracks >= 1,
  },
  {
    id: "scouting", name: "Scouting", kind: "upgrade", era: "bronze",
    desc: "Riders range beyond the valley and bring back word of what's out there.",
    base: { food: 40, bronze: 15 }, buildTime: 25,
    reveal: () => S.builds.stables >= 1,
  },
];

// Trainable person-types: like BUILDINGS (go through the same queue, same
// flat/escalating cost machinery) but `popCost` permanently consumes a
// civilian on completion, and ownership lives in S.units, not S.builds, so it
// renders in Your People instead of Settlement. See design.md / tech.md.
// `strength` is a unit's baseline contribution to defense; `counters` names the
// raid type it excels against (see RAID_TYPES). Soldiers stay the cheap
// generalist -- and notably the only one costing no bronze, so they remain
// buildable when the Forge is starved.
//
// `casualtyWeight` is how exposed a unit is when someone has to die: it scales
// that type's share of the casualty draw (see removeRandomUnit). Foot soldiers
// hold the line and take the brunt; horsemen can withdraw; archers shoot from
// the back and are hit least. Every weight is deliberately ABOVE ZERO -- this
// bends the odds, it never grants immunity, so an archer can always be the one
// who falls and an all-archer army has no protection at all.
const UNITS = [
  {
    id: "soldier", name: "Soldier", kind: "unit", popCost: 1, strength: 1.0,
    casualtyWeight: 1.0,
    desc: "A settler permanently trained for defense. Holds the line, and takes the worst of it.",
    base: { wood: 12 }, buildTime: 15,
    reveal: () => S.builds.barracks >= 1,
  },
  {
    id: "archer", name: "Archer", kind: "unit", era: "bronze", popCost: 1,
    strength: 1.0, counters: "massed", casualtyWeight: 0.35,
    desc: "Deadly against a massed charge, and safer than most — they fight from behind the line.",
    base: { wood: 14, bronze: 6 }, buildTime: 18,
    reveal: () => S.builds.archeryRange >= 1,
  },
  {
    id: "horseman", name: "Horseman", kind: "unit", era: "bronze", popCost: 1,
    strength: 1.5, counters: "riders", casualtyWeight: 0.6,
    desc: "Strong in any fight, quick enough to run down mounted raiders, and quick enough to withdraw.",
    base: { wood: 20, bronze: 14 }, buildTime: 24,
    reveal: () => S.builds.stables >= 1,
  },
];

// Minimal line-art doodles -- no map, just icons.
const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';
const BUILDING_ICONS = {
  hut:        `<svg ${ICON_ATTRS}><path d="M4 12 L12 5 L20 12 M6 12 V20 H18 V12 M11 20 V15 H13 V20"/></svg>`,
  woodshed:   `<svg ${ICON_ATTRS}><path d="M4 20 V10 L12 5 L20 10 V20 M4 20 H20 M7 13 H10 M7 16 H10"/></svg>`,
  granary:    `<svg ${ICON_ATTRS}><path d="M7 20 V9 A5 4 0 0 1 17 9 V20 M7 9 H17 M7 13 H17"/></svg>`,
  stoneYard:  `<svg ${ICON_ATTRS}><path d="M4 20 H20 M5 20 V10 H19 V20"/><circle cx="9" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="13" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/></svg>`,
  dryingRack: `<svg ${ICON_ATTRS}><path d="M4 8 H20 M4 8 V20 M20 8 V20 M8 8 L6.5 14 M12 8 V15 M16 8 L17.5 14"/></svg>`,
  lumberCamp: `<svg ${ICON_ATTRS}><circle cx="8" cy="16" r="3"/><circle cx="14" cy="16" r="3"/><circle cx="11" cy="10" r="3"/></svg>`,
  stonePit:   `<svg ${ICON_ATTRS}><path d="M4 8 H20 L16 20 H8 Z"/><circle cx="10.5" cy="13" r="0.8" fill="currentColor" stroke="none"/><circle cx="14" cy="15.5" r="0.8" fill="currentColor" stroke="none"/></svg>`,
  infirmary:  `<svg ${ICON_ATTRS}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8 V16 M8 12 H16"/></svg>`,
  barracks:   `<svg ${ICON_ATTRS}><path d="M4 20 H20 M6 20 V12 L12 7 L18 12 V20 M12 7 V2 M12 3 L17 4.5 L12 6"/></svg>`,
  oreYard:    `<svg ${ICON_ATTRS}><path d="M4 20 H20 M7 20 L10 12 H14 L17 20"/><path d="M10 12 L12 8 L14 12"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>`,
  forge:      `<svg ${ICON_ATTRS}><path d="M4 20 H20 M6 20 V13 A6 5 0 0 1 18 13 V20"/><path d="M12 13 V9 M9.5 11 L12 8 L14.5 11"/></svg>`,
  archeryRange: `<svg ${ICON_ATTRS}><path d="M6 3 A13 13 0 0 1 6 21"/><path d="M6 3 L6 21"/><path d="M6 12 H19 M16 9 L19 12 L16 15"/></svg>`,
  stables:    `<svg ${ICON_ATTRS}><path d="M4 20 V11 L12 6 L20 11 V20 M4 20 H20"/><path d="M10 20 V15 H14 V20"/></svg>`,
};
const PERSON_ICONS = {
  settler: `<svg ${ICON_ATTRS}><circle cx="12" cy="7" r="3"/><path d="M6 20 C6 13 8.5 11 12 11 C15.5 11 18 13 18 20"/></svg>`,
  soldier: `<svg ${ICON_ATTRS}><circle cx="10" cy="7" r="3"/><path d="M4.5 20 C4.5 13 7 11 10 11 C13 11 15 13 15 20"/><path d="M8 3 L20 21"/></svg>`,
  archer:  `<svg ${ICON_ATTRS}><circle cx="9" cy="6" r="2.6"/><path d="M4 20 C4 14 6 12 9 12 C12 12 14 14 14 20"/><path d="M17 3 A11 11 0 0 1 17 19"/><path d="M17 3 L17 19 M17 11 H10"/></svg>`,
  horseman:`<svg ${ICON_ATTRS}><circle cx="9" cy="4.5" r="2.2"/><path d="M6 11 C6 8 7.5 7 9 7 C10.5 7 12 8 12 11"/><path d="M3 20 V16 C3 14 5 13 8 13 H14 L18 10 V13 C18 13 20 14 20 16 V20"/><path d="M7 20 V17 M16 20 V17"/></svg>`,
};

// ---------- State -------------------------------------------
let S;
let SIM = false;         // true while fast-simulating (suppresses log spam)
let SIM_STOP = false;    // offline sim halts here instead of killing you
let SIM_STOP_CAUSE = null;
let loopId = null, saveId = null;
// Deliberately NOT part of S: pause is UI state, not game state. Keeping it out
// of the save means no schema change, and no loading into a frozen game and
// wondering why nothing is happening.
let paused = false;

function freshState() {
  return {
    res:   { food: CONFIG.startFood, wood: 0, stone: 0, copper: 0, tin: 0, bronze: 0 },
    jobs:  { forager: 0, woodcutter: 0, miner: 0, copperMiner: 0, tinMiner: 0 },
    builds:{ hut: 0, woodshed: 0, granary: 0, stoneYard: 0, dryingRack: 0, lumberCamp: 0, stonePit: 0,
             infirmary: 0, barracks: 0, oreYard: 0, forge: 0, archeryRange: 0, stables: 0 },
    // Trained person-types owned; separate from builds -- renders in Your People.
    units: { soldier: 0, archer: 0, horseman: 0 },
    upgrades: {},     // { [upgradeId]: true } -- presence means owned, one-time
    buildQueue: [],   // FIFO: [{ id, kind, uid, total, remaining, cost }, ...] -- only [0] progresses
    buildSeq: 0,
    pop: CONFIG.startPop,
    growth: 0,        // seconds accrued toward the next free settler; freezes while housing is full
    bought: 0,        // lifetime settlers grown -- a stat for the game-over screen
    era: "stone",     // gates which EVENTS are eligible; ages system lands later
    playtime: 0,      // seconds the simulation has actually advanced -- see step()
    seen: {},
    dead: false,
    lastSeed: Date.now(),
  };
}

// ---------- Derived values ----------------------------------
// Housing per hut is era-keyed, so advancing retroactively upgrades every hut
// you already own into a Stone House -- an immediate, visible jump rather than
// a new building sitting next to an obsolete one. See design.md.
function housingPerHut() { return HOUSING_PER_HUT[S.era] || HOUSING_PER_HUT.stone; }
function housing() { return CONFIG.baseHousing + S.builds.hut * housingPerHut(); }
function totalUnits() { return Object.values(S.units).reduce((a, b) => a + b, 0); }
function civilians() { return S.pop - totalUnits(); }
function jobsUsed() { return JOBS.reduce((sum, j) => sum + (S.jobs[j.id] || 0), 0); }
// Anyone currently reserved by an in-progress (or still-waiting) unit order --
// consumed the instant it's queued, not when it completes.
function reserved() {
  return S.buildQueue.reduce((sum, q) => {
    const def = defById(q.id);
    return sum + (def && def.popCost ? def.popCost : 0);
  }, 0);
}
function idle() { return civilians() - jobsUsed() - reserved(); }

// Tool upgrades lift every gather rate (including the ores -- better tools cut
// ore too); boost buildings lift one resource each.
function mults() {
  const tools = (S.upgrades.stoneTools  ? CONFIG.stoneToolsBonus  : 0)
              + (S.upgrades.bronzeTools ? CONFIG.bronzeToolsBonus : 0);
  const out = {};
  for (const r of RESOURCES) {
    const boost = BOOST_BUILDING[r.id];
    out[r.id] = 1 + (boost ? (S.builds[boost] || 0) * CONFIG.buildingBonus : 0) + tools;
  }
  return out;
}

function caps() {
  const out = {};
  for (const r of RESOURCES) {
    out[r.id] = r.baseCap + (r.capBuilding ? (S.builds[r.capBuilding] || 0) * CONFIG.storageAdd : 0);
  }
  return out;
}

// Gross production per second, per resource, plus the food upkeep line. Upkeep
// is charged on total population (S.pop), which already includes Soldiers --
// no separate formula needed for "units eat too." Note this reports what
// workers dig up; the Forge's consumption is applied in step(), not here, so
// the ledger's copper/tin rates read as gross mining output.
function rates() {
  const m = mults();
  const prod = {};
  for (const r of RESOURCES) prod[r.id] = 0;
  for (const j of JOBS) {
    prod[j.res] += (S.jobs[j.id] || 0) * CONFIG.baseRate * (j.rateMult || 1) * (m[j.res] || 1);
  }
  const upkeep = S.pop * CONFIG.upkeep * (S.upgrades.fireMastery ? 0.85 : 1);
  return Object.assign(prod, { upkeep, foodNet: prod.food - upkeep });
}

// Population growth is a background process, not an event, and settlers are
// FREE -- no food price (the old lump-sum purchase model is gone; see
// design.md, "Settled: population growth is not an event"). Progress accrues
// only while housing has room, and FREEZES (not resets) while full, so
// building a hut lets a partially-waited arrival land soon after. Housing is
// the sole lever on population; food's pressure is entirely upkeep.
function accrueGrowth(dt) {
  if (S.pop >= housing()) return;
  S.growth += dt;
  while (S.growth >= CONFIG.settlerIntervalSeconds && S.pop < housing()) {
    S.growth -= CONFIG.settlerIntervalSeconds;
    S.pop += 1;
    S.bought += 1;
    if (!SIM) log("A wanderer joins your settlement.", "good");
  }
}

// How many of this building/upgrade/unit are already owned or waiting in the
// queue -- keeps escalating prices (and one-time/capped limits) honest even
// when you queue several at once.
function pendingCount(id) { return S.buildQueue.filter((q) => q.id === id).length; }

function buildCost(def) {
  if (def.kind !== "building") return { ...def.base };  // upgrades & units: flat, never scale
  const n = (S.builds[def.id] || 0) + pendingCount(def.id);
  const out = {};
  for (const k in def.base) out[k] = Math.ceil(def.base[k] * Math.pow(def.scale, n));
  return out;
}
function canAfford(cost) {
  for (const k in cost) if (S.res[k] < cost[k]) return false;
  return true;
}
function isCapped(def) {
  return def.kind === "building" && def.cap != null &&
    (S.builds[def.id] || 0) + pendingCount(def.id) >= def.cap;
}
function defById(id) {
  return BUILDINGS.find((b) => b.id === id) || UPGRADES.find((u) => u.id === id) || UNITS.find((u) => u.id === id);
}

// A def's displayed name/description can vary by era; its id never does. All
// rendering and all log lines go through these rather than reading def.name /
// def.desc directly, so reflavoring a later age costs nothing structurally.
// `era` defaults to the current one; the Info panel passes an explicit era so a
// Bronze tab reads with Bronze names even while you're still in the Stone Age.
function displayName(def, era) { return (def.names && def.names[era || S.era]) || def.name; }
function displayDesc(def, era) { return (def.descs && def.descs[era || S.era]) || def.desc; }

// Which era a def is INTRODUCED in. Untagged defs are Stone Age, so only
// later-era content needs an explicit `era` field.
function defEra(def) { return def.era || "stone"; }
function eraIndex(era) { const i = ERA_ORDER.indexOf(era); return i === -1 ? 0 : i; }

// Whether a def exists at all in a given era. Most things persist once
// introduced (a Hut is still there in the Bronze Age, just renamed Stone
// House), so availability runs from `era` onward. An optional `untilEra`
// marks something that stops being available -- currently only age capstones,
// but this is also the hook a future consolidating age will need when it
// genuinely retires a building.
function availableInEra(def, era) {
  const i = eraIndex(era);
  if (i < eraIndex(defEra(def))) return false;
  if (def.untilEra && i > eraIndex(def.untilEra)) return false;
  return true;
}

// Once a building/upgrade/unit's reveal() condition has been true, it stays
// visible forever -- otherwise a threshold-based reveal (e.g. "wood >= 8")
// could flicker the whole panel back into hiding the moment that resource
// dips, which is exactly the kind of un-reveal nothing else in this game does.
function isRevealed(def) {
  const key = "rev:" + def.id;
  if (S.seen[key]) return true;
  if (def.reveal()) { S.seen[key] = true; return true; }
  return false;
}

// ---------- Events ---------------------------------------------
// The generic occurrence engine. Every entry is one of three shapes:
//   canFire(S)         -- deterministic, re-checked and fired repeatedly per
//                          tick while true (e.g. population growth).
//   chancePerSecond    -- probabilistic hazard/windfall, converted to a
//                          per-tick roll. If it lands, an optional `counter`
//                          (a building) gets a second roll to negate it.
//   resolve(S, dt)      -- full escape hatch: owns its own trigger roll,
//                          effect, and flavor logging. For events too
//                          multi-staged to fit the generic shape (Conflict).
// Every event carries: eras (which ages it's eligible in -- NOTE: every new age
// needs an audit of this list, since an event omitted from it silently stops
// firing the moment the era flips),
// effect(S) (the state mutation), and flavor.{hit,negated} (Chronicle lines,
// picked at random). Adding a new event never touches the engine, only this list.
const EVENTS = [
  // NOTE: population growth is deliberately NOT an event -- it's a free,
  // timed background process (see accrueGrowth). The canFire archetype below
  // currently has no users but stays: it's the generic deterministic shape.
  {
    id: "greatHunt", eras: ["stone", "bronze"], sev: "good",
    chancePerSecond: 0.002,                         // ~8.3 real minutes average -- small, frequent
    effect: (S) => { S.res.food += Math.round(8 + S.pop * 1.2); },
    flavor: {
      hit: [
        "A hunting party returns with more than they hoped for -- there is meat enough to share.",
        "A lucky strike brings down a boar. The camp eats well tonight.",
      ],
    },
  },
  {
    id: "trader", eras: ["stone", "bronze"], sev: "good",
    chancePerSecond: 0.0009,                        // ~18.5 real minutes average -- rarer, bigger
    effect: (S) => {
      const bonus = Math.round(12 + S.pop * 1.5);
      S.res.wood += bonus; S.res.stone += bonus;
    },
    flavor: {
      hit: [
        "A trader passes through and leaves goods behind in exchange for hospitality.",
        "A stranger arrives with a laden pack, and departs with an empty one.",
      ],
    },
  },
  {
    id: "sickness", eras: ["stone", "bronze"], sev: "bad",
    condition: (S) => S.pop >= 4,
    chancePerSecond: 0.0015,                        // ~11 real minutes average, unmitigated
    counter: { building: "infirmary", reducePerUnit: (S) => S.upgrades.herbalMedicine ? 0.35 : 0.2 },
    effect: (S) => removeSettler(),
    flavor: {
      hit: [
        "A fever sweeps through the camp. One of your people does not recover.",
        "Sickness takes hold overnight. Your settlement wakes one fewer.",
      ],
      negated: [
        // Deliberately era-neutral wording -- this building is a Medicine Tent
        // in the Stone Age and an Infirmary in Bronze.
        "Sickness threatens the camp, but your healers keep it at bay.",
        "A fever passes through -- your healers see everyone through it.",
      ],
    },
  },
  {
    id: "conflict", eras: ["stone", "bronze"], sev: "bad",
    condition: (S) => S.pop >= 4,
    resolve: (S, dt) => {
      const chance = CONFIG.conflictBaseChance * (1 + S.pop * CONFIG.conflictPopScale);
      const p = 1 - Math.pow(1 - chance, dt);
      if (Math.random() >= p) return;

      const raidSize = rollRaidSize();
      const raid = rollRaidType();
      const defense = militaryStrength(raid);
      const repelChance = defense / (defense + raidSize);
      const say = (pool, sev) => { if (!SIM) log(pick(pool).replace("{raid}", raid.name), sev); };

      if (Math.random() < repelChance) {
        // Second dial: fielding the countering unit type doesn't just help you
        // win, it means fewer of your own die when you do.
        const relief = 1 - CONFIG.counterCasualtyRelief * counterCoverage(raid);
        const costlyChance = (raidSize / (defense + raidSize)) * armorFactor() * relief;
        if (Math.random() < costlyChance) {
          const lost = removeRandomUnit();
          if (!SIM) log(`The ${raid.name} is driven off, but not without cost — a ${lost || "defender"} falls in the fighting.`, "bad");
        } else {
          say(CONFLICT_FLAVOR.repelledClean, "good");
        }
      } else {
        const losses = Math.min(totalUnits(), 1 + Math.floor(raidSize / 5));
        for (let i = 0; i < losses; i++) removeRandomUnit();
        stealResources(raidSize);
        say(CONFLICT_FLAVOR.raidSucceeds, "bad");
        if (defense === 0 || defense < raidSize / 2) {
          removeSettler(true);   // conflict, unlike sickness, is allowed to zero out population
          say(CONFLICT_FLAVOR.civilianLost, "bad");
        }
      }
    },
  },
  {
    // Scouting unlocks a category of purely-positive discoveries. Gated on the
    // upgrade rather than the Stables, so building the Stables alone doesn't
    // hand it to you -- you have to actually invest in ranging out.
    id: "scoutFind", eras: ["bronze"], sev: "good",
    condition: (S) => !!S.upgrades.scouting,
    chancePerSecond: 0.0016,
    effect: (S) => {
      const haul = Math.round(15 + S.pop * 2);
      S.res.wood += haul; S.res.stone += haul;
      S.res.copper += Math.round(haul * 0.4);
    },
    flavor: {
      hit: [
        "Your scouts find an abandoned camp in the hills, and strip it of everything worth carrying.",
        "Riders return from the far valley with a cache nobody had claimed.",
        "Scouts map a seam of ore in the uplands and bring back the first of it.",
      ],
    },
  },
  {
    id: "scoutWarning", eras: ["bronze"], sev: "good",
    condition: (S) => !!S.upgrades.scouting && S.pop >= 4,
    chancePerSecond: 0.0012,
    effect: () => {},   // pure flavor: the value is knowing, not a stat change
    flavor: {
      hit: [
        "Scouts report smoke on the horizon. Something is moving out there, and it is moving this way.",
        "Your riders find tracks at the valley mouth — many, and recent.",
      ],
    },
  },
];

const CONFLICT_FLAVOR = {
  repelledClean: [
    "A {raid} tests your defenses and thinks better of it. Your line holds.",
    "A {raid} is spotted and driven off before it reaches the settlement.",
  ],
  raidSucceeds: [
    "A {raid} breaches your defenses. Stores are looted and your fighters pay the price.",
    "The settlement is overrun by a {raid} before anyone can hold them back.",
  ],
  civilianLost: [
    "In the chaos, one of your people is caught and does not survive.",
  ],
};

// Raid size rolls independently of everything else -- usually a small
// scouting party, rarely something much larger.
const RAID_SIZES = [
  { weight: 60, size: 2 },
  { weight: 30, size: 5 },
  { weight: 10, size: 10 },
];
function rollRaidSize() {
  const total = RAID_SIZES.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RAID_SIZES) {
    if (roll < r.weight) return r.size;
    roll -= r.weight;
  }
  return RAID_SIZES[0].size;
}

// What kind of raid shows up. Which unit counters which raid is recorded in
// ONE place only -- a unit def's `counters` field naming a raid id. (An earlier
// pass also stored the reverse mapping on the raid, and comparing the wrong
// pair of those two silently disabled every counter bonus.) A warband is simply
// a raid no unit names, so nothing counters it. Types roll in every era; in the
// Stone Age no counters exist yet, so they read as pure flavor until Bronze
// makes them matter.
const RAID_TYPES = [
  { id: "warband", name: "warband",         weight: 50 },
  { id: "massed",  name: "massed charge",   weight: 30 },
  { id: "riders",  name: "band of riders",  weight: 20 },
];
function counterUnitFor(raid) { return raid ? UNITS.find((u) => u.counters === raid.id) : undefined; }
function rollRaidType() {
  const total = RAID_TYPES.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RAID_TYPES) {
    if (roll < r.weight) return r;
    roll -= r.weight;
  }
  return RAID_TYPES[0];
}

// Weapon tiers replace each other rather than stacking -- highest owned wins.
function weaponMultiplier() {
  if (S.upgrades.bronzeWeapons) return 2.2;
  if (S.upgrades.flintSpears) return 1.6;
  return 1.0;
}
function armorFactor() { return S.upgrades.hideArmor ? 0.5 : 1.0; }

// A single unit type's contribution to defense against a given raid.
// The counter multiplier is either CONFIG.counterBonus or exactly 1 -- never
// below. Being the "wrong" unit costs you the bonus, never your base strength,
// so any army is always better than no army (see design.md).
function unitStrength(def, raid) {
  const n = S.units[def.id] || 0;
  if (!n) return 0;
  const matched = !!raid && def.counters === raid.id;
  return n * (def.strength || 1) * weaponMultiplier() * (matched ? CONFIG.counterBonus : 1);
}

function militaryStrength(raid) {
  return UNITS.reduce((sum, def) => sum + unitStrength(def, raid), 0);
}

// What share of your defense comes from the unit that counters this raid.
// Drives how much the costly-repel roll is softened.
function counterCoverage(raid) {
  const def = counterUnitFor(raid);
  if (!def) return 0;
  const total = militaryStrength(raid);
  if (total <= 0) return 0;
  return Math.min(1, unitStrength(def, raid) / total);
}

function stealResources(raidSize) {
  const fraction = Math.min(0.5, raidSize * 0.03);
  for (const k of ["food", "wood", "stone", "copper", "tin", "bronze"]) {
    S.res[k] -= Math.floor((S.res[k] || 0) * fraction);
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// How likely a landed hazard is deflected, based on its counter-building count.
// `reducePerUnit` may be a flat number or (S) => number, for counters whose
// strength itself can be upgraded (e.g. Herbal Medicine boosting Infirmary).
function negateChance(ev) {
  if (!ev.counter) return 0;
  const n = S.builds[ev.counter.building] || 0;
  const reduce = typeof ev.counter.reducePerUnit === "function"
    ? ev.counter.reducePerUnit(S) : ev.counter.reducePerUnit;
  return Math.min(1, n * reduce);
}

// A civilian dies: population drops, and if that leaves more workers assigned
// than civilians alive, the excess is pulled back to idle (wood/stone before
// food, so a starving settlement's last forager is the last to go). Sickness
// floors at 1 survivor; Conflict passes allowZero=true, since it's the one
// hazard allowed to end a run outright (see design.md, Failure).
function removeSettler(allowZero) {
  const floor = allowZero ? 0 : 1;
  if (S.pop <= floor) return;
  // Only civilians can be lost this way -- a settlement of nothing but trained
  // units has no one left for this to take. Without this guard S.pop could be
  // pushed below totalUnits(), making civilians() negative.
  if (civilians() <= 0) return;
  S.pop -= 1;
  reconcileWorkforce();
}

// After any loss of civilians, make sure nobody is still committed to work
// that no longer has a person behind it.
//
// The subtle part -- and the source of a real bug found in play, where `idle`
// displayed -1 -- is that a civilian can be spoken for in TWO ways: assigned to
// a job, or reserved by a queued unit order. An earlier version only balanced
// against jobsUsed(), so a death while a Soldier was queued left the books
// short by exactly the reserved worker.
function reconcileWorkforce() {
  let over = jobsUsed() + reserved() - civilians();

  // 1. Pull people out of jobs. RELEASE_ORDER is derived from JOBS (reversed,
  //    foraging last) so a new job can't be forgotten here, and a shrinking
  //    settlement keeps feeding itself for as long as possible.
  for (const jid of RELEASE_ORDER) {
    while (over > 0 && (S.jobs[jid] || 0) > 0) { S.jobs[jid]--; over--; }
  }

  // 2. If emptying every job still isn't enough, the people those queued unit
  //    orders were reserving are dead. Abandon the newest orders (refunding
  //    materials, as a manual cancel would) until the books balance.
  while (over > 0) {
    let idx = -1;
    for (let i = S.buildQueue.length - 1; i >= 0; i--) {
      const def = defById(S.buildQueue[i].id);
      if (def && def.popCost) { idx = i; break; }
    }
    if (idx === -1) break;                    // nothing left to give back
    const def = defById(S.buildQueue[idx].id);
    dropQueueItem(idx);
    over -= def.popCost || 1;
    if (!SIM) log(`${displayName(def)} training is abandoned — there is no one left to train.`, "bad");
  }
}

// A trained unit dies. Unlike removeSettler, the person was never in S.jobs,
// so there's no reassignment -- just drop them from the unit count and from
// total population together. Returns the display name of who was lost (for
// flavor), or null if there was nobody left to lose. Casualties are drawn at
// random, weighted by how many of each type are actually fielded.
function removeRandomUnit() {
  // Weighted by headcount AND exposure (`casualtyWeight`), so the front line
  // absorbs most losses. Because every weight is > 0, no type is ever immune:
  // this only bends the odds. With one type fielded it degenerates to "that
  // type dies," which is why an all-archer army gets no protection at all.
  const weightOf = (def) => (S.units[def.id] || 0) * (def.casualtyWeight || 1);
  const total = UNITS.reduce((sum, def) => sum + weightOf(def), 0);
  if (total <= 0) return null;

  let roll = Math.random() * total;
  for (const def of UNITS) {
    const w = weightOf(def);
    if (roll < w) {
      S.units[def.id] -= 1;
      S.pop -= 1;
      return displayName(def);
    }
    roll -= w;
  }
  // Floating-point guard: if rounding walked `roll` past the end, take from
  // whichever type still has someone left rather than returning null.
  for (let i = UNITS.length - 1; i >= 0; i--) {
    if ((S.units[UNITS[i].id] || 0) > 0) {
      S.units[UNITS[i].id] -= 1;
      S.pop -= 1;
      return displayName(UNITS[i]);
    }
  }
  return null;
}

function resolveEvents(dt) {
  for (const ev of EVENTS) {
    if (ev.eras && !ev.eras.includes(S.era)) continue;
    if (ev.condition && !ev.condition(S)) continue;

    if (ev.resolve) { ev.resolve(S, dt); continue; }

    if (ev.canFire) {
      let guard = 0;
      while (ev.canFire(S) && guard++ < 50) {
        // An effect may return its own line, for events whose message needs a
        // number only the effect knows (e.g. what a settler actually cost).
        const custom = ev.effect(S);
        if (!SIM) log(custom || pick(ev.flavor.hit), ev.sev);
      }
      continue;
    }

    if (ev.chancePerSecond) {
      const p = 1 - Math.pow(1 - ev.chancePerSecond, dt);
      if (Math.random() < p) {
        if (Math.random() < negateChance(ev)) {
          if (!SIM) log(pick(ev.flavor.negated), "good");
        } else {
          const custom = ev.effect(S);
          if (!SIM) log(custom || pick(ev.flavor.hit), ev.sev);
        }
      }
    }
  }
}

// Buildings carrying a `converts` spec transform stockpiled resources into
// another, continuously and without workers. Throughput is clamped three ways
// so it degrades smoothly instead of erroring or destroying inputs:
//   - by how many buildings you own x their rate x dt
//   - by the inputs actually in store (runs at partial rate, idles at zero)
//   - by headroom under the OUTPUT's cap, so a full bronze store stops the
//     Forge rather than quietly eating copper and tin for nothing.
function runConverters(dt) {
  const c = caps();
  for (const def of BUILDINGS) {
    if (!def.converts) continue;
    const owned = S.builds[def.id] || 0;
    if (owned <= 0) continue;

    const spec = def.converts;
    let batches = owned * spec.rate * dt;
    for (const k in spec.in)  batches = Math.min(batches, (S.res[k] || 0) / spec.in[k]);
    for (const k in spec.out) batches = Math.min(batches, ((c[k] || 0) - (S.res[k] || 0)) / spec.out[k]);
    if (!(batches > 0)) continue;

    for (const k in spec.in)  S.res[k] -= spec.in[k] * batches;
    for (const k in spec.out) S.res[k] += spec.out[k] * batches;
  }
}

// ---------- Core simulation ---------------------------------
function step(dt) {
  if (S.dead) return;
  // Playtime lives here rather than in the tick loop so it measures exactly one
  // thing: how far the world actually moved. Pausing skips step() entirely, so
  // the clock freezes; offline catch-up calls step() repeatedly, so the hours
  // it simulates are counted. Death stops it via the guard above.
  S.playtime += dt;
  const r = rates();

  // Gather + eat. Food is a net line so upkeep can drive it negative -> death.
  for (const res of RESOURCES) {
    S.res[res.id] += (res.id === "food" ? r.foodNet : r[res.id]) * dt;
  }

  runConverters(dt);

  // Storage caps: surplus spoils/rots/is lost (silent; a one-time hint fires via reveals).
  const c = caps();
  for (const res of RESOURCES) {
    if (S.res[res.id] > c[res.id]) S.res[res.id] = c[res.id];
  }

  // Starvation: food hits zero while the settlement can't feed itself.
  if (S.res.food <= 0 && r.foodNet < 0) {
    S.res.food = 0;
    if (SIM) { SIM_STOP = true; SIM_STOP_CAUSE = "starvation"; return; }
    die("starvation");
    return;
  }
  if (S.res.food < 0) S.res.food = 0;

  // Only the item at the front of the queue is actively under construction --
  // no worker assignment needed; the queue itself is the scarcity.
  if (S.buildQueue.length) {
    const front = S.buildQueue[0];
    front.remaining -= CONFIG.buildSpeed * dt;
    if (front.remaining <= 0) {
      S.buildQueue.shift();
      completeConstruction(front);
    }
  }

  // A free settler every N seconds while housing has room.
  accrueGrowth(dt);

  // Sickness, conflict, windfalls, and anything else on EVENTS.
  resolveEvents(dt);

  // Conflict (and in principle anything else) can zero out population --
  // checked generically here rather than attributed to a specific event.
  if (S.pop <= 0) {
    if (SIM) { SIM_STOP = true; SIM_STOP_CAUSE = "conflict"; return; }
    die("conflict");
  }
}

function die(cause) {
  S.dead = true;
  // One terse line so the Chronicle -- the settlement's memory -- still ends
  // with its own ending. The dramatic version and the actionable bits live in
  // the game-over modal instead.
  if (cause === "conflict") log("The last defenders fall. The settlement is overrun.", "big");
  else log("The last of your people starve. The settlement falls silent.", "big");
  const badge = document.getElementById("ageBadge");
  if (badge) { badge.textContent = "[Fallen]"; badge.classList.add("fallen"); }
  document.body && document.body.classList.add("dead");
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
  if (loopId) clearInterval(loopId);
  if (saveId) clearInterval(saveId);
  // Last render before the loop stops, so the clock shows the run's final time.
  renderAll();
  openGameOverModal(cause);
}

// ---------- Actions -----------------------------------------
function assign(jobId, delta) {
  if (S.dead) return;
  if (delta > 0) { if (idle() <= 0) return; S.jobs[jobId] += 1; }
  else           { if (S.jobs[jobId] <= 0) return; S.jobs[jobId] -= 1; }
  renderAll();
}

// Clicking a building/upgrade/unit pays for it immediately and drops it in
// the (shared) queue. If the queue was empty it starts progressing right
// away; otherwise it waits its turn behind whatever's already building.
function build(def) {
  if (S.dead) return;
  if (def.kind === "upgrade" && (S.upgrades[def.id] || pendingCount(def.id) > 0)) return;
  if (isCapped(def)) return;
  const cost = buildCost(def);
  if (!canAfford(cost)) return;
  if (def.popCost && idle() < def.popCost) return;
  for (const k in cost) S.res[k] -= cost[k];
  const wasEmpty = S.buildQueue.length === 0;
  S.buildQueue.push({ id: def.id, kind: def.kind, uid: ++S.buildSeq, total: def.buildTime, remaining: def.buildTime, cost });
  if (def.kind === "upgrade") {
    log(wasEmpty ? `Work begins on ${displayName(def)}.` : `${displayName(def)} joins the queue (#${S.buildQueue.length}).`);
  } else if (def.kind === "unit") {
    log(wasEmpty ? `${displayName(def)} training begins.` : `${displayName(def)} training joins the queue (#${S.buildQueue.length}).`);
  } else {
    log(wasEmpty ? `Ground is broken for a ${displayName(def)}.` : `A ${displayName(def)} joins the queue (#${S.buildQueue.length}).`);
  }
  renderAll();
}

// Cancel anything in the queue -- including the item currently building --
// for a full refund of what was actually paid for it. Population reserved by
// a cancelled unit order is automatically freed, since idle()/reserved() are
// derived live from S.buildQueue rather than tracked separately.
// Removes a queue entry and hands its materials back. Shared by the player's
// cancel button and by the workforce reconciler, which has to abandon orders
// whose worker died.
function dropQueueItem(idx) {
  const item = S.buildQueue[idx];
  if (!item) return null;
  for (const k in item.cost) S.res[k] = (S.res[k] || 0) + item.cost[k];
  S.buildQueue.splice(idx, 1);
  return item;
}

function cancelBuild(uid) {
  if (S.dead) return;
  const idx = S.buildQueue.findIndex((q) => q.uid === uid);
  if (idx === -1) return;
  const item = dropQueueItem(idx);
  log(`Construction of the ${displayName(defById(item.id))} is called off; materials recovered.`);
  renderAll();
}

function completeConstruction(site) {
  const def = defById(site.id);
  if (def.kind === "upgrade") S.upgrades[def.id] = true;
  else if (def.kind === "unit") S.units[def.id] = (S.units[def.id] || 0) + 1;
  else S.builds[def.id] = (S.builds[def.id] || 0) + 1;
  onComplete(def);
}

function onComplete(def) {
  if (def.id === "bronzeAge") { advanceEra("bronze"); return; }

  if (def.id === "hut") {
    const n = S.builds.hut;
    if (n === 1) log(`A ${displayName(def).toLowerCase()} stands. There is room to grow.`, "good");
    else log(`Another ${displayName(def).toLowerCase()} raised. Housing now ${housing()}.`, "good");
    if (n === 3) log("A cluster of rooftops — this is becoming a real place.", "big");
  } else if (def.kind === "unit") {
    log(`A settler trains as a ${displayName(def)}. You now field ${S.units[def.id]}.`, "good");
  } else {
    log(`${displayName(def)} complete. ${displayDesc(def)}`, "good");
  }
}

// The one and only place S.era is ever assigned. Everything the transition
// visibly changes -- panel titles, building names, housing per hut -- is
// derived from S.era at render time, so flipping it is the whole operation.
// The full announcement lives in a modal; a single milestone line still goes
// to the Chronicle so the settlement's own record contains the moment.
function advanceEra(era) {
  const before = { housing: housing() };
  S.era = era;
  // Silent during offline catch-up -- simulateOffline() announces it instead,
  // rather than firing a modal at someone the instant the page loads.
  if (SIM) return;
  log(`The ${ERA_NAMES[era]} begins.`, "big");
  openEraModal(era, before);
}

// ---------- Progressive reveal / one-time hints -------------
const REVEALS = [
  { id: "wood",  when: () => S.res.wood  > 0, msg: "You have wood enough to notice its worth." },
  { id: "stone", when: () => S.res.stone > 0, msg: "Stone piles up beside the wood." },
  { id: "build", when: () => S.res.wood >= 8, msg: "There is timber enough to build. Raise a hut for your people." },
  { id: "tools", when: () => S.builds.hut >= 1, msg: "With shelter secured, your people turn to better tools." },
  { id: "rotFood", when: () => S.res.food >= caps().food - 0.01,
    msg: "Your food stores are full — the surplus spoils in the open. Build a Granary." },
  { id: "rotWood", when: () => S.res.wood >= caps().wood - 0.01,
    msg: "Your woodpile is full — extra timber rots in the rain. Build a Woodshed." },
  { id: "rotStone", when: () => S.res.stone >= caps().stone - 0.01,
    msg: "Loose stone is piling up faster than anyone can stack it — the excess is lost. Build a Stone Yard." },
  { id: "sicknessWarn", when: () => S.pop >= 4,
    msg: "More mouths, more risk — crowded camps invite sickness. An infirmary would ease their fears." },
  { id: "conflictWarn", when: () => S.pop >= 4,
    msg: "Word of raiders reaches the settlement. A Barracks would let your people take up arms." },
  { id: "rotOre", when: () => S.era === "bronze" &&
      (S.res.copper >= caps().copper - 0.01 || S.res.tin >= caps().tin - 0.01),
    msg: "Ore is heaped up beyond what anyone can sort — the excess is lost. Build an Ore Yard." },
  { id: "firstBronze", when: () => S.res.bronze > 0,
    msg: "The first ingots cool in the mould. Bronze is yours to work with." },
  { id: "bronzeAvailable", when: () => S.era === "stone" && S.pop >= 10 && (S.units.soldier || 0) >= 1,
    msg: "Travellers speak of a harder metal, poured rather than chipped. Your people could reach it — with enough stores behind them." },
];

function checkReveals() {
  for (const rv of REVEALS) {
    if (S.seen[rv.id]) continue;
    if (rv.when()) {
      S.seen[rv.id] = true;
      if (!SIM && rv.msg) log(rv.msg);
    }
  }
}

// ---------- Logging -----------------------------------------
function log(text, cls) {
  const el = document.getElementById("log");
  if (!el) return;
  const div = document.createElement("div");
  div.className = "entry" + (cls ? " " + cls : "");
  div.textContent = text;

  // Only the newest entry ever carries "latest" -- hand it off from whoever had it.
  const prevLatest = el.querySelector(".entry.latest");
  if (prevLatest) prevLatest.classList.remove("latest");
  div.classList.add("latest");

  el.prepend(div);                                    // newest at the top, no scrolling needed to see it
  while (el.children.length > 60) el.removeChild(el.lastChild);  // oldest is now at the bottom -- trim there
  el.scrollTop = 0;                                    // keep the latest in view even if new lines keep coming
}

// ---------- Rendering ---------------------------------------
function fmt(n) { return Math.floor(n).toLocaleString(); }
function fmtRate(n) { return (n > 0 ? "+" : "") + n.toFixed(2) + "/s"; }

// Shared create-once-update-in-place tile, used by Settlement (buildings) and
// Your People (person-types) -- same visual language, different data source.
function renderTile(container, prefix, id, icon, name, count) {
  let tile = document.getElementById(prefix + id);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "holding";
    tile.id = prefix + id;
    tile.innerHTML =
      `<span class="h-icon">${icon}</span>` +
      `<span class="h-name" id="${prefix}${id}-name"></span>` +
      `<span class="h-count" id="${prefix}${id}-count"></span>`;
    container.appendChild(tile);
  }
  // Name is refreshed every render, not just baked in at creation -- an era
  // change renames existing tiles in place (Medicine Tent -> Infirmary).
  document.getElementById(`${prefix}${id}-name`).textContent = name;
  document.getElementById(`${prefix}${id}-count`).textContent = count;
}

// Rows are built from RESOURCES on first appearance rather than being written
// into index.html, so adding a resource needs no markup change.
function renderResources() {
  const bar = document.getElementById("resourceBar");
  const r = rates();
  const c = caps();
  const any = RESOURCES.some((res) => S.res[res.id] > 0);
  const empty = document.getElementById("emptyStores");
  if (empty) empty.classList.toggle("hidden", any);

  for (const res of RESOURCES) {
    // Food is always shown (it's the thing that can kill you); everything else
    // appears once you hold some, or once its era arrives. Reveals are sticky.
    const show = S.res[res.id] > 0 || res.id === "food" || S.seen["res:" + res.id] ||
      (res.reveal && res.reveal());
    if (show) S.seen["res:" + res.id] = true;

    let row = document.getElementById("res-" + res.id);
    if (!row) {
      if (!show) continue;
      row = document.createElement("div");
      row.className = "res";
      row.id = "res-" + res.id;
      row.innerHTML =
        `<span class="res-name">${res.name}</span>` +
        `<span class="res-val" id="val-${res.id}">0</span>` +
        `<span class="res-rate" id="rate-${res.id}"></span>`;
      bar.appendChild(row);
    }
    row.classList.toggle("hidden", !show);
    if (!show) continue;

    const cap = c[res.id];
    const valEl = document.getElementById("val-" + res.id);
    valEl.innerHTML = `${fmt(S.res[res.id])}<span class="cap"> / ${fmt(cap)}</span>`;
    valEl.classList.toggle("full", S.res[res.id] >= cap - 0.01);

    const rateEl = document.getElementById("rate-" + res.id);
    const rate = (res.id === "food" ? r.foodNet : r[res.id]) || 0;
    rateEl.textContent = rate !== 0 ? fmtRate(rate) : "";
    rateEl.classList.toggle("pos", rate > 0);
    rateEl.classList.toggle("neg", rate < 0);
  }
}

function renderPeople() {
  const tiles = document.getElementById("personTiles");
  renderTile(tiles, "ptile-", "settler", PERSON_ICONS.settler, "Settler", civilians());
  for (const def of UNITS) {
    if (!isRevealed(def)) continue;
    renderTile(tiles, "ptile-", def.id, PERSON_ICONS[def.id] || "", displayName(def), S.units[def.id] || 0);
  }

  document.getElementById("popIdle").textContent = idle();
  document.getElementById("popCap").textContent = housing();

  const gl = document.getElementById("growthLine");
  if (S.pop >= housing()) {
    gl.innerHTML = "Housing is full — no one new can settle here.";
  } else {
    const remaining = Math.max(0, CONFIG.settlerIntervalSeconds - S.growth);
    gl.innerHTML = `Next settler arrives in <span class="cost">${Math.ceil(remaining)}s</span>.`;
  }

  const list = document.getElementById("jobList");
  const r = rates();
  for (const job of JOBS) {
    // Later-era jobs stay hidden until their era arrives; sticky once shown.
    const show = !job.reveal || S.seen["job:" + job.id] || job.reveal();
    if (show) S.seen["job:" + job.id] = true;

    let row = document.getElementById("job-" + job.id);
    if (!row) {
      if (!show) continue;
      row = document.createElement("div");
      row.className = "job";
      row.id = "job-" + job.id;
      row.innerHTML =
        `<span class="job-name">${job.name}</span>` +
        `<span class="job-out" id="out-${job.id}"></span>` +
        `<button class="stepper" data-job="${job.id}" data-d="-1">−</button>` +
        `<span class="job-count" id="cnt-${job.id}">0</span>` +
        `<button class="stepper" data-job="${job.id}" data-d="1">+</button>`;
      list.appendChild(row);
      row.querySelectorAll(".stepper").forEach((b) =>
        b.addEventListener("click", () => assign(b.dataset.job, Number(b.dataset.d))));
    }
    row.classList.toggle("hidden", !show);
    if (!show) continue;

    document.getElementById("cnt-" + job.id).textContent = S.jobs[job.id] || 0;
    // Per-job output, not the resource total -- two jobs never share a resource
    // today, but showing the job's own contribution is the honest reading.
    const own = (S.jobs[job.id] || 0) * CONFIG.baseRate * (job.rateMult || 1) * (mults()[job.res] || 1);
    document.getElementById("out-" + job.id).textContent =
      (S.jobs[job.id] || 0) > 0 ? fmtRate(own) : "";
    row.querySelector('[data-d="-1"]').disabled = S.dead || (S.jobs[job.id] || 0) <= 0;
    row.querySelector('[data-d="1"]').disabled = S.dead || idle() <= 0;
  }
}

// Hidden until first used, then sticky-visible forever (empty-state message
// on any later empty stretch, rather than disappearing again). [0] is actively
// building, the rest wait their turn. Each card's ETA is cumulative (its own
// remaining plus everything still ahead of it), so the wait visibly counts
// down too. Every card gets a cancel button -- refunds exactly what was paid,
// even mid-construction.
function renderQueue() {
  const panel = document.getElementById("panel-queue");
  const wrap = document.getElementById("queueBody");
  const emptyMsg = document.getElementById("queueEmpty");
  if (!wrap) return;

  // Hidden (not just empty) until the first time anything is queued, then
  // sticky-visible forever after -- matches how every other panel unravels in.
  if (S.buildQueue.length > 0) S.seen.queueUsed = true;
  panel.classList.toggle("hidden", !S.seen.queueUsed);
  if (!S.seen.queueUsed) return;

  emptyMsg.classList.toggle("hidden", S.buildQueue.length > 0);
  wrap.classList.toggle("hidden", S.buildQueue.length === 0);

  const liveUids = new Set(S.buildQueue.map((q) => String(q.uid)));
  Array.from(wrap.children).forEach((child) => {
    if (!liveUids.has(child.dataset.uid)) wrap.removeChild(child);
  });

  let etaAccum = 0;
  S.buildQueue.forEach((item, i) => {
    etaAccum += item.remaining;
    const def = defById(item.id);
    let card = wrap.querySelector(`[data-uid="${item.uid}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "queue-card";
      card.dataset.uid = String(item.uid);
      card.innerHTML =
        `<div class="site-name">` +
          `<span><span class="q-label"></span> <span class="b-of q-pct"></span></span>` +
          `<button class="q-cancel" title="Cancel and refund">×</button>` +
        `</div>` +
        `<div class="progress"><span class="q-bar" style="width:0%"></span></div>` +
        `<div class="site-meta"><span class="eta q-eta"></span></div>`;
      wrap.appendChild(card);
      card.querySelector(".q-cancel").addEventListener("click", () => cancelBuild(item.uid));
    }
    const pct = Math.max(0, Math.min(100, (1 - item.remaining / item.total) * 100));
    const verb = i === 0 ? (def.kind === "unit" ? "Training" : "Raising") : "Queued";
    card.querySelector(".q-label").textContent = `${verb}: ${displayName(def)}`;
    card.querySelector(".q-pct").textContent = `(${Math.floor(pct)}%)`;
    card.querySelector(".q-bar").style.width = pct + "%";
    card.querySelector(".q-eta").textContent =
      `~${Math.max(1, Math.ceil(etaAccum / CONFIG.buildSpeed))}s left`;
    card.classList.toggle("queued", i > 0);
  });
}

// The buy menu abstracts ownership into a small number; this panel makes it
// visible at a glance -- one tile per building type you actually hold.
function renderHoldings() {
  const panel = document.getElementById("panel-holdings");
  const body = document.getElementById("holdingsBody");
  const emptyMsg = document.getElementById("holdingsEmpty");

  const conceptRevealed = BUILDINGS.some(isRevealed);
  panel.classList.toggle("hidden", !conceptRevealed);
  if (!conceptRevealed) return;

  const owned = BUILDINGS.filter((d) => (S.builds[d.id] || 0) > 0);
  emptyMsg.classList.toggle("hidden", owned.length > 0);
  body.classList.toggle("hidden", owned.length === 0);

  for (const def of owned) {
    renderTile(body, "hold-", def.id, BUILDING_ICONS[def.id] || "", displayName(def), S.builds[def.id]);
  }
}

function renderBuildings() {
  const panel = document.getElementById("panel-build");
  const list = document.getElementById("buildingList");
  let anyRevealed = false;

  for (const def of BUILDINGS) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      card.addEventListener("click", () => build(def));
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const owned = S.builds[def.id] || 0;
    const pending = pendingCount(def.id);
    const capped = isCapped(def);
    const ownedStr = pending > 0 ? `${owned} <span class="b-pending">(+${pending} queued)</span>` : `${owned}`;

    const bottom = capped
      ? `<div class="b-cost">Maxed.</div>`
      : (() => {
          const cost = buildCost(def);
          const costStr = Object.keys(cost).map((k) => {
            const short = S.res[k] < cost[k];
            return `<span class="${short ? "short" : ""}">${cost[k]} ${k}</span>`;
          }).join(", ");
          return `<div class="b-cost">${costStr}<span class="b-time">${def.buildTime}s build</span></div>`;
        })();

    card.innerHTML =
      `<div class="b-top"><span class="b-name">${displayName(def)}</span>` +
      `<span class="b-owned">${ownedStr}</span></div>` +
      `<div class="b-desc">${displayDesc(def)}</div>` +
      bottom;
    card.disabled = S.dead || capped || !canAfford(buildCost(def));
  }

  panel.classList.toggle("hidden", !anyRevealed);
}

// One-time upgrades: same card shell as renderBuildings, but a card locks
// permanently once owned (or already queued) instead of re-pricing upward.
function renderUpgrades() {
  const panel = document.getElementById("panel-upgrades");
  const list = document.getElementById("upgradeList");
  let anyRevealed = false;

  for (const def of UPGRADES) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      card.addEventListener("click", () => build(def));
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const cost = buildCost(def);
    const owned = !!S.upgrades[def.id];
    const pending = pendingCount(def.id) > 0;
    const statusStr = owned ? "owned" : pending ? "queued" : "";
    const bottom = owned
      ? `<div class="b-cost">Permanent.</div>`
      : `<div class="b-cost">${Object.keys(cost).map((k) => {
          const short = S.res[k] < cost[k];
          return `<span class="${short ? "short" : ""}">${cost[k]} ${k}</span>`;
        }).join(", ")}<span class="b-time">${def.buildTime}s build</span></div>`;
    card.innerHTML =
      `<div class="b-top"><span class="b-name">${displayName(def)}</span>` +
      `<span class="b-owned">${statusStr}</span></div>` +
      `<div class="b-desc">${displayDesc(def)}</div>` +
      bottom;
    card.disabled = S.dead || owned || pending || !canAfford(cost);
  }

  panel.classList.toggle("hidden", !anyRevealed);
}

// Trainable person-types -- same card shell again, but the cost line also
// shows the settler(s) consumed, and unlike Construction/Upgrades this panel
// is fully hidden (not just empty) until a Barracks exists.
function renderTraining() {
  const panel = document.getElementById("panel-training");
  const list = document.getElementById("trainingList");
  let anyRevealed = false;

  for (const def of UNITS) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      card.addEventListener("click", () => build(def));
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const cost = buildCost(def);
    const costParts = Object.keys(cost).map((k) => {
      const short = S.res[k] < cost[k];
      return `<span class="${short ? "short" : ""}">${cost[k]} ${k}</span>`;
    });
    if (def.popCost) {
      const short = idle() < def.popCost;
      costParts.push(`<span class="${short ? "short" : ""}">${def.popCost} settler${def.popCost > 1 ? "s" : ""}</span>`);
    }
    card.innerHTML =
      `<div class="b-top"><span class="b-name">${displayName(def)}</span>` +
      `<span class="b-owned">${S.units[def.id] || 0}</span></div>` +
      `<div class="b-desc">${displayDesc(def)}</div>` +
      `<div class="b-cost">${costParts.join(", ")}<span class="b-time">${def.buildTime}s train</span></div>`;
    card.disabled = S.dead || !canAfford(cost) || (def.popCost && idle() < def.popCost);
  }

  panel.classList.toggle("hidden", !anyRevealed);
}

// Your People / Settlement can each expand to fill their whole grid column
// (both rows) while their paired action-panel (Training / Construction) has
// nothing revealed yet -- an unexplained blank cell reads as a bug, a taller
// single panel reads as intentional.
function updateSpans() {
  document.getElementById("panel-village").classList.toggle("span-both", !UNITS.some(isRevealed));
  document.getElementById("panel-holdings").classList.toggle("span-both", !BUILDINGS.some(isRevealed));
  document.getElementById("panel-queue").classList.toggle("span-both", !UPGRADES.some(isRevealed));
}

// ---------- Modal ---------------------------------------------
// One modal at a time, centered over a dimmed page. No dragging, resizing, or
// minimizing by design -- opening one never pauses the game (game over is the
// exception only because death already stops the loop on its own).
function openModal(title, bodyHTML, actions, onMount) {
  document.getElementById("modalTitle").textContent = title;
  const body = document.getElementById("modalBody");
  body.innerHTML = bodyHTML;
  body.scrollTop = 0;

  const bar = document.getElementById("modalActions");
  bar.innerHTML = "";
  bar.classList.toggle("hidden", !actions || !actions.length);
  (actions || []).forEach((a) => {
    const b = document.createElement("button");
    b.className = "modal-btn" + (a.danger ? " danger" : "");
    b.textContent = a.label;
    b.addEventListener("click", a.onClick);
    bar.appendChild(b);
  });

  document.getElementById("modalOverlay").classList.remove("hidden");
  if (onMount) onMount(body);
}

function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
}
function modalIsOpen() {
  return !document.getElementById("modalOverlay").classList.contains("hidden");
}

// Reference panel: everything in the game, grouped by era. Shows all content
// regardless of what's been revealed -- it's a reference, and hiding things
// would defeat the point (see design.md for the tension with "unravel").
function infoPanelHTML() {
  const eras = ERA_ORDER;
  const tabs = eras.map((e) =>
    `<button class="info-tab${e === S.era ? " active" : ""}" data-era="${e}">${ERA_NAMES[e]}</button>`
  ).join("");

  const sections = eras.map((e) => {
    const group = (label, defs) => {
      const items = defs.filter((d) => availableInEra(d, e));
      if (!items.length) return "";
      return `<h3 class="info-h">${label}</h3>` + items.map((d) =>
        `<div class="info-item">` +
          `<span class="info-name">${displayName(d, e)}</span>` +
          `<span class="info-desc">${displayDesc(d, e)}</span>` +
        `</div>`
      ).join("");
    };
    const inner = group("Buildings", BUILDINGS) + group("People", UNITS) + group("Upgrades", UPGRADES);
    return `<div class="info-era${e === S.era ? "" : " hidden"}" data-era="${e}">${inner}</div>`;
  }).join("");

  return `<div class="info-tabs">${tabs}</div>${sections}`;
}

function openInfoPanel() {
  openModal("Reference", infoPanelHTML(), null, (body) => {
    body.querySelectorAll(".info-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const era = tab.dataset.era;
        body.querySelectorAll(".info-tab").forEach((t) => t.classList.toggle("active", t === tab));
        body.querySelectorAll(".info-era").forEach((s) => s.classList.toggle("hidden", s.dataset.era !== era));
        body.scrollTop = 0;
      });
    });
  });
}

// Hand-authored per era: the flavor and the "what changed" list. The "now
// available" list underneath is derived from the defs themselves so it can't
// go stale as content is added. Every age is supposed to land as a visible
// "whoa, look at this" moment (design.md) -- this is where that gets staged.
const ERA_TRANSITIONS = {
  bronze: {
    lead: "Copper and tin are married in fire. The first bronze is poured, and everything your people know how to make changes with it.",
    changes: (before) => [
      `Your huts are rebuilt in stone — housing rises from ${before.housing} to ${housing()}.`,
      "The settlement has grown into a village.",
      "Your healers move out of the tent and into a proper infirmary.",
      "Copper and tin can now be mined — tin yields slowly, and is the harder of the two to come by.",
      "Raiders come in different shapes now, and some of your people are better suited to some fights than others.",
    ],
  },
};

function openEraModal(era, before) {
  const t = ERA_TRANSITIONS[era];
  if (!t) return;
  const changes = (typeof t.changes === "function" ? t.changes(before) : t.changes) || [];
  const unlocked = [].concat(BUILDINGS, UNITS, UPGRADES)
    .filter((d) => defEra(d) === era)
    .map((d) => `${displayName(d)} — ${displayDesc(d)}`);

  const list = (items) => `<ul class="era-list">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  let html = `<p class="modal-lead">${t.lead}</p>`;
  if (changes.length) html += `<h3 class="info-h">What changed</h3>${list(changes)}`;
  if (unlocked.length) html += `<h3 class="info-h">Now available</h3>${list(unlocked)}`;

  // No action buttons -- dismiss via the ×, the backdrop, or Escape.
  openModal(`The ${ERA_NAMES[era]} Begins`, html);
}

// Shared by the Reset button and the game-over "Try Again" button.
function hardReset() {
  // Reload fires beforeunload -> save(), which would silently re-write the very
  // save we're clearing (S is still in memory). Drop the listener first.
  window.removeEventListener("beforeunload", save);
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
  location.reload();
}

function openResetModal() {
  const lived = S.playtime > 0 ? ` You are ${fmtTime(S.playtime)} into this one.` : "";
  openModal("Start Over?",
    `<p class="modal-lead">This wipes the settlement completely — every building, every settler, ` +
    `the whole Chronicle.${lived} There is no undo.</p>`,
    [
      { label: "Cancel", onClick: closeModal },
      { label: "Wipe and Restart", onClick: hardReset, danger: true },
    ]);
}

function openGameOverModal(cause) {
  const lead = cause === "conflict"
    ? "The last defenders fall. Raiders move through the settlement unopposed, and by morning there is no one left to rebuild."
    : "The stores run empty. One by one your people weaken, and the fires go out for the last time.";
  const built = Object.values(S.builds).reduce((a, b) => a + b, 0);
  const stats =
    `<div class="modal-stats">` +
      `<div>Time survived: <span class="s-val">${fmtTime(S.playtime || 0)}</span></div>` +
      `<div>Age reached: <span class="s-val">${ERA_NAMES[S.era] || ERA_NAMES.stone}</span></div>` +
      `<div>Buildings raised: <span class="s-val">${built}</span></div>` +
      `<div>Settlers grown: <span class="s-val">${S.bought}</span></div>` +
    `</div>`;
  openModal("The Settlement Has Fallen", `<p class="modal-lead">${lead}</p>${stats}`, [
    { label: "Try Again", onClick: hardReset },
  ]);
}

function fmtTime(totalSec) {
  const t = Math.max(0, Math.floor(totalSec));
  const s = t % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
  return h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${m}m ${String(s).padStart(2, "0")}s`;
}

// Not guarded on S.dead -- how long a run lasted is worth seeing afterward.
function renderClock() {
  const el = document.getElementById("playClock");
  if (el) el.textContent = fmtTime(S.playtime || 0);
}

function setPaused(p) {
  if (S.dead) return;
  paused = p;
  const btn = document.getElementById("pauseBtn");
  if (btn) btn.textContent = paused ? "[ Resume ]" : "[ Pause ]";
  const flag = document.getElementById("pauseFlag");
  if (flag) flag.classList.toggle("hidden", !paused);
  // Deliberately not logged: the Chronicle is the settlement's memory, not a
  // record of the player's UI actions, and pausing is already obvious on screen.
  renderAll();
}

// Era-dependent chrome: the age badge and any panel whose title is reflavored.
// Skipped once dead, since die() puts "[Fallen]" in the badge and that should
// stick rather than being overwritten by a later render.
function renderEraChrome() {
  if (S.dead) return;
  const badge = document.getElementById("ageBadge");
  if (badge) badge.textContent = `[${ERA_NAMES[S.era] || ERA_NAMES.stone}]`;
  for (const panelId in PANEL_TITLES) {
    const title = PANEL_TITLES[panelId][S.era];
    if (!title) continue;
    const h2 = document.querySelector(`#${panelId} h2`);
    if (h2) h2.textContent = title;
  }
}

function renderAll() {
  renderEraChrome();
  renderClock();
  renderResources();
  renderPeople();
  renderHoldings();
  renderQueue();
  renderBuildings();
  renderUpgrades();
  renderTraining();
  updateSpans();
}

// ---------- Save / load / offline ---------------------------
function save() {
  if (S.dead) return;
  S.lastSeed = Date.now();
  try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(S)); } catch (e) {}
}

function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(CONFIG.saveKey)); } catch (e) {}
  if (!data) { S = freshState(); return false; }
  S = Object.assign(freshState(), data);
  // Merged against freshState() rather than a literal, so a resource or job
  // added later defaults to 0 in old saves without touching this line again.
  S.res = Object.assign(freshState().res, data.res);
  S.jobs = Object.assign(freshState().jobs, data.jobs);
  S.builds = Object.assign(freshState().builds, data.builds);
  S.units = Object.assign(freshState().units, data.units);
  S.upgrades = data.upgrades || {};
  S.seen = data.seen || {};
  S.buildQueue = Array.isArray(data.buildQueue) ? data.buildQueue : [];
  return true;
}

function simulateOffline() {
  const elapsed = (Date.now() - (S.lastSeed || Date.now())) / 1000;
  const capped = Math.min(elapsed, CONFIG.offlineCapHours * 3600);
  if (capped < 5) return;

  const before = { ...S.res, pop: S.pop };
  const eraBefore = S.era;
  SIM = true; SIM_STOP = false; SIM_STOP_CAUSE = null;
  let t = capped;
  while (t > 0 && !SIM_STOP) { const dt = Math.min(1, t); step(dt); t -= dt; }
  SIM = false;

  const g = {
    food: Math.floor(S.res.food - before.food),
    wood: Math.floor(S.res.wood - before.wood),
    stone: Math.floor(S.res.stone - before.stone),
    pop: S.pop - before.pop,
  };
  const parts = [];
  if (g.food > 0) parts.push(`${g.food} food`);
  if (g.wood > 0) parts.push(`${g.wood} wood`);
  if (g.stone > 0) parts.push(`${g.stone} stone`);
  if (g.pop > 0) parts.push(`${g.pop} new settler${g.pop > 1 ? "s" : ""}`);
  else if (g.pop < 0) parts.push(`${-g.pop} lost while you were away`);
  const mins = Math.floor(capped / 60);
  if (SIM_STOP) {
    const msg = SIM_STOP_CAUSE === "conflict"
      ? "You return to find the settlement overrun — there was nothing left to defend."
      : "You return to find the stores emptied — your people barely hung on.";
    log(msg, "bad");
  } else if (parts.length) {
    log(`While you were away (${mins}m): ${parts.join(", ")}.`, "good");
  }
  // An era can flip mid-catch-up; advanceEra() stays silent under SIM, so the
  // milestone gets announced here instead of passing without comment.
  if (S.era !== eraBefore) {
    log(`You return to a changed people — the ${ERA_NAMES[S.era]} began in your absence.`, "big");
  }
}

// ---------- Boot --------------------------------------------
function boot() {
  const had = load();

  if (!had) {
    log("A handful of survivors gather where the road ends.");
    log("They are hungry. Put someone to forage, or they will starve.");
  } else {
    simulateOffline();
  }

  checkReveals();
  renderAll();

  document.getElementById("saveBtn").addEventListener("click", () => {
    if (S.dead) return;
    save();
    log("Progress saved.");
  });
  // Confirms in our own modal rather than a native confirm() -- consistent
  // styling, and native dialogs are suppressed outright in some environments.
  document.getElementById("resetBtn").addEventListener("click", openResetModal);

  document.getElementById("pauseBtn").addEventListener("click", () => setPaused(!paused));
  document.getElementById("infoBtn").addEventListener("click", openInfoPanel);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  // Clicking the dimmed backdrop closes; clicks inside the panel bubble up to
  // the overlay too, so check the target is the overlay itself.
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalIsOpen()) { closeModal(); return; }
    // Space toggles pause. preventDefault stops it from re-activating whichever
    // stepper/build button happens to still hold focus from the last click.
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    setPaused(!paused);
  });

  let last = Date.now();
  loopId = setInterval(() => {
    if (S.dead) return;
    const now = Date.now();
    let dt = (now - last) / 1000;
    // `last` advances even while paused -- otherwise dt would keep accruing
    // through the whole pause and hand back a free (clamped) chunk of
    // production the instant you resume.
    last = now;
    if (paused) return;
    if (dt > 2) dt = 2;            // large gaps are handled by the offline sim
    step(dt);
    checkReveals();
    renderAll();
  }, CONFIG.tickMs);

  // Autosave keeps running while paused, deliberately: it refreshes lastSeed,
  // so time spent paused is never mistaken for offline time on the next load.
  saveId = setInterval(save, 10000);
  window.addEventListener("beforeunload", save);
}

boot();
