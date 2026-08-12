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
  growthBase: 8,          // food cost of the first extra settler
  growthScale: 1.30,      // each settler costs this much more food
  baseFoodCap: 50,        // food you can store before a Granary; surplus spoils
  baseWoodCap: 50,        // wood you can store before a Woodshed; surplus rots
  baseStoneCap: 50,       // stone you can store before a Stone Yard; surplus is lost, unorganized
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
  offlineCapHours: 4,
  saveKey: "idleCiv.v6",
};

const JOBS = [
  { id: "forager",    name: "Forage food",  res: "food" },
  { id: "woodcutter", name: "Chop wood",    res: "wood" },
  { id: "miner",      name: "Gather stone", res: "stone" },
];

// ---------- Eras --------------------------------------------
// Only the display layer and a handful of tuning values vary by era. Ids never
// change (saves key off them) -- a def's `names`/`descs` maps override how it
// reads per era, falling back to its base `name`/`desc`. See tech.md.
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
    reveal: () => S.res.wood >= CONFIG.baseWoodCap * 0.7 || S.builds.woodshed > 0,
  },
  {
    id: "granary", name: "Granary", kind: "building", desc: "Store +100 food (else it spoils in the open).",
    base: { wood: 25 }, scale: 1.55, buildTime: 16,
    reveal: () => S.res.food >= CONFIG.baseFoodCap * 0.7 || S.builds.granary > 0,
  },
  {
    id: "stoneYard", name: "Stone Yard", kind: "building", desc: "Store +100 stone (else the surplus is lost, unorganized).",
    base: { wood: 25, stone: 10 }, scale: 1.55, buildTime: 16,
    reveal: () => S.res.stone >= CONFIG.baseStoneCap * 0.7 || S.builds.stoneYard > 0,
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
    id: "bronzeAge", name: "Bronze Age", kind: "upgrade",
    desc: "Copper and tin, married in fire. Step out of the age of stone.",
    base: { food: 300, wood: 300, stone: 300 }, buildTime: 120,
    reveal: () => S.pop >= 10 && (S.units.soldier || 0) >= 1,
  },
  {
    id: "bronzeTools", name: "Bronze Tools", kind: "upgrade",
    desc: "Permanently improves all gathering by 15%.",
    base: { wood: 60, stone: 40 }, buildTime: 30,
    reveal: () => S.era === "bronze",
  },
];

// Trainable person-types: like BUILDINGS (go through the same queue, same
// flat/escalating cost machinery) but `popCost` permanently consumes a
// civilian on completion, and ownership lives in S.units, not S.builds, so it
// renders in Your People instead of Settlement. See design.md / tech.md.
const UNITS = [
  {
    id: "soldier", name: "Soldier", kind: "unit", popCost: 1,
    desc: "A settler permanently trained for defense. Eats like anyone else; produces nothing but safety.",
    base: { wood: 12 }, buildTime: 15,
    reveal: () => S.builds.barracks >= 1,
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
};
const PERSON_ICONS = {
  settler: `<svg ${ICON_ATTRS}><circle cx="12" cy="7" r="3"/><path d="M6 20 C6 13 8.5 11 12 11 C15.5 11 18 13 18 20"/></svg>`,
  soldier: `<svg ${ICON_ATTRS}><circle cx="10" cy="7" r="3"/><path d="M4.5 20 C4.5 13 7 11 10 11 C13 11 15 13 15 20"/><path d="M8 3 L20 21"/></svg>`,
};

// ---------- State -------------------------------------------
let S;
let SIM = false;         // true while fast-simulating (suppresses log spam)
let SIM_STOP = false;    // offline sim halts here instead of killing you
let SIM_STOP_CAUSE = null;
let loopId = null, saveId = null;

function freshState() {
  return {
    res:   { food: CONFIG.startFood, wood: 0, stone: 0 },
    jobs:  { forager: 0, woodcutter: 0, miner: 0 },
    builds:{ hut: 0, woodshed: 0, granary: 0, stoneYard: 0, dryingRack: 0, lumberCamp: 0, stonePit: 0, infirmary: 0, barracks: 0 },
    units: { soldier: 0 },  // trained person-types owned; separate from builds -- renders in Your People
    upgrades: {},     // { [upgradeId]: true } -- presence means owned, one-time
    buildQueue: [],   // FIFO: [{ id, kind, uid, total, remaining, cost }, ...] -- only [0] progresses
    buildSeq: 0,
    pop: CONFIG.startPop,
    bought: 0,
    era: "stone",     // gates which EVENTS are eligible; ages system lands later
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
function jobsUsed() { return S.jobs.forager + S.jobs.woodcutter + S.jobs.miner; }
// Anyone currently reserved by an in-progress (or still-waiting) unit order --
// consumed the instant it's queued, not when it completes.
function reserved() {
  return S.buildQueue.reduce((sum, q) => {
    const def = defById(q.id);
    return sum + (def && def.popCost ? def.popCost : 0);
  }, 0);
}
function idle() { return civilians() - jobsUsed() - reserved(); }

function mults() {
  const tools = (S.upgrades.stoneTools  ? CONFIG.stoneToolsBonus  : 0)
              + (S.upgrades.bronzeTools ? CONFIG.bronzeToolsBonus : 0);
  return {
    food:  1 + S.builds.dryingRack * CONFIG.buildingBonus + tools,
    wood:  1 + S.builds.lumberCamp * CONFIG.buildingBonus + tools,
    stone: 1 + S.builds.stonePit  * CONFIG.buildingBonus + tools,
  };
}

function caps() {
  return {
    food: CONFIG.baseFoodCap + S.builds.granary * CONFIG.storageAdd,
    wood: CONFIG.baseWoodCap + S.builds.woodshed * CONFIG.storageAdd,
    stone: CONFIG.baseStoneCap + S.builds.stoneYard * CONFIG.storageAdd,
  };
}

// Production (per second) plus the food upkeep line. Upkeep is charged on
// total population (S.pop), which already includes Soldiers -- no separate
// formula needed for "units eat too."
function rates() {
  const m = mults();
  const prod = {
    food:  S.jobs.forager    * CONFIG.baseRate * m.food,
    wood:  S.jobs.woodcutter * CONFIG.baseRate * m.wood,
    stone: S.jobs.miner      * CONFIG.baseRate * m.stone,
  };
  const upkeep = S.pop * CONFIG.upkeep * (S.upgrades.fireMastery ? 0.85 : 1);
  return { food: prod.food, wood: prod.wood, stone: prod.stone, upkeep, foodNet: prod.food - upkeep };
}

function growthCost() {
  return Math.round(CONFIG.growthBase * Math.pow(CONFIG.growthScale, S.bought));
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
function displayName(def) { return (def.names && def.names[S.era]) || def.name; }
function displayDesc(def) { return (def.descs && def.descs[S.era]) || def.desc; }

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
  {
    id: "wanderer", eras: ["stone", "bronze"], sev: "good",
    canFire: (S) => S.pop < housing() && S.res.food >= growthCost(),
    effect: (S) => { S.res.food -= growthCost(); S.pop += 1; S.bought += 1; },
    flavor: { hit: ["A wanderer joins your settlement."] },
  },
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
      const defense = militaryStrength();
      const repelChance = defense / (defense + raidSize);

      if (Math.random() < repelChance) {
        const costlyChance = (raidSize / (defense + raidSize)) * armorFactor();
        if (Math.random() < costlyChance) {
          removeSoldier();
          if (!SIM) log(pick(CONFLICT_FLAVOR.repelledCostly), "bad");
        } else if (!SIM) {
          log(pick(CONFLICT_FLAVOR.repelledClean), "good");
        }
      } else {
        const soldierLosses = Math.min(S.units.soldier || 0, 1 + Math.floor(raidSize / 5));
        for (let i = 0; i < soldierLosses; i++) removeSoldier();
        stealResources(raidSize);
        if (!SIM) log(pick(CONFLICT_FLAVOR.raidSucceeds), "bad");
        if (defense === 0 || defense < raidSize / 2) {
          removeSettler(true);   // conflict, unlike sickness, is allowed to zero out population
          if (!SIM) log(pick(CONFLICT_FLAVOR.civilianLost), "bad");
        }
      }
    },
  },
];

const CONFLICT_FLAVOR = {
  repelledClean: [
    "Raiders test your defenses and think better of it. Your Soldiers hold the line.",
    "A raiding party is spotted and driven off before it reaches the settlement.",
  ],
  repelledCostly: [
    "The raiders are driven off, but not without cost -- a Soldier falls in the fighting.",
  ],
  raidSucceeds: [
    "Raiders breach your defenses. Stores are looted and your Soldiers pay the price.",
    "The settlement is overrun before your Soldiers can hold them back.",
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
function weaponMultiplier() { return S.upgrades.flintSpears ? 1.6 : 1.0; }
function armorFactor() { return S.upgrades.hideArmor ? 0.5 : 1.0; }
function militaryStrength() { return (S.units.soldier || 0) * weaponMultiplier(); }
function stealResources(raidSize) {
  const fraction = Math.min(0.5, raidSize * 0.03);
  for (const k of ["food", "wood", "stone"]) {
    S.res[k] -= Math.floor(S.res[k] * fraction);
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
  S.pop -= 1;
  let over = jobsUsed() - civilians();
  for (const jid of ["woodcutter", "miner", "forager"]) {
    while (over > 0 && S.jobs[jid] > 0) { S.jobs[jid]--; over--; }
  }
}

// A Soldier dies: unlike removeSettler, the person was never in S.jobs, so
// there's no reassignment -- just remove them from the unit count and from
// total population together.
function removeSoldier() {
  if ((S.units.soldier || 0) <= 0) return;
  S.units.soldier -= 1;
  S.pop -= 1;
}

function resolveEvents(dt) {
  for (const ev of EVENTS) {
    if (ev.eras && !ev.eras.includes(S.era)) continue;
    if (ev.condition && !ev.condition(S)) continue;

    if (ev.resolve) { ev.resolve(S, dt); continue; }

    if (ev.canFire) {
      let guard = 0;
      while (ev.canFire(S) && guard++ < 50) {
        ev.effect(S);
        if (!SIM) log(pick(ev.flavor.hit), ev.sev);
      }
      continue;
    }

    if (ev.chancePerSecond) {
      const p = 1 - Math.pow(1 - ev.chancePerSecond, dt);
      if (Math.random() < p) {
        if (Math.random() < negateChance(ev)) {
          if (!SIM) log(pick(ev.flavor.negated), "good");
        } else {
          ev.effect(S);
          if (!SIM) log(pick(ev.flavor.hit), ev.sev);
        }
      }
    }
  }
}

// ---------- Core simulation ---------------------------------
function step(dt) {
  if (S.dead) return;
  const r = rates();

  // Gather + eat. Food is a net line so upkeep can drive it negative -> death.
  S.res.food  += r.foodNet * dt;
  S.res.wood  += r.wood    * dt;
  S.res.stone += r.stone   * dt;

  // Storage caps: surplus spoils/rots/is lost (silent; a one-time hint fires via reveals).
  const c = caps();
  if (S.res.food > c.food) S.res.food = c.food;
  if (S.res.wood > c.wood) S.res.wood = c.wood;
  if (S.res.stone > c.stone) S.res.stone = c.stone;

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

  // Population growth, sickness, conflict, and anything else on EVENTS.
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
  if (cause === "conflict") log("The last defenders fall. The settlement is overrun.", "big");
  else log("The last of your people starve. The settlement falls silent.", "big");
  log("Reset to begin again.", "bad");
  const badge = document.getElementById("ageBadge");
  if (badge) { badge.textContent = "[Fallen]"; badge.classList.add("fallen"); }
  document.body && document.body.classList.add("dead");
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
  if (loopId) clearInterval(loopId);
  if (saveId) clearInterval(saveId);
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
function cancelBuild(uid) {
  if (S.dead) return;
  const idx = S.buildQueue.findIndex((q) => q.uid === uid);
  if (idx === -1) return;
  const item = S.buildQueue[idx];
  for (const k in item.cost) S.res[k] = (S.res[k] || 0) + item.cost[k];
  S.buildQueue.splice(idx, 1);
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
    log(`A settler takes up the spear. Your Soldiers now number ${S.units[def.id]}.`, "good");
  } else {
    log(`${displayName(def)} complete. ${displayDesc(def)}`, "good");
  }
}

// The one and only place S.era is ever assigned. Everything the transition
// visibly changes -- panel titles, building names, housing per hut -- is
// derived from S.era at render time, so flipping it is the whole operation.
// The Chronicle lines exist so the reflavor reads as a ceremony rather than
// stats quietly rearranging themselves (see design.md).
function advanceEra(era) {
  const housingBefore = housing();
  S.era = era;
  if (SIM) return;
  log("Copper and tin are married in fire. The first bronze is poured.", "big");
  log(`Your huts are rebuilt in stone — housing rises from ${housingBefore} to ${housing()}.`, "good");
  log("The settlement has grown into a village.", "good");
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

function renderResources() {
  const r = rates();
  const c = caps();
  const any = S.res.food > 0 || S.res.wood > 0 || S.res.stone > 0;
  const empty = document.getElementById("emptyStores");
  if (empty) empty.classList.toggle("hidden", any);

  const netRate = { food: r.foodNet, wood: r.wood, stone: r.stone };

  for (const res of ["food", "wood", "stone"]) {
    const row = document.getElementById("res-" + res);
    if (!row) continue;
    const show = S.res[res] > 0 || (res === "food") || S.seen[res];
    row.classList.toggle("hidden", !show);
    if (!show) continue;

    const valEl = document.getElementById("val-" + res);
    const cap = c[res];
    const full = isFinite(cap) && S.res[res] >= cap - 0.01;
    valEl.innerHTML = isFinite(cap)
      ? `${fmt(S.res[res])}<span class="cap"> / ${fmt(cap)}</span>`
      : `${fmt(S.res[res])}`;
    valEl.classList.toggle("full", full);

    const rateEl = document.getElementById("rate-" + res);
    const rate = netRate[res] || 0;
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
    gl.innerHTML = "Housing is full. Build a hut to grow.";
  } else {
    gl.innerHTML = `Next settler grows at <span class="cost">${growthCost()} food</span>.`;
  }

  const list = document.getElementById("jobList");
  const r = rates();
  const rateOut = { food: r.food, wood: r.wood, stone: r.stone };
  for (const job of JOBS) {
    let row = document.getElementById("job-" + job.id);
    if (!row) {
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
    document.getElementById("cnt-" + job.id).textContent = S.jobs[job.id];
    document.getElementById("out-" + job.id).textContent =
      S.jobs[job.id] > 0 ? fmtRate(rateOut[job.res]) : "";
    row.querySelector('[data-d="-1"]').disabled = S.dead || S.jobs[job.id] <= 0;
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
  S.res = Object.assign({ food: 0, wood: 0, stone: 0 }, data.res);
  S.jobs = Object.assign({ forager: 0, woodcutter: 0, miner: 0 }, data.jobs);
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
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Wipe all progress and start over?")) return;
    // Reload fires beforeunload -> save(), which would silently re-write the
    // very save we're clearing (S is still in memory). Drop the listener first.
    window.removeEventListener("beforeunload", save);
    localStorage.removeItem(CONFIG.saveKey);
    location.reload();
  });

  let last = Date.now();
  loopId = setInterval(() => {
    if (S.dead) return;
    const now = Date.now();
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 2) dt = 2;            // large gaps are handled by the offline sim
    step(dt);
    checkReveals();
    renderAll();
  }, CONFIG.tickMs);

  saveId = setInterval(save, 10000);
  window.addEventListener("beforeunload", save);
}

boot();
